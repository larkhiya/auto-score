// The fixed subsets the Phase 8 eval reuses, chosen by rule (not by hand) so every run picks the
// same records:
//   consistency  20 CVs that reach the LLM, screened 3 times: per role a mix of strong, medium and
//                thin (csr 3/3/2, sdr 3/3/2, admin 2/1/1)
//   v1sample     records for the prompt v1 vs v2 comparison: the first 20 LLM-scored records of csr
//                and sdr, all 19 of admin (59)
//   node scripts/lib/eval-sets.js consistency|v1sample     prints the refs, comma-separated
const { loadApplicants } = require('./dataset');

const SCORED = new Set(['SHORTLISTED', 'MAYBE', 'NOT_A_FIT']);
const MIX = { csr: { strong: 3, medium: 3, keyword_but_thin: 2 }, sdr: { strong: 3, medium: 3, keyword_but_thin: 2 }, admin: { strong: 2, medium: 1, keyword_but_thin: 1 } };

function consistency(rows = loadApplicants()) {
  return Object.entries(MIX).flatMap(([job, traits]) => Object.entries(traits).flatMap(([trait, n]) => rows.filter((a) => a.job_id === job && a.trait === trait).slice(0, n)));
}

function v1sample(rows = loadApplicants()) {
  const scored = (job) => rows.filter((a) => a.job_id === job && SCORED.has(a.expected.status_band));
  return [...scored('csr').slice(0, 20), ...scored('sdr').slice(0, 20), ...scored('admin')];
}

module.exports = { consistency, v1sample };

if (require.main === module) {
  const set = { consistency, v1sample }[process.argv[2]];
  if (!set) { console.error('usage: node scripts/lib/eval-sets.js consistency|v1sample'); process.exit(1); }
  console.log(set().map((a) => a.ref).join(','));
}
