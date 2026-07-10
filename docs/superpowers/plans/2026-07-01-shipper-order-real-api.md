# Shipper Order Real API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把货主端订单主链路第一片从本地 mock 推进到真实后端 API 边界，覆盖订单创建、列表、详情、事件记录和移动端 adapter。

**Architecture:** 后端继续采用现有 NestJS 模块化单体结构，新增 `orders` 模块并复用 `AccessTokenGuard`、`ok()` 响应包和 `BusinessError` 错误模型。移动端先新增独立 `platformOrderApi` adapter 和 DTO mapper，不直接删除本地订单状态；页面在平台 API 可用时尝试真实请求，失败时保留现有本地失败队列。

**Tech Stack:** React Native 0.86, TypeScript, Jest, NestJS, Prisma, PostgreSQL, Zod, OpenAPI 3.0.

---

## Scope Check

本计划只做阶段 2 的第一片“货主订单真实化”。不做司机端、订单大厅、报价/接单、地图定位、路线规划、支付、优惠券真实核销、发票、文件上传、推送、IM、后台审核和客服工单真实流转。那些东西现在硬塞进来，项目会变成铁锅炖需求，闻着香，端不上桌。

真实 PostgreSQL/Docker 环境当前不可用，`npm --prefix apps/api run db:postgres:doctor` 仍失败于 Docker 缺失和 `localhost:5432` 不通。因此本计划的代码实现必须先靠 Jest、TypeScript、Prisma schema validate 和 mock Prisma client 验证；真实 migration deploy、seed、order smoke 要等数据库环境就绪后执行。

## File Structure

### Create

- `apps/api/src/orders/dto.ts`：订单 API DTO、订单状态、计价模式、支付方式和响应模型。
- `apps/api/src/orders/orders.validation.ts`：Zod 请求校验和 trim/规范化函数。
- `apps/api/src/orders/orders.repository.ts`：订单仓储接口、内存仓储、Prisma 仓储适配。
- `apps/api/src/orders/orders.service.ts`：创建订单、列表、详情和事件记录业务逻辑。
- `apps/api/src/orders/orders.controller.ts`：`/shipper/orders` 路由。
- `apps/api/src/orders/orders.module.ts`：Nest module 注入链路。
- `apps/api/src/orders/*.spec.ts`：service、controller、validation、repository 测试。
- `src/services/platformOrderApi.ts`：移动端订单 API adapter。
- `src/services/platformOrderMapper.ts`：后端订单 DTO 到现有 `RecentOrder` 的 mapper。
- `__tests__/platformOrderApi.test.ts`：移动端订单 adapter 测试。
- `__tests__/platformOrderMapper.test.ts`：移动端 DTO mapper 测试。

### Modify

- `apps/api/prisma/schema.prisma`：新增订单、货物、地点、要求和事件模型。
- `apps/api/prisma/migrations/<timestamp>_shipper_order_foundation/migration.sql`：新增对应 SQL migration。
- `apps/api/src/app.module.ts`：导入 `OrdersModule`。
- `apps/api/src/common/errors.ts`：新增订单错误码。
- `docs/platform/openapi-stage-1.yaml`：追加订单接口规范，或在后续拆为 `openapi-stage-2.yaml` 后由 README 指向。
- `src/types.ts`：必要时补充平台订单字段，但优先复用现有 `RecentOrder`。
- `App.tsx` / `src/screens/OrderDraftScreen.tsx` / `src/screens/OrdersScreen.tsx` / `src/screens/OrderDetailScreen.tsx`：只在 adapter 和 mapper 测试稳定后接入，且保留本地兜底。
- `docs/03-项目当前状态与补全路线.md`：记录阶段 2 第一片完成和剩余缺口。

---

## Task 1: Add Order Schema and Migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260701000000_shipper_order_foundation/migration.sql`
- Test: `apps/api/src/config/prisma-migration.spec.ts`

- [ ] **Step 1: Write failing migration coverage test**

Add these expectations to `apps/api/src/config/prisma-migration.spec.ts`:

```ts
it('contains shipper order foundation tables', () => {
  const migration = readStageOneMigration();

  expect(migration).toContain('CREATE TABLE "Order"');
  expect(migration).toContain('CREATE TABLE "OrderCargo"');
  expect(migration).toContain('CREATE TABLE "OrderLocation"');
  expect(migration).toContain('CREATE TABLE "OrderRequirement"');
  expect(migration).toContain('CREATE TABLE "OrderEvent"');
  expect(migration).toContain('CREATE INDEX "Order_shipper_status_created_idx"');
});
```

Run:

```powershell
npm --prefix apps/api test -- prisma-migration.spec.ts
```

Expected: FAIL because the order tables do not exist in migration SQL.

- [ ] **Step 2: Extend Prisma schema**

Append these models and enums to `apps/api/prisma/schema.prisma`, and add `orders Order[] @relation("ShipperOrders")` to `model User`:

