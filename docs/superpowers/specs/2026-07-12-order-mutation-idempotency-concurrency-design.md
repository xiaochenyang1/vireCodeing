# 订单变更幂等与乐观并发第一片设计

## 目标

为高风险订单变更补齐持久化幂等和乐观并发控制，避免弱网重试、重复点击或货主/司机并发操作造成重复事件、重复接单和后写覆盖先写。

第一片只覆盖会修改订单主体的操作：司机接单、司机推进运输状态、货主取消订单、货主推进状态、货主确认完成、货主编辑待接单订单。

## 当前证据

- `Order.updatedAt` 已由 Prisma `@updatedAt` 维护，并已作为 API 的 `updatedAtIso` 返回，但现有变更请求不携带版本基线。
- 当前服务通常先读取订单、判断状态，再执行更新和追加事件；并发请求可能在读取后同时通过校验。
- 司机接单、货主/司机状态推进、取消、完成和编辑均会修改订单主体，属于必须优先保护的操作。
- 移动端已经保存平台订单 `updatedAtIso`，同步失败队列也已经具备保留操作上下文和重试入口的基础。
- 异常工单已经使用 `baseUpdatedAtIso` 乐观并发，可以复用相同的错误处理和 UI 提示习惯。
- 当前 PostgreSQL 不可达，因此迁移结构、仓储契约和自动测试必须先完成；真实并发验收仍是环境就绪后的独立门禁。

## 范围

### 包含

- 以下接口请求体增加必填 `baseUpdatedAtIso`：
  - `PUT /shipper/orders/{orderId}`
  - `POST /shipper/orders/{orderId}/cancel`
  - `POST /shipper/orders/{orderId}/status`
  - `POST /shipper/orders/{orderId}/complete`
  - `POST /driver/orders/{orderId}/accept`
  - `POST /driver/orders/{orderId}/status`
- 上述接口要求 `Idempotency-Key` 请求头。
- 幂等键、请求指纹和首次成功响应持久化。
- 订单主体更新使用原子 compare-and-set，不再只依赖服务层先读后写。
- 移动端 adapter、运行态和失败重试队列保存并复用同一幂等键与版本基线。
- OpenAPI、迁移、错误码、文档和自动测试。

### 不包含

- 发单创建、报价、异常上报、评价、改单申请等新增记录或追加事件接口。
- 支付、退款、提现等资金幂等。
- 跨服务分布式锁、Redis 锁或消息队列去重。
- 自动合并冲突请求。
- 用户手工强制覆盖服务端最新订单。

## 三种方案比较

### 方案 A：只做 `baseUpdatedAtIso`

实现最小，但只能阻止陈旧覆盖，不能解决响应丢失后的同请求重放。第一次请求成功、客户端没收到响应时，第二次请求会得到冲突，客户端无法判断第一次是否成功。

### 方案 B：只做 `Idempotency-Key`

可以重放首次结果，但不同客户端使用不同幂等键时仍可能同时通过旧状态校验，无法阻止货主和司机互相覆盖。

### 方案 C：持久化幂等 + 乐观并发（采用）

同一操作重试由幂等记录返回首次成功结果，不同操作并发由订单版本 compare-and-set 决出唯一胜者。复杂度高于单机制，但这是支付账本接入前必须具备的正确边界。

## 数据模型

新增 `OrderIdempotencyRecord`：

```prisma
model OrderIdempotencyRecord {
  id                 String   @id @default(uuid())
  actorUserId        String
  orderId            String
  operation          String
  idempotencyKey     String
  requestFingerprint String
  responseSnapshot   Json
  createdAt          DateTime @default(now())
  expiresAt          DateTime
  actor               User     @relation("OrderIdempotencyActor", fields: [actorUserId], references: [id])
  order               Order    @relation(fields: [orderId], references: [id])

  @@unique([actorUserId, operation, idempotencyKey], name: "OrderIdempotencyRecord_actor_operation_key_unique")
  @@index([orderId, createdAt], name: "OrderIdempotencyRecord_order_created_idx")
  @@index([expiresAt], name: "OrderIdempotencyRecord_expires_idx")
}
```

约束说明：

- 幂等作用域为“当前用户 + 操作类型 + 幂等键”。不同用户可以使用相同 UUID，不会串响应。
- `operation` 使用稳定内部枚举值，例如 `shipper_cancel`、`driver_accept`，不直接依赖路由字符串。
- `requestFingerprint` 对 `orderId` 和规范化请求体计算 SHA-256；对象键排序，字符串使用校验后的裁剪值。
- `responseSnapshot` 保存首次成功的订单响应，不保存 access token、requestId 或 HTTP envelope。
- 默认重放窗口为 24 小时，可通过 `ORDER_IDEMPOTENCY_TTL_SECONDS` 配置。
- 幂等键只能代表一个请求；超过重放窗口后旧键不允许重新绑定新请求，返回过期错误并要求客户端生成新键。
- 第一片不删除过期记录，保证 Key 不会在清理后被重新解释；归档和长期保留策略在后续数据治理切片处理。

