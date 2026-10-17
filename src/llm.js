// LLM plumbing that doesn't depend on the provider: response schemas, tolerant JSON parsing,
// and turning model output into contract objects. The provider call itself lives in the workflow
// (one swappable step, D-007).

// Response schemas in the OpenAPI subset that Gemini's responseSchema accepts (types, enum,
// nullable, required, items, min/max). They steer the model; our contracts still validate after.
const S = {
  str: (description) => ({ type: 'STRING', ...(description ? { description } : {}) }),
  nstr: (description) => ({ type: 'STRING', nullable: true, ...(description ? { description } : {}) }),
  num: (o = {}) => ({ type: 'NUMBER', ...o }),
  int: (o = {}) => ({ type: 'INTEGER', ...o }),
  arr: (items, o = {}) => ({ type: 'ARRAY', items, ...o }),
  obj: (properties, required = Object.keys(properties)) => ({ type: 'OBJECT', properties, required, propertyOrdering: Object.keys(properties) }),
};
const QUOTE = 'exact verbatim excerpt from the CV';

// List caps keep extraction of very long CVs inside the output budget (a 29k-character CV hit
// MAX_TOKENS twice without them). They steer the model only; the contract doesn't limit lengths.
const CAPS = { experience: 10, skills: 15, tools: 12, achievements: 12, languages: 6 };

function candidateProfileSchema() {
  const named = (max) => S.arr(S.obj({ name: S.str(), evidence_quote: S.str(QUOTE) }), { maxItems: max });
  return S.obj({
    experience: S.arr(S.obj({
      title: S.str(), organization: S.nstr(), duration_months: S.num({ nullable: true }), summary: S.str(), evidence_quote: S.str(QUOTE),
    }), { maxItems: CAPS.experience }),
    skills: named(CAPS.skills),
    tools: named(CAPS.tools),
    achievements: S.arr(S.obj({ description: S.str(), metric: S.nstr('the number, if any'), evidence_quote: S.str(QUOTE) }), { maxItems: CAPS.achievements }),
    languages: named(CAPS.languages),
    total_experience_months: S.num({ nullable: true }),
  });
}

// criterion ids and nice-to-have ids are enums taken from the job profile: the model can't invent new ones.
function scoreCardSchema(profile) {
  const ids = profile.criteria.map((c) => c.id);
  const nth = profile.nice_to_haves.map((n) => n.id);
  return S.obj({
    criteria: S.arr(S.obj({
      criterion_id: { type: 'STRING', enum: ids },
      score: S.int({ minimum: 0, maximum: 4 }),
      evidence_quote: S.nstr(`${QUOTE}; null only when score is 0`),
      rationale: S.str(),
    }), { minItems: ids.length, maxItems: ids.length }),
    nice_to_haves_found: S.arr(S.obj({ id: nth.length ? { type: 'STRING', enum: nth } : S.str(), evidence_quote: S.str(QUOTE) })),
    overall_confidence: S.num({ minimum: 0, maximum: 1 }),
    flags: S.arr({ type: 'STRING', enum: ['INSUFFICIENT_INFORMATION', 'POSSIBLE_INJECTION', 'NON_ENGLISH_CV', 'INCONSISTENT_DATES', 'OTHER_CONCERN'] }),
    summary: S.str(),
  });
}

// Accepts raw model text: plain JSON, JSON in ```fences```, or JSON with chatter around it.
function parseModelJson(text) {
  if (text && typeof text === 'object') return { ok: true, value: text };
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return { ok: true, value: JSON.parse(raw) }; } catch (e) { /* fall through */ }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start > -1 && end > start) {
    try { return { ok: true, value: JSON.parse(raw.slice(start, end + 1)) }; } catch (e) { return { ok: false, error: `invalid JSON: ${e.message}` }; }
  }
  return { ok: false, error: 'no JSON object found in the reply' };
}

// Code, not the model, adds the contract's bookkeeping fields.
const toCandidateProfile = (modelJson) => ({ schema_version: '1.0.0', ...modelJson });
const toScoreCard = (modelJson, profile) => ({ schema_version: '1.0.0', job_id: profile.job_id, job_profile_version: profile.version, ...modelJson });

module.exports = { CAPS, candidateProfileSchema, scoreCardSchema, parseModelJson, toCandidateProfile, toScoreCard };
