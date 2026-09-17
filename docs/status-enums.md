# Status enums and transitions

The canonical string values are exported from `server/src/constants/statuses.js`. Database schemas, validation, service transitions, tests, and API documentation must use those values. Clients may map them to display labels but cannot set protected workflow state directly.

Adding a status requires an explicit transition rule, authorization rule, serializer decision, analytics impact review, and migration consideration for existing records.

## Account

| Value       | Meaning                                                         |
| ----------- | --------------------------------------------------------------- |
| `active`    | Account may act subject to resource permissions                 |
| `suspended` | Protected interaction is blocked pending restoration/appeal     |
| `disabled`  | Account is disabled or deletion processing makes it unavailable |

Only authorized server operations can change account status or role.
An ordinary active user may transition to `disabled` only through the
versioned account-closure operation after current-password confirmation and an
active-commitment check. Closure is terminal in place; reopening the disabled
record is not supported. Suspension and administrator-managed staff offboarding
remain separate operations.

## Verification level

`UNVERIFIED` → `EMAIL_VERIFIED` → `IDENTITY_VERIFIED` → `PARTNER_VERIFIED`

Levels are factual badges, not a percentage trust score. A record review uses `pending`, `approved`, `rejected`, or `expired`; an approved record may advance the user level only inside the verification service.

## Help request

| Current             | Allowed next state                                        | Operation/authority                                                     |
| ------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| `draft`             | `pending_review`, `cancelled`                             | Owner submits or cancels                                                |
| `changes_requested` | `pending_review`, `cancelled`                             | Owner edits then resubmits or cancels                                   |
| `pending_review`    | `published`, `changes_requested`, `rejected`, `cancelled` | Moderator decision; owner may cancel                                    |
| `published`         | `partially_solved`, `solved`, `cancelled`, `expired`      | Completion projection or eligible close/expiry operation                |
| `partially_solved`  | `solved`, `cancelled`, `expired`                          | Completion projection or eligible close/expiry operation                |
| terminal            | none                                                      | `solved`, `cancelled`, `rejected`, and `expired` do not reopen in place |

Moderation cannot publish a request that the owner cancelled while it was under review. Progress and solved state are derived from confirmed assistance, not client totals.

Phase 4 enforces `draft`/`changes_requested` edits and owner submission/cancellation with conditional updates. Moderator/admin approval, rejection, and requested changes are conditional on `pending_review`, prohibit self-review, and append an audit record in the same transaction. Phase 5 reserves accepted capacity in separate reservation counters. Phase 7 owner confirmation transactionally moves that capacity to solved and derives `partially_solved`/`solved` from every need item. Cancellation is disallowed while a completion submission or dispute remains open.

## Help offer

| Current                | Allowed next state                               | Operation/authority                                                              |
| ---------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `pending`              | `accepted`, `rejected`, `withdrawn`, `cancelled` | Request owner accepts/rejects; helper withdraws; system may cancel               |
| `accepted`             | `in_progress`, `cancelled`                       | Helper starts; owner request cancellation may close it                           |
| `in_progress`          | `completion_submitted`, `cancelled`              | Helper submits completion; owner request cancellation may close it               |
| `completion_submitted` | `completed`, `disputed`                          | Request owner confirms or disputes                                               |
| `disputed`             | `completed`, `cancelled`                         | Authorized resolution workflow                                                   |
| terminal               | none                                             | `rejected`, `withdrawn`, `completed`, and `cancelled` do not transition normally |

Accepting final remaining quantity must use an atomic conditional update or transaction. Confirmation is idempotent and creates impact once.

Phase 5 implements `pending` → `accepted`/`rejected`/`withdrawn` and `accepted` → `in_progress`. Accept and start retries return the already-established state; acceptance additionally requires a persisted `Idempotency-Key`. Phase 7 implements helper `in_progress` → `completion_submitted`, owner `completion_submitted` → `completed`/`disputed`, and automatic system cancellation of pending offers when a request is fully solved. Confirmation also requires a persisted `Idempotency-Key`. `disputed` resolution to `completed`/`cancelled` is reserved for a later audited moderator workflow; no current direct resolution route exists.

