// Loads the synthetic dataset and turns rows into the CRM record shape (what GET /candidates/:id returns),
// so offline checks run the exact same normalize → pre-filter path as the live pipeline.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function loadApplicants() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'applicants.json'), 'utf8')).applicants;
}
function loadProfile(jobId, version = 1) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'jobs', `${jobId}.v${version}.json`), 'utf8'));
}

// Mirrors the CRM's business-duplicate rule: same job + same email as an EARLIER application.
function toCrmRecords(rows) {
  const firstByJobEmail = new Map();
  return rows.map((a) => {
    const key = `${a.job_id}|${(a.candidate.email || '').toLowerCase()}`;
    const duplicateOf = a.candidate.email && firstByJobEmail.has(key) ? firstByJobEmail.get(key) : null;
    if (a.candidate.email && !firstByJobEmail.has(key)) firstByJobEmail.set(key, a.ref);
    return {
      application_id: a.ref, job_id: a.job_id, status: 'NEW', source: a.source, source_ref: null, idempotency_key: null,
      duplicate_of: duplicateOf, candidate: a.candidate, answers: a.answers,
      cv: { text: a.cv.text, filename: a.cv.filename, mime: a.cv.mime, extraction_method: a.cv.extraction_method, extraction_error: a.cv.extraction_error },
      created_at: '2026-10-17T00:00:00.000Z',
    };
  });
}

module.exports = { loadApplicants, loadProfile, toCrmRecords };
