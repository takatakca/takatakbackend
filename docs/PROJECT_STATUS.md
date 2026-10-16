# Project status — TAKATAK legacy backend
_Last verified: 2026-10-14 (GitHub repository state; not a production release)_

## Repository and authority
- Repository: https://github.com/takatakca/takatakbackend
- Default publication branch: `main`; direct commits authorized in the project instructions.
- Stack: Node.js 20+, Express 5, MongoDB/Mongoose, JWT RS256, Upmind, legacy Twilio/SendGrid OTP.
- Architecture boundary: this is a **legacy service**, not the TAKATAK master identity/customer authority. Keep company-level and product entitlements separate; never use this code to create a second shared CRM.
- Agent cooperation: `AGENTS.md`, `WORKLOG.md`, and active PRs remain authoritative. Do not duplicate PR #1.

## Implemented on main
- Short-lived access JWT, server-stored session ID and opaque refresh token (SHA-256, with bcrypt legacy verification compatibility).
- Atomic refresh rotation with explicit cookie/body credentials; refresh does not require a non-expired access JWT.
- JWT-protected routes additionally verify an unexpired, unrevoked, subject-matching MongoDB session **and** verified user; role/email come from DB, not bearer claims.
- Logout deletes only the active session belonging to the authenticated user.
- Cookie settings, configurable JWT public key for JWKS, startup DB readiness, exact-origin CORS, health endpoints and safe API-key middleware.
- Upmind dashboard reads its owner-linked client ID (schema field is select:false) and uses a private no-store response.
- Upmind auto-link no longer blindly accepts fuzzy first search result; mismatches are flagged for follow-up.
- Legacy OTP uses cryptographically secure six-digit codes and a database-timestamp-based 30-second login cooldown; phone normalization uses Canadian/US `+1` for 10-digit numbers and preserves explicit E.164 numbers. Historic incorrect `+234` records require verified migration.
- JWT `kid` is configurable through `JWT_KEY_ID` and matches the published JWKS identifier. The exposed signing key **has not been rotated**.
- `npm run check:release` performs an offline, secret-safe production configuration preflight. It cannot confirm live deployment and intentionally rejects the known exposed signing key.
- CI workflow `.github/workflows/backend-ci.yml` executes `npm ci`, `npm test`, and syntax checks.

## Latest hardening and CI evidence (2026-10-14)
- Refresh now validates the secret before looking up its user and signs a new access JWT **before** atomic refresh rotation, so a bad private key does not consume valid refresh credentials. Replay and race conditions are covered by `test/refreshController.test.js`.
- Legacy email OTP verification uses a MongoDB-atomic per-code attempt counter (maximum five) and consumes the hash through an atomic comparison, preventing concurrent successful reuse. Resending an OTP resets the counter; final retirement remains PR #1.
- The public `GET /health/version` endpoint returns a 40-character runtime commit SHA from `RELEASE_SHA`, `RENDER_GIT_COMMIT` or `GIT_COMMIT_SHA`, otherwise `null`. It does not prove a deployment by itself: compare its output against provider deployment records.
- Successful GitHub Actions `Backend CI` run `38626245863` validated commit `3051abed7bbbf10092cdb20cc3b33f81775030ea`, including the refresh and OTP attempt tests. Later documentation/CI changes need a matching-SHA run.

- JWKS now reads the currently configured public key per request instead of caching its PEM at module import; regression test checks a changed key is visible. A coordinated rotation is still mandatory before production acceptance.
- Expired email OTP cleanup now uses an update conditional on the **old hash and expiry**, so stale verification requests cannot erase a newer concurrent code.

## Latest legacy account-linkage and credential hardening (2026-10-14)
- Phone OTP verification explicitly selects `+upmindClientId` together with `+encryptedPassword`. Previously, the hidden stored Upmind association could be mistaken for an unlinked customer, risking duplicate provisioning.
- Successful email OTP verification already selects `+upmindClientId` through atomic consumption; both phone and email paths now preserve the existing owner association.
- When an Upmind client is already linked or matched by exact brand and email, the legacy temporary reversible `encryptedPassword` is cleared from the account record. AES-GCM ciphertext format remains compatible; the encryption secret is validated lazily as exact 32-byte hex and malformed ciphertext is rejected.
- Tests `test/legacyCredential.test.js` cover correct query projection, email OTP selection, reversible encryption format and cleanup of stale credentials. This does **not** eliminate temporary password storage for customers pending initial Upmind provisioning; the canonical TAKATAK Auth cutover remains necessary.

