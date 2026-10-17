// Candidate and job-profile state machines (D-018). Pure: the API and the UI both go through here.
//
// Candidate:
//   NEW ──► SCREENING ──► SHORTLISTED | MAYBE | NOT_A_FIT | NEEDS_REVIEW | PREFILTER_REJECTED
//    │          └──► ERROR ──(replay)──► SCREENING
//    ├──► PREFILTER_REJECTED | NEEDS_REVIEW | ERROR    (decided before scoring starts)
//   AI outcomes ──(human)──► ADVANCED | REJECTED       (final decisions are human-only)
//   AI outcomes ──► SCREENING                          (re-screen, e.g. a new profile version)
//
// Actor matters: the automation API key can never set ADVANCED or REJECTED.

const A = 'automation';
const H = 'human';

const AI_OUTCOMES = ['SHORTLISTED', 'MAYBE', 'NOT_A_FIT', 'PREFILTER_REJECTED'];
const TERMINAL = ['ADVANCED', 'REJECTED'];

const CANDIDATE_TRANSITIONS = {
  NEW: { SCREENING: [A], PREFILTER_REJECTED: [A], NEEDS_REVIEW: [A, H], ERROR: [A] },
  SCREENING: { SHORTLISTED: [A], MAYBE: [A], NOT_A_FIT: [A], NEEDS_REVIEW: [A], PREFILTER_REJECTED: [A], ERROR: [A] },
  ERROR: { SCREENING: [A, H], NEEDS_REVIEW: [A, H] },
  NEEDS_REVIEW: { SCREENING: [A, H], ADVANCED: [H], REJECTED: [H] },
  SHORTLISTED: { SCREENING: [A, H], ADVANCED: [H], REJECTED: [H] },
  MAYBE: { SCREENING: [A, H], ADVANCED: [H], REJECTED: [H] },
  NOT_A_FIT: { SCREENING: [A, H], ADVANCED: [H], REJECTED: [H] },
  PREFILTER_REJECTED: { SCREENING: [H], ADVANCED: [H], REJECTED: [H] },
  ADVANCED: {},
  REJECTED: {},
};

const CANDIDATE_STATUSES = Object.keys(CANDIDATE_TRANSITIONS);

// Returns { ok: true } or { ok: false, code, message }.
function checkCandidateTransition(from, to, actor) {
  if (!CANDIDATE_TRANSITIONS[from]) return { ok: false, code: 'UNKNOWN_STATUS', message: `unknown current status ${from}` };
  if (!CANDIDATE_TRANSITIONS[to]) return { ok: false, code: 'UNKNOWN_STATUS', message: `unknown target status ${to}` };
  if (TERMINAL.includes(from)) return { ok: false, code: 'TERMINAL_STATE', message: `${from} is a final human decision and can't change` };
  const allowed = CANDIDATE_TRANSITIONS[from][to];
  if (!allowed) return { ok: false, code: 'ILLEGAL_TRANSITION', message: `${from} → ${to} is not an allowed transition` };
  if (!allowed.includes(actor)) {
    return { ok: false, code: actor === A ? 'HUMAN_ONLY' : 'AUTOMATION_ONLY', message: `${from} → ${to} can only be done by ${allowed.join(' or ')}` };
  }
  return { ok: true };
}

function allowedNext(from, actor) {
  return Object.entries(CANDIDATE_TRANSITIONS[from] || {}).filter(([, actors]) => actors.includes(actor)).map(([to]) => to);
}

// Job profile versions: draft → approved → archived; draft → archived (discarded).
// An approved version is frozen: edits create a new draft version (vN+1).
const PROFILE_TRANSITIONS = { draft: ['approved', 'archived'], approved: ['archived'], archived: [] };

function checkProfileTransition(from, to) {
  if ((PROFILE_TRANSITIONS[from] || []).includes(to)) return { ok: true };
  return { ok: false, code: 'ILLEGAL_TRANSITION', message: `profile version ${from} → ${to} is not allowed` };
}

module.exports = {
  ACTORS: { AUTOMATION: A, HUMAN: H }, AI_OUTCOMES, TERMINAL, CANDIDATE_STATUSES, CANDIDATE_TRANSITIONS,
  checkCandidateTransition, allowedNext, PROFILE_TRANSITIONS, checkProfileTransition,
};
