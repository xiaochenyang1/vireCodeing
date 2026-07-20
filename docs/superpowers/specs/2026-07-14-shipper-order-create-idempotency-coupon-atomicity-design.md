# 发单幂等与订单优惠券原子一致性设计

## 决策摘要

本设计采用同库原子事务：`POST /shipper/orders` 增加必填 `Idempotency-Key`，创建、待接单更新、取消和完成时涉及的订单主体、订单事件、优惠券状态和幂等响应快照全部由 `PrismaOrdersRepository` 在同一个 PostgreSQL 事务中提交。

优惠券仍由 `ProfileCouponsRepository` 提供钱包查询和后台发放能力，但订单用券不再由 `OrdersService` 在订单事务前后调用 `lockCoupon()`、`releaseCoupon()` 或 `redeemCoupon()`。当前两个仓储本来就使用同一个 `PrismaService`，没有跨服务边界；继续拆事务只会制造无法可靠恢复的半成功状态。

## 目标

- `POST /shipper/orders` 必须携带 UUID `Idempotency-Key`，请求体不增加 `baseUpdatedAtIso`。
- 同一货主使用同 Key、同规范化请求重复发单时返回首次成功订单快照，不重复创建订单、`created` 事件或幂等记录。
- 同一货主使用同 Key、不同请求时返回 `IDEMPOTENCY_KEY_REUSED`；过期 Key 返回 `IDEMPOTENCY_KEY_EXPIRED`。
- 创建、更新、取消、完成的券锁定、换券释放、取消释放和完成核销与订单、事件、幂等快照同事务提交。
- 两个请求并发争用同一张券时只有一个事务成功，败者不留下订单、事件、幂等记录或临时券状态。
- InMemory 与 Prisma 仓储遵守相同的幂等、券状态转换、原子发布和错误优先级契约。
- 移动端首次发布生成创建 Key；普通失败和缺登录态均持久化原 Key，手工重试复用该 Key。
- OpenAPI、迁移契约、真实 PostgreSQL smoke 和 CI 门禁覆盖上述行为。

## 不在范围

- 支付扣款、退款返券、托管、分账和支付回调幂等。
- 营销规则引擎、批量活动、领券、防刷和优惠券叠加。
- 将优惠券拆成独立服务、消息队列、分布式事务或 Redis 锁。
- 报价、异常上报、评价、改单申请等追加型接口的幂等扩面。
- 自动删除或复用过期幂等键。

## 当前证据与缺口

- `OrdersService.createOrder()` 当前按“锁券 -> 建单 -> 绑定订单号”执行，建单成功而绑定失败时会留下真实订单和未正确绑定的券。
- 更新订单先锁新券，订单事务成功后再释放旧券；取消和完成也在订单事务成功后分别释放、核销。进程退出或券调用失败会让订单和券永久分叉。
- 受保护变更的 replay preflight 会直接返回幂等快照，并且后续券动作受 `!replayed` 限制，因此同 Key 重放无法修复已经提交的半成功状态。
- `PrismaOrdersRepository.executeIdempotentOrderMutation()` 已经把订单 CAS、事件和幂等快照放在同一事务里，缺的是把券 CAS 纳入该事务。
- `ShipperCoupon` 已有 `status`、`lockedOrderNo/lockedAt` 和 `usedOrderNo/usedAt`，能够表达订单侧第一片状态，不需要 effect/outbox 字段。
- Prisma 发单号当前按当日订单数量 `count + 1` 生成。两个并发创建可能得到相同 `orderNo`，因此本设计同时引入数据库 sequence，不能拿券 CAS 修好了又被订单号竞态绊倒。
- 移动端更新/取消/完成已经持久化 `{ idempotencyKey, baseUpdatedAtIso }`，但创建失败只保存普通同步失败状态，重试会再次无 Key 调用 `createOrder()`。

## 方案权衡

### 方案 A：持久化 coupon effect 并在 replay 补偿

在 `OrderIdempotencyRecord` 上保存 pending/applied effect，订单事务提交后执行券动作；重放时继续补偿。它能保留仓储分层，但需要 effect 状态机、锁 owner token、重试调度、死信和“券已改、effect 未标记”的 target-state 去重。当前优惠券和订单共库，复杂度没有业务收益。

### 方案 B：同一 Prisma 事务原子提交（采用）

