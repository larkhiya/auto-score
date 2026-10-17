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

  // n8n 2.x refuses to publish, or even update, a published workflow while a sub-workflow it calls
  // is unpublished. So work in dependency order: each sub-workflow is updated AND published
  // before anything that calls it. Workflows to unpublish are handled first, dependents first.
  const plan = publishOrder(portables.map(({ file, p }) => ({ file, p, name: p.name, id: workflowIdByName[p.name], published: Boolean(p.published), deps: dependencies(p) })));
  for (const r of plan.filter((x) => !x.published).reverse()) {
    const current = await api.getWorkflow(r.id);
    if (current.active) { await api.unpublishWorkflow(r.id); console.log(`unpublished ${r.name}`); }
  }
  for (const r of plan) {
    const { body, unresolved } = fromPortable(r.p, { workflowIdByName, credentialIdByTypeAndName });
    if (unresolved.length) console.warn(`warning  ${r.name}: unresolved ${unresolved.join(', ')}`);
    try {
      await api.updateWorkflow(r.id, body);
    } catch (e) {
      // Right after publishing a dependency, n8n can still report it as unpublished for a moment.
      if (!/no published version|not published/i.test(e.message)) throw e;
      await new Promise((res) => setTimeout(res, 2000));
      await api.updateWorkflow(r.id, body);
    }
    let note = '';
    if (r.published) { await api.publishWorkflow(r.id); note = ' · published'; }
    console.log(`updated  ${r.name} (${r.id})${note}  ← ${path.relative(ROOT, r.file)}`);
  }
  return plan.map(({ name, id, published }) => ({ name, id, published }));
}

// Names of workflows this one calls (Execute Workflow nodes) or uses as its error workflow.
function dependencies(p) {
  const refs = new Set();
  const NAME = '@name:';
  for (const n of p.nodes) {
    const w = n.parameters && n.parameters.workflowId;
    const v = w && typeof w === 'object' ? w.value : w;
    if (typeof v === 'string' && v.startsWith(NAME)) refs.add(v.slice(NAME.length));
  }
  const ew = p.settings && p.settings.errorWorkflow;
  if (typeof ew === 'string' && ew.startsWith(NAME)) refs.add(ew.slice(NAME.length));
  refs.delete(p.name);
  return [...refs];
}

// Topological order: every workflow comes after the workflows it calls.
function publishOrder(results) {
  const byName = Object.fromEntries(results.map((r) => [r.name, r]));
  const ordered = [];
  const seen = new Set();
  const visit = (r) => {
    if (seen.has(r.name)) return;
    seen.add(r.name);
    for (const d of r.deps) if (byName[d]) visit(byName[d]);
    ordered.push(r);
  };
  results.forEach(visit);
  return ordered;
}

if (require.main === module) {
  importFiles(listFiles(process.argv.slice(2))).catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { importFiles };
