# Platform Completion Stage 1 Design

## Goal

Turn the current freight platform from "local shipper MVP plus several real API slices" into a traceable stage-1 completion baseline: document what exists, close the already-built driver execution slice, make PostgreSQL acceptance explicit, and prepare the first real driver and vehicle certification slice.

## Current Evidence

The current repository already contains these working parts:

- React Native mobile app with shipper local MVP flows: onboarding, auth, home, order draft, order list, order detail, messages, support, and profile center.
- NestJS API in `apps/api` with auth, shipper orders, order drafts, address book, frequent routes, file metadata, and driver order modules.
- Mobile platform adapters in `src/services` for auth, orders, drafts, profile address book, frequent routes, files, and driver orders.
- Driver first slices for order hall, quoting, accepting, current-driver order list/detail, and driver status advance.
- OpenAPI stage-1 document and automated tests covering the above slices.

The latest verification evidence from this workspace:

- `npm test -- --runInBand`: passed, 30 suites and 524 tests.
- `npm --prefix apps/api test`: passed, 37 suites and 275 tests.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm --prefix apps/api run typecheck`: passed.
- `npm --prefix apps/api run lint`: passed.
- `npm --prefix apps/api run prisma:validate`: passed.
- `npm run api:build`: passed.
- `npm --prefix apps/api run db:postgres:doctor`: failed because Docker CLI is missing and `localhost:5432` is not reachable.

## Stage 1 Scope

This stage includes four bounded outcomes:

1. Status documentation is corrected so the project has a reliable source of truth.
2. The driver order execution first slice is marked complete in its plan because code, tests, and OpenAPI evidence already exist.
3. PostgreSQL acceptance remains an explicit gate. The code already has scripts, but the local environment still lacks Docker/PostgreSQL; this stage documents the gate and does not fake a pass.
4. Driver and vehicle certification get a first real backend/mobile slice after the current documentation baseline is accurate.

This stage does not include:

- Payment, refund, wallet, withdrawal, escrow, or invoice real settlement.
- Maps, navigation, live tracking, or location upload.
- Push notification, IM, customer-service console, or admin web app.
- Real object storage binary upload beyond the existing file metadata/uploaded-state foundation.
- Production KMS, distributed rate limiting, full device management, access-token blacklist, or compliance audit system.

Those are separate stages. Mixing them into this stage would be scope soup, and scope soup is how decent projects go to die.

## Architecture

Documentation remains under `docs/` and records evidence from code, tests, and environment commands. The status documents distinguish three states: implemented and verified, implemented but environment-gated, and not implemented.

Driver and vehicle certification should follow the existing module pattern in `apps/api/src`: controller, service, repository, DTO, validation, tests, and OpenAPI entries. Mobile should follow existing adapter-first integration: add a service adapter under `src/services`, add UI state to the driver workspace/profile flow, and keep local fallback only where the current app already uses local MVP behavior.

## Data Model Direction

The first certification slice should add dedicated Prisma models instead of overloading `User` or `OrderEvent`.

Driver certification fields:

- `driverId`
- real name
- identity number masked or encrypted by later production hardening
- identity front/back file IDs
- status: `unsubmitted`, `reviewing`, `approved`, `rejected`
- rejection reason
- client/server timestamps

Vehicle certification fields:

- `driverId`
- plate number
- vehicle type
- vehicle length text
- load capacity text
- tailboard flag
- driving license file ID
- vehicle photo file ID
- status: `unsubmitted`, `reviewing`, `approved`, `rejected`
- rejection reason
- client/server timestamps

The first slice can store file IDs against the existing `FileObject` table. It does not need real object storage yet, because binary upload is already a separate known gap.

## API Design

The first certification API should be driver-only and protected by the existing `AccessTokenGuard`:

- `GET /driver/certification`
  Returns the current driver's driver-certification and vehicle-certification snapshots.
- `PUT /driver/certification/identity`
  Submits or resubmits driver identity certification and moves status to `reviewing`.
- `PUT /driver/certification/vehicle`
  Submits or resubmits vehicle certification and moves status to `reviewing`.

Non-driver users return `403 AUTH_FORBIDDEN`. Missing certification snapshots return default `unsubmitted` objects. Invalid file ownership or wrong file purpose should return a business error in a later hardening slice; the first slice should at least validate required file ID shape and preserve ownership validation as a planned follow-up if repository lookup is not yet available.

## Mobile Design

The mobile driver workspace should show a compact certification card above the order hall:

- Identity status.
- Vehicle status.
- Required next action.
- Submit/resubmit buttons.

The first UI can use text inputs and existing platform file adapter references instead of native document pickers. That keeps it consistent with current MVP behavior where file upload is represented by platform file objects rather than real binary upload.

## Error Handling

- Missing access token uses the existing `AUTH_ACCESS_TOKEN_MISSING` adapter behavior.
- Non-driver access returns `AUTH_FORBIDDEN`.
- Invalid request body returns `VALIDATION_ERROR`.
- Certification save failures keep the driver screen visible and show a retryable notice.
- PostgreSQL acceptance failure must stay visible in docs and final verification until a real database is reachable.

## Testing

Documentation/status tasks are verified by reading the edited files and checking there are no stale unchecked items for completed driver execution work.

Driver certification implementation should use TDD:

- API validation specs for identity and vehicle request shape.
- API service specs for default snapshot, submit, resubmit, and non-driver rejection.
- Controller specs for protected endpoints.
- Prisma migration structure spec for new models/enums.
- Mobile adapter specs for request normalization and bearer behavior.
- App tests for driver certification card, submit success, submit failure, and rejected status display.

Full stage verification should include:

- `npm test -- --runInBand`
- `npx tsc --noEmit`
- `npm run lint`
- `npm --prefix apps/api test`
- `npm --prefix apps/api run typecheck`
- `npm --prefix apps/api run lint`
- `npm --prefix apps/api run prisma:validate`
- `npm run api:build`
- `npm --prefix apps/api run db:postgres:doctor`

The PostgreSQL doctor command may remain failed until Docker/PostgreSQL is available, but the failure must be reported honestly.

## Completion Criteria

Stage 1 is complete when:

- Project status docs clearly list implemented, half-built, and missing modules.
- The driver order execution first-slice plan matches current evidence.
- PostgreSQL acceptance instructions and current blocker are documented.
- Driver/vehicle certification first slice has backend API, mobile adapter/UI, OpenAPI docs, tests, and verification results.
- No claim is made that payment, maps, push, IM, admin, real upload, or production-grade compliance is complete.

## Self Review

- Placeholder scan: clear.
- Scope check: payment, map, push, IM, admin, and real object storage are explicitly excluded from this stage.
- Consistency check: driver certification and vehicle certification are treated as the next real feature slice after status documentation and PostgreSQL acceptance visibility.
