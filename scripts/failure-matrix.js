#!/usr/bin/env node
// Failure-injection matrix (brief §5.4, Phase 8): live checks for the rows that need the system to
// misbehave on purpose. Rows proven by the full dataset run (file types, injection, name swap,
// records in = out) and by the role-switch report are added by scripts/eval-report.js.
//   node scripts/failure-matrix.js [--only dup,crm,llm,email,job,bias,doors]
// Every check screens fresh copies (variant tags), never the dataset records.
// LLM calls: about 9, all in the "llm" group (a strong csr CV screened under injected faults).
// LLM faults and CRM chaos are always switched off at the end, even if a check crashes; the "doors"
// group stops n8n and restarts GreenMail, and both are always started again.
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { execFile } = require('node:child_process');
const nodemailer = require('nodemailer');
const { ROOT, loadEnv, requireEnv } = require('./lib/env');
const { crm } = require('./lib/crm-client');
const { client: n8nClient } = require('./lib/n8n-api');
const { loadApplicants } = require('./lib/dataset');
const { OPEN, variant, applicationBody, fire, waitSettled, runLog, llmProxy, sleep } = require('./lib/pipeline');

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const only = onlyIdx > -1 ? new Set(args[onlyIdx + 1].split(',')) : null;
const want = (group) => !only || only.has(group);
const stamp = Date.now().toString(36);
const startedAt = new Date().toISOString();
const reportFile = path.join(ROOT, 'reports', `failure-matrix-${startedAt.slice(0, 10)}${only ? `-${[...only].join('-')}` : ''}.json`);
const results = [];
// Saved after every check (L-013), so a crash or a killed run never loses finished checks.
const save = (crashed = null) => fs.writeFileSync(reportFile, JSON.stringify({ at: new Date().toISOString(), stamp, groups: only ? [...only] : 'all', crashed, results }, null, 2) + '\n');
const record = (r) => { results.push(r); save(); console.log(`${r.pass ? '✓' : '✗'} [${r.group}] ${r.check}\n    expected: ${r.expected}\n    got:      ${r.actual}`); };
// Async on purpose: execFileSync froze the event loop for the length of a replay, the CRM closed its
// idle keep-alive socket meanwhile, and the next fetch reused the dead socket ("fetch failed").
const runScript = (script, ...a) => new Promise((resolve) => {
  execFile(process.execPath, [path.join(ROOT, 'scripts', script), ...a], { cwd: ROOT, encoding: 'utf8', timeout: 900000, maxBuffer: 16 * 1024 * 1024 },
    (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: `${stdout || ''}${err ? stderr || '' : ''}` }));
});
const lastLine = (s) => String(s).trim().split('\n').pop();
const seedMap = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/out/seed-map.json'), 'utf8'));
const elapsed = (c) => { const h = c.history || []; const a = h.find((x) => x.to_status === 'SCREENING'); const b = [...h].reverse().find((x) => x.from_status === 'SCREENING'); return a && b ? Math.round((Date.parse(b.at) - Date.parse(a.at)) / 1000) : null; };

async function screenCopy(api, row, tag) {
  const { application } = await api.createApplication(applicationBody(variant(row, tag)), { notify: false });
  await fire(application);
  return application.application_id;
}

// ---------------------------------------------------------------- same application delivered twice
async function dup(api, data) {
  const row = data.find((a) => a.job_id === 'csr' && a.trait === 'no_relevant_keywords');
  const { application } = await api.createApplication(applicationBody(variant(row, `dup${stamp}`)), { notify: false });
  const codes = await Promise.all([fire(application, { eventId: `evt_dupA_${stamp}` }), fire(application, { eventId: `evt_dupB_${stamp}` })]);
  await waitSettled(api, [application.application_id]);
  codes.push(await fire(application, { eventId: `evt_dupC_${stamp}` })); // late redelivery after it finished
  await sleep(10000);
  const c = await api.getCandidate(application.application_id, true);
  const claims = c.history.filter((h) => h.to_status === 'SCREENING').length;
  const finals = c.history.filter((h) => h.from_status === 'SCREENING').length;
  record({ group: 'dup', row: 'The same application delivered twice → processed once', check: 'webhook delivered 3 times: 2 at once, 1 after it finished',
    expected: '1 claim, 1 final transition, PREFILTER_REJECTED', actual: `${claims} claim, ${finals} final, ${c.status} (webhooks ${codes.join('/')})`,
    pass: claims === 1 && finals === 1 && c.status === 'PREFILTER_REJECTED', evidence: { application_id: c.application_id, history: c.history } });
}

