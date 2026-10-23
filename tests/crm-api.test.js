// End-to-end tests of the mock CRM over real HTTP (in-process server, in-memory SQLite).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { open } = require('../crm/db');
const { createService } = require('../crm/service');
const { createWebhookSender } = require('../crm/webhooks');
const { createApp } = require('../crm/app');

const KEY = 'test-key-123';
const SECRET = 'whs_test';
const ROOT = path.resolve(__dirname, '..');
const profiles = ['csr.v1.json', 'sdr.v1.json'].map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'config/jobs', f), 'utf8')));
const quiet = { info() {}, warn() {}, error() {} };

let server; let hookServer; let base; let hooks; let sender; let chaos;
let hookStatus = 200; // what the fake n8n answers; 503 simulates n8n being down

test.before(async () => {
  hooks = [];
  hookServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      if (hookStatus !== 200) { res.statusCode = hookStatus; return res.end('down'); }
      hooks.push({ headers: req.headers, body: JSON.parse(body) });
      res.end('ok');
    });
  });
  await new Promise((r) => hookServer.listen(0, r));
  const hookUrl = `http://127.0.0.1:${hookServer.address().port}`;
  const db = open(':memory:');
  sender = createWebhookSender({ db, secret: SECRET, urls: { 'application.created': `${hookUrl}/app`, 'job.draft_requested': `${hookUrl}/job` }, baseDelayMs: 5, log: quiet });
  const service = createService(db, { onEvent: (e, p) => sender.deliver(e, p), onRedeliver: (d, p) => sender.redeliver(d, p) });
  service.seedJobs(profiles);
  chaos = { fail_rate: 0, latency_ms: 0, fail_after_rate: 0 };
  server = createApp({ service, apiKey: KEY, chaos, log: quiet }).listen(0);
  await new Promise((r) => server.on('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
// Close whatever was opened, even if setup failed halfway (otherwise an open server keeps the run alive: L-002).
test.after(() => {
  if (server) server.close();
  if (hookServer) { hookServer.close(); hookServer.closeAllConnections(); }
});

async function api(method, url, body, headers = {}) {
  const res = await fetch(base + url, {
    method, headers: { 'content-type': 'application/json', 'x-api-key': KEY, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text };
}

const CV = 'Customer support agent at Northwind (2023-2026). Handled 60 chat tickets a day in Zendesk with 94% CSAT. '.repeat(4);
const newApp = (over = {}) => ({
  job_id: 'csr', source: 'crm',
  candidate: { name: 'Test Person', email: 'test.person@example.test' },
  answers: { shift_availability: 'yes', languages: ['English'] },
  cv: { text: CV, filename: 'cv.txt', mime: 'text/plain' },
  ...over,
});
const update = (app, over = {}) => ({
  schema_version: '1.0.0', application_id: app.application_id, status: 'SCREENING', total_score: null, breakdown: null,
  summary: null, reason_codes: [], flags: [], job_id: app.job_id, job_profile_version: 1, prompt_version: null, model: null,
  execution_id: 'exec-1', processed_at: new Date().toISOString(), idempotency_key: app.idempotency_key, ...over,
});
const scored = (app, over = {}) => update(app, {
  status: 'MAYBE', total_score: 62.5, prompt_version: 'screening_v1', model: 'test-model', summary: 'ok',
  breakdown: [{ criterion_id: 'customer_facing_experience', name: 'Customer-facing experience', weight: 25, score: 3, points: 18.75,
    evidence_quote: 'Handled 60 chat tickets a day', evidence_verified: true, rationale: 'Clear volume.' }], ...over,
});

test('API requires the x-api-key header', async () => {
  const res = await fetch(`${base}/jobs`);
  assert.equal(res.status, 401);
});

test('job profiles are seeded from config/jobs', async () => {
  const jobs = (await api('GET', '/jobs')).body;
  assert.deepEqual(jobs.map((j) => [j.job_id, j.current_version]), [['csr', 1], ['sdr', 1]]);
  const csr = (await api('GET', '/jobs/csr')).body;
  assert.equal(csr.status, 'approved');
  assert.equal(csr.criteria.length, 6);
});

test('creating an application stores it as NEW and fires one webhook with the shared secret', async () => {
  const before = hooks.length;
  const res = await api('POST', '/applications', newApp());
  assert.equal(res.status, 201);
  const a = res.body.application;
  assert.match(a.application_id, /^app_\d{6}$/);
  assert.equal(a.status, 'NEW');
  assert.equal(a.idempotency_key, `${a.application_id}:${a.cv.sha256.slice(0, 12)}`);
  await sender.idle();
  assert.equal(hooks.length, before + 1);
  const hook = hooks.at(-1);
  assert.equal(hook.headers['x-webhook-secret'], SECRET);
  assert.equal(hook.body.event, 'application.created');
  assert.equal(hook.body.application.application_id, a.application_id);
});

test('the same application delivered twice creates one record and one webhook', async () => {
  const body = newApp({ candidate: { name: 'Twice', email: 'twice@example.test' } });
  const first = await api('POST', '/applications', body);
  await sender.idle();
  const hooksAfterFirst = hooks.length;
  const second = await api('POST', '/applications', body);
  await sender.idle();
  assert.equal(second.status, 200);
  assert.equal(second.body.created, false);
  assert.equal(second.body.application.application_id, first.body.application.application_id);
  assert.equal(hooks.length, hooksAfterFirst);
});

test('bulk seeding can switch webhooks off (notify=false)', async () => {
  const before = hooks.length;
  await api('POST', '/applications?notify=false', newApp({ candidate: { name: 'Quiet', email: 'quiet@example.test' } }));
  await sender.idle();
  assert.equal(hooks.length, before);
});

test('a webhook that fails every retry stays in the delivery log as failed, linked to its application', async () => {
  hookStatus = 503;
  let app; let quiet;
  try {
    app = (await api('POST', '/applications', newApp({ candidate: { name: 'Missed', email: 'missed@example.test' } }))).body.application;
    quiet = (await api('POST', '/applications?notify=false', newApp({ candidate: { name: 'Seeded', email: 'seeded@example.test' } }))).body.application;
    await sender.idle();
  } finally { hookStatus = 200; }
  const failed = (await api('GET', '/webhook-deliveries?event=application.created&status=failed')).body;
  const mine = failed.items.filter((d) => d.subject_id === app.application_id);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].state, 'failed');
  assert.equal(mine[0].attempts, 3);
  assert.equal(mine[0].error, 'HTTP 503');
  assert.equal(mine[0].delivered_at, null);
  // A record created with webhooks off was never announced, so it is never in the log: a sweep over
  // failed deliveries can't pick up deliberately quiet (seeded) records.
  assert.equal(failed.items.some((d) => d.subject_id === quiet.application_id), false);
  assert.equal((await api('GET', '/stats')).body.webhooks.failed, failed.total);
});

test('redelivery sends the same event_id with the current record, once; a second one needs force', async () => {
  const failed = (await api('GET', '/webhook-deliveries?event=application.created&status=failed')).body.items;
  const d = failed.find((x) => x.subject_id);
  const before = hooks.length;
  const res = await api('POST', `/webhook-deliveries/${d.id}/redeliver`);
  assert.equal(res.status, 200);
  assert.equal(res.body.state, 'delivered');
  assert.equal(res.body.attempts, d.attempts + 1);
  assert.ok(res.body.redelivered_at);
  assert.equal(hooks.length, before + 1);
  const hook = hooks.at(-1);
  assert.equal(hook.headers['x-event-id'], d.event_id);
  assert.equal(hook.headers['x-webhook-secret'], SECRET);
  assert.equal(hook.body.event_id, d.event_id);
  assert.equal(hook.body.redelivery, true);
  assert.equal(hook.body.application.application_id, d.subject_id);
  assert.equal(hook.body.application.status, 'NEW');
  const after = (await api('GET', '/webhook-deliveries?event=application.created&status=failed')).body.items;
  assert.equal(after.some((x) => x.id === d.id), false);
  const bySubject = (await api('GET', `/webhook-deliveries?subject_id=${d.subject_id}`)).body.items;
  assert.deepEqual(bySubject.map((x) => [x.id, x.state]), [[d.id, 'delivered']]);
  const again = await api('POST', `/webhook-deliveries/${d.id}/redeliver`);
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'ALREADY_DELIVERED');
  assert.equal(hooks.length, before + 1);
  const forced = await api('POST', `/webhook-deliveries/${d.id}/redeliver`, { force: true });
  assert.equal(forced.status, 200);
  assert.equal(hooks.length, before + 2);
});

test('redelivery to a receiver that is still down keeps the delivery failed', async () => {
  hookStatus = 503;
  try {
    const app = (await api('POST', '/applications', newApp({ candidate: { name: 'Still down', email: 'stilldown@example.test' } }))).body.application;
    await sender.idle();
    const d = (await api('GET', '/webhook-deliveries?event=application.created&status=failed')).body.items.find((x) => x.subject_id === app.application_id);
    const res = await api('POST', `/webhook-deliveries/${d.id}/redeliver`);
    assert.equal(res.status, 200);
    assert.equal(res.body.state, 'failed');
    assert.equal(res.body.attempts, 4);
    assert.equal(res.body.status_code, 503);
  } finally { hookStatus = 200; }
  assert.equal((await api('POST', '/webhook-deliveries/999999/redeliver')).body.error.code, 'DELIVERY_NOT_FOUND');
  assert.equal((await api('GET', '/webhook-deliveries?status=lost')).status, 422);
});

test('same person, same job, different CV → new record marked duplicate_of', async () => {
  const a = await api('POST', '/applications?notify=false', newApp({ candidate: { name: 'Re', email: 'reapply@example.test' } }));
  const b = await api('POST', '/applications?notify=false', newApp({ candidate: { name: 'Re', email: 'reapply@example.test' }, cv: { text: CV + ' Updated CV.' } }));
  assert.equal(b.status, 201);
  assert.equal(b.body.application.duplicate_of, a.body.application.application_id);
});

test('claiming NEW → SCREENING succeeds once; a second claim gets 409 (dedupe)', async () => {
  const app = (await api('POST', '/applications?notify=false', newApp({ candidate: { name: 'Claim', email: 'claim@example.test' } }))).body.application;
  const first = await api('PATCH', `/candidates/${app.application_id}`, update(app), { 'x-expected-status': 'NEW' });
  assert.equal(first.status, 200);
  assert.equal(first.body.status, 'SCREENING');
  const second = await api('PATCH', `/candidates/${app.application_id}`, update(app, { execution_id: 'exec-2' }), { 'x-expected-status': 'NEW' });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'STATUS_CONFLICT');
});

