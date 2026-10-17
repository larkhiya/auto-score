# Architecture

Adjusted from brief §3.1 for these decisions: D-007 (Gemini), D-011 (GreenMail), dedupe in the CRM, and email calling WF-10 directly with the webhook suppressed.

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
    B["WF-02 · IMAP trigger<br/>GreenMail now, Gmail later (D-011)"]
  end

  B --> X["Parse email · job from plus-address<br/>extract CV text · create CRM record<br/>(webhook suppressed)"]
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
  L2 --> C{"Validate JSON<br/>verify evidence quotes"}
  C -->|invalid after 1 repair| R
  C -->|ok| M["Code: weighted total →<br/>status from thresholds"]
  M --> W["CRM PATCH (idempotent,<br/>backoff on 429/5xx)"]
  PR --> W
  R --> W
  W --> LOG["RunLog"]
  E["WF-90 · Error Trigger"] -.-> DLQ["ERROR + dead-letter<br/>+ notify (email)"]
```

## Components
| ID | Component | Where | Notes |
|---|---|---|---|
| WF-00 | Hello items | `workflows/00-hello.json` | Phase 0 teaching workflow |
| WF-01 | Intake: CRM webhook | `workflows/01-intake-webhook.json` | shared-secret header; responds 202 at once, processes after |
| WF-02 | Intake: email (IMAP) | `workflows/02-intake-email.json` | GreenMail now; job from `applications+<job>@…`; CV text extraction |
| WF-05 | Job profile builder | `workflows/05-job-profile-builder.json` | JD → LLM draft → checks → DRAFT |
| WF-10 | Screening pipeline | `workflows/10-screening.json` | sub-workflow: validate → dedupe → profile → pre-filter → AI → score → write-back |
| WF-90 | Error handler | `workflows/90-error-handler.json` | Error Trigger → ERROR, dead-letter, notify |
| CRM | Mock CRM | `crm/` | Node 24 + Express + `node:sqlite`; REST, webhooks, pages, failure simulation |
| src | Pure logic | `src/` | inlined into Code nodes by `scripts/build-workflows.js` (drift-tested) |
| Mail | GreenMail | Compose service `greenmail` | SMTP 3025 and IMAP 3143, test only |

## Network (Docker Compose)
- Containers reach each other by service name: n8n → `http://crm:3000`, CRM → `http://n8n:5678/webhook/...`, n8n → `greenmail:3143`.
- From the host: n8n editor `http://localhost:5678`, CRM `http://localhost:3000`.
