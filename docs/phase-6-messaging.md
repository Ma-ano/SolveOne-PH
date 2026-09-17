# Phase 6 — Messaging

Phase 6 adds private coordination only after a request owner accepts a helper's offer. It does not create an unrestricted user-to-user chat system.

## Relationship and persistence

- Acceptance creates one `Conversation` per `HelpOffer` inside the same MongoDB transaction as the offer transition and request reservation. The conversation has exactly the request owner and offer helper as immutable participants. Repeated acceptance or a pre-existing accepted offer can upsert the missing conversation without another reservation.
- Owner request cancellation closes associated conversations in the same transaction that cancels offers and releases reservations. Historical messages remain participant-readable, but new messages and realtime joins stop.
- `Message` records store an immutable conversation/sender relationship, bounded content, client-generated retry identifier, timestamps, and private deterministic safety flags. The unique `(senderId, clientMessageId)` index prevents a network retry from making two messages. MongoDB commits before Socket.IO broadcasts an identifier-only event.
- Embedded conversation read states track each participant's last read-through message and its creation time. Read writes do not regress to an older message; unread counts exclude the reader's own messages.
- `Report` records target the selected message and reporter, with a unique active key to suppress repeat spam. Ordinary participants can report another participant's message. No general moderator message-reading route is introduced in this phase.

## API

All routes use bearer authentication and the standard response envelope.

| Method | Route                                            | Purpose                                                                     |
| ------ | ------------------------------------------------ | --------------------------------------------------------------------------- |
| GET    | `/api/v1/conversations`                          | List only the current participant's conversations, newest activity first    |
| GET    | `/api/v1/conversations/:conversationId`          | Read one participant conversation                                           |
| GET    | `/api/v1/conversations/:conversationId/messages` | Read newest-first messages with an older-page cursor                        |
| POST   | `/api/v1/conversations/:conversationId/messages` | Send text with `{ type: "text", content, clientMessageId }`                 |
| POST   | `/api/v1/conversations/:conversationId/read`     | Mark read through `{ messageId }`                                           |
| POST   | `/api/v1/messages/:messageId/report`             | Report another participant's message with a reason and optional description |

Collection limits default to 20 and max out at 50. Cursors are scope-bound and deterministic. A send succeeds with `201`, or `200` when the same sender/client identifier and content are replayed. Reusing an identifier for different content yields `409 CLIENT_MESSAGE_ID_REUSED`. The sender derives from authentication, never request body fields. Image/system types are model-reserved but cannot be sent through this API without a later authorized upload/system workflow.

The accepted-offer operation remains `POST /api/v1/offers/:offerId/accept` and still requires its persisted `Idempotency-Key`. It now also commits a conversation; the response shape remains the Phase 5 offer DTO. Both participants find the conversation in their private inbox.

## Realtime

Socket.IO runs on the API HTTP server. Its handshake authenticates a short-lived access token from `auth.token`, confirms the active database session/account, and joins a derived `user:{userId}` room. `conversation:join` accepts only a strict `{ conversationId }` payload and rechecks current authentication, participant membership, active conversation, offer/request eligibility, account states, and both block directions before deriving `conversation:{conversationId}` from the server-loaded canonical ID. Tokens disconnect at expiry and active sessions are rechecked every 30 seconds; clients reconnect after access-token rotation.

Server events are `message:created` (`conversationId`, `messageId` only), `conversation:updated` (same identifiers to participant user rooms), and `conversation:read` (read state). The client refetches MongoDB-backed HTTP records on these signals. Realtime delivery is best-effort, not a second copy of the data. A disconnected client can read persisted messages when it returns.

## Safety and privacy

- The `digital_alalay` request category triggers a prominent, persistent chat warning: never share passwords, OTPs, banking/ATM PINs, CVVs, recovery codes, seed phrases, or private keys. This is the lowercase persisted identifier for the product's Digital Alalay category.
- Text patterns flag likely credential requests, suspicious external payment solicitation, harassment, and repeated Philippine phone-number spam. Flags are private model fields; participant DTOs expose only a caution indicator and guidance. Screening is advisory and must not be treated as complete abuse detection or an automatic moderator grant.
- Public requests/profiles never include messages. The chat DTO shows only first-name/last-initial display identities and request context, not email, barangay, exact location, token, attachment key, or private moderation notes.
- Blocks prevent new messages and joins with a generic unavailable/not-found response that does not reveal who blocked whom. Reporting stores an authorized pointer to the selected message; later moderator access must be report-scoped and audited.
- Sending has a separate authenticated-sender rate limit (`MESSAGE_RATE_LIMIT_WINDOW_MS=60000`, `MESSAGE_RATE_LIMIT_MAX=60` by default). Socket payloads and HTTP mutations are strict, bounded contracts.

## Client

`/conversations` lists accepted-offer chats and unread counts; `/conversation?conversationId=…` loads persisted messages, offers text send/read-through/report actions, and joins the authorized socket room for refetch signals. A failed or timed-out send keeps its client message identifier for a same-content retry. Message history and sending remain HTTP-backed even when realtime is unavailable. The home and offer screens link to the private inbox.

## Verification and limitations

The server suite has 24 files and 119 passing tests covering participant and moderator concealment, strict input, acceptance creation/deduplication, message retry and rate limits, safety flagging, block/cancellation checks, monotonic read state, report deduplication, persistence indexes, socket handshake/room authorization, identifier-only broadcasts, and server startup/shutdown. Expo SDK 57 dependency alignment passes. Final web, Android, and iOS production exports pass, including all 20 static routes.

The local tests use in-memory repositories and schema/index assertions, not a live MongoDB replica-set transaction or index build. Socket authorization is unit-tested, but a deployed cross-device Socket.IO exchange was not exercised. Session revocation of an already-connected socket is observed at its next action or periodic recheck (up to 30 seconds); expiry disconnects immediately. Chat image uploads, message editing/deletion, moderator report triage/access auditing, user block controls, and notifications remain later-phase work. Phase 7 adds separate private offer-completion proof files; it does not enable chat image messages. Safety pattern matching is intentionally heuristic and can miss or overflag content.

Implementation aligns with [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo Router 57](https://docs.expo.dev/versions/v57.0.0/sdk/router/), and the [Socket.IO 4 server](https://socket.io/docs/v4/server-api/) and [client](https://socket.io/docs/v4/client-api/) APIs.