// ---------------------------------------------------------------- CRM down or slow
async function crmFaults(api, data) {
  // Pre-filter fails: they exercise every CRM call (claim, profile, write, run log) with 0 LLM calls.
  const fails = data.filter((a) => a.expected.status_band === 'PREFILTER_REJECTED' && a.trait !== 'duplicate_reapplication');
  const pick = (n, skip) => ['csr', 'sdr', 'admin'].flatMap((job) => fails.filter((a) => a.job_id === job).slice(skip, skip + n));
  const runSet = async (set, tag, chaosArgs) => {
    await runScript('seed-crm.js', '--refs', set.map((a) => a.ref).join(','), '--variant', tag);
    const r = await runScript('chaos-run.js', '--refs', set.map((a) => `${a.ref}~${tag}`).join(','), ...chaosArgs);
    const report = (lastLine(r.out).match(/saved (\S+)/) || [])[1] || null;
    return { ...r, last: lastLine(r.out), report, data: report ? JSON.parse(fs.readFileSync(path.join(ROOT, report), 'utf8')) : null };
  };

  const slow = await runSet(pick(4, 0).slice(0, 10), `chaosA${stamp}`, ['--fail-rate', '0.3', '--latency', '300']);
  record({ group: 'crm', row: 'CRM down or slow → retried, then ERROR + dead letter, replayable', check: 'FAIL_RATE 0.3 and 300 ms latency on every CRM call, 10 records',
    expected: 'retries absorb the failures; records in = records out', actual: slow.last, pass: slow.code === 0, evidence: { report: slow.report } });

  const tag = `chaosB${stamp}`;
  const set = pick(2, 4);
  const outage = await runSet(set, tag, ['--stop-crm-after', '2', '--stop-for', '40']);
  const replay = await runScript('replay-dlq.js', '--wait', '180');
  const ids = set.map((a) => seedMap()[`${a.ref}~${tag}`]);
  const final = await waitSettled(api, ids, { timeoutMs: 240000 });
  const notFinal = Object.values(final).filter((c) => ['NEW', 'SCREENING', 'ERROR'].includes(c.status)).length;
  record({ group: 'crm', row: 'CRM down or slow → retried, then ERROR + dead letter, replayable', check: 'CRM container stopped after 2 of 6 records for 40 s, then replay-dlq',
    expected: 'records in = records out during the outage; after replay all 6 final', actual: `${outage.last} · replay: ${lastLine(replay.out)} · after replay ${ids.length - notFinal}/${ids.length} final`,
    pass: outage.code === 0 && notFinal === 0, evidence: { report: outage.report, replay_exit: replay.code } });
}

