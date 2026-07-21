# Exception Case Compensation Execution and Appeal First Slice Design

## Goal

Advance order exception cases from "records a compensation intention" to "moves real money through the financial ledger" and add a first-slice appeal loop so the related shipper or accepted driver can reopen a resolved case for re-handling.

When an administrator resolves a case with a pending compensation, they can execute that compensation. Execution creates a balanced double-entry `order_compensation` financial transaction, credits the driver wallet when the driver is the beneficiary, records an order event, and writes a financial audit log. The related party can appeal a resolved case that has not yet been executed, which rolls the case back to `processing` for re-handling.

This slice establishes auditable, ledger-backed compensation execution and a minimal appeal loop. It does not add multi-party cost sharing, original-card refund compensation, multi-level appeal review with evidence, compensation-limit risk control, or notifications.

## Current Evidence

- `resolveOrderExceptionCaseSchema` already accepts `compensationStatus` (`not_required | pending | offline_completed`), `compensationTargetRole` (`shipper | driver`) and `compensationAmountCents`.
- `transitionOrderExceptionCase` (in-memory and Prisma) only records the compensation snapshot on the case when resolving. It never creates a `FinancialTransaction`, never touches a wallet, and never writes an order event or audit log for compensation.
- There is no appeal or reopen path. The state machine is strictly forward-only `pending -> processing -> resolved -> closed`.
- The financial ledger is mature: `FinancialTransaction` has `@@unique([type, referenceId])`, ledger entries are enforced balanced by `assertLedgerBalanced`, `createOnlineEscrowEntries` / `createOnlineRefundEntries` / `createWithdrawalEntries` show the entry-draft pattern, and `InMemoryFinancialStore.creditDriverWallet` already exists.
- Admin financial actions use `FinancialAuditLog` keyed by `@@unique([actorAdminId, action, idempotencyKey])` plus `createAdminActionFingerprint`, and `PrismaDriverFinanceRepository.reviewWithdrawal` shows the full transaction pattern: idempotency replay, optimistic version guard, wallet CAS via `updateMany`, ledger transaction creation, and audit-log write inside one `$transaction`.
- Driver wallet balance (`availableCents`) feeds the existing withdrawal flow, so crediting the wallet is sufficient for the driver to receive compensation without a new payout channel.
- The current environment can now reach real PostgreSQL: `db:test:postgres:financial-ledger-smoke` and `db:test:postgres:bootstrap` passed on 2026-07-18. Real-database smoke coverage for this slice is therefore in scope, not deferred.

## Scope

### In Scope

- A new `order_compensation` financial transaction type with balanced ledger entries.
- Admin compensation execution for a resolved case whose `compensationStatus` is `pending`.
- Driver-beneficiary compensation crediting the driver wallet (withdrawable through the existing flow).
- Shipper-beneficiary compensation recorded as an offline clearing settlement obligation.
- Idempotent execution keyed by `Idempotency-Key` plus request fingerprint, with an optimistic `baseUpdatedAtIso` guard, mirroring the withdrawal-review pattern.
- Natural single-execution protection through `FinancialTransaction @@unique([type, referenceId])` with `referenceId = caseId`.
- A financial audit log for every execution.
- A first-slice appeal: the related shipper or accepted driver can appeal a `resolved`, not-yet-executed case, rolling it back to `processing`.
- OpenAPI, migration, status documentation, in-memory + Prisma repositories, unit/integration tests and a real PostgreSQL smoke scenario.

### Out of Scope

- Multi-party or split compensation, and compensation paid by the driver rather than the platform.
- Original-payment-channel (card/WeChat/Alipay) arbitrary-amount refund as compensation. Compensation is platform-funded in this slice.
- Multi-level appeal review, appeal evidence upload, or appeal SLA/escalation.
- Compensation-amount risk control, approval thresholds, or dual-person review.
- Push/SMS notifications and IM/chat.
- Reversing or clawing back an executed compensation.

## Data Model

### OrderExceptionCase compensation execution fields

Extend the existing model. The compensation snapshot columns (`compensationStatus`, `compensationTargetRole`, `compensationAmountCents`, `compensationUpdatedAt`) already exist.

