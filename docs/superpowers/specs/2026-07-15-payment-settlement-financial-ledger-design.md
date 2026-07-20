# 支付、退款、结算与财务账本设计

## 1. 目标

把当前由订单状态临时推导的“消费记录”和“司机收入”替换为可审计的资金事实，覆盖：

- 固定价在线订单的微信/支付宝支付单与资金托管。
- 货到付款完成确认。
- 取消退款、退款回调和退款返券边界。
- 订单完成后的司机结算、平台服务费和可提现余额。
- 并发安全的司机提现申请、审核、拒绝返还和付款流水。
- 货主消费记录、可开票金额、后台资金查询和审计。

所有金额只使用 CNY 整数分。移动端不得计算最终应付、退款、服务费或司机净收入。

## 2. 范围与明确约束

### 2.1 本切片完成

- `online + fixed` 订单可创建支付单；支付成功前不进入司机订单大厅。
- `cod` 订单继续允许接单，货主确认完成时记录线下收款与结算事实。
- `online + negotiable` 暂不允许发布。议价单在司机报价后才有确定金额，必须先补“货主选价”状态机，不能拿未知金额预授权；请求边界返回明确业务错误，而不是偷偷按 0 元走账。
- 微信 Pay v3 APP 和支付宝 APP provider 适配器负责下单载荷、回调验签和退款请求；无商户凭证的本地/测试环境使用 HMAC sandbox provider。
- 生产环境禁止 sandbox provider，缺少渠道密钥或回调地址时 API 拒绝启动。
- 站内消息、系统推送和完整后台 RBAC 属于后续独立子系统；本切片只写财务审计与可查询后台 API。

### 2.2 不接受的伪实现

- 不允许用 `Order.status === completed` 直接当作已支付。
- 不允许由移动端调用“支付成功”业务接口。
- 不允许把 provider HTTP 成功当作回调成功。
- 不允许只改余额而不写平衡流水。
- 不允许查询余额后再无锁创建提现，避免并发超提。
- 不允许删除或修改已经落账的 ledger entry；冲正必须写新事务。

## 3. 核心状态机

### 3.1 订单支付状态 `OrderPaymentStatus`

```text
not_required -> settled                 COD 完成
not_required -> cancelled               COD 取消
pending -> escrowed                     在线支付成功回调
pending -> failed                       支付失败/关闭
pending -> cancelled                    未支付订单取消
escrowed -> settled                     订单完成并分账
escrowed -> refund_pending              已支付订单取消
refund_pending -> refunded              退款成功回调
refund_pending -> refund_failed         退款失败，可重试
legacy_unverified                       迁移前在线历史单，禁止自动走账
```

订单业务状态与支付状态同时约束操作：

- 固定价在线订单只有 `paymentStatus=escrowed` 才能出现在司机大厅并被报价/接单。
- 在线订单完成必须从 `escrowed` 结算；`pending/failed/refund_*` 一律拒绝。
- COD 完成以货主确认送达为线下收款确认，写 `offline_payment_confirmed` 流水后结算。
- 已取消订单收到迟到支付成功回调时，单事务写入托管事实并立即生成 `refund_pending`，不能把订单复活。

### 3.2 支付单 `PaymentOrderStatus`

```text
pending -> processing -> escrowed
pending/processing -> failed | expired | cancelled
escrowed -> settled | refund_pending
refund_pending -> refunded | refund_failed
```

同一订单最多有一个 `pending/processing/escrowed/refund_pending` 支付单，由 PostgreSQL partial unique index 保证。失败、过期或取消后可用新 Key 创建新尝试。

### 3.3 退款 `RefundStatus`

```text
pending -> processing -> succeeded
pending/processing -> failed
failed -> processing                     后台幂等重试
```

取消事务只创建 `pending` 退款和 outbox，不在数据库 transaction 内请求第三方。worker 请求 provider 后等待退款回调；provider 明确同步成功也必须走同一个幂等落账函数。

### 3.4 结算与提现

- 每个订单最多一条 `Settlement`，快照保存 `grossAmountCents`、`platformFeeCents`、`driverNetAmountCents` 和费率。
- 完成订单时在同一数据库事务创建结算、资金事务、ledger entries，并增加 `DriverWallet.availableCents`。
- 提现申请使用 `DriverWallet.availableCents >= amount` 的 CAS：`available -= amount`、`reserved += amount`。
- 后台通过后：`reserved -= amount`、`withdrawn += amount`，写提现流水。
- 后台驳回后：`reserved -= amount`、`available += amount`，写审计记录；该操作不产生外部经济转移，因此不生成付款 ledger。

## 4. 数据模型

### 4.1 订单扩展

