# Task queue — TAKATAK backend
_Last review: 2026-10-14. Newest authoritative progress is in WORKLOG.md._

| ID | Priority | Status | Work | Definition of done |
| --- | --- | --- | --- | --- |
| TK-BE-001 | P0 | blocked: external coordination | Rotate compromised RSA signing key (issue #2) | New secret not in Git; all verifiers migrated; old key rejected; verified token/logout/JWKS behavior |
| TK-BE-002 | P0 | blocked: production selection | Identify the actual production hosting service, settings and URL; verify deployed SHA | Service+branch verified, runtime config inspected without exposing secrets, deployment/health logs clean |
| TK-BE-003 | P0 | review pending | Retire MongoDB auth endpoints (PR #1) after canonical TAKATAK Auth migration | Consumers migrated; owner confirms cutover; CI and production auth smoke checks pass |
| TK-BE-004 | P1 | blocked: database access | Inspect and migrate legacy sessions TTL index | `expiresAt_1` TTL present; obsolete 7-day `createdAt_1` TTL removed on correct DB after backup |
| TK-BE-005 | P1 | completed for legacy scope | Harden DB-backed JWT session and dashboard; test key ID against JWKS | Prior CI green; real multi-tenant integration and production migration tracked separately |
| TK-BE-006 | P1 | pending | Verify Upmind client association belongs to correct brand/tenant | Real API contract confirmed; only exact authorized client records linked, no duplicates or cross-brand leaks |
| TK-BE-007 | P1 | partially completed | E.164/+1 correction, crypto-random OTP and 30-second login cooldown coded; legacy reversible password storage and historic +234 data need coordinated migration | No duplicate identities or unsafe OTP paths; verified customer migration and canonical Auth cutover |
| TK-BE-008 | P1 | pending | Durable production auto-deploy pipeline | Environment/secret model and actual provider identified; deploy gate and rollback documented and verified |
| TK-BE-009 | P2 | pending | Integration tests against isolated MongoDB and mocked upstream APIs | Success/expiry/revocation/reuse and tenancy/Upmind/OTP paths verified |
| TK-BE-010 | P2 | pending | Fully tenant/product-scoped platform integration | Canonical TAKATAK Auth, entitlements, merchant segmentation and audit behavior proven via integration contract |
| TK-BE-011 | P1 | completed | Introduce secure refresh rotation, CORS/health, CI and legacy notes | Commits and previous successful GitHub Actions runs on main |
| TK-BE-012 | P1 | completed | Establish five-document handoff process | `PROJECT_STATUS`, `TASK_QUEUE`, `AGENT_HANDOFF`, `DEPLOYMENT`, `DECISIONS` committed in docs |

## Work rules
Choose the highest-priority task that can be completed safely with current access. Document blocked work, continue unrelated tasks, preserve active PRs. Do not deploy or rotate credentials into an unconfirmed environment. Production criteria: functionality, access checks, CI, deployed SHA and runtime health; no fabricated "100%" claim.
