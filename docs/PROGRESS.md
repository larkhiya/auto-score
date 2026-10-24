# Progress
**Current phase:** 8 — Prove it works every time · **Target finish:** straight-through build (D-008) · **Pace:** continuous; learner now doing retrieval questions at session start

## Now / Next / Blocked
- **Now:** Phase 8, quota day 2 (Pacific date 2026-10-24; resets at midnight Pacific = 07:00 UTC, L-018): consistency `~e2`/`~e3` (~80), v1 on the 59-record sample (~118), final eval:smoke (~18), final report. Waiting for the learner's approval of the ~220 calls
- **Next:** the learner decides how to handle model noise (review band, median of runs, or accept), using the consistency numbers; then P5 of crm-platform (move to the shared CRM, `C:\Users\larkhiya\crm-platform`)
- **Blocked:** nothing (the second half waits for the quota reset)
- **Notes:** no CRM reset for Phase 8: every run screens tagged copies (`<ref>~e1` etc.), so earlier evidence stays. The n8n Gemini credential is named "Google Gemini(PaLM) Api account".

## Phases
| # | Phase | Status | Planned | Done | Tag |
|---|---|---|---|---|---|
| 0 | Orientation and setup | ✅* | 2026-10-17 | 2026-10-17 | phase-0 |
| 1 | Contracts and job profiles | ✅* | 2026-10-17 | 2026-10-17 | phase-1 |
| 2 | Mock CRM and synthetic applicants | ✅* | 2026-10-17 | 2026-10-17 | phase-2 |
| 3 | Triggers and intake | ✅* | 2026-10-17 | 2026-10-17 | phase-3 |
| 4 | Boolean pre-filter | ✅* | 2026-10-17 | 2026-10-17 | phase-4 |
| 5 | AI screening and scoring | ✅* | 2026-10-17 | 2026-10-17 | phase-5 |
| 6 | CRM write-back and error handling | ✅* | 2026-10-17 | 2026-10-17 | phase-6 |
| 7 | Add any role from a job description | ✅* | 2026-10-18 | 2026-10-18 | phase-7 |
| 8 | Prove it works every time | 🟨 | straight-through | | |
| 9 | Package for portfolio and interviews | ⬜ | straight-through | | |

Status: ⬜ not started · 🟨 in progress · ✅ done (all "Done when" items met, with evidence) · ✅* done except the learner's own items, deferred under D-008

## Phase checklists
**Phase 0**
- [x] n8n runs from Compose (2.43.7, healthy; editor HTTP 200)
- [x] Hello workflow run in n8n: execution **1**, status success; items per node 1 → 3 → 3 → 2 → 2. Learner's prediction exercise deferred (D-008).
- [x] Sync method proven: `npm run n8n:roundtrip` → "Round trip lossless."
- [x] All docs exist
- [x] First commit made (`f78ea25`) · tagged `phase-0`

**Phase 1**
- [x] 7 schemas + 11 valid / 24 invalid fixtures; contract tests pass
- [x] csr.v1 and sdr.v1 validate (schema + code checks)
- [x] Expression mapping demo ran in n8n (execution 1: `execution_id` mapped from `{{ $execution.id }}` = "1")
- [ ] C-05 at can-explain (deferred, ⏭)

**Phase 2**
- [x] CRM in Compose; n8n reaches it by service name (`wget http://crm:3000/health` from the n8n container → `{"ok":true}`)
- [x] Tests prove illegal transitions are rejected for candidates and job profiles (`tests/crm-state.test.js`, `tests/crm-api.test.js`)
- [x] Answer key exists (`data/ground_truth.csv`, 222 rows); Claude spot-checked 10 rows; learner spot-check deferred
- [x] CRM page shows 222 NEW candidates filterable by job (corrected dataset reseeded under D-022)

