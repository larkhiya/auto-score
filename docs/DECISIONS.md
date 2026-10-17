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

## D-025 · Screening calls Gemini over HTTP in one sub-workflow (WF-12); n8n AI nodes for the profile builder
- **Date:** 2026-10-18 · **Phase:** 5 · **Status:** pending learner review
- **Decided by:** Claude (D-008; brief §5.2 default was "AI nodes first, HTTP as fallback")
- **Options:**
  - A: n8n LLM Chain + Gemini Chat Model + Structured Output Parser (+ shows the AI nodes; − the parser adds format instructions instead of using Gemini's native schema-constrained output, token usage is harder to get, and retry behaviour is n8n's)
  - B: HTTP Request to `generateContent` inside WF-12 (+ native `responseSchema` with criterion ids pinned as an enum, exact token counts for RunLog, the same backoff policy as WF-11, one place to swap provider; − more nodes to own)
- **Decision:** B for screening (high volume; correctness and logging matter most). The low-volume job-profile builder (WF-05, Phase 7) will use the n8n AI nodes, so the portfolio shows both, each with a reason.
- **Model:** `gemini-3.5-flash-lite`, temperature 0, no thinking budget (not supported for this model: probe returned 400). The credential is the learner's "Google Gemini(PaLM) Api account" (key sent as a query parameter by n8n's standard credential).
- **Evidence:** first smoke runs averaged 2 calls per screened record, about 2.5–3.6k input / 0.8–1.9k output tokens, 7–10 s per record; pre-filter-rejected and review records used 0 calls.
- **Revisit if:** structured-output reliability drops (watch the repair rate), or the provider changes (D-007).

## D-024 · One CRM-call sub-workflow (WF-11) owns the retry policy
- **Date:** 2026-10-17 · **Phase:** 3 · **Status:** pending learner review
- **Decided by:** Claude (D-008)
- **Context:** the brief requires exponential backoff on 429, 5xx and timeouts and never on other 4xx. n8n's built-in "Retry on fail" waits a fixed time and retries every error, including 422s that can never succeed.
- **Options:** A: built-in retry on every HTTP node (+ no work; − wrong policy) · B: a reusable sub-workflow: HTTP with "never error" → classify (`src/retry.js`) → Wait with backoff → loop (+ correct policy, tested once, used everywhere; − extra executions in the log) · C: a Code node doing HTTP itself (− not reliably available in the task-runner sandbox)
- **Decision:** B. WF-11 takes `{request, context}` and returns `{ok, status, body, error_code, attempts, history, context}`. There are two request nodes (with or without a body), because `sendBody` must be static (L-004).
- **Revisit if:** n8n gains configurable backoff and status filters on its built-in retry.