## Upmind paginated search correctness (2026-10-15)
- Customer search now requests successive Upmind `limit`/`offset` pages and requires a consistent, explicit `total` before automatic exact-email/brand linking or creation. A missing count, malformed payload, changed page total, truncated page, or search exceeding 100 results is treated as **inconclusive** and marked for review instead of silently assuming zero customers.
- Exact-email/brand matching rejects null, invalid, or malformed Upmind customer IDs. Newly created accounts must also return a valid client ID before association is saved.
- `test/upmind.test.js` adds pagination, malformed/empty distinction, ambiguous response, and invalid ID regressions. Tests mock provider responses; the live Upmind tenant/API contract and concurrent cross-worker provisioning still require provider-backed verification.

## Full mocked Upmind service flow and token exchange (2026-10-15)
- `test/upmindServiceFlow.test.js` exercises the actual `ensureUpmindClient` service with an injected mock HTTP client: malformed list searches never create customers; exact brand/email matches found on later pages link safely; wrong-brand results never auto-provision; complete zero-result searches can provision a new customer once with a valid returned ID. No production API requests or real customer credentials were used.
- `GET /user/upmindClientId` is authenticated and now returns `Cache-Control: private, no-store` for token responses, rejects missing/unconfigured or too-short `UPMIND_SECRET` with 503, and binds the short-lived (5-minute) token to the request's authenticated user. `test/upmindSession.test.js` verifies private cache policy, owner, expiry and negative paths.
- The 32-character minimum for the existing Upmind exchange secret is a new deployment prerequisite; verify secret presence and adequate length in the real host without copying its value to Git or logs.

## Tracked-secret CI prevention gate (2026-10-15)
- New `scripts/check-tracked-secrets.js` uses the Git index to check tracked files before `npm ci` in GitHub Actions. It blocks tracked `.env` credentials, private-key PEM headers, `.p12/.pfx` key containers and recognizable live token strings, without printing token material. `test/trackedSecrets.test.js` verifies these boundaries.
- The **already exposed** `keys/private.pem` is temporarily pinned to its existing Git blob SHA and produces a warning, not a false claim of remediation. Any replacement at that path is rejected. Rotation of the old key remains the critical coordinated issue #2; do not commit replacement private material.
- The check is a targeted prevention layer, not a complete replacement for GitHub secret scanning or a substitute for rotating all previously exposed credentials.

## Upmind billing completeness and dashboard truthfulness (2026-10-15)
- Upmind orders, invoices and tickets now fetch all bounded pages via `limit`/`offset` and require consistent `data` and `total`. Missing/malformed or truncated billing responses do **not** become empty arrays silently; collection requests throw and the authenticated dashboard marks the integration unavailable, with unknown (`null`) counts.
- The user dashboard now reports `null`, not zero, for all billing summary counts when Upmind is **not linked**, as well as when unavailable. Numeric counts are returned only from fully validated upstream collections.
- New isolated mocked-HTTP tests: `test/upmindCollections.test.js` covers invoices on a second page, malformed data, a missing page, empty verified totals, client-ID rejection and bounded result sets. `test/userDashboard.test.js` checks linked-owner totals, unlinked accounts and integration errors without using production customer records.
- These are code/CI checks only. Real Upmind collection schema, large accounts and production tenant scoping still need authorized provider evidence before deployment.

## Concurrent Upmind provisioning protection (2026-10-15)
- Upmind customer creation now requires a per-user, atomic MongoDB provisioning lease before its remote POST. Each lease stores an opaque UUID and a two-minute expiry; competing backend workers are denied the create path, and only the current non-expired lease holder may commit the returned Upmind ID with a guarded update. The lease is released on completion or expires after interruption.
- `test/upmindProvisionLease.test.js` verifies atomic filters, expiry, ownership and guarded persistence. `test/upmindServiceFlow.test.js` verifies a losing worker cannot trigger a second remote POST. CI also syntax-checks `utils/upmindProvisionLease.js`.
- **Limit:** this prevents simultaneous creations for the same MongoDB user within this backend, not independent external systems creating the same Upmind email/brand, nor eventual-consistency races between sequential attempts. Confirm provider-level uniqueness/idempotency using an authorized test tenant before production enrollment.

