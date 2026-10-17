// Retry policy for calls to the CRM (brief §5.3, C-23). Pure; bundled into WF-11.
//   retry:  network errors, timeouts, 429 and 5xx (temporary: trying again can succeed)
//   fatal:  every other 4xx (our request is wrong: trying again gives the same answer)
//   delay:  exponential backoff with jitter, capped; a Retry-After header wins if it's longer

const DEFAULTS = { baseMs: 500, maxMs: 20000, maxAttempts: 5 };

function classify({ statusCode, error } = {}) {
  if (error) {
    const msg = String(error.message || error.code || error);
    const timeout = /timeout|timed out|ETIMEDOUT|ESOCKETTIMEDOUT|aborted/i.test(msg);
    return { decision: 'retry', reason: timeout ? 'TIMEOUT' : 'NETWORK_ERROR', detail: msg.slice(0, 200) };
  }
  if (statusCode >= 200 && statusCode < 300) return { decision: 'ok', reason: null };
  if (statusCode === 429) return { decision: 'retry', reason: 'RATE_LIMITED' };
  if (statusCode >= 500) return { decision: 'retry', reason: 'SERVER_ERROR' };
  if (statusCode === 409) return { decision: 'fatal', reason: 'CONFLICT' };
  return { decision: 'fatal', reason: statusCode ? `HTTP_${statusCode}` : 'NO_STATUS' };
}

function retryAfterMs(headers) {
  const v = headers && (headers['retry-after'] || headers['Retry-After']);
  if (v === undefined || v === null || v === '') return 0;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : 0;
}

// attempt = the attempt that just failed (1-based). random() is injectable for tests.
function backoffMs(attempt, { headers, baseMs = DEFAULTS.baseMs, maxMs = DEFAULTS.maxMs, random = Math.random } = {}) {
  const exp = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
  const jitter = Math.floor(random() * baseMs);
  return Math.min(maxMs, Math.max(exp + jitter, retryAfterMs(headers)));
}

// One decision object for the workflow: what to do next after attempt N.
function nextStep({ statusCode, error, headers, attempt, maxAttempts = DEFAULTS.maxAttempts, random }) {
  const c = classify({ statusCode, error });
  if (c.decision === 'retry' && attempt >= maxAttempts) return { ...c, decision: 'give_up', reason: c.reason, delayMs: 0 };
  return { ...c, delayMs: c.decision === 'retry' ? backoffMs(attempt, { headers, random }) : 0 };
}

module.exports = { classify, backoffMs, retryAfterMs, nextStep, DEFAULTS };
