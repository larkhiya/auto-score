#!/usr/bin/env node
// Shows pipeline outcomes for seeded applicants next to the answer key.
//   node scripts/show-results.js --refs csr-003,sdr-010 [--detail]
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./lib/env');
const { crm } = require('./lib/crm-client');
const { loadApplicants } = require('./lib/dataset');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : null; };

async function main() {
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/out/seed-map.json'), 'utf8'));
  const rows = Object.fromEntries(loadApplicants().map((a) => [a.ref, a]));
  const api = crm();
  const refs = (opt('refs') || '').split(',').filter(Boolean);
  let agree = 0;
  for (const ref of refs) {
    const c = await api.getCandidate(map[ref]);
    const logs = await api.call('GET', `/run-logs?application_id=${map[ref]}`);
    const log = logs[0];
    const exp = rows[ref].expected;
    const ok = c.status === exp.status_band;
    if (ok) agree++;
    const r = c.result;
    console.log(`${ok ? '✓' : '✗'} ${ref.padEnd(8)} ${rows[ref].trait.padEnd(22)} expected ${exp.status_band.padEnd(18)} got ${c.status.padEnd(18)}`
      + ` score ${r.total_score === null ? '   -' : String(r.total_score).padStart(5)}  reasons ${(r.reason_codes || []).join(',') || '-'}`
      + `  | llm calls ${log ? log.llm.calls : '?'}, tokens ${log ? log.llm.input_tokens + '/' + log.llm.output_tokens : '?'}, ${log ? Math.round((Date.parse(log.finished_at) - Date.parse(log.started_at)) / 100) / 10 + 's' : ''}`);
    if (args.includes('--detail') && r.breakdown) {
      for (const b of r.breakdown) console.log(`      ${b.criterion_id.padEnd(34)} ${b.score}/4 ${b.evidence_verified ? '' : '(quote not found) '}“${String(b.evidence_quote || '').slice(0, 70)}”`);
      console.log(`      flags: ${(r.flags || []).join(', ') || '-'} · model ${r.model} · ${r.prompt_version} · profile v${r.job_profile_version}`);
    }
  }
  console.log(`agreement with the answer key: ${agree}/${refs.length}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