**Phase 3**
- [x] One CRM application (`app_000226`, WF-01 exec 22 → WF-10 exec 23) and email applications (WF-03) reach WF-10 as schema-valid ApplicationReceived of one shape, with the right job_id (csr, sdr, null for an unknown plus-address)
- [x] Same webhook twice → one claim (exec 23 CLAIMED, exec 26 DUPLICATE_SKIPPED); same email twice → one record, one claim (execs 85/87, concurrent)
- [x] Wrong webhook secret → 403
- [x] All 6 email types: PDF (`pdf_text`), DOCX (`docx`), TXT, scanned PDF (`NO_TEXT_LAYER`), no attachment (`NO_ATTACHMENT`), unknown job (`job_id: null`)
- [x] Normalize, retry and extract unit tests pass (136 total)

**Phase 4**
- [x] Pre-filter matches the answer key on 100% of the dataset for both roles (222/222, outcome and reason codes; `tests/prefilter.test.js`; mutation checks prove the test has teeth)
- [x] Wired into WF-10; live runs show pre-filter fails and reviews with **0 LLM calls** (RunLog `llm.calls`)
- [ ] C-13 at can-explain (deferred, ⏭)

**Phase 5**
- [x] 20 per role with prompt v2: **37/40** agree with the answer key; 100% schema-valid output (0 repairs needed); misses = 2 cross-applicants (known, D-027) + 1 long CV with genuinely inconsistent generated dates (generator fixed)
- [x] Evidence check active (zeroed a stitched quote; L-006 fixed the list-marker false negative)
- [x] Status mapping tests at 54.9 / 55 / 74.9 / 75 pass for both profiles
- [x] Injection test: 3/3 pass, no score increase and flagged every time (`reports/injection-test-2026-10-17.json`)
  - **Correction 2026-10-18 (L-015):** that file was later overwritten by an accidental run (L-009) and now shows **2/3**: all 3 flagged and sent to NEEDS_REVIEW, but sdr-006 scored +7.5 against a 6.25 tolerance. The 3/3 run is no longer in git. Phase 8 re-examines this row against the measured noise.
- [x] Name-swap counterfactual: identical scores for the pairs in both roles; redacted input identical (unit test)
- [x] No role-specific words in any screening prompt (test)
- [x] Cost per record recorded: about 3.3k input / 1.5k output tokens, 7–10 s, $0 on the free tier (RunLogs)
- [x] Learner reviewed the 20-per-role results and chose the fixes (L-005, D-026, D-027)

**Phase 6**
- [x] Write-back is an idempotent PATCH (Idempotency-Key, compare-and-set claim), and transitions are enforced by the CRM (Phase 2–3 tests)
- [x] Retries: exponential backoff + jitter on 429/5xx/timeouts, none on other 4xx, 10 s timeouts (`src/retry.js`, WF-11, `tests/retry.test.js`)
- [x] WF-90 (Error Trigger) and WF-91 (dead letter in an n8n Data Table, best-effort CRM ERROR, email to ops, RunLog), D-028
- [x] `scripts/replay-dlq.js`, idempotent (a second run found 0 open)
- [x] RunLog per execution (WF-10 for completed runs, WF-91 for failures)
- [x] NEEDS_REVIEW queue page `/ui/review`
- [x] **FAIL_RATE=0.3 on 50 records: 50 in = 50 out, all final, 0 dead letters (retries absorbed every failure); 50/50 agree with the answer key** (`reports/chaos-2026-10-17T15-52-18-943Z.json`)
- [x] Total outage (fail_rate 1, 2 records): both dead-lettered with `crm_marked: false`, `notified: true`; 2 in = 2 out; replayed to final (`reports/chaos-2026-10-17T15-38-53-675Z.json`)
- [x] Real outage (CRM container stopped after 2 of 6): 1 final + 5 ERROR with dead letters, 6 in = 6 out; replay moved all 5 to final; 6/6 agree with the answer key (`reports/chaos-2026-10-17T15-54-24-365Z.json`)
- Observation: a stopped container times out (10 s per try) rather than refusing, so the claim retries lasted about a minute and the CRM was back in time for the ERROR mark. Retry budget vs outage length decides "dead letter" vs "slow success".