`OrdersRepository` 接收订单写命令和券转换意图，在同一个 interactive transaction 中完成幂等检查、订单/事件写入、券 CAS 和响应快照。任一步失败全部回滚；不存在“订单事务成功、券副作用失败”这一可持久化状态。当前拓扑下这是数据模型最小、恢复语义最强的方案。

### 方案 C：事务 outbox 与异步券服务

订单事务写出唯一 effect，worker 调用券服务，券端按 effect ID 去重。它适合未来真正拆服务，但会引入 pending 用户态、worker、租约、重试和运维观测。本阶段不采用，若将来拆库再从同事务命令演进为 outbox。

## 核心不变量

1. 一个成功的订单写事务必须同时满足订单主体、恰好一条对应事件、最终券状态和一条首次成功幂等快照全部存在。
2. 一个失败的订单写事务不得保留本次订单、事件、幂等记录或券状态变化。
3. 同一 `actorUserId + operation + idempotencyKey` 最多一条幂等记录。
4. 同 Key 同指纹只返回首次快照；重放不读取当前券可用性，不刷新订单 `updatedAt`，不新增事件。
5. 同一张券从 `usable` 进入 `locked` 的 CAS 最多由一个并发事务命中。
6. 订单只信任服务端券记录的归属、状态、有效期、门槛、标题和优惠金额；客户端金额仅用于一致性校验，不能成为计价权威。
7. 创建请求没有既有订单版本，因此不接收 `baseUpdatedAtIso`；更新、取消和完成继续要求原始版本基线。
8. `ExecuteOrderMutationInput` 只携带现有 mutation union；券动作必须由仓储在 transaction 内根据 current order 与 mutation 派生，service 不传 `orderNo`、旧券 ID 或券命令。
9. 创建 Key 和带 `createContext` 的本地 pending 占位订单必须先成功持久化，再允许发送 HTTP 请求，即 key durable-before-send。
10. 升级前缺少 `createContext` 的旧创建失败项不得自动生成 Key 并静默重发；它只能先刷新平台列表，再由用户确认一次新的发布。
11. 历史券修复迁移必须在订单写入静默窗口执行，并在任何 UPDATE 前完成全量归属冲突检查。

## API 与幂等契约

### 创建订单

```http
POST /shipper/orders
Authorization: Bearer <token>
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json
```

- `Idempotency-Key` 必填，沿用 UUID、最大 64 字符和 24 小时默认 TTL。
- 请求体继续使用 `CreateShipperOrderRequest`，不得出现 `baseUpdatedAtIso`。
- 新增稳定操作名 `shipper_create`。
- 创建指纹为 `SHA-256(stableJson({ operation: 'shipper_create', request }))`；字段先经过现有 Zod trim/归一化，对象键递归排序。
- 幂等作用域仍为 `actorUserId + operation + idempotencyKey`，所以不同货主可以安全使用相同 UUID。
- 现有 Key 同指纹且未过期返回 `responseSnapshot`；不同指纹返回复用错误；过期记录不绑定新请求。

### 更新、取消和完成

- `PUT /shipper/orders/{orderId}`、`POST /cancel`、`POST /complete` 保持现有 Key 和 `baseUpdatedAtIso` 契约。
- 订单状态推进本身不改变优惠券，继续使用现有订单幂等事务。
- 更新换券、取消释放和完成核销改为事务内券转换，不再由 service 做事务外收尾。

### 错误语义与优先级

| 错误码 | HTTP | 条件 | 是否可能提交订单写入 |
| --- | --- | --- | --- |
| `IDEMPOTENCY_KEY_INVALID` | 400 | Key 缺失、非 UUID 或超过限制 | 否 |
| `IDEMPOTENCY_KEY_REUSED` | 409 | 同作用域 Key 已绑定不同指纹 | 否；已有首次请求可能已成功 |
| `IDEMPOTENCY_KEY_EXPIRED` | 409 | 同指纹记录超过重放窗口 | 否；首次快照仍保留 |
| `ORDER_CONFLICT` | 409 | 更新/取消/完成的 `baseUpdatedAtIso` 已陈旧 | 否 |
| `ORDER_STATE_INVALID` | 409 | 当前状态不允许目标操作 | 否 |
| `PROFILE_COUPON_NOT_AVAILABLE` | 409 | 券不存在、非当前货主、未生效、已过期、未达门槛、被其他订单锁定或已使用 | 否 |
| `PROFILE_COUPON_PRICE_MISMATCH` | 409 | 客户端标题、优惠额或实付额与服务端券不一致 | 否 |
| `ORDER_NOT_FOUND` | 404 | 目标订单不存在或不属于当前货主 | 否 |
| 未分类数据库错误 | 500 | 事务执行失败 | 否，事务整体回滚 |

