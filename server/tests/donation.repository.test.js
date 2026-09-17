import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditLog } from "../src/models/AuditLog.js";
import { DonationRefund } from "../src/models/DonationRefund.js";
import { DonationWebhookEvent } from "../src/models/DonationWebhookEvent.js";
import { PlatformDonation } from "../src/models/PlatformDonation.js";
import { User } from "../src/models/User.js";
import { DonationRepository } from "../src/repositories/donation.repository.js";

const donorId = "111111111111111111111111";
const donationId = "222222222222222222222222";
const now = new Date("2026-09-16T12:00:00.000Z");

function query(result) {
  const chain = {};
  for (const method of ["session", "select", "sort", "limit", "lean"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.exec = vi.fn().mockResolvedValue(result);
  return chain;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("donation repository state transitions", () => {
  it("deduplicates an owner checkout key and detects reuse for a different amount", async () => {
    vi.spyOn(User, "findOne").mockImplementation(() => query({ _id: donorId }));
    let createdPayload;
    vi.spyOn(PlatformDonation, "create")
      .mockImplementationOnce(async (payload) => {
        createdPayload = payload;
        return { toObject: () => ({ _id: donationId, ...payload }) };
      })
      .mockRejectedValue({ code: 11000 });
    const findExisting = vi
      .spyOn(PlatformDonation, "findOne")
      .mockImplementation(() =>
        query({
          _id: donationId,
          donorId,
          ...createdPayload,
          checkoutState: "ready",
          checkoutUrl: "https://checkout.paymongo.com/session",
        }),
      );
    const repository = new DonationRepository();
    const first = await repository.reserveCheckout({
      donorId,
      amountCentavos: 25000,
      mode: "test",
      idempotencyKey: "operation-key-123456",
      now,
    });
    const replay = await repository.reserveCheckout({
      donorId,
      amountCentavos: 25000,
      mode: "test",
      idempotencyKey: "operation-key-123456",
      now,
    });
    const mismatch = await repository.reserveCheckout({
      donorId,
      amountCentavos: 26000,
      mode: "test",
      idempotencyKey: "operation-key-123456",
      now,
    });
    expect(first.outcome).toBe("claimed");
    expect(replay.outcome).toBe("replayed");
    expect(mismatch.outcome).toBe("mismatch");
    expect(findExisting).toHaveBeenCalledWith({
      donorId,
      idempotencyKeyHash: createdPayload.idempotencyKeyHash,
    });
  });

  it("advances pending to paid with exact amount and session guards in one transaction", async () => {
    vi.spyOn(mongoose.connection, "transaction").mockImplementation(
      async (work) => work({ transaction: true }),
    );
    vi.spyOn(DonationWebhookEvent, "findOne").mockImplementation(() =>
      query(null),
    );
    vi.spyOn(PlatformDonation, "findOne").mockImplementation(() =>
      query({
        _id: donationId,
        amountCentavos: 25000,
        status: "pending",
        providerSessionId: "cs_checkout123",
      }),
    );
    const update = vi
      .spyOn(PlatformDonation, "findOneAndUpdate")
      .mockImplementation(() => query({ _id: donationId }));
    const eventCreate = vi
      .spyOn(DonationWebhookEvent, "create")
      .mockResolvedValue([]);
    const repository = new DonationRepository();
    const deferred = vi
      .spyOn(repository, "applyDeferredRefunds")
      .mockResolvedValue(0);
    const result = await repository.processPaid(
      {
        eventId: "evt_payment123",
        donationId,
        sessionId: "cs_checkout123",
        paymentId: "pay_payment123",
        amountCentavos: 25000,
        mode: "test",
      },
      now,
    );
    expect(result).toEqual({ outcome: "processed" });
    expect(update.mock.calls[0][0]).toMatchObject({
      _id: donationId,
      status: "pending",
      mode: "test",
      amountCentavos: 25000,
    });
    expect(update.mock.calls[0][1].$set).toMatchObject({
      status: "paid",
      providerSessionId: "cs_checkout123",
      providerPaymentId: "pay_payment123",
    });
    expect(eventCreate).toHaveBeenCalledOnce();
    expect(deferred).toHaveBeenCalledWith({
      paymentId: "pay_payment123",
      mode: "test",
      now,
    });
  });

  it("durably defers a signed refund that arrives before its payment", async () => {
    vi.spyOn(mongoose.connection, "transaction").mockImplementation(
      async (work) => work({ transaction: true }),
    );
    vi.spyOn(DonationWebhookEvent, "findOne").mockImplementation(() =>
      query(null),
    );
    vi.spyOn(DonationRefund, "findOne").mockImplementation(() => query(null));
    const refundCreate = vi
      .spyOn(DonationRefund, "create")
      .mockResolvedValue([]);
    const eventCreate = vi
      .spyOn(DonationWebhookEvent, "create")
      .mockResolvedValue([]);
    const repository = new DonationRepository();
    const apply = vi
      .spyOn(repository, "applyDeferredRefunds")
      .mockResolvedValue(0);
    const result = await repository.processRefund(
      {
        eventId: "evt_refund123",
        refundId: "ref_refund123",
        paymentId: "pay_payment123",
        amountCentavos: 5000,
        mode: "test",
      },
      now,
    );
    expect(result).toEqual({ outcome: "deferred" });
    expect(refundCreate.mock.calls[0][0][0]).toMatchObject({
      providerRefundId: "ref_refund123",
      providerPaymentId: "pay_payment123",
      amountCentavos: 5000,
      mode: "test",
      currency: "PHP",
    });
    expect(eventCreate).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith({
      paymentId: "pay_payment123",
      mode: "test",
      now,
    });
  });

  it("applies a stored deferred refund after payment without over-refunding", async () => {
    vi.spyOn(mongoose.connection, "transaction").mockImplementation(
      async (work) => work({ transaction: true }),
    );
    const findRefunds = vi
      .spyOn(DonationRefund, "find")
      .mockImplementation(() => query([{ _id: "333333333333333333333333" }]));
    vi.spyOn(DonationRefund, "findOne").mockImplementation(() =>
      query({
        _id: "333333333333333333333333",
        providerPaymentId: "pay_payment123",
        amountCentavos: 5000,
        mode: "test",
      }),
    );
    vi.spyOn(PlatformDonation, "findOne").mockImplementation(() =>
      query({
        _id: donationId,
        providerPaymentId: "pay_payment123",
        amountCentavos: 25000,
        refundedAmountCentavos: 0,
        status: "paid",
      }),
    );
    const claim = vi
      .spyOn(DonationRefund, "findOneAndUpdate")
      .mockImplementation(() => query({ _id: "333333333333333333333333" }));
    const advance = vi
      .spyOn(PlatformDonation, "findOneAndUpdate")
      .mockImplementation(() => query({ _id: donationId }));
    const repository = new DonationRepository();
    await expect(
      repository.applyDeferredRefunds({
        paymentId: "pay_payment123",
        mode: "test",
        now,
      }),
    ).resolves.toBe(1);
    expect(claim.mock.calls[0][1].$set).toMatchObject({
      donationId,
      appliedAt: now,
    });
    expect(advance.mock.calls[0][1]).toEqual({
      $set: { status: "paid", refundedAt: now, updatedAt: now },
      $inc: { refundedAmountCentavos: 5000 },
    });
    expect(findRefunds).toHaveBeenCalledWith({
      appliedAt: null,
      providerPaymentId: "pay_payment123",
      mode: "test",
    });
  });

  it("leaves an over-refund deferred for administrator reconciliation", async () => {
    vi.spyOn(mongoose.connection, "transaction").mockImplementation(
      async (work) => work({ transaction: true }),
    );
    vi.spyOn(DonationRefund, "find").mockImplementation(() =>
      query([{ _id: "333333333333333333333333" }]),
    );
    vi.spyOn(DonationRefund, "findOne").mockImplementation(() =>
      query({
        _id: "333333333333333333333333",
        providerPaymentId: "pay_payment123",
        amountCentavos: 30000,
        mode: "test",
      }),
    );
    vi.spyOn(PlatformDonation, "findOne").mockImplementation(() =>
      query({
        _id: donationId,
        providerPaymentId: "pay_payment123",
        amountCentavos: 25000,
        refundedAmountCentavos: 0,
        status: "paid",
      }),
    );
    const claim = vi.spyOn(DonationRefund, "findOneAndUpdate");
    const repository = new DonationRepository();
    await expect(repository.applyDeferredRefunds({ now })).resolves.toBe(0);
    expect(claim).not.toHaveBeenCalled();
  });

  it("includes deferred refunds in attention totals and audits dashboard access", async () => {
    vi.spyOn(PlatformDonation, "aggregate").mockResolvedValue([
      {
        checkouts: 4,
        pending: 1,
        confirmed: 3,
        checkoutAttention: 1,
        grossConfirmedCentavos: 75000,
        refundedCentavos: 5000,
      },
    ]);
    vi.spyOn(PlatformDonation, "find").mockImplementation(() => query([]));
    vi.spyOn(DonationRefund, "countDocuments").mockResolvedValue(2);
    const audit = vi.spyOn(AuditLog, "create").mockResolvedValue({});
    const repository = new DonationRepository();
    const result = await repository.dashboard({
      mode: "test",
      actorId: donorId,
      ipHash: "a".repeat(64),
      now,
    });
    expect(result).toMatchObject({
      mode: "test",
      checkouts: 4,
      confirmed: 3,
      deferredRefunds: 2,
      needsAttention: 3,
      netAfterRefundsCentavos: 70000,
    });
    expect(audit).toHaveBeenCalledWith({
      actorId: donorId,
      action: "donation_dashboard_viewed",
      targetType: "platform_donation_dashboard",
      targetId: donorId,
      metadata: { mode: "test" },
      ipHash: "a".repeat(64),
      createdAt: now,
    });
  });
});