`User` 增加 `orderIdempotencyRecords` 反向关系，`Order` 增加 `idempotencyRecords` 反向关系，确保 actor 和 order 都有数据库外键约束。

不增加独立 `Order.version` 字段，第一片直接使用现有 `updatedAt` 作为版本。这样迁移面更小，并与现有移动端 `updatedAtIso` 数据流一致。

## 请求契约

### Idempotency-Key

- 必填 UUID 字符串，最大 64 字符。
- 缺失或格式非法返回 `400 IDEMPOTENCY_KEY_INVALID`。
- 相同作用域下，同 Key 且同请求指纹：返回首次成功响应，不再次修改订单或写事件。
- 相同作用域下，同 Key 但请求指纹不同：返回 `409 IDEMPOTENCY_KEY_REUSED`。
- 相同作用域下，记录已过重放窗口：返回 `409 IDEMPOTENCY_KEY_EXPIRED`，客户端必须生成新 Key。

### baseUpdatedAtIso

- 必须是带时区的合法 ISO 时间。
- 必须等于操作开始时服务端订单的 `updatedAtIso`。
- 版本不一致返回 `409 ORDER_CONFLICT`，响应不自动执行最新状态上的操作。

所有请求体在现有字段基础上增加：

```ts
type OrderMutationConcurrencyRequest = {
  baseUpdatedAtIso: string;
};
```

## 处理顺序

每个受保护接口遵循同一顺序：

1. 完成身份、角色、路径参数、请求头和请求体校验。
2. 规范化请求并计算请求指纹。
3. 按用户、操作和幂等键查找已有记录。
4. 若存在记录，先处理同请求重放、Key 复用或过期，不再检查当前订单版本。
5. 若不存在记录，读取订单并校验归属、接单关系和允许状态。
6. 在同一数据库事务内，以 `id + updatedAt + 当前状态` 执行原子 compare-and-set，追加对应订单事件，并写入幂等记录和成功响应快照。
7. compare-and-set 未命中时重新读取订单：版本变化返回 `ORDER_CONFLICT`；订单不存在或不可见仍按现有 not-found 语义；版本未变但状态不合法返回现有 `ORDER_STATE_INVALID`。

幂等记录与订单变更必须同事务提交。事务失败时两者都不保留，避免出现“记录说成功、订单没变化”或“订单已变化、重试无法重放”的半截状态。

## 原子更新与事件

- 司机接单必须以 `status=waiting` 和 `updatedAt=baseUpdatedAtIso` 为条件更新为 `loading`，只有一个司机能够成功。
- 状态推进同时匹配当前状态、目标状态规则和版本基线。
- 货主取消、完成和编辑同时匹配归属、允许状态和版本基线。
- 每次首次成功只写一条现有业务事件。
- 幂等重放不新增事件，也不刷新 `Order.updatedAt`。
- `responseSnapshot` 必须是首次事务完成后的完整订单快照，重放时原样返回该业务数据；外层 envelope 的 `requestId` 和 `timestamp` 仍由当前请求重新生成。

## 移动端行为

- 首次发起受保护操作时生成 UUID 幂等键。
- adapter 将 Key 放入 `Idempotency-Key` 请求头，将当前订单 `updatedAtIso` 放入请求体。
- 普通失败或网络超时进入同步失败队列时，同时保存操作参数、幂等键和原始版本基线。
- 点击重试必须复用原 Key 和原基线，不能生成新 Key；这样第一次已成功但响应丢失时能够安全拿回首次结果。
- 收到 `ORDER_CONFLICT` 时刷新订单详情，保留用户可理解的提示，不自动在最新版本上重放原操作。
- 收到 `IDEMPOTENCY_KEY_REUSED` 或 `IDEMPOTENCY_KEY_EXPIRED` 时停止自动重试并提示重新发起操作。

第一片不新增复杂冲突合并 UI，只展示类似“订单已被其他操作更新，请刷新后确认最新状态”。

## 错误码

