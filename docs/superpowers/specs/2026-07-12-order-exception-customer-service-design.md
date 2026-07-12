# Order Exception Customer Service First Slice Design

## Goal

Build a customer-service handling loop for shipper and driver order exceptions. Every `exception_reported` or `driver_exception_reported` event creates one independent exception case that an administrator can accept, resolve and close, while the related shipper and driver can read its public progress from the mobile order detail.

This slice establishes auditable case state and handling records. It does not execute compensation, refunds, appeals, push notifications or customer-service chat.

## Current Evidence

- Shippers can append `exception_reported` events through `POST /shipper/orders/{orderId}/exception`.
- Drivers can append `driver_exception_reported` events through `POST /driver/orders/{orderId}/exception`.
- Both paths validate optional uploaded `exception` file references and bind them to `OrderEvent.attachmentFileIds`.
- The mobile shipper and driver order details display the latest submitted exception, but there is no server-side customer-service case, handling state or audit history.
- Existing admin capabilities use guarded Nest controllers plus small static HTML consoles, so the first slice should follow that boundary instead of introducing a separate frontend application.
- The current environment cannot run real PostgreSQL acceptance because Docker is unavailable and `localhost:5432` is unreachable. Repository, migration-structure and unit/integration tests remain mandatory; real migration deployment remains an environment-dependent acceptance gate.

## Scope

### In Scope

- One independent exception case for every shipper or driver exception event.
- Persistent case status and optimistic concurrency versioning.
- Persistent administrator action history.
- Shipper and accepted-driver read APIs scoped to the current order.
- Admin list, detail, accept, resolve and close APIs.
- An admin static console for filtering, inspecting and processing cases.
- Mobile shipper and driver order-detail progress panels.
- OpenAPI, migration, status documentation and automated tests.

### Out of Scope

- Compensation, refunds, payment ledger entries or settlement changes.
- Appeal and secondary review workflows.
- Push notifications, SMS notifications or IM/chat.
- Assignment queues, service-level escalation and workload balancing.
- Editing or deleting the original exception report.
- Internal/private notes. All first-slice handling text is visible to the related shipper and accepted driver.

## Data Model

### OrderExceptionCase

Each original exception event owns exactly one case.

```prisma
enum OrderExceptionCaseSourceRole {
  shipper
  driver
}

enum OrderExceptionCaseStatus {
  pending
  processing
  resolved
  closed
}

model OrderExceptionCase {
  id              String                       @id @default(uuid())
  caseNo          String                       @unique
  orderId         String
  sourceEventId   String                       @unique
  reporterUserId  String
  sourceRole      OrderExceptionCaseSourceRole
  typeLabel       String
  description     String
  attachmentFileIds Json                       @default("[]")
  status          OrderExceptionCaseStatus     @default(pending)
  resolutionText  String?
  resolvedAt      DateTime?
  closedAt        DateTime?
  createdAt       DateTime                     @default(now())
  updatedAt       DateTime                     @updatedAt
  order           Order                        @relation(fields: [orderId], references: [id])
  actions         OrderExceptionCaseAction[]

  @@index([status, createdAt], name: "OrderExceptionCase_status_created_idx")
  @@index([orderId, createdAt], name: "OrderExceptionCase_order_created_idx")
  @@index([reporterUserId, createdAt], name: "OrderExceptionCase_reporter_created_idx")
}
```

`sourceEventId` is unique so one original event cannot create duplicate cases. `caseNo` is a stable display identifier and API search key. `attachmentFileIds` snapshots the original event attachments so later reads do not need to infer evidence from mutable presentation code.

### OrderExceptionCaseAction

```prisma
model OrderExceptionCaseAction {
  id             String                   @id @default(uuid())
  caseId         String
  adminUserId    String
  fromStatus     OrderExceptionCaseStatus
  toStatus       OrderExceptionCaseStatus
  content        String
  createdAt      DateTime                 @default(now())
  exceptionCase  OrderExceptionCase       @relation(fields: [caseId], references: [id])

  @@index([caseId, createdAt], name: "OrderExceptionCaseAction_case_created_idx")
  @@index([adminUserId, createdAt], name: "OrderExceptionCaseAction_admin_created_idx")
}
```

