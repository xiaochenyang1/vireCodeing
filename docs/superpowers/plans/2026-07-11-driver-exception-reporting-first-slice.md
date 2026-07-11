# Driver Exception Reporting First Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成司机执行订单异常上报的后端、移动端、证据图片、文档和全量质量门闭环。

**Architecture:** 异常继续作为不可变 `OrderEvent` 写入现有订单模型，文件只通过 `FileObject` ID 绑定，不新增独立工单表。移动端沿用 adapter-first 和现有文件上传确认流程，纯校验放在 `driverHomeUtils.ts`，交互编排保留在 `DriverHomeScreen.tsx`。

**Tech Stack:** React Native 0.86、TypeScript、Jest、NestJS、Zod、Prisma、OpenAPI YAML。

---

## File Structure

- Modify: `src/screens/driver-home/driverHomeUtils.ts` — 异常表单类型、预设类型、纯校验、状态判断和最新事件选择。
- Modify: `__tests__/driverHomeUtils.test.ts` — 纯函数边界测试。
- Modify: `src/services/platformDriverOrderApi.ts` — 异常请求归一化和 POST adapter。
- Modify: `__tests__/platformDriverOrderApi.test.ts` — adapter 请求、去重、错误码和 bearer 测试。
- Modify: `src/screens/DriverHomeScreen.tsx` — 异常 UI、证据上传、提交和结果展示。
- Modify: `__tests__/DriverHomeScreen.test.tsx` — 司机端完整交互测试。
- Modify: `apps/api/src/driver-orders/dto.ts` — 请求 DTO。
- Modify: `apps/api/src/driver-orders/driver-orders.validation.ts` — Zod schema 和 parser。
- Modify: `apps/api/src/driver-orders/driver-orders.validation.spec.ts` — 请求边界测试。
- Modify: `apps/api/src/driver-orders/driver-orders.controller.ts` — 路由接线。
- Modify: `apps/api/src/driver-orders/driver-orders.controller.spec.ts` — controller 与角色边界测试。
- Modify: `apps/api/src/driver-orders/driver-orders.service.ts` — 订单状态和文件校验。
- Modify: `apps/api/src/driver-orders/driver-orders.service.spec.ts` — 权限、状态、附件和事件测试。
- Modify: `apps/api/src/orders/orders.repository.ts` — 内存与 Prisma 事件落库。
- Modify: `apps/api/src/config/openapi-stage-1.spec.ts` — OpenAPI 覆盖断言。
- Modify: `docs/platform/openapi-stage-1.yaml` — endpoint、schema、错误和事件枚举。
- Modify: `docs/03-项目当前状态与补全路线.md` — 当前状态证据。
- Modify: `docs/platform/README.md` — 平台基线摘要。

## Task 1: Complete Pure Mobile Exception State

**Files:**

- Modify: `__tests__/driverHomeUtils.test.ts`
- Modify: `src/screens/driver-home/driverHomeUtils.ts`

- [ ] **Step 1: Write failing pure utility tests**

Add imports:

```ts
import {
  canDriverReportException,
  createDriverExceptionRequest,
  driverExceptionTypeOptions,
  getLatestDriverException,
} from '../src/screens/driver-home/driverHomeUtils';
```

Add tests:

