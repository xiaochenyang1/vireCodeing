# Order Exception Customer Service First Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create one auditable customer-service case for every shipper or driver order exception, expose progress to the related mobile users, and let administrators process cases through a guarded static console.

**Architecture:** Keep exception creation atomic inside `OrdersRepository`, where the original `OrderEvent` is already written. Add a focused `order-exception-cases` domain layer for validation, reads and administrator state transitions, backed by the same in-memory/Prisma repository contract. Mobile clients fetch case progress independently from the main order detail so a progress failure never removes the order page.

**Tech Stack:** React Native, TypeScript, NestJS, Prisma/PostgreSQL, Zod, Jest, static admin HTML, OpenAPI 3.0.

---

## File Structure

- Create `apps/api/prisma/migrations/20260712000000_order_exception_cases/migration.sql` — enums, exception case tables, constraints and indexes.
- Modify `apps/api/prisma/schema.prisma` — Prisma models and relations.
- Create `apps/api/src/order-exception-cases/dto.ts` — API/domain snapshots and query/request types.
- Create `apps/api/src/order-exception-cases/order-exception-cases.validation.ts` — Zod schemas and parsing helpers.
- Create `apps/api/src/order-exception-cases/order-exception-cases.validation.spec.ts` — query and transition validation tests.
- Create `apps/api/src/order-exception-cases/order-exception-cases.service.ts` — permission checks and state-machine orchestration.
- Create `apps/api/src/order-exception-cases/order-exception-cases.service.spec.ts` — user/admin behavior tests.
- Create `apps/api/src/order-exception-cases/order-exception-cases.controller.ts` — shipper, driver and admin routes.
- Create `apps/api/src/order-exception-cases/order-exception-cases.controller.spec.ts` — guard/route/response tests.
- Create `apps/api/src/order-exception-cases/order-exception-cases.module.ts` — Nest wiring.
- Modify `apps/api/src/orders/orders.repository.ts` — atomic event/case creation plus case repository methods.
- Create `apps/api/src/orders/orders.repository.spec.ts` — atomic in-memory and Prisma repository case tests.
- Modify `apps/api/src/orders/dto.ts` — latest exception-case summary returned after reporting.
- Modify `apps/api/src/orders/orders.service.spec.ts` — shipper case creation expectations.
- Modify `apps/api/src/driver-orders/driver-orders.service.spec.ts` — driver case creation expectations.
- Modify `apps/api/src/app.module.ts` — import the new module.
- Modify `apps/api/src/common/errors.ts` and `apps/api/src/common/business-error.filter.ts` — case error codes and HTTP 409 mapping.
- Modify `apps/api/src/config/prisma-migration.spec.ts` — migration structure contract.
- Create `apps/api/src/admin-console/order-exception-case-admin-console.ts` — static console HTML.
- Modify `apps/api/src/admin-console/admin-console.controller.ts` and `.spec.ts` — serve and test the console.
- Modify `apps/api/src/config/openapi-stage-1.spec.ts` and `docs/platform/openapi-stage-1.yaml` — API contract.
- Modify `src/services/platformOrderApi.ts` and `__tests__/platformOrderApi.test.ts` — shipper case reads.
- Modify `src/services/platformDriverOrderApi.ts` and `__tests__/platformDriverOrderApi.test.ts` — driver case reads.
- Create `src/utils/orderExceptionCases.ts` and `__tests__/orderExceptionCasesUtils.test.ts` — status/timeline formatting.
- Create `src/screens/order-detail/ExceptionCaseProgressPanel.tsx` — shared progress UI.
- Modify `src/screens/OrderDetailScreen.tsx`, `src/screens/DriverHomeScreen.tsx`, `App.tsx`, `__tests__/App.test.tsx` and `__tests__/DriverHomeScreen.test.tsx` — mobile loading and rendering.
- Modify `docs/platform/README.md` and `docs/03-项目当前状态与补全路线.md` — verified completion boundary.

## Task 1: Lock the Database Contract

**Files:**

