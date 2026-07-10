# Driver Execution Proof First Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let drivers upload `receipt`-purpose proof images when advancing accepted orders from `loading -> transporting` and `transporting -> confirming`, and persist those file IDs on the `driver_status_changed` order events.

**Architecture:** Reuse the existing `FileObject` upload flow and existing `OrderEvent.attachmentFileIds` field instead of adding new tables. Extend the driver status advance request with optional `receiptPhotoFileIds`, validate file ownership/status/purpose in `DriverOrdersService`, and write the file IDs to the `driver_status_changed` event in the repository. On mobile, reuse `platformFileApi` inside `DriverHomeScreen` so the driver can upload a receipt proof before tapping the existing status advance button.

**Tech Stack:** React Native, TypeScript, Jest, NestJS, Prisma, Zod, OpenAPI YAML.

> **2026-07-08 收口说明：** 本计划对应实现、测试和文档已经在当前工作区落地，并完成绿色验证。原计划里的 RED 演示步骤没有在收口时重新补跑，所以继续保留未勾选；`git commit` 步骤同样未执行，因为当前工作区还有大量与本任务无关的未提交改动。

---

## Scope Check

This slice only covers:

- driver status advance requests carrying optional `receiptPhotoFileIds`;
- backend validation that proof files belong to the current driver, are `uploaded`, and use `purpose = receipt`;
- persisting those file IDs on `driver_status_changed` events;
- mobile driver upload buttons for “装货凭证” and “到达凭证” before status advance;
- OpenAPI and project status documentation.

This slice does **not** add shipper-side receipt rendering, OCR, maps, location tracking, exception redesign, settlement, or object-storage preview changes. The admin attachment audit already reads generic event `attachmentFileIds`, so this first slice does not need a new admin page.

## File Structure

- Modify `apps/api/src/driver-orders/dto.ts`: add optional `receiptPhotoFileIds` to `DriverAdvanceOrderStatusRequest`.
- Modify `apps/api/src/driver-orders/driver-orders.validation.ts`: validate and normalize receipt proof file IDs.
- Modify `apps/api/src/driver-orders/driver-orders.service.ts`: inject a files repository and validate uploaded `receipt` files before status advance.
- Modify `apps/api/src/driver-orders/driver-orders.module.ts`: provide `PrismaFilesRepository` to the driver orders service.
- Modify `apps/api/src/orders/orders.repository.ts`: write `attachmentFileIds` onto `driver_status_changed` events for both in-memory and Prisma repositories.
- Modify `apps/api/src/driver-orders/driver-orders.validation.spec.ts`: add failing coverage for receipt file ID parsing.
- Modify `apps/api/src/driver-orders/driver-orders.service.spec.ts`: add failing coverage for binding valid receipt files and rejecting invalid ones.
- Modify `apps/api/src/driver-orders/driver-orders.controller.spec.ts`: add controller passthrough coverage for `receiptPhotoFileIds`.
- Modify `src/services/platformDriverOrderApi.ts`: allow optional `receiptPhotoFileIds` in `advanceOrderStatus()`.
- Modify `__tests__/platformDriverOrderApi.test.ts`: add failing adapter coverage for normalized receipt file IDs.
- Modify `src/screens/DriverHomeScreen.tsx`: add upload buttons and local receipt-proof state for the selected driver order.
- Modify `__tests__/DriverHomeScreen.test.tsx`: add failing UI coverage for uploading a receipt and advancing status with the uploaded file ID.
- Modify `docs/platform/openapi-stage-1.yaml`: document `receiptPhotoFileIds` on the driver status request.
- Modify `apps/api/src/config/openapi-stage-1.spec.ts`: assert the OpenAPI text contains the new field.
- Modify `docs/03-项目当前状态与补全路线.md`: record that driver execution evidence is no longer “纯状态推进”，而是补到了装货/到达凭证第一片。

## Task 1: Backend Driver Receipt Proof Binding

**Files:**
- Modify: `apps/api/src/driver-orders/dto.ts`
- Modify: `apps/api/src/driver-orders/driver-orders.validation.ts`
- Modify: `apps/api/src/driver-orders/driver-orders.service.ts`
- Modify: `apps/api/src/driver-orders/driver-orders.module.ts`
- Modify: `apps/api/src/orders/orders.repository.ts`
- Test: `apps/api/src/driver-orders/driver-orders.validation.spec.ts`
- Test: `apps/api/src/driver-orders/driver-orders.service.spec.ts`
- Test: `apps/api/src/driver-orders/driver-orders.controller.spec.ts`

