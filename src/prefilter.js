// Boolean pre-filter (brief §5.1, D-016). Deterministic, explainable, three-valued.
//
// Every node evaluates to true, false or UNKNOWN (missing data):
//   all: false if any child is false; else unknown if any is unknown; else true
//   any: true if any child is true;  else unknown if any is unknown; else false
//   not: swaps true and false; unknown stays unknown
// Outcome: true → pass · false → fail (reason codes) · unknown → review (cause codes).
// A fail always wins over unknown: missing answers can't rescue a CV with no relevant experience.
const { SCHEMA_VERSION } = require('./normalize');

const UNKNOWN = 'unknown';

// Why a check couldn't decide (reported when the outcome is review).
const CAUSE = {
  UNREADABLE_CV: 'UNREADABLE_CV',
  NON_ENGLISH_CV: 'NON_ENGLISH_CV',
  MISSING_ANSWER: 'MISSING_ANSWER',
  INVALID_ANSWER: 'INVALID_ANSWER',
};

// Kleene logic on true / false / 'unknown'.
function kleeneAnd(values) {
  if (values.includes(false)) return false;
  return values.includes(UNKNOWN) ? UNKNOWN : true;
}
function kleeneOr(values) {
  if (values.includes(true)) return true;
  return values.includes(UNKNOWN) ? UNKNOWN : false;
}
function kleeneNot(v) {
  return v === UNKNOWN ? UNKNOWN : !v;
}

// ---------------------------------------------------------------- text helpers
// Letters and digits only, lowercase, single spaces: "CUSTOMER-SERVICE" and "Customer•Support" match.
function words(s) {
  return ' ' + String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
}

// Whole-word (or whole-phrase) match, allowing a plural "s"/"es" on the last word.
// "cold calls" matches "cold call"; "retailer" does NOT match "retail"; "Salesforce" does NOT match "sales".
function containsTerm(normalizedText, term) {
  const t = words(term).trim();
  if (!t) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(` ${escaped}(?:s|es)? `, 'u').test(normalizedText);
}

const EN = new Set(['the', 'and', 'to', 'of', 'in', 'for', 'with', 'on', 'at', 'by', 'from', 'my', 'i', 'was', 'were', 'is', 'as', 'an', 'per', 'over', 'team', 'customers', 'experience']);
const OTHER = new Set(['de', 'la', 'el', 'y', 'en', 'con', 'para', 'los', 'las', 'del', 'por', 'una', 'que', 'experiencia', // es
  'et', 'le', 'les', 'des', 'du', 'pour', 'avec', 'dans', 'une', 'est', // fr
  'do', 'da', 'com', 'em', 'os', 'uma', 'na', 'no', 'experiência', // pt
  'und', 'der', 'die', 'mit', 'für', 'ich', 'ein', 'eine', 'zu', 'im']); // de

// Rough language check from common function words. Short texts count as English (can't tell).
function isLikelyEnglish(text) {
  const toks = words(text).trim().split(' ').filter(Boolean);
  if (toks.length < 30) return true;
  let en = 0;
  let other = 0;
  for (const t of toks) { if (EN.has(t)) en++; else if (OTHER.has(t)) other++; }
  return en >= other;
}

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions|prompts?|rules)/i,
  /disregard\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions|prompts?|rules)/i,
  /note\s+to\s+(?:the\s+)?(?:ai|llm|model|gpt|chatgpt|claude|gemini|(?:ai\s+)?reviewer|screening\s+(?:bot|system))/i,
  /\b(?:give|rate|score|assign)\s+(?:this|the|me|him|her|them)\s+(?:candidate\s+|applicant\s+)?(?:a\s+|the\s+)?(?:maximum|max|highest|top|perfect|full)\s+(?:score|marks|rating|points)/i,
  /\bmark\s+(?:this\s+(?:candidate|applicant)\s+|me\s+)?as\s+shortlisted\b/i,
  /^\s*\[?\s*(?:system|assistant)\s*\]?\s*:/im,
  /you\s+are\s+now\s+(?:a|an|the)\s+/i,
];

function injectionSuspected(text) {
  return INJECTION_PATTERNS.some((re) => re.test(String(text || '')));
}

// ---------------------------------------------------------------- the registry
// The ONLY checks a profile may use. The schema enum lists the same names (tests enforce it).
const get = (obj, dotPath) => dotPath.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
const isMissing = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const sameText = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const cvUnreadable = (app) => Boolean(app.cv.extraction_error) || app.cv.text.trim() === '';

function answerOrUnknown(app, field) {
  // answers === null means the applicant never filled the form (e.g. email): unknown, not a "no".
  if (field.startsWith('answers.') && (app.answers === null || app.answers === undefined)) return { unknown: CAUSE.MISSING_ANSWER };
  const v = get(app, field);
  if (isMissing(v)) return { unknown: CAUSE.MISSING_ANSWER };
  return { value: v };
}

