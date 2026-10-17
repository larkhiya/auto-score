// A tiny CommonJS bundler for n8n Code nodes (D-014).
// n8n runs Code nodes in a sandbox that can't load our files, so we paste the modules in.
// bundle(['./normalize']) returns JS source that defines `__require(id)`, which works like
// `require` for every module reachable from the entries. src/ stays plain, testable CommonJS.
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..', '..', 'src');
const NODE_MODULES = path.resolve(__dirname, '..', '..', 'node_modules');
// The only third-party code allowed into a Code node: Ajv's string-length helper used by
// the generated validators. Anything else is a build error, not a silent omission.
const ALLOWED_PACKAGES = ['ajv/dist/runtime/ucs2length'];

// Module id: "./text", "./generated/validators/score_card", or an allowed package path.
function resolve(request, fromId) {
  if (request.startsWith('.')) {
    const fromDir = fromId.includes('/') ? path.posix.dirname(fromId) : '.';
    let id = path.posix.normalize(path.posix.join(fromDir, request)).replace(/\.js$/, '');
    if (!id.startsWith('.')) id = './' + id;
    return id;
  }
  if (ALLOWED_PACKAGES.includes(request)) return request;
  throw new Error(`"${fromId}" requires "${request}", which can't run inside an n8n Code node. Only src/ modules and ${ALLOWED_PACKAGES.join(', ')} can be bundled.`);
}

function fileFor(id) {
  return id.startsWith('./') ? path.join(SRC, id.slice(2) + '.js') : path.join(NODE_MODULES, id + '.js');
}

function collect(entries) {
  const modules = new Map();
  const visit = (id) => {
    if (modules.has(id)) return;
    const file = fileFor(id);
    if (!fs.existsSync(file)) throw new Error(`bundle: module ${id} not found (${file})`);
    const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    modules.set(id, source);
    for (const m of source.matchAll(/require\((['"])([^'"]+)\1\)/g)) {
      if (m[2] === 'node:test' || m[2] === 'node:assert/strict') continue;
      visit(resolve(m[2], id));
    }
  };
  entries.forEach((e) => visit(resolve(e, '.')));
  return modules;
}

function bundle(entries) {
  const modules = collect(entries);
  const defs = [...modules.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, source]) =>
    `  ${JSON.stringify(id)}: function (module, exports, require) {\n${source.trimEnd()}\n  },`);
  return [
    'const __require = (() => {',
    '  const defs = {',
    ...defs,
    '  };',
    '  const cache = {};',
    '  const resolve = (from, req) => {',
    "    if (!req.startsWith('.')) return req;",
    "    const parts = (from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '.').split('/');",
    "    for (const seg of req.replace(/\\.js$/, '').split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }",
    "    const id = parts.join('/');",
    "    return id.startsWith('.') ? id : './' + id;",
    '  };',
    '  const load = (id) => {',
    '    if (cache[id]) return cache[id].exports;',
    "    if (!defs[id]) throw new Error('bundled module not found: ' + id);",
    '    const module = { exports: {} };',
    '    cache[id] = module;',
    '    defs[id](module, module.exports, (req) => load(resolve(id, req)));',
    '    return module.exports;',
    '  };',
    "  return (req) => load(resolve('./x', req));",
    '})();',
  ].join('\n');
}

const BEGIN = /^\/\/ @bundle-begin (.+)$/m;
const BLOCK = /\/\/ @bundle-begin ([^\n]+)\n[\s\S]*?\n\/\/ @bundle-end/;

// Rewrites the @bundle block inside one jsCode string. Returns the new code (unchanged if no marker).
function rebuildCode(jsCode) {
  const m = jsCode.match(BEGIN);
  if (!m) return jsCode;
  const entries = m[1].trim().split(/\s+/);
  const block = `// @bundle-begin ${entries.join(' ')}\n// GENERATED from src/ by scripts/build-workflows.js. Edit src/, then run npm run build. Do not edit here.\n${bundle(entries)}\n// @bundle-end`;
  if (BLOCK.test(jsCode)) return jsCode.replace(BLOCK, () => block);
  // A bare begin marker (new node): insert the block in its place.
  return jsCode.replace(BEGIN, () => block);
}

module.exports = { bundle, rebuildCode, collect, ALLOWED_PACKAGES };