// ---------------------------------------------------------------- LLM misbehaves (llm-proxy, D-031)
const LLM_CASES = [
  // `injected` = how many calls the proxy actually failed for this record (its own counter), so a pass
  // proves the fault happened AND the pipeline recovered, not just that the record ended well.
  { id: 'invalid_json_once', fault: { mode: 'invalid_json', count: 1 }, expected: 'one repair retry, then the normal result (SHORTLISTED)',
    judge: (c, injected) => injected === 1 && c.status === 'SHORTLISTED' },
  { id: 'invalid_json_twice', fault: { mode: 'invalid_json', count: 2 }, expected: 'repair also fails → NEEDS_REVIEW INVALID_MODEL_OUTPUT',
    judge: (c, injected) => injected === 2 && c.status === 'NEEDS_REVIEW' && (c.result.reason_codes || []).includes('INVALID_MODEL_OUTPUT') },
  { id: 'rate_limit', fault: { mode: 'rate_limit', count: 2, retry_delay_s: 3 }, expected: 'backoff (waits the 3 s RetryInfo each time), then SHORTLISTED',
    judge: (c, injected) => injected === 2 && c.status === 'SHORTLISTED' },
  { id: 'timeout', fault: { mode: 'timeout', count: 1, hold_ms: 95000 }, expected: 'the 90 s HTTP timeout fires, one retry, then SHORTLISTED',
    judge: (c, injected) => injected === 1 && c.status === 'SHORTLISTED' && elapsed(c) >= 90 },
  { id: 'llm_down', fault: { mode: 'server_error', count: 'all' }, expected: 'retries exhausted → ERROR + dead letter LLM_UNAVAILABLE (D-028, not NEEDS_REVIEW: an outage is replayed, not sent to a person); replay after recovery → SHORTLISTED',
    judge: null },
];
async function llmFaults(api, data) {
  const proxy = llmProxy();
  const row = data.find((a) => a.job_id === 'csr' && a.trait === 'strong');
  for (const k of LLM_CASES) {
    const before = (await proxy.get()).stats.injected[k.fault.mode];
    await proxy.set(k.fault);
    const id = await screenCopy(api, row, `${k.id.replace(/_/g, '')}${stamp}`);
    const settled = (await waitSettled(api, [id], { timeoutMs: 420000 }))[id];
    const stats = await proxy.get();
    await proxy.off();
    const injected = stats.stats.injected[k.fault.mode] - before;
    let c = await api.getCandidate(id, true);
    const log = await runLog(api, id);
    if (k.id === 'llm_down') {
      const erred = settled.status === 'ERROR' && (settled.result.reason_codes || []).some((r) => r.startsWith('LLM_UNAVAILABLE'));
      const replay = await runScript('replay-dlq.js', '--wait', '180');
      c = (await waitSettled(api, [id], { timeoutMs: 240000 }))[id];
      record({ group: 'llm', row: 'LLM returns invalid JSON, times out or hits a rate limit → repair retry or backoff, then NEEDS_REVIEW', check: `${k.id}: every Gemini call fails with 503 until switched off`,
        expected: k.expected, actual: `${settled.status} ${(settled.result.reason_codes || []).join(',')} (injected ${injected} × 503) · replay: ${lastLine(replay.out)} · then ${c.status}`,
        pass: erred && c.status === 'SHORTLISTED', evidence: { application_id: id } });
      continue;
    }
    record({ group: 'llm', row: 'LLM returns invalid JSON, times out or hits a rate limit → repair retry or backoff, then NEEDS_REVIEW', check: `${k.id}: ${JSON.stringify(k.fault)}`,
      expected: k.expected, actual: `${c.status} ${(c.result.reason_codes || []).join(',') || ''} score ${c.result.total_score ?? '-'} · injected ${injected} · LLM calls ${log ? log.llm.calls : '?'} · ${elapsed(c)} s`,
      pass: k.judge(c, injected), evidence: { application_id: id } });
  }
}