- [x] **Step 1: Write the failing validation test**

```ts
it('parses driver status advance requests with receipt proof file ids', () => {
  expect(
    parseDriverAdvanceOrderStatusRequest({
      nextStatus: 'transporting',
      receiptPhotoFileIds: [' file-receipt-1 ', 'file-receipt-1'],
    }),
  ).toEqual({
    nextStatus: 'transporting',
    receiptPhotoFileIds: ['file-receipt-1'],
  });

  expect(() =>
    parseDriverAdvanceOrderStatusRequest({
      nextStatus: 'transporting',
      receiptPhotoFileIds: [''],
    }),
  ).toThrow('司机执行凭证文件 ID 无效');
});
```

- [ ] **Step 2: Run the validation test and verify RED**

Run:

```powershell
npm --prefix apps/api test -- driver-orders.validation.spec.ts
```

Expected: FAIL because `receiptPhotoFileIds` is not part of `DriverAdvanceOrderStatusRequest` or the parser output yet.

- [x] **Step 3: Implement the minimal DTO and validation**

```ts
// apps/api/src/driver-orders/dto.ts
export type DriverAdvanceOrderStatusRequest = {
  nextStatus: Extract<DriverExecutingOrderStatus, 'transporting' | 'confirming'>;
  receiptPhotoFileIds?: string[];
};

// apps/api/src/driver-orders/driver-orders.validation.ts
const optionalReceiptPhotoFileIdsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, '司机执行凭证文件 ID 无效')
      .max(120, '司机执行凭证文件 ID 无效'),
  )
  .max(6, '司机执行凭证最多 6 张')
  .optional()
  .transform(value =>
    value === undefined ? undefined : Array.from(new Set(value.map(fileId => fileId.trim()))),
  );

export const driverAdvanceOrderStatusSchema = z.object({
  nextStatus: z.enum(driverStatusAdvanceTargets, {
    message: '司机订单目标状态无效',
  }),
  receiptPhotoFileIds: optionalReceiptPhotoFileIdsSchema,
});
```

- [x] **Step 4: Write the failing service and controller tests**

```ts
// apps/api/src/driver-orders/driver-orders.service.spec.ts
it('binds uploaded receipt files to driver status advance events', async () => {
  const { repository, service, filesRepository } = createService();
  const order = await repository.createOrder('shipper-1', createOrderInput('宝安区福永物流园'));
  const receiptFile = await createUploadedFile(filesRepository, 'driver-1', 'receipt');
  await repository.acceptDriverOrder(order.id, 'driver-1', {});

  await expect(
    service.advanceOrderStatus(
      { id: 'driver-1', phone: '13900139009', userType: 'driver' },
      order.id,
      {
        nextStatus: 'transporting',
        receiptPhotoFileIds: [receiptFile.id],
      },
    ),
  ).resolves.toMatchObject({
    status: 'transporting',
    events: expect.arrayContaining([
      expect.objectContaining({
        eventType: 'driver_status_changed',
        attachmentFileIds: [receiptFile.id],
      }),
    ]),
  });
});

it('rejects driver status advance proofs owned by another user', async () => {
  const { repository, service, filesRepository } = createService();
  const order = await repository.createOrder('shipper-1', createOrderInput('宝安区福永物流园'));
  const receiptFile = await createUploadedFile(filesRepository, 'driver-2', 'receipt');
  await repository.acceptDriverOrder(order.id, 'driver-1', {});

  await expect(
    service.advanceOrderStatus(
      { id: 'driver-1', phone: '13900139009', userType: 'driver' },
      order.id,
      {
        nextStatus: 'transporting',
        receiptPhotoFileIds: [receiptFile.id],
      },
    ),
  ).rejects.toMatchObject(
    new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '司机执行凭证不存在'),
  );
});

// apps/api/src/driver-orders/driver-orders.controller.spec.ts
it('passes receiptPhotoFileIds through the advance status endpoint', async () => {
  const service = {
    advanceOrderStatus: jest.fn().mockResolvedValue({
      id: 'order-1',
      status: 'transporting',
    }),
  } as unknown as DriverOrdersService;
  const controller = new DriverOrdersController(service);

  await controller.advanceOrderStatus(createRequest('driver-1'), 'order-1', {
    nextStatus: 'transporting',
    receiptPhotoFileIds: ['file-receipt-1'],
  });

  expect(service.advanceOrderStatus).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'driver-1' }),
    'order-1',
    {
      nextStatus: 'transporting',
      receiptPhotoFileIds: ['file-receipt-1'],
    },
  );
});

async function createUploadedFile(
  filesRepository: InMemoryFilesRepository,
  ownerUserId: string,
  purpose: 'receipt' | 'cargo' = 'receipt',
) {
  const pendingFile = await filesRepository.createPendingFile(ownerUserId, {
    purpose,
    fileName: `${purpose}.png`,
    contentType: 'image/png',
    byteSize: 2048,
    objectKey: `${ownerUserId}/${purpose}/${purpose}.png`,
  });

  return filesRepository.markFileUploaded(pendingFile.id, ownerUserId, {});
}
```

