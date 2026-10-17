#!/usr/bin/env node
// Builder consistency (brief §5.5): draft the same JD N times and compare the drafts.
// Uses its own job id so the draft a person is reviewing is never replaced.
//   node scripts/builder-consistency.js --jd data/jobs/admin_assistant.md --job admincheck --runs 3
// Each run = one WF-05 execution (1–2 LLM calls). Writes reports/builder-consistency-<job>-<date>.json.
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./lib/env');
const { crm } = require('./lib/crm-client');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : def; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const words = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 3));
const jaccard = (a, b) => { const i = [...a].filter((x) => b.has(x)).length; return i / (a.size + b.size - i || 1); };

function leaves(n, out = []) {
  if (!n) return out;
  if (n.all || n.any) (n.all || n.any).forEach((x) => leaves(x, out));
  else if (n.not) leaves(n.not, out);
  else out.push(n);
  return out;
}

// Pairs each criterion of A with its most similar criterion of B (by name + description words).
function compare(a, b) {
  const pairs = a.criteria.map((ca) => {
    let best = null;
    for (const cb of b.criteria) {
      const sim = jaccard(words(`${ca.name} ${ca.description}`), words(`${cb.name} ${cb.description}`));
      if (!best || sim > best.sim) best = { cb, sim };
    }
    return { a: ca.name, b: best.cb.name, similarity: Math.round(best.sim * 100) / 100, weight_diff: Math.abs(ca.weight - best.cb.weight) };
  });
  const matched = pairs.filter((p) => p.similarity >= 0.2);
  const mustA = new Set(leaves(a.prefilter).map((l) => l.check + ':' + (l.field || 'cv')));
  const mustB = new Set(leaves(b.prefilter).map((l) => l.check + ':' + (l.field || 'cv')));
  return {
    criteria_counts: [a.criteria.length, b.criteria.length],
    criteria_matched: `${matched.length}/${a.criteria.length}`,
    mean_weight_diff_matched: matched.length ? Math.round((matched.reduce((s, p) => s + p.weight_diff, 0) / matched.length) * 10) / 10 : null,
    must_have_overlap: Math.round(jaccard(mustA, mustB) * 100) / 100,
    pairs,
  };
}

async function main() {
  const api = crm();
  const jobId = opt('job', 'admincheck');
  const jdFile = opt('jd', 'data/jobs/admin_assistant.md');
  const runs = Number(opt('runs', 3));
  const jd = fs.readFileSync(path.join(ROOT, jdFile), 'utf8');
  const exists = (await api.call('GET', '/jobs')).some((j) => j.job_id === jobId);
  const drafts = [];
  for (let i = 0; i < runs; i++) {
    if (i === 0 && !exists) await api.call('POST', '/jobs', { job_id: jobId, title: 'Consistency check (scratch job)', jd_text: jd });
    else await api.call('POST', `/jobs/${jobId}/redraft`);
    let job;
    for (let t = 0; t < 60; t++) { await sleep(5000); job = (await api.call('GET', '/jobs')).find((j) => j.job_id === jobId); if (!job.drafting) break; }
    if (job.draft_error) { console.log(`run ${i + 1}: FAILED ${job.draft_error.errors.join('; ')}`); drafts.push(null); continue; }
    const d = await api.call('GET', `/jobs/${jobId}/draft`);
    drafts.push(d.profile);
    console.log(`run ${i + 1}: ${d.profile.criteria.map((c) => `${c.name} ${c.weight}`).join(' · ')} | check errors ${d.check_errors.length}`);
  }
  const ok = drafts.filter(Boolean);
  const comparisons = [];
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) comparisons.push({ runs: [i + 1, j + 1], ...compare(ok[i], ok[j]) });
  const report = { at: new Date().toISOString(), job_id: jobId, jd: jdFile, runs, succeeded: ok.length, comparisons, drafts: ok.map((p) => ({ criteria: p.criteria.map((c) => ({ id: c.id, name: c.name, weight: c.weight })), must_haves: leaves(p.prefilter).map((l) => ({ check: l.check, field: l.field || null, reason: l.reason })) })) };
  for (const c of comparisons) console.log(`runs ${c.runs.join('↔')}: criteria matched ${c.criteria_matched}, mean weight diff ${c.mean_weight_diff_matched}, must-have overlap ${c.must_have_overlap}`);
  const file = path.join(ROOT, 'reports', `builder-consistency-${jobId}-${report.at.slice(0, 10)}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  console.log(`saved ${path.relative(ROOT, file)}`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