**Phase 7**
- [x] WF-05: CRM `job.draft_requested` → n8n AI chain (Gemini 3.8 Flash + Structured Output Parser, D-029) → code assembles the profile, runs the contract + §5.5 checks and the bias check → DRAFT with errors and flags; one repair loop; a broken draft is recorded as failed and can be re-drafted
- [x] CRM job page: paste a JD, review criteria and must-haves beside their JD quotes, flags highlighted, edit, approve (freezes the version), re-draft
- [x] Biased JD: 9 flags; Approve is disabled in the UI and refused by the server while any flag is unresolved (`tests/jobprofile.test.js`)
- [x] Malformed drafts rejected: weights summing to 90, an unregistered check, a quote not in the JD, a must-have without a JD quote (`tests/builder.test.js`, `tests/jobprofile.test.js`)
- [x] Builder consistency over 3 drafts of the Admin JD: 3/3 valid; 3–4 of 5 criteria matched, mean weight difference 1.7–2.5, must-have overlap 0.5–0.6 (moderate; `reports/builder-consistency-admincheck-2026-10-17.json`)
- [x] Administrative Assistant v1 approved by the learner in the CRM (`approved_by: jcw`, 2026-10-17T16:22:39Z UTC) and exported to `config/jobs/admin.v1.json` (`scripts/export-profile.js`)
- [x] 31 Admin applicants from the approved profile, on their own random stream: the 222 csr/sdr rows and the role-switch set are byte-identical. Pre-filter matches the answer key on **253/253** (`tests/prefilter.test.js`)
- [x] Live pipeline: **31/31 agree with the answer key** (app_000223–253). 19 scored with 38 LLM calls and 0 repairs; 12 decided by the pre-filter with 0 LLM calls. Strong 100, medium 65, thin 11.25–16.25; name-swap pair 65/65; every evidence quote verified
- [x] Every score records its `job_profile_version` (31/31 Admin records: v1)
- [x] JOB_NOT_APPROVED: an application to the unapproved `carebias` job → NEEDS_REVIEW `JOB_NOT_APPROVED`, 0 LLM calls (app_000254)
- [x] No code changes for the new role: the Admin work touches only `data/`, `scripts/`, `tests/prefilter.test.js` and `config/jobs/admin.v1.json`. `git diff --stat HEAD -- src prompts/screening_v1.md prompts/screening_v2.md workflows contracts crm` is empty. Since `phase-6`, the screening workflows changed only through re-bundled shared modules from part 1 (the builder prompt added to the prompt registry; the JobProfile 1.1.0 validator). Screening logic and screening prompts are unchanged. n8n matches git
- [x] Role-switch set: **20/20 CVs move in the expected direction** (target ≥ 18), 40 records all scored, 80 LLM calls, learner approved the run (`reports/role-switch-2026-10-17.json`, `scripts/role-switch-report.js`)
- [ ] Optional bulk re-score when a new version is approved (not built; optional in the brief)
- [ ] C-33 at can-explain (deferred, ⏭)
- Finding (D-030): the approved keyword list has no "Executive Assistant", "Personal Assistant" or "Secretary", so a strong PA is rejected (`admin-022`). The draft also turned two JD requirements into weighted criteria rather than must-haves: Office/Excel became `office_software_proficiency` (weight 25), and "clear written and spoken English" has no check at all. Both are the reviewer's call; the fix is a v2.
- Finding (role switch): the gaps are lopsided. Support CVs lose 44–74 points as SDRs (all 10 NOT_A_FIT). Prospecting CVs lose only 1.25–46 points as CSRs, 4 of 10 are still SHORTLISTED as CSRs, and `rs-12` held its direction by 1.25 points. Cause: the csr criteria are generic enough that sales evidence counts. Across the 10 prospecting CVs scored for csr, any quota number earns `results_evidence` 3.8/4 on average, HubSpot call-logging earns `support_tools` 3/4, cold calls count as customer-facing (2.8) and objection handling counts as de-escalation (2.6). The sdr rubric is specific, so it doesn't happen the other way. Same root as the Phase 5 cross-applicant misses (D-027). Fix = a csr v2 with support-specific anchors (learner's decision).
- Caveat: Admin scores are flat (every strong 100, every medium 65) because the personas are templates. That shows the anchors are applied consistently, not that scoring is accurate on varied CVs. Phase 8 should add varied CVs.

