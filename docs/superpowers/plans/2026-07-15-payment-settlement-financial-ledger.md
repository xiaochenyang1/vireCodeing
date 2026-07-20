# Payment, Settlement, and Financial Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用真实支付单、回调幂等、退款 outbox、结算快照、双式账本和司机钱包替换订单状态推导的假消费/假收入。

**Architecture:** `payments` 模块拥有 provider、支付/退款/账本/钱包事实；订单仓储只在自己的事务中调用纯资金转换 helper，保证取消、完成、券与资金状态原子一致。外部 provider 请求通过 outbox 与数据库提交解耦，移动端只消费服务端 opaque payload 并轮询服务端状态。

**Tech Stack:** NestJS 10、Prisma 6、PostgreSQL 16、Node `crypto`/`fetch`、React Native、Jest、Zod、OpenAPI YAML。

---

## Task 1：资金域状态机与平衡分录

**Files:**
- Create: `apps/api/src/payments/payment-domain.ts`
- Test: `apps/api/src/payments/payment-domain.spec.ts`
- Modify: `apps/api/src/common/errors.ts`
- Test: `apps/api/src/common/business-error.filter.spec.ts`

- [ ] **Step 1: 写失败测试**

覆盖：在线固定价初始 `pending`、COD 初始 `not_required`、在线议价拒绝、托管/迟到支付/取消/完成状态转换、5% 拆分、每组分录借贷相等、非法金额和缺司机失败。

```ts
expect(createInitialOrderPaymentStatus('online', 'fixed')).toBe('pending');
expect(() => createInitialOrderPaymentStatus('online', 'negotiable')).toThrow(
  expect.objectContaining({ code: 'PAYMENT_AMOUNT_INVALID' }),
);
expect(createSettlementBreakdown(76000, 500)).toEqual({
  grossAmountCents: 76000,
  platformFeeRateBps: 500,
  platformFeeCents: 3800,
  driverNetAmountCents: 72200,
});
expect(sumSignedEntries(createOnlineSettlementEntries(breakdown))).toBe(0);
```

- [ ] **Step 2: 运行 RED**

Run: `npm --prefix apps/api test -- payment-domain --runInBand`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现最小域函数与错误码**

导出 `OrderPaymentStatus`、`PaymentOrderStatus`、`RefundStatus`、`SettlementBreakdown`、`LedgerEntryDraft`、`createInitialOrderPaymentStatus()`、`assertOrderCanEnterDriverHall()`、`assertOrderCanCompleteFinancially()`、`createSettlementBreakdown()` 和四类 entry builder。费率使用 basis points，所有输入必须是非负安全整数。

- [ ] **Step 4: 运行 GREEN**

Run: `npm --prefix apps/api test -- payment-domain business-error.filter --runInBand`

Expected: PASS。

## Task 2：Provider 配置、Sandbox、微信和支付宝签名边界

**Files:**
- Create: `apps/api/src/payments/payment-provider.ts`
- Create: `apps/api/src/payments/sandbox-payment.provider.ts`
- Create: `apps/api/src/payments/wechat-payment.provider.ts`
- Create: `apps/api/src/payments/alipay-payment.provider.ts`
- Test: `apps/api/src/payments/payment-provider.spec.ts`
- Modify: `apps/api/src/config/env.ts`
- Test: `apps/api/src/config/env.spec.ts`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/src/main.ts`
- Test: `apps/api/src/main.spec.ts`

- [ ] **Step 1: 写 provider fixture 失败测试**

测试 sandbox HMAC 的 5 分钟窗口、nonce/eventId、金额映射；微信请求签名、平台回调 RSA 验签/AES-GCM 解密；支付宝 RSA2 参数排序与回调验签。测试 production 禁止 sandbox，真实渠道缺 PEM/商户号/notify URL 时 `parseEnv` 失败。

- [ ] **Step 2: 运行 RED**

Run: `npm --prefix apps/api test -- payment-provider env main --runInBand`

Expected: FAIL，provider 和 env 字段不存在。

- [ ] **Step 3: 实现 provider 接口**

```ts
export interface PaymentProvider {
  readonly channel: 'sandbox' | 'wechat' | 'alipay';
  createClientPayment(input: ProviderCreatePaymentInput): Promise<ProviderClientPayload>;
  verifyPaymentCallback(input: ProviderRawCallback): Promise<VerifiedPaymentCallback>;
  requestRefund(input: ProviderRefundInput): Promise<ProviderRefundResult>;
  verifyRefundCallback(input: ProviderRawCallback): Promise<VerifiedRefundCallback>;
}
```

`main.ts` 以 `{ rawBody: true }` 创建 Nest app。日志/异常禁止输出私钥、API v3 key 和完整 callback body。

- [ ] **Step 4: 运行 GREEN**

Run: `npm --prefix apps/api test -- payment-provider env main --runInBand`

Expected: PASS。

## Task 3：Prisma 财务模型、约束与历史迁移

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260715010000_payment_settlement_financial_ledger/migration.sql`
- Modify: `apps/api/src/config/prisma-migration.spec.ts`
- Create: `apps/api/src/config/financial-ledger-migration.spec.ts`