错误优先级固定为：认证/角色 -> header 与 body 校验 -> 已有幂等记录 -> 首次请求的订单权限/版本/状态 -> 券资格与计价 -> 原子写入。这样成功重放不会因为附件、券过期或订单后来变化而失效，也不会让错误 Key 绕过身份边界。

## 数据模型与迁移

### 幂等记录

复用现有 `OrderIdempotencyRecord`：

- `operation` 是字符串，无需为 `shipper_create` 改表。
- 创建事务先创建订单，再用新订单 ID 写幂等 reservation，最后写完整 `responseSnapshot`；外键始终有效。
- 唯一约束继续使用 `(actorUserId, operation, idempotencyKey)`。
- 现有六类操作和历史响应快照不迁移、不重写。

### 并发安全订单号

新增迁移 `apps/api/prisma/migrations/20260714010000_shipper_order_create_idempotency_coupon_atomicity/migration.sql`，创建 PostgreSQL sequence：

```sql
CREATE SEQUENCE "Order_order_no_seq"
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;
```

目标迁移文件显式使用 `BEGIN`/`COMMIT` 包住 sequence、全量 preflight 和修复 UPDATE。事务在构造 canonical snapshot 前严格按 `ShipperCoupon -> Order` 顺序执行 `LOCK TABLE ... IN SHARE MODE`，阻止并发订单/券写入改变审计集合；任何冲突 `RAISE` 或语句失败都回滚全部变化。静默窗口仍是部署运维前提，表锁只是数据库级第二道防线，不能拿来替代停写、审计和恢复流量流程。

新订单号使用 `HY + yyyyMMdd + 10 位全局 sequence`。sequence 取号不回滚，允许出现间隙；`Order.orderNo @unique` 仍是最终约束。旧的 `HY + 日期 + 4 位序号` 保持原值，客户端必须把订单号视为 opaque string，不能按固定长度解析。

独立 sequence 不由 Prisma schema 表达，因此 `schema.prisma` 无需增加伪模型。迁移契约测试必须证明 sequence 存在，旧模型字段未被破坏。

### 历史券状态修复

迁移使用唯一的 canonical non-cancelled owner 规则。对每张券收集所有 `Order.couponId = ShipperCoupon.id` 的订单，`cancelled` 只作为历史引用，不参与 canonical owner 竞争；snapshot 同时保存 canonical order 的 `updatedAt`，作为缺失 `usedAt` 的确定历史回退：

- 非 `cancelled` 引用数量必须小于等于 1。大于 1 时，包括多个 `completed`、`completed + active` 或多个 active，迁移在任何 UPDATE 前 `RAISE EXCEPTION`，错误必须包含券 ID 和冲突订单 ID/订单号。
- 唯一非 `cancelled` 订单为 active 状态时，它是 canonical locked owner；券最终为 `locked`，`lockedOrderNo` 为该订单号，使用元数据清空。
- 唯一非 `cancelled` 订单为 `completed` 时，它是 canonical used owner；券最终为 `used`，`usedOrderNo` 为该订单号，锁元数据清空，`usedAt` 使用现值或 canonical order `updatedAt`。典型旧半成功 `status='locked'` 在 `lockedOrderNo` 为该 completed 订单、NULL 或悬空不存在订单时自动核销；只有 `lockedOrderNo` 指向另一个真实订单才 fail closed。
- `status='used'` 是单向核销状态，只有唯一 completed canonical owner 时才允许保持或修复为 used；active、仅 cancelled、完全无引用或多 owner 都必须在 preflight fail closed，绝不隐式退款为 usable/expired。
- 没有非 `cancelled` 引用时，只有原状态为 `usable/locked` 的券才进入时间分流：迁移以 PostgreSQL transaction-start `CURRENT_TIMESTAMP` 作为整次迁移唯一判定时刻，`validUntil <= CURRENT_TIMESTAMP` 设为 `expired`，尚未到期才设为 `usable`；原状态 `expired` 始终保持 expired。`CURRENT_TIMESTAMP` 在同一 PostgreSQL 事务内固定，不会逐行漂移。
- 完全没有订单引用的 locked orphan 只有两类可自动清理：`lockedOrderNo` 为 NULL，或指向数据库中不存在的订单；最终状态仍按上一条 expired/usable 时间规则决定。若它指向一个真实存在、但 `couponId` 并非本券的订单，归属无法证明，必须 fail closed。

