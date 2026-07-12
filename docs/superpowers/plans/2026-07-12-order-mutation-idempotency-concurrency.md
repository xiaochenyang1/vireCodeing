# Order Mutation Idempotency and Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为六个高风险订单变更接口增加持久化 `Idempotency-Key` 重放和基于 `updatedAtIso` 的原子乐观并发保护。

**Architecture:** API 层统一校验幂等请求头和版本基线，订单 service 计算规范化请求指纹，`OrdersRepository` 在同一事务内完成 compare-and-set、业务事件和幂等响应快照写入。移动端首次操作生成 UUID，网络失败队列持久化原 Key 与原基线，重试时复用；冲突只刷新订单，不自动重放。

**Tech Stack:** TypeScript、NestJS、Zod、Prisma/PostgreSQL、React Native、Jest、OpenAPI YAML。

---

## 文件结构

### 新建

- `apps/api/src/orders/order-mutation-idempotency.ts`：操作枚举、Key 校验、规范化指纹和幂等执行结果类型。
- `apps/api/src/orders/order-mutation-idempotency.spec.ts`：Key、指纹和过期语义的纯单元测试。
- `apps/api/prisma/migrations/20260712010000_order_mutation_idempotency/migration.sql`：幂等记录表、外键、唯一约束和索引。
- `src/utils/orderMutationSync.ts`：移动端 UUID 生成、失败队列上下文创建和冲突错误分类。
- `__tests__/orderMutationSyncUtils.test.ts`：移动端幂等上下文与重试语义测试。

### 修改

- `apps/api/prisma/schema.prisma`：增加 `OrderIdempotencyRecord` 和反向关系。
- `apps/api/src/common/errors.ts`：增加幂等与订单冲突错误码。
- `apps/api/src/config/env.ts`、`apps/api/src/config/env.spec.ts`：增加 `ORDER_IDEMPOTENCY_TTL_SECONDS`。
- `apps/api/src/orders/dto.ts`、`apps/api/src/driver-orders/dto.ts`：六类请求增加 `baseUpdatedAtIso`。
- `apps/api/src/orders/orders.validation.ts`、`apps/api/src/driver-orders/driver-orders.validation.ts` 及对应 spec：校验带时区 ISO 基线。
- `apps/api/src/orders/orders.repository.ts`、`apps/api/src/orders/orders.repository.spec.ts`：统一幂等 compare-and-set 仓储协议、内存实现与 Prisma 实现。
- `apps/api/src/orders/orders.service.ts`、`apps/api/src/orders/orders.service.spec.ts`：货主四类变更接入幂等执行。
- `apps/api/src/driver-orders/driver-orders.service.ts`、`apps/api/src/driver-orders/driver-orders.service.spec.ts`：司机接单和状态推进接入幂等执行。
- `apps/api/src/orders/orders.controller.ts`、`apps/api/src/orders/orders.controller.spec.ts`：读取并传递 `Idempotency-Key`。
- `apps/api/src/driver-orders/driver-orders.controller.ts`、`apps/api/src/driver-orders/driver-orders.controller.spec.ts`：读取并传递 `Idempotency-Key`。
- `apps/api/src/config/prisma-migration.spec.ts`：迁移结构契约。
- `src/services/platformApiClient.ts` 及测试：写请求支持额外 headers。
- `src/services/platformOrderApi.ts`、`__tests__/platformOrderApi.test.ts`：货主四类变更发送 Key 和基线。
- `src/services/platformDriverOrderApi.ts`、`__tests__/platformDriverOrderApi.test.ts`：司机两类变更发送 Key 和基线。
- `src/types.ts`、`src/utils/order.ts`、`App.tsx`、`src/screens/OrderDetailScreen.tsx`、`src/screens/DriverHomeScreen.tsx`、`__tests__/App.test.tsx`、`__tests__/DriverHomeScreen.test.tsx`：保存并复用幂等上下文，展示冲突提示。
- `apps/api/src/config/openapi-stage-1.spec.ts`、`docs/platform/openapi-stage-1.yaml`：接口 header、请求字段和错误响应。
- `docs/platform/README.md`、`docs/03-项目当前状态与补全路线.md`：更新完成边界和真实 PostgreSQL 阻塞状态。

