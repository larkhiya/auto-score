#!/usr/bin/env node
// Creates (or updates) the n8n credentials for OUR OWN local test services from .env:
//   CRM API key (x-api-key), CRM webhook secret (x-webhook-secret), GreenMail IMAP and SMTP.
// Values are read from .env and sent straight to n8n; nothing is printed except names and ids.
// The Gemini credential is NOT created here: it's the learner's real key, entered in n8n by the learner (D-004).
const { requireEnv } = require('./lib/env');
const { client } = require('./lib/n8n-api');

const wanted = () => [
  { name: 'CRM API key', type: 'httpHeaderAuth', data: { name: 'x-api-key', value: requireEnv('CRM_API_KEY') } },
  { name: 'CRM webhook secret', type: 'httpHeaderAuth', data: { name: 'x-webhook-secret', value: requireEnv('CRM_WEBHOOK_SECRET') } },
  { name: 'GreenMail IMAP (test)', type: 'imap', data: { user: requireEnv('MAIL_USER'), password: requireEnv('MAIL_PASSWORD'), host: 'greenmail', port: 3143, secure: false, allowUnauthorizedCerts: true } },
  { name: 'GreenMail SMTP (test)', type: 'smtp', data: { user: requireEnv('MAIL_USER'), password: requireEnv('MAIL_PASSWORD'), host: 'greenmail', port: 3025, secure: false, disableStartTls: true } },
];

async function main() {
  const api = client();
  const existing = await api.listCredentials();
  for (const c of wanted()) {
    const found = existing.find((e) => e.name === c.name && e.type === c.type);
    if (found) {
      await api.call('PATCH', `/credentials/${found.id}`, { name: c.name, type: c.type, data: c.data });
      console.log(`updated  ${c.type.padEnd(15)} "${c.name}" (${found.id})`);
    } else {
      const created = await api.createCredential(c);
      console.log(`created  ${c.type.padEnd(15)} "${c.name}" (${created.id})`);
    }
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
