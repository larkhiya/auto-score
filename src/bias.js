// Bias check for job descriptions and AI-drafted profiles (brief §5.5, C-20). Pure; bundled into WF-05.
// It FLAGS wording that mentions or stands in for a protected attribute; a person decides. Some
// phrases are legitimate in context (e.g. "recent graduate" for a graduate programme), so nothing is
// dropped or rejected automatically. Approval stays blocked until every flag is resolved (D-018).

const RULES = [
  { category: 'age', re: /\b(young|youthful|digital natives?|recent (?:college |university )?grad(?:uate)?s?|fresh graduates?|under (?:the age of )?\d{2}|no older than|maximum age|aged? (?:between|under|below) ?\d*|fresh blood|young and (?:energetic|dynamic))\b/gi,
    message: 'Age or a stand-in for age. Experience can be required; age cannot.' },
  { category: 'gender', re: /\b(he|she|his|him|salesman|salesmen|chairman|waitress|hostess|female|male|girls?|guys|manpower|he\/she)\b/gi,
    message: 'Gendered wording. Use neutral terms (you, they, salesperson).' },
  { category: 'language_origin', re: /\b(native (?:english )?speakers?|mother tongue|native[- ]level|native english)\b/gi,
    message: '"Native speaker" excludes fluent non-native speakers. Ask for the level of fluency the job needs.' },
  { category: 'nationality', re: /\b(citizens? only|nationality|must be (?:a |an )?(?:us|uk|american|british|local|eu) (?:citizen|national)s?)\b/gi,
    message: 'Nationality. A legal right-to-work requirement belongs in a yes/no form question, not the rubric.' },
  { category: 'marital_status', re: /\b(married|marital status|no (?:children|kids|dependents)|without (?:children|kids)|childless)\b/gi,
    message: 'Marital or family status is not job-relevant.' },
  { category: 'religion', re: /\b(christian|muslim|jewish|hindu|buddhist|religio(?:n|us)|church[- ]going)\b/gi,
    message: 'Religion is not job-relevant.' },
  { category: 'appearance', re: /\b(attractive|good[- ]looking|headshot|photos? (?:required|attached|with (?:your )?application)|include a (?:recent )?photo)\b/gi,
    message: 'Appearance or a photo request is not job-relevant and invites bias.' },
  { category: 'disability', re: /\b(able[- ]bodied|no disabilit(?:y|ies)|perfect (?:health|eyesight|vision))\b/gi,
    message: 'Health or disability wording. Describe the task (e.g. "lift 10 kg") if it is essential, not the person.' },
  { category: 'ethnicity', re: /\b(caucasian|ethnic(?:ity)?|race|racial)\b/gi,
    message: 'Ethnicity is not job-relevant.' },
];

function findIn(text) {
  const hits = [];
  for (const rule of RULES) {
    for (const m of String(text || '').matchAll(rule.re)) hits.push({ category: rule.category, phrase: m[0], message: rule.message });
  }
  return hits;
}

// Collects every place a draft could carry bias: the JD itself, each criterion, each must-have, each nice-to-have.
function textsOf(profile, jdText) {
  const out = [{ target: 'jd', text: jdText }];
  for (const c of profile.criteria || []) {
    out.push({ target: `criterion:${c.id}`, text: [c.name, c.description, ...Object.values(c.anchors || {}), ...(c.evidence_hints || [])].join(' \n ') });
  }
  ((profile.prefilter && profile.prefilter.all) || []).forEach((leaf, i) => {
    out.push({ target: `prefilter:${i}`, text: [leaf.field, leaf.value, ...(leaf.terms || []), leaf.jd_quote].filter((x) => x !== undefined && x !== null).join(' \n ') });
  });
  for (const n of profile.nice_to_haves || []) out.push({ target: `nice_to_have:${n.id}`, text: [n.name, n.description].join(' \n ') });
  return out;
}

function biasCheck(profile, jdText) {
  const flags = [];
  const seen = new Set();
  for (const { target, text } of textsOf(profile, jdText)) {
    for (const h of findIn(text)) {
      const key = `${target}|${h.category}|${h.phrase.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      flags.push({ id: `b${flags.length + 1}`, target, phrase: h.phrase, category: h.category, message: h.message, resolved: false, resolution_note: null });
    }
  }
  return flags;
}

module.exports = { biasCheck, findIn, RULES };
