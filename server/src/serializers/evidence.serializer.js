function timestamp(value) {
  return value ? new Date(value).toISOString() : null;
}

export function serializeEvidence(evidence) {
  if (!evidence) return null;
  return {
    offerId: String(evidence.offerId),
    submittedBy: String(evidence.submittedBy),
    note: evidence.note,
    files: (evidence.files ?? []).map((file) => ({
      id: String(file.id),
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
    })),
    actualMinutes: evidence.actualMinutes ?? null,
    submittedAt: timestamp(evidence.submittedAt),
    confirmedBy: evidence.confirmedBy ? String(evidence.confirmedBy) : null,
    confirmedAt: timestamp(evidence.confirmedAt),
    disputedBy: evidence.disputedBy ? String(evidence.disputedBy) : null,
    disputedAt: timestamp(evidence.disputedAt),
    disputeReason: evidence.disputeReason ?? null,
  };
}