// ---------------------------------------------------------------- email edge cases (real files, IMAP path)
async function emails(api) {
  const env = loadEnv();
  const dir = path.join(ROOT, 'data', 'email_samples');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  manifest.push({ id: 'email-7', to: 'applications+csr@autoscore.test', from: 'Quinn Sato <quinn.sato@example.test>', subject: 'Application', body: '', attachment: 'csr_medium.txt',
    expect: { job_id: 'csr', extraction_method: 'plain_text', status: 'NEEDS_REVIEW', why: 'empty email body: MISSING_ANSWER' } });
  const reason = { 'email-1': 'MISSING_ANSWER', 'email-2': 'MISSING_ANSWER', 'email-3': 'MISSING_ANSWER', 'email-4': 'UNREADABLE_CV', 'email-5': 'UNREADABLE_CV', 'email-6': 'JOB_NOT_ROUTED', 'email-7': 'MISSING_ANSWER' };
  const tag = `em${stamp}`;
  const tagged = (from) => from.replace('@example.test', `+${tag}@example.test`);
  const transport = nodemailer.createTransport({ host: env.MAIL_SMTP_HOST || 'localhost', port: Number(env.MAIL_SMTP_PORT || 3025), secure: false, ignoreTLS: true });
  for (const m of manifest) {
    const mail = { from: tagged(m.from), to: m.to, subject: m.subject, text: m.body, messageId: `<${m.id}.${tag}@autoscore.test>`,
      envelope: { from: tagged(m.from).match(/<([^>]+)>/)[1], to: requireEnv('MAIL_USER') },
      attachments: m.attachment ? [{ filename: m.attachment, path: path.join(dir, m.attachment) }] : [] };
    await transport.sendMail(mail);
    if (m.id === 'email-3') await transport.sendMail(mail); // the same message (same Message-ID) twice
  }
  const find = async () => {
    const out = [];
    for (let offset = 0; ; offset += 100) {
      const page = await api.listCandidates({ limit: 100, offset });
      const list = Array.isArray(page) ? page : page.items || page.candidates || [];
      out.push(...list.filter((c) => (c.candidate.email || '').includes(`+${tag}@`)));
      if (list.length < 100) return out;
    }
  };
  let found = [];
  for (let t = 0; t < 48 && found.length < manifest.length; t++) { await sleep(5000); found = await find(); }
  const final = await waitSettled(api, found.map((c) => c.application_id), { timeoutMs: 240000 });
  for (const m of manifest) {
    const email = tagged(m.from).match(/<([^>]+)>/)[1];
    const recs = Object.values(final).filter((c) => c.candidate.email === email);
    const c = recs[0];
    const e = m.expect;
    const ok = c && recs.length === 1 && c.status === e.status && c.job_id === e.job_id && (c.result.reason_codes || []).includes(reason[m.id])
      && (!e.extraction_method || c.cv.extraction_method === e.extraction_method) && (!e.extraction_error || c.cv.extraction_error === e.extraction_error);
    const row = m.id === 'email-6' ? 'Application for an unknown or not-yet-approved job → NEEDS_REVIEW, never scored against a guess'
      : m.id === 'email-3' ? 'The same application delivered twice → processed once'
        : 'Missing attachment, scanned PDF with no text layer, DOCX, very long CV, non-English CV, empty email body';
    record({ group: 'email', row, check: `${m.id}: ${m.attachment || 'no attachment'}${m.body ? '' : ', empty body'} → ${m.to}${m.id === 'email-3' ? ', sent twice (same Message-ID)' : ''}`,
      expected: `${recs.length > 1 ? '' : ''}1 record, job ${e.job_id}, ${e.status} incl. ${reason[m.id]}${e.extraction_method ? `, ${e.extraction_method}` : ''}${e.extraction_error ? `, ${e.extraction_error}` : ''}`,
      actual: c ? `${recs.length} record, job ${c.job_id}, ${c.status} ${(c.result.reason_codes || []).join(',')}, ${c.cv.extraction_method}${c.cv.extraction_error ? `, ${c.cv.extraction_error}` : ''}` : 'no record',
      pass: Boolean(ok), evidence: { application_ids: recs.map((x) => x.application_id) } });
  }
}