- [ ] **Step 1: 写 schema/SQL 失败测试**

断言新 enum、`Order.paymentStatus/assignedDriverId`、八张财务表、partial unique active payment index、钱包非负 check、entry immutable trigger 和 deferred balance trigger。migration 必须把所有历史订单标为 `legacy_unverified`，不得自动造 Settlement/Ledger。

- [ ] **Step 2: 运行 RED**

Run: `npm --prefix apps/api test -- prisma-migration financial-ledger-migration --runInBand`

Expected: FAIL，模型和 migration 不存在。

- [ ] **Step 3: 修改 schema 和 migration**

新增 `PaymentOrder`、`PaymentCallbackEvent`、`Refund`、`Settlement`、`FinancialTransaction`、`FinancialLedgerEntry`、`DriverWallet`、`FinancialOutboxEvent`、`FinancialAuditLog`，补 User/Order/DriverWithdrawal 关系与索引。SQL 对历史数据 fail closed，不做资金推断。

- [ ] **Step 4: 运行 GREEN 和 Prisma validate**

```powershell
npm --prefix apps/api test -- prisma-migration financial-ledger-migration --runInBand
npm --prefix apps/api run prisma:validate
```

Expected: PASS。

## Task 4：支付单仓储、创建幂等与回调落账

**Files:**
- Create: `apps/api/src/payments/dto.ts`
- Create: `apps/api/src/payments/payments.validation.ts`
- Test: `apps/api/src/payments/payments.validation.spec.ts`
- Create: `apps/api/src/payments/payments.repository.ts`
- Test: `apps/api/src/payments/payments.repository.spec.ts`
- Create: `apps/api/src/payments/payments.service.ts`
- Test: `apps/api/src/payments/payments.service.spec.ts`

- [ ] **Step 1: 写创建和回调 RED**

覆盖合法渠道/UUID Key、同 Key 同 body 重放、不同 body reused、订单归属/状态/金额、active payment 单胜者、provider payload 快照、重复 callback 不重复 ledger、同 eventId 不同 payload conflict、迟到支付生成 `refund_pending + outbox`。

- [ ] **Step 2: 运行 RED**

Run: `npm --prefix apps/api test -- payments.validation payments.repository payments.service --runInBand`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 InMemory 与 Prisma 仓储**

`executeIdempotentPaymentCreate()` 和 `applyVerifiedPaymentCallback()` 都以 transaction 执行。回调 transaction 写 `PaymentCallbackEvent`、状态、OrderEvent、平衡 ledger、必要的退款/outbox；`P2002` 只能在查到本作用域记录后收敛。

- [ ] **Step 4: 运行 GREEN**

Run: `npm --prefix apps/api test -- payments.validation payments.repository payments.service --runInBand`

Expected: PASS。

## Task 5：订单创建、大厅、接单、取消和完成资金集成

**Files:**
- Modify: `apps/api/src/orders/dto.ts`
- Modify: `apps/api/src/orders/orders.validation.ts`
- Test: `apps/api/src/orders/orders.validation.spec.ts`
- Modify: `apps/api/src/orders/orders.repository.ts`
- Test: `apps/api/src/orders/orders.repository.spec.ts`
- Modify: `apps/api/src/orders/orders.service.ts`
- Test: `apps/api/src/orders/orders.service.spec.ts`
- Modify: `apps/api/src/driver-orders/driver-orders.service.ts`
- Test: `apps/api/src/driver-orders/driver-orders.service.spec.ts`

