const rules = Object.freeze([
  ["gambling", /\b(?:gambl(?:e|ing)|casino|sports?\s*bet|online\s*bet)\b/i],
  ["weapons", /\b(?:weapon|firearm|gun|ammunition|explosive)\b/i],
  [
    "illegal_goods",
    /\b(?:stolen\s+goods?|contraband|counterfeit\s+(?:id|document|money))\b/i,
  ],
  ["drugs", /\b(?:illegal\s+drugs?|shabu|methamphetamine|cocaine|heroin)\b/i],
  [
    "sexual_services",
    /\b(?:sexual\s+services?|escort\s+services?|pay\s+for\s+sex)\b/i,
  ],
  [
    "account_selling",
    /\b(?:sell|buy|rent)\s+(?:my\s+|an?\s+)?(?:online\s+|game\s+|social\s+media\s+)?account\b/i,
  ],
  [
    "credential_request",
    /\b(?:password|passcode|one[- ]time\s+(?:password|pin)|otp|banking\s+pin|cvv)\b/i,
  ],
  [
    "investment_scheme",
    /\b(?:guaranteed\s+returns?|investment\s+scheme|double\s+your\s+money)\b/i,
  ],
  ["loan_sharking", /\b(?:loan[- ]?shark|payday\s+loan|usurious)\b/i],
  ["suspicious_crypto", /\b(?:crypto|bitcoin|ethereum|usdt)\b/i],
  [
    "illegal_behavior",
    /\b(?:commit\s+(?:a\s+)?crime|evade\s+police|fake\s+(?:id|documents?)|break\s+the\s+law)\b/i,
  ],
  [
    "immediate_danger",
    /\b(?:immediate\s+danger|life[- ]threatening|being\s+attacked)\b/i,
  ],
  [
    "medical_emergency",
    /\b(?:medical\s+emergency|cannot\s+breathe|severe\s+bleeding|unconscious)\b/i,
  ],
  ["self_harm", /\b(?:self[- ]harm|suicid(?:e|al)|kill\s+myself)\b/i],
  ["violence", /\b(?:hurt|attack|kill)\s+(?:him|her|them|someone|people)\b/i],
]);

const emergencyFlags = new Set([
  "immediate_danger",
  "medical_emergency",
  "self_harm",
  "violence",
]);

export function assessRequestSafety(request) {
  const text = [
    request.title,
    request.description,
    ...request.needItems.flatMap((item) => [item.name, item.description]),
  ]
    .filter(Boolean)
    .join("\n");
  const flags = rules
    .filter(([, pattern]) => pattern.test(text))
    .map(([flag]) => flag);
  const hasMoney = request.helpTypes.includes("money");
  const moneyItems = request.needItems.filter((item) => item.type === "money");
  const vagueMoney =
    hasMoney &&
    moneyItems.some(
      (item) =>
        item.description.trim().length < 20 ||
        /^(?:help|cash|money|financial help|anything)$/i.test(item.name.trim()),
    );

  if (vagueMoney) {
    flags.unshift("vague_money_request");
  }

  return [...new Set(flags)];
}

export function safetyGuidanceFor(flags) {
  if (!flags.some((flag) => emergencyFlags.has(flag))) {
    return [];
  }

  return [
    "Community requests are not an emergency service. If anyone is in immediate danger or needs urgent medical help, contact local emergency services or a qualified professional now.",
  ];
}
