// D-014: src/ runs inside n8n Code nodes through a generated bundle. These tests prove the bundle
// works with NO require/module available (like the n8n sandbox) and that nothing has drifted.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { bundle } = require('../scripts/lib/bundle');
const { scan } = require('../scripts/build-workflows');
const { build: buildValidators } = require('../scripts/build-validators');

const ROOT = path.resolve(__dirname, '..');
const csr = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/jobs/csr.v1.json'), 'utf8'));

// Runs bundle + glue in a bare context: no require, no module, no process. Glue `return`s a value.
function runInSandbox(entries, glue, globals = {}) {
  const code = `(() => {\n${bundle(entries)}\n${glue}\n})()`;
  return vm.runInNewContext(code, { ...globals });
}

test('bundled src runs without require/module (n8n sandbox conditions)', () => {
  const out = runInSandbox(['./jobprofile'], `
    const { checkProfile } = __require('./jobprofile');
    return checkProfile(profile);
  `, { profile: csr });
  assert.equal(out.ok, true);
});

test('bundled standalone validator accepts a valid profile and rejects an invalid one', () => {
  const out = runInSandbox(['./generated/validators/job_profile'], `
    const v = __require('./generated/validators/job_profile');
    const good = v(profile);
    const bad = v({ job_id: 'x' });
    return { good, bad, firstError: v.errors && v.errors[0] };
  `, { profile: JSON.parse(JSON.stringify(csr)) });
  assert.equal(out.good, true);
  assert.equal(out.bad, false);
  assert.ok(out.firstError);
});

test('bundling code that needs Node built-ins fails loudly', () => {
  assert.throws(() => bundle(['./validate']), /can't run inside an n8n Code node/);
});

test('generated validators match the current contracts (no drift)', () => {
  const files = buildValidators();
  for (const [file, code] of Object.entries(files)) {
    const onDisk = fs.readFileSync(path.join(ROOT, 'src/generated/validators', file), 'utf8');
    assert.equal(onDisk, code, `${file} is stale: run npm run build`);
  }
});

test('every @bundle block in workflows/ matches the current src (no drift)', () => {
  assert.deepEqual(scan({ write: false }), [], 'stale bundles: run npm run build');
});
