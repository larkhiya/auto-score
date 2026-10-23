// SQLite storage for the mock CRM (node:sqlite, built into Node 22.5+). Synchronous calls, so a
// read-check-write inside one function can't interleave with another request.
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  job_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  jd_text TEXT,
  drafting INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS job_versions (
  job_id TEXT NOT NULL REFERENCES jobs(job_id),
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','approved','archived')),
  profile_json TEXT NOT NULL,
  check_errors_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  approved_at TEXT,
  approved_by TEXT,
  PRIMARY KEY (job_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_draft_per_job ON job_versions(job_id) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS one_approved_per_job ON job_versions(job_id) WHERE status = 'approved';

CREATE TABLE IF NOT EXISTS candidates (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id TEXT NOT NULL UNIQUE,
  job_id TEXT,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT UNIQUE,
  name TEXT, email TEXT, phone TEXT, location TEXT,
  answers_json TEXT,
  cv_text TEXT NOT NULL,
  cv_filename TEXT, cv_mime TEXT,
  cv_sha256 TEXT NOT NULL,
  extraction_method TEXT NOT NULL,
  extraction_error TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  duplicate_of TEXT,
  total_score REAL, breakdown_json TEXT, summary TEXT,
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  flags_json TEXT NOT NULL DEFAULT '[]',
  job_profile_version INTEGER, prompt_version TEXT, model TEXT, execution_id TEXT, processed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS candidates_job_status ON candidates(job_id, status);
CREATE INDEX IF NOT EXISTS candidates_job_email ON candidates(job_id, email);

CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id TEXT NOT NULL,
  from_status TEXT, to_status TEXT NOT NULL,
  actor TEXT NOT NULL, execution_id TEXT, note TEXT,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS applied_updates (
  update_key TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  response_json TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dead_letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id TEXT, execution_id TEXT, workflow TEXT,
  error_json TEXT NOT NULL, payload_json TEXT,
  created_at TEXT NOT NULL,
  replayed_at TEXT, replay_execution_id TEXT
);
CREATE TABLE IF NOT EXISTS run_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id TEXT NOT NULL,
  application_id TEXT, job_id TEXT,
  outcome TEXT NOT NULL,
  log_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL, event_id TEXT NOT NULL, target TEXT NOT NULL,
  subject_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0, status_code INTEGER, error TEXT,
  created_at TEXT NOT NULL, delivered_at TEXT, redelivered_at TEXT
);
`;

// Deliveries recorded before subject_id existed: link each FAILED application.created row to the
// application it announced. The row is inserted in the same tick as the record (service.createApplication
// → onEvent → INSERT, no await in between), so its subject is the latest crm-sourced record created at
// or before it, within a second. A record with the very same millisecond could have come right after
// the row, so a tie there counts as ambiguous. Unmatched rows stay unlinked (listed, not redeliverable).
// Delivered rows don't need a subject.
function backfillDeliverySubjects(db) {
  const rows = db.prepare("SELECT id, created_at FROM webhook_deliveries WHERE event = 'application.created' AND subject_id IS NULL AND delivered_at IS NULL").all();
  for (const r of rows) {
    const from = new Date(Date.parse(r.created_at) - 1000).toISOString();
    const [latest, previous] = db.prepare("SELECT application_id, created_at FROM candidates WHERE source = 'crm' AND created_at >= ? AND created_at <= ? ORDER BY seq DESC LIMIT 2").all(from, r.created_at);
    if (!latest || (latest.created_at === r.created_at && previous && previous.created_at === r.created_at)) continue;
    db.prepare('UPDATE webhook_deliveries SET subject_id = ? WHERE id = ?').run(latest.application_id, r.id);
  }
}

function open(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // Migrations for columns added after a database was created (CREATE TABLE IF NOT EXISTS won't add them).
  const jobCols = db.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name);
  if (!jobCols.includes('draft_error')) db.exec('ALTER TABLE jobs ADD COLUMN draft_error TEXT');
  const hookCols = db.prepare('PRAGMA table_info(webhook_deliveries)').all().map((c) => c.name);
  if (!hookCols.includes('subject_id')) db.exec('ALTER TABLE webhook_deliveries ADD COLUMN subject_id TEXT');
  if (!hookCols.includes('redelivered_at')) db.exec('ALTER TABLE webhook_deliveries ADD COLUMN redelivered_at TEXT');
  backfillDeliverySubjects(db);
  return db;
}

// Runs fn inside a transaction; rolls back on any throw.
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { open, tx };
