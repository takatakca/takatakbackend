# Agent instructions

## Work log rule (every agent: Claude, Codex, Cursor, people)

Cheap to follow: read only what is listed here.

1. **Before you start:** read the top of the log (`head -40 WORKLOG.md`) and the titles of open pull requests (`gh pr list`). If a line for the same work is `active` or has an open PR, do not redo it: continue that branch or pick other work.
2. **Claim it:** add one line at the top of the log with status `active`.
3. **Before you stop:** update your line with the status (`done`, `PR #n`, `blocked: reason`) and the next step. Commit and push it with your work. Never stop with unlogged work.
4. One line per piece of work, newest first. Details go in the PR, not the log.

Line format: `YYYY-MM-DD | agent | branch → PR | status | what | next step`

## Required continuity files

Before any new work, read `docs/AGENT_HANDOFF.md` and `docs/PROJECT_STATUS.md` after checking this file, `WORKLOG.md`, and open PRs.

Maintain the following on `main` as an auditable handoff:
- `docs/PROJECT_STATUS.md` — verified implemented vs blocked features and external dependencies.
- `docs/TASK_QUEUE.md` — actionable work with priorities and exact completion criteria.
- `docs/AGENT_HANDOFF.md` — last completed task, current task, modified paths, preceding pushed SHA (and how to fetch current head), commands/CI, blockers, deployment evidence and next command.
- `docs/DEPLOYMENT.md` — actual host/service/branch, deployment runbook, live SHA, health and rollback status.
- `docs/DECISIONS.md` — durable architectural and migration choices.

Do not invent deployment access or progress. GitHub CI passing means code checks passed, **not** production deployed. Coordinate rotation of publicly committed signing keys before broadening authentication.

## Brand rule

Everything visual or written for TAKATAK follows `BRAND.md` (logo, colours, tagline, services). Electric blue on deep navy; never the old gold "TK" logo; green is for status only.
