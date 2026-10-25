# Auto-Score Applicants (n8n + AI)

An n8n workflow system that screens job applicants for any role a recruiter sets up:

1. A deterministic Boolean pre-filter.
2. LLM scoring against the role's approved, versioned job profile.
3. Scores, reasons and statuses written into a CRM.

The CRM is the shared [crm-platform](https://github.com/larkhiya/crm-platform) (Twenty + crm-gateway; private for now, cloned next to this repo as `../crm-platform`), used by every automation (D-037). Start it first, because it creates the `automation-net` network this stack joins. The old mock CRM is still in `crm/` behind `docker compose --profile mock`.

> Work in progress: built phase by phase. See [`docs/PROGRESS.md`](docs/PROGRESS.md). The full case study arrives in Phase 9.

- Plan and scope: [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md)
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md) · Lessons: [`docs/LESSONS.md`](docs/LESSONS.md)

All applicant data in this repo is synthetic and fictional.
