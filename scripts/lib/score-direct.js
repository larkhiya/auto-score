// Scores one CV against a job profile with the SAME src/ code WF-10 bundles (redact → prompt →
// Gemini → contract check (+1 repair) → evidence → scoring), but called directly instead of
// through n8n. For model-behaviour tests that must skip the pre-filter (e.g. prompt injection).
// Uses GEMINI_API_KEY from .env. Every call counts towards the free-tier quota.
const { loadEnv } = require('./env');
const { redact } = require('../../src/redact');
const prompt = require('../../src/prompt');
const llm = require('../../src/llm');
const gemini = require('../../src/gemini');
const { checkReply } = require('../../src/llm-check');
const { verifyCandidateProfile, verifyScoreCard } = require('../../src/evidence');
const { computeBreakdown, mapStatus } = require('../../src/scoring');
const { SCREENING_PROMPT_VERSION } = require('../../src/settings');

async function callGemini(messages, responseSchema) {
  const env = loadEnv();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gemini.DEFAULT_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(gemini.buildRequest({ ...messages, responseSchema })),
      signal: AbortSignal.timeout(90000),
    });
    const body = await res.json();
    if (res.ok) return gemini.readResponse(body);
    if (res.status !== 429 && res.status < 500) throw new Error(`Gemini ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, Math.max(1000 * 2 ** attempt, 1000 * (gemini.retryDelaySeconds(body) || 0))));
  }
  throw new Error('Gemini unavailable after 5 attempts');
}

async function jsonStep(contract, messages, responseSchema, profile) {
  let reply = await callGemini(messages, responseSchema);
  let c = checkReply({ text: reply.text, finishReason: reply.finishReason, contract, profile });
  let calls = 1;
  if (!c.ok) {
    reply = await callGemini({ ...messages, user: `${messages.user}\n\n${prompt.repairMessage(SCREENING_PROMPT_VERSION, c.errors, reply.text)}` }, responseSchema);
    c = checkReply({ text: reply.text, finishReason: reply.finishReason, contract, profile });
    calls++;
  }
  return { ...c, calls };
}

async function scoreDirect(cvText, candidate, profile) {
  const red = redact(cvText, candidate).text;
  const pv = SCREENING_PROMPT_VERSION;
  const ex = await jsonStep('candidate_profile', prompt.extractMessages(pv, red), llm.candidateProfileSchema(), null);
  if (!ex.ok) return { status: 'NEEDS_REVIEW', reason_codes: ['INVALID_MODEL_OUTPUT'], calls: ex.calls };
  const vp = verifyCandidateProfile(ex.value, red).profile;
  const sc = await jsonStep('score_card', prompt.scoreMessages(pv, profile, vp, red), llm.scoreCardSchema(profile), profile);
  if (!sc.ok) return { status: 'NEEDS_REVIEW', reason_codes: ['INVALID_MODEL_OUTPUT'], calls: ex.calls + sc.calls };
  const ev = verifyScoreCard(sc.value, red);
  const { total, breakdown } = computeBreakdown(profile, ev.criteria);
  const d = mapStatus({ total, confidence: sc.value.overall_confidence, modelFlags: sc.value.flags, evidenceNeedsReview: ev.needs_review }, profile.thresholds);
  return { status: d.status, reason_codes: d.reason_codes, total, flags: sc.value.flags, breakdown, calls: ex.calls + sc.calls, prompt_version: pv };
}

module.exports = { scoreDirect };
