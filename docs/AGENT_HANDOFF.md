# Agent handoff — TAKATAK backend
_Updated: 2026-10-14. Read AGENTS.md and WORKLOG.md first. This is a live handoff log, not evidence of production deployment._

## Additional continuation — live JWKS reload and stale OTP cleanup (2026-10-14)

**Last completed task:** the legacy `GET /auth/well-known/jwks.json` now reads the configured public key file for each request, publishes a bounded 60-second cache, and returns a controlled 503 if unavailable. `test/keyRotation.test.js` verifies a replaced public key is reflected in the next JWKS response. Expired email OTP cleanup in `controller/Auth.js` now performs an atomic, conditional MongoDB update tied to the old OTP hash and expired timestamp; a stale request cannot erase an OTP issued concurrently. `test/emailOtpAttempts.test.js` includes a regression test.

**Latest pushed SHA before this self-updating handoff:** `667f8976dd57ad2a48e7c46d2887fdc2ea70db98` (WORKLOG). Query the GitHub `main` branch HEAD to get the SHA of this handoff commit and its exact CI run.

**Paths changed since previous handoff:** `controller/Auth.js`, `test/keyRotation.test.js`, `test/emailOtpAttempts.test.js`, `docs/PROJECT_STATUS.md`, `docs/DEPLOYMENT.md`, `docs/DECISIONS.md`, `WORKLOG.md`, `docs/AGENT_HANDOFF.md`.

