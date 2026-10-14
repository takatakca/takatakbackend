# Work log

Newest first, one line per piece of work. Rule: `AGENTS.md` › Work log rule.
Format: `YYYY-MM-DD | agent | branch → PR | status | what | next step`

- 2026-10-14 | ChatGPT | main | done | Fixed refresh hashing/rotation, logout session binding, secure API key checks, exact Upmind matching, DB lifecycle, CORS/health, tests/CI and runbooks | deploy after Render workspace confirmation; rotate leaked signing key (#2), migrate TTL index, review auth retirement PR #1
- 2026-10-11 | cursor | cursor/tk-043-retire-mongo-login → #1 | PR | Retire register, login, OTP, and new Upmind sessions on the MongoDB backend | wait for review; legacy service stays active until this branch is deployed; no accounts deleted
- 2026-10-08 | claude (owner setup) | default branch | done | Added the work log rule, this log and the stop reminder | every agent follows AGENTS.md › Work log rule
