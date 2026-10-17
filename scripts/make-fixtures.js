#!/usr/bin/env node
// Writes contracts/fixtures/{valid,invalid}/*.json from one valid base per contract plus small mutations.
// Each fixture is self-describing: { contract, description, expect?, data }.
// `expect` (invalid only) names the error that must appear: { path, keyword }.
// Re-run after changing a schema:  node scripts/make-fixtures.js
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ROOT } = require('./lib/env');
const { normalizeForMatch } = require('../src/text');

const OUT = path.join(ROOT, 'contracts', 'fixtures');
const clone = (o) => JSON.parse(JSON.stringify(o));
const sha = (t) => crypto.createHash('sha256').update(normalizeForMatch(t)).digest('hex');

// Fictional CV, used across fixtures.
const CV = [
  'Customer Support Specialist, Northwind Subscriptions (2023-2026)',
  '- Handled 60+ live chat and email tickets per day in Zendesk for a SaaS billing product.',
  '- Kept CSAT at 94% over 18 months and cut average handle time from 9 to 6 minutes.',
  '- De-escalated billing complaints and resolved tier-2 refund cases with finance.',
  '- Wrote 25 knowledge-base articles and macros used by the whole team.',
  'Retail Associate, Lakeside Electronics (2021-2023)',
  '- Helped 80+ customers a day choose devices; handled returns and complaints at the front desk.',
  'Skills: Zendesk, Salesforce Service Cloud, live chat, email support. Languages: English, Spanish.',
].join('\n');

const applicationReceived = {
  schema_version: '1.0.0',
  application_id: 'app_000123',
  source: 'crm',
  received_at: '2026-10-17T09:30:00Z',
  job_id: 'csr',
  candidate: { name: 'Jordan Rivera', email: 'jordan.rivera@example.test', phone: null, location: null },
  answers: { shift_availability: 'yes', languages: ['English', 'Spanish'] },
  cv: {
    text: CV, filename: 'cv_app_000123.txt', mime: 'text/plain', sha256: sha(CV),
    extraction_method: 'provided_text', extraction_error: null, char_count: CV.length,
  },
  idempotency_key: `app_000123:${sha(CV).slice(0, 12)}`,
  source_ref: 'evt_000123',
  duplicate_of: null,
};

const emailApplication = (() => {
  const a = clone(applicationReceived);
  Object.assign(a, { application_id: 'app_000124', source: 'email', job_id: null, answers: null, source_ref: '<CAF3x1@mail.example.test>' });
  a.candidate = { name: 'Sam Okafor', email: 'sam.okafor@example.test', phone: null, location: null };
  Object.assign(a.cv, { filename: 'Sam_Okafor_CV.pdf', mime: 'application/pdf', extraction_method: 'pdf_text' });
  a.idempotency_key = `app_000124:${a.cv.sha256.slice(0, 12)}`;
  return a;
})();

const jobProfile = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'jobs', 'csr.v1.json'), 'utf8'));
const draftProfile = (() => {
  const p = clone(jobProfile);
  const jd = 'We need someone who has handled customer conversations by phone and chat. You will resolve problems calmly and write clear replies.';
  Object.assign(p, {
    job_id: 'demo', version: 1, status: 'draft', title: 'Demo Role', source_jd_text: jd,
    created_by: 'llm_draft', approved_by: null, approved_at: null,
    builder: { prompt_version: 'job_profile_builder_v1', model: 'example-model', check_errors: [] },
  });
  p.criteria = p.criteria.map((c) => ({ ...c, jd_quote: 'handled customer conversations by phone and chat' }));
  return p;
})();

const prefilterResult = {
  schema_version: '1.0.0', application_id: 'app_000123', job_id: 'csr', job_profile_version: 1,
  outcome: 'pass', reason_codes: [], flags: [],
  trace: [
    { path: 'all', node: 'all', result: true },
    { path: 'all[0]', node: 'cv_text_min_chars', result: true, reason: 'CV_TOO_SHORT' },
  ],
  evaluated_at: '2026-10-17T09:30:01.250Z',
};
const prefilterReview = {
  ...clone(prefilterResult), application_id: 'app_000124', outcome: 'review', reason_codes: ['NO_SHIFT_AVAILABILITY'],
  trace: [
    { path: 'all', node: 'all', result: 'unknown' },
    { path: 'all[1]', node: 'field_equals', result: 'unknown', reason: 'NO_SHIFT_AVAILABILITY' },
  ],
};

const candidateProfile = {
  schema_version: '1.0.0',
  experience: [{
    title: 'Customer Support Specialist', organization: 'Northwind Subscriptions', duration_months: 36,
    summary: 'Chat and email support for a SaaS billing product.',
    evidence_quote: 'Handled 60+ live chat and email tickets per day in Zendesk',
  }],
  skills: [{ name: 'De-escalation', evidence_quote: 'De-escalated billing complaints' }],
  tools: [{ name: 'Zendesk', evidence_quote: 'tickets per day in Zendesk' }],
  achievements: [{ description: 'High customer satisfaction', metric: '94% CSAT', evidence_quote: 'Kept CSAT at 94% over 18 months' }],
  languages: [{ name: 'Spanish', evidence_quote: 'Languages: English, Spanish' }],
  total_experience_months: 60,
};