- [ ] **Step 5: Run the backend tests and verify RED**

Run:

```powershell
npm --prefix apps/api test -- driver-orders
```

Expected: FAIL because service/module/repository/controller do not yet handle `receiptPhotoFileIds`.

- [x] **Step 6: Implement the minimal backend wiring**

```ts
// apps/api/src/driver-orders/driver-orders.service.ts
export class DriverOrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly certificationRepository: DriverCertificationRepository,
    private readonly filesRepository?: FilesRepository,
  ) {}

  async advanceOrderStatus(
    currentUser: AuthenticatedUser,
    orderId: string,
    input: DriverAdvanceOrderStatusRequest,
  ) {
    this.assertDriver(currentUser);
    const order = await this.getOrder(currentUser, orderId);

    if (!canDriverAdvanceOrderStatus(order.status, input.nextStatus)) {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前司机订单状态不允许推进到目标状态',
      );
    }

    await this.assertReceiptProofFiles(currentUser.id, input.receiptPhotoFileIds);

    return this.ordersRepository.advanceDriverOrderStatus(
      order.id,
      currentUser.id,
      input,
    );
  }

  private async assertReceiptProofFiles(driverId: string, fileIds: string[] | undefined) {
    if (!fileIds?.length) {
      return;
    }

    if (!this.filesRepository) {
      throw new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '司机执行凭证不存在');
    }

    for (const fileId of fileIds) {
      const file = await this.filesRepository.findFileByIdAndOwner(fileId, driverId);

      if (!file) {
        throw new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '司机执行凭证不存在');
      }

      if (file.status !== 'uploaded') {
        throw new BusinessError(ApiErrorCode.FILE_STATE_INVALID, '司机执行凭证尚未上传完成');
      }

      if (file.purpose !== 'receipt') {
        throw new BusinessError(ApiErrorCode.FILE_PURPOSE_INVALID, '司机执行凭证用途不匹配');
      }
    }
  }
}

// apps/api/src/orders/orders.repository.ts
order.events.push({
  id: `event-${this.orders.length}-${order.events.length + 1}`,
  actorUserId: driverId,
  eventType: 'driver_status_changed',
  noteText: createDriverStatusAdvanceNote(input.nextStatus),
  attachmentFileIds: input.receiptPhotoFileIds ?? [],
  createdAtIso: nowIso,
});

// apps/api/src/driver-orders/driver-orders.module.ts
{
  provide: PrismaFilesRepository,
  useFactory: (prismaService: PrismaService) =>
    new PrismaFilesRepository(prismaService as unknown as PrismaFilesClient),
  inject: [PrismaService],
},
{
  provide: DriverOrdersService,
  useFactory: (
    repository: PrismaOrdersRepository,
    certificationRepository: PrismaDriverCertificationRepository,
    filesRepository: PrismaFilesRepository,
  ) => new DriverOrdersService(repository, certificationRepository, filesRepository),
  inject: [
    PrismaOrdersRepository,
    PrismaDriverCertificationRepository,
    PrismaFilesRepository,
  ],
},
```

- [x] **Step 7: Run backend verification and verify GREEN**

Run:

```powershell
npm --prefix apps/api test -- driver-orders
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
```

Expected: PASS.

- [ ] **Step 8: Commit the backend slice**

```powershell
git add apps/api/src/driver-orders/dto.ts apps/api/src/driver-orders/driver-orders.validation.ts apps/api/src/driver-orders/driver-orders.service.ts apps/api/src/driver-orders/driver-orders.module.ts apps/api/src/orders/orders.repository.ts apps/api/src/driver-orders/driver-orders.validation.spec.ts apps/api/src/driver-orders/driver-orders.service.spec.ts apps/api/src/driver-orders/driver-orders.controller.spec.ts
git commit -m "feat: bind driver execution receipt proofs"
```

