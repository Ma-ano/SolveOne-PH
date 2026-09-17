import { createHash, randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { VerificationRecord } from "../models/VerificationRecord.js";
import { VerificationUpload } from "../models/VerificationUpload.js";
import { AppError } from "../utils/AppError.js";
import {
  MAX_IDENTITY_FILE_BYTES,
  validateIdentityImage,
} from "../utils/identityFiles.js";

function missingObject(error) {
  return (
    error?.name === "NotFound" ||
    error?.name === "NoSuchKey" ||
    error?.$metadata?.httpStatusCode === 404
  );
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export class VerificationStorageRepository {
  constructor(config = {}, { client } = {}) {
    this.config = config;
    this.enabled = Boolean(
      config.storageBucket &&
      config.storageRegion &&
      config.storageAccessKeyId &&
      config.storageSecretAccessKey,
    );
    this.client =
      client ??
      (this.enabled
        ? new S3Client({
            region: config.storageRegion,
            ...(config.storageEndpoint
              ? { endpoint: config.storageEndpoint, forcePathStyle: true }
              : {}),
            credentials: {
              accessKeyId: config.storageAccessKeyId,
              secretAccessKey: config.storageSecretAccessKey,
            },
          })
        : null);
    this.ownsClient = !client;
  }

  requireStorage() {
    if (!this.enabled)
      throw new AppError({
        statusCode: 503,
        code: "IDENTITY_STORAGE_UNAVAILABLE",
        message: "Identity document storage is not available",
      });
  }

  async upload({ ownerId, bytes, mimeType, privacyNoticeVersion, now }) {
    this.requireStorage();
    const verified = validateIdentityImage(bytes, mimeType);
    const key = `identity/${randomUUID()}`;
    const digest = sha256(bytes);
    const upload = await VerificationUpload.create({
      ownerId,
      key,
      sha256: digest,
      ...verified,
      scannedAt: now,
      acknowledgedAt: now,
      privacyNoticeVersion,
      uploadedAt: now,
      purgeAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    });
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.storageBucket,
        Key: key,
        Body: bytes,
        ContentLength: verified.size,
        ContentType: verified.mimeType,
        ServerSideEncryption: "AES256",
        Metadata: { ownerid: String(ownerId), sha256: digest },
      }),
    );
    return { id: String(upload._id), ...verified };
  }

  async verifyForSubmission({
    ownerId,
    ids,
    privacyNoticeVersion,
    now,
    session,
  }) {
    if (!ids.length) return [];
    this.requireStorage();
    const uploads = await VerificationUpload.find({
      _id: { $in: ids },
      ownerId,
      privacyNoticeVersion,
      attachedRecordId: null,
      deletingAt: null,
      uploadedAt: { $gte: new Date(now.getTime() - 60 * 60 * 1000) },
      purgeAt: { $gt: now },
    })
      .select("+key +sha256")
      .session(session)
      .lean()
      .exec();
    if (uploads.length !== ids.length) return null;
    const byId = new Map(uploads.map((upload) => [String(upload._id), upload]));
    const documents = [];
    for (const id of ids) {
      const upload = byId.get(String(id));
      if (!upload || !upload.key?.startsWith("identity/")) return null;
      const head = await this.client
        .send(
          new HeadObjectCommand({
            Bucket: this.config.storageBucket,
            Key: upload.key,
          }),
        )
        .catch((error) => {
          if (missingObject(error)) return null;
          throw error;
        });
      if (
        !head ||
        head.ContentLength !== upload.size ||
        head.ContentType !== upload.mimeType ||
        head.ServerSideEncryption !== "AES256" ||
        head.Metadata?.ownerid !== String(ownerId) ||
        head.Metadata?.sha256 !== upload.sha256
      )
        return null;
      documents.push({
        uploadId: upload._id,
        mimeType: upload.mimeType,
        size: upload.size,
      });
    }
    return documents;
  }

  async markAttached({ ownerId, ids, recordId, now, session }) {
    const result = await VerificationUpload.updateMany(
      {
        _id: { $in: ids },
        ownerId,
        attachedRecordId: null,
        deletingAt: null,
      },
      {
        $set: {
          attachedRecordId: recordId,
          purgeAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          updatedAt: now,
        },
      },
      { session, runValidators: true },
    );
    if (result.modifiedCount !== ids.length)
      throw new Error("Identity upload ownership changed before attachment");
  }

  async read({ recordId, uploadId, ownerId }) {
    this.requireStorage();
    const upload = await VerificationUpload.findOne({
      _id: uploadId,
      ownerId,
      attachedRecordId: recordId,
      deletingAt: null,
    })
      .select("+key +sha256")
      .lean()
      .exec();
    if (
      !upload?.key?.startsWith("identity/") ||
      upload.size > MAX_IDENTITY_FILE_BYTES
    )
      return null;
    const response = await this.client
      .send(
        new GetObjectCommand({
          Bucket: this.config.storageBucket,
          Key: upload.key,
        }),
      )
      .catch((error) => {
        if (missingObject(error)) return null;
        throw error;
      });
    if (
      !response ||
      response.ContentLength !== upload.size ||
      response.ContentType !== upload.mimeType ||
      response.ServerSideEncryption !== "AES256" ||
      response.Metadata?.ownerid !== String(ownerId) ||
      response.Metadata?.sha256 !== upload.sha256
    )
      return null;
    const bytes = Buffer.from(await response.Body.transformToByteArray());
    if (bytes.length !== upload.size || sha256(bytes) !== upload.sha256)
      return null;
    return { bytes, mimeType: upload.mimeType };
  }

  async cleanupExpired(now = new Date()) {
    if (!this.enabled) return 0;
    const rows = await VerificationUpload.find({
      purgeAt: { $lte: now },
      $or: [
        { deletingAt: null },
        { deletingAt: { $lte: new Date(now.getTime() - 60 * 60 * 1000) } },
      ],
    })
      .select("+key")
      .limit(50)
      .lean()
      .exec();
    let removed = 0;
    for (const row of rows) {
      if (!row.key?.startsWith("identity/")) continue;
      if (row.attachedRecordId) {
        const record = await VerificationRecord.findById(row.attachedRecordId)
          .select("status")
          .lean()
          .exec();
        if (record?.status === "pending") continue;
      }
      const claimed = await VerificationUpload.findOneAndUpdate(
        {
          _id: row._id,
          key: row.key,
          purgeAt: row.purgeAt,
          deletingAt: row.deletingAt ?? null,
        },
        { $set: { deletingAt: now, updatedAt: now } },
        { new: true },
      )
        .select("_id")
        .lean()
        .exec();
      if (!claimed) continue;
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.storageBucket,
          Key: row.key,
        }),
      );
      const result = await VerificationUpload.deleteOne({
        _id: row._id,
        deletingAt: now,
      });
      removed += result.deletedCount;
      if (result.deletedCount && row.attachedRecordId) {
        const remaining = await VerificationUpload.exists({
          attachedRecordId: row.attachedRecordId,
        });
        if (!remaining)
          await VerificationRecord.updateOne(
            { _id: row.attachedRecordId, documentsPurgedAt: null },
            { $set: { documentsPurgedAt: now, updatedAt: now } },
          );
      }
    }
    return removed;
  }

  close() {
    if (this.ownsClient) this.client?.destroy();
  }
}