// ---------------------------------------------------------------- unknown / unapproved job
async function jobs(api, data) {
  const row = data.find((a) => a.job_id === 'csr' && a.trait === 'medium');
  const id = await screenCopy(api, { ...row, job_id: 'carebias' }, `job${stamp}`);
  const c = (await waitSettled(api, [id]))[id];
  const log = await runLog(api, id);
  record({ group: 'job', row: 'Application for an unknown or not-yet-approved job → NEEDS_REVIEW, never scored against a guess', check: 'application to "carebias" (a draft that was never approved)',
    expected: 'NEEDS_REVIEW JOB_NOT_APPROVED, 0 LLM calls', actual: `${c.status} ${(c.result.reason_codes || []).join(',')}, ${log ? log.llm.calls : '?'} LLM calls`,
    pass: c.status === 'NEEDS_REVIEW' && c.result.reason_codes.includes('JOB_NOT_APPROVED') && log && log.llm.calls === 0, evidence: { application_id: id } });
  let refused = null;
  try { await api.createApplication(applicationBody(variant({ ...row, job_id: 'no-such-job' }, `nojob${stamp}`)), { notify: false }); } catch (e) { refused = e.body && e.body.error ? e.body.error.code : String(e.status); }
  record({ group: 'job', row: 'Application for an unknown or not-yet-approved job → NEEDS_REVIEW, never scored against a guess', check: 'CRM API application to a job id that does not exist',
    expected: 'refused at the door (404 JOB_NOT_FOUND), no record created', actual: refused ? `refused: ${refused}` : 'record created', pass: refused === 'JOB_NOT_FOUND', evidence: {} });
}

// ---------------------------------------------------------------- biased JD stays blocked
async function bias(api) {
  const d = await api.call('GET', '/jobs/carebias/draft');
  const open = d.profile.bias_flags.filter((f) => !f.resolved);
  const env = loadEnv();
  const html = await (await fetch(`${(env.CRM_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')}/ui/jobs/carebias`, { signal: AbortSignal.timeout(10000) })).text();
  const disabled = /<button disabled>Approve and freeze/.test(html);
  record({ group: 'bias', row: 'Biased job description → bias flags shown on the draft, and approval blocked until a human resolves them', check: 'the planted biased JD (carebias) draft and its job page',
    expected: 'unresolved flags on the draft; Approve button disabled (the server also refuses: tests/jobprofile.test.js)',
    actual: `${open.length} unresolved flags (${[...new Set(open.map((f) => f.category))].join(', ')}); Approve ${disabled ? 'disabled' : 'ENABLED'}`,
    pass: open.length > 0 && disabled, evidence: { flags: open.map((f) => ({ category: f.category, phrase: f.phrase, target: f.target })) } });
}

