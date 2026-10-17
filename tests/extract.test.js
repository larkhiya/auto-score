const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip'); // dev only: ships with the docx package
const { docxXmlToText, extractionResult } = require('../src/extract');

test('a real DOCX (data/email_samples) converts back to its text', async () => {
  const buf = fs.readFileSync(path.join(__dirname, '..', 'data', 'email_samples', 'sdr_medium.docx'));
  const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');
  const text = docxXmlToText(xml);
  assert.match(text, /^[A-Z]+ [A-Z]+\n/, 'name line first');
  assert.match(text, /EXPERIENCE\n/);
  assert.ok(text.split('\n').length > 10, 'one line per paragraph');
  assert.ok(!/<w:/.test(text), 'no XML left');
});

test('entities, tabs and breaks', () => {
  assert.equal(docxXmlToText('<w:p><w:r><w:t>R&amp;D &lt;team&gt;</w:t><w:tab/><w:t>x</w:t></w:r></w:p><w:p><w:t>a</w:t><w:br/><w:t>b</w:t></w:p>'), 'R&D <team>\tx\na\nb');
});

test('one result shape for every branch', () => {
  assert.deepEqual(extractionResult({ kind: 'pdf', text: '  CV text ' }), { text: 'CV text', extraction_method: 'pdf_text', extraction_error: null });
  assert.equal(extractionResult({ kind: 'pdf', text: '   ' }).extraction_error, 'NO_TEXT_LAYER');
  assert.equal(extractionResult({ kind: 'docx', text: '' }).extraction_error, 'EMPTY_TEXT');
  assert.equal(extractionResult({ kind: 'none' }).extraction_error, 'NO_ATTACHMENT');
  assert.equal(extractionResult({ kind: 'unsupported' }).extraction_error, 'UNSUPPORTED_TYPE');
  assert.equal(extractionResult({ kind: 'pdf', failed: true }).extraction_error, 'EXTRACTION_FAILED');
});
