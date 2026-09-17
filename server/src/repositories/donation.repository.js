import { createHash } from "node:crypto";
import mongoose from "mongoose";

import { AuditLog } from "../models/AuditLog.js";
import { DonationRefund } from "../models/DonationRefund.js";
import { DonationWebhookEvent } from "../models/DonationWebhookEvent.js";
import { PlatformDonation } from "../models/PlatformDonation.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function conflict(code, message) {
  return new AppError({ statusCode: 409, code, message });
}

function listCursor(cursor) {
  if (!cursor) return {};
  return {
    $or: [
      { createdAt: { $lt: cursor.date } },
      { createdAt: cursor.date, _id: { $lt: cursor.id } },
    ],
  };
}

export class DonationRepository {
  async reserveCheckout({
    donorId,
    amountCentavos,
    mode,
    idempotencyKey,
    now,
  }) {
    const idempotencyKeyHash = digest(
      `${donorId}:platform-donation:${mode}:${idempotencyKey}`,
    );
    const requestHash = digest(`platform|PHP|${mode}|${amountCentavos}`);
    const claimUntil = new Date(now.getTime() + 60 * 1000);
    const donor = await User.findOne({ _id: donorId, accountStatus: "active" })
      .select("_id")
      .lean()
      .exec();
    if (!donor) return { outcome: "unavailable" };
    try {
      const created = await PlatformDonation.create({
        donorId,
        purpose: "platform",
        amountCentavos,
        currency: "PHP",
        mode,
        status: "pending",
        checkoutState: "creating",
        idempotencyKeyHash,
        requestHash,
        checkoutRequestedAt: now,
        checkoutClaimExpiresAt: claimUntil,
        createdAt: now,
        updatedAt: now,
      });
      return { outcome: "claimed", donation: created.toObject() };
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
    const existing = await PlatformDonation.findOne({
      donorId,
      idempotencyKeyHash,
    })
      .select(
        "+idempotencyKeyHash +requestHash +checkoutClaimExpiresAt +checkoutUrl +providerSessionId",
      )
      .lean()
      .exec();
    if (!existing)
      throw conflict(
        "DONATION_CHECKOUT_CONFLICT",
        "Donation checkout conflicted; retry later",
      );
    if (existing.requestHash !== requestHash) return { outcome: "mismatch" };
    if (["paid", "refunded"].includes(existing.status))
      return { outcome: "settled", donation: existing };
    if (existing.checkoutState === "ready")
      return { outcome: "replayed", donation: existing };
    if (existing.checkoutState === "attention")
      return { outcome: "attention", donation: existing };
    if (
      now.getTime() - new Date(existing.checkoutRequestedAt).getTime() >=
      23 * 60 * 60 * 1000
    ) {
      await PlatformDonation.updateOne(
        { _id: existing._id, checkoutState: "creating" },
        { $set: { checkoutState: "attention", updatedAt: now } },
      );
      return { outcome: "attention", donation: existing };
    }
    if (existing.checkoutClaimExpiresAt > now)
      return { outcome: "in_progress" };
    const reclaimed = await PlatformDonation.findOneAndUpdate(
      {
        _id: existing._id,
        status: "pending",
        checkoutState: "creating",
        checkoutClaimExpiresAt: { $lte: now },
      },
      { $set: { checkoutClaimExpiresAt: claimUntil, updatedAt: now } },
      { new: true, runValidators: true },
    )
      .select("+checkoutClaimExpiresAt")
      .lean()
      .exec();
    return reclaimed
      ? { outcome: "claimed", donation: reclaimed }
      : { outcome: "in_progress" };
  }

  async completeCheckout({ donationId, sessionId, checkoutUrl, now }) {
    const updated = await PlatformDonation.findOneAndUpdate(
      {
        _id: donationId,
        status: "pending",
        checkoutState: "creating",
        $or: [{ providerSessionId: null }, { providerSessionId: sessionId }],
      },
      {
        $set: {
          providerSessionId: sessionId,
          checkoutUrl,
          checkoutState: "ready",
          checkoutClaimExpiresAt: now,
          updatedAt: now,
        },
      },
      { new: true, runValidators: true },
    )
      .select("+checkoutUrl +providerSessionId")
      .lean()
      .exec();
    if (updated) return updated;
    const current = await PlatformDonation.findById(donationId)
      .select("+checkoutUrl +providerSessionId")
      .lean()
      .exec();
    if (
      current?.providerSessionId === sessionId &&
      (current.checkoutState === "ready" || current.status === "paid")
    )
      return current;
    throw conflict(
      "DONATION_CHECKOUT_CONFLICT",
      "Donation checkout changed during creation",
    );
  }

  async releaseCheckoutClaim(donationId, now) {
    await PlatformDonation.updateOne(
      { _id: donationId, status: "pending", checkoutState: "creating" },
      { $set: { checkoutClaimExpiresAt: now, updatedAt: now } },
    );
  }

  async processPaid(event, now) {
    let outcome = "processed";
    try {
      await mongoose.connection.transaction(async (session) => {
        outcome = "processed";
        const duplicate = await DonationWebhookEvent.findOne({
          providerEventId: event.eventId,
          mode: event.mode,
        })
          .session(session)
          .select("_id")
          .lean()
          .exec();
        if (duplicate) {
          outcome = "duplicate";
          return;
        }
        const donation = await PlatformDonation.findOne({
          _id: event.donationId,
          mode: event.mode,
          purpose: "platform",
          currency: "PHP",
        })
          .session(session)
          .select("+providerSessionId +providerPaymentId")
          .lean()
          .exec();
        if (
          !donation ||
          donation.amountCentavos !== event.amountCentavos ||
          (donation.providerSessionId &&
            donation.providerSessionId !== event.sessionId)
        )
          throw conflict(
            "DONATION_PAYMENT_MISMATCH",
            "Payment does not match a platform donation",
          );
        if (["paid", "refunded"].includes(donation.status)) {
          if (donation.providerPaymentId !== event.paymentId)
            throw conflict(
              "DONATION_PAYMENT_MISMATCH",
              "Payment does not match a platform donation",
            );
          outcome = "already_paid";
        } else if (donation.status === "pending") {
          const advanced = await PlatformDonation.findOneAndUpdate(
            {
              _id: donation._id,
              status: "pending",
              mode: event.mode,
              amountCentavos: event.amountCentavos,
              $or: [
                { providerSessionId: null },
                { providerSessionId: event.sessionId },
              ],
            },
            {
              $set: {
                status: "paid",
                paidAt: now,
                providerSessionId: event.sessionId,
                providerPaymentId: event.paymentId,
                checkoutState: "ready",
                updatedAt: now,
              },
              $unset: { checkoutUrl: 1 },
            },
            { new: true, session, runValidators: true },
          )
            .select("_id")
            .lean()
            .exec();
          if (!advanced)
            throw conflict(
              "DONATION_PAYMENT_CONFLICT",
              "Donation payment state changed",
            );
        } else {
          throw conflict(
            "DONATION_PAYMENT_CONFLICT",
            "A terminal donation needs manual reconciliation",
          );
        }
        await DonationWebhookEvent.create(
          [
            {
              providerEventId: event.eventId,
              eventType: "checkout_session.payment.paid",
              mode: event.mode,
              outcome: "processed",
              donationId: donation._id,
              createdAt: now,
            },
          ],
          { session },
        );
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const duplicate = await DonationWebhookEvent.exists({
        providerEventId: event.eventId,
        mode: event.mode,
      });
      if (!duplicate) throw error;
      outcome = "duplicate";
    }
    if (outcome !== "duplicate")
      await this.applyDeferredRefunds({
        paymentId: event.paymentId,
        mode: event.mode,
        now,
      });
    return { outcome };
  }

  async processRefund(event, now) {
    let outcome = "deferred";
    try {
      await mongoose.connection.transaction(async (session) => {
        outcome = "deferred";
        const duplicate = await DonationWebhookEvent.findOne({
          providerEventId: event.eventId,
          mode: event.mode,
        })
          .session(session)
          .select("_id")
          .lean()
          .exec();
        if (duplicate) {
          outcome = "duplicate";
          return;
        }
        const existing = await DonationRefund.findOne({
          providerRefundId: event.refundId,
          mode: event.mode,
        })
          .session(session)
          .select("+providerPaymentId")
          .lean()
          .exec();
        if (
          existing &&
          (existing.providerPaymentId !== event.paymentId ||
            existing.amountCentavos !== event.amountCentavos ||
            existing.mode !== event.mode)
        )
          throw conflict(
            "DONATION_REFUND_MISMATCH",
            "Refund does not match a known payment",
          );
        if (!existing)
          await DonationRefund.create(
            [
              {
                providerRefundId: event.refundId,
                providerPaymentId: event.paymentId,
                mode: event.mode,
                amountCentavos: event.amountCentavos,
                currency: "PHP",
                createdAt: now,
              },
            ],
            { session },
          );
        await DonationWebhookEvent.create(
          [
            {
              providerEventId: event.eventId,
              eventType: "refund.succeeded",
              mode: event.mode,
              outcome: "deferred",
              providerRefundId: event.refundId,
              createdAt: now,
            },
          ],
          { session },
        );
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const duplicate = await DonationWebhookEvent.exists({
        providerEventId: event.eventId,
        mode: event.mode,
      });
      if (!duplicate) throw error;
      outcome = "duplicate";
    }
    if (outcome !== "duplicate")
      await this.applyDeferredRefunds({
        paymentId: event.paymentId,
        mode: event.mode,
        now,
      });
    return { outcome };
  }

  async ignoreEvent(event, now) {
    try {
      await DonationWebhookEvent.create({
        providerEventId: event.eventId,
        eventType: event.eventType,
        mode: event.mode,
        outcome: "ignored",
        createdAt: now,
      });
      return { outcome: "ignored" };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      if (
        !(await DonationWebhookEvent.exists({
          providerEventId: event.eventId,
          mode: event.mode,
        }))
      )
        throw error;
      return { outcome: "duplicate" };
    }
  }

  async applyDeferredRefunds({ paymentId, mode, now = new Date() } = {}) {
    const rows = await DonationRefund.find({
      appliedAt: null,
      ...(paymentId ? { providerPaymentId: paymentId } : {}),
      ...(mode ? { mode } : {}),
    })
      .select("+providerPaymentId")
      .limit(50)
      .lean()
      .exec();
    let applied = 0;
    for (const row of rows) {
      let changed = false;
      await mongoose.connection.transaction(async (session) => {
        changed = false;
        const refund = await DonationRefund.findOne({
          _id: row._id,
          appliedAt: null,
        })
          .session(session)
          .select("+providerPaymentId")
          .lean()
          .exec();
        if (!refund) return;
        const donation = await PlatformDonation.findOne({
          providerPaymentId: refund.providerPaymentId,
          mode: refund.mode,
          status: { $in: ["paid", "refunded"] },
        })
          .session(session)
          .select("+providerPaymentId")
          .lean()
          .exec();
        if (!donation) return;
        const nextRefunded =
          donation.refundedAmountCentavos + refund.amountCentavos;
        if (nextRefunded > donation.amountCentavos) return;
        const claimed = await DonationRefund.findOneAndUpdate(
          { _id: refund._id, appliedAt: null },
          { $set: { donationId: donation._id, appliedAt: now } },
          { new: true, session, runValidators: true },
        )
          .select("_id")
          .lean()
          .exec();
        if (!claimed) return;
        const advanced = await PlatformDonation.findOneAndUpdate(
          {
            _id: donation._id,
            providerPaymentId: refund.providerPaymentId,
            refundedAmountCentavos: donation.refundedAmountCentavos,
            status: { $in: ["paid", "refunded"] },
          },
          {
            $set: {
              status:
                nextRefunded === donation.amountCentavos ? "refunded" : "paid",
              refundedAt: now,
              updatedAt: now,
            },
            $inc: { refundedAmountCentavos: refund.amountCentavos },
          },
          { new: true, session, runValidators: true },
        )
          .select("_id")
          .lean()
          .exec();
        if (!advanced)
          throw conflict(
            "DONATION_REFUND_CONFLICT",
            "Refund state changed during application",
          );
        changed = true;
      });
      if (changed) applied += 1;
    }
    return applied;
  }

  async history({ donorId, mode, limit, cursor }) {
    const rows = await PlatformDonation.find({
      donorId,
      mode,
      ...listCursor(cursor),
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean()
      .exec();
    return { items: rows.slice(0, limit), hasNextPage: rows.length > limit };
  }

  async dashboard({ mode, actorId, ipHash, now }) {
    const [[metrics], recent, deferredRefunds] = await Promise.all([
      PlatformDonation.aggregate([
        { $match: { mode } },
        {
          $group: {
            _id: null,
            checkouts: { $sum: 1 },
            pending: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
            },
            confirmed: {
              $sum: {
                $cond: [{ $in: ["$status", ["paid", "refunded"]] }, 1, 0],
              },
            },
            grossConfirmedCentavos: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["paid", "refunded"]] },
                  "$amountCentavos",
                  0,
                ],
              },
            },
            refundedCentavos: { $sum: "$refundedAmountCentavos" },
            checkoutAttention: {
              $sum: {
                $cond: [{ $eq: ["$checkoutState", "attention"] }, 1, 0],
              },
            },
          },
        },
      ]),
      PlatformDonation.find({ mode })
        .sort({ createdAt: -1, _id: -1 })
        .limit(20)
        .lean()
        .exec(),
      DonationRefund.countDocuments({ mode, appliedAt: null }),
    ]);
    await AuditLog.create({
      actorId,
      action: "donation_dashboard_viewed",
      targetType: "platform_donation_dashboard",
      targetId: actorId,
      metadata: { mode },
      ipHash,
      createdAt: now,
    });
    return {
      mode,
      currency: "PHP",
      checkouts: metrics?.checkouts ?? 0,
      pending: metrics?.pending ?? 0,
      confirmed: metrics?.confirmed ?? 0,
      needsAttention: (metrics?.checkoutAttention ?? 0) + deferredRefunds,
      deferredRefunds,
      grossConfirmedCentavos: metrics?.grossConfirmedCentavos ?? 0,
      refundedCentavos: metrics?.refundedCentavos ?? 0,
      netAfterRefundsCentavos:
        (metrics?.grossConfirmedCentavos ?? 0) -
        (metrics?.refundedCentavos ?? 0),
      recent,
    };
  }
}
