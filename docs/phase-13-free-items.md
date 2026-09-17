# Phase 13 — “Things I Don't Need” free items

## Delivered scope

Phase 13 adds a free-item workflow that connects an owned giveaway listing to
an existing, reviewed item need. An active member can list an item at no cost,
filter public listings, inspect deterministic matches for a listing they own,
reserve available quantity against one of their own open requests, and record a
handoff. There is no price, checkout, recipient payment, wallet, payout, or
marketplace sale.

The donor and recipient must confirm the same handoff independently. Until both
confirm, inventory remains reserved and public impact remains unchanged. The
second confirmation atomically moves the reserved quantity to given/solved
counters, recalculates the request status, and makes the completed handoff
eligible for server-derived impact.

## State and counter model

`GiveawayItem` stores owner, bounded item details, condition, category, total,
reserved and given quantities, private pickup location, derived public
city/province, and lifecycle timestamps. Public inventory is available only
while `quantity - reservedQuantity - givenQuantity` is positive.

`GiveawayReservation` binds exactly one item, donor, recipient, published item
need, and positive quantity. Its active unique key prevents the same recipient
from reserving the same listing against the same need twice. Confirmation
timestamps are participant-specific; neither is client-selectable.

The item lifecycle is:

- `available` while at least one unit remains unreserved and ungiven;
- `reserved` while all remaining units are held by active reservations;
- `given` after all units are confirmed as transferred; and
- `removed` after the owner removes an available listing with no active hold.

The reservation lifecycle is `reserved` to either `completed` or `cancelled`.
Either participant may cancel only before confirmation starts. Cancelling an
untouched reservation releases both listing and request counters. Cancelling a
request does the same transactionally. Once either party confirms, participant
cancellation and request cancellation are blocked so an in-progress handoff
cannot silently discard the other party's confirmation.

## Matching contract

The listing owner can request matches for an available listing. Matches are
published or partially solved public requests owned by active accounts, with an
open item need whose normalized category exactly equals the listing category.
The listing owner's own requests and blocked relationships are excluded.
Results use deterministic oldest-publication order with request ID as the
tiebreaker and the existing privacy-minimized request identity/location
surface. There is no AI, engagement score, inferred compatibility, GPS, or
sensitive-trait ranking.

## API surface

| Method | Route                                                  | Authentication            | Purpose                                                   |
| ------ | ------------------------------------------------------ | ------------------------- | --------------------------------------------------------- |
| GET    | `/api/v1/giveaway-items`                               | Public                    | List available free items with bounded cursor pagination  |
| POST   | `/api/v1/giveaway-items`                               | Bearer + idempotency      | Create a free listing                                     |
| GET    | `/api/v1/giveaway-items/mine`                          | Bearer                    | List the owner's listings and private inventory state     |
| GET    | `/api/v1/giveaway-items/:itemId`                       | Optional bearer           | Read an owner DTO or privacy-minimized public DTO         |
| GET    | `/api/v1/giveaway-items/:itemId/matches`               | Listing owner             | Find open same-category item needs                        |
| POST   | `/api/v1/giveaway-items/:itemId/reservations`          | Bearer + idempotency      | Reserve quantity against the recipient's reviewed request |
| POST   | `/api/v1/giveaway-items/:itemId/remove`                | Listing owner             | Remove an eligible unreserved listing                     |
| GET    | `/api/v1/giveaway-reservations/mine`                   | Participant bearer        | List the principal's donor and recipient handoffs         |
| POST   | `/api/v1/giveaway-reservations/:reservationId/confirm` | Participant + idempotency | Record one participant confirmation                       |
| POST   | `/api/v1/giveaway-reservations/:reservationId/cancel`  | Participant bearer        | Cancel before either confirmation                         |
| POST   | `/api/v1/reports/giveaway-items/:itemId`               | Bearer                    | Report a public giveaway listing                          |

Create, reserve, and confirm bind validated `Idempotency-Key` values to the
principal, operation, and normalized payload. Pagination cursors are scoped to
their filters and deterministic sort. Mutation bodies are strict and never
accept owner/participant IDs, status, price, counters, timestamps, public
location, impact totals, or internal keys.

## Client surface

The responsive client adds free-item discovery, listing creation, listing
details and owner matches, owned listings, and a participant handoff inbox.
Safety copy advises a public handoff location, inspection before acceptance,
and independent confirmation only after the physical transfer. Existing
notifications deep-link giveaway events to the handoff inbox, and public
listings can be reported through the Phase 11 safety flow.

## Security and privacy

- The workflow requires active accounts for every mutation and rechecks donor,
  recipient, request owner, request state, need type, block state, inventory,
  and request capacity inside transactional writes.
- Public item DTOs expose only minimized owner identity and city/province.
  Barangay, country detail, internal counters/keys, and photo storage keys are
  omitted. The owner surface keeps the full submitted location private.
- Prohibited item text is rejected by the existing deterministic safety
  screening before persistence. A giveaway report reveals only the already
  public listing to the moderator who owns an unexpired claim.
- Reservation and completion update listing, request, reservation, and
  notification state atomically. Conditional writes protect the final unit
  from over-reservation.
- Pending reservations and one-sided confirmations create no impact. Only a
  completed two-party handoff contributes confirmed item quantity; a donor's
  solved-problem total changes only when the linked request is fully solved.
- Money fields and payment operations do not exist on the giveaway contract.

## Operational notes and limitations

Production disables automatic index creation. After backup and review, an
operator must run `npm run db:index:giveaways` against the intended database to
create the public discovery, owner, participant, request-status, and active
reservation indexes. This command was not run against a live database during
development.

No package or lockfile changed. Photos remain intentionally unavailable until
a public-image consent, metadata stripping, scanning, storage, and moderation
policy exists. Matching is exact-category only and city/province is free-form;
there is no semantic match, distance calculation, delivery coordination, or
in-workflow chat. Reservations do not expire automatically, so operational
monitoring and an audited stale-reservation policy are still needed before
production scale.
