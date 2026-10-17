// Text helpers shared by the evidence check (CV quotes) and the job-profile check (JD quotes).
// Pure functions: no I/O, safe to inline into n8n Code nodes.
const { sha256Hex } = require('./hash');

// Lowercase, unify quotes and dashes, collapse whitespace. Used on BOTH sides of a comparison,
// so "Handled  60 calls/day" in a quote still matches "handled 60 calls/day" in the CV.
function normalizeForMatch(s) {
  return String(s == null ? '' : s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[•▪●]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// True when `quote` appears in `source` after normalizing both. Trailing punctuation on the
// quote is ignored, because models often add or drop a final period.
function containsQuote(source, quote) {
  const q = normalizeForMatch(quote).replace(/[\s.,;:!?]+$/, '');
  if (q.length < 3) return false;
  return normalizeForMatch(source).includes(q);
}

// Fingerprint of a CV's content: whitespace and case changes don't change it. Used in idempotency keys.
function textSha256(s) {
  return sha256Hex(normalizeForMatch(s));
}

module.exports = { normalizeForMatch, containsQuote, textSha256 };
