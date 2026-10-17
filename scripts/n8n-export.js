#!/usr/bin/env node
// Exports every n8n workflow whose name starts with "WF-" into workflows/<file>.json (portable form).
//   node scripts/n8n-export.js            → writes into workflows/
//   node scripts/n8n-export.js --out DIR  → writes into DIR (used by the round-trip check)
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./lib/env');
const { client } = require('./lib/n8n-api');
const { toPortable, fileNameFor } = require('./lib/workflow-portable');

async function exportAll(outDir) {
  const api = client();
  const summaries = (await api.listWorkflows()).filter((w) => !w.isArchived);
  const workflowNameById = Object.fromEntries(summaries.map((w) => [w.id, w.name]));
  const ours = summaries.filter((w) => /^WF-/i.test(w.name));

  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const summary of ours) {
    const full = await api.getWorkflow(summary.id);
    const portable = toPortable(full, { workflowNameById });
    const file = path.join(outDir, fileNameFor(full.name));
    fs.writeFileSync(file, JSON.stringify(portable, null, 2) + '\n');
    written.push(path.relative(ROOT, file).replace(/\\/g, '/'));
  }
  const skipped = summaries.length - ours.length;
  return { written, skipped };
}

if (require.main === module) {
  const i = process.argv.indexOf('--out');
  const outDir = i > -1 ? path.resolve(process.argv[i + 1]) : path.join(ROOT, 'workflows');
  exportAll(outDir)
    .then(({ written, skipped }) => {
      for (const f of written) console.log(`exported ${f}`);
      console.log(`${written.length} exported${skipped ? `, ${skipped} skipped (name doesn't start with "WF-")` : ''}`);
    })
    .catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { exportAll };
