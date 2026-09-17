import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidenceUpload } from "../src/models/EvidenceUpload.js";
import { EvidenceStorageRepository } from "../src/repositories/evidenceStorage.repository.js";

const config = {
  storageEndpoint: "https://private-storage.example",
  storageRegion: "ap-southeast-1",
  storageBucket: "private-evidence",
  storageAccessKeyId: "test-access-id",
  storageSecretAccessKey: "test-secret-key",
};

afterEach(() => vi.restoreAllMocks());

describe("private completion object storage", () => {
  it("requires storage configuration for uploads", async () => {
    const storage = new EvidenceStorageRepository();
    await expect(storage.upload({})).rejects.toMatchObject({
      code: "EVIDENCE_STORAGE_UNAVAILABLE",
    });
    expect(await storage.verifyForSubmission({ ids: [] })).toEqual([]);
  });

  it("writes a random private object key and keeps the key out of the response", async () => {
    const storage = new EvidenceStorageRepository(config);
    const send = vi.fn(async () => ({}));
    storage.client = { send };
    const create = vi.spyOn(EvidenceUpload, "create").mockResolvedValue({
      _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
    });
    const now = new Date("2026-09-15T11:00:00Z");
    const result = await storage.upload({
      offerId: "bbbbbbbbbbbbbbbbbbbbbbbb",
      helperId: "cccccccccccccccccccccccc",
      bytes: Buffer.from("89504e470d0a1a0a0000000049454e44", "hex"),
      mimeType: "image/png",
      name: "proof.png",
      now,
    });
    expect(result).toMatchObject({
      id: "aaaaaaaaaaaaaaaaaaaaaaaa",
      name: "proof.png",
      mimeType: "image/png",
    });
    expect(result).not.toHaveProperty("key");
    expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
    const put = send.mock.calls[0][0].input;
    expect(put).toMatchObject({
      Bucket: "private-evidence",
      ContentType: "image/png",
      Metadata: {
        offerid: "bbbbbbbbbbbbbbbbbbbbbbbb",
        helperid: "cccccccccccccccccccccccc",
      },
    });
    expect(put.Key).toMatch(/^completion\/[0-9a-f-]{36}$/);
    expect(put).not.toHaveProperty("ACL");
    expect(create.mock.calls[0][0].key).toBe(put.Key);
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(
      send.mock.invocationCallOrder[0],
    );
  });

  it("rejects a stored object whose HEAD metadata no longer matches its owner or size", async () => {
    const storage = new EvidenceStorageRepository(config);
    const send = vi.fn(async (command) => {
      expect(command).toBeInstanceOf(HeadObjectCommand);
      return {
        ContentLength: 15,
        ContentType: "image/png",
        Metadata: {
          offerid: "bbbbbbbbbbbbbbbbbbbbbbbb",
          helperid: "wrong-helper",
        },
      };
    });
    storage.client = { send };
    const chain = {
      select() {
        return this;
      },
      session() {
        return this;
      },
      lean() {
        return this;
      },
      async exec() {
        return [
          {
            _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
            key: "completion/test-key",
            name: "proof.png",
            mimeType: "image/png",
            size: 16,
          },
        ];
      },
    };
    vi.spyOn(EvidenceUpload, "find").mockReturnValue(chain);
    const result = await storage.verifyForSubmission({
      offerId: "bbbbbbbbbbbbbbbbbbbbbbbb",
      helperId: "cccccccccccccccccccccccc",
      ids: ["aaaaaaaaaaaaaaaaaaaaaaaa"],
      now: new Date("2026-09-15T11:00:00Z"),
      session: null,
    });
    expect(result).toBeNull();
  });

  it("deletes only claimed expired upload keys within the evidence prefix", async () => {
    const storage = new EvidenceStorageRepository(config);
    const send = vi.fn(async () => ({}));
    storage.client = { send };
    const expired = new Date("2026-09-14T11:00:00Z");
    const query = {
      select() {
        return this;
      },
      limit() {
        return this;
      },
      lean() {
        return this;
      },
      async exec() {
        return [
          {
            _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
            key: "other/unsafe",
            expiresAt: expired,
          },
          {
            _id: "bbbbbbbbbbbbbbbbbbbbbbbb",
            key: "completion/known-key",
            expiresAt: expired,
          },
        ];
      },
    };
    const claim = {
      select() {
        return this;
      },
      lean() {
        return this;
      },
      async exec() {
        return { _id: "bbbbbbbbbbbbbbbbbbbbbbbb" };
      },
    };
    vi.spyOn(EvidenceUpload, "find").mockReturnValue(query);
    vi.spyOn(EvidenceUpload, "findOneAndUpdate").mockReturnValue(claim);
    vi.spyOn(EvidenceUpload, "deleteOne").mockResolvedValue({
      deletedCount: 1,
    });
    const removed = await storage.cleanupExpired(
      new Date("2026-09-15T11:00:00Z"),
    );
    expect(removed).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
    expect(send.mock.calls[0][0].input.Key).toBe("completion/known-key");
  });
});
