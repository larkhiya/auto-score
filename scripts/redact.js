#!/usr/bin/env node
// Pipe any output through this to mask every secret value from .env (L-001).
//   docker compose logs greenmail | node scripts/redact.js
// A value counts as secret when its key ends in KEY, SECRET, PASSWORD or TOKEN.
const fs = require('node:fs');
const path = require('node:path');

const envPath = path.resolve(__dirname, '..', '.env');
const secrets = [];
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m && /(KEY|SECRET|PASSWORD|TOKEN)$/.test(m[1]) && m[2].length >= 6) secrets.push(m[2]);
  }
}
// Longest first, so a secret that contains another is masked whole.
secrets.sort((a, b) => b.length - a.length);

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (buf += d));
process.stdin.on('end', () => {
  let out = buf;
  for (const s of secrets) out = out.split(s).join('***');
  process.stdout.write(out);
});
