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
