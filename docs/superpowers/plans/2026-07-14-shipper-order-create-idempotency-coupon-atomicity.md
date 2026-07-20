# Shipper Order Create Idempotency and Coupon Atomicity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为货主发单补齐持久化 `Idempotency-Key`，并把创建、更新、取消、完成的优惠券状态转换与订单、事件、幂等快照收进同一个 PostgreSQL 事务。

**Architecture:** `OrdersService` 只生成规范化指纹和订单写命令，`OrdersRepository` 成为订单写聚合边界；Prisma 实现在一个 interactive transaction 内处理幂等 reservation、订单/事件、券 CAS 和响应快照，InMemory 实现用 staged state 模拟同样的原子发布。移动端为创建保存独立的 Key 上下文，普通失败重试复用原 Key；真实 PostgreSQL smoke 用并发 HTTP 请求证明同 Key 重放和同券唯一胜者。

**Tech Stack:** TypeScript、NestJS、Zod、Prisma 6、PostgreSQL 16、React Native、Jest、OpenAPI YAML、GitHub Actions。

**Design:** `docs/superpowers/specs/2026-07-14-shipper-order-create-idempotency-coupon-atomicity-design.md`

---

## 文件结构

### 新建

- `apps/api/src/orders/order-coupon-transition.ts`：订单侧券资格、服务端计价和 target-state 转换契约。
- `apps/api/src/orders/order-coupon-transition.spec.ts`：券资格、计价和历史目标态的纯单元测试。
- `apps/api/prisma/migrations/20260714010000_shipper_order_create_idempotency_coupon_atomicity/migration.sql`：并发安全订单号 sequence 和确定性历史券状态修复。
- `apps/api/scripts/verify-order-coupon-migration.js`：在临时 PostgreSQL schema 部署到上一迁移、注入 fixture、再部署目标迁移并验证回滚/重试。
- `apps/api/src/config/order-coupon-migration-script.spec.ts`：迁移 fixture runner 的参数、清理和矩阵单元测试。
- `__tests__/appRuntimeState.test.ts`：可 await 持久化、写失败和 durable-before-send 基础契约。

### 修改

- `apps/api/src/orders/order-mutation-idempotency.ts`、`order-mutation-idempotency.spec.ts`：增加 `shipper_create` 操作、创建指纹和创建结果映射。
- `apps/api/src/common/errors.ts`、`business-error.filter.ts` 及 spec：增加 `PROFILE_COUPON_PRICE_MISMATCH`，并把它与现有 `PROFILE_COUPON_NOT_AVAILABLE` 明确映射为 409。
- `apps/api/src/profile-coupons/profile-coupons.repository.ts`：导出可共享的 InMemory 券 store；钱包和订单仓储观察同一状态。
- `apps/api/src/profile-coupons/profile-coupons.service.spec.ts`：保留钱包/后台发券行为并证明共享 store 不破坏旧接口。
- `apps/api/src/orders/orders.repository.ts`、`orders.repository.spec.ts`：增加幂等创建、事务内券 CAS、sequence 取号和 InMemory staged commit。
- `apps/api/src/orders/orders.service.ts`、`orders.service.spec.ts`：创建 preflight、写命令组装、错误映射；删除事务外锁/绑/释放/核销。
- `apps/api/src/orders/orders.controller.ts`、`orders.controller.spec.ts`：创建接口读取并校验 `Idempotency-Key`。
- `apps/api/src/orders/orders.module.ts`：订单 service 不再注入 `ProfileCouponsService`。
- `apps/api/src/config/prisma-migration.spec.ts`：新迁移、sequence 和历史修复 SQL 契约。
- `src/utils/appRuntimeState.ts`：保留普通 fire-and-forget 保存，同时新增创建前必须 await 的 durable 保存 API。
- `src/types.ts`：增加只含 Key 的 `OrderCreateIdempotencyContext`，不放松现有变更基线类型。
- `src/utils/order.ts`、`__tests__/orderUtils.test.ts`：创建同步状态持久化独立 create context。
- `src/utils/orderMutationSync.ts`、`__tests__/orderMutationSyncUtils.test.ts`：创建 UUID、恢复和错误动作分类。
- `src/services/platformOrderApi.ts`、`__tests__/platformOrderApi.test.ts`：创建请求发送 Key，body 不增加基线。
- `App.tsx`、`__tests__/App.test.tsx`：首次发布生成 Key、缺 token/普通失败保留、重试复用、成功重放合并本地订单。
- `docs/platform/openapi-stage-1.yaml`、`apps/api/src/config/openapi-stage-1.spec.ts`：创建 header、错误响应和原子语义。
- `apps/api/scripts/seed-stage-1.js`、`apps/api/src/config/stage-1-database-scripts.spec.ts`：增加真实库 `order-coupon-atomicity-smoke`。
- `apps/api/package.json`、`apps/api/src/config/postgres-verification-script.spec.ts`：注册真实迁移 fixture 与 smoke 的本地/测试命令并串入 bootstrap。
- `.github/workflows/verify.yml`：继续以 PostgreSQL service 执行完整 test bootstrap，并给新 smoke 明确步骤名或日志分段。
- `docs/platform/README.md`、`docs/03-项目当前状态与补全路线.md`：记录完成边界、历史修复和未覆盖的支付/退款范围。

## 交付不变量

- `POST /shipper/orders` 必须携带 `Idempotency-Key`，请求 body 不增加 `baseUpdatedAtIso`；同 Key 同请求重放不重复建单或写 `created` 事件。
- 创建、更新、取消、完成的订单、事件、优惠券 CAS 和幂等快照必须在同一 Prisma 事务提交，禁止保留 service 层事务外券收尾。
- InMemory staged state 与 Prisma/PostgreSQL 遵守同一结果和回滚契约；同券并发只能有一个胜者。
- 移动端普通创建失败、缺 token 和持久化恢复后必须复用原 Key；reused/expired 不自动生成新 Key。
- OpenAPI、sequence 与历史券状态修复迁移、真实 migration fixture runner、`order-coupon-atomicity-smoke` 和 CI PostgreSQL bootstrap 缺一不可。
- 历史迁移必须在订单写静默窗口、单一数据库事务中运行；Key 与 pending 占位订单必须 durable-before-send，legacy 无 Key 创建队列必须 fail closed。

## 当前工作区执行约束

当前主工作区已有大量并行改动。本计划所有阶段只设置 review checkpoint，不执行版本控制暂存或提交；主代理完成范围审计后自行决定集成方式。任何阶段都禁止全量暂存，避免把其他代理或用户改动卷入。

## Task 1：扩展订单幂等操作与创建指纹

**Files:**
- Modify: `apps/api/src/orders/order-mutation-idempotency.ts`
- Test: `apps/api/src/orders/order-mutation-idempotency.spec.ts`
- Modify: `apps/api/src/common/errors.ts`
- Modify: `apps/api/src/common/business-error.filter.ts`
- Test: `apps/api/src/common/business-error.filter.spec.ts`

- [ ] **Step 1: 写创建操作、创建指纹和新券计价错误的失败测试**

```ts
it('creates a stable shipper create fingerprint without an order baseline', () => {
  expect(createOrderCreateFingerprint({ b: 2, a: 'x' })).toBe(
    createOrderCreateFingerprint({ a: 'x', b: 2 }),
  );
  expect(createOrderCreateFingerprint({ a: 'x' })).not.toBe(
    createOrderCreateFingerprint({ a: 'y' }),
  );
  expect(ORDER_IDEMPOTENCY_OPERATIONS).toContain('shipper_create');
});

it.each([
  ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
  ApiErrorCode.PROFILE_COUPON_PRICE_MISMATCH,
])('maps %s to conflict', code => {
  const filter = new BusinessErrorFilter(() => new Date('2026-07-14T00:00:00.000Z'));
  const { host, status } = createHost();
  filter.catch(new BusinessError(code, '优惠券不可用'), host);
  expect(status).toHaveBeenCalledWith(409);
});
```

- [ ] **Step 2: 运行聚焦测试并确认 RED**

Run:

```powershell
npm --prefix apps/api test -- order-mutation-idempotency business-error.filter --runInBand
```

Expected: FAIL，提示 `ORDER_IDEMPOTENCY_OPERATIONS`、`createOrderCreateFingerprint` 或 `PROFILE_COUPON_PRICE_MISMATCH` 不存在。

- [ ] **Step 3: 增加不削弱旧类型的幂等操作定义**

```ts
export const ORDER_IDEMPOTENCY_OPERATIONS = [
  'shipper_create',
  'shipper_update',
  'shipper_cancel',
  'shipper_status',
  'shipper_complete',
  'driver_accept',
  'driver_status',
] as const;

export type OrderIdempotencyOperation =
  (typeof ORDER_IDEMPOTENCY_OPERATIONS)[number];

export type OrderMutationOperation = Exclude<
  OrderIdempotencyOperation,
  'shipper_create'
>;

export function createOrderCreateFingerprint(request: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(sortJsonValue({ operation: 'shipper_create', request })))
    .digest('hex');
}
```

