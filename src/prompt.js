// Renders the versioned prompts (prompts/*.md, compiled into src/generated/prompts.js) with data from
// the approved JobProfile and the redacted CV. The templates themselves contain nothing role-specific.
const PROMPTS = require('./generated/prompts');

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    if (vars[name] === undefined || vars[name] === null) throw new Error(`prompt variable {{${name}}} has no value`);
    return String(vars[name]);
  });
}

function sections(version) {
  const s = PROMPTS[version];
  if (!s) throw new Error(`unknown prompt version "${version}" (have: ${Object.keys(PROMPTS).join(', ')})`);
  return s;
}

// The CV can't close our delimiter early: any <cv> or </cv> inside it is defanged.
function safeCv(text) {
  return String(text || '').replace(/<\s*\/?\s*cv\s*>/gi, '‹cv›');
}

function criteriaBlock(profile) {
  return profile.criteria.map((c) => [
    `- criterion_id: ${c.id}`,
    `  name: ${c.name}`,
    `  covers: ${c.description}`,
    '  anchors:',
    ...['0', '1', '2', '3', '4'].map((k) => `    ${k}: ${c.anchors[k]}`),
    ...(c.evidence_hints.length ? [`  evidence often mentions: ${c.evidence_hints.join('; ')}`] : []),
  ].join('\n')).join('\n');
}

function niceToHavesBlock(profile) {
  if (!profile.nice_to_haves.length) return '(none)';
  return profile.nice_to_haves.map((n) => `- id: ${n.id}: ${n.name}. ${n.description}`).join('\n');
}

function extractMessages(version, cvText) {
  const s = sections(version);
  return { system: s['extract.system'], user: fill(s['extract.user'], { cv_text: safeCv(cvText) }) };
}

function scoreMessages(version, profile, candidateProfile, cvText) {
  const s = sections(version);
  const { schema_version: _ignored, ...profileForModel } = candidateProfile;
  return {
    system: s['score.system'],
    user: fill(s['score.user'], {
      job_title: profile.title,
      job_id: profile.job_id,
      job_profile_version: profile.version,
      criteria_block: criteriaBlock(profile),
      nice_to_haves_block: niceToHavesBlock(profile),
      candidate_profile_json: JSON.stringify(profileForModel, null, 1),
      cv_text: safeCv(cvText),
      criterion_ids: profile.criteria.map((c) => c.id).join(', '),
    }),
  };
}

function repairMessage(version, errors, previousOutput) {
  const s = sections(version);
  const list = (errors || []).slice(0, 10).map((e) => `- ${typeof e === 'string' ? e : `${e.path || e.instancePath || '/'} ${e.message}`}`).join('\n') || '- the reply was not valid JSON';
  return fill(s['repair.user'], { errors: list, previous_output: String(previousOutput || '').slice(0, 6000) });
}

module.exports = { fill, safeCv, criteriaBlock, niceToHavesBlock, extractMessages, scoreMessages, repairMessage, versions: () => Object.keys(PROMPTS) };
