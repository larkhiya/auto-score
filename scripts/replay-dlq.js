#!/usr/bin/env node
// Replays open dead letters (C-24, D-028). Safe to run any number of times:
//   - only rows with status "open" are touched;
//   - a record already in a final status just closes its row ("resolved");
//   - the replay claim is compare-and-set (ERROR → SCREENING), so a duplicate replay is skipped.
// Steps per row: make sure the CRM record is ERROR → send application.replay to WF-01 → wait for a
// final status → mark the row "replayed" (or "retry_failed"; a new dead letter is then open).
//   node scripts/replay-dlq.js [--dry-run] [--delay 8000] [--wait 120]
const { loadEnv, requireEnv } = require('./lib/env');
const { client } = require('./lib/n8n-api');
const { crm } = require('./lib/crm-client');
const { buildDeadLetter, errorUpdate } = require('../src/deadletter');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : def; };
const DRY = args.includes('--dry-run');
const FINAL = ['SHORTLISTED', 'MAYBE', 'NOT_A_FIT', 'NEEDS_REVIEW', 'PREFILTER_REJECTED', 'ADVANCED', 'REJECTED'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openRows(n8n, tableId) {
  const rows = [];
  let cursor = null;
  do {
    const page = await n8n.listRows(tableId, cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    rows.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor);
  return rows.filter((r) => r.status === 'open');
}

async function main() {
  const env = loadEnv();
  const secret = requireEnv('CRM_WEBHOOK_SECRET');
  const n8n = client();
  const api = crm();
  const table = (await n8n.listDataTables()).find((t) => t.name === 'dead_letters');
  if (!table) throw new Error('no dead_letters table: run node scripts/n8n-setup-dlq.js');
  const setRow = (id, data) => (DRY ? null : n8n.updateRows(table.id, { filter: { type: 'and', filters: [{ columnName: 'id', condition: 'eq', value: id }] }, data }));
  const rows = await openRows(n8n, table.id);
  const seen = new Set();
  const summary = { open: rows.length, replayed: 0, resolved: 0, retry_failed: 0, manual: 0, duplicate_rows: 0 };
  console.log(`${rows.length} open dead letter(s)${DRY ? ' (dry run)' : ''}`);

  for (const row of rows) {
    if (!row.application_id) {
      summary.manual++;
      console.log(`manual  row ${row.id}: no application (${row.error_code} in ${row.source_workflow}); see execution ${row.failed_execution_id}`);
      continue;
    }
    if (seen.has(row.application_id)) {
      // An application can collect several rows (e.g. it failed again on a later attempt): replay once.
      summary.duplicate_rows++;
      await setRow(row.id, { status: 'resolved', replayed_at: new Date().toISOString() });
      continue;
    }
    seen.add(row.application_id);
    let c = await api.getCandidate(row.application_id);
    if (FINAL.includes(c.status)) {
      summary.resolved++;
      console.log(`resolved row ${row.id}: ${row.application_id} is already ${c.status}`);
      await setRow(row.id, { status: 'resolved', replayed_at: new Date().toISOString() });
      continue;
    }
    if (DRY) { console.log(`would replay ${row.application_id} (now ${c.status})`); continue; }
    if (c.status !== 'ERROR') {
      // The dead letter couldn't mark it (CRM was down): do it now, so the replay claim (ERROR → SCREENING) applies.
      const marker = buildDeadLetter({ error: row.error, application: { application_id: c.application_id, job_id: c.job_id } });
      await api.call('PATCH', `/candidates/${c.application_id}`, errorUpdate({ ...c }, { ...marker, error_code: row.error_code }, `replay-${Date.now()}`),
        { 'x-expected-status': c.status });
      c = await api.getCandidate(c.application_id);
    }
    await fetch((env.N8N_BASE_URL || 'http://localhost:5678') + '/webhook/application-received', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-secret': secret },
      body: JSON.stringify({ event: 'application.replay', event_id: `evt_replay_${row.id}_${Date.now()}`, occurred_at: new Date().toISOString(), application: c }),
      signal: AbortSignal.timeout(15000),
    });
    const deadline = Date.now() + Number(opt('wait', 120)) * 1000;
    do { await sleep(3000); c = await api.getCandidate(c.application_id); } while (!FINAL.includes(c.status) && c.status !== 'ERROR' && Date.now() < deadline);
    if (FINAL.includes(c.status)) {
      summary.replayed++;
      await setRow(row.id, { status: 'replayed', replayed_at: new Date().toISOString(), replay_execution_id: c.result.execution_id });
      console.log(`replayed ${row.application_id}: ${c.status}${c.result.total_score !== null ? ` (${c.result.total_score})` : ''} in execution ${c.result.execution_id}`);
    } else {
      summary.retry_failed++;
      await setRow(row.id, { status: 'retry_failed', replayed_at: new Date().toISOString() });
      console.log(`FAILED  ${row.application_id}: still ${c.status} after replay (a new dead letter will be open)`);
    }
    await sleep(Number(opt('delay', 8000)));
  }
  console.log(JSON.stringify(summary));
  if (summary.retry_failed) process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