## D-023 · Email intake: CRM record without webhook, one execution per email, dedupe by Message-ID
- **Date:** 2026-10-17 · **Phase:** 3 · **Status:** pending learner review
- **Decided by:** Claude (D-008), answering brief Phase 3 step 4
- **Context:** creating the CRM record for an email would fire the CRM webhook, so the same applicant could be screened twice (once by the email path, once by WF-01).
- **Options:** A: create with `notify=false` and screen directly from the email path (+ one path, no race; − the email path also calls WF-10) · B: create with webhook on and let WF-01 do all screening (+ one entry point; − email-specific context such as the extraction result must survive through the CRM)
- **Decision:** A, with dedupe as a backstop.
  - WF-03 creates the record with `notify=false` and `source_ref = Message-ID` (the CRM returns the existing record for a repeated Message-ID, or for the same job + email + CV).
  - WF-03 then calls WF-10, whose compare-and-set claim lets exactly one run proceed (verified: two identical emails processed concurrently, executions 85/87, one CLAIMED and one DUPLICATE_SKIPPED).
  - WF-02 is only the IMAP trigger. Each email runs in its own WF-03 execution with errors captured, so one bad email can't stop the batch (found when a single failure blocked five emails).
  - Plus-address routing: `applications+<job>@…`. Unknown job → `job_id: null` → NEEDS_REVIEW.
  - DOCX via unzip + `src/extract.js` (n8n's Extract From File has no DOCX).
  - Scanned PDFs → `NO_TEXT_LAYER`, review (no OCR).
- **Trade-offs accepted:** the IMAP node marks mail read when it fetches it, so an email whose processing fails isn't fetched again. Phase 6's error workflow must dead-letter the email payload so it can be replayed.
- **Revisit if:** moving to Gmail (D-011) changes how the plus-address appears (`Delivered-To` vs `To`).

## D-022 · Standing approval to reset the CRM's synthetic candidates during the build
- **Date:** 2026-10-17 · **Phase:** 2 · **Status:** accepted
- **Decided by:** learner
- **Decision:** Claude may run `scripts/reset-crm.js --yes` (delete all candidates, keep job profiles) whenever a clean run needs it during this build. Synthetic local data only. Each reset is noted in the PROGRESS session log.
- **Revisit if:** the CRM ever holds anything that isn't regenerable.

## D-021 · Evidence policy and redaction before the LLM
- **Date:** 2026-10-17 · **Phase:** 5 · **Status:** pending learner review
- **Decided by:** Claude (D-008), answering brief §5.2's two open questions
- **Decision:**
  - **Unverified quote:** that criterion's score becomes 0 (no evidence, no points). Two or more unverified quotes in one ScoreCard → NEEDS_REVIEW (`EVIDENCE_NOT_VERIFIED`), because the model is clearly not grounded on that CV. Extraction items with unverified quotes are dropped before the scoring call.
  - **Redaction: yes.** Name, email, phone, URLs, street addresses and the stated location are replaced with placeholders before either LLM call. Quotes are verified against the same redacted text.
- **Why:** zeroing is the conservative, explainable default. Redaction makes the name-swap counterfactual hold by construction: identical model input for identical CVs (tested on all 4 dataset pairs).
- **Trade-offs accepted:** a genuinely good candidate whose quote the model mangled loses those points. The breakdown shows `evidence_verified: false`, so a reviewer can spot it.
- **Revisit if:** Phase 8 shows many zeroed criteria from formatting differences rather than hallucination.

## D-020 · Two LLM calls (extract, then score)
- **Date:** 2026-10-17 · **Phase:** 5 · **Status:** pending learner review
- **Decided by:** Claude (D-008; brief §5.2 default)
- **Options:** A: one call that extracts and scores (+ half the calls, which matters on the free tier; − harder to debug, one big output) · B: two calls (+ each output is small and checkable, extraction is reusable across roles; − twice the calls)
- **Decision:** B. Call 1 returns a CandidateProfile (role-agnostic facts with quotes). Call 2 gets the profile, the redacted CV and the job's rubric, and returns a ScoreCard. The model and the node-vs-HTTP choice are recorded once the Gemini quotas are known.
- **Revisit if:** free-tier daily limits make the Phase 8 runs impractical.

## D-019 · Synthetic data: template-based, seeded, answer key written from persona design
- **Date:** 2026-10-17 · **Phase:** 2 · **Status:** pending learner review
- **Decided by:** Claude (D-008)
- **Options:** A: templates + seeded RNG (+ free, reproducible, every persona has a known intent; − CVs read alike) · B: add an LLM-written realism subset (+ realistic; − costs quota, not reproducible, the intended label can drift from the text)
- **Decision:** A only, for now.
  - `scripts/generate-applicants.js` (seed 20261017) writes 222 applicants: 111 per role, which is 32 strong, 30 medium, 28 weak and 20 edge-case/form-fail, plus 1 re-application.
  - It also writes 20 role-switch CVs and 6 email samples (PDF, DOCX, TXT, a scanned image PDF, no attachment, unroutable address).
  - Expected outcomes come from each persona's design.
  - A lint step fails generation if a "should fail" CV contains a role keyword even as a substring. That is stricter than the pre-filter's whole-word matching, so the answer key can't be accidentally wrong.
- **Revisit if:** the Phase 8 eval looks too easy. Then add an LLM-written subset and record it.

## D-018 · CRM status model and API contract
- **Date:** 2026-10-17 · **Phase:** 2 · **Status:** pending learner review
- **Decided by:** Claude (D-008), fixing audit item 5
- **Context:** brief §3.5's state machine had gaps: NEEDS_REVIEW and ERROR reachable only from SCREENING, no way out of NEEDS_REVIEW, and no human-decision states although "a final rejection is a human action".
- **Decision:** see `crm/README.md`.
  - NEW can go straight to PREFILTER_REJECTED, NEEDS_REVIEW or ERROR.
  - NEEDS_REVIEW and ERROR can go back to SCREENING.
  - AI outcomes can return to SCREENING for re-scoring.
  - ADVANCED and REJECTED are human-only and terminal. Humans act through the pages; the automation API key cannot set them.
  - Dedupe is a compare-and-set claim (`X-Expected-Status: NEW`). Retried writes are safe through `Idempotency-Key`.
  - Failure simulation can be changed at runtime, including "committed but response lost".
- **Why:** every record has a defined path to a final state. The fairness rule is enforced by the system, not by convention.
- **Trade-offs accepted:** pages have no authentication (local demo).
- **Revisit if:** the learner wants a simpler model for the walkthrough.

## D-017 · Nice-to-haves are flags; low confidence goes to review
- **Date:** 2026-10-17 · **Phase:** 1 · **Status:** pending learner review
- **Decided by:** Claude (D-008)
- **Context:** brief §5.2 leaves open whether nice-to-haves add a bonus, and what counts as "low confidence".
- **Options:** A: flags only (+ total stays a clean weighted 0–100; − a strong nice-to-have can't lift a borderline candidate) · B: small bonus (+ rewards extras; − totals can pass 100, thresholds blur)
- **Decision:** A. `nice_to_haves_found` becomes `NICE_TO_HAVE_<ID>` flags on the CrmUpdate. Each profile carries `thresholds.min_confidence` (0.6 for csr/sdr); ScoreCard `overall_confidence` below it → NEEDS_REVIEW.
- **Why:** keeps the scoring maths explainable (C-17); a recruiter sees the flags anyway.
- **Revisit if:** recruiters say borderline candidates with key extras are being missed.

## D-016 · Pre-filter is three-valued; "duplicate" has two distinct meanings
- **Date:** 2026-10-17 · **Phase:** 1 · **Status:** pending learner review
- **Decided by:** Claude (D-008), fixing audit items 3 and 4
- **Context:** (3) "missing form answer → review, not fail" breaks with plain booleans: `all(true, false-because-missing)` = fail. (4) Duplicates were checked twice with no stated difference.
- **Decision:**
  - Every rule node returns `true`, `false` or `unknown`. `all` is false if any child is false, else unknown if any is unknown. `any` is true if any child is true, else unknown if any is unknown. `not` swaps true and false and keeps unknown. Outcome: true → pass, false → fail, unknown → review.
  - Every node may carry a `reason` code. PrefilterResult keeps a full `trace`.
  - **Redelivery** of the same application is handled by `idempotency_key` before the pre-filter: skipped and logged, never re-scored.
  - **The same person re-applying** to the same job under a new application is set at intake as `duplicate_of`, read by the pre-filter's `duplicate` check → `DUPLICATE_APPLICATION`.
- **Why:** Kleene three-valued logic is the standard way to reason with missing data. Separating the two duplicates makes each check explainable.
- **Trade-offs accepted:** a clear fail elsewhere still wins over unknown (`all(false, unknown)` = fail). That's intended: a CV with no relevant experience fails even if form answers are missing.
- **Revisit if:** recruiters want missing answers to always go to review.

## D-015 · Contracts in JSON Schema 2020-12; validators compiled to standalone code for n8n
- **Date:** 2026-10-17 · **Phase:** 1 · **Status:** pending learner review
- **Decided by:** Claude (D-008)
- **Options:** A: Ajv in Node + Ajv standalone code generation for n8n (+ one source of truth, fast, no runtime dependency in n8n; − generated files to keep in sync) · B: allow `require('ajv')` in Code nodes via `NODE_FUNCTION_ALLOW_EXTERNAL` (− depends on what the runner image ships, and changes in n8n 3.0) · C: hand-written checks in code (− duplicates the schema, drifts)
- **Decision:** A.
  - `src/validate.js` (Ajv, strict mode) for tests, scripts and the CRM.
  - `scripts/build-validators.js` writes `src/generated/validators/<contract>.js`.
  - Timestamps use a regex instead of `format`, so the generated code is self-contained (only Ajv's `ucs2length` helper is bundled).
- **Why:** validation at every boundary with the exact same rules everywhere.
- **Revisit if:** n8n ships schema validation as a built-in node feature.

## D-014 · Keeping `src/` and n8n Code nodes in sync: a bundler + drift test
- **Date:** 2026-10-17 · **Phase:** 1 · **Status:** pending learner review
- **Decided by:** Claude (D-008), fixing audit item 1
- **Context:** CLAUDE.md requires Code-node logic to live in `src/` as tested pure functions. n8n 2.x runs Code nodes in a task-runner sandbox that can't load local files.
- **Options:**
  - A: bundle `src/` modules into the Code node's `jsCode` between `// @bundle-begin <entries>` and `// @bundle-end` markers, with a drift test (+ works with stock n8n, src stays plain CommonJS; − workflow JSON grows by the bundled code)
  - B: custom runners image with our package installed and allow-listed (+ small Code nodes; − custom image, version-locked to n8n, harder to explain)
  - C: paste by hand (− drifts silently)
- **Decision:** A. `scripts/lib/bundle.js` is a ~60-line CommonJS loader exposing `__require`. `npm run build` refreshes all blocks; `npm test` fails if any block or generated validator is stale. A test runs the bundle in a bare `vm` context (no `require`, no `module`) to match the sandbox. Bundling a module that needs Node built-ins fails the build, so src stays pure.
- **Why:** reproducible with the stock n8n image, and easy to defend: "the tested code IS the code that runs".
- **Trade-offs accepted:** editing a bundled block in the n8n editor is wrong (the drift test catches it after export).
- **Revisit if:** workflow JSON gets unwieldy, or n8n adds a supported way to share code between nodes.

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
