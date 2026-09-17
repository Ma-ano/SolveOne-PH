const credentialPatterns = [
  /\b(?:otp|one[ -]?time (?:pin|password|code))\b/i,
  /\b(?:password|passcode|banking pin|atm pin|card pin|cvv|recovery code)\b/i,
  /\b(?:private key|seed phrase|secret phrase)\b/i,
];
const paymentPatterns = [
  /\b(?:pay|send|transfer|deposit)\b.{0,50}\b(?:outside|directly|gcash|maya|crypto|wallet)\b/i,
  /\b(?:gcash|maya|crypto|wallet)\b.{0,50}\b(?:pay|send|transfer|deposit)\b/i,
];
const harassmentPatterns = [
  /\b(?:i(?:'|’)ll|i will) (?:hurt|find|kill) you\b/i,
  /\b(?:idiot|stupid|worthless)\b/i,
];
const phonePattern = /(?:\+?63|0)9\d{9}/g;

export function detectMessageSafetyFlags(content) {
  const text = typeof content === "string" ? content : "";
  const flags = [];
  if (credentialPatterns.some((pattern) => pattern.test(text))) {
    flags.push("credential_request");
  }
  if (paymentPatterns.some((pattern) => pattern.test(text))) {
    flags.push("suspicious_payment");
  }
  if (harassmentPatterns.some((pattern) => pattern.test(text))) {
    flags.push("harassment");
  }
  if ((text.match(phonePattern) ?? []).length >= 2) {
    flags.push("phone_spam");
  }
  return flags;
}