```prisma
enum OrderExceptionCaseCompensationStatus {
  not_required
  pending
  offline_completed
  executed        // NEW: compensation moved through the ledger
}

enum OrderExceptionCaseAppealStatus {
  none
  requested
  rejected
  accepted
}

model OrderExceptionCase {
  // ... existing fields ...
  compensationTransactionId String?   // NEW: links to the FinancialTransaction
  compensationExecutedAt    DateTime? // NEW
  appealStatus              OrderExceptionCaseAppealStatus @default(none) // NEW
  appealReason              String?   // NEW
  appealRequestedAt         DateTime? // NEW
}
```

### FinancialTransactionType

```prisma
enum FinancialTransactionType {
  online_payment_escrow
  online_order_settlement
  offline_order_settlement
  online_refund
  driver_withdrawal
  order_compensation   // NEW
}
```

`referenceId` for an `order_compensation` transaction is the exception case ID. The existing `@@unique([type, referenceId])` constraint guarantees a case can be compensated at most once, even under concurrent execution requests.

## Ledger Entries

Compensation is platform-funded. Both variants debit `platform_revenue` (the platform bears the cost) and credit the beneficiary account. Both are balanced two-entry drafts validated by `assertLedgerBalanced`.

### Driver beneficiary

```text
debit  platform_revenue           amountCents
credit driver_payable (driverId)  amountCents
```

The transaction is paired with `creditDriverWallet(driverId, amountCents)` so the amount lands in the driver's withdrawable `availableCents`.

### Shipper beneficiary

```text
debit  platform_revenue              amountCents
credit offline_clearing (shipperId)  amountCents
```

`offline_clearing` represents a platform obligation settled to the shipper outside the app (no arbitrary-amount original-card refund channel in this slice). No wallet is credited because shippers do not have a wallet in the current model.

New domain helpers in `payments/payment-domain.ts`:

- `createDriverCompensationEntries(amountCents, driverId)`
- `createShipperCompensationEntries(amountCents, shipperId)`

Both assert a positive safe integer amount and return balanced drafts.

## Execution Transaction

`executeExceptionCaseCompensation` runs in one repository transaction and mirrors `reviewWithdrawal`:

1. Look up an existing audit log by `(adminUserId, 'exception_compensation.execute', idempotencyKey)`. If present and the fingerprint plus case ID match, replay the prior success; if the fingerprint or entity differs, return `key-reused`.
2. Load the case. Missing case returns `not-found`.
3. Guard preconditions: status is `resolved`, `compensationStatus` is `pending`, `compensationTargetRole` and `compensationAmountCents` are set, `updatedAt` equals `baseUpdatedAtIso`. A stale baseline returns `conflict`; a wrong status or non-pending compensation returns `state-invalid`.
4. Guard single execution: if an `order_compensation` transaction already exists for this case, return `already-executed`.
5. Resolve the beneficiary user ID from the order (driver from the accept event / `driverId`; shipper from `shipperId`). A missing beneficiary (for example a driver-targeted compensation on an order with no accepted driver) returns `state-invalid`.
6. Create the balanced `order_compensation` `FinancialTransaction` with `referenceId = caseId`.
7. For a driver beneficiary, credit the driver wallet.
8. Update the case: `compensationStatus = executed`, set `compensationTransactionId` and `compensationExecutedAt`, bump `updatedAt`, and append an `OrderExceptionCaseAction` documenting the execution.
9. Append an `exception_compensation_executed` order event on the order.
10. Write the `FinancialAuditLog` with before/after snapshots.

The Prisma path uses `updateMany` CAS guards on the case (status + updatedAt) and relies on the `@@unique([type, referenceId])` constraint plus a `P2002` catch to collapse concurrent executions into a single winner with a replayed result. The in-memory path stages a clone and commits atomically, matching the existing mutation pattern.

## Appeal Transaction

`appealExceptionCase(orderId, caseId, actorUserId, role, reason)`:

