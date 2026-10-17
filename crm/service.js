// Business logic of the mock CRM. The REST API (automation) and the HTML pages (humans) both call
// this, so state-machine rules and contract checks apply the same way to every caller.
const { tx } = require('./db');
const { validate } = require('../src/validate');
const { checkProfile } = require('../src/jobprofile');
const { textSha256 } = require('../src/text');
const state = require('./state');

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

const now = () => new Date().toISOString();
const J = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
const P = (s) => (s === null || s === undefined ? null : JSON.parse(s));
const SCORED = ['SHORTLISTED', 'MAYBE', 'NOT_A_FIT'];
const JOB_ID = /^[a-z][a-z0-9_-]{1,31}$/;

function createService(db, { onEvent = () => {} } = {}) {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);

  // ------------------------------------------------------------------ jobs
  function versionRow(job_id, version) {
    const r = one('SELECT * FROM job_versions WHERE job_id = ? AND version = ?', job_id, version);
    return r && { ...r, profile: P(r.profile_json), check_errors: P(r.check_errors_json) };
  }
  function rowByStatus(job_id, status) {
    const r = one('SELECT version FROM job_versions WHERE job_id = ? AND status = ?', job_id, status);
    return r ? versionRow(job_id, r.version) : null;
  }
  function requireJob(job_id) {
    const job = one('SELECT * FROM jobs WHERE job_id = ?', job_id);
    if (!job) throw new HttpError(404, 'JOB_NOT_FOUND', `no job "${job_id}"`);
    return job;
  }

  // Loads hand-written profiles from config/jobs on startup (brief Phase 2). Idempotent.
  function seedJobs(profiles) {
    let added = 0;
    for (const p of profiles) {
      const v = validate('job_profile', p);
      if (!v.valid) throw new Error(`config profile ${p.job_id} v${p.version} is invalid: ${JSON.stringify(v.errors[0])}`);
      tx(db, () => {
        if (!one('SELECT 1 FROM jobs WHERE job_id = ?', p.job_id)) {
          run('INSERT INTO jobs (job_id, title, jd_text, created_at) VALUES (?, ?, ?, ?)', p.job_id, p.title, p.source_jd_text, p.created_at);
        }
        if (!versionRow(p.job_id, p.version)) {
          if (p.status === 'approved') run("UPDATE job_versions SET status = 'archived' WHERE job_id = ? AND status = 'approved' AND version < ?", p.job_id, p.version);
          run('INSERT INTO job_versions (job_id, version, status, profile_json, created_at, approved_at, approved_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
            p.job_id, p.version, p.status, JSON.stringify(p), p.created_at, p.approved_at, p.approved_by);
          added++;
        }
      });
    }
    return added;
  }

  function listJobs() {
    return all('SELECT * FROM jobs ORDER BY created_at, job_id').map((j) => {
      const versions = all('SELECT version, status, approved_at, approved_by FROM job_versions WHERE job_id = ? ORDER BY version', j.job_id);
      return {
        job_id: j.job_id, title: j.title, drafting: Boolean(j.drafting), created_at: j.created_at,
        draft_error: j.draft_error ? P(j.draft_error) : null,
        current_version: (versions.find((v) => v.status === 'approved') || {}).version || null,
        draft_version: (versions.find((v) => v.status === 'draft') || {}).version || null,
        versions,
      };
    });
  }

  function getApprovedProfile(job_id) {
    requireJob(job_id);
    const r = rowByStatus(job_id, 'approved');
    if (!r) throw new HttpError(404, 'JOB_NOT_APPROVED', `job "${job_id}" has no approved profile yet`);
    return r.profile;
  }

  function getVersion(job_id, version) {
    requireJob(job_id);
    const r = versionRow(job_id, Number(version));
    if (!r) throw new HttpError(404, 'VERSION_NOT_FOUND', `job "${job_id}" has no version ${version}`);
    return { ...r.profile, status: r.status };
  }

  function getDraft(job_id) {
    const job = requireJob(job_id);
    const r = rowByStatus(job_id, 'draft');
    if (!r) throw new HttpError(404, 'NO_DRAFT', `job "${job_id}" has no draft`, { drafting: Boolean(job.drafting) });
    return { profile: r.profile, check_errors: r.check_errors };
  }

  // Recruiter pastes a JD: the job exists immediately, its profile is drafted by WF-05.
  function createJob({ job_id, title, jd_text }) {
    if (!JOB_ID.test(job_id || '')) throw new HttpError(422, 'BAD_JOB_ID', 'job_id must be 2-32 chars: lowercase letters, digits, - or _');
    if (!title || !jd_text || jd_text.trim().length < 100) throw new HttpError(422, 'BAD_JOB', 'title and a job description of at least 100 characters are required');
    if (one('SELECT 1 FROM jobs WHERE job_id = ?', job_id)) throw new HttpError(409, 'JOB_EXISTS', `job "${job_id}" already exists`);
    run('INSERT INTO jobs (job_id, title, jd_text, drafting, created_at) VALUES (?, ?, ?, 1, ?)', job_id, title, jd_text, now());
    onEvent('job.draft_requested', { job: { job_id, title, jd_text } });
    return listJobs().find((j) => j.job_id === job_id);
  }

  // Ask WF-05 for a fresh AI draft from the job's stored JD (replaces any current draft).
  function requestRedraft(job_id) {
    const job = requireJob(job_id);
    if (!job.jd_text) throw new HttpError(422, 'NO_JD', `job "${job_id}" has no job description to draft from`);
    run('UPDATE jobs SET drafting = 1, draft_error = NULL WHERE job_id = ?', job_id);
    onEvent('job.draft_requested', { job: { job_id, title: job.title, jd_text: job.jd_text } });
    return listJobs().find((j) => j.job_id === job_id);
  }

  // WF-05 couldn't produce a contract-valid draft even after its repair retry: say so on the job,
  // never silently (brief §5.5). The recruiter can edit the JD or re-draft.
  function recordDraftFailure(job_id, { errors = [], prompt_version = null, model = null } = {}) {
    requireJob(job_id);
    const detail = { at: now(), prompt_version, model, errors: errors.slice(0, 20).map(String) };
    run('UPDATE jobs SET drafting = 0, draft_error = ? WHERE job_id = ?', JSON.stringify(detail), job_id);
    return listJobs().find((j) => j.job_id === job_id);
  }

  // Saves (or replaces) the job's single draft version. Used by WF-05 and by human edits.
  function saveDraft(job_id, incoming, { builderErrors = [] } = {}) {
    const job = requireJob(job_id);
    const existingDraft = rowByStatus(job_id, 'draft');
    const maxV = (one('SELECT MAX(version) AS v FROM job_versions WHERE job_id = ?', job_id) || {}).v || 0;
    const profile = {
      ...incoming,
      job_id, status: 'draft', approved_by: null, approved_at: null,
      version: existingDraft ? existingDraft.version : maxV + 1,
      source_jd_text: incoming.source_jd_text !== undefined ? incoming.source_jd_text : job.jd_text,
      created_at: incoming.created_at || now(),
    };
    const v = validate('job_profile', profile);
    if (!v.valid) throw new HttpError(422, 'CONTRACT_VIOLATION', 'draft does not match the JobProfile contract', v.errors);
    const errors = [...builderErrors, ...checkProfile(profile).errors.map((e) => `${e.code}: ${e.message}`)];
    tx(db, () => {
      if (existingDraft) {
        run('UPDATE job_versions SET profile_json = ?, check_errors_json = ? WHERE job_id = ? AND version = ?', JSON.stringify(profile), JSON.stringify(errors), job_id, profile.version);
      } else {
        run("INSERT INTO job_versions (job_id, version, status, profile_json, check_errors_json, created_at) VALUES (?, ?, 'draft', ?, ?, ?)",
          job_id, profile.version, JSON.stringify(profile), JSON.stringify(errors), profile.created_at);
      }
      run('UPDATE jobs SET drafting = 0, draft_error = NULL, title = ? WHERE job_id = ?', profile.title, job_id);
    });
    return { profile, check_errors: errors };
  }

  // Human edit. Editing an approved profile never changes it: it starts a new draft vN+1 from a copy.
  const EDITABLE = ['title', 'prefilter', 'criteria', 'nice_to_haves', 'thresholds', 'bias_flags'];
  function editDraft(job_id, patch) {
    requireJob(job_id);
    let base = rowByStatus(job_id, 'draft');
    if (!base) {
      const approved = rowByStatus(job_id, 'approved');
      if (!approved) throw new HttpError(404, 'NO_DRAFT', `job "${job_id}" has nothing to edit yet`);
      base = { profile: { ...approved.profile, created_by: 'human', created_at: now() } };
    }
    const unknown = Object.keys(patch).filter((k) => !EDITABLE.includes(k));
    if (unknown.length) throw new HttpError(422, 'NOT_EDITABLE', `fields not editable: ${unknown.join(', ')}`);
    return saveDraft(job_id, { ...base.profile, ...patch });
  }

  function resolveBiasFlag(job_id, flag_id, note) {
    const { profile } = getDraft(job_id);
    const flag = profile.bias_flags.find((f) => f.id === flag_id);
    if (!flag) throw new HttpError(404, 'FLAG_NOT_FOUND', `no bias flag "${flag_id}" on the draft`);
    if (!note || note.trim().length < 5) throw new HttpError(422, 'NOTE_REQUIRED', 'say how the flag was resolved (at least 5 characters)');
    flag.resolved = true;
    flag.resolution_note = note.trim();
    return saveDraft(job_id, profile);
  }

  // Freezes the draft as the approved version; the previous approved version is archived.
  function approveDraft(job_id, approved_by) {
    if (!approved_by || !approved_by.trim()) throw new HttpError(422, 'APPROVER_REQUIRED', 'approved_by (a person) is required');
    const draft = rowByStatus(job_id, 'draft');
    if (!draft) throw new HttpError(404, 'NO_DRAFT', `job "${job_id}" has no draft to approve`);
    const profile = { ...draft.profile, status: 'approved', approved_by: approved_by.trim(), approved_at: now() };
    const v = validate('job_profile', profile);
    if (!v.valid) throw new HttpError(422, 'CONTRACT_VIOLATION', 'draft does not match the JobProfile contract', v.errors);
    const check = checkProfile(profile);
    if (!check.ok) throw new HttpError(422, 'APPROVAL_BLOCKED', 'fix these before approving', check.errors);
    tx(db, () => {
      const prev = rowByStatus(job_id, 'approved');
      if (prev) {
        const t = state.checkProfileTransition('approved', 'archived');
        if (!t.ok) throw new HttpError(409, t.code, t.message);
        run("UPDATE job_versions SET status = 'archived' WHERE job_id = ? AND version = ?", job_id, prev.version);
      }
      run("UPDATE job_versions SET status = 'approved', profile_json = ?, check_errors_json = '[]', approved_at = ?, approved_by = ? WHERE job_id = ? AND version = ?",
        JSON.stringify(profile), profile.approved_at, profile.approved_by, job_id, profile.version);
    });
    return profile;
  }

  // ------------------------------------------------------------ candidates
  function toApi(r, { history = false } = {}) {
    if (!r) return null;
    const out = {
      application_id: r.application_id, job_id: r.job_id, status: r.status, source: r.source, source_ref: r.source_ref,
      idempotency_key: r.idempotency_key, duplicate_of: r.duplicate_of,
      candidate: { name: r.name, email: r.email, phone: r.phone, location: r.location },
      answers: P(r.answers_json),
      cv: {
        text: r.cv_text, filename: r.cv_filename, mime: r.cv_mime, sha256: r.cv_sha256,
        extraction_method: r.extraction_method, extraction_error: r.extraction_error, char_count: r.cv_text.length,
      },
      result: {
        total_score: r.total_score, breakdown: P(r.breakdown_json), summary: r.summary,
        reason_codes: P(r.reason_codes_json), flags: P(r.flags_json), job_profile_version: r.job_profile_version,
        prompt_version: r.prompt_version, model: r.model, execution_id: r.execution_id, processed_at: r.processed_at,
      },
      created_at: r.created_at, updated_at: r.updated_at,
    };
    if (history) out.history = all('SELECT from_status, to_status, actor, execution_id, note, at FROM status_history WHERE application_id = ? ORDER BY id', r.application_id);
    return out;
  }
  const rowById = (id) => one('SELECT * FROM candidates WHERE application_id = ?', id);

  function createApplication(body, { notify = true } = {}) {
    const { job_id = null, source, source_ref = null, candidate = {}, answers = null, cv = {} } = body || {};
    if (!['crm', 'email'].includes(source)) throw new HttpError(422, 'BAD_SOURCE', 'source must be crm or email');
    if (typeof cv.text !== 'string') throw new HttpError(422, 'BAD_CV', 'cv.text must be a string (empty when extraction failed)');
    if (job_id !== null) requireJob(job_id);
    if (answers !== null && (typeof answers !== 'object' || Array.isArray(answers))) throw new HttpError(422, 'BAD_ANSWERS', 'answers must be an object or null');

    const sha = textSha256(cv.text);
    const email = candidate.email ? String(candidate.email).trim().toLowerCase() : null;

    // Same delivery again (email redelivered, client retried): return the existing record, create nothing.
    const sameDelivery = (source_ref && one('SELECT * FROM candidates WHERE source_ref = ?', source_ref))
      || (email && one('SELECT * FROM candidates WHERE job_id IS ? AND email = ? AND cv_sha256 = ?', job_id, email, sha));
    if (sameDelivery) return { created: false, application: toApi(sameDelivery) };

    // Same person, same job, different application: allowed, but marked (the pre-filter decides).
    const earlier = email && job_id && one('SELECT application_id FROM candidates WHERE job_id = ? AND email = ? ORDER BY seq LIMIT 1', job_id, email);
    const t = now();
    const application = tx(db, () => {
      const tmp = 'tmp_' + Math.random().toString(36).slice(2);
      const res = run(`INSERT INTO candidates (application_id, job_id, status, source, source_ref, name, email, phone, location, answers_json,
        cv_text, cv_filename, cv_mime, cv_sha256, extraction_method, extraction_error, idempotency_key, duplicate_of, created_at, updated_at)
        VALUES (?, ?, 'NEW', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      tmp, job_id, source, source_ref, candidate.name || null, email, candidate.phone || null, candidate.location || null, J(answers),
      cv.text, cv.filename || null, cv.mime || null, sha, cv.extraction_method || 'provided_text', cv.extraction_error || null,
      tmp, earlier ? earlier.application_id : null, t, t);
      const id = `app_${String(res.lastInsertRowid).padStart(6, '0')}`;
      run('UPDATE candidates SET application_id = ?, idempotency_key = ? WHERE seq = ?', id, `${id}:${sha.slice(0, 12)}`, res.lastInsertRowid);
      run("INSERT INTO status_history (application_id, from_status, to_status, actor, note, at) VALUES (?, NULL, 'NEW', 'system', ?, ?)", id, `created via ${source}`, t);
      return toApi(rowById(id));
    });
    if (notify) onEvent('application.created', { application });
    return { created: true, application };
  }

  function getCandidate(id, opts) {
    const r = rowById(id);
    if (!r) throw new HttpError(404, 'CANDIDATE_NOT_FOUND', `no candidate "${id}"`);
    return toApi(r, opts);
  }

  function listCandidates({ job_id, status, limit = 100, offset = 0 } = {}) {
    const where = [];
    const args = [];
    if (job_id) { where.push('job_id = ?'); args.push(job_id); }
    if (status) {
      const list = String(status).split(',');
      where.push(`status IN (${list.map(() => '?').join(',')})`);
      args.push(...list);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = one(`SELECT COUNT(*) AS n FROM candidates ${w}`, ...args).n;
    const lim = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    const items = all(`SELECT * FROM candidates ${w} ORDER BY seq LIMIT ? OFFSET ?`, ...args, lim, Number(offset) || 0).map((r) => toApi(r));
    return { total, limit: lim, offset: Number(offset) || 0, items };
  }

  // Status changes. Automation sends a CrmUpdate; humans send { status, note, decided_by }.
  //   updateKey      → idempotency: the same key twice returns the first result and changes nothing
  //   expectedStatus → compare-and-set: 409 unless the current status matches (used to claim NEW → SCREENING once)
  function patchCandidate(id, body, { actor = state.ACTORS.AUTOMATION, updateKey = null, expectedStatus = null } = {}) {
    if (updateKey) {
      const seen = one('SELECT response_json FROM applied_updates WHERE update_key = ?', updateKey);
      if (seen) return { replayed: true, application: P(seen.response_json) };
    }
    const cur = rowById(id);
    if (!cur) throw new HttpError(404, 'CANDIDATE_NOT_FOUND', `no candidate "${id}"`);
    if (expectedStatus && cur.status !== expectedStatus) {
      throw new HttpError(409, 'STATUS_CONFLICT', `expected status ${expectedStatus} but it is ${cur.status}`, { current_status: cur.status });
    }

    const to = body && body.status;
    if (actor === state.ACTORS.AUTOMATION) {
      const v = validate('crm_update', body);
      if (!v.valid) throw new HttpError(422, 'CONTRACT_VIOLATION', 'body does not match the CrmUpdate contract', v.errors);
      if (body.application_id !== id) throw new HttpError(422, 'ID_MISMATCH', 'application_id in the body does not match the URL');
      if (cur.job_id && body.job_id && body.job_id !== cur.job_id) throw new HttpError(422, 'JOB_MISMATCH', `candidate applied to ${cur.job_id}, update is for ${body.job_id}`);
      if (SCORED.includes(to)) {
        const ver = one("SELECT status FROM job_versions WHERE job_id = ? AND version = ? AND status IN ('approved','archived')", body.job_id, body.job_profile_version);
        if (!ver) throw new HttpError(422, 'UNKNOWN_PROFILE_VERSION', `${body.job_id} v${body.job_profile_version} was never approved`);
      }
    }
    if (cur.status === to) throw new HttpError(409, 'ALREADY_IN_STATUS', `candidate is already ${to}`, { current_status: cur.status });
    const t = state.checkCandidateTransition(cur.status, to, actor);
    if (!t.ok) throw new HttpError(409, t.code, t.message, { current_status: cur.status });

    const at = now();
    return tx(db, () => {
      if (actor === state.ACTORS.AUTOMATION) {
        run(`UPDATE candidates SET status = ?, total_score = ?, breakdown_json = ?, summary = ?, reason_codes_json = ?, flags_json = ?,
          job_profile_version = ?, prompt_version = ?, model = ?, execution_id = ?, processed_at = ?, updated_at = ? WHERE application_id = ?`,
        to, body.total_score, J(body.breakdown), body.summary, JSON.stringify(body.reason_codes), JSON.stringify(body.flags),
        body.job_profile_version, body.prompt_version, body.model, body.execution_id, body.processed_at, at, id);
      } else {
        run('UPDATE candidates SET status = ?, updated_at = ? WHERE application_id = ?', to, at, id);
      }
      const note = actor === state.ACTORS.HUMAN
        ? [body.decided_by, body.note].filter(Boolean).join(': ') || null
        : (body.reason_codes || []).join(',') || null;
      run('INSERT INTO status_history (application_id, from_status, to_status, actor, execution_id, note, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, cur.status, to, actor, body.execution_id || null, note, at);
      const application = toApi(rowById(id));
      if (updateKey) run('INSERT INTO applied_updates (update_key, application_id, response_json, at) VALUES (?, ?, ?, ?)', updateKey, id, JSON.stringify(application), at);
      return { replayed: false, application };
    });
  }

  // -------------------------------------------------------------- ops data
  function addDeadLetter({ application_id = null, execution_id = null, workflow = null, error, payload = null }) {
    if (!error) throw new HttpError(422, 'BAD_DEAD_LETTER', 'error is required');
    const r = run('INSERT INTO dead_letters (application_id, execution_id, workflow, error_json, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      application_id, execution_id, workflow, JSON.stringify(error), J(payload), now());
    return { id: Number(r.lastInsertRowid) };
  }
  function listDeadLetters({ open } = {}) {
    const w = open ? 'WHERE replayed_at IS NULL' : '';
    return all(`SELECT * FROM dead_letters ${w} ORDER BY id`).map((d) => ({ ...d, error: P(d.error_json), payload: P(d.payload_json), error_json: undefined, payload_json: undefined }));
  }
  function markReplayed(id, replay_execution_id) {
    const r = run('UPDATE dead_letters SET replayed_at = ?, replay_execution_id = ? WHERE id = ? AND replayed_at IS NULL', now(), replay_execution_id || null, Number(id));
    if (!r.changes) throw new HttpError(409, 'NOT_OPEN', `dead letter ${id} does not exist or was already replayed`);
    return { id: Number(id), replayed: true };
  }

  function addRunLog(log) {
    const v = validate('run_log', log);
    if (!v.valid) throw new HttpError(422, 'CONTRACT_VIOLATION', 'body does not match the RunLog contract', v.errors);
    run('INSERT INTO run_logs (execution_id, application_id, job_id, outcome, log_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      log.execution_id, log.application_id, log.job_id, log.outcome, JSON.stringify(log), now());
    return { ok: true };
  }
  function listRunLogs({ application_id, limit = 200 } = {}) {
    const rows = application_id
      ? all('SELECT log_json FROM run_logs WHERE application_id = ? ORDER BY id DESC LIMIT ?', application_id, Number(limit))
      : all('SELECT log_json FROM run_logs ORDER BY id DESC LIMIT ?', Number(limit));
    return rows.map((r) => P(r.log_json));
  }

  // Test harness only: removes every candidate and its history so a fresh dataset can be seeded.
  // Job profiles are kept. Guarded by a confirm phrase at the API and --yes in scripts/reset-crm.js.
  function resetCandidates() {
    return tx(db, () => {
      const n = one('SELECT COUNT(*) AS n FROM candidates').n;
      for (const t of ['candidates', 'status_history', 'applied_updates', 'dead_letters', 'run_logs', 'webhook_deliveries']) run(`DELETE FROM ${t}`);
      run("DELETE FROM sqlite_sequence WHERE name IN ('candidates', 'status_history', 'dead_letters', 'run_logs', 'webhook_deliveries')");
      return { deleted_candidates: n };
    });
  }

  function stats() {
    const byJob = {};
    for (const r of all("SELECT COALESCE(job_id, '(unrouted)') AS job, status, COUNT(*) AS n FROM candidates GROUP BY job, status")) {
      (byJob[r.job] = byJob[r.job] || {})[r.status] = r.n;
    }
    return {
      candidates: one('SELECT COUNT(*) AS n FROM candidates').n,
      by_job: byJob,
      run_logs: one('SELECT COUNT(*) AS n FROM run_logs').n,
      dead_letters_open: one('SELECT COUNT(*) AS n FROM dead_letters WHERE replayed_at IS NULL').n,
      webhooks: one('SELECT COUNT(*) AS total, SUM(delivered_at IS NOT NULL) AS delivered FROM webhook_deliveries'),
    };
  }

  return {
    seedJobs, listJobs, getApprovedProfile, getVersion, getDraft, createJob, requestRedraft, recordDraftFailure, saveDraft, editDraft, resolveBiasFlag, approveDraft,
    createApplication, getCandidate, listCandidates, patchCandidate,
    addDeadLetter, listDeadLetters, markReplayed, addRunLog, listRunLogs, stats, resetCandidates,
    allowedHumanActions: (status) => state.allowedNext(status, state.ACTORS.HUMAN),
  };
}

module.exports = { createService, HttpError };