把现有 `ORDER_MUTATION_OPERATIONS` 调用点迁到新常量；六类变更的 `OrderMutationOperation` 继续排除创建，避免创建误拿 `baseUpdatedAtIso`。

- [ ] **Step 4: 增加错误码与 HTTP 映射**

```ts
PROFILE_COUPON_PRICE_MISMATCH: 'PROFILE_COUPON_PRICE_MISMATCH',
```

在 business error filter 的冲突集合中加入新错误码和现有 `PROFILE_COUPON_NOT_AVAILABLE`；新错误消息固定为 `优惠券金额与服务端记录不一致`。

- [ ] **Step 5: 再跑聚焦测试并确认 GREEN**

Run:

```powershell
npm --prefix apps/api test -- order-mutation-idempotency business-error.filter --runInBand
```

Expected: PASS，创建指纹、旧变更指纹和 409 映射全部通过。

- [ ] **Step 6: 主代理 review checkpoint**

当前脏工作区跳过暂存与提交。主代理只审阅本 Task 五个文件的 scoped diff 和聚焦测试输出。

## Task 2：增加订单号 sequence 与 canonical owner 历史迁移

**Files:**
- Create: `apps/api/prisma/migrations/20260714010000_shipper_order_create_idempotency_coupon_atomicity/migration.sql`
- Test: `apps/api/src/config/prisma-migration.spec.ts`
- Create: `apps/api/scripts/verify-order-coupon-migration.js`
- Create: `apps/api/src/config/order-coupon-migration-script.spec.ts`
- Modify: `apps/api/package.json`
- Test: `apps/api/src/config/postgres-verification-script.spec.ts`

- [ ] **Step 1: 写静态 SQL 契约失败测试**

```ts
it('wraps canonical coupon repair in one transaction before any update', () => {
  const sql = readTargetMigration(
    '20260714010000_shipper_order_create_idempotency_coupon_atomicity',
  );
  const beginIndex = sql.indexOf('BEGIN;');
  const couponLockIndex = sql.indexOf('LOCK TABLE "ShipperCoupon" IN SHARE MODE');
  const orderLockIndex = sql.indexOf('LOCK TABLE "Order" IN SHARE MODE');
  const snapshotIndex = sql.indexOf('CREATE TEMP TABLE "_CouponCanonicalOwner"');
  const raiseIndex = sql.indexOf('RAISE EXCEPTION');
  const updateIndex = sql.indexOf('UPDATE "ShipperCoupon"');
  const commitIndex = sql.indexOf('COMMIT;');

  expect(sql).toContain('CREATE SEQUENCE "Order_order_no_seq"');
  expect(beginIndex).toBeGreaterThanOrEqual(0);
  expect(couponLockIndex).toBeGreaterThan(beginIndex);
  expect(orderLockIndex).toBeGreaterThan(couponLockIndex);
  expect(snapshotIndex).toBeGreaterThan(orderLockIndex);
  expect(raiseIndex).toBeGreaterThan(snapshotIndex);
  expect(updateIndex).toBeGreaterThan(raiseIndex);
  expect(commitIndex).toBeGreaterThan(updateIndex);
  expect(sql).toContain('canonicalOrderIds');
  expect(sql).toContain('canonicalUpdatedAt');
  expect(sql).toContain('COALESCE(c."usedAt", owner."canonicalUpdatedAt")');
  expect(sql).toContain('LEFT JOIN "ShipperCoupon"');
  expect(sql).toContain('LEFT JOIN "Order" metadata_order');
  expect(sql).toContain('o."couponId" IS NOT NULL');
  expect(sql).toContain('c."id" IS NULL');
  expect(sql).toContain("NOT IN ('usable', 'locked', 'used', 'expired')");
  expect(sql).toContain("c.\"status\" = 'used'");
  expect(sql).toContain("owner.\"canonicalStatus\" <> 'completed'");
  expect(sql).toContain('c."validUntil" <= CURRENT_TIMESTAMP');
  expect(sql).toContain("SET \"status\" = 'expired'");
  expect(sql).toContain('couponId=%');
  expect(sql).toContain('orderIds=%');
});
```

- [ ] **Step 2: 写 fixture runner 的失败测试矩阵**

`order-coupon-migration-script.spec.ts` 对 runner 的纯函数 fixture 定义和预期做表驱动测试：

```ts
expect(createCouponMigrationFixtures().map(item => [item.name, item.expected])).toEqual([
  ['multi-completed', 'reject'],
  ['cancelled-and-active', 'locked'],
  ['locked-completed-owner', 'used'],
  ['locked-completed-null', 'used'],
  ['locked-completed-other-real', 'reject'],
  ['used-without-completed', 'reject'],
  ['completed-and-cancelled', 'used'],
  ['future-only-cancelled', 'usable'],
  ['orphan-locked-null', 'usable'],
  ['orphan-locked-dangling', 'usable'],
  ['orphan-locked-other-real', 'reject'],
  ['expired-orphan', 'expired'],
  ['expired-and-cancelled', 'expired'],
  ['missing-coupon', 'reject'],
  ['unknown-status', 'reject'],
  ['cross-shipper', 'reject'],
]);
```

同时断言 runner 总在 `finally` 执行 `DROP SCHEMA ... CASCADE`，失败重试前执行 `prisma migrate resolve --rolled-back 20260714010000_shipper_order_create_idempotency_coupon_atomicity`。`postgres-verification-script.spec.ts` 还要断言 normal/test 两个 migration verify script 存在，并且测试 bootstrap 在 deploy 后、seed/smoke 前执行 test script。

- [ ] **Step 3: 运行迁移测试并确认 RED**

Run:

```powershell
npm --prefix apps/api test -- prisma-migration order-coupon-migration-script --runInBand
```

Expected: FAIL，新迁移和 fixture runner 尚不存在。

- [ ] **Step 4: 在单事务中建立 canonical owner 快照**

迁移开头必须显式 `BEGIN;`。sequence 创建后、canonical snapshot 前，严格按 `ShipperCoupon -> Order` 顺序取得 SHARE 表锁；静默窗口仍是运维硬要求，锁只负责挡住 transaction 期间的新写入。随后创建 transaction-local canonical 表：

```sql
BEGIN;

CREATE SEQUENCE "Order_order_no_seq"
  AS BIGINT START WITH 1 INCREMENT BY 1 NO CYCLE;

LOCK TABLE "ShipperCoupon" IN SHARE MODE;
LOCK TABLE "Order" IN SHARE MODE;

CREATE TEMP TABLE "_CouponCanonicalOwner" ON COMMIT DROP AS
SELECT
  c."id" AS "couponId",
  c."shipperId" AS "couponShipperId",
  COUNT(o."id") FILTER (WHERE o."status" <> 'cancelled') AS "nonCancelledCount",
  MIN(o."id") FILTER (WHERE o."status" <> 'cancelled') AS "canonicalOrderId",
  MIN(o."orderNo") FILTER (WHERE o."status" <> 'cancelled') AS "canonicalOrderNo",
  MIN(o."status"::text) FILTER (WHERE o."status" <> 'cancelled') AS "canonicalStatus",
  MIN(o."updatedAt") FILTER (WHERE o."status" <> 'cancelled') AS "canonicalUpdatedAt",
  STRING_AGG(o."id" || ':' || o."orderNo", ',' ORDER BY o."id")
    FILTER (WHERE o."status" <> 'cancelled') AS "canonicalOrderIds",
  COUNT(o."id") AS "referenceCount"
FROM "ShipperCoupon" c
LEFT JOIN "Order" o ON o."couponId" = c."id"
GROUP BY c."id", c."shipperId";
```

这里各 `MIN` 只在 `nonCancelledCount = 1` 后使用；数量大于 1 会在 preflight 报错，因此不会随机挑 completed、active owner 或错误 `updatedAt`。canonical `updatedAt` 专门用于 completed 券缺失 `usedAt` 时的确定回退。

- [ ] **Step 5: 在首个 UPDATE 前完成全部 fail-closed 检查**

一个 `DO` block 依次查找并 `SELECT ... INTO conflict`：Order 引用不存在券、跨货主引用、`nonCancelledCount > 1`、unknown coupon status、used 没有唯一 completed owner、locked/used metadata 错指真实订单。每个异常使用可定位消息，例如：

```sql
RAISE EXCEPTION USING MESSAGE = format(
  'coupon canonical owner conflict: couponId=%s orderIds=%s metadataOrderNo=%s',
  conflict."couponId",
  conflict."canonicalOrderIds",
  conflict."metadataOrderNo"
);
```

判断规则固定为：