取得两张表的 SHARE 锁后，所有检测必须先在只读 preflight `DO` block 完成，随后才执行 UPDATE：

- 任一 `Order.couponId IS NOT NULL` 却通过 `LEFT JOIN ShipperCoupon` 查不到券，立即报出订单 ID 和缺失券 ID；从券表出发的 canonical snapshot 看不见这种反向孤儿，必须独立检查。
- 任一 `Order.couponId` 跨货主引用券，即 `Order.shipperId <> ShipperCoupon.shipperId`，立即报出券和订单 ID。
- 任一券有超过一个非 `cancelled` 引用，立即报出券和所有候选订单。
- 任一券状态不在 `usable/locked/used/expired` 中立即报出券 ID 和原状态，禁止 unknown status 穿过 UPDATE。
- 任一 `status='used'` 券不满足“恰好一个 non-cancelled owner 且该 owner 为 completed”立即报错；`status='locked'` 加唯一 completed owner 仍按主要旧半成功修复。
- metadata 检查必须从 `lockedOrderNo/usedOrderNo` 对 `Order.orderNo` 做 `LEFT JOIN`：只有 join 到真实订单，且该订单既不是 canonical owner、也不是本券允许清理的 cancelled 历史引用时才拒绝。metadata 为 NULL 或 join 不到订单的悬空值允许离线覆盖，不能用 inner join 把两类情况混在一起。

迁移部署要求暂停创建、更新、取消、完成等订单写入；先运行只读审计并保存结果，再执行 migration deploy，最后运行同一审计确认每张券恰好落入 locked/used/expired/usable 四个确定分支后恢复流量。SHARE 锁保证 migration transaction 内 snapshot 与 UPDATE 集合稳定，但锁前仍可能有在途写请求，因此没有静默窗口时不得部署。

迁移完成后，新的同事务写路径不再产生无主锁。暂不增加 `lockedOrderNo/usedOrderNo` 外键，避免未经业务审计直接阻断历史数据库部署；真实 smoke 和 fixture 矩阵作为本切片验收门禁。

## 事务内券状态机

券 helper 必须拆成两个语义，禁止用一个“status 必须 usable”的函数横扫全部路径：

- `resolveReservableCouponPricing()` 只处理新选券，要求 `usable`、有效期/门槛满足并校验服务端计价。
- `assertCurrentOrderCouponOwnership()` 处理订单已经持有的券，允许 `lockedOrderNo=current.orderNo` 或历史 NULL，并按 cancel/complete/update 的 target state 接受 usable/used 兼容分支；锁给其他订单或 used by other 必须拒绝。

### 创建

- 无券：直接创建订单、`created` 事件和幂等快照。
- 有券：读取当前货主券，校验 `usable`、`validFrom <= now < validUntil`、`priceCents >= minOrderAmountCents` 和客户端金额一致。
- 订单与幂等 reservation 建立后，以 `id + shipperId + status=usable` 执行 `updateMany`，写 `locked/lockedOrderNo/lockedAt`；命中数不是 1 就中止事务。

### 更新待接单订单

- 仓储根据 transaction 内读到的 current order 和 `shipper_update` mutation 比较当前/目标券，派生 none、reserve、release 或 replace；service 不提供派生结果。
- 券不变：验证当前券仍锁给该订单；历史 `lockedOrderNo=NULL` 可在事务内补绑定。
- 无券 -> B：新券 CAS 必须匹配 `id + shipperId + status=usable`，`count` 必须为 1；订单写入服务端券标题/金额。
- A -> 无券：旧券 CAS 必须匹配 `id + shipperId + status=locked + lockedOrderNo IN (current.orderNo, NULL)`，`count` 必须为 1。
- A -> B：先以新券条件锁 B，再以上述旧券条件释放 A，逐步 `count` 都必须为 1，随后更新订单和事件；任一步失败全部回滚。
- 不允许使用客户端伪造的标题、优惠额或实付额覆盖服务端券快照。

### 取消

