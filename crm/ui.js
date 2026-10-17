// Server-rendered pages for humans: candidates, review queue, jobs and profile approval.
// Human decisions (advance, reject, approve a profile) are only possible here, never via the
// automation API key. Local demo: no login (see crm/README.md, limitations).
const express = require('express');

const h = (v) => String(v === null || v === undefined ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const STATUSES = ['NEW', 'SCREENING', 'SHORTLISTED', 'MAYBE', 'NOT_A_FIT', 'NEEDS_REVIEW', 'PREFILTER_REJECTED', 'ERROR', 'ADVANCED', 'REJECTED'];

const CSS = `
:root{--bg:#f7f7f5;--card:#fff;--ink:#1d1d1b;--muted:#6b6b66;--line:#e3e2dd;--accent:#2f5d8a;--ok:#2e7d4f;--warn:#a86b00;--bad:#b3261e;--info:#5b4a9e}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#1f1f1d;--ink:#ecebe6;--muted:#a3a29b;--line:#34332f;--accent:#7fb0e0;--ok:#6fcf97;--warn:#f2c46d;--bad:#f28b82;--info:#b6a6f2}}
*{box-sizing:border-box}body{margin:0;font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--ink)}
header{background:var(--card);border-bottom:1px solid var(--line);padding:12px 16px;display:flex;gap:18px;align-items:center;flex-wrap:wrap}
header b{font-size:16px}a{color:var(--accent)}header a{text-decoration:none}main{max-width:1180px;margin:0 auto;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:0 0 14px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600;font-size:13px}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid currentColor;white-space:nowrap}
.SHORTLISTED,.ADVANCED{color:var(--ok)}.MAYBE{color:var(--warn)}.NOT_A_FIT,.PREFILTER_REJECTED,.REJECTED,.ERROR{color:var(--bad)}.NEEDS_REVIEW{color:var(--info)}.NEW,.SCREENING{color:var(--muted)}
.muted{color:var(--muted)}.err{color:var(--bad)}.msg{color:var(--ok)}code,pre{font:13px/1.4 ui-monospace,Consolas,monospace}pre{white-space:pre-wrap;background:var(--bg);padding:10px;border-radius:8px;border:1px solid var(--line);max-height:420px;overflow:auto}
form.inline{display:inline}input,select,textarea,button{font:inherit;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:6px 8px}
button{background:var(--accent);color:#fff;border:0;cursor:pointer}button.secondary{background:transparent;color:var(--accent);border:1px solid var(--accent)}button:disabled{opacity:.45;cursor:not-allowed}
textarea{width:100%}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}.flag{border-left:3px solid var(--warn);padding:6px 10px;margin:6px 0;background:var(--bg)}
.flag.resolved{border-color:var(--ok)}details summary{cursor:pointer;color:var(--accent)}.scroll{overflow-x:auto}
`;

function page(title, body, { msg, err } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${h(title)} · Mock CRM</title><style>${CSS}</style></head><body>
<header><b>Mock CRM</b><a href="/ui/candidates">Candidates</a><a href="/ui/review">Review queue</a><a href="/ui/jobs">Jobs</a>
<span class="muted">synthetic data only</span></header><main>
${msg ? `<p class="msg">${h(msg)}</p>` : ''}${err ? `<p class="err">${h(err)}</p>` : ''}${body}</main></body></html>`;
}

const badge = (s) => `<span class="badge ${h(s)}">${h(s)}</span>`;
const back = (res, url, { msg, err } = {}) => res.redirect(`${url}${url.includes('?') ? '&' : '?'}${msg ? 'msg=' + encodeURIComponent(msg) : 'err=' + encodeURIComponent(err)}`);

function breakdownTable(result) {
  if (!result.breakdown) return '';
  return `<table><tr><th>Criterion</th><th>Weight</th><th>Score</th><th>Points</th><th>Evidence</th><th>Rationale</th></tr>
${result.breakdown.map((b) => `<tr><td>${h(b.name)}</td><td>${b.weight}</td><td>${b.score}/4</td><td>${Number(b.points).toFixed(2)}</td>
<td>${b.evidence_quote ? `“${h(b.evidence_quote)}” ${b.evidence_verified ? '' : '<span class="err">(not found in CV)</span>'}` : '<span class="muted">none</span>'}</td><td>${h(b.rationale)}</td></tr>`).join('')}</table>`;
}

function candidatesTable(items) {
  if (!items.length) return '<p class="muted">No candidates match.</p>';
  return `<div class="scroll"><table><tr><th>Application</th><th>Job</th><th>Status</th><th>Score</th><th>Reasons / flags</th><th>Source</th><th>Updated</th></tr>
${items.map((c) => `<tr><td><a href="/ui/candidates/${h(c.application_id)}">${h(c.application_id)}</a></td><td>${h(c.job_id || '(unrouted)')}</td>
<td>${badge(c.status)}</td><td>${c.result.total_score === null ? '<span class="muted">-</span>' : Number(c.result.total_score).toFixed(1)}</td>
<td><code>${h([...(c.result.reason_codes || []), ...(c.result.flags || [])].join(' '))}</code>
${c.result.breakdown ? `<details><summary>breakdown</summary>${breakdownTable(c.result)}<p>${h(c.result.summary)}</p>
<p class="muted">${h(c.job_id)} v${h(c.result.job_profile_version)} · ${h(c.result.prompt_version)} · ${h(c.result.model)}</p></details>` : ''}</td>
<td>${h(c.source)}</td><td class="muted">${h((c.updated_at || '').slice(0, 19).replace('T', ' '))}</td></tr>`).join('')}</table></div>`;
}

function uiRouter(service) {
  const r = express.Router();
  const safe = (fn) => (req, res) => {
    try { fn(req, res); } catch (e) { res.status(e.status || 500).send(page('Error', `<div class="card err">${h(e.code || 'ERROR')}: ${h(e.message)}</div>`)); }
  };

  r.get('/', (req, res) => res.redirect('/ui/candidates'));

  r.get('/candidates', safe((req, res) => {
    const { job_id = '', status = '' } = req.query;
    const jobs = service.listJobs();
    const list = service.listCandidates({ job_id: job_id || undefined, status: status || undefined, limit: 1000 });
    const counts = service.stats().by_job;
    const scope = job_id ? { [job_id]: counts[job_id] || {} } : counts;
    const totals = {};
    for (const byStatus of Object.values(scope)) for (const [s, n] of Object.entries(byStatus)) totals[s] = (totals[s] || 0) + n;
    res.send(page('Candidates', `<div class="card"><form class="row" method="get">
<label>Job<br><select name="job_id"><option value="">All jobs</option>${jobs.map((j) => `<option value="${h(j.job_id)}" ${j.job_id === job_id ? 'selected' : ''}>${h(j.title)} (${h(j.job_id)})</option>`).join('')}</select></label>
<label>Status<br><select name="status"><option value="">All statuses</option>${STATUSES.map((s) => `<option ${s === status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
<button>Filter</button></form>
<p>${Object.entries(totals).map(([s, n]) => `${badge(s)} ${n}`).join(' &nbsp; ') || '<span class="muted">no candidates yet</span>'}</p></div>
<div class="card"><p class="muted">${list.total} candidate(s)${list.total > list.items.length ? `, showing ${list.items.length}` : ''}. AI statuses are recommendations; final decisions are made by a person.</p>
${candidatesTable(list.items)}</div>`, req.query));
  }));

  r.get('/review', safe((req, res) => {
    const list = service.listCandidates({ status: 'NEEDS_REVIEW', limit: 1000 });
    res.send(page('Review queue', `<div class="card"><h2>Needs human review (${list.total})</h2>
<p class="muted">Records the automation would not decide on: missing form answers, unreadable CVs, low confidence, unapproved jobs, invalid model output.</p>
${candidatesTable(list.items)}</div>`, req.query));
  }));

  r.get('/candidates/:id', safe((req, res) => {
    const c = service.getCandidate(req.params.id, { history: true });
    const actions = service.allowedHumanActions(c.status);
    res.send(page(c.application_id, `<div class="card"><h2>${h(c.application_id)} ${badge(c.status)}</h2>
<p>Job: <b>${h(c.job_id || '(unrouted)')}</b> · source ${h(c.source)} · received ${h(c.created_at)}${c.duplicate_of ? ` · <span class="err">possible duplicate of <a href="/ui/candidates/${h(c.duplicate_of)}">${h(c.duplicate_of)}</a></span>` : ''}</p>
<p class="muted">Candidate: ${h(c.candidate.name)} · ${h(c.candidate.email)} (never shown to the AI)</p>
${c.result.total_score !== null ? `<p><b>Score ${Number(c.result.total_score).toFixed(1)}</b> · ${h(c.job_id)} profile v${h(c.result.job_profile_version)} · ${h(c.result.prompt_version)} · ${h(c.result.model)} · execution ${h(c.result.execution_id)}</p>${breakdownTable(c.result)}<p>${h(c.result.summary)}</p>` : ''}
${(c.result.reason_codes || []).length ? `<p>Reason codes: <code>${h(c.result.reason_codes.join(' '))}</code></p>` : ''}
${(c.result.flags || []).length ? `<p>Flags: <code>${h(c.result.flags.join(' '))}</code></p>` : ''}</div>
<div class="card"><h3>Human decision</h3>${actions.length ? `<form method="post" action="/ui/candidates/${h(c.application_id)}/decision" class="row">
<label>Your name<br><input name="decided_by" required></label><label style="flex:1">Note<br><input name="note" required style="width:100%"></label>
${actions.map((a) => `<button name="status" value="${a}" ${a === 'REJECTED' ? 'class="secondary"' : ''}>${a === 'SCREENING' ? 'Re-screen' : a === 'ADVANCED' ? 'Advance' : a === 'REJECTED' ? 'Reject' : a}</button>`).join(' ')}</form>`
      : '<p class="muted">No human action available in this status.</p>'}</div>
<div class="card"><h3>Form answers</h3><pre>${h(JSON.stringify(c.answers, null, 2))}</pre>
<h3>CV (${h(c.cv.extraction_method)}${c.cv.extraction_error ? ', ' + h(c.cv.extraction_error) : ''})</h3><pre>${h(c.cv.text) || '<span class="muted">(no text)</span>'}</pre></div>
<div class="card"><h3>History</h3><table><tr><th>When</th><th>From</th><th>To</th><th>Actor</th><th>Execution</th><th>Note</th></tr>
${c.history.map((x) => `<tr><td class="muted">${h(x.at)}</td><td>${h(x.from_status || '')}</td><td>${badge(x.to_status)}</td><td>${h(x.actor)}</td><td>${h(x.execution_id || '')}</td><td>${h(x.note || '')}</td></tr>`).join('')}</table></div>`, req.query));
  }));

  r.post('/candidates/:id/decision', (req, res) => {
    const url = `/ui/candidates/${encodeURIComponent(req.params.id)}`;
    try {
      const { status, note, decided_by: decidedBy } = req.body;
      if (!decidedBy || !note) throw Object.assign(new Error('name and note are required'), { code: 'NOTE_REQUIRED' });
      service.patchCandidate(req.params.id, { status, note, decided_by: decidedBy }, { actor: 'human' });
      back(res, url, { msg: `Moved to ${status}.` });
    } catch (e) { back(res, url, { err: `${e.code || 'ERROR'}: ${e.message}` }); }
  });

  r.get('/jobs', safe((req, res) => {
    const jobs = service.listJobs();
    res.send(page('Jobs', `<div class="card"><h2>Roles</h2><table><tr><th>Job</th><th>Title</th><th>Approved version</th><th>Draft</th></tr>
${jobs.map((j) => `<tr><td><a href="/ui/jobs/${h(j.job_id)}">${h(j.job_id)}</a></td><td>${h(j.title)}</td><td>${j.current_version ? 'v' + j.current_version : '<span class="err">none</span>'}</td>
<td>${j.drafting ? 'AI drafting…' : j.draft_version ? `v${j.draft_version} awaiting review` : '<span class="muted">-</span>'}</td></tr>`).join('')}</table></div>
<div class="card"><h2>Add a role from a job description</h2><form method="post" action="/ui/jobs">
<div class="row"><label>Job id<br><input name="job_id" required pattern="[a-z][a-z0-9_-]{1,31}" placeholder="admin"></label>
<label style="flex:1">Title<br><input name="title" required style="width:100%" placeholder="Administrative Assistant"></label></div>
<p><label>Job description<br><textarea name="jd_text" rows="10" required minlength="100"></textarea></label></p>
<button>Create and draft profile</button> <span class="muted">The AI drafts a profile once. A person reviews and approves it before anyone is scored.</span></form></div>`, req.query));
  }));

  r.post('/jobs', (req, res) => {
    try {
      service.createJob(req.body);
      back(res, `/ui/jobs/${encodeURIComponent(req.body.job_id)}`, { msg: 'Role created. The AI is drafting a profile; refresh in a moment.' });
    } catch (e) { back(res, '/ui/jobs', { err: `${e.code}: ${e.message}` }); }
  });

  r.get('/jobs/:id', safe((req, res) => {
    const job = service.listJobs().find((j) => j.job_id === req.params.id);
    if (!job) throw Object.assign(new Error(`no job ${req.params.id}`), { status: 404, code: 'JOB_NOT_FOUND' });
    let approved = null;
    let draft = null;
    try { approved = service.getApprovedProfile(job.job_id); } catch (e) { /* none yet */ }
    try { draft = service.getDraft(job.job_id); } catch (e) { /* none */ }

    const criteriaTable = (p, withQuotes) => `<div class="scroll"><table><tr><th>Criterion</th><th>Weight</th><th>Description</th>${withQuotes ? '<th>From the JD</th>' : ''}<th>Anchors</th></tr>
${p.criteria.map((c) => `<tr><td><b>${h(c.name)}</b><br><code>${h(c.id)}</code></td><td>${c.weight}</td><td>${h(c.description)}</td>
${withQuotes ? `<td>${c.jd_quote ? `“${h(c.jd_quote)}”` : '<span class="err">no quote</span>'}</td>` : ''}
<td><details><summary>0-4</summary>${['0', '1', '2', '3', '4'].map((k) => `<p><b>${k}</b> ${h(c.anchors[k])}</p>`).join('')}</details></td></tr>`).join('')}</table></div>
<p class="muted">Thresholds: shortlist ≥ ${p.thresholds.shortlist}, maybe ≥ ${p.thresholds.maybe}, review below confidence ${p.thresholds.min_confidence}</p>
<details><summary>Pre-filter rules</summary><pre>${h(JSON.stringify(p.prefilter, null, 2))}</pre></details>`;

    let draftHtml = job.drafting ? '<p>The AI is drafting a profile from the job description…</p>' : '<p class="muted">No draft. Editing the approved profile below creates a new draft version; the approved one never changes.</p>';
    if (draft) {
      const openFlags = draft.profile.bias_flags.filter((f) => !f.resolved);
      const blocked = draft.check_errors.length > 0 || openFlags.length > 0;
      draftHtml = `<p>Draft <b>v${draft.profile.version}</b> · created by ${h(draft.profile.created_by)}${draft.profile.builder ? ` (${h(draft.profile.builder.prompt_version)}, ${h(draft.profile.builder.model)})` : ''}</p>
${draft.check_errors.length ? `<div class="flag"><b>Check errors (fix before approving)</b><ul>${draft.check_errors.map((e) => `<li>${h(e)}</li>`).join('')}</ul></div>` : '<p class="msg">All code checks pass.</p>'}
<h3>Bias flags</h3>${draft.profile.bias_flags.length ? draft.profile.bias_flags.map((f) => `<div class="flag ${f.resolved ? 'resolved' : ''}"><b>${h(f.category)}</b>: “${h(f.phrase)}” in <code>${h(f.target)}</code>. ${h(f.message)}
${f.resolved ? `<br><span class="msg">Resolved: ${h(f.resolution_note)}</span>` : `<form method="post" action="/ui/jobs/${h(job.job_id)}/flags/${h(f.id)}" class="row"><input name="note" required minlength="5" placeholder="How was this resolved? (e.g. removed the criterion)" style="flex:1"><button class="secondary">Mark resolved</button></form>`}</div>`).join('') : '<p class="muted">No bias flags.</p>'}
<h3>Criteria</h3>${criteriaTable(draft.profile, true)}
<h3>Edit draft (JSON)</h3><form method="post" action="/ui/jobs/${h(job.job_id)}/draft"><textarea name="json" rows="18">${h(JSON.stringify({ title: draft.profile.title, prefilter: draft.profile.prefilter, criteria: draft.profile.criteria, nice_to_haves: draft.profile.nice_to_haves, thresholds: draft.profile.thresholds }, null, 2))}</textarea>
<p><button class="secondary">Save draft</button></p></form>
<h3>Approve</h3><form method="post" action="/ui/jobs/${h(job.job_id)}/approve" class="row"><label>Approved by<br><input name="approved_by" required></label>
<button ${blocked ? 'disabled' : ''}>Approve and freeze v${draft.profile.version}</button>${blocked ? '<span class="err">Blocked until check errors are fixed and bias flags resolved.</span>' : ''}</form>`;
    }

    res.send(page(job.title, `<div class="card"><h2>${h(job.title)} <code>${h(job.job_id)}</code></h2>
<p>Versions: ${job.versions.map((v) => `v${v.version} <span class="badge">${h(v.status)}</span>`).join(' ')}</p></div>
<div class="card"><h2>Draft</h2>${draftHtml}
${!draft && approved ? `<form method="post" action="/ui/jobs/${h(job.job_id)}/draft"><input type="hidden" name="json" value="{}"><button class="secondary">Start a new draft from v${approved.version}</button></form>` : ''}</div>
<div class="card"><h2>Approved profile ${approved ? `v${approved.version}` : ''}</h2>${approved ? `<p class="muted">Approved by ${h(approved.approved_by)} at ${h(approved.approved_at)}. Frozen: every candidate scored against v${approved.version} used exactly this rubric.</p>${criteriaTable(approved, Boolean(approved.source_jd_text))}` : '<p class="err">No approved profile: candidates for this job go to NEEDS_REVIEW (JOB_NOT_APPROVED).</p>'}</div>`, req.query));
  }));

  r.post('/jobs/:id/draft', (req, res) => {
    const url = `/ui/jobs/${encodeURIComponent(req.params.id)}`;
    try {
      const patch = JSON.parse(req.body.json || '{}');
      service.editDraft(req.params.id, patch);
      back(res, url, { msg: 'Draft saved.' });
    } catch (e) { back(res, url, { err: `${e.code || 'BAD_JSON'}: ${e.message}${e.details ? ' ' + JSON.stringify(e.details).slice(0, 300) : ''}` }); }
  });
  r.post('/jobs/:id/flags/:flag', (req, res) => {
    const url = `/ui/jobs/${encodeURIComponent(req.params.id)}`;
    try { service.resolveBiasFlag(req.params.id, req.params.flag, req.body.note); back(res, url, { msg: 'Flag resolved.' }); } catch (e) { back(res, url, { err: `${e.code}: ${e.message}` }); }
  });
  r.post('/jobs/:id/approve', (req, res) => {
    const url = `/ui/jobs/${encodeURIComponent(req.params.id)}`;
    try { const p = service.approveDraft(req.params.id, req.body.approved_by); back(res, url, { msg: `Approved and frozen as v${p.version}.` }); } catch (e) { back(res, url, { err: `${e.code}: ${e.message}` }); }
  });

  return r;
}

module.exports = { uiRouter };
