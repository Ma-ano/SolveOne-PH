export function requestIsFullySolved(needItems) {
  return (
    Boolean(needItems?.length) &&
    needItems.every((item) =>
      item.type === "money"
        ? (item.solvedValueCentavos ?? 0) >= item.estimatedValueCentavos
        : (item.solvedQuantity ?? 0) >= item.quantity,
    )
  );
}

export function requestHasConfirmedProgress(needItems) {
  return needItems.some(
    (item) =>
      (item.solvedQuantity ?? 0) > 0 || (item.solvedValueCentavos ?? 0) > 0,
  );
}
