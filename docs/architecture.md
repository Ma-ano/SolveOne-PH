# Architecture

## Purpose

This document defines the Phase 0 boundaries for SolveOne PH. The implementation should remain a modular monolith until measured scale or organizational constraints justify another deployment unit.

The architecture follows this priority order: correctness, reliability, security, performance, scalability, then maintainability.

## Product boundary

SolveOne PH coordinates small, concrete help. It is not a generic crowdfunding site, social network, resale marketplace, or stored-value wallet.

The first public MVP includes authentication, profiles, moderated help requests, discovery, item/skill/time offers, monetary pledges, offer acceptance, free-item listings and confirmed handoffs, private relationship-scoped messaging, completion confirmation, server-derived impact, notifications, reporting, blocking, and donations that support the platform.

The first MVP excludes direct recipient payment transfer, escrow, wallets, community missions, automated identity recognition, AI decisions, complex reputation scores, leaderboards, cryptocurrency, and resale. Phase 14 later adds community missions behind mandatory human moderation, explicit resource capacity, and creator-confirmed completion. Phase 15 adds optional request-writing suggestions but no AI decision authority and no dependency in ordinary workflows.

## Runtime components and trust boundaries

1. **Expo client:** Android, iOS, and responsive web user interface. It is an untrusted caller. Client-side validation improves usability but never grants permission or establishes financial, verification, completion, or impact truth.
2. **Express API:** the sole business-rule and authorization authority. It validates inputs, performs explicit state transitions, returns sanitized DTOs, and coordinates transactions.
3. **MongoDB Atlas:** the source of truth for accounts, sessions, workflow state, messages, notifications, audit records, idempotency records, and provider event records.
4. **Socket.IO:** authenticated delivery transport. A message is persisted or durably coordinated before it is broadcast. Room joins are derived from server authorization, never trusted from a client-supplied room ID.
5. **Private object storage:** holds evidence and verification documents under random keys. MongoDB stores only keys and metadata. Downloads use short-lived, authorized access.
6. **Email and payment providers:** isolated behind service adapters. Webhook authenticity and stored event IDs establish payment truth; a browser redirect does not.
7. **Optional AI provider:** receives only a sanitized user-authored description and pseudonymous safety identifier through a server adapter. Its output is untrusted, revalidated, shown as a preview, and never establishes workflow truth.

The API remains stateless between requests. Durable authentication and retry state belongs in MongoDB, not process memory.

## Repository layout

```text
SolveOne PH/
├── client/
│   ├── app/                 # Expo Router route files
│   ├── assets/              # Bundled public application assets
│   └── src/
│       ├── components/      # Reusable presentation components
│       ├── config/          # Validated public client configuration
│       ├── constants/       # Client-only constants; no authority rules
│       ├── features/        # Feature UI, forms, hooks, and local adapters
│       ├── hooks/           # Cross-feature client hooks
│       ├── providers/       # Root query, auth, and platform providers
│       ├── services/        # API, storage, realtime, and platform adapters
│       ├── store/           # Small client-only state
│       ├── theme/           # Tokens and responsive primitives
│       └── utils/           # Pure client utilities
├── server/
│   ├── src/
│   │   ├── config/          # Validated environment and infrastructure setup
│   │   ├── constants/       # Authoritative domain constants
│   │   ├── controllers/     # HTTP translation only
│   │   ├── jobs/            # Retry-safe background entry points
│   │   ├── middleware/      # Auth, authorization, validation, errors, IDs
│   │   ├── models/          # Mongoose persistence definitions and indexes
│   │   ├── routes/          # Versioned route composition
│   │   ├── services/        # Business rules and transaction boundaries
│   │   ├── sockets/         # Authenticated realtime transport
│   │   ├── utils/           # Small server utilities
│   │   └── validators/      # Request schemas and allowlists
│   └── tests/
└── docs/
```

