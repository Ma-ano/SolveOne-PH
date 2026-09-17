# Phase 14 — Community Missions

## Delivered scope

Phase 14 adds moderated community missions after the Phase 11 reporting and
blocking controls. An active member can create a private mission draft, break
it into concrete item, skill, or time resources, submit it for human review,
and manage volunteer contributions. Only a moderator-approved, verified
mission is public or eligible for contributions.

Volunteers can find missions using their saved skills and coarse profile
location, offer a specific quantity against one resource, start accepted work,
and submit a completion note. The mission creator must independently confirm
completion. Pending, accepted, started, and submitted work creates no public
impact.

## State and counter model

`CommunityMission` stores its creator, bounded title and description, category,
private submitted location, derived public city/province, one to twenty typed
resources, a private evidence note, moderation state, and lifecycle timestamps.
Each resource owns authoritative total, reserved, and fulfilled counters.

The mission lifecycle is:

- `draft` or `changes_requested` while the creator may edit it;
- `pending_review` after submission and before a human decision;
- `published` after approval and before accepted work;
- `in_progress` while accepted or completed contributions exist;
- `completed` only when every resource is fulfilled; and
- `cancelled` or `rejected` as terminal states.

Verification is separate from lifecycle state: `unverified` becomes `pending`
on submission, then a moderator sets `verified` or `rejected`. Public reads
require both a public lifecycle state and `verified`. Completed verified
missions remain publicly inspectable as an outcome record, but cannot receive
new contributions or appear in volunteer matching.

`MissionContribution` binds one contributor to one mission resource and stores
the proposed quantity, bounded message, duration where applicable, private
completion note, and transition timestamps. It moves from `pending` to
`accepted` or `rejected`; the contributor may withdraw while pending. Accepted
work moves through `in_progress` and `completion_submitted` to `completed` only
after creator confirmation. Mission cancellation changes eligible active
contributions to `cancelled` and releases their reservations. Cancellation is
blocked after completion has been submitted for review.

## Matching contract

Matching is authenticated, deterministic, and explainable. It uses only the
member's explicitly saved normalized skills and coarse city/province plus
oldest publication time and mission ID as the stable order. It excludes the
member's own missions, blocked relationships, inactive creators, unreviewed
missions, and missions without any unreserved resource capacity. A skill reason
is returned only when an open resource requires that skill.

There is no AI, engagement score, inferred trait, donation history, precise
distance, or automated eligibility decision. A match is an invitation to
inspect the mission, not an acceptance or verification decision.

## API surface

