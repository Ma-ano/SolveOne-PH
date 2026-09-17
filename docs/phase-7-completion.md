# Phase 7 — Completion and verified impact

Phase 7 changes accepted assistance from a reservation into solved progress only after the requester confirms helper-submitted evidence. Offers, negotiations, and pledges alone never create public impact.

## Lifecycle and ownership

- The helper submits completion only for their `in_progress` offer. A bounded private note is required; actual minutes for skill/time help are optional and count as volunteer time only if the requester confirms that submission.
- The request owner reviews one `CompletionEvidence` per offer. The owner may confirm a `completion_submitted` offer or dispute it with a required reason. A dispute preserves the reservation, does not change solved counters, and does not enter impact calculations.
- Completion submission, dispute, and confirmation each transition `HelpOffer` and `CompletionEvidence` in one MongoDB transaction. Confirmation additionally moves the offer amount from the matching need's reserved counter to its solved counter and recalculates the request status from all need items.
- If any confirmed amount exists but needs remain, the request becomes `partially_solved`. When every non-money need's solved quantity and every money need's solved value meet their target, it becomes `solved` with `solvedAt`; any still-pending offers are system-cancelled in the same transaction. Another pending offer cannot later be accepted for a solved request.
- Request cancellation is rejected while a `completion_submitted` or `disputed` offer exists; silently cancelling such an offer would destroy the review/dispute trail. Disputed reservations need a future audited resolution operation (Phase 11), and no current user can mark a dispute as completed.

## Private proof files

The web and Android/iOS helper screens can optionally attach up to four JPEG, PNG, WebP, or PDF proofs of at most 5 MB each. Native selection uses Expo DocumentPicker with a cache copy, then Expo FileSystem and `expo/fetch` to upload the file body; the client removes its picked cache copy after successful submission where possible. The API accepts authenticated binary uploads with `application/octet-stream`, `X-Evidence-Name` (URI-encoded), and `X-Evidence-Mime-Type` headers. The server verifies magic bytes, extension, MIME, size, current offer ownership, request state, active accounts, and both block directions. It writes a random `completion/<UUID>` key to a private S3-compatible bucket; credentials and keys never reach the client.

`EvidenceUpload` stores ownership, bounded metadata, and a hidden object key in MongoDB, not file bytes. A submission supplies upload IDs. The server rechecks ownership, recency, S3 `HeadObject` length/content type/owner metadata, and unique IDs before attaching them transactionally to `CompletionEvidence`. Downloads require participant authentication and a file ID actually attached to that offer's evidence; they return `attachment`, `no-store`, and `nosniff` headers and append an audit record containing only safe identifiers and a hashed IP. Native downloads are briefly written to the app cache and offered through the system share sheet only after a privacy warning; the client attempts to delete the cache file afterward. There are no permanent or public media URLs. No recipient photo is required, and all evidence remains private; publication consent is not implemented.

`STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, and `STORAGE_SECRET_ACCESS_KEY` are required in production; `STORAGE_ENDPOINT` is optional for a custom S3-compatible provider and must use HTTPS in production. Keep the bucket private, require encryption at rest through bucket policy/provider settings, and grant the API credentials least-privilege object read/write/delete access only to the evidence prefix. Development without storage still supports note-only completion and returns `503 EVIDENCE_STORAGE_UNAVAILABLE` for proof uploads. A separate upload rate limit defaults to ten per hour. Unattached metadata remains on a bounded cleanup queue; the hourly worker claims expired uploads, deletes their exact S3 keys, and then deletes the metadata, retrying failed deletes. Attached evidence is not swept.

## API

All offer routes use an active bearer session and the standard `{ success, data }` envelope.

| Method | Route                                            | Authority                         | Body / result                                                                                  |
| ------ | ------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/offers/:offerId/evidence/uploads`       | Offer helper during `in_progress` | Binary proof plus required filename/MIME headers; `201 { file: { id, name, mimeType, size } }` |
| POST   | `/api/v1/offers/:offerId/complete`               | Offer helper                      | `{ note, actualMinutes?, fileIds? }`; offer and private evidence                               |
| GET    | `/api/v1/offers/:offerId/evidence`               | Either offer participant          | Private note, reviewed minutes, proof metadata, and dispute/confirmation details               |
| GET    | `/api/v1/offers/:offerId/evidence/files/:fileId` | Either offer participant          | Audited, attachment-only binary download                                                       |
| POST   | `/api/v1/offers/:offerId/confirm`                | Request owner                     | Empty body and mandatory `Idempotency-Key`; offer and evidence                                 |
| POST   | `/api/v1/offers/:offerId/dispute`                | Request owner                     | `{ reason }`; offer and evidence                                                               |
| GET    | `/api/v1/impact`                                 | Public                            | `{ impact: { problemsSolved } }`                                                               |
| GET    | `/api/v1/impact/users/:userId`                   | Public, active user only          | Verified user impact aggregates                                                                |