- [ ] **Step 1: 写跨订单状态 RED**

覆盖 online+negotiable 拒绝；新订单 payment status；司机大厅排除未托管在线单；接单同事务写 `assignedDriverId`；online 未 escrowed 不可完成；COD/online 完成同事务结算、ledger、wallet；取消 pending 关闭支付、取消 escrowed 创建退款 outbox；任一步失败全部回滚。

- [ ] **Step 2: 运行 RED**

Run: `npm --prefix apps/api test -- orders.validation orders.repository orders.service driver-orders.service --runInBand`

Expected: FAIL，现有订单仓储不处理资金状态。

- [ ] **Step 3: 复用纯 helper 扩展 transaction**

订单仓储 transaction client 增加财务表能力，但金额/转换逻辑只调用 `payment-domain.ts`。`mapPrismaOrder()` 和移动 DTO 暴露 `paymentStatus/assignedDriverId/paymentSettledAtIso/refundedAtIso`。

- [ ] **Step 4: 运行 GREEN**

Run: `npm --prefix apps/api test -- orders.validation orders.repository orders.service driver-orders.service --runInBand`

Expected: PASS。

## Task 6：退款 outbox、worker 与回调

**Files:**
- Create: `apps/api/src/payments/financial-outbox.worker.ts`
- Test: `apps/api/src/payments/financial-outbox.worker.spec.ts`
- Modify: `apps/api/src/payments/payments.repository.ts`
- Modify: `apps/api/src/payments/payments.service.ts`
- Test: `apps/api/src/payments/payments.service.spec.ts`

- [x] **Step 1: 写 outbox RED**

覆盖 claim lease、并发单 worker、指数退避、provider 暂时失败、最大次数 dead、退款同步成功走同一落账函数、重复退款 callback 不重复 ledger、金额/订单/provider 号冲突拒绝。

- [x] **Step 2: 运行 RED**

Run: `npm --prefix apps/api test -- financial-outbox payments.service --runInBand`

Expected: FAIL，worker 不存在。

- [x] **Step 3: 实现 worker**

worker 每次 claim 有限批次，外部 HTTP 不放在数据库事务内；provider 返回后用独立幂等 transaction 更新 outbox/refund。进程退出不丢事件，lease 到期可重领。

- [x] **Step 4: 运行 GREEN**

Run: `npm --prefix apps/api test -- financial-outbox payments.service --runInBand`

Expected: PASS。

## Task 7：司机钱包、收入与并发安全提现

**Files:**
- Create: `apps/api/src/payments/driver-finance.repository.ts`
- Test: `apps/api/src/payments/driver-finance.repository.spec.ts`
- Modify: `apps/api/src/driver-orders/driver-withdrawals.repository.ts`
- Modify: `apps/api/src/driver-orders/driver-orders.service.ts`
- Modify: `apps/api/src/driver-orders/driver-orders.controller.ts`
- Modify: `apps/api/src/driver-orders/driver-orders.validation.ts`
- Test: `apps/api/src/driver-orders/driver-orders.service.spec.ts`
- Test: `apps/api/src/driver-orders/driver-orders.controller.spec.ts`

- [x] **Step 1: 写 wallet/withdrawal RED**

收入只来自 Settlement；pending/available/reviewing/withdrawn 分开；提现 Key 重放；不同 body reused；两个并发提现只有不超余额的请求成功；审核通过写 wallet、付款 ledger 和 audit，驳回释放 wallet 并写 audit，重复审核稳定。

- [x] **Step 2: 运行 RED**

Run: `npm --prefix apps/api test -- driver-finance driver-orders.service driver-orders.controller --runInBand`

Expected: FAIL，仍按 completed orders 推导。

- [x] **Step 3: 实现 wallet CAS**

移除 `calculateDriverNetIncomeCents()` 推导入口。`POST /driver/withdrawals` 必填 UUID Key；Prisma transaction 用 `updateMany({ availableCents: { gte: amount }})` 风格的原子条件或锁行 SQL 实现余额预留。

