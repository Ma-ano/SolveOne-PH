# API conventions

## Base paths

- Application JSON routes use `/api/v1`.
- `GET /health` remains unversioned process liveness and returns exactly `{ "status": "ok" }`.
- `GET /health/ready` remains unversioned dependency readiness and returns generic `ready`/`unavailable` status without dependency details.
- Webhook routes live under `/api/v1/webhooks` but use provider-specific authentication rather than user JWT authentication.

Adding a field is normally backward compatible. Removing, renaming, or changing the meaning of a field requires a new API version or an explicit migration window.

## Response envelope

Successful application responses use:

```json
{
  "success": true,
  "data": {}
}
```

Errors use:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": []
  }
}
```

`details` is optional and must contain safe field-level information only. Production responses never contain stack traces, raw database/provider errors, secrets, or internal file paths. The `X-Request-Id` response header correlates a safe client error with server logs.

## HTTP behavior

| Status | Use                                                           |
| ------ | ------------------------------------------------------------- |
| 200    | Successful read or idempotent operation with a representation |
| 201    | Resource created                                              |
| 202    | Work accepted for asynchronous processing                     |
| 204    | Successful operation with no response body                    |
| 400    | Malformed request or invalid cursor                           |
| 401    | Authentication is missing or invalid                          |
| 403    | Authenticated principal lacks permission                      |
| 404    | Resource absent or intentionally concealed                    |
| 409    | State transition, duplicate, or concurrency conflict          |
| 422    | Well-formed input violates field/business validation          |
| 429    | Scoped rate limit exceeded                                    |
| 500    | Unexpected server failure with a safe generic message         |

Object IDs are validated before database access. Unknown query/body keys are rejected for mutations. Services receive explicit allowed fields; controllers never pass `req.body` directly to a Mongoose create or update operation.

## Resource and operation design

Use nouns for resources and explicit operation endpoints for workflow changes. A caller cannot set `status` directly.

Examples:

```text
POST /api/v1/requests/:id/submit
POST /api/v1/requests/:id/cancel
POST /api/v1/offers/:id/accept
POST /api/v1/offers/:id/start
POST /api/v1/offers/:id/complete
POST /api/v1/offers/:id/confirm
POST /api/v1/offers/:id/dispute
```

`PATCH` is reserved for allowlisted editable attributes such as a private profile or an editable request draft. The service still checks ownership, account state, resource state, and field permissions.

## Authentication and sessions

- Send the short-lived access token as `Authorization: Bearer <token>`.
- On mobile, rotation returns a refresh token for Expo SecureStore.
- On web, the refresh token is delivered in a Secure, HttpOnly, SameSite cookie; response bodies do not expose it.
- Refresh rotation is atomic. Reuse revokes the token family and records a security event.
- Logout is idempotent. Logout-all revokes every active session for the user.
- Socket authentication uses a valid access token and repeats authorization when joining or acting in a conversation.

Phase 2 implements the following routes:

| Method | Route                              | Authentication | Success |
| ------ | ---------------------------------- | -------------- | ------- |
| POST   | `/api/v1/auth/register`            | Public         | 201     |
| POST   | `/api/v1/auth/login`               | Public         | 200     |
| POST   | `/api/v1/auth/verify-email`        | One-time token | 200     |
| POST   | `/api/v1/auth/resend-verification` | Public         | 202     |
| POST   | `/api/v1/auth/forgot-password`     | Public         | 202     |
| POST   | `/api/v1/auth/reset-password`      | One-time token | 200     |
| POST   | `/api/v1/auth/refresh`             | Refresh token  | 200     |
| POST   | `/api/v1/auth/logout`              | Session token  | 200     |
| POST   | `/api/v1/auth/logout-all`          | Bearer token   | 200     |
| GET    | `/api/v1/auth/account-closure`     | Bearer token   | 200     |
| POST   | `/api/v1/auth/account-closure`     | Bearer token   | 200     |

Registration never accepts a role. Resend and forgot-password use a uniform response so callers cannot enumerate accounts. A native login/refresh response includes the rotating refresh token; a browser response sets the refresh cookie and omits that field. Browser classification uses request origin/cookie context rather than trusting the submitted platform string.

The closure requirements response returns the current policy version, published
notice URL, eligibility, and machine-readable blocker codes for the
authenticated account. Closure accepts only the current password, exact
`CLOSE MY ACCOUNT` confirmation, `retentionAcknowledged: true`, and the current
policy version. A stale version returns `ACCOUNT_CLOSURE_NOTICE_CHANGED`.
Active requests, offers, giveaways, handoffs, missions, or contributions return
`ACCOUNT_CLOSURE_BLOCKED` with blocker codes; staff accounts use a separate
administrator-managed offboarding process. A successful operation disables
the account, anonymizes direct account/profile fields, revokes all sessions and
one-time tokens, queues identity documents for deletion, and clears the browser
refresh cookie.

## Profiles

Phase 3 implements:

| Method | Route                   | Authentication | Purpose                                      |
| ------ | ----------------------- | -------------- | -------------------------------------------- |
| GET    | `/api/v1/users/me`      | Bearer token   | Read the owner's complete private profile    |
| PATCH  | `/api/v1/users/me`      | Bearer token   | Update allowlisted owner profile fields      |
| GET    | `/api/v1/users/:userId` | Public         | Read a privacy-minimized active-user profile |

The private update accepts only `firstName`, `lastName`, `bio`, `skills`, and `location`. The public DTO uses a first-name/last-initial `displayName`; exposes optional bio, skills, city, province, country, factual verification level, and creation time; and omits email, full surname, barangay, role, account status, agreement data, security state, and private avatar storage metadata. Suspended or disabled accounts return the same `USER_NOT_FOUND` response as missing accounts.

## Help requests

Phase 4 implements:

| Method | Route                                               | Authentication  | Purpose                                                 |
| ------ | --------------------------------------------------- | --------------- | ------------------------------------------------------- |
| GET    | `/api/v1/requests`                                  | Public          | List published requests with bounded cursor pagination  |
| GET    | `/api/v1/requests/discover`                         | Optional bearer | Deterministic relevant, skill, no-money, or nearby rank |
| GET    | `/api/v1/requests/solvable?budget=`                 | Optional bearer | Fully solvable financial needs within a PHP budget      |
| POST   | `/api/v1/requests`                                  | Bearer token    | Create a private draft                                  |
| GET    | `/api/v1/requests/mine`                             | Bearer token    | List the owner's requests and moderation status         |
| GET    | `/api/v1/requests/:requestId`                       | Optional bearer | Read an owned request or a sanitized public request     |
| PATCH  | `/api/v1/requests/:requestId`                       | Bearer token    | Edit an owned draft or changes-requested record         |
| POST   | `/api/v1/requests/:requestId/submit`                | Bearer token    | Validate concrete needs and submit for review           |
| POST   | `/api/v1/requests/:requestId/cancel`                | Bearer token    | Cancel an eligible owned request                        |
| GET    | `/api/v1/admin/requests`                            | Moderator/admin | Read a bounded moderation queue                         |
| POST   | `/api/v1/admin/requests/:requestId/approve`         | Moderator/admin | Publish a pending request                               |
| POST   | `/api/v1/admin/requests/:requestId/reject`          | Moderator/admin | Reject with required notes                              |
| POST   | `/api/v1/admin/requests/:requestId/request-changes` | Moderator/admin | Return required changes with notes                      |

Draft mutations accept only request content fields. They never accept `ownerId`, `status`, moderation fields, `solvedQuantity`, derived totals, safety flags, verification requirements, or publication timestamps. Submission requires a specific title and description, one need item per selected help type, a future needed-by date, city/province, and positive estimates for money/item needs. Combined estimated value is derived by the server and limited by `MAX_REQUEST_ESTIMATED_VALUE_CENTAVOS`.

The public DTO includes the reviewed content, need items, first-name/last-initial owner identity, factual verification level, and only city/province. It omits barangay, account fields, moderation notes, reviewer identity, private verification requirements, and safety flags. Owner and moderation DTOs are separate explicit contracts.

Need-item DTOs expose server-derived reservation and remaining counters. `reservedQuantity`/`remainingQuantity` apply to item, skill, and time needs; `reservedValueCentavos`/`remainingValueCentavos` apply to money needs. Reservation does not mean verified completion and never changes solved counters or public impact.

Public filters are allowlisted to `category`, `helpType`, and `urgency`. Public cursors are scoped to that exact filter set and the deterministic `publishedAt`/`_id` sort. Owner and moderation cursors use separate scopes and deterministic sorts.

Advanced discovery optionally uses the signed-in helper's saved skills and
general city/province, excludes that helper's own requests, and otherwise
returns the same privacy-minimized public request DTO with explainable match
metadata. Skill/no-money results require exact normalized `requiredSkills`
matches and only include skill/time needs. Budget input is decimal PHP at the
HTTP boundary and is validated into integer centavos; the server derives the
complete remaining money or proportional item value from authoritative
counters. Discovery cursors bind the full deterministic ranking tuple and
normalized criteria. See [Phase 12](phase-12-advanced-discovery.md).

## Help offers

Phase 5 implements:

| Method | Route                                | Authentication | Purpose                                                   |
| ------ | ------------------------------------ | -------------- | --------------------------------------------------------- |
| POST   | `/api/v1/requests/:requestId/offers` | Bearer token   | Create one typed private offer for a concrete need        |
| GET    | `/api/v1/requests/:requestId/offers` | Request owner  | List that request's offers with bounded cursor pagination |
| GET    | `/api/v1/offers/me`                  | Bearer token   | List offers made by the current helper                    |
| POST   | `/api/v1/offers/:offerId/accept`     | Request owner  | Atomically accept and reserve remaining capacity          |
| POST   | `/api/v1/offers/:offerId/reject`     | Request owner  | Reject a pending offer                                    |
| POST   | `/api/v1/offers/:offerId/withdraw`   | Offer helper   | Withdraw a pending offer                                  |
| POST   | `/api/v1/offers/:offerId/start`      | Offer helper   | Start accepted assistance                                 |

Offer creation is a strict discriminated contract. Money accepts `pledgedValueCentavos`; item accepts `quantity`; skill/time accept `quantity` plus `estimatedMinutes`. All accept a matching `needItemId` and bounded `message`. Inapplicable amount fields, client statuses, participant IDs, timestamps, and internal keys are rejected. Money responses explicitly use `assistanceMode: "MONETARY_PLEDGE"`; no wallet, transfer, payout, or escrow record is created.

Offer collections are private participant surfaces. The owner list includes a minimized helper display identity; the helper list includes a minimized request-owner identity and request/need summary. Neither returns email, full surname, exact location, account state, private moderation data, or internal active/idempotency keys. There is no public offer-list API.

`POST /api/v1/offers/:offerId/accept` requires a 16–200 character `Idempotency-Key` containing letters, numbers, `.`, `_`, `:`, or `-`. The server hashes the key, scopes it to the principal and operation, binds it to the offer ID, retains the completed response for `IDEMPOTENCY_TTL_HOURS` (24 by default), and returns that original response on replay. A key reused for another offer returns `409 IDEMPOTENCY_KEY_REUSED`; a concurrent duplicate still executing returns `409 IDEMPOTENCY_IN_PROGRESS`.

Accepting an offer updates both the offer and the appropriate embedded request reservation counter in a MongoDB transaction. The request write compares the counters read by that transaction before incrementing them. A competing transaction for the final unit/value therefore retries against current state or returns `409 INSUFFICIENT_REMAINING_NEED`; it cannot over-reserve. Owner cancellation releases accepted/in-progress reservations and system-cancels active offers in one transaction.

Offer creation conditionally writes the still-open request in the same transaction as the offer insert. That shared aggregate write serializes creation against request cancellation/progress and prevents a stale read from creating an offer after closure.

## Messaging

Phase 6 implements:

| Method | Route                                            | Authentication     | Purpose                                              |
| ------ | ------------------------------------------------ | ------------------ | ---------------------------------------------------- |
| GET    | `/api/v1/conversations`                          | Participant bearer | Private chat inbox                                   |
| GET    | `/api/v1/conversations/:conversationId`          | Participant bearer | Private conversation and warning context             |
| GET    | `/api/v1/conversations/:conversationId/messages` | Participant bearer | Newest-first, cursor-paged messages                  |
| POST   | `/api/v1/conversations/:conversationId/messages` | Participant bearer | Persist a text message before realtime signal        |
| POST   | `/api/v1/conversations/:conversationId/read`     | Participant bearer | Monotonic read-through state                         |
| POST   | `/api/v1/messages/:messageId/report`             | Participant bearer | Report a selected message from the other participant |

Offer acceptance creates one conversation in its existing transaction. There is no arbitrary create-conversation endpoint. A send accepts only `{ "type": "text", "content": "...", "clientMessageId": "..." }` and rechecks account, current offer/request eligibility, block state, and membership. The sender is never client-selectable. Retrying the same sender/client ID and content returns the original message with `200`; a different payload reusing that ID returns `409 CLIENT_MESSAGE_ID_REUSED`.

Realtime clients authenticate with an access token supplied as Socket.IO `auth.token`. A `conversation:join` payload contains only a conversation ID and receives an acknowledgement after current authorization; clients never choose raw room names. `message:created` and `conversation:updated` carry only conversation/message IDs, so clients refetch authorized persisted content. Private messages are not visible to a moderator by role alone.

## Completion and verified impact

Phase 7 adds participant-only private evidence and server-calculated public impact:

| Method | Route                                            | Purpose                                                                                     |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/offers/:offerId/evidence/uploads`       | Helper uploads a private proof while the offer is in progress                               |
| POST   | `/api/v1/offers/:offerId/complete`               | Helper submits a 10–2000 character note, optional actual minutes, and up to four upload IDs |
| GET    | `/api/v1/offers/:offerId/evidence`               | Helper or request owner reads private completion evidence                                   |
| GET    | `/api/v1/offers/:offerId/evidence/files/:fileId` | Participant-only, audited, attachment-only proof download                                   |
| POST   | `/api/v1/offers/:offerId/confirm`                | Owner confirms, moving reserved need capacity to solved capacity                            |
| POST   | `/api/v1/offers/:offerId/dispute`                | Owner records a 10–2000 character dispute reason without impact                             |
| GET    | `/api/v1/impact`                                 | Public number of fully solved requests                                                      |
| GET    | `/api/v1/impact/users/:userId`                   | Public, active user's verified problems/hours/items/skills aggregates                       |

