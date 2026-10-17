#!/usr/bin/env node
// Loads data/applicants.json into the CRM as NEW candidates.
//   node scripts/seed-crm.js                      all applicants, webhooks OFF (no screening triggered)
//   node scripts/seed-crm.js --job csr --limit 5  a subset
//   node scripts/seed-crm.js --notify --delay 500 fire the webhook per record, 500 ms apart (triggers WF-01)
//   node scripts/seed-crm.js --role-switch        load data/role_switch.json against BOTH csr and sdr
// Idempotent: the CRM returns the existing record for a repeated delivery. Writes data/out/seed-map.json.
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./lib/env');
const { crm } = require('./lib/crm-client');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : def; };

function records() {
  if (flag('role-switch')) {
    const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/role_switch.json'), 'utf8')).rows;
    return rows.flatMap((r) => ['csr', 'sdr'].map((job) => ({ ref: `${r.ref}@${job}`, job_id: job, source: 'crm', candidate: r.candidate, answers: r.answers, cv: r.cv })));
  }
  let list = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/applicants.json'), 'utf8')).applicants;
  const job = opt('job');
  if (job) list = list.filter((a) => a.job_id === job);
  const refs = opt('refs');
  if (refs) { const set = new Set(refs.split(',')); list = list.filter((a) => set.has(a.ref)); }
  return list.slice(0, Number(opt('limit', list.length)));
}

async function main() {
  const api = crm();
  const notify = flag('notify');
  const delay = Number(opt('delay', notify ? 500 : 0));
  const mapFile = path.join(ROOT, 'data/out/seed-map.json');
  fs.mkdirSync(path.dirname(mapFile), { recursive: true });
  const map = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : {};

  let created = 0; let existing = 0; let failed = 0;
  for (const a of records()) {
    const body = {
      job_id: a.job_id, source: a.source, source_ref: null, candidate: a.candidate, answers: a.answers,
      cv: { text: a.cv.text, filename: a.cv.filename, mime: a.cv.mime, extraction_method: a.cv.extraction_method, extraction_error: a.cv.extraction_error },
    };
    try {
      const out = await api.createApplication(body, { notify });
      map[a.ref] = out.application.application_id;
      if (out.created) created++; else existing++;
    } catch (e) {
      failed++;
      console.error(`${a.ref}: ${e.message}`);
    }
    if (delay) await new Promise((r) => setTimeout(r, delay));
  }
  fs.writeFileSync(mapFile, JSON.stringify(map, null, 2) + '\n');
  console.log(`seeded: ${created} created, ${existing} already present, ${failed} failed · webhooks ${notify ? 'ON' : 'off'} · map: data/out/seed-map.json`);
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