- [x] **Step 4: 运行 GREEN**

Run: `npm --prefix apps/api test -- driver-finance driver-orders.service driver-orders.controller --runInBand`

Expected: PASS。

## Task 8：真实消费记录与可开票资格

**Files:**
- Modify: `apps/api/src/profile-spending/dto.ts`
- Modify: `apps/api/src/profile-spending/profile-spending.repository.ts`
- Modify: `apps/api/src/profile-spending/profile-spending.service.ts`
- Test: `apps/api/src/profile-spending/profile-spending.service.spec.ts`
- Modify: `apps/api/src/profile-invoices/profile-invoices.repository.ts`
- Modify: `apps/api/src/profile-invoices/profile-invoices.service.ts`
- Test: `apps/api/src/profile-invoices/profile-invoices.service.spec.ts`

- [x] **Step 1: 写财务事实 RED**

消费记录按 Payment/Refund transaction 展示支付渠道、支付时间、托管/结算/退款状态；cancelled 未支付单不算退款。发票只接受 settled 且未全额退款订单，金额从 Settlement/Payment 快照读取，拒绝 legacy_unverified。

- [x] **Step 2: 运行 RED**

Run: `npm --prefix apps/api test -- profile-spending profile-invoices --runInBand`

Expected: FAIL，现有服务按订单状态推导。

- [x] **Step 3: 改仓储与 DTO**

保留分页和现有 UI 所需 route/order 摘要，但资金字段来自财务表。发票占用检查与 eligibility 查询放入同一 transaction，避免并发重复开票。

- [x] **Step 4: 运行 GREEN**

Run: `npm --prefix apps/api test -- profile-spending profile-invoices --runInBand`

Expected: PASS。

## Task 9：Controller、Module 与后台财务 API

