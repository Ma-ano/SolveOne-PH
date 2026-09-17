# Phase 2 — Authentication

## Scope and result

Phase 2 implements registration, email verification/resend, login, refresh rotation, single-session logout, all-session logout, forgot/reset password, secure client session restoration, and reusable role authorization. It does not implement profile editing, identity verification, help requests, or administration screens.

## Persistence

Four MongoDB collections are introduced through Mongoose models:

- `users`: normalized unique email, adaptive password hash, role, account status, email badge, and versioned agreement timestamps.
- `refreshsessions`: unique session and token hashes, family/replacement linkage, device metadata, HMAC-hashed IP, expiry, revocation, and last use.
- `authtokens`: hashed, expiring, one-time email-verification and password-reset credentials.
- `securityevents`: append-oriented redacted login-failure, refresh-reuse, and password-reset events.

MongoDB TTL indexes remove expired refresh and one-time-token records. TTL cleanup is asynchronous, so every service operation also checks expiry. The repository uses MongoDB transactions for registration, token consumption, password reset, and refresh rotation; deployment therefore requires MongoDB Atlas or another transaction-capable replica set.

Existing deployments need index creation reviewed and applied through the deployment process before traffic is enabled. The unique normalized-email index can fail on legacy duplicate data; there is no legacy data migration in this new repository.

## Session design

Access JWTs use HS256 with fixed issuer/audience, independent signing secrets, a 15-minute default lifetime, and only subject/session/type identifiers. Authorization loads the current user and verifies that the backing refresh session remains active, so account suspension and logout take effect without waiting for JWT expiry.

Refresh JWTs have a 30-day default lifetime. Only their SHA-256 hashes are stored. Every successful refresh revokes the old record and creates a replacement in the same family. Reuse of a rotated token revokes the whole family, emits a redacted security event, and requires a new login.

Native refresh tokens live in Expo SecureStore and rotate in place. Web refresh tokens are Secure in production, HttpOnly, SameSite=Lax, scoped to `/api/v1/auth`, and never returned in browser JSON. Access tokens remain in React context memory. Browser session detection also considers the browser `Origin` header and cookie transport instead of trusting a submitted platform value.

## Account and recovery rules

- Registration input is strict and cannot choose `role`, account status, or verification level.
- Passwords require 12–128 characters and use bcrypt with a configurable work factor (default 12).
- Login uses a dummy password comparison for unknown emails and returns a generic invalid-credentials error.
- Only active, email-verified accounts can start a session.
- Verification and reset links contain 256-bit opaque credentials; the database stores only their hash.
- Verification/reset tokens are one-time and time-limited. Reset revokes every active session.
- Forgot-password and resend-verification use the same accepted response for eligible and ineligible accounts.
- Email and authentication actions have narrower IP rate limits than the application-wide limit.
- Role middleware reads the fresh database-derived role attached by authentication and denies by default.

## Configuration

The server now requires independent high-entropy values for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `IP_HASH_SECRET` outside automated tests. Token lifetimes, bcrypt rounds, email/reset lifetimes, rate limits, cookie name, agreement versions, and email provider settings are validated at startup.

`EMAIL_PROVIDER=console` is a redacted development sink: it records template type and a recipient hash but never the link, address, or credential. Use a configured Resend account for end-to-end delivery. Production refuses console delivery and non-HTTPS frontend/CORS origins.

## Verification performed

- 13 server test files / 67 tests: service rules, endpoint envelopes, mass-assignment and NoSQL-shaped input rejection, scoped rate limits, cookie/native transport, refresh reuse, logout, account state, one-time recovery, role authorization, token claims/tampering, email redaction, schemas/indexes, and foundation regressions.
- Expo SDK 57 dependency compatibility check.
- Static web export of all eight routes.
- Android Hermes production export.
- iOS Hermes production export.
- npm dependency audits: server has 0 known findings; client has 13 existing moderate transitive Expo/Router toolchain findings with no SDK 57-compatible npm remediation.

## Known limitations

- No live MongoDB Atlas transaction/integration run was possible without deployment credentials; repository behavior is covered through service/API fakes and Mongoose schema inspection.
- No live Resend delivery was performed; provider request construction and failure behavior are unit tested.
- The web cookie policy assumes a same-site frontend/API topology. A truly cross-site production topology needs a deliberate cookie and CSRF design review.
- Access-token refresh is exposed through the auth context but is not yet automatically retried by every future protected API call; add a single-flight authenticated request wrapper when Phase 3 introduces protected profile traffic.
- Rate limits are process-local. Multi-instance production deployment needs a shared rate-limit store.