**Phase 8**
- [x] LLM fault injection: `llm-proxy/` in front of Gemini (D-031); 6 offline tests; 0 proxy log lines contain the key
- [x] `npm run eval:smoke` (5 records per role, end to end, fresh copies each run): **15/15**, 18 LLM calls, all through the proxy
- [x] `npm test`: 164/164
- [x] Failure matrix, non-LLM rows: **13/13** (`reports/failure-matrix-2026-10-17-dup-job-bias-email.json`, `…-crm.json`):
  - duplicate webhook ×3 → 1 claim
  - unapproved job → JOB_NOT_APPROVED; unknown job id refused (JOB_NOT_FOUND)
  - biased draft: 9 unresolved flags, Approve disabled
  - 7 emails (PDF, DOCX, TXT sent twice, scanned, no attachment, unknown job, empty body)
  - CRM at 30% failures + 300 ms latency: 10 in = 10 out
  - CRM container stopped for 40 s: 6 in = 6 out, 4 dead letters replayed, 6/6 final
- [x] Failure matrix, LLM rows on a fresh quota: **5/5** (`reports/failure-matrix-2026-10-18-llm.json`), about 8 real calls:
  - invalid JSON once → repaired → SHORTLISTED (3 calls, 9 s)
  - invalid JSON twice → NEEDS_REVIEW INVALID_MODEL_OUTPUT
  - two 429s with RetryInfo 3 s → backoff → SHORTLISTED (14 s)
  - 90 s timeout → one retry → SHORTLISTED (98 s)
  - 503 on every call → ERROR LLM_UNAVAILABLE + dead letter → replay → SHORTLISTED (D-032)
  - The first attempt on 2026-10-17 ran into the real daily quota (L-014) and a harness crash (L-013); this run supersedes it
  - Side observation: the same strong CV scored 93.75 in one case and 90 in the others. Temperature 0 is not perfectly deterministic; the consistency run measures how much
- [x] Fixed what the matrix found: harness crash (L-013); scanned-PDF `extraction_method` inconsistency (contract + generator, D-032)
- [x] Full dataset run (`~e1`, 2026-10-18, 370 LLM calls, 0 repairs), interim `reports/eval-2026-10-18.md`:
  - records in = out: 253 → 253, 0 ERROR
  - pre-filter **253/253**
  - final status **245/253 (96.8%)**: csr 105/111, sdr 109/111, admin 31/31
  - LLM-scored records 177/185 (95.7%); NEEDS_REVIEW 5.5% (expected 5.5%)
  - §5.4 rows: **9/11**
- [ ] Two §5.4 rows fail, with one root cause, found by the eval:
  - **Name-swap:** the model input was byte-identical in all 5 pairs (pass: the name cannot reach the model). But 4 pairs scored differently on one run each, by up to 17.5 points; sdr pair 1 crossed the 55 threshold. Cause: `gemini-3.5-flash-lite` is not deterministic at temperature 0.
  - **Injection, model level:** a single-run delta of +7.5 against a 6.25 tolerance. The tolerance is below the measured noise, so one run cannot separate an injection effect from noise. The live pipeline caught all 3 injected CVs before the LLM.
  - The fix is decided with the consistency numbers from the next quota day. Options: a review band around thresholds, or a median of several runs; plus noise-based test tolerances or repeated runs.
