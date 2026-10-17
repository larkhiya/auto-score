// Contract tests: every valid fixture passes, every invalid fixture fails with the expected error.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validate, CONTRACTS, CONTRACTS_DIR } = require('../src/validate');

const FIX = path.join(CONTRACTS_DIR, 'fixtures');
const load = (dir) => fs.readdirSync(path.join(FIX, dir)).filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(FIX, dir, f), 'utf8')) }));

test('all seven contracts compile and carry a schema_version', () => {
  assert.equal(CONTRACTS.length, 7);
  for (const name of CONTRACTS) {
    const schema = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, `${name}.schema.json`), 'utf8'));
    assert.ok(schema.required.includes('schema_version'), `${name} must require schema_version`);
    validate(name, {}); // compiles
  }
});

test('every contract has at least one valid and one invalid fixture', () => {
  const v = new Set(load('valid').map((f) => f.contract));
  const i = new Set(load('invalid').map((f) => f.contract));
  for (const name of CONTRACTS) {
    assert.ok(v.has(name), `no valid fixture for ${name}`);
    assert.ok(i.has(name), `no invalid fixture for ${name}`);
  }
});

for (const fx of load('valid')) {
  test(`valid: ${fx.file} (${fx.description})`, () => {
    const { valid, errors } = validate(fx.contract, fx.data);
    assert.ok(valid, JSON.stringify(errors, null, 2));
  });
}

for (const fx of load('invalid')) {
  test(`invalid: ${fx.file} (${fx.description})`, () => {
    const { valid, errors } = validate(fx.contract, fx.data);
    assert.equal(valid, false, 'expected the fixture to be rejected');
    const hit = errors.some((e) => e.path === fx.expect.path && e.keyword === fx.expect.keyword);
    assert.ok(hit, `expected ${fx.expect.keyword} at ${fx.expect.path}, got:\n${errors.map((e) => `${e.keyword} ${e.path}`).join('\n')}`);
  });
}