## Task 1：定义幂等契约、错误码和配置

**Files:**
- Create: `apps/api/src/orders/order-mutation-idempotency.ts`
- Create: `apps/api/src/orders/order-mutation-idempotency.spec.ts`
- Modify: `apps/api/src/common/errors.ts`
- Modify: `apps/api/src/config/env.ts`
- Test: `apps/api/src/config/env.spec.ts`

- [ ] **Step 1: 写 Key、指纹和 TTL 的失败测试**

```ts
describe('order mutation idempotency', () => {
  it('normalizes a UUID idempotency key', () => {
    expect(parseOrderIdempotencyKey(' 550e8400-e29b-41d4-a716-446655440000 '))
      .toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rejects an invalid idempotency key', () => {
    expect(() => parseOrderIdempotencyKey('repeat-click')).toThrow(
      expect.objectContaining({ code: ApiErrorCode.IDEMPOTENCY_KEY_INVALID }),
    );
  });

  it('creates a stable fingerprint from normalized object keys', () => {
    expect(createOrderMutationFingerprint('order-1', { b: 2, a: ' x ' }))
      .toBe(createOrderMutationFingerprint('order-1', { a: ' x ', b: 2 }));
  });
});
```

在 `env.spec.ts` 增加默认值 `86400`、合法自定义值和非正整数拒绝测试。

- [ ] **Step 2: 运行测试确认 RED**

Run:

```powershell
npm --prefix apps/api test -- order-mutation-idempotency env --runInBand
```

Expected: FAIL，提示模块/错误码/环境字段尚不存在。

- [ ] **Step 3: 实现最小契约**

```ts
export const ORDER_MUTATION_OPERATIONS = [
  'shipper_update',
  'shipper_cancel',
  'shipper_status',
  'shipper_complete',
  'driver_accept',
  'driver_status',
] as const;

export type OrderMutationOperation =
  (typeof ORDER_MUTATION_OPERATIONS)[number];

export function parseOrderIdempotencyKey(value: unknown) {
  const parsed = z.string().trim().uuid().safeParse(value);
  if (!parsed.success) {
    throw new BusinessError(
      ApiErrorCode.IDEMPOTENCY_KEY_INVALID,
      'Idempotency-Key 无效',
    );
  }
  return parsed.data;
}

export function createOrderMutationFingerprint(
  orderId: string,
  request: unknown,
) {
  return createHash('sha256')
    .update(JSON.stringify(sortJsonValue({ orderId, request })))
    .digest('hex');
}
```

在 `ApiErrorCode` 增加：

```ts
IDEMPOTENCY_KEY_INVALID: 'IDEMPOTENCY_KEY_INVALID',
IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
IDEMPOTENCY_KEY_EXPIRED: 'IDEMPOTENCY_KEY_EXPIRED',
ORDER_CONFLICT: 'ORDER_CONFLICT',
```

在 `envSchema` 增加：

```ts
ORDER_IDEMPOTENCY_TTL_SECONDS: z.coerce
  .number()
  .int()
  .positive()
  .default(86400),
```

- [ ] **Step 4: 运行测试确认 GREEN**

```powershell
npm --prefix apps/api test -- order-mutation-idempotency env --runInBand
```

Expected: 新增测试全部 PASS。

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/orders/order-mutation-idempotency.ts apps/api/src/orders/order-mutation-idempotency.spec.ts apps/api/src/common/errors.ts apps/api/src/config/env.ts apps/api/src/config/env.spec.ts
git commit -m "feat(api): define order mutation idempotency contracts"
```

## Task 2：增加 Prisma 幂等记录模型和迁移契约

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260712010000_order_mutation_idempotency/migration.sql`
- Test: `apps/api/src/config/prisma-migration.spec.ts`

- [ ] **Step 1: 写迁移结构失败测试**

```ts
expect(migrationSql).toContain('CREATE TABLE "OrderIdempotencyRecord"');
expect(migrationSql).toContain('"requestFingerprint" TEXT NOT NULL');
expect(migrationSql).toContain('"responseSnapshot" JSONB NOT NULL');
expect(migrationSql).toContain(
  'OrderIdempotencyRecord_actor_operation_key_unique',
);
expect(migrationSql).toContain('OrderIdempotencyRecord_expires_idx');
expect(migrationSql).toContain('REFERENCES "User"("id")');
expect(migrationSql).toContain('REFERENCES "Order"("id")');
```

