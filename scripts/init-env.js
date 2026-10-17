#!/usr/bin/env node
// Creates or completes .env from .env.example.
// - Keeps every value already in .env.
// - Generates random values for test-only secrets of our own local services.
// - Leaves learner-owned keys (N8N_API_KEY, GEMINI_API_KEY) empty: the learner pastes those in.
// Prints key names only, never values.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const examplePath = path.join(root, '.env.example');
const envPath = path.join(root, '.env');

const GENERATED = {
  N8N_ENCRYPTION_KEY: () => crypto.randomBytes(24).toString('base64url'),
  CRM_API_KEY: () => 'crm_' + crypto.randomBytes(18).toString('base64url'),
  CRM_WEBHOOK_SECRET: () => 'whs_' + crypto.randomBytes(18).toString('base64url'),
  MAIL_PASSWORD: () => crypto.randomBytes(12).toString('base64url'),
};
const LEARNER_OWNED = ['N8N_API_KEY', 'GEMINI_API_KEY'];

function parse(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

const example = fs.readFileSync(examplePath, 'utf8');
const existing = fs.existsSync(envPath) ? parse(fs.readFileSync(envPath, 'utf8')) : new Map();

const generated = [];
const out = example.split(/\r?\n/).map((line) => {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) return line;
  const [, key, def] = m;
  if (existing.has(key) && existing.get(key) !== '') return `${key}=${existing.get(key)}`;
  if (GENERATED[key]) {
    generated.push(key);
    return `${key}=${GENERATED[key]()}`;
  }
  return `${key}=${def}`;
});

// Keep any extra keys the learner added that are not in the example.
const exampleKeys = new Set(parse(example).keys());
for (const [key, value] of existing) {
  if (!exampleKeys.has(key)) out.push(`${key}=${value}`);
}

fs.writeFileSync(envPath, out.join('\n'));
const final = parse(out.join('\n'));
console.log(`.env written. Generated: ${generated.length ? generated.join(', ') : '(none, already set)'}`);
const missing = LEARNER_OWNED.filter((k) => !final.get(k));
if (missing.length) console.log(`Still needed from you: ${missing.join(', ')}`);
