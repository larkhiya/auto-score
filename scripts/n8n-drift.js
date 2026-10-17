#!/usr/bin/env node
// Deploy drift check (L-007): is what runs in n8n exactly what's in git?
// Exports every WF-* workflow to a temp folder and compares it byte for byte with workflows/.
// Exit 1 on any difference. Run after `npm run build` + `npm run n8n:import`.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT } = require('./lib/env');
const { exportAll } = require('./n8n-export');

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-drift-'));
  await exportAll(tmp);
  const live = new Set(fs.readdirSync(tmp));
  const repo = new Set(fs.readdirSync(path.join(ROOT, 'workflows')).filter((f) => f.endsWith('.json')));
  let drift = 0;
  for (const f of new Set([...live, ...repo])) {
    let state;
    if (!live.has(f)) state = 'missing in n8n';
    else if (!repo.has(f)) state = 'only in n8n';
    else state = fs.readFileSync(path.join(tmp, f), 'utf8') === fs.readFileSync(path.join(ROOT, 'workflows', f), 'utf8') ? 'same' : 'DIFFERS';
    if (state !== 'same') drift++;
    console.log(`${state.padEnd(15)} ${f}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(drift ? `${drift} workflow(s) differ: run npm run n8n:import` : 'n8n matches git');
  process.exit(drift ? 1 : 0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