const CHECKS = {
  cv_text_min_chars(app, leaf) {
    if (cvUnreadable(app)) return { result: UNKNOWN, cause: CAUSE.UNREADABLE_CV };
    return { result: app.cv.text.trim().length >= leaf.value };
  },
  keyword(app, leaf) {
    const field = leaf.field || 'cv.text';
    if (field === 'cv.text') {
      if (cvUnreadable(app)) return { result: UNKNOWN, cause: CAUSE.UNREADABLE_CV };
      if (!isLikelyEnglish(app.cv.text)) return { result: UNKNOWN, cause: CAUSE.NON_ENGLISH_CV };
    }
    const a = field === 'cv.text' ? { value: app.cv.text } : answerOrUnknown(app, field);
    if (a.unknown) return { result: UNKNOWN, cause: a.unknown };
    const text = words(Array.isArray(a.value) ? a.value.join(' ') : a.value);
    const hit = leaf.terms.find((t) => containsTerm(text, t));
    return { result: Boolean(hit), matched: hit || null };
  },
  field_present(app, leaf) {
    if (leaf.field.startsWith('answers.') && (app.answers === null || app.answers === undefined)) return { result: UNKNOWN, cause: CAUSE.MISSING_ANSWER };
    return { result: !isMissing(get(app, leaf.field)) };
  },
  field_equals(app, leaf) {
    const a = answerOrUnknown(app, leaf.field);
    if (a.unknown) return { result: UNKNOWN, cause: a.unknown };
    if (typeof leaf.value === 'string') return { result: sameText(a.value, leaf.value) };
    return { result: a.value === leaf.value };
  },
  field_includes(app, leaf) {
    const a = answerOrUnknown(app, leaf.field);
    if (a.unknown) return { result: UNKNOWN, cause: a.unknown };
    if (Array.isArray(a.value)) return { result: a.value.some((x) => sameText(x, leaf.value)) };
    return { result: containsTerm(words(a.value), String(leaf.value)) };
  },
  number_gte(app, leaf) {
    const a = answerOrUnknown(app, leaf.field);
    if (a.unknown) return { result: UNKNOWN, cause: a.unknown };
    const n = typeof a.value === 'number' ? a.value : Number(String(a.value).trim());
    if (!Number.isFinite(n)) return { result: UNKNOWN, cause: CAUSE.INVALID_ANSWER };
    return { result: n >= leaf.value };
  },
  // "Is this a business duplicate?" (same person, same job, earlier application: D-016).
  duplicate(app) {
    return { result: Boolean(app.duplicate_of) };
  },
};
const CHECK_NAMES = Object.keys(CHECKS);

// ---------------------------------------------------------------- evaluation
const defaultReason = (check) => `FAILED_${check.toUpperCase()}`;
const uniq = (a) => [...new Set(a)];

// Returns { result, reasons (why false), causes (why unknown) } and appends to trace.
function evalNode(node, app, path, trace) {
  if (node.all || node.any) {
    const kind = node.all ? 'all' : 'any';
    const kids = node[kind].map((child, i) => evalNode(child, app, `${path}${path ? '.' : ''}${kind}[${i}]`, trace));
    const result = (kind === 'all' ? kleeneAnd : kleeneOr)(kids.map((k) => k.result));
    const reasons = result === false ? (node.reason ? [node.reason] : uniq(kids.filter((k) => k.result === false).flatMap((k) => k.reasons))) : [];
    const causes = result === UNKNOWN ? uniq(kids.filter((k) => k.result === UNKNOWN).flatMap((k) => k.causes)) : [];
    trace.push({ path: path || kind, node: kind, result, ...(node.reason ? { reason: node.reason } : {}) });
    return { result, reasons, causes };
  }
  if (node.not) {
    const kid = evalNode(node.not, app, `${path}${path ? '.' : ''}not`, trace);
    const result = kleeneNot(kid.result);
    const reasons = result === false ? [node.reason || `NOT_${(node.not.check || 'GROUP').toUpperCase()}`] : [];
    trace.push({ path: path || 'not', node: 'not', result, ...(node.reason ? { reason: node.reason } : {}) });
    return { result, reasons, causes: result === UNKNOWN ? kid.causes : [] };
  }
  const fn = CHECKS[node.check];
  if (!fn) {
    const err = new Error(`unknown pre-filter check "${node.check}" at ${path || 'root'}: only ${CHECK_NAMES.join(', ')} are allowed`);
    err.code = 'UNKNOWN_CHECK';
    throw err;
  }
  const out = fn(app, node);
  const reason = node.reason || defaultReason(node.check);
  trace.push({ path: path || 'root', node: node.check, result: out.result, ...(out.result === UNKNOWN ? { reason: out.cause } : { reason }) });
  return { result: out.result, reasons: out.result === false ? [reason] : [], causes: out.result === UNKNOWN ? [out.cause] : [] };
}

// application: ApplicationReceived · profile: an approved JobProfile → PrefilterResult
function evaluate(application, profile, { now = () => new Date().toISOString() } = {}) {
  const trace = [];
  const root = evalNode(profile.prefilter, application, '', trace);
  const flags = [];
  if (injectionSuspected(application.cv.text)) flags.push('INJECTION_SUSPECTED');

  let outcome = root.result === true ? 'pass' : root.result === false ? 'fail' : 'review';
  let reasonCodes = outcome === 'fail' ? root.reasons : outcome === 'review' ? root.causes : [];
  // A suspected injection never reaches the model unreviewed. A deterministic fail stays a fail.
  if (flags.includes('INJECTION_SUSPECTED') && outcome !== 'fail') {
    outcome = 'review';
    reasonCodes = uniq([...reasonCodes, 'INJECTION_SUSPECTED']);
  }

  return {
    schema_version: SCHEMA_VERSION,
    application_id: application.application_id,
    job_id: profile.job_id,
    job_profile_version: profile.version,
    outcome,
    reason_codes: reasonCodes,
    flags,
    trace,
    evaluated_at: now(),
  };
}

module.exports = {
  evaluate, CHECKS, CHECK_NAMES, CAUSE, UNKNOWN, kleeneAnd, kleeneOr, kleeneNot,
  containsTerm, words, isLikelyEnglish, injectionSuspected,
};
