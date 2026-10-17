// Checks on a JobProfile that JSON Schema can't express (brief §5.5). Pure; schema validation
// (src/validate.js) runs first, so this code can assume the shape is right.
// Phase 7 adds the bias check and the registry check for AI-drafted profiles.
const { containsQuote } = require('./text');

function checkProfile(profile) {
  const errors = [];
  const add = (code, message, target = null) => errors.push({ code, message, target });

  const weightSum = profile.criteria.reduce((sum, c) => sum + c.weight, 0);
  if (weightSum !== 100) add('WEIGHTS_NOT_100', `criterion weights sum to ${weightSum}, not 100`);

  const ids = [...profile.criteria.map((c) => c.id), ...profile.nice_to_haves.map((n) => n.id)];
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) {
    add('DUPLICATE_ID', `id "${id}" is used more than once across criteria and nice-to-haves`, id);
  }

  const { shortlist, maybe } = profile.thresholds;
  if (!(maybe < shortlist)) add('THRESHOLDS_ORDER', `maybe (${maybe}) must be below shortlist (${shortlist})`);

  if (profile.status === 'approved') {
    const open = profile.bias_flags.filter((f) => !f.resolved);
    for (const f of open) add('UNRESOLVED_BIAS_FLAG', `bias flag "${f.phrase}" (${f.category}) is not resolved`, f.target);
  }

  // Grounding: an AI-drafted criterion must cite a sentence that really is in the JD.
  if (profile.source_jd_text) {
    for (const c of profile.criteria) {
      if (!c.jd_quote) add('JD_QUOTE_MISSING', `criterion "${c.id}" has no JD quote`, c.id);
      else if (!containsQuote(profile.source_jd_text, c.jd_quote)) add('JD_QUOTE_NOT_FOUND', `criterion "${c.id}" quotes text that is not in the JD`, c.id);
    }
  } else if (profile.created_by === 'llm_draft') {
    add('JD_MISSING', 'an AI-drafted profile must keep the job description it came from');
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { checkProfile };