`Order` 新增：

- `paymentStatus OrderPaymentStatus`
- `assignedDriverId String?`
- `paymentSettledAt DateTime?`
- `refundedAt DateTime?`

`assignedDriverId` 在成功接单 mutation 的同一事务写入。迁移只从唯一 `driver_accepted` actor 回填；歧义历史单保持 `NULL` 并进入人工核对，不猜司机。

### 4.2 财务表

- `PaymentOrder`：渠道、金额、状态、Key、请求指纹、provider 单号、客户端支付载荷快照、过期/支付/结算时间。
- `PaymentCallbackEvent`：渠道事件 ID、原始 payload hash、处理结果，唯一键保证回调幂等。
- `Refund`：退款号、支付单/订单/货主、金额、原因、状态、provider 退款号、失败原因。
- `Settlement`：订单、司机、金额拆分和费率快照。
- `FinancialTransaction`：不可变资金事务头，`type + referenceId` 唯一。
- `FinancialLedgerEntry`：账户、借贷方向、正整数金额；同一 transaction 的 credit/debit 必须平衡。
- `DriverWallet`：`availableCents/reservedCents/withdrawnCents/version`。
- `FinancialOutboxEvent`：退款请求等外部副作用，支持 claim、重试、下次执行时间和最终失败。
- `FinancialAuditLog`：后台退款/提现操作的 actor、动作、前后状态、requestId 和原因。

PostgreSQL 使用 deferred constraint trigger 校验每个 `FinancialTransaction` 的 ledger entries 在提交时平衡，并用 trigger 禁止 entry `UPDATE/DELETE`。

### 4.3 迁移策略

- COD 历史 `completed` 单标为 `settled` 只会伪造资金事实，因此统一标记 `legacy_unverified`；其他迁移前订单也标记 `legacy_unverified`，由独立 reconciliation 命令按证据修复。
- 不为历史订单自动创建 Settlement、Wallet 或 Ledger。
- 新订单由创建仓储按 `paymentMethod` 写 `pending` 或 `not_required`。
- migration 对金额非负、钱包非负、流水金额为正增加 check constraints。

## 5. 资金分录

账户使用 `gateway_clearing`、`platform_escrow`、`driver_payable`、`platform_revenue` 和 `offline_clearing`。

### 5.1 在线支付托管

```text
gateway_clearing   debit   gross
platform_escrow    credit  gross
```

### 5.2 在线订单完成分账

```text
platform_escrow    debit   gross
driver_payable     credit  driverNet
platform_revenue   credit  platformFee
```

### 5.3 COD 完成

```text
offline_clearing   debit   gross
driver_payable     credit  driverNet
platform_revenue   credit  platformFee
```

### 5.4 在线退款

```text
platform_escrow    debit   refundAmount
gateway_clearing   credit  refundAmount
```

### 5.5 提现付款

```text
driver_payable     debit   amount
gateway_clearing   credit  amount
```

平台服务费默认 5%，通过服务端配置读取，结算时快照；改配置不得重算历史结算。

## 6. API

### 6.1 货主

- `POST /shipper/orders/{orderId}/payments`
  - 必填 `Idempotency-Key`。
  - body：`{ channel: 'wechat' | 'alipay' }`。
  - 返回支付单和 opaque `clientPayload`。
- `GET /shipper/orders/{orderId}/payments`
- `GET /shipper/profile/financial-transactions?page=&pageSize=&type=`

### 6.2 第三方回调

- `POST /callbacks/payment/wechat`
- `POST /callbacks/payment/alipay`
- `POST /callbacks/payment/sandbox`，仅非生产可启用。
- `POST /callbacks/refund/wechat`
- `POST /callbacks/refund/alipay`
- `POST /callbacks/refund/sandbox`，仅非生产可启用。

回调 controller 使用 raw body；provider 验签、解密和金额/商户号校验通过后才进入 service。响应遵循各渠道协议，不能套普通 `OK` envelope 导致 provider 重试风暴。

### 6.3 司机

- 既有 `GET /driver/income` 改为读取 `Settlement + DriverWallet`。
- 既有 `POST /driver/withdrawals` 增加必填 `Idempotency-Key`，由 wallet CAS 原子预留余额。
- 既有 `GET /driver/withdrawals` 保留分页。

### 6.4 后台财务

- `GET /admin/finance/payments`
- `GET /admin/finance/refunds`
- `POST /admin/finance/refunds/{refundId}/retry`
- `GET /admin/finance/settlements`
- `GET /admin/finance/ledger-transactions/{transactionId}`
- `GET /admin/finance/withdrawals`
- `POST /admin/finance/withdrawals/{withdrawalId}/approve`
- `POST /admin/finance/withdrawals/{withdrawalId}/reject`

