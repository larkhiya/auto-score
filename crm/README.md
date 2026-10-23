# Mock CRM

A small stand-in for the client's CRM: jobs with versioned profiles, candidates per job, a REST API for automation, webhooks to n8n, HTML pages for humans, and failure simulation. Node 24 + Express 5 + `node:sqlite`. Decisions: D-018 (status model and API).

- From the host: `http://localhost:3000` · inside Docker Compose: `http://crm:3000`
- Pages (no login, local demo): `/ui/candidates`, `/ui/review`, `/ui/jobs`, `/ui/jobs/:id`
- API: every call needs the `x-api-key` header (`CRM_API_KEY` in `.env`). Errors are `{ "error": { "code", "message", "details" } }`.

## Candidate status model (D-018)
```
NEW ──► SCREENING ──► SHORTLISTED | MAYBE | NOT_A_FIT | NEEDS_REVIEW | PREFILTER_REJECTED
 │          └──► ERROR ──(replay)──► SCREENING
 ├──► PREFILTER_REJECTED | NEEDS_REVIEW | ERROR        decided before scoring starts
AI outcomes ──(human)──► ADVANCED | REJECTED           final decisions: humans only, via the pages
AI outcomes ──► SCREENING                              re-screen (e.g. after a new profile version)
```
- The API (automation) can never set ADVANCED or REJECTED. Those statuses aren't even in the CrmUpdate contract.
- ADVANCED and REJECTED are terminal.
- A request for the status the candidate already has returns `409 ALREADY_IN_STATUS`.
- Any other disallowed move returns `409 ILLEGAL_TRANSITION`, `HUMAN_ONLY` or `TERMINAL_STATE`.

## Job profile versions
`draft → approved → archived`, `draft → archived`. One draft and one approved version per job at a time. An approved version is frozen: editing creates a new draft vN+1, and approving it archives the old version. Approval is blocked while there are code-check errors or unresolved bias flags.

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/jobs` | jobs with current approved and draft versions |
| GET | `/jobs/:id` | the current **approved** profile (`404 JOB_NOT_APPROVED` if none) |
| GET | `/jobs/:id/versions/:v` | any version (archived ones too) |
| GET | `/jobs/:id/draft` | the draft and its check errors |
| POST | `/jobs` | `{job_id, title, jd_text}`: creates the job and fires `job.draft_requested` (→ WF-05) |
| PUT | `/jobs/:id/draft` | `{profile, builder_errors?}`: WF-05 saves the AI draft (contract-validated, code-checked) |
| PATCH | `/jobs/:id/draft` | human edit of `title`, `prefilter`, `criteria`, `nice_to_haves`, `thresholds`, `bias_flags` |
| POST | `/jobs/:id/approve` | `{approved_by}`: freezes the draft as the approved version |
| POST | `/applications[?notify=false]` | creates a NEW candidate and fires `application.created` (→ WF-01). A repeated delivery returns `200 {created:false}` |
| GET | `/candidates?job_id=&status=A,B&limit=&offset=` | list |
| GET | `/candidates/:id[?history=true]` | one candidate (+ status history) |
| PATCH | `/candidates/:id` | body: a **CrmUpdate** (contract). Headers: `Idempotency-Key`, `X-Expected-Status` |
| GET | `/review-queue` | NEEDS_REVIEW candidates |
| POST/GET | `/dead-letters`, `POST /dead-letters/:id/replayed` | **unused since D-028**: the dead-letter queue lives in n8n (Data Table `dead_letters`) so it stays writable when the CRM is down |
| POST/GET | `/run-logs` | RunLog per execution (contract-validated) |
| GET | `/stats` | counts by job and status, open dead letters, webhook deliveries (total, delivered, failed) |
| GET | `/webhook-deliveries?event=&status=failed\|pending\|delivered&subject_id=&limit=` | the webhook delivery log, least recently tried first (D-033) |
| POST | `/webhook-deliveries/:id/redeliver` | one more attempt: same `event_id`, the subject's current state, `redelivery: true`. `409 ALREADY_DELIVERED` unless `{"force": true}` |
| GET/POST | `/admin/chaos` | `{fail_rate, latency_ms, fail_after_rate}` at runtime |
| POST | `/admin/reset` | `{confirm:"delete-all-candidates"}`: test harness only (`scripts/reset-crm.js --yes`) |

### Idempotency and dedupe
- **Create:** the same `source_ref` (e.g. an email Message-ID), or the same job + email + CV fingerprint, returns the existing record. No second record, no second webhook.
- **Same person re-applying** (same job and email, different CV) creates a new record with `duplicate_of` set. The pre-filter's `duplicate` check rejects it (D-016).
- **Claim:** `PATCH {status: SCREENING}` with `X-Expected-Status: NEW` succeeds once; a concurrent or duplicate run gets `409 STATUS_CONFLICT` and skips.
- **Retried writes:** a PATCH with an `Idempotency-Key` that was already applied returns the stored result with `Idempotent-Replay: true` and changes nothing. This makes "the CRM saved it, the response was lost, n8n retried" safe.

### Webhooks (CRM → n8n)
`POST` with headers `x-webhook-secret` (shared secret, checked by WF-01) and `x-event-id`. Bodies:
- `{event: "application.created", event_id, occurred_at, application}`
- `{event: "job.draft_requested", event_id, occurred_at, job: {job_id, title, jd_text}}`

Delivery is retried 3 times with backoff on 5xx, 429 or timeout (about 2 s in all), and every delivery is logged with its subject (the application or job it announced). Webhooks are at-least-once, which is why the receiver must be idempotent.

A delivery that never got a 2xx stays in the log as `failed` (also one with no result after 60 s: the sender died mid-retry). Like the delivery logs of GitHub or Stripe, it can be listed and redelivered; WF-04 does that every minute (D-033). A redelivery is a thin event: it carries the subject's state at the time of redelivery, so the receiver must not assume the record is still new (WF-10's compare-and-set claim decides). Records created with `notify=false` were never announced, so they are never in the log.

### Failure simulation (Phase 6 and 8)
| Setting | Effect |
|---|---|
| `fail_rate` | fraction of API calls that fail **before** doing anything (503, 500 or 429 with `retry-after`) |
| `latency_ms` | added delay on every API call, to exercise client timeouts |
| `fail_after_rate` | `PATCH /candidates` only: the change is **committed**, then a 503 is returned (a lost response) |

Start values come from the `FAIL_RATE` and `LATENCY_MS` env vars.

## Limitations (it's a mock)
- Pages have no login. In a real CRM, human decisions would be tied to an authenticated user.
- One API key for all automation. No per-client scopes.
- SQLite in one container: fine for a demo, not for concurrent writers at scale.