- Modify: `apps/api/src/config/prisma-migration.spec.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260712000000_order_exception_cases/migration.sql`

- [ ] **Step 1: Write the failing migration structure test**

Add assertions that locate the new migration and require these fragments:

```ts
expect(migration).toContain('CREATE TYPE "OrderExceptionCaseSourceRole"');
expect(migration).toContain('CREATE TYPE "OrderExceptionCaseStatus"');
expect(migration).toContain('CREATE TABLE "OrderExceptionCase"');
expect(migration).toContain('CREATE TABLE "OrderExceptionCaseAction"');
expect(migration).toContain('CREATE UNIQUE INDEX "OrderExceptionCase_sourceEventId_key"');
expect(migration).toContain('CREATE UNIQUE INDEX "OrderExceptionCase_caseNo_key"');
expect(migration).toContain('OrderExceptionCase_status_created_idx');
expect(migration).toContain('OrderExceptionCaseAction_case_created_idx');
```

- [ ] **Step 2: Run the migration test and verify RED**

Run:

```powershell
npm --prefix apps/api test -- prisma-migration
```

Expected: FAIL because the migration directory and schema models do not exist.

- [ ] **Step 3: Add Prisma enums, relations and models**

Add the two enums and the exact models approved in the design. Extend `User` with reported cases and admin actions, `Order` with `exceptionCases`, and `OrderEvent` with an optional one-to-one exception-case relation keyed by `sourceEventId`.

Use these relation fields:

```prisma
reportedExceptionCases OrderExceptionCase[]       @relation("ExceptionCaseReporter")
exceptionCaseActions   OrderExceptionCaseAction[] @relation("ExceptionCaseAdminActions")

exceptionCases OrderExceptionCase[]
exceptionCase  OrderExceptionCase?
```

- [ ] **Step 4: Create the SQL migration**

The migration must create enum values `shipper`, `driver` and statuses `pending`, `processing`, `resolved`, `closed`; create both tables; add foreign keys to `Order`, `OrderEvent` and `User`; and add the unique/index names asserted above.

- [ ] **Step 5: Verify GREEN and Prisma validity**

Run:

```powershell
npm --prefix apps/api test -- prisma-migration
npm --prefix apps/api run prisma:validate
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit the database contract**

```powershell
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260712000000_order_exception_cases/migration.sql apps/api/src/config/prisma-migration.spec.ts
git commit -m "feat(api): add order exception case schema"
```

## Task 2: Define Case DTOs, Validation and Error Codes

**Files:**

- Create: `apps/api/src/order-exception-cases/dto.ts`
- Create: `apps/api/src/order-exception-cases/order-exception-cases.validation.ts`
- Create: `apps/api/src/order-exception-cases/order-exception-cases.validation.spec.ts`
- Modify: `apps/api/src/common/errors.ts`
- Modify: `apps/api/src/common/business-error.filter.ts`
- Modify: `apps/api/src/common/business-error.filter.spec.ts`

- [ ] **Step 1: Write failing validation tests**

Cover valid defaults and invalid boundaries:

```ts
expect(parseOrderExceptionCaseListQuery({})).toEqual({
  page: 1,
  pageSize: 20,
});

expect(parseOrderExceptionCaseListQuery({
  status: 'processing',
  sourceRole: 'driver',
  keyword: ' HY2026 ',
})).toMatchObject({
  status: 'processing',
  sourceRole: 'driver',
  keyword: 'HY2026',
});

expect(() => parseOrderExceptionCaseListQuery({ pageSize: 51 })).toThrow();
expect(() => parseUpdateOrderExceptionCaseRequest({
  baseUpdatedAtIso: 'bad-date',
  content: '有效处理说明',
})).toThrow();
expect(() => parseUpdateOrderExceptionCaseRequest({
  baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
  content: '太短',
})).toThrow('处理说明至少 6 个字');
```

- [ ] **Step 2: Run validation tests and verify RED**

Run:

```powershell
npm --prefix apps/api test -- order-exception-cases.validation
```

Expected: FAIL because DTO and validation modules are missing.

- [ ] **Step 3: Implement exact DTOs**

Define:

```ts
export type OrderExceptionCaseStatus =
  | 'pending'
  | 'processing'
  | 'resolved'
  | 'closed';