- 仓储从 transaction 内 current order 派生 release；driver mutation 和不涉及券的货主状态推进自然派生 none，不修改它们的调用签名。
- 当前券为 `locked` 且属于本订单，或属于历史 `lockedOrderNo=NULL`，使用 `id + shipperId + status=locked + lockedOrderNo IN (current.orderNo, NULL)` CAS 转换为 `usable`，`count` 必须为 1。
- 当前券已经 `usable` 视为历史目标态，允许订单取消继续提交。
- 当前券为 `used` 或锁给其他订单，返回 `PROFILE_COUPON_NOT_AVAILABLE` 并回滚取消。

### 完成

- 仓储从 transaction 内 current order 派生 redeem；旧券 CAS 使用 `id + shipperId + status=locked + lockedOrderNo IN (current.orderNo, NULL)`，命中数必须为 1，然后写 `usedOrderNo/usedAt`。
- 当前券已 `used` 且 `usedOrderNo` 为本订单，视为历史目标态。
- 当前券为 `usable` 时，必须先在同一 transaction 内查询 `Order.couponId` 引用，证明当前订单是唯一非 `cancelled` 引用，再以 `id + shipperId + status=usable` CAS 核销；用于修复旧的“订单已推进、券释放”状态。
- 券属于其他订单时返回冲突并回滚完成。

## 创建事务与并发顺序

首次创建按以下顺序执行：

1. service 规范化请求、计算创建指纹，并做只读幂等 preflight。
2. 只有新 Key 才校验货物附件；已有成功记录直接重放。
3. Prisma 事务再次按唯一作用域查幂等记录，覆盖 preflight 后的竞态。
4. 读取并校验券，但尚不改变状态。
5. 从 sequence 取订单号，创建订单主体和一条 `created` 事件。
6. 创建 `OrderIdempotencyRecord` reservation，`responseSnapshot` 暂为空对象。
7. 对券执行条件 CAS；无券则跳过。
8. 重新读取完整订单快照，将其写入 reservation。
9. 提交事务并返回 `replayed: false`。

两个同 Key 请求同时进入时，唯一约束只允许一个 reservation 提交；败者整个事务回滚，再读取胜者记录并返回 `replayed: true`。两个不同 Key 请求抢同一券时，只有一个 `status=usable` CAS 命中；败者抛出业务中止错误，临时订单、事件和 reservation 一并回滚。

捕获 `P2002` 后必须查询当前 Key 的幂等记录：查到才按 replay/reused/expired 映射；查不到则重新抛出原错误，不能把订单号或其他唯一键冲突冒充幂等成功。

## 仓储与模块边界

- 新增 `executeIdempotentOrderCreate()`，返回与变更一致的 `success/key-reused/key-expired` 判别结果。
- `ExecuteOrderMutationInput` 和现有 mutation union 保持不变；仓储在 transaction 内从 current order 与 mutation 派生券动作，driver-orders 调用无需增加字段。
- `OrdersService` 不再依赖 `ProfileCouponsService` 做订单券动作；`OrdersModule` 删除这条注入链。
- `ProfileCouponsRepository` 保留钱包列表、后台发券及独立管理能力，订单写路径不调用其独立 Prisma client。
- Prisma transaction client 完整列出 order create/find/update、嵌套订单创建所需 delegate、idempotency create/update/find、shipperCoupon find/updateMany 和 sequence raw query；普通 root `createOrder()` 生产路径移除并改走幂等事务，不能继续保留 `count + 1`。
- InMemory 仓储使用 staged copy：订单、事件、幂等记录和券先写克隆状态，全部成功后一次替换；任何业务错误丢弃 staged state。
- InMemory 测试显式使用 `new InMemoryOrdersRepository(now, sharedCouponStore)`，并让钱包仓储使用同一个 store；这只是测试/本地仓储装配，生产继续只有同一个 `PrismaService`，不新增虚构的 InMemory Nest DI。

## 移动端设计

新增独立创建上下文，不能把已有变更上下文的 `baseUpdatedAtIso` 改成可选：

```ts
export type OrderCreateIdempotencyContext = {
  idempotencyKey: string;
};
```

