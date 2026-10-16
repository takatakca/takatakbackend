# TAKATAK backend — security and release runbook

## High-priority exposure: checked-in RSA signing key

The public repository contains `keys/private.pem` in tracked history. Assume the private key is compromised. The corresponding public key in `keys/public.pem` and the `takatak-key` JWKS identifier must not be treated as secure proof of token origin until rotation is completed.

**Coordinated action (requires deployment owner and connected consumers):**

1. Inventory services that sign or verify RS256 tokens and all currently accepted `iss`, `kid` and JWKS URLs.
2. Generate a **new** RSA signing key outside the repository and store it as a secret on the intended runtime; publish only its matching public key/JWKS. Set `PRIVATE_KEY_PATH`, `PUBLIC_KEY_PATH` and a new `JWT_KEY_ID` consistently; verify resulting JWT `kid` equals the JWKS `kid`.
3. Support a controlled verification overlap only if absolutely necessary, with clear expiry; migrate clients and stop signing with the exposed key.
4. Rotate/cancel old sessions or force reauthentication according to a planned migration; replace any other credentials that may have leaked. Remove the private key from the current tree *after* the external secret is deployed, then handle repository history exposure with GitHub support/approved rewrite procedures.
5. Audit authentication logs and verification consumers. Record the completed rotation in WORKLOG.md.

**Do not delete or replace the existing key in a live legacy service without coordinated cutover**: that would break signing and token validation, and does not undo earlier exposure. The repository does not store the replacement secret.

## Tracked-secret prevention guard

GitHub Actions runs `node scripts/check-tracked-secrets.js` before installing dependencies. The script scans Git-tracked files for accidental credential artifacts and rejects changed/new private keys, confidential environment files and recognizable access tokens without logging their actual contents. The previously committed `keys/private.pem` remains in the repository history and is **still compromised**; it is temporarily recognized by one pinned Git blob SHA solely to avoid disguising it as a new secret or silently replacing it. This warning is not an exemption for rotation, and the old key must be retired through issue #2. Enable or review GitHub repository secret scanning as a complementary control, where available.

## Legacy OTP atomic issuance and provider failure handling

