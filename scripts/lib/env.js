// Loads .env from the repo root into process.env (Node's built-in loader, no dependency).
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
  return process.env;
}

function requireEnv(name, hint) {
  const value = loadEnv()[name];
  if (!value) {
    console.error(`Missing ${name} in .env.${hint ? ' ' + hint : ''}`);
    process.exit(2);
  }
  return value;
}

module.exports = { ROOT, loadEnv, requireEnv };