test('a retried PATCH with the same Idempotency-Key changes nothing', async () => {
  const app = (await api('POST', '/applications?notify=false', newApp({ candidate: { name: 'Idem', email: 'idem@example.test' } }))).body.application;
  await api('PATCH', `/candidates/${app.application_id}`, update(app), { 'x-expected-status': 'NEW' });
  const key = `${app.idempotency_key}:MAYBE:exec-1`;
  const r1 = await api('PATCH', `/candidates/${app.application_id}`, scored(app), { 'idempotency-key': key });
  const r2 = await api('PATCH', `/candidates/${app.application_id}`, scored(app), { 'idempotency-key': key });
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(r2.headers.get('idempotent-replay'), 'true');
  const detail = (await api('GET', `/candidates/${app.application_id}?history=true`)).body;
  assert.deepEqual(detail.history.map((x) => x.to_status), ['NEW', 'SCREENING', 'MAYBE']);
  assert.equal(detail.result.total_score, 62.5);
  assert.equal(detail.result.job_profile_version, 1);
});

test('the API rejects illegal transitions, contract violations and unknown profile versions', async () => {
  const app = (await api('POST', '/applications?notify=false', newApp({ candidate: { name: 'Bad', email: 'bad@example.test' } }))).body.application;
  const skip = await api('PATCH', `/candidates/${app.application_id}`, scored(app));
  assert.equal(skip.status, 409);
  assert.equal(skip.body.error.code, 'ILLEGAL_TRANSITION');

  const broken = await api('PATCH', `/candidates/${app.application_id}`, { status: 'SCREENING' });
  assert.equal(broken.status, 422);
  assert.equal(broken.body.error.code, 'CONTRACT_VIOLATION');

  const human = await api('PATCH', `/candidates/${app.application_id}`, update(app, { status: 'REJECTED', reason_codes: ['X_Y'] }));
  assert.equal(human.status, 422, 'automation cannot send REJECTED: not in the CrmUpdate contract');

  await api('PATCH', `/candidates/${app.application_id}`, update(app));
  const ghost = await api('PATCH', `/candidates/${app.application_id}`, scored(app, { job_profile_version: 99 }));
  assert.equal(ghost.status, 422);
  assert.equal(ghost.body.error.code, 'UNKNOWN_PROFILE_VERSION');

  const otherJob = await api('PATCH', `/candidates/${app.application_id}`, scored(app, { job_id: 'sdr' }));
  assert.equal(otherJob.body.error.code, 'JOB_MISMATCH');
});