| Method | Route                                                         | Authentication            | Purpose                                              |
| ------ | ------------------------------------------------------------- | ------------------------- | ---------------------------------------------------- |
| GET    | `/api/v1/community-missions`                                  | Public                    | List reviewed public missions                        |
| POST   | `/api/v1/community-missions`                                  | Bearer + idempotency      | Create a private draft                               |
| GET    | `/api/v1/community-missions/matches`                          | Bearer                    | Match open resources to saved skills/coarse location |
| GET    | `/api/v1/community-missions/mine`                             | Bearer                    | List the creator's missions                          |
| GET    | `/api/v1/community-missions/:missionId`                       | Optional bearer           | Read an owner DTO or privacy-minimized public DTO    |
| PATCH  | `/api/v1/community-missions/:missionId`                       | Creator                   | Edit a draft or changes-requested mission            |
| POST   | `/api/v1/community-missions/:missionId/submit`                | Creator                   | Submit an editable mission for review                |
| POST   | `/api/v1/community-missions/:missionId/cancel`                | Creator                   | Cancel an eligible mission and release reservations  |
| POST   | `/api/v1/community-missions/:missionId/contributions`         | Bearer + idempotency      | Offer capacity against one open resource             |
| GET    | `/api/v1/community-missions/:missionId/contributions`         | Creator                   | List private contribution proposals for the mission  |
| GET    | `/api/v1/mission-contributions/mine`                          | Participant               | List the principal's contribution workflow           |
| POST   | `/api/v1/mission-contributions/:id/accept`                    | Creator + idempotency     | Atomically reserve resource capacity                 |
| POST   | `/api/v1/mission-contributions/:id/reject`                    | Creator                   | Reject a pending proposal                            |
| POST   | `/api/v1/mission-contributions/:id/withdraw`                  | Contributor               | Withdraw a pending proposal                          |
| POST   | `/api/v1/mission-contributions/:id/start`                     | Contributor               | Mark accepted work in progress                       |
| POST   | `/api/v1/mission-contributions/:id/complete`                  | Contributor + idempotency | Submit bounded completion details                    |
| POST   | `/api/v1/mission-contributions/:id/confirm`                   | Creator + idempotency     | Confirm completion and atomically fulfill capacity   |
| GET    | `/api/v1/admin/community-missions`                            | Moderator/admin           | Read the oldest submitted moderation queue           |
| POST   | `/api/v1/admin/community-missions/:missionId/approve`         | Moderator/admin           | Verify and publish a pending mission                 |
| POST   | `/api/v1/admin/community-missions/:missionId/reject`          | Moderator/admin           | Reject a pending mission                             |
| POST   | `/api/v1/admin/community-missions/:missionId/request-changes` | Moderator/admin           | Return a pending mission with bounded notes          |
| POST   | `/api/v1/reports/community-missions/:missionId`               | Bearer                    | Report a reviewed public mission                     |

Creation, contribution, acceptance, completion submission, and confirmation
bind `Idempotency-Key` to the principal, operation, and normalized payload.
Clients cannot set identities, review outcomes, status, verification, counters,
timestamps, public location, or impact.

## Client surface

The responsive Expo client adds public mission discovery and details, private
draft creation/editing, owned mission management, saved-profile matching,
creator contribution review, contributor workflow actions, and a moderator
queue. Mission reports use the Phase 11 safety surface; blocking from a mission
targets its creator. Notifications deep-link mission review and contribution
events to the relevant private inbox.

## Security and privacy

- Drafts, evidence notes, barangay, full submitted location, moderation notes,
  and contribution messages/completion notes never appear in public DTOs.
- Human approval is mandatory before publication. Review actions are
  claim-independent mission moderation decisions but are still recorded in the
  audit log with actor, action, target, timestamp, and hashed IP context.
- Every contribution transition rechecks authority, active account state,
  mission state, verified status, participant relationship, and directed block
  state. Generic not-found/conflict responses avoid disclosing blocks.
- Acceptance reserves exact embedded-resource capacity transactionally with a
  conditional mission version/counter update. Concurrent attempts cannot both
  claim the final unit.
- Creator confirmation atomically moves reserved quantity to fulfilled
  quantity and derives mission completion. Only confirmed contribution records
  feed public impact; one mission increments solved impact at most once when all
  resources are fulfilled.
- Reports expose only the already-public mission DTO to the moderator holding
  an unexpired Phase 11 report claim. Reporter identity and report evidence
  remain claim-scoped and audited.

## Operational notes and limitations

Production disables automatic index creation. After backup and review, an
operator must run `npm run db:index:missions` against the intended database to
create mission listing, owner, moderation, matching, contribution, and active
uniqueness indexes. This command was not run against a live database.

No package or lockfile changed. Evidence is note-only: image/file collection
awaits a consent, scanning, metadata-removal, retention, and moderation design.
Location remains normalized free-form city/province, not GPS distance. Matching
does not infer synonyms or availability and has no AI. Mission conversations,
scheduling, recurring work, contribution reassignment, automatic expiry, and a
dedicated completion-dispute resolution flow are not implemented. If a creator
disagrees with submitted completion, it remains submitted for direct resolution
or safety escalation; it creates no impact. Production enablement therefore
requires operational moderation review, abuse-response staffing, index rollout,
and policy/legal review for volunteer safety and organizer responsibility.
