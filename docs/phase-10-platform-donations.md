# Phase 10 — Platform-only donations

`Support SolveOne` is an optional contribution to operating SolveOne PH. It is deliberately separate from help requests, money pledges, recipients, impact totals, verification, ranking, and moderation. Phase 10 creates no recipient balance, wallet, escrow, transfer, or payout path.

## Launch gate and provider

New checkout creation is off by default with `PAYMENT_ENABLED=false`. Phase 10 uses PayMongo Hosted Checkout v2 so payment credentials are entered only on PayMongo's HTTPS checkout host. The server sends integer PHP centavos, a single platform line item, an internal donation reference, a platform-purpose marker, allowed payment methods, and a stable provider idempotency key. `pass_on_fees` is false. A returned checkout URL is accepted only from the exact `checkout.paymongo.com` host.

Set these server-only values to configure the adapter:

```text
PAYMENT_PROVIDER=paymongo
PAYMENT_ENABLED=false
PAYMENT_MODE=test
PAYMENT_SECRET_KEY=sk_test_...
PAYMENT_WEBHOOK_SECRET=...
PAYMENT_METHOD_TYPES=card,gcash,qrph
```

Configuring `PAYMENT_PROVIDER=paymongo` requires mode-matching non-placeholder secrets even while new checkout creation is disabled. This permits an operator to stop new checkouts without breaking signed settlement events for sessions already open. Production rejects test mode. Test and live records are permanently labeled and queried separately.

Do **not** turn on live checkout merely because configuration validates. The operator must obtain PayMongo approval for its exact business activity and verify current onboarding, prohibited-business, and charitable/nonprofit requirements. At the time of implementation, PayMongo's prohibited-business policy specifically requires proper registration for charitable/nonprofit organizations. Legal/accounting review must also decide whether the product may call a contribution a donation, what consumer disclosures and refund policy apply, and whether any tax-deductibility statement or receipt is lawful. This implementation makes no tax-deductibility claim.

