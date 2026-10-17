#!/usr/bin/env node
// Deletes ALL candidates (and their history, run logs, dead letters) from the mock CRM so a fresh
// dataset can be seeded. Job profiles are kept. Synthetic test data only, but still destructive:
// CLAUDE.md requires asking before deleting data, so this refuses to run without --yes.
//   node scripts/reset-crm.js --yes
const { crm } = require('./lib/crm-client');

if (!process.argv.includes('--yes')) {
  console.error('Refusing: this deletes every candidate in the CRM. Re-run with --yes once that is agreed.');
  process.exit(2);
}
crm().call('POST', '/admin/reset', { confirm: 'delete-all-candidates' })
  .then((r) => console.log(`reset: ${r.deleted_candidates} candidates deleted (job profiles kept)`))
  .catch((e) => { console.error(e.message); process.exit(1); });
