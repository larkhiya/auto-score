// Rubric maths and status mapping (C-17). The LLM gives 0-4 per criterion; code does everything else.
//   total = Σ weight × score / 4     (weights sum to 100, so total is 0-100)
//   status from the job's own thresholds; anything doubtful → NEEDS_REVIEW with a reason.

// Checks the ScoreCard covers exactly the profile's criteria (same ids, no extras, no gaps).
function checkCriteriaMatch(profile, scoreCard) {
  const want = profile.criteria.map((c) => c.id).sort();
  const got = scoreCard.criteria.map((c) => c.criterion_id).sort();
  const missing = want.filter((id) => !got.includes(id));
  const extra = got.filter((id) => !want.includes(id));
  const dupes = got.filter((id, i) => got.indexOf(id) !== i);
  return { ok: !missing.length && !extra.length && !dupes.length, missing, extra, dupes };
}

const round2 = (n) => Math.round(n * 100) / 100;

// verifiedCriteria: output of evidence.verifyScoreCard().criteria
function computeBreakdown(profile, verifiedCriteria) {
  const byId = Object.fromEntries(verifiedCriteria.map((c) => [c.criterion_id, c]));
  const breakdown = profile.criteria.map((pc) => {
    const c = byId[pc.id];
    return {
      criterion_id: pc.id,
      name: pc.name,
      weight: pc.weight,
      score: c.score,
      points: round2((pc.weight * c.score) / 4),
      evidence_quote: c.evidence_quote,
      evidence_verified: c.evidence_verified,
      rationale: c.rationale,
    };
  });
  const total = round2(breakdown.reduce((s, b) => s + b.points, 0));
  return { total, breakdown };
}

// Pure status decision. Order matters: review reasons are checked before thresholds.
function mapStatus({ total, confidence, modelFlags = [], evidenceNeedsReview = false }, thresholds) {
  const reasons = [];
  if (evidenceNeedsReview) reasons.push('EVIDENCE_NOT_VERIFIED');
  if (typeof confidence === 'number' && confidence < thresholds.min_confidence) reasons.push('LOW_CONFIDENCE');
  for (const f of modelFlags) reasons.push(`MODEL_FLAG_${f}`);
  if (reasons.length) return { status: 'NEEDS_REVIEW', reason_codes: reasons };
  if (total >= thresholds.shortlist) return { status: 'SHORTLISTED', reason_codes: [] };
  if (total >= thresholds.maybe) return { status: 'MAYBE', reason_codes: [] };
  return { status: 'NOT_A_FIT', reason_codes: [] };
}

module.exports = { checkCriteriaMatch, computeBreakdown, mapStatus };