```ts
test('builds a normalized driver exception request with proof ids', () => {
  expect(
    createDriverExceptionRequest({
      typeLabel: ' 货物损坏 ',
      description: ' 装货时发现外包装已经破损。 ',
      photoFileIds: [' file-1 ', 'file-1', 'file-2'],
    }),
  ).toEqual({
    typeLabel: '货物损坏',
    description: '装货时发现外包装已经破损。',
    photoCount: 2,
    photoFileIds: ['file-1', 'file-2'],
  });

  expect(
    createDriverExceptionRequest({
      typeLabel: '',
      description: '装货时发现外包装已经破损。',
      photoFileIds: [],
    }),
  ).toBeUndefined();
  expect(
    createDriverExceptionRequest({
      typeLabel: '货物损坏',
      description: '太短',
      photoFileIds: [],
    }),
  ).toBeUndefined();
  expect(
    createDriverExceptionRequest({
      typeLabel: '货物损坏',
      description: '装货时发现外包装已经破损。',
      photoFileIds: Array.from({ length: 7 }, (_, index) => `file-${index}`),
    }),
  ).toBeUndefined();
});

test('exposes stable exception types and execution-state visibility', () => {
  expect(driverExceptionTypeOptions.map(option => option.id)).toEqual([
    'vehicle-failure',
    'traffic-accident',
    'cargo-damage',
    'address-contact',
    'other',
  ]);
  expect(canDriverReportException('loading')).toBe(true);
  expect(canDriverReportException('transporting')).toBe(true);
  expect(canDriverReportException('confirming')).toBe(true);
  expect(canDriverReportException('completed')).toBe(false);
});

test('selects the latest driver exception event', () => {
  const result = getLatestDriverException(
    order({
      events: [
        {
          id: 'e1',
          eventType: 'driver_exception_reported',
          noteText: '车辆故障：发动机异常',
          createdAtIso: '2026-07-11T01:00:00.000Z',
        },
        {
          id: 'e2',
          eventType: 'driver_exception_reported',
          noteText: '货物损坏：外包装破损；图片凭证 2 张',
          attachmentFileIds: ['file-1', 'file-2'],
          createdAtIso: '2026-07-11T02:00:00.000Z',
        },
      ],
    }),
  );

  expect(result?.id).toBe('e2');
  expect(result?.attachmentFileIds).toEqual(['file-1', 'file-2']);
});
```

- [ ] **Step 2: Run the focused utility test and verify RED**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/driverHomeUtils.test.ts
```

Expected: FAIL because `DriverExceptionFormState` does not yet contain `photoFileIds` and `driverExceptionTypeOptions` is not exported.

- [ ] **Step 3: Implement the minimal pure utility model**

Use this shape in `driverHomeUtils.ts`:

```ts
export type DriverExceptionFormState = {
  typeLabel: string;
  description: string;
  photoFileIds: string[];
};

export const driverExceptionTypeOptions = [
  { id: 'vehicle-failure', label: '车辆故障' },
  { id: 'traffic-accident', label: '交通事故' },
  { id: 'cargo-damage', label: '货物损坏' },
  { id: 'address-contact', label: '地址或联系人异常' },
  { id: 'other', label: '其他' },
] as const;

export const emptyExceptionForm: DriverExceptionFormState = {
  typeLabel: '',
  description: '',
  photoFileIds: [],
};
```

Update `createDriverExceptionRequest()` to trim, deduplicate and reject over 6 files:

```ts
const photoFileIds = Array.from(
  new Set(form.photoFileIds.map(fileId => fileId.trim()).filter(Boolean)),
);

if (
  !typeLabel ||
  typeLabel.length > 30 ||
  description.length < 6 ||
  description.length > 200 ||
  photoFileIds.length > 6
) {
  return undefined;
}