## Conversation

`active` → `closed` on owner request cancellation. An accepted offer creates one active conversation in the acceptance transaction. Only current participants can read historical messages; sending and realtime room joining require an active, eligible, unblocked help relationship. A closed conversation does not reopen in place.

## Message

Phase 6 permits participant-authored `text` messages only. `image` and `system` are reserved model values until an authorized upload/system workflow exists. `editedAt` and `deletedAt` are reserved fields, not client-driven state transitions. Read-through state advances monotonically per participant.

## Notification

Phase 8 stores one recipient-scoped record per selected source event. `readAt: null` → a server timestamp when its recipient opens or marks the item read; a retry cannot move that timestamp again. A 180-day TTL may delete either read or unread records. Notification kind and resource-type values are allowlisted in `server/src/constants/statuses.js`, not client-provided workflow state.

## Platform donation

| Current   | Allowed next state          | Authority                                                                                  |
| --------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| `pending` | `paid`, `failed`, `expired` | Signed provider payment event; failure/expiry are reserved for a future reconciliation job |
| `paid`    | `refunded`                  | Signed successful-refund event; partial refunds retain `paid` with a refund amount         |
| terminal  | none                        | `failed`, `expired`, and `refunded` do not become paid without a distinct reconciled flow  |

Phase 10 implements `pending` → `paid` and full-refund `paid` → `refunded`. `failed` and `expired` are canonical but currently have no transition operation; a browser cancel/redirect never assigns them. Refund-before-payment events stay deferred, partial refunds retain `paid`, and duplicate/out-of-order webhooks may not regress state or count a donation/refund twice.

## Report

`open` → `reviewing` → `resolved` or `dismissed`

An authorized moderator owns review transitions. Duplicate spam reports are prevented separately from status handling, and message/report access is audited where required.

Phase 6 creates `open` reports for selected messages. Phase 11 adds user and request reports, then enforces `open` → `reviewing` through a 30-minute conditional moderator claim and `reviewing` → `resolved`/`dismissed` only by that assigned reviewer before claim expiry. The active deduplication key is removed at the terminal transition so a later incident can be reported. Claim, evidence access, and decision actions are audited. A reviewer cannot claim their own report or a report about themselves.

## Giveaway item (Phase 13)

| Current     | Allowed next state             | Operation/authority                                                                    |
| ----------- | ------------------------------ | -------------------------------------------------------------------------------------- |
| `available` | `reserved`, `given`, `removed` | Reservation counters, final confirmation, or owner removal without active reservations |
| `reserved`  | `available`, `given`           | Cancellation/released capacity or final confirmation                                   |
| terminal    | none                           | `given` and `removed` do not reopen in place                                           |

`available` and `reserved` are projections of total, reserved, and given
quantity rather than a client-set flag. A partially reserved multi-quantity
listing remains `available` while an unreserved unit exists. `given` means all
listed units were completed through two-party handoffs.

## Giveaway reservation (Phase 13)

| Current    | Allowed next state       | Operation/authority                                                       |
| ---------- | ------------------------ | ------------------------------------------------------------------------- |
| `reserved` | `completed`, `cancelled` | Second participant confirms, or a participant cancels before confirmation |
| terminal   | none                     | `completed` and `cancelled` do not reopen in place                        |

The donor and recipient each have a distinct confirmation timestamp. The
first confirmation keeps the reservation in `reserved`; the second moves
reserved inventory/request capacity to given/solved atomically. Once either
confirmation exists, participants cannot cancel it and the request owner
cannot cancel the linked request. Only `completed` contributes item impact.

## Community mission (Phase 14)