const scoreCard = {
  schema_version: '1.0.0', job_id: 'csr', job_profile_version: 1,
  criteria: jobProfile.criteria.map((c, i) => ({
    criterion_id: c.id,
    score: i === 5 ? 0 : 3,
    evidence_quote: i === 5 ? null : 'Handled 60+ live chat and email tickets per day in Zendesk',
    rationale: i === 5 ? 'The CV gives no evidence for this criterion.' : 'Sustained chat and email support with stated daily volume.',
  })),
  nice_to_haves_found: [{ id: 'second_language', evidence_quote: 'Languages: English, Spanish' }],
  overall_confidence: 0.85, flags: [],
  summary: 'Experienced chat and email support agent with strong satisfaction metrics.',
};

const crmUpdateScored = {
  schema_version: '1.0.0', application_id: 'app_000123', status: 'MAYBE', total_score: 67.5,
  breakdown: [{
    criterion_id: 'customer_facing_experience', name: 'Customer-facing experience', weight: 25, score: 3, points: 18.75,
    evidence_quote: 'Handled 60+ live chat and email tickets per day in Zendesk', evidence_verified: true,
    rationale: 'Sustained chat and email support with stated daily volume.',
  }],
  summary: 'Experienced chat and email support agent.', reason_codes: [], flags: ['NICE_TO_HAVE_SECOND_LANGUAGE'],
  job_id: 'csr', job_profile_version: 1, prompt_version: 'screening_v1', model: 'example-model',
  execution_id: '1042', processed_at: '2026-10-17T09:30:09Z', idempotency_key: applicationReceived.idempotency_key,
};
const crmUpdateRejected = {
  ...clone(crmUpdateScored), status: 'PREFILTER_REJECTED', total_score: null, breakdown: null, summary: null,
  reason_codes: ['NO_SHIFT_AVAILABILITY'], flags: [], prompt_version: null, model: null,
};

const runLog = {
  schema_version: '1.0.0', execution_id: '1042', workflow: 'WF-10 Screening', application_id: 'app_000123', job_id: 'csr',
  started_at: '2026-10-17T09:30:00Z', finished_at: '2026-10-17T09:30:09Z',
  stage_timings_ms: { validate: 12, prefilter: 4, llm_extract: 3100, llm_score: 4200, write_back: 180 },
  llm: { calls: 2, input_tokens: 5400, output_tokens: 1300, model: 'example-model', cost_estimate_usd: 0 },
  outcome: 'MAYBE', error: null,
};

// name → [contract, description, data, expect?]
const valid = {
  'application_received.crm': ['application_received', 'CRM application with form answers', applicationReceived],
  'application_received.email-unrouted': ['application_received', 'Email application: no form answers, job not yet known', emailApplication],
  'job_profile.csr-v1': ['job_profile', 'The approved csr profile from config/jobs', jobProfile],
  'job_profile.llm-draft': ['job_profile', 'An AI-drafted profile awaiting approval', draftProfile],
  'prefilter_result.pass': ['prefilter_result', 'Passed the gate', prefilterResult],
  'prefilter_result.review': ['prefilter_result', 'Unknown answer → review, with reason', prefilterReview],
  'candidate_profile.basic': ['candidate_profile', 'Extraction with evidence quotes', candidateProfile],
  'score_card.basic': ['score_card', 'All six csr criteria; score 0 may have a null quote', scoreCard],
  'crm_update.scored': ['crm_update', 'Scored outcome records rubric, prompt and model', crmUpdateScored],
  'crm_update.prefilter-rejected': ['crm_update', 'Rejected by the gate, with reason code', crmUpdateRejected],
  'run_log.basic': ['run_log', 'One screening execution', runLog],
};