test('editing an approved profile creates a new draft; approving freezes it and archives the old one', async () => {
  const edit = await api('PATCH', '/jobs/sdr/draft', { thresholds: { shortlist: 80, maybe: 60, min_confidence: 0.6 } });
  assert.equal(edit.status, 200);
  assert.equal(edit.body.profile.version, 2);
  assert.equal((await api('GET', '/jobs/sdr')).body.version, 1, 'v1 stays the approved version until v2 is approved');

  const noApprover = await api('POST', '/jobs/sdr/approve', {});
  assert.equal(noApprover.body.error.code, 'APPROVER_REQUIRED');
  const ok = await api('POST', '/jobs/sdr/approve', { approved_by: 'Test Recruiter' });
  assert.equal(ok.status, 200);
  assert.equal((await api('GET', '/jobs/sdr')).body.version, 2);
  const v1 = (await api('GET', '/jobs/sdr/versions/1')).body;
  assert.equal(v1.status, 'archived');
  assert.equal(v1.thresholds.shortlist, 75, 'archived v1 is unchanged (frozen)');
});

test('a draft with an unresolved bias flag cannot be approved', async () => {
  const flag = { id: 'b1', target: 'jd', phrase: 'young and energetic', category: 'age', message: 'age proxy', resolved: false };
  await api('PATCH', '/jobs/csr/draft', { bias_flags: [flag] });
  const blocked = await api('POST', '/jobs/csr/approve', { approved_by: 'Test Recruiter' });
  assert.equal(blocked.status, 422);
  assert.equal(blocked.body.error.code, 'APPROVAL_BLOCKED');
  assert.ok(blocked.body.error.details.some((e) => e.code === 'UNRESOLVED_BIAS_FLAG'));
});

