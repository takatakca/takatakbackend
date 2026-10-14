# Work log

Newest first, one line per piece of work. Rule: `AGENTS.md` › Work log rule.
Format: `YYYY-MM-DD | agent | branch → PR | status | what | next step`

- 2026-10-14 | ChatGPT | main | active | Harden legacy JWT authorization against exposed signing key; repair dashboard linkage; build five-file project handoff | add tests/CI evidence, update docs, verify CI and deployment status

- 2026-10-14 | ChatGPT | main | done | Fixed refresh hashing/rotation, logout session binding, secure API key checks, exact Upmind matching, DB lifecycle, CORS/health, tests/CI and runbooks | deploy after Render workspace confirmation; rotate leaked signing key (#2), migrate TTL index, review auth retirement PR #1
- 2026-10-08 | claude (owner setup) | default branch | done | Added the work log rule, this log and the stop reminder | every agent follows AGENTS.md › Work log rule