Every administrator transition creates an action row. The first slice exposes all action content to the related shipper and accepted driver; it therefore does not model private notes.

## State Machine

Allowed transitions are strict and forward-only:

```text
pending -> processing -> resolved -> closed
```

- `process` requires a 6 to 500 character handling note.
- `resolve` requires a 6 to 500 character resolution and writes `resolutionText` plus `resolvedAt`.
- `close` requires a 6 to 500 character closing note and writes `closedAt`.
- Repeating a completed transition or skipping a state returns `409 EXCEPTION_CASE_STATE_INVALID`.
- Every mutation requires `baseUpdatedAtIso`. A stale value returns `409 EXCEPTION_CASE_CONFLICT` without changing the case or creating an action.

Reopening, rollback and appeal transitions are excluded from this slice.

## Exception Creation Transaction

Both shipper and driver exception reporting paths use the same repository-level transaction boundary:

1. Validate actor role, order relationship, allowed order status and attachment files.
2. Create the original `OrderEvent`.
3. Generate a stable `caseNo` and create `OrderExceptionCase` with `sourceEventId` set to the new event ID.
4. Return the refreshed order including events and an exception-case summary.

If either event creation or case creation fails, the transaction rolls back. The system must never retain an exception event that has no customer-service case.

The in-memory repository mirrors this atomic behavior by calculating both records before publishing either state change.

## API Design

### User Read APIs

```text
GET /shipper/orders/{orderId}/exception-cases
GET /driver/orders/{orderId}/exception-cases
```

The shipper endpoint requires ownership of the order. The driver endpoint requires that the current driver accepted the order. Unauthorized relationships return `404 EXCEPTION_CASE_NOT_FOUND` so callers cannot enumerate other users' orders or cases.

The response contains cases ordered by `createdAtIso` descending. Each case contains:

- `id`, `caseNo`, `orderId` and `sourceEventId`;
- reporter role and display label;
- exception type, description and attachment file IDs;
- status, resolution text and timestamps;
- public action history ordered by `createdAtIso` ascending.

### Admin APIs

```text
GET  /admin/order-exception-cases
GET  /admin/order-exception-cases/{caseId}
POST /admin/order-exception-cases/{caseId}/process
POST /admin/order-exception-cases/{caseId}/resolve
POST /admin/order-exception-cases/{caseId}/close
```

All endpoints require a valid access token and `admin` role before query/body parsing and business-service execution.

The list supports:

- `page` and `pageSize`;
- optional status;
- optional source role;
- optional order number or case number keyword;
- optional `createdFromIso` and exclusive `createdToIso`.

Mutation bodies use:

```ts
type UpdateOrderExceptionCaseRequest = {
  baseUpdatedAtIso: string;
  content: string;
};
```

The detail and mutation endpoints return `404 EXCEPTION_CASE_NOT_FOUND` for missing cases. Invalid transitions return `409 EXCEPTION_CASE_STATE_INVALID`; stale versions return `409 EXCEPTION_CASE_CONFLICT`.

## Mobile Experience

The shipper order detail and driver execution detail add an `异常处理进度` section.

Each case displays:

- case number;
- reporter label (`货主上报` or `司机上报`);
- exception type and description;
- status label;
- submitted time;
- resolution text when available;
- chronological handling timeline.

Status labels are:

| API status | Mobile label |
| --- | --- |
| `pending` | `待客服受理` |
| `processing` | `处理中` |
| `resolved` | `已解决` |
| `closed` | `已关闭` |

The progress request is independent from the main order-detail request. Failure preserves the existing order page and shows `异常处理进度加载失败，请稍后重试。`. A missing access token shows `登录状态已失效，请重新登录后查看异常处理进度。`.

An order with no cases shows `暂无异常处理工单` and does not invent local mock progress.

## Admin Console