Upload uses `application/octet-stream` with URI-encoded `X-Evidence-Name` and canonical `X-Evidence-Mime-Type`. Allowed types are JPEG, PNG, WebP, and PDF, up to 5 MB per file. The server validates the bytes as well as claimed metadata and rechecks S3 object metadata when the helper attaches the upload IDs. No bucket key or permanent object URL is serialized. The download returns bytes rather than the JSON envelope, with `Content-Disposition: attachment`, `Cache-Control: private, no-store`, and `X-Content-Type-Options: nosniff`.

`actualMinutes` applies only to skill/time help; item/money submissions supplying it are rejected. Confirmation requires `Idempotency-Key`; a valid replay returns its stored original offer/evidence result. A new key cannot confirm an already-completed offer twice because the transition is guarded. Completion and dispute responses are private participant DTOs. Public impact returns only aggregates from solved requests, completed offers, and confirmed evidence; it never accepts client impact values. See [Phase 7](phase-7-completion.md) for metric definitions and storage configuration.

## Notifications

Phase 8 adds authenticated `GET /api/v1/notifications` with `limit`, an opaque cursor, and `unreadOnly=true|false`; `GET /api/v1/notifications/unread-count`; `POST /api/v1/notifications/:notificationId/read`; and `POST /api/v1/notifications/read-all`. Both POST routes take an empty JSON body. The principal comes only from the active bearer session, not a request field. Individual reads return the current safe notification DTO, including read time; read-all returns a modified count. Another user's notification ID is indistinguishable from a nonexistent one (`404 NOTIFICATION_NOT_FOUND`).

