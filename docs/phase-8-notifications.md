# Phase 8 — Private in-app notifications

Notifications help people notice concrete request, offer, completion, and conversation updates. They are not a public activity feed, engagement score, or a substitute for the underlying request/offer/message records.

## Durable lifecycle

- `Notification` stores a recipient, canonical kind, resource type and ID, optional request ID for navigation, creation time, read time, a hidden deterministic event key, and an expiration time. It stores no message text, completion note, proof filename, recipient photograph, moderation note, or access token.
- The source mutation and notification insertion share one MongoDB transaction for offer creation/acceptance/rejection, completion submission/confirmation/dispute, moderator decisions, and new text messages. A unique event key prevents the same source event from creating two notification records. Message events use the unique message ID; moderation events use the audit ID, so a resubmitted request can receive another review notification without a key collision.
- Socket.IO publishes only `{ notificationId }` to the server-derived `user:{recipientId}` room after persistence. The recipient fetches current state through the authenticated API. A socket hint may be missed if a process stops after commit; reconnect invalidation and ordinary API reads recover the durable inbox. Socket.IO is not the notification database.
- Read time moves once from null to a server timestamp through a recipient-scoped conditional update. Retrying a read returns the current item and does not emit another read hint. `read-all` is also monotonic and affects only the authenticated recipient. The inbox has an unread count, an unread-only filter, and opaque recipient/filter-scoped cursor pagination (20 default, 50 maximum).
- A MongoDB TTL index expires notifications after 180 days, whether read or unread. This bounded retention period needs product/privacy review before deployment; TTL deletion is not instantaneous.

Production disables Mongoose `autoIndex`. Before enabling Phase 8 writes, an operator should review and back up any existing `notifications` collection, check for duplicate `eventKey` values, set `MONGODB_URI` for the intended deployment, and run `npm run db:index:notifications` from `server/`. The script creates/verifies only the declared notification indexes; it does not drop indexes or rewrite documents. Adding the TTL index may subsequently remove records already older than 180 days. This command was not run against a live database during development.

## Trigger coverage

The phase emits notifications for a new offer to the request owner; an accepted or rejected offer to the helper; submitted completion to the requester; confirmed or disputed completion to the helper; an approved, rejected, or changes-requested moderated request to its owner; and a newly persisted private text message to the other conversation participant. Sender-scoped message replay, duplicate completion submission, and already-established offer transitions do not create another notification.

There is no notification yet for starting assistance, withdrawing an offer, automatic cancellation of pending offers when a request becomes solved, or a future moderator dispute-resolution action. Those events can be added once their user-facing action and noise policy are specified.

## API and realtime

| Method | Route                                                       | Result                                                                            |
| ------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| GET    | `/api/v1/notifications?limit=20&cursor=...&unreadOnly=true` | Recipient-only `{ items, pageInfo }` with safe navigation IDs                     |
| GET    | `/api/v1/notifications/unread-count`                        | Recipient-only `{ unreadCount }`                                                  |
| POST   | `/api/v1/notifications/:notificationId/read`                | Empty body; current notification or indistinguishable `404` for another user's ID |
| POST   | `/api/v1/notifications/read-all`                            | Empty body; `{ modifiedCount }` for the authenticated account only                |

Realtime events are `notification:created` and `notification:read` with a notification ID, plus `notification:read-all` with an empty payload. Clients cannot request arbitrary notification room joins or send a notification event. The established socket handshake, access-token expiry, and periodic session rechecks remain in force.

## Client and verification

The responsive `/notifications` route offers unread/all views, count, pagination, manual refresh, mark-all-read, and clear read/unread labels. Opening an item first marks it read, then navigates to the appropriate existing request, offer, completion, or conversation surface. The global navigation displays the authenticated user's unread count. Socket hints and reconnects invalidate the TanStack Query inbox/count; no optimistic read or private-content payload is broadcast.

The backend suite has 28 passing files and 146 passing tests, including notification model indexes/expiry, an operator-run index entry point, safe serialization, event-key creation in a caller transaction, authenticated recipient boundaries, cursor scope, invalid input/mass assignment, read replay, read-all isolation, message replay, and ID-only realtime hints. Expo SDK 57 dependency validation passes. Android/iOS Hermes exports pass, and web static export renders 23 routes.

## Deployment limits

Tests use fakes and model inspection, not a live MongoDB replica-set transaction or a multi-device Socket.IO exchange. A production deployment with multiple API instances requires a shared Socket.IO adapter and compatible load-balancer session behavior; the current in-process room publisher is single-instance only. There is no transactional delivery outbox, so a socket hint can be lost after commit; the API inbox remains durable. Push delivery, notification preferences, quiet hours, digesting/noise controls, and physical-device UI checks are deferred. The client dependency audit still reports 14 moderate transitive advisories; no SDK-breaking forced fix was applied.

Realtime room design follows the [Socket.IO rooms guide](https://socket.io/docs/v4/rooms/); the mobile/web client stays on the [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) baseline.
