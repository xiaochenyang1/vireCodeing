# Platform Completion Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reliable stage-1 completion baseline and then add the first real driver/vehicle certification slice.

**Architecture:** First correct the documentation source of truth using current test and environment evidence. Then add certification as a bounded backend/mobile slice following the existing NestJS module, Prisma repository, platform adapter, and React Native screen patterns.

**Tech Stack:** React Native, TypeScript, Jest, NestJS, Prisma, Zod, OpenAPI YAML, PostgreSQL acceptance scripts.

---

## Scope Check

This plan has two parts:

- Documentation/status closure that can be done immediately.
- Driver and vehicle certification first slice, which should be implemented after the status baseline is accurate.

This plan intentionally does not implement payment, maps, push, IM, admin, real object storage upload, or production compliance hardening. Those must remain separate plans.

## File Structure

- Modify `docs/superpowers/plans/2026-07-06-driver-order-execution-first-slice.md`: mark completed driver execution tasks based on current code/test/OpenAPI evidence.
- Modify `docs/03-项目当前状态与补全路线.md`: add a concise latest status section with implemented, half-built, missing, and next-priority modules.
- Modify `docs/platform/README.md`: add a short stage-1 baseline summary and PostgreSQL acceptance blocker.
- Create `apps/api/src/driver-certification/`: backend certification module, controller, service, repository, DTO, validation, and tests.
- Modify `apps/api/prisma/schema.prisma`: add driver/vehicle certification enums and models.
- Create a new Prisma migration under `apps/api/prisma/migrations/`.
- Modify `apps/api/src/app.module.ts`: import `DriverCertificationModule`.
- Modify `docs/platform/openapi-stage-1.yaml`: document certification endpoints and schemas.
- Create `src/services/platformDriverCertificationApi.ts`: mobile adapter for certification endpoints.
- Modify `src/screens/DriverHomeScreen.tsx`: add certification card and submit/resubmit controls.
- Modify `__tests__/App.test.tsx`: cover driver certification UI.
- Create `__tests__/platformDriverCertificationApi.test.ts`: cover mobile adapter.

## Task 1: Documentation Baseline

**Files:**
- Modify: `docs/superpowers/plans/2026-07-06-driver-order-execution-first-slice.md`
- Modify: `docs/03-项目当前状态与补全路线.md`
- Modify: `docs/platform/README.md`

- [x] **Step 1: Mark completed driver execution plan items**

Update each checkbox in `docs/superpowers/plans/2026-07-06-driver-order-execution-first-slice.md` from unchecked to checked because the current workspace contains:

- `apps/api/src/driver-orders/driver-orders.controller.ts`
- `apps/api/src/driver-orders/driver-orders.service.ts`
- `apps/api/src/driver-orders/driver-orders.validation.ts`
- `src/services/platformDriverOrderApi.ts`
- `src/screens/DriverHomeScreen.tsx`
- OpenAPI paths for `/driver/orders`, `/driver/orders/{orderId}`, and `/driver/orders/{orderId}/status`
- Passing targeted tests: `npm --prefix apps/api test -- driver-orders`, `npx jest --runInBand --runTestsByPath __tests__\platformDriverOrderApi.test.ts`, and `npx jest --runInBand --runTestsByPath __tests__\App.test.tsx --testNamePattern "driver"`

- [x] **Step 2: Add latest status summary**

Add a new top section to `docs/03-项目当前状态与补全路线.md` named `2026-07-06 第一阶段补全基线`.

The section must include these exact categories:

- `已实现并通过自动检查`
- `已实现但受环境阻塞`
- `半成品`
- `未开发`
- `下一步顺序`

- [x] **Step 3: Add platform README baseline**

Add a short `阶段 1 当前基线` section near the top of `docs/platform/README.md` that states:

- mobile and API automated checks pass;
- PostgreSQL doctor is blocked by missing Docker CLI and unreachable `localhost:5432`;
- driver execution first slice is implemented;
- driver/vehicle certification is the next planned slice.

- [x] **Step 4: Verify documentation text**

Run:

```powershell
Select-String -Path 'docs\superpowers\plans\2026-07-06-driver-order-execution-first-slice.md' -Pattern '- \[ \]'
Select-String -Path 'docs\03-项目当前状态与补全路线.md' -Pattern '第一阶段补全基线|已实现并通过自动检查|半成品|未开发'
Select-String -Path 'docs\platform\README.md' -Pattern '阶段 1 当前基线|PostgreSQL doctor|driver execution'
```

Expected:

- The driver execution plan has no unchecked task checkboxes.
- The status document contains the new baseline section.
- The platform README contains the new baseline section.