test('POST /jobs creates a role with no approved profile and asks WF-05 to draft one', async () => {
  const before = hooks.length;
  const jd = 'We are hiring an Administrative Assistant to manage calendars, prepare documents and keep records accurate. '.repeat(2);
  const res = await api('POST', '/jobs', { job_id: 'admin', title: 'Administrative Assistant', jd_text: jd });
  assert.equal(res.status, 201);
  assert.equal(res.body.drafting, true);
  await sender.idle();
  assert.equal(hooks.length, before + 1);
  assert.equal(hooks.at(-1).body.event, 'job.draft_requested');
  const profile = await api('GET', '/jobs/admin');
  assert.equal(profile.status, 404);
  assert.equal(profile.body.error.code, 'JOB_NOT_APPROVED');
});

test('chaos: fail_rate makes calls fail before doing anything', async () => {
  await api('POST', '/admin/chaos', { fail_rate: 1 });
  const res = await api('GET', '/jobs');
  assert.ok([500, 503, 429].includes(res.status));
  assert.equal(res.body.error.code, 'SIMULATED_FAILURE');
  await api('POST', '/admin/chaos', { fail_rate: 0 });
  assert.equal((await api('GET', '/jobs')).status, 200);
});

test('chaos: a lost response after commit is safe to retry with the same Idempotency-Key', async () => {
  const app = (await api('POST', '/applications?notify=false', newApp({ candidate: { name: 'Lost', email: 'lost@example.test' } }))).body.application;
  await api('PATCH', `/candidates/${app.application_id}`, update(app), { 'x-expected-status': 'NEW' });
  await api('POST', '/admin/chaos', { fail_after_rate: 1 });
  const key = `${app.idempotency_key}:MAYBE:exec-1`;
  const lost = await api('PATCH', `/candidates/${app.application_id}`, scored(app), { 'idempotency-key': key });
  assert.equal(lost.status, 503);
  await api('POST', '/admin/chaos', { fail_after_rate: 0 });
  const retry = await api('PATCH', `/candidates/${app.application_id}`, scored(app), { 'idempotency-key': key });
  assert.equal(retry.status, 200);
  assert.equal(retry.headers.get('idempotent-replay'), 'true');
  assert.equal(retry.body.status, 'MAYBE');
});

