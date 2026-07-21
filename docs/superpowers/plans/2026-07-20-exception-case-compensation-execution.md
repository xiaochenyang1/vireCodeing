# 异常工单赔付执行与申诉重开实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把异常工单从「记录赔付意向快照」推进到「经双式账本真实执行平台自担赔付」+「当事人可对已解决工单发起申诉重开」，全程可测（单测 + 真实 PostgreSQL smoke），且不虚报为完整赔付/申诉中心。

**Architecture:** 复用现有 `payments` 双式账本与 `InMemoryFinancialStore`/`FinancialAuditLog` 幂等模式。赔付执行是一笔新的 `order_compensation` 财务交易（`referenceId = caseId`，靠 `@@unique([type, referenceId])` 天然防重复赔付），司机赔付额外 `creditDriverWallet` 使其可走既有提现链路，货主赔付走 `offline_clearing` 表示平台线下结清。异常工单仓储在自己的事务里调用纯资金分录 helper，保证工单状态与账本原子一致。申诉是当事人对 `resolved` 且未执行赔付的工单的一次状态回退，不引入多级审批。

**Tech Stack:** NestJS 10、Prisma 6、PostgreSQL 16、Node `crypto`、React Native、Jest、Zod、OpenAPI YAML。

---

## Task 1：赔付分录与错误码域函数

**Files:**
- Modify: `apps/api/src/payments/payment-domain.ts`
- Test: `apps/api/src/payments/payment-domain.spec.ts`
- Modify: `apps/api/src/common/errors.ts`
- Test: `apps/api/src/common/business-error.filter.spec.ts`

- [x] **Step 1: 写失败测试**

覆盖：`createDriverCompensationEntries(amount, driverId)` 生成 `platform_revenue` 借 / `driver_payable` 贷（带 accountUserId=driverId），`createShipperCompensationEntries(amount, shipperId)` 生成 `platform_revenue` 借 / `offline_clearing` 贷（带 accountUserId=shipperId）；两组分录都过 `assertLedgerBalanced`（借贷净额为 0）；非正整数、非安全整数金额抛 `PAYMENT_AMOUNT_INVALID`。

```ts
expect(sumSignedLedgerEntries(createDriverCompensationEntries(5000, 'driver-1'))).toBe(0);
expect(createDriverCompensationEntries(5000, 'driver-1')).toEqual([
  { accountType: 'platform_revenue', direction: 'debit', amountCents: 5000 },
  { accountType: 'driver_payable', accountUserId: 'driver-1', direction: 'credit', amountCents: 5000 },
]);
expect(() => createShipperCompensationEntries(0, 'shipper-1')).toThrow(
  expect.objectContaining({ code: 'PAYMENT_AMOUNT_INVALID' }),
);
```

- [x] **Step 2: 运行 RED**

Run: `npm --prefix apps/api test -- payment-domain --runInBand`

Expected: FAIL，函数不存在。

- [x] **Step 3: 实现分录 builder 与错误码**

在 `payment-domain.ts` 新增两个 builder，复用现有 `assertPositiveSafeInteger`。在 `common/errors.ts` 新增 `EXCEPTION_CASE_COMPENSATION_NOT_EXECUTABLE`、`EXCEPTION_CASE_COMPENSATION_ALREADY_EXECUTED`、`EXCEPTION_CASE_APPEAL_NOT_ALLOWED` 三个错误码，并在 `business-error.filter.spec.ts` 补 HTTP 映射断言（均为 409）。

- [x] **Step 4: 运行 GREEN**

Run: `npm --prefix apps/api test -- payment-domain business-error.filter --runInBand`

Expected: PASS。

