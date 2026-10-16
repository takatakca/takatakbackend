# Backend deployment — controlled release guide
_Status: NOT verified as deployed; do not equate GitHub push/CI with production._

## Discover real destination first
Possible platforms across GROUPE TAKATAK include MochaHost and Render. This repository alone does **not** prove which service currently runs the legacy backend. Prior inspection found one Render workspace named **My Workspace** (workspace ID withheld in documentation), but accessing its services requires explicit workspace selection in the connected Render tool. Do not select it by assumption.

Once the correct hosting account/workspace is confirmed:
1. Identify service, linked repository, deployed branch, custom domain and auto-deploy setting.
2. Record non-sensitive service ID, external URL and branch in this document.
3. Validate required secret **presence**: `MONGO_URI`, `PRIVATE_KEY_PATH`, `PUBLIC_KEY_PATH`, `ISSUER`, `JWT_KEY_ID`, `CORS_ORIGINS`, `UPMIND_KEY`, Twilio and SendGrid only where still used. Match the JWT header `kid` to active JWKS. Do not dump values.
4. Confirm effective Node runtime >=20 and install command `npm ci`; production startup `npm start`.
5. Confirm storage of signing key outside Git. Coordinate security issue #2 before normal release.
6. Inspect MongoDB indexes and migrate obsolete 7-day TTL index with an approved backup.
7. Ensure `Backend CI` passes for exact release SHA, then deploy via the confirmed service's configured mechanism (avoid duplicate manual deploy if auto-deploy enabled).
8. Verify actual runtime release SHA via provider deployment record. Inspect logs and confirm HTTP /health/live (200) and /health/ready (200).
9. Smoke test authentication migration, failed JWT rejection, refresh/logout, own-account dashboard; never expose test credentials or customer data.
10. Record deployed commit, timestamp, URL, checks, exceptions and rollback target here and in `AGENT_HANDOFF.md`.

## Verify the exact deployed commit

The backend exposes `GET /health/version` with JSON `{ "revision": "<40-hex-SHA>" }` when a runtime-provided SHA is available. Valid environment sources are `RELEASE_SHA` (preferred explicit deploy value), `RENDER_GIT_COMMIT`, and `GIT_COMMIT_SHA`. If none contains a valid commit, the endpoint returns `{ "revision": null }`: **unknown is not a successful deployment**. When configuring release automation for a confirmed host, inject the exact GitHub commit into `RELEASE_SHA`; compare endpoint output with provider release record, the intended branch, and the GitHub Actions run. Keep this endpoint uncredentialed but strictly metadata-only, with `Cache-Control: no-store`.

Neither this route nor `/health/live` verifies Upmind, MongoDB permissions, token rotation, or that clients were migrated. Continue readiness and authenticated smoke checks separately.

## Upmind provisioning concurrency safety

Remote Upmind customer creation is now serialized per legacy MongoDB user through a `upmindProvisionLock` (opaque UUID) and `upmindProvisionLockExpiresAt` (two minutes). Only one worker may obtain a live lock while `upmindClientId` is null. Only that lock holder may persist the returned Upmind client ID before expiry, and the lock is released afterward. Interrupted reservations expire without an external scheduler. No new global TAKATAK identity authority is introduced.

After the actual Upmind sandbox/tenant and MongoDB environment are verified, test two simultaneous logins/provisioning attempts for the **same controlled test account** across separate backend workers; confirm at most one Upmind remote create POST and one associated account ID. Confirm retry behavior after a simulated worker crash/expired lock. Check that Upmind itself enforces uniqueness or idempotency for email/brand to prevent duplicates created sequentially by other systems. Never use real customer credentials or delete a production lock manually without reviewing the target record and operational effects.

## Recovery from an uncertain Upmind provisioning attempt

Upmind lookup now runs **inside** the per-user MongoDB lease. Before issuing a create POST, the service atomically persists `upmindProvisionAttemptedAt` so a process crash or HTTP timeout cannot authorize another create when the next search appears empty. The marker persists past lock expiry. Each subsequent attempt may search under a fresh lease and securely attach a unique exact email+brand+valid-ID match, which clears the marker; otherwise the account remains `upmindRetryNeeded` for manual review. Avoid clearing `upmindProvisionAttemptedAt` automatically after a timeout or merely because a search returned no records.

With an authorized test tenant, simulate a provider timeout after accepting a create request; verify that subsequent login does **not** send another POST despite a temporarily empty search, and that the exact existing customer can be linked after it appears. Confirm that only the account's own MongoDB record is updated. Manual reconciliation requires checking the actual Upmind remote customer and duplicates before any operator clears the marker or retries provisioning.

## Upmind billing completeness and dashboard smoke checks

The backend requests complete paginated orders, invoices and tickets via `limit`/`offset` from the currently authenticated user's validated `upmindClientId`. The response must provide array `data` and a stable integer `total`; ambiguous or incomplete data is treated as unavailable rather than as a confirmed zero. Pagination is bounded at 1,000 records per collection; larger collections require a reviewed provider contract and a follow-up scalability change, never partial figures presented as complete.