Confirmation uses the persisted principal/operation/payload-scoped idempotency record already used for acceptance. Same-key replay returns the original response; a different key cannot move counters twice because the offer status and request counters are guarded transactionally. Duplicate submission returns the original evidence instead of creating another record. Confirmation and dispute race on the same offer state, so only one succeeds. Malformed file IDs, unexpected body fields, and client-supplied solved/impact numbers are rejected.

## Impact definitions

- Platform `problemsSolved` is the number of fully solved requests; each request counts once even if several helpers contributed.
- User `problemsSolved` is the distinct union of their own fully solved requests and fully solved requests to which they contributed confirmed help.
- `volunteerMinutes` and `hoursVolunteered` come from actual skill/time minutes on requester-confirmed evidence, not offer estimates. Hours are rounded to two decimal places.
- `itemsDonated` sums quantities on confirmed item offers. `skillsProvided` counts confirmed skill-assistance offers.
- No pledge or donated-currency amount is a public impact or wealth-ranking metric. Disputed, pending, accepted, and merely submitted offers are excluded.

The server calculates the aggregates from `HelpRequest` solved state, completed offers, and confirmed evidence. The client has no impact mutation API and never optimistically marks an offer/request solved before confirmation returns.

## Client and verification

`/my-offers` links an in-progress helper to `/offer-completion`; `/request-offers` links a submitted offer to the requester review there. The review surface shows only private evidence and provides confirm/dispute actions. `/impact` shows live platform numbers and, when signed in, the user's verified totals. Need-item lists show confirmed, reserved, and remaining amounts separately.

The server suite has 25 files and 131 passing tests. New tests cover duplicate helper submission, same-key replay and distinct-key double confirmation, automatic request closure and pending-offer cancellation, concealed evidence access, dispute exclusion/cancellation guard, byte/MIME/ownership/file-reference validation, download audit, actual-vs-estimated volunteer time, exact money-counter movement, persistence indexes, production storage configuration, random S3 keys, `HeadObject` revalidation, and safe expired-object cleanup. With the native proof additions and SDK 57-compatible patch versions, web static export passes for 22 routes and Android/iOS Hermes exports pass. Expo's dependency compatibility check is green. npm reports no server vulnerabilities after the S3 SDK addition.

Tests use in-memory repositories and mocked S3 commands, not a live MongoDB replica-set transaction or a configured object-store exchange. Native proof selection/download UI is implemented but has not been exercised on physical devices or native development binaries. The system share sheet can transfer a downloaded proof to another app after the user acknowledges a privacy warning; the client has no attachment publication consent workflow. Cache cleanup is best-effort, and the operating system may retain copies temporarily. Large user-impact queries are currently not paginated/aggregated in MongoDB and should be optimized at scale. A contested offer keeps its reservation until a later audited dispute resolution; confirmed evidence retention/deletion policy needs product/legal review before launch. A deployed bucket must be explicitly verified private, encrypted, and lifecycle-managed before production release. The client dependency audit currently reports 14 moderate transitive advisories; no SDK-breaking forced fix has been applied.

Native client APIs follow the [Expo SDK 57 DocumentPicker](https://docs.expo.dev/versions/v57.0.0/sdk/document-picker/), [FileSystem](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/), and [Sharing](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/) documentation.

Implementation references the [AWS SDK for JavaScript v3 S3 examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html), [AWS credentials guidance](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials.html), and [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).
