# Phase 5 — Offers

## Delivered scope

Phase 5 implements the assistance commitment workflow before messaging and completion:

- an `I can help` action for every unfilled public need item;
- strict money, item, skill, and time offer forms;
- private helper history and request-owner offer inboxes;
- owner accept/reject operations;
- helper withdraw/start operations;
- atomic quantity or centavo reservation when an offer is accepted;
- aggregate committed and remaining progress on request DTOs;
- request cancellation that releases reservations and cancels active offers;
- persisted replay-safe acceptance using `Idempotency-Key`;
- endpoint-specific offer-creation rate limiting;
- block enforcement substrate without exposing who blocked whom.

Messaging, completion submission/confirmation, evidence, disputes, notifications, wallets, recipient transfers, and public impact remain outside this phase.

## Persistence

`HelpOffer` stores immutable request/helper/need relationships, help type, bounded message, type-specific commitment fields, canonical status, lifecycle timestamps, and an internal `activeKey`. Money uses integer `pledgedValueCentavos`; item/skill/time use integer `quantity`; skill/time also record bounded `estimatedMinutes`.

The partial unique `activeKey` index allows at most one non-terminal offer by a helper for the same request need. Reject/withdraw/request-cancel unsets the key so a later new offer is possible. Indexes also support request/status and helper/creation-time listings.

Each embedded `HelpRequest.needItems` record now has separate server-owned counters:

- `reservedQuantity` and `solvedQuantity` for item, skill, and time units;
- `reservedValueCentavos` and `solvedValueCentavos` for money needs.

Serializers derive non-negative remaining values. Acceptance updates only a reservation counter. Phase 7 confirmation will move reserved capacity to solved capacity and will be the only workflow authority for `partially_solved`/`solved` and impact.

`IdempotencyRecord` stores SHA-256 key/payload hashes, operation/principal scope, in-progress/completed state, the original successful response, and expiry. A unique compound index deduplicates the scope and a TTL index expires records. Key/hash/response fields are excluded from normal selection.

`UserBlock` provides directional, uniquely indexed block relationships and a reverse lookup used by offer policy. This phase deliberately does not expose block-management endpoints or UI.

Existing request documents do not require an immediate blocking migration: serializers treat missing counters as zero, acceptance compare-and-set filters match missing/zero counters, and the model applies defaults when documents are newly written. A controlled backfill may still be useful before high-volume production rollout for uniform raw records.

## Concurrency and state

The Phase 5 transitions are:

- `pending` → `accepted` by the request owner;
- `pending` → `rejected` by the request owner;
- `pending` → `withdrawn` by the helper;
- `accepted` → `in_progress` by the helper;
- eligible active offers → `cancelled` when their request is cancelled.

Accepting loads the offer and owned open request in one MongoDB transaction, rechecks active requester/helper accounts and both block directions, validates the matching need, and calculates capacity. The write increments the exact reservation counter only when the stored reservation/solved counters still equal the values read by the transaction. A competing final-unit write conflicts/retries or returns `INSUFFICIENT_REMAINING_NEED`. Updating the offer and request is all-or-nothing.

Repeated acceptance with the same idempotency key returns its stored original representation. Reusing a key for another offer conflicts. Resource-state idempotency also makes duplicate acceptance/start safe without incrementing twice. A failed business operation releases its in-progress idempotency claim so a corrected retry can proceed.

Owner cancellation runs in a transaction with active-offer lookup, reservation release, request cancellation, and offer cancellation. It cannot race acceptance into an orphaned reservation.

Creation also conditionally writes the open request in its transaction before inserting the offer. Because cancellation and later request-progress operations write that same aggregate, a concurrent creation cannot appear after cancellation from an older read.

## Authorization and privacy

- Only an active authenticated user can create or manage an offer.
- A request owner cannot offer to their own request.
- Offers can target only a concrete matching need on a public open request.
- The request owner alone lists and decides offers made to that request.
- The helper alone withdraws or starts their offer.
- Both sides' account and block state are rechecked when accepting/starting.
- Missing and unauthorized offer/request relationships use concealed not-found responses where appropriate.
- Blocked interactions return generic request unavailability.
- Offer collection/detail DTOs include only minimized display identity, factual verification level, and necessary request/need context.
- Public request DTOs expose only aggregate commitments, never helper identity or negotiation text.

Money assistance is always labeled `MONETARY_PLEDGE`. No payment method, wallet balance, recipient payout, escrow, transfer instruction, or transaction is accepted or returned.

## API and client surfaces

The exact routes and field rules are listed in [API conventions](api-conventions.md). Client routes added in this phase are:

- `/offer-create?requestId=…&needItemId=…` — type-specific private offer form;
- `/my-offers` — helper history with withdraw/start operations;
- `/request-offers?requestId=…` — private owner inbox with accept/reject operations.

The home screen, public request details, and owner request list link into these workflows. Query-parameter detail routes remain compatible with Expo Router static web export.

## Configuration

- `OFFER_RATE_LIMIT_WINDOW_MS` defaults to one hour.
- `OFFER_RATE_LIMIT_MAX` defaults to 20 offer creations per limiter key/window.
- `IDEMPOTENCY_TTL_HOURS` defaults to 24 and is bounded to 1–168 hours.

Production continues to require a transaction-capable MongoDB topology such as Atlas or a replica set.

## Verification performed

- 19 server test files and 102 tests pass.
- Offer API tests cover strict/mass-assignment validation, self-offer prevention, participant-only lists, concealed ownership, typed money pledges, block rechecks, creation rate limiting, duplicate active offers, reject/withdraw/start state rules, request cancellation cleanup, and request progress DTOs.
- Duplicate acceptance/start tests prove no repeated reservation; idempotency replay returns the original accepted response even after the live offer advances.
- A competing-helper API test accepts only one offer for the final unit and returns `INSUFFICIENT_REMAINING_NEED` for the loser.
- Persistence tests cover offer, block, request counter, idempotency unique, and TTL indexes.
- Expo SDK 57 dependency alignment passes with `expo install --check`.
- Static web export passes for all 18 routes.
- Android and iOS Hermes production exports pass.

## Known limitations

- Tests use concurrency-aware in-memory repositories; a live MongoDB replica-set transaction, write-conflict retry, TTL deletion, and production index build were not exercised locally.
- Block records are enforced if present, but user block/unblock API and UI belong to a later safety phase.
- Phase 7 now adds completion evidence, owner confirmation/dispute, and the reserved-to-solved transition; Phase 5 acceptance rules remain unchanged.
- Phase 6 now creates a private conversation transactionally when an offer is accepted; Phase 5 offer and reservation rules are unchanged.
- Notifications and email events for offer changes are not implemented yet.
- Money assistance is a pledge record only; the product does not move recipient funds.
- No public offer count is exposed. Only aggregate accepted commitment is public, which avoids leaking pending negotiation activity.