Add `GET /api/admin/order-exception-case-console`, following the existing static admin-console pattern.

The console provides:

- access-token input;
- status, source role and keyword filters;
- pagination;
- case summary rows;
- detail view with evidence file preview links and action history;
- state-appropriate process, resolve and close forms.

Mutation controls are disabled while a request is pending. On `EXCEPTION_CASE_CONFLICT`, the console reloads the latest detail and informs the administrator that another update won. It never retries a stale mutation automatically.

## Error Handling

| Code | HTTP | Meaning |
| --- | --- | --- |
| `AUTH_ACCESS_TOKEN_INVALID` | 401 | Access token is invalid or expired |
| `AUTH_FORBIDDEN` | 403 | Current account does not have the required role |
| `EXCEPTION_CASE_NOT_FOUND` | 404 | Case/order relationship is unavailable to the caller |
| `EXCEPTION_CASE_STATE_INVALID` | 409 | Requested transition is not allowed from current status |
| `EXCEPTION_CASE_CONFLICT` | 409 | `baseUpdatedAtIso` is stale |
| `VALIDATION_ERROR` | 400 | Query or mutation body is invalid |

Original exception-report file errors remain unchanged: `FILE_NOT_FOUND`, `FILE_STATE_INVALID` and `FILE_PURPOSE_INVALID`.

## Testing

### Database and Repository

- Migration structure includes enums, tables, foreign keys, unique constraints and indexes.
- Shipper and driver exception reporting atomically create an event and one case.
- A duplicate `sourceEventId` is rejected.
- In-memory and Prisma repositories produce equivalent case snapshots and state transitions.
- Failed case creation does not retain an orphan event.

### Validation and Service

- List pagination, filters and date ranges are validated.
- Mutation content and `baseUpdatedAtIso` are validated.
- User read permissions cover owner, accepted driver and unrelated users.
- Admin role gates run before parsing or service calls.
- Every valid and invalid state transition is covered.
- Stale optimistic concurrency baselines do not mutate state.

### API and OpenAPI

- Controller tests cover route binding, guards, response envelopes and error propagation.
- OpenAPI covers user reads, admin list/detail/mutations, schemas, statuses and business errors.
- Static admin console contract tests cover API paths, filters, action controls and conflict reload behavior.

### Mobile

- Shipper and driver adapters normalize list responses and reject invalid order IDs before fetch.
- Status-label mapping and timeline ordering have pure utility tests.
- Order detail panels cover loading, empty, success, missing-token and ordinary-failure states.
- Existing order content remains rendered when progress loading fails.

## Verification Gates

After implementation, run:

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

When PostgreSQL becomes reachable, additionally run migration deploy, seed and relevant smoke tests. Lack of a database environment must be reported as an external acceptance gap, not described as a passing real-database test.

## Documentation

Update:

- `docs/platform/openapi-stage-1.yaml`;
- `docs/platform/README.md`;
- `docs/03-项目当前状态与补全路线.md`.

Documentation must state that case handling is implemented while compensation, refunds, appeals, notifications and chat remain incomplete.

## Completion Criteria

The first slice is complete only when:

- every new shipper or driver exception event creates exactly one persistent case;
- related shippers and accepted drivers can read current case progress;
- admins can list, inspect, process, resolve and close cases with an audit trail;
- optimistic concurrency prevents stale administrator writes;
- mobile order details display real server case progress without replacing the main page on failure;
- OpenAPI and status documentation match current behavior;
- all repository, API, mobile and full quality gates pass;
- no documentation presents this slice as a compensation, appeal, notification or chat system.

## Self Review

- Placeholder scan: no `TBD`, `TODO` or unspecified implementation placeholders.
- Internal consistency: one exception event maps to one case through unique `sourceEventId`; all transitions use the same four statuses.
- Scope check: the design is a single customer-service handling slice and does not mix financial settlement or messaging infrastructure into the transaction.
- Ambiguity check: every handling note is public in this slice; list date ranges use inclusive `createdFromIso` and exclusive `createdToIso`; stale writes always fail rather than merge.
