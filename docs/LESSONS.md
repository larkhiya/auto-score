# Lessons

Template:
```
## L-### · <short title>
- **Date:** · **Phase:** · **Who:** Claude | learner
- **What happened:**
- **Symptom:** how we noticed
- **Root cause:**
- **Fix:** and how it was verified
- **Prevention rule:** → promoted to Learned Rules? yes / no
- **Concept it illustrates:** C-##
```

---

## L-019 · The test harness polled the CRM as if it had no rate limit, because the mock had none
- **Date:** 2026-10-25 · **Phase:** 8b · **Who:** Claude
- **What happened:** the first `eval:smoke` against the shared CRM stopped with "The operation was aborted due to timeout". All 15 records had been created and screened correctly; the *harness* timed out while waiting for them.
- **Symptom:** a client timeout (15 s) in the script, after the pipeline had finished its work. The gateway's stats showed 62 retried Twenty calls.
- **Root cause (why chain):**
  - Why the timeout? `waitSettled` read all 15 records in parallel every 5 s. Each read costs the gateway 1–2 calls to Twenty, and the gateway spends at most 90 a minute (Twenty allows 100). The last calls of each burst queued for more than 15 s.
  - Why was the burst so large? The gateway's job cache had a stampede: when it expired, all 15 parallel readers refetched the job list at once (crm-platform PL-011).
  - Why wasn't this seen before? The mock CRM had no rate limit, so the harness's call pattern was never priced. A fake that is more generous than the real dependency hides exactly this.
- **Fix:**
  - `waitSettled` makes one list call per round (`status=NEW,SCREENING`), then reads each record once, one at a time. `role-switch-report.js` reads sequentially too.
  - The gateway's job cache is single-flight (one fetch per expiry, unit-tested).
  - Verified by the re-run of `eval:smoke` (PROGRESS session log).
- **Prevention rule:** price every polling loop against the dependency's rate limit: one list call per round, never N parallel reads. → promoted to Learned Rules: yes (L-019).
- **Concept it illustrates:** C-29 (rate limits, batching and concurrency); C-40 in crm-platform (a test double more generous than the real thing).

## L-018 · Our docs said the Gemini quota day resets at 00:00 UTC; it resets at midnight Pacific
- **Date:** 2026-10-24 (UTC) · **Phase:** 8 · **Who:** Claude
- **What happened:** PROGRESS planned the next quota day as "after 00:00 UTC". Google's rate-limits page says: "Requests per day (RPD) quotas reset at midnight Pacific time" (07:00 UTC while PDT is in force, 08:00 UTC after 1 Nov). It also says limits apply per project, not per key.
- **Symptom:** caught while preparing today's runs, before any of them started (no run was cut short by it).
- **Root cause:** L-014 took the limit (500 per day) from the 429 body, which is the provider. The reset time was assumed, not read.
- **Fix:** PROGRESS corrected; today's runs are planned to finish before 07:00 UTC.
- **Prevention rule:** L-014 widened in CLAUDE.md: read both the limit and its reset time from the provider. → promoted: yes
- **Concept it illustrates:** C-29 (rate limits)

## L-017 · My new matrix check looked up a mixed-case email the CRM stores lowercased
- **Date:** 2026-10-19 · **Phase:** 8 · **Who:** Claude
- **What happened:** the first run of the "doors" matrix group reported the email door as lost ("0 record") after n8n's restart. The email had in fact been processed 50 s after the restart (WF-02 exec 4448 → `app_000611` NEEDS_REVIEW MISSING_ANSWER).
- **Symptom:** the check said "no record", but WF-02's executions and its bookmark had moved on.
- **Root cause:** the check built the sender as `robin.okafor+doorB<stamp>@…` (capital B) and compared it exactly with `candidate.email`. The CRM lowercases emails on create (D-018 dedupe), so they never matched. The older email group used lowercase tags, so it never hit this.
- **Fix:** the helper lowercases the address it returns. The run was stopped and re-run. Before re-running, I confirmed in the CRM that both doors of the first run had worked (`app_000610`, `app_000611`, 0 LLM calls).
- **Prevention rule:** compare identifiers the way the system of record normalizes them. Before trusting a "lost" result, look for the record by a looser match (execution, Message-ID). Not promoted (harness-specific).
- **Concept it illustrates:** C-28 (observability: a check is evidence only if it looks where the system writes)

