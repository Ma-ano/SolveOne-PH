# Data Retention Schedule — Approval Draft

**Release state: BLOCKING — not approved.**

This document inventories repository-managed records so product, privacy,
security, legal, and operations owners can approve a collection-by-collection
schedule. It intentionally does not invent retention periods or legal bases.
Every `TBD` must be replaced by an approved value, and the corresponding purge,
backup, legal-hold, and verification procedure must be tested before production
approval.

| Collection / store                | Primary contents                                    | Lifecycle trigger                          | Approved retention | Required disposal evidence                            |
| --------------------------------- | --------------------------------------------------- | ------------------------------------------ | ------------------ | ----------------------------------------------------- |
| `users`                           | Account, profile, agreements, coarse location       | Account closure or inactivity              | TBD                | Anonymization/deletion query and sampled verification |
| `authTokens`                      | Hashed verification/recovery tokens                 | Use or expiry                              | TBD                | TTL/manual cleanup evidence                           |
| `refreshSessions`                 | Hashed session tokens and device metadata           | Logout, revocation, expiry, closure        | TBD                | Revocation and expiry verification                    |
| `securityEvents`                  | Authentication/security event metadata              | Event creation                             | TBD                | Time-bounded purge report                             |
| `helpRequests`                    | Draft/public request content and need items         | Cancellation, rejection, expiry, closure   | TBD                | Status-aware purge/anonymization report               |
| `helpOffers`                      | Pledge details and workflow state                   | Rejection, withdrawal, completion, dispute | TBD                | Relationship-safe purge/anonymization report          |
| `conversations`                   | Participant relationships and state                 | Closure or account closure                 | TBD                | Participant-reference review                          |
| `messages`                        | Private message content and safety flags            | Conversation closure or account closure    | TBD                | Message purge/anonymization report                    |
| `completionEvidence`              | Completion notes and storage references             | Decision, expiry, or closure               | TBD                | DB and object-store deletion proof                    |
| `evidenceUploads`                 | Private upload metadata                             | Attachment, expiry, or cleanup failure     | TBD                | Object-store deletion and retry report                |
| `notifications`                   | Event metadata, no private message bodies           | Read/expiry                                | TBD                | TTL-index and expiry sampling                         |
| `verificationRecords`             | Identity review state and notice version            | Decision, expiry, closure                  | TBD                | Record purge/anonymization report                     |
| `verificationUploads`             | Highly sensitive identity-file metadata             | Decision, expiry, purge queue              | TBD                | Object deletion, retry, and backup handling proof     |
| `platformDonations`               | Platform-only donation and provider references      | Settlement, refund, dispute                | TBD                | Finance/legal-approved archive or purge evidence      |
| `donationRefunds`                 | Refund workflow and provider references             | Settlement/failure                         | TBD                | Reconciliation and archive evidence                   |
| `donationWebhookEvents`           | Idempotency and provider event metadata             | Processing completion                      | TBD                | Replay-safe expiry verification                       |
| `reports`                         | Safety reports and review outcomes                  | Resolution/dismissal                       | TBD                | Case retention and redaction review                   |
| `userBlocks`                      | Directed safety relationships                       | Unblock or closure                         | TBD                | Relationship removal evidence                         |
| `giveawayItems`                   | Free-item listings                                  | Given, removed, or closure                 | TBD                | Listing purge/anonymization report                    |
| `giveawayReservations`            | Handoff participant/workflow data                   | Completion/cancellation                    | TBD                | Two-party reference review                            |
| `communityMissions`               | Mission content, moderation, resources              | Completion/cancellation/rejection          | TBD                | Public-history decision and purge report              |
| `missionContributions`            | Volunteer commitments and completion                | Completion/withdrawal/cancellation         | TBD                | Participant-reference review                          |
| `idempotencyRecords`              | Request fingerprints and bounded responses          | Configured expiry                          | TBD                | TTL-index verification                                |
| `auditLogs`                       | Privileged-action metadata and keyed IP hashes      | Event creation                             | TBD                | Restricted archive/purge report and legal-hold check  |
| `dataSubjectRequests`             | Privacy request details, assignments, outcomes      | Resolution/cancellation                    | TBD                | Case-file archive/purge report                        |
| Private object storage            | Evidence and identity objects                       | Record-specific expiry/purge               | TBD                | Version-aware deletion and lifecycle report           |
| Transactional email provider      | Delivery metadata and message bodies                | Delivery or provider-defined event         | TBD                | Processor deletion/retention evidence                 |
| Payment provider                  | Platform donation/customer metadata                 | Provider/legal/accounting trigger          | TBD                | Processor retention confirmation                      |
| AI provider (disabled by default) | Sanitized request-structuring input/output metadata | Request completion                         | TBD                | Provider retention configuration evidence             |
| Application/log sink              | Structured logs and keyed IP hashes                 | Log ingestion                              | TBD                | Sink lifecycle rule and deletion sample               |
| Database/object backups           | Encrypted recovery copies                           | Backup creation/supersession               | TBD                | Restore drill plus expiry/destruction evidence        |

## Approval fields

- Privacy owner: TBD
- Legal reviewer: TBD
- Security reviewer: TBD
- Operations owner: TBD
- Policy version: TBD
- Effective date: TBD
- Next review date: TBD
- Legal-hold procedure: TBD
- Backup deletion/expiry procedure: TBD
- Third-party processor request procedure: TBD
- Data-subject export delivery procedure: TBD

## Change discipline

Any new collection, provider, log field, analytics sink, storage prefix, or
backup path must update this inventory before deployment. An approved period is
not sufficient by itself: the disposal job, failure alert, recovery path, legal
hold, and audit evidence must be implemented and tested.
