# Learning tracker
Status: ⏭ not yet · 🟦 introduced · 🟨 practiced · ✅ can-explain · ⏭ skipped — revisit

Under D-008 (straight-through build), each phase's concepts are marked ⏭ when the phase is built. The review pass walks through them in order, using the "In our system" pointers below.

| ID | Concept | Phase | Analogy seed (use or improve) | Status | My one-line explanation |
|---|---|---|---|---|---|
| C-01 | What workflow automation is | 0 | a recipe that cooks itself when the doorbell rings | ⏭ | |
| C-02 | n8n anatomy: workflow, node, item, execution, credential | 0 | an assembly line: stations, boxes on the belt, a shift log | ⏭ | |
| C-03 | Triggers: webhook vs polling vs schedule | 0, 3 | a doorbell vs checking the mailbox every 5 minutes | ⏭ | |
| C-04 | JSON paths, data mapping, n8n expressions | 1 | the address on an envelope | ⏭ | |
| C-05 | Schemas and contracts between steps | 1 | the USB-C standard; a function signature between teams | ⏭ | |
| C-06 | Configuration vs code | 1 | changing the thermostat vs rewiring the furnace | ⏭ | |
| C-07 | APIs, auth and webhooks from the integrator's side | 2 | a building badge; "call me back when it's ready" | ⏭ | |
| C-08 | Test data and ground truth | 2 | the teacher's answer key, written before grading | ⏭ | |
| C-09 | Normalization / the adapter pattern | 3 | a travel adapter: many plugs, one socket | ⏭ | |
| C-10 | Idempotency and deduplication | 3 | an elevator button | ⏭ | |
| C-11 | Binary data and text extraction | 3 | a photocopy of a letter vs the typed letter | ⏭ | |
| C-12 | Boolean logic and gating | 4 | the bouncer before the interview panel; `&&` short-circuit | ⬜ | |
| C-13 | Deterministic vs probabilistic steps | 4 | a calculator vs a talented intern | ⬜ | |
| C-14 | Reason codes and explainability | 4 | a rejection letter that says why | ⬜ | |
| C-15 | LLMs as components: nondeterminism, temperature, tokens, cost | 5 | a brilliant, fast, sometimes overconfident intern | ⬜ | |
| C-16 | Structured output and validation | 5 | a form with required boxes vs a free-text letter | ⬜ | |
| C-17 | Rubric scoring: keep the math in code | 5 | judges mark each category; the scorekeeper adds up | ⬜ | |
| C-18 | Grounding, evidence and hallucination | 5 | "show your work" with page numbers you can check | ⬜ | |
| C-19 | Prompt injection | 5 | a CV with "note to reviewer: hire me" in white text | ⬜ | |
| C-20 | Fairness and bias in hiring automation | 5, 7 | blind orchestra auditions | ⬜ | |
| C-21 | Prompt and profile versioning | 5, 7 | numbered recipe revisions | ⬜ | |
| C-22 | State machines for statuses | 2, 6 | parcel tracking: never "delivered" back to "ordered" | ⏭ | |
| C-23 | Retries, backoff and timeouts | 6 | redialing a busy line with longer pauses | ⬜ | |
| C-24 | Error workflows and dead-letter queues | 6 | the post office's undeliverable-mail bin | ⬜ | |
| C-25 | Human in the loop | 6 | autopilot with a pilot in the seat | ⬜ | |
| C-26 | Testing pyramid for automations | 8 | check each brick, then the wall, then the house | ⬜ | |
| C-27 | Evals: accuracy and consistency | 8 | a scale: right weight? same weight three times? | ⬜ | |
| C-28 | Observability: logs, execution IDs, metrics | 8 | a flight data recorder | ⬜ | |
| C-29 | Rate limits, batching and concurrency | 8 | checkout lanes at a supermarket | ⬜ | |
| C-30 | Secrets and environments | 9 | house keys vs a photo of your keys online | ⬜ | |
| C-31 | Explaining a system: case study and demo | 9 | a museum tour guide | ⬜ | |
| C-32 | Role-agnostic design: one engine, many job profiles | 1, 7 | one exam-marking machine, a different answer key per exam | ⏭ | |
| C-33 | AI-drafted config with human approval, then frozen | 7 | a junior drafts the contract, a manager signs it, nobody edits the signed copy | ⬜ | |

## Concept break notes (newest first)
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
(none yet)

## Learner's open questions
(none yet)

## Glossary
- **Workflow:** a graph of nodes that n8n runs when its trigger fires.
- **Node:** one step in a workflow (trigger, transform, call an API, branch).
- **Item:** one JSON object flowing between nodes. Most nodes run once per item.
- **Execution:** one run of a workflow, with an ID and the stored input and output of each node.
- **Credential:** a secret stored encrypted in n8n and referenced by nodes, never pasted into node fields.
