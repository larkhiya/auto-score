const test = require('node:test');
const assert = require('node:assert/strict');
const { checkCandidateTransition, checkProfileTransition, allowedNext, CANDIDATE_STATUSES } = require('../crm/state');
const { validate } = require('../src/validate');

test('candidate statuses match the contract enum', () => {
  const schema = require('../contracts/common.schema.json');
  assert.deepEqual([...CANDIDATE_STATUSES].sort(), [...schema.$defs.candidate_status.enum].sort());
});

test('happy path: NEW → SCREENING → MAYBE → (human) ADVANCED', () => {
  assert.ok(checkCandidateTransition('NEW', 'SCREENING', 'automation').ok);
  assert.ok(checkCandidateTransition('SCREENING', 'MAYBE', 'automation').ok);
  assert.ok(checkCandidateTransition('MAYBE', 'ADVANCED', 'human').ok);
});

test('automation can never make a final hiring decision', () => {
  for (const from of ['SHORTLISTED', 'MAYBE', 'NOT_A_FIT', 'PREFILTER_REJECTED', 'NEEDS_REVIEW']) {
    assert.equal(checkCandidateTransition(from, 'REJECTED', 'automation').code, 'HUMAN_ONLY');
    assert.equal(checkCandidateTransition(from, 'ADVANCED', 'automation').code, 'HUMAN_ONLY');
  }
  // And the CrmUpdate contract doesn't even have those statuses.
  assert.equal(validate('crm_update', { status: 'REJECTED' }).errors.some((e) => e.path === '/status'), true);
});

test('illegal transitions are rejected with a reason', () => {
  assert.equal(checkCandidateTransition('NEW', 'MAYBE', 'automation').code, 'ILLEGAL_TRANSITION');
  assert.equal(checkCandidateTransition('SHORTLISTED', 'NEW', 'automation').code, 'ILLEGAL_TRANSITION');
  assert.equal(checkCandidateTransition('REJECTED', 'SCREENING', 'human').code, 'TERMINAL_STATE');
  assert.equal(checkCandidateTransition('ADVANCED', 'REJECTED', 'human').code, 'TERMINAL_STATE');
  assert.equal(checkCandidateTransition('PREFILTER_REJECTED', 'SCREENING', 'automation').code, 'HUMAN_ONLY');
});

test('error records can be replayed', () => {
  assert.ok(checkCandidateTransition('SCREENING', 'ERROR', 'automation').ok);
  assert.ok(checkCandidateTransition('ERROR', 'SCREENING', 'automation').ok);
});

test('human actions offered per status', () => {
  assert.deepEqual(allowedNext('MAYBE', 'human').sort(), ['ADVANCED', 'REJECTED', 'SCREENING']);
  assert.deepEqual(allowedNext('REJECTED', 'human'), []);
});

test('job profile versions: draft → approved → archived only', () => {
  assert.ok(checkProfileTransition('draft', 'approved').ok);
  assert.ok(checkProfileTransition('approved', 'archived').ok);
  assert.equal(checkProfileTransition('approved', 'draft').code, 'ILLEGAL_TRANSITION');
  assert.equal(checkProfileTransition('archived', 'approved').code, 'ILLEGAL_TRANSITION');
});