test('pages render', async () => {
  for (const url of ['/ui/candidates', '/ui/candidates?job_id=csr&status=NEW', '/ui/review', '/ui/jobs', '/ui/jobs/csr', '/ui/jobs/admin']) {
    const res = await fetch(base + url);
    assert.equal(res.status, 200, url);
    assert.match(await res.text(), /Mock CRM/);
  }
});

test('reset needs the exact confirm phrase', async () => {
  const refused = await api('POST', '/admin/reset', {});
  assert.equal(refused.status, 422);
  assert.equal(refused.body.error.code, 'CONFIRM_REQUIRED');
});

test('re-draft asks WF-05 again; a failed draft is recorded on the job, never silent', async () => {
  const before = hooks.length;
  const jd = 'We are hiring a Bookkeeper to reconcile accounts, run payroll and prepare monthly reports for the finance team. '.repeat(2);
  await api('POST', '/jobs', { job_id: 'books', title: 'Bookkeeper', jd_text: jd });
  const failed = await api('POST', '/jobs/books/draft-failed', { errors: ['contract /criteria: must NOT have fewer than 4 items'], prompt_version: 'job_profile_builder_v1', model: 'm' });
  assert.equal(failed.body.drafting, false);
  assert.match(failed.body.draft_error.errors[0], /fewer than 4/);
  const re = await api('POST', '/jobs/books/redraft');
  assert.equal(re.status, 202);
  assert.equal(re.body.drafting, true);
  assert.equal(re.body.draft_error, null);
  await sender.idle();
  assert.equal(hooks.slice(before).filter((h) => h.body.event === 'job.draft_requested').length, 2);
  const page = await fetch(`${base}/ui/jobs/books`);
  assert.match(await page.text(), /drafting a profile/);
});

test('migration links a failed delivery logged before subject ids existed to the one record created just before it', () => {
  const file = path.join(fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'crm-mig-')), 'crm.sqlite');
  let db = open(file);
  const service = createService(db);
  service.seedJobs(profiles);
  const quiet = service.createApplication(newApp({ candidate: { name: 'Earlier', email: 'earlier@example.test' } }), { notify: false }).application;
  const missed = service.createApplication(newApp({ candidate: { name: 'Old row', email: 'oldrow@example.test' } }), { notify: false }).application;
  const later = (ms) => new Date(Date.parse(missed.created_at) + ms).toISOString();
  const add = db.prepare("INSERT INTO webhook_deliveries (event, event_id, target, attempts, error, created_at, delivered_at) VALUES ('application.created', ?, 't', ?, ?, ?, ?)");
  // Old-format rows: no subject_id. Only the failed one with a unique match gets linked.
  add.run('evt_failed', 3, 'fetch failed', later(2), null);
  add.run('evt_delivered', 1, null, later(3), later(4));
  add.run('evt_orphan', 3, 'fetch failed', later(60000), null);
  db.close();
  db = open(file); // the migration runs on open
  const subject = (e) => db.prepare('SELECT subject_id FROM webhook_deliveries WHERE event_id = ?').get(e).subject_id;
  assert.equal(subject('evt_failed'), missed.application_id); // not `quiet`, created earlier
  assert.notEqual(quiet.application_id, missed.application_id);
  assert.equal(subject('evt_delivered'), null);
  assert.equal(subject('evt_orphan'), null); // nothing created in the second before it
  db.close();
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
});
