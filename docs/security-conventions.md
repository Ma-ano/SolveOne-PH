# Security conventions

## Security model

The mobile/web client, every request field, every socket event, every filename, and every provider redirect is untrusted. The Express service establishes identity, authorization, legal state transition, idempotency, and safe output before mutating or returning data.

Security-sensitive behavior is deny-by-default. A frontend role check may hide a control for usability but never authorizes the action.

## Data classification

| Class            | Examples                                                                           | Handling                                                                         |
| ---------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Public           | display name, bio, opted-in skills, server-sanitized city/province, factual badges | Explicit public serializer only                                                  |
| Private account  | email, sessions, full location, block relationships, private requests              | Authenticated owner or specifically authorized workflow                          |
| Sensitive        | message/evidence content, reports, payment metadata, security events               | Least-privilege access; audit moderator/admin access where applicable            |
| Highly sensitive | password hashes, refresh hashes, government-ID metadata/files, provider secrets    | Never public; encrypted provider/storage path; strict retention and logging bans |

Collect the minimum necessary data. Exact coordinates are stored only when a feature requires them. Public responses derive general location on the server and omit hidden fields entirely.

## Secrets and configuration

- Server secrets live in deployment environment variables or a secrets manager and are validated at startup.
- `.env` files are ignored; `.env.example` contains placeholders only.
- `EXPO_PUBLIC_*` is treated as public build-time data. Database credentials, JWT secrets, storage credentials, email keys, payment secrets, and private endpoints never use that prefix.
- Access and refresh signing secrets are distinct and long enough for their algorithms.
- Secrets are never placed in source, test snapshots, URLs, analytics, crash reports, or logs.

## Authentication and session handling

- Passwords are hashed using an approved adaptive password hash. Passwords, reset tokens, verification tokens, OTPs, and credential-like fields are never logged.
- Access tokens are short-lived and kept in application memory when practical.
- Mobile refresh tokens use Expo SecureStore. Web refresh tokens use Secure, HttpOnly, SameSite cookies and production HTTPS.
- Refresh-session records store only a token hash, family/replacement linkage, device metadata, hashed IP data, expiry, and revocation state.
- Rotation and reuse detection are atomic. Reuse revokes the entire family, forces reauthentication, and records a redacted security event.
- Account status is checked during protected operations, not only at login.
- Login, verification, reset, and admin authentication receive separate rate limits.
- Email verification and password-reset credentials are random, stored only as SHA-256 hashes, expire through TTL indexes, and are consumed once.
- Protected requests resolve the current account and active database session; logout and suspension therefore invalidate authorization before the access JWT expires.
- Browser refresh cookies are scoped to `/api/v1/auth`. The current `SameSite=Lax` policy assumes the web app and API are same-site in production; a cross-site deployment requires an explicit `SameSite=None; Secure` review plus CSRF controls.

## Account closure and retention

Self-service closure is limited to ordinary user accounts and requires a live
authenticated session, current-password reauthentication, an exact destructive
confirmation phrase, acknowledgement of the current notice, and a matching
server-configured policy version. The password attempt uses the authentication
rate limiter. Moderator and administrator accounts require controlled
offboarding so a compromised staff session cannot silently remove operational
accountability.

Closure is refused while the account owns or participates in a nonterminal help
request, offer, giveaway, handoff, community mission, or mission contribution.
This prevents another person's reserved capacity, submitted completion, or
pending handoff from being stranded. The eligibility check is repeated inside
the same MongoDB transaction that disables the account.

On success, the server replaces the email with a per-account `.invalid`
address, replaces the password hash with an unknown random credential, replaces
the name with a closed-account label, clears profile/location/avatar fields and
the verification badge, disables the account, records the policy version and
closure time, consumes one-time auth
tokens, revokes every refresh session, and writes a hashed-IP `account_closed`
security event. Pending identity reviews expire and every identity upload is
queued for the existing private-storage purge worker. The original email and
password are not retained by the closure record.

