# Work log

Newest first, one line per piece of work. Rule: `AGENTS.md` › Work log rule.
Format: `YYYY-MM-DD | agent | branch → PR | status | what | next step`

- 2026-10-14 | ChatGPT | main | done (CI pending) | Enforced DB-backed verified JWT sessions; repaired session/user model, linked Upmind identity with exact brand and null-on-outage totals; deferred OTP provider initialization; added tests and 5 handoff docs; improved CI concurrency | check latest main CI; production workspace/host, key rotation #2, auth PR #1 and MongoDB TTL migration remain blocked

- 2026-10-14 | ChatGPT | main | done | Fixed refresh hashing/rotation, logout session binding, secure API key checks, exact Upmind matching, DB lifecycle, CORS/health, tests/CI and runbooks | deploy after Render workspace confirmation; rotate leaked signing key (#2), migrate TTL index, review auth retirement PR #1
- 2026-10-08 | claude (owner setup) | default branch | done | Added the work log rule, this log and the stop reminder | every agent follows AGENTS.md › Work log rule
