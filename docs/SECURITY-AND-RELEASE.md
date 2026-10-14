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

## Known legacy debt

- Existing register/login/OTP routes remain until PR #1 is intentionally merged.
- The current public RSA signing key and signing secret require a coordinated change.
- The shared cross-product identity, tenant entitlements and canonical TAKATAK customer resolution are **not implemented by the legacy MongoDB service**; they belong to platform services.
- Upmind now requires a single exact email **and configured brand ID** match before auto-linking a customer; cross-product tenancy and live Upmind response schema still need provider-backed verification. API failures must not be treated as confirmed zero orders.
- The legacy phone normalizer now uses E.164 and Canadian/US `+1` for ten-digit inputs. Historic MongoDB records may still carry incorrectly prefixed `+234`; migrate only after verifying true owners, never via blanket updates.
