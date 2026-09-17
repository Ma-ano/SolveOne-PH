import { createHmac, timingSafeEqual } from "node:crypto";

import { AppError } from "../utils/AppError.js";

function paymentError(statusCode, code, message) {
  return new AppError({ statusCode, code, message });
}

function providerUnavailable() {
  return paymentError(
    503,
    "PAYMENT_PROVIDER_UNAVAILABLE",
    "Platform checkout is temporarily unavailable",
  );
}

function validProviderId(value, prefix) {
  return (
    typeof value === "string" &&
    value.length <= 100 &&
    new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value)
  );
}

function validCheckoutUrl(value) {
  try {
    if (typeof value !== "string" || value.length > 2048) return false;
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "checkout.paymongo.com" &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export class PayMongoProvider {
  constructor(config, fetchFn = fetch) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  async createCheckout({ donationId, amountCentavos }) {
    const base = this.config.frontendOrigin;
    const successUrl = new URL("/support-solveone", base);
    successUrl.searchParams.set("return", "success");
    successUrl.searchParams.set("donationId", donationId);
    const cancelUrl = new URL("/support-solveone", base);
    cancelUrl.searchParams.set("return", "cancel");
    cancelUrl.searchParams.set("donationId", donationId);
    const request = {
      data: {
        attributes: {
          line_items: [
            {
              name: "Support SolveOne PH platform",
              amount: amountCentavos,
              currency: "PHP",
              quantity: 1,
            },
          ],
          payment_method_types: this.config.paymentMethodTypes,
          success_url: successUrl.toString(),
          cancel_url: cancelUrl.toString(),
          reference_number: donationId,
          description:
            "Optional support for the SolveOne PH platform; not a payment to a help recipient.",
          send_email_receipt: true,
          pass_on_fees: false,
          metadata: { solveone_purpose: "platform" },
        },
      },
    };
    let response;
    try {
      response = await this.fetchFn(
        "https://api.paymongo.com/v2/checkout_sessions",
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.config.paymentSecretKey}:`).toString("base64")}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `solveone-platform-${donationId}`,
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(10000),
        },
      );
    } catch {
      throw providerUnavailable();
    }
    if (!response.ok) throw providerUnavailable();
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw providerUnavailable();
    }
    const session = payload?.data;
    const url = session?.attributes?.checkout_url;
    if (
      !validProviderId(session?.id, "cs") ||
      session?.type !== "checkout_session" ||
      !validCheckoutUrl(url) ||
      session.attributes.livemode !== (this.config.paymentMode === "live") ||
      (session.attributes.reference_number &&
        session.attributes.reference_number !== donationId)
    )
      throw providerUnavailable();
    return { sessionId: session.id, checkoutUrl: url };
  }
}

export function verifyPayMongoSignature(
  bytes,
  header,
  { secret, mode, now = new Date() },
) {
  if (!Buffer.isBuffer(bytes) || !secret || typeof header !== "string")
    return false;
  const parts = header.split(",").map((part) => part.trim());
  if (parts.length !== 3) return false;
  const fields = new Map();
  for (const part of parts) {
    const at = part.indexOf("=");
    if (at <= 0) return false;
    const name = part.slice(0, at);
    if (!["t", "te", "li"].includes(name) || fields.has(name)) return false;
    fields.set(name, part.slice(at + 1));
  }
  const timestamp = fields.get("t");
  const signature = fields.get(mode === "live" ? "li" : "te");
  if (
    !/^\d{10}$/.test(timestamp ?? "") ||
    !/^[0-9a-f]{64}$/i.test(signature ?? "")
  )
    return false;
  if (Math.abs(now.getTime() - Number(timestamp) * 1000) > 10 * 60 * 1000)
    return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(bytes)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function parsePayMongoEvent(bytes, mode) {
  let payload;
  try {
    payload = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw paymentError(400, "PAYMENT_WEBHOOK_INVALID", "Invalid payment event");
  }
  const event = payload?.data;
  const attributes = event?.attributes;
  if (
    !validProviderId(event?.id, "evt") ||
    event?.type !== "event" ||
    typeof attributes?.type !== "string" ||
    attributes.type.length > 100 ||
    attributes?.livemode !== (mode === "live")
  )
    throw paymentError(400, "PAYMENT_WEBHOOK_INVALID", "Invalid payment event");
  if (attributes.type === "checkout_session.payment.paid") {
    const session = attributes.data;
    const details = session?.attributes;
    const payments = details?.payments?.filter(
      (entry) => entry?.attributes?.status === "paid",
    );
    const payment = payments?.length === 1 ? payments[0] : null;
    if (
      !validProviderId(session?.id, "cs") ||
      session?.type !== "checkout_session" ||
      !/^[0-9a-fA-F]{24}$/.test(details?.reference_number ?? "") ||
      details?.metadata?.solveone_purpose !== "platform" ||
      (typeof details?.livemode === "boolean" &&
        details.livemode !== (mode === "live")) ||
      !validProviderId(payment?.id, "pay") ||
      !Number.isSafeInteger(payment?.attributes?.amount) ||
      payment.attributes.amount < 1 ||
      payment.attributes.currency !== "PHP" ||
      (typeof payment.attributes.livemode === "boolean" &&
        payment.attributes.livemode !== (mode === "live"))
    )
      throw paymentError(
        400,
        "PAYMENT_WEBHOOK_INVALID",
        "Invalid payment event",
      );
    return {
      eventId: event.id,
      type: "paid",
      mode,
      donationId: details.reference_number,
      sessionId: session.id,
      paymentId: payment.id,
      amountCentavos: payment.attributes.amount,
    };
  }
  if (attributes.type === "refund.succeeded") {
    const refund = attributes.data;
    const details = refund?.attributes;
    if (
      !validProviderId(refund?.id, "ref") ||
      refund?.type !== "refund" ||
      !validProviderId(details?.payment_id, "pay") ||
      details?.status !== "succeeded" ||
      !Number.isSafeInteger(details?.amount) ||
      details.amount < 100 ||
      details?.currency !== "PHP" ||
      (typeof details?.livemode === "boolean" &&
        details.livemode !== (mode === "live"))
    )
      throw paymentError(
        400,
        "PAYMENT_WEBHOOK_INVALID",
        "Invalid payment event",
      );
    return {
      eventId: event.id,
      type: "refund",
      mode,
      refundId: refund.id,
      paymentId: details.payment_id,
      amountCentavos: details.amount,
    };
  }
  return {
    eventId: event.id,
    type: "ignored",
    mode,
    eventType: attributes.type,
  };
}
