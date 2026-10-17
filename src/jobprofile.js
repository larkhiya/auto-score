// Checks on a JobProfile that JSON Schema can't express (brief §5.5). Pure; schema validation
// (src/validate.js) runs first, so this code can assume the shape is right. The bias check is
// src/bias.js; its flags live in the profile and block approval here until resolved.
const { containsQuote } = require('./text');

// System checks every profile gets from code, not from the JD: they need no JD quote.
const SYSTEM_CHECKS = ['cv_text_min_chars', 'duplicate'];
function leaves(node, out = []) {
  if (!node) return out;
  if (node.all || node.any) (node.all || node.any).forEach((n) => leaves(n, out));
  else if (node.not) leaves(node.not, out);
  else out.push(node);
  return out;
}

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
    // Must-haves are grounded too: every pre-filter rule the AI drafted must cite the JD.
    if (profile.created_by === 'llm_draft') {
      leaves(profile.prefilter).filter((l) => !SYSTEM_CHECKS.includes(l.check)).forEach((l) => {
        const label = `must-have "${l.reason || l.check}"`;
        if (!l.jd_quote) add('MUST_HAVE_QUOTE_MISSING', `${label} has no JD quote`, l.reason || l.check);
        else if (!containsQuote(profile.source_jd_text, l.jd_quote)) add('MUST_HAVE_QUOTE_NOT_FOUND', `${label} quotes text that is not in the JD`, l.reason || l.check);
      });
    }
  } else if (profile.created_by === 'llm_draft') {
    add('JD_MISSING', 'an AI-drafted profile must keep the job description it came from');
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { checkProfile, leaves, SYSTEM_CHECKS };
