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