- 本地订单第一次进入平台发布流程前生成 UUID，先构造带 `syncState.createContext` 的 pending 本地占位订单，写入 React state，并 `await saveAppRuntimeStateDurably()` 确认 AsyncStorage 成功；只有 durable write 完成后才允许 POST。
- durable write 失败时不发送网络请求，保留当前草稿并提示本地安全保存失败，不能让服务端可能建单而本机丢失 Key。
- `platformOrderApi.createOrder(request, idempotencyKey)` 发送 `Idempotency-Key`，请求 body 不夹带基线。
- 普通网络错误、500 和缺 token 都保留 `createContext`；重试从本地订单读取原 Key。
- 成功后平台快照替换本地占位订单并清空创建失败队列。
- `IDEMPOTENCY_KEY_REUSED` 与 `IDEMPOTENCY_KEY_EXPIRED` 使用创建专用错误分类，停止自动重试并刷新平台订单列表；二者都不自动生成新 Key。
- 升级前没有 `createContext` 的旧失败项 fail closed：点击重试只刷新平台订单列表并要求用户确认“作为新订单发布”，确认前不得生成 Key 或 POST。
- 创建错误处理不走 `ORDER_CONFLICT` 分支；创建没有版本基线，出现该码视为服务端契约异常并停止自动重试。
- 更新/取消/完成继续使用现有 `mutationContext`，二者类型和恢复逻辑互不混淆。

## 风险与发布约束

- 历史迁移必须安排订单写入静默窗口。没有静默窗口时，canonical owner preflight 与 UPDATE 之间可能新增引用，迁移结果不可信。
- 创建 Key 必须 durable-before-send。仅写内存或 fire-and-forget AsyncStorage 都不能满足响应丢失后的安全重放。
- legacy create 队列没有 Key，无法证明旧请求是否已到服务端，必须 fail closed；自动补 Key 重发会制造重复订单。
- 新订单号长度与旧格式不同，所有客户端、导出和后台必须将 `orderNo` 当 opaque string；任何固定 14 位解析都要在发布前清除。
- canonical owner 冲突不做“尽量修”；跨货主、多 non-cancelled owner 或 metadata 错指必须先人工修复再重跑迁移。
- 本切片的真实 PostgreSQL late-failure trigger 覆盖创建快照 UPDATE 回滚；A -> B 换券第二段旧券 CAS 的 late failure 仍由 mock/InMemory 证明，属于已知残余风险，后续补真实 trigger 场景，但不阻塞本轮迁移与创建原子性门禁。
- 同事务方案依赖订单与券保持同 PostgreSQL 数据库；未来拆库必须重新设计 outbox，不能继续假装 Prisma transaction 跨库有效。

## OpenAPI 与文档

- `POST /shipper/orders` 增加必填 `Idempotency-Key` parameter，并明确“不需要 `baseUpdatedAtIso`”。
- 描述同 Key 同请求重放、不同请求复用、过期和同券并发败者语义。
- 增加创建接口 `400 IDEMPOTENCY_KEY_INVALID`、`409 IDEMPOTENCY_KEY_REUSED/EXPIRED`、`409 PROFILE_COUPON_NOT_AVAILABLE/PRICE_MISMATCH` 示例。
- 更新 `IdempotencyKeyHeader` 公共说明，使其覆盖创建与受保护变更，同时说明只有变更请求携带版本基线。
- 状态文档必须明确原子边界已覆盖什么，以及支付、退款返券和跨服务事务仍未完成。

## 测试策略

### 纯单元与 Controller

- 创建指纹键序稳定、字段变化导致指纹变化、创建操作不含 orderId 或基线。
- 创建 header 缺失/非法在 service 前被拒绝；合法 Key 原样传入。
- 同 Key 同请求重放不再校验附件或券当前状态。
- 同 Key 不同请求和过期记录保持现有错误语义。
- 券 helper 分别覆盖新券 usable 资格与当前订单已持有 locked current/null，防止更新原券被“非 usable”误拒。

### 迁移 fixture

- static SQL 契约只读取目标 migration 文件，覆盖 `BEGIN -> ShipperCoupon SHARE lock -> Order SHARE lock -> canonical snapshot -> 全量 preflight -> UPDATE -> COMMIT` 顺序、canonical `updatedAt`、固定 transaction timestamp、used 单向校验、expired/usable 互斥分支以及异常定位字段；不得拼接全部 migrations 后碰巧命中旧 SQL。
- 在临时 PostgreSQL 数据库先 deploy 到上一迁移，注入历史 fixture，再 deploy 目标迁移；不能用字符串断言替代执行证据。
- fixture 矩阵覆盖：多个 completed 引用同券拒绝、cancelled + active 保留 active locked、locked + 唯一 completed（owner/NULL）得到 used 且缺失 `usedAt` 回退 canonical `updatedAt`、used 无唯一 completed owner 拒绝、locked metadata 指向其他真实订单拒绝、completed + cancelled 得到 used、未过期且只有 cancelled 得到 usable、无订单引用 orphan NULL/悬空释放、orphan 指向不引用本券的真实订单拒绝、expired orphan 和 expired + cancelled 均保持 expired、Order 引用缺失券拒绝、unknown coupon status 拒绝、跨货主引用拒绝。
- 目标迁移故意失败后断言所有修复和 sequence 均回滚；修正 fixture 后重跑成功，证明 migration 可重试。
- fixture runner 必须有 normal/test package scripts，并由测试 PostgreSQL bootstrap 或 CI 独立 PostgreSQL step 执行；开发机没有数据库时不能因此跳过 CI 证据。

