# Architecture

Adjusted from brief §3.1 for these decisions: D-007 (Gemini), D-011 (GreenMail), dedupe in the CRM, email calling WF-10 directly with the webhook suppressed, and a reconciliation sweep for webhooks n8n missed (D-033).

```mermaid
flowchart LR
  subgraph setup["Job setup · WF-05 (once per role)"]
    JD["Recruiter pastes a JD<br/>CRM POST /jobs"] --> D["LLM drafts a JobProfile<br/>(Gemini, prompt job_profile_builder_vN)"]
    D --> Q["Code: schema + §5.5 checks<br/>+ bias check"]
    Q --> H["Human edits and approves<br/>CRM job page"]
    H --> JP[("Approved JobProfile vN<br/>(frozen)")]
  end

  subgraph triggers["Triggers"]
    A["WF-01 · CRM webhook<br/>POST /webhook/application-received<br/>x-webhook-secret checked"]
    B["WF-02 · IMAP trigger<br/>GreenMail now, Gmail later (D-011)<br/>UNSEEN, no UID bookmark, catch-up every minute (D-034)"]
    RC["WF-04 · every minute<br/>CRM failed webhook deliveries<br/>→ ask the CRM to redeliver (D-033)"]
  end
  RC -.->|"CRM re-sends the same<br/>application.created"| A

  B --> X["WF-03 per email: parse · job from plus-address<br/>extract CV text (PDF/TXT/DOCX) · create CRM record<br/>(webhook suppressed, Message-ID dedupe)"]
  A --> N["normalize → ApplicationReceived"]
  X --> N
  N --> V{"Schema valid?<br/>idempotency_key new?"}
  V -->|duplicate| S0["Skip + log"]
  V -->|invalid| R["NEEDS_REVIEW"]
  V -->|ok| J{"Approved profile<br/>for job_id?"}
  JP -.-> J
  J -->|no| R
  J -->|yes| P{"Pre-filter<br/>(job's rule tree,<br/>true / false / unknown)"}
  P -->|fail| PR["PREFILTER_REJECTED<br/>+ reason codes"]
  P -->|review| R
  P -->|pass| RD["Redact name and contacts"]
  RD --> L1["LLM 1: extract CandidateProfile"]
  L1 --> L2["LLM 2: score the job's rubric → ScoreCard"]
  L1 -.->|"WF-12 → llm-proxy → Gemini<br/>(faults injectable, D-031)"| GP[("llm-proxy")]
  L2 -.-> GP
  L1 -->|"LLM unavailable after retries"| DL
  L2 --> C{"Validate JSON<br/>verify evidence quotes"}
  C -->|invalid after 1 repair| R
  C -->|ok| M["Code: weighted total →<br/>status from thresholds<br/>(±2.5 of a threshold → NEEDS_REVIEW, D-035)"]
  M --> W["CRM PATCH (idempotent,<br/>backoff on 429/5xx)"]
  PR --> W
  R --> W
  W --> LOG["RunLog"]
  W -->|"WF-10 failed (caught by caller)"| DL["WF-91 dead letter<br/>n8n Data Table · CRM ERROR (best effort)<br/>· email ops · RunLog"]
  E["WF-90 · Error Trigger<br/>(uncaught crashes)"] -.-> DL
  DL -.->|"scripts/replay-dlq.js<br/>application.replay"| A
```

## Components
| ID | Component | Where | Notes |
|---|---|---|---|
| WF-00 | Hello items | `workflows/00-hello.json` | Phase 0 teaching workflow |
| WF-01 | Intake: CRM webhook | `workflows/01-intake-webhook.json` | header-auth webhook (403 on a wrong secret); responds 202 at once; normalizes; calls WF-10 |
| WF-02 | Intake: email trigger | `workflows/02-intake-email.json` | IMAP trigger (GreenMail now, Gmail later); UNSEEN with no UID bookmark across restarts, reconnect + catch-up every minute (D-034); one WF-03 execution per email, failures captured per email (D-023) |
| WF-04 | Reconcile missed webhooks | `workflows/04-reconcile-webhooks.json` | every minute: the CRM's failed `application.created` deliveries (10 per run) → `POST /webhook-deliveries/:id/redeliver` → the CRM re-sends to WF-01; WF-10's claim skips anything already screened. Successful runs aren't saved (D-033) |
| WF-03 | One email → application | `workflows/03-email-to-application.json` | parse sender and plus-address → extract PDF/TXT/DOCX text → create CRM record (no webhook, Message-ID dedupe) → normalize → WF-10 |
| WF-11 | CRM call with retry policy | `workflows/11-crm-request.json` | every CRM call goes through here: backoff on 429/5xx/timeouts, never on other 4xx (D-024) |
| WF-05 | Job profile builder | `workflows/05-job-profile-builder.json` | JD → LLM draft → checks → DRAFT |
| WF-10 | Screening pipeline | `workflows/10-screening.json` | sub-workflow: validate → dedupe → profile → pre-filter → AI → score → write-back |
| WF-12 | LLM JSON step | `workflows/12-llm-json-step.json` | Gemini `generateContent` (native schema, temp 0) with backoff, contract check, one repair; the only provider-specific workflow (D-007, D-025) |
| WF-90 | Error handler | `workflows/90-error-handler.json` | Error Trigger → WF-91, for uncaught crashes (error workflow of WF-01 and WF-02) |
| WF-91 | Dead letter | `workflows/91-dead-letter.json` | n8n Data Table `dead_letters` (works while the CRM is down) + best-effort CRM ERROR + email to ops + RunLog (D-028) |
| Replay | Dead-letter replay | `scripts/replay-dlq.js` | open rows → ERROR → `application.replay` → WF-10 reclaims ERROR→SCREENING; idempotent |
| CRM | Mock CRM | `crm/` | Node 24 + Express + `node:sqlite`; REST, webhooks with a delivery log (list failed, redeliver: D-033), pages, failure simulation |
| Proxy | LLM proxy | `llm-proxy/` · Compose service `llm-proxy` | between WF-12 and Gemini: forwards unchanged; `/admin/chaos` arms rate_limit / server_error / invalid_json / timeout for the next N calls (D-031); never logs the key |
| Eval | Evaluation tooling | `scripts/eval-smoke.js`, `failure-matrix.js`, `eval-report.js`, `role-switch-report.js` | regression smoke (5 per role), §5.4 failure-injection matrix, `reports/eval-<date>.md` |
| src | Pure logic | `src/` | inlined into Code nodes by `scripts/build-workflows.js` (drift-tested) |
| Mail | GreenMail | Compose service `greenmail` | SMTP 3025 and IMAP 3143, test only |

## Network (Docker Compose)
- Containers reach each other by service name: n8n → `http://crm:3000`, CRM → `http://n8n:5678/webhook/...`, n8n → `greenmail:3143`, n8n → `http://llm-proxy:8090` → `https://generativelanguage.googleapis.com`.
- From the host: n8n editor `http://localhost:5678`, CRM `http://localhost:3000`, llm-proxy admin `http://127.0.0.1:8090` (bound to loopback only).
