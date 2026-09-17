function timestamp(value) {
  return value ? new Date(value).toISOString() : null;
}

export function serializeDonation(donation) {
  return {
    id: String(donation._id ?? donation.id),
    purpose: "platform",
    amountCentavos: donation.amountCentavos,
    currency: "PHP",
    mode: donation.mode,
    status: donation.status,
    refundedAmountCentavos: donation.refundedAmountCentavos ?? 0,
    createdAt: timestamp(donation.createdAt),
    paidAt: timestamp(donation.paidAt),
    refundedAt: timestamp(donation.refundedAt),
  };
}

export function serializeDonationCheckout(donation, replayed) {
  return {
    donation: serializeDonation(donation),
    checkoutUrl: donation.status === "pending" ? donation.checkoutUrl : null,
    replayed,
  };
}

export function serializeDonationDashboard(dashboard) {
  return {
    mode: dashboard.mode,
    currency: "PHP",
    checkouts: dashboard.checkouts,
    pending: dashboard.pending,
    confirmed: dashboard.confirmed,
    needsAttention: dashboard.needsAttention,
    deferredRefunds: dashboard.deferredRefunds,
    grossConfirmedCentavos: dashboard.grossConfirmedCentavos,
    refundedCentavos: dashboard.refundedCentavos,
    netAfterRefundsCentavos: dashboard.netAfterRefundsCentavos,
    recent: dashboard.recent.map(serializeDonation),
  };
}