Notification kinds and resource types are canonical allowlists. DTOs expose only type, resource IDs needed for navigation, creation time, and read time; they never include private message/evidence/review text or an event deduplication key. Socket.IO events contain only a notification ID (or an empty read-all hint) and are delivered only to the server-derived account room. See [Phase 8](phase-8-notifications.md) for source events, retention, and delivery limits.

## Platform donations

Phase 10 adds a separate, platform-only payment surface:

| Method | Route                                        | Authentication              | Purpose                                                                        |
| ------ | -------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| POST   | `/api/v1/platform-donations/checkout`        | Bearer + `Idempotency-Key`  | Create/replay an authenticated hosted checkout for strict integer PHP centavos |
| GET    | `/api/v1/platform-donations/me`              | Bearer                      | Read only the principal's mode-scoped donation history with a scoped cursor    |
| GET    | `/api/v1/admin/platform-donations/dashboard` | Admin                       | Read audited operational totals and minimized recent records                   |
| POST   | `/api/v1/webhooks/paymongo`                  | Provider HMAC over raw JSON | Advance verified payment/refund state idempotently                             |

The success/cancel URL is not payment authority. No API accepts `status`, donor ID, provider IDs, currency, purpose, refund amount, recipient, or payout destination from a client. `201` means a checkout was prepared, not that payment occurred; an idempotent checkout replay returns `200`. Webhook acknowledgement returns `200` for processed, ignored, or duplicate authentic events and rejects unauthentic/malformed events. See [Phase 10](phase-10-platform-donations.md).

