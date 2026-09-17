import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  parsePayMongoEvent,
  PayMongoProvider,
  verifyPayMongoSignature,
} from "../src/providers/payMongo.provider.js";

const donationId = "111111111111111111111111";
const timestamp = 1789584000;
const now = new Date(timestamp * 1000);
const secret = "endpoint-signing-secret";

function signature(bytes, mode = "test", at = timestamp) {
  const digest = createHmac("sha256", secret)
    .update(`${at}.`)
    .update(bytes)
    .digest("hex");
  const other = "0".repeat(64);
  return `t=${at},te=${mode === "test" ? digest : other},li=${
    mode === "live" ? digest : other
  }`;
}

function paidEvent(overrides = {}) {
  return {
    data: {
      id: "evt_payment123",
      type: "event",
      attributes: {
        type: "checkout_session.payment.paid",
        livemode: false,
        data: {
          id: "cs_checkout123",
          type: "checkout_session",
          attributes: {
            reference_number: donationId,
            livemode: false,
            metadata: { solveone_purpose: "platform" },
            payments: [
              {
                id: "pay_payment123",
                type: "payment",
                attributes: {
                  status: "paid",
                  amount: 25000,
                  currency: "PHP",
                  livemode: false,
                  ...overrides,
                },
              },
            ],
          },
        },
      },
    },
  };
}

describe("PayMongo provider boundary", () => {
  it("validates the correct mode signature over the exact, fresh raw bytes", () => {
    const bytes = Buffer.from('{"amount":25000}');
    expect(
      verifyPayMongoSignature(bytes, signature(bytes), {
        secret,
        mode: "test",
        now,
      }),
    ).toBe(true);
    expect(
      verifyPayMongoSignature(
        Buffer.from('{"amount":25001}'),
        signature(bytes),
        {
          secret,
          mode: "test",
          now,
        },
      ),
    ).toBe(false);
    expect(
      verifyPayMongoSignature(
        bytes,
        signature(bytes, "test", timestamp - 601),
        {
          secret,
          mode: "test",
          now,
        },
      ),
    ).toBe(false);
    expect(
      verifyPayMongoSignature(bytes, signature(bytes, "live"), {
        secret,
        mode: "test",
        now,
      }),
    ).toBe(false);
    expect(
      verifyPayMongoSignature(bytes, signature(bytes, "live"), {
        secret,
        mode: "live",
        now,
      }),
    ).toBe(true);
  });

  it("normalizes a paid event only when mode, purpose, IDs, currency, and amount are valid", () => {
    const event = parsePayMongoEvent(
      Buffer.from(JSON.stringify(paidEvent())),
      "test",
    );
    expect(event).toEqual({
      eventId: "evt_payment123",
      type: "paid",
      mode: "test",
      donationId,
      sessionId: "cs_checkout123",
      paymentId: "pay_payment123",
      amountCentavos: 25000,
    });
    expect(() =>
      parsePayMongoEvent(
        Buffer.from(JSON.stringify(paidEvent({ currency: "USD" }))),
        "test",
      ),
    ).toThrow(/Invalid payment event/);
    expect(() =>
      parsePayMongoEvent(Buffer.from(JSON.stringify(paidEvent())), "live"),
    ).toThrow(/Invalid payment event/);
    const oversizedType = paidEvent();
    oversizedType.data.attributes.type = "x".repeat(101);
    expect(() =>
      parsePayMongoEvent(Buffer.from(JSON.stringify(oversizedType)), "test"),
    ).toThrow(/Invalid payment event/);
  });

  it("creates a PHP platform-only hosted checkout with stable provider idempotency", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      async json() {
        return {
          data: {
            id: "cs_checkout123",
            type: "checkout_session",
            attributes: {
              checkout_url: "https://checkout.paymongo.com/example",
              livemode: false,
              reference_number: donationId,
            },
          },
        };
      },
    });
    const provider = new PayMongoProvider(
      {
        frontendOrigin: "https://solveone.example",
        paymentSecretKey: "sk_test_secret-value",
        paymentMode: "test",
        paymentMethodTypes: ["card", "gcash", "qrph"],
      },
      fetchFn,
    );
    await expect(
      provider.createCheckout({ donationId, amountCentavos: 25000 }),
    ).resolves.toEqual({
      sessionId: "cs_checkout123",
      checkoutUrl: "https://checkout.paymongo.com/example",
    });
    const [, options] = fetchFn.mock.calls[0];
    expect(options.headers["Idempotency-Key"]).toBe(
      `solveone-platform-${donationId}`,
    );
    expect(options.headers.Authorization).not.toContain("sk_test_secret-value");
    expect(JSON.parse(options.body).data.attributes).toMatchObject({
      reference_number: donationId,
      pass_on_fees: false,
      send_email_receipt: true,
      metadata: { solveone_purpose: "platform" },
      line_items: [
        {
          name: "Support SolveOne PH platform",
          amount: 25000,
          currency: "PHP",
          quantity: 1,
        },
      ],
    });
  });

  it("fails closed on an untrusted checkout URL", async () => {
    const provider = new PayMongoProvider(
      {
        frontendOrigin: "https://solveone.example",
        paymentSecretKey: "sk_test_secret-value",
        paymentMode: "test",
        paymentMethodTypes: ["card"],
      },
      async () => ({
        ok: true,
        async json() {
          return {
            data: {
              id: "cs_checkout123",
              type: "checkout_session",
              attributes: {
                checkout_url: "https://checkout.paymongo.com.evil.example/x",
                livemode: false,
              },
            },
          };
        },
      }),
    );
    await expect(
      provider.createCheckout({ donationId, amountCentavos: 25000 }),
    ).rejects.toMatchObject({ code: "PAYMENT_PROVIDER_UNAVAILABLE" });
  });
});
