# Phase 9 — Optional identity verification

Identity verification is an opt-in review of one or two JPEG/PNG images for an email-verified, active account. Approval advances only an unverified/email-verified account to the factual `IDENTITY_VERIFIED` badge. It is not a trust score, financial KYC attestation, safety guarantee, or endorsement. There is no automated identity decision.

## Collection gate and notice

`IDENTITY_PROCESSING_ENABLED=false` is the default, including production. Reads of status/requirements and retention cleanup still work when collection is disabled. Enabling submissions requires a versioned published identity privacy notice URL, fully configured private object storage, and a local clamd scanner socket or loopback port. Production requires an HTTPS notice URL and non-placeholder version. The client displays the exact version and purpose, requires explicit acknowledgement before opening its picker, and sends the same version with each binary upload. The server rejects stale/missing acknowledgement before screening or storage; submission only attaches recent scans associated with the current version. Do not configure the flag as true until the deployment review below is signed off.

The notice should specify the controller/contact, precise purpose, lawful basis, document categories, recipients/reviewer roles, retention and deletion, rights and complaint channel, cross-border/cloud processing, and incident contact. Product/legal counsel must review the actual published notice and consent UX; configuration proves only that values are present, not that they are adequate. No national ID number, face-match score, address text, or original filename is extracted or stored in the verification record.

## Private lifecycle

- The authenticated owner may upload JPEG/PNG bytes up to 4 MB each (four attempts per hour). The server checks a bounded raw body, claimed type and byte markers, then requires a clean response from a local ClamAV `INSTREAM` scan. A scanner failure, timeout, malformed response, or positive finding denies upload. The scanner must be local because clamd TCP is not authenticated or encrypted.
- MongoDB records only owner, random hidden `identity/<UUID>` key, hash, type, size, scan/acknowledgement time, notice version, attachment state, and deletion deadline. It records deletion metadata **before** an S3 write so a failed write or orphan can be swept. S3 writes request SSE-S3 AES256 and no public ACL. HeadObject checks owner/hash/type/size/encryption before attaching; GetObject checks them again plus the returned body hash.
- A transaction creates one pending record and attaches the distinct owned, scanned uploads. A partial unique `activeKey` index prevents multiple active identity reviews for one user. Repeating the same submission IDs returns replay; different IDs during a pending review conflict. A pending case expires after 30 days.
- Moderators/admins cannot review their own account. A reviewer claims a case for 30 minutes; only that reviewer may fetch an attached image while the claim and pending state remain valid. Each claim, document access, and decision creates an audit record with a hashed IP. A decision requires an audited opening of **every** attached image by the assigned reviewer, though this cannot prove thoughtful visual inspection. Decisions and the recipient-only notification are transactional. Approval conditionally advances the badge; rejection stores bounded private feedback. Both immediately queue document deletion.
- An hourly worker expires old pending cases and deletes due S3 objects before deleting their MongoDB upload metadata. Unattached uploads become due after 24 hours; resolved uploads are due on decision/expiration. If deletion fails, the claim becomes retryable after an hour. `documentsPurgedAt` marks completion only after all attachment metadata has gone. Object-store lifecycle rules should independently backstop this worker; deletion is asynchronous, not immediate secure erasure.
- Owner DTOs show only status, count, timestamps, feedback, and purge status. Reviewer queue DTOs omit email, address, keys, hashes, and ID numbers. Document GET is authenticated, claim-scoped, no-store, attachment/nosniff, and never a public/signed permanent URL. Web previews use temporary in-memory Blob URLs and revoke them on claim change, decision, or unmount. Native reviewer export is unavailable.

## API

| Method | Route | Principal and result |
| ------ | ----- | -------------------- |
| GET | `/api/v1/verifications/identity/requirements` | Owner: collection gate, eligibility, notice, size/type limits |
| GET | `/api/v1/verifications/identity/me` | Owner: latest private review status |
| POST | `/api/v1/verifications/identity/uploads` | Owner: octet-stream JPEG/PNG with current notice headers; returns upload ID only |
| POST | `/api/v1/verifications/identity/submit` | Owner: one/two distinct upload IDs and acknowledgement; pending record or replay |
| GET | `/api/v1/admin/verifications/identity?limit=10&cursor=...` | Moderator/admin: pending non-self cases; scoped cursor |
| POST | `/api/v1/admin/verifications/identity/:recordId/claim` | Moderator/admin: 30-minute audited claim |
| GET | `/api/v1/admin/verifications/identity/:recordId/documents/:uploadId` | Assigned reviewer only: audited, non-cacheable bytes |
| POST | `/api/v1/admin/verifications/identity/:recordId/approve` | Assigned reviewer: empty body, conditional badge advance |
| POST | `/api/v1/admin/verifications/identity/:recordId/reject` | Assigned reviewer: bounded private reason |