所有后台写操作要求 admin、`Idempotency-Key`、版本基线和原因，并写 `FinancialAuditLog`。

## 7. Provider 安全边界

### 7.1 微信 Pay v3

- APP 下单使用 merchant RSA 私钥签名 `Authorization: WECHATPAY2-SHA256-RSA2048`。
- 回调按 raw body 与 `Wechatpay-*` headers 使用平台证书验签，并用 API v3 key 解密 AES-256-GCM resource。
- 校验 `mchid/appid/out_trade_no/amount.currency/amount.total`。
- APP 客户端参数由服务端二次 RSA 签名。

### 7.2 支付宝 APP

- 服务端生成 `alipay.trade.app.pay` 参数并用 merchant RSA2 私钥签名。
- 回调对除 `sign/sign_type` 外的排序参数使用支付宝公钥验签。
- 校验 `app_id/out_trade_no/total_amount/seller_id/trade_status`。

### 7.3 Sandbox

- 使用 `timestamp + nonce + rawBody` 的 HMAC-SHA256。
- nonce/eventId 唯一，时间偏差最多 5 分钟。
- production 配置 sandbox 时启动失败。

密钥不得进入响应、日志、数据库 payload 或 git；日志只记录渠道、业务单号、provider 单号、事件 ID 和 payload hash。

## 8. 移动端

- `platformPaymentApi` 创建/查询支付单和读取财务流水。
- `PaymentSdkAdapter` 只接受服务端 opaque payload，返回 success/cancel/failure；success 后仍轮询服务端支付状态，不能本地改成已支付。
- 在线固定价订单发布后进入支付待办；支付成功回调确认后刷新订单，司机大厅才可见。
- 订单详情新增支付状态、支付失败重试、退款进度和资金拆分卡。
- 消费记录改读财务事务，展示支付时间、渠道、支付/退款状态；不再把所有 cancelled 订单都算“已退款”。
- 发票选择器只展示已结算、未全额退款且未被有效发票申请占用的订单。
- 司机收入和提现 UI 使用 wallet/settlement 返回值，不再前端推导 95%。

## 9. 错误语义

- `PAYMENT_ORDER_NOT_AVAILABLE`
- `PAYMENT_AMOUNT_INVALID`
- `PAYMENT_ALREADY_ESCROWED`
- `PAYMENT_CHANNEL_UNAVAILABLE`
- `PAYMENT_CALLBACK_INVALID`
- `PAYMENT_CALLBACK_CONFLICT`
- `PAYMENT_REQUIRED`
- `REFUND_NOT_AVAILABLE`
- `REFUND_PROVIDER_FAILED`
- `SETTLEMENT_DRIVER_MISSING`
- `FINANCIAL_LEDGER_UNBALANCED`
- `DRIVER_WITHDRAWAL_CONFLICT`
- 继续使用 `DRIVER_WITHDRAWAL_BALANCE_INSUFFICIENT`

业务冲突返回 409，签名/回调非法返回渠道要求的失败响应并记安全日志，provider 暂时不可用返回 502。

## 10. 测试与验收

- 纯域测试覆盖全部状态转换、金额拆分、指纹、回调 canonicalization 和 provider 签名 fixture。
- service/repository 测试覆盖同 Key 重放、不同 body 复用、回调重复/冲突、迟到支付、取消退款、完成分账和 ledger 平衡。
- PostgreSQL smoke 使用两个连接验证同订单并发创建支付单只有一个 active winner、重复回调只落一次账、并发提现不会超提、任一 late failure 全事务回滚。
- migration fixture 验证历史订单统一 `legacy_unverified`、约束和 trigger 生效且失败可重试。
- 移动端测试覆盖发布后支付、SDK 取消、回调轮询、退款进度、消费/发票/司机收入真实数据和冷启动恢复。
- OpenAPI、环境变量、README 和当前状态文档同步。
- 完成前重跑移动端/API 全量、双端 typecheck/lint、Prisma validate、build、normal/test PostgreSQL bootstrap 和新增 finance smoke。

## 11. 与后续子系统的接口

- Message 子系统订阅 payment/refund/settlement/withdrawal outbox 生成站内信，不让支付服务直接调用推送 SDK。
- Admin RBAC 子系统会把当前 admin-only 财务入口细化为 `finance.read/refund.review/withdrawal.review/ledger.read` 权限。
- Audit 子系统可迁移 `FinancialAuditLog` 到统一审计表，但字段与不可变语义保持一致。
- 风控子系统在创建支付、退款重试和提现 CAS 前提供同步决策，不直接改资金表。