return {
  typeLabel,
  description,
  photoCount: photoFileIds.length,
  ...(photoFileIds.length > 0 ? { photoFileIds } : {}),
};
```

- [ ] **Step 4: Run the focused utility test and verify GREEN**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 5: Commit the pure utility slice**

```powershell
git add __tests__/driverHomeUtils.test.ts src/screens/driver-home/driverHomeUtils.ts
git commit -m "feat(mobile): model driver exception reports"
```

## Task 2: Lock Down the Mobile API Adapter

**Files:**

- Modify: `__tests__/platformDriverOrderApi.test.ts`
- Modify: `src/services/platformDriverOrderApi.ts`

- [ ] **Step 1: Write adapter request and rejection tests**

Add:

```ts
it('reports a driver order exception with normalized proof ids', async () => {
  const fetchMock = jest.fn().mockResolvedValue(
    createJsonResponse({
      id: 'order-1',
      status: 'transporting',
      events: [{ id: 'event-1', eventType: 'driver_exception_reported' }],
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const api = createPlatformDriverOrderApi({
    baseUrl: 'http://localhost:3000/api/',
    getAccessToken: () => 'access-token',
  });

  await api.reportException(' order-1 ', {
    typeLabel: ' 货物损坏 ',
    description: ' 装货时发现外包装已经破损。 ',
    photoCount: 2,
    photoFileIds: [' file-1 ', 'file-1', 'file-2'],
  });

  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:3000/api/driver/orders/order-1/exception',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        typeLabel: '货物损坏',
        description: '装货时发现外包装已经破损。',
        photoCount: 2,
        photoFileIds: ['file-1', 'file-2'],
      }),
    }),
  );
});

