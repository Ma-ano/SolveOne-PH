import { decodePageCursor, encodePageCursor } from "../utils/pageCursor.js";
import { AppError } from "../utils/AppError.js";
import {
  parsePayMongoEvent,
  verifyPayMongoSignature,
} from "../providers/payMongo.provider.js";
import {
  serializeDonation,
  serializeDonationCheckout,
  serializeDonationDashboard,
} from "../serializers/donation.serializer.js";
import { hashIpAddress } from "../utils/authCrypto.js";

function donationError(statusCode, code, message) {
  return new AppError({ statusCode, code, message });
}

export class DonationService {
  constructor({ repository, provider, config, clock = () => new Date() }) {
    this.repository = repository;
    this.provider = provider;
    this.config = config;
    this.clock = clock;
  }

  async createCheckout(donorId, input, idempotencyKey) {
    if (!this.config.paymentEnabled)
      throw donationError(
        503,
        "DONATIONS_UNAVAILABLE",
        "Support SolveOne checkout is not open",
      );
    const now = this.clock();
    const reservation = await this.repository.reserveCheckout({
      donorId,
      amountCentavos: input.amountCentavos,
      mode: this.config.paymentMode,
      idempotencyKey,
      now,
    });
    if (reservation.outcome === "mismatch")
      throw donationError(
        409,
        "DONATION_KEY_REUSED",
        "Idempotency key was used for another amount",
      );
    if (reservation.outcome === "unavailable")
      throw donationError(
        404,
        "DONOR_NOT_FOUND",
        "Donation account is not available",
      );
    if (reservation.outcome === "in_progress")
      throw donationError(
        409,
        "DONATION_CHECKOUT_IN_PROGRESS",
        "Checkout is being prepared; retry shortly with the same key",
      );
    if (reservation.outcome === "attention")
      throw donationError(
        503,
        "DONATION_RECONCILIATION_REQUIRED",
        "Checkout needs provider reconciliation before another attempt",
      );
    if (["replayed", "settled"].includes(reservation.outcome))
      return serializeDonationCheckout(reservation.donation, true);
    const donationId = String(reservation.donation._id);
    let providerCheckout;
    try {
      providerCheckout = await this.provider.createCheckout({
        donationId,
        amountCentavos: input.amountCentavos,
      });
    } catch (error) {
      await this.repository
        .releaseCheckoutClaim(donationId, this.clock())
        .catch(() => {});
      throw error;
    }
    const donation = await this.repository.completeCheckout({
      donationId,
      sessionId: providerCheckout.sessionId,
      checkoutUrl: providerCheckout.checkoutUrl,
      now: this.clock(),
    });
    return serializeDonationCheckout(donation, false);
  }

  async history(donorId, query) {
    const scope = `platform-donations:${donorId}:${this.config.paymentMode}`;
    const page = await this.repository.history({
      donorId,
      mode: this.config.paymentMode,
      limit: query.limit,
      cursor: decodePageCursor(query.cursor, scope),
    });
    const last = page.items.at(-1);
    return {
      items: page.items.map(serializeDonation),
      pageInfo: {
        hasNextPage: page.hasNextPage,
        nextCursor:
          page.hasNextPage && last
            ? encodePageCursor({ scope, date: last.createdAt, id: last._id })
            : null,
      },
    };
  }

  async dashboard(actor, ipAddress) {
    if (actor.role !== "admin")
      throw donationError(
        403,
        "FORBIDDEN",
        "Donation administration is restricted",
      );
    return serializeDonationDashboard(
      await this.repository.dashboard({
        mode: this.config.paymentMode,
        actorId: actor.userId,
        ipHash: hashIpAddress(ipAddress, this.config.ipHashSecret),
        now: this.clock(),
      }),
    );
  }

  async webhook(rawBytes, signatureHeader) {
    if (
      !this.config.paymentWebhookSecret ||
      this.config.paymentProvider !== "paymongo"
    )
      throw donationError(
        503,
        "DONATION_WEBHOOK_UNAVAILABLE",
        "Donation webhook is not configured",
      );
    const now = this.clock();
    if (
      !verifyPayMongoSignature(rawBytes, signatureHeader, {
        secret: this.config.paymentWebhookSecret,
        mode: this.config.paymentMode,
        now,
      })
    )
      throw donationError(
        401,
        "DONATION_WEBHOOK_UNAUTHORIZED",
        "Invalid donation webhook signature",
      );
    const event = parsePayMongoEvent(rawBytes, this.config.paymentMode);
    if (event.type === "paid") return this.repository.processPaid(event, now);
    if (event.type === "refund")
      return this.repository.processRefund(event, now);
    return this.repository.ignoreEvent(event, now);
  }

  applyDeferredRefunds() {
    return this.repository.applyDeferredRefunds({
      mode: this.config.paymentMode,
      now: this.clock(),
    });
  }
}