Relationship, message, completion, impact, donation/refund, report, block,
agreement, security, and audit records are not cascade-deleted. They may be
needed to preserve transactional truth, protect another participant, handle a
legal claim, demonstrate consent/security actions, or satisfy an approved
retention obligation. Public and authenticated product surfaces already
exclude disabled accounts. This technical workflow does not define the final
legal duration for each retained collection; production requires a published,
legally reviewed schedule and an operational data-subject request channel. See
[Account closure and retention](account-closure-retention.md).

## Authorization checklist

Every mutation answers all of the following inside the server:

1. Who is the authenticated principal?
2. Is the account active?
3. Does the role/capability authorize this operation?
4. Does the principal own or participate in this resource where required?
5. Is the current resource state eligible for the requested operation?
6. Is the input valid and allowlisted?
7. Is the operation a duplicate or replay?
8. Can concurrent execution violate a quantity, state, payment, or impact invariant?

The service layer owns these checks. Ownership or participant checks use server-loaded records, never client-supplied owner IDs.

## Input and transport controls

- Validate params, query, body, headers used for idempotency, and socket payloads with strict schemas.
- Reject unexpected nested objects, invalid MongoDB IDs, operator injection, prototype-pollution keys, overlong strings, and unsupported MIME types.
- Apply small JSON and URL-encoded body limits. Uploads use direct, narrowly authorized object-storage mechanisms rather than large API bodies.
- Use Helmet, an explicit credentialed CORS allowlist, HTTPS, secure cookies, request IDs, and endpoint-specific rate limiting.
- Do not enable wildcard CORS when credentials are allowed.
- Configure reverse-proxy trust explicitly per deployment so IP-based controls cannot be spoofed.

## Output and privacy controls

- All API output passes through named serializers such as `serializePublicUser`, `serializePrivateUser`, and `serializePublicRequest`.
- Mongoose documents, `select: false` assumptions, and client-side CSS are not privacy boundaries.
- Exact coordinates, barangay where not approved, email, phone, tokens, document storage keys, moderation notes, private evidence, and private conversations are excluded from public DTOs.
- Sensitive notification details are omitted from lock-screen/push payloads.
- Block behavior returns generic unavailability and does not disclose who blocked whom.
- Profile updates derive ownership only from the authenticated principal; there is no update-by-arbitrary-user-ID route.
- Public profiles use a minimized display name and general city/province/country only. Full surname, barangay, email, role, account state, agreement records, and avatar storage keys remain private.
- Bio, skill, and location text is length-bounded structured input. Clients must render it as text, never executable markup.
- Help-request drafts and moderation feedback use owner-only DTOs. Public request serializers include only server-derived city/province and never include barangay, safety flags, reviewer identity, or moderation notes.
- Request publication is a role-protected conditional transition from `pending_review`; moderators cannot review their own requests. The request update and append-only moderation audit record share a MongoDB transaction.
- Deterministic request screening may flag prohibited or urgent language for a human moderator, but it never approves, rejects, verifies, or bans autonomously. Emergency-like submissions also return professional/emergency guidance to the owner.
- Offer creation is separately rate-limited and rejects self-offers, closed requests, mismatched need types, over-capacity amounts, duplicate active helper/need relationships, and blocked relationships using generic unavailability responses.
- Offer lists and mutation responses use a participant DTO: helpers and request owners see only minimized public identity plus the offer/request/need context needed for the workflow. Public endpoints never expose offers or helper negotiations.
- Acceptance rechecks owner authority, both account states, request state, block state, offer state, need type, and remaining capacity inside a transaction. Exact counter comparison plus the transaction protects the final unit/value from competing acceptance.
- Acceptance idempotency keys are format-validated, SHA-256 hashed, principal/operation/payload scoped, uniquely indexed, expired by TTL, and never logged or serialized. Completed replay bodies are private database records.
- Request cancellation releases accepted/in-progress reservations and cancels active offers transactionally. Reserved capacity is explicitly separate from solved progress and cannot create public impact.
- Phase 7 completion evidence is participant-only. Helper submission, owner confirmation/dispute, and reserved-to-solved counter movement are transactionally guarded. A disputed offer never counts as verified impact, and a contested request cannot be owner-cancelled to evade review.
- Public impact is calculated from confirmed assistance and fully solved request state on the server. Neither client-supplied duration estimates nor pending pledges can increment it.
- Phase 8 notifications are recipient-only records created alongside their source mutation in a MongoDB transaction. Event keys are uniquely indexed and hidden from DTOs. Production disables automatic index creation, so the operator-run notification index step must succeed before traffic. Recipient selection is server-derived, and list/count/read operations use the authenticated principal rather than a caller-supplied user ID. Read state is monotonic; another account's notification ID returns a generic not-found response. Records expire after 180 days under a TTL index, subject to retention-policy review.