- 先从 `Order` 对 `ShipperCoupon` 做 `LEFT JOIN`，任何 `o.couponId IS NOT NULL AND c.id IS NULL` 都报出订单与缺失券 ID；从券表出发的 snapshot 无法代替该检查。
- 状态只允许 `usable/locked/used/expired`，其他原值一律 fail closed。
- `status=used` 只有 `nonCancelledCount = 1 AND canonicalStatus = 'completed'` 才能保持/修复；active、仅 cancelled、无引用或多 owner 全部拒绝，不能落入 expired/usable 分支。
- 多个 completed 也拒绝；cancelled 不参加 owner 竞争。唯一 completed owner 加 `status=locked` 是主要旧半成功，`lockedOrderNo` 为 owner、NULL 或悬空时自动核销。
- metadata 必须以 `LEFT JOIN "Order" metadata_order ON metadata_order."orderNo" = ...` 检查。只有 `metadata_order.id IS NOT NULL`，且它既不是 canonical owner、也不是本券允许清理的 cancelled 历史引用时才拒绝；NULL 或 join 不到行的悬空 metadata 允许清理。无引用 orphan 指向存在但不引用本券的订单因此必然 fail closed。

- [ ] **Step 6: 按 canonical owner 和固定迁移时刻修复状态**

PostgreSQL 的 `CURRENT_TIMESTAMP` 固定为 transaction start time，在本迁移显式单事务内对所有行和所有 UPDATE 一致，不会逐行漂移。四个 UPDATE 的 where 分支互斥：

```sql
UPDATE "ShipperCoupon" c
SET "status" = 'locked',
    "lockedOrderNo" = owner."canonicalOrderNo",
    "lockedAt" = COALESCE(c."lockedAt", CURRENT_TIMESTAMP),
    "usedOrderNo" = NULL,
    "usedAt" = NULL
FROM "_CouponCanonicalOwner" owner
WHERE owner."couponId" = c."id"
  AND owner."nonCancelledCount" = 1
  AND owner."canonicalStatus" <> 'completed';

UPDATE "ShipperCoupon" c
SET "status" = 'used',
    "lockedOrderNo" = NULL,
    "lockedAt" = NULL,
    "usedOrderNo" = owner."canonicalOrderNo",
    "usedAt" = COALESCE(c."usedAt", owner."canonicalUpdatedAt")
FROM "_CouponCanonicalOwner" owner
WHERE owner."couponId" = c."id"
  AND owner."nonCancelledCount" = 1
  AND owner."canonicalStatus" = 'completed';

UPDATE "ShipperCoupon" c
SET "status" = 'expired',
    "lockedOrderNo" = NULL,
    "lockedAt" = NULL,
    "usedOrderNo" = NULL,
    "usedAt" = NULL
FROM "_CouponCanonicalOwner" owner
WHERE owner."couponId" = c."id"
  AND owner."nonCancelledCount" = 0
  AND (
    c."status" = 'expired'
    OR (
      c."status" IN ('usable', 'locked')
      AND c."validUntil" <= CURRENT_TIMESTAMP
    )
  );

UPDATE "ShipperCoupon" c
SET "status" = 'usable',
    "lockedOrderNo" = NULL,
    "lockedAt" = NULL,
    "usedOrderNo" = NULL,
    "usedAt" = NULL
FROM "_CouponCanonicalOwner" owner
WHERE owner."couponId" = c."id"
  AND owner."nonCancelledCount" = 0
  AND c."status" IN ('usable', 'locked')
  AND c."validUntil" > CURRENT_TIMESTAMP;

COMMIT;
```

`nonCancelledCount = 0` 同时覆盖只有 cancelled 和完全无引用的 orphan；只有原状态 usable/locked 才按固定 migration timestamp 分流 expired/usable，原 expired 只保持 expired。used 无 completed owner 和 unknown status 已在 UPDATE 前失败，绝不会被隐式退款或归一化。orphan 只有通过 preflight 证明 metadata 为 NULL/悬空、没有错指真实订单后才会到达 UPDATE。

- [ ] **Step 7: 实现临时 schema 的真实迁移 fixture runner**

`verify-order-coupon-migration.js` 为每个 fixture 创建唯一 PostgreSQL schema，复制 Prisma schema 与迁移树到临时目录但先排除目标迁移，按以下顺序执行：上一迁移 deploy -> 注入 fixture -> 目标迁移 deploy -> 查询断言 -> `finally DROP SCHEMA ... CASCADE`。

失败 fixture 还要断言 sequence 不存在、券行完全未变化；修正 fixture 后执行 `migrate resolve --rolled-back` 并重新 deploy，证明目标 migration 单事务且可重试。runner 使用距离当前时间足够远的固定 `validUntil` 构造 expired/future fixtures，并断言同一 deploy 的所有时间分支使用 transaction-start `CURRENT_TIMESTAMP`。

在 `apps/api/package.json` 注册并接入 bootstrap：

```json
"db:postgres:order-coupon-migration-verify": "node scripts/verify-order-coupon-migration.js",
"db:test:postgres:order-coupon-migration-verify": "node scripts/verify-order-coupon-migration.js --test"
```

normal/test bootstrap 都在 migration deploy 之后运行对应 verify script；测试 bootstrap 的这一步由现有 GitHub Actions PostgreSQL 16 service 执行，因此开发机无库时仍有 CI 门禁。

- [ ] **Step 8: 运行静态测试、Prisma 校验和真实 fixture**

Run:

```powershell
npm --prefix apps/api test -- prisma-migration order-coupon-migration-script --runInBand
npm --prefix apps/api run prisma:validate
npm --prefix apps/api run db:test:postgres:order-coupon-migration-verify
```

Expected: static 测试只读取目标 migration，并证明 SHARE 锁顺序、反向缺券/unknown/used preflight、canonical updatedAt 和 metadata LEFT JOIN；schema 校验退出码 0。临时 schema 实际覆盖 multi-completed 拒绝、cancelled+active locked、locked+completed owner/NULL used、used-without-completed 拒绝、metadata other-real 拒绝、completed+cancelled used、future-only-cancelled usable、orphan NULL/悬空 usable、orphan other-real 拒绝、expired orphan/expired+cancelled 保持 expired、missing-coupon/unknown-status/跨货主拒绝及失败后重试。

- [ ] **Step 9: 主代理 review checkpoint**

当前脏工作区跳过提交。主代理只审阅本 Task 六个文件的 scoped diff、package/bootstrap 接线和真实 fixture 输出，不运行任何暂存命令。

## Task 3：定义订单侧券资格与 target-state 转换

**Files:**
- Create: `apps/api/src/orders/order-coupon-transition.ts`
- Create: `apps/api/src/orders/order-coupon-transition.spec.ts`

- [ ] **Step 1: 写资格、计价和状态转换失败测试**

```ts
describe('order coupon transition', () => {
  it('derives canonical pricing from the server coupon', () => {
    expect(resolveReservableCouponPricing(coupon, request, now)).toEqual({
      couponId: coupon.id,
      couponTitle: coupon.title,
      couponDiscountCents: coupon.discountCents,
      payablePriceCents: request.priceCents - coupon.discountCents,
    });
  });

  it.each(['used', 'locked'])('rejects unavailable %s coupons', status => {
    expect(() => resolveReservableCouponPricing({ ...coupon, status }, request, now))
      .toThrow(expect.objectContaining({ code: 'PROFILE_COUPON_NOT_AVAILABLE' }));
  });

  it('rejects an expired usable coupon', () => {
    expect(() => resolveReservableCouponPricing(
      { ...coupon, status: 'usable', validUntilIso: now.toISOString() },
      request,
      now,
    )).toThrow(expect.objectContaining({ code: 'PROFILE_COUPON_NOT_AVAILABLE' }));
  });

  it('rejects client coupon price drift', () => {
    expect(() => resolveReservableCouponPricing(coupon, {
      ...request,
      couponDiscountCents: coupon.discountCents + 1,
    }, now)).toThrow(
      expect.objectContaining({ code: 'PROFILE_COUPON_PRICE_MISMATCH' }),
    );
  });

  it('accepts a historical null lock owned by the current order', () => {
    expect(() => assertCurrentOrderCouponOwnership(
      { ...coupon, status: 'locked', lockedOrderNo: null },
      currentOrder,
      { kind: 'keep-locked' },
    )).not.toThrow();
  });
});
```

`resolveReservableCouponPricing()` 另外覆盖未生效、到期边界、金额门槛和错误货主。`assertCurrentOrderCouponOwnership()` 用表驱动测试覆盖 `lockedOrderNo=current/null`、取消时 already usable、完成时 used by current、完成时 usable 且唯一非 cancelled owner，以及 locked/used by other 的冲突分支。

- [ ] **Step 2: 运行新测试并确认 RED**

Run:

```powershell
npm --prefix apps/api test -- order-coupon-transition --runInBand
```