## Upmind stale-search and uncertain-create safety (2026-10-16)
- Corrected a cross-worker race: the MongoDB lease is now claimed **before** searching for existing Upmind clients. A second worker cannot act on a stale previously empty search after another worker has linked or provisioned the account.
- Added a persistent `upmindProvisionAttemptedAt` marker, set through a lease-scoped atomic compare-and-set **before** any remote client-creation POST. If the provider times out or the worker crashes, later requests may locate/link an exact client but **must not POST another creation** on an empty search; they remain pending manual reconciliation. Successful exact linking clears the marker.
- Retry-state updates use lease-guarded MongoDB updates instead of saving potentially stale user documents. Mocked tests cover concurrent/late workers, uncertain POST followed by retry, successful reconciliation, and owner-only persisted state. These are not live provider tests.
- **Remaining caveat:** existing legacy records previously created without this marker and independent systems creating Upmind customers still need provider-side uniqueness/idempotency checks. A manual support workflow must reconcile uncertain attempts before resetting this marker.

## Atomic legacy OTP issuance and delivery order (2026-10-16)
- `/auth/login` and `/auth/resend-code` now reserve their shared 30-second SMS/email cooldown through one MongoDB-atomic `updateOne` on `lastOtpRequestedAt`. Concurrent login/resend calls for the same user cannot both request a provider send. Phone flow reserves the timestamp without modifying any email OTP hash.
- For email login/resend, a fresh cryptographically generated six-digit OTP's bcrypt hash, five-minute expiry, attempts reset and the cooldown timestamp are persisted atomically **before** SendGrid delivery. An email delivery failure returns HTTP 503 and does not undo the cooldown; the user can retry after 30 seconds.
- Registration now validates/normalizes email and phone, persists the new record and email OTP hash before SendGrid delivery, handles DB duplicate-key errors as HTTP 409, and returns HTTP 503 with a recovery instruction when the saved account's delivery fails. This preserves the existing legacy Upmind password staging for now; its retirement remains PR #1.
- New `utils/legacyOtpIssuance.js` and `test/legacyOtpIssuance.test.js`, updated `test/legacyLogin.test.js` and CI syntax checks; no real SendGrid/Twilio or production MongoDB used.

## Not complete
- **Critical**: previously committed `keys/private.pem` in a public repository. Issue #2: https://github.com/takatakca/takatakbackend/issues/2. Rotation requires coordinated deployment/consumer migration.
- **Migration**: legacy auth endpoints continue to serve register/login/OTP until owner-approved PR #1: https://github.com/takatakca/takatakbackend/pull/1. Do not merge solely to achieve a "100%" mark.
- **Database**: production legacy `createdAt` TTL index may still delete sessions after 7 days. New read-only `npm run audit:sessions` identifies the required index changes; live production inspection/migration remains blocked until verified database access.
- **Production**: no confirmed service/workspace, environment secrets, running release SHA or health-check evidence recorded. CI is **not deployment**.
- **Architecture**: tenant-scoped identity claims, entitlements and canonical TAKATAK auth must be integrated with the designated platform, rather than added ad hoc to MongoDB.

## Verification
- GitHub Actions `Backend CI` succeeded for `main` SHA `6c357136744737a5d8d1a9a7ebcddcbe0f0bae80` (run `38623401862`). Later changes require a separate matching-SHA run.
- New code: workflow runs after the commits in this session must be checked individually. Do not call a queued or incomplete run successful.
- Testing currently mocks session authorization; no end-to-end production database, email, Twilio, Upmind or deployment verification has been performed.

See `TASK_QUEUE.md`, `AGENT_HANDOFF.md`, `DEPLOYMENT.md`, `DECISIONS.md` and `SECURITY-AND-RELEASE.md`.