## L-016 · The failure matrix restarted every dependency except the system's own front doors
- **Date:** 2026-10-18 · **Phase:** 8 · **Who:** Claude (found during the learner's tour, stop 1)
- **What happened:** the learner's concept question ("n8n is down for 30 s; which application is lost?") became a live test, and it found two silent-loss paths that the §5.4 matrix had never exercised:
  1. **CRM door:** with n8n stopped, the CRM's 3 webhook retries (about 4 s) all failed. `app_000607` stays NEW forever; nothing ever re-sends it.
  2. **Email door:** GreenMail keeps mail in memory, so its message UIDs restart at 1 after a restart. WF-02's IMAP trigger keeps `lastMessageUid: 39` in its static data (the node's default `trackLastMessageId`), so it skips the new message forever.
- **Symptom:** after n8n came back, the CRM record stayed NEW and the mailbox still held 1 UNSEEN message with no WF-02 execution.
- **Root cause:** I designed the matrix from the outside in (CRM down, LLM down) and never restarted the orchestrator or the mail server. I also accepted a node default (`trackLastMessageId`) without asking what state it keeps and when that state goes stale.
- **Fix (2026-10-19):**
  - **CRM door, fixed (D-033).** The CRM's webhook delivery log can be listed and redelivered. WF-04 asks for a redelivery of every failed `application.created` once a minute, so seeded NEW records (never announced) are never touched. `app_000607` → PREFILTER_REJECTED via WF-01 exec 4407 / WF-10 4408, 0 LLM calls.
  - **Email door, partly fixed (D-034).** WF-02 now runs with `trackLastMessageId: false` and `forceReconnect: 1`: no bookmark survives an n8n restart, and waiting mail is caught up within a minute. Reading the node's source showed that the suggested one-option fix wasn't enough (no catch-up at activation without a bookmark), and that the node sets the bookmark again in memory after every batch. So a GreenMail-only restart while n8n runs still strands mail until WF-02 is re-published. That gap is open, for the learner (D-034 options D/E).
  - Matrix group `doors`: see PROGRESS Phase 8.
- **Prevention rule:** failure tests must also restart the orchestrator itself and every stateful trigger source, and check that nothing is left behind. → Learned Rule added.
- **Concept it illustrates:** C-03 (push vs pull, and how each one loses events), C-24 (every record ends in a known state)

## L-015 · I committed an overwritten evidence file without reading it
- **Date:** 2026-10-18 · **Phase:** 8 · **Who:** Claude
- **What happened:** the accidental live runs from `npm test` (L-009) also rewrote `reports/injection-test-2026-10-17.json`. I committed the changed file in Phase 7 part 1 without opening it. The new content showed one failing case (sdr-006, +7.5 vs a 6.25 tolerance), while PROGRESS kept citing the same file as "3/3 pass".
- **Symptom:** the Phase 8 eval report reads that file and marked the injection row ❌; `git log` shows the change landed in the Phase 7 part 1 commit.
- **Root cause:** I treated a report as a build artifact, not as evidence. An unexpected change to an evidence file is a signal; I staged it with everything else.
- **Fix:** kept the Phase 5 claim in PROGRESS and added a dated correction under it; the row is now re-examined against measured noise (Phase 8).
- **Prevention rule:** before committing a changed file under `reports/`, read it and check every doc line that cites it. → Learned Rule added.
- **Concept it illustrates:** C-27 (evals: an eval is only as good as its evidence trail)

## L-014 · I planned the eval around a quota I'd never checked
- **Date:** 2026-10-18 · **Phase:** 8 · **Who:** Claude
- **What happened:** my Phase 8 estimate (about 586 calls "in one day") rested on the third-party "~1,000 requests per day" figure in D-007. The real free-tier limit is 500 per day. It ran out during the failure matrix, after a day that had already used about 450 calls.
- **Symptom:** in the matrix's rate-limit check, real 429s followed the two injected ones (proxy log `status=429` without `injected`), and the record went to ERROR `LLM_UNAVAILABLE` after 139 s. The 429 body: `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, quotaValue 500, retryDelay 24344 s.
- **Root cause:** I never read the quota from the authoritative source. The 429 body states it exactly, and the plan said "check AI Studio". I also didn't count the day's calls before starting a run.
- **Fix:** D-007 updated with the real limit. The run plan is now split across quota days, and the rate-limit check will be re-run on a fresh quota. The pipeline itself behaved correctly: retries, then ERROR + dead letter, then replayed to SHORTLISTED.
- **Prevention rule:** before any run of more than 20 LLM calls, state the provider's real daily limit and the calls already used that day; plan runs to finish inside one quota day. → Learned Rule added.
- **Concept it illustrates:** C-29 (rate limits, batching and concurrency)