| 错误码 | HTTP | 含义 |
| --- | --- | --- |
| `IDEMPOTENCY_KEY_INVALID` | 400 | 幂等键缺失或格式非法 |
| `IDEMPOTENCY_KEY_REUSED` | 409 | 同一作用域的 Key 被用于不同请求 |
| `IDEMPOTENCY_KEY_EXPIRED` | 409 | 幂等结果已超过重放窗口 |
| `ORDER_CONFLICT` | 409 | `baseUpdatedAtIso` 已陈旧 |
| `ORDER_STATE_INVALID` | 409 | 当前订单状态不允许目标操作 |
| 现有 not-found / auth / file 错误 | 原状态码 | 保持现有语义 |

错误优先级为：认证与角色 → 输入校验 → 已有幂等记录 → 订单权限/状态/版本。这样同请求重放不会因为订单后来再次变化而丢失首次成功结果，同时未授权用户也不能通过幂等键探测数据。

## 仓储边界

新增统一仓储能力，而不是在六个 service 方法里各写一套拼装逻辑：

```ts
type ExecuteIdempotentOrderMutationInput<TResponse> = {
  actorUserId: string;
  orderId: string;
  operation: OrderMutationOperation;
  idempotencyKey: string;
  requestFingerprint: string;
  baseUpdatedAtIso: string;
  mutate: TransactionOrderMutation;
};
```

Prisma 仓储负责事务、唯一约束、compare-and-set、事件与快照落库；内存仓储以相同顺序模拟原子发布，确保 service 测试和真实仓储契约一致。service 负责业务权限、状态机和错误映射，不直接拼 Prisma 查询。

## OpenAPI

- 六个接口声明必填 `Idempotency-Key` header。
- 请求 schema 增加 `baseUpdatedAtIso`。
- 文档明确同 Key 同请求的响应重放语义。
- 增加四个新错误码及 400/409 示例。
- 订单响应中的 `updatedAtIso` 标记为下一次变更的并发基线。

## 测试

### 校验与指纹

- 幂等键缺失、非 UUID、过长被拒绝。
- `baseUpdatedAtIso` 缺失、无时区或非法被拒绝。
- 规范化后相同请求生成相同指纹；字段或订单 ID 变化生成不同指纹。

### 服务与仓储

- 六类操作首次成功各写一次订单、一次事件和一条幂等记录。
- 同 Key 同请求重复调用返回首次快照，订单与事件数量不变。
- 同 Key 不同请求返回 `IDEMPOTENCY_KEY_REUSED`。
- 过期记录返回 `IDEMPOTENCY_KEY_EXPIRED`。
- 两个司机使用不同 Key、相同基线并发接单时只有一个成功，另一个返回 `ORDER_CONFLICT`。
- 货主和司机使用同一旧基线并发推进时只有一个 compare-and-set 命中。
- 事务中事件或幂等记录写入失败时订单更新回滚。
- 内存仓储和 Prisma 仓储返回一致的业务快照。

### Controller 与 OpenAPI

- 角色 guard 在 header/body 解析和 service 调用前执行。
- controller 正确传递用户、订单 ID、幂等键和请求体。
- OpenAPI 覆盖 header、基线字段、错误码和重放说明。

### 移动端

- adapter 发送 Key 与版本基线。
- 首次操作生成 Key，失败队列保存 Key，重试复用 Key。
- 成功回写新的 `updatedAtIso`。
- 冲突刷新详情但不自动执行原操作。
- 现有本地模式不因平台并发字段而失效。

## 验证门禁

```powershell
npm test -- --runInBand
npx tsc --noEmit
npm run lint
npm --prefix apps/api test
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run prisma:validate
npm run api:build
```

PostgreSQL 可达后还必须执行 migration deploy，并增加两个独立数据库连接同时竞争接单/状态推进的 smoke test。当前环境不可达时必须如实记录 `P1001`，不能把内存并发测试当成真实数据库验收。

## 完成标准

- 六个高风险变更接口同时要求幂等键与版本基线。
- 同请求重放返回首次结果且不产生重复事件。
- 不同请求复用 Key 被明确拒绝。
- 陈旧版本不能覆盖服务端最新订单。
- 并发接单只有一个司机成功。
- 幂等记录、订单更新和业务事件原子提交。
- 移动端失败重试复用原 Key 与原基线。
- OpenAPI、迁移和项目状态文档与实现一致。
- 全部门禁通过，真实 PostgreSQL 验收状态被准确披露。

## 自检

- 占位检查：无 `TBD`、`TODO` 或未决字段。
- 一致性检查：六个接口统一采用相同幂等作用域、请求指纹、24 小时重放窗口和 `updatedAt` 并发基线。
- 范围检查：未混入支付、退款、追加事件去重或分布式锁。
- 歧义检查：同 Key 重放优先于当前订单版本判断；Key 过期后不得重新绑定；冲突不自动合并或重放。