Both SMS and email legacy OTP endpoints reserve a shared 30-second cooldown with an atomic MongoDB predicate, preventing simultaneous login and resend from bypassing throttling. Email codes are generated via CSPRNG, hashed with bcrypt and persisted with expiry and zero attempts before SendGrid is invoked. Registration persists the account and code first. A provider error does not roll back the cooldown, so repeated immediate attempts are rejected; retry after 30 seconds. Registration returns HTTP 503 if delivery fails after the account has been saved; clients must use resend rather than register again. Legacy flow should eventually be retired through the owner-approved central TAKATAK Auth migration (PR #1).

## MongoDB TTL migration

The original Session model created a TTL index on `createdAt` expiring after 7 days, even though refresh session TTL defaults to 30 days. The new model sets the TTL on `expiresAt` (the actual session expiry). Mongoose will not automatically delete the old MongoDB index.

First, on a securely configured, authorized runtime, run the **read-only** `npm run audit:sessions` (requires `MONGO_URI`). Its exit code signals healthy/needs migration/error without making DB changes.

On the **correct database** after reviewing backups and the deployment:

```javascript
db.sessions.getIndexes()
```

Confirm that the new `expiresAt_1` TTL index exists with `expireAfterSeconds: 0`. If MongoDB has not created it and you have change permission, create it explicitly:

```javascript
db.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
```

After confirming the database and that the legacy `createdAt_1` index is the obsolete TTL index, remove **only that index**:

```javascript
db.sessions.dropIndex("createdAt_1")
```

Do not apply these commands blindly to other databases. Session refresh checks expiry in application code even before TTL cleanup.

## Deployment prerequisites

- Verify production identity authority and transition plan for PR #1 (retiring register/login/OTP). Do not merge it just to fix a CI conflict without confirming migration.
- Ensure `MONGO_URI`, `PRIVATE_KEY_PATH`, `PUBLIC_KEY_PATH` (if external), `ISSUER`, and required Upmind/Twilio/SendGrid settings are configured in the selected hosting environment.
- Configure `CORS_ORIGINS` to the exact trusted TAKATAK frontend origins. Never use wildcard origins together with credentials.
- Confirm /health/live returns 200 and /health/ready returns 200 with the **intended** database, and repeat after redeployment.
- Inspect the latest GitHub Actions `Backend CI` result and deployment runtime logs. CI passing alone does not establish production health.
- Confirm no routes allow a merchant to read another merchant's customer records. Legacy authenticated routes are not a multi-tenant authorization design.
- Enable GitHub-to-production deployment only after identifying the correct service/workspace and confirming runtime settings. The CI workflow does not trigger an external deploy.

## Legacy Upmind credentials and hidden model fields

Legacy `upmindClientId` and `encryptedPassword` are both `select:false` fields. Phone OTP verification must request both fields; successful email OTP consumption must request both as well. Otherwise `ensureUpmindClient` can fail to recognize an already linked user and attempt duplicate customer provisioning.

When an Upmind association is already established, `ensureUpmindClient` now clears any loaded temporary encrypted password before returning; exact search matches clear it as well. Existing stored AES-GCM records preserve the original `iv:tag:ciphertext` representation, while missing/invalid `PASSWORD_ENCRYPT_SECRET` produces a controlled error at use. **Not yet complete:** unlinked customers may retain reversible temporary passwords for legacy Upmind account creation. Elimination of that workflow requires an approved identity/payment integration migration and verified provider contract. Do not bulk-rewrite or delete customer passwords without a migration plan.

## Upmind paginated lookup safety

Official Upmind SDK guidance describes `limit`/`offset` pagination for list calls. The legacy integration now refuses to interpret an invalid, uncounted or partial list response as proof that an email has no existing client. It requires `data` and consistent numeric `total`, paginates up to 100 candidates, accepts only one exact email+brand+valid-ID match, and flags uncertain responses for review. Provider-specific live validation is still necessary, especially if `total` is global rather than search-filtered, or if many records are returned. An empty **complete** search is not a guarantee against simultaneous provision attempts by other processes.

Source: https://github.com/upmind/sdk-php#pagination

## Concurrency guard for Upmind client provisioning

Before any remote client-create POST, the legacy backend atomically claims a two-minute per-user MongoDB lease. A second local worker denied the lease does not provision. Persisting the new client ID requires the current unexpired lease token and an account still unlinked; the lease releases after the attempt, or expires after failure. The lock token and temporary password must not appear in logs or client responses. This is **not** a global guarantee against externally provisioned duplicate Upmind customers; verify the real provider's email+brand uniqueness/idempotency, search consistency and authenticated customer contract before activation.

## Upmind uncertain-create reconciliation

Remote Upmind creation is inherently non-transactional with MongoDB. The local lease now covers the entire client search and prevents acting on stale empty results. Immediately before sending a create POST, a lease-guarded `upmindProvisionAttemptedAt` is set in MongoDB. If the process crashes, the POST times out, or persistence fails, the marker remains. Do not automatically send a second POST for that account even after the lease expires; only an exact unique email+brand client found on a fresh search can be linked automatically. Otherwise an authorized operator must investigate Upmind records, verify the correct customer and brand, and explicitly resolve or reset the marker after establishing the remote outcome. This gate does not protect against other systems using independent accounts or old writes predating deployment.

## Upmind client exchange privacy

The authenticated `GET /user/upmindClientId` route issues a short-lived client association token only when the request's verified JWT session has a linked Upmind record. Its response is `private, no-store`; missing or weak `UPMIND_SECRET` is treated as unavailable instead of signing with an invalid key. The shared secret should be at least 32 high-entropy characters and never appear in Git or logs. Token semantics remain part of the legacy Upmind integration and require confirmation against the actual consumer.

## Known legacy debt

- Existing register/login/OTP routes remain until PR #1 is intentionally merged.
- The current public RSA signing key and signing secret require a coordinated change.
- The shared cross-product identity, tenant entitlements and canonical TAKATAK customer resolution are **not implemented by the legacy MongoDB service**; they belong to platform services.
- Upmind now requires a single exact email **and configured brand ID** match before auto-linking a customer; cross-product tenancy and live Upmind response schema still need provider-backed verification. API failures must not be treated as confirmed zero orders.
- The legacy phone normalizer now uses E.164 and Canadian/US `+1` for ten-digit inputs. Historic MongoDB records may still carry incorrectly prefixed `+234`; migrate only after verifying true owners, never via blanket updates.