it.each([
  [null, 'non-object request'],
  [{ typeLabel: '', description: '装货时发现外包装已经破损。' }, 'blank type'],
  [{ typeLabel: '货物损坏', description: '太短' }, 'short description'],
  [
    {
      typeLabel: '货物损坏',
      description: '装货时发现外包装已经破损。',
      photoFileIds: Array.from({ length: 7 }, (_, index) => `file-${index}`),
    },
    'too many files',
  ],
])('rejects invalid driver exception requests before fetch: %s', async request => {
  const fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  const api = createPlatformDriverOrderApi({
    baseUrl: 'http://localhost:3000/api',
    getAccessToken: () => 'access-token',
  });

  await expect(
    api.reportException('order-1', request as never),
  ).rejects.toMatchObject({
    code: 'PLATFORM_DRIVER_ORDER_EXCEPTION_INVALID',
  });
  expect(fetchMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused adapter test**

```powershell
npx jest --runInBand --runTestsByPath __tests__/platformDriverOrderApi.test.ts
```

Expected: the normalized request test may already pass because the worktree contains a partial adapter; invalid edge cases must all pass before continuing. Any failure should identify a missing normalization branch rather than be papered over.

- [ ] **Step 3: Complete adapter normalization**

Ensure `normalizeDriverReportExceptionRequest()`:

- rejects non-object input;
- trims `typeLabel` and `description`;
- rejects description shorter than 6;
- accepts only integer `photoCount` from 0 to 6;
- trims, deduplicates and caps `photoFileIds` at 6;
- throws `PLATFORM_DRIVER_ORDER_EXCEPTION_INVALID` for every local validation failure.

Keep the method signature:

```ts
async reportException(
  orderId: string,
  request: PlatformDriverReportExceptionRequest,
): Promise<PlatformShipperOrder>
```

- [ ] **Step 4: Re-run the adapter test**

Expected: PASS.

- [ ] **Step 5: Commit the adapter slice**

```powershell
git add __tests__/platformDriverOrderApi.test.ts src/services/platformDriverOrderApi.ts
git commit -m "feat(mobile): call driver exception endpoint"
```

## Task 3: Verify and Harden the Backend Vertical Slice

**Files:**

- Modify: `apps/api/src/driver-orders/driver-orders.validation.spec.ts`
- Modify: `apps/api/src/driver-orders/driver-orders.validation.ts`
- Modify: `apps/api/src/driver-orders/driver-orders.controller.spec.ts`
- Modify: `apps/api/src/driver-orders/driver-orders.controller.ts`
- Modify: `apps/api/src/driver-orders/driver-orders.service.spec.ts`
- Modify: `apps/api/src/driver-orders/driver-orders.service.ts`
- Modify: `apps/api/src/driver-orders/dto.ts`
- Modify: `apps/api/src/orders/orders.repository.ts`

- [ ] **Step 1: Add validation coverage**

Import `parseDriverReportExceptionRequest` and add:

```ts
it('parses driver exception requests', () => {
  expect(
    parseDriverReportExceptionRequest({
      typeLabel: ' 货物损坏 ',
      description: ' 装货时发现外包装已经破损。 ',
      photoCount: 2,
      photoFileIds: [' file-1 ', 'file-1', 'file-2'],
    }),
  ).toEqual({
    typeLabel: '货物损坏',
    description: '装货时发现外包装已经破损。',
    photoCount: 2,
    photoFileIds: ['file-1', 'file-2'],
  });

  expect(() =>
    parseDriverReportExceptionRequest({
      typeLabel: '',
      description: '装货时发现外包装已经破损。',
    }),
  ).toThrow('异常类型不能为空');
  expect(() =>
    parseDriverReportExceptionRequest({
      typeLabel: '货物损坏',
      description: '太短',
    }),
  ).toThrow('请至少填写 6 个字的异常说明');
});
```

- [ ] **Step 2: Add service and repository behavior tests**

Add tests that create an accepted loading order and an uploaded `exception` file:

```ts
it('reports an exception without changing the driver order status', async () => {
  const { repository, service, filesRepository } = createService();
  const order = await repository.createOrder(
    'shipper-1',
    createOrderInput('宝安区福永物流园'),
  );
  const proof = await createUploadedFile(filesRepository, 'driver-1', 'exception');
  await repository.acceptDriverOrder(order.id, 'driver-1', {});

  await expect(
    service.reportException(
      { id: 'driver-1', phone: '13900139009', userType: 'driver' },
      order.id,
      {
        typeLabel: '货物损坏',
        description: '装货时发现外包装已经破损。',
        photoCount: 1,
        photoFileIds: [proof.id],
      },
    ),
  ).resolves.toMatchObject({
    status: 'loading',
    events: expect.arrayContaining([
      expect.objectContaining({
        actorUserId: 'driver-1',
        eventType: 'driver_exception_reported',
        noteText: '货物损坏：装货时发现外包装已经破损。；图片凭证 1 张',
        attachmentFileIds: [proof.id],
      }),
    ]),
  });
});
```

Add separate rejection tests for:

```ts
new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在')
new BusinessError(ApiErrorCode.ORDER_STATE_INVALID, '当前司机订单状态不允许上报异常')
new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '异常图片不存在')
new BusinessError(ApiErrorCode.FILE_STATE_INVALID, '异常图片尚未上传完成')
new BusinessError(ApiErrorCode.FILE_PURPOSE_INVALID, '异常图片用途不匹配')
```

- [ ] **Step 3: Add controller coverage**

Add:

```ts
it('reports an exception for the authenticated driver', async () => {
  const service = {
    reportException: jest.fn().mockResolvedValue({
      id: 'order-1',
      status: 'loading',
    }),
  } as unknown as DriverOrdersService;
  const controller = new DriverOrdersController(service);

  await expect(
    controller.reportException(createRequest('driver-1'), 'order-1', {
      typeLabel: ' 货物损坏 ',
      description: ' 装货时发现外包装已经破损。 ',
      photoFileIds: [' file-1 ', 'file-1'],
    }),
  ).resolves.toMatchObject({ code: 'OK' });

  expect(service.reportException).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
    'order-1',
    {
      typeLabel: '货物损坏',
      description: '装货时发现外包装已经破损。',
      photoFileIds: ['file-1'],
    },
  );
});
```

Add a non-driver test proving `AUTH_FORBIDDEN` occurs before service invocation.

- [ ] **Step 4: Run backend focused tests**

```powershell
npm --prefix apps/api test -- driver-orders.validation driver-orders.service driver-orders.controller
```

Expected: PASS after the existing partial implementation is completed. Confirm that the successful service test keeps `status: 'loading'`.

- [ ] **Step 5: Implement only missing backend branches**

Keep the existing endpoint and request type. Ensure:

```ts
if (!isDriverExecutingOrderStatus(order.status)) {
  throw new BusinessError(
    ApiErrorCode.ORDER_STATE_INVALID,
    '当前司机订单状态不允许上报异常',
  );
}
```

For every `photoFileId`, require owner = current driver, `status === 'uploaded'`, and `purpose === 'exception'`. Repository writes:

```ts
{
  actorUserId: driverId,
  eventType: 'driver_exception_reported',
  noteText: createOrderExceptionNote(input),
  attachmentFileIds: input.photoFileIds ?? [],
}
```

Do not update the order status.

- [ ] **Step 6: Re-run focused backend tests**

Expected: PASS.

- [ ] **Step 7: Commit the backend slice**

```powershell
git add apps/api/src/driver-orders apps/api/src/orders/orders.repository.ts
git commit -m "feat(api): report driver order exceptions"
```

## Task 4: Build the Driver Exception UI and Proof Upload

**Files:**

- Modify: `__tests__/DriverHomeScreen.test.tsx`
- Modify: `src/screens/DriverHomeScreen.tsx`

- [ ] **Step 1: Add a reusable mock file API in the screen test**

Add:

```ts
function createMockPlatformFileApi() {
  return {
    createUploadIntent: jest.fn().mockResolvedValue({
      id: 'file-exception-1',
      purpose: 'exception',
      status: 'pending',
      uploadUrl: 'http://localhost:3000/api/files/uploads/file-exception-1',
    }),
    uploadLocalFile: jest.fn().mockResolvedValue(undefined),
    confirmUploaded: jest.fn().mockResolvedValue({
      id: 'file-exception-1',
      purpose: 'exception',
      status: 'uploaded',
    }),
  };
}
```

Match the exact methods required by `confirmPlatformFileUploadIntent()`; reuse an existing file API fixture if the test file already defines one later in the file.

- [ ] **Step 2: Write the failing screen success test**

Create a `loading` order and an updated order with a `driver_exception_reported` event. Render the screen with `platformFileApi`, open the order, then:

```ts
renderer.root
  .findByProps({ testID: 'driver-exception-type-cargo-damage-HY202607110001' })
  .props.onPress();
renderer.root
  .findByProps({ testID: 'driver-exception-description-HY202607110001' })
  .props.onChangeText('  装货时发现外包装已经破损。  ');
```

Upload one proof:

```ts
await renderer.root
  .findByProps({ testID: 'driver-upload-exception-proof-HY202607110001' })
  .props.onPress();
```

Submit and assert:

```ts
expect(platformFileApi.createUploadIntent).toHaveBeenCalledWith({
  purpose: 'exception',
  fileName: '异常凭证-1.png',
  contentType: 'image/png',
  byteSize: 2048,
});
expect(platformDriverOrderApi.reportException).toHaveBeenCalledWith(
  'order-1',
  {
    typeLabel: '货物损坏',
    description: '装货时发现外包装已经破损。',
    photoCount: 1,
    photoFileIds: ['file-exception-1'],
  },
);
expect(getRenderedText(renderer)).toContain('异常已上报，等待客服跟进。');
expect(getRenderedText(renderer)).toContain(
  '最新异常：货物损坏：装货时发现外包装已经破损。；图片凭证 1 张',
);
```

- [ ] **Step 3: Write failing visibility and preservation tests**

Add tests proving:

- `completed` orders do not render `driver-submit-exception-*`.
- invalid descriptions do not call `reportException`.
- `ORDER_STATE_INVALID` keeps description text and shows “当前订单状态不允许上报异常。”
- generic rejection keeps type, description and uploaded proof count.
- the seventh upload is blocked and does not call `createUploadIntent`.

- [ ] **Step 4: Run the focused screen test and verify RED**

```powershell
npx jest --runInBand --runTestsByPath __tests__/DriverHomeScreen.test.tsx
```

Expected: FAIL because no exception controls are rendered and no exception proof upload handler exists.

- [ ] **Step 5: Implement proof upload orchestration**

Add `uploadExceptionProof(order)`:

```ts
const currentForm = exceptionForms[order.orderNo] ?? emptyExceptionForm;
if (currentForm.photoFileIds.length >= 6) {
  setNotice('异常图片最多上传 6 张。');
  return;
}

const intent = await platformFileApi.createUploadIntent({
  purpose: 'exception',
  fileName: `异常凭证-${currentForm.photoFileIds.length + 1}.png`,
  contentType: 'image/png',
  byteSize: 2048,
});
const uploadedFile = await confirmPlatformFileUploadIntent(
  platformFileApi,
  intent,
);
updateExceptionForm(order.orderNo, {
  photoFileIds: [...currentForm.photoFileIds, uploadedFile.id],
});
```

On failure, show “异常凭证上传失败，请稍后重试。” and keep existing form state.

- [ ] **Step 6: Render the exception panel**

Before the receipt controls, calculate:

```ts
const selectedExceptionForm = selectedOrder
  ? exceptionForms[selectedOrder.orderNo] ?? emptyExceptionForm
  : emptyExceptionForm;
const latestDriverException = selectedOrder
  ? getLatestDriverException(selectedOrder)
  : undefined;
```

Render the latest event whenever present:

```tsx
{latestDriverException?.noteText ? (
  <Text style={styles.detailMeta}>
    最新异常：{latestDriverException.noteText}
  </Text>
) : null}
```

When `canDriverReportException(selectedOrder.status)` is true, render:

- one `Pressable` per `driverExceptionTypeOptions` with test ID `driver-exception-type-${option.id}-${orderNo}`;
- description `TextInput` with test ID `driver-exception-description-${orderNo}`;
- proof count text `异常证据：N / 6 张`;
- upload button `driver-upload-exception-proof-${orderNo}`;
- submit button `driver-submit-exception-${orderNo}`.

Use `updateExceptionForm()` for every state change. Do not clear state in any catch branch.

- [ ] **Step 7: Submit photo fields and map auth/file errors**

`submitException()` must send the request returned by `createDriverExceptionRequest()`. Handle:

```ts
AUTH_ACCESS_TOKEN_MISSING -> '登录状态已失效，请重新登录后上报异常。'
ORDER_STATE_INVALID -> '当前订单状态不允许上报异常。'
FILE_NOT_FOUND -> '异常图片不存在，请重新上传。'
FILE_STATE_INVALID -> '异常图片尚未上传完成。'
FILE_PURPOSE_INVALID -> '异常图片用途不匹配，请重新上传。'
fallback -> '异常上报失败，请稍后重试。'
```

- [ ] **Step 8: Re-run the focused screen test**

Expected: PASS.

- [ ] **Step 9: Run mobile exception-related tests together**

```powershell
npx jest --runInBand --runTestsByPath __tests__/driverHomeUtils.test.ts __tests__/platformDriverOrderApi.test.ts __tests__/DriverHomeScreen.test.tsx
```

Expected: 3 suites PASS.

- [ ] **Step 10: Commit the mobile screen slice**

```powershell
git add __tests__/DriverHomeScreen.test.tsx src/screens/DriverHomeScreen.tsx
git commit -m "feat(mobile): complete driver exception reporting"
```

## Task 5: Complete OpenAPI and Status Documentation

**Files:**

- Modify: `apps/api/src/config/openapi-stage-1.spec.ts`
- Modify: `docs/platform/openapi-stage-1.yaml`
- Modify: `docs/03-项目当前状态与补全路线.md`
- Modify: `docs/platform/README.md`

- [ ] **Step 1: Strengthen the OpenAPI coverage test**

Require these strings:

```ts
expect(source).toContain('/driver/orders/{orderId}/exception:');
expect(source).toContain('DriverReportOrderExceptionRequest');
expect(source).toContain('driver_exception_reported');
expect(source).toContain('FILE_PURPOSE_INVALID');
```

- [ ] **Step 2: Run the OpenAPI test**

```powershell
npm --prefix apps/api test -- openapi-stage-1
```

Expected: FAIL if any documented error or schema field is missing.

- [ ] **Step 3: Complete the OpenAPI contract**

Document:

- bearer security;
- path `orderId`;
- request schema with `typeLabel`, `description`, optional `photoCount`, optional `photoFileIds`;
- 200, 401, 403, 404 and 409 responses;
- file validation error codes in the endpoint description/examples;
- `driver_exception_reported` in the event enum.

- [ ] **Step 4: Update platform status docs**

Add a dated entry to `docs/03-项目当前状态与补全路线.md` recording:

- backend endpoint and event;
- mobile form and proof upload;
- tests and verification commands actually run;
- explicit remaining gaps: support ticket, compensation, appeal, notification and financial settlement.

Update `docs/platform/README.md` with the same boundary in its current baseline section.

- [ ] **Step 5: Re-run OpenAPI coverage**

Expected: PASS.

- [ ] **Step 6: Commit docs and contract**

```powershell
git add apps/api/src/config/openapi-stage-1.spec.ts docs/platform/openapi-stage-1.yaml docs/03-项目当前状态与补全路线.md docs/platform/README.md
git commit -m "docs: record driver exception reporting slice"
```

## Task 6: Full Verification and Build Lock Closure

**Files:**

- Modify only if evidence requires: `apps/api/package.json`, `apps/api/tsconfig.json`, or documentation describing an external process lock.

- [ ] **Step 1: Run mobile full gates**

```powershell
npm test -- --runInBand
npx tsc --noEmit
npm run lint
```

Expected: all tests and type checks pass; root lint has no errors. The existing `InvoiceRecords.tsx` `no-void` warning may remain only if it was already present and the lint command exits 0.

- [ ] **Step 2: Run API full gates**

```powershell
npm --prefix apps/api test
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run prisma:validate
```

Expected: every command exits 0.

- [ ] **Step 3: Re-run the official API build**

```powershell
npm run api:build
```

Expected: exit 0 and current `apps/api/dist` output timestamps update.

- [ ] **Step 4: If `EPERM` reproduces, identify the exact lock before changing build config**

Evidence sequence:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Select-Object Id,StartTime,Path
Get-Item apps/api/dist/app.module.d.ts | Select-Object FullName,Attributes,IsReadOnly,LastWriteTime
Get-Acl apps/api/dist/app.module.d.ts | Format-List Owner,AccessToString
```

Then stop only the confirmed project-owned dev/watch process or ask the user to stop it. Do not kill Cursor helper processes and do not change `outDir` merely to dodge the lock. Re-run `npm run api:build` after the lock is released.

- [ ] **Step 5: Review the complete diff**

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors, no diagnostic directories, and only intended feature/doc changes remain.

- [ ] **Step 6: Commit final verification-only changes if any**

If no code or docs changed during verification, do not create an empty commit. If a legitimate build-lock documentation or configuration fix was required:

```powershell
git add <exact-files-changed-for-build-closure>
git commit -m "fix(api): restore reliable build output"
```

## Plan Self Review

- Spec coverage: Tasks 1–5 cover form state, adapter, backend, proof upload, result display, errors, OpenAPI and status docs; Task 6 covers every required gate.
- Placeholder scan: no `TBD`, `TODO`, “implement later”, or unspecified error-handling steps.
- Type consistency: `DriverExceptionFormState.photoFileIds`, `PlatformDriverReportExceptionRequest.photoFileIds`, `DriverReportExceptionRequest.photoFileIds` and `OrderEvent.attachmentFileIds` all use `string[]`.
- Scope check: support tickets, compensation, appeals, notifications and financial settlement remain explicitly excluded.
