# Driver Order Execution First Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let drivers view their accepted/executing orders and advance execution status from loading to transporting to confirming.

**Architecture:** Reuse the existing `Order` and `OrderEvent` tables. Driver ownership is determined by a `driver_accepted` event with the current driver's `actorUserId`, so this slice avoids schema migrations while the local PostgreSQL environment is unavailable.

**Tech Stack:** React Native, TypeScript, Jest, NestJS, Prisma, Zod, OpenAPI YAML.

---

## Scope Check

This plan only covers driver order execution after accept:

- list current driver's accepted/executing orders;
- get one current-driver order detail;
- advance `loading -> transporting -> confirming`;
- show and operate this flow in the mobile driver screen;
- document the API.

No maps, uploads, payment, income, push, IM, admin, certification, vehicle management, or final shipper completion.

## Completion Evidence

This slice has been implemented in the current workspace. Evidence:

- Backend driver execution endpoints exist in `apps/api/src/driver-orders/driver-orders.controller.ts`, `apps/api/src/driver-orders/driver-orders.service.ts`, and `apps/api/src/driver-orders/driver-orders.validation.ts`.
- Repository support exists in `apps/api/src/orders/orders.repository.ts`.
- Mobile adapter support exists in `src/services/platformDriverOrderApi.ts`.
- Mobile UI support exists in `src/screens/DriverHomeScreen.tsx`.
- OpenAPI includes `/driver/orders`, `/driver/orders/{orderId}`, and `/driver/orders/{orderId}/status`.
- Targeted verification passed: `npm --prefix apps/api test -- driver-orders`, `npx jest --runInBand --runTestsByPath __tests__\platformDriverOrderApi.test.ts`, and `npx jest --runInBand --runTestsByPath __tests__\App.test.tsx --testNamePattern "driver"`.

## File Structure

- Modify `apps/api/src/driver-orders/dto.ts`: add my-orders query and status request types.
- Modify `apps/api/src/driver-orders/driver-orders.validation.ts`: add Zod schemas for my-orders query and status advance request.
- Modify `apps/api/src/orders/orders.repository.ts`: add current-driver list/detail/status methods for in-memory and Prisma repositories.
- Modify `apps/api/src/driver-orders/driver-orders.service.ts`: authorize drivers, enforce current-driver ownership, enforce status transitions.
- Modify `apps/api/src/driver-orders/driver-orders.controller.ts`: add `GET /driver/orders`, `GET /driver/orders/:orderId`, and `POST /driver/orders/:orderId/status`.
- Modify `src/services/platformDriverOrderApi.ts`: add list/get/status adapter methods and validation.
- Modify `src/screens/DriverHomeScreen.tsx`: add my-orders section, detail panel, and status action.
- Modify `docs/platform/openapi-stage-1.yaml`: document new endpoints and schemas.
- Modify `docs/03-项目当前状态与补全路线.md`: record the driver execution first slice.

## Task 1: Backend Driver Execution APIs

- [x] Write failing tests in `apps/api/src/driver-orders/driver-orders.validation.spec.ts` for status request validation.
- [x] Write failing tests in `apps/api/src/driver-orders/driver-orders.service.spec.ts` for list/detail/status ownership and transitions.
- [x] Write failing tests in `apps/api/src/driver-orders/driver-orders.controller.spec.ts` for the new controller methods.
- [x] Implement DTOs, validation, repository methods, service methods, and controller endpoints.
- [x] Run `npm --prefix apps/api test -- driver-orders`.

## Task 2: Mobile Driver Adapter

- [x] Write failing tests in `__tests__/platformDriverOrderApi.test.ts` for `listMyOrders`, `getOrder`, and `advanceOrderStatus`.
- [x] Implement adapter methods and request validation.
- [x] Run `npx jest --runInBand --runTestsByPath __tests__/platformDriverOrderApi.test.ts`.

## Task 3: Mobile Driver UI

- [x] Write failing tests in `__tests__/App.test.tsx` for driver my-orders loading, detail opening, status advance, and failure notices.
- [x] Implement accepted/executing orders section and detail/status controls in `DriverHomeScreen`.
- [x] Run `npx jest --runInBand --runTestsByPath __tests__/App.test.tsx __tests__/platformDriverOrderApi.test.ts`.

## Task 4: Docs and Verification

- [x] Add OpenAPI docs and contract test expectations for the new driver execution endpoints.
- [x] Update project status docs.
- [x] Run full verification:
  - `npm test`
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm --prefix apps/api test`
  - `npm --prefix apps/api run typecheck`
  - `npm --prefix apps/api run lint`
  - `npm --prefix apps/api run prisma:validate`
  - `npm run api:build`
  - `npm --prefix apps/api run db:postgres:doctor`

## Self-Review

- Spec coverage: each scoped endpoint, mobile adapter method, UI behavior, and docs update has a task.
- Placeholder scan: no TODO/TBD placeholders remain.
- Type consistency: endpoint names, DTO names, and mobile method names are consistent across tasks.
