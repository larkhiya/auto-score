// Grounding check (C-18): every quote the model returns must appear in the text it was given.
// Policy (D-021): an unverified quote zeroes that criterion; 2 or more unverified → NEEDS_REVIEW.
const { containsQuote } = require('./text');

const MAX_UNVERIFIED = 1;

// CandidateProfile from call 1: drop items whose quote isn't in the CV, so call 2 never builds on them.
function verifyCandidateProfile(profile, cvText) {
  const dropped = [];
  const keep = (section) => (item) => {
    const ok = containsQuote(cvText, item.evidence_quote);
    if (!ok) dropped.push({ section, quote: item.evidence_quote });
    return ok;
  };
  const verified = {
    ...profile,
    experience: profile.experience.filter(keep('experience')),
    skills: profile.skills.filter(keep('skills')),
    tools: profile.tools.filter(keep('tools')),
    achievements: profile.achievements.filter(keep('achievements')),
    languages: profile.languages.filter(keep('languages')),
  };
  return { profile: verified, dropped };
}

// ScoreCard from call 2 → per-criterion verification, adjusted scores, and whether to send to review.
function verifyScoreCard(scoreCard, cvText) {
  const criteria = scoreCard.criteria.map((c) => {
    if (c.score === 0) return { ...c, evidence_verified: c.evidence_quote ? containsQuote(cvText, c.evidence_quote) : true, original_score: 0 };
    const verified = Boolean(c.evidence_quote) && containsQuote(cvText, c.evidence_quote);
    return { ...c, evidence_verified: verified, original_score: c.score, score: verified ? c.score : 0 };
  });
  const unverified = criteria.filter((c) => !c.evidence_verified && c.original_score > 0).map((c) => c.criterion_id);
  const niceToHaves = scoreCard.nice_to_haves_found.filter((n) => containsQuote(cvText, n.evidence_quote));
  return {
    criteria,
    nice_to_haves_found: niceToHaves,
    unverified,
    needs_review: unverified.length > MAX_UNVERIFIED,
  };
}

module.exports = { verifyCandidateProfile, verifyScoreCard, MAX_UNVERIFIED };
