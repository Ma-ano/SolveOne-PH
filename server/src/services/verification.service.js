import { hashIpAddress } from "../utils/authCrypto.js";
import { AppError } from "../utils/AppError.js";
import {
  MAX_IDENTITY_FILE_BYTES,
  MAX_IDENTITY_FILES,
  validateIdentityImage,
} from "../utils/identityFiles.js";
import { decodePageCursor, encodePageCursor } from "../utils/pageCursor.js";
import {
  serializeOwnVerification,
  serializeReviewVerification,
} from "../serializers/verification.serializer.js";

function verificationError(statusCode, code, message) {
  return new AppError({ statusCode, code, message });
}

function notFound() {
  return verificationError(
    404,
    "VERIFICATION_NOT_FOUND",
    "Verification not found",
  );
}

export class VerificationService {
  constructor({
    repository,
    scanner,
    config,
    publisher,
    clock = () => new Date(),
  }) {
    this.repository = repository;
    this.scanner = scanner;
    this.config = config;
    this.publisher = publisher;
    this.clock = clock;
  }

  requireEnabled() {
    if (!this.config.identityProcessingEnabled)
      throw verificationError(
        503,
        "IDENTITY_VERIFICATION_UNAVAILABLE",
        "Identity verification is not open for submissions",
      );
  }

  requireReviewer(actor) {
    if (!["moderator", "admin"].includes(actor.role))
      throw verificationError(
        403,
        "FORBIDDEN",
        "Review permission is required",
      );
  }

  ipHash(ipAddress) {
    return hashIpAddress(ipAddress, this.config.ipHashSecret);
  }

  async requirements(userId) {
    const eligible = await this.repository.findEligibleOwner(userId);
    const pending = await this.repository.findPendingOwner(userId);
    return {
      enabled: Boolean(this.config.identityProcessingEnabled),
      eligible: Boolean(eligible && !pending),
      privacyNoticeVersion: this.config.identityProcessingEnabled
        ? this.config.identityPrivacyNoticeVersion
        : null,
      privacyNoticeUrl: this.config.identityProcessingEnabled
        ? this.config.identityPrivacyNoticeUrl
        : null,
      allowedMimeTypes: ["image/jpeg", "image/png"],
      maxFileBytes: MAX_IDENTITY_FILE_BYTES,
      maxFiles: MAX_IDENTITY_FILES,
      purpose:
        "Optional identity review only. Only assigned reviewers can inspect documents. Images are queued for deletion after review; unreviewed cases expire after 30 days.",
    };
  }

  async latestOwn(userId) {
    return {
      verification: serializeOwnVerification(
        await this.repository.findLatestOwner(userId),
      ),
    };
  }

  async upload(
    userId,
    { bytes, mimeType, acknowledged, privacyNoticeVersion },
  ) {
    this.requireEnabled();
    if (
      acknowledged !== true ||
      privacyNoticeVersion !== this.config.identityPrivacyNoticeVersion
    )
      throw verificationError(
        422,
        "IDENTITY_NOTICE_REQUIRED",
        "Acknowledge the current identity privacy notice before uploading",
      );
    if (
      !(await this.repository.findEligibleOwner(userId)) ||
      (await this.repository.findPendingOwner(userId))
    )
      throw verificationError(
        409,
        "IDENTITY_NOT_ELIGIBLE",
        "Identity submission is not available for this account",
      );
    validateIdentityImage(bytes, mimeType);
    await this.scanner.scan(bytes);
    const upload = await this.repository.upload({
      ownerId: userId,
      bytes,
      mimeType,
      privacyNoticeVersion,
      now: this.clock(),
    });
    return { upload };
  }

  async submit(userId, input) {
    this.requireEnabled();
    const result = await this.repository.submit({
      ownerId: userId,
      ids: input.uploadIds,
      privacyNoticeVersion: this.config.identityPrivacyNoticeVersion,
      now: this.clock(),
    });
    if (result.outcome === "invalid_upload")
      throw verificationError(
        422,
        "IDENTITY_UPLOAD_INVALID",
        "Documents must be recent, safe uploads owned by this account",
      );
    if (["already_pending", "unavailable"].includes(result.outcome))
      throw verificationError(
        409,
        "IDENTITY_NOT_ELIGIBLE",
        "Identity submission is not available for this account",
      );
    return {
      verification: serializeOwnVerification(result.record),
      replayed: result.outcome === "replayed",
    };
  }

  async listQueue(actor, query) {
    this.requireReviewer(actor);
    const scope = `identity-review:${actor.userId}`;
    const now = this.clock();
    const page = await this.repository.listQueue({
      reviewerId: actor.userId,
      limit: query.limit,
      cursor: decodePageCursor(query.cursor, scope),
    });
    const last = page.items.at(-1);
    return {
      items: page.items.map((item) =>
        serializeReviewVerification(item, actor.userId, now),
      ),
      pageInfo: {
        hasNextPage: page.hasNextPage,
        nextCursor:
          page.hasNextPage && last
            ? encodePageCursor({
                scope,
                date: last.submittedAt,
                id: last._id,
              })
            : null,
      },
    };
  }

  async claim(actor, recordId, { ipAddress } = {}) {
    this.requireReviewer(actor);
    const result = await this.repository.claim({
      reviewerId: actor.userId,
      recordId,
      ipHash: this.ipHash(ipAddress),
      now: this.clock(),
    });
    if (result.outcome === "claimed_elsewhere")
      throw verificationError(
        409,
        "VERIFICATION_CLAIMED",
        "Another reviewer currently has this case",
      );
    if (result.outcome !== "claimed") throw notFound();
    return {
      verification: serializeReviewVerification(
        result.record,
        actor.userId,
        this.clock(),
      ),
    };
  }

  async document(actor, recordId, uploadId, { ipAddress } = {}) {
    this.requireReviewer(actor);
    const file = await this.repository.readDocument({
      reviewerId: actor.userId,
      recordId,
      uploadId,
      ipHash: this.ipHash(ipAddress),
      now: this.clock(),
    });
    if (!file) throw notFound();
    return file;
  }

  async decide(actor, recordId, decision, reason, { ipAddress } = {}) {
    this.requireReviewer(actor);
    const result = await this.repository.decide({
      reviewerId: actor.userId,
      recordId,
      decision,
      reason,
      ipHash: this.ipHash(ipAddress),
      now: this.clock(),
    });
    if (result.outcome === "state_changed")
      throw verificationError(
        409,
        "VERIFICATION_STATE_CHANGED",
        "Review state changed; reload before deciding",
      );
    if (result.outcome === "documents_unreviewed")
      throw verificationError(
        409,
        "VERIFICATION_DOCUMENTS_UNREVIEWED",
        "Open every attached image before deciding",
      );
    if (result.outcome !== "decided") throw notFound();
    if (result.notification)
      this.publisher?.publishNotification?.({
        recipientId: result.notification.recipientId,
        notificationId: result.notification._id,
      });
    return {
      verification: {
        id: String(result.record._id),
        status: result.record.status,
        reviewedAt: new Date(result.record.reviewedAt).toISOString(),
      },
    };
  }

  async expirePending() {
    return this.repository.expirePending(this.clock());
  }
}
