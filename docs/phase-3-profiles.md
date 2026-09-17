# Phase 3 — Profiles

## Scope and result

Phase 3 implements an authenticated private profile, owner-only editing, bounded skills and location, an unauthenticated public profile, privacy-specific serializers, and responsive Expo screens. It does not implement help requests, verification documents, trust/impact counters, profile search, or media upload.

## Persistence changes

The existing `users` collection gains backward-compatible defaulted fields:

- `bio`: optional trimmed text, maximum 500 characters.
- `skills`: up to 15 trimmed values, each no more than 50 characters.
- `location`: optional country, province, city, and barangay fields with bounded lengths.
- `avatar`: optional private object-storage metadata shape. Its storage key is `select: false` and is defensively removed from raw JSON; upload and URL issuance are intentionally not exposed yet.

No new collection or index is needed for Phase 3. Existing documents receive defaults when read and saved through Mongoose. There is no search query yet, so location/skill indexes would be premature.

## API changes

- `GET /api/v1/users/me` returns the authenticated owner's private user DTO.
- `PATCH /api/v1/users/me` replaces only submitted allowlisted profile fields.
- `GET /api/v1/users/:userId` returns a public DTO only for an active account.

There is deliberately no `PATCH /users/:userId` route. Ownership comes exclusively from the current authenticated session. Attempts to submit role, account status, verification, impact, trust, avatar metadata, or unknown fields fail strict validation.

## Privacy boundary

The private DTO includes email, role/account state, full name, full owner location, skills, bio, and factual verification level. It still excludes password hashes, normalized email, agreements, refresh data, security events, and avatar storage keys.

The public DTO contains only:

- opaque user ID;
- first-name/last-initial display name;
- optional bio and skills;
- optional city, province, and country;
- factual verification level;
- account creation time.

It excludes email, full surname, barangay, role, account state, update/activity time, agreements, authentication data, trust/impact internals, and private media metadata. Suspended, disabled, and missing accounts share the same not-found response.

## Client changes

The authenticated profile screen loads the latest server copy, edits the allowlisted fields, explains which location data becomes public, updates the in-memory session after saving, and links to the public view. Public profiles render a minimized display name, general location, factual badge, bio, and skill chips. Initial-based avatars provide a consistent placeholder without inventing an upload system.

Protected API requests now use one single-flight refresh operation when a short-lived access token receives `401`, then retry once with the rotated token. Mutations are not retried for network failures or non-authentication errors.

## Verification performed

- 15 server test files / 76 tests covering private authorization, owner-only routing, strict field allowlists, duplicate skills, public DTO leakage, unavailable-user concealment, schema bounds, and all prior authentication/foundation behavior.
- Expo SDK 57 static web export, including `/profile` and `/public-profile`.
- Android and iOS Hermes production exports.
- Expo SDK dependency compatibility check.
- npm dependency audits: server has no known findings; client retains 13 moderate transitive Expo/Router toolchain findings without an SDK 57-compatible npm fix.

## Known limitations

- Avatar upload is deferred until a private object-storage workflow can validate bytes/MIME, strip metadata where feasible, issue random keys, and safely produce authorized/public derivatives.
- No live MongoDB Atlas integration run was possible without deployment credentials; route/service behavior uses the shared in-memory test repository and Mongoose schema inspection.
- Profile fields currently have fixed visibility: bio, skills, and general location are public when provided; barangay and account data are always private. Per-field visibility preferences are not implemented.
- Public app navigation uses `/public-profile?userId=...` so the current static Expo web export does not require build-time user IDs. The API itself uses the canonical `/users/:userId` resource route.
- Skills and location are not searchable in this phase; indexes should be designed with the Phase 4/5 discovery queries rather than guessed now.