// ---------------------------------------------------------------- the front doors (L-016)
// The orchestrator and the stateful trigger sources fail too, not only what the pipeline calls.
// Both checks use records that stop before the LLM (keyword fail, email without answers): 0 LLM calls.
const N8N_CONTAINER = 'auto-score-n8n-1';
const MAIL_CONTAINER = 'auto-score-greenmail-1';
// n8n boot + one sweep interval (WF-04 runs every minute) or the gateway's next retry (it tries at
// 0, 2, 12, 42, 102, 222 s…) + screening, with margin.
const DOOR_WAIT_MS = 300000;
const MAIL_RESTART_WAIT_MS = 180000; // three of WF-02's forced reconnects (every minute), each one a catch-up fetch
const docker = (...a) => new Promise((resolve, reject) => {
  execFile('docker', a, { encoding: 'utf8', timeout: 120000 }, (err, stdout, stderr) => (err ? reject(new Error(`docker ${a.join(' ')}: ${(stderr || err.message).trim()}`)) : resolve(stdout.trim())));
});
async function waitHttp(url, timeoutMs) {
  for (const end = Date.now() + timeoutMs; Date.now() < end; await sleep(2000)) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return true; } catch { /* still starting */ }
  }
  return false;
}
async function waitPort(port, timeoutMs = 60000) {
  const open = () => new Promise((resolve) => { const s = net.connect(port, 'localhost'); s.once('connect', () => { s.destroy(); resolve(true); }); s.once('error', () => resolve(false)); });
  for (const end = Date.now() + timeoutMs; Date.now() < end; await sleep(1000)) if (await open()) return true;
  return false;
}
async function emailApplication(local, name, tag) {
  const env = loadEnv();
  const address = `${local}+${tag}@example.test`.toLowerCase(); // the CRM stores emails lowercased (L-017)
  await nodemailer.createTransport({ host: env.MAIL_SMTP_HOST || 'localhost', port: Number(env.MAIL_SMTP_PORT || 3025), secure: false, ignoreTLS: true }).sendMail({
    from: `${name} <${address}>`, to: 'applications+csr@autoscore.test', subject: 'Application', text: 'CV attached.', messageId: `<${tag}@autoscore.test>`,
    envelope: { from: address, to: requireEnv('MAIL_USER') },
    attachments: [{ filename: 'csr_medium.txt', path: path.join(ROOT, 'data', 'email_samples', 'csr_medium.txt') }] });
  return address;
}
async function recordsByEmail(api, email) {
  const { total } = await api.listCandidates({ limit: 1 });
  return (await api.listCandidates({ limit: 200, offset: Math.max(0, total - 200) })).items.filter((c) => c.candidate.email === email);
}
const deliveriesOf = async (api, id) => (await api.call('GET', `/webhook-deliveries?event=application.created&subject_id=${id}`)).items;
// Polls until every check returns a record that is no longer NEW/SCREENING (L-008), or the time is up.
async function waitFinal(checks, timeoutMs) {
  for (const end = Date.now() + timeoutMs; ; await sleep(5000)) {
    const got = await Promise.all(checks.map((f) => f()));
    if (got.every((c) => c && !OPEN.has(c.status)) || Date.now() > end) return got;
  }
}
const claims = (c) => c.history.filter((h) => h.to_status === 'SCREENING').length;
// Cleanup: the mail-restart check unpublishes and publishes WF-02; a crash in between must not leave it off.
async function republishIfOff(name) {
  if (!(await waitHttp('http://localhost:5678/healthz', 180000))) throw new Error('n8n not healthy');
  const n8n = n8nClient();
  const wf = (await n8n.listWorkflows()).find((w) => w.name === name);
  if (wf && !wf.active) { await n8n.publishWorkflow(wf.id); console.log(`re-published ${name}`); }
}
// Summed over every RunLog of the record, so a skipped duplicate run can't hide the calls of the real one.
const llmCalls = async (api, id) => {
  const logs = await api.call('GET', `/run-logs?application_id=${id}`);
  return logs.length ? logs.reduce((n, l) => n + l.llm.calls, 0) : null;
};

