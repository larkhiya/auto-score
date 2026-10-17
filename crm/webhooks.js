// Outbound webhooks (CRM → n8n). Fire-and-forget from the request's point of view, but every
// delivery is recorded and retried with backoff, because webhooks are at-least-once at best.
const crypto = require('node:crypto');

function createWebhookSender({ db, secret, urls, retries = 3, timeoutMs = 5000, baseDelayMs = 500, log = console }) {
  const pending = new Set();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function attemptAll(event, payload) {
    const target = urls[event];
    if (!target) return;
    const event_id = 'evt_' + crypto.randomUUID();
    const body = JSON.stringify({ event, event_id, occurred_at: new Date().toISOString(), ...payload });
    const row = db.prepare('INSERT INTO webhook_deliveries (event, event_id, target, created_at) VALUES (?, ?, ?, ?)')
      .run(event, event_id, target, new Date().toISOString());
    let status = null;
    let error = null;
    let attempts = 0;
    for (let i = 0; i < retries; i++) {
      attempts++;
      try {
        const res = await fetch(target, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-webhook-secret': secret, 'x-event-id': event_id },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
        status = res.status;
        error = null;
        if (res.ok) break;
        error = `HTTP ${res.status}`;
        if (res.status < 500 && res.status !== 429) break; // a 4xx won't fix itself on retry
      } catch (e) {
        error = e.name === 'TimeoutError' ? `timeout after ${timeoutMs}ms` : e.message;
      }
      if (i < retries - 1) await sleep(baseDelayMs * 2 ** i);
    }
    db.prepare('UPDATE webhook_deliveries SET attempts = ?, status_code = ?, error = ?, delivered_at = ? WHERE id = ?')
      .run(attempts, status, error, error ? null : new Date().toISOString(), row.lastInsertRowid);
    if (error) log.warn(`[webhook] ${event} ${event_id} → ${target} failed after ${attempts} attempts: ${error}`);
  }

  function deliver(event, payload) {
    const p = attemptAll(event, payload).catch((e) => log.error('[webhook] unexpected', e)).finally(() => pending.delete(p));
    pending.add(p);
    return p;
  }

  // For tests and graceful shutdown: wait until every in-flight delivery has finished.
  const idle = () => Promise.all([...pending]);

  return { deliver, idle };
}

module.exports = { createWebhookSender };