Production disables Mongoose `autoIndex`. Before enabling collection, back up and inspect the `verificationrecords` and `verificationuploads` collections for duplicate active keys/object keys, configure `MONGODB_URI` for the intended database, then run `npm run db:index:verifications` from `server/`. This creates/verifies only declared indexes and does not drop or rewrite records. This command was not run against a live database during development. The partial unique active-key index must exist before traffic.

The backend suite passes 32 test files and 172 tests, including consent/version rejection, binary API authentication, reviewer role, strict IDs and mass-assignment denial, clamd framing/fail-closed behavior, private S3 upload/metadata/deletion (including an orphaned case), audited-open-before-decision contract, conditional badge advancement, and safe DTO/notification enums. Expo SDK 57 dependency validation passes. Android/iOS Hermes and web static export succeed with 25 routes. A fresh `npm audit --omit=dev --audit-level=moderate` finds zero server vulnerabilities but 14 moderate client transitive findings, including [URI-decoding denial of service](https://github.com/SamVerschueren/decode-uri-component/security/advisories/GHSA-vcc3-ghjq-m6fr) and [UUID bounds](https://github.com/advisories/GHSA-w5hq-g745-h8pq). npm's proposed force fix downgrades Expo/Router incompatibly with SDK 57, so it was not run. These are code checks; the live integration and privacy checks below remain open.

## Pre-deployment security review

The code review confirms server-derived ownership and reviewer role, non-self review, claim-scoped reads, strict allowlists, no client-controlled badge update, local fail-closed scanning, SSE-S3 request, hidden random storage keys, hash/metadata rechecks, redacted DTOs/notification, audited document reads, and bounded retention/retry. Automated tests exercise these controls with mocked MongoDB/S3/scanner; they do not constitute a live infrastructure assessment.

Do **not** enable identity collection in production until all of these deployment-specific checks are complete:

1. Publish and obtain privacy/legal approval for the actual notice, purpose, rights workflow, cloud processor contract, and retention schedule. Confirm access/deletion requests can be handled for both S3 and backups.
2. Verify the bucket is non-public by policy, credentials are least-privilege and rotated, the S3-compatible provider actually enforces AES256 at rest, TLS is used, server-side access logs are restricted, and backup/lifecycle deletion policies are tested. An `AES256` request alone cannot prove provider encryption or privacy.
3. Run ClamAV locally with current signatures, bounded `StreamMaxLength`, no public clamd port, process isolation, monitoring, and incident handling. Test a clean image, EICAR test file, scanner outage, and oversized upload. Magic bytes plus malware scanning do **not** remove EXIF/metadata, defeat image polyglots, or guarantee safe browser decoding. Add image re-encoding/CDR and metadata removal, or obtain a documented security acceptance, before reviewers inspect untrusted images in production.
4. Run a live MongoDB replica-set transaction/concurrency test (simultaneous submit, claim, decision, expiry), an S3 upload/read/delete and worker retry drill, and reviewer-device/browser privacy testing. Unit mocks cannot establish these operational guarantees.
5. Review moderator provisioning, MFA or equivalent strong reviewer authentication, audit-log access and retention, device screenshots/download policy, session timeout, and incident response. Reviewers are instructed not to export documents, but browser memory, caches, screenshots, or compromised devices are not technically erased by Blob URL revocation.
6. Resolve the 14 client dependency advisories with SDK-compatible updates or document a signed risk acceptance and route/query attack-surface review. Do not apply the SDK-breaking `npm audit fix --force` suggestion blindly.

The current production posture is **collection off by default**. Phase 9 code is implemented but identity collection is not approved for a live launch until the residual risks above are closed or explicitly accepted by the responsible security/privacy owners.

References: [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [ClamAV clamd protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html), [AWS SSE-S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingServerSideEncryption.html), [Philippine Data Privacy Act](https://privacy.gov.ph/data-privacy-act/), [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).
