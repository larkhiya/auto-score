# Progress
**Current phase:** 3 (Phases 4 and 5 have their pure code done) · **Target finish:** straight-through build (D-008) · **Pace:** continuous; lessons deferred to a review pass

## Now / Next / Blocked
- **Now:** reseed the CRM with the corrected dataset (D-022), then Phase 3 intake workflows (WF-01, WF-02, WF-10 stub)
- **Next:** wire the Phase 4 pre-filter into WF-10; Phase 5 LLM calls
- **Blocked:** nothing (both keys in `.env`; CRM resets approved, D-022)

## Phases
| # | Phase | Status | Planned | Done | Tag |
|---|---|---|---|---|---|
| 0 | Orientation and setup | ✅* | 2026-10-17 | 2026-10-17 | phase-0 |
| 1 | Contracts and job profiles | ✅* | 2026-10-17 | 2026-10-17 | phase-1 |
| 2 | Mock CRM and synthetic applicants | 🟨 reseed pending | 2026-10-17 | | |
| 3 | Triggers and intake | ⬜ | straight-through | | |
| 4 | Boolean pre-filter | ⬜ | straight-through | | |
| 5 | AI screening and scoring | ⬜ | straight-through | | |
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
- [~] CRM page shows 222 NEW candidates filterable by job (verified with the first dataset; reseed with the corrected dataset pending reset approval)

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
