const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { sha256Hex } = require('../src/hash');

const ref = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

test('known vectors (FIPS 180-4)', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('matches node:crypto on padding boundaries, unicode and long input', () => {
  const cases = ['é', '日本語のCV', '👩🏽‍💼 support', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(63), 'x'.repeat(64), 'x'.repeat(10_000)];
  for (let i = 0; i < 200; i++) cases.push(crypto.randomBytes(i).toString('base64'));
  for (const s of cases) assert.equal(sha256Hex(s), ref(s), JSON.stringify(s.slice(0, 20)));
});