1. Validate the order relationship: a shipper must own the order; a driver must have accepted it. An unrelated caller returns `EXCEPTION_CASE_NOT_FOUND`.
2. Load the case and confirm it belongs to the order.
3. Guard: status is `resolved` and `compensationStatus` is not `executed`. Otherwise return `EXCEPTION_CASE_APPEAL_NOT_ALLOWED`. An executed compensation cannot be appealed in this slice to avoid ambiguous money-already-moved reopen semantics.
4. Roll the case back to `processing`, set `appealStatus = requested`, store `appealReason` and `appealRequestedAt`, bump `updatedAt`, and append an `OrderExceptionCaseAction` (`fromStatus = resolved`, `toStatus = processing`) with the appeal reason as content. The `adminUserId` on this action is the appealing user ID, marked as an appeal action.

When an administrator later resolves the reopened case, the existing resolve path runs unchanged; the `appealStatus` remains `requested` as a historical marker until a future slice adds explicit appeal adjudication (`accepted` / `rejected`). This slice does not auto-transition `appealStatus` on re-resolve, and the documentation states this plainly.

## API Design

### Admin

```text
POST /admin/order-exception-cases/{caseId}/compensation/execute
```

Requires `admin` role, an `Idempotency-Key` header and a body:

```ts
type ExecuteExceptionCaseCompensationRequest = {
  baseUpdatedAtIso: string;
  reason: string; // 6..500 chars, becomes the action content and audit reason
};
```

Returns the refreshed case plus the created financial transaction summary. Errors:

| Code | HTTP | Meaning |
| --- | --- | --- |
| `EXCEPTION_CASE_NOT_FOUND` | 404 | Case missing |
| `EXCEPTION_CASE_CONFLICT` | 409 | `baseUpdatedAtIso` stale |
| `EXCEPTION_CASE_COMPENSATION_NOT_EXECUTABLE` | 409 | Status not resolved, compensation not pending, or beneficiary unavailable |
| `EXCEPTION_CASE_COMPENSATION_ALREADY_EXECUTED` | 409 | An `order_compensation` transaction already exists |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Key reused with a different fingerprint |

### Shipper / Driver appeal

```text
POST /shipper/orders/{orderId}/exception-cases/{caseId}/appeal
POST /driver/orders/{orderId}/exception-cases/{caseId}/appeal
```

Body:

```ts
type AppealExceptionCaseRequest = {
  reason: string; // 6..500 chars
};
```

Returns the refreshed case. Errors: `EXCEPTION_CASE_NOT_FOUND` (404, unrelated caller or missing case), `EXCEPTION_CASE_APPEAL_NOT_ALLOWED` (409, not resolved or already executed).

## Mobile Experience

`ExceptionCaseProgressPanel` gains:

- A compensation summary line for resolved/executed cases: beneficiary label (`赔付货主` / `赔付司机`), amount, and status label:

  | compensationStatus | Mobile label |
  | --- | --- |
  | `not_required` | `无需赔付` |
  | `pending` | `待执行赔付` |
  | `offline_completed` | `线下已赔付` |
  | `executed` | `赔付已到账` |

- An `申诉` button on a `resolved`, not-executed case, opening a reason input. On success the panel reflects the reopened `processing` status and shows `已提交申诉，客服将重新处理`.
- Appeal status display when `appealStatus = requested`: `已申诉，等待客服重新处理`.

The appeal request reuses the existing independent progress-load pattern: failure preserves the order page; a missing token shows the existing re-login guidance. `EXCEPTION_CASE_APPEAL_NOT_ALLOWED` shows `当前工单状态不支持申诉。`.

Mobile adapters:

- `platformOrderApi.appealExceptionCase(orderId, caseId, reason)`
- `platformDriverOrderApi.appealExceptionCase(orderId, caseId, reason)`

Both trim inputs and reject an empty or over-length reason before the request. Compensation execution is admin-only and is not added to the mobile app.

## Admin Console

Extend `GET /api/admin/order-exception-case-console`: on a resolved case with a pending compensation, show an execute-compensation form (reason input) that calls the new endpoint with a generated `Idempotency-Key` and the current `baseUpdatedAtIso`. After execution the console reloads the detail and shows the compensation transaction number and `赔付已执行`. On `EXCEPTION_CASE_CONFLICT` it reloads without auto-retrying. This remains a static console, not a full operations workbench.

## Testing

### Domain

- `createDriverCompensationEntries` / `createShipperCompensationEntries` produce balanced drafts; non-positive or unsafe amounts throw `PAYMENT_AMOUNT_INVALID`.