| Current             | Allowed next state                                        | Operation/authority                                    |
| ------------------- | --------------------------------------------------------- | ------------------------------------------------------ |
| `draft`             | `pending_review`, `cancelled`                             | Creator submission or cancellation                     |
| `changes_requested` | `pending_review`, `cancelled`                             | Creator edit/resubmission or cancellation              |
| `pending_review`    | `published`, `changes_requested`, `rejected`, `cancelled` | Moderator decision, or creator cancellation            |
| `published`         | `in_progress`, `completed`, `cancelled`                   | Accepted/confirmed work, or creator cancellation       |
| `in_progress`       | `completed`, `cancelled`                                  | Final confirmed work, or eligible creator cancellation |
| terminal            | none                                                      | `completed`, `cancelled`, and `rejected` do not reopen |

Mission verification moves `unverified` to `pending` on submission. Human
approval sets `verified`; rejection sets `rejected`; a changes request returns
it to `unverified`. Only a `verified` mission in `published`, `in_progress`, or
`completed` is publicly readable. Status is derived by explicit operations and resource
counters, never accepted from a general patch.

## Mission contribution (Phase 14)

| Current                | Allowed next state                  | Operation/authority                                     |
| ---------------------- | ----------------------------------- | ------------------------------------------------------- |
| `pending`              | `accepted`, `rejected`, `withdrawn` | Mission creator decision or contributor withdrawal      |
| `accepted`             | `in_progress`, `cancelled`          | Contributor start or eligible mission cancellation      |
| `in_progress`          | `completion_submitted`, `cancelled` | Contributor submission or eligible mission cancellation |
| `completion_submitted` | `completed`                         | Mission creator confirms submitted work                 |
| terminal               | none                                | Completed/rejected/withdrawn/cancelled do not reopen    |

Acceptance reserves exact mission-resource capacity. Creator confirmation moves
that same quantity from reserved to fulfilled atomically. Only `completed`
contributes impact. Mission cancellation is blocked once any completion is
awaiting confirmation.

## Related closed sets

- Roles: `user`, `moderator`, `admin`
- Help types: `money`, `item`, `skill`, `time`
- Request urgency: `normal`, `important`, `time_sensitive`
- Message types: `text`, `image`, `system`
- Conversation status: `active`, `closed`
- Message report reasons: `credential_request`, `suspicious_payment`, `harassment`, `spam`, `other`
- User report reasons: `scam`, `impersonation`, `harassment`, `unsafe_contact`, `spam`, `other`
- Request report reasons: `scam`, `prohibited_content`, `privacy_exposure`, `dangerous_activity`, `child_safety`, `duplicate`, `other`
- Notification kinds: `offer_received`, `offer_accepted`, `offer_rejected`, `completion_submitted`, `completion_confirmed`, `completion_disputed`, `message_received`, `request_approved`, `request_changes_requested`, `request_rejected`, `identity_approved`, `identity_rejected`, `giveaway_reserved`, `giveaway_confirmation_needed`, `giveaway_handoff_completed`, `giveaway_reservation_cancelled`, `mission_approved`, `mission_changes_requested`, `mission_rejected`, `mission_contribution_received`, `mission_contribution_accepted`, `mission_contribution_rejected`, `mission_completion_submitted`, `mission_contribution_completed`, `mission_completed`, `mission_cancelled`
- Notification resources: `offer`, `request`, `conversation`, `verification`, `giveaway_item`, `giveaway_reservation`, `community_mission`, `mission_contribution`
- Giveaway condition: `new`, `good`, `used`, `needs_minor_repair`
- Giveaway reservation status: `reserved`, `completed`, `cancelled`
- Mission verification status: `unverified`, `pending`, `verified`, `rejected`
- Mission resource type: `item`, `skill`, `time`
- Mission contribution status: `pending`, `accepted`, `rejected`, `withdrawn`, `in_progress`, `completion_submitted`, `completed`, `cancelled`

These are schema allowlists. They are not client authorization mechanisms.

Phase 15 introduces no status enum or transition. An AI suggestion is ephemeral
preview data, not persisted workflow state. Only the existing explicit request
draft, submission, moderation, offer, completion, and impact operations can
change authoritative state.
