# Phase 11 — Reporting and safety

## Delivered scope

Phase 11 adds private reports for users, public help requests, and individual
messages; directed user blocks; a claim-based moderator queue; admin-only
account suspension and reinstatement; and a redacted admin audit-log view.

The implementation keeps these boundaries separate:

- A report asks for review. It does not automatically punish an account or
  change public content.
- A block is private to the blocker and prevents new offers, messages, and
  realtime conversation joins in either direction.
- A moderator may review and resolve reports but cannot suspend an account.
- Only an administrator may suspend or reinstate a non-admin account.
- Suspension revokes every active refresh session. Existing access tokens fail
  on their next authenticated API or socket authorization check.

## Data model

`Report` now records the reported account for conflict-of-interest checks, a
30-minute reviewer claim, the resolving reviewer, and resolution text. The
hidden `activeKey` is a SHA-256 digest of reporter, target type, and target ID.
Its partial unique index suppresses duplicate open reports and is removed when
the report is resolved or dismissed so a later incident can be reported.

`UserBlock` stores one directed blocker/blocked pair with a unique index and a
reverse lookup index. Existing offer and conversation repositories check both
directions.

`User` contains select-hidden suspension and reinstatement actor, timestamp,
and reason fields. These fields are excluded from normal private and public user
DTOs.

Every block/unblock, report claim, reported-evidence access, report decision,
suspension, and reinstatement appends an `AuditLog`. The log stores a keyed hash
of the source IP; neither that hash nor raw audit metadata is returned by the
admin list API.

## API surface

Member routes:

| Method | Route                                 | Purpose                         |
| ------ | ------------------------------------- | ------------------------------- |
| POST   | `/api/v1/reports/users/:userId`       | Report an active public user    |
| POST   | `/api/v1/reports/requests/:requestId` | Report a visible public request |
| POST   | `/api/v1/messages/:messageId/report`  | Report one participant message  |
| GET    | `/api/v1/blocks`                      | List the caller's blocks        |
| POST   | `/api/v1/blocks/:userId`              | Block an active user            |
| DELETE | `/api/v1/blocks/:userId`              | Remove the caller's block       |

Moderator/admin routes:

| Method | Route                                            | Purpose                               |
| ------ | ------------------------------------------------ | ------------------------------------- |
| GET    | `/api/v1/admin/safety/reports`                   | Read a status/type-filtered queue     |
| POST   | `/api/v1/admin/safety/reports/:reportId/claim`   | Claim a report for 30 minutes         |
| GET    | `/api/v1/admin/safety/reports/:reportId`         | Open claimed, audit-recorded evidence |
| POST   | `/api/v1/admin/safety/reports/:reportId/resolve` | Resolve or dismiss a claimed report   |

Admin-only routes:

| Method | Route                                          | Purpose                                 |
| ------ | ---------------------------------------------- | --------------------------------------- |
| POST   | `/api/v1/admin/safety/users/:userId/suspend`   | Suspend a non-admin and revoke sessions |
| POST   | `/api/v1/admin/safety/users/:userId/reinstate` | Restore a suspended non-admin account   |
| GET    | `/api/v1/admin/safety/audit-logs`              | Read redacted privileged audit records  |

All inputs are strict allowlists. Report/block creation has account-scoped rate
limits. Queue, block, and audit collections use scoped opaque cursors.

## Private evidence rules

Opening evidence requires an unexpired claim owned by that exact moderator and
creates an audit record. A message report returns only the reported message,
its sender ID, timestamp, removed state, and automated safety flags. It never
returns adjacent messages or the conversation. Request evidence includes only
the already-public location. User evidence excludes email, exact location,
credentials, sessions, government IDs, and verification files.
The reporter's identity is also omitted from moderator DTOs.

Moderators cannot claim reports they submitted or reports about themselves.
Claims use conditional updates so two reviewers cannot acquire the same active
case.

## Client surfaces

- Public profiles provide private user reporting and blocking.
- Public request details provide private request reporting.
- Conversation messages retain the Phase 6 message-report action.
- The safety page lists the signed-in member's blocks and allows unblocking.
- The moderation workspace supports queue filtering, claim, evidence review,
  decision notes, and admin account action.
- The admin audit view omits IP hashes and internal metadata.

## Operational notes

No package or lockfile changed in this phase. Existing `Report` indexes must be
reconciled before production rollout because the former `report_active_unique`
index was not partial. Back up the collection, review the exact target, and run
`npm run db:index:safety`; that narrowly scoped job replaces only a legacy index
with that exact name before creating the reviewed report, block, and audit
indexes. Do not make this change ad hoc on a live database.

The current phase resolves/dismisses reports and supports account suspension; it
does not yet add moderator deletion of public request content or message data.
Historical participant messages remain readable after a block, while new
interaction is disabled. Appeals, retention automation, and aggregate abuse
analytics remain future operational work.
