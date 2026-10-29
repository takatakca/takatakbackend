# Architecture and release decisions — TAKATAK backend
_Last updated: 2026-10-29._

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
| D-016 | Audit production session TTL indexes in read-only mode before any manual migration. | `npm run audit:sessions` reports missing `expiresAt` TTL or obsolete `createdAt` TTL; changing indexes requires correct DB, backup and access authorization. |

| D-017 | Verify refresh secret and sign the access JWT before the atomic database token rotation. | A guessed session ID must not reveal user state, and misconfigured keys must not invalidate otherwise valid refresh tokens. |
| D-018 | Cap legacy email OTP checks at five attempts using atomic MongoDB updates; consume successful code once. | Prevent brute force/concurrent code reuse pending replacement by canonical TAKATAK Auth. |
| D-019 | Report deployment revision only from validated 40-hex runtime SHA metadata. | `/health/version` must return null rather than falsely claiming a release; compare against provider deployment record. |

| D-020 | Load the current JWT public key for each JWKS request and cap its HTTP cache to 60 seconds. | Avoid indefinitely publishing a stale key after authorized secret rotation while allowing downstream verifiers a bounded cache. |
| D-021 | Expired legacy email OTP cleanup must match the old code hash and expiry in an atomic update. | A stale expired-code request must never overwrite a newly issued verification code. |

| D-022 | Legacy phone OTP must load select:false Upmind client ID before attempting account association. | Prevent duplicate customer provisioning when a previously linked account signs in by phone. |
| D-023 | Clear temporary reversible Upmind password once account association is established; validate AES-GCM secret and serialized format on use. | Minimize unnecessary retained credentials without breaking existing ciphertext records; eliminate remaining reversible password storage through central Auth migration. |

| D-024 | Do not provision Upmind customers from an incomplete paginated search. | Follow all bounded `limit`/`offset` pages, require consistent integer `total`, and mark uncertain results for review; avoid duplicate or wrong-tenant links. |
| D-025 | Require valid provider client IDs on both existing and newly created Upmind associations. | Never persist null, malformed or arbitrary-object identifiers as a customer's billing account. |

| D-026 | Test the actual Upmind association service with isolated mocked HTTP responses, not just pure matching helpers. | Prove missing/partial results cannot trigger a POST, valid later-page links are reused, and complete empty results allow one controlled provisioning attempt. |
| D-027 | Protect the authenticated legacy Upmind client-token exchange from caching and weak/missing signing configuration. | Issue no-store five-minute owner-bound tokens, return controlled errors for unlinked users or insufficient server secret, and verify consuming integration before production cutover. |

| D-028 | Run targeted tracked-secret detection before dependency installation in CI. | Reject new private PEM, tracked environment files, key containers and recognizable tokens; do not mistake a passing guard for credential rotation. |
| D-029 | Pin the already-exposed `keys/private.pem` to its immutable original Git blob while live consumers migrate. | Avoid accidentally accepting a new leaked signing key or breaking a currently unidentified deployment; actual old key remains compromised until coordinated rotation and repo cleanup. |

| D-030 | Paginate owner-scoped Upmind billing lists and reject incomplete/malformed `data` or `total` before calculating counts. | A first page or an incomplete HTTP 200 response must not masquerade as a fully verified list of orders, invoices or tickets; defer counts on provider errors. |
| D-031 | Return unknown (`null`) dashboard billing metrics for unlinked Upmind accounts as well as unavailable integrations. | Missing linkage is not proof that a customer owes zero invoices or has zero orders; only completed Upmind responses support numeric totals. |

| D-032 | Use a two-minute per-user MongoDB compare-and-set lease before legacy Upmind client creation; persist the returned ID only for the still-active lease owner. | Prevent simultaneous backend workers creating duplicate remote customers and overwriting linkage; interrupted locks expire, but provider uniqueness/idempotency and cross-system races still need verification. |

| D-033 | Obtain the MongoDB provisioning lease before the entire Upmind client search rather than only before the create POST. | A second worker must not use an older empty search after the winning worker linked or created a client. |
| D-034 | Persist a lease-scoped `upmindProvisionAttemptedAt` marker *before* external creation and do not automatically retry an uncertain remote write. | Provider timeouts or process crashes can leave a created-but-unlinked Upmind client. Retry may search and reconcile exact identity, but must not send a second potentially duplicate POST without manual/provider evidence. |
| D-035 | Guard Upmind retry-state writes with the active lease rather than saving a stale Mongoose user document. | Never overwrite linkage assigned by another worker during a race or after expiry. |

| D-036 | Share an atomic MongoDB `lastOtpRequestedAt` compare-and-set reservation between legacy login and resend across phone/email channels. | Separate read/check/user.save operations let concurrent calls send multiple OTPs; a single DB operation limits one request per 30 seconds per account. |
| D-037 | Persist the email OTP hash, expiry and attempt reset before handing the code to SendGrid; persist registration before mailing its first code. | A delivery must not precede a durable verifiable code or account. Provider errors keep the 30-second cooldown; a saved but undelivered registration must recover through resend, not duplicate registration. |

| D-038 | Resolve SMS OTP account lookup by requesting at most two exact normalized phone matches and reject multiple matches (HTTP 409). | Twilio proves control of a phone, not ownership of any particular account when a phone is shared; arbitrary `findOne` can grant the wrong legacy identity. |
| D-039 | Add a read-only aggregate collision/index audit before enforcing a unique phone index in legacy MongoDB. | Existing phone records might have duplicates or erroneous historic country codes; a premature index creation could fail or disrupt production, so require ownership review, backup and approved migration first. |

| D-040 | Canonicalize historical phone values within the MongoDB read-only aggregate before counting duplicates; reject readiness on any invalid/missing phone. | Raw-string uniqueness can mask the same user's 10-digit and E.164 forms. The aggregation must not export PII; MongoDB 4.4+ compatibility and real data audit remain external gates. |

## Open decisions requiring live evidence
- Which backend host/service/environment should deploy `main`?
- Which authenticated product consumes each legacy route, and when can login be retired?
- Which JWT consumers verify the exposed key, and which migration downtime window is acceptable?
- Which official TAKATAK Auth API and tenant/entitlement contracts should this service trust?
