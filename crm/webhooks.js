// Outbound webhooks (CRM → n8n). Fire-and-forget from the request's point of view, but every
// delivery is recorded and retried with backoff, because webhooks are at-least-once at best.
// A delivery that still fails stays in the log (webhook_deliveries) and can be redelivered later
// (POST /webhook-deliveries/:id/redeliver), like the delivery logs of GitHub or Stripe.
const crypto = require('node:crypto');

function createWebhookSender({ db, secret, urls, retries = 3, timeoutMs = 5000, baseDelayMs = 500, log = console }) {
  const pending = new Set();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // One HTTP attempt. Returns { status, error, retryable }; error is null on a 2xx.
  async function postOnce(target, event_id, body) {
    try {
      const res = await fetch(target, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-webhook-secret': secret, 'x-event-id': event_id },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return { status: res.status, error: null, retryable: false };
      return { status: res.status, error: `HTTP ${res.status}`, retryable: res.status >= 500 || res.status === 429 }; // a 4xx won't fix itself on retry
    } catch (e) {
      return { status: null, error: e.name === 'TimeoutError' ? `timeout after ${timeoutMs}ms` : e.message, retryable: true };
    }
  }

  // What the event is about, so a failed delivery can be traced to its record and redelivered.
  const subjectOf = (payload) => (payload.application && payload.application.application_id) || (payload.job && payload.job.job_id) || null;

  async function attemptAll(event, payload) {
    const target = urls[event];
    if (!target) return;
    const event_id = 'evt_' + crypto.randomUUID();
    const body = JSON.stringify({ event, event_id, occurred_at: new Date().toISOString(), ...payload });
    const row = db.prepare('INSERT INTO webhook_deliveries (event, event_id, target, subject_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(event, event_id, target, subjectOf(payload), new Date().toISOString());
    let r = null;
    let attempts = 0;
    for (let i = 0; i < retries; i++) {
      attempts++;
      r = await postOnce(target, event_id, body);
      if (!r.error || !r.retryable) break;
      if (i < retries - 1) await sleep(baseDelayMs * 2 ** i);
    }
    db.prepare('UPDATE webhook_deliveries SET attempts = ?, status_code = ?, error = ?, delivered_at = ? WHERE id = ?')
      .run(attempts, r.status, r.error, r.error ? null : new Date().toISOString(), row.lastInsertRowid);
    if (r.error) log.warn(`[webhook] ${event} ${event_id} → ${target} failed after ${attempts} attempts: ${r.error}`);
  }

  function deliver(event, payload) {
    const p = attemptAll(event, payload).catch((e) => log.error('[webhook] unexpected', e)).finally(() => pending.delete(p));
    pending.add(p);
    return p;
  }

  // Sends a logged delivery again: one attempt, same event_id, the subject's CURRENT state as payload.
  // The caller (a reconciliation job) is the retry loop, so no backoff here.
  async function redeliver(row, payload) {
    const target = urls[row.event];
    if (!target) return { status: null, error: `no webhook URL configured for ${row.event}` };
    const body = JSON.stringify({ event: row.event, event_id: row.event_id, occurred_at: row.created_at, redelivery: true, ...payload });
    const r = await postOnce(target, row.event_id, body);
    const at = new Date().toISOString();
    db.prepare('UPDATE webhook_deliveries SET attempts = attempts + 1, status_code = ?, error = ?, delivered_at = COALESCE(delivered_at, ?), redelivered_at = ? WHERE id = ?')
      .run(r.status, r.error, r.error ? null : at, at, row.id);
    if (r.error) log.warn(`[webhook] redelivery of ${row.event} ${row.event_id} → ${target} failed: ${r.error}`);
    return r;
  }

  // For tests and graceful shutdown: wait until every in-flight delivery has finished.
  const idle = () => Promise.all([...pending]);

  return { deliver, redeliver, idle };
}

module.exports = { createWebhookSender };