- [ ] **Step 2: 运行迁移测试确认 RED**

```powershell
npm --prefix apps/api test -- prisma-migration --runInBand
```

Expected: FAIL，找不到迁移目录和表结构。

- [ ] **Step 3: 实现 schema 和 SQL**

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
  actor              User     @relation("OrderIdempotencyActor", fields: [actorUserId], references: [id])
  order               Order    @relation(fields: [orderId], references: [id])

  @@unique([actorUserId, operation, idempotencyKey], name: "OrderIdempotencyRecord_actor_operation_key_unique")
  @@index([orderId, createdAt], name: "OrderIdempotencyRecord_order_created_idx")
  @@index([expiresAt], name: "OrderIdempotencyRecord_expires_idx")
}
```

同时在 `User` 增加 `orderIdempotencyRecords OrderIdempotencyRecord[] @relation("OrderIdempotencyActor")`，在 `Order` 增加 `idempotencyRecords OrderIdempotencyRecord[]`。迁移 SQL 使用 `ON DELETE RESTRICT ON UPDATE CASCADE` 外键行为，与现有业务记录保持一致。

- [ ] **Step 4: 验证迁移和 Prisma schema**

```powershell
npm --prefix apps/api test -- prisma-migration --runInBand
npm --prefix apps/api run prisma:validate
```

Expected: 两个命令退出 0。

- [ ] **Step 5: 提交**

```powershell
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260712010000_order_mutation_idempotency/migration.sql apps/api/src/config/prisma-migration.spec.ts
git commit -m "feat(api): persist order mutation idempotency records"
```

## Task 3：扩展请求 DTO 与 Zod 版本基线校验

**Files:**
- Modify: `apps/api/src/orders/dto.ts`
- Modify: `apps/api/src/driver-orders/dto.ts`
- Modify: `apps/api/src/orders/orders.validation.ts`
- Modify: `apps/api/src/driver-orders/driver-orders.validation.ts`
- Test: `apps/api/src/orders/orders.validation.spec.ts`
- Test: `apps/api/src/driver-orders/driver-orders.validation.spec.ts`

- [ ] **Step 1: 写六类请求基线失败测试**

```ts
expect(() => parseCancelShipperOrderRequest({ reasonText: '计划有变' }))
  .toThrow();
expect(() => parseDriverAcceptOrderRequest({ noteText: '马上到' }))
  .toThrow();
expect(parseDriverAdvanceOrderStatusRequest({
  nextStatus: 'transporting',
  baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
})).toMatchObject({ baseUpdatedAtIso: '2026-07-12T08:00:00.000Z' });
expect(() => parseDriverAdvanceOrderStatusRequest({
  nextStatus: 'transporting',
  baseUpdatedAtIso: '2026-07-12 08:00:00',
})).toThrow();
```

- [ ] **Step 2: 运行校验测试确认 RED**

```powershell
npm --prefix apps/api test -- orders.validation driver-orders.validation --runInBand
```

Expected: 缺基线的请求仍被接受，测试 FAIL。

- [ ] **Step 3: 增加共享字段并覆盖 complete body**

```ts
export type OrderMutationConcurrencyRequest = {
  baseUpdatedAtIso: string;
};

export type CancelShipperOrderRequest =
  OrderMutationConcurrencyRequest & {
    reasonText: string;
    description?: string;
  };

export type CompleteShipperOrderRequest =
  OrderMutationConcurrencyRequest;

export type UpdateShipperOrderRequest =
  CreateShipperOrderRequest & OrderMutationConcurrencyRequest;
```

`CreateShipperOrderRequest` 保持不变，避免发单接口被误加并发基线；`updateOrder` 的 controller、service 和 repository 签名改用 `UpdateShipperOrderRequest`。司机 `DriverAcceptOrderRequest` 和 `DriverAdvanceOrderStatusRequest`、货主取消/状态/完成 DTO 均交叉包含该字段。Zod 使用：

```ts
const baseUpdatedAtIsoSchema = z
  .string()
  .datetime({ offset: true, message: '订单版本时间无效' });
