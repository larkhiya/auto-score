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
  attempts INTEGER NOT NULL DEFAULT 0, status_code INTEGER, error TEXT,
  created_at TEXT NOT NULL, delivered_at TEXT
);
`;

function open(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
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
