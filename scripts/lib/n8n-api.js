// Minimal client for the n8n public REST API (D-010). Shapes checked against the
// instance's own spec at /api/v1/openapi.yml (n8n 2.43.7).
const { loadEnv, requireEnv } = require('./env');

function client() {
  const env = loadEnv();
  const base = (env.N8N_BASE_URL || 'http://localhost:5678').replace(/\/$/, '') + '/api/v1';
  const key = requireEnv('N8N_API_KEY', 'Create it in the n8n editor: Settings > n8n API.');

  async function call(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error(`${method} ${path} → ${res.status}: ${data && data.message ? data.message : text}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function paginate(path) {
    const out = [];
    let cursor;
    do {
      const sep = path.includes('?') ? '&' : '?';
      const page = await call('GET', `${path}${sep}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      out.push(...page.data);
      cursor = page.nextCursor;
    } while (cursor);
    return out;
  }

  return {
    call,
    listWorkflows: () => paginate('/workflows?excludePinnedData=true'),
    getWorkflow: (id) => call('GET', `/workflows/${id}`),
    createWorkflow: (body) => call('POST', '/workflows', body),
    updateWorkflow: (id, body) => call('PUT', `/workflows/${id}`, body),
    publishWorkflow: (id) => call('POST', `/workflows/${id}/publish`),
    unpublishWorkflow: (id) => call('POST', `/workflows/${id}/unpublish`),
    listCredentials: () => paginate('/credentials'),
    createCredential: (body) => call('POST', '/credentials', body),
    listDataTables: () => paginate('/data-tables'),
    createDataTable: (body) => call('POST', '/data-tables', body),
    listRows: (id, query = '') => call('GET', `/data-tables/${id}/rows?limit=250${query}`),
    updateRows: (id, body) => call('PATCH', `/data-tables/${id}/rows/update`, body),
    listExecutions: (query = '') => call('GET', `/executions${query}`),
    getExecution: (id, includeData = false) => call('GET', `/executions/${id}?includeData=${includeData}`),
  };
}

module.exports = { client };