## Upload and document controls

- Verification documents and private evidence are stored in private object storage, never as MongoDB blobs or permanent public URLs.
- Upload authorization binds the user, purpose, maximum size, MIME allowlist, and random storage key.
- The server revalidates content metadata after upload; filename extensions are not trusted.
- Public images should have location-bearing EXIF metadata removed where feasible.
- Downloads are short-lived and re-authorized for every request.
- Retention jobs delete documents that are no longer necessary. Sensitive document access produces an append-oriented audit record.

Phase 7 proof uploads are authenticated binary API requests rather than public signed URLs. Only the in-progress offer helper can upload. Magic bytes, claimed MIME, extension, and 5 MB size must agree; an offer may attach no more than four uploaded IDs. S3 keys are random, hidden database fields. `HeadObject` checks stored size, type, and participant metadata before submission. A file download checks both the evidence relationship and its attached file ID, uses no-store/attachment/nosniff headers, and appends an access audit record with hashed IP. Native clients copy selected proofs into a temporary app cache for upload and briefly cache downloads for the system share sheet; they warn before allowing export to another app and attempt to delete cache files afterward. Cache cleanup is best-effort, not a secure-erasure guarantee, and publication still requires a separate consent workflow. An hourly queue deletes expired unattached S3 objects before deleting their metadata. Production startup requires real storage credentials and a private HTTPS endpoint when custom. Bucket privacy, encryption at rest, least-privilege policy, and confirmed-evidence retention still require deployment review.

Phase 9 identity collection is opt-in and disabled by default. The server requires a current published notice acknowledgement before upload, a clean local ClamAV scan, a random hidden key, SSE-S3 request, owner/hash/type/size metadata checks, and a reviewer claim before each audited document read. The badge advances only in a conditional transaction; no reviewer may review their own account. Decisions and 30-day pending expiration queue deletion; unsubmitted files expire after 24 hours. The [Phase 9 review](phase-9-verification.md) records residual risks and the required deployment signoff. Magic-byte checks and malware scanning are not image sanitization or guaranteed protection against polyglots/EXIF leakage; do not enable production collection until that risk is closed or formally accepted.

## Messaging safety

Messaging exists only for eligible help relationships. Persist a message before broadcast, authenticate every socket, and authorize every conversation action against database membership and block state.

Phase 6 creates one immutable-participant conversation only in an accepted-offer transaction. HTTP reads are participant-only; new sends recheck the current offer/request/account/block relationship inside the message transaction. A socket handshake checks the active session; room join checks it again along with current eligibility, and already-connected sessions are periodically rechecked. Broadcasts contain identifiers only, never message content. A cancelled request closes chats transactionally.

Phase 8 notification delivery reuses the authenticated `user:{userId}` socket room. Clients cannot join a notification room or submit notification events. Created/read hints contain only a notification ID and are followed by recipient-authorized API reads; there is no lock-screen/push payload in this phase. A missed socket hint must be recovered from the durable API inbox on reconnect. Multi-instance delivery needs a shared Socket.IO adapter before horizontal deployment.

Message retries use unique sender-scoped client identifiers. Text is bounded to 2,000 characters and has an endpoint-specific rate limit. Reports are accepted only from a participant about another participant's selected message and are deduplicated. Their storage does not grant moderator access to whole conversations; report-scoped access and AuditLog recording must be added with authorized moderator triage.

Digital Alalay conversations prominently prohibit requesting passwords, OTPs, PINs, CVVs, recovery codes, or private cryptographic keys. Pattern detection may flag risk, but moderator access to private content requires an authorized report or safety workflow and must be audited.

