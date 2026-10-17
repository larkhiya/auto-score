#!/usr/bin/env node
// Sends the email samples (data/email_samples/manifest.json) to the local GreenMail server.
//   node scripts/send-test-email.js                 all samples
//   node scripts/send-test-email.js email-1 email-4 just these
//   node scripts/send-test-email.js email-1 --twice same message (same Message-ID) twice: dedupe test
// Like Gmail plus-addressing: the To header keeps "+job", the envelope delivers to the base mailbox.
// Bulk testing goes through the webhook path; this is for a handful of emails only.
const fs = require('node:fs');
const path = require('node:path');
const nodemailer = require('nodemailer');
const { ROOT, requireEnv, loadEnv } = require('./lib/env');

async function main() {
  const env = loadEnv();
  const dir = path.join(ROOT, 'data', 'email_samples');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const args = process.argv.slice(2);
  const ids = args.filter((a) => a.startsWith('email-'));
  const twice = args.includes('--twice');
  const mailbox = requireEnv('MAIL_USER');
  const transport = nodemailer.createTransport({
    host: env.MAIL_SMTP_HOST || 'localhost', port: Number(env.MAIL_SMTP_PORT || 3025), secure: false, ignoreTLS: true,
  });
  const run = Date.now().toString(36);
  for (const m of manifest.filter((x) => !ids.length || ids.includes(x.id))) {
    const messageId = `<${m.id}.${run}@autoscore.test>`;
    const mail = {
      from: m.from, to: m.to, subject: m.subject, text: m.body, messageId,
      envelope: { from: m.from.match(/<([^>]+)>/)[1], to: mailbox },
      attachments: m.attachment ? [{ filename: m.attachment, path: path.join(dir, m.attachment) }] : [],
    };
    for (let i = 0; i < (twice ? 2 : 1); i++) {
      await transport.sendMail(mail);
      console.log(`sent ${m.id}${twice ? ` (copy ${i + 1})` : ''} → ${m.to} · ${m.attachment || 'no attachment'} · ${messageId} · expect ${JSON.stringify(m.expect)}`);
    }
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