async function doors(api, data) {
  // 1. n8n stopped for about 20 s while one application arrives through each door.
  const row = data.find((a) => a.job_id === 'csr' && a.trait === 'no_relevant_keywords');
  const t0 = Date.now();
  let app; let email; let failedBefore = null;
  await docker('stop', N8N_CONTAINER);
  try {
    ({ application: app } = await api.createApplication(applicationBody(variant(row, `doorA${stamp}`)), { notify: true }));
    email = await emailApplication('robin.okafor', 'Robin Okafor', `doorB${stamp}`);
    // Any attempt that failed while n8n was down. The mock gives up within seconds (state "failed", then
    // WF-04 redelivers); the shared gateway keeps retrying on its own schedule for ~19 minutes (state
    // "pending" with the error), and only then hands it to WF-04 (D-037). Both are fine; losing it is not.
    for (let i = 0; i < 20 && !failedBefore; i++) { await sleep(1000); failedBefore = (await deliveriesOf(api, app.application_id)).find((d) => d.attempts >= 1 && d.error) || null; }
    await sleep(Math.max(0, 20000 - (Date.now() - t0)));
  } finally {
    await docker('start', N8N_CONTAINER);
  }
  const down = Math.round((Date.now() - t0) / 1000);
  const healthy = await waitHttp('http://localhost:5678/healthz', 180000);
  const tUp = Date.now();
  const [c, m] = await waitFinal([
    () => api.getCandidate(app.application_id, true),
    async () => (await recordsByEmail(api, email))[0] || null,
  ], DOOR_WAIT_MS);
  const after = (Date.now() - tUp) / 1000;
  const delivery = (await deliveriesOf(api, app.application_id))[0];
  const mails = await recordsByEmail(api, email);
  const calls = [await llmCalls(api, app.application_id), m ? await llmCalls(api, m.application_id) : null];
  // A second redelivery of the same event must change nothing (WF-10's compare-and-set claim).
  const forced = await api.call('POST', `/webhook-deliveries/${delivery.id}/redeliver`, { force: true }).catch((e) => ({ state: `error ${e.status}` }));
  await sleep(15000);
  const c2 = await api.getCandidate(app.application_id, true);
  record({ group: 'doors', row: 'Orchestrator down while applications arrive → nothing lost (L-016)', check: `n8n stopped for ${down} s while 1 CRM application (webhook) and 1 email arrive; then started again`,
    expected: 'webhook attempts fail while n8n is down; after the restart the CRM\'s own retry or WF-04\'s redelivery delivers it → PREFILTER_REJECTED; the email waits UNSEEN → 1 record NEEDS_REVIEW MISSING_ANSWER; a forced 2nd redelivery changes nothing (1 claim); 0 LLM calls',
    actual: `n8n ${healthy ? 'healthy' : 'NOT healthy'}; delivery before: ${failedBefore ? `${failedBefore.state} after ${failedBefore.attempts} failed tries (${failedBefore.error})` : 'no failed attempt seen'}, after: ${delivery.state}, ${delivery.attempts} attempts`
      + ` (recovered by ${delivery.redelivered_at ? 'WF-04 redelivery' : 'the CRM\'s own retry'})`
      + ` · CRM door: ${c.status} · email door: ${mails.length} record, ${m ? `${m.status} ${(m.result.reason_codes || []).join(',')}` : 'none'} · both final ${Math.round(after)} s after restart`
      + ` · forced redelivery: ${forced.state}, then ${c2.status} with ${claims(c2)} claim · LLM calls ${calls.join('/')}`,
    pass: Boolean(failedBefore) && delivery.state === 'delivered' && c.status === 'PREFILTER_REJECTED'
      && mails.length === 1 && m.status === 'NEEDS_REVIEW' && m.job_id === 'csr' && (m.result.reason_codes || []).includes('MISSING_ANSWER')
      && c2.status === 'PREFILTER_REJECTED' && claims(c2) === 1 && calls.every((n) => n === 0),
    evidence: { application_id: app.application_id, email_application_ids: mails.map((x) => x.application_id), delivery, history: c2.history, down_s: down, final_after_restart_s: Math.round(after) } });

  // 2. The mail server restarts while n8n keeps running (GreenMail keeps mail in memory: UIDs start
  // again at 1), then mail arrives. The IMAP trigger keeps a UID bookmark in memory for as long as
  // WF-02 stays active, so this is the case configuration can't fix (D-034). The check asks for the
  // email to be processed with no help; if it isn't, it applies the runbook step (re-publish WF-02,
  // which clears the bookmark) so the email is never left stranded, and reports both.
  await docker('restart', MAIL_CONTAINER);
  if (!(await waitPort(Number(loadEnv().MAIL_SMTP_PORT || 3025)) && await waitPort(3143))) throw new Error('GreenMail did not open its ports within 60 s');
  let email2 = null;
  for (let i = 0; i < 10 && !email2; i++) { try { email2 = await emailApplication('sam.ito', 'Sam Ito', `doorC${stamp}`); } catch { await sleep(2000); } } // SMTP lags the port by a moment
  if (!email2) throw new Error('could not send to GreenMail after its restart');
  const tMail = Date.now();
  const byEmail2 = async () => (await recordsByEmail(api, email2))[0] || null;
  let [m2] = await waitFinal([byEmail2], MAIL_RESTART_WAIT_MS);
  const unaided = Boolean(m2);
  let runbook = null;
  if (!unaided) {
    const n8n = n8nClient();
    const wf02 = (await n8n.listWorkflows()).find((w) => w.name === 'WF-02 Intake email');
    await n8n.unpublishWorkflow(wf02.id);
    await n8n.publishWorkflow(wf02.id);
    const tRunbook = Date.now();
    [m2] = await waitFinal([byEmail2], DOOR_WAIT_MS);
    runbook = m2 ? `processed ${Math.round((Date.now() - tRunbook) / 1000)} s after re-publishing WF-02` : 'still not processed after re-publishing WF-02';
  }
  const mails2 = await recordsByEmail(api, email2);
  const calls2 = m2 ? await llmCalls(api, m2.application_id) : null;
  record({ group: 'doors', row: 'Mail server restarted → no email lost (L-016)', check: 'GreenMail restarted while n8n keeps running (UIDs start again at 1), then 1 email arrives',
    expected: `processed with no help within ${MAIL_RESTART_WAIT_MS / 1000} s: 1 record, job csr, NEEDS_REVIEW incl. MISSING_ANSWER, 0 LLM calls`,
    actual: unaided ? `${mails2.length} record, job ${m2.job_id}, ${m2.status} ${(m2.result.reason_codes || []).join(',')}, ${calls2} LLM calls, ${Math.round((Date.now() - tMail) / 1000)} s after sending`
      : `not processed in ${MAIL_RESTART_WAIT_MS / 1000} s (stale in-memory UID bookmark, D-034) · runbook: ${runbook}${m2 ? ` → ${mails2.length} record, ${m2.status} ${(m2.result.reason_codes || []).join(',')}, ${calls2} LLM calls` : ''}`,
    pass: unaided && mails2.length === 1 && m2.job_id === 'csr' && m2.status === 'NEEDS_REVIEW' && (m2.result.reason_codes || []).includes('MISSING_ANSWER') && calls2 === 0,
    evidence: { application_ids: mails2.map((x) => x.application_id), unaided, runbook } });
}