## L-013 · The test harness froze its own event loop and crashed on a dead socket
- **Date:** 2026-10-18 · **Phase:** 8 · **Who:** Claude
- **What happened:** the failure matrix ran child scripts (`replay-dlq.js`, `chaos-run.js`) with `execFileSync`. That blocks Node's event loop for as long as the child runs (about 25 s for a replay). Meanwhile the CRM closed its idle keep-alive connection. The client couldn't notice, reused the dead socket on its next request, and died with a bare `fetch failed`. The matrix also saved its report only at the very end, so the 14 finished checks were lost from the report (kept in the log).
- **Symptom:** the matrix stopped right after the LLM-outage replay with `fetch failed` and exit 1; no report file.
- **Root cause:** a synchronous call inside an async program that holds pooled connections, plus an all-or-nothing save.
- **Fix:** `runScript` now uses async `execFile`; each group runs in its own try/catch; the report is always saved (with a `crashed` field), and errors print their `cause` code. Re-run: dup/job/bias/email 11/11, crm 2/2, no crash.
- **Prevention rule:** no `*Sync` child processes or sleeps in async harnesses that hold network connections; long runs save results incrementally. No new Learned Rule (specific to harness code); recorded here.
- **Concept it illustrates:** C-28 (observability: a harness that loses its own evidence)

## L-012 · A regex lost its backslash inside an edit script
- **Date:** 2026-10-18 · **Phase:** 8 · **Who:** Claude
- **What happened:** I added `endpoint()` to `src/gemini.js` with a Node edit script, writing the new function as a JS string inside a quoted heredoc. The function's regex `/\/+$/` came out as `//+$/`: one escaping layer (the JS string literal) swallowed the backslash. That turned the regex into a comment, a syntax error.
- **Symptom:** `npm test`: two test files failed to load with `SyntaxError: Unexpected token '}'` at `src/gemini.js:22`; the test count dropped from 158 to 154.
- **Root cause:** code written as data. A quoted heredoc protects against the shell (L-003), but the JS string literal inside the script is a second layer with its own escapes. I'd used the scripted-edit habit for a code change where the Edit tool is the right tool.
- **Fix:** corrected the line with the Edit tool; `npm test` 164/164, `build:check` up to date.
- **Prevention rule:** change code with Edit/Write; keep scripted edits for data (JSON, CSV) where nothing needs escaping. → Learned Rule L-003 widened.
- **Concept it illustrates:** —

## L-011 · An interpreter "fallback" that ran nothing
- **Date:** 2026-10-18 · **Phase:** 7 · **Who:** Claude
- **What happened:** to apply four edits to `scripts/generate-applicants.js` I wrote `python3 - <<'EOF' … EOF || node - <<'EOF2' …`, meaning "whichever is installed". The python heredoc was empty, python3 exited 0 having done nothing, so the Node edit script never ran.
- **Symptom:** the command printed nothing; the script ends with `console.log('ok')`.
- **Root cause:** a `||` chain treats "succeeded at nothing" as success. I reached for a clever shell construct instead of running the one interpreter I'd actually written the script for.
- **Fix:** ran `node - <<'EOF'` directly. It printed `ok`, and the regenerated dataset and `npm test` (158/158) confirmed the edits.
- **Prevention rule:** run the interpreter you wrote the script for, and make every edit script print a success marker that you check before moving on. Same family as L-003 (shell constructs); no new Learned Rule.
- **Concept it illustrates:** —