```prisma
enum OrderStatus {
  waiting
  loading
  transporting
  confirming
  completed
  cancelled
}

enum PricingMode {
  fixed
  negotiable
}

enum PaymentMethod {
  cod
  online
}

model Order {
  id                  String            @id @default(uuid())
  orderNo             String            @unique
  shipperId           String
  status              OrderStatus       @default(waiting)
  pricingMode         PricingMode
  priceCents          Int?
  payablePriceCents   Int?
  paymentMethod       PaymentMethod
  couponId            String?
  couponTitle         String?
  couponDiscountCents Int?
  pickupTime          DateTime
  expectedDeliveryText String?
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt
  shipper             User              @relation("ShipperOrders", fields: [shipperId], references: [id])
  cargo               OrderCargo?
  locations           OrderLocation[]
  requirement         OrderRequirement?
  events              OrderEvent[]

  @@index([shipperId, status, createdAt], name: "Order_shipper_status_created_idx")
  @@index([shipperId, createdAt], name: "Order_shipper_created_idx")
}

model OrderCargo {
  orderId          String @id
  cargoType        String
  weightText       String
  volumeText       String?
  quantityText     String
  description      String?
  cargoPhotoCount  Int    @default(0)
  order            Order  @relation(fields: [orderId], references: [id])
}

model OrderLocation {
  id          String @id @default(uuid())
  orderId     String
  type        String
  address     String
  contactName String
  contactPhone String
  noteText    String?
  order       Order  @relation(fields: [orderId], references: [id])

  @@index([orderId, type], name: "OrderLocation_order_type_idx")
}

model OrderRequirement {
  orderId           String @id
  vehicleType       String
  vehicleLengthText String?
  needTailboard     Boolean @default(false)
  needTarp          Boolean @default(false)
  valueAddedServicesText String?
  order             Order @relation(fields: [orderId], references: [id])
}

model OrderEvent {
  id          String   @id @default(uuid())
  orderId     String
  actorUserId String
  eventType   String
  noteText    String?
  createdAt   DateTime @default(now())
  order       Order    @relation(fields: [orderId], references: [id])

  @@index([orderId, createdAt], name: "OrderEvent_order_created_idx")
}
```

- [ ] **Step 3: Add migration SQL**

Create `apps/api/prisma/migrations/20260701000000_shipper_order_foundation/migration.sql` with matching SQL:

```sql
CREATE TYPE "OrderStatus" AS ENUM ('waiting', 'loading', 'transporting', 'confirming', 'completed', 'cancelled');
CREATE TYPE "PricingMode" AS ENUM ('fixed', 'negotiable');
CREATE TYPE "PaymentMethod" AS ENUM ('cod', 'online');

CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "orderNo" TEXT NOT NULL,
  "shipperId" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'waiting',
  "pricingMode" "PricingMode" NOT NULL,
  "priceCents" INTEGER,
  "payablePriceCents" INTEGER,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "couponId" TEXT,
  "couponTitle" TEXT,
  "couponDiscountCents" INTEGER,
  "pickupTime" TIMESTAMP(3) NOT NULL,
  "expectedDeliveryText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderCargo" (
  "orderId" TEXT NOT NULL,
  "cargoType" TEXT NOT NULL,
  "weightText" TEXT NOT NULL,
  "volumeText" TEXT,
  "quantityText" TEXT NOT NULL,
  "description" TEXT,
  "cargoPhotoCount" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "OrderCargo_pkey" PRIMARY KEY ("orderId")
);

CREATE TABLE "OrderLocation" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "noteText" TEXT,
  CONSTRAINT "OrderLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderRequirement" (
  "orderId" TEXT NOT NULL,
  "vehicleType" TEXT NOT NULL,
  "vehicleLengthText" TEXT,
  "needTailboard" BOOLEAN NOT NULL DEFAULT false,
  "needTarp" BOOLEAN NOT NULL DEFAULT false,
  "valueAddedServicesText" TEXT,
  CONSTRAINT "OrderRequirement_pkey" PRIMARY KEY ("orderId")
);

CREATE TABLE "OrderEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "noteText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");
CREATE INDEX "Order_shipper_status_created_idx" ON "Order"("shipperId", "status", "createdAt");
CREATE INDEX "Order_shipper_created_idx" ON "Order"("shipperId", "createdAt");
CREATE INDEX "OrderLocation_order_type_idx" ON "OrderLocation"("orderId", "type");
CREATE INDEX "OrderEvent_order_created_idx" ON "OrderEvent"("orderId", "createdAt");

ALTER TABLE "Order" ADD CONSTRAINT "Order_shipperId_fkey" FOREIGN KEY ("shipperId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderCargo" ADD CONSTRAINT "OrderCargo_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderLocation" ADD CONSTRAINT "OrderLocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderRequirement" ADD CONSTRAINT "OrderRequirement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Verify schema**

Run:

```powershell
npm --prefix apps/api run prisma:validate
npm --prefix apps/api test -- prisma-migration.spec.ts
```

Expected: both PASS.

- [ ] **Step 5: Commit schema slice**

```powershell
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260701000000_shipper_order_foundation/migration.sql apps/api/src/config/prisma-migration.spec.ts
git commit -m "feat(api): add shipper order schema"
```

---

## Task 2: Add Order Validation and Service

**Files:**
- Create: `apps/api/src/orders/dto.ts`
- Create: `apps/api/src/orders/orders.validation.ts`
- Create: `apps/api/src/orders/orders.validation.spec.ts`
- Create: `apps/api/src/orders/orders.repository.ts`
- Create: `apps/api/src/orders/orders.service.ts`
- Create: `apps/api/src/orders/orders.service.spec.ts`
- Modify: `apps/api/src/common/errors.ts`

- [ ] **Step 1: Write failing validation tests**

Create `apps/api/src/orders/orders.validation.spec.ts`:

```ts
import {
  parseCreateShipperOrderRequest,
  parseListShipperOrdersQuery,
} from './orders.validation';

