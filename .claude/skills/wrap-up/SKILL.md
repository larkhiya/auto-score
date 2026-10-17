---
name: wrap-up
description: End a work session by exporting workflows, updating progress, decisions, lessons and learning, then committing
disable-model-invocation: true
---
1. Export any changed n8n workflows to workflows/ (`npm run n8n:export`).
2. Update docs/PROGRESS.md: Now / Next / Blocked, the phase checklist and a new session log entry (done, verified with evidence, not yet verified, concepts, decisions, lessons, next).
3. Make sure every decision and mistake from this session has a D-### or L-### entry. Promote lessons that generalize to Learned Rules in CLAUDE.md.
4. Update statuses and notes in docs/LEARNING.md.
5. Give me a 5-line summary and the single next step.
6. Run the tests, then commit with a descriptive message. Never commit .env.
