// Adapters: every intake path becomes one ApplicationReceived (contracts/application_received.schema.json).
// Pure functions. Bundled into the WF-01 and WF-02 Code nodes (D-014).
const { textSha256 } = require('./text');

const SCHEMA_VERSION = '1.0.0';

function cleanText(t) {
  return String(t == null ? '' : t)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\u0000/g, '')
    .trim();
}

function toIsoUtc(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid timestamp: ${value}`);
  return d.toISOString();
}

// Form answers: trim strings, drop empty ones, keep arrays of strings. Keys stay as the form named them.
function cleanAnswers(answers) {
  if (answers === null || answers === undefined) return null;
  const out = {};
  for (const [k, v] of Object.entries(answers)) {
    if (Array.isArray(v)) out[k] = v.map((x) => String(x).trim()).filter(Boolean);
    else if (typeof v === 'string') { if (v.trim() !== '') out[k] = v.trim(); }
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

function buildCv({ text, filename = null, mime = null, extraction_method = 'provided_text', extraction_error = null }) {
  const clean = cleanText(text);
  return {
    text: clean,
    filename,
    mime,
    sha256: textSha256(clean),
    extraction_method,
    extraction_error: extraction_error || (clean === '' && extraction_method !== 'none' ? 'EMPTY_TEXT' : null),
    char_count: clean.length,
  };
}

// CRM record (GET /candidates/:id, or the application inside the application.created webhook).
function fromCrmRecord(rec) {
  if (!rec || !rec.application_id) throw new Error('not a CRM application record: application_id missing');
  const cv = buildCv(rec.cv || {});
  return {
    schema_version: SCHEMA_VERSION,
    application_id: rec.application_id,
    source: rec.source === 'email' ? 'email' : 'crm',
    received_at: toIsoUtc(rec.created_at),
    job_id: rec.job_id || null,
    candidate: {
      name: rec.candidate && rec.candidate.name ? rec.candidate.name : null,
      email: rec.candidate && rec.candidate.email ? String(rec.candidate.email).trim().toLowerCase() : null,
      phone: (rec.candidate && rec.candidate.phone) || null,
      location: (rec.candidate && rec.candidate.location) || null,
    },
    answers: cleanAnswers(rec.answers),
    cv,
    idempotency_key: rec.idempotency_key || `${rec.application_id}:${cv.sha256.slice(0, 12)}`,
    source_ref: rec.source_ref || null,
    duplicate_of: rec.duplicate_of || null,
  };
}

// Email: route by plus-address (applications+<job>@domain). Returns null when it can't be routed.
function jobFromAddress(addresses, knownJobs) {
  for (const a of [].concat(addresses || [])) {
    const m = String(a).toLowerCase().match(/[a-z0-9._-]+\+([a-z][a-z0-9_-]{1,31})@/);
    if (m && knownJobs.includes(m[1])) return m[1];
  }
  return null;
}

// "Name <email@x>" → { name, email }
function parseFrom(from) {
  const s = String(from || '').trim();
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  return { name: null, email: s.includes('@') ? s.toLowerCase() : null };
}

module.exports = { SCHEMA_VERSION, cleanText, cleanAnswers, buildCv, fromCrmRecord, jobFromAddress, parseFrom };