describe('orders validation', () => {
  it('normalizes a fixed price shipper order request', () => {
    expect(
      parseCreateShipperOrderRequest({
        cargoType: 'build',
        weightText: ' 2.5 吨 ',
        quantityText: '12 箱',
        pickupAddress: '宝安区福永物流园',
        pickupContact: '赵经理',
        pickupPhone: '13900139001',
        deliveryAddress: '南山区科技园',
        deliveryContact: '钱店长',
        deliveryPhone: '13900139002',
        vehicleRequirement: 'medium',
        vehicleLengthText: '4.2 米',
        needTailboard: true,
        needTarp: false,
        pickupTimeIso: '2026-07-02T02:00:00.000Z',
        pricingMode: 'fixed',
        priceCents: 76000,
        paymentMethod: 'cod',
      }),
    ).toMatchObject({
      weightText: '2.5 吨',
      pricingMode: 'fixed',
      priceCents: 76000,
      pickupPhone: '13900139001',
    });
  });

  it('rejects a fixed price order without price cents', () => {
    expect(() =>
      parseCreateShipperOrderRequest({
        cargoType: 'build',
        weightText: '2.5 吨',
        quantityText: '12 箱',
        pickupAddress: '宝安区福永物流园',
        pickupContact: '赵经理',
        pickupPhone: '13900139001',
        deliveryAddress: '南山区科技园',
        deliveryContact: '钱店长',
        deliveryPhone: '13900139002',
        vehicleRequirement: 'medium',
        pickupTimeIso: '2026-07-02T02:00:00.000Z',
        pricingMode: 'fixed',
        paymentMethod: 'cod',
      }),
    ).toThrow('一口价订单必须传入价格');
  });

  it('parses list query defaults', () => {
    expect(parseListShipperOrdersQuery({})).toEqual({
      page: 1,
      pageSize: 20,
      status: undefined,
    });
  });
});
```

Run:

```powershell
npm --prefix apps/api test -- orders.validation.spec.ts
```

Expected: FAIL with missing `orders.validation`.

- [ ] **Step 2: Implement DTO and validation**

Create `apps/api/src/orders/dto.ts`:

```ts
export type ShipperOrderStatus =
  | 'waiting'
  | 'loading'
  | 'transporting'
  | 'confirming'
  | 'completed'
  | 'cancelled';

export type ShipperOrderPricingMode = 'fixed' | 'negotiable';
export type ShipperOrderPaymentMethod = 'cod' | 'online';

export type CreateShipperOrderRequest = {
  cargoType: string;
  weightText: string;
  volumeText?: string;
  quantityText: string;
  cargoDescription?: string;
  cargoPhotoCount?: number;
  pickupAddress: string;
  pickupNoteText?: string;
  pickupContact: string;
  pickupPhone: string;
  deliveryAddress: string;
  deliveryNoteText?: string;
  deliveryContact: string;
  deliveryPhone: string;
  vehicleRequirement: string;
  vehicleLengthText?: string;
  needTailboard: boolean;
  needTarp: boolean;
  pickupTimeIso: string;
  expectedDeliveryTimeText?: string;
  valueAddedServicesText?: string;
  pricingMode: ShipperOrderPricingMode;
  priceCents?: number;
  paymentMethod: ShipperOrderPaymentMethod;
  couponId?: string;
  couponTitle?: string;
  couponDiscountCents?: number;
  payablePriceCents?: number;
};

export type ListShipperOrdersQuery = {
  status?: ShipperOrderStatus;
  page: number;
  pageSize: number;
};

export type ShipperOrderRecord = CreateShipperOrderRequest & {
  id: string;
  orderNo: string;
  shipperId: string;
  status: ShipperOrderStatus;
  createdAtIso: string;
  updatedAtIso: string;
  events: Array<{
    id: string;
    eventType: string;
    noteText?: string;
    createdAtIso: string;
  }>;
};

export type ListShipperOrdersResult = {
  items: ShipperOrderRecord[];
  page: number;
  pageSize: number;
  total: number;
};
```

Create `apps/api/src/orders/orders.validation.ts`:

```ts
import { z } from 'zod';
import type {
  CreateShipperOrderRequest,
  ListShipperOrdersQuery,
} from './dto';

const phoneSchema = z.string().trim().regex(/^1[3-9]\d{9}$/, '手机号不合法');