## Payments and donations

- MVP recipient money help is a non-wallet pledge. Platform donations are a separate route, data model, UI, and accounting concern.
- A verified provider webhook is authoritative. A success redirect or client request cannot mark a donation paid.
- Verify the webhook signature against the raw request body before JSON transformation where the provider requires it.
- Validate provider event ID, expected donation, amount, and currency; deduplicate with unique indexes; process idempotently; tolerate valid out-of-order delivery.
- Payment/provider secrets and raw sensitive webhook material are redacted from logs.
- Direct recipient payments, wallets, escrow, and marketplace payouts require a later legal/compliance and ledger architecture and are disabled for MVP.

Phase 10 keeps checkout disabled by default. PayMongo secrets are server-only, mode-validated, and never returned; card/wallet credentials are collected only on the provider's exact HTTPS checkout host. Owner checkout keys are validated, hashed, payload-bound, and uniquely indexed; provider checkout receives a stable second idempotency key. Signed raw events are fresh-mode checked before strict parsing, then exact donation/session/payment/amount/currency guards and MongoDB transactions control state. Event, session, payment, and refund IDs have unique indexes. Refund-before-payment is deferred; impossible over-refunds remain visible for reconciliation. Admin totals omit donor/provider identity and create a hashed-IP audit record. The [Phase 10 launch review](phase-10-platform-donations.md) is mandatory before live enablement.

## Logging and audit

Structured application logs include request ID, method, route template, safe principal ID when appropriate, response status, duration, and a stable error code. Redact authorization headers, cookies, passwords, tokens, OTPs, PINs, government identifiers, storage signatures, and payment secrets recursively.

Security events include patterned login failures, refresh reuse, admin actions, and webhook failures without recording secret material. Audit logs are append-oriented and record role changes, suspensions, moderation decisions, report resolution, refunds, configuration changes, and sensitive document access. Ordinary users cannot edit audit records.

## Reporting, blocking, and suspension

Phase 11 report evidence is claim-scoped. A moderator must own an unexpired
30-minute claim, cannot review their own report or a report about themselves,
and creates an audit record whenever evidence is opened. A message report
reveals only the selected message, never the surrounding conversation. Public
request evidence cannot expand the already-public location surface.

Blocks are directed and undisclosed to the blocked account, but authorization
checks treat either direction as disabling new offers, messages, and realtime
conversation joins. Only administrators can suspend or reinstate a non-admin
account. Suspension changes the authoritative account state and revokes all
refresh sessions in one transaction. Suspension reasons, actors, IP hashes,
and audit metadata are excluded from ordinary DTOs.

## Advanced discovery

Phase 12 discovery is deterministic and explainable. Its only ranking inputs
are explicit/saved skills, a factual verification level, request urgency and
needed-by date, coarse city/province equality, publication time, and the
request ID tiebreaker. Budget mode uses server-derived remaining money/item
value. Wealth, religion, race, politics, health, other sensitive traits,
private messages, donation history, engagement, and precise location are not
inputs. No AI ranking or automated eligibility decision is used.

Only active-owner, published/partially solved, public requests enter the
aggregation. Authenticated results exclude the viewer's own requests. Saved
profile criteria remain private and only their normalized values affect a
hashed cursor scope. Output still passes through the public request serializer;
discovery never returns barangay or exact coordinates. Nearby means same city
or province and does not collect GPS.

## Free-item handoffs

Phase 13 listings are gifts, not sales. Mutation schemas contain no price,
payment, currency, delivery-fee, wallet, payout, or recipient banking field.
The server derives the donor from listing ownership and the recipient from the
authenticated owner of a reviewed request; callers cannot choose either party
or set workflow status, counters, confirmation timestamps, or impact.

Public listings expose bounded item text, condition, available quantity,
minimized owner identity, and city/province only. Full submitted location,
barangay, internal reservation keys, hidden photo storage fields, and linked
request details remain private. Prohibited item text is rejected before
persistence, and a report about a giveaway exposes only that public DTO to a
moderator with an unexpired claim. Blocked or suspended relationships receive
generic unavailability rather than relationship disclosure.