export type OrderExceptionCaseSourceRole = 'shipper' | 'driver';

export type OrderExceptionCaseActionRecord = {
  id: string;
  adminUserId: string;
  fromStatus: OrderExceptionCaseStatus;
  toStatus: OrderExceptionCaseStatus;
  content: string;
  createdAtIso: string;
};

export type OrderExceptionCaseRecord = {
  id: string;
  caseNo: string;
  orderId: string;
  orderNo: string;
  sourceEventId: string;
  reporterUserId: string;
  sourceRole: OrderExceptionCaseSourceRole;
  typeLabel: string;
  description: string;
  attachmentFileIds: string[];
  status: OrderExceptionCaseStatus;
  resolutionText?: string;
  resolvedAtIso?: string;
  closedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
  actions: OrderExceptionCaseActionRecord[];
};
```

Also define list query/result and `{ baseUpdatedAtIso; content }` mutation request types.

- [ ] **Step 4: Implement Zod parsing**

Use page 1, pageSize 20 defaults, maximum pageSize 50, trimmed keyword maximum 80, valid ISO timestamps, and 6–500 character trimmed mutation content.

- [ ] **Step 5: Add business error codes and HTTP mapping**

Add:

```ts
EXCEPTION_CASE_NOT_FOUND: 'EXCEPTION_CASE_NOT_FOUND',
EXCEPTION_CASE_STATE_INVALID: 'EXCEPTION_CASE_STATE_INVALID',
EXCEPTION_CASE_CONFLICT: 'EXCEPTION_CASE_CONFLICT',
```

Map both state and conflict codes to HTTP 409. Keep not-found behavior on the filter's existing 404 path.

- [ ] **Step 6: Run focused tests and verify GREEN**

```powershell
npm --prefix apps/api test -- order-exception-cases.validation business-error.filter
```

Expected: both suites PASS.

- [ ] **Step 7: Commit validation and errors**

```powershell
git add apps/api/src/order-exception-cases apps/api/src/common/errors.ts apps/api/src/common/business-error.filter.ts apps/api/src/common/business-error.filter.spec.ts
git commit -m "feat(api): define exception case contracts"
```

## Task 3: Make Exception Reporting Create Cases Atomically

**Files:**

- Modify: `apps/api/src/orders/orders.repository.ts`
- Create: `apps/api/src/orders/orders.repository.spec.ts`
- Modify: `apps/api/src/orders/dto.ts`
- Modify: `apps/api/src/orders/orders.service.spec.ts`
- Modify: `apps/api/src/driver-orders/driver-orders.service.spec.ts`
- Create: `apps/api/src/order-exception-cases/order-exception-cases.service.ts`
- Create: `apps/api/src/order-exception-cases/order-exception-cases.service.spec.ts`

- [ ] **Step 1: Write failing shipper and driver creation tests**

After calling the existing report methods, assert repository case reads return one case:

```ts
expect(await repository.listOrderExceptionCases(order.id)).toMatchObject({
  items: [
    expect.objectContaining({
      orderId: order.id,
      sourceRole: 'shipper',
      typeLabel: '货物损坏',
      status: 'pending',
      attachmentFileIds: ['file-exception-1'],
    }),
  ],
  total: 1,
});
```

Repeat with `sourceRole: 'driver'` and the driver's actor ID. Add a repository failure test proving no event remains when case creation fails.

- [ ] **Step 2: Run creation tests and verify RED**

```powershell
npm --prefix apps/api test -- orders.service driver-orders.service order-exception-cases.service
```

Expected: FAIL because repository case methods and service do not exist.

- [ ] **Step 3: Extend the repository contract**

Add methods:

```ts
listOrderExceptionCases(
  orderId: string,
): Promise<{ items: OrderExceptionCaseRecord[]; total: number }>;
listAdminOrderExceptionCases(
  query: OrderExceptionCaseListQuery,
): Promise<{ items: OrderExceptionCaseRecord[]; total: number }>;
findOrderExceptionCaseById(
  caseId: string,
): Promise<OrderExceptionCaseRecord | undefined>;
transitionOrderExceptionCase(
  caseId: string,
  adminUserId: string,
  expectedStatus: OrderExceptionCaseStatus,
  nextStatus: OrderExceptionCaseStatus,
  input: UpdateOrderExceptionCaseRequest,
): Promise<OrderExceptionCaseRecord | 'conflict' | 'state-invalid' | undefined>;
```

Add this optional field to `ShipperOrderRecord` so the report response proves the case was created:

```ts
latestExceptionCase?: Pick<
  OrderExceptionCaseRecord,
  | 'id'
  | 'caseNo'
  | 'sourceEventId'
  | 'sourceRole'
  | 'status'
  | 'createdAtIso'
  | 'updatedAtIso'