## Reporting and safety

Phase 11 adds authenticated reports at `/reports/users/:userId`,
`/reports/requests/:requestId`, and the existing
`/messages/:messageId/report`; member-owned blocks at `/blocks`; and
moderator/admin operations below `/admin/safety`. Reports accept only an
enumerated reason and optional bounded context. They never accept reporter,
target owner, assignment, status, resolution, or account-action fields.

Phase 13 extends the same report contract to
`/reports/giveaway-items/:itemId`, and Phase 14 adds
`/reports/community-missions/:missionId`. Moderator evidence contains only the
privacy-minimized public listing or reviewed mission and remains claim-scoped
and audited.

Moderator evidence access requires an unexpired claim owned by that reviewer.
Message evidence contains exactly one reported message. Suspension and
reinstatement routes are admin-only explicit operations and never general user
patches. Bounded list routes use filter-scoped opaque cursors. See
[Phase 11](phase-11-reporting-safety.md).

## Free items

Phase 13 adds a no-price item-to-need workflow:

| Method | Route                                                  | Authentication            | Purpose                                                  |
| ------ | ------------------------------------------------------ | ------------------------- | -------------------------------------------------------- |
| GET    | `/api/v1/giveaway-items`                               | Public                    | List currently available items                           |
| POST   | `/api/v1/giveaway-items`                               | Bearer + idempotency      | Create a free listing                                    |
| GET    | `/api/v1/giveaway-items/mine`                          | Bearer                    | List owned listings                                      |
| GET    | `/api/v1/giveaway-items/:itemId`                       | Optional bearer           | Read an owner or public item DTO                         |
| GET    | `/api/v1/giveaway-items/:itemId/matches`               | Listing owner             | Match an available item to open same-category item needs |
| POST   | `/api/v1/giveaway-items/:itemId/reservations`          | Bearer + idempotency      | Reserve item and request capacity                        |
| POST   | `/api/v1/giveaway-items/:itemId/remove`                | Listing owner             | Remove an available listing without active reservations  |
| GET    | `/api/v1/giveaway-reservations/mine`                   | Participant bearer        | List donor and recipient handoffs                        |
| POST   | `/api/v1/giveaway-reservations/:reservationId/confirm` | Participant + idempotency | Record independent handoff confirmation                  |
| POST   | `/api/v1/giveaway-reservations/:reservationId/cancel`  | Participant bearer        | Cancel before either confirmation                        |