export const createShipperOrderSchema = z
  .object({
    cargoType: z.string().trim().min(1, '货物类型不能为空'),
    weightText: z.string().trim().min(1, '货物重量不能为空'),
    volumeText: z.string().trim().optional(),
    quantityText: z.string().trim().min(1, '货物数量不能为空'),
    cargoDescription: z.string().trim().max(200).optional(),
    cargoPhotoCount: z.number().int().min(0).max(6).optional(),
    pickupAddress: z.string().trim().min(1, '装货地址不能为空'),
    pickupNoteText: z.string().trim().max(50).optional(),
    pickupContact: z.string().trim().min(1, '装货联系人不能为空'),
    pickupPhone: phoneSchema,
    deliveryAddress: z.string().trim().min(1, '卸货地址不能为空'),
    deliveryNoteText: z.string().trim().max(50).optional(),
    deliveryContact: z.string().trim().min(1, '卸货联系人不能为空'),
    deliveryPhone: phoneSchema,
    vehicleRequirement: z.string().trim().min(1, '车型要求不能为空'),
    vehicleLengthText: z.string().trim().optional(),
    needTailboard: z.boolean(),
    needTarp: z.boolean(),
    pickupTimeIso: z.string().datetime('装货时间不合法'),
    expectedDeliveryTimeText: z.string().trim().optional(),
    valueAddedServicesText: z.string().trim().optional(),
    pricingMode: z.enum(['fixed', 'negotiable']),
    priceCents: z.number().int().positive().optional(),
    paymentMethod: z.enum(['cod', 'online']),
    couponId: z.string().trim().optional(),
    couponTitle: z.string().trim().optional(),
    couponDiscountCents: z.number().int().nonnegative().optional(),
    payablePriceCents: z.number().int().nonnegative().optional(),
  })
  .superRefine((value, context) => {
    if (value.pickupAddress === value.deliveryAddress) {
      context.addIssue({
        code: 'custom',
        message: '装货地址和卸货地址不能相同',
        path: ['deliveryAddress'],
      });
    }

    if (value.pricingMode === 'fixed' && !value.priceCents) {
      context.addIssue({
        code: 'custom',
        message: '一口价订单必须传入价格',
        path: ['priceCents'],
      });
    }
  });

export const listShipperOrdersQuerySchema = z.object({
  status: z
    .enum(['waiting', 'loading', 'transporting', 'confirming', 'completed', 'cancelled'])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export function parseCreateShipperOrderRequest(
  input: unknown,
): CreateShipperOrderRequest {
  return createShipperOrderSchema.parse(input);
}

export function parseListShipperOrdersQuery(
  input: unknown,
): ListShipperOrdersQuery {
  return listShipperOrdersQuerySchema.parse(input);
}
```

- [ ] **Step 3: Write failing service tests**

Create `apps/api/src/orders/orders.service.spec.ts`:

```ts
import { ApiErrorCode, BusinessError } from '../common/errors';
import { InMemoryOrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const now = new Date('2026-07-01T08:00:00.000Z');

  function createService() {
    const repository = new InMemoryOrdersRepository(() => now);
    return {
      repository,
      service: new OrdersService(repository, () => now),
    };
  }

  it('creates a waiting shipper order and records an event', async () => {
    const { service } = createService();

    const order = await service.createOrder('shipper-1', {
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupAddress: '宝安区福永物流园',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryAddress: '南山区科技园',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      needTailboard: true,
      needTarp: false,
      pickupTimeIso: '2026-07-02T02:00:00.000Z',
      pricingMode: 'fixed',
      priceCents: 76000,
      paymentMethod: 'cod',
    });

    expect(order).toMatchObject({
      orderNo: 'HY202607010001',
      shipperId: 'shipper-1',
      status: 'waiting',
      events: [
        expect.objectContaining({
          eventType: 'created',
          noteText: '货主发布订单',
        }),
      ],
    });
  });

  it('lists only current shipper orders', async () => {
    const { service } = createService();

    await service.createOrder('shipper-1', createInput('宝安区福永物流园'));
    await service.createOrder('shipper-2', createInput('龙华区民治仓'));

    await expect(
      service.listOrders('shipper-1', { page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ shipperId: 'shipper-1' })],
    });
  });

  it('rejects access to another shipper order detail', async () => {
    const { service } = createService();

    const order = await service.createOrder('shipper-1', createInput('宝安区福永物流园'));

    await expect(service.getOrder('shipper-2', order.id)).rejects.toEqual(
      new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在'),
    );
  });
});

function createInput(pickupAddress: string) {
  return {
    cargoType: 'build',
    weightText: '2.5 吨',
    quantityText: '12 箱',
    pickupAddress,
    pickupContact: '赵经理',
    pickupPhone: '13900139001',
    deliveryAddress: '南山区科技园',
    deliveryContact: '钱店长',
    deliveryPhone: '13900139002',
    vehicleRequirement: 'medium',
    needTailboard: false,
    needTarp: false,
    pickupTimeIso: '2026-07-02T02:00:00.000Z',
    pricingMode: 'fixed' as const,
    priceCents: 76000,
    paymentMethod: 'cod' as const,
  };
}
```

Run:

```powershell
npm --prefix apps/api test -- orders.service.spec.ts
```

Expected: FAIL with missing `orders.repository` and `orders.service`.

- [ ] **Step 4: Implement repository and service**

Create `apps/api/src/orders/orders.repository.ts` with an in-memory repository first:

```ts
import type {
  CreateShipperOrderRequest,
  ListShipperOrdersQuery,
  ShipperOrderRecord,
} from './dto';

export interface OrdersRepository {
  createOrder(shipperId: string, input: CreateShipperOrderRequest): Promise<ShipperOrderRecord>;
  listOrders(shipperId: string, query: ListShipperOrdersQuery): Promise<{ items: ShipperOrderRecord[]; total: number }>;
  findOrderById(orderId: string): Promise<ShipperOrderRecord | undefined>;
}

