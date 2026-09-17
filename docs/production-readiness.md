# Production Readiness Gate

This gate follows completion of the numbered implementation phases. It does
not declare the service production-ready and does not enable identity
processing, platform checkout, AI assistance, or any future direct-recipient
payment feature.

## Repository-enforced checks

The GitHub Actions workflow in `.github/workflows/ci.yml` runs on pull requests
and pushes. It uses read-only repository permissions and cancellable per-ref
concurrency. The server job installs from the lockfile, scans tracked files for
high-confidence credential material, lints server and test JavaScript, and runs
the full Vitest suite. The client job installs from its lockfile, checks Expo SDK
compatibility, and performs a production static-web export with non-secret test
origins. Third-party GitHub Actions are pinned to reviewed release commits rather
than mutable major-version tags.

The workflow contains no deployment job. Repository branch protection must be
configured on the eventual Git host to require both jobs before merge. The
workflow itself has not run on a hosted runner because this workspace has no Git
remote and no tracked files yet.

The secret check rejects tracked private `.env` variants, credential-file
extensions, private-key blocks, credential-bearing MongoDB URIs, and selected
high-confidence provider key formats. It reports only the file and finding type,
never the matched secret. It is a guardrail, not a replacement for host-level
secret scanning, history scanning, or key rotation after exposure.

## Health contract

- `GET /health` is process liveness and returns `200 { "status": "ok" }`.
- `GET /health/ready` is routing readiness. It returns `200` with `ready` only
  while the configured MongoDB connection is ready, otherwise `503` with the
  generic status `unavailable`.

Both responses use `Cache-Control: no-store` and disclose no database name,
address, credentials, exception, or topology. Deployment health checks should
route traffic using `/health/ready`; process supervisors may use `/health`.

## Readiness checklist

| Requirement                                 | Current evidence                                                                          | Release state                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| No committed secrets                        | Ignore rules, tracked-file scanner, scanner unit tests                                    | Pending first commit plus independent history/host scan                           |
| Admin and moderator boundaries              | Route middleware and authorization integration tests                                      | Repository verified                                                               |
| Rate limiting                               | Global and scoped middleware with API tests                                               | Repository verified; shared production store still required for horizontal scale  |
| Password reset and email verification       | Service/API tests                                                                         | Repository verified; live transactional-email test required                       |
| Refresh rotation/reuse response             | Auth service tests and security event                                                     | Repository verified                                                               |
| Private evidence and identity files         | Ownership/reviewer checks and storage tests                                               | Repository verified; live bucket policy/encryption/lifecycle test required        |
| Public location minimization                | Explicit serializers and API tests                                                        | Repository verified                                                               |
| Webhook signature/idempotency               | Raw-body signature, event, donation, and replay tests                                     | Repository verified; live provider drill required                                 |
| Database indexes                            | Model assertions and operator index jobs                                                  | Not verified on a production database                                             |
| Backups and restore                         | No external deployment is connected                                                       | Blocking external drill                                                           |
| Log redaction                               | Bounded HTTP serializers and logger tests                                                 | Repository verified; log-sink access/retention review required                    |
| Error monitoring                            | Structured unexpected-error logs only                                                     | Blocking external integration and alert drill                                     |
| Terms, Privacy Policy, Community Guidelines | No approved public documents supplied                                                     | Blocking product/legal publication                                                |
| Safety reporting, blocking, suspension      | API/service tests                                                                         | Repository verified; operational staffing/appeal process required                 |
| Account closure                             | Reauthentication, commitment gate, anonymization, revocation, identity purge queue, tests | Repository verified; published notice and final retention schedule still blocking |
| Fake impact/mock production data            | No production seed command or hardcoded impact totals                                     | Repository verified; deployment data review required                              |
| Dependency risk                             | Lockfiles are fixed; earlier audit findings are documented                                | Blocking fresh registry audit and remediation/acceptance                          |
| Accessibility/device/end-to-end flows       | Build exports pass                                                                        | Blocking physical-device, screen-reader, and full workflow QA                     |

## Required production configuration

1. Use HTTPS origins and a least-privilege Atlas database user. Restrict Atlas
   network access and verify transaction support.
2. Create and verify every operator-managed index against a reviewed backup
   before enabling traffic. Automatic production index creation is disabled.
3. Keep `IDENTITY_PROCESSING_ENABLED`, `PAYMENT_ENABLED`, and
   `AI_ASSISTANCE_ENABLED` false until each feature's separate launch review is
   signed off.
4. Store secrets only in the deployment secret manager. Use independent JWT,
   IP-hash, webhook, storage, and AI safety-identifier secrets and rehearse
   rotation.
5. Configure a private encrypted object-store bucket with lifecycle rules, then
   test upload, authorized download, purge, and backup deletion behavior.
6. Connect structured logs to restricted retention and error-alerting systems.
   Alert on sustained 5xx rates, readiness failures, webhook failures, refresh
   reuse, authentication abuse, cleanup failures, and reconciliation failures.
7. Configure database backups and perform a timed restore into an isolated
   environment. A backup that has not been restored is not verified.
8. Publish legally reviewed Terms, Privacy Policy, Community Guidelines,
   identity notice, retention schedule, rights/deletion channel, and incident
   contact where applicable.
   Set `ACCOUNT_CLOSURE_POLICY_VERSION` and `ACCOUNT_CLOSURE_NOTICE_URL` to the
   exact approved publication; production rejects development placeholders.
9. Configure required CI status checks and prevent deployments from unreviewed
   or failing revisions.

## Incident controls

- Disable AI immediately with `AI_ASSISTANCE_ENABLED=false`; manual requests
  remain available.
- Disable new platform checkouts with `PAYMENT_ENABLED=false` while preserving
  signed webhook processing for already-created sessions.
- Disable new identity submissions with `IDENTITY_PROCESSING_ENABLED=false`
  while retaining authorized review/purge maintenance.
- Remove traffic when `/health/ready` fails; investigate the database without
  exposing dependency details in the public response.
- Treat a committed or logged secret as compromised: revoke and rotate it,
  inspect history and logs, and do not rely on deleting the visible file.

## Remaining release blockers

The platform must not be represented as production-ready until the external and
missing items above are closed. Self-service account closure is implemented,
but the collection-by-collection retention schedule, public notice, privacy
request case handling, and backup/legal-hold procedures still require approval.
The highest-priority operational gaps are backup/restore proof, error monitoring
and alert drills, published policies, live index/provider validation,
dependency review, and end-to-end accessibility/device testing.