## Task 2: Backend Certification Schema and Validation

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_driver_certification/migration.sql`
- Create: `apps/api/src/driver-certification/dto.ts`
- Create: `apps/api/src/driver-certification/driver-certification.validation.ts`
- Create: `apps/api/src/driver-certification/driver-certification.validation.spec.ts`
- Modify: `apps/api/src/config/prisma-migration.spec.ts`

- [x] **Step 1: Write validation tests**

Create `apps/api/src/driver-certification/driver-certification.validation.spec.ts` with tests for:

```ts
import {
  parseSubmitDriverIdentityCertificationRequest,
  parseSubmitDriverVehicleCertificationRequest,
} from './driver-certification.validation';

describe('driver certification validation', () => {
  it('normalizes identity certification requests', () => {
    expect(
      parseSubmitDriverIdentityCertificationRequest({
        realName: ' 张三 ',
        identityNumber: ' 110101199003071234 ',
        identityFrontFileId: ' file-front ',
        identityBackFileId: ' file-back ',
      }),
    ).toEqual({
      realName: '张三',
      identityNumber: '110101199003071234',
      identityFrontFileId: 'file-front',
      identityBackFileId: 'file-back',
    });
  });

  it('rejects invalid identity certification requests', () => {
    expect(() =>
      parseSubmitDriverIdentityCertificationRequest({
        realName: '',
        identityNumber: '110101199003071234',
        identityFrontFileId: 'file-front',
        identityBackFileId: 'file-back',
      }),
    ).toThrow('司机姓名不能为空');
  });

  it('normalizes vehicle certification requests', () => {
    expect(
      parseSubmitDriverVehicleCertificationRequest({
        plateNumber: ' 粤B12345 ',
        vehicleType: ' medium ',
        vehicleLengthText: ' 6.8 米 ',
        loadCapacityText: ' 8 吨 ',
        hasTailboard: true,
        drivingLicenseFileId: ' file-license ',
        vehiclePhotoFileId: ' file-vehicle ',
      }),
    ).toEqual({
      plateNumber: '粤B12345',
      vehicleType: 'medium',
      vehicleLengthText: '6.8 米',
      loadCapacityText: '8 吨',
      hasTailboard: true,
      drivingLicenseFileId: 'file-license',
      vehiclePhotoFileId: 'file-vehicle',
    });
  });
});
```

- [x] **Step 2: Implement DTOs and validation**

Create `dto.ts` with request/result types for identity, vehicle, and snapshot responses. Create `driver-certification.validation.ts` using Zod schemas with trimmed required strings, max lengths, and boolean validation.

- [x] **Step 3: Add Prisma schema**

Add an enum:

```prisma
enum CertificationStatus {
  unsubmitted
  reviewing
  approved
  rejected
}
```

Add models:

```prisma
model DriverIdentityCertification {
  driverId            String              @id
  realName            String
  identityNumber      String
  identityFrontFileId String
  identityBackFileId  String
  status              CertificationStatus @default(reviewing)
  rejectionReason     String?
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt
  driver              User                @relation("DriverIdentityCertification", fields: [driverId], references: [id])
}

model DriverVehicleCertification {
  driverId             String              @id
  plateNumber          String
  vehicleType          String
  vehicleLengthText    String
  loadCapacityText     String
  hasTailboard         Boolean             @default(false)
  drivingLicenseFileId String
  vehiclePhotoFileId   String
  status               CertificationStatus @default(reviewing)
  rejectionReason      String?
  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt
  driver               User                @relation("DriverVehicleCertification", fields: [driverId], references: [id])
}
```

Add matching optional relations to `User`.

- [x] **Step 4: Add migration SQL**

Create migration SQL with `CREATE TYPE "CertificationStatus"` and the two tables, including foreign keys to `"User"("id")`.

- [x] **Step 5: Run validation tests**

Run:

```powershell
npm --prefix apps/api test -- driver-certification.validation
npm --prefix apps/api run prisma:validate
```

Expected: validation tests pass and Prisma schema validates.

## Task 3: Backend Certification API

**Files:**
- Create: `apps/api/src/driver-certification/driver-certification.repository.ts`
- Create: `apps/api/src/driver-certification/driver-certification.service.ts`
- Create: `apps/api/src/driver-certification/driver-certification.controller.ts`
- Create: `apps/api/src/driver-certification/driver-certification.module.ts`
- Create: `apps/api/src/driver-certification/driver-certification.service.spec.ts`
- Create: `apps/api/src/driver-certification/driver-certification.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/common/errors.ts`

- [x] **Step 1: Write service tests**

Create tests that assert:

- a driver with no records receives `unsubmitted` identity and vehicle snapshots;
- a shipper receives `AUTH_FORBIDDEN`;
- submitting identity creates or updates reviewing identity certification;
- submitting vehicle creates or updates reviewing vehicle certification.

- [x] **Step 2: Implement repository**

Create an in-memory repository for tests and a Prisma repository using the two new Prisma models.

- [x] **Step 3: Implement service**

Service methods:

- `getCertification(currentUser)`
- `submitIdentity(currentUser, input)`
- `submitVehicle(currentUser, input)`

Each method must reject non-driver users with `AUTH_FORBIDDEN`.

- [x] **Step 4: Implement controller and module**

Controller routes:

- `GET /driver/certification`
- `PUT /driver/certification/identity`
- `PUT /driver/certification/vehicle`

Use `AccessTokenGuard`, `ZodValidationPipe`, and `ok()`.

- [x] **Step 5: Wire module**

Import `DriverCertificationModule` in `apps/api/src/app.module.ts`.

- [x] **Step 6: Run backend tests**

Run:

```powershell
npm --prefix apps/api test -- driver-certification
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
```

Expected: all pass.

## Task 4: Mobile Certification Adapter

**Files:**
- Create: `src/services/platformDriverCertificationApi.ts`
- Create: `__tests__/platformDriverCertificationApi.test.ts`

- [x] **Step 1: Write adapter tests**

Cover:

- `getCertification()` calls `GET /driver/certification` with bearer token.
- `submitIdentity()` trims fields and calls `PUT /driver/certification/identity`.
- `submitVehicle()` trims fields and calls `PUT /driver/certification/vehicle`.
- missing access token rejects before fetch through existing platform client behavior.

- [x] **Step 2: Implement adapter**

Follow `src/services/platformDriverOrderApi.ts` conventions:

- normalize required strings;
- throw `PlatformApiError` with `PLATFORM_DRIVER_CERTIFICATION_REQUEST_INVALID` on invalid local input;
- reuse `platformGet` and `platformPut` if available, or add `platformPut` to `platformApiClient.ts` with tests if it does not exist.

- [x] **Step 3: Run adapter tests**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__\platformDriverCertificationApi.test.ts
npx tsc --noEmit
```

