// Removes identity and contact details from CV text before any LLM sees it (fairness, C-20).
// The model scores job-relevant evidence only; it never sees a name, email, phone, link or address.
// Pure; bundled into WF-10. Quotes the model returns come from the REDACTED text, so the evidence
// check (src/evidence.js) must verify against the same redacted text.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL = /\b(?:https?:\/\/|www\.)\S+|\b(?:linkedin|github)\.com\/\S+/gi;
// Phone-like: 7+ digits with optional +, spaces, dots, dashes, parentheses. Years ("2021–2023") are too short to match.
const PHONE = /(?:\+?\d[\d\s().-]{6,}\d)/g;
const STREET = /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Boulevard|Blvd|Drive|Dr|Court|Ct|Way)\b\.?/g;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Replaces each name token in Title Case and UPPER CASE only, so ordinary lowercase words
// that happen to equal a surname ("grant writing") survive.
function replaceName(text, name) {
  if (!name) return { text, count: 0 };
  const tokens = [name, ...String(name).split(/\s+/)].map((t) => t.trim()).filter((t) => t.length >= 2);
  let count = 0;
  let out = text;
  for (const t of tokens.sort((a, b) => b.length - a.length)) {
    for (const form of new Set([t, t.toUpperCase(), t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()])) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(form)}(?![\\p{L}\\p{N}])`, 'gu');
      out = out.replace(re, () => { count++; return '[CANDIDATE]'; });
    }
  }
  return { text: out, count };
}

function redact(text, candidate = {}) {
  const counts = { name: 0, email: 0, phone: 0, url: 0, address: 0, location: 0 };
  let out = String(text || '');
  out = out.replace(EMAIL, () => { counts.email++; return '[EMAIL]'; });
  out = out.replace(URL, () => { counts.url++; return '[URL]'; });
  out = out.replace(PHONE, (m) => {
    // Keep things like "2021-2023" or "99.5%": a phone has at least 7 digits.
    if ((m.match(/\d/g) || []).length < 7) return m;
    counts.phone++;
    return '[PHONE]';
  });
  out = out.replace(STREET, () => { counts.address++; return '[ADDRESS]'; });
  const named = replaceName(out, candidate.name);
  out = named.text;
  counts.name = named.count;
  if (candidate.location) {
    const re = new RegExp(`(?<![\\p{L}])${escapeRe(candidate.location)}(?![\\p{L}])`, 'gu');
    out = out.replace(re, () => { counts.location++; return '[LOCATION]'; });
  }
  // The header line is now only placeholders and separators: drop it entirely.
  out = out.split('\n').filter((line) => !/^\s*(?:\[(?:CANDIDATE|EMAIL|PHONE|URL|ADDRESS|LOCATION)\]\s*[|,•·-]?\s*)+$/.test(line)).join('\n').trim();
  return { text: out, counts };
}

module.exports = { redact };