Listing creation accepts bounded description, exact category, condition,
quantity, and a private location from which the server derives city/province.
Reservation accepts only a request ID, need-item ID, and quantity. The server
derives all identities, statuses, counters, matches, notifications, and impact;
price and payment fields are not part of either contract.

Reservation requires a published or partially solved public request owned by
the recipient, an open `item` need with the same normalized category, active
unblocked participants, and available capacity on both aggregates. The listing,
request, and reservation are updated in one transaction. A handoff completes
only after donor and recipient confirmation, when reserved counters move to
given/solved counters atomically. See [Phase 13](phase-13-free-items.md).

## Community missions

Phase 14 adds a human-reviewed, resource-scoped volunteer workflow:

| Method | Route                                                         | Authentication            | Purpose                                              |
| ------ | ------------------------------------------------------------- | ------------------------- | ---------------------------------------------------- |
| GET    | `/api/v1/community-missions`                                  | Public                    | List reviewed public missions                        |
| POST   | `/api/v1/community-missions`                                  | Bearer + idempotency      | Create a private mission draft                       |
| GET    | `/api/v1/community-missions/matches`                          | Bearer                    | Match saved skills/coarse location to open resources |
| GET    | `/api/v1/community-missions/mine`                             | Bearer                    | List the creator's missions                          |
| GET    | `/api/v1/community-missions/:missionId`                       | Optional bearer           | Read the owner or public DTO                         |
| PATCH  | `/api/v1/community-missions/:missionId`                       | Creator                   | Edit a draft or changes-requested mission            |
| POST   | `/api/v1/community-missions/:missionId/submit`                | Creator                   | Submit the mission for human review                  |
| POST   | `/api/v1/community-missions/:missionId/cancel`                | Creator                   | Cancel eligible work and release reservations        |
| POST   | `/api/v1/community-missions/:missionId/contributions`         | Bearer + idempotency      | Offer quantity against one resource                  |
| GET    | `/api/v1/community-missions/:missionId/contributions`         | Creator                   | List private proposals for the mission               |
| GET    | `/api/v1/mission-contributions/mine`                          | Participant               | List the principal's contribution workflow           |
| POST   | `/api/v1/mission-contributions/:id/accept`                    | Creator + idempotency     | Reserve exact resource capacity                      |
| POST   | `/api/v1/mission-contributions/:id/reject`                    | Creator                   | Reject a pending proposal                            |
| POST   | `/api/v1/mission-contributions/:id/withdraw`                  | Contributor               | Withdraw a pending proposal                          |
| POST   | `/api/v1/mission-contributions/:id/start`                     | Contributor               | Start accepted work                                  |
| POST   | `/api/v1/mission-contributions/:id/complete`                  | Contributor + idempotency | Submit completion details                            |
| POST   | `/api/v1/mission-contributions/:id/confirm`                   | Creator + idempotency     | Confirm work and fulfill capacity atomically         |
| GET    | `/api/v1/admin/community-missions`                            | Moderator/admin           | List the oldest pending mission reviews              |
| POST   | `/api/v1/admin/community-missions/:missionId/approve`         | Moderator/admin           | Verify and publish a pending mission                 |
| POST   | `/api/v1/admin/community-missions/:missionId/reject`          | Moderator/admin           | Reject a pending mission                             |
| POST   | `/api/v1/admin/community-missions/:missionId/request-changes` | Moderator/admin           | Return a pending mission with bounded notes          |

