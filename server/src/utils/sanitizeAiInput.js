const redactionRules = Object.freeze([
  {
    category: "authentication data",
    marker: "[removed authentication data]",
    patterns: [
      /\b(?:password|passcode|one[- ]time password|otp|pin|api[ _-]?key|access token|refresh token|auth token)\s*(?:is|:|=|-)?\s*[A-Za-z0-9_+/.=-]{3,}\b/gi,
      /\bsk-[A-Za-z0-9_-]{12,}\b/g,
    ],
  },
  {
    category: "payment information",
    marker: "[removed payment information]",
    patterns: [
      /\b(?:bank|account|card|gcash|maya)\s*(?:name|number|no\.?|details?|account)?\s*(?:is|:|=|-)?\s*[A-Za-z0-9 -]{6,}\b/gi,
      /\b(?:\d[ -]*?){13,19}\b/g,
      /\b(?:cvv|cvc)\s*(?:is|:|=|-)?\s*\d{3,4}\b/gi,
    ],
  },
  {
    category: "ID number",
    marker: "[removed ID number]",
    patterns: [
      /\b(?:sss|tin|philhealth|pag[- ]?ibig|passport|driver'?s? license|umid|national id)\s*(?:id|number|no\.)?\s*(?:is|:|=|-)?\s*[A-Za-z0-9-]{5,}\b/gi,
    ],
  },
  {
    category: "email",
    marker: "[removed email]",
    patterns: [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  },
  {
    category: "phone number",
    marker: "[removed phone number]",
    patterns: [
      /\b(?:phone|mobile|contact|tel(?:ephone)?)\s*(?:number|no\.)?\s*(?:is|:|=|-)?\s*(?:\+?63|0)?[\d ()-]{9,16}\b/gi,
      /(?<!\d)(?:\+?63|0)9\d{2}[ -]?\d{3}[ -]?\d{4}(?!\d)/g,
    ],
  },
  {
    category: "precise address",
    marker: "[removed precise address]",
    patterns: [
      /\b(?:address|home address|delivery address)\s*(?:is|:|=|-)?\s*[^\n.;]{5,120}/gi,
      /\b(?:block|blk|lot|unit|house)\s*\d+[A-Za-z-]*(?:\s*,?\s*(?:block|blk|lot|unit|house|street|st\.?|road|rd\.?|avenue|ave\.?|barangay|brgy\.?)\s*[A-Za-z0-9 -]+){1,3}/gi,
      /\b\d{1,5}[A-Za-z-]*\s+[A-Za-z][A-Za-z .'-]{1,50}\s+(?:street|st\.?|road|rd\.?|avenue|ave\.?)\b/gi,
    ],
  },
]);

export function sanitizeAiInput(value) {
  let sanitized = String(value ?? "").normalize("NFKC");
  const redactions = [];

  for (const rule of redactionRules) {
    let matched = false;
    for (const pattern of rule.patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(sanitized)) matched = true;
      pattern.lastIndex = 0;
      sanitized = sanitized.replace(pattern, rule.marker);
    }
    if (matched) redactions.push(rule.category);
  }

  return Object.freeze({
    sanitized: sanitized
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    redactions: Object.freeze([...new Set(redactions)]),
  });
}