```

`complete` 从无 body 改为 `{ baseUpdatedAtIso }`。

- [ ] **Step 4: 运行测试确认 GREEN**

```powershell
npm --prefix apps/api test -- orders.validation driver-orders.validation --runInBand
```

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/orders/dto.ts apps/api/src/driver-orders/dto.ts apps/api/src/orders/orders.validation.ts apps/api/src/driver-orders/driver-orders.validation.ts apps/api/src/orders/orders.validation.spec.ts apps/api/src/driver-orders/driver-orders.validation.spec.ts
git commit -m "feat(api): require order mutation concurrency baselines"
```

## Task 4：实现内存仓储的幂等重放和 compare-and-set

**Files:**
- Modify: `apps/api/src/orders/orders.repository.ts`
- Test: `apps/api/src/orders/orders.repository.spec.ts`

- [ ] **Step 1: 写仓储 RED 测试**

```ts
it('replays the first successful mutation without adding another event', async () => {
  const first = await repository.executeIdempotentOrderMutation(input);
  const replay = await repository.executeIdempotentOrderMutation(input);

  expect(replay).toEqual(first);
  expect((await repository.findOrderById(order.id))?.events).toHaveLength(2);
});

it('rejects a stale baseline from another mutation key', async () => {
  await repository.executeIdempotentOrderMutation(firstInput);
  await expect(repository.executeIdempotentOrderMutation(secondInput))
    .resolves.toBe('conflict');
});

it('rejects reuse of the key for a different fingerprint', async () => {
  await repository.executeIdempotentOrderMutation(firstInput);
  await expect(repository.executeIdempotentOrderMutation({
    ...firstInput,
    requestFingerprint: 'different',
  })).resolves.toBe('key-reused');
});
```

- [ ] **Step 2: 运行仓储测试确认 RED**

```powershell
npm --prefix apps/api test -- orders.repository --runInBand
```

- [ ] **Step 3: 定义统一仓储输入与结果**

```ts
export type ExecuteOrderMutationInput = {
  actorUserId: string;
  orderId: string;
  operation: OrderMutationOperation;
  idempotencyKey: string;
  requestFingerprint: string;
  baseUpdatedAtIso: string;
  expiresAtIso: string;
  mutation: OrderMutationCommand;
};

export type ExecuteOrderMutationResult =
  | { kind: 'success'; order: ShipperOrderRecord; replayed: boolean }
  | { kind: 'conflict' }
  | { kind: 'key-reused' }
  | { kind: 'key-expired' }
  | { kind: 'state-invalid' }
  | { kind: 'not-found' };
```

`OrderMutationCommand` 用判别联合显式列出六种命令及其业务请求，不使用不可序列化 callback。内存仓储先检查已有幂等记录，再比较 `updatedAtIso` 和状态，复制订单、追加事件、生成成功快照，最后一次性替换数组元素并写入幂等记录。

- [ ] **Step 4: 运行仓储测试确认 GREEN**

