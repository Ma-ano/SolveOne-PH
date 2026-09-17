import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { DonationService } from "../src/services/donation.service.js";

const donorId = "111111111111111111111111";
const donationId = "222222222222222222222222";
const now = new Date("2026-09-16T12:00:00.000Z");

function donation(overrides = {}) {
  return {
    _id: donationId,
    donorId,
    amountCentavos: 25000,
    currency: "PHP",
    mode: "test",
    status: "pending",
    refundedAmountCentavos: 0,
    createdAt: now,
    paidAt: null,
    refundedAt: null,
    ...overrides,
  };
}

function config(overrides = {}) {
  return {
    paymentEnabled: true,
    paymentMode: "test",
    paymentProvider: "paymongo",
    paymentWebhookSecret: "endpoint-signing-secret",
    ipHashSecret: "ip-hash-secret-at-least-thirty-two-characters",
    ...overrides,
  };
}

describe("donation service", () => {
  it("returns an idempotent checkout replay without calling the provider twice", async () => {
    const ready = donation({
      checkoutState: "ready",
      checkoutUrl: "https://checkout.paymongo.com/session",
    });
    const repository = {
      reserveCheckout: vi
        .fn()
        .mockResolvedValueOnce({ outcome: "claimed", donation: donation() })
        .mockResolvedValueOnce({ outcome: "replayed", donation: ready }),
      completeCheckout: vi.fn().mockResolvedValue(ready),
      releaseCheckoutClaim: vi.fn(),
    };
    const provider = {
      createCheckout: vi.fn().mockResolvedValue({
        sessionId: "cs_checkout123",
        checkoutUrl: ready.checkoutUrl,
      }),
    };
    const service = new DonationService({
      repository,
      provider,
      config: config(),
      clock: () => now,
    });
    const first = await service.createCheckout(
      donorId,
      { amountCentavos: 25000 },
      "operation-key-123456",
    );
    const replay = await service.createCheckout(
      donorId,
      { amountCentavos: 25000 },
      "operation-key-123456",
    );
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(provider.createCheckout).toHaveBeenCalledOnce();
  });

  it("keeps checkout disabled until an operator explicitly enables it", async () => {
    const service = new DonationService({
      repository: { reserveCheckout: vi.fn() },
      provider: { createCheckout: vi.fn() },
      config: config({ paymentEnabled: false }),
      clock: () => now,
    });
    await expect(
      service.createCheckout(
        donorId,
        { amountCentavos: 25000 },
        "operation-key-123456",
      ),
    ).rejects.toMatchObject({ code: "DONATIONS_UNAVAILABLE" });
  });

  it("accepts paid state only from a correctly signed provider event", async () => {
    const repository = {
      processPaid: vi.fn().mockResolvedValue({ outcome: "processed" }),
    };
    const service = new DonationService({
      repository,
      provider: {},
      config: config(),
      clock: () => now,
    });
    const payload = Buffer.from(
      JSON.stringify({
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
                metadata: { solveone_purpose: "platform" },
                payments: [
                  {
                    id: "pay_payment123",
                    attributes: {
                      status: "paid",
                      amount: 25000,
                      currency: "PHP",
                      livemode: false,
                    },
                  },
                ],
              },
            },
          },
        },
      }),
    );
    const at = Math.floor(now.getTime() / 1000);
    const valid = createHmac("sha256", config().paymentWebhookSecret)
      .update(`${at}.`)
      .update(payload)
      .digest("hex");
    await expect(
      service.webhook(payload, `t=${at},te=${valid},li=${"0".repeat(64)}`),
    ).resolves.toEqual({ outcome: "processed" });
    expect(repository.processPaid).toHaveBeenCalledWith(
      expect.objectContaining({ donationId, amountCentavos: 25000 }),
      now,
    );
    await expect(
      service.webhook(
        payload,
        `t=${at},te=${"0".repeat(64)},li=${"0".repeat(64)}`,
      ),
    ).rejects.toMatchObject({ code: "DONATION_WEBHOOK_UNAUTHORIZED" });
  });

  it("hashes the admin IP before the audited dashboard repository call", async () => {
    const repository = {
      dashboard: vi.fn().mockResolvedValue({
        mode: "test",
        checkouts: 0,
        pending: 0,
        confirmed: 0,
        needsAttention: 0,
        deferredRefunds: 0,
        grossConfirmedCentavos: 0,
        refundedCentavos: 0,
        netAfterRefundsCentavos: 0,
        recent: [],
      }),
    };
    const service = new DonationService({
      repository,
      provider: {},
      config: config(),
      clock: () => now,
    });
    await service.dashboard({ userId: donorId, role: "admin" }, "203.0.113.7");
    expect(repository.dashboard).toHaveBeenCalledWith({
      mode: "test",
      actorId: donorId,
      ipHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      now,
    });
    expect(JSON.stringify(repository.dashboard.mock.calls[0][0])).not.toContain(
      "203.0.113.7",
    );
  });

  it("scopes deferred-refund maintenance to the configured payment mode", async () => {
    const repository = { applyDeferredRefunds: vi.fn().mockResolvedValue(2) };
    const service = new DonationService({
      repository,
      provider: {},
      config: config({ paymentMode: "live" }),
      clock: () => now,
    });
    await expect(service.applyDeferredRefunds()).resolves.toBe(2);
    expect(repository.applyDeferredRefunds).toHaveBeenCalledWith({
      mode: "live",
      now,
    });
  });
});