Mission writes accept only bounded mission content, private location/evidence,
typed resource data, or the narrow contribution payload for the operation. The
server derives creator, contributor, public location, verification, status,
counters, transitions, notifications, and impact. Public mission DTOs omit
evidence, barangay, moderation notes, and all private contribution content. See
[Phase 14](phase-14-community-missions.md).

## Pagination, filtering, and sorting

Collections never return an unbounded result set. Cursor pagination is preferred:

```text
GET /api/v1/requests?limit=20&cursor=<opaque>&category=digital_alalay
```

- Default `limit` is 20; the maximum is 50.
- Cursors are opaque, validated, and tied to a deterministic sort with a unique tiebreaker.
- Responses place `items` and `pageInfo` inside `data`.
- Filters and sort options are allowlisted and use supported database indexes.
- Public search never loads an entire collection for application-side filtering or distance calculation.

Example:

```json
{
  "success": true,
  "data": {
    "items": [],
    "pageInfo": {
      "nextCursor": null,
      "hasNextPage": false
    }
  }
}
```

## Idempotency and concurrency

Retry-prone mutations accept `Idempotency-Key`. Keys are scoped to the authenticated principal, operation, and normalized request payload, stored with an expiry, and return the original result on a valid replay. Reusing a key with a different payload returns `409`.