```powershell
npm --prefix apps/api test -- orders.repository --runInBand
```

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/orders/orders.repository.ts apps/api/src/orders/orders.repository.spec.ts
git commit -m "feat(api): execute in-memory order mutations idempotently"
```

## Task 5：实现 Prisma 事务、唯一约束和原子 compare-and-set

**Files:**
- Modify: `apps/api/src/orders/orders.repository.ts`
- Test: `apps/api/src/orders/orders.repository.spec.ts`
- Test: `apps/api/src/orders/orders.service.spec.ts`

- [ ] **Step 1: 写 Prisma 调用契约失败测试**

使用已有 Prisma client mock，断言首次执行调用 `$transaction`，事务内先查询幂等记录，再执行：

```ts
expect(transaction.order.updateMany).toHaveBeenCalledWith({
  where: {
    id: 'order-1',
    updatedAt: new Date('2026-07-12T08:00:00.000Z'),
    status: 'waiting',
  },
  data: { status: 'cancelled' },
});
expect(transaction.orderIdempotencyRecord.create).toHaveBeenCalledWith(
  expect.objectContaining({
    data: expect.objectContaining({
      operation: 'shipper_cancel',
      idempotencyKey: IDEMPOTENCY_KEY,
    }),
  }),
);
```

再补 `count: 0` 返回 conflict、已有快照重放、不同指纹和过期记录测试。

- [ ] **Step 2: 运行测试确认 RED**

```powershell
npm --prefix apps/api test -- orders.repository orders.service --runInBand
```

- [ ] **Step 3: 实现 Prisma 事务**

实现顺序必须固定：

```ts
return this.prisma.$transaction(async transaction => {
  const existing = await transaction.orderIdempotencyRecord.findUnique({
    where: {
      actorUserId_operation_idempotencyKey: {
        actorUserId: input.actorUserId,
        operation: input.operation,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });

  if (existing) {
    return mapExistingIdempotencyRecord(existing, input);
  }

  const changed = await transaction.order.updateMany(createCasUpdate(input));
  if (changed.count !== 1) {
    return classifyMissedOrderMutation(await loadOrder(transaction, input.orderId), input);
  }

  await appendMutationEvent(transaction, input);
  const order = await loadOrder(transaction, input.orderId);
  await transaction.orderIdempotencyRecord.create({
    data: createIdempotencyRecord(input, order),
  });
  return { kind: 'success', order, replayed: false };
});
```

捕获唯一约束 `P2002` 后重新读取记录并走相同的重放/复用判断，处理两个相同 Key 同时进入事务的竞争。

- [ ] **Step 4: 运行测试确认 GREEN**

```powershell
npm --prefix apps/api test -- orders.repository orders.service --runInBand
```

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/orders/orders.repository.ts apps/api/src/orders/orders.repository.spec.ts apps/api/src/orders/orders.service.spec.ts
git commit -m "feat(api): transact idempotent order mutations with prisma"
```

## Task 6：接入货主 service/controller 的四类操作

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts`
- Modify: `apps/api/src/orders/orders.controller.ts`
- Test: `apps/api/src/orders/orders.service.spec.ts`
- Test: `apps/api/src/orders/orders.controller.spec.ts`

- [ ] **Step 1: 写 service 与 controller RED 测试**

```ts
await service.cancelOrder('shipper-1', 'order-1', IDEMPOTENCY_KEY, {
  reasonText: '计划有变',
  baseUpdatedAtIso: BASE_ISO,
});
expect(repository.executeIdempotentOrderMutation).toHaveBeenCalledWith(
  expect.objectContaining({
    actorUserId: 'shipper-1',
    operation: 'shipper_cancel',
    idempotencyKey: IDEMPOTENCY_KEY,
    baseUpdatedAtIso: BASE_ISO,
  }),
);
```

controller 测试构造 `headers: { 'idempotency-key': IDEMPOTENCY_KEY }`，断言四个接口都把 Key 传入 service；缺失 header 返回 `IDEMPOTENCY_KEY_INVALID` 且 service 未调用。

- [ ] **Step 2: 运行聚焦测试确认 RED**

```powershell
npm --prefix apps/api test -- orders.controller orders.service --runInBand
```

- [ ] **Step 3: 实现统一结果映射**

```ts
private unwrapOrderMutationResult(result: ExecuteOrderMutationResult) {
  switch (result.kind) {
    case 'success': return result.order;
    case 'conflict':
      throw new BusinessError(ApiErrorCode.ORDER_CONFLICT, '订单已被其他操作更新');
    case 'key-reused':
      throw new BusinessError(ApiErrorCode.IDEMPOTENCY_KEY_REUSED, '幂等键已用于其他请求');
    case 'key-expired':
      throw new BusinessError(ApiErrorCode.IDEMPOTENCY_KEY_EXPIRED, '幂等结果已过期');
    case 'state-invalid':
      throw new BusinessError(ApiErrorCode.ORDER_STATE_INVALID, '当前订单状态不允许该操作');
    case 'not-found':
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
  }
}
```

controller 使用 `@Headers('idempotency-key') idempotencyKey: unknown`，调用 `parseOrderIdempotencyKey()` 后传入 service。编辑订单的指纹使用校验后的完整请求体；complete 也使用 `{ baseUpdatedAtIso }` body。

- [ ] **Step 4: 运行测试确认 GREEN**

```powershell
npm --prefix apps/api test -- orders.controller orders.service --runInBand
```

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/orders/orders.service.ts apps/api/src/orders/orders.controller.ts apps/api/src/orders/orders.service.spec.ts apps/api/src/orders/orders.controller.spec.ts
git commit -m "feat(api): protect shipper order mutations"
```

## Task 7：接入司机接单和状态推进

**Files:**
- Modify: `apps/api/src/driver-orders/driver-orders.service.ts`
- Modify: `apps/api/src/driver-orders/driver-orders.controller.ts`
- Test: `apps/api/src/driver-orders/driver-orders.service.spec.ts`
- Test: `apps/api/src/driver-orders/driver-orders.controller.spec.ts`

- [ ] **Step 1: 写并发接单和重放 RED 测试**

```ts
it('returns the first accepted order when the same request is replayed', async () => {
  const first = await service.acceptOrder(driver, 'order-1', KEY, request);
  const replay = await service.acceptOrder(driver, 'order-1', KEY, request);
  expect(replay).toEqual(first);
  expect(repository.findDriverAcceptedOrder).not.toHaveBeenCalled();
});

it('maps a losing accept compare-and-set to ORDER_CONFLICT', async () => {
  repository.executeIdempotentOrderMutation.mockResolvedValue({ kind: 'conflict' });
  await expect(service.acceptOrder(driver, 'order-1', OTHER_KEY, request))
    .rejects.toMatchObject({ code: ApiErrorCode.ORDER_CONFLICT });
});
```

controller 测试覆盖 Key 传递和 guard 优先级。

- [ ] **Step 2: 运行聚焦测试确认 RED**

```powershell
npm --prefix apps/api test -- driver-orders.controller driver-orders.service --runInBand
```

- [ ] **Step 3: 实现司机两类操作**

接单保留在线和认证门禁，但已有幂等记录应在认证通过后、重新读取 waiting 订单前检查；首次请求创建 driver snapshot 后将其放入命令，仓储事务原子更新 `waiting -> loading` 并写 `driver_accepted`。状态推进在文件凭证校验后执行 CAS，指纹包含去重后的 `receiptPhotoFileIds`。

controller 与货主侧相同，通过 `@Headers('idempotency-key')` 读取 Key。

- [ ] **Step 4: 运行测试确认 GREEN**

```powershell
npm --prefix apps/api test -- driver-orders.controller driver-orders.service orders.repository --runInBand
```

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/driver-orders/driver-orders.service.ts apps/api/src/driver-orders/driver-orders.controller.ts apps/api/src/driver-orders/driver-orders.service.spec.ts apps/api/src/driver-orders/driver-orders.controller.spec.ts
git commit -m "feat(api): protect driver order mutations"
```

## Task 8：扩展移动端请求 headers 与 adapter

**Files:**
- Modify: `src/services/platformApiClient.ts`
- Modify: `src/services/platformOrderApi.ts`
- Modify: `src/services/platformDriverOrderApi.ts`
- Test: `__tests__/platformOrderApi.test.ts`
- Test: `__tests__/platformDriverOrderApi.test.ts`
- Test: `__tests__/platformAuthApi.test.ts`

- [ ] **Step 1: 写 adapter RED 测试**

```ts
await api.cancelOrder('order-1', {
  reasonText: '计划有变',
  baseUpdatedAtIso: BASE_ISO,
}, IDEMPOTENCY_KEY);

expect(fetchMock).toHaveBeenCalledWith(
  'http://localhost:3000/api/shipper/orders/order-1/cancel',
  expect.objectContaining({
    headers: expect.objectContaining({
      'Idempotency-Key': IDEMPOTENCY_KEY,
    }),
    body: JSON.stringify({
      reasonText: '计划有变',
      baseUpdatedAtIso: BASE_ISO,
    }),
  }),
);
```

六类方法都覆盖 header、body 和非法 Key/基线本地拒绝。

- [ ] **Step 2: 运行测试确认 RED**

```powershell
npx jest --runInBand --runTestsByPath __tests__/platformOrderApi.test.ts __tests__/platformDriverOrderApi.test.ts
```

- [ ] **Step 3: 实现可选 headers**

```ts
export type PlatformApiRequestOptions = {
  includeAuth?: boolean;
  headers?: Record<string, string>;
};
```

`platformRequest` 合并 `options.headers`。六个 adapter 方法签名统一将 `idempotencyKey` 作为最后一个必填参数，并调用：

```ts
platformPost<Request, PlatformShipperOrder>(config, path, request, {
  headers: { 'Idempotency-Key': normalizeIdempotencyKey(idempotencyKey) },
});
```

- [ ] **Step 4: 运行 adapter 与 client 回归测试**

```powershell
npx jest --runInBand --runTestsByPath __tests__/platformOrderApi.test.ts __tests__/platformDriverOrderApi.test.ts __tests__/platformAuthApi.test.ts
```

- [ ] **Step 5: 提交**

```powershell
git add src/services/platformApiClient.ts src/services/platformOrderApi.ts src/services/platformDriverOrderApi.ts __tests__/platformOrderApi.test.ts __tests__/platformDriverOrderApi.test.ts __tests__/platformAuthApi.test.ts
git commit -m "feat(mobile): send order mutation idempotency headers"
```

## Task 9：持久化移动端幂等上下文并修复失败重试

**Files:**
- Create: `src/utils/orderMutationSync.ts`
- Create: `__tests__/orderMutationSyncUtils.test.ts`
- Modify: `src/types.ts`
- Modify: `src/utils/order.ts`
- Modify: `App.tsx`
- Modify: `src/screens/OrderDetailScreen.tsx`
- Modify: `src/screens/DriverHomeScreen.tsx`
- Test: `__tests__/App.test.tsx`
- Test: `__tests__/DriverHomeScreen.test.tsx`

- [ ] **Step 1: 写幂等上下文 RED 测试**

```ts
it('keeps the original key and baseline when a failed operation is retried', () => {
  const context = createOrderMutationContext('cancel', BASE_ISO, () => KEY);
  const failed = createFailedOrderMutationSyncState('失败', context, 1000);
  expect(getOrderMutationRetryContext(failed)).toEqual(context);
});

it('classifies ORDER_CONFLICT as refresh-only', () => {
  expect(getOrderMutationFailureAction(
    new PlatformApiError('冲突', 'ORDER_CONFLICT', 409),
  )).toBe('refresh');
});
```

- [ ] **Step 2: 运行测试确认 RED**

```powershell
npx jest --runInBand --runTestsByPath __tests__/orderMutationSyncUtils.test.ts __tests__/App.test.tsx __tests__/DriverHomeScreen.test.tsx
```

Expected: 新工具不存在，现有请求也没有 Key/基线。

- [ ] **Step 3: 扩展同步状态**

```ts
export type OrderMutationContext = {
  idempotencyKey: string;
  baseUpdatedAtIso: string;
};

export type OrderSyncState = {
  // existing fields
  mutationContext?: OrderMutationContext;
};
```

`createOrderMutationContext` 使用 `globalThis.crypto?.randomUUID()`；测试或旧 RN 环境无该能力时使用符合 UUID v4 格式的随机 fallback。首次操作创建一次 context，失败状态保存它，成功回写平台订单后清空；重试从 `syncState.mutationContext` 读取，不重新生成。

- [ ] **Step 4: 更新六类调用和冲突体验**

- 货主取消、状态、完成、编辑以操作前平台订单 `updatedAtIso` 为基线。
- 司机接单使用订单大厅条目的 `updatedAtIso`；司机状态推进使用当前执行订单的 `updatedAtIso`。
- `ORDER_CONFLICT`：调用对应详情 GET，提示“订单已被其他操作更新，请确认最新状态”，不把原操作加入自动重试。
- `IDEMPOTENCY_KEY_REUSED` / `IDEMPOTENCY_KEY_EXPIRED`：清除旧 mutation context，提示用户重新发起。
- 网络失败和普通 5xx：保留原 mutation context，现有“订单同步队列”继续可点重试。

- [ ] **Step 5: 运行移动端聚焦测试确认 GREEN**

```powershell
npx jest --runInBand --runTestsByPath __tests__/orderMutationSyncUtils.test.ts __tests__/platformOrderApi.test.ts __tests__/platformDriverOrderApi.test.ts __tests__/DriverHomeScreen.test.tsx __tests__/App.test.tsx
```

- [ ] **Step 6: 提交**

```powershell
git add src/utils/orderMutationSync.ts __tests__/orderMutationSyncUtils.test.ts src/types.ts src/utils/order.ts App.tsx src/screens/OrderDetailScreen.tsx src/screens/DriverHomeScreen.tsx __tests__/App.test.tsx __tests__/DriverHomeScreen.test.tsx
git commit -m "feat(mobile): reuse order mutation idempotency context"
```

## Task 10：补齐 OpenAPI、状态文档和最终验证

**Files:**
- Modify: `apps/api/src/config/openapi-stage-1.spec.ts`
- Modify: `docs/platform/openapi-stage-1.yaml`
- Modify: `docs/platform/README.md`
- Modify: `docs/03-项目当前状态与补全路线.md`

- [ ] **Step 1: 写 OpenAPI RED 测试**

```ts
for (const operation of protectedOrderMutationOperations) {
  expect(operation.parameters).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        in: 'header',
        name: 'Idempotency-Key',
        required: true,
      }),
    ]),
  );
}