Expected: FAIL，提示模块不存在。

- [ ] **Step 3: 定义新券计价与当前持券的独立契约**

```ts
export type CanonicalOrderCouponPricing = {
  couponId: string;
  couponTitle: string;
  couponDiscountCents: number;
  payablePriceCents: number;
};

export type CurrentOrderCouponTarget =
  | { kind: 'keep-locked' }
  | { kind: 'release-to-usable' }
  | {
      kind: 'redeem-to-used';
      uniqueNonCancelledOwnerOrderId?: string;
    };
```

不要定义或暴露独立的券动作命令。新券资格来自规范化请求；旧券动作只能由仓储在 transaction 内根据 current order、现有 mutation union 和目标状态派生。

- [ ] **Step 4: 实现服务端资格和金额一致性检查**

`resolveReservableCouponPricing()` 只接受准备新预占的券，必须按以下顺序检查：货主 -> `status=usable` -> `validFrom <= now < validUntil` -> 最低金额 -> 客户端 `couponTitle/couponDiscountCents/payablePriceCents` 一致性。返回值只从券记录和订单原价派生；不能用它验证订单已经持有的 locked/used 历史券。

```ts
if (
  input.couponTitle !== coupon.title ||
  input.couponDiscountCents !== coupon.discountCents ||
  input.payablePriceCents !== input.priceCents - coupon.discountCents
) {
  throw new BusinessError(
    ApiErrorCode.PROFILE_COUPON_PRICE_MISMATCH,
    '优惠券金额与服务端记录不一致',
  );
}
```

- [ ] **Step 5: 实现当前订单持券所有权和历史目标态检查**

`assertCurrentOrderCouponOwnership()` 先验证券与 current order 同货主，再按明确 target 处理：

- `keep-locked`：只接受 `status=locked` 且 `lockedOrderNo` 为 current `orderNo` 或历史 NULL；其他状态拒绝。
- `release-to-usable`：接受上述 locked 所有权，或 already `usable` 历史目标态；`used`、locked by other 拒绝。
- `redeem-to-used`：接受上述 locked 所有权，或 `usedOrderNo=current.orderNo` 的 already used 目标态；`usable` 只有在 transaction 查询证明 current order 是唯一非 cancelled owner，并把该订单 ID 作为 `uniqueNonCancelledOwnerOrderId` 传入后才接受。

所有 `usedOrderNo=other`、`lockedOrderNo=other` 和跨货主状态统一抛 `PROFILE_COUPON_NOT_AVAILABLE`。helper 只做资格/所有权断言，不执行写入；精确 CAS 留在仓储 transaction 内完成。

- [ ] **Step 6: 运行测试并确认 GREEN**

Run:

```powershell
npm --prefix apps/api test -- order-coupon-transition --runInBand
```

Expected: PASS，所有资格、计价和历史状态分支通过。

- [ ] **Step 7: 主代理 review checkpoint**

当前脏工作区跳过暂存与提交。主代理只审阅两个新文件的 scoped diff，确认新券 helper 与当前持券 helper 没有合并成一个宽松入口。

## Task 4：实现 InMemory 幂等创建与原子券发布

**Files:**
- Modify: `apps/api/src/profile-coupons/profile-coupons.repository.ts`
- Test: `apps/api/src/profile-coupons/profile-coupons.service.spec.ts`
- Modify: `apps/api/src/orders/orders.repository.ts`
- Test: `apps/api/src/orders/orders.repository.spec.ts`
- Test: `apps/api/src/orders/orders.service.spec.ts`

- [ ] **Step 1: 写 InMemory 创建重放和回滚失败测试**

```ts
it('replays one create without duplicating the order or event', async () => {
  const first = await repository.executeIdempotentOrderCreate(input);
  const replay = await repository.executeIdempotentOrderCreate(input);

  expect(first).toMatchObject({ kind: 'success', replayed: false });
  expect(replay).toEqual({ ...first, replayed: true });
  expect(await repository.listOrders('shipper-1', listQuery)).toMatchObject({
    total: 1,
    items: [expect.objectContaining({ events: [expect.objectContaining({ eventType: 'created' })] })],
  });
});

it('publishes no staged state when coupon reservation fails', async () => {
  await expect(repository.executeIdempotentOrderCreate(unavailableCouponInput))
    .rejects.toMatchObject({ code: 'PROFILE_COUPON_NOT_AVAILABLE' });
  expect((await repository.listOrders('shipper-1', listQuery)).total).toBe(0);
  const records = (
    repository as unknown as { orderIdempotencyRecords: unknown[] }
  ).orderIdempotencyRecords;
  expect(records).toHaveLength(0);
});
```

增加 A->B、取消、完成，以及每个步骤抛错后订单/事件/券/幂等记录均不变化的表驱动用例。

- [ ] **Step 2: 运行聚焦测试并确认 RED**

Run:

```powershell
npm --prefix apps/api test -- orders.repository orders.service profile-coupons.service --runInBand
```

Expected: FAIL，提示 `executeIdempotentOrderCreate` 和共享 store 不存在。

- [ ] **Step 3: 增加共享 InMemory 券 store**

```ts
export class InMemoryProfileCouponsStore {
  coupons: ShipperCouponRecord[];

  constructor(seed: { coupons?: ShipperCouponRecord[] } = {}) {
    this.coupons = structuredClone(seed.coupons ?? []);
  }

  clone() {
    return structuredClone(this.coupons);
  }

  replace(coupons: ShipperCouponRecord[]) {
    this.coupons = structuredClone(coupons);
  }
}
```

`InMemoryProfileCouponsRepository` 接受可选 `store`，未提供时仍按原 seed 自行创建，旧测试调用不变。订单仓储和钱包仓储的联动测试必须显式共享同一实例：

```ts
const sharedCouponStore = new InMemoryProfileCouponsStore({ coupons });
const ordersRepository = new InMemoryOrdersRepository(
  () => now,
  sharedCouponStore,
);
const couponsRepository = new InMemoryProfileCouponsRepository({
  store: sharedCouponStore,
});
```

`orders.service.spec.ts` 的用券 setup 也改成上述装配，不能再给 service 一个与订单仓储无关的钱包副本。生产模块继续由 `OrdersRepository` 与钱包仓储共享现有单个 `PrismaService`；不得为了测试 store 新增 InMemory provider、Nest 注入 token 或第二个 Prisma client。

- [ ] **Step 4: 定义幂等创建仓储输入与结果**

```ts
export type ExecuteOrderCreateInput = {
  actorUserId: string;
  operation: 'shipper_create';
  idempotencyKey: string;
  requestFingerprint: string;
  expiresAtIso: string;
  input: CreateShipperOrderRequest;
};

export type ExecuteOrderCreateResult =
  | { kind: 'success'; order: ShipperOrderRecord; replayed: boolean }
  | { kind: 'key-reused' }
  | { kind: 'key-expired' };
```

在 `OrdersRepository` 增加 `executeIdempotentOrderCreate()` 和不含 `orderId` 的 `resolveExistingOrderCreate()`。券资格/计价/CAS 失败在事务内抛现有 `BusinessError`，Prisma 和 InMemory 都必须先回滚 staged state 再向 service 透传。

- [ ] **Step 5: 用 staged copy 实现 InMemory 原子发布**

每次创建/变更先克隆 `orders`、`orderIdempotencyRecords` 和共享 coupons，在克隆上执行完整命令；所有检查成功后依次替换真实数组。异常或业务失败直接丢弃克隆。

```ts
const stagedOrders = structuredClone(this.orders);
const stagedRecords = structuredClone(this.orderIdempotencyRecords);
const stagedCoupons = this.couponStore.clone();

const result = applyInMemoryOrderCreate(
  stagedOrders,
  stagedRecords,
  stagedCoupons,
  input,
  this.now(),
);

if (result.kind === 'success' && !result.replayed) {
  this.orders.splice(0, this.orders.length, ...stagedOrders);
  this.orderIdempotencyRecords.splice(0, this.orderIdempotencyRecords.length, ...stagedRecords);
  this.couponStore.replace(stagedCoupons);
}
return result;
```

- [ ] **Step 6: 运行 InMemory 与钱包回归测试**

Run:

```powershell
npm --prefix apps/api test -- orders.repository orders.service profile-coupons.service --runInBand
```

Expected: PASS；钱包排序/汇总、旧发券接口、创建重放和四类券转换同时通过。

- [ ] **Step 7: 主代理 review checkpoint**

当前脏工作区跳过暂存与提交。主代理只审阅共享 store、订单仓储及相关测试的 scoped diff，并确认生产模块没有新增 InMemory DI 分支。

## Task 5：实现 Prisma 幂等发单事务

**Files:**
- Modify: `apps/api/src/orders/orders.repository.ts`
- Test: `apps/api/src/orders/orders.service.spec.ts`
- Test: `apps/api/src/orders/orders.repository.spec.ts`

