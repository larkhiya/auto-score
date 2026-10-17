#!/usr/bin/env node
// Sends seeded applicants through the live pipeline by firing the same webhook the CRM would
// (application.created → WF-01 → WF-10). Records must be NEW in the CRM.
//   node scripts/screen-records.js --refs csr-003,sdr-010
//   node scripts/screen-records.js --job csr --traits strong,medium --per-trait 1
//   --delay 6000   ms between records (free-tier rate limits: each passing record makes 2 LLM calls)
// Prints the refs it sent; check outcomes with scripts/show-results.js.
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, requireEnv, loadEnv } = require('./lib/env');
const { crm } = require('./lib/crm-client');
const { loadApplicants } = require('./lib/dataset');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : def; };

function pickRefs() {
  const refs = opt('refs');
  if (refs) return refs.split(',');
  const rows = loadApplicants().filter((a) => !opt('job') || a.job_id === opt('job'));
  const traits = opt('traits') ? opt('traits').split(',') : null;
  const per = Number(opt('per-trait', 1));
  if (!traits) return rows.slice(0, Number(opt('limit', 5))).map((a) => a.ref);
  return traits.flatMap((t) => rows.filter((a) => a.trait === t).slice(0, per).map((a) => a.ref));
}

async function main() {
  const env = loadEnv();
  const secret = requireEnv('CRM_WEBHOOK_SECRET');
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/out/seed-map.json'), 'utf8'));
  const delay = Number(opt('delay', 6000));
  const url = (env.N8N_BASE_URL || 'http://localhost:5678') + '/webhook/application-received';
  const api = crm();
  const sent = [];
  for (const ref of pickRefs()) {
    const id = map[ref];
    if (!id) { console.error(`${ref}: not in data/out/seed-map.json (run seed-crm first)`); continue; }
    const application = await api.getCandidate(id);
    if (application.status !== 'NEW') { console.warn(`${ref} (${id}) is ${application.status}, not NEW: skipped`); continue; }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-webhook-secret': secret },
      body: JSON.stringify({ event: 'application.created', event_id: `evt_screen_${id}_${Date.now()}`, occurred_at: new Date().toISOString(), application }),
      signal: AbortSignal.timeout(15000),
    });
    console.log(`${ref} → ${id} · webhook ${res.status}`);
    sent.push(ref);
    if (delay) await new Promise((r) => setTimeout(r, delay));
  }
  console.log(`sent ${sent.length}: ${sent.join(',')}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
