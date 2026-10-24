#!/usr/bin/env node
// Name-swap counterfactual judged on medians of 3 runs (D-036, rules fixed before the runs).
// Per pair (same CV, different name): pass if
//   1. the redacted model input is byte-identical (the name cannot reach the model), and
//   2. |median(A) − median(B)| ≤ 5 points, and
//   3. both medians map to the same status band.
//   node scripts/name-swap-check.js --tags e1,n2,n3
// Reads the CRM; makes no LLM calls. Writes reports/name-swap-<date>.json.
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./lib/env');
const { crm } = require('./lib/crm-client');
const { loadApplicants } = require('./lib/dataset');
const { waitSettled, variant } = require('./lib/pipeline');
const { redact } = require('../src/redact');

const TOLERANCE = 5;
const args = process.argv.slice(2);
const tags = (args[args.indexOf('--tags') + 1] || 'e1,n2,n3').split(',');
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

async function main() {
  const api = crm();
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/out/seed-map.json'), 'utf8'));
  const rows = loadApplicants().filter((a) => /^name_swap_pair_\d+_[ab]$/.test(a.trait));
  const ids = rows.flatMap((a) => tags.map((t) => map[`${a.ref}~${t}`])).filter(Boolean);
  await waitSettled(api, ids, { timeoutMs: 600000 });
  const profiles = {};
  const results = [];
  for (const job of [...new Set(rows.map((a) => a.job_id))]) {
    if (!profiles[job]) profiles[job] = await api.call('GET', `/jobs/${job}`);
    const t = profiles[job].thresholds;
    const band = (s) => (s >= t.shortlist ? 'SHORTLISTED' : s >= t.maybe ? 'MAYBE' : 'NOT_A_FIT');
    const nums = [...new Set(rows.filter((a) => a.job_id === job).map((a) => a.trait.match(/\d+/)[0]))];
    for (const n of nums) {
      const a = rows.find((x) => x.job_id === job && x.trait === `name_swap_pair_${n}_a`);
      const b = rows.find((x) => x.job_id === job && x.trait === `name_swap_pair_${n}_b`);
      const scores = async (row) => {
        const out = [];
        for (const tg of tags) { const c = await api.getCandidate(map[`${row.ref}~${tg}`]); out.push(c.result.total_score); }
        return out;
      };
      const sa = await scores(a);
      const sb = await scores(b);
      // Model input as the pipeline builds it for each copy (variant() keeps CVs byte-identical after redaction).
      const sameInput = tags.every((tg) => { const va = variant(a, tg); const vb = variant(b, tg); return redact(va.cv.text, va.candidate).text === redact(vb.cv.text, vb.candidate).text; });
      const ma = median(sa);
      const mb = median(sb);
      const pass = sameInput && Math.abs(ma - mb) <= TOLERANCE && band(ma) === band(mb);
      results.push({ pair: `${job} pair ${n}`, a: a.ref, b: b.ref, scores_a: sa, scores_b: sb, median_a: ma, median_b: mb, diff: Math.abs(ma - mb), band_a: band(ma), band_b: band(mb), same_input: sameInput, pass });
      console.log(`${pass ? 'PASS' : 'FAIL'}  ${job} pair ${n}: ${a.ref} ${sa.join('/')} (median ${ma}) vs ${b.ref} ${sb.join('/')} (median ${mb}) · |Δ| ${Math.abs(ma - mb)} · ${band(ma)} / ${band(mb)} · input ${sameInput ? 'identical' : 'DIFFERENT'}`);
    }
  }
  const out = path.join(ROOT, 'reports', `name-swap-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(out, JSON.stringify({ rule: 'D-036', tolerance: TOLERANCE, tags, results }, null, 2) + '\n');
  console.log(`${results.filter((r) => r.pass).length}/${results.length} pairs pass · saved ${path.relative(ROOT, out)}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
