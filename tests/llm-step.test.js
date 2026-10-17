const test = require('node:test');
const assert = require('node:assert/strict');
const gemini = require('../src/gemini');
const { checkReply } = require('../src/llm-check');
const { loadProfile } = require('../scripts/lib/dataset');

const csr = loadProfile('csr');
const goodCard = () => ({
  criteria: csr.criteria.map((c) => ({ criterion_id: c.id, score: 2, evidence_quote: 'Handled 60 chats a day', rationale: 'Some relevant evidence here.' })),
  nice_to_haves_found: [], overall_confidence: 0.8, flags: [], summary: 'Solid but not exceptional evidence.',
});

test('Gemini request: system prompt, user text, JSON mode, schema, temperature 0', () => {
  const r = gemini.buildRequest({ system: 'S', user: 'U', responseSchema: { type: 'OBJECT' } });
  assert.equal(r.systemInstruction.parts[0].text, 'S');
  assert.equal(r.contents[0].parts[0].text, 'U');
  assert.equal(r.generationConfig.temperature, 0);
  assert.equal(r.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(r.generationConfig.responseSchema, { type: 'OBJECT' });
});

test('Gemini response: text, finish reason and token usage (thinking tokens count as output)', () => {
  const out = gemini.readResponse({
    candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }, { text: '{"a":' }, { text: '1}' }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 5 }, modelVersion: 'gemini-x',
  });
  assert.equal(out.text, '{"a":1}');
  assert.deepEqual(out.usage, { input_tokens: 100, output_tokens: 25 });
  assert.equal(out.model, 'gemini-x');
});

test('429 retry delay comes from the body (RetryInfo)', () => {
  const body = { error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure' }, { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '23s' }] } };
  assert.equal(gemini.retryDelaySeconds(body), 23);
  assert.equal(gemini.retryDelaySeconds({}), null);
});

test('a valid score card passes and gets its bookkeeping fields from code', () => {
  const r = checkReply({ text: JSON.stringify(goodCard()), finishReason: 'STOP', contract: 'score_card', profile: csr });
  assert.ok(r.ok, r.errors.join('; '));
  assert.equal(r.value.job_id, 'csr');
  assert.equal(r.value.job_profile_version, 1);
});

test('invalid replies produce errors a repair prompt can use', () => {
  const truncated = checkReply({ text: '{"criteria": [', finishReason: 'MAX_TOKENS', contract: 'score_card', profile: csr });
  assert.match(truncated.errors[0], /MAX_TOKENS/);

  const card = goodCard();
  card.criteria[0].score = 7;
  assert.match(checkReply({ text: JSON.stringify(card), contract: 'score_card', profile: csr }).errors.join(' '), /must be <= 4/);

  const wrongIds = goodCard();
  wrongIds.criteria[0].criterion_id = 'charisma';
  assert.match(checkReply({ text: JSON.stringify(wrongIds), contract: 'score_card', profile: csr }).errors[0], /exactly these ids/);

  const noQuote = goodCard();
  noQuote.criteria[1].evidence_quote = null;
  assert.equal(checkReply({ text: JSON.stringify(noQuote), contract: 'score_card', profile: csr }).ok, false, 'score > 0 without a quote is invalid');

  assert.equal(checkReply({ text: 'Sorry, I cannot help.', contract: 'candidate_profile' }).ok, false);
});

test('a valid candidate profile passes', () => {
  const r = checkReply({ text: JSON.stringify({ experience: [], skills: [{ name: 'Zendesk', evidence_quote: 'in Zendesk' }], tools: [], achievements: [], languages: [], total_experience_months: null }), finishReason: 'STOP', contract: 'candidate_profile' });
  assert.ok(r.ok, r.errors.join('; '));
  assert.equal(r.value.schema_version, '1.0.0');
});