- [ ] **Step 1: 写 Prisma 创建事务、P2002 和券竞争失败测试**

```ts
it('creates order event idempotency snapshot and coupon lock in one transaction', async () => {
  await expect(repository.executeIdempotentOrderCreate(input)).resolves.toMatchObject({
    kind: 'success',
    replayed: false,
  });

  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  expect(transaction.order.create).toHaveBeenCalledTimes(1);
  expect(transaction.orderIdempotencyRecord.create).toHaveBeenCalledTimes(1);
  expect(transaction.shipperCoupon.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ status: 'usable' }),
      data: expect.objectContaining({ status: 'locked' }),
    }),
  );
});

it('does not replay an unrelated unique constraint violation', async () => {
  prisma.$transaction.mockRejectedValue({ code: 'P2002' });
  prisma.orderIdempotencyRecord.findUnique.mockResolvedValue(null);
  await expect(repository.executeIdempotentOrderCreate(input)).rejects.toMatchObject({ code: 'P2002' });
});
```

增加同 Key 已有记录在任何 order/coupon 查询前返回、券 CAS count 0 中止、快照写失败向外抛错的用例。`P2002` 竞态必须独立覆盖四个结果：同指纹且未过期返回 `success/replayed=true`；不同指纹返回 `key-reused`；同指纹但过期返回 `key-expired`；当前作用域查无记录时原样重抛 `P2002`。不同指纹优先判 reused，不能因记录同时过期而改绑 Key。

- [ ] **Step 2: 运行仓储测试并确认 RED**

Run:

```powershell
npm --prefix apps/api test -- orders.repository orders.service --runInBand
```

Expected: FAIL，Prisma client 类型缺少 sequence raw query、事务券 delegate 和创建方法。

- [ ] **Step 3: 扩展事务 client 并实现 sequence 取号**

```ts
type PrismaOrdersTransactionClient = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  order: {
    create(args: unknown): Promise<PrismaOrderRecord>;
    findUnique(args: unknown): Promise<PrismaOrderRecord | null>;
    count(args: unknown): Promise<number>;
    findMany(args: unknown): Promise<PrismaOrderRecord[]>;
    update(args: unknown): Promise<PrismaOrderRecord>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  orderCargo: {
    upsert(args: unknown): Promise<unknown>;
  };
  orderLocation: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  orderRequirement: {
    upsert(args: unknown): Promise<unknown>;
  };
  orderEvent: {
    create(args: unknown): Promise<{
      id: string;
      actorUserId: string;
      eventType: string;
      noteText: string | null;
      attachmentFileIds: unknown;
      createdAt: Date;
    }>;
  };
  orderIdempotencyRecord: {
    findUnique(args: unknown): Promise<PrismaOrderIdempotencyRecord | null>;
    create(args: unknown): Promise<{ id: string }>;
    update(args: unknown): Promise<PrismaOrderIdempotencyRecord>;
  };
  shipperCoupon: {
    findFirst(args: unknown): Promise<PrismaShipperCouponRecord | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  // 保留现有 orderExceptionCase/orderExceptionCaseAction delegates。
};

async function createNextOrderNo(transaction: PrismaOrdersTransactionClient, now: Date) {
  const rows = await transaction.$queryRaw<Array<{ value: bigint }>>`
    SELECT nextval('"Order_order_no_seq"') AS value
  `;
  return `HY${formatOrderDate(now)}${String(rows[0].value).padStart(10, '0')}`;
}
```

不要用宽泛 intersection 掩盖缺失方法；`PrismaOrdersTransactionClient` 必须显式列出 raw sequence、order create/findUnique/count/findMany/update/updateMany、cargo/location/requirement/event、idempotency find/create/update 和 shipperCoupon find/updateMany，同时原样保留异常工单 delegates。

删除 Prisma 创建路径对 `order.count()` 的依赖。`OrdersRepository` 移除普通 `createOrder()`，`PrismaOrdersRepository.createOrder()` 生产路径直接删除，所有生产创建只能进入 `executeIdempotentOrderCreate()`。测试需要预置订单时，把 InMemory 的旧直写方法明确重命名为 `seedOrderForTest()`，并批量迁移现有测试调用；该 helper 和 InMemory 幂等创建共用私有单调 sequence allocator，订单号使用 10 位序号，任何路径都不得残留 `count + 1` 或数组长度取号。

- [ ] **Step 4: 实现 authoritative create transaction 顺序**

事务必须执行：existing record -> 券只读资格校验 -> sequence -> order/nested event -> idempotency reservation -> 券 CAS -> 完整订单重读 -> response snapshot update。reservation 必须早于券 CAS，保证同 Key 竞争败者不会先碰券。

```ts
const reservation = await transaction.orderIdempotencyRecord.create({
  data: {
    actorUserId: input.actorUserId,
    orderId: created.id,
    operation: 'shipper_create',
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: input.requestFingerprint,
    responseSnapshot: {},
    createdAt: now,
    expiresAt: new Date(input.expiresAtIso),
  },
});
```

券 CAS 必须匹配 `id + shipperId + status='usable'`；`count !== 1` 时在 transaction callback 内抛 `BusinessError(ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE, '优惠券不可用')`，让整个 interactive transaction 回滚。

- [ ] **Step 5: 实现创建 P2002 收敛**

```ts
if (isPrismaErrorCode(error, 'P2002')) {
  const existing = await this.prisma.orderIdempotencyRecord.findUnique({
    where: createOrderIdempotencyRecordWhereUnique(input),
  });
  if (existing) {
    return mapExistingPrismaOrderIdempotencyRecord(existing, input, this.now());
  }
}
throw error;
```

`mapExistingPrismaOrderIdempotencyRecord()` 按固定顺序判别 fingerprint -> expiry -> replay snapshot；外层 catch 只在当前 `actorUserId + shipper_create + idempotencyKey` 查到记录时调用它。为四个分支分别断言 root client 查询作用域和结果，禁止把订单号、附件或其他唯一索引的 `P2002` 当作重放。

- [ ] **Step 6: 运行仓储测试并确认 GREEN**

Run:

```powershell
npm --prefix apps/api test -- orders.repository orders.service --runInBand
npm --prefix apps/api run typecheck
```

Expected: 两条命令退出码 0；mock 明确证明所有创建写入共用 transaction client。

- [ ] **Step 7: 主代理 review checkpoint**

当前脏工作区跳过暂存与提交。主代理审阅 Prisma transaction client、普通创建路径删除、测试 seed helper 和四类 `P2002` 证据的 scoped diff。

## Task 6：把更新、取消和完成的券转换并入订单事务

**Files:**
- Modify: `apps/api/src/orders/orders.repository.ts`
- Test: `apps/api/src/orders/orders.service.spec.ts`
- Modify: `apps/api/src/orders/orders.service.ts`
- Modify: `apps/api/src/orders/orders.module.ts`

- [ ] **Step 1: 写事务内 A->B、取消释放和完成核销失败测试**

```ts
it.each([
  ['shipper_update', createShipperUpdateMutation('coupon-b')],
  ['shipper_cancel', createShipperCancelMutation()],
  ['shipper_complete', { type: 'shipper_complete' }],
])('derives the %s coupon transition inside the order transaction', async (operation, mutation) => {
  transaction.order.findUnique.mockResolvedValue(currentOrderWithCouponA);
  const result = await repository.executeIdempotentOrderMutation(
    createMutationInput({ operation, mutation }),
  );
  expect(result).toMatchObject({ kind: 'success', replayed: false });
  expect(transaction.shipperCoupon.updateMany).toHaveBeenCalled();
  expect(outsidePrisma.shipperCoupon.updateMany).not.toHaveBeenCalled();
});
```

增加券 CAS 失败时 `order.updateMany`、`orderEvent.create` 和幂等 reservation 全部不提交的测试；增加 `lockedOrderNo=NULL`、取消已 usable、完成已 used 同订单、完成 usable 但唯一 owner 的历史兼容用例。另断言 `shipper_status/driver_accept/driver_status` 自然不写券，现有 driver 调用参数完全不变。

- [ ] **Step 2: 运行聚焦测试并确认 RED**

Run:

```powershell
npm --prefix apps/api test -- orders.repository orders.service --runInBand
```

Expected: FAIL，现有 service 仍调用事务外 `ProfileCouponsService`，仓储尚未从 transaction 内 current order 派生券转换。