>;
```

- [ ] **Step 4: Implement in-memory atomic creation**

Add a private case array. Build the event and case as local values first, then push both only after both are valid. Generate case numbers as `YCYYYYMMDDNNNN`. Store original structured type/description rather than reparsing `noteText`.

- [ ] **Step 5: Implement Prisma transactions and response summary**

Change both Prisma exception report methods to `this.prisma.$transaction(async transaction => ...)`. Create the `OrderEvent`, then create `OrderExceptionCase` using its ID as `sourceEventId`, then return the refreshed order. Extend `PrismaOrdersClient` with `$transaction` and exception-case delegates used by tests.

Extend the Prisma order include/mapping with the newest exception case using `take: 1` and `orderBy: { createdAt: 'desc' }`, then map it to `latestExceptionCase`. The in-memory report methods must attach the same summary.

- [ ] **Step 6: Implement read and transition repository methods**

Map Prisma dates to ISO strings, normalize JSON file IDs, order cases descending and actions ascending. For transitions, first load the case, compare status and `updatedAt.toISOString()` to `baseUpdatedAtIso`, then update the case and create its action in one transaction.

- [ ] **Step 7: Implement the service state machine**

`OrderExceptionCasesService` must:

- verify shipper ownership through `findOrderById`;
- verify driver relationship through `findDriverAcceptedOrder`;
- list/admin read cases;
- call transitions with exact pairs `pending→processing`, `processing→resolved`, `resolved→closed`;
- translate repository sentinels into `EXCEPTION_CASE_NOT_FOUND`, `EXCEPTION_CASE_STATE_INVALID` and `EXCEPTION_CASE_CONFLICT`.

- [ ] **Step 8: Verify GREEN**

```powershell
npm --prefix apps/api test -- orders.service driver-orders.service order-exception-cases.service
```

Expected: all focused suites PASS.

- [ ] **Step 9: Commit atomic repository and service**

```powershell
git add apps/api/src/orders/orders.repository.ts apps/api/src/orders/orders.repository.spec.ts apps/api/src/orders/dto.ts apps/api/src/orders/orders.service.spec.ts apps/api/src/driver-orders/driver-orders.service.spec.ts apps/api/src/order-exception-cases/order-exception-cases.service.ts apps/api/src/order-exception-cases/order-exception-cases.service.spec.ts
git commit -m "feat(api): create and process exception cases"
```

## Task 4: Expose Guarded User and Admin APIs

**Files:**

- Create: `apps/api/src/order-exception-cases/order-exception-cases.controller.ts`
- Create: `apps/api/src/order-exception-cases/order-exception-cases.controller.spec.ts`
- Create: `apps/api/src/order-exception-cases/order-exception-cases.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/app.module.spec.ts`

- [ ] **Step 1: Write failing controller tests**

Require these controller prefixes and methods:

```ts
@Controller('shipper/orders')
@Get(':orderId/exception-cases')

@Controller('driver/orders')
@Get(':orderId/exception-cases')

