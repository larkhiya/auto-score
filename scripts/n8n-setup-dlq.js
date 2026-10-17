#!/usr/bin/env node
// Creates the n8n Data Table "dead_letters" (D-028) if it doesn't exist. Safe to re-run.
// The table lives inside n8n on purpose: dead letters must be writable while the CRM is down.
const { client } = require('./lib/n8n-api');

const COLUMNS = [
  ['application_id', 'string'], ['job_id', 'string'], ['source_workflow', 'string'], ['failed_execution_id', 'string'],
  ['stage', 'string'], ['error_code', 'string'], ['error', 'string'], ['payload', 'string'], ['status', 'string'],
  ['crm_marked', 'boolean'], ['notified', 'boolean'], ['created_at', 'string'], ['replay_execution_id', 'string'], ['replayed_at', 'string'],
].map(([name, type]) => ({ name, type }));

async function ensureDeadLetterTable(api = client()) {
  const existing = (await api.listDataTables()).find((t) => t.name === 'dead_letters');
  if (existing) return { id: existing.id, created: false };
  const t = await api.createDataTable({ name: 'dead_letters', columns: COLUMNS });
  return { id: t.id, created: true };
}

if (require.main === module) {
  ensureDeadLetterTable()
    .then((r) => console.log(`dead_letters table ${r.created ? 'created' : 'already exists'} (${r.id})`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { ensureDeadLetterTable, COLUMNS };
