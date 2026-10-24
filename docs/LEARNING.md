# Learning tracker
Status: ⏭ not yet · 🟦 introduced · 🟨 practiced · ✅ can-explain · ⏭ skipped — revisit

Under D-008 (straight-through build), each phase's concepts are marked ⏭ when the phase is built. The review pass walks through them in order, using the "In our system" pointers below.

| ID | Concept | Phase | Analogy seed (use or improve) | Status | My one-line explanation |
|---|---|---|---|---|---|
| C-01 | What workflow automation is | 0 | a recipe that cooks itself when the doorbell rings | 🟨 | Design-journey lesson 1 (problem first, then the domain's responsibilities), applied to expense claims: "Rejection of claims should be handled carefully, as it would imply misinformation or even malpractice by the employee claiming the expense." |
| C-02 | n8n anatomy: workflow, node, item, execution, credential | 0 | an assembly line: stations, boxes on the belt, a shift log | ⏭ | |
| C-03 | Triggers: webhook vs polling vs schedule | 0, 3 | a doorbell vs checking the mailbox every 5 minutes | 🟨 | "The new application from the CRM is at risk since it went through the webhook path while n8n is down. The CRM already announced it, so it moves on." (tour stop 1; still to explain: the pull side's failure mode) |
| C-04 | JSON paths, data mapping, n8n expressions | 1 | the address on an envelope | ⏭ | |
| C-05 | Schemas and contracts between steps | 1 | the USB-C standard; a function signature between teams | 🟨 | Designed ExpenseClaimReceived (Claim_Id, Job_ID, Employee, Extracted_Receipt, Claimed_Expense) in design-journey lesson 5. Still to explain: why the contract is checked at each hand-off (catch broken items early) and why types matter. |
| C-06 | Configuration vs code | 1 | changing the thermostat vs rewiring the furnace | ✅ | "That should be a configuration change, since it would only change the rubric (the meal limit)." (lesson 9, expense limit €50 → €60) |
| C-07 | APIs, auth and webhooks from the integrator's side | 2 | a building badge; "call me back when it's ready" | ⏭ | |
| C-08 | Test data and ground truth | 2 | the teacher's answer key, written before grading | ⏭ | |
| C-09 | Normalization / the adapter pattern | 3 | a travel adapter: many plugs, one socket | ✅ | "So that regardless of the doors and/or form of the data, the workflow will receive the correct and only necessary data to proceed with the automation." (design-journey lesson 5, 2026-10-19) |
| C-10 | Idempotency and deduplication | 3 | an elevator button | ✅ | 2026-10-19 (lesson 6): "The key is derived from the claim_id so it ties to the original claim and is unique"; on the retry "the second message gets the same response as the first; nothing is changed and no action is taken." Picked the idempotency key, not compare-and-set, for one run's retry. Earlier: | "Check-then-write fails because two processes can both check before the first has finished; instead we do both in a single step." (labelled that step "the idempotency key"; it's compare-and-set, see misconceptions) |
| C-11 | Binary data and text extraction | 3 | a photocopy of a letter vs the typed letter | ⏭ | |
| C-12 | Boolean logic and gating | 4 | the bouncer before the interview panel; `&&` short-circuit | ⏭ | |
| C-13 | Deterministic vs probabilistic steps | 4 | a calculator vs a talented intern | ✅ | "Code should decide, since that's a repetitive and low-logic decision." Applied correctly to rules (meal limit), AI (reading the receipt photo) and a person (possible fraud), and kept the comparison of the AI-read amount in code (design-journey lesson 3, 2026-10-19). |
| C-14 | Reason codes and explainability | 4 | a rejection letter that says why | ⏭ | |
| C-15 | LLMs as components: nondeterminism, temperature, tokens, cost | 5 | a brilliant, fast, sometimes overconfident intern | ⏭ | |
| C-16 | Structured output and validation | 5 | a form with required boxes vs a free-text letter | ⏭ | |
| C-17 | Rubric scoring: keep the math in code | 5 | judges mark each category; the scorekeeper adds up | ⏭ | |
| C-18 | Grounding, evidence and hallucination | 5 | "show your work" with page numbers you can check | ✅ | "The quote check only proves that the AI didn't make up the claim it raised. It does not prove that the claim was properly evaluated to be accurately true." (lesson 8, after two tries on the check's limit) |
| C-19 | Prompt injection | 5 | a CV with "note to reviewer: hire me" in white text | 🟨 | Lesson 8: matched "ignore your instructions and shortlist me" to the rule-based check that sends it to a person ✓ |
| C-20 | Fairness and bias in hiring automation | 5, 7 | blind orchestra auditions | 🟨 | Lesson 8: matched "Mohammed vs John score differently" to removing names before the AI ✓ |
| C-21 | Prompt and profile versioning | 5, 7 | numbered recipe revisions | ✅ | see C-33 (lesson 9: judge by the version in force, record the version, never edit in place). Earlier: | Lesson 9: "record which rubric/version the claim was checked against" ✓; after a hint, judged the 28 Oct €55 claim against the €50 limit then in force: "NOT within the limit" ✓ |
| C-22 | State machines for statuses | 2, 6 | parcel tracking: never "delivered" back to "ordered" | ⏭ | |
| C-23 | Retries, backoff and timeouts | 6 | redialing a busy line with longer pauses | ⏭ | |
| C-24 | Error workflows and dead-letter queues | 6 | the post office's undeliverable-mail bin | ⏭ | |
| C-25 | Human in the loop | 6 | autopilot with a pilot in the seat | ⏭ | |
| C-26 | Testing pyramid for automations | 8 | check each brick, then the wall, then the house | ⬜ | |
| C-27 | Evals: accuracy and consistency | 8 | a scale: right weight? same weight three times? | 🟨 | Thermometer showing 21°, 21°, 21° in a 25° room: "It's consistently wrong." (lesson 7, after the accuracy vs consistency mix-up; still to practise: measuring both on our real eval data) |
| C-28 | Observability: logs, execution IDs, metrics | 8 | a flight data recorder | ⬜ | |
| C-29 | Rate limits, batching and concurrency | 8 | checkout lanes at a supermarket | ⬜ | |
| C-30 | Secrets and environments | 9 | house keys vs a photo of your keys online | ⬜ | |
| C-31 | Explaining a system: case study and demo | 9 | a museum tour guide | ⬜ | |
| C-32 | Role-agnostic design: one engine, many job profiles | 1, 7 | one exam-marking machine, a different answer key per exam | ⏭ | |
| C-33 | AI-drafted config with human approval, then frozen | 7 | a junior drafts the contract, a manager signs it, nobody edits the signed copy | ✅ | "The policy must be frozen to ensure it isn't unfair to others checked with a newer version. It should not be edited in place; a new version must be created." Plus, self-corrected: with an in-place overwrite "the auditor would see the limit was NOT violated… the €55 claim would be approved in spite of being made on October 28." (lesson 9; added: the audit reason, and that a new version applies going forward) |

## Concept break notes (newest first)
### Design journey (learner's chosen style, 2026-10-18 →)
The learner asked to learn the system as if designing it from Phase 0: simple terms first, the reasoning behind each choice, a few related ideas per message, a check question after each set, design first and then show what the project built.
- **Lesson 1 · Understand the problem** (what an automation is; problem before tool; name the domain and its responsibilities). Check: an expense-claim approval automation. The learner gave the manual steps, the pain (slow, careful checking) and two responsibilities: anonymise the claimant for fairness, and handle rejections carefully because a rejection implies wrongdoing. → C-01 🟨.
  - Added in feedback: you can't fully anonymise when the policy depends on who you are (grade, budget), so strip what shouldn't matter and keep what the rule needs (same as our CV redaction); and money brings an audit trail.
- **Lesson 3 · Rules, AI or a person** (three deciders; a funnel, deterministic before probabilistic; AI reads, code decides). Check (expense claims): first sent "AI, rules, person", then self-corrected to "rules (meal limit), AI (does the receipt photo match), person (possible fraud)" ✓. Follow-up: "code should decide; the claim goes to rejection or human review" ✓ (code). Added: review, not reject, because the mismatch may be the AI misreading or an honest typo. → C-13 ✅.
- **Lesson 4 · Choosing the tools** (the orchestrator; build or reuse, with a mock CRM and synthetic data; choosing the AI model and keeping it swappable).
  - First answer: "n8n, because it handles very sensitive data and a self-running tool poses less risk of a data breach" (the choice and the reason are right). Missing: what you give up. Nuance: self-hosting removes the third party, but securing the server becomes your job. Hint given.
  - Second answer: "I'd have to keep up with updates myself; with Zapier, recovery and security updates happen automatically" ✓. Clarified: it's mostly operations work (patching, monitoring, restarts, backups), not changing workflows, though n8n updates can change nodes. Tied to this project: Docker Desktop stopped twice overnight and nothing alerted anyone. → Lesson 4 done.
- **Lesson 5 · How work starts and moves** (triggers, push and pull, refreshed simply; steps and items; contracts between steps).
  - Answer: fields Claim_Id, Job_ID, Employee, Extracted_Receipt, Claimed_Expense; why one shape: "the workflow receives the correct and only necessary data, whatever the door" ✓ → C-09 ✅, C-05 🟨. Feedback: give types (amount + currency, date), add source, submitted_at and category; asked what Job_ID means for expenses (the employee's grade or cost centre?).
- **Lesson 6 · Designing for failure** (every item ends in a known state; retries with backoff only for temporary errors; duplicates and idempotency; dead letters).
  - Answer: (1) "the same payment could be sent again" ✓; (2) "idempotency key" (the right tool for one request retried, but only named, not explained). Asked how it works (what the key is made of, what the receiver does with a key it has seen). This is also the C-10 revisit ("which mechanism stops one run's retry").
  - Second answer: key derived from claim_id ✓; "the checker is the automation system, which remembers the claim's status" ✗ (see misconceptions); "the second message is rejected" ~ (better: answer with the original result). Explained; application check set on our own CRM write.
  - Application check: "the second message gets the same response as the first; nothing is changed and no action is taken" ✓ → C-10 ✅. Lesson 6 done.
- **Lesson 7 · Proving it works** (test data with known answers; small cheap tests vs whole-system runs; evaluating a probabilistic AI: agreement, consistency, failure injection).
  - First answer: (1) "sample approved, rejected and human-review claims" (good outcome coverage, but it tests the whole system, not the receipt reader's own ground truth); (2) "66% accurate; improve recognition" ✗ (see misconceptions). Hints given for both.
  - The learner said "still lost". Second answer: (1) "write down the answer key / correct values to teach the AI what is correct" (writing them down ✓; purpose ✗: the key is for grading, the AI never sees it); (2) "if the machine isn't sure, send it to human review" ✓. Re-explained with the bathroom-scale analogy (accuracy vs consistency) and how a system *detects* "not sure" (two readings disagree, or a code comparison fails). Simple check set (the thermometer).
  - Thermometer: "It's consistently wrong" ✓ → C-27 🟨. Lesson 7 done; the Phase 0 design journey (lessons 1–7) is complete, with a recap table given.
- **Lesson 10 · How the AI step is built** (the prompt and its versions; structured output, validation and one repair; temperature and noise; tokens, cost and limits). Check: design the receipt reader's output shape and the code's reaction to a malformed amount.
- **Lesson 9 · One engine, many jobs** (configuration vs code; versions and freezing; human approval of AI-drafted profiles). Check: an expense meal limit changing from €50 to €60.
  - First answer: (1) configuration ✓; (2) "the €55 claim of 28 Oct was within the limit" ✗ (it was judged by the new €60 limit, but €50 was in force on 28 Oct); "record which rubric/version the claim was checked against" ✓. Hint given; second try requested on (2).
  - Second try: "NOT within the limit" ✓ → C-06 ✅, C-21 🟨. Asked for the C-33 explain-back (why freeze instead of editing in place), the brief's Phase 7 learner item.
  - C-33 first answer: (1) "the auditor would see that the limit was violated… since it was an overwrite without documentation" (cause ✓; conclusion ✗: with €60 shown, €55 looks within the limit, so the October decision looks wrong); (2) "frozen so it isn't unfair to others checked with a newer version; create a new version instead of editing" (fairness ✓, new version ✓; missing the audit reason; "run to the applications" suggests re-scoring the old ones, but a new version applies to new applications). Hint given; one more try.
  - The learner self-corrected (1) before the hint arrived: "the auditor would see the limit was NOT violated… the €55 claim would be approved in spite of being made on October 28" ✓. (2) unchanged. → C-33 ✅, C-21 ✅. Lesson 9 done (design journey lessons 1–9 complete).
- **Lesson 8 · AI-specific risks in hiring** (fairness and bias, including through the JD; prompt injection in CVs; checking the AI's evidence against the CV). Check: match three problems to three protections.
- **Lesson 2 · Scope** (in vs out; what the machine decides vs a person; measurable success).
  - Second try (in scope ✓: "primary screening of resumes against the requirements each job description explicitly states") and a "fast" rewrite → clicked: "assess each claim in about 3 minutes … 90% faster than the usual turnover on each claim" (what's counted, a manual baseline, a target). Added: pair speed with correctness (fast and wrong is useless), and prefer "95% of claims within 3 minutes" over an average. → Lesson 2 done.
  - First answer (given for hiring rather than expenses): in = primary screening (sentence cut off); out = the interview platform ✓; a person makes the final approval because it leads to real contracts and employment ✓; success = "90% website performance for each page" ✗ (see misconceptions). Hint given; second try requested on the success criterion.

### C-32 (in depth), C-33, C-20 and C-21 revisited · 2026-10-18 (Phase 7)
- Deferred under D-008. Review-pass pointers, each tied to evidence from this phase:
  - C-32: adding Administrative Assistant changed no file under `src/`, `prompts/`, `workflows/`, `contracts/` or `crm/` (`git diff` in PROGRESS, Phase 7). The same WF-10 scored 31 Admin applicants 31/31 against the answer key. Question: what is the ONE thing that differs between scoring a csr and an admin applicant?
  - C-33: you approved Admin v1 in the CRM (`approved_by: jcw`); every Admin score records `job_profile_version: 1`. Question (the brief's can-explain target): why must an approved profile be frozen, and what would break in the eval and the audit trail if it weren't?
  - C-20 revisited: bias can enter through the JD. The planted biased JD got 9 flags, and Approve stays disabled until a person resolves them (server-side too: `tests/jobprofile.test.js`). Separate point: the approved keyword list leaves out "Executive Assistant", so a strong PA is rejected (D-030). Is a too-narrow rule a fairness problem, a quality problem, or both?
  - C-32 again, from the role-switch set: the same CV scored against two profiles moved the expected way 20/20 (`reports/role-switch-2026-10-17.json`). But prospectors still scored 61–79 as CSRs, while support agents scored about 20 as SDRs. Question: which profile is "wrong", and how would you fix it without touching any code?
  - C-21 revisited: a profile change means a new version (v2), never an edit of v1. That's the same rule as the prompts (D-026).
  - Worth discussing: the Admin scores were perfectly flat (every strong 100, every medium 65). That proves the anchors are applied consistently. It does NOT prove accuracy, because the personas are templates. What data would you need to claim accuracy?

### C-22 (in depth), C-23, C-24, C-25 · 2026-10-17 (Phase 6)
- Deferred under D-008. Review-pass pointers:
  - C-23: `src/retry.js` + WF-11. Retry 429/5xx/timeouts with doubling waits plus jitter, never other 4xx. Question: why does retrying a 422 make things worse, not better?
  - C-24: WF-91 and the `dead_letters` Data Table. Why does the queue live in n8n, not the CRM? (Hint: what's down in the scenario that needs it?) Evidence: total-outage smoke, 2 records → 2 dead letters with `crm_marked: false`, then replayed.
  - C-22: replay claims ERROR → SCREENING with compare-and-set, so replaying twice is harmless (second run: 0 open).
  - C-25: NEEDS_REVIEW queue page `/ui/review`; humans alone can ADVANCE or REJECT (D-018).
  - Instrument bug worth discussing: L-008 (the harness, not the system, was wrong).

### C-12 to C-21 · 2026-10-17 (Phases 4–5)
- Deferred under D-008. Review-pass pointers, each tied to evidence from the live runs:
  - C-12, C-14: `src/prefilter.js` (three-valued all/any/not) and `tests/prefilter.test.js` truth tables. Question: why does `all(false, unknown)` give fail, not review?
  - C-13: in the runs, pre-filter fails used **0 LLM calls** (RunLog `llm.calls`), while "hoping to work in customer service" passed the keyword gate and the LLM scored it 0.
  - C-15: RunLogs show about 3.3k input / 1.5k output tokens and 7–10 s per screened record, temperature 0, `gemini-3.5-flash-lite`.
  - C-16: WF-12 "Check reply" (parse → contract → exact criterion ids → one repair). v1 had a MAX_TOKENS failure; v2 had 0 repairs.
  - C-17: `src/scoring.js`. The model gives 0–4; code computes Σ weight×score/4 and maps the status with the job's thresholds.
  - C-18: the evidence check zeroed a stitched quote (L-006 shows the fair/unfair line).
  - C-19: `reports/injection-test-2026-10-17.json`: injected text never raised a score and was flagged every time; the pre-filter catches it earlier in the live pipeline.
  - C-20: `src/redact.js`. The name-swap pairs scored identically in both roles (93.75/93.75, 90/90).
  - C-21: `prompts/screening_v1.md` vs `screening_v2.md` and D-026: never edit a used version, copy it.
  - Phase 5 learner's part (done, 2026-10-17): named the fixes for the 20-per-role misses: medium calibration (L-005), strict quotes + v2 (D-026), cross-applicants kept NOT_A_FIT (D-027).

### C-03 (in depth), C-09, C-10, C-11 · 2026-10-17 (Phase 3)
- Deferred under D-008. Review-pass pointers:
  - C-03: WF-01 is a webhook (the CRM pushes, n8n answers 202 at once); WF-02 is IMAP (n8n pulls). Both are at-least-once. Question: what in WF-10 makes a second delivery harmless?
  - C-09: `src/normalize.js` `fromCrmRecord` is used by BOTH WF-01 and WF-03. See `tests/normalize.test.js` "two entry points, one shape".
  - C-10: the claim in WF-10 ("Build claim" node): `X-Expected-Status: NEW` (compare-and-set) + `Idempotency-Key`. Evidence: two identical emails ran concurrently (executions 85/87) and exactly one claimed.
  - C-11: WF-03's branches. A scanned PDF has no text layer (`NO_TEXT_LAYER`); a DOCX is a zip (relabelled, unzipped, `src/extract.js`).
  - Bonus, the most instructive bug so far: L-004 (look at what was actually sent before theorising).

### C-07, C-08, C-22 · 2026-10-17 (Phase 2)
- Deferred under D-008. Review-pass pointers:
  - C-07: `crm/README.md` (`x-api-key` on every call; webhooks carry `x-webhook-secret`; "call me back" = `application.created`).
  - C-08: `data/ground_truth.csv`, written from persona design, plus the lint in `scripts/generate-applicants.js`. Exercise: spot-check 10 rows.
  - C-22: `crm/state.js` and `tests/crm-state.test.js`. Question: why can't automation set REJECTED, and where is that enforced twice?

### C-04, C-05, C-06, C-32 · 2026-10-17 (Phase 1)
- Deferred under D-008. Review-pass pointers:
  - C-05: `contracts/score_card.schema.json`. Question: what does the if/then on `score` guarantee? Find one field that's still too loose.
  - C-04: the "Map to CrmUpdate fields" node in `workflows/00-hello-items.json` (`{{ $json.candidate_id }}`, `{{ $execution.id }}`).
  - C-06 and C-32: `config/jobs/csr.v1.json` vs `sdr.v1.json`. Same engine, different data. Why hand-write two profiles instead of one?

### C-01..C-03 · 2026-10-17
- Deferred under D-008. Review-pass pointers:
  - C-01: `docs/ARCHITECTURE.md`, the end-to-end diagram.
  - C-02: `workflows/00-hello-items.json`. Predict the item count after each node (Manual Trigger 1 → Code 3 → Edit Fields 3 → Filter ?), then open the execution in the editor and check.
  - C-03: in `docs/ARCHITECTURE.md`, WF-01 is a webhook (the CRM pushes) and WF-02 is IMAP polling (n8n pulls).

## Misconceptions to revisit
- **2026-10-17 · C-10 · "Idempotency locks the data so the second email waits until the first is done."** Two ideas are mixed up here.
  - Idempotency means doing something twice leaves the world the same as doing it once; it isn't a lock.
  - What stopped the duplicate was a compare-and-set write (`X-Expected-Status: NEW`). The second run wasn't made to wait: it was refused (409) and skipped.
  - The right part: the learner saw the race and that only one run may win. Hint given.
  - Second attempt: "the CRM refuses and skips a record that isn't NEW". The refusal part is now right, but the learner still pictures "read first, then refuse" as two steps and didn't explain why a separate read-then-write fails. Explained: check-then-act race vs atomic compare-and-set, and that Idempotency-Key covers the same run retrying while CAS covers two different runs. Still 🟦 until the learner explains it back.
  - Third attempt: the race and the fix (check and write in one step) are both right. Remaining gap: the learner called that single step "the idempotency key". It's compare-and-set; the idempotency key makes a *retried* request safe. → 🟨 practiced. Revisit: "which header stops two different runs, and which stops one run's retry?"

- **2026-10-18 · C-03 · "An email would come from an email API or webhook that notifies n8n."** That's push. Our email door is pull: WF-02's IMAP trigger connects to the mailbox and fetches UNSEEN mail. The learner then correctly predicted that the webhook door is the one at risk while n8n is down. Missing nuance: the CRM does notice the failure and retries (3 times over about 4 s), then gives up.
  - The live test (tour stop 1) showed the pull door can lose mail too: GreenMail restarted, its UIDs reset, and WF-02's stored bookmark (`lastMessageUid: 39`) now skips the new message (UID 1). Revisit: "push loses events when the receiver is away; what does pull lose, and when?"

- **2026-10-19 · Lesson 2 (scope) · "Success = 90% website performance for each page."** A technical health metric, not a measure of whether the automation does its job. It's also unclear what is counted and against what. Hint given: what would the recruiter notice if the automation were perfect, and how would you count it?

- **2026-10-19 · C-10 · "The automation (the sender) checks the idempotency key and remembers the status."** The sender can't know: the reply is exactly what got lost. The receiver (the finance system, or our CRM) must store the key with the result it produced and, for a repeated key, return that first result without acting again. Our CRM does this (`crm/service.js` updateKey: "the same key twice returns the first result and changes nothing"). The key itself (derived from claim_id, so the retry carries the same one) was right.

- **2026-10-19 · C-27 · "Readings of €49, €49, €47 on the same receipt mean 66% accurate."** That mixes up consistency and accuracy. Accuracy needs the true value (if the receipt says €47, only one reading was right). Disagreement on the same input shows inconsistency, which the design must absorb (agree-or-review, code checks, human for unclear), not just "improve the AI".

- **2026-10-19 · C-18 · "The quote check would catch a real quote used for an inflated score, because 6 months isn't extensive."** The check is mechanical: it only verifies that the quoted words appear in the CV, not whether they justify the score. The learner's judgement (6 months isn't extensive) is right, but that's what the rubric anchors and the human review are for. Hint given; second try requested.
  - Second try: "Yes, it will find those words, but if the AI wasn't properly taught to assess the implications, it won't…" (Ctrl+F finds them ✓; still unclear that the check therefore passes and misses the inflated score; "taught" ✗, since we instruct with a prompt and rubric anchors, not training). Explained: the check proves the evidence exists, not that the judgement is right; anchors, evals and humans cover judgement. Real example: the csr role-switch over-scoring passed the quote check. Asked for a one-sentence explain-back.

## Learner's open questions
- **2026-10-18:** "How do I get to understand the entire process of this system from start to finish?" → the guided tour, following one record (app_000350) through 7 stops. Stop 1 done.

## Glossary
- **Workflow:** a graph of nodes that n8n runs when its trigger fires.
- **Node:** one step in a workflow (trigger, transform, call an API, branch).
- **Item:** one JSON object flowing between nodes. Most nodes run once per item.
- **Execution:** one run of a workflow, with an ID and the stored input and output of each node.
- **Credential:** a secret stored encrypted in n8n and referenced by nodes, never pasted into node fields.
