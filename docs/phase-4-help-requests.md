# Phase 4 — Help requests

## Delivered scope

Phase 4 implements the complete request lifecycle before assistance offers:

- authenticated private draft creation and owner-only editing;
- concrete money, item, skill, and time need items;
- server-side submission completeness and configurable estimated-value limits;
- moderation submission, requested changes, rejection, and publication;
- bounded public, owner, and moderation listings;
- privacy-safe public request details;
- moderator/admin review UI and transactional append-only audit records;
- deterministic prohibited-content and emergency-language screening for human review;
- responsive Expo Router screens for Android, iOS, and web.

Offers, conversations, completion, impact, direct recipient payments, uploads, and verification documents remain outside this phase.

## Persistence

`HelpRequest` stores owner identity, bounded text, category, selected help types, public visibility, urgency, private location, server-derived public location, needed-by time, integer-centavo estimates, embedded need items, required skills, moderation state, verification requirements, safety flags, and lifecycle timestamps.

Need-item estimates represent the estimated total for that line, not a payment or account balance. The request total is calculated from need-item estimates by the service; clients cannot assign it. `solvedQuantity`, safety flags, moderation fields, publication timestamps, and request status are also server-owned.

Indexes support:

- owner history by `ownerId`, `updatedAt`, and `_id`;
- public discovery by status/visibility and `publishedAt`/`_id`;
- oldest-first moderation review by status and submission time;
- public category, help-type, and urgency filtering without an application-side collection scan.

No exact coordinates are collected in Phase 4 because near-me search is not implemented. When that feature is introduced, private GeoJSON data and a `2dsphere` index must be added deliberately. Current public location is server-derived city/province only.

`AuditLog` records immutable actor, action, target, safe transition metadata, hashed IP, and creation time. Request moderation changes and audit creation run in one MongoDB transaction, so deployment requires a transaction-capable MongoDB topology such as Atlas or a replica set.

## State and authorization

- Only an active, verified session can create or manage its owner's requests.
- Only `draft` and `changes_requested` records can be edited or submitted.
- Submission validates the whole stored draft and conditionally moves it to `pending_review`.
- Owners can cancel eligible non-terminal requests through an explicit operation.
- Only current `moderator` and `admin` roles can access moderation routes.
- A moderator cannot review a request they own.
- Approve, reject, and request-changes operations conditionally update only `pending_review` records, preventing stale or duplicate decisions.
- Rejection and requested changes require specific moderator notes; approval clears notes.
- Public reads allow only `published`, `partially_solved`, and `solved` details, while public listings include only active `published`/`partially_solved` records.

The request-owner account must still be active for a request to serialize publicly. A suspended or disabled owner's public request is concealed.

## Submission policy

Before moderation, a request needs:

- a title of at least 10 characters;
- a description of at least 50 characters explaining the problem and finish line;
- a category and at least one selected help type;
- at least one concrete need item and a matching item for every selected help type;
- a specific need-item name and explanatory description;
- a positive estimate for money and item needs;
- a future needed-by date;
- city and province;
- a total estimate no greater than `MAX_REQUEST_ESTIMATED_VALUE_CENTAVOS`;
- no more than `MAX_REQUEST_NEED_ITEMS` need items.

Defaults are PHP 10,000 (`1000000` centavos) and 20 need items. These are deployment configuration, not client authority.

Screening flags obvious patterns involving vague cash, credentials/OTP, gambling, weapons, illegal goods, drugs, sexual services, account selling, investment schemes, loan-sharking, suspicious cryptocurrency, illegal behavior, immediate danger, medical emergencies, self-harm, or violence. Flags remain private to authorized reviewers and are explicitly advisory. Emergency-like content returns guidance that the community request system is not emergency support.

## API and client surfaces

The API routes and DTO rules are listed in [API conventions](api-conventions.md). Client routes added in this phase are:

- `/requests` — public reviewed-request discovery;
- `/request-details?requestId=…` — public request details;
- `/my-requests` — private owner history and moderation status;
- `/request-editor?requestId=…` — create, edit, preview, save, and submit;
- `/admin/requests` — restricted pending-review queue and decisions.

Query-parameter detail/editor routes allow Expo static web export without pretending that an arbitrary database ID is known at build time.

## Verification performed

- 17 server test files and 90 tests passed after Phase 4 implementation.
- Tests cover validation, private draft visibility, mass-assignment rejection, owner DTO access, incomplete submission, role enforcement, self-review prevention, requested-changes resubmission, safety screening, audit creation, public privacy, and filter-scoped cursor pagination.
- Expo SDK 57 dependency alignment passed with `expo install --check`.
- Static web export passed for all 15 routes.
- Android and iOS Hermes production exports passed.

## Known limitations

- Tests use in-memory repositories; no live MongoDB Atlas transaction or index build was exercised locally.
- Screening is deterministic and intentionally limited. It supports human review and is not a comprehensive abuse detector.
- There is no moderation history endpoint or audit-log dashboard yet; the append-only records exist for later authorized tooling.
- No evidence upload is collected. Private storage and evidence workflows belong to later verification/completion phases.
- No coordinates or near-me search are implemented.
- Categories are normalized identifiers; deployment-managed category administration is not implemented.
- Offers and reservation progress were intentionally deferred from this phase and are documented separately in [Phase 5 — Offers](phase-5-offers.md).
