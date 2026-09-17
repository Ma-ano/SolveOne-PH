# Phase 16 — Privacy Rights Request Operations

Phase 16 adds an authenticated case workflow for data-subject requests. It is
an operational control, not legal advice and not a claim that SolveOne PH is
ready to fulfill requests in production.

The intake categories follow the rights described by the Philippine National
Privacy Commission: access, rectification, erasure or blocking, objection, and
data portability. Product and legal owners must approve the public notice,
identity-verification procedure, response targets, denial criteria, retention
schedule, and fulfillment runbooks before launch.

## Product boundaries

- A signed-in user can submit a request, read its status and owner-visible
  outcome, and cancel it only before an administrator claims it.
- Only administrators can access the operational queue or requester email.
- The assigned administrator must attest that identity, scope, and retention
  duties were reviewed before completing or denying a request.
- A case never automatically exports, changes, blocks, or deletes product data.
  Those actions remain manual until collection-specific, reviewed procedures
  exist.
- Only one active request of a given type is permitted per account. A completed,
  denied, or cancelled case releases that key so a later request can be filed.
- Request details and outcomes are capped at 2,000 characters. Intake warns
  users not to submit passwords, government ID numbers, or unrelated sensitive
  data.

## Lifecycle

```text
submitted -> in_review -> completed
                      \-> denied
submitted -> cancelled
in_review -> submitted (assigned administrator releases the claim)
```

No general status patch exists. Claim, release, cancellation, and resolution
are explicit operations with allowlisted transitions.

## API surface

Owner endpoints:

- `POST /api/v1/privacy-requests`
- `GET /api/v1/privacy-requests`
- `GET /api/v1/privacy-requests/:requestId`
- `POST /api/v1/privacy-requests/:requestId/cancel`

Administrator endpoints:

- `GET /api/v1/admin/privacy-requests`
- `GET /api/v1/admin/privacy-requests/:requestId`
- `POST /api/v1/admin/privacy-requests/:requestId/claim`
- `POST /api/v1/admin/privacy-requests/:requestId/release`
- `POST /api/v1/admin/privacy-requests/:requestId/resolve`

Owner and administrator reads use `Cache-Control: private, no-store`. Owner
lookups always include the authenticated requester ID, preventing identifier
guessing from exposing another case. Queue and detail endpoints require the
`admin` role; moderators do not have access.

## Persistence and audit

`DataSubjectRequest` records the requester, immutable request type/details and
privacy-policy version, explicit status, assignment, owner-visible resolution,
and timestamps. Assignment and resolution actor IDs are excluded from default
queries. A partial unique index enforces one active case per requester and
request type.

Every state-changing operation writes an `AuditLog` in the same transaction.
Audit metadata contains request type and state only—not request details,
resolution text, email, or other case content. IP addresses are represented by
the existing keyed hash.

Before enabling the workflow against a production database, back up and review
the target database, then run:

```bash
cd server
npm run db:index:privacy
```

Production uses `autoIndex: false`; the application does not create these
indexes at startup.

## Operator runbook gate

Before resolving any live case, the assigned administrator must use an approved
runbook to:

1. Verify that the requester is authorized to exercise the rights attached to
   the account. An active application session alone may be insufficient for a
   high-risk disclosure or destructive action.
2. Define the request scope and search every applicable database collection,
   object-storage prefix, email/payment/AI provider, log sink, backup, and
   manually maintained system.
3. Separate the requester's data from information about other people and from
   material that cannot lawfully or safely be disclosed.
4. Apply the approved retention and legal-hold rules. Do not promise deletion
   from backups unless the tested backup procedure supports it.
5. Deliver exports only through an approved encrypted channel and record a
   concise, non-sensitive outcome in the case.
6. Escalate uncertain access, correction, objection, portability, erasure,
   denial, or identity questions to the designated privacy owner.

The draft inventory is in
[data-retention-schedule.md](data-retention-schedule.md). Its blank approval
fields are deliberate release blockers.

## Known limitations

- No automatic export, correction, objection flag, erasure, or provider purge
  is implemented.
- No response deadline, escalation timer, reassignment override, attachments,
  secure file delivery, or requester correspondence thread exists.
- Case details rely on deployment-level database encryption; application-level
  field encryption is not implemented.
- Backup erasure, legal holds, third-party processor requests, and proof of
  fulfillment are operational procedures outside this repository.
- The collection-by-collection retention schedule is a draft inventory and has
  not been legally or operationally approved.

## Authoritative references reviewed

- National Privacy Commission, “The Rights of Data Subjects”:
  https://privacy.gov.ph/data-subject-rights/
- National Privacy Commission, Implementing Rules and Regulations of the Data
  Privacy Act of 2012: https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/
