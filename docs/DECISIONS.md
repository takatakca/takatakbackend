# Architecture and release decisions — TAKATAK backend
_Last updated: 2026-10-14._

| ID | Decision | Why / consequence |
| --- | --- | --- |
| D-001 | Preserve existing `takatakbackend` Express + MongoDB code; no fresh rewrite. | Reuse functional legacy endpoints during migration. |
| D-002 | Canonical TAKATAK Auth remains sole cross-product identity owner. | This repository cannot invent a second master CRM or grant AHMV/other product entitlement automatically. |
| D-003 | Do not auto-merge PR #1 before identity migration is verified. | Retirement turns legacy login/register/OTP endpoints into HTTP 410, a potentially breaking production change. |
| D-004 | A JWT signature alone is not authorization while its old private key is public. | Require matching, unrevoked, unexpired MongoDB session and verified user; role comes from database. Still rotate key (#2). |
| D-005 | Access token expiry does not gate refresh. | Refresh requires valid session ID + opaque refresh token; rotate atomically; logout requires valid bearer access token. |
| D-006 | Use SHA-256 digests for new opaque refresh tokens, with bcrypt fallback for existing records. | Keep migration compatibility, prevent storing bearer refresh secrets in plaintext. |
| D-007 | Require exact browser origins and secret-based API-key comparison. | No wildcard credentialed CORS; Origin header can be spoofed and is not authentication. |
| D-008 | Maintain legacy Upmind membership only for the authenticated account. | Avoid cross-customer fuzzy record associations; future multi-tenant access needs explicit tenant permissions. |
| D-009 | CI is not deployment. | Do not claim live success without provider service/branch, release SHA, runtime logs and health checks. |
| D-010 | Move session TTL to explicit `expiresAt`, with deliberate index migration. | Existing 7-day index can expire 30-day sessions; schema update alone does not remove it. |
| D-011 | Follow `AGENTS.md` and five-file handoff on each session. | Enables resume without agent collisions or undocumented work. |
| D-012 | Normalize new legacy phone inputs in E.164; assume `+1` only for ten-digit NANP numbers. | Stop silently prefixing Canadian numbers with `+234`; historic records require validated migration. |
| D-013 | Configure consistent RS256 `JWT_KEY_ID` on issuer and JWKS. | Prepares rotation; does not replace external key provisioning. |
| D-014 | Use cryptographic OTPs and persisted 30-second legacy login cooldown. | Mitigates predictable-code and resend abuse until Auth cutover. |
| D-015 | Reject release configuration using known exposed signing keys or a mismatched RSA key pair. | Offline `npm run check:release` provides a fail-closed configuration gate; an actual provider deployment and online health still require verification. |

## Open decisions requiring live evidence
- Which backend host/service/environment should deploy `main`?
- Which authenticated product consumes each legacy route, and when can login be retired?
- Which JWT consumers verify the exposed key, and which migration downtime window is acceptable?
- Which official TAKATAK Auth API and tenant/entitlement contracts should this service trust?
