# 沙箱打款 + 财务对账第一片实施计划

**Goal:** 提现审批接入可插拔打款 provider（默认 sandbox），并提供 admin 财务一致性对账报表。

**Architecture:** 在现有 `driver-finance` 审批事务中调用 `PayoutProvider`；对账只读聚合支付/结算/钱包/提现/账本差异。

## Task 1: schema + payout provider

- [ ] `DriverWithdrawal` 增加 payout 元数据字段
- [ ] `SandboxPayoutProvider`
- [ ] migration + 契约测试

## Task 2: approve path

- [ ] approve 时调用 payout provider 并落库 providerPayoutNo
- [ ] 失败 fail closed
- [ ] 单测覆盖

## Task 3: reconciliation

- [ ] `GET /admin/finance/reconciliation`
- [ ] 修复 pending withdrawal 统计使用 `reviewing`
- [ ] 财务台展示
- [ ] OpenAPI + 文档
