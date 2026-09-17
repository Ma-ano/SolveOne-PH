import { describe, expect, it } from "vitest";

import { sanitizeAiInput } from "../src/utils/sanitizeAiInput.js";

describe("sanitizeAiInput", () => {
  it("removes every prohibited data class before provider use", () => {
    const source = [
      "Please help with school enrollment.",
      "Email maria@example.com and phone 0917-123-4567.",
      "Address: 12 Mabini Street, Barangay Central.",
      "Passport number P1234567.",
      "Password: super-secret-123.",
      "GCash account number 09171234567.",
    ].join("\n");
    const result = sanitizeAiInput(source);

    expect(result.redactions).toEqual(
      expect.arrayContaining([
        "email",
        "phone number",
        "precise address",
        "ID number",
        "authentication data",
        "payment information",
      ]),
    );
    for (const secret of [
      "maria@example.com",
      "0917-123-4567",
      "12 Mabini Street",
      "P1234567",
      "super-secret-123",
      "09171234567",
    ]) {
      expect(result.sanitized).not.toContain(secret);
    }
  });
});