**Checks:** GitHub Actions `Backend CI` run [38626727370](https://github.com/takatakca/takatakbackend/actions/runs/38626727370) was completed/success for SHA `62e698fcbea0688d64560a4fbd3fb7e6072ed35b`. Subsequent test/documentation commits were queued or cancelled by CI concurrency during the last inspection; obtain completed/success evidence for the exact new main SHA. Do not count cancelled CI as a pass. Commands in CI: `npm ci`, `npm test`, `node --check`. No local or production runtime commands were executed.

**Current task and next exact action:** fetch latest `main` SHA and corresponding `actions/runs`; if failure, inspect failing job logs and fix. When green, determine authorized production host/provider and environment before any deployment; on that actual host provision safe external replacement RS256 keys with cooperating JWT consumers (issue #2), execute `npm run check:release`, inspect production MongoDB indexes using read-only `npm run audit:sessions`, deploy through the confirmed pipeline, and compare `/health/version` SHA with provider release plus `/health/ready`. Do not merge legacy-auth PR #1 before central identity migration.

**Deployment and access:** NOT VERIFIED DEPLOYED. Service identity, secrets, database indexes, runtime release SHA, health checks and upstream Auth/Upmind integrations remain unverified. Render workspace selection is not established; no provider service was modified. No credentials stored or printed. No external orchestrator for automatic agent reactivation is configured.

## Latest session: refresh safety, OTP attempt limits and deployment provenance (2026-10-14)

**Last completed task.** Verified previous main CI at `9b9229ae0734f38e7f3134e10ce4e8b92c161929` succeeded (run `38624514835`). Implemented and pushed a security/reliability improvement: validate opaque refresh secret before user lookup; sign access JWT before compare-and-swap refresh rotation; test replay, race and invalid private-key handling. Added `GET /health/version` returning a 40-hex commit SHA from `RELEASE_SHA`, `RENDER_GIT_COMMIT`, or `GIT_COMMIT_SHA`, otherwise `null`, with `Cache-Control: no-store`. Secured legacy email OTP verification with atomic five-attempt reservation, atomic single-use consumption, and per-code counter reset on issuance.

**Branch, latest committed reference.** `takatakca/takatakbackend` branch `main`; latest successfully pushed commit **before writing this self-updating handoff**: `ffa0d580c7751528ed4224aec81b0de40cb2469f` (WORKLOG). This handoff update creates a subsequent commit: always query the branch HEAD to identify final SHA.

**Files changed.** `WORKLOG.md`, `controller/refreshController.js`, `utils/releaseRevision.js`, `index.js`, `test/refreshController.test.js`, `test/releaseRevision.test.js`, `utils/emailOtpAttempts.js`, `models/User.js`, `controller/Auth.js`, `test/emailOtpAttempts.test.js`, `.github/workflows/backend-ci.yml`, `README.md`, `docs/PROJECT_STATUS.md`, `docs/TASK_QUEUE.md`, `docs/DEPLOYMENT.md`, `docs/DECISIONS.md`, and this file. No edits were made to the route retirement in PR #1.

**Verification and tools.** Inspected GitHub repo/branch/commits, AGENTS.md, WORKLOG.md, PR #1, issue #2, source and latest CI. Used connected GitHub file update/create APIs for commits directly to main. GitHub Actions performs `npm ci`, `npm test`, and `node --check` for relevant sources. Last confirmed green code+workflow run: [38626338117](https://github.com/takatakca/takatakbackend/actions/runs/38626338117), SHA `9b2b717b617942011d2c8ab7a52bf3c887640398`; later documentation commits require verifying the newest SHA's workflow before declaring its CI green. No local or production npm commands executed, and no actual service deployed by this agent.

**Production status.** **NOT VERIFIED DEPLOYED**. The repository has a CI workflow but no confirmed deployment pipeline or linked service ID. Attempt to read GitHub deployment records through the current connector was rejected as unsupported. Prior Render workspace `My Workspace` was found but its explicit selection remains required before inspecting services; no correct backend host proven. There are no live health, Upmind/Twilio, MongoDB indexes, consumer migration or deployed-SHA checks.

**Blocking issues.** Public repository `keys/private.pem` must be considered exposed and rotated in coordination with all JWT consumers (issue #2); do not silently alter a live key. Legacy Mongo auth retirement is PR #1 (open, unmerged; requires consumer migration). Production MongoDB TTL audit `npm run audit:sessions` requires authorized DB. Runtime `npm run check:release` requires correct external rotated keys and real hosting environment. Legacy encryption and cross-tenant entitlement migration remain not done.

**Next action exactly:** Fetch `GET /repos/takatakca/takatakbackend/branches/main` and `GET /repos/takatakca/takatakbackend/actions/runs?per_page=10`; match the latest SHA with a completed/success run and troubleshoot jobs if failed. Then identify the authorized production service/provider, inspect its linked repo/branch and actual deployment; coordinate key rotation (#2), inspect TTL indexes with read-only script, and compare `/health/version` to provider release SHA while checking `/health/ready`. Keep open PR #1 unchanged until migration is verified.

## Latest continuation addendum — session TTL audit (2026-10-14)

- **Last completed:** implemented `scripts/audit-session-ttl.js` (read-only MongoDB session index inspector), `test/sessionIndexAudit.test.js`, `npm run audit:sessions`, CI syntax validation and operational docs/runbook updates. Detects obsolete `createdAt` TTL and missing `expiresAt` TTL; **never** creates/drops indexes.
- **Previously pushed SHA:** `78c28a2671e06c75c13bde7b3709c0c7187b16da` (decision record). This handoff update creates a new SHA; query `main` head rather than expecting self-referential SHA in its content.
- **Verification:** last confirmed green full `main` workflow before auditor: run `38624212247`, SHA `751a912760c858d2d78a7f6a7abe0ee642462e7b`. Audit and tests committed afterward; fetch the run matching the newest HEAD. Relevant CI: `npm ci`, `npm test`, `node --check scripts/audit-session-ttl.js`. Neither production `npm run audit:sessions` nor `npm run check:release` has been executed because actual hosting/keys/DB access have not been confirmed.
- **Files added/modified since previous handoff:** `scripts/audit-session-ttl.js`, `test/sessionIndexAudit.test.js`, `package.json`, `.github/workflows/backend-ci.yml`, `docs/DEPLOYMENT.md`, `docs/SECURITY-AND-RELEASE.md`, `docs/TASK_QUEUE.md`, `docs/PROJECT_STATUS.md`, `docs/DECISIONS.md`, `WORKLOG.md`, this handoff.
- **Current task / next exact action:** check latest `main` SHA GitHub Actions run (match both SHA and completed/success); investigate any failed job logs. Then identify backend's actual authorized runtime; with real production access first run the offline `npm run check:release` after coordinating external RSA key replacement (#2), and read-only `npm run audit:sessions` against the verified MongoDB database. Do **not** modify indexes automatically or merge auth retirement PR #1 until canonical client migration is established.
- **Deployment:** NOT verified; no service mapping, live SHA, runtime logs, integration results or health probes established. Existing blockers remain exposed signing key, unconfirmed hosting, legacy login cutover, production index state and tenant/Upmind integration. No secrets stored in docs.

## Most recent resumed session — 2026-10-14

**Repository / branch:** `takatakca/takatakbackend` / `main`. Reviewed `AGENTS.md`, `WORKLOG.md`, this handoff, project status/queue, open auth PR #1 and key-exposure issue #2. Existing features preserved.

**Last completed task:** corrected legacy Canadian/US phone normalization (10 digits → `+1` E.164), preserved explicitly provided international numbers, rejected malformed numbers with HTTP 400; fixed legacy verified-user persistence and absent OTP expiry; made six-digit email codes cryptographically random; applied a persistent 30-second legacy login request cooldown. Made newly signed RS256 JWT header `kid` match JWKS through `JWT_KEY_ID`. Added offline production release preflight to reject missing settings, mismatched RSA keys, unsafe origins and known publicly exposed repository keys. Added tests for phone parsing, JWT/JWKS consistency, OTP and release readiness.

**Files changed in this resumed session:** `utils/phoneUtils.js`, `controller/Auth.js`, `controller/authSession.js`, `controller/refreshController.js`, `utils/generateOtp.js`, `test/phoneUtils.test.js`, `test/keyRotation.test.js`, `test/generateOtp.test.js`, `test/legacyLogin.test.js`, `scripts/check-release-readiness.js`, `test/releaseReadiness.test.js`, `package.json`, `.github/workflows/backend-ci.yml`, `README.md`, `docs/SECURITY-AND-RELEASE.md`, `docs/PROJECT_STATUS.md`, `docs/TASK_QUEUE.md`, `docs/DEPLOYMENT.md`, `docs/DECISIONS.md`, `WORKLOG.md` and this handoff.

**Git:** all changes directly committed and pushed to `main` via authorized GitHub connector, no force push. Pre-handoff latest pushed SHA: `51ce3b3c722043c96526cb1ec669a224134929aa` (WORKLOG update). Since this file is in the next commit, fetch `main` HEAD from GitHub to get the latest actual commit SHA; do not assume this file can record its own hash.

**Verification / commands:** GitHub Actions executes `npm ci`, `npm test`, `node --check`. The run [38623871543](https://github.com/takatakca/takatakbackend/actions/runs/38623871543) for `67a9ae3d5badbfc6f46c12ed6909f75cc453a214` completed **successfully**, covering release-readiness tests. Subsequent documentation/worklog/CI changes create new runs and can cancel old runs. The new final main SHA must have its own completed-success run. The release command added is `npm run check:release` (for correctly configured production only); **this command has NOT been run in production because its external keys and hosting target are unconfirmed**. No live integration tests or live deploy were performed.

**Task currently pending:** verify CI of latest main HEAD, then determine actual hosting target from authorized provider/service scope, and perform safe key rotation and cutover planning. See `docs/TASK_QUEUE.md`.

**Known blockers, no concealed success:** production service/URL/deployed SHA still unknown; Render workspace selection requires explicit user authorization (earlier `My Workspace` not confirmed); public `keys/private.pem` exposed in Git history (issue #2) and rotation across consumers not done; legacy auth retirement PR #1 must not be merged until clients are migrated; production MongoDB obsolete seven-day TTL index not inspected; Upmind tenant integration not verified; historic incorrectly prefixed `+234` records must be audited before migration. Backend has **not** been verified deployed, and CI does not establish production health.

**Access needed without exposing secrets:** confirmed target hosting service/workspace; secret presence only (`MONGO_URI`, external `PRIVATE_KEY_PATH`, `PUBLIC_KEY_PATH`, new `JWT_KEY_ID`, `ISSUER`, `CORS_ORIGINS`); authorized production database/index access and JWT-consuming service inventory.

**Next exact action:** query GitHub `/repos/takatakca/takatakbackend/branches/main` and `/repos/takatakca/takatakbackend/actions/runs?per_page=10` to identify the latest SHA and matching CI. If failure, read job logs, fix tests and recommit. If successful, inspect actual configured host only after selection/authorization, run `npm run check:release` with real **rotated external** keys on that host, and record the deployed SHA and `/health/live` + `/health/ready` evidence. Do not claim production complete until verified.

## Latest completed follow-up (2026-10-14)

- **Completed and pushed to `main`:** DB-backed JWT session and verified user checks; DB-derived role/email; new tests for forged roles, inactive sessions and exact Upmind brand; lazy Twilio/SendGrid initialization; Twilio Verify `approved` normalization; persistent `upmindRetryNeeded` flag; missing Upmind integration reports `unavailable` and `null` counts (never false zeroes); CI concurrency and expanded syntax checks; AGENTS/README documentation links.
- **Last confirmed pushed SHA before this handoff update:** `4d092e4369afe070949793795ed683570d95d895` (WORKLOG status update). Fetch the current main head, which includes this document's new commit, when resuming.
- **Latest CI check:** workflow run `38615205788` was **queued** for SHA `4d092e4369afe070949793795ed683570d95d895`. Later runs after this document commit supersede it; check `/actions/runs` and rely only on matching SHA's completed success. Earlier main run `38611397190` passed before these edits.
- **Production status:** NOT DEPLOYED/NOT VERIFIED. No backend production service, deployment SHA, secret presence or health endpoints have been confirmed. Do not use Render tools without the user's explicit workspace choice; user had not confirmed `My Workspace`. MochaHost identity from other projects is not proof of this backend host.
- **Next exact action:** inspect most recent GitHub Actions result for the latest main commit; if failed, fetch job logs and fix. Then determine actual runtime deployment target from explicitly authorized hosting scope. Keep security issue #2 and auth retirement PR #1 separately tracked.
- **Other blockers:** public RSA signing key must be rotated; MongoDB legacy TTL index needs controlled migration; OAuth/tenant authorization and actual Upmind provider contract need validation; no external orchestrator configured for automatic session restart.
- **Modified since prior handoff:** `utils/sendOtpToPhone.js`, `utils/sendOtpToEmail.js`, `controller/Auth.js`, `controller/refreshController.js`, `controller/userDashboard.js`, `services/upmindService.js`, `models/User.js`, `test/startup.test.js`, `test/upmind.test.js`, `.github/workflows/backend-ci.yml`, `AGENTS.md`, `README.md`, `docs/SECURITY-AND-RELEASE.md`, `WORKLOG.md`.
- **Verification commands:** GitHub CI executes `npm ci`, `npm test`, `node --check`; GitHub API read/write used for commits. Git clone from the local container failed DNS lookup for github.com; local tests not run. No provider deployment command executed.
- **No credential exposure:** external keys, production database and hosting workspace still require authorized configured access.

## Resume target
- Repository: https://github.com/takatakca/takatakbackend
- Publication branch: `main`.
- **Last completed implementation:** authenticated legacy API requests now require an active MongoDB session bound to JWT subject, with verified user and server-side role; fixed owner-specific Upmind dashboard linkage and lazy JWT key handling. Unit test added for forged-role/session rejection. This work is committed and pushed.
- **Current task:** verify most recent GitHub Actions for new auth/session tests, then handle any failing checks. Continue safely with independent improvements and deployment discovery.
- **Earlier handoff reference:** `b9534a22a6c5336f63ec6a09a547eb07fec7785b` (docs/DECISIONS.md); latest previous main SHA is recorded in the addendum above. To get the **latest** SHA, read the head of main after this handoff commit; a document cannot store its own content-addressed commit SHA.

## Changes committed in this session
- `WORKLOG.md`: active work claimed at top, to be marked done or blocked on conclusion.
- `middleware/authMiddleware.js`: check JWT, MongoDB session match, revoked/expiry and verified database user before authorizing; ignore token's role/email.
- `models/Session.js`: correct User relation reference to `Users`.
- `controller/userDashboard.js`: select schema-hidden owner Upmind client ID, private cache control, async reads of linked records.
- `controller/authSession.js`: key loaded when used, sign before creating session, normalized cookie/refresh TTL.
- `test/authMiddleware.test.js`: ephemeral RSA key, mocked MongoDB session/user checks; catches forged role and missing/revoked/unverified access.
- `docs/PROJECT_STATUS.md`, `docs/TASK_QUEUE.md`, `docs/DEPLOYMENT.md`, `docs/DECISIONS.md`, this file.

Previous session also committed `test/session.test.js`, `utils/tokenHelpers.js`, `utils/requestCredentials.js`, `controller/refreshController.js`, `controller/logoutController.js`, health checks, `.github/workflows/backend-ci.yml`, Upmind search hardening and release runbook.

## Validations and evidence
- Repository, `main`, open PR #1 and security issue #2 inspected with GitHub connector.
- Read AGENTS.md, WORKLOG.md, README.md, status/runbook, auth/session/dashboard implementation, CI workflow.
- Existing successful CI: https://github.com/takatakca/takatakbackend/actions/runs/38611397190 on SHA `73ce6c9a4ec4f7f7bf13e0e6560e1c02bfd329f4`.
- During this handoff, newer workflow runs were still queued; do **not** claim new code tested until the exact run concludes successfully.
- This environment could not use git clone over network; GitHub connector performed direct read/write commits, so local npm commands were not run by this agent.
- CI workflow performs `npm ci`, `npm test` and `node --check`. Follow link for exact logs.

## Open blocking issues
1. Publicly committed RSA signing key (`keys/private.pem`): rotate across live consumers via https://github.com/takatakca/takatakbackend/issues/2; server-backed session check mitigates but does NOT fix exposed key.
2. Auth retirement PR #1: https://github.com/takatakca/takatakbackend/pull/1. Keep independent, avoid duplicate retirement; verify TAKATAK canonical Auth migration before merging.
3. Legacy `createdAt` 7-day TTL index migration requires correct production DB and backup. Instructions: `docs/SECURITY-AND-RELEASE.md`.
4. Production service not identified with confidence. Prior Render connector listed workspace **My Workspace**, but Render requires explicit selection before inspecting any service; user has not yet confirmed it as the backend's runtime. MochaHost exists for other TAKATAK projects but is not proof this backend runs there.
5. No live secrets, upstream Upmind/Twilio/SendGrid integration health, deployed SHA or production domain has been validated.
6. Legacy phone country prefix +234 and master-auth/tenant-entitlement cutover remain unresolved.

## Deployment: real status
- Changes **pushed to GitHub main**.
- GitHub Actions CI present and previously successful on older SHA; latest run must be read.
- **No confirmed production deployment**. No verified backend URL, service mapping or runtime deployed SHA.
- Required access for completion: authorized production hosting/workspace selection, non-sensitive service identity/deployment target, secret *presence* checks and database/index access, plus coordination for signing-key migration. Never print or commit secrets.

## Next exact actions
1. Open GitHub `/actions/runs?per_page=10` for `takatakca/takatakbackend`; inspect the run matching the latest main SHA, then diagnose failure logs if needed.
2. Reconcile any open PR changes with newer main without merging legacy-auth retirement blindly.
3. Confirm deployment host from verified connector/service mapping, request Render workspace selection only if Render actually hosts this API; check auto-deploy and runtime SHA.
4. Coordinate key rotation issue #2 and TTL index migration, then validate production health and auth flows.
5. Update `docs/PROJECT_STATUS.md`, `TASK_QUEUE.md`, this file and `WORKLOG.md` before session ends. If blocked, continue another independent queue item.

_Operational principle: compare deployed SHA and live behavior before claiming a completed production rollout._