Current provider references: [Hosted Checkout](https://docs.paymongo.com/docs/payment-channels-hosted-checkout), [Checkout quick start](https://docs.paymongo.com/docs/payment-channels-hosted-checkout-quick-start), [idempotent requests](https://docs.paymongo.com/reference/idempotent-requests), [webhook setup/signing](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management), [webhook events](https://docs.paymongo.com/docs/developer-tools-webhooks-events), [terms](https://www.paymongo.com/terms), and [prohibited businesses](https://www.paymongo.com/en/prohibited-businesses). Recheck them immediately before launch because provider requirements can change.

## Source of truth and lifecycle

The browser/provider redirect is informational. It never establishes payment. Only a fresh PayMongo signature verified over the exact raw request bytes can enter event processing. The selected `te` test or `li` live HMAC-SHA256 signature must match the configured mode; timestamp skew is limited to ten minutes. The parser then checks the event/resource types, mode, platform marker, internal donation ID, session/payment/refund IDs, integer amount, and PHP currency before a transaction may advance state.

Checkout creation has two layers of retry safety:

1. A SHA-256-hashed owner/idempotency key plus a normalized request hash is uniquely stored in MongoDB. The same key/amount returns the existing checkout; a different amount conflicts.
2. The same internal donation ID produces the same PayMongo idempotency key. A short MongoDB creation claim prevents simultaneous provider calls. A creation still unresolved near the provider's 24-hour idempotency retention becomes `attention` instead of risking a second charge session.

`pending` may become `paid` only through `checkout_session.payment.paid`. The transaction verifies exact donation, mode, amount, currency, session, and unique payment ID. Duplicate event IDs return safely. The webhook may win the race before the checkout-creation response is saved without losing the paid state.

`refund.succeeded` events are stored uniquely. A partial refund leaves the donation `paid` with a cumulative refunded amount; a full refund advances it to `refunded`. A refund arriving before its payment remains deferred and a retry-safe maintenance pass applies it after payment appears. Over-refunds remain deferred for reconciliation rather than corrupting totals. The admin dashboard includes deferred events in its attention count.

`failed` and `expired` remain canonical model states, but this phase does not infer them from a closed browser or elapsed wall time. Pending checkout expiry/provider reconciliation requires an explicit future provider-status job. A user closing checkout therefore leaves a pending record and cannot create a false failure or payment.

## API

| Method | Route                                               | Principal and result                                                                                                                      |
| ------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/platform-donations/checkout`               | Active authenticated owner; strict `{ amountCentavos }` from 1,000–1,000,000 and `Idempotency-Key`; returns hosted checkout URL or replay |
| GET    | `/api/v1/platform-donations/me?limit=20&cursor=...` | Authenticated owner; mode-scoped private history                                                                                          |
| GET    | `/api/v1/admin/platform-donations/dashboard`        | Admin only; audited mode-scoped counts/totals and 20 recent minimized records                                                             |
| POST   | `/api/v1/webhooks/paymongo`                         | PayMongo signature over raw JSON; idempotent event result                                                                                 |

There is no client or admin endpoint that sets `paid`, supplies a payment/provider ID, changes amount/currency/purpose, initiates a refund, or directs funds to a recipient. Checkout responses and history omit provider IDs and raw event data. The admin view omits donor identity and records a hashed-IP access audit.

## Data and indexes

- `platformdonations`: immutable owner/purpose/amount/currency/mode/request identity; guarded checkout state; provider session/payment references; paid/refund projection. Idempotency hashes, provider IDs, claim time, and checkout URL are excluded from normal selection.
- `donationwebhookevents`: unique provider event ID, mode, type, processing outcome, and minimal resource linkage.
- `donationrefunds`: unique provider refund, hidden payment reference, amount/mode, and deferred/application state.
- `auditlogs`: append-only `donation_dashboard_viewed` records with admin ID, mode, time, and HMAC-hashed IP.

Production disables automatic Mongoose index creation. Before accepting any checkout, back up and inspect these collections for duplicates, point `MONGODB_URI` at the intended database, and run `npm run db:index:donations` from `server/`. This create-only command does not drop or rewrite data. Confirm the unique owner/key, provider session/payment, event, and refund indexes exist before traffic. MongoDB must be a replica set or Atlas deployment because payment/refund transitions use transactions.

## Admin accounting boundary

The dashboard counts only webhook-confirmed gross contributions and recorded refunds. Pending sessions do not count. “After recorded refunds” is gross confirmed less recorded refunds; it is **not** processor settlement, bank reconciliation, fee net, revenue recognition, tax reporting, chargeback/dispute accounting, or an audited ledger. PayMongo and bank reports remain authoritative for settlement. Launch requires a documented daily reconciliation and exception workflow with access controls and retention for provider reports.

## Deployment review

Keep `PAYMENT_ENABLED=false` until all items below are complete:

1. Obtain PayMongo approval and complete business/charitable registration, terms, privacy, refund, consumer-protection, tax, and accounting review for the actual Philippine operator and copy.
2. Use separate test/live keys, rotate them through a secrets manager, expose the webhook only through HTTPS, register `/api/v1/webhooks/paymongo`, and subscribe/test `checkout_session.payment.paid` and `refund.succeeded` in the actual account. Confirm signature header format and event payloads against current provider behavior.
3. Run the donation index command, then perform live-database concurrency tests: simultaneous same-key checkout, webhook-before-checkout-response, duplicated events, refund-before-payment, partial/full/over-refund, transaction retry, and provider/API timeout. Unit mocks cannot prove replica-set or external-provider behavior.
4. Confirm reverse-proxy IP handling and capacity. The raw webhook is capped at 128 KB and independently limited, but a provider allowlist/WAF rule must be based on current documented provider infrastructure and must not block legitimate retries.
5. Reconcile provider settlement, fees, refunds, disputes/chargebacks, and bank deposits. Add alerting for `attention`, deferred refunds, signature failures, repeated provider errors, and webhook delivery lag. Define support/refund authority; this phase intentionally cannot issue a refund.
6. Verify checkout/accessibility on Android, iOS, and web, success/cancel deep-link behavior, provider receipt delivery, and account-deletion/financial-record retention obligations. A redirect must still display as unconfirmed until history changes by webhook.

The production posture remains **live checkout off by default**. The code path is implemented, but merchant approval, legal/accounting signoff, live provider validation, index deployment, reconciliation, monitoring, and dependency-risk disposition remain launch gates.

## Verification completed

- Server: 37 Vitest files and 198 tests passed, including exact raw-body signature integrity/freshness/mode, strict event normalization, checkout URL host validation, dual idempotency, owner/admin boundaries, mass-assignment denial, database guards, webhook-before-response tolerance, partial/deferred/over-refund behavior, hidden fields, indexes, and disabled-by-default configuration.
- Client: Expo SDK 57 dependency compatibility passed; the production web export produced 27 static routes; Android and iOS exports produced Hermes bytecode using temporary HTTPS build origins. The initial local-origin web export failed as designed because production requires an HTTPS API ending in `/api/v1`.
- Live services: no PayMongo API/webhook, MongoDB transaction/index, bank settlement, or production deep-link test was run. Test provider calls and MongoDB behavior are mocked.
- Dependencies: Phase 10 changed no package or lockfile. The most recent completed production audit from Phase 9 was zero server findings and 14 moderate client transitive findings. A fresh registry audit could not complete because npm was absent from the runtime and the network-approval quota was exhausted while preparing a disposable pnpm audit. Repeat both production audits before release.

## Known limitations

- Checkout is authenticated-only; anonymous contributions are not supported.
- Success/cancel URLs target the configured HTTPS web origin. Returning directly into an installed native app requires deployment-specific universal/app-link configuration and device testing; users can still reopen the app and refresh history.
- There is no refund-issuance UI/API, pending-session polling/expiry, provider dispute/chargeback projection, fee/settlement ledger, tax receipt, accounting export, or automated reconciliation alert.
- The admin dashboard is a minimized operational view, not a donor CRM or accounting system. It intentionally omits donor identity and provider identifiers.
