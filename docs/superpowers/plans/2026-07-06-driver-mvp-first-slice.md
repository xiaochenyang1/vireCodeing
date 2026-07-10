# Driver MVP First Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first real driver-side loop: a driver can see waiting shipper orders, submit a quote, accept an order, and the shipper detail can show returned driver quote data.

**Architecture:** Keep the current modular NestJS backend and React Native local-fallback model. Add a focused `driver-orders` backend module on top of the existing `Order` model and store first-slice driver actions as `OrderEvent` records, then expose a mobile `platformDriverOrderApi` adapter and a simple driver home screen. Do not add map, payment, upload, IM, or settlement in this slice.

**Tech Stack:** React Native 0.86, TypeScript, Jest, NestJS, Prisma, PostgreSQL, Zod.

---

## Scope Check

This slice intentionally covers only:

- Driver order hall list: waiting shipper orders.
- Driver quote: create an event containing quote amount, arrival text, and note.
- Driver accept: move the order from `waiting` to `loading` and record an accept event.
- Mobile driver mode: after driver login, show order hall, quote/accept actions, and local failure notices.
- Shipper detail mapper: keep backend order event payloads available so quote data can be displayed.

It does not cover driver certification, vehicles, location, route distance, real navigation, upload, payment, income, withdrawal, push, IM, or admin review. Those are separate slices. Trying to cram them in here would be pure project self-harm.

## File Structure

- Create `apps/api/src/driver-orders/dto.ts`: driver order hall DTOs and request/response types.
- Create `apps/api/src/driver-orders/driver-orders.validation.ts`: Zod validation for hall query, quote, and accept requests.
- Create `apps/api/src/driver-orders/driver-orders.service.ts`: authorize driver users and delegate to repository.
- Create `apps/api/src/driver-orders/driver-orders.controller.ts`: `/driver/order-hall`, `/driver/orders/:orderId/quote`, `/driver/orders/:orderId/accept`.
- Create `apps/api/src/driver-orders/driver-orders.module.ts`: Nest module wiring.
- Modify `apps/api/src/orders/orders.repository.ts`: expose driver-facing repository operations using current Prisma `Order` and `OrderEvent`.
- Modify `apps/api/src/orders/dto.ts`: include event `actorUserId` so mobile can distinguish driver quote events.
- Modify `apps/api/src/app.module.ts`: import `DriverOrdersModule`.
- Create `src/services/platformDriverOrderApi.ts`: mobile driver API adapter.
- Create `src/screens/DriverHomeScreen.tsx`: small driver order hall UI.
- Modify `src/types.ts`: add `DriverHallOrder` and driver root mode if needed.
- Modify `App.tsx` and `src/screens/AuthScreen.tsx`: keep selected mobile user type and route driver users to driver home.
- Add tests in `apps/api/src/driver-orders/*.spec.ts`, `__tests__/platformDriverOrderApi.test.ts`, and `__tests__/App.test.tsx`.

## Task 1: Backend Driver Order Hall

**Files:**
- Create: `apps/api/src/driver-orders/dto.ts`
- Create: `apps/api/src/driver-orders/driver-orders.validation.ts`
- Create: `apps/api/src/driver-orders/driver-orders.service.ts`
- Create: `apps/api/src/driver-orders/driver-orders.controller.ts`
- Create: `apps/api/src/driver-orders/driver-orders.module.ts`
- Modify: `apps/api/src/orders/orders.repository.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/driver-orders/driver-orders.validation.spec.ts`
- Test: `apps/api/src/driver-orders/driver-orders.service.spec.ts`
- Test: `apps/api/src/driver-orders/driver-orders.controller.spec.ts`

- [ ] **Step 1: Write failing validation tests**

Add tests proving quote requests trim values, require positive `quoteCents`, require 1-50 char `arrivalText`, and allow optional 200 char `noteText`.

Run:

```powershell
npm --prefix apps/api test -- driver-orders.validation.spec.ts
```

Expected: FAIL because `driver-orders.validation` does not exist.

- [ ] **Step 2: Implement DTO and validation**

Implement `DriverQuoteOrderRequest`, `DriverAcceptOrderRequest`, and parse functions. Keep payload small and cents-based.

- [ ] **Step 3: Write failing service/controller tests**

Add tests for:

- non-driver current user is rejected with `AUTH_FORBIDDEN`;
- hall returns only waiting orders;
- quote appends `driver_quote_submitted` event and keeps order `waiting`;
- accept changes order to `loading` and appends `driver_accepted` event;
- accepting non-waiting order returns `ORDER_STATE_INVALID`.

