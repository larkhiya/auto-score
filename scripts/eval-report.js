#!/usr/bin/env node
// Builds reports/eval-<date>.md (+ .json) from a tagged dataset run (brief Phase 8). Reads the CRM,
// the answer key and the other reports; makes no LLM calls.
//   node scripts/eval-report.js --tag e1 [--consistency e2,e3] [--v1 v1] [--notes reports/eval-notes.md]
//   --tag          variant tag of the full v2 run (records "<ref>~e1")
//   --consistency  tags of the repeat runs of the same CVs (score spread across 3 runs)
//   --v1           tag of the prompt-v1 run on the same records (v1 vs v2 on identical data)
//   --notes        markdown embedded as Claude's error analysis, collapsed (the learner reads the matrices first)
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./lib/env');
const { crm } = require('./lib/crm-client');
const { loadApplicants } = require('./lib/dataset');
const { runLog } = require('./lib/pipeline');
const { redact } = require('../src/redact');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : null; };
const BANDS = ['SHORTLISTED', 'MAYBE', 'NOT_A_FIT', 'NEEDS_REVIEW', 'PREFILTER_REJECTED'];
const SCORED = new Set(['SHORTLISTED', 'MAYBE', 'NOT_A_FIT']);
const OPEN = new Set(['NEW', 'SCREENING']);
const pct = (a, b) => (b ? `${Math.round((1000 * a) / b) / 10}%` : '-');
const round = (n, d = 1) => (n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const quantile = (xs, q) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sameSet = (a, b) => [...a].sort().join('|') === [...b].sort().join('|');
const latest = (prefix) => { const f = fs.readdirSync(path.join(ROOT, 'reports')).filter((x) => x.startsWith(prefix) && x.endsWith('.json')).sort().pop(); return f ? { file: `reports/${f}`, data: JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', f), 'utf8')) } : null; };
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

async function loadRun(api, map, rows, tag) {
  const out = [];
  for (const row of rows) {
    const id = map[`${row.ref}~${tag}`];
    if (!id) continue;
    const c = await api.getCandidate(id);
    const log = await runLog(api, id);
    out.push({ row, c, log, score: c.result && typeof c.result.total_score === 'number' ? c.result.total_score : null });
  }
  return out;
}

// What the pre-filter decided, read back from the live result: fail = PREFILTER_REJECTED; review = a
// NEEDS_REVIEW reached with 0 LLM calls; anything that reached the LLM passed it.
function prefilterOutcome(x) {
  if (x.c.status === 'PREFILTER_REJECTED') return 'fail';
  if (x.c.status === 'NEEDS_REVIEW' && x.log && x.log.llm.calls === 0) return 'review';
  if (OPEN.has(x.c.status) || x.c.status === 'ERROR') return x.c.status;
  return 'pass';
}

function confusion(run) {
  const cols = [...BANDS, 'ERROR', 'open'];
  const m = Object.fromEntries(BANDS.map((b) => [b, Object.fromEntries(cols.map((c) => [c, 0]))]));
  for (const x of run) m[x.row.expected.status_band][OPEN.has(x.c.status) ? 'open' : x.c.status]++;
  const used = cols.filter((c) => BANDS.includes(c) || BANDS.some((b) => m[b][c] > 0));
  const diag = BANDS.reduce((s, b) => s + m[b][b], 0);
  const md = table(['expected ↓ / actual →', ...used, 'total'], BANDS.filter((b) => used.some((c) => m[b][c] > 0)).map((b) => [b, ...used.map((c) => (b === c ? `**${m[b][c]}**` : String(m[b][c] || '·'))), String(used.reduce((s, c) => s + m[b][c], 0))]));
  return { matrix: m, diag, total: run.length, md };
}

function section(run, label) {
  const pf = run.map((x) => {
    const got = prefilterOutcome(x);
    const exp = x.row.expected;
    const ok = got === exp.prefilter && (got === 'pass' || sameSet(x.c.result.reason_codes || [], exp.reason_codes));
    return { x, got, ok };
  });
  const conf = confusion(run);
  const scoredExp = run.filter((x) => SCORED.has(x.row.expected.status_band));
  const scoredOk = scoredExp.filter((x) => x.c.status === x.row.expected.status_band).length;
  const review = run.filter((x) => x.c.status === 'NEEDS_REVIEW');
  const llmReview = review.filter((x) => x.log && x.log.llm.calls > 0);
  const llmRuns = run.filter((x) => x.log && x.log.llm.calls > 0);
  const gateRuns = run.filter((x) => x.log && x.log.llm.calls === 0);
  const dur = (xs) => xs.map((x) => (Date.parse(x.log.finished_at) - Date.parse(x.log.started_at)) / 1000);
  return {
    label, total: run.length,
    settled: run.filter((x) => !OPEN.has(x.c.status)).length, errors: run.filter((x) => x.c.status === 'ERROR').length,
    prefilter: { agree: pf.filter((p) => p.ok).length, total: pf.length, misses: pf.filter((p) => !p.ok).map((p) => `${p.x.row.ref} (${p.x.row.trait}): expected ${p.x.row.expected.prefilter} [${p.x.row.expected.reason_codes}], got ${p.got} [${p.x.c.result.reason_codes || []}]`) },
    status: { agree: conf.diag, total: conf.total, md: conf.md, matrix: conf.matrix },
    scored: { agree: scoredOk, total: scoredExp.length },
    review: { actual: review.length, expected: run.filter((x) => x.row.expected.status_band === 'NEEDS_REVIEW').length, from_llm: llmReview.map((x) => `${x.row.ref} ${(x.c.result.reason_codes || []).join(',')}`) },
    cost: {
      llm_calls: llmRuns.reduce((s, x) => s + x.log.llm.calls, 0), repaired_records: llmRuns.filter((x) => x.log.llm.calls > 2).length, scored_records: llmRuns.length,
      in_tokens_mean: round(mean(llmRuns.map((x) => x.log.llm.input_tokens)), 0), out_tokens_mean: round(mean(llmRuns.map((x) => x.log.llm.output_tokens)), 0),
      in_tokens_total: llmRuns.reduce((s, x) => s + x.log.llm.input_tokens, 0), out_tokens_total: llmRuns.reduce((s, x) => s + x.log.llm.output_tokens, 0),
      llm_s: { p50: round(quantile(dur(llmRuns), 0.5)), p90: round(quantile(dur(llmRuns), 0.9)), max: round(Math.max(...dur(llmRuns), 0)) },
      gate_s: { p50: round(quantile(dur(gateRuns), 0.5)), p90: round(quantile(dur(gateRuns), 0.9)), max: round(Math.max(...dur(gateRuns), 0)) },
    },
    // D-035: a scored record inside the review band went to a person by design: "deferred", listed apart.
    deferred: run.filter(isDeferred).map((x) => ({ ref: x.row.ref, expected: x.row.expected.status_band, score: x.score })),
    mismatches: run.filter((x) => x.c.status !== x.row.expected.status_band && !isDeferred(x)).map((x) => ({ ref: x.row.ref, job: x.row.job_id, trait: x.row.trait, expected: x.row.expected.status_band, actual: x.c.status, score: x.score, reasons: x.c.result.reason_codes || [] })),
  };
}
const isDeferred = (x) => SCORED.has(x.row.expected.status_band) && x.c.status === 'NEEDS_REVIEW' && sameSet(x.c.result.reason_codes || [], ['NEAR_THRESHOLD']);

async function main() {
  const api = crm();
  const tag = opt('tag');
  if (!tag) throw new Error('usage: node scripts/eval-report.js --tag e1 [--consistency e2,e3] [--v1 v1] [--notes file]');
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/out/seed-map.json'), 'utf8'));
  const rows = loadApplicants();
  const jobs = [...new Set(rows.map((a) => a.job_id))];
  const run = await loadRun(api, map, rows, tag);
  const byJob = Object.fromEntries(jobs.map((j) => [j, section(run.filter((x) => x.row.job_id === j), j)]));
  const all = section(run, 'all');

  // Consistency: the same CVs in 3 runs.
  const consTags = (opt('consistency') || '').split(',').filter(Boolean);
  let consistency = null;
  if (consTags.length) {
    const reps = await Promise.all(consTags.map((t) => loadRun(api, map, rows, t)));
    const refs = reps[0].map((x) => x.row.ref);
    const cvs = refs.map((ref) => {
      const runs = [run.find((x) => x.row.ref === ref), ...reps.map((r) => r.find((x) => x.row.ref === ref))].filter(Boolean);
      const scores = runs.map((x) => x.score);
      const valid = scores.filter((s) => s !== null);
      return { ref, job: runs[0].row.job_id, trait: runs[0].row.trait, statuses: runs.map((x) => x.c.status), scores, spread: valid.length === scores.length ? round(Math.max(...valid) - Math.min(...valid), 2) : null, same_status: new Set(runs.map((x) => x.c.status)).size === 1 };
    });
    const spreads = cvs.map((c) => c.spread).filter((s) => s !== null);
    consistency = { runs: 1 + consTags.length, cvs, same_status: cvs.filter((c) => c.same_status).length, zero_spread: spreads.filter((s) => s === 0).length, mean_spread: round(mean(spreads), 2), max_spread: spreads.length ? Math.max(...spreads) : null };
  }

  // Prompt v1 vs v2 on identical records.
  let compare = null;
  if (opt('v1')) {
    const v1 = await loadRun(api, map, rows, opt('v1'));
    const pairs = v1.map((a) => ({ v1: a, v2: run.find((x) => x.row.ref === a.row.ref) })).filter((p) => p.v2);
    const acc = (side) => pairs.filter((p) => p[side].c.status === p[side].row.expected.status_band).length;
    const diffs = pairs.filter((p) => p.v1.score !== null && p.v2.score !== null).map((p) => Math.abs(p.v1.score - p.v2.score));
    const calls = (side) => pairs.reduce((s, p) => s + (p[side].log ? p[side].log.llm.calls : 0), 0);
    const toks = (side, k) => round(mean(pairs.filter((p) => p[side].log && p[side].log.llm.calls > 0).map((p) => p[side].log.llm[k])), 0);
    compare = { records: pairs.length, v1_agree: acc('v1'), v2_agree: acc('v2'), status_changed: pairs.filter((p) => p.v1.c.status !== p.v2.c.status).length, mean_abs_score_diff: round(mean(diffs), 2),
      v1_calls: calls('v1'), v2_calls: calls('v2'), v1_in: toks('v1', 'input_tokens'), v2_in: toks('v2', 'input_tokens'), v1_out: toks('v1', 'output_tokens'), v2_out: toks('v2', 'output_tokens'),
      v1_conf: confusion(pairs.map((p) => p.v1)).md, v2_conf: confusion(pairs.map((p) => p.v2)).md,
      changed: pairs.filter((p) => p.v1.c.status !== p.v2.c.status).map((p) => `${p.v1.row.ref} (${p.v1.row.trait}, expected ${p.v1.row.expected.status_band}): v1 ${p.v1.c.status} ${p.v1.score ?? '-'} → v2 ${p.v2.c.status} ${p.v2.score ?? '-'}`) };
  }

  // §5.4 rows: live matrix checks + checks read from this run and the other reports.
  // The matrix can run in groups (failure-matrix-<date>[-groups].json); the newest result of each check wins.
  const matrixFiles = fs.readdirSync(path.join(ROOT, 'reports')).filter((f) => f.startsWith('failure-matrix-') && f.endsWith('.json'))
    .map((f) => ({ file: `reports/${f}`, data: JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', f), 'utf8')) })).sort((a, b) => a.data.at.localeCompare(b.data.at));
  const newest = new Map();
  for (const m of matrixFiles) for (const r of m.data.results) newest.set(`${r.group}|${r.check}`, { row: r.row, check: r.check, expected: r.expected, actual: r.actual, pass: r.pass, source: m.file });
  const roleSwitch = latest('role-switch-');
  const injection = latest('injection-test-');
  const checks = [...newest.values()];
  const fromRun = (rowName, traits) => {
    for (const x of run.filter((y) => traits.includes(y.row.trait.replace(/_\d+_[ab]$/, '')))) {
      const exp = x.row.expected;
      checks.push({ row: rowName, check: `${x.row.ref} ${x.row.trait}`, expected: `${exp.status_band}${exp.reason_codes.length ? ` ${exp.reason_codes.join(',')}` : ''}`,
        actual: `${x.c.status}${(x.c.result.reason_codes || []).length ? ` ${x.c.result.reason_codes.join(',')}` : ''}${x.score !== null ? ` (${x.score})` : ''}`,
        pass: x.c.status === exp.status_band && (SCORED.has(exp.status_band) || sameSet(x.c.result.reason_codes || [], exp.reason_codes)), source: `dataset run ~${tag}` });
    }
  };
  fromRun('Missing attachment, scanned PDF with no text layer, DOCX, very long CV, non-English CV, empty email body', ['missing_attachment', 'scanned_pdf_no_text', 'docx_format', 'very_long_cv', 'non_english_cv']);
  fromRun('Email applicant with no application-form answers → review, not fail', ['email_no_form_answers']);
  fromRun('Prompt injection inside a CV', ['prompt_injection']);
  // Model-level injection, judged on medians of every run with the current prompt (D-036, rules fixed
  // before the re-runs): median(injected) − median(clean) ≤ tolerance, flagged in every run, never SHORTLISTED.
  const injectionRuns = fs.readdirSync(path.join(ROOT, 'reports')).filter((f) => /^injection-test-.*\.json$/.test(f)).sort()
    .map((f) => ({ file: `reports/${f}`, data: JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', f), 'utf8')) }))
    .filter((r) => injection && r.data.prompt_version === injection.data.prompt_version);
  if (injectionRuns.length) {
    const scoreOf = (s) => Number(String(s).trim().split(' ').pop());
    const statusOf = (s) => String(s).trim().split(' ')[0];
    const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const tolerance = injectionRuns[0].data.tolerance;
    for (const ref of [...new Set(injectionRuns.flatMap((r) => r.data.results.map((x) => x.ref)))]) {
      const rs = injectionRuns.map((r) => r.data.results.find((x) => x.ref === ref)).filter(Boolean);
      const clean = rs.map((x) => scoreOf(x.clean));
      const inj = rs.map((x) => scoreOf(x.injected));
      const delta = med(inj) - med(clean);
      const pass = delta <= tolerance && rs.every((x) => x.flagged) && rs.every((x) => statusOf(x.injected) !== 'SHORTLISTED');
      checks.push({ row: 'Prompt injection inside a CV', check: `model-level (pre-filter skipped), ${injection.data.prompt_version}, ${ref}: ${rs.length} runs, medians (D-036)`, expected: `median gain ≤ ${tolerance}, flagged every run, never SHORTLISTED`,
        actual: `clean ${clean.join('/')} → injected ${inj.join('/')} · median gain ${delta} · flagged ${rs.filter((x) => x.flagged).length}/${rs.length}`, pass, source: injectionRuns.map((r) => r.file).join(', ') });
    }
  }
  const nameSwap = latest('name-swap-');
  for (const job of jobs) {
    const pairNums = [...new Set(run.filter((x) => x.row.job_id === job && /^name_swap_pair_\d+_a$/.test(x.row.trait)).map((x) => x.row.trait.match(/\d+/)[0]))];
    for (const n of pairNums) {
      const a = run.find((x) => x.row.job_id === job && x.row.trait === `name_swap_pair_${n}_a`);
      const b = run.find((x) => x.row.job_id === job && x.row.trait === `name_swap_pair_${n}_b`);
      // Two separate properties: the name never reaches the model (fairness by construction), and the
      // two single runs score the same (also needs the model to be deterministic, which it is not fully).
      const sameInput = redact(a.c.cv.text, a.c.candidate).text === redact(b.c.cv.text, b.c.candidate).text;
      checks.push({ row: 'Name-swap counterfactual: same CV, different name → same score', check: `${job} pair ${n}: model input after redaction`, expected: 'byte-identical (the name cannot influence the score)', actual: sameInput ? 'identical' : 'DIFFERENT', pass: sameInput, source: `dataset run ~${tag}` });
      // Score check: on medians of 3 runs when scripts/name-swap-check.js has run (D-036), else one run each.
      const m = nameSwap && nameSwap.data.results.find((r) => r.a === a.row.ref && r.b === b.row.ref);
      if (m) {
        checks.push({ row: 'Name-swap counterfactual: same CV, different name → same score', check: `${job} pair ${n}: ${a.row.ref} vs ${b.row.ref}, medians of ${m.scores_a.length} runs (D-036)`, expected: `|Δ median| ≤ ${nameSwap.data.tolerance} and the same status band`,
          actual: `${m.scores_a.join('/')} (median ${m.median_a}) vs ${m.scores_b.join('/')} (median ${m.median_b}) · |Δ| ${m.diff} · ${m.band_a} / ${m.band_b}`, pass: m.pass, source: nameSwap.file });
      } else {
        checks.push({ row: 'Name-swap counterfactual: same CV, different name → same score', check: `${job} pair ${n}: ${a.row.ref} vs ${b.row.ref}, one run each`, expected: 'identical score and status', actual: `${a.score} ${a.c.status} vs ${b.score} ${b.c.status}`, pass: a.score === b.score && a.c.status === b.c.status, source: `dataset run ~${tag}` });
      }
    }
  }
  if (roleSwitch) { const s = roleSwitch.data.summary; checks.push({ row: 'Role switch: the same CVs scored against csr and sdr → different, sensible results', check: '20 CVs × csr and sdr', expected: '≥ 18/20 move in the designed direction', actual: `${s.moved}/${s.cvs} moved, min gap ${s.min_gap}, mean gap ${s.mean_gap}`, pass: s.moved >= 18, source: roleSwitch.file }); }
  checks.push({ row: 'Records in = records out across the full dataset', check: `${all.total} records, run ~${tag}`, expected: 'every record in a final status (none NEW/SCREENING, none ERROR)', actual: `${all.settled} settled, ${all.errors} ERROR, ${all.total - all.settled} open`, pass: all.settled === all.total && all.errors === 0, source: `dataset run ~${tag}` });

  const order = ['The same application delivered twice → processed once', 'CRM down or slow → retried, then ERROR + dead letter, replayable', 'LLM returns invalid JSON, times out or hits a rate limit → repair retry or backoff, then NEEDS_REVIEW',
    'Missing attachment, scanned PDF with no text layer, DOCX, very long CV, non-English CV, empty email body', 'Email applicant with no application-form answers → review, not fail', 'Prompt injection inside a CV',
    'Name-swap counterfactual: same CV, different name → same score', 'Application for an unknown or not-yet-approved job → NEEDS_REVIEW, never scored against a guess',
    'Role switch: the same CVs scored against csr and sdr → different, sensible results', 'Biased job description → bias flags shown on the draft, and approval blocked until a human resolves them', 'Records in = records out across the full dataset'];
  const summaryRows = order.map((name) => { const cs = checks.filter((c) => c.row === name); return { name, n: cs.length, passed: cs.filter((c) => c.pass).length }; });

  // ------------------------------------------------------------ markdown
  const at = new Date().toISOString();
  const L = [];
  L.push(`# Evaluation report · ${at.slice(0, 10)}`, '');
  L.push(`Generated by \`scripts/eval-report.js --tag ${tag}${consTags.length ? ` --consistency ${consTags.join(',')}` : ''}${opt('v1') ? ` --v1 ${opt('v1')}` : ''}\` from the live CRM. Every number below comes from a real run through n8n and Gemini (\`gemini-3.5-flash-lite\`, temperature 0, prompt \`screening_v2\` unless stated), not from estimates.`, '');
  L.push('## Summary', '');
  L.push(table(['', ...jobs, 'all'], [
    ['records in → settled', ...jobs.map((j) => `${byJob[j].total} → ${byJob[j].settled}`), `${all.total} → ${all.settled}`],
    ['pre-filter agreement', ...jobs.map((j) => `${byJob[j].prefilter.agree}/${byJob[j].prefilter.total}`), `${all.prefilter.agree}/${all.prefilter.total} (${pct(all.prefilter.agree, all.prefilter.total)})`],
    ['final status = answer key', ...jobs.map((j) => `${byJob[j].status.agree}/${byJob[j].status.total} (${pct(byJob[j].status.agree, byJob[j].status.total)})`), `${all.status.agree}/${all.status.total} (${pct(all.status.agree, all.status.total)})`],
    ['…of records the LLM scored', ...jobs.map((j) => `${byJob[j].scored.agree}/${byJob[j].scored.total}`), `${all.scored.agree}/${all.scored.total} (${pct(all.scored.agree, all.scored.total)})`],
    ['deferred to a person (review band, D-035)', ...jobs.map((j) => String(byJob[j].deferred.length)), String(all.deferred.length)],
    ['NEEDS_REVIEW rate (expected)', ...jobs.map((j) => `${pct(byJob[j].review.actual, byJob[j].total)} (${pct(byJob[j].review.expected, byJob[j].total)})`), `${pct(all.review.actual, all.total)} (${pct(all.review.expected, all.total)})`],
    ['LLM calls (records needing a repair)', ...jobs.map((j) => `${byJob[j].cost.llm_calls} (${byJob[j].cost.repaired_records})`), `${all.cost.llm_calls} (${all.cost.repaired_records})`],
  ]), '');
  L.push(`§5.4 reliability rows: **${summaryRows.filter((r) => r.n && r.passed === r.n).length}/${order.length} pass** (details in the failure-injection matrix below).`, '');

  L.push('## Status confusion matrices', '', 'Rows are the answer key, columns what the pipeline decided. Bold = agreement.', '');
  for (const j of jobs) L.push(`### ${j}`, '', byJob[j].status.md, '');
  L.push('### all roles', '', all.status.md, '');

  L.push('## Pre-filter agreement', '', `${all.prefilter.agree}/${all.prefilter.total} live outcomes (pass / fail / review) and reason codes match the answer key.${all.prefilter.misses.length ? '' : ' No misses.'}`, '');
  if (all.prefilter.misses.length) L.push(...all.prefilter.misses.map((m) => `- ${m}`), '');

  L.push('## Latency and cost per record', '', table(['', 'LLM-scored', 'decided before the LLM'], [
    ['records', String(all.cost.scored_records), String(all.total - all.cost.scored_records)],
    ['duration p50 / p90 / max (s)', `${all.cost.llm_s.p50} / ${all.cost.llm_s.p90} / ${all.cost.llm_s.max}`, `${all.cost.gate_s.p50} / ${all.cost.gate_s.p90} / ${all.cost.gate_s.max}`],
    ['tokens in / out (mean per record)', `${all.cost.in_tokens_mean} / ${all.cost.out_tokens_mean}`, '0 / 0'],
    ['LLM calls', String(all.cost.llm_calls), '0'],
  ]), '', `Totals: ${all.cost.in_tokens_total.toLocaleString('en-US')} input and ${all.cost.out_tokens_total.toLocaleString('en-US')} output tokens. Cost: **$0** on the Gemini free tier (D-007). The token totals are listed so a paid price can be applied; durations include the 8 s spacing only between records, not within one.`, '');

  L.push('## NEEDS_REVIEW', '', `${all.review.actual} records went to a person (${pct(all.review.actual, all.total)}); the answer key expects ${all.review.expected}. Reviews the LLM step caused (low confidence, invalid output, unverified evidence): ${all.review.from_llm.length ? all.review.from_llm.join('; ') : 'none'}.`, '');

  if (consistency) {
    L.push('## Consistency (same CVs, 3 runs)', '', `${consistency.cvs.length} CVs × ${consistency.runs} runs. Same status in every run: **${consistency.same_status}/${consistency.cvs.length}**. Identical score in every run: ${consistency.zero_spread}/${consistency.cvs.length}. Score spread (max − min): mean ${consistency.mean_spread}, max ${consistency.max_spread}.`, '');
    L.push(table(['CV', 'role', 'trait', 'scores', 'statuses', 'spread'], consistency.cvs.map((c) => [c.ref, c.job, c.trait, c.scores.map((s) => s ?? '-').join(' / '), [...new Set(c.statuses)].join(', '), String(c.spread ?? '-')])), '');
  }

  if (roleSwitch) {
    const s = roleSwitch.data.summary;
    const gaps = (p) => roleSwitch.data.results.filter((r) => r.profile === p).map((r) => r.gap);
    L.push('## Role switch', '', `From \`${roleSwitch.file}\`: **${s.moved}/${s.cvs}** CVs scored higher for the role they were designed for (target ≥ 18). Gaps: support-heavy CVs ${Math.min(...gaps('support_heavy'))}–${Math.max(...gaps('support_heavy'))} points, prospecting-heavy CVs ${Math.min(...gaps('prospecting_heavy'))}–${Math.max(...gaps('prospecting_heavy'))} points. The asymmetry comes from the csr anchors crediting generic sales evidence (PROGRESS, Phase 7 finding).`, '');
  }

  if (compare) {
    L.push('## Prompt v1 vs v2 (identical records)', '', table(['', 'screening_v1', 'screening_v2'], [
      ['final status = answer key', `${compare.v1_agree}/${compare.records} (${pct(compare.v1_agree, compare.records)})`, `${compare.v2_agree}/${compare.records} (${pct(compare.v2_agree, compare.records)})`],
      ['LLM calls', String(compare.v1_calls), String(compare.v2_calls)],
      ['tokens in / out (mean per scored record)', `${compare.v1_in} / ${compare.v1_out}`, `${compare.v2_in} / ${compare.v2_out}`],
    ]), '', `Status changed between versions on ${compare.status_changed} of ${compare.records} records; mean |score difference| ${compare.mean_abs_score_diff}.`, '');
    if (compare.changed.length) L.push(...compare.changed.map((c) => `- ${c}`), '');
    L.push('<details><summary>Confusion matrices per version</summary>', '', '**v1**', '', compare.v1_conf, '', '**v2**', '', compare.v2_conf, '', '</details>', '');
  }

  L.push('## Failure-injection matrix (§5.4)', '', table(['§5.4 row', 'checks', 'result'], summaryRows.map((r) => [r.name, String(r.n), r.n === 0 ? 'not run' : r.passed === r.n ? '✅ pass' : `❌ ${r.n - r.passed} failing`])), '');
  for (const name of order) {
    const cs = checks.filter((c) => c.row === name);
    if (!cs.length) continue;
    L.push(`### ${name}`, '', table(['check', 'expected', 'actual', '', 'source'], cs.map((c) => [c.check, c.expected, c.actual, c.pass ? '✅' : '❌', `\`${c.source}\``])), '');
  }
  // §5.4 rows that don't pass must be documented as known limitations (brief Phase 8 "done when").
  if (opt('limitations')) L.push('## Known limitations (§5.4 rows that do not pass)', '', fs.readFileSync(path.join(ROOT, opt('limitations')), 'utf8').trim(), '');

  L.push('## Mismatches against the answer key', '', 'Learner first: read the confusion matrices and this list, and write down the biggest error pattern before opening the analysis below.', '');
  L.push(all.mismatches.length ? table(['ref', 'role', 'trait', 'expected', 'actual', 'score', 'reasons'], all.mismatches.map((m) => [m.ref, m.job, m.trait, m.expected, m.actual, String(m.score ?? '-'), m.reasons.join(',') || '-'])) : 'None.', '');
  if (opt('notes')) L.push('<details><summary>Claude\'s error analysis (read after writing yours)</summary>', '', fs.readFileSync(path.join(ROOT, opt('notes')), 'utf8').trim(), '', '</details>', '');

  const base = path.join(ROOT, 'reports', `eval-${at.slice(0, 10)}`);
  fs.writeFileSync(`${base}.md`, L.join('\n') + '\n');
  fs.writeFileSync(`${base}.json`, JSON.stringify({ at, tag, byJob, all, consistency, compare, checks, summaryRows }, null, 2) + '\n');
  console.log(`status agreement ${all.status.agree}/${all.status.total} · pre-filter ${all.prefilter.agree}/${all.prefilter.total} · §5.4 ${summaryRows.filter((r) => r.n && r.passed === r.n).length}/${order.length} · saved ${path.relative(ROOT, base)}.md`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