### InMemory 契约

- 首次创建只新增一个订单、一个 `created` 事件和一个幂等记录；重放数量不变。
- 创建券 CAS、A->B 换券、取消释放、完成核销都与 Prisma 预期状态一致。
- 每个转换步骤注入失败时 staged state 不发布。
- 同券不同 Key 并发模拟只允许一个成功，败者无残留。
- 历史 `lockedOrderNo=NULL` 和同订单已 used 的兼容分支有明确测试。

### Prisma 仓储

- mock 级测试验证所有写操作使用同一个 transaction client，不再调用事务外 coupon client。
- reservation、券 CAS、事件或快照任一步抛错时事务 promise 拒绝。
- `P2002` 只有查到当前幂等记录时才重放。
- 券 CAS `count=0` 映射为业务错误并触发事务回滚。

### 移动端

- adapter 创建请求发送 header 且 body 不含基线。
- 首次失败、缺 token、App 持久化恢复和点击重试均复用原 Key。
- 成功重放只保留一个平台订单，不重复插入本地卡片。
- reused/expired 不静默生成新 Key。

### 真实 PostgreSQL smoke

新增 `order-coupon-atomicity-smoke`，在两个独立 HTTP 请求/数据库连接下验证：

1. 同 Key 同 body 并发创建，两次响应订单 ID 相同，数据库只有一个订单、一条 `created` 事件和一条幂等记录。
2. 同 Key 不同 body，一个成功，另一个 `IDEMPOTENCY_KEY_REUSED`。
3. 不同 Key 抢同一券，只有一个成功，另一个 `PROFILE_COUPON_NOT_AVAILABLE`；败者没有订单、事件或幂等残留。
4. 更新 A->B 后 A usable、B locked；同 Key重放不新增事件。
5. 取消后券 usable；完成后券 used；各自重放状态和事件数量不变。
6. 迁移部署后的历史修复查询无歧义冲突。
7. 临时 trigger 在 `OrderIdempotencyRecord.responseSnapshot` UPDATE 阶段抛错，断言此前创建的订单、`created` 事件、券锁和幂等 reservation 全部回滚；trigger/function 必须在 `finally` 清理。

现有 `order-mutation-concurrency-smoke` 的所有 `createShipperOrder` 调用也必须生成并传入创建 Key，否则创建接口升级后旧 smoke 会先被 400 打断，根本测不到原有并发场景。

CI 的 PostgreSQL service 已存在；`db:test:postgres:bootstrap` 必须同时串入真实 migration fixture runner 与新 smoke，不能以 Jest mock 或内存仓储代替真实迁移/事务证据。

根移动端 Jest 必须显式使用仓库 `jest.config.js`。已通过 `jest --showConfig` 确认 `testMatch` 为 `**/__tests__/**/*.[jt]s?(x)` 与 `**/?(*.)+(spec|test).[tj]s?(x)`，且 `testPathIgnorePatterns` 包含 `/apps/api/`；API suites 只由 `apps/api` 自己的 Jest 命令执行，避免根 Jest 误扫。

## 验收门禁

```powershell
npm test -- --runInBand --config jest.config.js
npx tsc --noEmit
npm run lint
npm --prefix apps/api test
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run prisma:validate
npm run api:build
npm --prefix apps/api run db:test:postgres:order-coupon-migration-verify
npm --prefix apps/api run db:test:postgres:bootstrap
git diff --check
```

完成标准是所有命令退出码为 0，真实 migration fixture runner 与 PostgreSQL smoke 明确通过上述七类场景，并且工作区文档如实记录验收环境和输出。缺少 PostgreSQL 证据时只能声明代码与静态测试完成，不能宣称原子一致性已验收。
