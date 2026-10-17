// Prints a node's parameters (name, type, default, options) exactly as this n8n build defines them.
// Runs INSIDE the n8n container, so the answer matches the installed version, not memory or docs:
//   docker exec -i auto-score-n8n-1 node - <NodeName> [version] < scripts/n8n-node-info.js
//   e.g.  ... node - Set 3.5   |   ... node - Filter   |   ... node - lmChatGoogleGemini
const fs = require('fs');
const path = require('path');

const want = (process.argv[2] || '').toLowerCase();
const version = process.argv[3];
const roots = [
  '/usr/local/lib/node_modules/n8n/node_modules/n8n-nodes-base',
  '/usr/local/lib/node_modules/n8n/node_modules/@n8n/n8n-nodes-langchain',
];

function load(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return pkg.n8n.nodes.map((rel) => ({ root, rel }));
}

let found;
for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  for (const { rel } of load(root)) {
    const base = path.basename(rel, '.node.js').toLowerCase();
    if (base === want) { found = path.join(root, rel); break; }
  }
  if (found) break;
}
if (!found) { console.error(`node "${want}" not found`); process.exit(1); }

const mod = require(found);
const Cls = Object.values(mod).find((v) => typeof v === 'function');
const inst = new Cls();
let desc = inst.description;
if (inst.nodeVersions) {
  const versions = Object.keys(inst.nodeVersions);
  const v = version || String(inst.currentVersion || versions[versions.length - 1]);
  const vi = inst.nodeVersions[v] || inst.nodeVersions[Number(v)];
  if (!vi) { console.error(`version ${v} not in ${versions.join(', ')}`); process.exit(1); }
  desc = vi.description;
  console.log(`# ${desc.name} versions: ${versions.join(', ')} · showing ${v}`);
} else {
  console.log(`# ${desc.name} version: ${JSON.stringify(desc.version)}`);
}
console.log(`# type: ${found.includes('langchain') ? '@n8n/n8n-nodes-langchain' : 'n8n-nodes-base'}.${desc.name}`);
if (desc.credentials) console.log(`# credentials: ${desc.credentials.map((c) => c.name).join(', ')}`);

// n8n ships authoring guidance ("builderHint") with its nodes: print it, it beats guessing.
const hints = inst.description && inst.description.builderHint;
if (hints) {
  const text = [].concat(hints.message || [], ...(hints.extraTypeDefContent || []).map((x) => x.content)).join('\n');
  if (text.trim()) console.log(`# builder hints:\n${text.replace(/^/gm, '#   ')}`);
}

function show(props, indent) {
  for (const p of props || []) {
    const opts = p.options && p.type !== 'collection' && p.type !== 'fixedCollection'
      ? ' options=' + p.options.map((o) => o.value ?? o.name).join('|') : '';
    const shown = p.displayOptions ? ' show=' + JSON.stringify(p.displayOptions.show || p.displayOptions.hide) : '';
    const hint = p.builderHint && (p.builderHint.propertyHint || p.builderHint.message);
    console.log(`${indent}${p.name}: ${p.type} default=${JSON.stringify(p.default)}${opts}${shown}${hint ? `  // hint: ${String(hint).replace(/\s+/g, ' ').slice(0, 300)}` : ''}`);
    if (p.type === 'collection') show(p.options, indent + '  ');
    if (p.type === 'fixedCollection') for (const o of p.options || []) { console.log(`${indent}  [${o.name}]`); show(o.values, indent + '    '); }
  }
}
show(desc.properties, '');