Reservation atomically validates the listing, recipient-owned public request,
matching open item need, both account states, block state, and remaining
capacity before incrementing listing and request reservation counters. A
unique active relationship plus conditional aggregate writes protects against
duplicate and final-unit races. Cancellation releases both counters in the
same transaction; once either participant confirms, participant and request
cancellation are blocked.

Donor and recipient confirmation timestamps are written independently. The
second confirmation atomically moves listing and request counters from
reserved to given/solved and derives request state. One-sided confirmation,
reservation, cancellation, and client claims never create impact. Completed
quantity is the authoritative item-impact source, and solved-problem credit is
included only when the linked request is fully solved.

## Community missions

Phase 14 mission drafts, full submitted location, evidence notes, moderation
notes, contribution messages, and completion notes are private. Public mission
DTOs use explicit reviewed fields, minimized creator identity, and city/province
only. Public access requires both a public lifecycle state and `verified`
review state; submission never publishes content by itself.

Only a moderator or admin can approve, reject, or request changes. Review
decisions recheck pending state transactionally and append an audit event.
Mission reports contain only the reviewed public DTO and follow the Phase 11
claim, expiry, evidence-access, and audit rules. Blocking from a public mission
targets its creator; blocked or inactive relationships receive generic
unavailability.

Contribution mutations derive both participants and the selected resource from
stored records. They recheck active account state, participant authority,
mission verification/state, block state, and resource capacity. Acceptance
uses a transaction plus exact embedded-resource version/counter comparison so
competing proposals cannot reserve the final unit twice. Cancellation releases
accepted capacity atomically and is refused after completion submission.

Contributor submission is a claim, not impact truth. Only the creator can
confirm it, and confirmation atomically moves reserved capacity to fulfilled
capacity. Pending, accepted, started, submitted, rejected, withdrawn, and
cancelled contributions never affect public impact. A mission counts as solved
only once all authoritative resource quantities are fulfilled.

Volunteer matching uses explicit saved skills, coarse city/province equality,
publication time, and mission ID only. It excludes closed capacity, inactive
creators, own missions, blocked relationships, and unreviewed content. It does
not use precise location, private content, protected traits, donation history,
engagement, AI ranking, or automated eligibility decisions.

## Optional AI assistance

Phase 15 is disabled by default and cannot block normal request creation. The
client requires per-use consent and sends only a separate rough description;
it never packages the user's profile, existing draft, location, private
conversation, verification document, payment record, or authentication data.
Before a provider call, the server redacts detected email addresses, phone
numbers, precise addresses, labeled ID numbers, authentication secrets, and
payment information. If too little meaningful text remains, no provider call
occurs.

The provider adapter uses a server-only API key, an explicitly configured
model, bounded output, no tools, non-stored Responses API requests, and an
HMAC-derived safety identifier instead of the account ID. The independent HMAC
secret cannot reuse authentication or IP-hash secrets. Raw descriptions and
provider payloads are not logged or persisted by this feature.

Provider output is untrusted. A strict allowlist schema and the deterministic
request-safety rules run before the output reaches the client. Output can only
be previewed and then explicitly copied into an editable form; it cannot save,
submit, approve, verify identity, suspend accounts, move money, determine legal
eligibility, decide fraud, set urgency, or establish impact. Provider privacy
terms, retention controls, monitoring, redaction false-negative testing, and
incident response require production approval before enablement.

## Verification before production

Before a phase ships, test horizontal privilege boundaries, ownership boundaries, suspended accounts, mass assignment, invalid object IDs, NoSQL injection, private-file access, DTO field leakage, rate limits, duplicate retries, and relevant concurrency. Production launch additionally requires secrets scanning, dependency review, backups, monitoring, published policies, abuse workflows, and appropriate legal/privacy review.

The repository CI performs a read-only tracked-file credential scan, server
lint/tests, Expo compatibility check, and production web export. It never
deploys. This check is defense in depth: Git-host secret scanning, history
scanning, branch protection, credential rotation, and the external controls in
the [production-readiness gate](production-readiness.md) remain required.