Run:

```powershell
npm --prefix apps/api test -- driver-orders
```

Expected: FAIL because module/service/controller do not exist.

- [ ] **Step 4: Implement repository/service/controller/module**

Use existing `OrdersRepository` shape where possible and add narrowly scoped methods for driver hall, quote, and accept. Store driver quote payload as JSON text in `OrderEvent.noteText` for this slice.

- [ ] **Step 5: Verify backend slice**

Run:

```powershell
npm --prefix apps/api test -- driver-orders
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
```

Expected: PASS.

## Task 2: Mobile Driver API Adapter

**Files:**
- Create: `src/services/platformDriverOrderApi.ts`
- Test: `__tests__/platformDriverOrderApi.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Add tests proving:

- `listOrderHall()` sends `GET /driver/order-hall` with bearer token;
- `quoteOrder()` sends `POST /driver/orders/{orderId}/quote` with normalized body;
- `acceptOrder()` sends `POST /driver/orders/{orderId}/accept`;
- missing access token is surfaced through existing `PlatformApiError`.

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/platformDriverOrderApi.test.ts
```

Expected: FAIL because adapter does not exist.

- [ ] **Step 2: Implement adapter**

Follow the existing `platformOrderApi` style: normalize IDs, trim strings, reject invalid quote requests before fetch, and use shared `platformGet/platformPost`.

- [ ] **Step 3: Verify adapter**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/platformDriverOrderApi.test.ts
npx tsc --noEmit
```

Expected: PASS.

## Task 3: Mobile Driver Home First Screen

**Files:**
- Create: `src/screens/DriverHomeScreen.tsx`
- Modify: `App.tsx`
- Modify: `src/screens/AuthScreen.tsx`
- Modify: `src/types.ts`
- Test: `__tests__/App.test.tsx`

- [ ] **Step 1: Write failing App tests**

Add tests proving:

- choosing driver login reaches a driver order hall screen;
- driver order hall loads platform orders when API is configured;
- quote submits to platform and shows local success copy;
- accept submits to platform and moves accepted order out of the waiting hall;
- API failure keeps the driver on the hall with a visible failure notice.

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/App.test.tsx
```

Expected: FAIL because no driver screen exists.

- [ ] **Step 2: Implement driver mode routing**

Preserve existing shipper behavior. Use `user.userType` from platform auth when available and local selected auth mode for local demo. Driver users route to `DriverHomeScreen`.

- [ ] **Step 3: Implement driver home UI**

Keep UI compact: title, refresh button, order cards, quote amount input, arrival input, note input, quote button, accept button, status notice. No map, no decorative marketing screen.

- [ ] **Step 4: Verify mobile driver slice**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/App.test.tsx __tests__/platformDriverOrderApi.test.ts
npx tsc --noEmit
npm run lint
```

Expected: PASS.

## Task 4: Docs and Full Verification

**Files:**
- Modify: `docs/03-项目当前状态与补全路线.md`
- Modify: `docs/platform/openapi-stage-1.yaml`
- Test: `apps/api/src/config/openapi-stage-1.spec.ts`

- [ ] **Step 1: Add OpenAPI coverage**

Document:

- `GET /driver/order-hall`
- `POST /driver/orders/{orderId}/quote`
- `POST /driver/orders/{orderId}/accept`

Run:

```powershell
npm --prefix apps/api test -- openapi-stage-1.spec.ts
```

Expected: PASS after docs update.

- [ ] **Step 2: Update status doc**

Record that driver MVP first slice is implemented, and explicitly list what remains: certification, vehicles, real location, route distance, upload, income, payment, push, IM, and admin.

- [ ] **Step 3: Full verification**

Run:

```powershell
npm test
npx tsc --noEmit
npm run lint
npm --prefix apps/api test
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run prisma:validate
npm run api:build
```

Expected: PASS.

Run only when Docker/PostgreSQL exists:

```powershell
npm --prefix apps/api run db:postgres:doctor
npm --prefix apps/api run db:postgres:bootstrap
```

Expected on the current machine until Docker/PostgreSQL is installed: doctor fails with missing Docker and unreachable `localhost:5432`.

## Self-Review

- Spec coverage: The plan covers the approved first slice: driver hall, quote, accept, mobile adapter, first driver screen, and docs.
- Placeholder scan: No placeholder task is left; every task has files, behavior, and verification commands.
- Type consistency: Backend request names, mobile adapter names, and route names are consistent across tasks.
