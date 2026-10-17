#!/usr/bin/env node
// Prints a job's current draft (or a version) for review: criteria, must-haves, checks, bias flags.
//   node scripts/show-draft.js --job admin            current draft
//   node scripts/show-draft.js --job admin --json     raw JSON (used by the consistency check)
const { crm } = require('./lib/crm-client');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : null; };

function leaves(n, out = []) {
  if (!n) return out;
  if (n.all || n.any) (n.all || n.any).forEach((x) => leaves(x, out));
  else if (n.not) leaves(n.not, out);
  else out.push(n);
  return out;
}

async function main() {
  const job = opt('job');
  const d = await crm().call('GET', `/jobs/${job}/draft`);
  if (args.includes('--json')) { console.log(JSON.stringify(d)); return; }
  const p = d.profile;
  console.log(`${p.title} (${p.job_id}) draft v${p.version} · ${p.builder ? `${p.builder.prompt_version}, ${p.builder.model}` : p.created_by}`);
  console.log('\nCRITERIA');
  for (const c of p.criteria) console.log(`  ${String(c.weight).padStart(3)}  ${c.id.padEnd(32)} “${(c.jd_quote || '').slice(0, 80)}”`);
  console.log(`  ${p.criteria.reduce((s, c) => s + c.weight, 0)} total`);
  console.log('\nMUST-HAVES (pre-filter)');
  for (const l of leaves(p.prefilter)) console.log(`  ${l.check.padEnd(17)} ${(l.field || (l.terms || []).join('|') || '').slice(0, 60).padEnd(60)} ${l.value !== undefined ? `= ${l.value}` : ''}  ${l.reason || ''}`);
  console.log('\nNICE-TO-HAVES');
  for (const n of p.nice_to_haves) console.log(`  ${n.id}: ${n.name}`);
  console.log(`\nCHECK ERRORS: ${d.check_errors.length ? '\n  ' + d.check_errors.join('\n  ') : 'none'}`);
  console.log(`BIAS FLAGS:   ${p.bias_flags.length ? '\n  ' + p.bias_flags.map((f) => `${f.category.padEnd(15)} “${f.phrase}” in ${f.target}`).join('\n  ') : 'none'}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
