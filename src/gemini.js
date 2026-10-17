// Gemini generateContent request/response shapes (D-007, D-025). Pure; bundled into WF-12.
// Swapping provider means replacing this file and WF-12's HTTP node; WF-10 never sees the provider.

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

function buildRequest({ system, user, responseSchema, temperature = 0, maxOutputTokens = 8192 }) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      responseMimeType: 'application/json',
      ...(responseSchema ? { responseSchema } : {}),
    },
  };
}

// generateContent URL for a model. base = settings.LLM_BASE_URL (the proxy) or Google's host.
function endpoint(base, model) {
  return `${String(base).replace(/\/+$/, '')}/v1beta/models/${model}:generateContent`;
}

// → { text, finishReason, usage: { input_tokens, output_tokens }, model, blockReason }
function readResponse(body) {
  const b = body || {};
  const cand = (b.candidates || [])[0] || {};
  const parts = (cand.content && cand.content.parts) || [];
  const u = b.usageMetadata || {};
  return {
    text: parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join(''),
    finishReason: cand.finishReason || null,
    usage: { input_tokens: u.promptTokenCount || 0, output_tokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) },
    model: b.modelVersion || null,
    blockReason: (b.promptFeedback && b.promptFeedback.blockReason) || null,
  };
}

// On 429 Google puts the wait in the body (RetryInfo.retryDelay "23s"), not in a Retry-After header.
function retryDelaySeconds(body) {
  const details = (body && body.error && body.error.details) || [];
  for (const d of details) {
    if (d && typeof d.retryDelay === 'string') {
      const n = parseFloat(d.retryDelay);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

module.exports = { DEFAULT_MODEL, buildRequest, endpoint, readResponse, retryDelaySeconds };
