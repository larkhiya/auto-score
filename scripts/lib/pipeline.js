// Shared helpers for live pipeline runs (eval smoke, failure matrix, variant seeding).
const { loadEnv, requireEnv } = require('./env');

const OPEN = new Set(['NEW', 'SCREENING']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A copy of a dataset row for a repeat run (consistency, prompt comparison, chaos): new ref and a
// plus-tagged email, so the CRM sees a new applicant, not a duplicate. Redaction removes the email
// before the LLM, so the model input is byte-identical to the original's.
function variant(row, tag) {
  const email = row.candidate.email ? row.candidate.email.replace('@', `+${tag}@`) : null;
  const text = row.candidate.email && row.cv.text ? row.cv.text.split(row.candidate.email).join(email) : row.cv.text;
  return { ...row, ref: `${row.ref}~${tag}`, candidate: { ...row.candidate, email }, cv: { ...row.cv, text } };
}
const baseRef = (ref) => ref.split('~')[0];

function applicationBody(a) {
  return { job_id: a.job_id, source: a.source, source_ref: null, candidate: a.candidate, answers: a.answers,
    cv: { text: a.cv.text, filename: a.cv.filename, mime: a.cv.mime, extraction_method: a.cv.extraction_method, extraction_error: a.cv.extraction_error } };
}

// Fires the event the CRM would send on create (application.created → WF-01 → WF-10).
async function fire(application, { eventId } = {}) {
  const env = loadEnv();
  const res = await fetch((env.N8N_BASE_URL || 'http://localhost:5678') + '/webhook/application-received', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webhook-secret': requireEnv('CRM_WEBHOOK_SECRET') },
    body: JSON.stringify({ event: 'application.created', event_id: eventId || `evt_${application.application_id}_${Date.now()}`, occurred_at: new Date().toISOString(), application }),
    signal: AbortSignal.timeout(15000),
  });
  return res.status;
}

// Waits until no record is NEW/SCREENING (L-008: never judge a record that hasn't settled).
async function waitSettled(api, ids, { timeoutMs = 300000, everyMs = 5000 } = {}) {
  const started = Date.now();
  for (;;) {
    const cands = await Promise.all(ids.map((id) => api.getCandidate(id)));
    if (!cands.some((c) => OPEN.has(c.status)) || Date.now() - started > timeoutMs) return Object.fromEntries(cands.map((c) => [c.application_id, c]));
    await sleep(everyMs);
  }
}

async function runLog(api, id) {
  const logs = await api.call('GET', `/run-logs?application_id=${id}`);
  return logs[0] || null;
}

// Arms or clears faults on the llm-proxy (D-031) from the host.
function llmProxy() {
  const env = loadEnv();
  const base = (env.LLM_PROXY_BASE_URL || 'http://localhost:8090').replace(/\/$/, '');
  const key = requireEnv('LLM_PROXY_ADMIN_KEY', 'Run npm run init-env.');
  const call = async (method, body) => {
    const res = await fetch(`${base}/admin/chaos`, { method, headers: { 'content-type': 'application/json', 'x-admin-key': key }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`llm-proxy ${method} /admin/chaos → ${res.status} ${await res.text()}`);
    return res.json();
  };
  return { get: () => call('GET'), set: (cfg) => call('POST', cfg), off: () => call('POST', { mode: 'off' }) };
}

module.exports = { OPEN, sleep, variant, baseRef, applicationBody, fire, waitSettled, runLog, llmProxy };