Phase 5 introduces the persisted implementation for offer acceptance. Phase 13 applies the same persisted boundary to giveaway creation, reservation, and participant confirmation. Phase 14 applies it to mission creation, contribution creation/acceptance, completion submission, and creator confirmation. Keys and normalized payloads are SHA-256 hashed at rest; response snapshots and hashes are excluded from normal model selection. Resource-state checks independently prevent double reservation if a process fails between the transactional business mutation and recording its replay response.

## Optional AI request structuring

Phase 15 adds one authenticated, user-rate-limited endpoint:

- `POST /api/v1/ai/request-structure`

The strict body contains only `description` (20–2,000 characters) and literal
`consent: true`. The server rejects unexpected fields, prohibited or emergency
content, and descriptions left without enough meaningful text after redaction.
The successful data envelope contains `suggestion`, `redactions`, and a
disclaimer. A suggestion is limited to title, description, category, help
types, simple need items, required skills, and follow-up questions. It does not
contain identity, location, dates, urgency, quantities, prices, eligibility,
moderation, payment, or fraud decisions.

The operation never creates or updates a help request. Provider failure,
refusal, malformed output, or unsafe output returns a generic 503 response;
provider response bodies and identifiers are not exposed. The established
`POST /requests`, `PATCH /requests/:id`, and submit/moderation operations remain
the only path to request workflow state.

Provider webhooks are deduplicated by a unique provider event ID and processed transactionally. Out-of-order events may advance only through a valid transition. Duplicate acceptance or completion confirmation must return the already-established result or a deterministic conflict without double-counting quantities or impact.

## DTO and data conventions

- JSON field names are `camelCase`; enum values use the exact canonical strings in `server/src/constants/statuses.js`.
- IDs are strings in API responses.
- Timestamps are UTC ISO 8601 strings.
- Money uses integer minor units in persistence and APIs (for PHP, centavos). Display formatting belongs in the client.
- Coordinates, barangay, email, phone, moderation notes, document keys, and private evidence are excluded from public serializers.
- Empty optional fields are either consistently omitted or returned as `null` per DTO; accidental Mongoose shape is never the contract.

## Validation and errors

Validation covers path params, query, body, content type, maximum lengths, nested shape, and allowed enum values. Distinguish stable machine-readable error codes from user-facing copy. Initial codes include:

```text
AUTH_REQUIRED
FORBIDDEN
VALIDATION_ERROR
REQUEST_NOT_FOUND
REQUEST_NOT_AVAILABLE
OFFER_ALREADY_RESOLVED
INSUFFICIENT_REMAINING_NEED
IDEMPOTENCY_KEY_REQUIRED
IDEMPOTENCY_KEY_REUSED
IDEMPOTENCY_IN_PROGRESS
RATE_LIMITED
PAYMENT_VERIFICATION_FAILED
```

Add a code only when a client can handle it meaningfully. Central error middleware is the only layer that formats errors.

## Initial route groups

The planned MVP groups are `auth`, `users`, `requests`, `offers`, `conversations`, `notifications`, `verifications`, `reports`, `platform-donations`, `giveaway-items`, `giveaway-reservations`, `webhooks`, and `admin`. Routes are introduced only in their assigned development phase; later listed groups are not implied to be currently implemented.
