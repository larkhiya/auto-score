#!/usr/bin/env node
// Regression check (brief Phase 8): 5 records per role, end to end through the live pipeline.
// Every run screens fresh copies (variant tag "smoke<time>"), so it never needs a reset and never
// touches the dataset records. Per role: strong, medium, thin (all scored by the LLM), a keyword
// fail and an email without form answers (both decided before the LLM). About 18 Gemini calls.
//   npm run eval:smoke      exit 0 only if all 15 settle on their expected status and reason codes
const { crm } = require('./lib/crm-client');
const { loadApplicants } = require('./lib/dataset');
const { variant, applicationBody, fire, waitSettled, runLog, sleep } = require('./lib/pipeline');

const TRAITS = ['strong', 'medium', 'keyword_but_thin', 'no_relevant_keywords', 'email_no_form_answers'];
const SCORED = new Set(['SHORTLISTED', 'MAYBE', 'NOT_A_FIT']);

async function main() {
  const api = crm();
  const rows = loadApplicants();
  const jobs = [...new Set(rows.map((a) => a.job_id))];
  const tag = `smoke${Date.now().toString(36)}`;
  const picked = jobs.flatMap((job) => TRAITS.map((t) => rows.find((a) => a.job_id === job && a.trait === t)).filter(Boolean));

  const sent = [];
  for (const row of picked) {
    const v = variant(row, tag);
    const { application } = await api.createApplication(applicationBody(v), { notify: false });
    const status = await fire(application);
    sent.push({ row, id: application.application_id, webhook: status });
    await sleep(SCORED.has(row.expected.status_band) ? 6000 : 1000);
  }
  const final = await waitSettled(api, sent.map((s) => s.id), { timeoutMs: 360000 });

  let ok = 0;
  let calls = 0;
  for (const s of sent) {
    const c = final[s.id];
    const log = await runLog(api, s.id);
    calls += log ? log.llm.calls : 0;
    const exp = s.row.expected;
    const reasons = (c.result && c.result.reason_codes) || [];
    const sameReasons = SCORED.has(exp.status_band) || [...reasons].sort().join('|') === [...exp.reason_codes].sort().join('|');
    const pass = c.status === exp.status_band && sameReasons;
    if (pass) ok++;
    console.log(`${pass ? '✓' : '✗'} ${`${s.row.ref}~${tag}`.padEnd(24)} ${s.row.trait.padEnd(22)} expected ${exp.status_band.padEnd(18)} got ${c.status.padEnd(18)}`
      + ` score ${c.result && c.result.total_score !== null ? String(c.result.total_score).padStart(6) : '     -'}  ${reasons.join(',') || '-'}  llm ${log ? log.llm.calls : '?'}`);
  }
  const open = Object.values(final).filter((c) => c.status === 'NEW' || c.status === 'SCREENING').length;
  console.log(`eval:smoke ${ok}/${sent.length} as expected · records in ${sent.length}, settled ${sent.length - open} · LLM calls ${calls} · tag ${tag}`);
  if (ok !== sent.length || open) process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
