#!/usr/bin/env node
// Role-switch check (brief §6, Phase 7 "done when"): the same CV is screened for csr AND sdr, and the
// score must move in the designed direction (support-heavy → csr higher, prospecting-heavy → sdr higher).
// Reads the CRM results of records seeded with `seed-crm.js --role-switch`; makes no LLM calls itself.
//   node scripts/role-switch-report.js [--refs rs-01,rs-11] [--wait] [--save]
//   --wait  poll until no record is NEW/SCREENING (judging early gave false misses, L-008)
//   --save  write reports/role-switch-<date>.json
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./lib/env');
const { crm } = require('./lib/crm-client');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OPEN = new Set(['NEW', 'SCREENING']);

async function main() {
  const api = crm();
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/out/seed-map.json'), 'utf8'));
  let rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/role_switch.json'), 'utf8')).rows;
  if (opt('refs')) { const set = new Set(opt('refs').split(',')); rows = rows.filter((r) => set.has(r.ref)); }
  const fetchAll = () => Promise.all(rows.flatMap((r) => ['csr', 'sdr'].map((job) => api.getCandidate(map[`${r.ref}@${job}`]))));

  let cands = await fetchAll();
  for (let t = 0; args.includes('--wait') && t < 60 && cands.some((c) => OPEN.has(c.status)); t++) { await sleep(5000); cands = await fetchAll(); }
  const open = cands.filter((c) => OPEN.has(c.status)).length;

  const results = rows.map((r, i) => {
    const [csr, sdr] = [cands[2 * i], cands[2 * i + 1]];
    const score = (c) => (c.result && typeof c.result.total_score === 'number' ? c.result.total_score : null);
    const s = { csr: score(csr), sdr: score(sdr) };
    const [hi, lo] = r.expected_direction === 'csr>sdr' ? ['csr', 'sdr'] : ['sdr', 'csr'];
    const verdict = s.csr === null || s.sdr === null ? 'unscored' : s[hi] > s[lo] ? 'moved' : s[hi] === s[lo] ? 'tie' : 'wrong_way';
    return { ref: r.ref, profile: r.profile, expected_direction: r.expected_direction, csr: { status: csr.status, score: s.csr }, sdr: { status: sdr.status, score: s.sdr },
      gap: s.csr === null || s.sdr === null ? null : Math.round((s[hi] - s[lo]) * 100) / 100, verdict };
  });
  for (const x of results) {
    console.log(`${x.verdict === 'moved' ? '✓' : '✗'} ${x.ref} ${x.profile.padEnd(17)} expected ${x.expected_direction}  csr ${String(x.csr.score ?? '-').padStart(6)} ${x.csr.status.padEnd(12)}`
      + ` sdr ${String(x.sdr.score ?? '-').padStart(6)} ${x.sdr.status.padEnd(12)} gap ${x.gap ?? '-'}  ${x.verdict}`);
  }
  const moved = results.filter((x) => x.verdict === 'moved').length;
  const gaps = results.filter((x) => x.gap !== null).map((x) => x.gap);
  const summary = { cvs: results.length, moved, tie: results.filter((x) => x.verdict === 'tie').length, wrong_way: results.filter((x) => x.verdict === 'wrong_way').length,
    unscored: results.filter((x) => x.verdict === 'unscored').length, still_open: open, min_gap: gaps.length ? Math.min(...gaps) : null,
    mean_gap: gaps.length ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 100) / 100 : null };
  console.log(`moved in the expected direction: ${moved}/${results.length} (target ≥ 18/20) · ${JSON.stringify(summary)}`);
  if (args.includes('--save')) {
    const at = new Date().toISOString();
    const file = path.join(ROOT, 'reports', `role-switch-${at.slice(0, 10)}.json`);
    fs.writeFileSync(file, JSON.stringify({ at, summary, results }, null, 2) + '\n');
    console.log(`saved ${path.relative(ROOT, file)}`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