Expo Router intentionally keeps route files in `client/app/`; the rest of the frontend code lives under `client/src/`.

## Dependency rules

- Routes compose middleware and controllers.
- Controllers translate HTTP input/output and call one service operation.
- Services own authorization-sensitive business rules, state transitions, transactions, and idempotency decisions.
- Models own persistence shape and indexes, not request handling.
- Validators reject malformed and unexpected input before controllers execute.
- Serializers construct explicit public, private, moderator, and admin DTOs. Raw Mongoose documents are not returned.
- Socket handlers reuse the same services and authorization rules as HTTP routes.
- Jobs call idempotent service operations and do not contain alternate business logic.
- The client does not duplicate server policy. It may mirror labels and validation hints for usability only.

## Core data ownership

| Concern                                  | Authority                                     | Rule                                                               |
| ---------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| Role, account state, verification, trust | Server + MongoDB                              | Never mass-assign from client input                                |
| Request and offer workflow               | Service layer + MongoDB                       | Only explicit transition operations                                |
| Impact totals                            | Confirmed assistance records                  | Recomputed or transactionally projected server-side                |
| Payment state                            | Verified provider webhook                     | Redirect and client claims are informational only                  |
| Messages                                 | MongoDB                                       | Persist before realtime delivery                                   |
| Notifications                            | MongoDB                                       | Recipient-only durable inbox; socket is a hint                     |
| Precise location                         | Private server data                           | Public DTO contains only approved general location                 |
| Verification files                       | Private object storage                        | No public permanent URLs or MongoDB file blobs                     |
| Reports and blocks                       | Server + MongoDB                              | Private, target-scoped, and server-authorized                      |
| Discovery rank                           | Server + public request facts                 | Deterministic, explainable, and insensitive to protected traits    |
| Giveaway inventory and handoff           | Service layer + MongoDB                       | Atomic counters; two-party confirmation before impact              |
| Mission review, capacity, and completion | Service layer + MongoDB                       | Human publication review; atomic capacity; confirmed-only impact   |
| AI request-writing suggestion            | User confirmation                             | Ephemeral, untrusted, optional; never a workflow or database state |
| Access token                             | Client memory                                 | Short lived; not persisted by default                              |
| Refresh token                            | SecureStore on mobile; HttpOnly cookie on web | Only a hash is stored server-side                                  |

## Concurrency and idempotency

Operations that touch multiple records or counters use MongoDB transactions when a partial write could create false state. The final remaining need must be reserved with a conditional write or transaction; a read-then-write sequence is insufficient.

At minimum, acceptance, completion confirmation, giveaway creation/reservation/confirmation, mission creation/contribution acceptance/completion, donation checkout, provider webhooks, and other retry-prone high-value mutations require idempotency. Unique indexes back guarantees such as active giveaway and mission-contribution relationships, processed provider event IDs, and provider payment IDs. Tests must cover duplicate and concurrent execution before the related phase is complete.

## Privacy architecture

Public profile data, private account data, and highly sensitive verification data are separate response surfaces. General public location is derived on the server. Hidden fields are omitted rather than sent and concealed in the interface.

Evidence is private by default. Moderator access to conversations or sensitive documents requires a report/review workflow and creates an append-oriented audit event.

## Deployment shape

- Expo/EAS builds Android and iOS; the same client exports a responsive web application.
- A Node host runs the stateless Express/Socket.IO process behind HTTPS.
- MongoDB Atlas supplies durable data, indexes, backups, and transactions.
- Private S3-compatible storage holds uploads.
- Web hosting and API origins are explicit CORS allowlist entries.
- Horizontal API replicas share no security- or workflow-critical in-memory state.

## Phase gates

Each phase must satisfy its own acceptance tests before the next starts. A phase report lists created and modified files, database and API changes, security considerations, tests actually run, known limitations, and the next recommended phase. Features must not be pulled forward merely because their packages or directories already exist.
