import { randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { EvidenceUpload } from "../models/EvidenceUpload.js";
import { AppError } from "../utils/AppError.js";
import {
  MAX_EVIDENCE_FILE_BYTES,
  validateEvidenceFile,
} from "../utils/evidenceFiles.js";

function missingObject(error) {
  return (
    error?.name === "NotFound" ||
    error?.name === "NoSuchKey" ||
    error?.$metadata?.httpStatusCode === 404
  );
}

export class EvidenceStorageRepository {
  constructor(config = {}) {
    this.config = config;
    this.enabled = Boolean(
      config.storageBucket &&
      config.storageRegion &&
      config.storageAccessKeyId &&
      config.storageSecretAccessKey,
    );
    this.client = this.enabled
      ? new S3Client({
          region: config.storageRegion,
          ...(config.storageEndpoint
            ? {
                endpoint: config.storageEndpoint,
                forcePathStyle: true,
              }
            : {}),
          credentials: {
            accessKeyId: config.storageAccessKeyId,
            secretAccessKey: config.storageSecretAccessKey,
          },
        })
      : null;
  }

  requireStorage() {
    if (!this.enabled)
      throw new AppError({
        statusCode: 503,
        code: "EVIDENCE_STORAGE_UNAVAILABLE",
        message: "Private proof attachments are not configured on this server",
      });
  }

  async upload({ offerId, helperId, bytes, mimeType, name, now }) {
    this.requireStorage();
    const verified = validateEvidenceFile({ bytes, mimeType, name });
    const key = `completion/${randomUUID()}`;
    const upload = await EvidenceUpload.create({
      offerId,
      helperId,
      key,
      ...verified,
      uploadedAt: now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
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
        Metadata: { offerid: String(offerId), helperid: String(helperId) },
      }),
    );
    return { id: String(upload._id), ...verified };
  }

  async verifyForSubmission({ offerId, helperId, ids, now, session }) {
    if (!ids.length) return [];
    this.requireStorage();
    const uploads = await EvidenceUpload.find({
      _id: { $in: ids },
      offerId,
      helperId,
      attachedAt: null,
      deletingAt: null,
      uploadedAt: { $gte: new Date(now.getTime() - 60 * 60 * 1000) },
    })
      .select("+key")
      .session(session)
      .lean()
      .exec();
    if (uploads.length !== ids.length) return null;
    const byId = new Map(uploads.map((upload) => [String(upload._id), upload]));
    const heads = await Promise.all(
      ids.map((id) => {
        const upload = byId.get(String(id));
        return this.client
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
      }),
    );
    const files = [];
    for (let index = 0; index < ids.length; index += 1) {
      const upload = byId.get(String(ids[index]));
      const head = heads[index];
      if (
        !upload ||
        !head ||
        upload.size > MAX_EVIDENCE_FILE_BYTES ||
        head.ContentLength !== upload.size ||
        head.ContentType !== upload.mimeType ||
        head.Metadata?.offerid !== String(offerId) ||
        head.Metadata?.helperid !== String(helperId)
      )
        return null;
      files.push({
        id: String(upload._id),
        name: upload.name,
        mimeType: upload.mimeType,
        size: upload.size,
      });
    }
    return files;
  }

  async markAttached({ offerId, helperId, ids, now, session }) {
    if (!ids.length) return;
    const result = await EvidenceUpload.updateMany(
      {
        _id: { $in: ids },
        offerId,
        helperId,
        attachedAt: null,
        deletingAt: null,
      },
      { $set: { attachedAt: now, expiresAt: null, updatedAt: now } },
      { session, runValidators: true },
    );
    if (result.modifiedCount !== ids.length)
      throw new Error("Evidence upload ownership changed before attachment");
  }

  async read(id) {
    this.requireStorage();
    const upload = await EvidenceUpload.findById(id)
      .select("+key")
      .lean()
      .exec();
    if (!upload?.attachedAt || upload.size > MAX_EVIDENCE_FILE_BYTES)
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
    if (!response) return null;
    if (
      response.ContentLength !== upload.size ||
      response.ContentType !== upload.mimeType
    )
      return null;
    const bytes = Buffer.from(await response.Body.transformToByteArray());
    if (bytes.length !== upload.size) return null;
    return { bytes, name: upload.name, mimeType: upload.mimeType };
  }

  async cleanupExpired(now = new Date()) {
    if (!this.enabled) return 0;
    const rows = await EvidenceUpload.find({
      attachedAt: null,
      expiresAt: { $lte: now },
      $or: [
        { deletingAt: null },
        { deletingAt: { $lte: new Date(now.getTime() - 60 * 60 * 1000) } },
      ],
    })
      .select("+key")
      .limit(100)
      .lean()
      .exec();
    let removed = 0;
    for (const row of rows) {
      if (!row.key?.startsWith("completion/")) continue;
      const claimed = await EvidenceUpload.findOneAndUpdate(
        {
          _id: row._id,
          attachedAt: null,
          expiresAt: row.expiresAt,
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
      const result = await EvidenceUpload.deleteOne({
        _id: row._id,
        attachedAt: null,
        deletingAt: now,
      });
      removed += result.deletedCount;
    }
    return removed;
  }

  close() {
    this.client?.destroy();
  }
}
