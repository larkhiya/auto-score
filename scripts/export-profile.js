#!/usr/bin/env node
// Copies a job's APPROVED profile from the CRM into config/jobs/<job>.v<N>.json, so git records the
// exact rubric a person approved. The CRM stays the source of truth; this is the audit copy that the
// offline answer-key test and the applicant generator read.
//   node scripts/export-profile.js --job admin
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./lib/env');
const { crm } = require('./lib/crm-client');
const { validate } = require('../src/validate');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : null; };

async function main() {
  const job = opt('job');
  if (!job) throw new Error('usage: node scripts/export-profile.js --job <job_id>');
  const p = await crm().call('GET', `/jobs/${encodeURIComponent(job)}`);
  if (p.status !== 'approved' || !p.approved_by) throw new Error(`${job} v${p.version} is ${p.status}: only approved profiles are exported`);
  const v = validate('job_profile', p);
  if (!v.valid) throw new Error(`${job} v${p.version} does not match the JobProfile contract: ${JSON.stringify(v.errors[0])}`);
  const file = path.join(ROOT, 'config', 'jobs', `${job}.v${p.version}.json`);
  fs.writeFileSync(file, JSON.stringify(p, null, 2) + '\n');
  console.log(`${job} v${p.version} (approved by ${p.approved_by} at ${p.approved_at}) → ${path.relative(ROOT, file)}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
