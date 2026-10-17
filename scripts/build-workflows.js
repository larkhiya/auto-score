#!/usr/bin/env node
// Refreshes every `// @bundle-begin ...` block in Code nodes under workflows/ from the current src/ (D-014).
//   node scripts/build-workflows.js           (rewrites stale blocks in place)
//   node scripts/build-workflows.js --check   (exits 1 if any block is stale: the drift check)
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./lib/env');
const { rebuildCode } = require('./lib/bundle');

const DIR = path.join(ROOT, 'workflows');

function scan({ write }) {
  const stale = [];
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
    const full = path.join(DIR, file);
    const wf = JSON.parse(fs.readFileSync(full, 'utf8'));
    let changed = false;
    for (const node of wf.nodes) {
      if (node.type !== 'n8n-nodes-base.code' || typeof node.parameters.jsCode !== 'string') continue;
      const next = rebuildCode(node.parameters.jsCode);
      if (next !== node.parameters.jsCode) {
        stale.push(`${file} › ${node.name}`);
        node.parameters.jsCode = next;
        changed = true;
      }
    }
    if (changed && write) fs.writeFileSync(full, JSON.stringify(wf, null, 2) + '\n');
  }
  return stale;
}

if (require.main === module) {
  const check = process.argv.includes('--check');
  const stale = scan({ write: !check });
  for (const s of stale) console.log(`${check ? 'stale' : 'rebuilt'}: ${s}`);
  if (!stale.length) console.log('workflow bundles up to date');
  if (check && stale.length) process.exit(1);
}

module.exports = { scan };
