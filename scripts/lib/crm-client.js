// Small CRM API client for scripts (seeding, evals, replay). Explicit timeout on every call.
const { loadEnv, requireEnv } = require('./env');

function crm() {
  const env = loadEnv();
  const base = (env.CRM_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const key = requireEnv('CRM_API_KEY', 'Run npm run init-env.');
  async function call(method, path, body, headers = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-api-key': key, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error(`${method} ${path} → ${res.status} ${data && data.error ? `${data.error.code}: ${data.error.message}` : text}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }
  return {
    call,
    createApplication: (body, { notify = false } = {}) => call('POST', `/applications${notify ? '' : '?notify=false'}`, body),
    listCandidates: (q = {}) => call('GET', `/candidates?${new URLSearchParams(q)}`),
    getCandidate: (id, history = false) => call('GET', `/candidates/${id}${history ? '?history=true' : ''}`),
    stats: () => call('GET', '/stats'),
    chaos: (body) => call('POST', '/admin/chaos', body),
  };
}

module.exports = { crm };
