// LLM proxy fault logic (D-031), offline. The contract that matters: an injected fault must look,
// to src/gemini.js and src/llm-check.js, exactly like the real Gemini failure it imitates.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createChaos, faultResponse, MODES } = require('../llm-proxy/chaos');
const gemini = require('../src/gemini');
const { checkReply } = require('../src/llm-check');
const { LLM_BASE_URL } = require('../src/settings');

test('off by default: every call is forwarded', () => {
  const c = createChaos();
  for (let i = 0; i < 3; i++) assert.equal(c.take(), null);
  assert.equal(c.stats.forwarded, 3);
});

test('a fault hits exactly the next `count` calls, then switches itself off', () => {
  const c = createChaos();
  c.set({ mode: 'rate_limit', count: 2 });
  assert.deepEqual([c.take(), c.take(), c.take()], ['rate_limit', 'rate_limit', null]);
  assert.equal(c.state.mode, 'off');
  assert.equal(c.stats.injected.rate_limit, 2);
});

test('count "all" keeps failing until switched off; unknown modes are refused', () => {
  const c = createChaos();
  c.set({ mode: 'server_error', count: 'all' });
  for (let i = 0; i < 10; i++) assert.equal(c.take(), 'server_error');
  assert.equal(c.view().remaining, 'all');
  c.set({ mode: 'off' });
  assert.equal(c.take(), null);
  assert.throws(() => c.set({ mode: 'explode' }), /mode must be one of/);
  assert.ok(MODES.includes('timeout'));
});

test('injected 429 carries the wait where Google puts it (RetryInfo in the body)', () => {
  const r = faultResponse('rate_limit', { retryDelaySeconds: 3 });
  assert.equal(r.status, 429);
  assert.equal(gemini.retryDelaySeconds(r.body), 3);
});

test('injected invalid JSON reads as a normal reply whose text fails the contract check', () => {
  const r = faultResponse('invalid_json');
  assert.equal(r.status, 200);
  const reply = gemini.readResponse(r.body);
  assert.equal(reply.finishReason, 'STOP');
  const c = checkReply({ text: reply.text, finishReason: reply.finishReason, contract: 'candidate_profile', profile: null });
  assert.equal(c.ok, false, 'the pipeline must see this as unusable output and repair or give up');
});

test('WF-12 builds its URL from settings (the proxy), with the model in the path', () => {
  assert.equal(gemini.endpoint('http://llm-proxy:8090/', 'm-1'), 'http://llm-proxy:8090/v1beta/models/m-1:generateContent');
  assert.match(gemini.endpoint(LLM_BASE_URL, gemini.DEFAULT_MODEL), /^http:\/\/llm-proxy:8090\/v1beta\/models\/.+:generateContent$/);
});
