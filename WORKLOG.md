# Work log

Newest first, one line per piece of work. Rule: `AGENTS.md` › Work log rule.
Format: `YYYY-MM-DD | agent | branch → PR | status | what | next step`

- 2026-10-14 | ChatGPT | main | done (live Upmind validation pending) | Loaded hidden Upmind ID during phone OTP to avoid duplicate provisioning, cleared temporary encrypted password on known linked accounts, hardened legacy AES key/ciphertext validation, added tests and updated all five docs | check final matching-SHA CI, verify with real Upmind tenant and coordinate key rotation #2, Auth PR #1, confirmed production hosting and MongoDB TTL audit

- 2026-10-14 | ChatGPT | main | done (production gated; final CI pending) | JWKS now re-reads current public key with bounded cache; expired OTP cleanup conditionally matches stale hash; added concurrency regression tests | check exact latest CI SHA, confirm actual hosting and coordinate issue #2 key rotation, PR #1 Auth cutover and MongoDB TTL audit

- 2026-10-14 | ChatGPT | main | done (production gated) | Sign refresh JWT before atomic rotation; test replay/CAS/bad signer; add /health/version and tests; atomically limit legacy email OTP to 5 attempts and consume once; update CI and docs | verify final main CI, identify hosting, coordinate leaked-key rotation (#2), legacy Auth PR #1 and live DB index audit

- 2026-10-14 | ChatGPT | main | done (production access blocked) | Added read-only sessions TTL index auditor, unit tests, npm audit:sessions script and CI/docs checks | verify final CI SHA, then run against authorized production MongoDB; never migrate indexes without verified backup

- 2026-10-14 | ChatGPT | main | done (production blocked) | Fixed E.164/+1 phone normalization, OTP HTTP 400/cooldown/persistence/CSPRNG, configurable JWT kid with JWKS test, and offline release preflight; added regression tests and deployment docs | check final matching-SHA CI; coordinate exposed key rotation #2, Auth PR #1, MongoDB TTL and verified production hosting before deploying

- 2026-10-14 | ChatGPT | main | done (CI pending) | Enforced DB-backed verified JWT sessions; repaired session/user model, linked Upmind identity with exact brand and null-on-outage totals; deferred OTP provider initialization; added tests and 5 handoff docs; improved CI concurrency | check latest main CI; production workspace/host, key rotation #2, auth PR #1 and MongoDB TTL migration remain blocked

- 2026-10-14 | ChatGPT | main | done | Fixed refresh hashing/rotation, logout session binding, secure API key checks, exact Upmind matching, DB lifecycle, CORS/health, tests/CI and runbooks | deploy after Render workspace confirmation; rotate leaked signing key (#2), migrate TTL index, review auth retirement PR #1
- 2026-10-08 | claude (owner setup) | default branch | done | Added the work log rule, this log and the stop reminder | every agent follows AGENTS.md › Work log rule
