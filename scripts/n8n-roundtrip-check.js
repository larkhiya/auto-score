#!/usr/bin/env node
// Proves the sync method (D-010) is lossless: import workflows/ → export A → import A → export B → A must equal B.
// Also reports where n8n normalized our hand-written files (source vs A), which is informational:
// run `npm run n8n:export` afterwards to adopt n8n's canonical form.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT } = require('./lib/env');
const { importFiles } = require('./n8n-import');
const { exportAll } = require('./n8n-export');

const jsonFiles = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');

async function main() {
  const src = path.join(ROOT, 'workflows');
  const a = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-rt-a-'));
  const b = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-rt-b-'));

  await importFiles(jsonFiles(src).map((f) => path.join(src, f)));
  await exportAll(a);
  await importFiles(jsonFiles(a).map((f) => path.join(a, f)));
  await exportAll(b);

  const sourceFiles = new Set(jsonFiles(src));
  let lossless = true;
  for (const f of jsonFiles(a)) {
    if (!sourceFiles.has(f)) continue;
    const same = read(a, f) === read(b, f);
    const normalized = read(src, f) !== read(a, f);
    if (!same) lossless = false;
    console.log(`${same ? 'OK  ' : 'DIFF'} ${f}${normalized ? '  (n8n normalized the source; adopt with npm run n8n:export)' : ''}`);
  }
  fs.rmSync(a, { recursive: true, force: true });
  fs.rmSync(b, { recursive: true, force: true });
  console.log(lossless ? 'Round trip lossless.' : 'Round trip NOT lossless.');
  process.exit(lossless ? 0 : 1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
