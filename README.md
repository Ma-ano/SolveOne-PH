# SolveOne PH

> You don't need to change the world. Solve one thing.

SolveOne PH connects people who have small, concrete problems with people who can help using money, items, skills, or time. The product's primary success measure is **problems solved**, not money raised, followers, or engagement.

## Current phase

Phases 0 through 15 are implemented, and production-readiness hardening is underway. The repository now includes a versioned self-service account-closure workflow alongside optional, disabled-by-default AI request structuring, human-reviewed community missions, free-item handoffs, advanced discovery, private safety workflows, disabled-by-default platform donations, optional private identity review, and the established help-request workflow. Identity collection, live donation checkout, and AI assistance remain disabled pending their separate deployment approvals; the production gate still has external and product blockers.

| Phase                     | Status      | Scope                                                                                                           |
| ------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| 0 — Architecture          | Complete    | Structure, environment contracts, architecture, status, API, and security conventions                           |
| 1 — Project foundation    | Complete    | Validated client/server startup, shared providers, middleware, responsive primitives, and health checks         |
| 2 — Authentication        | Complete    | Registration, verification, login, secure token rotation, logout, recovery, and role middleware                 |
| 3 — Profiles              | Complete    | Private profile editing, skills, location, public profile, and privacy-safe serializers                         |
| 4 — Help requests         | Complete    | Private drafts, concrete need items, submission, discovery, details, moderation status, and admin review        |
| 5 — Offers                | Complete    | I Can Help, typed pledges, private offer inboxes, owner decisions, withdrawal/start, and atomic reservation     |
| 6 — Messaging             | Complete    | Accepted-offer conversations, persisted text, participant authorization, Socket.IO signals, read state, reports |
| 7 — Completion and impact | Implemented | Private proof, requester confirmation/dispute, server-calculated progress and impact                            |
| 8 — Notifications         | Implemented | Private inbox, critical workflow triggers, authenticated Socket.IO hints, unread count and read states          |
| 9 — Identity verification | Implemented | Opt-in submission, private scanned images, claim-scoped moderator review, factual badge, audit and purge        |
| 10 — Platform donations   | Implemented | Authenticated platform-only hosted checkout, signed/idempotent webhooks, owner history, refunds, admin totals   |
| 11 — Reporting and safety | Implemented | User/request/message reports, directed blocks, claim-scoped review, suspension, and redacted audit browsing     |
| 12 — Advanced discovery   | Implemented | Skill/no-money matching, fully solvable budgets, coarse nearby search, and explainable deterministic ranking    |
| 13 — Free items           | Implemented | Free listings, exact-category need matching, atomic reservations, two-party handoff, and confirmed impact       |
| 14 — Community missions   | Implemented | Moderated missions, typed resources, explainable volunteer matching, atomic capacity, and confirmed completion  |
| 15 — AI assistance        | Implemented | Optional sanitized request structuring, validated previews, and explicit user-controlled application            |
| Account closure           | Implemented | Reauthentication, active-commitment gate, profile anonymization, session revocation, and identity-file purge    |
| Production readiness      | In progress | CI, linting, secret guard, readiness probe, and closure controls implemented; external launch gates remain open |

Payment and other later-phase features have not been pulled into messaging, completion, or identity review.

## Architecture at a glance

- `client/` — React Native application using Expo SDK 57, Expo Router, JavaScript, NativeWind, and React Native Web
- `server/` — stateless Express 5 modular monolith using JavaScript ES modules; MongoDB is the planned source of truth
- `docs/` — binding engineering conventions and architectural decisions
- Private object storage — used for evidence and identity documents; file bytes are not stored in MongoDB
- Socket.IO — authenticated realtime transport for relationship-scoped messaging; persisted MongoDB records remain authoritative

Read these before implementing a phase:

- [Architecture](docs/architecture.md)
- [API conventions](docs/api-conventions.md)
- [Security conventions](docs/security-conventions.md)
- [Status enums and transitions](docs/status-enums.md)
- [Phase 6 messaging](docs/phase-6-messaging.md)
- [Phase 10 platform donations](docs/phase-10-platform-donations.md)
- [Phase 11 reporting and safety](docs/phase-11-reporting-safety.md)
- [Phase 12 advanced discovery](docs/phase-12-advanced-discovery.md)
- [Phase 13 free items](docs/phase-13-free-items.md)
- [Phase 14 community missions](docs/phase-14-community-missions.md)
- [Phase 15 AI assistance](docs/phase-15-ai-assistance.md)
- [Production readiness gate](docs/production-readiness.md)
- [Account closure and retention](docs/account-closure-retention.md)

## Non-negotiable product boundaries