- [ ] **Step 3: 保持 mutation input 不变并在仓储内派生券动作**

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
```

`OrderMutationCommand` 现有 union 和所有 service/driver 调用签名保持不变。仓储读取 transaction 内 current order 后派生：`shipper_update` 比较 current 与 mutation 的目标 `couponId` 得到 none/reserve/release/replace；`shipper_cancel` 有当前券才 release；`shipper_complete` 有当前券才 redeem；`shipper_status/driver_accept/driver_status` 一律 none。禁止信任 service 的事务外订单快照或让调用方传旧券 ID、订单号、派生动作。

- [ ] **Step 4: 实现事务内券 CAS 与历史目标态**

- `reserve`：先用 `resolveReservableCouponPricing()` 校验新券，再以 `id + shipperId + status=usable` 执行 CAS，写 `locked/lockedOrderNo=current.orderNo/lockedAt=now`；立即断言 `count === 1`。
- `release`：先用当前持券 helper 验证；already usable 为历史目标态 no-op，否则以 `id + shipperId + status=locked + (lockedOrderNo=current.orderNo OR lockedOrderNo IS NULL)` 执行 CAS，清理 lock/use 元数据并写 usable；立即断言 `count === 1`。
- `replace`：A 与 B 不同才转换；先按 reserve 的精确条件锁 B 并断言 `count === 1`，再按 release 的精确条件释放 A 并再次断言 `count === 1`。第二步失败必须回滚第一步，不能先释放 A。
- `redeem`：locked same/null 时按 `id + shipperId + status=locked + (lockedOrderNo=current.orderNo OR lockedOrderNo IS NULL)` CAS 为 used 并立即断言 `count === 1`；already used 仅在 `usedOrderNo=current.orderNo` 时 no-op。usable 历史态先用 transaction `order.findMany` 证明 current 是唯一非 cancelled 引用，再以 `id + shipperId + status=usable` CAS 为 used，并断言 `count === 1`。
- 券不变：locked same 只验证；历史 NULL 用 `id + shipperId + status=locked + lockedOrderNo IS NULL` CAS 补 current orderNo，并断言 `count === 1`。其他 owner/status 中止事务。

每个写步骤都在继续下一步前检查 `count === 1`；任何 0 或大于 1 都抛 `PROFILE_COUPON_NOT_AVAILABLE` 离开 callback。业务 abort 不能在 callback 内返回失败结果，否则 Prisma 会提交之前写入。

- [ ] **Step 5: 删除 service 的事务外券编排和模块注入**

删除 `lockOrderCoupon()`、`bindLockedOrderCoupon()`、`releaseOrderCoupon()`、`redeemOrderCoupon()` 私有方法，以及创建/更新/取消/完成中的调用。`OrdersService` 构造函数不再接收 `ProfileCouponsService`，`OrdersModule` 删除对应 factory 参数和 inject 项；独立 `ProfileCouponsModule` 保持不变。driver service 不需要增加参数或改调用点。

- [ ] **Step 6: 运行订单、券钱包和模块测试**

Run:

```powershell
npm --prefix apps/api test -- orders profile-coupons app.module --runInBand
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
```

Expected: 三条命令退出码 0；订单用券测试从 service mock 转成仓储最终状态断言，钱包与后台发券回归通过。

- [ ] **Step 7: 主代理 review checkpoint**

当前脏工作区跳过暂存与提交。主代理确认现有 mutation union 未扩展、driver 调用未变化、每个券 CAS 均逐步检查精确命中数，并审阅相关 scoped diff。

## Task 7：接入创建 Controller 与 service 错误语义

**Files:**
- Modify: `apps/api/src/orders/orders.controller.ts`
- Test: `apps/api/src/orders/orders.controller.spec.ts`
- Modify: `apps/api/src/orders/orders.service.ts`
- Test: `apps/api/src/orders/orders.service.spec.ts`

- [ ] **Step 1: 写创建 header、preflight 和错误映射失败测试**

```ts
it('requires and forwards the create idempotency key', async () => {
  await controller.createOrder(request, IDEMPOTENCY_KEY, body);
  expect(service.createOrder).toHaveBeenCalledWith(
    'shipper-1',
    IDEMPOTENCY_KEY,
    body,
  );
});

it('replays create before checking current attachments or coupon state', async () => {
  repository.resolveExistingOrderCreate.mockResolvedValue({
    kind: 'success',
    order: firstSnapshot,
    replayed: true,
  });
  filesRepository.findFilesByIds.mockRejectedValue(new Error('must not run'));
  await expect(service.createOrder('shipper-1', IDEMPOTENCY_KEY, body))
    .resolves.toEqual(firstSnapshot);
  expect(filesRepository.findFilesByIds).not.toHaveBeenCalled();
});
```

覆盖缺失 Key、reused、expired、coupon unavailable、price mismatch 和数据库失败；后两类由仓储事务内 `BusinessError` 原样透传。

- [ ] **Step 2: 运行 Controller/service 测试并确认 RED**

Run:

```powershell
npm --prefix apps/api test -- orders.controller orders.service --runInBand
```

Expected: FAIL，创建 Controller 签名和 service 签名仍缺 Key。

- [ ] **Step 3: 修改创建 Controller 签名**

```ts
async createOrder(
  @Req() request: AuthenticatedRequest,
  @Headers('idempotency-key') idempotencyKey: unknown,
  @Body(new ZodValidationPipe(createShipperOrderSchema)) body: CreateShipperOrderRequest,
) {
  return ok(
    await this.ordersService.createOrder(
      getCurrentShipperId(request),
      parseRequiredOrderIdempotencyKey(idempotencyKey),
      parseCreateShipperOrderRequest(body),
    ),
    getRequestId(request),
  );
}
```

- [ ] **Step 4: 修改创建 service 顺序和结果映射**

service 顺序固定为：fingerprint -> `resolveExistingOrderCreate` -> 附件校验 -> `executeIdempotentOrderCreate` -> 幂等判别结果转 `BusinessError`。创建不读取或生成基线；券错误已经由仓储事务回滚后透传。

```ts
async createOrder(
  shipperId: string,
  idempotencyKey: string,
  input: CreateShipperOrderRequest,
) {
  const requestFingerprint = createOrderCreateFingerprint(input);
  const existing = await this.repository.resolveExistingOrderCreate({
    actorUserId: shipperId,
    operation: 'shipper_create',
    idempotencyKey,
    requestFingerprint,
  });
  if (existing) return this.unwrapOrderCreateResult(existing);
  await this.assertOrderAttachmentFiles(shipperId, input.cargoPhotoFileIds, 'cargo');
  return this.unwrapOrderCreateResult(
    await this.repository.executeIdempotentOrderCreate({
      actorUserId: shipperId,
      operation: 'shipper_create',
      idempotencyKey,
      requestFingerprint,
      expiresAtIso: this.createOrderMutationExpiresAtIso(),
      input,
    }),
  );
}
```

- [ ] **Step 5: 运行 API 聚焦测试与静态检查**

Run:

```powershell
npm --prefix apps/api test -- orders.controller orders.service --runInBand
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
```

Expected: 三条命令退出码 0；创建 body 类型仍不含 `baseUpdatedAtIso`。

- [ ] **Step 6: 主代理 review checkpoint**

当前脏工作区跳过暂存与提交。主代理审阅 Controller/service 四个文件的 scoped diff 和聚焦测试输出。

## Task 8：让移动端创建失败重试复用 Key

**Files:**
- Modify: `src/utils/appRuntimeState.ts`
- Test: `__tests__/appRuntimeState.test.ts`
- Modify: `src/types.ts`
- Modify: `src/utils/order.ts`
- Test: `__tests__/orderUtils.test.ts`
- Modify: `src/utils/orderMutationSync.ts`
- Test: `__tests__/orderMutationSyncUtils.test.ts`
- Modify: `src/services/platformOrderApi.ts`
- Test: `__tests__/platformOrderApi.test.ts`
- Modify: `App.tsx`
- Test: `__tests__/App.test.tsx`

- [ ] **Step 1: 写 durable runtime state、adapter header 和创建上下文失败测试**

```ts
it('awaits a durable runtime snapshot and propagates storage failure', async () => {
  await saveAppRuntimeStateDurably(runtimeStateWithCreateContext);
  expect(await readStoredAppRuntimeState()).toMatchObject(
    runtimeStateWithCreateContext,
  );

  mockAsyncStorageWriteFailure();
  await expect(saveAppRuntimeStateDurably(runtimeStateWithCreateContext))
    .rejects.toThrow('storage failed');
});

it('sends an idempotency header without a create baseline', async () => {
  await api.createOrder(createRequest, IDEMPOTENCY_KEY);
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/shipper/orders'),
    expect.objectContaining({
      headers: expect.objectContaining({ 'Idempotency-Key': IDEMPOTENCY_KEY }),
      body: expect.not.stringContaining('baseUpdatedAtIso'),
    }),
  );
});