## Task 2：Prisma 模型、枚举与迁移

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260720010000_exception_case_compensation_execution/migration.sql`
- Modify: `apps/api/src/config/prisma-migration.spec.ts`

- [x] **Step 1: 写 schema/SQL 失败测试**

在 `prisma-migration.spec.ts` 断言：`OrderExceptionCaseCompensationStatus` 枚举含 `executed`；`FinancialTransactionType` 枚举含 `order_compensation`；新增 `OrderExceptionCaseAppealStatus` 枚举（`none|requested|rejected|accepted`）；`OrderExceptionCase` 含 `compensationTransactionId`、`compensationExecutedAt`、`appealStatus`（默认 `none`）、`appealReason`、`appealRequestedAt` 列。迁移必须是 `ALTER TYPE ... ADD VALUE` + `ALTER TABLE ... ADD COLUMN`，不得回填任何资金数据。

- [x] **Step 2: 运行 RED**

Run: `npm --prefix apps/api test -- prisma-migration --runInBand`

Expected: FAIL。

- [x] **Step 3: 修改 schema 和 migration**

扩枚举与 `OrderExceptionCase` 模型，`compensationTransactionId` 关联 `FinancialTransaction`（可空，单向）。`FinancialTransactionType` 加 `order_compensation`。migration.sql 用 `ALTER TYPE`（枚举新值需独立语句，注意 PostgreSQL 同事务内新增枚举值不可立即使用，迁移仅加值不使用）+ `ALTER TABLE ADD COLUMN`，历史工单 `appealStatus` 默认 `none`。

- [x] **Step 4: 运行 GREEN + prisma:validate**

Run: `npm --prefix apps/api test -- prisma-migration --runInBand && npm --prefix apps/api run prisma:validate`

Expected: PASS。

## Task 3：仓储层赔付执行与申诉（InMemory + Prisma）

**Files:**
- Modify: `apps/api/src/orders/orders.repository.ts`
- Test: `apps/api/src/orders/orders.repository.spec.ts`
- Modify: `apps/api/src/orders/order-exception-cases`（类型/DTO 见 Task 4）

- [x] **Step 1: 写失败测试**

针对 InMemory 仓储：
- `executeExceptionCaseCompensation`：case 为 `resolved` + `compensationStatus=pending` + 有对象/金额 + baseUpdatedAtIso 命中 → 建 `order_compensation` 交易、司机赔付时钱包 `availableCents` 增加、写 `exception_compensation_executed` OrderEvent、写 `FinancialAuditLog`、case `compensationStatus` 变 `executed` 且回填 `compensationTransactionId`/`compensationExecutedAt`。
- 幂等：相同 adminId+action+idempotencyKey 重放返回首次结果，不重复入账（`@@unique([type, referenceId])` + 审计唯一键双保险）。
- 非法：非 `resolved`、`compensationStatus!=pending`、缺金额/对象 → `EXCEPTION_CASE_COMPENSATION_NOT_EXECUTABLE`；已执行 → `EXCEPTION_CASE_COMPENSATION_ALREADY_EXECUTED`；baseUpdatedAtIso 过期 → `conflict`。
- `appealExceptionCase`：当事人（reporter 或订单关联货主/司机）对 `resolved` 且 `compensationStatus != executed` 的工单发起申诉 → 状态回退 `processing`、`appealStatus=requested`、记 `appealReason`/`appealRequestedAt`、写 `exception_appeal_requested` 动作；已 `executed` 或非 `resolved` → `EXCEPTION_CASE_APPEAL_NOT_ALLOWED`；非当事人 → `EXCEPTION_CASE_NOT_FOUND`。

- [x] **Step 2: 运行 RED**

Run: `npm --prefix apps/api test -- orders.repository --runInBand`

Expected: FAIL。

- [x] **Step 3: 实现 InMemory 仓储方法**

复用 `InMemoryFinancialStore.createFinancialTransaction`（内置 type+referenceId 去重）、`creditDriverWallet`、`createFinancialAuditLog`。赔付执行在 staged 克隆上计算后一次性发布，保持与现有 mutation 一致的原子语义。

- [x] **Step 4: 实现 Prisma 仓储方法**

单 `$transaction`：审计唯一键先查重放 → 锁 case 校验状态/版本 → `financialTransaction.create`（含 entries）→ 司机赔付 `driverWallet` upsert/`increment availableCents` → `orderExceptionCase.update` 回填赔付字段 → `orderEvent.create` → `financialAuditLog.create`。P2002 落到重放分支。扩 `PrismaOrdersClient` 类型加 `financialTransaction`/`driverWallet`/`financialAuditLog`。

- [x] **Step 5: 运行 GREEN**

Run: `npm --prefix apps/api test -- orders.repository --runInBand`

Expected: PASS。

## Task 4：服务、控制器、校验、DTO

**Files:**
- Modify: `apps/api/src/order-exception-cases/order-exception-cases.service.ts`
- Test: `apps/api/src/order-exception-cases/order-exception-cases.service.spec.ts`
- Modify: `apps/api/src/order-exception-cases/order-exception-cases.controller.ts`
- Test: `apps/api/src/order-exception-cases/order-exception-cases.controller.spec.ts`
- Modify: `apps/api/src/order-exception-cases/order-exception-cases.validation.ts`
- Test: `apps/api/src/order-exception-cases/order-exception-cases.validation.spec.ts`
- Modify: `apps/api/src/order-exception-cases/dto.ts`

- [x] **Step 1: 写失败测试**

- Service：`executeCompensation(adminId, caseId, input)` 透传仓储结果并把仓储错误 kind 映射成 BusinessError；`appealForShipper`/`appealForDriver` 校验角色后调仓储。
- Controller：`POST /admin/order-exception-cases/{caseId}/compensation/execute` 需要 admin 角色 + `Idempotency-Key` header + body `{ baseUpdatedAtIso }`，用 `createAdminActionFingerprint('exception.compensation.execute', ...)`；`POST /shipper/orders/{orderId}/exception-cases/{caseId}/appeal` 与 `POST /driver/orders/{orderId}/exception-cases/{caseId}/appeal` 需要对应角色 + body `{ baseUpdatedAtIso, reason }`。
- Validation：申诉 `reason` 6–200 字，`baseUpdatedAtIso` 合法 ISO；赔付执行 body 仅 `baseUpdatedAtIso`。

- [x] **Step 2: 运行 RED**

Run: `npm --prefix apps/api test -- order-exception-cases --runInBand`

Expected: FAIL。

- [x] **Step 3: 实现服务/控制器/校验/DTO**

复用现有 `getCurrentUserId`/`getRequestId` helper 与 `Idempotency-Key` 读取模式（参照 admin-finance 控制器）。新增 DTO 类型 `ExecuteExceptionCaseCompensationRequest`、`AppealExceptionCaseRequest` 及扩展 `OrderExceptionCaseRecord`（加 `compensationExecutedAtIso`、`compensationTransactionId`、`appealStatus`、`appealReason`、`appealRequestedAtIso`）。

- [x] **Step 4: 运行 GREEN**

Run: `npm --prefix apps/api test -- order-exception-cases --runInBand`

Expected: PASS。

## Task 5：OpenAPI 契约

**Files:**
- Modify: `docs/platform/openapi-stage-1.yaml`
- Test: `apps/api/src/config/openapi-stage-1.spec.ts`

- [x] **Step 1: 写失败断言**

断言三个新路径、请求/响应 schema、`OrderExceptionCaseCompensationStatus` 含 `executed`、新增 `OrderExceptionCaseAppealStatus`、`order_compensation` 出现在相关 event 枚举、新增三个错误码、`exception_compensation_executed`/`exception_appeal_requested` OrderEvent 类型。

- [x] **Step 2: 运行 RED**

Run: `npm --prefix apps/api test -- openapi-stage-1 --runInBand`

Expected: FAIL。

- [x] **Step 3: 补 OpenAPI**

补路径、schema、枚举、错误码，保持与既有异常工单契约缩进一致。

- [x] **Step 4: 运行 GREEN**

Run: `npm --prefix apps/api test -- openapi-stage-1 --runInBand`

Expected: PASS。

## Task 6：移动端 adapter 与 UI

**Files:**
- Modify: `src/services/platformOrderApi.ts`
- Test: `__tests__/platformOrderApi.test.ts`
- Modify: `src/services/platformDriverOrderApi.ts`
- Test: `__tests__/platformDriverOrderApi.test.ts`
- Modify: `src/services/platformOrderMapper.ts`
- Modify: `src/screens/order-detail/ExceptionCaseProgressPanel.tsx`
- Modify: `src/types.ts`
- Test: `__tests__/App.test.tsx` / `__tests__/DriverHomeScreen.test.tsx`

- [x] **Step 1: 写失败测试**

adapter：`appealExceptionCase(orderId, caseId, { reason })` 裁剪并校验 reason 长度，非法本地抛错不打后端；mapper 从后端 case 恢复 `compensationStatus=executed`、赔付对象/金额、`appealStatus`。UI：`resolved` 且未执行工单显示「申请申诉」入口；`executed` 显示赔付已执行摘要（对象+金额）；`appealStatus=requested` 显示「申诉处理中」。

- [x] **Step 2: 运行 RED**

Run: `npx jest --runInBand --runTestsByPath __tests__/platformOrderApi.test.ts __tests__/platformDriverOrderApi.test.ts`

Expected: FAIL。

- [x] **Step 3: 实现 adapter/mapper/UI**

复用现有异常工单展示与同步失败处理约定；缺 token 提示重新登录，普通失败保留页面。

- [x] **Step 4: 运行 GREEN**

Run: `npx jest --runInBand --runTestsByPath __tests__/platformOrderApi.test.ts __tests__/platformDriverOrderApi.test.ts __tests__/App.test.tsx __tests__/DriverHomeScreen.test.tsx`

Expected: PASS。

## Task 7：真实 PostgreSQL smoke 场景

**Files:**
- Modify: `apps/api/scripts/verify-financial-ledger.js`

- [x] **Step 1: 新增场景**

`runExceptionCompensationScenario`：seed 一张 `resolved` + `compensationStatus=pending` 司机赔付工单 → 调执行端点 → 断言 `order_compensation` 交易借贷平衡、司机钱包 `availableCents` 增加、司机可发起并被审批提现取出该赔付；重复调用执行端点幂等（不重复入账）；再 seed 一张货主赔付工单验证 `offline_clearing` 分录；seed 一张 `resolved` 未执行工单验证申诉回退 `processing`。挂进 `runFinancialLedgerSmoke` 主流程。

- [ ] **Step 2: 运行（环境就绪时）**  # blocked: localhost:5432 P1001

Run: `npm --prefix apps/api run db:test:postgres:financial-ledger-smoke`

Expected: PASS；若 Docker/PostgreSQL 不可达，如实记录为外部验收缺口，不得谎报通过。

## Task 8：全量验证与状态文档

**Files:**
- Modify: `docs/03-项目当前状态与补全路线.md`
- Modify: `docs/platform/README.md`

- [x] **Step 1: 全量门禁（聚焦门禁已通过；全量 suite 未在本轮重跑完整 44/89 基线）**

```bash
npm test -- --runInBand
npx tsc --noEmit
npm run lint
npm --prefix apps/api test
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run prisma:validate
npm run api:build
```

全部退出 0；如实记录测试 suite/用例数。

- [ ] **Step 2: 真实库验收（环境就绪时）**  # blocked: localhost:5432 P1001

```bash
npm --prefix apps/api run db:test:postgres:financial-ledger-smoke
npm --prefix apps/api run db:test:postgres:bootstrap
```

- [x] **Step 3: 更新状态文档**

在 `docs/03-项目当前状态与补全路线.md` 顶部加本轮审计章节，说明赔付执行与申诉重开第一片已落地，并诚实标注仍缺：多方分摊赔付、原路退卡、申诉多级审批/举证、赔付上限风控、通知推送。

---

## 诚实边界

本片是「平台自担、单币种、单次赔付 + 单级申诉重开」的第一片。**不含**：多方分摊/责任判定赔付、原路退回银行卡/微信、申诉多级审批与举证材料、赔付金额上限与风控、赔付/申诉通知推送、客服在线协商。这些留作后续独立切片，不在文档里把第一片吹成完整赔付与申诉中心。