## Task 2: Mobile Driver Status Adapter

**Files:**
- Modify: `src/services/platformDriverOrderApi.ts`
- Test: `__tests__/platformDriverOrderApi.test.ts`

- [x] **Step 1: Write the failing adapter test**

```ts
it('advances current driver order status with normalized receipt proof file ids', async () => {
  const fetchMock = jest.fn().mockResolvedValue(
    createJsonResponse({ id: 'order-1', status: 'transporting' }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const api = createPlatformDriverOrderApi({
    baseUrl: 'http://localhost:3000/api',
    getAccessToken: () => 'access-token',
  });

  await api.advanceOrderStatus(' order-1 ', {
    nextStatus: 'transporting',
    receiptPhotoFileIds: [' file-receipt-1 ', 'file-receipt-1'],
  });

  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:3000/api/driver/orders/order-1/status',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        nextStatus: 'transporting',
        receiptPhotoFileIds: ['file-receipt-1'],
      }),
    }),
  );
});
```

- [ ] **Step 2: Run the adapter test and verify RED**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/platformDriverOrderApi.test.ts
```

Expected: FAIL because `receiptPhotoFileIds` is not part of the request type or normalization logic yet.

- [x] **Step 3: Implement the minimal adapter change**

```ts
export type PlatformDriverAdvanceOrderStatusRequest = {
  nextStatus: Extract<
    PlatformDriverExecutingOrderStatus,
    'transporting' | 'confirming'
  >;
  receiptPhotoFileIds?: string[];
};

function normalizeDriverAdvanceOrderStatusRequest(
  request: PlatformDriverAdvanceOrderStatusRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throwInvalidStatusRequest('Platform driver status request must be an object');
  }

  if (!DRIVER_ADVANCE_ORDER_STATUSES.includes(request.nextStatus)) {
    throwInvalidStatusRequest('Platform driver nextStatus is invalid');
  }

  const receiptPhotoFileIds = normalizeOptionalDriverFileIds(
    request.receiptPhotoFileIds,
    'PLATFORM_DRIVER_ORDER_STATUS_INVALID',
  );

  return {
    nextStatus: request.nextStatus,
    ...(receiptPhotoFileIds === undefined ? {} : { receiptPhotoFileIds }),
  };
}

