// Checks one model reply against our contract (C-16): parse → wrap → validate → (score cards)
// exact criterion ids. Returns { ok, value, errors } where errors feed the single repair retry.
const { parseModelJson, toCandidateProfile, toScoreCard } = require('./llm');
const validateCandidateProfile = require('./generated/validators/candidate_profile');
const validateScoreCard = require('./generated/validators/score_card');

function ajvErrors(fn) {
  return (fn.errors || []).slice(0, 8).map((e) => `${e.instancePath || '/'} ${e.message}`);
}

// contract: 'candidate_profile' | 'score_card'. profile: the JobProfile (needed for score cards).
function checkReply({ text, finishReason, contract, profile }) {
  if (finishReason && finishReason !== 'STOP') {
    return { ok: false, value: null, errors: [`the reply stopped early (finishReason ${finishReason}); return the complete JSON`] };
  }
  const parsed = parseModelJson(text);
  if (!parsed.ok) return { ok: false, value: null, errors: [parsed.error] };

  if (contract === 'candidate_profile') {
    const value = toCandidateProfile(parsed.value);
    return validateCandidateProfile(value) ? { ok: true, value, errors: [] } : { ok: false, value: null, errors: ajvErrors(validateCandidateProfile) };
  }
  if (contract === 'score_card') {
    const value = toScoreCard(parsed.value, profile);
    if (!validateScoreCard(value)) return { ok: false, value: null, errors: ajvErrors(validateScoreCard) };
    const want = profile.criteria.map((c) => c.id).sort().join(',');
    const got = value.criteria.map((c) => c.criterion_id).sort().join(',');
    if (want !== got) return { ok: false, value: null, errors: [`criteria must be exactly these ids, once each: ${want}`] };
    return { ok: true, value, errors: [] };
  }
  throw new Error(`unknown contract ${contract}`);
}

module.exports = { checkReply };
