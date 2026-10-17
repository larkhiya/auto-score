const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, backoffMs, nextStep } = require('../src/retry');

test('what gets retried: timeouts, network errors, 429, 5xx', () => {
  assert.equal(classify({ error: new Error('timeout of 10000ms exceeded') }).reason, 'TIMEOUT');
  assert.equal(classify({ error: { message: 'connect ECONNREFUSED 172.18.0.3:3000' } }).reason, 'NETWORK_ERROR');
  for (const s of [429, 500, 502, 503, 504]) assert.equal(classify({ statusCode: s }).decision, 'retry', String(s));
});
test('what never gets retried: other 4xx (the request itself is wrong)', () => {
  for (const s of [400, 401, 403, 404, 409, 422]) assert.equal(classify({ statusCode: s }).decision, 'fatal', String(s));
  assert.equal(classify({ statusCode: 409 }).reason, 'CONFLICT');
  assert.equal(classify({ statusCode: 200 }).decision, 'ok');
  assert.equal(classify({ statusCode: 201 }).decision, 'ok');
});
test('backoff doubles, has jitter, and is capped', () => {
  const zero = () => 0;
  assert.deepEqual([1, 2, 3, 4, 5].map((a) => backoffMs(a, { random: zero })), [500, 1000, 2000, 4000, 8000]);
  assert.equal(backoffMs(10, { random: zero }), 20000);
  assert.equal(backoffMs(1, { random: () => 0.999 }), 999);
});
test('Retry-After wins when it asks for a longer wait', () => {
  assert.equal(backoffMs(1, { headers: { 'retry-after': '3' }, random: () => 0 }), 3000);
  assert.equal(backoffMs(4, { headers: { 'retry-after': '1' }, random: () => 0 }), 4000);
});
test('give up after max attempts; fatal never waits', () => {
  assert.equal(nextStep({ statusCode: 503, attempt: 5, maxAttempts: 5 }).decision, 'give_up');
  assert.equal(nextStep({ statusCode: 503, attempt: 2, maxAttempts: 5, random: () => 0 }).delayMs, 1000);
  assert.deepEqual(nextStep({ statusCode: 422, attempt: 1 }).delayMs, 0);
});