it('keeps the existing create key in failed sync state', () => {
  const context = { idempotencyKey: IDEMPOTENCY_KEY };
  expect(createFailedOrderSyncState('failed', 'create', now, { createContext: context }))
    .toMatchObject({ createContext: context });
});
```

`__tests__/appRuntimeState.test.ts` 独立验证 `saveAppRuntimeStateDurably()` 直接 await `writeJsonStorage`、成功后可恢复完全相同的 create context、写失败会 reject；原 `saveAppRuntimeState()` 继续提供普通 UI 更新使用的 fire-and-forget 行为。

- [ ] **Step 2: 写 App durable-before-send、失败重试和 legacy fail-closed 测试**

测试 fetch 第一次返回 500、第二次返回首次已成功订单快照；捕获两次 `Idempotency-Key` 并断言相同，最终只有一个本地平台订单卡片。

```ts
expect(createHeaders).toHaveLength(2);
expect(createHeaders[0]['Idempotency-Key']).toBe(createHeaders[1]['Idempotency-Key']);
expect(findPlatformOrders(renderer)).toHaveLength(1);
```

增加两个受控 promise 证明严格顺序：先让 AsyncStorage 写 promise pending，断言 `platformOrderApi.createOrder` 尚未调用；解除持久化后让 create POST promise 保持 pending，此时读取存储快照，断言 pending 占位订单已经包含与请求 header 完全相同的 Key。不能只断言最终状态，因为那证明不了 send 前是否 durable。

另加缺 token 后登录重试、App runtime 持久化恢复、reused/expired 不自动生成新 Key。构造升级前 `operation=create` 但无 `createContext` 的 legacy 队列项，点击重试只能刷新平台订单并展示“作为新订单发布”的人工确认，明确断言没有生成 Key、没有调用 create POST；只有用户另行确认新发布动作后才进入全新的 durable-before-send 流程。

创建错误分类单独覆盖 `IDEMPOTENCY_KEY_REUSED`、`IDEMPOTENCY_KEY_EXPIRED` 和意外 `ORDER_CONFLICT`：前两者刷新列表、停止自动重试且保留原 Key；创建路径不得进入现有 mutation 的 `ORDER_CONFLICT` 刷新/重放分支，收到该码应按服务端契约异常处理。

- [ ] **Step 3: 运行移动端聚焦测试并确认 RED**

Run:

```powershell
npm test -- --runInBand __tests__/appRuntimeState.test.ts __tests__/platformOrderApi.test.ts __tests__/orderUtils.test.ts __tests__/orderMutationSyncUtils.test.ts __tests__/App.test.tsx
```

Expected: FAIL，durable 保存 API、`createOrder` 第二参数和 `createContext` 尚不存在。

- [ ] **Step 4: 增加独立创建上下文类型和 helper**

```ts
export type OrderCreateIdempotencyContext = {
  idempotencyKey: string;
};

export type OrderSyncState = {
  status: OrderSyncStatus;
  operation?: OrderSyncOperation;
  message: string;
  updatedAtText: string;
  updatedAtIso?: string;
  createContext?: OrderCreateIdempotencyContext;
  mutationContext?: OrderMutationContext;
  queueItems?: OrderSyncQueueItem[];
};

export function createOrderCreateContext(): OrderCreateIdempotencyContext {
  return { idempotencyKey: createUuidV4() };
}
```

`OrderSyncStateOptions` 增加 `createContext`，三个 sync state constructor 均原样保存；`mutationContext.baseUpdatedAtIso` 保持必填。

- [ ] **Step 5: 增加可 await 的 runtime state 持久化 API**

```ts
export async function saveAppRuntimeStateDurably(state: AppRuntimeState) {
  const snapshot = createAppRuntimeStateSnapshot(state);
  appRuntimeStateSnapshot = snapshot;
  await writeJsonStorage(APP_RUNTIME_STATE_STORAGE_KEY, snapshot);
}
```

抽取 snapshot 构造供普通和 durable 保存复用。durable 版本不得调用 `fireAndForget`、不得吞写入错误；写失败时 React state 中的草稿仍可保留，但调用方必须停止 POST 并提示安全保存失败。

- [ ] **Step 6: 修改 adapter 创建签名**

```ts
createOrder(
  request: PlatformCreateShipperOrderRequest,
  idempotencyKey: string,
) {
  const normalizedRequest = normalizeCreateOrderRequest(request);
  const normalizedKey = normalizeOrderMutationIdempotencyKey(
    idempotencyKey,
    'PLATFORM_ORDER_REQUEST_INVALID',
  );
  return platformPost(config, '/shipper/orders', normalizedRequest,
    createOrderMutationRequestOptions(normalizedKey));
}
```

- [ ] **Step 7: 修改 App 发布和创建重试路径**

首次发布固定执行：生成 `createContext` -> 构造含该 context 的 pending 本地占位订单 -> 写入 React state -> `await saveAppRuntimeStateDurably()` -> POST。durable 保存失败立即停止，不允许触碰 adapter；无 token 或普通网络失败都保留同一 context。`retryOrderSyncToPlatform()` 在 `operation === 'create'` 时只能读取已有 `syncState.createContext` 并复用，不能为 legacy 项静默补 Key。

对 `IDEMPOTENCY_KEY_REUSED/EXPIRED` 使用创建专用分类、提示并先刷新列表；不能在 catch 中自动生成新 Key。legacy 无 Key 项只刷新并进入人工确认状态；创建 catch 不复用 mutation 的 `ORDER_CONFLICT` 分支。

- [ ] **Step 8: 运行移动端聚焦测试并确认 GREEN**

Run:

```powershell
npm test -- --runInBand __tests__/appRuntimeState.test.ts __tests__/platformOrderApi.test.ts __tests__/orderUtils.test.ts __tests__/orderMutationSyncUtils.test.ts __tests__/App.test.tsx
npx tsc --noEmit
npm run lint
```

Expected: 三条命令退出码 0；独立 durable API、send 前落盘、创建专用错误分类、legacy no POST、创建与变更上下文测试全部通过。

- [ ] **Step 9: 主代理 review checkpoint**

当前脏工作区跳过暂存与提交。主代理审阅 durable API、创建上下文、adapter 和 App 流程的 scoped diff，重点复核首次 send 前落盘与 legacy no POST 证据。

## Task 9：更新 OpenAPI 与完成边界文档

**Files:**
- Modify: `docs/platform/openapi-stage-1.yaml`
- Test: `apps/api/src/config/openapi-stage-1.spec.ts`
- Modify: `docs/platform/README.md`
- Modify: `docs/03-项目当前状态与补全路线.md`

- [ ] **Step 1: 写 OpenAPI 创建契约失败测试**

```ts
it('documents idempotent shipper order creation without a baseline', () => {
  const create = document.paths['/shipper/orders'].post;
  expect(create.parameters).toContainEqual(
    expect.objectContaining({ $ref: '#/components/parameters/IdempotencyKeyHeader' }),
  );
  expect(JSON.stringify(create.requestBody)).not.toContain('baseUpdatedAtIso');
  expect(create.responses['409']).toEqual(expect.anything());
});
```

增加四个幂等/券错误示例和“同 Key 不重复建单”描述断言。

- [ ] **Step 2: 运行 OpenAPI 测试并确认 RED**

Run:

```powershell
npm --prefix apps/api test -- openapi-stage-1 --runInBand
```

Expected: FAIL，创建 path 尚未引用公共 header 或缺少错误示例。

- [ ] **Step 3: 更新 OpenAPI 创建 path**

```yaml
parameters:
  - $ref: '#/components/parameters/IdempotencyKeyHeader'
responses:
  '400':
    description: Idempotency key is missing or invalid
  '409':
    description: Idempotency key is reused or expired, or coupon validation/CAS failed
```

创建说明明确 request body 不含 `baseUpdatedAtIso`；公共 header 说明区分 create 与 versioned mutation。

- [ ] **Step 4: 更新平台 README 与状态路线**

记录以下事实：发单幂等、四类订单用券同事务、sequence 新订单号、真实 PostgreSQL smoke 命令；同时保留支付、退款返券、营销规则和跨服务事务未完成声明。

- [ ] **Step 5: 运行 OpenAPI 测试并检查 YAML**

Run:

```powershell
npm --prefix apps/api test -- openapi-stage-1 --runInBand
npm --prefix apps/api run typecheck
```

Expected: 两条命令退出码 0。

- [ ] **Step 6: 主代理 review checkpoint**

当前脏工作区跳过暂存与提交。主代理审阅 OpenAPI、契约测试和两份完成边界文档的 scoped diff。

## Task 10：增加真实 PostgreSQL 原子性 smoke 并接入 CI

**Files:**
- Modify: `apps/api/scripts/seed-stage-1.js`
- Test: `apps/api/src/config/stage-1-database-scripts.spec.ts`
- Modify: `apps/api/package.json`
- Test: `apps/api/src/config/postgres-verification-script.spec.ts`
- Modify: `.github/workflows/verify.yml`

- [ ] **Step 1: 写命令解析和 package scripts 失败测试**

```ts
expect(parseArgs(['node', 'seed-stage-1.js', 'order-coupon-atomicity-smoke', '--test']))
  .toEqual({ command: 'order-coupon-atomicity-smoke', useTestDatabase: true });

