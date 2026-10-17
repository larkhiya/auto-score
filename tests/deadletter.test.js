const test = require('node:test');
const assert = require('node:assert/strict');
const dl = require('../src/deadletter');
const { validate } = require('../src/validate');

const app = { application_id: 'app_000042', job_id: 'csr', idempotency_key: 'app_000042:abcdef123456', cv: { text: 'x'.repeat(100) } };

test('errors are classified into stable codes', () => {
  assert.equal(dl.classifyError('LLM unavailable during scoring: LLM_UNAVAILABLE_RATE_LIMITED'), 'LLM_UNAVAILABLE');
  assert.equal(dl.classifyError('claim failed for app_1: RETRIES_EXHAUSTED_SERVER_ERROR (HTTP 503)'), 'CRM_UNAVAILABLE');
  assert.equal(dl.classifyError('write-back failed for app_1: RETRIES_EXHAUSTED_TIMEOUT (HTTP null)'), 'CRM_UNAVAILABLE');
  assert.equal(dl.classifyError('our CrmUpdate broke its contract: ...'), 'CONTRACT_VIOLATION');
  assert.equal(dl.classifyError('Cannot read properties of undefined'), 'UNEXPECTED_ERROR');
});

test('a dead letter keeps who, where, why and the payload, and starts open', () => {
  const row = dl.buildDeadLetter({ source_workflow: 'WF-01 Intake webhook', failed_execution_id: 99, stage: 'screening', error: { message: 'claim failed: RETRIES_EXHAUSTED_SERVER_ERROR' }, application: app }, '2026-10-17T12:00:00.000Z');
  assert.equal(row.application_id, 'app_000042');
  assert.equal(row.failed_execution_id, '99');
  assert.equal(row.error_code, 'CRM_UNAVAILABLE');
  assert.equal(row.status, 'open');
  assert.equal(JSON.parse(row.payload).application_id, 'app_000042');
});

test('huge payloads are truncated, not dropped', () => {
  const big = { ...app, cv: { text: 'y'.repeat(100000) } };
  const row = dl.buildDeadLetter({ error: 'x', application: big });
  assert.ok(row.payload.length < dl.MAX_PAYLOAD_CHARS + 100);
  assert.match(row.payload, /more chars\]$/);
});

test('without an application (e.g. a crash before normalizing) the row still records the event', () => {
  const row = dl.buildDeadLetter({ source_workflow: 'WF-02 Intake email', error: 'boom', payload: { message_id: '<m@x>' } });
  assert.equal(row.application_id, null);
  assert.equal(JSON.parse(row.payload).message_id, '<m@x>');
});

test('the ERROR update satisfies the CrmUpdate contract', () => {
  const row = dl.buildDeadLetter({ error: 'claim failed: RETRIES_EXHAUSTED_SERVER_ERROR', application: app });
  const u = dl.errorUpdate(app, row, 123, '2026-10-17T12:00:00.000Z');
  const v = validate('crm_update', u);
  assert.ok(v.valid, JSON.stringify(v.errors));
  assert.deepEqual(u.reason_codes, ['CRM_UNAVAILABLE']);
});

test('the alert says what failed and how to replay', () => {
  const n = dl.notification({ ...dl.buildDeadLetter({ source_workflow: 'WF-01', error: 'boom', application: app }), crm_marked: false });
  assert.match(n.subject, /UNEXPECTED_ERROR in WF-01 for app_000042/);
  assert.match(n.text, /CRM marked ERROR: NO/);
  assert.match(n.text, /replay-dlq/);
});
