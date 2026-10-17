---
name: start-session
description: Start a work session on the auto-score project with a recap, today's goal and a retrieval question
disable-model-invocation: true
---
Follow the "Start" step of the Session protocol in CLAUDE.md:
1. Read docs/PROGRESS.md, the current phase in docs/PROJECT_BRIEF.md §7, the last 3 entries of docs/DECISIONS.md and docs/LESSONS.md, and the Learned Rules.
2. Check that the n8n and CRM containers are running (`docker compose ps`). Say what is down.
3. Tell me in 6 lines or fewer: where we are, today's goal, the concepts coming up.
4. Ask me one retrieval question about an earlier concept that is not yet can-explain. Wait for my answer and give feedback before starting work.