**Files:**
- Create: `apps/api/src/payments/payments.controller.ts`
- Test: `apps/api/src/payments/payments.controller.spec.ts`
- Create: `apps/api/src/payments/payment-callbacks.controller.ts`
- Test: `apps/api/src/payments/payment-callbacks.controller.spec.ts`
- Create: `apps/api/src/payments/admin-finance.controller.ts`
- Test: `apps/api/src/payments/admin-finance.controller.spec.ts`
- Create: `apps/api/src/payments/payments.module.ts`
- Test: `apps/api/src/payments/payments.module.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [x] **Step 1: 写 controller/DI RED**

断言货主/driver/admin guard 顺序、header 解析、raw callback 响应协议、后台分页/版本基线/原因、provider 选择和 worker 注入。普通 `ok()` envelope 不得包第三方 callback ACK。

- [x] **Step 2: 运行 RED**

Run: `npm --prefix apps/api test -- payments.controller payment-callbacks admin-finance payments.module app.module --runInBand`

Expected: FAIL，模块不存在。

- [x] **Step 3: 实现 controller/module**

生产启动时校验 provider 配置；回调 controller 不需要 bearer，但必须验签；后台写操作写 audit。将 `PaymentsModule` 注册进 `AppModule`。

- [x] **Step 4: 运行 GREEN**

Run: `npm --prefix apps/api test -- payments.controller payment-callbacks admin-finance payments.module app.module --runInBand`

Expected: PASS。

## Task 10：移动端支付、退款、消费、发票和司机钱包接线

**Files:**
- Create: `src/services/platformPaymentApi.ts`
- Test: `__tests__/platformPaymentApi.test.ts`
- Create: `src/utils/payment.ts`
- Test: `__tests__/paymentUtils.test.ts`
- Create: `src/screens/order-detail/PaymentStatusCard.tsx`
- Modify: `src/screens/OrderDetailScreen.tsx`
- Modify: `src/screens/profile/SpendingRecords.tsx`
- Modify: `src/screens/profile/InvoiceRecords.tsx`
- Modify: `src/screens/DriverHomeScreen.tsx`
- Modify: `src/types.ts`
- Modify: `App.tsx`
- Test: `__tests__/App.test.tsx`
- Test: `__tests__/OrderDetailScreen.test.tsx`
- Test: `__tests__/DriverHomeScreen.test.tsx`

- [x] **Step 1: 写 adapter/UI RED**

覆盖 header/body、服务端 opaque payload、SDK success 后轮询而非本地成功、取消/失败、冷启动 pending payment 恢复、退款状态、真实消费记录、发票 eligibility 和 wallet 提现 Key 重放。

- [x] **Step 2: 运行 RED**

Run: `npx jest platformPaymentApi paymentUtils App OrderDetailScreen DriverHomeScreen --runInBand --config jest.config.js`

Expected: FAIL，adapter/UI 不存在。

- [x] **Step 3: 实现移动端**

支付按钮只在 `pending/failed` 显示；轮询有超时和退避；退款 pending 禁止重复取消；消费/收入不再本地乘费率。使用现有组件、颜色和 8px 内圆角，不引入营销式大卡。

- [x] **Step 4: 运行 GREEN**

Run: `npx jest platformPaymentApi paymentUtils App OrderDetailScreen DriverHomeScreen --runInBand --config jest.config.js`

Expected: PASS。

## Task 11：OpenAPI、ERD、README 与错误示例

**Files:**
- Modify: `docs/platform/openapi-stage-1.yaml`
- Modify: `apps/api/src/config/openapi-stage-1.spec.ts`
- Modify: `docs/platform/erd-stage-1.md`
- Modify: `docs/platform/README.md`
- Modify: `docs/03-项目当前状态与补全路线.md`
- Modify: `docs/platform/mobile-migration-stage-1.md`

- [ ] **Step 1: 写 OpenAPI RED**

断言货主支付、六类 callback、司机提现 Key、后台 finance 路由、所有 schema/error/example、安全边界和 callback 非 envelope 响应。

- [ ] **Step 2: 运行 RED**

Run: `npm --prefix apps/api test -- openapi-stage-1 --runInBand`

Expected: FAIL，路径和 schema 不存在。

- [ ] **Step 3: 更新文档**

明确内部财务已完成的范围、真实 provider 需要的部署凭证、online+negotiable 拒绝理由、历史 legacy_unverified 和地图/消息/IM/RBAC 仍待后续计划，不能把 sandbox 当生产支付证据。

- [ ] **Step 4: 运行 GREEN 与 YAML 解析**

Run: `npm --prefix apps/api test -- openapi-stage-1 --runInBand`

Expected: PASS，YAML parser 成功。

## Task 12：真实 PostgreSQL 财务 smoke 与全量门禁

**Files:**
- Create: `apps/api/scripts/verify-financial-ledger.js`
- Test: `apps/api/src/config/financial-ledger-script.spec.ts`
- Modify: `apps/api/package.json`
- Modify: `.github/workflows/verify.yml`

- [ ] **Step 1: 写脚本 RED**

注册 normal/test `financial-ledger-smoke`，覆盖支付单并发单胜者、支付 callback 重放、迟到支付退款、完成分账、COD 结算、ledger trigger 晚失败回滚、并发提现不超提、审核通过/驳回和 outbox 重试。

- [ ] **Step 2: 运行 RED**

Run: `npm --prefix apps/api test -- financial-ledger-script postgres-verification-script --runInBand`

Expected: FAIL，脚本和 package scripts 不存在。

- [ ] **Step 3: 实现并接 bootstrap/CI**

smoke 启动编译 API、分配临时端口并在 `finally` 停止；临时 trigger/function 双清理；测试库 URL 必须与业务库不同。

- [ ] **Step 4: 运行真实数据库门禁**

```powershell
$env:DATABASE_URL='postgresql://truck:truck@localhost:5432/truck_platform'
$env:TEST_DATABASE_URL='postgresql://truck:truck@localhost:5432/truck_platform_test'
npm --prefix apps/api run db:test:postgres:financial-ledger-smoke
npm --prefix apps/api run db:test:postgres:bootstrap
```

Expected: 所有财务场景 PASS。

- [ ] **Step 5: 全量验证**

```powershell
npx jest --runInBand --config jest.config.js
npx tsc --noEmit
npm run lint
npm --prefix apps/api test
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run prisma:validate
npm run api:build
git diff --check
```

Expected: 全部退出 0，无新增 `TBD/TODO/FIXME`。