## L-010 · The AI chain ignored its output parser
- **Date:** 2026-10-18 · **Phase:** 7 · **Who:** Claude
- **What happened:** WF-05's first two drafts both failed with "no output". The LLM Chain returned raw text (`{"text": "```json…"}`), and the model never saw the schema's format instructions, so it invented field names (`job_title`, `id`).
- **Symptom:** draft_error "the reply did not match the required JSON format: no output" on both jobs, even though Gemini answered.
- **Root cause:** in chainLlm 1.9 a connected Structured Output Parser is used only when the `hasOutputParser` switch ("Require Specific Output Format") is true, and it defaults to false. My node-info tool printed the parameter's `hide` condition as `show=…`, so I misread "hidden for v1, 1.1, 1.3" as "only for those versions" and left it out.
- **Fix:** `hasOutputParser: true` in WF-05. `scripts/n8n-node-info.js` now labels `show=` vs `HIDE=`. Found by reading the execution's real node outputs (L-004) and then the node source.
- **Prevention rule:** covered by L-004 (inspect execution data first). The tool fix removes the misleading output; no new rule.
- **Concept it illustrates:** C-16 (structured output: the format has to reach the model)

## L-009 · `npm test` silently made live LLM calls
- **Date:** 2026-10-18 · **Phase:** 7 · **Who:** Claude
- **What happened:** `scripts/injection-test.js` (the live prompt-injection check, 12 Gemini calls) matched Node's default test pattern `**/*-test.js`. Every `npm test` since Phase 5 (about 4 runs) also ran it: about 48 unintended LLM calls, and 30 s per test run. Unit tests must never touch a paid or rate-limited service.
- **Symptom:** in Phase 7 a full run listed `✖ scripts\injection-test.js (31216 ms)` among the failures. Earlier it had passed silently and was counted as one "test".
- **Root cause:** `npm test` was `node --test` with default discovery, which scans the whole repo; I named a script after what it does without checking the runner's patterns. I also didn't notice the test-time jump from about 3 s to about 30 s.
- **Fix:** renamed the script to `scripts/injection-check.js` (`npm run check:injection`). `npm test` now runs only `tests/**/*.test.js`. Verified: 156 tests in 2.6 s, no network.
- **Prevention rule:** scope the test runner explicitly; never name a live script `*-test.js` / `test-*.js`. → promoted to Learned Rules: yes
- **Concept it illustrates:** C-26 (testing pyramid: unit tests are fast, offline and deterministic)

## L-008 · The failure-injection harness reported a record as LOST that wasn't
- **Date:** 2026-10-17 · **Phase:** 6 · **Who:** Claude
- **What happened:** the first `chaos-run.js` (2 records, CRM failing 100%) reported "records in 2 = out 1, LOST: csr-027". csr-027 actually finished as MAYBE seven seconds after the harness reported.
- **Symptom:** a LOST record whose CRM history showed a normal NEW → SCREENING → MAYBE.
- **Root cause:** two harness bugs.
  - It switched chaos off as soon as the webhooks were *sent*, so the "outage" lasted about 10 s instead of covering the processing.
  - It only waited while a record was SCREENING. csr-027 was still NEW (its claim was retrying), so the harness stopped waiting and judged too early.
  - Underneath both: I tested the system's failure handling with a harness I hadn't checked against the timeline of the very executions it measured.
- **Fix:** chaos stays on until every record has *settled* (final, ERROR, or covered by a dead letter), polled with tolerant reads. A total outage is held for a fixed period, then accounted for after chaos is off. The misleading report was deleted. Added a `require.main` guard after a syntax check accidentally ran the script.
- **Prevention rule:** before trusting a harness verdict, cross-check one surprising result against the system's own records (execution timeline, CRM history). → promoted to Learned Rules: no (covered by L-004: look at the real data)
- **Concept it illustrates:** C-27 (evals: the measuring instrument can be wrong too)

## L-007 · Live workflows lagged behind git after a shared src change
- **Date:** 2026-10-17 · **Phase:** 5 · **Who:** Claude
- **What happened:** after changing `src/text.js` I ran `npm run build` (which rebuilt the bundles in every workflow file) but imported only WF-10 and WF-12. WF-01 and WF-03 in n8n kept the old bundle.
- **Symptom:** a byte-for-byte comparison of n8n's export against `workflows/` showed DIFF for 01 and 03. I found it while checking an unrelated file-lock error during export.
- **Root cause:** a src module can be bundled into several workflows, so "the workflows I edited" isn't the same as "the workflows that changed". The drift test only compares repo files against src, not n8n against the repo.
- **Fix:** imported all workflows; all 7 now match. Added `npm run n8n:drift` (export n8n → compare with git, exit 1 on any difference).
- **Prevention rule:** after `npm run build`, import ALL workflows and run `npm run n8n:drift`. → promoted to Learned Rules: yes
- **Concept it illustrates:** C-28 (observability: know what is actually deployed)