const mutate = (base, fn) => { const d = clone(base); fn(d); return d; };
const invalid = {
  'application_received.missing-sha256': ['application_received', 'cv.sha256 is required', mutate(applicationReceived, (d) => delete d.cv.sha256), { path: '/cv', keyword: 'required' }],
  'application_received.bad-source': ['application_received', 'source must be crm or email', mutate(applicationReceived, (d) => (d.source = 'fax')), { path: '/source', keyword: 'enum' }],
  'application_received.local-time': ['application_received', 'received_at must be UTC ISO 8601', mutate(applicationReceived, (d) => (d.received_at = '2026-10-17 09:30')), { path: '/received_at', keyword: 'pattern' }],
  'application_received.nested-answer': ['application_received', 'answers values must be simple', mutate(applicationReceived, (d) => (d.answers.languages = { en: true })), { path: '/answers', keyword: 'anyOf' }],
  'application_received.extra-field': ['application_received', 'unknown top-level fields are rejected', mutate(applicationReceived, (d) => (d.score = 99)), { path: '/', keyword: 'additionalProperties' }],
  'job_profile.missing-anchor': ['job_profile', 'every criterion needs all five anchors', mutate(jobProfile, (d) => delete d.criteria[0].anchors['4']), { path: '/criteria/0/anchors', keyword: 'required' }],
  'job_profile.unknown-check': ['job_profile', 'pre-filter may only use registry checks', mutate(jobProfile, (d) => (d.prefilter.all[0] = { check: 'regex', value: '.*' })), { path: '/prefilter/all/0/check', keyword: 'enum' }],
  'job_profile.keyword-extra-param': ['job_profile', 'a check only accepts its own parameters', mutate(jobProfile, (d) => (d.prefilter.all[3].any[0].value = 3)), { path: '/prefilter/all/3/any/0', keyword: 'additionalProperties' }],
  'job_profile.approved-without-approver': ['job_profile', 'an approved profile must name its approver', mutate(jobProfile, (d) => (d.approved_by = null)), { path: '/approved_by', keyword: 'type' }],
  'job_profile.too-few-criteria': ['job_profile', '4 to 8 criteria', mutate(jobProfile, (d) => (d.criteria = d.criteria.slice(0, 3))), { path: '/criteria', keyword: 'minItems' }],
  'job_profile.zero-weight': ['job_profile', 'weights are 1-100', mutate(jobProfile, (d) => (d.criteria[0].weight = 0)), { path: '/criteria/0/weight', keyword: 'minimum' }],
  'prefilter_result.fail-without-reason': ['prefilter_result', 'fail must carry a reason code', mutate(prefilterResult, (d) => (d.outcome = 'fail')), { path: '/reason_codes', keyword: 'minItems' }],
  'prefilter_result.bad-trace-result': ['prefilter_result', 'trace results are true, false or unknown', mutate(prefilterResult, (d) => (d.trace[0].result = 'maybe')), { path: '/trace/0/result', keyword: 'enum' }],
  'candidate_profile.short-quote': ['candidate_profile', 'evidence quotes must be real excerpts', mutate(candidateProfile, (d) => (d.tools[0].evidence_quote = 'ok')), { path: '/tools/0/evidence_quote', keyword: 'minLength' }],
  'candidate_profile.missing-languages': ['candidate_profile', 'all sections are required (empty arrays allowed)', mutate(candidateProfile, (d) => delete d.languages), { path: '/', keyword: 'required' }],
  'score_card.score-5': ['score_card', 'scores are 0-4', mutate(scoreCard, (d) => (d.criteria[0].score = 5)), { path: '/criteria/0/score', keyword: 'maximum' }],
  'score_card.points-without-evidence': ['score_card', 'a score above 0 needs a quote', mutate(scoreCard, (d) => (d.criteria[0].evidence_quote = null)), { path: '/criteria/0/evidence_quote', keyword: 'type' }],
  'score_card.confidence-1.2': ['score_card', 'confidence is 0-1', mutate(scoreCard, (d) => (d.overall_confidence = 1.2)), { path: '/overall_confidence', keyword: 'maximum' }],
  'score_card.unknown-flag': ['score_card', 'flags come from a fixed list', mutate(scoreCard, (d) => (d.flags = ['HIRE_ME'])), { path: '/flags/0', keyword: 'enum' }],
  'crm_update.scored-without-model': ['crm_update', 'a scored status must name the model', mutate(crmUpdateScored, (d) => (d.model = null)), { path: '/model', keyword: 'type' }],
  'crm_update.review-without-reason': ['crm_update', 'NEEDS_REVIEW must say why', mutate(crmUpdateRejected, (d) => { d.status = 'NEEDS_REVIEW'; d.reason_codes = []; }), { path: '/reason_codes', keyword: 'minItems' }],
  'crm_update.score-120': ['crm_update', 'total score is 0-100', mutate(crmUpdateScored, (d) => (d.total_score = 120)), { path: '/total_score', keyword: 'maximum' }],
  'run_log.unknown-outcome': ['run_log', 'outcome comes from the status list', mutate(runLog, (d) => (d.outcome = 'DONE')), { path: '/outcome', keyword: 'enum' }],
  'run_log.negative-timing': ['run_log', 'timings are non-negative', mutate(runLog, (d) => (d.stage_timings_ms.validate = -1)), { path: '/stage_timings_ms/validate', keyword: 'minimum' }],
};

function writeSet(dir, set) {
  fs.rmSync(path.join(OUT, dir), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, dir), { recursive: true });
  for (const [name, [contract, description, data, expect]] of Object.entries(set)) {
    const fixture = { contract, description, ...(expect ? { expect } : {}), data };
    fs.writeFileSync(path.join(OUT, dir, `${name}.json`), JSON.stringify(fixture, null, 2) + '\n');
  }
}

writeSet('valid', valid);
writeSet('invalid', invalid);
console.log(`wrote ${Object.keys(valid).length} valid and ${Object.keys(invalid).length} invalid fixtures`);