- [x] Silent-loss path 1 (L-016), **CRM door: fixed (D-033).** The CRM's webhook delivery log can be listed and redelivered (`GET /webhook-deliveries`, `POST …/:id/redeliver`, 4 new CRM tests). WF-04 asks for a redelivery of every failed `application.created` once a minute; seeded NEW records were never announced, so they are never touched.
  - `app_000607` (NEW since 2026-10-18) → WF-01 exec 4407 → WF-10 4408 → PREFILTER_REJECTED, 0 LLM calls; delivery 8: 4 attempts, delivered
  - Matrix `doors` row 1 ✓ (`reports/failure-matrix-2026-10-23-doors.json`): n8n stopped 21 s while 1 CRM application and 1 email arrive. The CRM application (`app_000613`) was redelivered → PREFILTER_REJECTED (WF-10 4480); the email (`app_000614`) → NEEDS_REVIEW MISSING_ANSWER (WF-10 4489). Both final 87 s after restart, 0 LLM calls. A forced 2nd redelivery → WF-10 4495 DUPLICATE_SKIPPED, still 1 claim
- [ ] Silent-loss path 2 (L-016), **email door: fixed for n8n restarts, open for mail-server-only restarts (D-034).** WF-02 now runs with `trackLastMessageId: false` and `forceReconnect: 1`.
  - The bug was re-created on the old config: an email sent with bookmark 39 was ignored. After the fix it was caught up 1 min after publishing (`app_000608`, WF-02 exec 4413); the original waiting email had been lost earlier, when GreenMail restarted.
  - The node sets its UID bookmark again in memory after every batch, so a GreenMail restart while n8n keeps running still strands mail until WF-02 is re-published. Matrix `doors` row 2 ✗: not processed in 180 s; re-publishing WF-02 (the runbook) → processed 66 s later (`app_000615`, 0 LLM calls)
  - **Learner decision:** accept the gap with the runbook, add a WF-02 re-publish watchdog (needs an n8n API key inside n8n), or change the intake at the Gmail step (D-034 options C/D/E)
- [x] Consistency (`~e2`, `~e3`, 2026-10-24, 80 calls, 0 repairs), in `reports/eval-2026-10-24.md`:
  - same status in all 3 runs: 19/20 (csr-013 flips, 51.25 / 56.25 / 58.75 on the 55 line);
  - score spread: mean 4.5, median 5, p90 8.75, max 11.25;
  - median of 3 runs: 20/20 against the answer key;
  - review-band simulation on `~e1`: ±2.5 → 4.9% more reviews, 6/8 errors caught; ±3.75 → 15.1%, 8/8
- [x] v1 vs v2 on the 59-record sample (`~v1`, 122 calls, 4 repairs):
  - v1 57/59, v2 58/59;
  - 1 status change (sdr-006);
  - mean |Δscore| 2.86, which is below run-to-run noise: no accuracy difference can be claimed;
  - v2 needed 0 repairs.
  - WF-10 was switched to `screening_v1` for the run and back; afterwards `git diff -- workflows src` was empty and n8n matched git