For the verified production host, test a linked authorized owner account with more than one page of invoices/orders/tickets and confirm correct totals, owner isolation, and unpaid/open statuses. Test an unlinked account: the dashboard should have `integrationStatus: "not_linked"` and `null` summary counts. Test upstream failure: `integrationStatus: "unavailable"` and `null` summary counts. Do not claim Upmind is operational solely because an isolated mock test passed.

## Read-only MongoDB session-index audit

With authorized production database access, run `npm run audit:sessions` to inspect the current `sessions` collection TTL indexes without changing any data or indexes. Exit 0 indicates the required `expiresAt` TTL is present and the obsolete `createdAt` TTL is absent; exit 2 signals an index migration is required; exit 1 indicates missing access or audit failure. Before any manual index change, verify the correct database, backup, running clients and procedure in `docs/SECURITY-AND-RELEASE.md`.

### JWT key rotation consistency

The JWKS endpoint now rereads the configured `PUBLIC_KEY_PATH` on each request and sends `Cache-Control: public, max-age=60`. After a controlled rotation, verify `GET /auth/well-known/jwks.json` publishes the new `kid` and public RSA modulus, and newly issued JWTs use the corresponding private key. Plan consumer cache overlap and token invalidation; publishing a new JWKS does not on its own revoke the compromised old signing key. Do not assume all consumers refresh their verification keys immediately.

## CI tracked-secret prevention

The `Backend CI` workflow executes `node scripts/check-tracked-secrets.js` before `npm ci`. New tracked `.env` files, private-key PEM headers, key containers and recognizable live tokens fail the build; detected values are not printed. The historically exposed `keys/private.pem` is recognized only at its exact old blob SHA and triggers a warning tied to issue #2, **not a successful rotation**. A new key must be installed through external host secrets, never by replacing that repository file. Review GitHub secret scanning and run the coordinated rotation checklist before any production release.

## Mandatory offline release preflight

Before initiating a deployment on a **verified** production service, run `NODE_ENV=production npm run check:release` in its real configured environment. The check verifies required variable presence, key-pair matching and non-use of the publicly exposed bundled signing key. It does not display credentials or contact remote services. A green result does **not** validate MongoDB availability, tenant authorizations or deployment. Do not fake values to make it pass; fix production secret configuration first. The legacy RSA key remains exposed until coordinated replacement (issue #2).

## Minimal commands (run in verified environment only)
```bash
npm ci
npm test
npm start
```

`/health/live` only indicates a process is running. `/health/ready` indicates MongoDB connectivity, **not** that upstream Twilio, Upmind, SendGrid or Auth migration are operational.

## Rollback
Find last known healthy *deployed* SHA in provider history and revert/redeploy using the deployment platform's supported safe procedure; do not force-push GitHub main. Verify MongoDB schema and TTL rollback compatibility, JWT verifier/key overlap and consumer migration before reverting authentication. Keep secrets outside Git.

## Upmind search-response verification before enabling auto-provisioning

The Upmind client listing is paginated. The backend sends `limit`/`offset`, requires array `data` and an integer `total`, and follows all pages (bounded at 100 returned candidates); incomplete results are flagged for manual review rather than treated as an empty customer search. Before shipping to a real tenant, inspect a controlled provider response without personal data in logs and confirm `status`, `data`, `total`, `id`, `brand_id`, and page consistency. If the provider changes its contract or returns more than 100 matching candidates, review the association flow rather than bypassing the guard. Do not provision or re-link real customers solely from a first-page search.

## Private Upmind client exchange verification

The authenticated `GET /user/upmindClientId` endpoint issues a legacy five-minute HS256 JWT associated with the current user. It sends `Cache-Control: private, no-store`; only linked users receive a token, and missing or weak (under 32 characters) `UPMIND_SECRET` returns 503. Before enabling this feature in an authorized production host, check that `UPMIND_SECRET` is configured with a high-entropy secret of sufficient length (inspect presence/strength, **not its actual value**), that the consuming integration accepts this legacy token format, and that no shared cache stores responses.

## Legacy Upmind smoke test after release

With a controlled test identity already associated with Upmind, exercise both email and phone legacy OTP login (if still enabled), then confirm no additional Upmind customer was provisioned and the dashboard remains scoped to that owner's customer ID. The `upmindClientId` field is not returned by default Mongo queries: both verification flows explicitly load it before `ensureUpmindClient`. Check existing reversible temporary passwords are cleared from linked accounts without logging their contents. Do not use real customer credentials or mutate production records during the smoke test.

## Environment-specific blockers
- No validated production service mapping.
- Key rotation coordinated across JWT verifiers is still outstanding.
- No live database migration or customer identity cutover approved.
- GitHub Actions workflow currently covers CI only; no verified remote deployment workflow exists.

See `SECURITY-AND-RELEASE.md` and GitHub issue #2.