// A bare "fetch failed" hides the real cause (ECONNREFUSED, ECONNRESET…) in e.cause.
const describe = (e) => `${e.message}${e.cause ? ` (${e.cause.code || e.cause.message})` : ''}`;

async function main() {
  const api = crm();
  const data = loadApplicants();
  let crashed = null;
  try {
    for (const [group, fn] of [['dup', dup], ['job', jobs], ['bias', bias], ['email', emails], ['llm', llmFaults], ['crm', crmFaults], ['doors', doors]]) {
      if (!want(group)) continue;
      try { await fn(api, data); } catch (e) { crashed = `${group}: ${describe(e)}`; console.error(`✗ [${group}] crashed: ${describe(e)}\n${e.stack}`); break; }
    }
  } finally {
    await llmProxy().off().catch(() => {});
    await api.chaos({ fail_rate: 0, latency_ms: 0, fail_after_rate: 0 }).catch(() => {});
    if (want('doors')) {
      await docker('start', N8N_CONTAINER, MAIL_CONTAINER).catch((e) => console.error(`could not start the containers again: ${e.message}`));
      await republishIfOff('WF-02 Intake email').catch((e) => console.error(`could not check WF-02: ${e.message}`));
    }
  }
  save(crashed); // also after a crash, with the reason
  const passed = results.filter((r) => r.pass).length;
  console.log(`failure matrix: ${passed}/${results.length} checks passed${crashed ? ` · CRASHED in ${crashed}` : ''} · saved ${path.relative(ROOT, reportFile)}`);
  if (crashed || passed !== results.length) process.exit(1);
}

main().catch(async (e) => { console.error(describe(e)); await llmProxy().off().catch(() => {}); process.exit(1); });
