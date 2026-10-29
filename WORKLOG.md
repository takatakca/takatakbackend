# Work log

Newest first, one line per piece of work. Rule: `AGENTS.md` › Work log rule.
Format: `YYYY-MM-DD | agent | branch → PR | status | what | next step`

- 2026-10-29 | ChatGPT | main | active | Correct read-only phone collision audit for equivalent E.164 formats and invalid historic values; synchronize GitHub handoff and new dedicated Drive note | add pipeline + tests, check exact-SHA CI, document live DB verification gate and deployment blockers

- 2026-10-16 | ChatGPT | main | done (live data audit and index migration blocked) | SMS login/resend/verification reject duplicate-number accounts (409) before Twilio; privacy-preserving read-only audit:phones detects collisions and full unique index, new tests and CI run 38942642798 success | verify final main SHA CI; run audit on confirmed authorized MongoDB, review phone ownership/backup before unique index; verify host and RSA rotation #2/central Auth PR #1

- 2026-10-16 | ChatGPT | main | done (live provider verification pending) | Shared MongoDB-atomic 30-second phone/email OTP cooldown; committed bcrypt email code before SendGrid; saved registration before delivery; 409 duplicates and 503 delivery recovery; new concurrency/provider tests; CI 38883037421 passed | verify final exact-SHA CI, actual SendGrid/Twilio and MongoDB test integration, production host and key rotation #2/central Auth PR #1

- 2026-10-16 | ChatGPT | main | done (production/provider verification gated) | Moved Upmind lease before search; marked remote creates durably before POST; prevented stale full-document retry saves; added crash/timeout/late-worker/reconciliation tests; CI 38852790065 passed | confirm exact final handoff SHA CI; verify real Upmind sandbox idempotency and hosting; coordinate RSA issue #2, Auth PR #1 and MongoDB TTL audit

- 2026-10-15 | ChatGPT | main | done (live Upmind/DB validation pending) | Added two-minute per-user MongoDB CAS lease, guarded Upmind client association persistence, losing-worker no-POST regression and tests; deployment notes updated | verify latest exact-SHA CI and diagnose failures; test real provider tenant, key rotation #2 and confirmed backend host

- 2026-10-15 | ChatGPT | main | done (live Upmind verification pending) | Fetch complete Upmind billing collections and report null dashboard totals on unlinked/invalid provider data; new mocked HTTP and owner dashboard regression tests passed CI 38774066176 | validate real provider schema and deployment after host selection

- 2026-10-15 | ChatGPT | main | done (known RSA exposure still requires rotation) | Added CI tracked-secret prevention, immutable SHA check for known leaked RSA blob, three prevention tests; fixed PEM test fixture and passed CI 38735471909 | verify latest main CI; coordinate RSA issue #2, actual production host, Upmind live contract, Auth PR #1 and database migration

- 2026-10-15 | ChatGPT | main | done (live provider/hosting gated) | Added mocked full Upmind HTTP service tests for paginated linking, empty/ambiguous search and provision; protected owner-bound five-minute Upmind token from caching/missing secret; CI green on code | verify final matching-SHA CI, then real Upmind brand/consumer and backend host; RSA rotation #2, Auth PR #1 and MongoDB TTL need coordinated access

- 2026-10-15 | ChatGPT | main | done (real Upmind verification pending) | Paginate and validate full Upmind customer search with consistent total; reject incomplete search and malformed IDs before linking/provisioning; add regression tests and five-doc handoff | verify final matching-SHA CI; validate real Upmind brand/tenant and coordinated RSA rotation #2; production host/DB and Auth PR #1 remain gated

- 2026-10-14 | ChatGPT | main | done (live Upmind validation pending) | Loaded hidden Upmind ID during phone OTP to avoid duplicate provisioning, cleared temporary encrypted password on known linked accounts, hardened legacy AES key/ciphertext validation, added tests and updated all five docs | check final matching-SHA CI, verify with real Upmind tenant and coordinate key rotation #2, Auth PR #1, confirmed production hosting and MongoDB TTL audit

- 2026-10-14 | ChatGPT | main | done (production gated; final CI pending) | JWKS now re-reads current public key with bounded cache; expired OTP cleanup conditionally matches stale hash; added concurrency regression tests | check exact latest CI SHA, confirm actual hosting and coordinate issue #2 key rotation, PR #1 Auth cutover and MongoDB TTL audit

- 2026-10-14 | ChatGPT | main | done (production gated) | Sign refresh JWT before atomic rotation; test replay/CAS/bad signer; add /health/version and tests; atomically limit legacy email OTP to 5 attempts and consume once; update CI and docs | verify final main CI, identify hosting, coordinate leaked-key rotation (#2), legacy Auth PR #1 and live DB index audit

- 2026-10-14 | ChatGPT | main | done (production access blocked) | Added read-only sessions TTL index auditor, unit tests, npm audit:sessions script and CI/docs checks | verify final CI SHA, then run against authorized production MongoDB; never migrate indexes without verified backup

- 2026-10-14 | ChatGPT | main | done (production blocked) | Fixed E.164/+1 phone normalization, OTP HTTP 400/cooldown/persistence/CSPRNG, configurable JWT kid with JWKS test, and offline release preflight; added regression tests and deployment docs | check final matching-SHA CI; coordinate exposed key rotation #2, Auth PR #1, MongoDB TTL and verified production hosting before deploying

- 2026-10-14 | ChatGPT | main | done (CI pending) | Enforced DB-backed verified JWT sessions; repaired session/user model, linked Upmind identity with exact brand and null-on-outage totals; deferred OTP provider initialization; added tests and 5 handoff docs; improved CI concurrency | check latest main CI; production workspace/host, key rotation #2, auth PR #1 and MongoDB TTL migration remain blocked

- 2026-10-14 | ChatGPT | main | done | Fixed refresh hashing/rotation, logout session binding, secure API key checks, exact Upmind matching, DB lifecycle, CORS/health, tests/CI and runbooks | deploy after Render workspace confirmation; rotate leaked signing key (#2), migrate TTL index, review auth retirement PR #1
- 2026-10-08 | claude (owner setup) | default branch | done | Added the work log rule, this log and the stop reminder | every agent follows AGENTS.md › Work log rule
