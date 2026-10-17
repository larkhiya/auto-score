const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validate } = require('../src/validate');
const { checkProfile } = require('../src/jobprofile');

const JOBS = path.resolve(__dirname, '..', 'config', 'jobs');
const load = (f) => JSON.parse(fs.readFileSync(path.join(JOBS, f), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const codes = (r) => r.errors.map((e) => e.code);

for (const file of fs.readdirSync(JOBS).filter((f) => f.endsWith('.json'))) {
  test(`${file} passes the schema and the code checks`, () => {
    const p = load(file);
    const s = validate('job_profile', p);
    assert.ok(s.valid, JSON.stringify(s.errors, null, 2));
    const c = checkProfile(p);
    assert.ok(c.ok, JSON.stringify(c.errors, null, 2));
    assert.equal(file, `${p.job_id}.v${p.version}.json`, 'file name must match job_id and version');
  });
}

test('csr and sdr are genuinely different rubrics (role-agnostic engine, C-32)', () => {
  const csr = load('csr.v1.json').criteria.map((c) => c.id);
  const sdr = load('sdr.v1.json').criteria.map((c) => c.id);
  assert.equal(csr.filter((id) => sdr.includes(id)).length, 0);
});

test('weights summing to 90 are rejected', () => {
  const p = load('csr.v1.json');
  p.criteria[0].weight -= 10;
  assert.deepEqual(codes(checkProfile(p)), ['WEIGHTS_NOT_100']);
});

test('maybe threshold must be below shortlist', () => {
  const p = load('csr.v1.json');
  p.thresholds.maybe = 80;
  assert.ok(codes(checkProfile(p)).includes('THRESHOLDS_ORDER'));
});

test('duplicate ids across criteria and nice-to-haves are rejected', () => {
  const p = load('csr.v1.json');
  p.nice_to_haves[0].id = p.criteria[0].id;
  assert.ok(codes(checkProfile(p)).includes('DUPLICATE_ID'));
});

test('an approved profile cannot carry unresolved bias flags', () => {
  const p = load('csr.v1.json');
  p.bias_flags = [{ id: 'b1', target: 'jd', phrase: 'digital native', category: 'age', message: 'age proxy', resolved: false }];
  assert.ok(codes(checkProfile(p)).includes('UNRESOLVED_BIAS_FLAG'));
  p.bias_flags[0].resolved = true;
  assert.ok(checkProfile(p).ok);
});

test('AI-drafted criteria must quote the JD, and the quote must really be there', () => {
  const p = clone(load('csr.v1.json'));
  Object.assign(p, { status: 'draft', created_by: 'llm_draft', source_jd_text: 'You will answer customer emails and resolve billing problems.' });
  p.criteria.forEach((c) => (c.jd_quote = 'answer customer emails'));
  assert.ok(checkProfile(p).ok);

  p.criteria[1].jd_quote = 'must be a digital native';
  p.criteria[2].jd_quote = null;
  assert.deepEqual(codes(checkProfile(p)).sort(), ['JD_QUOTE_MISSING', 'JD_QUOTE_NOT_FOUND']);
});
