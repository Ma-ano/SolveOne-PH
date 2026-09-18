# Phase 15 — AI Assistance

## Scope

Phase 15 adds one optional use of AI: turning a user-authored rough description
into a structured help-request suggestion. It runs only after the ordinary
request workflow and remains disabled by default. Users can always create,
save, submit, and moderate requests without AI.

The feature is deliberately not an agent and has no tools. It cannot approve a
request, verify identity, ban or suspend a user, make a payment, determine legal
eligibility, make a final fraud decision, set impact, or perform any workflow
transition.

## User confirmation boundary

The request editor presents a separate optional input and per-use consent. A
successful response appears as a preview marked not saved. The user must press
`Use these suggestions` before any suggested text enters the normal form, can
edit every copied field, and must separately save or submit through the existing
workflow.

The copy action intentionally leaves these fields under manual control:

- urgency, needed-by date, and location;
- item quantities, peso estimates, and time estimates;
- identity, verification, moderation, payment, fraud, and eligibility facts.

## Data minimization and redaction

The client sends only `{ description, consent: true }`. The server never adds
the profile, email, stored phone, location, request records, conversations,
verification documents, donations, credentials, or payment records. Before the
provider call it replaces detected instances of:

- email addresses and phone numbers;
- precise or labeled addresses;
- labeled government ID numbers;
- passwords, passcodes, OTPs, PINs, tokens, and API keys;
- bank, card, GCash, Maya, and other payment details.

The response tells the user which categories were redacted, not the removed
values. A description with insufficient non-sensitive detail is rejected. Raw
input and provider responses are not persisted by the feature.

Redaction is defense in depth, not a mathematical privacy guarantee. Production
enablement therefore requires privacy/legal approval, representative Philippine
format testing, monitoring that does not capture content, provider retention
review, and a documented incident process.

## Provider contract

The server supports OpenAI's Responses API and Groq's OpenAI-compatible Chat
Completions API. Groq uses strict Structured Outputs with a compatible model.
Both adapters use:

- an explicitly configured model and server-only API key;
- no tools and a bounded output-token limit; OpenAI also sets `store: false`;
- strict JSON Schema output;
- an HMAC-SHA-256 safety identifier instead of the user ID for providers that
  support one; Groq receives no user identifier;
- a bounded provider timeout and generic external-error handling.

The API key, model, and HMAC secret are never exposed through `EXPO_PUBLIC_*`
configuration. The model must support the configured structured-output request.
A live provider call was intentionally not made during automated verification.

## Validation and safety

Both the raw user text and provider suggestion pass deterministic request safety
rules. Prohibited or emergency content does not reach the provider. Returned
JSON is revalidated against a strict Zod schema and safety-checked again. Invalid,
unsafe, refused, malformed, timed-out, or non-successful provider responses all
become the same user-safe availability error and reveal no upstream payload.

The endpoint requires authentication, literal consent, strict request fields,
and a per-user limit (default five requests per hour). The provider receives a
pseudonymous 64-character identifier generated with an independent secret.

## Configuration

AI assistance stays off unless all of the following are set on the server:

```text
AI_ASSISTANCE_ENABLED=true
AI_PROVIDER=groq
GROQ_API_KEY=<server-only key>
GROQ_MODEL=openai/gpt-oss-20b
AI_SAFETY_IDENTIFIER_SECRET=<independent high-entropy secret>
```

Operational tuning uses `AI_REQUEST_RATE_LIMIT_WINDOW_MS`,
`AI_REQUEST_RATE_LIMIT_MAX`, and `AI_PROVIDER_TIMEOUT_MS`. No client secret or
database migration is involved.

## Verification performed

Automated coverage checks authentication, literal consent, strict schemas,
redaction categories, absence of raw sensitive values in provider inputs,
pseudonymous identifiers, no draft persistence, pre-provider safety rejection,
provider-output validation, generic failure mapping, disabled-mode behavior,
ordinary manual draft availability, and environment gating. Build verification
also covers the Expo web export and Android/iOS Hermes bundles.

## Known limitations

- Pattern redaction can have false positives and false negatives; users are
  instructed not to include sensitive data.
- Suggestions can be inaccurate, incomplete, biased, or poorly categorized.
- No duplicate detection, translation, moderator summarization, skill matching,
  or scam classification is implemented.
- Rate limiting is process-local; production horizontal scale needs a shared
  rate-limit store.
- Model/provider compatibility and service availability require an operator-run
  staging test with approved credentials.

## Deployment gate

Keep `AI_ASSISTANCE_ENABLED=false` until provider privacy and retention terms,
data-processing obligations, model compatibility, abuse monitoring, cost limits,
redaction evaluation, incident response, and user-facing policy language are
approved. Roll out gradually and retain the ability to disable the feature
without affecting core workflows.
