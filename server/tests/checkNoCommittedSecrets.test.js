import { describe, expect, it } from "vitest";

import { inspectTrackedFile } from "../scripts/checkNoCommittedSecrets.js";

describe("committed-secret checks", () => {
  it("rejects private environment and credential files", () => {
    expect(inspectTrackedFile("server/.env")).toContain("environment file");
    expect(inspectTrackedFile("client/.env.local")).toContain(
      "environment file",
    );
    expect(inspectTrackedFile("credentials/release.keystore")).toContain(
      "credential file extension",
    );
    expect(inspectTrackedFile("server/.env.example")).toEqual([]);
  });

  it("detects high-confidence credential material without returning its value", () => {
    const openAiProjectKey = [
      "sk",
      "proj",
      "abcdefghijklmnopqrstuvwxyz1234567890",
    ].join("-");
    const privateKey = `${["-----BEGIN", "PRIVATE", "KEY-----"].join(" ")}\nsecret\n-----END PRIVATE KEY-----`;

    expect(
      inspectTrackedFile(
        "server/config.txt",
        `OPENAI_API_KEY=${openAiProjectKey}`,
      ),
    ).toEqual(["OpenAI project key"]);
    expect(inspectTrackedFile("cert.txt", privateKey)).toEqual(["private key"]);
    expect(
      inspectTrackedFile(
        "server/.env.example",
        "OPENAI_API_KEY=replace-with-provider-key",
      ),
    ).toEqual([]);
    expect(
      inspectTrackedFile(
        "server/config.txt",
        `Example value is documented above.\nOPENAI_API_KEY=${openAiProjectKey}`,
      ),
    ).toEqual(["OpenAI project key"]);
  });
});