function normalizeOptionalDriverFileIds(
  value: unknown,
  errorCode: 'PLATFORM_DRIVER_ORDER_STATUS_INVALID',
) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length > 6) {
    throw new PlatformApiError(
      'Platform driver receiptPhotoFileIds are invalid',
      errorCode,
      0,
    );
  }

  return Array.from(
    new Set(
      value.map(fileId => {
        if (typeof fileId !== 'string') {
          throw new PlatformApiError(
            'Platform driver receiptPhotoFileIds must be strings',
            errorCode,
            0,
          );
        }

        const normalizedFileId = fileId.trim();

        if (!normalizedFileId || normalizedFileId.length > 120) {
          throw new PlatformApiError(
            'Platform driver receiptPhotoFileIds are invalid',
            errorCode,
            0,
          );
        }

        return normalizedFileId;
      }),
    ),
  );
}
```

- [x] **Step 4: Run adapter verification and verify GREEN**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/platformDriverOrderApi.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit the adapter slice**

```powershell
git add src/services/platformDriverOrderApi.ts __tests__/platformDriverOrderApi.test.ts
git commit -m "feat: send driver receipt proof ids"
```

## Task 3: Mobile Driver Receipt Upload UX

**Files:**
- Modify: `src/screens/DriverHomeScreen.tsx`
- Test: `__tests__/DriverHomeScreen.test.tsx`

- [x] **Step 1: Write the failing UI test**

```tsx
it('uploads a loading receipt proof before advancing the selected driver order', async () => {
  const order = {
    id: 'order-1',
    orderNo: 'HY202607070001',
    status: 'loading' as const,
    pickupAddress: '宝安区福永物流园',
    deliveryAddress: '龙岗区坂田仓',
    cargoType: 'build',
    weightText: '2.5 吨',
    quantityText: '12 箱',
    pickupContact: '赵经理',
    pickupPhone: '13900139001',
    deliveryContact: '钱店长',
    deliveryPhone: '13900139002',
    vehicleRequirement: 'medium',
    createdAtIso: '2026-07-07T08:00:00.000Z',
    updatedAtIso: '2026-07-07T08:00:00.000Z',
    needTailboard: false,
    needTarp: false,
    pickupTimeIso: '2026-07-07T09:00:00.000Z',
    pricingMode: 'fixed' as const,
    priceCents: 76000,
    paymentMethod: 'cod' as const,
    shipperId: 'shipper-1',
    events: [],
  };

  const platformDriverOrderApi = createMockDriverOrderApi();
  platformDriverOrderApi.listMyOrders.mockResolvedValue({
    items: [order],
    page: 1,
    pageSize: 20,
    total: 1,
  });
  platformDriverOrderApi.getOrder.mockResolvedValue(order);
  platformDriverOrderApi.advanceOrderStatus.mockResolvedValue({
    ...order,
    status: 'transporting',
    events: [
      {
        id: 'event-driver-status-1',
        eventType: 'driver_status_changed',
        attachmentFileIds: ['file-receipt-1'],
        createdAtIso: '2026-07-07T08:05:00.000Z',
      },
    ],
  });

  const platformFileApi = {
    createUploadIntent: jest.fn().mockResolvedValue({
      id: 'file-receipt-1',
      ownerUserId: 'driver-1',
      purpose: 'receipt',
      objectKey: 'driver-1/receipt/file-receipt-1.png',
      status: 'pending',
      uploadUrl: 'http://localhost:3000/api/files/uploads/file-receipt-1',
      expiresAtIso: '2026-07-07T08:15:00.000Z',
      createdAtIso: '2026-07-07T08:00:00.000Z',
    }),
    confirmLocalUploadTarget: jest.fn().mockResolvedValue({
      id: 'file-receipt-1',
      ownerUserId: 'driver-1',
      purpose: 'receipt',
      objectKey: 'driver-1/receipt/file-receipt-1.png',
      status: 'uploaded',
      createdAtIso: '2026-07-07T08:00:00.000Z',
    }),
    confirmUploaded: jest.fn(),
  };

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <DriverHomeScreen
        platformDriverOrderApi={platformDriverOrderApi}
        platformDriverCertificationApi={createMockDriverCertificationApi()}
        platformFileApi={platformFileApi}
        onLogout={jest.fn()}
      />,
    );
    await flushMicrotasks();
  });

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({ testID: 'driver-open-order-HY202607070001' }).props.onPress();
    await flushMicrotasks();
  });

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({ testID: 'driver-upload-receipt-HY202607070001' }).props.onPress();
    await flushMicrotasks();
  });

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({ testID: 'driver-advance-status-HY202607070001' }).props.onPress();
    await flushMicrotasks();
  });

  expect(platformDriverOrderApi.advanceOrderStatus).toHaveBeenCalledWith(
    'order-1',
    {
      nextStatus: 'transporting',
      receiptPhotoFileIds: ['file-receipt-1'],
    },
  );
});
```

- [ ] **Step 2: Run the UI test and verify RED**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/DriverHomeScreen.test.tsx
```

Expected: FAIL because the driver screen does not yet keep receipt-proof state or send it with `advanceOrderStatus()`.

- [x] **Step 3: Implement the minimal screen behavior**

```tsx
type DriverExecutionProofState = Record<
  string,
  {
    transportingReceiptFileIds: string[];
    confirmingReceiptFileIds: string[];
  }
>;

const [executionProofs, setExecutionProofs] = useState<DriverExecutionProofState>({});

const uploadExecutionReceipt = async (order: PlatformShipperOrder) => {
  if (!platformFileApi) {
    setNotice('司机执行凭证上传需要平台文件 API 配置。');
    return;
  }

  const fileName = order.status === 'loading' ? '装货凭证.png' : '到达凭证.png';
  const intent = await platformFileApi.createUploadIntent({
    purpose: 'receipt',
    fileName,
    contentType: 'image/png',
    byteSize: 2048,
  });
  const uploadedFile = await confirmPlatformFileUploadIntent(platformFileApi, intent);

  setExecutionProofs(current => ({
    ...current,
    [order.id]: order.status === 'loading'
      ? {
          transportingReceiptFileIds: [uploadedFile.id],
          confirmingReceiptFileIds: current[order.id]?.confirmingReceiptFileIds ?? [],
        }
      : {
          transportingReceiptFileIds: current[order.id]?.transportingReceiptFileIds ?? [],
          confirmingReceiptFileIds: [uploadedFile.id],
        },
  }));
  setNotice(order.status === 'loading' ? '装货凭证已关联平台文件。' : '到达凭证已关联平台文件。');
};

platformDriverOrderApi.advanceOrderStatus(selectedOrder.id, {
  nextStatus,
  ...(selectedOrder.status === 'loading'
    ? { receiptPhotoFileIds: executionProofs[selectedOrder.id]?.transportingReceiptFileIds ?? [] }
    : { receiptPhotoFileIds: executionProofs[selectedOrder.id]?.confirmingReceiptFileIds ?? [] }),
});
```