export class InMemoryOrdersRepository implements OrdersRepository {
  private readonly orders: ShipperOrderRecord[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  async createOrder(
    shipperId: string,
    input: CreateShipperOrderRequest,
  ): Promise<ShipperOrderRecord> {
    const nowIso = this.now().toISOString();
    const order: ShipperOrderRecord = {
      ...input,
      id: `order-${this.orders.length + 1}`,
      orderNo: `HY${formatOrderDate(this.now())}${String(this.orders.length + 1).padStart(4, '0')}`,
      shipperId,
      status: 'waiting',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      events: [
        {
          id: `event-${this.orders.length + 1}`,
          eventType: 'created',
          noteText: '货主发布订单',
          createdAtIso: nowIso,
        },
      ],
    };

    this.orders.push(order);

    return order;
  }

  async listOrders(shipperId: string, query: ListShipperOrdersQuery) {
    const matched = this.orders.filter(order => {
      return order.shipperId === shipperId && (!query.status || order.status === query.status);
    });
    const start = (query.page - 1) * query.pageSize;

    return {
      items: matched.slice(start, start + query.pageSize),
      total: matched.length,
    };
  }

  async findOrderById(orderId: string) {
    return this.orders.find(order => order.id === orderId);
  }
}

function formatOrderDate(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}
```

Create `apps/api/src/orders/orders.service.ts`:

```ts
import { ApiErrorCode, BusinessError } from '../common/errors';
import type {
  CreateShipperOrderRequest,
  ListShipperOrdersQuery,
  ListShipperOrdersResult,
} from './dto';
import type { OrdersRepository } from './orders.repository';

export class OrdersService {
  constructor(
    private readonly repository: OrdersRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createOrder(shipperId: string, input: CreateShipperOrderRequest) {
    return this.repository.createOrder(shipperId, input);
  }

  async listOrders(
    shipperId: string,
    query: ListShipperOrdersQuery,
  ): Promise<ListShipperOrdersResult> {
    const result = await this.repository.listOrders(shipperId, query);

    return {
      items: result.items,
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async getOrder(shipperId: string, orderId: string) {
    const order = await this.repository.findOrderById(orderId);

    if (!order || order.shipperId !== shipperId) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    return order;
  }
}
```

Add to `apps/api/src/common/errors.ts`:

```ts
ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
ORDER_STATE_INVALID: 'ORDER_STATE_INVALID',
```

- [ ] **Step 5: Verify service and validation**

Run:

```powershell
npm --prefix apps/api test -- orders.validation.spec.ts orders.service.spec.ts
npm --prefix apps/api run typecheck
```

Expected: both PASS.

- [ ] **Step 6: Commit service slice**

```powershell
git add apps/api/src/orders apps/api/src/common/errors.ts
git commit -m "feat(api): add shipper order service"
```

---

## Task 3: Add Orders Controller and Module

**Files:**
- Create: `apps/api/src/orders/orders.controller.ts`
- Create: `apps/api/src/orders/orders.controller.spec.ts`
- Create: `apps/api/src/orders/orders.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing controller tests**

Create `apps/api/src/orders/orders.controller.spec.ts`:

```ts
import { OrdersController } from './orders.controller';
import type { OrdersService } from './orders.service';

describe('OrdersController', () => {
  it('creates an order for the authenticated shipper', async () => {
    const service = {
      createOrder: jest.fn().mockResolvedValue({ id: 'order-1' }),
    } as unknown as OrdersService;
    const controller = new OrdersController(service);

    await expect(
      controller.createOrder(
        createRequest('shipper-1'),
        createBody(),
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'order-1' },
    });
    expect(service.createOrder).toHaveBeenCalledWith('shipper-1', createBody());
  });

  it('lists orders for the authenticated shipper', async () => {
    const service = {
      listOrders: jest.fn().mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    } as unknown as OrdersService;
    const controller = new OrdersController(service);

    await expect(
      controller.listOrders(createRequest('shipper-1'), {}),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { items: [], total: 0 },
    });
  });
});

function createRequest(userId: string) {
  return {
    headers: { 'x-request-id': 'req_order_test' },
    currentUser: { id: userId, phone: '13900139001', userType: 'shipper' },
  };
}

function createBody() {
  return {
    cargoType: 'build',
    weightText: '2.5 吨',
    quantityText: '12 箱',
    pickupAddress: '宝安区福永物流园',
    pickupContact: '赵经理',
    pickupPhone: '13900139001',
    deliveryAddress: '南山区科技园',
    deliveryContact: '钱店长',
    deliveryPhone: '13900139002',
    vehicleRequirement: 'medium',
    needTailboard: false,
    needTarp: false,
    pickupTimeIso: '2026-07-02T02:00:00.000Z',
    pricingMode: 'fixed',
    priceCents: 76000,
    paymentMethod: 'cod',
  };
}
```

Run:

```powershell
npm --prefix apps/api test -- orders.controller.spec.ts
```

Expected: FAIL with missing `orders.controller`.

- [ ] **Step 2: Implement controller**

Create `apps/api/src/orders/orders.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ok } from '../common/api-response';
import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { CreateShipperOrderRequest } from './dto';
import { OrdersService } from './orders.service';
import {
  createShipperOrderSchema,
  listShipperOrdersQuerySchema,
  parseCreateShipperOrderRequest,
  parseListShipperOrdersQuery,
} from './orders.validation';

@Controller('shipper/orders')
@UseGuards(AccessTokenGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async createOrder(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createShipperOrderSchema))
    body: CreateShipperOrderRequest,
  ) {
    return ok(
      await this.ordersService.createOrder(
        request.currentUser!.id,
        parseCreateShipperOrderRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Get()
  async listOrders(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(listShipperOrdersQuerySchema)) query: unknown,
  ) {
    return ok(
      await this.ordersService.listOrders(
        request.currentUser!.id,
        parseListShipperOrdersQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Get(':orderId')
  async getOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return ok(
      await this.ordersService.getOrder(request.currentUser!.id, orderId),
      getRequestId(request),
    );
  }
}

function getRequestId(request?: AuthenticatedRequest) {
  const requestIdHeader = request?.headers?.['x-request-id'];
  return Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
}
```

- [ ] **Step 3: Implement module and app wiring**

Create `apps/api/src/orders/orders.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersController } from './orders.controller';
import { InMemoryOrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [PrismaModule],
  controllers: [OrdersController],
  providers: [
    {
      provide: InMemoryOrdersRepository,
      useFactory: () => new InMemoryOrdersRepository(),
    },
    {
      provide: OrdersService,
      useFactory: (repository: InMemoryOrdersRepository) =>
        new OrdersService(repository),
      inject: [InMemoryOrdersRepository],
    },
    PrismaService,
  ],
})
export class OrdersModule {}
```

Modify `apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [AuthModule, OrdersModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 4: Verify API wiring**

Run:

```powershell
npm --prefix apps/api test -- orders.controller.spec.ts
npm --prefix apps/api test
npm --prefix apps/api run typecheck
```

Expected: all PASS.

- [ ] **Step 5: Commit controller slice**

```powershell
git add apps/api/src/orders apps/api/src/app.module.ts
git commit -m "feat(api): expose shipper order endpoints"
```

---

## Task 4: Add Mobile Order Adapter and Mapper

**Files:**
- Create: `src/services/platformOrderApi.ts`
- Create: `src/services/platformOrderMapper.ts`
- Create: `__tests__/platformOrderApi.test.ts`
- Create: `__tests__/platformOrderMapper.test.ts`

- [ ] **Step 1: Write failing adapter test**

Create `__tests__/platformOrderApi.test.ts`:

```ts
import { createPlatformOrderApi } from '../src/services/platformOrderApi';

describe('platform order api', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates a shipper order with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: { id: 'order-1', orderNo: 'HY202607010001' },
        requestId: 'req_order',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.createOrder(createInput())).resolves.toMatchObject({
      id: 'order-1',
      orderNo: 'HY202607010001',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });
});

function createInput() {
  return {
    cargoType: 'build',
    weightText: '2.5 吨',
    quantityText: '12 箱',
    pickupAddress: '宝安区福永物流园',
    pickupContact: '赵经理',
    pickupPhone: '13900139001',
    deliveryAddress: '南山区科技园',
    deliveryContact: '钱店长',
    deliveryPhone: '13900139002',
    vehicleRequirement: 'medium',
    needTailboard: false,
    needTarp: false,
    pickupTimeIso: '2026-07-02T02:00:00.000Z',
    pricingMode: 'fixed',
    priceCents: 76000,
    paymentMethod: 'cod',
  };
}
```

Run:

```powershell
npm test -- --runInBand __tests__/platformOrderApi.test.ts
```

Expected: FAIL with missing `platformOrderApi`.

- [ ] **Step 2: Implement adapter**

Create `src/services/platformOrderApi.ts`:

```ts
import {
  platformGet,
  platformPost,
  type PlatformApiConfig,
} from './platformApiClient';

export type PlatformShipperOrderStatus =
  | 'waiting'
  | 'loading'
  | 'transporting'
  | 'confirming'
  | 'completed'
  | 'cancelled';

export type PlatformCreateShipperOrderRequest = {
  cargoType: string;
  weightText: string;
  volumeText?: string;
  quantityText: string;
  cargoDescription?: string;
  cargoPhotoCount?: number;
  pickupAddress: string;
  pickupNoteText?: string;
  pickupContact: string;
  pickupPhone: string;
  deliveryAddress: string;
  deliveryNoteText?: string;
  deliveryContact: string;
  deliveryPhone: string;
  vehicleRequirement: string;
  vehicleLengthText?: string;
  needTailboard: boolean;
  needTarp: boolean;
  pickupTimeIso: string;
  expectedDeliveryTimeText?: string;
  valueAddedServicesText?: string;
  pricingMode: 'fixed' | 'negotiable';
  priceCents?: number;
  paymentMethod: 'cod' | 'online';
  couponId?: string;
  couponTitle?: string;
  couponDiscountCents?: number;
  payablePriceCents?: number;
};

export type PlatformShipperOrder = PlatformCreateShipperOrderRequest & {
  id: string;
  orderNo: string;
  shipperId: string;
  status: PlatformShipperOrderStatus;
  createdAtIso: string;
  updatedAtIso: string;
};

export type PlatformOrderListResult = {
  items: PlatformShipperOrder[];
  page: number;
  pageSize: number;
  total: number;
};

export function createPlatformOrderApi(config: PlatformApiConfig) {
  return {
    createOrder(request: PlatformCreateShipperOrderRequest) {
      return platformPost<
        PlatformCreateShipperOrderRequest,
        PlatformShipperOrder
      >(config, '/shipper/orders', request);
    },
    listOrders() {
      return platformGet<PlatformOrderListResult>(config, '/shipper/orders');
    },
    getOrder(orderId: string) {
      return platformGet<PlatformShipperOrder>(
        config,
        `/shipper/orders/${orderId}`,
      );
    },
  };
}
```

- [ ] **Step 3: Write failing mapper test**

Create `__tests__/platformOrderMapper.test.ts`:

```ts
import { mapPlatformOrderToRecentOrder } from '../src/services/platformOrderMapper';

describe('platform order mapper', () => {
  it('maps a platform order to current RecentOrder model', () => {
    expect(
      mapPlatformOrderToRecentOrder({
        id: 'order-1',
        orderNo: 'HY202607010001',
        shipperId: 'shipper-1',
        status: 'waiting',
        cargoType: 'build',
        weightText: '2.5 吨',
        quantityText: '12 箱',
        pickupAddress: '宝安区福永物流园',
        pickupContact: '赵经理',
        pickupPhone: '13900139001',
        deliveryAddress: '南山区科技园',
        deliveryContact: '钱店长',
        deliveryPhone: '13900139002',
        vehicleRequirement: 'medium',
        needTailboard: true,
        needTarp: false,
        pickupTimeIso: '2026-07-02T02:00:00.000Z',
        pricingMode: 'fixed',
        priceCents: 76000,
        paymentMethod: 'cod',
        createdAtIso: '2026-07-01T08:00:00.000Z',
        updatedAtIso: '2026-07-01T08:00:00.000Z',
      }),
    ).toMatchObject({
      id: 'HY202607010001',
      status: 'waiting',
      from: '宝安区福永物流园',
      to: '南山区科技园',
      priceText: '￥760',
      syncState: { status: 'synced' },
    });
  });
});
```

Run:

```powershell
npm test -- --runInBand __tests__/platformOrderMapper.test.ts
```

Expected: FAIL with missing `platformOrderMapper`.

- [ ] **Step 4: Implement mapper**

Create `src/services/platformOrderMapper.ts`:

```ts
import type { RecentOrder } from '../types';
import type { PlatformShipperOrder } from './platformOrderApi';

export function mapPlatformOrderToRecentOrder(
  order: PlatformShipperOrder,
): RecentOrder {
  return {
    id: order.orderNo,
    status: order.status,
    from: order.pickupAddress,
    to: order.deliveryAddress,
    cargoType: order.cargoType,
    weightText: order.weightText,
    volumeText: order.volumeText,
    quantityText: order.quantityText,
    cargoDescription: order.cargoDescription,
    cargoPhotoCount: order.cargoPhotoCount,
    vehicleRequirement: order.vehicleRequirement,
    vehicleLengthText: order.vehicleLengthText,
    vehicleExtraRequirementsText: [
      order.needTailboard ? '需要尾板' : '',
      order.needTarp ? '需要篷布' : '',
    ].filter(Boolean).join('、'),
    priceText:
      order.pricingMode === 'fixed' && order.priceCents
        ? formatCents(order.priceCents)
        : '司机报价',
    paymentMethodText: order.paymentMethod === 'online' ? '在线支付' : '货到付款',
    createdAtIso: order.createdAtIso,
    updatedAtIso: order.updatedAtIso,
    updatedAtText: '平台已同步',
    pickupContact: order.pickupContact,
    pickupPhone: order.pickupPhone,
    pickupNoteText: order.pickupNoteText,
    deliveryContact: order.deliveryContact,
    deliveryPhone: order.deliveryPhone,
    deliveryNoteText: order.deliveryNoteText,
    pickupTimeIso: order.pickupTimeIso,
    expectedDeliveryTimeText: order.expectedDeliveryTimeText,
    valueAddedServicesText: order.valueAddedServicesText,
    syncState: {
      status: 'synced',
      message: '订单已从平台 API 同步。',
      updatedAtText: '刚刚',
      queueItems: [],
    },
  };
}

function formatCents(cents: number) {
  const yuan = cents / 100;
  return `￥${Number.isInteger(yuan) ? yuan : yuan.toFixed(2)}`;
}
```

- [ ] **Step 5: Verify mobile adapter and mapper**

Run:

```powershell
npm test -- --runInBand __tests__/platformOrderApi.test.ts __tests__/platformOrderMapper.test.ts
npx tsc --noEmit
```

Expected: both PASS.

- [ ] **Step 6: Commit mobile adapter slice**

```powershell
git add src/services/platformOrderApi.ts src/services/platformOrderMapper.ts __tests__/platformOrderApi.test.ts __tests__/platformOrderMapper.test.ts
git commit -m "feat(mobile): add shipper order api adapter"
```

---

## Task 5: Wire Order API Into Mobile Flow With Local Fallback

**Files:**
- Modify: `App.tsx`
- Modify: `src/screens/OrderDraftScreen.tsx`
- Modify: `src/screens/OrdersScreen.tsx`
- Modify: `src/screens/OrderDetailScreen.tsx`
- Test: `__tests__/App.test.tsx`

- [ ] **Step 1: Write failing App integration tests**

Add tests to `__tests__/App.test.tsx` that prove:

```ts
it('uses platform order api when publishing an order and keeps local fallback on network failure', async () => {
  // Render App with platformApiBaseUrl.
  // Mock auth session with accessToken.
  // Mock /shipper/orders success and assert a synced platform order appears.
  // Then mock NETWORK_ERROR and assert the local pending sync state remains visible.
});
```

Run:

```powershell
npm test -- --runInBand __tests__/App.test.tsx
```

Expected: FAIL because `App` does not create or pass a platform order adapter yet.

- [ ] **Step 2: Add platform order adapter construction**

In `App.tsx`, next to `platformAuthApi`, construct:

```ts
const platformOrderApi = useMemo(
  () =>
    resolvedPlatformApiBaseUrl
      ? createPlatformOrderApi({
          baseUrl: resolvedPlatformApiBaseUrl,
          getAccessToken: () => getAuthSessionSnapshot()?.accessToken,
        })
      : undefined,
  [resolvedPlatformApiBaseUrl],
);
```

- [ ] **Step 3: Publish through API first, fallback local on failure**

In the order publish handler, convert `DraftOrderInput` to `PlatformCreateShipperOrderRequest`, call `platformOrderApi.createOrder()`, map with `mapPlatformOrderToRecentOrder()`, and only use `createLocalOrder()` when adapter is absent or throws `PlatformApiError`.

The failure notice must include:

```ts
'平台订单接口不可用，已保留本地待同步订单。'
```

- [ ] **Step 4: Add list/detail refresh without blocking local MVP**

When entering `OrdersScreen`, call `platformOrderApi.listOrders()` if available and replace local orders with mapped platform orders only on success. If the request fails, keep existing local orders and show the current local sync notice.

When opening detail for a platform order, prefer existing local mapped record first; do not block navigation on network detail fetch in this slice.

- [ ] **Step 5: Verify mobile integration**

Run:

```powershell
npm test -- --runInBand __tests__/App.test.tsx __tests__/platformOrderApi.test.ts __tests__/platformOrderMapper.test.ts
npx tsc --noEmit
npm run lint
```

Expected: all PASS.

- [ ] **Step 6: Commit mobile integration**

```powershell
git add App.tsx src/screens/OrderDraftScreen.tsx src/screens/OrdersScreen.tsx src/screens/OrderDetailScreen.tsx __tests__/App.test.tsx
git commit -m "feat(mobile): use platform order api with local fallback"
```

---

## Task 6: Update OpenAPI and Status Docs

**Files:**
- Modify: `docs/platform/openapi-stage-1.yaml`
- Modify: `docs/platform/mobile-migration-stage-1.md`
- Modify: `docs/03-项目当前状态与补全路线.md`
- Test: `apps/api/src/config/openapi-stage-1.spec.ts`

- [ ] **Step 1: Write failing OpenAPI coverage test**

Add to `apps/api/src/config/openapi-stage-1.spec.ts`:

```ts
it('documents shipper order endpoints', () => {
  const openapi = readOpenApiStageOne();

  expect(openapi).toContain('/shipper/orders:');
  expect(openapi).toContain('CreateShipperOrderRequest');
  expect(openapi).toContain('ShipperOrder');
});
```

Run:

```powershell
npm --prefix apps/api test -- openapi-stage-1.spec.ts
```

Expected: FAIL until OpenAPI is updated.

- [ ] **Step 2: Update OpenAPI**

Add `POST /shipper/orders`, `GET /shipper/orders`, and `GET /shipper/orders/{orderId}` with bearer auth, `CreateShipperOrderRequest`, `ShipperOrder`, and `ShipperOrderListResponse` schemas. Use integer cents for money fields and ISO strings for time fields.

- [ ] **Step 3: Update status docs**

In `docs/03-项目当前状态与补全路线.md`, add a new note under the current status section:

```markdown
本轮补齐阶段 2 第一片订单真实化边界：后端新增货主订单 schema、订单创建/列表/详情 API、订单事件记录和移动端平台订单 adapter；移动端在平台订单 API 可用时优先走真实接口，失败时继续保留本地待同步订单。真实 PostgreSQL 连接、支付、地图、司机报价/接单和后台审核仍未完成。
```

- [ ] **Step 4: Final verification**

Run:

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

Expected: all PASS.

Run only when Docker/PostgreSQL is available:

```powershell
npm --prefix apps/api run db:postgres:doctor
npm --prefix apps/api run db:postgres:deploy
npm --prefix apps/api run db:postgres:seed
npm --prefix apps/api run db:postgres:auth-smoke
```

Expected with current machine before Docker/PostgreSQL is installed: `db:postgres:doctor` fails with Docker missing and `P1001`; record this as environment not ready, not as a code failure.

- [ ] **Step 5: Commit documentation slice**

```powershell
git add docs/platform/openapi-stage-1.yaml docs/platform/mobile-migration-stage-1.md docs/03-项目当前状态与补全路线.md apps/api/src/config/openapi-stage-1.spec.ts
git commit -m "docs: document shipper order api slice"
```

---

## Self-Review

- Spec coverage: This plan covers stage 2 first-slice order creation, order list, order detail, order events, mobile API adapter, local fallback, OpenAPI and status docs. It intentionally excludes driver-side execution, map, payment, upload, push, IM and admin work.
- Placeholder scan: No `TBD`, `TODO`, `implement later`, or vague "add appropriate handling" instructions are used.
- Type consistency: `CreateShipperOrderRequest`, `ShipperOrderRecord`, `PlatformCreateShipperOrderRequest` and `PlatformShipperOrder` consistently use cents for money and ISO strings for timestamps.
- Verification gap: Real PostgreSQL migration deploy and smoke tests remain blocked until Docker Desktop or a reachable PostgreSQL is available.
