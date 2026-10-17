#!/usr/bin/env node
// Imports portable workflow files into n8n, matching existing workflows by name.
//   node scripts/n8n-import.js                    → every workflows/*.json
//   node scripts/n8n-import.js workflows/00-hello-items.json [...]
//   --dir DIR                                    → every *.json in DIR
// Pass 1 creates any missing workflows (so cross-references can resolve to IDs).
// Pass 2 PUTs full bodies, then publishes or unpublishes to match each file's `published` flag.
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./lib/env');
const { client } = require('./lib/n8n-api');
const { fromPortable } = require('./lib/workflow-portable');

function listFiles(args) {
  const i = args.indexOf('--dir');
  if (i > -1) {
    const dir = path.resolve(args[i + 1]);
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(dir, f));
  }
  const explicit = args.filter((a) => a.endsWith('.json'));
  if (explicit.length) return explicit.map((f) => path.resolve(f));
  const dir = path.join(ROOT, 'workflows');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(dir, f));
}

async function importFiles(files) {
  const api = client();
  const portables = files.map((f) => ({ file: f, p: JSON.parse(fs.readFileSync(f, 'utf8')) }));

  const existing = (await api.listWorkflows()).filter((w) => !w.isArchived);
  const workflowIdByName = Object.fromEntries(existing.map((w) => [w.name, w.id]));
  const dupes = existing.map((w) => w.name).filter((n, i, a) => a.indexOf(n) !== i);
  if (dupes.length) throw new Error(`Ambiguous: several workflows share a name: ${[...new Set(dupes)].join(', ')}`);

  const credentials = await api.listCredentials();
  const credentialIdByTypeAndName = Object.fromEntries(credentials.map((c) => [`${c.type}:${c.name}`, c.id]));

  // Pass 1: placeholders for new workflows.
  for (const { p } of portables) {
    if (!workflowIdByName[p.name]) {
      const created = await api.createWorkflow({ name: p.name, nodes: [], connections: {}, settings: {} });
      workflowIdByName[p.name] = created.id;
      console.log(`created  ${p.name} (${created.id})`);
    }
  }

  // Pass 2: full bodies, then publish state.
  const results = [];
  for (const { file, p } of portables) {
    const id = workflowIdByName[p.name];
    const { body, published, unresolved } = fromPortable(p, { workflowIdByName, credentialIdByTypeAndName });
    if (unresolved.length) console.warn(`warning  ${p.name}: unresolved ${unresolved.join(', ')}`);
    await api.updateWorkflow(id, body);
    if (published) await api.publishWorkflow(id);
    else {
      const current = await api.getWorkflow(id);
      if (current.active) await api.unpublishWorkflow(id);
    }
    console.log(`updated  ${p.name} (${id})${published ? ' · published' : ''}  ← ${path.relative(ROOT, file)}`);
    results.push({ name: p.name, id, published });
  }
  return results;
}

if (require.main === module) {
  importFiles(listFiles(process.argv.slice(2))).catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { importFiles };
