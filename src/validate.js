// Validates data against the contracts in contracts/*.schema.json (JSON Schema 2020-12, Ajv).
// Used by tests, scripts and the CRM. Inside n8n, validators are compiled to standalone code
// (see scripts/build-validators.js) because Code nodes can't load local files.
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');

const CONTRACTS_DIR = path.resolve(__dirname, '..', 'contracts');

function createAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true, strictRequired: false });
  for (const file of fs.readdirSync(CONTRACTS_DIR).filter((f) => f.endsWith('.schema.json'))) {
    ajv.addSchema(JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, file), 'utf8')), file);
  }
  return ajv;
}

let ajv;
const cache = new Map();

// name: "job_profile", "application_received", ... (the file name without .schema.json)
function getValidator(name) {
  if (!ajv) ajv = createAjv();
  if (!cache.has(name)) {
    const fn = ajv.getSchema(`${name}.schema.json`);
    if (!fn) throw new Error(`Unknown contract "${name}"`);
    cache.set(name, fn);
  }
  return cache.get(name);
}

function formatErrors(errors) {
  return (errors || [])
    // `if` failures only say "must match then schema"; the useful error is the one inside `then`.
    .filter((e) => e.keyword !== 'if')
    .map((e) => ({ path: e.instancePath || '/', keyword: e.keyword, message: e.message, params: e.params }));
}

function validate(name, data) {
  const fn = getValidator(name);
  const valid = fn(data);
  return { valid, errors: valid ? [] : formatErrors(fn.errors) };
}

function assertValid(name, data) {
  const { valid, errors } = validate(name, data);
  if (!valid) {
    const detail = errors.slice(0, 5).map((e) => `${e.path} ${e.message}`).join('; ');
    const err = new Error(`${name} contract violation: ${detail}`);
    err.code = 'CONTRACT_VIOLATION';
    err.errors = errors;
    throw err;
  }
  return data;
}

const CONTRACTS = fs.readdirSync(CONTRACTS_DIR)
  .filter((f) => f.endsWith('.schema.json') && f !== 'common.schema.json')
  .map((f) => f.replace('.schema.json', ''));

module.exports = { validate, assertValid, getValidator, CONTRACTS, CONTRACTS_DIR };
