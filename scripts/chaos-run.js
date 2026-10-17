#!/usr/bin/env node
// Failure-injection run (Phase 6, §5.4): sends records through the pipeline while the CRM misbehaves,
// then accounts for every record. Records in must equal records out:
//   out = final status + ERROR + (still NEW/SCREENING but covered by an open dead letter)
//   anything else is LOST, and the run exits 1.
//   node scripts/chaos-run.js --refs a,b,c --fail-rate 0.3 [--latency 0] [--fail-after 0]
//   node scripts/chaos-run.js --refs a,b,c --stop-crm-after 3 --stop-for 40   (real outage: container stopped)
// Chaos is ALWAYS switched off at the end, even if the run crashes.
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { ROOT, requireEnv, loadEnv } = require('./lib/env');
const { crm } = require('./lib/crm-client');
const { client } = require('./lib/n8n-api');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : def; };
const FINAL = ['SHORTLISTED', 'MAYBE', 'NOT_A_FIT', 'NEEDS_REVIEW', 'PREFILTER_REJECTED'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const docker = (cmd) => execSync(`docker ${cmd} auto-score-crm-1`, { stdio: 'pipe' }).toString().trim();

async function waitForCrm(api, seconds = 60) {
  for (let i = 0; i < seconds; i++) { try { await api.stats(); return true; } catch { await sleep(1000); } }
  return false;
}

async function main() {
  const env = loadEnv();
  const secret = requireEnv('CRM_WEBHOOK_SECRET');
  const api = crm();
  const n8n = client();
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/out/seed-map.json'), 'utf8'));
  const refs = opt('refs', '').split(',').filter(Boolean);
  const chaos = { fail_rate: Number(opt('fail-rate', 0)), latency_ms: Number(opt('latency', 0)), fail_after_rate: Number(opt('fail-after', 0)) };
  const stopAfter = opt('stop-crm-after') !== undefined ? Number(opt('stop-crm-after')) : null;
  const delay = Number(opt('delay', 8000));

  // 1. Prefetch while the CRM is healthy, so the test harness itself never depends on it.
  const records = [];
  for (const ref of refs) {
    const c = await api.getCandidate(map[ref]);
    if (c.status !== 'NEW') { console.warn(`${ref} is ${c.status}, skipped`); continue; }
    records.push({ ref, application: c });
  }
  const table = (await n8n.listDataTables()).find((t) => t.name === 'dead_letters');
  const dlBefore = new Set((await n8n.listRows(table.id)).data.map((r) => r.id));
  console.log(`records in: ${records.length} · chaos ${JSON.stringify(chaos)}${stopAfter !== null ? ` · stop CRM after ${stopAfter}` : ''}`);

  // The harness polls a CRM that fails on purpose: retry its own reads (no backoff needed, it's a test).
  const getCandidate = async (id) => {
    for (let i = 0; i < 30; i++) { try { return await api.getCandidate(id); } catch { await sleep(500); } }
    throw new Error(`could not read ${id} from the CRM`);
  };
  const newDeadLetters = async () => (await n8n.listRows(table.id)).data.filter((r) => !dlBefore.has(r.id));
  // Settled = final, ERROR, or still NEW/SCREENING but covered by a dead letter.
  async function snapshot() {
    const dl = await newDeadLetters();
    const covered = new Set(dl.map((r) => r.application_id));
    const states = [];
    for (const r of records) states.push(await getCandidate(r.application.application_id));
    const settled = states.every((c) => FINAL.includes(c.status) || c.status === 'ERROR' || covered.has(c.application_id));
    return { states, dl, covered, settled };
  }

  let stopped = false;
  const maxWait = Number(opt('max-wait', 600)) * 1000;
  try {
    if (chaos.fail_rate || chaos.latency_ms || chaos.fail_after_rate) await api.chaos(chaos);
    // 2. Fire the webhooks (as the CRM would), optionally pulling the plug part-way.
    for (let i = 0; i < records.length; i++) {
      if (stopAfter !== null && i === stopAfter) { docker('stop'); stopped = true; console.log('  CRM container STOPPED'); }
      const r = records[i];
      const res = await fetch((env.N8N_BASE_URL || 'http://localhost:5678') + '/webhook/application-received', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-secret': secret },
        body: JSON.stringify({ event: 'application.created', event_id: `evt_chaos_${r.ref}_${Date.now()}`, occurred_at: new Date().toISOString(), application: r.application }),
        signal: AbortSignal.timeout(15000),
      });
      console.log(`  sent ${r.ref} (${r.application.application_id}) → ${res.status}`);
      await sleep(delay);
    }
    if (stopped) {
      await sleep(Number(opt('stop-for', 40)) * 1000); // let the retries give up and the dead letters land
      docker('start'); stopped = false;
      console.log('  CRM container STARTED');
      await waitForCrm(api);
    }
    // Keep the chaos on while the records are processed, not just while they're sent.
    if (chaos.fail_rate >= 1) {
      // A total outage can't be observed through the CRM: hold it long enough for every retry to give up.
      await sleep(Number(opt('hold', 60)) * 1000);
    } else {
      const until = Date.now() + maxWait;
      while (Date.now() < until && !(await snapshot()).settled) await sleep(5000);
    }
  } finally {
    if (stopped) { docker('start'); await waitForCrm(api); }
    await api.chaos({ fail_rate: 0, latency_ms: 0, fail_after_rate: 0 }).catch((e) => console.error('could not reset chaos:', e.message));
    console.log('  chaos reset to 0');
  }

  // 3. Chaos is off: wait until every record has settled (or time out), then account for each one.
  let snap = await snapshot();
  const until = Date.now() + maxWait;
  while (!snap.settled && Date.now() < until) { await sleep(5000); snap = await snapshot(); }
  const states = snap.states;
  const dlRows = snap.dl;
  const dlApps = snap.covered;
  const out = { final: 0, error: 0, pending_with_dead_letter: 0, lost: [] };
  const byStatus = {};
  states.forEach((c, i) => {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    if (FINAL.includes(c.status)) out.final++;
    else if (c.status === 'ERROR') out.error++;
    else if (dlApps.has(c.application_id)) out.pending_with_dead_letter++;
    else out.lost.push(`${records[i].ref}=${c.status}`);
  });
  const recordsOut = out.final + out.error + out.pending_with_dead_letter;
  const report = {
    at: new Date().toISOString(), chaos, stop_crm_after: stopAfter, records_in: records.length, records_out: recordsOut, by_status: byStatus, ...out,
    dead_letters_new: dlRows.length, dead_letters: dlRows.map((r) => ({ application_id: r.application_id, error_code: r.error_code, crm_marked: r.crm_marked, notified: r.notified })),
    refs: records.map((r) => r.ref),
  };
  console.log(JSON.stringify(report, null, 2));
  const file = path.join(ROOT, 'reports', `chaos-${report.at.replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  console.log(`records in ${records.length} = records out ${recordsOut}${out.lost.length ? ` · LOST: ${out.lost.join(', ')}` : ''} · saved ${path.relative(ROOT, file)}`);
  if (out.lost.length || recordsOut !== records.length) process.exit(1);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
