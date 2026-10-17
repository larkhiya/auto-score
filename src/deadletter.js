// Dead letters (C-24, D-028). Pure; bundled into WF-91.
// A dead letter is a failed execution we keep so that it can be understood and replayed later.
// It lives in an n8n Data Table, NOT the CRM: it must be writable while the CRM is down.

const MAX_PAYLOAD_CHARS = 60000;

// Turns an error message into a short, stable code for filtering and alerts.
function classifyError(message) {
  const m = String(message || '');
  if (/LLM unavailable|LLM_UNAVAILABLE/i.test(m)) return 'LLM_UNAVAILABLE';
  if (/RETRIES_EXHAUSTED|could not load|claim failed|write-back failed|could not create the CRM record/i.test(m)) return 'CRM_UNAVAILABLE';
  if (/contract/i.test(m)) return 'CONTRACT_VIOLATION';
  if (/invalid application/i.test(m)) return 'INVALID_INPUT';
  return 'UNEXPECTED_ERROR';
}

function truncate(s, n) {
  const str = String(s == null ? '' : s);
  return str.length > n ? `${str.slice(0, n)}…[${str.length - n} more chars]` : str;
}

// input: { source_workflow, failed_execution_id, stage, error, application?, payload? }
function buildDeadLetter(input, now = new Date().toISOString()) {
  const app = input.application || null;
  const message = typeof input.error === 'string' ? input.error : (input.error && input.error.message) || 'unknown error';
  return {
    application_id: app ? app.application_id : null,
    job_id: app ? app.job_id : null,
    source_workflow: input.source_workflow || 'unknown',
    failed_execution_id: input.failed_execution_id ? String(input.failed_execution_id) : null,
    stage: input.stage || 'unknown',
    error_code: classifyError(message),
    error: truncate(message, 2000),
    payload: truncate(JSON.stringify(app || input.payload || null), MAX_PAYLOAD_CHARS),
    status: 'open',
    crm_marked: false,
    notified: false,
    created_at: now,
    replay_execution_id: null,
    replayed_at: null,
  };
}

// The CrmUpdate that marks the record ERROR (allowed from NEW or SCREENING). Contract-valid.
function errorUpdate(application, row, executionId, now = new Date().toISOString()) {
  return {
    schema_version: '1.0.0', application_id: application.application_id, status: 'ERROR',
    total_score: null, breakdown: null, summary: `Processing failed (${row.error_code}); queued for replay. ${row.error}`.slice(0, 600),
    reason_codes: [row.error_code], flags: [],
    job_id: application.job_id || null, job_profile_version: null, prompt_version: null, model: null,
    execution_id: String(executionId), processed_at: now, idempotency_key: application.idempotency_key,
  };
}

function notification(row) {
  return {
    subject: `[auto-score] ${row.error_code} in ${row.source_workflow}${row.application_id ? ` for ${row.application_id}` : ''}`,
    text: [
      `A record could not be processed and was dead-lettered.`,
      ``,
      `Application: ${row.application_id || '(unknown)'} · job ${row.job_id || '-'}`,
      `Workflow:    ${row.source_workflow} (stage ${row.stage}), failed execution ${row.failed_execution_id || '-'}`,
      `Error:       ${row.error}`,
      `CRM marked ERROR: ${row.crm_marked ? 'yes' : 'NO (CRM unreachable?)'}`,
      ``,
      `Replay when the cause is fixed: node scripts/replay-dlq.js`,
    ].join('\n'),
  };
}

module.exports = { classifyError, buildDeadLetter, errorUpdate, notification, MAX_PAYLOAD_CHARS };