## L-006 · The evidence check rejected real quotes because of list markers
- **Date:** 2026-10-17 · **Phase:** 5 · **Who:** Claude
- **What happened:** in the v1 20-per-role run, the name-swap pair went to NEEDS_REVIEW (EVIDENCE_NOT_VERIFIED). One of the two "unverified" quotes was genuine: the model quoted two adjacent bullets as one passage and left out the `- ` marker between them.
- **Symptom:** "quote not found" on text I could see in the CV.
- **Root cause:** `containsQuote` compared the raw layout. A line-start list marker is formatting, but my normalizer treated it as content. I hadn't tested a quote that spans lines. (The other unverified quote was genuinely stitched from two different jobs, and was correctly rejected.)
- **Fix:** `stripListMarkers` before matching; the CV fingerprint is unchanged. Test: an adjacent-bullet quote passes and a cross-job stitched quote still fails. Reproduced first with `data/out/quote-check.js` on the exact text WF-10 saw (L-004 applied).
- **Prevention rule:** covered by L-004 (reproduce on the real input before changing code); no new rule.
- **Concept it illustrates:** C-18 (grounding: verify the evidence, but verify it fairly)

## L-005 · Synthetic "medium" CVs didn't match their answer-key band
- **Date:** 2026-10-17 · **Phase:** 5 · **Who:** Claude
- **What happened:** in the first smoke run, both "medium" applicants scored 26–33 (NOT_A_FIT) where the answer key said MAYBE (55–74). After the first fix the CSR medium overshot to 81.25, above the strong applicant.
- **Symptom:** 4/5 agreement per role, and every miss was a medium persona.
- **Root cause:** I wrote the medium templates from intuition ("some experience") and never checked them against the rubric anchors. The anchors reward specifics: a daily volume earns customer-facing 4, and any number earns results 3. So 2–3 generic bullets scored about 30, and adding volumes and numbers pushed it to about 80. The answer key's intent was right; the CV text didn't embody it.
- **Fix:** each tier's template now documents its intended anchor level per criterion and the expected weighted total (`scripts/lib/personas.js`). Medium CSR keeps channels and one tool, but has no daily volume and names a metric without a number. Learner chose this over lowering the threshold or relabelling (2026-10-17). Verified: smoke set 12/12, with mediums at 58.75–71.25; pre-filter still 222/222.
- **Guard against overfitting:** the change was reasoned from the anchors, not tuned to one score. The 20-per-role run is the wider check.
- **Recurred (same root cause) in the 20-per-role run:**
  - "Strong" SDR CVs sampled their bullets randomly and sometimes lacked the quota bullet (20% weight), scoring MAYBE. Strong templates now always include the two highest-weighted criteria.
  - The 29k-character CV cycled its older job dates through 15 years, so they genuinely overlapped. The model correctly flagged INCONSISTENT_DATES; dates are now sequential.
- **Prevention rule:** before trusting a synthetic answer key for an AI rubric, score each persona template against the anchors by hand and write the expected range next to it. → promoted to Learned Rules: yes
- **Concept it illustrates:** C-08 (ground truth), C-27 (evals)

