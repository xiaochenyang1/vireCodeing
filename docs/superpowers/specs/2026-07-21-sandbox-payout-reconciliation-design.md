# Sandbox Payout + Finance Reconciliation First Slice Design

## Goal

Close two remaining finance gaps without real merchant credentials:

1. Withdrawal approval must go through a pluggable payout provider, defaulting to sandbox.
2. Admin can run a finance consistency reconciliation report that surfaces wallet/ledger/settlement mismatches.

## Current Evidence

- WeChat/Alipay payment providers already exist, but this environment has no merchant keys.
- Withdrawal approve currently moves wallet reserved → withdrawn and writes `driver_withdrawal` ledger in one transaction, then marks status `paid`.
- There is no payout provider abstraction and no provider payout number stored on `DriverWithdrawal`.
- Finance report exists, but reconciliation of wallet vs ledger/settlement facts is missing.
- Finance report pending-withdrawal count currently filters `status === 'pending'`, while the schema uses `reviewing`.

## Scope

### In Scope

- `PayoutProvider` interface + `SandboxPayoutProvider`
- Withdrawal approve calls payout provider and persists:
  - `payoutChannel`
  - `providerPayoutNo`
  - `payoutExecutedAt`
- Fail closed if sandbox payout cannot be recorded
- `GET /admin/finance/reconciliation` consistency report
- Finance console panel for reconciliation findings
- Fix pending-withdrawal summary to use `reviewing`
- Tests, OpenAPI, status docs

### Out of Scope

- Real WeChat/Alipay merchant credential integration
- Real bank transfer / merchant transfer APIs
- Multi-step payout async outbox for withdrawals
- Full production reconciliation jobs / scheduled reports
- Dual-person payout approval

## Design

### Payout Provider

```ts
type PayoutRequest = {
  withdrawalId: string;
  driverId: string;
  amountCents: number;
  bankAccountName: string;
  bankName: string;
  bankAccountMasked: string;
};

type PayoutResult = {
  channel: 'sandbox';
  providerPayoutNo: string;
  status: 'succeeded';
  executedAtIso: string;
};
```

Sandbox always succeeds deterministically with:

`providerPayoutNo = sandbox-payout-{withdrawalId}`

Production later can add real channels without changing admin API.

### Withdrawal Approve

Keep one DB transaction for wallet CAS + ledger + audit. Within that flow:

1. Validate reviewing + expectedVersion
2. Call payout provider (sandbox)
3. On success, write payout metadata and mark `paid`
4. Wallet reserved → withdrawn, ledger `driver_withdrawal`

If provider throws, no wallet/ledger mutation is committed.

### Reconciliation Findings

Report categories:

- `wallet_vs_settlement_mismatch`
- `paid_withdrawal_missing_ledger`
- `paid_withdrawal_missing_payout_no`
- `settlement_missing_ledger`
- `reviewing_withdrawal_reserved_mismatch`
- `legacy_unverified_orders`

Each finding includes severity (`warning|error`), entity type/id, amountCents when relevant, and message.

## Honesty Boundary

Sandbox payout is not a real bank transfer. It only proves the approval path has a provider boundary and auditable payout metadata. Real merchant payout remains a later slice.