expect(packageJson.scripts['db:test:postgres:order-coupon-atomicity-smoke'])
  .toBe('node scripts/seed-stage-1.js order-coupon-atomicity-smoke --test');
expect(packageJson.scripts['db:postgres:order-coupon-migration-verify'])
  .toBe('node scripts/verify-order-coupon-migration.js');
expect(packageJson.scripts['db:test:postgres:order-coupon-migration-verify'])
  .toBe('node scripts/verify-order-coupon-migration.js --test');
expect(packageJson.scripts['db:test:postgres:bootstrap'])
  .toContain('db:test:postgres:order-coupon-migration-verify');
expect(packageJson.scripts['db:test:postgres:bootstrap'])
  .toContain('db:test:postgres:order-coupon-atomicity-smoke');
```

- [ ] **Step 2: 写 smoke scenario 的假 client 失败测试**

用可控 fake HTTP client 和 Prisma stub 断言 scenario 会检查：同 Key 两响应同 ID、不同 body key-reused、同券不同 Key 唯一胜者、败者无订单/事件/幂等记录、换券/取消/完成最终券状态和事件计数。另断言 late-failure trigger/function 的创建和 `finally` 清理必定执行，并检查现有 `order-mutation-concurrency-smoke` 的创建 helper 必须接收 UUID Key、发送 `Idempotency-Key`，不能被新必填 header 打断。

- [ ] **Step 3: 运行脚本测试并确认 RED**

Run:

```powershell
npm --prefix apps/api test -- stage-1-database-scripts postgres-verification-script --runInBand
```

Expected: FAIL，命令、runner 和 package scripts 不存在。

- [ ] **Step 4: 实现 `runOrderCouponAtomicityScenario()`**

场景必须创建独立货主、两张 usable 券和唯一 Key，使用 `Promise.allSettled()` 发起并发 HTTP 请求，并直接通过 Prisma 查询最终行数。

```js
const results = await Promise.allSettled([
  apiClient.createOrder(token, request, sameKey),
  apiClient.createOrder(token, request, sameKey),
]);
assert.deepEqual(results.map(result => result.status), ['fulfilled', 'fulfilled']);
const [left, right] = results.map(result => result.value);
assert.equal(left.data.id, right.data.id);
assert.equal(await prisma.order.count({ where: { id: left.data.id } }), 1);
assert.equal(await prisma.orderEvent.count({ where: { orderId: left.data.id, eventType: 'created' } }), 1);
assert.equal(await prisma.orderIdempotencyRecord.count({
  where: { actorUserId: shipperId, operation: 'shipper_create', idempotencyKey: sameKey },
}), 1);
```

同券不同 Key 场景断言一个 fulfilled、一个 `PROFILE_COUPON_NOT_AVAILABLE`，且数据库只存在胜者订单和 reservation。

随后增加真实 late-failure 子场景：在 `OrderIdempotencyRecord.responseSnapshot` 的 UPDATE 上创建临时 PostgreSQL trigger，限定本场景 Key 并抛异常；记录订单/事件基线后发起带 usable 券的创建，断言 HTTP 失败，订单增量为 0、`created` 事件增量为 0、该券仍为 usable 且无 lock/use 元数据、当前 Key 的幂等记录为 0。trigger 与 function 必须在 `finally` 中分别 `DROP TRIGGER IF EXISTS`、`DROP FUNCTION IF EXISTS`，即使请求或断言失败也不能污染后续 smoke。

A -> B 第二段旧券 CAS 的 late failure 本轮仍只有 mock/InMemory 回滚证据，列为残余风险并后续补真实 PostgreSQL trigger；不得把当前 snapshot trigger 描述成已经覆盖该分支，但它不阻塞本轮迁移 fixture 与创建原子性验收。

同时修改既有 `runOrderMutationConcurrencyScenario()`：生成独立 UUID，并把它传给 `createShipperOrder(accessToken, body, idempotencyKey)`；其 fake-client 测试断言创建请求携带同一个 header。旧 smoke 不允许继续走无 Key 创建。

- [ ] **Step 5: 注册 smoke 命令和 CI bootstrap**

新增：

```json
"db:postgres:order-coupon-migration-verify": "node scripts/verify-order-coupon-migration.js",
"db:test:postgres:order-coupon-migration-verify": "node scripts/verify-order-coupon-migration.js --test",
"db:postgres:order-coupon-atomicity-smoke": "node scripts/seed-stage-1.js order-coupon-atomicity-smoke",
"db:test:postgres:order-coupon-atomicity-smoke": "node scripts/seed-stage-1.js order-coupon-atomicity-smoke --test"
```

把 normal/test migration verify 和 smoke 分别串入本地/测试 bootstrap，顺序固定为 deploy -> migration fixture verify -> seed -> HTTP smoke。GitHub Actions 保持 PostgreSQL 16 service，并确保 bootstrap 输出中同时出现 migration verify 和新 smoke 名称；本机无 PostgreSQL 时由该 CI step 提供真实 fixture 证据。

- [ ] **Step 6: 运行脚本单元测试并确认 GREEN**

Run:

```powershell
npm --prefix apps/api test -- stage-1-database-scripts postgres-verification-script --runInBand
```

Expected: PASS，命令、脚本和 bootstrap 契约一致。

- [ ] **Step 7: 在真实测试库执行 smoke**

Run:

```powershell
npm --prefix apps/api run db:test:postgres:order-coupon-migration-verify
npm --prefix apps/api run db:test:postgres:bootstrap
```

Expected: 独立 migration verify 与 bootstrap 均退出码 0；fixture 输出包含 locked+completed 修复、orphan metadata 分流、expired 保持和歧义回滚/重试，`order-coupon-atomicity-smoke` 输出同 Key 重放、同券唯一胜者、换券、取消、完成和 snapshot trigger 全回滚七类 PASS，既有 `order-mutation-concurrency-smoke` 仍通过。若本机 PostgreSQL 不可达，保留失败日志并由 CI PostgreSQL job 完成相同两条门禁，不能拿脚本单测冒充。

- [ ] **Step 8: 主代理 review checkpoint**

当前脏工作区跳过暂存与提交。主代理审阅 smoke、脚本测试、package scripts 和 CI 的 scoped diff，重点核对 trigger `finally` 清理、四类真实回滚断言及旧 smoke 创建 Key。

## Task 11：执行全量回归与完成审计

**Files:**
- Verify only: all files listed above

- [ ] **Step 1: 运行移动端全量测试与静态检查**

Run:

```powershell
npx jest --showConfig
npm test -- --runInBand --config jest.config.js
npx tsc --noEmit
npm run lint
```

Expected: 四条命令退出码 0；resolved `testMatch` 只包含标准 `__tests__`/`*.spec|test` 模式，`testPathIgnorePatterns` 明确包含 `/apps/api/`，根 Jest 不误扫 API；无失败 suite、TypeScript 错误或 lint error。

- [ ] **Step 2: 运行 API 全量测试与静态检查**

Run:

```powershell
npm --prefix apps/api test
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run prisma:validate
npm run api:build
```

Expected: 五条命令退出码 0。

- [ ] **Step 3: 重新执行真实 PostgreSQL 门禁**

Run:

```powershell
npm --prefix apps/api run db:test:postgres:order-coupon-migration-verify
npm --prefix apps/api run db:test:postgres:bootstrap
```

Expected: 真实 migration fixture、migration deploy、旧 smoke 和 `order-coupon-atomicity-smoke` 全部退出码 0；CI PostgreSQL job 执行同一组门禁。

- [ ] **Step 4: 审计关键不变量**

逐项核对数据库和测试证据：创建重放一个订单/事件/记录；创建无基线；四类券转换无事务外调用；同券一个胜者；败者无残留；locked+唯一 completed 正确核销；orphan 仅 NULL/悬空可清理；expired orphan/cancelled 不复活；移动端普通重试复用 Key；OpenAPI 与实现一致；旧幂等记录仍可重放。单独记录 A -> B 第二段 CAS 尚无真实 trigger 的残余风险。

- [ ] **Step 5: 检查 diff 和占位符**

Run:

```powershell
git diff --check
Select-String -Path apps/api/src/**/*.ts,src/**/*.ts,__tests__/*.ts,__tests__/*.tsx,docs/platform/*.md,docs/platform/*.yaml -Pattern ('T' + 'BD|T' + 'ODO|FIX' + 'ME')
```

Expected: `git diff --check` 退出码 0；搜索无本切片新增占位符。

- [ ] **Step 6: 主代理最终 review checkpoint**

主代理运行 `git status --short` 和 scoped diff 审计，确认本切片文件集合、测试证据与计划清单一致，并识别所有无关工作区改动。当前阶段不执行暂存或版本集成命令。
