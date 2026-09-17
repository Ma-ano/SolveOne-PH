# Account Closure and Retention

This document describes the repository-enforced account-closure behavior and
the decisions that remain for product, privacy, legal, and operations review.
It is an engineering control document, not legal advice or a final retention
schedule.

## User workflow

An authenticated ordinary user can review closure requirements and then close
their own account. The operation requires all of the following:

- the current account password;
- the exact phrase `CLOSE MY ACCOUNT`;
- acknowledgement of the retention notice;
- the exact current `ACCOUNT_CLOSURE_POLICY_VERSION`; and
- no active help request, offer, giveaway item/reservation, community mission,
  or mission contribution.

`GET /api/v1/auth/account-closure` returns the current notice metadata and any
machine-readable blockers. `POST /api/v1/auth/account-closure` repeats the
blocker check in the closure transaction. A changed policy version forces the
client to display the new notice before retrying. Moderator and administrator
accounts are deliberately excluded and need administrator-managed offboarding.

## Immediate effects

The transaction:

1. changes the authoritative account status from `active` to `disabled`;
2. replaces email and normalized email with a random
   `closed+<uuid>@deleted.invalid` address, freeing the original address for a
   new registration;
3. replaces the password hash with a random unknown credential;
4. replaces the name with a closed-account label and clears bio, skills,
   location, avatar metadata, email verification, and the public verification
   level;
5. revokes all refresh sessions and consumes outstanding email/reset tokens;
6. expires pending identity review records and queues all identity uploads for
   the existing private object-storage purge worker; and
7. records closure time, policy version, and a redacted `account_closed`
   security event containing only the account ID, hashed IP, and policy version.

Disabled accounts disappear from public profiles and matching surfaces. An old
access or refresh token fails immediately because protected authentication
checks both active account state and active database session state.

## Records retained rather than cascade-deleted

The workflow preserves user IDs on completed or historical relationship,
message, evidence, impact, platform donation/refund, report, block, agreement,
security, moderation, and audit records. Removing those references could erase
another participant's history, corrupt confirmed impact or inventory/accounting
truth, undermine safety investigations, or eliminate evidence needed for a
legal claim or accountability obligation. Product DTOs must continue to render
the participant as unavailable or a closed account rather than exposing the
anonymized user row.

Retention is purpose-limited, not indefinite. Before production, the approved
schedule must assign an owner, lawful purpose, duration/trigger, deletion or
anonymization method, backup treatment, legal-hold exception, and verification
evidence to every retained collection and private object class.

## Production configuration and operations

Production startup requires a non-placeholder
`ACCOUNT_CLOSURE_POLICY_VERSION` and an HTTPS
`ACCOUNT_CLOSURE_NOTICE_URL`. The published notice must accurately describe
retained categories, durations or decision criteria, backup behavior, legal
holds, and the privacy contact for access, correction, objection, and erasure
requests.

Operators must monitor closure failures and identity purge failures without
logging passwords, email addresses, tokens, document keys, or raw IP addresses.
The object-storage lifecycle and hourly purge worker must be exercised against a
staging bucket. Backup restore/deletion behavior must be documented and tested.
Database or storage legal holds must be explicit, access-controlled, reviewed,
and eventually released.

The Philippine National Privacy Commission describes a data subject's right to
request erasure or blocking and also identifies circumstances where a request
may be denied, including legal obligations, legal claims, and legitimate
business purposes consistent with retention standards. Its implementing rules
also require personal data not to be kept longer than necessary and to be
securely disposed of when no longer needed. The production policy and operator
process must be reviewed against the current official guidance:

- <https://privacy.gov.ph/right-to-erasure-or-blocking/>
- <https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/>
- <https://privacy.gov.ph/data-privacy-act/>

## Known limitations

- The repository does not choose final legal retention periods.
- It does not automatically redact user-authored text from messages, completed
  requests, evidence, safety cases, or financial records.
- Backup copies are not synchronously rewritten by the API; deletion follows
  the approved backup rotation and restore procedure.
- Avatar upload/storage is not implemented in the current product. If it is
  added, it must integrate a verified object-deletion queue before launch.
- A separate authenticated/support data-subject request workflow is still
  needed for case-specific access, correction, objection, or broader erasure.