- [x] **Step 4: Run UI verification and verify GREEN**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/DriverHomeScreen.test.tsx
npx tsc --noEmit
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit the mobile screen slice**

```powershell
git add src/screens/DriverHomeScreen.tsx __tests__/DriverHomeScreen.test.tsx
git commit -m "feat: upload driver execution receipt proofs"
```

## Task 4: OpenAPI, Status Docs, and Full Verification

**Files:**
- Modify: `docs/platform/openapi-stage-1.yaml`
- Modify: `apps/api/src/config/openapi-stage-1.spec.ts`
- Modify: `docs/03-项目当前状态与补全路线.md`

- [x] **Step 1: Write the failing OpenAPI expectation**

```ts
it('documents receiptPhotoFileIds on the driver status advance request', () => {
  const source = readFileSync(openApiPath, 'utf8');

  expect(source).toContain('/driver/orders/{orderId}/status:');
  expect(source).toContain('receiptPhotoFileIds');
  expect(source).toContain('Driver execution receipt proof file ids');
  expect(source).toContain('use receipt purpose');
});
```

- [ ] **Step 2: Run the OpenAPI test and verify RED**

Run:

```powershell
npm --prefix apps/api test -- openapi-stage-1.spec.ts
```

Expected: FAIL because the YAML does not yet mention `receiptPhotoFileIds`.

- [x] **Step 3: Implement docs updates**

```yaml
DriverAdvanceOrderStatusRequest:
  type: object
  required:
    - nextStatus
  properties:
    nextStatus:
      type: string
      enum: [transporting, confirming]
    receiptPhotoFileIds:
      type: array
      maxItems: 6
      items:
        type: string
      description: Driver execution receipt proof file ids, use receipt purpose.
```

```md
- 司机执行第一片已从“只改状态”推进到“状态推进 + 装货/到达凭证第一片”：司机推进 `loading -> transporting -> confirming` 时可上传 `receipt` 用途执行凭证，后端会校验附件属于当前司机、状态为 `uploaded` 且用途为 `receipt`，再把文件 ID 记录到 `driver_status_changed` 事件的 `attachmentFileIds`；后台订单附件审计已能直接看到这些执行凭证，因为它本来就会汇总订单事件附件。
```

- [x] **Step 4: Run full verification and verify GREEN**

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

Result on 2026-07-08: PASS. `npm test -- --runInBand` passed with 32 suites / 548 tests; `npm --prefix apps/api test` passed with 48 suites / 469 tests; `npx tsc --noEmit`, `npm run lint`, `npm --prefix apps/api run typecheck`, `npm --prefix apps/api run lint`, `npm --prefix apps/api run prisma:validate`, and `npm run api:build` also passed.

Run only when PostgreSQL is reachable:

```powershell
npm --prefix apps/api run db:postgres:doctor
npm --prefix apps/api run db:postgres:bootstrap
```

Expected on the current machine until Docker/PostgreSQL is available: `db:postgres:doctor` continues to fail with missing Docker CLI and unreachable `localhost:5432`.

- [ ] **Step 5: Commit docs and verification updates**

```powershell
git add docs/platform/openapi-stage-1.yaml apps/api/src/config/openapi-stage-1.spec.ts docs/03-项目当前状态与补全路线.md
git commit -m "docs: record driver execution proof slice"
```

## Self-Review

- Spec coverage: the plan covers backend validation, repository persistence, mobile adapter, driver UI upload flow, and docs.
- Placeholder scan: no占位词残留；每个任务都给了明确文件、测试命令和具体代码形状。
- Type consistency: `receiptPhotoFileIds` is used consistently across driver DTOs, repository writes, adapter requests, screen state, and OpenAPI text.