### Repository (in-memory and Prisma parity)

- Execute compensation for a driver beneficiary: creates one balanced `order_compensation` transaction, credits the wallet, sets `compensationStatus = executed`, links `compensationTransactionId`, appends the action and order event, and writes the audit log.
- Execute compensation for a shipper beneficiary: same, crediting `offline_clearing`, no wallet change.
- Replaying the same idempotency key returns the same result without a second transaction.
- A second execution attempt (new key) returns `already-executed`.
- Non-resolved status, non-pending compensation and missing beneficiary return `state-invalid` / not-executable.
- A stale `baseUpdatedAtIso` returns `conflict` and mutates nothing.
- Appeal from the owner shipper / accepted driver rolls a resolved, not-executed case back to `processing` with an action row; an executed case returns not-allowed; an unrelated caller returns not-found.

### Validation and Service

- Execution and appeal request bodies validate `baseUpdatedAtIso` and `reason` (6..500).
- Service maps repository results to the correct business errors.

### API and OpenAPI

- Controller tests cover route binding, admin/shipper/driver guards, the `Idempotency-Key` requirement, response envelopes and error propagation.
- OpenAPI covers the three endpoints, request/response schemas, the new enum values, the new order-event type and the new business errors.
- Static admin-console contract test covers the execute form and conflict reload.

### Mobile

- Adapters trim and reject invalid reasons before fetch.
- Panel tests cover the compensation summary labels, the appeal flow (success, not-allowed, missing token, ordinary failure) and that the order page survives an appeal failure.

### Real PostgreSQL Smoke

Add `runExceptionCompensationScenario` to `scripts/verify-financial-ledger.js`:

- Seed a completed order with an accepted driver and a resolved, pending-compensation driver case; execute compensation; assert one balanced `order_compensation` transaction, the wallet credit, the withdrawable balance increase and a successful subsequent withdrawal.
- Seed a shipper-beneficiary case; execute; assert the `offline_clearing` credit and no wallet change.
- Re-issue the same execution request; assert idempotent replay with no second transaction.

Hook the scenario into `runFinancialLedgerSmoke` and keep it in the `bootstrap` chain.

## Verification Gates

```powershell
npm test -- --runInBand
npx tsc --noEmit
npm run lint
npm --prefix apps/api test
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run prisma:validate
npm run api:build
npm --prefix apps/api run db:test:postgres:financial-ledger-smoke
npm --prefix apps/api run db:test:postgres:bootstrap
```

## Documentation

Update `docs/platform/openapi-stage-1.yaml`, `docs/platform/README.md` and `docs/03-项目当前状态与补全路线.md`. Documentation must state that compensation execution and a first-slice appeal are implemented while multi-party/original-channel compensation, appeal adjudication, risk control and notifications remain incomplete.

## Completion Criteria

The slice is complete only when:

- resolving with a pending compensation can be executed into exactly one balanced `order_compensation` ledger transaction;
- driver compensation lands in the withdrawable wallet balance and can be withdrawn through the existing flow;
- shipper compensation is recorded as an offline clearing obligation;
- execution is idempotent and single-shot under concurrency, with a financial audit log per execution;
- the related shipper or accepted driver can appeal a resolved, not-executed case back to `processing`;
- OpenAPI and status documentation match behavior;
- all repository, API, mobile and full quality gates pass, including the real PostgreSQL financial-ledger smoke and bootstrap;
- no documentation presents this slice as a complete compensation, appeal, refund or notification system.

## Self Review

- Placeholder scan: no `TBD`, `TODO` or unspecified implementation placeholders.
- Internal consistency: compensation single-execution is enforced by `FinancialTransaction @@unique([type, referenceId])` with `referenceId = caseId`; the ledger stays balanced through `assertLedgerBalanced`; idempotency and audit follow the existing withdrawal-review pattern.
- Scope check: platform-funded, single-currency, single-execution compensation plus a minimal reopen appeal; no multi-party split, original-channel refund, appeal adjudication or notifications.
- Ambiguity check: executed compensation cannot be appealed; appeal rolls back to `processing` only; `appealStatus` stays `requested` until a future adjudication slice, stated explicitly rather than silently auto-resolved.