## L-004 · n8n sent no request body: two wrong theories before looking at the wire
- **Date:** 2026-10-17 · **Phase:** 3 · **Who:** Claude
- **What happened:** WF-11's PATCH to the CRM kept failing with 422 CONTRACT_VIOLATION (empty body). I "fixed" it twice on theory: first the response-format autodetect, then the `??`/`{}` inside the `jsonBody` expression. Neither was the cause. Only then did I capture the real request with an echo server: `content-length: 0`.
- **Symptom:** CRM 422s ("must be object", later "missing schema_version") although the item clearly held the body.
- **Root cause:** `sendBody` was an expression (`={{ $json.has_body }}`). n8n decides which dependent parameters are visible (content type, `specifyBody`, `jsonBody`) from the raw parameter value, so with an expression the body parameters counted as hidden and were never read. Process cause: I changed code before observing the actual behaviour.
- **Fix:** `sendBody: true` (static). Verified on the wire (68-byte JSON body) and end to end: claim NEW→SCREENING once (exec 23), redelivery skipped with 409 (exec 26). The two earlier changes are harmless and kept as explicit settings (JSON response format, strings built in the Code node), with their misleading comments corrected.
- **Prevention rule:** when an integration misbehaves, capture what is actually sent before theorising. Never drive an n8n "switch" parameter (`sendBody`, `sendHeaders`, `authentication`, `resource`/`operation`) with an expression. → promoted to Learned Rules: yes
- **Concept it illustrates:** C-28 (observability: look at the data, not your model of it)

## L-003 · Bash executed text I meant to write into a doc
- **Date:** 2026-10-17 · **Phase:** 2 · **Who:** Claude
- **What happened:** I updated LEARNING.md with `node -e "..."` and put markdown containing backticks and `$` inside the double-quoted string. Bash treated each backticked path as a command and ran it, including `scripts/generate-applicants.js`. The doc came out mangled. Earlier the same pattern had expanded `${CRM_API_KEY:?…}` in a Compose edit and broken a JS string in a `sed` fix.
- **Symptom:** "Not a directory" errors and generator output pasted into the doc.
- **Root cause:** bash expands backticks and `$` inside double quotes. I used shell one-liners for content edits because they're quick, even though the content contained shell syntax.
- **Fix:** rewrote the section with the Edit tool. Checked the side effect: the generator is seeded, and a re-run produces byte-identical files (sha256 compared), so the data didn't change.
- **Prevention rule:** never put file content in a double-quoted shell string. Use Edit/Write, or a script in a quoted heredoc (`<<'EOF'`). → promoted to Learned Rules: yes
- **Concept it illustrates:** C-30 (environments: the shell is an interpreter, not a text pipe)

## L-002 · Scripted edit broke the CRM app, and the test run hung instead of failing
- **Date:** 2026-10-17 · **Phase:** 2 · **Who:** Claude
- **What happened:** I added the `/admin/reset` route with a scripted string replacement and placed it above the line that declares `wrap`. `createApp` threw "Cannot access 'wrap' before initialization". The test setup had already opened a webhook server before failing, and `test.after` crashed on the server that never started, so the open server kept Node alive. `npm test` hung for 2 minutes instead of failing fast.
- **Symptom:** `npm test` timed out with no output. Running the file directly showed the ReferenceError.
- **Root cause:** (1) I edited by pattern without reading the surrounding code, even though the tool had warned the file had changed. (2) The cleanup assumed setup had succeeded.
- **Fix:** moved `wrap` above every route that uses it. `test.after` now closes only what exists and drops open connections. Verified: 82/82 tests pass in 2.8 s.
- **Prevention rule:** read the target region before inserting code; test teardown must tolerate a half-finished setup. → promoted to Learned Rules: yes
- **Concept it illustrates:** C-26 (testing pyramid: tests must fail loudly, never hang)

## L-001 · Container startup log printed a test secret
- **Date:** 2026-10-17 · **Phase:** 0 · **Who:** Claude
- **What happened:** while checking that GreenMail started, I printed its logs. The entrypoint echoes its full Java command line, which included the test mailbox password from `GREENMAIL_OPTS`.
- **Symptom:** the secret was visible in the tool output in the chat transcript.
- **Root cause:** I filtered the log by keyword (`grep -v password`), but the secret's line doesn't contain that word. Keyword filters can't know where a secret will appear; only matching the secret's value can.
- **Fix:** rotated `MAIL_PASSWORD` (regenerated by `init-env`, container recreated). Added `scripts/redact.js`, which masks every `*KEY|*SECRET|*PASSWORD|*TOKEN` value from `.env`. Verified: the new log shows `users=applications:***@`.
- **Prevention rule:** pipe container or tool output that might echo config through `node scripts/redact.js`. → promoted to Learned Rules: yes
- **Concept it illustrates:** C-30 (secrets and environments)
