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

## Minimal commands (run in verified environment only)
```bash
npm ci
npm test
npm start
```

`/health/live` only indicates a process is running. `/health/ready` indicates MongoDB connectivity, **not** that upstream Twilio, Upmind, SendGrid or Auth migration are operational.

## Rollback
Find last known healthy *deployed* SHA in provider history and revert/redeploy using the deployment platform's supported safe procedure; do not force-push GitHub main. Verify MongoDB schema and TTL rollback compatibility, JWT verifier/key overlap and consumer migration before reverting authentication. Keep secrets outside Git.

## Environment-specific blockers
- No validated production service mapping.
- Key rotation coordinated across JWT verifiers is still outstanding.
- No live database migration or customer identity cutover approved.
- GitHub Actions workflow currently covers CI only; no verified remote deployment workflow exists.

See `SECURITY-AND-RELEASE.md` and GitHub issue #2.
