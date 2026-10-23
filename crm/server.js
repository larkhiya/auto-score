// Mock CRM entry point. Reads config from env, seeds job profiles from config/jobs, listens.
const fs = require('node:fs');
const path = require('node:path');
const { open } = require('./db');
const { createService } = require('./service');
const { createWebhookSender } = require('./webhooks');
const { createApp } = require('./app');

const ROOT = path.resolve(__dirname, '..');
const env = process.env;
const apiKey = env.CRM_API_KEY;
if (!apiKey) { console.error('CRM_API_KEY is required'); process.exit(2); }

const dbPath = env.CRM_DB_PATH || path.join(__dirname, 'data', 'crm.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = open(dbPath);

const webhooks = createWebhookSender({
  db,
  secret: env.CRM_WEBHOOK_SECRET || '',
  urls: {
    'application.created': env.CRM_WEBHOOK_URL_APPLICATION,
    'job.draft_requested': env.CRM_WEBHOOK_URL_JOB,
  },
});
const service = createService(db, {
  onEvent: (event, payload) => webhooks.deliver(event, payload),
  onRedeliver: (delivery, payload) => webhooks.redeliver(delivery, payload),
});

const jobsDir = path.join(ROOT, 'config', 'jobs');
const profiles = fs.readdirSync(jobsDir).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(jobsDir, f), 'utf8')));
const added = service.seedJobs(profiles);

const chaos = { fail_rate: Number(env.FAIL_RATE) || 0, latency_ms: Number(env.LATENCY_MS) || 0, fail_after_rate: 0 };
const app = createApp({ service, apiKey, chaos });
const port = Number(env.CRM_PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`[crm] listening on :${port} · db ${dbPath} · seeded ${added} profile version(s) · chaos ${JSON.stringify(chaos)}`);
});

function shutdown() {
  server.close(async () => { await webhooks.idle(); db.close(); process.exit(0); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