expect(document.components.schemas.CancelShipperOrderRequest.required)
  .toContain('baseUpdatedAtIso');
expect(document.components.schemas.ApiErrorCode.enum).toEqual(
  expect.arrayContaining([
    'IDEMPOTENCY_KEY_INVALID',
    'IDEMPOTENCY_KEY_REUSED',
    'IDEMPOTENCY_KEY_EXPIRED',
    'ORDER_CONFLICT',
  ]),
);
```

- [ ] **Step 2: 运行 OpenAPI 测试确认 RED**

```powershell
npm --prefix apps/api test -- openapi-stage-1 --runInBand
```

- [ ] **Step 3: 更新 YAML 与文档**

六个操作增加：

```yaml
- in: header
  name: Idempotency-Key
  required: true
  schema:
    type: string
    format: uuid
```

所有相应 request schema 将 `baseUpdatedAtIso` 加入 `required`。409 响应列出 Key 复用、Key 过期、订单冲突和状态非法。文档必须明确：同 Key 同请求返回首次业务结果；真实 PostgreSQL 双连接竞争测试仍未执行时不得宣称数据库并发验收通过。

- [ ] **Step 4: 运行全部质量门禁**

```powershell
npm test -- --runInBand
npx tsc --noEmit
npm run lint
npm --prefix apps/api test
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run prisma:validate
npm run api:build
git diff --check
```

Expected:

- 根 Jest 全部通过。
- API Jest 全部通过。
- TypeScript、API Lint、Prisma validate、API build 退出 0。
- 根 Lint 不新增 error；既有 `InvoiceRecords.tsx:504 no-void` warning 单独记录。
- `git diff --check` 无输出。

- [ ] **Step 5: 检查 PostgreSQL 环境并如实记录**

```powershell
npm --prefix apps/api run db:postgres:doctor
```

当前环境预期仍返回 Docker CLI 不可用和 Prisma `P1001`。如果 PostgreSQL 已可达，追加运行 migration deploy 和双连接竞争 smoke；如果不可达，只记录外部验收缺口。

- [ ] **Step 6: 提交**

```powershell
git add apps/api/src/config/openapi-stage-1.spec.ts docs/platform/openapi-stage-1.yaml docs/platform/README.md docs/03-项目当前状态与补全路线.md
git commit -m "docs: document order mutation idempotency slice"
```

## 计划自检

- 规格覆盖：数据模型、六个接口、Key/基线校验、指纹、原子 CAS、重放、过期、移动端重试、OpenAPI 和真实数据库门禁均有对应任务。
- 占位检查：所有错误码、方法签名、测试命令和提交边界已明确。
- 类型一致性：统一使用 `OrderMutationOperation`、`ExecuteOrderMutationInput`、`ExecuteOrderMutationResult`、`OrderMutationContext`、`baseUpdatedAtIso` 和 `idempotencyKey`。
- 范围检查：未混入发单幂等、追加事件去重、支付账本、Redis 锁或消息队列。
