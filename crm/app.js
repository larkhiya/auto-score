// HTTP layer of the mock CRM. REST API for automation (x-api-key), HTML pages for humans (/ui).
const crypto = require('node:crypto');
const express = require('express');
const { HttpError } = require('./service');
const { uiRouter } = require('./ui');

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// chaos = { fail_rate, latency_ms, fail_after_rate } — mutable at runtime via POST /admin/chaos.
//   fail_rate:       fail BEFORE doing anything (503/500/429), like an overloaded server
//   latency_ms:      add delay to every API call, to exercise client timeouts
//   fail_after_rate: PATCH /candidates only: commit the change, then answer 503, like a lost response
function createApp({ service, apiKey, chaos = { fail_rate: 0, latency_ms: 0, fail_after_rate: 0 }, log = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false, limit: '2mb' }));

  app.get('/health', (req, res) => res.json({ ok: true }));
  app.get('/', (req, res) => res.redirect('/ui/candidates'));
  app.use('/ui', uiRouter(service));

  const api = express.Router();
  const wrap = (fn) => (req, res, next) => { try { fn(req, res); } catch (e) { next(e); } };

  api.use((req, res, next) => {
    if (!safeEqual(req.get('x-api-key'), apiKey)) return next(new HttpError(401, 'UNAUTHORIZED', 'missing or wrong x-api-key'));
    next();
  });

  api.get('/admin/chaos', (req, res) => res.json(chaos));
  api.post('/admin/chaos', (req, res) => {
    for (const k of ['fail_rate', 'latency_ms', 'fail_after_rate']) {
      if (req.body[k] !== undefined) chaos[k] = Math.max(0, Number(req.body[k]) || 0);
    }
    log.info(`[chaos] ${JSON.stringify(chaos)}`);
    res.json(chaos);
  });

  api.post('/admin/reset', wrap((req, res) => {
    if (req.body.confirm !== 'delete-all-candidates') throw new HttpError(422, 'CONFIRM_REQUIRED', 'send {"confirm": "delete-all-candidates"}');
    res.json(service.resetCandidates());
  }));

  api.use(async (req, res, next) => {
    if (chaos.latency_ms > 0) await new Promise((r) => setTimeout(r, chaos.latency_ms));
    if (chaos.fail_rate > 0 && Math.random() < chaos.fail_rate) {
      const status = [503, 503, 500, 429][Math.floor(Math.random() * 4)];
      if (status === 429) res.set('retry-after', '1');
      return res.status(status).json({ error: { code: 'SIMULATED_FAILURE', message: `chaos: simulated ${status}` } });
    }
    next();
  });

  // Jobs and profiles
  api.get('/jobs', wrap((req, res) => res.json(service.listJobs())));
  api.get('/jobs/:id', wrap((req, res) => res.json(service.getApprovedProfile(req.params.id))));
  api.get('/jobs/:id/versions/:v', wrap((req, res) => res.json(service.getVersion(req.params.id, req.params.v))));
  api.get('/jobs/:id/draft', wrap((req, res) => res.json(service.getDraft(req.params.id))));
  api.post('/jobs', wrap((req, res) => res.status(201).json(service.createJob(req.body))));
  api.put('/jobs/:id/draft', wrap((req, res) => {
    const { profile, builder_errors: builderErrors = [] } = req.body;
    res.json(service.saveDraft(req.params.id, profile, { builderErrors }));
  }));
  api.patch('/jobs/:id/draft', wrap((req, res) => res.json(service.editDraft(req.params.id, req.body))));
  api.post('/jobs/:id/approve', wrap((req, res) => res.json(service.approveDraft(req.params.id, req.body.approved_by))));
  api.post('/jobs/:id/redraft', wrap((req, res) => res.status(202).json(service.requestRedraft(req.params.id))));
  api.post('/jobs/:id/draft-failed', wrap((req, res) => res.json(service.recordDraftFailure(req.params.id, req.body))));

  // Candidates
  api.post('/applications', wrap((req, res) => {
    const notify = req.query.notify !== 'false';
    const out = service.createApplication(req.body, { notify });
    res.status(out.created ? 201 : 200).json(out);
  }));
  api.get('/candidates', wrap((req, res) => res.json(service.listCandidates(req.query))));
  api.get('/candidates/:id', wrap((req, res) => res.json(service.getCandidate(req.params.id, { history: req.query.history === 'true' }))));
  api.patch('/candidates/:id', wrap((req, res) => {
    const out = service.patchCandidate(req.params.id, req.body, {
      actor: 'automation',
      updateKey: req.get('idempotency-key') || null,
      expectedStatus: req.get('x-expected-status') || null,
    });
    if (!out.replayed && chaos.fail_after_rate > 0 && Math.random() < chaos.fail_after_rate) {
      return res.status(503).json({ error: { code: 'SIMULATED_LOST_RESPONSE', message: 'chaos: change committed, response dropped' } });
    }
    res.set('idempotent-replay', String(out.replayed)).json(out.application);
  }));
  api.get('/review-queue', wrap((req, res) => res.json(service.listCandidates({ ...req.query, status: 'NEEDS_REVIEW' }))));

  // Operations
  api.post('/dead-letters', wrap((req, res) => res.status(201).json(service.addDeadLetter(req.body))));
  api.get('/dead-letters', wrap((req, res) => res.json(service.listDeadLetters({ open: req.query.open === 'true' }))));
  api.post('/dead-letters/:id/replayed', wrap((req, res) => res.json(service.markReplayed(req.params.id, req.body.execution_id))));
  api.post('/run-logs', wrap((req, res) => res.status(201).json(service.addRunLog(req.body))));
  api.get('/run-logs', wrap((req, res) => res.json(service.listRunLogs(req.query))));
  api.get('/stats', wrap((req, res) => res.json(service.stats())));
  // Webhook delivery log (like GitHub's or Stripe's): find failed deliveries and send them again.
  api.get('/webhook-deliveries', wrap((req, res) => res.json(service.listWebhookDeliveries(req.query))));
  api.post('/webhook-deliveries/:id/redeliver', async (req, res) => {
    res.json(await service.redeliverWebhook(req.params.id, { force: Boolean(req.body && req.body.force) }));
  }); // Express 5 passes a rejected promise to the error handler

  app.use(api);

  app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: `${req.method} ${req.path} is not an endpoint` } }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'BAD_JSON', message: 'request body is not valid JSON' } });
    log.error(err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'unexpected error' } });
  });
  return app;
}

module.exports = { createApp };
