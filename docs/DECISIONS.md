# Decisions

Template:
```
## D-### · <title>
- **Date:** · **Phase:** · **Status:** accepted | superseded by D-### | pending learner review
- **Decided by:** learner | Claude | together (Claude recommended: …)
- **Context:** · **Options:** · **Decision:** · **Why:** · **Trade-offs accepted:** · **Revisit if:**
```

Under D-008, Claude makes design choices during the straight-through build and marks them **pending learner review**. The learner confirms or changes each one in the review pass.

---

## D-013 · Rubric weights and thresholds for `csr` and `sdr`
- **Date:** 2026-10-17 · **Phase:** 0 · **Status:** accepted
- **Decided by:** learner (Claude recommended the brief's defaults)
- **Context:** The learner owns the weights and thresholds (brief Phase 1). Using the defaults lets the build continue without stopping.
- **Options:** A: brief §5.2 defaults (+ no pause; − not tuned by the learner) · B: learner sets them in Phase 1 (+ ownership; − pauses the build)
- **Decision:** A. Weights as in §5.2. Thresholds for both roles: total ≥ 75 → SHORTLISTED, 55 to under 75 → MAYBE, < 55 → NOT_A_FIT.
- **Why:** reasonable starting points; any change creates a new profile version, so nothing is locked in.
- **Trade-offs accepted:** the weights reflect the brief author's judgement, not evidence. Phase 8 evals may justify a v2.
- **Revisit if:** the Phase 8 confusion matrix shows a band boundary in the wrong place.

## D-012 · Third role for Phase 7
- **Date:** 2026-10-17 · **Phase:** 0 · **Status:** accepted
- **Decided by:** learner (Claude recommended: Administrative Assistant)
- **Context:** The role-from-JD demo needs a third role, picked now so the build doesn't stop.
- **Options:** A: Administrative Assistant (+ distinct signals: scheduling, office tools, accuracy) · B: Bookkeeper (+ hard skills; − narrower CV variety) · C: Warehouse Associate (− mostly pre-filter driven, weak LLM demo)
- **Decision:** A. Administrative Assistant (`admin`).
- **Why:** its signals differ clearly from both `csr` and `sdr`, so the role-switch result is easy to see.
- **Trade-offs accepted:** some overlap with `csr` (communication, tools).
- **Revisit if:** the builder's drafts can't tell it apart from `csr`.

## D-011 · Email intake: local GreenMail first, Gmail later
- **Date:** 2026-10-17 · **Phase:** 0 · **Status:** accepted
- **Decided by:** learner (Claude recommended A)
- **Context:** D-003 needs a Gmail test account with 2-Step Verification and an app password, which only the learner can create. That would block the straight-through build.
- **Options:** A: GreenMail container (fake SMTP and IMAP) now, Gmail by swapping one credential later (+ no blocker, fully scriptable tests; − not a real provider until the swap) · B: set up Gmail now (+ real provider; − blocks the build on a manual step)
- **Decision:** A. WF-02 uses n8n's IMAP trigger against `greenmail:3143`. `scripts/send-test-email.js` sends over SMTP. D-003 stays the production target.
- **Why:** IMAP is a standard protocol, so the workflow logic is identical. Only the credential (host, port, TLS, app password) changes.
- **Trade-offs accepted:** Gmail-specific behaviour (TLS, labels, plus-address handling in `Delivered-To`) is unverified until the swap.
- **Revisit if:** the Gmail swap behaves differently. Log any difference as an L-###.

## D-010 · How Claude reads and writes n8n workflows
- **Date:** 2026-10-17 · **Phase:** 0 · **Status:** accepted
- **Decided by:** learner (Claude recommended A)
- **Context:** The JSON files in `workflows/` must be the source of truth, and Claude needs a reliable way to push and pull them (brief §4 question 5).
- **Options:**
  - A: public REST API (`/api/v1`, header `X-N8N-API-KEY`) + export/import scripts (+ works on free self-hosted, scriptable, testable round trip; − PUT replaces the whole workflow, and read-only fields must be stripped)
  - B: same + community `n8n-mcp` for node docs and validation (+ current node schemas; − third-party npx dependency)
  - C: built-in instance-level MCP server (+ official, edits since 2.13; − per-workflow enabling, OAuth, no git export)
  - D: n8n CLI via `docker exec` (+ no key; − import overwrites by ID and unpublishes)
- **Decision:** A. `scripts/n8n-export.js` writes pretty, key-sorted JSON with volatile fields removed. `scripts/n8n-import.js` creates or updates workflows by name.
- **Why:** simplest to explain and defend, and keeps git as the source of truth.
- **Trade-offs accepted:** node parameter names come from docs and exported examples rather than a schema service. Wrong names show up at import or run time.
- **Revisit if:** node parameter mistakes recur. Then add B (docs-only mode).

## D-009 · Public GitHub repo from day one
- **Date:** 2026-10-17 · **Phase:** 0 · **Status:** accepted
- **Decided by:** learner (Claude recommended A)
- **Options:** A: public now (+ visible history; − every commit is public) · B: private until the Phase 9 secrets check
- **Decision:** A. `larkhiya/auto-score`, public.
- **Why:** the repo is the portfolio, and the history shows how the work progressed.
- **Trade-offs accepted:** mistakes are public (they're logged in LESSONS anyway). The commit email is visible.
- **Revisit if:** a secret is ever committed. Then rotate it immediately; history rewrite only with learner approval.

## D-008 · Working mode: build straight through, lessons deferred
- **Date:** 2026-10-17 · **Phase:** 0 · **Status:** accepted
- **Decided by:** learner (Claude recommended A, and flagged that CLAUDE.md treats an unexplainable system as a failure)
- **Context:** The learner asked to "finish everything now" instead of a paced ~17-day plan.
- **Options:** A: build Phases 0–9 back to back, lessons later (+ fastest; − learning deferred) · B: build with a short checkpoint after each phase · C: keep the paced teaching plan
- **Decision:** A.
  - Concept breaks and phase checkpoints are logged in LEARNING as `⏭ skipped — revisit`.
  - Design choices use Claude's recommendation and are marked `pending learner review` here.
  - The approved whole-project plan replaces the per-phase plan-mode step.
  - Claude stops only for steps only the learner can do: n8n owner account and API key, Gemini key, credentials.
  - LLM runs listed in the plan are pre-approved.
- **Why:** the learner's explicit choice. The docs still record everything, so the review pass can rebuild understanding.
- **Trade-offs accepted:** the learner can't yet explain the system. Phase 9's "unaided walkthrough" depends on the review pass.
- **Revisit if:** the learner wants to switch to B or C at any point.

## D-007 · LLM provider: Gemini API free tier (supersedes D-002)
- **Date:** 2026-10-17 · **Phase:** 0 · **Status:** accepted
- **Decided by:** learner
- **Context:** Asked about a spending cap for the Claude API (D-002), the learner chose "just use gemini free tier for now".
- **Options:** A: Gemini free tier (+ $0; − limits not published, only shown in AI Studio, roughly 15–30 RPM and ~1,000 RPD on Flash-Lite according to third-party reports; free-tier prompts may be used by Google to improve products) · B: Claude API with a $20 cap (+ the brief's original plan; − billed)
- **Decision:** A.
  - The model is chosen in Phase 5 from the quotas AI Studio shows.
  - Temperature 0.
  - The LLM call is isolated behind one swappable step (an n8n chat-model sub-node, or one HTTP node), so returning to Claude is a config change.
  - Every result still records `model` and `prompt_version`.
- **Why:** zero cost while building. All applicant data is synthetic (D-001), so the free-tier data terms are acceptable.
- **Trade-offs accepted:** rate limits shape the eval (throttling, runs may span days); results are not comparable to a Claude run.
- **Revisit if:** quotas block Phase 8, or the learner wants a Claude comparison (bring D-002 back as a new record).

## D-006 · Hosting: self-hosted n8n in Docker Compose
- **Date:** 2026-10-17 · **Phase:** 0 · **Status:** accepted
- **Decided by:** together (Claude recommended A after checking the machine: Docker 29.5, Compose v5.1, Node 24.13)
- **Options:** A: Docker Compose (+ CRM and mail server on the same network by service name, public API available; − Docker Desktop must be running) · B: n8n Cloud trial (− no public API on the trial, can't reach a local CRM) · C: `npx n8n` (− no container networking, harder to reproduce)
- **Decision:** A. Image pinned to an exact version (no `latest`), with persistent volume `n8n_data`.
- **Why:** reproducible, and matches the brief's architecture.
- **Trade-offs accepted:** we upgrade n8n by hand.
- **Revisit if:** a needed node or feature requires a newer n8n.

## D-005 · Roles: role-agnostic engine driven by versioned JobProfiles
- **Date:** 2026-10-17 · **Phase:** 0 · **Status:** accepted · **Decided by:** learner (pre-decided in brief §4)
- **Decision:** Everything role-specific lives in a versioned JobProfile. `csr` is the default role, `sdr` the second, further roles come from a JD in Phase 7. Human approval is required before a profile is used.

## D-004 · Working style: Claude builds, the learner reviews
- **Date:** 2026-10-17 · **Phase:** 0 · **Status:** accepted · **Decided by:** learner (pre-decided)
- **Decision:** Claude builds. The learner makes design decisions, reviews, and enters their own credentials. Secrets never pass through chat. (D-008 defers the review loop to the end.)

## D-003 · Email intake: Gmail via IMAP on a dedicated test account
- **Date:** 2026-10-17 · **Phase:** 0 · **Status:** accepted (staged by D-011) · **Decided by:** learner (pre-decided)
- **Decision:** Gmail IMAP with an app password is the production target. Outlook via Microsoft Graph is a Phase 9 stretch goal. D-011 adds a local GreenMail stage first.

## D-002 · LLM provider: Anthropic Claude API
- **Date:** 2026-10-17 · **Phase:** 0 · **Status:** superseded by D-007 · **Decided by:** learner (pre-decided)
- **Decision (original):** Claude API with a small, low-cost model for bulk scoring.
- **Note:** Claude Haiku 5.5 was the candidate ($0.10 / $0.50 per M tokens; it rejects non-default temperature). Superseded the same day by D-007.

## D-001 · Project type: portfolio replica
- **Date:** 2026-10-17 · **Phase:** 0 · **Status:** accepted · **Decided by:** learner (pre-decided)
- **Decision:** A mock CRM and synthetic, fictional applicants. No real applicant data anywhere.
