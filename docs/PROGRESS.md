# Progress
**Current phase:** 3 (Phases 4 and 5 have their pure code done) · **Target finish:** straight-through build (D-008) · **Pace:** continuous; lessons deferred to a review pass

## Now / Next / Blocked
- **Now:** full WF-10 (profile → pre-filter → redact → extract → score → evidence → status → write-back → RunLog) and WF-12 (Gemini call + contract check + one repair) are WRITTEN and unit-tested, NOT yet imported or run in n8n
- **Next:** (1) learner creates the n8n credential "Gemini API" (type Google Gemini(PaLM) Api); (2) `npm run n8n:import`; (3) 5-per-role smoke run; (4) D-025 record (HTTP to Gemini for screening, AI nodes for WF-05); Phases 6–9
- **Blocked:** n8n Gemini credential (learner)
- **Note:** CRM reset under D-022 at 2026-10-17 (dedupe proof); 222 reseeded

## Phases
| # | Phase | Status | Planned | Done | Tag |
|---|---|---|---|---|---|
| 0 | Orientation and setup | ✅* | 2026-10-17 | 2026-10-17 | phase-0 |
| 1 | Contracts and job profiles | ✅* | 2026-10-17 | 2026-10-17 | phase-1 |
| 2 | Mock CRM and synthetic applicants | ✅* | 2026-10-17 | 2026-10-17 | phase-2 |
| 3 | Triggers and intake | ✅* | 2026-10-17 | 2026-10-17 | phase-3 |
| 4 | Boolean pre-filter | 🟨 code done (222/222 offline); wiring into WF-10 next | straight-through | | |
| 5 | AI screening and scoring | 🟨 deterministic parts done; LLM calls next | straight-through | | |
| 6 | CRM write-back and error handling | ⬜ | straight-through | | |
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

## Learner review pass (D-008), collected as we go
- Concepts deferred: see LEARNING (`⏭`)
- Decisions to confirm: D-014 to D-019 (`pending learner review`)
- Exercises: hello-items item-count prediction (Phase 0); find a loose field in the ScoreCard schema (Phase 1); spot-check 10 answer-key rows (Phase 2)

## Session log (newest first)
### S-01 · 2026-10-17
- Done: audit; D-001 to D-019; Phase 0 scaffold and Compose (n8n, GreenMail); n8n REST sync scripts; Phase 1 contracts, validators, profiles, bundler; Phase 2 CRM, generator, seeding
- Verified (evidence): 82/82 tests (`npm test`); CRM healthy in Compose; n8n → `http://crm:3000` OK; 222 seeded, re-seed creates 0 (idempotent create); duplicate marked; generator byte-identical across runs
- Not yet verified: anything inside n8n (no API key yet); email path; LLM steps
- Concepts: C-01 to C-08, C-22, C-32 deferred (⏭)
- Decisions: D-001 to D-019
- Lessons: L-001 (secret in logs), L-002 (blind edit + hanging tests), L-003 (shell quoting)
- Next: Phase 4 pre-filter code; Phase 3 once the API key is in `.env`
