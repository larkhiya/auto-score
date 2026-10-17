// Text extraction helpers for email attachments (C-11). Pure; bundled into WF-02.
// n8n's Extract From File reads PDF and plain text but not DOCX. A DOCX is a zip whose
// word/document.xml holds the text: WF-02 unzips it (Compression node) and calls docxXmlToText.

function decodeEntities(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function docxXmlToText(xml) {
  return decodeEntities(String(xml || '')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// One result shape for every branch of WF-02. A file with no readable text is not an error in
// the workflow: it becomes a record the pre-filter sends to review (UNREADABLE_CV).
function extractionResult({ kind, text = '', failed = false }) {
  if (kind === 'none') return { text: '', extraction_method: 'none', extraction_error: 'NO_ATTACHMENT' };
  if (kind === 'unsupported') return { text: '', extraction_method: 'none', extraction_error: 'UNSUPPORTED_TYPE' };
  const method = { pdf: 'pdf_text', text: 'plain_text', docx: 'docx' }[kind];
  if (failed) return { text: '', extraction_method: method, extraction_error: 'EXTRACTION_FAILED' };
  const clean = String(text || '').trim();
  if (!clean) return { text: '', extraction_method: method, extraction_error: kind === 'pdf' ? 'NO_TEXT_LAYER' : 'EMPTY_TEXT' };
  return { text: clean, extraction_method: method, extraction_error: null };
}

module.exports = { docxXmlToText, extractionResult, decodeEntities };
