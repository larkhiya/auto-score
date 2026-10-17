// LLM proxy (Phase 8, D-031): sits between WF-12 and Gemini. Forwards every generateContent call
// unchanged, unless a fault is armed via POST /admin/chaos (see chaos.js). Same idea as the mock
// CRM's FAIL_RATE, for the other external dependency.
// The API key arrives as ?key=… on the URL (the n8n Gemini credential adds it). It is forwarded and
// NEVER logged: logs show the model, status and duration only (L-001).
const http = require('node:http');
const crypto = require('node:crypto');
const { createChaos, faultResponse } = require('./chaos');

const PORT = Number(process.env.LLM_PROXY_PORT || 8090);
const UPSTREAM = process.env.LLM_UPSTREAM || 'https://generativelanguage.googleapis.com';
const ADMIN_KEY = process.env.LLM_PROXY_ADMIN_KEY || '';
const chaos = createChaos();

const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const safeEqual = (a, b) => typeof a === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const readBody = (req) => new Promise((resolve, reject) => { const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); });
const modelOf = (url) => (url.match(/\/models\/([^/:?]+)/) || [])[1] || '?';

async function handle(req, res) {
  const pathOnly = req.url.split('?')[0];
  if (req.method === 'GET' && pathOnly === '/health') return send(res, 200, { ok: true });

  if (pathOnly.startsWith('/admin/')) {
    if (!ADMIN_KEY || !safeEqual(req.headers['x-admin-key'], ADMIN_KEY)) return send(res, 401, { error: 'missing or wrong x-admin-key' });
    if (req.method === 'GET' && pathOnly === '/admin/chaos') return send(res, 200, chaos.view());
    if (req.method === 'POST' && pathOnly === '/admin/chaos') {
      try {
        const v = chaos.set(JSON.parse((await readBody(req)).toString() || '{}'));
        console.log(`[chaos] mode=${v.mode} remaining=${v.remaining}`);
        return send(res, 200, v);
      } catch (e) { return send(res, 400, { error: e.message }); }
    }
    return send(res, 404, { error: 'not found' });
  }

  if (req.method !== 'POST' || !/:generateContent$/.test(pathOnly)) return send(res, 404, { error: 'only POST …:generateContent is proxied' });
  const body = await readBody(req);
  const started = Date.now();
  const fault = chaos.take();
  if (fault === 'timeout') {
    console.log(`[proxy] model=${modelOf(pathOnly)} injected=timeout hold_ms=${chaos.state.hold_ms}`);
    setTimeout(() => req.socket.destroy(), chaos.state.hold_ms);
    return undefined;
  }
  if (fault) {
    const r = faultResponse(fault, { retryDelaySeconds: chaos.state.retry_delay_s });
    console.log(`[proxy] model=${modelOf(pathOnly)} injected=${fault} status=${r.status}`);
    return send(res, r.status, r.body);
  }
  try {
    const up = await fetch(UPSTREAM + req.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(120000) });
    const text = await up.text();
    console.log(`[proxy] model=${modelOf(pathOnly)} status=${up.status} ms=${Date.now() - started}`);
    res.writeHead(up.status, { 'content-type': up.headers.get('content-type') || 'application/json' });
    return res.end(text);
  } catch (e) {
    console.log(`[proxy] model=${modelOf(pathOnly)} upstream_error=${e.name} ms=${Date.now() - started}`);
    return send(res, 502, { error: { code: 502, message: `llm-proxy could not reach the upstream (${e.name})`, status: 'UNAVAILABLE' } });
  }
}

http.createServer((req, res) => { handle(req, res).catch((e) => { console.log(`[proxy] internal_error=${e.name}`); if (!res.headersSent) send(res, 500, { error: 'proxy error' }); }); })
  .listen(PORT, () => console.log(`llm-proxy on :${PORT} → ${UPSTREAM}${ADMIN_KEY ? '' : ' (admin disabled: no LLM_PROXY_ADMIN_KEY)'}`));
