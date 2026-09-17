import mongoose from "mongoose";
import { describe, expect, it, vi } from "vitest";

import { createDonationIndexes } from "../src/jobs/createDonationIndexes.js";
import { DonationRefund } from "../src/models/DonationRefund.js";
import { DonationWebhookEvent } from "../src/models/DonationWebhookEvent.js";
import {
  MAX_DONATION_CENTAVOS,
  MIN_DONATION_CENTAVOS,
  PlatformDonation,
} from "../src/models/PlatformDonation.js";
import {
  serializeDonation,
  serializeDonationDashboard,
} from "../src/serializers/donation.serializer.js";

describe("platform donation persistence", () => {
  it("stores integer minor units and hides provider and idempotency material", () => {
    expect(PlatformDonation.schema.path("amountCentavos").options.min).toBe(
      MIN_DONATION_CENTAVOS,
    );
    expect(PlatformDonation.schema.path("amountCentavos").options.max).toBe(
      MAX_DONATION_CENTAVOS,
    );
    expect(
      PlatformDonation.schema
        .path("amountCentavos")
        .options.validate.validator(1000.5),
    ).toBe(false);
    expect(
      DonationRefund.schema
        .path("amountCentavos")
        .options.validate.validator(100.5),
    ).toBe(false);
    expect(PlatformDonation.schema.path("checkoutUrl").options.maxlength).toBe(
      2048,
    );
    expect(
      DonationWebhookEvent.schema.path("providerEventId").options.maxlength,
    ).toBe(100);
    for (const field of [
      "idempotencyKeyHash",
      "requestHash",
      "checkoutClaimExpiresAt",
      "providerSessionId",
      "providerPaymentId",
      "checkoutUrl",
    ]) {
      expect(PlatformDonation.schema.path(field).options.select).toBe(false);
    }
  });

  it("defines unique donation, provider-session, payment, event, and refund indexes", () => {
    const donationIndexes = PlatformDonation.schema.indexes();
    for (const name of [
      "donation_donor_key_unique",
      "donation_provider_session_unique",
      "donation_provider_payment_unique",
    ]) {
      expect(
        donationIndexes.find(([, options]) => options.name === name)[1].unique,
      ).toBe(true);
    }
    expect(
      donationIndexes.find(
        ([, options]) => options.name === "donation_provider_payment_unique",
      )[0],
    ).toEqual({ mode: 1, providerPaymentId: 1 });
    const eventIndex = DonationWebhookEvent.schema
      .indexes()
      .find(([, options]) => options.name === "donation_webhook_event_unique");
    expect(eventIndex[0]).toEqual({ mode: 1, providerEventId: 1 });
    expect(eventIndex[1].unique).toBe(true);
    const refundIndex = DonationRefund.schema
      .indexes()
      .find(
        ([, options]) => options.name === "donation_refund_provider_unique",
      );
    expect(refundIndex[0]).toEqual({ mode: 1, providerRefundId: 1 });
    expect(refundIndex[1].unique).toBe(true);
  });

  it("serializes owner and admin records without donor or provider identifiers", () => {
    const row = {
      _id: new mongoose.Types.ObjectId("111111111111111111111111"),
      donorId: "222222222222222222222222",
      providerSessionId: "cs_private",
      providerPaymentId: "pay_private",
      checkoutUrl: "https://checkout.paymongo.com/private",
      amountCentavos: 25000,
      mode: "test",
      status: "paid",
      refundedAmountCentavos: 0,
      createdAt: new Date("2026-09-16T12:00:00.000Z"),
      paidAt: new Date("2026-09-16T12:01:00.000Z"),
    };
    const output = serializeDonation(row);
    expect(output).not.toHaveProperty("donorId");
    expect(output).not.toHaveProperty("providerSessionId");
    expect(output).not.toHaveProperty("providerPaymentId");
    expect(output).not.toHaveProperty("checkoutUrl");
    expect(
      serializeDonationDashboard({
        mode: "test",
        checkouts: 1,
        pending: 0,
        confirmed: 1,
        needsAttention: 0,
        deferredRefunds: 0,
        grossConfirmedCentavos: 25000,
        refundedCentavos: 0,
        netAfterRefundsCentavos: 25000,
        recent: [row],
      }).recent[0],
    ).toEqual(output);
  });

  it("has an operator-run create-only index step for all donation collections", async () => {
    const donationModel = { createIndexes: vi.fn() };
    const eventModel = { createIndexes: vi.fn() };
    const refundModel = { createIndexes: vi.fn() };
    await createDonationIndexes(donationModel, eventModel, refundModel);
    expect(donationModel.createIndexes).toHaveBeenCalledOnce();
    expect(eventModel.createIndexes).toHaveBeenCalledOnce();
    expect(refundModel.createIndexes).toHaveBeenCalledOnce();
  });
});