@Controller('admin/order-exception-cases')
@Get()
@Get(':caseId')
@Post(':caseId/process')
@Post(':caseId/resolve')
@Post(':caseId/close')
```

Assert guard order, parsed inputs, service arguments and the existing `successResponse` envelope.

- [ ] **Step 2: Run controller/module tests and verify RED**

```powershell
npm --prefix apps/api test -- order-exception-cases.controller app.module
```

Expected: FAIL because the module and controllers are missing.

- [ ] **Step 3: Implement controllers**

Use `AccessTokenGuard` plus `ShipperOnlyGuard`, `DriverOnlyGuard` or `AdminOnlyGuard`. Parse admin queries and mutation bodies with `ZodValidationPipe`; trim path IDs and reject empty IDs through validation helpers before service calls.

- [ ] **Step 4: Wire the module**

Instantiate `PrismaOrdersRepository`, inject it into `OrderExceptionCasesService`, register all three controllers and guards, then import the module in `AppModule`.

- [ ] **Step 5: Verify GREEN**

```powershell
npm --prefix apps/api test -- order-exception-cases.controller app.module
```

Expected: controller and app module suites PASS.

- [ ] **Step 6: Commit the API routes**

```powershell
git add apps/api/src/order-exception-cases/order-exception-cases.controller.ts apps/api/src/order-exception-cases/order-exception-cases.controller.spec.ts apps/api/src/order-exception-cases/order-exception-cases.module.ts apps/api/src/app.module.ts apps/api/src/app.module.spec.ts
git commit -m "feat(api): expose exception case workflows"
```

## Task 5: Add the Admin Processing Console

**Files:**

- Create: `apps/api/src/admin-console/order-exception-case-admin-console.ts`
- Modify: `apps/api/src/admin-console/admin-console.controller.ts`
- Modify: `apps/api/src/admin-console/admin-console.controller.spec.ts`

- [ ] **Step 1: Write the failing console contract test**

Require the returned HTML to contain:

```ts
expect(html).toContain('/admin/order-exception-cases');
expect(html).toContain('/process');
expect(html).toContain('/resolve');
expect(html).toContain('/close');
expect(html).toContain('EXCEPTION_CASE_CONFLICT');
expect(html).toContain('baseUpdatedAtIso');
expect(html).toContain('异常客服工单');
```

- [ ] **Step 2: Run the admin console test and verify RED**

```powershell
npm --prefix apps/api test -- admin-console.controller
```

Expected: FAIL because the route and HTML do not exist.

- [ ] **Step 3: Implement the static console**

Add token input, status/source-role/keyword filters, paging, case list, detail timeline and state-specific forms. Use `fetch` with bearer authorization. Disable mutation buttons while pending. On `EXCEPTION_CASE_CONFLICT`, display `工单已被其他管理员更新，正在刷新最新状态。` and reload detail.

- [ ] **Step 4: Serve the console**

Add:

```ts
@Get('order-exception-case-console')
getOrderExceptionCaseConsole() {
  return ORDER_EXCEPTION_CASE_ADMIN_CONSOLE_HTML;
}
```

- [ ] **Step 5: Verify GREEN**

```powershell
npm --prefix apps/api test -- admin-console.controller
```

Expected: PASS.

- [ ] **Step 6: Commit the console**

```powershell
git add apps/api/src/admin-console/order-exception-case-admin-console.ts apps/api/src/admin-console/admin-console.controller.ts apps/api/src/admin-console/admin-console.controller.spec.ts
git commit -m "feat(admin): process order exception cases"
```

## Task 6: Add Mobile Case Adapters and Shared Formatting

**Files:**

- Modify: `src/services/platformOrderApi.ts`
- Modify: `src/services/platformDriverOrderApi.ts`
- Modify: `__tests__/platformOrderApi.test.ts`
- Modify: `__tests__/platformDriverOrderApi.test.ts`
- Create: `src/utils/orderExceptionCases.ts`
- Create: `__tests__/orderExceptionCasesUtils.test.ts`

- [ ] **Step 1: Write failing adapter tests**

For shipper and driver APIs, assert:

```ts
await api.listExceptionCases(' order-1 ');
expect(fetch).toHaveBeenCalledWith(
  'http://localhost:3000/api/shipper/orders/order-1/exception-cases',
  expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
  }),
);
```

Use the driver path for the driver adapter. Add blank/non-string ID cases that reject before fetch with the adapter's existing order-ID error code.

- [ ] **Step 2: Write failing utility tests**

```ts
expect(getOrderExceptionCaseStatusText('pending')).toBe('待客服受理');
expect(getOrderExceptionCaseStatusText('closed')).toBe('已关闭');
expect(sortOrderExceptionCaseActions(actions).map(item => item.id)).toEqual([
  'action-old',
  'action-new',
]);
```

- [ ] **Step 3: Run mobile focused tests and verify RED**

```powershell
npx jest --runInBand --runTestsByPath __tests__/platformOrderApi.test.ts __tests__/platformDriverOrderApi.test.ts __tests__/orderExceptionCasesUtils.test.ts
```

Expected: FAIL because methods, types and utilities are missing.

- [ ] **Step 4: Implement shared mobile types and adapters**

Export `PlatformOrderExceptionCase`, action, status and list snapshot types from `platformOrderApi.ts`. Add `listExceptionCases(orderId)` to both APIs using the existing guarded GET helpers and order-ID normalization.

- [ ] **Step 5: Implement pure formatting utilities**

Map the four status labels, map source role to `货主上报` / `司机上报`, sort actions by ISO time ascending, and return immutable arrays.

- [ ] **Step 6: Verify GREEN**

Run the same focused Jest command. Expected: 3 suites PASS.

- [ ] **Step 7: Commit adapters and utilities**

```powershell
git add src/services/platformOrderApi.ts src/services/platformDriverOrderApi.ts src/utils/orderExceptionCases.ts __tests__/platformOrderApi.test.ts __tests__/platformDriverOrderApi.test.ts __tests__/orderExceptionCasesUtils.test.ts
git commit -m "feat(mobile): read order exception case progress"
```

## Task 7: Render Progress in Shipper and Driver Details

**Files:**

- Create: `src/screens/order-detail/ExceptionCaseProgressPanel.tsx`
- Modify: `src/screens/OrderDetailScreen.tsx`
- Modify: `src/screens/DriverHomeScreen.tsx`
- Modify: `App.tsx`
- Modify: `__tests__/App.test.tsx`
- Modify: `__tests__/DriverHomeScreen.test.tsx`

- [ ] **Step 1: Write failing shipper screen tests**

Configure the platform order mock to return a pending case, open a platform order detail, and require:

```ts
expect(platformOrderApi.listExceptionCases).toHaveBeenCalledWith('order-1');
expect(renderedText).toContain('异常处理进度');
expect(renderedText).toContain('YC202607120001');
expect(renderedText).toContain('待客服受理');
```

Add empty, missing-token and ordinary failure tests. Failure must preserve the order route text while showing the dedicated failure notice.

- [ ] **Step 2: Write failing driver screen tests**

Open an accepted driver order and require the same case panel. Add a missing-token test expecting `登录状态已失效，请重新登录后查看异常处理进度。`.

- [ ] **Step 3: Run focused screen tests and verify RED**

```powershell
npx jest --runInBand --runTestsByPath __tests__/App.test.tsx __tests__/DriverHomeScreen.test.tsx
```

Expected: FAIL because the progress panel and API orchestration are missing.

- [ ] **Step 4: Implement the shared panel**

Props:

```ts
type ExceptionCaseProgressPanelProps = {
  cases: PlatformOrderExceptionCase[];
  isLoading: boolean;
  notice?: string;
};
```

Render the title, loading message, notice, empty state, case number, source label, type, description, status, resolution and chronological actions. Add stable test IDs based on case number.

- [ ] **Step 5: Wire the shipper detail**

Pass `platformOrderApi` from `App.tsx` into `OrderDetailScreen`. On `platformOrderId` change, fetch cases independently. Catch `AUTH_ACCESS_TOKEN_MISSING` separately; other failures use `异常处理进度加载失败，请稍后重试。`. Do not modify `orders` or navigate away on failure.

- [ ] **Step 6: Wire the driver detail**

When `openOrderDetail` succeeds, also call `listExceptionCases(order.id)`. Reset stale cases when switching orders. Preserve the selected order if case loading fails and show the dedicated notice in the panel rather than replacing the screen-wide action notice.

- [ ] **Step 7: Verify GREEN**

Run the same focused screen command. Expected: both suites PASS.

- [ ] **Step 8: Commit mobile UI**

```powershell
git add src/screens/order-detail/ExceptionCaseProgressPanel.tsx src/screens/OrderDetailScreen.tsx src/screens/DriverHomeScreen.tsx App.tsx __tests__/App.test.tsx __tests__/DriverHomeScreen.test.tsx
git commit -m "feat(mobile): show exception case progress"
```

## Task 8: Complete OpenAPI, Status Documentation and Full Verification

**Files:**

- Modify: `apps/api/src/config/openapi-stage-1.spec.ts`
- Modify: `docs/platform/openapi-stage-1.yaml`
- Modify: `docs/platform/README.md`
- Modify: `docs/03-项目当前状态与补全路线.md`

- [ ] **Step 1: Write failing OpenAPI coverage assertions**

Require all five admin paths, both user read paths, case schemas, four statuses, three business error codes and `baseUpdatedAtIso`.

- [ ] **Step 2: Run OpenAPI coverage and verify RED**

```powershell
npm --prefix apps/api test -- openapi-stage-1
```

Expected: FAIL because the contract is not documented.

- [ ] **Step 3: Document the complete API**

Add security, parameters, query filters, request bodies, response envelopes, examples and 400/401/403/404/409 errors. State that all first-slice action content is visible to related users.

- [ ] **Step 4: Update status documentation**

Record case creation, admin workflow, mobile progress, concurrency behavior and commands actually run. Explicitly retain gaps for compensation, refunds, appeals, notifications and chat. Record PostgreSQL acceptance as blocked unless the environment becomes reachable during implementation.

- [ ] **Step 5: Run all mobile gates**

```powershell
npm test -- --runInBand
npx tsc --noEmit
npm run lint
```

Expected: 0 test failures, 0 TypeScript errors and 0 ESLint errors. The existing `InvoiceRecords.tsx:504 no-void` warning may remain if unchanged.

- [ ] **Step 6: Run all API gates**

```powershell
npm --prefix apps/api test
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run prisma:validate
npm run api:build
```

Expected: every command exits 0.

- [ ] **Step 7: Recheck real PostgreSQL availability**

```powershell
npm --prefix apps/api run db:postgres:doctor
```

If ready, run `db:postgres:bootstrap`. If not ready, preserve the exact Docker/Prisma evidence in the status doc without claiming real-database acceptance.

- [ ] **Step 8: Review the final diff**

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors or unrelated generated files.

- [ ] **Step 9: Commit contract and documentation**

```powershell
git add apps/api/src/config/openapi-stage-1.spec.ts docs/platform/openapi-stage-1.yaml docs/platform/README.md docs/03-项目当前状态与补全路线.md
git commit -m "docs: record exception customer service slice"
```

## Plan Self Review

- Spec coverage: Tasks 1–5 cover persistence, atomic creation, permissions, state transitions, optimistic concurrency and admin handling; Tasks 6–7 cover both mobile roles; Task 8 covers contracts, documentation and every verification gate.
- Placeholder scan: no `TBD`, `TODO`, “implement later” or unspecified error-handling instructions.
- Type consistency: all layers use `pending | processing | resolved | closed`, `shipper | driver`, `baseUpdatedAtIso` and public action `content`.
- Transaction consistency: original event and case creation remain in `OrdersRepository`; service-level reads and transitions use the same repository contract.
- Scope check: financial settlement, appeals, notifications and chat remain outside this slice and are not simulated with case notes.