Expected: tests and typecheck pass.

## Task 5: Mobile Driver Certification UI

**Files:**
- Modify: `src/screens/DriverHomeScreen.tsx`
- Modify: `App.tsx`
- Modify: `__tests__/App.test.tsx`

- [x] **Step 1: Write App tests**

Add tests for:

- driver login loads certification snapshot;
- unsubmitted snapshot shows certification card;
- submitting identity shows reviewing status;
- submitting vehicle failure keeps driver screen visible and shows a notice.

- [x] **Step 2: Inject adapter**

Create the certification adapter in `App.tsx` when platform base URL is configured, using the same token source as driver order API.

- [x] **Step 3: Add DriverHomeScreen card**

Add a compact card above order hall:

- identity status text;
- vehicle status text;
- identity submit inputs;
- vehicle submit inputs;
- submit/resubmit buttons;
- failure notice reuse.

- [x] **Step 4: Run UI tests**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__\App.test.tsx --testNamePattern "driver certification"
npm test -- --runInBand
```

Expected: targeted tests and full mobile test suite pass.

## Task 6: OpenAPI, Status Docs, and Full Verification

**Files:**
- Modify: `docs/platform/openapi-stage-1.yaml`
- Modify: `apps/api/src/config/openapi-stage-1.spec.ts`
- Modify: `docs/03-项目当前状态与补全路线.md`
- Modify: `docs/platform/README.md`

- [x] **Step 1: Document API**

Add OpenAPI paths and schemas for:

- `GET /driver/certification`
- `PUT /driver/certification/identity`
- `PUT /driver/certification/vehicle`

- [x] **Step 2: Update OpenAPI contract test**

Extend `apps/api/src/config/openapi-stage-1.spec.ts` to assert the new paths and schemas exist.

- [x] **Step 3: Update project status**

Record driver/vehicle certification first slice as implemented after code and tests pass. Keep payment, maps, push, IM, admin, and real object storage listed as not implemented.

- [x] **Step 4: Run full verification**

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
npm --prefix apps/api run db:postgres:doctor
```

Expected:

- all test, typecheck, lint, Prisma validate, and API build commands pass;
- `db:postgres:doctor` either passes with a reachable PostgreSQL or fails with the known Docker/PostgreSQL environment blocker, which must be reported honestly.

Observed on 2026-07-06:

- `npm test -- --runInBand`: 31 suites / 532 tests passed.
- `npm --prefix apps/api test`: 40 suites / 288 tests passed.
- TypeScript, ESLint, Prisma validate, and API build passed.
- `npm --prefix apps/api run db:postgres:doctor` failed with the known environment blocker: Docker CLI missing and `localhost:5432` PostgreSQL unreachable (`P1001`).

## Self Review

- Spec coverage: documentation baseline, PostgreSQL acceptance visibility, and driver/vehicle certification first slice each have tasks.
- Placeholder scan: clear.
- Type consistency: driver certification naming is consistent across API, Prisma, mobile adapter, and tests.
