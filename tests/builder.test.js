// Phase 7: profile-builder assembly, the §5.5 checks on AI drafts, and the bias check.
const test = require('node:test');
const assert = require('node:assert/strict');
const { assembleDraft, checkDraft, draftSchema } = require('../src/builder');
const { biasCheck } = require('../src/bias');
const { loadProfile } = require('../scripts/lib/dataset');

const JD = 'We are hiring an Administrative Assistant. You will manage calendars and book meetings for a team of 12. '
  + 'You will prepare documents and spreadsheets in Microsoft Office. Keep records accurate and up to date. '
  + 'You must be able to work on site three days a week. At least two years of office experience is required.';
const job = { job_id: 'admin', title: 'Administrative Assistant', jd_text: JD };
const anchors = { 0: 'No evidence.', 1: 'Brief mention.', 2: 'Some evidence.', 3: 'Clear, sustained evidence.', 4: 'Sustained, specific, measurable evidence.' };
const goodDraft = () => ({
  title: 'Administrative Assistant',
  criteria: [
    { id: 'calendar_management', name: 'Calendar management', weight: 30, description: 'Managing calendars and meetings.', anchors, evidence_hints: ['calendars'], jd_quote: 'manage calendars and book meetings' },
    { id: 'document_preparation', name: 'Document preparation', weight: 30, description: 'Documents and spreadsheets.', anchors, evidence_hints: ['Excel'], jd_quote: 'prepare documents and spreadsheets in Microsoft Office' },
    { id: 'record_keeping', name: 'Record keeping', weight: 20, description: 'Accurate records.', anchors, evidence_hints: [], jd_quote: 'Keep records accurate and up to date' },
    { id: 'office_experience', name: 'Office experience', weight: 20, description: 'Office work.', anchors, evidence_hints: [], jd_quote: 'two years of office experience' },
  ],
  must_haves: [
    { name: 'On-site work', check: 'field_equals', field: 'onsite_availability', value: 'yes', reason: 'NO_ONSITE_AVAILABILITY', jd_quote: 'work on site three days a week', form_question: 'Can you work on site three days a week?' },
    { name: 'Office background', check: 'keyword', terms: ['administrative', 'office', 'receptionist'], reason: 'NO_OFFICE_EXPERIENCE', jd_quote: 'office experience is required' },
  ],
  nice_to_haves: [{ id: 'team_support', name: 'Supporting a team', description: 'Supported a team of 10+.', jd_quote: 'for a team of 12' }],
});
const errorsFor = (draft) => checkDraft(assembleDraft({ draft, job, promptVersion: 'job_profile_builder_v1', model: 'test' }).profile);

test('a good draft assembles into a contract-valid, check-clean JobProfile 1.1.0', () => {
  const { profile, form_questions: q } = assembleDraft({ draft: goodDraft(), job, promptVersion: 'job_profile_builder_v1', model: 'test' });
  assert.deepEqual(checkDraft(profile), []);
  assert.equal(profile.schema_version, '1.1.0');
  assert.equal(profile.created_by, 'llm_draft');
  assert.equal(profile.status, 'draft');
  assert.equal(profile.prefilter.all[0].check, 'cv_text_min_chars', 'system checks come from code');
  assert.deepEqual(profile.prefilter.all.at(-1), { not: { check: 'duplicate' }, reason: 'DUPLICATE_APPLICATION' });
  assert.equal(profile.prefilter.all[1].field, 'answers.onsite_availability', 'form fields are namespaced');
  assert.deepEqual(q, [{ field: 'answers.onsite_availability', question: 'Can you work on site three days a week?' }]);
  assert.deepEqual(profile.bias_flags, []);
});

test('malformed drafts are rejected with readable reasons (brief Phase 7 test list)', () => {
  const w = goodDraft(); w.criteria[0].weight = 20; // sums to 90
  assert.ok(errorsFor(w).some((e) => e.startsWith('WEIGHTS_NOT_100')));

  const reg = goodDraft(); reg.must_haves[0].check = 'regex';
  assert.ok(errorsFor(reg).some((e) => /contract .*check/.test(e) || /allowed values|must be equal to one of/.test(e)), errorsFor(reg).join(' | '));

  const q = goodDraft(); q.criteria[1].jd_quote = 'expert in Python and machine learning';
  assert.ok(errorsFor(q).some((e) => e.startsWith('JD_QUOTE_NOT_FOUND')));

  const mq = goodDraft(); mq.must_haves[1].jd_quote = 'must own a car';
  assert.ok(errorsFor(mq).some((e) => e.startsWith('MUST_HAVE_QUOTE_NOT_FOUND')));

  const few = goodDraft(); few.criteria = few.criteria.slice(0, 3); few.criteria[0].weight = 50;
  assert.ok(errorsFor(few).some((e) => /contract \/criteria/.test(e)));
});

test('the bias check flags planted phrases in the JD and in the draft, by category', () => {
  const biasedJd = 'We want a young and energetic native English speaker. He will greet clients. Please include a recent photo. Must be a UK citizen. Ideally a recent graduate.';
  const draft = goodDraft();
  draft.criteria[3].description = 'Digital natives preferred.';
  const { profile } = assembleDraft({ draft, job: { ...job, jd_text: `${JD} ${biasedJd}` }, promptVersion: 'v', model: 'm' });
  const cats = new Set(profile.bias_flags.map((f) => f.category));
  for (const c of ['age', 'language_origin', 'gender', 'appearance', 'nationality']) assert.ok(cats.has(c), `missing ${c}`);
  assert.ok(profile.bias_flags.some((f) => f.target === 'criterion:office_experience' && /digital native/i.test(f.phrase)));
  assert.ok(profile.bias_flags.every((f) => f.resolved === false));
  // Unresolved flags block approval (checked as if approved).
  const asApproved = { ...profile, status: 'approved', approved_by: 'x', approved_at: '2026-10-18T00:00:00Z' };
  assert.ok(checkDraft(asApproved).some((e) => e.startsWith('UNRESOLVED_BIAS_FLAG')));
});

test('no false alarms on the hand-written csr and sdr profiles', () => {
  for (const id of ['csr', 'sdr']) {
    const p = loadProfile(id);
    assert.deepEqual(biasCheck(p, ''), [], id);
  }
});

test('the LLM output schema allows only registry checks a JD can justify', () => {
  const s = draftSchema();
  assert.deepEqual(s.properties.must_haves.items.properties.check.enum, ['keyword', 'field_equals', 'field_includes', 'field_present', 'number_gte']);
  assert.equal(s.properties.criteria.minItems, 4);
});
