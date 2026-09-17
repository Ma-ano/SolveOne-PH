import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VerificationRecord } from "../src/models/VerificationRecord.js";
import { VerificationUpload } from "../src/models/VerificationUpload.js";
import { VerificationStorageRepository } from "../src/repositories/verificationStorage.repository.js";

const config = {
  storageRegion: "ap-southeast-1",
  storageBucket: "private-documents",
  storageAccessKeyId: "test-access-id",
  storageSecretAccessKey: "test-secret-key",
};
const ownerId = "111111111111111111111111";
const uploadId = "222222222222222222222222";
const recordId = "333333333333333333333333";
const now = new Date("2026-09-16T12:00:00Z");
const bytes = Buffer.concat([
  Buffer.from("ffd8ff", "hex"),
  Buffer.alloc(20),
  Buffer.from("ffd9", "hex"),
]);

function chain(result) {
  return {
    select() {
      return this;
    },
    session() {
      return this;
    },
    lean() {
      return this;
    },
    limit() {
      return this;
    },
    async exec() {
      return result;
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("private identity object storage", () => {
  it("persists purge metadata before an encrypted, randomly keyed S3 write", async () => {
    const send = vi.fn(async () => ({}));
    const storage = new VerificationStorageRepository(config, {
      client: { send },
    });
    const create = vi
      .spyOn(VerificationUpload, "create")
      .mockResolvedValue({ _id: uploadId });
    const uploaded = await storage.upload({
      ownerId,
      bytes,
      mimeType: "image/jpeg",
      privacyNoticeVersion: "identity-v1",
      now,
    });
    expect(uploaded).toEqual({
      id: uploadId,
      size: bytes.length,
      mimeType: "image/jpeg",
    });
    expect(uploaded).not.toHaveProperty("key");
    expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
    const put = send.mock.calls[0][0].input;
    expect(put.Key).toMatch(/^identity\/[0-9a-f-]{36}$/);
    expect(put.ServerSideEncryption).toBe("AES256");
    expect(put).not.toHaveProperty("ACL");
    expect(put.Metadata).toMatchObject({
      ownerid: ownerId,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(create.mock.calls[0][0].purgeAt).toEqual(
      new Date(now.getTime() + 24 * 60 * 60 * 1000),
    );
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(
      send.mock.invocationCallOrder[0],
    );
  });

  it("refuses submission if S3 metadata no longer agrees with an owned upload", async () => {
    const send = vi.fn(async (command) => {
      expect(command).toBeInstanceOf(HeadObjectCommand);
      return {
        ContentLength: bytes.length,
        ContentType: "image/jpeg",
        ServerSideEncryption: "AES256",
        Metadata: { ownerid: "another-owner", sha256: "a".repeat(64) },
      };
    });
    const storage = new VerificationStorageRepository(config, {
      client: { send },
    });
    vi.spyOn(VerificationUpload, "find").mockReturnValue(
      chain([
        {
          _id: uploadId,
          ownerId,
          key: "identity/random",
          sha256: "a".repeat(64),
          size: bytes.length,
          mimeType: "image/jpeg",
        },
      ]),
    );
    const result = await storage.verifyForSubmission({
      ownerId,
      ids: [uploadId],
      privacyNoticeVersion: "identity-v1",
      now,
      session: null,
    });
    expect(result).toBeNull();
    expect(VerificationUpload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId,
        privacyNoticeVersion: "identity-v1",
        attachedRecordId: null,
        deletingAt: null,
      }),
    );
  });

  it("cannot return bytes from a different record or an unencrypted object", async () => {
    const send = vi.fn(async (command) => {
      expect(command).toBeInstanceOf(GetObjectCommand);
      return {
        ContentLength: bytes.length,
        ContentType: "image/jpeg",
        ServerSideEncryption: undefined,
        Metadata: { ownerid: ownerId, sha256: "a".repeat(64) },
        Body: { transformToByteArray: async () => bytes },
      };
    });
    const storage = new VerificationStorageRepository(config, {
      client: { send },
    });
    vi.spyOn(VerificationUpload, "findOne").mockReturnValue(
      chain({
        _id: uploadId,
        ownerId,
        attachedRecordId: recordId,
        key: "identity/random",
        sha256: "a".repeat(64),
        size: bytes.length,
        mimeType: "image/jpeg",
      }),
    );
    expect(await storage.read({ recordId, uploadId, ownerId })).toBeNull();
    expect(VerificationUpload.findOne).toHaveBeenCalledWith({
      _id: uploadId,
      ownerId,
      attachedRecordId: recordId,
      deletingAt: null,
    });
  });

  it("deletes only due, claimed identity keys after attached cases resolve", async () => {
    const send = vi.fn(async () => ({}));
    const storage = new VerificationStorageRepository(config, {
      client: { send },
    });
    vi.spyOn(VerificationUpload, "find").mockReturnValue(
      chain([
        { _id: "aaaaaaaaaaaaaaaaaaaaaaaa", key: "other/unsafe", purgeAt: now },
        {
          _id: uploadId,
          key: "identity/random",
          purgeAt: now,
          attachedRecordId: recordId,
          deletingAt: null,
        },
      ]),
    );
    const record = vi
      .spyOn(VerificationRecord, "findById")
      .mockReturnValue(chain({ _id: recordId, status: "pending" }));
    expect(await storage.cleanupExpired(now)).toBe(0);
    expect(send).not.toHaveBeenCalled();
    record.mockReturnValue(chain({ _id: recordId, status: "approved" }));
    vi.spyOn(VerificationUpload, "findOneAndUpdate").mockReturnValue(
      chain({ _id: uploadId }),
    );
    vi.spyOn(VerificationUpload, "deleteOne").mockResolvedValue({
      deletedCount: 1,
    });
    vi.spyOn(VerificationUpload, "exists").mockResolvedValue(null);
    vi.spyOn(VerificationRecord, "updateOne").mockResolvedValue({
      modifiedCount: 1,
    });
    expect(await storage.cleanupExpired(now)).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
    expect(send.mock.calls[0][0].input.Key).toBe("identity/random");
    expect(VerificationRecord.updateOne).toHaveBeenCalledWith(
      { _id: recordId, documentsPurgedAt: null },
      { $set: { documentsPurgedAt: now, updatedAt: now } },
    );
  });

  it("also purges a due object when its attached case record is gone", async () => {
    const send = vi.fn(async () => ({}));
    const storage = new VerificationStorageRepository(config, {
      client: { send },
    });
    vi.spyOn(VerificationUpload, "find").mockReturnValue(
      chain([
        {
          _id: uploadId,
          key: "identity/orphan",
          purgeAt: now,
          attachedRecordId: recordId,
          deletingAt: null,
        },
      ]),
    );
    vi.spyOn(VerificationRecord, "findById").mockReturnValue(chain(null));
    vi.spyOn(VerificationUpload, "findOneAndUpdate").mockReturnValue(
      chain({ _id: uploadId }),
    );
    vi.spyOn(VerificationUpload, "deleteOne").mockResolvedValue({
      deletedCount: 1,
    });
    vi.spyOn(VerificationUpload, "exists").mockResolvedValue(null);
    vi.spyOn(VerificationRecord, "updateOne").mockResolvedValue({
      modifiedCount: 0,
    });
    expect(await storage.cleanupExpired(now)).toBe(1);
    expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
    expect(send.mock.calls[0][0].input.Key).toBe("identity/orphan");
  });
});
