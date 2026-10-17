// Fault injection for the LLM proxy (Phase 8, D-031). Pure: no network, unit-tested offline.
// The proxy forwards every call to Gemini unless a fault is armed. A fault affects the next `count`
// generateContent calls, then switches itself off, so a test can target exactly one record's calls.
//   rate_limit    429 RESOURCE_EXHAUSTED with RetryInfo, as Google sends it (wait in the body, not a header)
//   server_error  503 UNAVAILABLE ("the model is overloaded")
//   invalid_json  200 with a well-formed Gemini envelope whose text is not JSON (the model "misbehaves")
//   timeout       no answer at all: the proxy holds the connection past the caller's timeout
const MODES = ['off', 'rate_limit', 'server_error', 'invalid_json', 'timeout'];

function createChaos() {
  const state = { mode: 'off', remaining: 0, retry_delay_s: 2, hold_ms: 95000 };
  const stats = { forwarded: 0, injected: Object.fromEntries(MODES.slice(1).map((m) => [m, 0])) };
  return {
    state, stats,
    // cfg: { mode, count (number, or "all" = until switched off), retry_delay_s?, hold_ms? }
    set(cfg = {}) {
      if (!MODES.includes(cfg.mode)) throw new Error(`mode must be one of ${MODES.join(', ')}`);
      state.mode = cfg.mode;
      state.remaining = cfg.mode === 'off' ? 0 : cfg.count === 'all' ? Infinity : Math.max(1, Number(cfg.count) || 1);
      if (cfg.retry_delay_s !== undefined) state.retry_delay_s = Math.max(0, Number(cfg.retry_delay_s) || 0);
      if (cfg.hold_ms !== undefined) state.hold_ms = Math.max(0, Number(cfg.hold_ms) || 0);
      return this.view();
    },
    // Called once per generateContent request: which fault (if any) applies to it.
    take() {
      if (state.mode === 'off' || state.remaining <= 0) { stats.forwarded++; return null; }
      const mode = state.mode;
      state.remaining -= 1;
      stats.injected[mode]++;
      if (state.remaining <= 0) state.mode = 'off';
      return mode;
    },
    view() { return { ...state, remaining: state.remaining === Infinity ? 'all' : state.remaining, stats }; },
  };
}

// → { status, body } for the response-type faults (timeout is handled by the server).
function faultResponse(mode, { retryDelaySeconds = 2 } = {}) {
  if (mode === 'rate_limit') {
    return { status: 429, body: { error: { code: 429, message: 'Resource has been exhausted (e.g. check quota). [injected by llm-proxy]', status: 'RESOURCE_EXHAUSTED',
      details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: `${retryDelaySeconds}s` }] } } };
  }
  if (mode === 'server_error') {
    return { status: 503, body: { error: { code: 503, message: 'The model is overloaded. Please try again later. [injected by llm-proxy]', status: 'UNAVAILABLE' } } };
  }
  if (mode === 'invalid_json') {
    return { status: 200, body: { candidates: [{ content: { role: 'model', parts: [{ text: '{"criteria": [ this is not JSON' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 }, modelVersion: 'llm-proxy-injected' } };
  }
  throw new Error(`no response body for mode ${mode}`);
}

module.exports = { MODES, createChaos, faultResponse };
