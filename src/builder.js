// Job-profile builder, deterministic half (brief §5.5, C-33). Pure; bundled into WF-05.
// The LLM drafts a FLAT structure (criteria + must-haves + nice-to-haves). Code assembles the
// JobProfile: the pre-filter tree, system checks, default thresholds, bias flags, bookkeeping.
// Then the same contract + §5.5 checks run as for any profile. A human approves before use.
const { biasCheck } = require('./bias');
const { checkProfile } = require('./jobprofile');
const validateProfile = require('./generated/validators/job_profile');

const DRAFT_CHECKS = ['keyword', 'field_equals', 'field_includes', 'field_present', 'number_gte'];
const DEFAULT_THRESHOLDS = { shortlist: 75, maybe: 55, min_confidence: 0.6 };
const CODE = '^[A-Z][A-Z0-9_]{1,63}$';
const ID = '^[a-z][a-z0-9_]{1,47}$';

// Standard JSON Schema for the LLM's structured output (WF-05's Structured Output Parser).
function draftSchema() {
  const str = { type: 'string' };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'criteria', 'must_haves', 'nice_to_haves'],
    properties: {
      title: str,
      criteria: {
        type: 'array', minItems: 4, maxItems: 8,
        items: {
          type: 'object', additionalProperties: false,
          required: ['id', 'name', 'weight', 'description', 'anchors', 'evidence_hints', 'jd_quote'],
          properties: {
            id: { type: 'string', pattern: ID }, name: str, weight: { type: 'integer', minimum: 1, maximum: 100 }, description: str,
            anchors: { type: 'object', additionalProperties: false, required: ['0', '1', '2', '3', '4'], properties: { 0: str, 1: str, 2: str, 3: str, 4: str } },
            evidence_hints: { type: 'array', items: str }, jd_quote: str,
          },
        },
      },
      must_haves: {
        type: 'array', maxItems: 6,
        items: {
          type: 'object', additionalProperties: false,
          required: ['name', 'check', 'reason', 'jd_quote'],
          properties: {
            name: str, check: { type: 'string', enum: DRAFT_CHECKS }, reason: { type: 'string', pattern: CODE }, jd_quote: str,
            field: str, value: { type: ['string', 'number', 'boolean'] }, terms: { type: 'array', items: str }, form_question: str,
          },
        },
      },
      nice_to_haves: {
        type: 'array', maxItems: 5,
        items: { type: 'object', additionalProperties: false, required: ['id', 'name', 'description', 'jd_quote'], properties: { id: { type: 'string', pattern: ID }, name: str, description: str, jd_quote: str } },
      },
    },
  };
}

const formField = (f) => (String(f || '').startsWith('answers.') ? f : `answers.${String(f || '').replace(/^answers\./, '')}`);

// One flat must-have → one registry leaf. An unknown check is kept as-is so the contract check
// reports it ("only registry checks"), rather than being silently dropped.
function toLeaf(m) {
  const base = { check: m.check, reason: m.reason, jd_quote: m.jd_quote ?? null };
  switch (m.check) {
    case 'keyword': return { ...base, terms: m.terms || [] };
    case 'field_present': return { ...base, field: formField(m.field) };
    case 'number_gte': return { ...base, field: formField(m.field), value: Number(m.value) };
    case 'field_equals':
    case 'field_includes': return { ...base, field: formField(m.field), value: m.value };
    default: return { ...m };
  }
}

function assembleDraft({ draft, job, promptVersion, model, now = new Date().toISOString() }) {
  const profile = {
    schema_version: '1.1.0',
    job_id: job.job_id,
    version: 1, // the CRM assigns the real version when it saves the draft
    status: 'draft',
    title: draft.title || job.title,
    source_jd_text: job.jd_text,
    prefilter: {
      all: [
        { check: 'cv_text_min_chars', value: 300, reason: 'CV_TOO_SHORT' },
        ...(draft.must_haves || []).map(toLeaf),
        { not: { check: 'duplicate' }, reason: 'DUPLICATE_APPLICATION' },
      ],
    },
    criteria: (draft.criteria || []).map((c) => ({ ...c, evidence_hints: c.evidence_hints || [], jd_quote: c.jd_quote ?? null })),
    nice_to_haves: (draft.nice_to_haves || []).map((n) => ({ ...n, jd_quote: n.jd_quote ?? null })),
    thresholds: { ...DEFAULT_THRESHOLDS },
    bias_flags: [],
    created_by: 'llm_draft',
    approved_by: null,
    approved_at: null,
    created_at: now,
    builder: { prompt_version: promptVersion, model, check_errors: [] },
  };
  profile.bias_flags = biasCheck(profile, job.jd_text);
  // Form questions the must-haves rely on, for the recruiter to add to the application form.
  const questions = (draft.must_haves || []).filter((m) => m.form_question).map((m) => ({ field: formField(m.field), question: m.form_question }));
  return { profile, form_questions: questions };
}

// Contract first, then §5.5 code checks. Returns readable error strings (they feed the repair prompt).
function checkDraft(profile) {
  if (!validateProfile(profile)) {
    return (validateProfile.errors || []).slice(0, 8).map((e) => `contract ${e.instancePath || '/'}: ${e.message}${e.params && e.params.allowedValues ? ` (${e.params.allowedValues.join(', ')})` : ''}`);
  }
  return checkProfile(profile).errors.map((e) => `${e.code}: ${e.message}`);
}

// Prompt text for one builder call. The JD is data: a </jd> inside it is defanged.
const PROMPTS = require('./generated/prompts');
const { fill } = require('./prompt');
const BUILDER_PROMPT_VERSION = 'job_profile_builder_v1';

function builderMessages(job, repair = null) {
  const s = PROMPTS[BUILDER_PROMPT_VERSION];
  const jd = String(job.jd_text || '').replace(/<\s*\/?\s*jd\s*>/gi, '‹jd›');
  let user = fill(s.user, { job_title: job.title, jd_text: jd });
  if (repair) {
    user += '\n\n' + fill(s.repair, { errors: repair.errors.map((e) => `- ${e}`).join('\n'), previous: String(repair.previous || '').slice(0, 8000) });
  }
  return { system: s.system, user };
}

module.exports = { draftSchema, assembleDraft, checkDraft, toLeaf, builderMessages, BUILDER_PROMPT_VERSION, DRAFT_CHECKS, DEFAULT_THRESHOLDS };
