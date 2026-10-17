// Adapter tests (C-09): every intake path must produce the same, valid ApplicationReceived.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fromCrmRecord, jobFromAddress, parseFrom, cleanAnswers, buildCv } = require('../src/normalize');
const { textSha256 } = require('../src/text');
const { validate } = require('../src/validate');

const CV = 'Support agent at Northwind.\r\nHandled 60 chats a day.   \r\n';
const record = (over = {}) => ({
  application_id: 'app_000042', job_id: 'csr', status: 'NEW', source: 'crm', source_ref: null, idempotency_key: 'app_000042:abcdef123456',
  duplicate_of: null, candidate: { name: 'Ana Silva', email: ' Ana.Silva@Example.TEST ', phone: null, location: null },
  answers: { shift_availability: ' yes ', languages: [' English ', ''], notes: '   ' },
  cv: { text: CV, filename: 'cv.txt', mime: 'text/plain', extraction_method: 'plain_text', extraction_error: null },
  created_at: '2026-10-17T09:30:00.123Z', ...over,
});

test('a CRM record becomes a valid ApplicationReceived', () => {
  const a = fromCrmRecord(record());
  const v = validate('application_received', a);
  assert.ok(v.valid, JSON.stringify(v.errors));
  assert.equal(a.candidate.email, 'ana.silva@example.test');
  assert.equal(a.cv.text, 'Support agent at Northwind.\nHandled 60 chats a day.');
  assert.equal(a.cv.char_count, a.cv.text.length);
  assert.equal(a.cv.sha256, textSha256(a.cv.text));
  assert.equal(a.idempotency_key, 'app_000042:abcdef123456', 'the CRM key is kept');
});

test('form answers are cleaned: trimmed, empty values dropped; no form → null (never {})', () => {
  assert.deepEqual(cleanAnswers({ shift_availability: ' yes ', languages: [' English ', ''], notes: '   ' }), { shift_availability: 'yes', languages: ['English'] });
  assert.equal(fromCrmRecord(record({ answers: null })).answers, null);
});

test('the CV fingerprint ignores whitespace and case (so re-uploads match)', () => {
  assert.equal(buildCv({ text: 'Handled  60 chats\r\n' }).sha256, buildCv({ text: 'handled 60 CHATS' }).sha256);
});

test('blank extracted text is marked, so the pre-filter sends it to review', () => {
  assert.equal(buildCv({ text: '   ', extraction_method: 'pdf_text' }).extraction_error, 'EMPTY_TEXT');
  assert.equal(buildCv({ text: '', extraction_method: 'none', extraction_error: 'NO_ATTACHMENT' }).extraction_error, 'NO_ATTACHMENT');
});

test('a missing idempotency key is derived from id + CV fingerprint', () => {
  const a = fromCrmRecord(record({ idempotency_key: null }));
  assert.equal(a.idempotency_key, `app_000042:${a.cv.sha256.slice(0, 12)}`);
});

test('bad input fails loudly instead of producing a half-empty object', () => {
  assert.throws(() => fromCrmRecord({}), /application_id missing/);
  assert.throws(() => fromCrmRecord(record({ created_at: 'yesterday' })), /invalid timestamp/);
});

test('two entry points, one shape: the same applicant via CRM and via email', () => {
  const viaCrm = fromCrmRecord(record());
  const viaEmail = fromCrmRecord(record({ source: 'email', source_ref: '<abc@mail.example.test>', answers: null,
    cv: { text: CV, filename: 'Ana_Silva_CV.pdf', mime: 'application/pdf', extraction_method: 'pdf_text', extraction_error: null } }));
  assert.ok(validate('application_received', viaEmail).valid);
  assert.deepEqual(Object.keys(viaCrm).sort(), Object.keys(viaEmail).sort());
  assert.equal(viaCrm.cv.sha256, viaEmail.cv.sha256, 'same CV text → same fingerprint, whatever the file format');
});

test('email routing by plus-address', () => {
  const jobs = ['csr', 'sdr', 'admin'];
  assert.equal(jobFromAddress('applications+csr@autoscore.test', jobs), 'csr');
  assert.equal(jobFromAddress(['hr@x.test', 'Applications+SDR@AutoScore.test'], jobs), 'sdr');
  assert.equal(jobFromAddress('applications+zzz@autoscore.test', jobs), null, 'unknown job → null → NEEDS_REVIEW');
  assert.equal(jobFromAddress('applications@autoscore.test', jobs), null);
});

test('parsing the From header', () => {
  assert.deepEqual(parseFrom('Avery Lindqvist <Avery.L@Example.test>'), { name: 'Avery Lindqvist', email: 'avery.l@example.test' });
  assert.deepEqual(parseFrom('"Park, Jamie" <jamie@x.test>'), { name: 'Park, Jamie', email: 'jamie@x.test' });
  assert.deepEqual(parseFrom('morgan@x.test'), { name: null, email: 'morgan@x.test' });
  assert.deepEqual(parseFrom(''), { name: null, email: null });
});
