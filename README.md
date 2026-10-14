# TAKATAK legacy backend

This Express 5 / MongoDB service is an **existing legacy API**, not a new TAKATAK identity authority. The GROUPE TAKATAK ecosystem must use its canonical identity, tenant-scoped permissions and entitlements. Do not build a separate master customer directory in this service.

## Project continuation

Agents and maintainers should read [AGENTS.md](AGENTS.md) and [WORKLOG.md](WORKLOG.md) first, then the five maintained documents: [project status](docs/PROJECT_STATUS.md), [task queue](docs/TASK_QUEUE.md), [agent handoff](docs/AGENT_HANDOFF.md), [deployment](docs/DEPLOYMENT.md) and [architecture decisions](docs/DECISIONS.md). These documents track current GitHub SHA, blockers and the evidence needed for an actual release.

## Current API

- `POST /auth/register`, `/auth/login`, `/auth/verify-otp`, `/auth/resend-code`: legacy endpoints, awaiting retirement in [PR #1](https://github.com/takatakca/takatakbackend/pull/1). Their continued availability is not approval for new consumers.
- `POST /auth/refresh`: rotates a valid refresh token independently of an expired access token. Accepts HttpOnly `sid` and `refresh_token` cookies or the same JSON fields for API clients.
- `POST /auth/logout`: requires Bearer JWT; deletes only the verified token's session.
- `GET /auth/well-known/jwks.json`: exposes a public verification key (not a private signing key).
- Legacy phone inputs now normalize to E.164; ten-digit Canadian/US numbers default to `+1`. Existing wrongly prefixed records need audited migration.
- `GET /user/dashboard`: legacy authenticated user dashboard.
- `GET /health/live`: process liveness (200 without database check).
- `GET /health/ready`: readiness (200 with MongoDB connected; otherwise 503).

## Local setup

Use Node.js 20 or newer. Run `npm ci`, configure environment variables outside Git, then `npm run dev`. Run `npm test` for unit tests; CI runs these checks on pushes and pull requests.

For the **confirmed production runtime only**, run `npm run check:release` with `NODE_ENV=production`, external `PRIVATE_KEY_PATH` and `PUBLIC_KEY_PATH`, new `JWT_KEY_ID`, MongoDB URI and exact HTTPS `CORS_ORIGINS`. The offline check rejects the repository's exposed signing key, mismatched RSA pairs and unsafe origins. It neither deploys nor verifies connectivity to production services.

Required runtime configuration depends on the enabled legacy integrations. In particular:

| Name | Purpose |
| --- | --- |
| `PORT` | HTTP port (default 3000) |
| `NODE_ENV` | Set to `production` for secure refresh cookies |
| `MONGO_URI` | MongoDB connection string |
| `PRIVATE_KEY_PATH` | Absolute/relative **external** RSA private key path for RS256 signing |
| `PUBLIC_KEY_PATH` | Optional external verification public key path |
| `ISSUER` | JWT issuer (defaults to `https://takatak.ca`) |
| `JWT_KEY_ID` | Identifier attached to RS256 tokens and published in JWKS; coordinate with real key rotation |
| `ACCESS_TTL` | JWT TTL (defaults to 1 hour) |
| `REFRESH_TTL_DAYS` | Refresh session sliding TTL (defaults to 30 days) |
| `CORS_ORIGINS` | Comma-separated **exact** trusted browser origins |
| `SENDGRID_API_KEY`, `SENDER_EMAIL` | Legacy email OTP |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Legacy phone OTP |
| `UPMIND_KEY`, `UPMIND_BRAND_ID`, `UPMIND_SECRET` | Existing Upmind integration |
| `PASSWORD_ENCRYPT_SECRET` | Legacy password encryption key |

Do not commit environment files, live keys or deployment credentials. CORS does not replace JWT validation or tenant authorization.

## Deployment status and release requirements

GitHub Actions workflow `Backend CI` checks this repository; **it does not deploy production**. Verify the selected hosting service, deployment branch, environment, key mounting, MongoDB connectivity and the external TAKATAK Auth cutover before enabling production auto-deploy.

**Security blocker:** a private signing key has previously been committed under `keys/private.pem` in this public repository. Treat it as exposed; follow [the rotation runbook](docs/SECURITY-AND-RELEASE.md). Removing only the file from the current branch does not remove it from Git history. Do not rotate keys independently of downstream JWT verifiers.

**Database migration:** old sessions may still be deleted by a previous 7-day MongoDB TTL index on `createdAt`. Follow the index migration section in the runbook; new sessions use `expiresAt`.

For cross-product identity, one tenant must never receive another tenant's customer data simply because it shares the global TAKATAK identity.
