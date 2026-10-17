# Progress
**Current phase:** 7 — Add any role from a job description · **Target finish:** straight-through build (D-008) · **Pace:** continuous; learner now doing retrieval questions at session start

## Now / Next / Blocked
- **Now:** Phase 7: WF-05 job-profile builder (n8n AI nodes), Administrative Assistant JD + biased JD, approval page, JOB_NOT_APPROVED path
- **Next:** Phase 8 full eval incl. v1 vs v2 on identical data
- **Blocked:** nothing
- **Notes:** CRM resets under D-022 on 2026-10-17 (dedupe proof; dataset recalibrations L-005). The dataset was regenerated after the v2 run (long-CV dates), so reseed before Phase 8. The n8n Gemini credential is named "Google Gemini(PaLM) Api account".

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
| 7 | Add any role from a job description | ⬜ | straight-through | | |
| 8 | Prove it works every time | ⬜ | straight-through | | |
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

## Learner review pass (D-008), collected as we go
- Concepts deferred: see LEARNING (`⏭`)
- Decisions to confirm: D-014 to D-019 (`pending learner review`)
- Exercises: hello-items item-count prediction (Phase 0); find a loose field in the ScoreCard schema (Phase 1); spot-check 10 answer-key rows (Phase 2)

## Session log (newest first)
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