- [x] Final regression: `npm test` 168/168, `npm run build:check` up to date, `npm run eval:smoke` **15/15** (18 calls)
- [x] Final report `reports/eval-2026-10-24.md` (+ `.json`). The interim `reports/eval-2026-10-18.md` is kept as evidence
- [ ] Learner: read the confusion matrices in `reports/eval-2026-10-24.md` and explain the biggest error pattern first (Claude's notes are collapsed)
- [ ] Learner decisions:
  - how to handle model noise (D-035);
  - how to judge the two §5.4 rows that fail on single-run noise (name-swap, model-level injection);
  - the D-034 email gap

## Learner review pass (D-008), collected as we go
- Concepts deferred: see LEARNING (`⏭`)
- Decisions to confirm: D-014 to D-021, D-023 to D-025, D-028 to D-034 (`pending learner review`); D-034 also needs a choice for the open mail-server-restart gap
- Profile review: the Admin v1 gaps above (missing PA titles, English, Office as a criterion rather than a must-have), and the csr anchors that credit sales evidence (role-switch finding). Decide whether to make v2s
- Exercises: hello-items item-count prediction (Phase 0); find a loose field in the ScoreCard schema (Phase 1); spot-check 10 answer-key rows (Phase 2)

## Session log (newest first)
### S-03 · 2026-10-24 (UTC) · Phase 8, quota day 2
- Done: consistency runs `~e2`/`~e3`; prompt v1 vs v2 on 59 records; final `npm test` + `eval:smoke`; final report `reports/eval-2026-10-24.md`; review-band simulation on `~e1` (no calls)
- Verified (evidence): the Phase 8 checklist lines above
- Found: run-to-run noise (mean spread 4.5) is larger than the v1 vs v2 difference (2.86); a review band of ±2.5 catches 6 of the 8 `~e1` errors for 4.9% more reviews
- Not verified: the noise tail beyond 20 CVs × 3 runs (the name-swap twins showed 17.5 once)
- Lessons: L-018 (the quota resets at midnight Pacific, not 00:00 UTC; L-014 widened)
- LLM calls this quota day: 220 of 500 (80 + 122 + 18), Pacific date 2026-10-24
- Also in this session: the shared CRM platform `C:\Users\larkhiya\crm-platform` (Twenty + crm-gateway) was built, P0–P4; it will replace the mock CRM after Phase 8 (its P5)

### Side session · 2026-10-19 to 2026-10-23 · Phase 8 (L-016 fixes, run in the background)
- Done: the CRM webhook delivery log (list + redeliver) with a migration; WF-04 Reconcile webhooks; WF-02 `trackLastMessageId: false` + `forceReconnect: 1`; matrix group `doors` (saves after every check)
- Verified (evidence): `app_000607` final via WF-04; matrix `doors` 1/2 (row 2 is the known D-034 gap, recovered by the runbook); `npm test` 168/168; n8n matches git (11 workflows)
- Not verified: Gmail behaviour (D-034 revisit); a backlog of more than 10 missed webhooks (designed for, not run)
- Decisions: D-033, D-034 · Lessons: L-016 fix line, L-017
- LLM calls: 0
- Interruptions: Docker Desktop stopped three times. Causes: Windows sleep (17 Oct), quit from Docker's own menu (18 and 19 Oct, `actionMenuQuit`), and a stale `dockerInference` socket from unclean shutdowns that crashed its start (folder renamed to `run.stale-20261019`)

### S-02 (continued) · 2026-10-18 · Phase 8 (part 2, quota day 1 of Plan A)
- Done: restarted the stack (Docker Desktop had stopped overnight); LLM-fault matrix rows 5/5; full dataset run `~e1`; interim eval report with Claude's analysis collapsed (`reports/eval-notes.md`); `scripts/lib/eval-sets.js` (fixed consistency and v1 subsets)
- Verified (evidence): `reports/eval-2026-10-18.md`: pre-filter 253/253, status 245/253, records in = out, §5.4 9/11; matrix 18/18 live checks; 164 tests
- Found: model noise at temperature 0 (up to 17.5 points on identical input) explains the two failing §5.4 rows and at least one status miss; a stale "3/3" injection claim (L-015)
- Not yet verified: consistency across 3 runs, v1 vs v2, the final regression run
- Lessons: L-015 (Learned Rule added)
- LLM calls this quota day: about 378 of 500
- Next: quota day 2 (after 00:00 UTC): consistency `~e2`/`~e3` (~80), v1 sample (~118), final eval:smoke (~18). Then the learner decides how to handle the noise

### S-02 (continued) · 2026-10-18 · Phase 8 (part 1)
- Done: llm-proxy + seam (`LLM_BASE_URL`); `scripts/lib/pipeline.js`; seed variants; `eval-smoke`, `failure-matrix`, `eval-report`; matrix run; fixes (harness, scanned-PDF convention)
- Verified (evidence): eval:smoke 15/15; matrix 13/13 non-LLM rows plus 3 LLM rows passing; 164 tests; n8n matches git
- Not yet verified: the full dataset run and everything computed from it; the rate-limit "backoff then success" row on a fresh quota
- Decisions: D-031, D-032 (+ D-007 quota fact) · Lessons: L-012, L-013, L-014 (Learned Rules L-003 widened, L-014 added)
- LLM calls this part: about 27 before the daily quota (500) ran out
- Next: the learner picks how to split the large run across quota days

### S-02 (continued) · 2026-10-18 · Phase 7 (part 2)
- Done: confirmed the learner's Admin approval in the CRM database; `scripts/export-profile.js`; Admin personas (`scripts/lib/personas-admin.js`, calibrated to the approved anchors, L-005); generator extended on its own random stream; answer-key test covers admin; seeded and screened 31 Admin applicants; JOB_NOT_APPROVED check; no-code-change diff
- Verified (evidence): see the Phase 7 checklist; 158 unit tests; n8n matches git
- Role-switch run (learner approved, 80 calls): 20/20 moved in the expected direction; lopsided gaps traced to the csr anchors (finding above)
- Not yet verified: varied (non-template) Admin CVs; csr behaviour on real sales-to-support career changers
- Decisions: D-029, D-030 · Lessons: L-011
- LLM calls this part: 118 (38 Admin + 80 role switch; free tier, $0)
- Next: Phase 8

### S-02 (continued) · 2026-10-17 · Phase 6
- Done: `src/deadletter.js` (+ tests), `dead_letters` Data Table, WF-91, WF-90, caller dead-lettering in WF-01/WF-03/WF-02, replay events, `scripts/replay-dlq.js`, `scripts/chaos-run.js`, `n8n:drift`
- Verified (evidence): 3 chaos reports (above); replays 3/3 and 5/5; 152 unit tests; n8n matches git
- Not yet verified: an email failing before its CRM record exists (manual dead letter path) live; LLM-outage dead letters (only unit-tested classification)
- Decisions: D-028 · Lessons: L-007, L-008
- LLM calls this session: about 320 (free tier, $0)
- Next: Phase 7

### S-02 · 2026-10-17
- Done: start-session by hand (the skill wasn't loaded in this session); C-10 retrieval (3 tries → 🟨); Gemini credential linked; WF-10 + WF-12 live; smoke runs; 20-per-role runs with v1 (32/40) and v2 (37/40); injection test; scripts `screen-records`, `show-results`, `injection-check` (was injection-test, L-009), `lib/score-direct`
- Verified (evidence): see the Phase 4 and 5 checklists (RunLogs, `show-results` output, injection report); 146 tests
- Not yet verified: v1 vs v2 on identical data (Phase 8); the full dataset through the live pipeline
- Concepts: C-10 → 🟨 practiced; C-12 to C-21 deferred with pointers
- Decisions: D-025, D-026, D-027 · Lessons: L-005 (recurred twice), L-006
- Next: Phase 6

### S-01 · 2026-10-17
- Done: audit; D-001 to D-019; Phase 0 scaffold and Compose (n8n, GreenMail); n8n REST sync scripts; Phase 1 contracts, validators, profiles, bundler; Phase 2 CRM, generator, seeding
- Verified (evidence): 82/82 tests (`npm test`); CRM healthy in Compose; n8n → `http://crm:3000` OK; 222 seeded, re-seed creates 0 (idempotent create); duplicate marked; generator byte-identical across runs
- Not yet verified: anything inside n8n (no API key yet); email path; LLM steps
- Concepts: C-01 to C-08, C-22, C-32 deferred (⏭)
- Decisions: D-001 to D-019
- Lessons: L-001 (secret in logs), L-002 (blind edit + hanging tests), L-003 (shell quoting)
- Next: Phase 4 pre-filter code; Phase 3 once the API key is in `.env`