- One normal account may both request and provide help.
- MVP monetary help is a pledge only. It is not a recipient wallet, payout, or escrow product.
- `Support SolveOne` donations fund the platform and remain separate from recipient assistance.
- Exact location, private conversations, and verification files never appear in public DTOs.
- Workflow state changes happen through explicit server operations, not arbitrary status patches.
- Public impact is calculated on the server from confirmed completion records.
- Free-item listings have no price or payment path; impact begins only after both handoff participants confirm.
- AI and community missions are not part of the initial MVP. Phase 14 adds missions as a separately reviewed post-MVP workflow. Phase 15 adds optional writing assistance only: it cannot save, submit, moderate, verify, pay, determine eligibility, or establish fraud or impact truth.

## Requirements

- Node.js 22.13 or newer (current Node.js LTS is preferred)
- npm
- Git
- Android Studio / Android SDK only when native Android builds are needed
- Xcode on macOS only when native iOS builds are needed

## Local setup

Install each application independently:

```bash
cd client
npm install
cp .env.example .env.local

cd ../server
npm install
cp .env.example .env
```

PowerShell equivalents for the environment files are `Copy-Item .env.example .env.local` in `client/` and `Copy-Item .env.example .env` in `server/`.

Only values prefixed with `EXPO_PUBLIC_` are allowed in the client environment. Never place database, JWT, email, storage, payment, or AI provider secrets there.

Before starting the backend, replace `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `IP_HASH_SECRET`; the three secrets must be independent high-entropy values of at least 32 characters. Full email verification/recovery needs `EMAIL_PROVIDER=resend`, a verified sender, and `EMAIL_API_KEY`; console mode deliberately records only redacted delivery metadata. Production also requires a published HTTPS account-closure notice and a non-placeholder `ACCOUNT_CLOSURE_POLICY_VERSION`; the repository intentionally does not invent final legal retention periods. Production requires a private S3-compatible bucket with real `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, and `STORAGE_SECRET_ACCESS_KEY`; a custom `STORAGE_ENDPOINT` must use HTTPS. Identity collection stays off unless explicitly enabled with a published versioned notice and local scanner; see the [Phase 9 deployment review](docs/phase-9-verification.md) first. Platform checkout likewise stays off unless PayMongo is fully configured and the merchant, legal/accounting, live-provider, indexing, reconciliation, and monitoring gates in the [Phase 10 review](docs/phase-10-platform-donations.md) are complete. Development without object storage permits note-only completion. For testing on a physical mobile device, set `EXPO_PUBLIC_API_URL` to an HTTPS development endpoint or a reachable LAN address instead of device-local `localhost`.

## Development commands

Frontend:

```bash
cd client
npm start
```

Backend:

```bash
cd server
npm run dev
```

Current verification commands:

```bash
cd client
npm run check:dependencies
npm run build:web

cd ../server
npm run check:secrets
npm run lint
npm test
```

Before enabling identity submissions, platform checkout, Phase 11 safety workflows, Phase 12 discovery, Phase 13 free-item handoffs, or Phase 14 community missions on a production database, an operator must review/backup the relevant collections and run the applicable `npm run db:index:verifications`, `npm run db:index:donations`, `npm run db:index:safety`, `npm run db:index:discovery`, `npm run db:index:giveaways`, and/or `npm run db:index:missions` command against the intended MongoDB deployment. The safety command replaces the exact legacy `report_active_unique` definition with its partial equivalent; the discovery command creates only reviewed help-request indexes; the giveaway command creates listing and reservation indexes; and the mission command creates listing, moderation, matching, contribution, and active-uniqueness indexes. None of these commands was run against a live database during development. Phase 15 has no database migration. Its provider key, explicit model, and independent safety-identifier secret must remain server-side; review provider terms, retention, incident handling, monitoring, and redaction quality before enabling it.

Production exports require an HTTPS `EXPO_PUBLIC_API_URL`. Android/iOS session refresh tokens use Expo SecureStore; web sessions use the API's HttpOnly cookie.

## Delivery discipline

Development proceeds one numbered phase at a time. Each phase must document file, database, API, and security changes; add proportionate tests; run those tests; and record limitations before the next phase begins. Development fixtures must be labelled and must never create fake production impact statistics.

## Dependency status

Phase 15 added no packages or lockfile changes. The last completed production-dependency audit (Phase 9) reported zero server vulnerabilities and 14 moderate client transitive findings in the Expo/Router toolchain, including URI-decoding denial of service and a UUID bounds issue. A fresh registry audit still cannot run because the available runtime has no npm CLI and registry access is unavailable. Resolve or formally accept the known advisories and repeat both production audits before release; see the [Phase 10 review](docs/phase-10-platform-donations.md).

## Next phase

The master plan's numbered implementation phases and the repository account-closure controls are complete. Repository CI, linting, tracked-secret checks, and dependency-readiness health are implemented, but this is not a production approval. The next recommended work is an operator-facing data-subject request workflow and an approved collection-by-collection retention schedule. External gates—threat modeling, penetration testing, accessibility/device QA, published policies, provider approval, monitoring, backup/restore drills, dependency remediation, live index validation, and staged deployment—remain open in the [production-readiness checklist](docs/production-readiness.md).
