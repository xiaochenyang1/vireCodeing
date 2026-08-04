import type {
  DriverAcceptOrderEventPayload,
  DriverEvaluateShipperRequest,
} from '../driver-orders/dto';
import { ApiErrorCode } from '../common/errors';
import type { FileUploadRecord } from '../files/dto';
import type { FilesRepository } from '../files/files.repository';
import {
  createAdminOrderBatchCancelFingerprint,
  createDriverEvaluationReplyFingerprint,
  createDriverShipperEvaluationFingerprint,
  createOrderCreateFingerprint,
  createOrderMutationFingerprint,
  createShipperDriverEvaluationFingerprint,
} from './order-mutation-idempotency';
import type {
  BatchCancelAdminOrdersRequest,
  CreateShipperOrderRequest,
  SubmitShipperOrderEvaluationRequest,
} from './dto';
import type { ShipperCouponRecord } from '../profile-coupons/dto';
import {
  InMemoryProfileCouponsStore,
  type PrismaShipperCouponRecord,
} from '../profile-coupons/profile-coupons.repository';
import { InMemoryFinancialStore } from '../payments/in-memory-financial.store';
import {
  type ExecuteAdminBatchCancelInput,
  type ExecuteOrderCreateInput,
  type ExecuteOrderMutationInput,
  InMemoryOrdersRepository,
  type PrismaOrderRecord,
  type PrismaOrdersClient,
  PrismaOrdersRepository,
} from './orders.repository';

describe('InMemoryOrdersRepository order create idempotency', () => {
  const now = new Date('2026-07-14T08:00:00.000Z');

  it('replays one create without duplicating the order or event', async () => {
    const repository = new InMemoryOrdersRepository(() => now);
    const request = createOrderInput();
    const input = createIdempotentCreateInput(request);

    const first = await repository.executeIdempotentOrderCreate(input);
    const replay = await repository.executeIdempotentOrderCreate(input);
    const listed = await repository.listOrders('shipper-1', {
      page: 1,
      pageSize: 20,
    });

    expect(first).toMatchObject({ kind: 'success', replayed: false });
    expect(replay).toEqual({ ...first, replayed: true });
    expect(listed).toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          events: [expect.objectContaining({ eventType: 'created' })],
        }),
      ],
    });
  });

  it('publishes no staged state when coupon reservation fails', async () => {
    const couponStore = new InMemoryProfileCouponsStore({
      coupons: [createCoupon({ status: 'locked' })],
    });
    const repository = new InMemoryOrdersRepository(() => now, couponStore);
    const request = createOrderInput({
      couponId: 'coupon-1',
      couponTitle: '满 300 减 30',
      couponDiscountCents: 3000,
      payablePriceCents: 47000,
    });

    await expect(
      repository.executeIdempotentOrderCreate(
        createIdempotentCreateInput(request),
      ),
    ).rejects.toMatchObject({ code: 'PROFILE_COUPON_NOT_AVAILABLE' });
    await expect(
      repository.listOrders('shipper-1', { page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({ total: 0, items: [] });
    expect(
      (
        repository as unknown as {
          orderIdempotencyRecords: unknown[];
        }
      ).orderIdempotencyRecords,
    ).toHaveLength(0);
    expect(couponStore.clone()[0]).toMatchObject({ status: 'locked' });
  });
});

describe('PrismaOrdersRepository order create idempotency', () => {
  const now = new Date('2026-07-14T08:00:00.000Z');

  it('creates the order, event, idempotency snapshot and coupon lock in one transaction', async () => {
    const request = createOrderInput({
      couponId: 'coupon-1',
      couponTitle: '满 300 减 30',
      couponDiscountCents: 3000,
      payablePriceCents: 73000,
    });
    const created = createPrismaOrderRecord(request, now);
    const { repository, prisma, transaction } = createPrismaCreateHarness(
      created,
      now,
    );
    transaction.shipperCoupon.findFirst.mockResolvedValue({
      id: 'coupon-1',
      shipperId: 'shipper-1',
      title: '满 300 减 30',
      status: 'usable',
      conditionText: '订单满 300 元可用',
      discountCents: 3000,
      minOrderAmountCents: 30000,
      validFrom: new Date('2026-07-01T00:00:00.000Z'),
      validUntil: new Date('2026-08-01T00:00:00.000Z'),
      sourceText: '测试发放',
      issuedAt: new Date('2026-07-01T00:00:00.000Z'),
      lockedOrderNo: null,
      lockedAt: null,
      usedOrderNo: null,
      usedAt: null,
    });

    await expect(
      repository.executeIdempotentOrderCreate(
        createIdempotentCreateInput(request),
      ),
    ).resolves.toMatchObject({
      kind: 'success',
      replayed: false,
      order: expect.objectContaining({ id: 'order-created' }),
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.order.create).toHaveBeenCalledTimes(1);
    expect(transaction.orderIdempotencyRecord.create).toHaveBeenCalledTimes(1);
    expect(transaction.shipperCoupon.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'coupon-1',
          shipperId: 'shipper-1',
          status: 'usable',
        }),
        data: expect.objectContaining({
          status: 'locked',
          lockedOrderNo: created.orderNo,
        }),
      }),
    );
    expect(transaction.orderIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'idempotency-created' },
        data: { responseSnapshot: expect.objectContaining({ id: created.id }) },
      }),
    );
    expect(
      transaction.orderIdempotencyRecord.create.mock.invocationCallOrder[0],
    ).toBeLessThan(
      transaction.shipperCoupon.updateMany.mock.invocationCallOrder[0],
    );
  });

  it('does not replay an unrelated unique constraint violation', async () => {
    const request = createOrderInput();
    const created = createPrismaOrderRecord(request, now);
    const { repository, prisma } = createPrismaCreateHarness(created, now);
    const uniqueError = { code: 'P2002', meta: { target: ['orderNo'] } };
    prisma.$transaction.mockRejectedValueOnce(uniqueError);
    prisma.orderIdempotencyRecord.findUnique.mockResolvedValueOnce(null);

    await expect(
      repository.executeIdempotentOrderCreate(
        createIdempotentCreateInput(request),
      ),
    ).rejects.toBe(uniqueError);
    expect(prisma.orderIdempotencyRecord.findUnique).toHaveBeenCalledWith({
      where: {
        OrderIdempotencyRecord_actor_operation_key_unique: {
          actorUserId: 'shipper-1',
          operation: 'shipper_create',
          idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        },
      },
    });
  });

  it.each([
    {
      name: 'replays the committed response for the same fingerprint',
      requestFingerprint: undefined,
      expiresAt: new Date('2026-07-15T08:00:00.000Z'),
      expected: {
        kind: 'success',
        replayed: true,
        order: expect.objectContaining({ id: 'order-created' }),
      },
    },
    {
      name: 'returns key-reused before checking an expired record',
      requestFingerprint: 'different-fingerprint',
      expiresAt: new Date('2026-07-14T07:59:59.000Z'),
      expected: { kind: 'key-reused' },
    },
    {
      name: 'returns key-expired for the same fingerprint',
      requestFingerprint: undefined,
      expiresAt: new Date('2026-07-14T07:59:59.000Z'),
      expected: { kind: 'key-expired' },
    },
  ])('$name after a P2002 reservation race', async testCase => {
    const request = createOrderInput();
    const input = createIdempotentCreateInput(request);
    const created = createPrismaOrderRecord(request, now);
    const snapshot = createOrderSnapshot(request, created);
    const { repository, prisma } = createPrismaCreateHarness(created, now);
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    prisma.orderIdempotencyRecord.findUnique.mockResolvedValueOnce({
      id: 'idempotency-existing',
      actorUserId: input.actorUserId,
      orderId: created.id,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint:
        testCase.requestFingerprint ?? input.requestFingerprint,
      responseSnapshot: snapshot,
      createdAt: now,
      expiresAt: testCase.expiresAt,
    });

    await expect(
      repository.executeIdempotentOrderCreate(input),
    ).resolves.toEqual(testCase.expected);
  });

  it('returns an existing create before reading the coupon or allocating an order number', async () => {
    const request = createOrderInput({
      couponId: 'coupon-1',
      couponTitle: '满 300 减 30',
      couponDiscountCents: 3000,
      payablePriceCents: 73000,
    });
    const input = createIdempotentCreateInput(request);
    const created = createPrismaOrderRecord(request, now);
    const snapshot = createOrderSnapshot(request, created);
    const { repository, transaction } = createPrismaCreateHarness(created, now);
    transaction.orderIdempotencyRecord.findUnique.mockResolvedValueOnce({
      id: 'idempotency-existing',
      actorUserId: input.actorUserId,
      orderId: created.id,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      responseSnapshot: snapshot,
      createdAt: now,
      expiresAt: new Date(input.expiresAtIso),
    });

    await expect(
      repository.executeIdempotentOrderCreate(input),
    ).resolves.toEqual({
      kind: 'success',
      replayed: true,
      order: snapshot,
    });

    expect(transaction.shipperCoupon.findFirst).not.toHaveBeenCalled();
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
    expect(transaction.order.create).not.toHaveBeenCalled();
    expect(transaction.orderIdempotencyRecord.create).not.toHaveBeenCalled();
  });

  it('aborts before snapshot publication when the coupon compare-and-set loses', async () => {
    const request = createOrderInput({
      couponId: 'coupon-1',
      couponTitle: '满 300 减 30',
      couponDiscountCents: 3000,
      payablePriceCents: 73000,
    });
    const created = createPrismaOrderRecord(request, now);
    const { repository, transaction } = createPrismaCreateHarness(created, now);
    transaction.shipperCoupon.findFirst.mockResolvedValue(
      createPrismaCouponRecord(),
    );
    transaction.shipperCoupon.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      repository.executeIdempotentOrderCreate(
        createIdempotentCreateInput(request),
      ),
    ).rejects.toMatchObject({ code: 'PROFILE_COUPON_NOT_AVAILABLE' });

    expect(transaction.orderIdempotencyRecord.create).toHaveBeenCalledTimes(1);
    expect(transaction.orderIdempotencyRecord.update).not.toHaveBeenCalled();
    expect(transaction.order.findUnique).not.toHaveBeenCalled();
  });

  it('propagates a response snapshot write failure from the transaction', async () => {
    const request = createOrderInput();
    const created = createPrismaOrderRecord(request, now);
    const { repository, transaction } = createPrismaCreateHarness(created, now);
    const snapshotError = new Error('snapshot write failed');
    transaction.orderIdempotencyRecord.update.mockRejectedValueOnce(
      snapshotError,
    );

    await expect(
      repository.executeIdempotentOrderCreate(
        createIdempotentCreateInput(request),
      ),
    ).rejects.toBe(snapshotError);
  });

  it('fails closed when the persisted coupon status is unknown', async () => {
    const request = createOrderInput({
      couponId: 'coupon-1',
      couponTitle: '满 300 减 30',
      couponDiscountCents: 3000,
      payablePriceCents: 73000,
    });
    const created = createPrismaOrderRecord(request, now);
    const { repository, transaction } = createPrismaCreateHarness(created, now);
    transaction.shipperCoupon.findFirst.mockResolvedValue(
      createPrismaCouponRecord({ status: 'corrupted-status' }),
    );

    await expect(
      repository.executeIdempotentOrderCreate(
        createIdempotentCreateInput(request),
      ),
    ).rejects.toMatchObject({ code: 'PROFILE_COUPON_NOT_AVAILABLE' });

    expect(transaction.$queryRaw).not.toHaveBeenCalled();
    expect(transaction.order.create).not.toHaveBeenCalled();
    expect(transaction.shipperCoupon.updateMany).not.toHaveBeenCalled();
  });
});

describe('PrismaOrdersRepository order coupon mutations', () => {
  const currentNow = new Date('2026-07-14T08:00:00.000Z');
  const mutationNow = new Date('2026-07-14T08:00:01.000Z');

  it('reserves coupon B before releasing coupon A and updating the order', async () => {
    const currentInput = createOrderInput({
      couponId: 'coupon-1',
      couponTitle: '满 300 减 30',
      couponDiscountCents: 3000,
      payablePriceCents: 73000,
    });
    const nextInput = createOrderInput({
      couponId: 'coupon-2',
      couponTitle: '满 500 减 50',
      couponDiscountCents: 5000,
      payablePriceCents: 71000,
    });
    const current = createPrismaOrderRecord(currentInput, currentNow);
    const updated = createPrismaOrderRecord(nextInput, mutationNow);
    const { repository, transaction } = createPrismaMutationHarness(
      current,
      updated,
      mutationNow,
    );
    transaction.shipperCoupon.findFirst.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'coupon-2'
          ? createPrismaCouponRecord({
              id: 'coupon-2',
              title: '满 500 减 50',
              discountCents: 5000,
              minOrderAmountCents: 50000,
            })
          : createPrismaCouponRecord({
              status: 'locked',
              lockedOrderNo: current.orderNo,
            }),
      ),
    );

    await expect(
      repository.executeIdempotentOrderMutation(
        createShipperUpdateMutationInput(
          current.id,
          current.updatedAt.toISOString(),
          nextInput,
        ),
      ),
    ).resolves.toMatchObject({
      kind: 'success',
      order: expect.objectContaining({ couponId: 'coupon-2' }),
    });

    expect(transaction.shipperCoupon.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'coupon-2',
        shipperId: 'shipper-1',
        status: 'usable',
      },
      data: {
        status: 'locked',
        lockedOrderNo: current.orderNo,
        lockedAt: mutationNow,
        usedOrderNo: null,
        usedAt: null,
      },
    });
    expect(transaction.shipperCoupon.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'coupon-1',
        shipperId: 'shipper-1',
        status: 'locked',
        OR: [{ lockedOrderNo: current.orderNo }, { lockedOrderNo: null }],
      },
      data: {
        status: 'usable',
        lockedOrderNo: null,
        lockedAt: null,
        usedOrderNo: null,
        usedAt: null,
      },
    });
    expect(
      transaction.orderIdempotencyRecord.create.mock.invocationCallOrder[0],
    ).toBeLessThan(
      transaction.shipperCoupon.updateMany.mock.invocationCallOrder[0],
    );
    expect(
      transaction.shipperCoupon.updateMany.mock.invocationCallOrder[1],
    ).toBeLessThan(transaction.order.updateMany.mock.invocationCallOrder[0]);
  });

  it.each([
    {
      name: 'releases on cancel',
      currentStatus: 'waiting' as const,
      nextStatus: 'cancelled' as const,
      createInput: (order: PrismaOrderRecord) =>
        createCancelMutationInput(order.id, order.updatedAt.toISOString()),
      expectedData: {
        status: 'usable',
        lockedOrderNo: null,
        lockedAt: null,
        usedOrderNo: null,
        usedAt: null,
      },
    },
    {
      name: 'redeems on complete',
      currentStatus: 'confirming' as const,
      nextStatus: 'completed' as const,
      createInput: (order: PrismaOrderRecord) =>
        createCompleteMutationInput(order.id, order.updatedAt.toISOString()),
      expectedData: {
        status: 'used',
        lockedOrderNo: null,
        lockedAt: null,
        usedOrderNo: 'HY202607140000000001',
        usedAt: mutationNow,
      },
    },
  ])('$name inside the order transaction', async testCase => {
    const orderInput = createOrderInput({ couponId: 'coupon-1' });
    const current = createPrismaOrderRecord(orderInput, currentNow, {
      status: testCase.currentStatus,
      ...(testCase.currentStatus === 'confirming'
        ? { assignedDriverId: 'driver-1' }
        : {}),
    });
    const updated = createPrismaOrderRecord(orderInput, mutationNow, {
      status: testCase.nextStatus,
      ...(testCase.nextStatus === 'completed'
        ? {
            assignedDriverId: 'driver-1',
            paymentStatus: 'settled',
            paymentSettledAt: mutationNow,
          }
        : {}),
    });
    const { repository, transaction } = createPrismaMutationHarness(
      current,
      updated,
      mutationNow,
    );
    transaction.shipperCoupon.findFirst.mockResolvedValue(
      createPrismaCouponRecord({
        status: 'locked',
        lockedOrderNo: current.orderNo,
      }),
    );

    await expect(
      repository.executeIdempotentOrderMutation(testCase.createInput(current)),
    ).resolves.toMatchObject({ kind: 'success' });

    expect(transaction.shipperCoupon.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'coupon-1',
        shipperId: 'shipper-1',
        status: 'locked',
        OR: [{ lockedOrderNo: current.orderNo }, { lockedOrderNo: null }],
      },
      data: testCase.expectedData,
    });
  });

  it('stops before order writes when releasing coupon A loses after reserving B', async () => {
    const currentInput = createOrderInput({ couponId: 'coupon-1' });
    const nextInput = createOrderInput({
      couponId: 'coupon-2',
      couponTitle: '满 500 减 50',
      couponDiscountCents: 5000,
      payablePriceCents: 71000,
    });
    const current = createPrismaOrderRecord(currentInput, currentNow);
    const updated = createPrismaOrderRecord(nextInput, mutationNow);
    const { repository, transaction } = createPrismaMutationHarness(
      current,
      updated,
      mutationNow,
    );
    transaction.shipperCoupon.findFirst.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'coupon-2'
          ? createPrismaCouponRecord({
              id: 'coupon-2',
              title: '满 500 减 50',
              discountCents: 5000,
              minOrderAmountCents: 50000,
            })
          : createPrismaCouponRecord({
              status: 'locked',
              lockedOrderNo: current.orderNo,
            }),
      ),
    );
    transaction.shipperCoupon.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      repository.executeIdempotentOrderMutation(
        createShipperUpdateMutationInput(
          current.id,
          current.updatedAt.toISOString(),
          nextInput,
        ),
      ),
    ).rejects.toMatchObject({ code: 'PROFILE_COUPON_NOT_AVAILABLE' });

    expect(transaction.order.updateMany).not.toHaveBeenCalled();
    expect(transaction.orderEvent.create).not.toHaveBeenCalled();
    expect(transaction.orderIdempotencyRecord.update).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'cancel sees an already usable target state',
      currentStatus: 'waiting' as const,
      nextStatus: 'cancelled' as const,
      coupon: createPrismaCouponRecord({ status: 'usable' }),
      createInput: (order: PrismaOrderRecord) =>
        createCancelMutationInput(order.id, order.updatedAt.toISOString()),
    },
    {
      name: 'complete sees an already used target state for the same order',
      currentStatus: 'confirming' as const,
      nextStatus: 'completed' as const,
      coupon: createPrismaCouponRecord({
        status: 'used',
        usedOrderNo: 'HY202607140000000001',
      }),
      createInput: (order: PrismaOrderRecord) =>
        createCompleteMutationInput(order.id, order.updatedAt.toISOString()),
    },
  ])('$name without rewriting the coupon', async testCase => {
    const orderInput = createOrderInput({ couponId: 'coupon-1' });
    const current = createPrismaOrderRecord(orderInput, currentNow, {
      status: testCase.currentStatus,
      ...(testCase.currentStatus === 'confirming'
        ? { assignedDriverId: 'driver-1' }
        : {}),
    });
    const updated = createPrismaOrderRecord(orderInput, mutationNow, {
      status: testCase.nextStatus,
      ...(testCase.nextStatus === 'completed'
        ? {
            assignedDriverId: 'driver-1',
            paymentStatus: 'settled',
            paymentSettledAt: mutationNow,
          }
        : {}),
    });
    const { repository, transaction } = createPrismaMutationHarness(
      current,
      updated,
      mutationNow,
    );
    transaction.shipperCoupon.findFirst.mockResolvedValue(testCase.coupon);

    await expect(
      repository.executeIdempotentOrderMutation(testCase.createInput(current)),
    ).resolves.toMatchObject({ kind: 'success' });

    expect(transaction.shipperCoupon.updateMany).not.toHaveBeenCalled();
  });

  it('redeems a historically usable coupon only when the current order is its unique owner', async () => {
    const orderInput = createOrderInput({ couponId: 'coupon-1' });
    const current = createPrismaOrderRecord(orderInput, currentNow, {
      status: 'confirming',
      assignedDriverId: 'driver-1',
    });
    const updated = createPrismaOrderRecord(orderInput, mutationNow, {
      status: 'completed',
      assignedDriverId: 'driver-1',
      paymentStatus: 'settled',
      paymentSettledAt: mutationNow,
    });
    const { repository, transaction } = createPrismaMutationHarness(
      current,
      updated,
      mutationNow,
    );
    transaction.shipperCoupon.findFirst.mockResolvedValue(
      createPrismaCouponRecord({ status: 'usable' }),
    );

    await expect(
      repository.executeIdempotentOrderMutation(
        createCompleteMutationInput(
          current.id,
          current.updatedAt.toISOString(),
        ),
      ),
    ).resolves.toMatchObject({ kind: 'success' });

    expect(transaction.order.findMany).toHaveBeenCalledWith({
      where: {
        couponId: 'coupon-1',
        status: { not: 'cancelled' },
      },
      select: { id: true },
    });
    expect(transaction.shipperCoupon.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'coupon-1',
        shipperId: 'shipper-1',
        status: 'usable',
      },
      data: {
        status: 'used',
        lockedOrderNo: null,
        lockedAt: null,
        usedOrderNo: current.orderNo,
        usedAt: mutationNow,
      },
    });
  });

  it('does not read or write coupons for a plain shipper status mutation', async () => {
    const orderInput = createOrderInput({ couponId: 'coupon-1' });
    const current = createPrismaOrderRecord(orderInput, currentNow, {
      status: 'loading',
      assignedDriverId: 'driver-1',
    });
    const updated = createPrismaOrderRecord(orderInput, mutationNow, {
      status: 'transporting',
      assignedDriverId: 'driver-1',
    });
    const { repository, transaction } = createPrismaMutationHarness(
      current,
      updated,
      mutationNow,
    );

    await expect(
      repository.executeIdempotentOrderMutation(
        createShipperStatusMutationInput(
          current.id,
          current.updatedAt.toISOString(),
        ),
      ),
    ).resolves.toMatchObject({ kind: 'success' });

    expect(transaction.shipperCoupon.findFirst).not.toHaveBeenCalled();
    expect(transaction.shipperCoupon.updateMany).not.toHaveBeenCalled();
  });
});

describe('PrismaOrdersRepository admin batch cancel idempotency', () => {
  const now = new Date('2026-07-14T08:00:00.000Z');

  it('cancels waiting orders in one transaction and stores a batch snapshot', async () => {
    const firstCurrent = createPrismaOrderRecord(createOrderInput(), now, {
      id: 'order-1',
      orderNo: 'HY202607140000000001',
      shipperId: 'shipper-1',
    });
    const secondCurrent = createPrismaOrderRecord(
      createOrderInput({ pickupAddress: '南山区科技园' }),
      now,
      {
        id: 'order-2',
        orderNo: 'HY202607140000000002',
        shipperId: 'shipper-2',
      },
    );
    const updatedAt = new Date('2026-07-14T08:00:01.000Z');
    const firstUpdated = createPrismaOrderRecord(
      createOrderInput(),
      updatedAt,
      {
        id: firstCurrent.id,
        orderNo: firstCurrent.orderNo,
        shipperId: firstCurrent.shipperId,
        status: 'cancelled',
        createdAt: firstCurrent.createdAt,
        events: [
          ...firstCurrent.events,
          {
            id: 'event-cancelled-1',
            actorUserId: 'admin-1',
            eventType: 'cancelled',
            noteText: '后台取消：运营按筛选结果批量清理 waiting 单',
            attachmentFileIds: [],
            createdAt: updatedAt,
          },
        ],
      },
    );
    const secondUpdated = createPrismaOrderRecord(
      createOrderInput({ pickupAddress: '南山区科技园' }),
      updatedAt,
      {
        id: secondCurrent.id,
        orderNo: secondCurrent.orderNo,
        shipperId: secondCurrent.shipperId,
        status: 'cancelled',
        createdAt: secondCurrent.createdAt,
        events: [
          ...secondCurrent.events,
          {
            id: 'event-cancelled-2',
            actorUserId: 'admin-1',
            eventType: 'cancelled',
            noteText: '后台取消：运营按筛选结果批量清理 waiting 单',
            attachmentFileIds: [],
            createdAt: updatedAt,
          },
        ],
      },
    );
    const input = createAdminBatchCancelInput([
      {
        orderId: secondCurrent.id,
        baseUpdatedAtIso: secondCurrent.updatedAt.toISOString(),
      },
      {
        orderId: firstCurrent.id,
        baseUpdatedAtIso: firstCurrent.updatedAt.toISOString(),
      },
    ]);
    const { repository, prisma, transaction } = createPrismaBatchCancelHarness(
      [firstCurrent, secondCurrent],
      [firstUpdated, secondUpdated],
      updatedAt,
    );

    await expect(
      repository.executeIdempotentAdminBatchCancel(input),
    ).resolves.toMatchObject({
      orderIds: [secondCurrent.id, firstCurrent.id],
      updatedCount: 2,
      items: [
        expect.objectContaining({
          id: secondCurrent.id,
          status: 'cancelled',
        }),
        expect.objectContaining({
          id: firstCurrent.id,
          status: 'cancelled',
        }),
      ],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.order.updateMany).toHaveBeenCalledTimes(2);
    expect(transaction.orderIdempotencyRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: 'admin-1',
          orderId: secondCurrent.id,
          operation: 'admin_batch_cancel',
        }),
      }),
    );
    expect(transaction.orderIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'idempotency-batch-cancel' },
        data: {
          responseSnapshot: expect.objectContaining({
            orderIds: [secondCurrent.id, firstCurrent.id],
            updatedCount: 2,
          }),
        },
      }),
    );
  });

  it('replays the committed batch snapshot after a P2002 reservation race', async () => {
    const input = createAdminBatchCancelInput([
      {
        orderId: 'order-2',
        baseUpdatedAtIso: '2026-07-14T08:00:00.000Z',
      },
      {
        orderId: 'order-1',
        baseUpdatedAtIso: '2026-07-14T08:00:00.000Z',
      },
    ]);
    const responseSnapshot = {
      orderIds: ['order-2', 'order-1'],
      updatedCount: 2,
      items: [
        expect.objectContaining({ id: 'order-2', status: 'cancelled' }),
        expect.objectContaining({ id: 'order-1', status: 'cancelled' }),
      ],
    };
    const { repository, prisma } = createPrismaBatchCancelHarness([], [], now);
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    prisma.orderIdempotencyRecord.findUnique.mockResolvedValueOnce({
      id: 'idempotency-existing',
      actorUserId: input.actorUserId,
      orderId: input.input.items[0].orderId,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      responseSnapshot: {
        orderIds: ['order-2', 'order-1'],
        updatedCount: 2,
        items: [
          {
            id: 'order-2',
            status: 'cancelled',
          },
          {
            id: 'order-1',
            status: 'cancelled',
          },
        ],
      },
      createdAt: now,
      expiresAt: new Date(input.expiresAtIso),
    });

    await expect(
      repository.executeIdempotentAdminBatchCancel(input),
    ).resolves.toEqual(responseSnapshot);
  });
});

describe('PrismaOrdersRepository order change reviews', () => {
  it('allows only one concurrent reviewer to claim the pending request', async () => {
    const observedAt = new Date('2026-07-14T08:00:00.000Z');
    const expectedUpdatedAt = new Date('2026-07-14T08:00:00.001Z');
    const current = createPrismaOrderRecord(createOrderInput(), observedAt, {
      id: 'order-change-1',
      status: 'transporting',
      events: [
        {
          id: 'event-created',
          actorUserId: 'shipper-1',
          eventType: 'created',
          noteText: '货主发布订单',
          attachmentFileIds: [],
          createdAt: new Date('2026-07-14T07:50:00.000Z'),
        },
        {
          id: 'event-change-requested',
          actorUserId: 'shipper-1',
          eventType: 'change_requested',
          noteText: '请把卸货地址改到南山门店二期',
          attachmentFileIds: [],
          createdAt: observedAt,
        },
      ],
    });
    let persisted: PrismaOrderRecord = {
      ...current,
      events: [...current.events],
    };
    const readPersisted = () => ({
      ...persisted,
      events: [...persisted.events],
    });
    const updateMany = jest.fn(
      async (args: {
        where: { id: string; updatedAt: Date };
        data: { updatedAt: Date };
      }) => {
        if (
          args.where.id !== persisted.id ||
          args.where.updatedAt.getTime() !== persisted.updatedAt.getTime()
        ) {
          return { count: 0 };
        }

        persisted = { ...persisted, updatedAt: args.data.updatedAt };
        return { count: 1 };
      },
    );
    const createEvent = jest.fn(
      async (args: {
        data: {
          orderId: string;
          actorUserId: string;
          eventType: string;
          noteText: string;
          attachmentFileIds: string[];
          createdAt: Date;
        };
      }) => {
        const event = {
          id: 'event-change-reviewed',
          actorUserId: args.data.actorUserId,
          eventType: args.data.eventType,
          noteText: args.data.noteText,
          attachmentFileIds: args.data.attachmentFileIds,
          createdAt: args.data.createdAt,
        };
        persisted = { ...persisted, events: [...persisted.events, event] };
        return event;
      },
    );
    const transaction = {
      order: {
        findUnique: jest.fn(async () => readPersisted()),
        updateMany,
      },
      orderEvent: { create: createEvent },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const repository = new PrismaOrdersRepository(
      prisma as unknown as PrismaOrdersClient,
      () => observedAt,
    );

    const results = await Promise.allSettled([
      repository.reviewOrderChangeRequest('order-change-1', 'admin-1', {
        decision: 'approved',
        reviewResultText: '同意改址',
      }),
      repository.reviewOrderChangeRequest('order-change-1', 'admin-2', {
        decision: 'rejected',
        reviewResultText: '拒绝改址',
      }),
    ]);

    expect(
      results.filter(result => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected');
    expect(rejected).toMatchObject({
      reason: {
        code: ApiErrorCode.ORDER_CONFLICT,
        message: '订单已被其他操作更新',
      },
    });
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'order-change-1', updatedAt: observedAt },
      data: { updatedAt: expectedUpdatedAt },
    });
    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(createEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-change-1',
        actorUserId: 'admin-1',
        eventType: 'change_request_approved',
        attachmentFileIds: [],
        createdAt: expectedUpdatedAt,
      }),
    });

    const fulfilled = results.find(result => result.status === 'fulfilled');
    expect(fulfilled).toMatchObject({
      value: {
        updatedAtIso: expectedUpdatedAt.toISOString(),
        events: expect.arrayContaining([
          expect.objectContaining({
            actorUserId: 'admin-1',
            eventType: 'change_request_approved',
          }),
        ]),
      },
    });
  });
});

describe('OrdersRepository evaluation reply targets', () => {
  const observedAt = new Date('2026-07-14T08:00:00.000Z');
  const expectedUpdatedAt = new Date('2026-07-14T08:00:00.001Z');

  function createEvaluatedPrismaOrder(
    evaluationEventIds = ['event-evaluation-latest'],
    overrides: Partial<PrismaOrderRecord> = {},
  ) {
    return createPrismaOrderRecord(createOrderInput(), observedAt, {
      id: 'order-evaluated',
      status: 'completed',
      assignedDriverId: 'driver-1',
      events: [
        {
          id: 'event-accepted',
          actorUserId: 'driver-1',
          eventType: 'driver_accepted',
          noteText: null,
          attachmentFileIds: [],
          createdAt: new Date('2026-07-14T07:50:00.000Z'),
        },
        ...evaluationEventIds.map((id, index) => ({
          id,
          actorUserId: 'shipper-1',
          eventType: 'evaluation_submitted',
          noteText: '5 星：准时送达；评价正文：司机服务细致',
          attachmentFileIds: [],
          createdAt: new Date(`2026-07-14T07:5${index + 1}:00.000Z`),
        })),
      ],
      ...overrides,
    });
  }

  function createPrismaEvaluationReplyHarness(
    current: PrismaOrderRecord,
    claimCount: number,
  ) {
    const replyEvent = {
      id: 'event-evaluation-reply',
      actorUserId: 'driver-1',
      eventType: 'evaluation_replied',
      noteText: '谢谢认可。',
      attachmentFileIds: [],
      createdAt: expectedUpdatedAt,
    };
    const updated: PrismaOrderRecord = {
      ...current,
      updatedAt: expectedUpdatedAt,
      events: [...current.events, replyEvent],
    };
    const transaction = {
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce(updated),
        updateMany: jest.fn().mockResolvedValue({ count: claimCount }),
      },
      orderEvent: {
        create: jest.fn().mockResolvedValue(replyEvent),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };

    return {
      repository: new PrismaOrdersRepository(
        prisma as unknown as PrismaOrdersClient,
        () => observedAt,
      ),
      prisma,
      transaction,
    };
  }

  it('rejects stale, wrong-event, and wrong-driver targets in memory without appending a reply', async () => {
    const repository = new InMemoryOrdersRepository(() => observedAt);
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});
    const firstEvaluation = await repository.submitOrderEvaluation(
      order.id,
      'shipper-1',
      { rating: 4, tags: ['准时送达'], content: '第一次评价' },
    );
    const staleEvaluationEventId =
      firstEvaluation.events[firstEvaluation.events.length - 1].id;
    const latestEvaluation = await repository.submitOrderEvaluation(
      order.id,
      'shipper-1',
      { rating: 5, tags: ['服务好'], content: '更新后的评价' },
    );
    const latestEvaluationEventId =
      latestEvaluation.events[latestEvaluation.events.length - 1].id;

    await expect(
      repository.replyToOrderEvaluation(order.id, 'driver-1', {
        evaluationEventId: staleEvaluationEventId,
        content: '谢谢认可。',
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.ORDER_CONFLICT });
    await expect(
      repository.replyToOrderEvaluation(order.id, 'driver-1', {
        evaluationEventId: order.events.find(
          event => event.eventType === 'driver_accepted',
        )!.id,
        content: '谢谢认可。',
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.ORDER_CONFLICT });
    await expect(
      repository.replyToOrderEvaluation(order.id, 'driver-2', {
        evaluationEventId: latestEvaluationEventId,
        content: '谢谢认可。',
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.ORDER_CONFLICT });
    expect(
      latestEvaluation.events.filter(
        event => event.eventType === 'evaluation_replied',
      ),
    ).toHaveLength(0);
  });

  it('uses the event id as a deterministic evaluation timestamp tie break', async () => {
    const repository = new InMemoryOrdersRepository(() => observedAt);
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});
    const firstEvaluation = await repository.submitOrderEvaluation(
      order.id,
      'shipper-1',
      { rating: 4, tags: ['准时送达'], content: '第一次评价' },
    );
    const firstEvaluationEvent =
      firstEvaluation.events[firstEvaluation.events.length - 1];
    const secondEvaluation = await repository.submitOrderEvaluation(
      order.id,
      'shipper-1',
      { rating: 5, tags: ['服务好'], content: '更新后的评价' },
    );
    const secondEvaluationEvent =
      secondEvaluation.events[secondEvaluation.events.length - 1];

    expect(firstEvaluationEvent.createdAtIso).toBe(
      secondEvaluationEvent.createdAtIso,
    );
    firstEvaluationEvent.id = 'evaluation-z';
    secondEvaluationEvent.id = 'evaluation-a';
    await expect(
      repository.replyToOrderEvaluation(order.id, 'driver-1', {
        evaluationEventId: secondEvaluationEvent.id,
        content: '旧评价回复。',
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.ORDER_CONFLICT });
    await expect(
      repository.replyToOrderEvaluation(order.id, 'driver-1', {
        evaluationEventId: firstEvaluationEvent.id,
        content: '谢谢认可。',
      }),
    ).resolves.toMatchObject({
      events: expect.arrayContaining([
        expect.objectContaining({
          actorUserId: 'driver-1',
          eventType: 'evaluation_replied',
          noteText: '谢谢认可。',
        }),
      ]),
    });
  });

  it('replays an idempotent in-memory evaluation reply snapshot without appending another event', async () => {
    let currentNow = observedAt;
    const repository = new InMemoryOrdersRepository(() => currentNow);
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});
    const evaluatedOrder = await repository.submitOrderEvaluation(
      order.id,
      'shipper-1',
      { rating: 5, tags: ['准时送达'], content: '司机服务细致' },
    );
    const evaluationEventId = evaluatedOrder.events.at(-1)!.id;
    const input = createEvaluationReplyMutationInput(
      order.id,
      evaluatedOrder.updatedAtIso,
      evaluationEventId,
    );
    const first = await repository.executeIdempotentOrderMutation(input);

    currentNow = new Date('2026-07-14T08:01:00.000Z');
    await repository.submitOrderEvaluation(order.id, 'shipper-1', {
      rating: 4,
      tags: ['服务好'],
      content: '后来提交的新评价',
    });
    const replay = await repository.executeIdempotentOrderMutation(input);

    expect(first).toMatchObject({ kind: 'success', replayed: false });
    expect(replay).toEqual({
      ...(first as Extract<typeof first, { kind: 'success' }>),
      replayed: true,
    });
    expect(
      (await repository.findOrderById(order.id))?.events.filter(
        event => event.eventType === 'evaluation_replied',
      ),
    ).toHaveLength(1);
  });

  it('returns key-reused and key-expired for in-memory evaluation reply replays', async () => {
    let currentNow = observedAt;
    const repository = new InMemoryOrdersRepository(() => currentNow);
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});
    const evaluatedOrder = await repository.submitOrderEvaluation(
      order.id,
      'shipper-1',
      { rating: 5, tags: ['准时送达'], content: '司机服务细致' },
    );
    const evaluationEventId = evaluatedOrder.events.at(-1)!.id;
    const input = createEvaluationReplyMutationInput(
      order.id,
      evaluatedOrder.updatedAtIso,
      evaluationEventId,
      {
        expiresAtIso: '2026-07-14T08:00:01.000Z',
      },
    );
    await repository.executeIdempotentOrderMutation(input);

    await expect(
      repository.executeIdempotentOrderMutation({
        ...input,
        requestFingerprint: createDriverEvaluationReplyFingerprint(order.id, {
          evaluationEventId,
          content: '另一条回复。',
        }),
        mutation: {
          type: 'driver_evaluation_reply',
          input: { evaluationEventId, content: '另一条回复。' },
        },
      }),
    ).resolves.toEqual({ kind: 'key-reused' });

    currentNow = new Date('2026-07-14T08:00:01.001Z');
    await expect(
      repository.executeIdempotentOrderMutation(input),
    ).resolves.toEqual({ kind: 'key-expired' });
  });

  it('does not persist an idempotency record for stale or wrong-driver evaluation targets', async () => {
    const repository = new InMemoryOrdersRepository(() => observedAt);
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});
    const firstEvaluation = await repository.submitOrderEvaluation(
      order.id,
      'shipper-1',
      { rating: 4, tags: ['准时送达'], content: '第一次评价' },
    );
    const staleEvaluationEventId = firstEvaluation.events.at(-1)!.id;
    const latestEvaluation = await repository.submitOrderEvaluation(
      order.id,
      'shipper-1',
      { rating: 5, tags: ['服务好'], content: '更新后的评价' },
    );

    await expect(
      repository.executeIdempotentOrderMutation(
        createEvaluationReplyMutationInput(
          order.id,
          latestEvaluation.updatedAtIso,
          staleEvaluationEventId,
        ),
      ),
    ).resolves.toEqual({ kind: 'conflict' });
    await expect(
      repository.executeIdempotentOrderMutation(
        createEvaluationReplyMutationInput(
          order.id,
          latestEvaluation.updatedAtIso,
          latestEvaluation.events.at(-1)!.id,
          {
            actorUserId: 'driver-2',
            idempotencyKey: 'evaluation-reply-key-driver-2',
          },
        ),
      ),
    ).resolves.toEqual({ kind: 'conflict' });
    expect(
      (
        repository as unknown as {
          orderIdempotencyRecords: unknown[];
        }
      ).orderIdempotencyRecords,
    ).toHaveLength(0);
  });

  it('stores a Prisma evaluation reply event and idempotency snapshot in one transaction', async () => {
    const current = createEvaluatedPrismaOrder();
    const replyEvent = {
      id: 'event-evaluation-reply',
      actorUserId: 'driver-1',
      eventType: 'evaluation_replied',
      noteText: '谢谢认可。',
      attachmentFileIds: [],
      createdAt: expectedUpdatedAt,
    };
    const updated: PrismaOrderRecord = {
      ...current,
      updatedAt: expectedUpdatedAt,
      events: [...current.events, replyEvent],
    };
    const { repository, transaction } = createPrismaMutationHarness(
      current,
      updated,
      observedAt,
    );
    const input = createEvaluationReplyMutationInput(
      current.id,
      current.updatedAt.toISOString(),
      'event-evaluation-latest',
    );

    await expect(
      repository.executeIdempotentOrderMutation(input),
    ).resolves.toMatchObject({
      kind: 'success',
      replayed: false,
      order: expect.objectContaining({
        id: current.id,
        updatedAtIso: expectedUpdatedAt.toISOString(),
      }),
    });
    expect(transaction.orderIdempotencyRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 'driver-1',
        orderId: current.id,
        operation: 'driver_evaluation_reply',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        responseSnapshot: {},
      }),
    });
    expect(transaction.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: current.id,
        updatedAt: observedAt,
        status: current.status,
        paymentStatus: current.paymentStatus,
        assignedDriverId: 'driver-1',
      },
      data: { updatedAt: expectedUpdatedAt },
    });
    expect(transaction.orderEvent.create).toHaveBeenCalledWith({
      data: {
        orderId: current.id,
        actorUserId: 'driver-1',
        eventType: 'evaluation_replied',
        noteText: '谢谢认可。',
        attachmentFileIds: [],
        createdAt: expectedUpdatedAt,
      },
    });
    expect(transaction.orderIdempotencyRecord.update).toHaveBeenCalledWith({
      where: { id: 'idempotency-mutation' },
      data: {
        responseSnapshot: expect.objectContaining({
          id: current.id,
          updatedAtIso: expectedUpdatedAt.toISOString(),
          events: expect.arrayContaining([
            expect.objectContaining({ eventType: 'evaluation_replied' }),
          ]),
        }),
      },
    });
  });

  it('returns conflict without appending or snapshotting after a lost Prisma evaluation reply claim', async () => {
    const current = createEvaluatedPrismaOrder();
    const updated: PrismaOrderRecord = {
      ...current,
      updatedAt: expectedUpdatedAt,
    };
    const { repository, transaction } = createPrismaMutationHarness(
      current,
      updated,
      observedAt,
    );
    transaction.order.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      repository.executeIdempotentOrderMutation(
        createEvaluationReplyMutationInput(
          current.id,
          current.updatedAt.toISOString(),
          'event-evaluation-latest',
        ),
      ),
    ).resolves.toEqual({ kind: 'conflict' });
    expect(transaction.orderEvent.create).not.toHaveBeenCalled();
    expect(transaction.orderIdempotencyRecord.update).not.toHaveBeenCalled();
  });

  it('recovers the committed Prisma evaluation reply winner after a reservation race', async () => {
    const current = createEvaluatedPrismaOrder();
    const updated: PrismaOrderRecord = {
      ...current,
      updatedAt: expectedUpdatedAt,
    };
    const { repository, prisma } = createPrismaMutationHarness(
      current,
      updated,
      observedAt,
    );
    const input = createEvaluationReplyMutationInput(
      current.id,
      current.updatedAt.toISOString(),
      'event-evaluation-latest',
    );
    const responseSnapshot = {
      ...createOrderSnapshot(createOrderInput(), current),
      id: current.id,
      status: current.status,
      assignedDriverId: 'driver-1',
      updatedAtIso: expectedUpdatedAt.toISOString(),
    };
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    prisma.orderIdempotencyRecord.findUnique.mockResolvedValueOnce({
      id: 'idempotency-winner',
      actorUserId: input.actorUserId,
      orderId: input.orderId,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      responseSnapshot,
      createdAt: observedAt,
      expiresAt: new Date(input.expiresAtIso),
    });

    await expect(
      repository.executeIdempotentOrderMutation(input),
    ).resolves.toEqual({
      kind: 'success',
      order: responseSnapshot,
      replayed: true,
    });
  });

  it('claims the order version before appending a Prisma evaluation reply', async () => {
    const current = createEvaluatedPrismaOrder();
    const { repository, prisma, transaction } =
      createPrismaEvaluationReplyHarness(current, 1);

    await expect(
      repository.replyToOrderEvaluation('order-evaluated', 'driver-1', {
        evaluationEventId: 'event-evaluation-latest',
        content: '谢谢认可。',
      }),
    ).resolves.toMatchObject({
      id: 'order-evaluated',
      updatedAtIso: expectedUpdatedAt.toISOString(),
      events: expect.arrayContaining([
        expect.objectContaining({
          actorUserId: 'driver-1',
          eventType: 'evaluation_replied',
          noteText: '谢谢认可。',
        }),
      ]),
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-evaluated',
        assignedDriverId: 'driver-1',
        updatedAt: observedAt,
      },
      data: { updatedAt: expectedUpdatedAt },
    });
    expect(transaction.orderEvent.create).toHaveBeenCalledWith({
      data: {
        orderId: 'order-evaluated',
        actorUserId: 'driver-1',
        eventType: 'evaluation_replied',
        noteText: '谢谢认可。',
        attachmentFileIds: [],
        createdAt: expectedUpdatedAt,
      },
    });
  });

  it('rejects a mismatched Prisma evaluation target before claiming the order', async () => {
    const current = createEvaluatedPrismaOrder();
    const { repository, transaction } = createPrismaEvaluationReplyHarness(
      current,
      1,
    );

    await expect(
      repository.replyToOrderEvaluation('order-evaluated', 'driver-1', {
        evaluationEventId: 'event-from-another-order',
        content: '谢谢认可。',
      }),
    ).rejects.toMatchObject({
      code: ApiErrorCode.ORDER_CONFLICT,
      message: '订单已被其他操作更新',
    });
    expect(transaction.order.updateMany).not.toHaveBeenCalled();
    expect(transaction.orderEvent.create).not.toHaveBeenCalled();
  });

  it('rejects a lost Prisma version claim before appending the reply event', async () => {
    const current = createEvaluatedPrismaOrder();
    const { repository, transaction } = createPrismaEvaluationReplyHarness(
      current,
      0,
    );

    await expect(
      repository.replyToOrderEvaluation('order-evaluated', 'driver-1', {
        evaluationEventId: 'event-evaluation-latest',
        content: '谢谢认可。',
      }),
    ).rejects.toMatchObject({
      code: ApiErrorCode.ORDER_CONFLICT,
      message: '订单已被其他操作更新',
    });
    expect(transaction.orderEvent.create).not.toHaveBeenCalled();
    expect(transaction.order.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('OrdersRepository driver shipper evaluation idempotency', () => {
  const observedAt = new Date('2026-07-14T08:00:00.000Z');
  const expectedUpdatedAt = new Date('2026-07-14T08:00:00.001Z');

  function createCompletedPrismaOrder() {
    return createPrismaOrderRecord(createOrderInput(), observedAt, {
      id: 'order-driver-evaluation',
      status: 'completed',
      assignedDriverId: 'driver-1',
      events: [
        {
          id: 'event-driver-accepted',
          actorUserId: 'driver-1',
          eventType: 'driver_accepted',
          noteText: null,
          attachmentFileIds: [],
          createdAt: new Date('2026-07-14T07:00:00.000Z'),
        },
      ],
    });
  }

  it('replays the first in-memory snapshot without duplicating its evaluation event', async () => {
    const { filesRepository, repository } =
      createInMemoryEvaluationRepository();
    const order = await seedCompletedDriverOrder(repository);
    const input = createDriverShipperEvaluationMutationInput(
      order.id,
      order.updatedAtIso,
    );

    const first = await repository.executeIdempotentOrderMutation(input);
    const replay = await repository.executeIdempotentOrderMutation(input);

    expect(first).toMatchObject({ kind: 'success', replayed: false });
    expect(replay).toEqual({
      ...(first as Extract<typeof first, { kind: 'success' }>),
      replayed: true,
    });
    expect(filesRepository.findFilesByIds).toHaveBeenCalledTimes(1);
    expect(
      (await repository.findOrderById(order.id))?.events.filter(
        event => event.eventType === 'shipper_evaluation_submitted',
      ),
    ).toEqual([
      expect.objectContaining({
        actorUserId: 'driver-1',
        attachmentFileIds: ['file-evaluation-1'],
      }),
    ]);
  });

  it('rejects changed content and cross-order reuse of an in-memory key', async () => {
    const { repository } = createInMemoryEvaluationRepository();
    const firstOrder = await seedCompletedDriverOrder(repository);
    const secondOrder = await seedCompletedDriverOrder(repository);
    const input = createDriverShipperEvaluationMutationInput(
      firstOrder.id,
      firstOrder.updatedAtIso,
    );
    await repository.executeIdempotentOrderMutation(input);

    await expect(
      repository.executeIdempotentOrderMutation(
        createDriverShipperEvaluationMutationInput(
          firstOrder.id,
          firstOrder.updatedAtIso,
          {
            ...driverShipperEvaluationRequest,
            content: '另一条不同的货主评价内容。',
          },
        ),
      ),
    ).resolves.toEqual({ kind: 'key-reused' });
    await expect(
      repository.executeIdempotentOrderMutation(
        createDriverShipperEvaluationMutationInput(
          secondOrder.id,
          secondOrder.updatedAtIso,
        ),
      ),
    ).resolves.toEqual({ kind: 'key-reused' });
  });

  it('returns key-expired before reading current in-memory order or files', async () => {
    const { filesRepository, repository, setNow } =
      createInMemoryEvaluationRepository();
    const order = await seedCompletedDriverOrder(repository);
    const input = createDriverShipperEvaluationMutationInput(
      order.id,
      order.updatedAtIso,
      driverShipperEvaluationRequest,
      { expiresAtIso: '2026-07-14T08:00:01.000Z' },
    );
    await repository.executeIdempotentOrderMutation(input);
    setNow('2026-07-14T08:00:01.001Z');
    jest.mocked(filesRepository.findFilesByIds).mockClear();

    await expect(
      repository.executeIdempotentOrderMutation(input),
    ).resolves.toEqual({ kind: 'key-expired' });
    expect(filesRepository.findFilesByIds).not.toHaveBeenCalled();
  });

  it('checks completed state and current driver ownership before in-memory attachment I/O', async () => {
    const { filesRepository, repository } =
      createInMemoryEvaluationRepository();
    const completedOrder = await seedCompletedDriverOrder(repository);

    await expect(
      repository.executeIdempotentOrderMutation(
        createDriverShipperEvaluationMutationInput(
          completedOrder.id,
          completedOrder.updatedAtIso,
          driverShipperEvaluationRequest,
          {
            actorUserId: 'driver-2',
            idempotencyKey: 'wrong-driver-key',
          },
        ),
      ),
    ).resolves.toEqual({ kind: 'state-invalid' });

    const loadingOrder = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    await repository.acceptDriverOrder(loadingOrder.id, 'driver-1', {});
    await expect(
      repository.executeIdempotentOrderMutation(
        createDriverShipperEvaluationMutationInput(
          loadingOrder.id,
          loadingOrder.updatedAtIso,
          driverShipperEvaluationRequest,
          { idempotencyKey: 'loading-order-key' },
        ),
      ),
    ).resolves.toEqual({ kind: 'state-invalid' });
    expect(filesRepository.findFilesByIds).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', [], ApiErrorCode.FILE_NOT_FOUND],
    [
      'other owner',
      [createEvaluationFile({ ownerUserId: 'driver-2' })],
      ApiErrorCode.FILE_NOT_FOUND,
    ],
    [
      'pending',
      [createEvaluationFile({ status: 'pending' })],
      ApiErrorCode.FILE_STATE_INVALID,
    ],
    [
      'wrong purpose',
      [createEvaluationFile({ purpose: 'exception' })],
      ApiErrorCode.FILE_PURPOSE_INVALID,
    ],
  ] as const)(
    'rolls back an in-memory evaluation when its attachment is %s',
    async (_label, files, errorCode) => {
      const { repository } = createInMemoryEvaluationRepository([...files]);
      const order = await seedCompletedDriverOrder(repository);

      await expect(
        repository.executeIdempotentOrderMutation(
          createDriverShipperEvaluationMutationInput(
            order.id,
            order.updatedAtIso,
          ),
        ),
      ).rejects.toMatchObject({ code: errorCode });
      expect(
        (await repository.findOrderById(order.id))?.events.filter(
          event => event.eventType === 'shipper_evaluation_submitted',
        ),
      ).toHaveLength(0);
      expect(
        (
          repository as unknown as {
            orderIdempotencyRecords: Array<{ operation: string }>;
          }
        ).orderIdempotencyRecords.filter(
          record => record.operation === 'driver_shipper_evaluation',
        ),
      ).toHaveLength(0);
    },
  );

  it('checks Prisma attachments, claims the driver, writes the event, and snapshots in one transaction', async () => {
    const current = createCompletedPrismaOrder();
    const evaluationEvent = {
      id: 'event-shipper-evaluation',
      actorUserId: 'driver-1',
      eventType: 'shipper_evaluation_submitted',
      noteText:
        '5 星：沟通顺畅、装货配合；评价信息：实名；图片凭证 1 张；评价正文：货主装货配合好，结算沟通清楚。',
      attachmentFileIds: ['file-evaluation-1'],
      createdAt: expectedUpdatedAt,
    };
    const updated: PrismaOrderRecord = {
      ...current,
      updatedAt: expectedUpdatedAt,
      events: [...current.events, evaluationEvent],
    };
    const { repository, transaction } = createPrismaMutationHarness(
      current,
      updated,
      observedAt,
    );
    transaction.fileObject.findMany.mockResolvedValueOnce([
      createEvaluationFile(),
    ]);
    const input = createDriverShipperEvaluationMutationInput(
      current.id,
      current.updatedAt.toISOString(),
    );

    await expect(
      repository.executeIdempotentOrderMutation(input),
    ).resolves.toMatchObject({ kind: 'success', replayed: false });
    expect(transaction.fileObject.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['file-evaluation-1'] } },
      select: {
        id: true,
        ownerUserId: true,
        purpose: true,
        status: true,
      },
    });
    expect(transaction.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: current.id,
        updatedAt: observedAt,
        status: 'completed',
        paymentStatus: current.paymentStatus,
        assignedDriverId: 'driver-1',
      },
      data: { updatedAt: expectedUpdatedAt },
    });
    expect(transaction.orderEvent.create).toHaveBeenCalledWith({
      data: {
        orderId: current.id,
        actorUserId: 'driver-1',
        eventType: 'shipper_evaluation_submitted',
        noteText: evaluationEvent.noteText,
        attachmentFileIds: ['file-evaluation-1'],
        createdAt: expectedUpdatedAt,
      },
    });
    expect(transaction.orderIdempotencyRecord.update).toHaveBeenCalledWith({
      where: { id: 'idempotency-mutation' },
      data: {
        responseSnapshot: expect.objectContaining({
          id: current.id,
          events: expect.arrayContaining([
            expect.objectContaining({
              eventType: 'shipper_evaluation_submitted',
            }),
          ]),
        }),
      },
    });
  });

  it.each([
    ['missing', [], ApiErrorCode.FILE_NOT_FOUND],
    [
      'other owner',
      [createEvaluationFile({ ownerUserId: 'driver-2' })],
      ApiErrorCode.FILE_NOT_FOUND,
    ],
    [
      'pending',
      [createEvaluationFile({ status: 'pending' })],
      ApiErrorCode.FILE_STATE_INVALID,
    ],
    [
      'wrong purpose',
      [createEvaluationFile({ purpose: 'exception' })],
      ApiErrorCode.FILE_PURPOSE_INVALID,
    ],
  ] as const)(
    'does not claim, append, or snapshot a Prisma evaluation with a %s attachment',
    async (_label, files, errorCode) => {
      const current = createCompletedPrismaOrder();
      const { repository, transaction } = createPrismaMutationHarness(
        current,
        current,
        observedAt,
      );
      transaction.fileObject.findMany.mockResolvedValueOnce([...files]);

      await expect(
        repository.executeIdempotentOrderMutation(
          createDriverShipperEvaluationMutationInput(
            current.id,
            current.updatedAt.toISOString(),
          ),
        ),
      ).rejects.toMatchObject({ code: errorCode });
      expect(transaction.order.updateMany).not.toHaveBeenCalled();
      expect(transaction.orderEvent.create).not.toHaveBeenCalled();
      expect(transaction.orderIdempotencyRecord.update).not.toHaveBeenCalled();
    },
  );

  it('recovers a committed Prisma evaluation snapshot after a same-key reservation race', async () => {
    const current = createCompletedPrismaOrder();
    const { repository, prisma } = createPrismaMutationHarness(
      current,
      current,
      observedAt,
    );
    const input = createDriverShipperEvaluationMutationInput(
      current.id,
      current.updatedAt.toISOString(),
    );
    const responseSnapshot = {
      ...createOrderSnapshot(createOrderInput(), current),
      id: current.id,
      status: current.status,
      assignedDriverId: 'driver-1',
      updatedAtIso: expectedUpdatedAt.toISOString(),
    };
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    prisma.orderIdempotencyRecord.findUnique.mockResolvedValueOnce({
      id: 'idempotency-winner',
      actorUserId: input.actorUserId,
      orderId: input.orderId,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      responseSnapshot,
      createdAt: observedAt,
      expiresAt: new Date(input.expiresAtIso),
    });

    await expect(
      repository.executeIdempotentOrderMutation(input),
    ).resolves.toEqual({
      kind: 'success',
      order: responseSnapshot,
      replayed: true,
    });
  });
});

describe('OrdersRepository shipper driver evaluation idempotency', () => {
  const observedAt = new Date('2026-07-14T08:00:00.000Z');
  const expectedUpdatedAt = new Date('2026-07-14T08:00:00.001Z');

  function createCompletedPrismaOrder(
    overrides: Partial<PrismaOrderRecord> = {},
  ) {
    return createPrismaOrderRecord(createOrderInput(), observedAt, {
      id: 'order-shipper-evaluation',
      status: 'completed',
      assignedDriverId: 'driver-1',
      ...overrides,
    });
  }

  it('replays the first in-memory snapshot without duplicating its driver evaluation event', async () => {
    const { filesRepository, repository } =
      createInMemoryEvaluationRepository([
        createEvaluationFile({ ownerUserId: 'shipper-1' }),
      ]);
    const order = await seedCompletedDriverOrder(repository);
    const input = createShipperDriverEvaluationMutationInput(
      order.id,
      order.updatedAtIso,
    );

    const first = await repository.executeIdempotentOrderMutation(input);
    const replay = await repository.executeIdempotentOrderMutation(input);

    expect(first).toMatchObject({ kind: 'success', replayed: false });
    expect(replay).toEqual({
      ...(first as Extract<typeof first, { kind: 'success' }>),
      replayed: true,
    });
    expect(filesRepository.findFilesByIds).toHaveBeenCalledTimes(1);
    expect(
      (await repository.findOrderById(order.id))?.events.filter(
        event => event.eventType === 'evaluation_submitted',
      ),
    ).toEqual([
      expect.objectContaining({
        actorUserId: 'shipper-1',
        attachmentFileIds: ['file-evaluation-1'],
      }),
    ]);
  });

  it('rejects changed content and cross-order reuse of an in-memory key', async () => {
    const { repository } = createInMemoryEvaluationRepository([
      createEvaluationFile({ ownerUserId: 'shipper-1' }),
    ]);
    const firstOrder = await seedCompletedDriverOrder(repository);
    const secondOrder = await seedCompletedDriverOrder(repository);
    const input = createShipperDriverEvaluationMutationInput(
      firstOrder.id,
      firstOrder.updatedAtIso,
    );
    await repository.executeIdempotentOrderMutation(input);

    await expect(
      repository.executeIdempotentOrderMutation(
        createShipperDriverEvaluationMutationInput(
          firstOrder.id,
          firstOrder.updatedAtIso,
          {
            ...shipperDriverEvaluationRequest,
            content: '另一条不同的司机评价内容。',
          },
        ),
      ),
    ).resolves.toEqual({ kind: 'key-reused' });
    await expect(
      repository.executeIdempotentOrderMutation(
        createShipperDriverEvaluationMutationInput(
          secondOrder.id,
          secondOrder.updatedAtIso,
        ),
      ),
    ).resolves.toEqual({ kind: 'key-reused' });
  });

  it('returns key-expired before reading current in-memory order or files', async () => {
    const { filesRepository, repository, setNow } =
      createInMemoryEvaluationRepository([
        createEvaluationFile({ ownerUserId: 'shipper-1' }),
      ]);
    const order = await seedCompletedDriverOrder(repository);
    const input = createShipperDriverEvaluationMutationInput(
      order.id,
      order.updatedAtIso,
      shipperDriverEvaluationRequest,
      { expiresAtIso: '2026-07-14T08:00:01.000Z' },
    );
    await repository.executeIdempotentOrderMutation(input);
    setNow('2026-07-14T08:00:01.001Z');
    jest.mocked(filesRepository.findFilesByIds).mockClear();

    await expect(
      repository.executeIdempotentOrderMutation(input),
    ).resolves.toEqual({ kind: 'key-expired' });
    expect(filesRepository.findFilesByIds).not.toHaveBeenCalled();
  });

  it('checks completed state and current shipper ownership before in-memory attachment I/O', async () => {
    const { filesRepository, repository } =
      createInMemoryEvaluationRepository([
        createEvaluationFile({ ownerUserId: 'shipper-1' }),
      ]);
    const completedOrder = await seedCompletedDriverOrder(repository);

    await expect(
      repository.executeIdempotentOrderMutation(
        createShipperDriverEvaluationMutationInput(
          completedOrder.id,
          completedOrder.updatedAtIso,
          shipperDriverEvaluationRequest,
          {
            actorUserId: 'shipper-2',
            idempotencyKey: 'wrong-shipper-key',
          },
        ),
      ),
    ).resolves.toEqual({ kind: 'state-invalid' });

    const waitingOrder = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    await expect(
      repository.executeIdempotentOrderMutation(
        createShipperDriverEvaluationMutationInput(
          waitingOrder.id,
          waitingOrder.updatedAtIso,
          shipperDriverEvaluationRequest,
          { idempotencyKey: 'waiting-order-key' },
        ),
      ),
    ).resolves.toEqual({ kind: 'state-invalid' });
    expect(filesRepository.findFilesByIds).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', [], ApiErrorCode.FILE_NOT_FOUND],
    [
      'other owner',
      [createEvaluationFile({ ownerUserId: 'shipper-2' })],
      ApiErrorCode.FILE_NOT_FOUND,
    ],
    [
      'pending',
      [
        createEvaluationFile({
          ownerUserId: 'shipper-1',
          status: 'pending',
        }),
      ],
      ApiErrorCode.FILE_STATE_INVALID,
    ],
    [
      'wrong purpose',
      [
        createEvaluationFile({
          ownerUserId: 'shipper-1',
          purpose: 'exception',
        }),
      ],
      ApiErrorCode.FILE_PURPOSE_INVALID,
    ],
  ] as const)(
    'rolls back an in-memory driver evaluation when its attachment is %s',
    async (_label, files, errorCode) => {
      const { repository } = createInMemoryEvaluationRepository([...files]);
      const order = await seedCompletedDriverOrder(repository);

      await expect(
        repository.executeIdempotentOrderMutation(
          createShipperDriverEvaluationMutationInput(
            order.id,
            order.updatedAtIso,
          ),
        ),
      ).rejects.toMatchObject({ code: errorCode });
      expect(
        (await repository.findOrderById(order.id))?.events.filter(
          event => event.eventType === 'evaluation_submitted',
        ),
      ).toHaveLength(0);
      expect(
        (
          repository as unknown as {
            orderIdempotencyRecords: Array<{ operation: string }>;
          }
        ).orderIdempotencyRecords.filter(
          record => record.operation === 'shipper_driver_evaluation',
        ),
      ).toHaveLength(0);
    },
  );

  it('checks Prisma attachments, claims the shipper, writes the event, and snapshots in one transaction', async () => {
    const current = createCompletedPrismaOrder();
    const evaluationEvent = {
      id: 'event-driver-evaluation',
      actorUserId: 'shipper-1',
      eventType: 'evaluation_submitted',
      noteText:
        '5 星：准时送达、服务好；评价信息：实名；图片凭证 1 张；评价正文：司机服务细致，整体运输体验很好。',
      attachmentFileIds: ['file-evaluation-1'],
      createdAt: expectedUpdatedAt,
    };
    const updated: PrismaOrderRecord = {
      ...current,
      updatedAt: expectedUpdatedAt,
      events: [...current.events, evaluationEvent],
    };
    const { repository, transaction } = createPrismaMutationHarness(
      current,
      updated,
      observedAt,
    );
    transaction.fileObject.findMany.mockResolvedValueOnce([
      createEvaluationFile({ ownerUserId: 'shipper-1' }),
    ]);
    const input = createShipperDriverEvaluationMutationInput(
      current.id,
      current.updatedAt.toISOString(),
    );

    await expect(
      repository.executeIdempotentOrderMutation(input),
    ).resolves.toMatchObject({ kind: 'success', replayed: false });
    expect(transaction.fileObject.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['file-evaluation-1'] } },
      select: {
        id: true,
        ownerUserId: true,
        purpose: true,
        status: true,
      },
    });
    expect(transaction.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: current.id,
        updatedAt: observedAt,
        status: 'completed',
        paymentStatus: current.paymentStatus,
        shipperId: 'shipper-1',
      },
      data: { updatedAt: expectedUpdatedAt },
    });
    expect(transaction.orderEvent.create).toHaveBeenCalledWith({
      data: {
        orderId: current.id,
        actorUserId: 'shipper-1',
        eventType: 'evaluation_submitted',
        noteText: evaluationEvent.noteText,
        attachmentFileIds: ['file-evaluation-1'],
        createdAt: expectedUpdatedAt,
      },
    });
    expect(transaction.orderIdempotencyRecord.update).toHaveBeenCalledWith({
      where: { id: 'idempotency-mutation' },
      data: {
        responseSnapshot: expect.objectContaining({
          id: current.id,
          events: expect.arrayContaining([
            expect.objectContaining({ eventType: 'evaluation_submitted' }),
          ]),
        }),
      },
    });
  });

  it.each([
    ['missing', [], ApiErrorCode.FILE_NOT_FOUND],
    [
      'other owner',
      [createEvaluationFile({ ownerUserId: 'shipper-2' })],
      ApiErrorCode.FILE_NOT_FOUND,
    ],
    [
      'pending',
      [
        createEvaluationFile({
          ownerUserId: 'shipper-1',
          status: 'pending',
        }),
      ],
      ApiErrorCode.FILE_STATE_INVALID,
    ],
    [
      'wrong purpose',
      [
        createEvaluationFile({
          ownerUserId: 'shipper-1',
          purpose: 'exception',
        }),
      ],
      ApiErrorCode.FILE_PURPOSE_INVALID,
    ],
  ] as const)(
    'does not claim, append, or snapshot a Prisma driver evaluation with a %s attachment',
    async (_label, files, errorCode) => {
      const current = createCompletedPrismaOrder();
      const { repository, transaction } = createPrismaMutationHarness(
        current,
        current,
        observedAt,
      );
      transaction.fileObject.findMany.mockResolvedValueOnce([...files]);

      await expect(
        repository.executeIdempotentOrderMutation(
          createShipperDriverEvaluationMutationInput(
            current.id,
            current.updatedAt.toISOString(),
          ),
        ),
      ).rejects.toMatchObject({ code: errorCode });
      expect(transaction.order.updateMany).not.toHaveBeenCalled();
      expect(transaction.orderEvent.create).not.toHaveBeenCalled();
      expect(transaction.orderIdempotencyRecord.update).not.toHaveBeenCalled();
    },
  );

  it('rejects stale or wrong-owner Prisma evaluations before appending an event', async () => {
    const current = createCompletedPrismaOrder();
    const staleHarness = createPrismaMutationHarness(
      current,
      current,
      observedAt,
    );
    staleHarness.transaction.fileObject.findMany.mockResolvedValueOnce([
      createEvaluationFile({ ownerUserId: 'shipper-1' }),
    ]);
    staleHarness.transaction.order.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      staleHarness.repository.executeIdempotentOrderMutation(
        createShipperDriverEvaluationMutationInput(
          current.id,
          current.updatedAt.toISOString(),
        ),
      ),
    ).resolves.toEqual({ kind: 'conflict' });
    expect(staleHarness.transaction.orderEvent.create).not.toHaveBeenCalled();
    expect(
      staleHarness.transaction.orderIdempotencyRecord.update,
    ).not.toHaveBeenCalled();

    const wrongOwner = createCompletedPrismaOrder({ shipperId: 'shipper-2' });
    const ownerHarness = createPrismaMutationHarness(
      wrongOwner,
      wrongOwner,
      observedAt,
    );
    await expect(
      ownerHarness.repository.executeIdempotentOrderMutation(
        createShipperDriverEvaluationMutationInput(
          wrongOwner.id,
          wrongOwner.updatedAt.toISOString(),
        ),
      ),
    ).resolves.toEqual({ kind: 'state-invalid' });
    expect(ownerHarness.transaction.fileObject.findMany).not.toHaveBeenCalled();
    expect(ownerHarness.transaction.order.updateMany).not.toHaveBeenCalled();
    expect(ownerHarness.transaction.orderEvent.create).not.toHaveBeenCalled();
  });

  it('recovers a committed Prisma driver evaluation snapshot after a same-key reservation race', async () => {
    const current = createCompletedPrismaOrder();
    const { repository, prisma } = createPrismaMutationHarness(
      current,
      current,
      observedAt,
    );
    const input = createShipperDriverEvaluationMutationInput(
      current.id,
      current.updatedAt.toISOString(),
    );
    const responseSnapshot = {
      ...createOrderSnapshot(createOrderInput(), current),
      id: current.id,
      status: current.status,
      assignedDriverId: 'driver-1',
      updatedAtIso: expectedUpdatedAt.toISOString(),
    };
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    prisma.orderIdempotencyRecord.findUnique.mockResolvedValueOnce({
      id: 'idempotency-winner',
      actorUserId: input.actorUserId,
      orderId: input.orderId,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      responseSnapshot,
      createdAt: observedAt,
      expiresAt: new Date(input.expiresAtIso),
    });

    await expect(
      repository.executeIdempotentOrderMutation(input),
    ).resolves.toEqual({
      kind: 'success',
      order: responseSnapshot,
      replayed: true,
    });
  });
});

describe('InMemoryOrdersRepository order mutation idempotency', () => {
  function createRepository(initialNowIso = '2026-07-12T08:00:00.000Z') {
    let now = new Date(initialNowIso);

    return {
      repository: new InMemoryOrdersRepository(() => now),
      setNow(nextIso: string) {
        now = new Date(nextIso);
      },
    };
  }

  it('replays the first successful mutation without adding another event', async () => {
    const { repository } = createRepository();
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    const input = createCancelMutationInput(order.id, order.updatedAtIso);

    const first = await repository.executeIdempotentOrderMutation(input);
    const replay = await repository.executeIdempotentOrderMutation(input);

    expect(first).toMatchObject({
      kind: 'success',
      replayed: false,
      order: expect.objectContaining({
        id: order.id,
        status: 'cancelled',
      }),
    });
    expect(replay).toEqual({
      kind: 'success',
      replayed: true,
      order: (first as Extract<typeof first, { kind: 'success' }>).order,
    });
    expect((await repository.findOrderById(order.id))?.events).toHaveLength(2);
  });

  it('rejects a stale baseline from another mutation key', async () => {
    const { repository } = createRepository();
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );

    await repository.executeIdempotentOrderMutation(
      createDriverAcceptMutationInput(
        order.id,
        order.updatedAtIso,
        'accept-key-1',
        'driver-1',
        {
          noteText: '先接单推进基线',
          driverSnapshot: createDriverSnapshot('driver-1'),
        },
      ),
    );

    await expect(
      repository.executeIdempotentOrderMutation(
        createCancelMutationInput(order.id, order.updatedAtIso, 'cancel-key-2'),
      ),
    ).resolves.toEqual({ kind: 'conflict' });
  });

  it('rejects reuse of the key for a different fingerprint', async () => {
    const { repository } = createRepository();
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    const input = createCancelMutationInput(order.id, order.updatedAtIso);

    await repository.executeIdempotentOrderMutation(input);

    await expect(
      repository.executeIdempotentOrderMutation({
        ...input,
        requestFingerprint: 'different-fingerprint',
      }),
    ).resolves.toEqual({ kind: 'key-reused' });
  });

  it('returns key-expired when the replay window has elapsed', async () => {
    const { repository, setNow } = createRepository();
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    const input = createCancelMutationInput(
      order.id,
      order.updatedAtIso,
      'key-1',
      {
        expiresAtIso: '2026-07-12T08:00:01.000Z',
      },
    );

    await repository.executeIdempotentOrderMutation(input);
    setNow('2026-07-13T08:00:02.000Z');

    await expect(
      repository.executeIdempotentOrderMutation(input),
    ).resolves.toEqual({ kind: 'key-expired' });
  });

  it('only lets one driver accept mutation win a shared baseline', async () => {
    const { repository } = createRepository();
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );

    const first = await repository.executeIdempotentOrderMutation(
      createDriverAcceptMutationInput(
        order.id,
        order.updatedAtIso,
        'accept-key-1',
        'driver-1',
        {
          noteText: '马上联系货主',
          driverSnapshot: createDriverSnapshot('driver-1'),
        },
      ),
    );

    const second = await repository.executeIdempotentOrderMutation(
      createDriverAcceptMutationInput(
        order.id,
        order.updatedAtIso,
        'accept-key-2',
        'driver-2',
        {
          noteText: '我也准备接单',
          driverSnapshot: createDriverSnapshot('driver-2'),
        },
      ),
    );

    expect(first).toMatchObject({
      kind: 'success',
      order: expect.objectContaining({
        id: order.id,
        status: 'loading',
      }),
    });
    expect(second).toEqual({ kind: 'conflict' });
    expect(
      (await repository.findOrderById(order.id))?.events.filter(
        event => event.eventType === 'driver_accepted',
      ),
    ).toHaveLength(1);
  });

  it('replays one successful admin batch cancel without adding extra events', async () => {
    const { repository } = createRepository();
    const firstOrder = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    const secondOrder = await repository.seedOrderForTest(
      'shipper-2',
      createOrderInput({ pickupAddress: '南山区科技园' }),
    );
    const input = createAdminBatchCancelInput([
      {
        orderId: secondOrder.id,
        baseUpdatedAtIso: secondOrder.updatedAtIso,
      },
      {
        orderId: firstOrder.id,
        baseUpdatedAtIso: firstOrder.updatedAtIso,
      },
    ]);

    const first = await repository.executeIdempotentAdminBatchCancel(input);
    const replay = await repository.executeIdempotentAdminBatchCancel(input);

    expect(first).toMatchObject({
      orderIds: [secondOrder.id, firstOrder.id],
      updatedCount: 2,
      items: [
        expect.objectContaining({ id: secondOrder.id, status: 'cancelled' }),
        expect.objectContaining({ id: firstOrder.id, status: 'cancelled' }),
      ],
    });
    expect(replay).toEqual(first);
    expect(
      (await repository.findOrderById(firstOrder.id))?.events,
    ).toHaveLength(2);
    expect(
      (await repository.findOrderById(secondOrder.id))?.events,
    ).toHaveLength(2);
  });

  it('publishes no staged batch cancel state when any order is not waiting', async () => {
    const { repository } = createRepository();
    const waitingOrder = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    const loadingOrder = await repository.seedOrderForTest(
      'shipper-2',
      createOrderInput({ pickupAddress: '南山区科技园' }),
    );
    await repository.executeIdempotentOrderMutation(
      createDriverAcceptMutationInput(
        loadingOrder.id,
        loadingOrder.updatedAtIso,
        'loading-key',
        'driver-1',
        {
          noteText: '先把订单接成 loading',
          driverSnapshot: createDriverSnapshot('driver-1'),
        },
      ),
    );

    await expect(
      repository.executeIdempotentAdminBatchCancel(
        createAdminBatchCancelInput([
          {
            orderId: waitingOrder.id,
            baseUpdatedAtIso: waitingOrder.updatedAtIso,
          },
          {
            orderId: loadingOrder.id,
            baseUpdatedAtIso:
              (await repository.findOrderById(loadingOrder.id))?.updatedAtIso ??
              loadingOrder.updatedAtIso,
          },
        ]),
      ),
    ).rejects.toMatchObject({
      code: 'ORDER_STATE_INVALID',
      message: '当前订单状态不允许批量取消',
    });
    await expect(
      repository.findOrderById(waitingOrder.id),
    ).resolves.toMatchObject({
      status: 'waiting',
    });
  });

  it('atomically replaces coupon A with coupon B during a shipper update', async () => {
    const couponStore = new InMemoryProfileCouponsStore({
      coupons: [
        createCoupon({ status: 'locked', lockedOrderNo: undefined }),
        createCoupon({
          id: 'coupon-2',
          title: '满 500 减 50',
          discountCents: 5000,
          minOrderAmountCents: 50000,
        }),
      ],
    });
    const repository = new InMemoryOrdersRepository(
      () => new Date('2026-07-14T08:00:00.000Z'),
      couponStore,
    );
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({
        couponId: 'coupon-1',
        couponTitle: '满 300 减 30',
        couponDiscountCents: 3000,
        payablePriceCents: 73000,
      }),
    );

    await expect(
      repository.executeIdempotentOrderMutation(
        createShipperUpdateMutationInput(
          order.id,
          order.updatedAtIso,
          createOrderInput({
            couponId: 'coupon-2',
            couponTitle: '满 500 减 50',
            couponDiscountCents: 5000,
            payablePriceCents: 71000,
          }),
        ),
      ),
    ).resolves.toMatchObject({
      kind: 'success',
      order: expect.objectContaining({ couponId: 'coupon-2' }),
    });

    const coupons = couponStore.clone();
    expect(coupons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'coupon-1', status: 'usable' }),
        expect.objectContaining({
          id: 'coupon-2',
          status: 'locked',
          lockedOrderNo: order.orderNo,
        }),
      ]),
    );
    expect(coupons.find(coupon => coupon.id === 'coupon-1')).not.toHaveProperty(
      'lockedOrderNo',
    );
  });

  it('atomically releases a coupon when its order is cancelled', async () => {
    const couponStore = new InMemoryProfileCouponsStore({
      coupons: [createCoupon({ status: 'locked' })],
    });
    const repository = new InMemoryOrdersRepository(
      () => new Date('2026-07-14T08:00:00.000Z'),
      couponStore,
    );
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({ couponId: 'coupon-1' }),
    );

    await expect(
      repository.executeIdempotentOrderMutation(
        createCancelMutationInput(order.id, order.updatedAtIso),
      ),
    ).resolves.toMatchObject({
      kind: 'success',
      order: expect.objectContaining({ status: 'cancelled' }),
    });
    expect(couponStore.clone()[0]).toMatchObject({ status: 'usable' });
    expect(couponStore.clone()[0]).not.toHaveProperty('lockedOrderNo');
  });

  it('atomically redeems a coupon when its order is completed', async () => {
    const couponStore = new InMemoryProfileCouponsStore({
      coupons: [createCoupon({ status: 'locked' })],
    });
    const repository = new InMemoryOrdersRepository(
      () => new Date('2026-07-14T08:00:00.000Z'),
      couponStore,
    );
    const seeded = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({ couponId: 'coupon-1' }),
    );
    await repository.acceptDriverOrder(seeded.id, 'driver-1', {});
    const order = await repository.advanceOrderStatus(seeded.id, 'shipper-1', {
      nextStatus: 'confirming',
    });

    await expect(
      repository.executeIdempotentOrderMutation(
        createCompleteMutationInput(order.id, order.updatedAtIso),
      ),
    ).resolves.toMatchObject({
      kind: 'success',
      order: expect.objectContaining({ status: 'completed' }),
    });
    expect(couponStore.clone()[0]).toMatchObject({
      status: 'used',
      usedOrderNo: order.orderNo,
      usedAtIso: '2026-07-14T08:00:00.000Z',
    });
  });

  it('publishes no staged mutation state when the second step of coupon replacement fails', async () => {
    const couponStore = new InMemoryProfileCouponsStore({
      coupons: [
        createCoupon({
          status: 'locked',
          lockedOrderNo: 'another-order',
        }),
        createCoupon({
          id: 'coupon-2',
          title: '满 500 减 50',
          discountCents: 5000,
          minOrderAmountCents: 50000,
        }),
      ],
    });
    const repository = new InMemoryOrdersRepository(
      () => new Date('2026-07-14T08:00:00.000Z'),
      couponStore,
    );
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({ couponId: 'coupon-1' }),
    );
    const couponsBefore = couponStore.clone();
    const orderBefore = structuredClone(order);

    await expect(
      repository.executeIdempotentOrderMutation(
        createShipperUpdateMutationInput(
          order.id,
          order.updatedAtIso,
          createOrderInput({
            couponId: 'coupon-2',
            couponTitle: '满 500 减 50',
            couponDiscountCents: 5000,
            payablePriceCents: 71000,
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'PROFILE_COUPON_NOT_AVAILABLE' });

    expect(couponStore.clone()).toEqual(couponsBefore);
    expect(await repository.findOrderById(order.id)).toEqual(orderBefore);
    expect(
      (
        repository as unknown as {
          orderIdempotencyRecords: unknown[];
        }
      ).orderIdempotencyRecords,
    ).toHaveLength(0);
  });
});

describe('InMemoryOrdersRepository exception cases', () => {
  it('sorts shipper and admin exception case lists by most recent updatedAt first', async () => {
    let currentTime = new Date('2026-07-12T08:00:00.000Z');
    const repository = new InMemoryOrdersRepository(() => currentTime);
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );

    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '司机延误',
      description: '第一张异常工单等待客服处理。',
    });
    const first = (await repository.listOrderExceptionCases(order.id)).items[0];

    currentTime = new Date('2026-07-12T08:05:00.000Z');
    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '货损',
      description: '第二张异常工单仍在待处理状态。',
    });
    const second = (
      await repository.listOrderExceptionCases(order.id)
    ).items.find(item => item.id !== first.id);

    if (!second) {
      throw new Error('second exception case missing');
    }

    currentTime = new Date('2026-07-12T08:10:00.000Z');
    const processing = await repository.transitionOrderExceptionCase(
      first.id,
      'admin-1',
      'pending',
      'processing',
      {
        baseUpdatedAtIso: first.updatedAtIso,
        content: '客服已经联系双方核实异常情况。',
      },
    );

    expect(processing).toMatchObject({
      id: first.id,
      status: 'processing',
      updatedAtIso: '2026-07-12T08:10:00.000Z',
    });
    await expect(
      repository.listOrderExceptionCases(order.id),
    ).resolves.toMatchObject({
      total: 2,
      items: [
        expect.objectContaining({
          id: first.id,
          status: 'processing',
          updatedAtIso: '2026-07-12T08:10:00.000Z',
        }),
        expect.objectContaining({
          id: second.id,
          status: 'pending',
          updatedAtIso: '2026-07-12T08:05:00.000Z',
        }),
      ],
    });
    await expect(
      repository.listAdminOrderExceptionCases({
        page: 1,
        pageSize: 20,
        keyword: order.orderNo,
      }),
    ).resolves.toMatchObject({
      total: 2,
      items: [
        expect.objectContaining({
          id: first.id,
          status: 'processing',
          updatedAtIso: '2026-07-12T08:10:00.000Z',
        }),
        expect.objectContaining({
          id: second.id,
          status: 'pending',
          updatedAtIso: '2026-07-12T08:05:00.000Z',
        }),
      ],
    });
  });

  it('filters admin case lists and preserves case action ordering', async () => {
    const repository = new InMemoryOrdersRepository(
      () => new Date('2026-07-12T08:00:00.000Z'),
    );
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '司机延误',
      description: '司机反馈高速拥堵，预计晚到 40 分钟',
    });
    const created = (await repository.listOrderExceptionCases(order.id))
      .items[0];
    const processing = await repository.transitionOrderExceptionCase(
      created.id,
      'admin-1',
      'pending',
      'processing',
      {
        baseUpdatedAtIso: created.updatedAtIso,
        content: '客服已经联系双方核实异常情况。',
      },
    );

    expect(processing).toMatchObject({
      status: 'processing',
      actions: [expect.objectContaining({ toStatus: 'processing' })],
    });
    await expect(
      repository.listAdminOrderExceptionCases({
        page: 1,
        pageSize: 20,
        status: 'processing',
        sourceRole: 'shipper',
        appealStatus: 'none',
        keyword: order.orderNo,
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: created.id })],
    });
  });

  it('records compensation facts on resolved cases and syncs the latest order snapshot', async () => {
    const repository = new InMemoryOrdersRepository(
      () => new Date('2026-07-12T08:00:00.000Z'),
    );
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '货损',
      description: '司机反馈货物外包装破损。',
    });
    const created = (await repository.listOrderExceptionCases(order.id))
      .items[0];
    const processing = await repository.transitionOrderExceptionCase(
      created.id,
      'admin-1',
      'pending',
      'processing',
      {
        baseUpdatedAtIso: created.updatedAtIso,
        content: '客服已经联系双方核实异常情况。',
      },
    );

    if (
      !processing ||
      processing === 'state-invalid' ||
      processing === 'conflict'
    ) {
      throw new Error('processing transition failed');
    }

    const resolved = await repository.transitionOrderExceptionCase(
      created.id,
      'admin-1',
      'processing',
      'resolved',
      {
        baseUpdatedAtIso: processing.updatedAtIso,
        content: '客服确认需要给货主赔付。',
        compensationStatus: 'pending',
        compensationTargetRole: 'shipper',
        compensationAmountCents: 3600,
      },
    );

    expect(resolved).toMatchObject({
      status: 'resolved',
      compensationStatus: 'pending',
      compensationTargetRole: 'shipper',
      compensationAmountCents: 3600,
    });
    await expect(repository.findOrderById(order.id)).resolves.toMatchObject({
      latestExceptionCase: {
        id: created.id,
        status: 'resolved',
        compensationStatus: 'pending',
        compensationTargetRole: 'shipper',
        compensationAmountCents: 3600,
      },
    });
    await expect(
      repository.listAdminOrderExceptionCases({
        page: 1,
        pageSize: 20,
        compensationStatus: 'pending',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          id: created.id,
          compensationStatus: 'pending',
        }),
      ],
    });
  });

  it('appends exception case actions without changing status', async () => {
    let currentTime = new Date('2026-07-12T08:00:00.000Z');
    const repository = new InMemoryOrdersRepository(() => currentTime);
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '司机延误',
      description: '异常工单待系统升级。',
    });
    const created = (await repository.listOrderExceptionCases(order.id))
      .items[0];

    currentTime = new Date('2026-07-12T08:20:00.000Z');
    await expect(
      repository.appendOrderExceptionCaseAction(
        created.id,
        'system:auto-escalation:acceptance',
        'pending',
        {
          baseUpdatedAtIso: created.updatedAtIso,
          content:
            '系统检测到异常工单 CASE202607120001 受理 SLA 已超时 5 分钟，已自动升级给值班客服跟进。',
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: created.id,
        status: 'pending',
        updatedAtIso: '2026-07-12T08:20:00.000Z',
        actions: expect.arrayContaining([
          expect.objectContaining({
            adminUserId: 'system:auto-escalation:acceptance',
            fromStatus: 'pending',
            toStatus: 'pending',
            content:
              '系统检测到异常工单 CASE202607120001 受理 SLA 已超时 5 分钟，已自动升级给值班客服跟进。',
          }),
        ]),
      }),
    );
  });
});

describe('PrismaOrdersRepository exception case lists', () => {
  it('requests recent-activity ordering for shipper and admin exception case queries', async () => {
    const findMany = jest.fn().mockResolvedValue([
      createPrismaExceptionCaseListRecord({
        id: 'case-2',
        caseNo: 'CASE202607120002',
        orderId: 'order-1',
        orderNo: 'HY202607120001',
        createdAt: new Date('2026-07-12T08:05:00.000Z'),
        updatedAt: new Date('2026-07-12T08:10:00.000Z'),
      }),
    ]);
    const repository = new PrismaOrdersRepository(
      {
        orderExceptionCase: { findMany },
      } as unknown as PrismaOrdersClient,
      () => new Date('2026-07-12T08:10:00.000Z'),
    );

    await expect(
      repository.listOrderExceptionCases('order-1'),
    ).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: 'case-2' })],
    });
    await expect(
      repository.listAdminOrderExceptionCases({
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: 'case-2' })],
    });
    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { orderId: 'order-1' },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    );
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    );
  });

  it('filters admin exception case lists by compensation status', async () => {
    const findMany = jest.fn().mockResolvedValue([
      createPrismaExceptionCaseListRecord({
        id: 'case-1',
        caseNo: 'CASE202607120001',
        compensationStatus: 'pending',
        compensationTargetRole: 'shipper',
        compensationAmountCents: 3600,
        compensationUpdatedAt: new Date('2026-07-12T08:20:00.000Z'),
      }),
      createPrismaExceptionCaseListRecord({
        id: 'case-2',
        caseNo: 'CASE202607120002',
        compensationStatus: 'executed',
        compensationTargetRole: 'shipper',
        compensationAmountCents: 3600,
        compensationUpdatedAt: new Date('2026-07-12T08:30:00.000Z'),
        compensationExecutedAt: new Date('2026-07-12T08:35:00.000Z'),
      }),
    ]);
    const repository = new PrismaOrdersRepository(
      {
        orderExceptionCase: { findMany },
      } as unknown as PrismaOrdersClient,
      () => new Date('2026-07-12T08:35:00.000Z'),
    );

    await expect(
      repository.listAdminOrderExceptionCases({
        page: 1,
        pageSize: 20,
        compensationStatus: 'pending',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          id: 'case-1',
          compensationStatus: 'pending',
        }),
      ],
    });
  });

  it('filters admin exception case lists by appeal status', async () => {
    const findMany = jest.fn().mockResolvedValue([
      createPrismaExceptionCaseListRecord({
        id: 'case-1',
        caseNo: 'CASE202607120001',
        appealStatus: 'requested',
      }),
      createPrismaExceptionCaseListRecord({
        id: 'case-2',
        caseNo: 'CASE202607120002',
        appealStatus: 'accepted',
      }),
    ]);
    const repository = new PrismaOrdersRepository(
      {
        orderExceptionCase: { findMany },
      } as unknown as PrismaOrdersClient,
      () => new Date('2026-07-12T08:35:00.000Z'),
    );

    await expect(
      repository.listAdminOrderExceptionCases({
        page: 1,
        pageSize: 20,
        appealStatus: 'requested',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({ id: 'case-1', appealStatus: 'requested' }),
      ],
    });
  });

  it('writes an order event when resolving an appealed case with an appeal decision', async () => {
    const current = createPrismaExceptionCaseListRecord({
      id: 'case-1',
      status: 'processing',
      appealStatus: 'requested',
      updatedAt: new Date('2026-07-12T08:10:00.000Z'),
    });
    const updated = createPrismaExceptionCaseListRecord({
      id: 'case-1',
      status: 'resolved',
      appealStatus: 'accepted',
      resolutionText: '客服复核后改为待赔付跟进。',
      compensationStatus: 'pending',
      compensationTargetRole: 'shipper',
      compensationAmountCents: 4200,
      compensationUpdatedAt: new Date('2026-07-12T08:20:00.000Z'),
      resolvedAt: new Date('2026-07-12T08:20:00.000Z'),
      updatedAt: new Date('2026-07-12T08:20:00.000Z'),
    });
    const transaction = {
      orderExceptionCaseAction: {
        create: jest.fn().mockResolvedValue({ id: 'action-1' }),
      },
      orderExceptionCase: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(updated),
      },
      orderEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      },
    };
    const prisma = {
      orderExceptionCase: {
        findUnique: jest.fn().mockResolvedValue(current),
      },
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const repository = new PrismaOrdersRepository(
      prisma as unknown as PrismaOrdersClient,
      () => new Date('2026-07-12T08:20:00.000Z'),
    );

    await expect(
      repository.transitionOrderExceptionCase(
        'case-1',
        'admin-1',
        'processing',
        'resolved',
        {
          baseUpdatedAtIso: '2026-07-12T08:10:00.000Z',
          content: '客服复核后改为待赔付跟进。',
          compensationStatus: 'pending',
          appealDecision: 'accepted',
          compensationTargetRole: 'shipper',
          compensationAmountCents: 4200,
        },
      ),
    ).resolves.toMatchObject({
      id: 'case-1',
      status: 'resolved',
      appealStatus: 'accepted',
      compensationStatus: 'pending',
    });
    expect(transaction.orderExceptionCase.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'case-1',
        status: 'processing',
        updatedAt: new Date('2026-07-12T08:10:00.000Z'),
      },
      data: expect.objectContaining({
        status: 'resolved',
        updatedAt: new Date('2026-07-12T08:20:00.000Z'),
      }),
    });
    expect(transaction.orderEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: current.orderId,
        actorUserId: 'admin-1',
        eventType: 'exception_appeal_accepted',
        noteText: '异常工单申诉已受理：客服复核后改为待赔付跟进。',
      }),
    });
  });

  it('appends exception case actions from Prisma without changing status', async () => {
    const current = createPrismaExceptionCaseListRecord({
      id: 'case-1',
      status: 'processing',
      updatedAt: new Date('2026-07-12T08:10:00.000Z'),
    });
    const updated = createPrismaExceptionCaseListRecord({
      id: 'case-1',
      status: 'processing',
      updatedAt: new Date('2026-07-12T08:20:00.000Z'),
      actions: [
        {
          id: 'action-1',
          adminUserId: 'system:auto-escalation:resolution',
          fromStatus: 'processing',
          toStatus: 'processing',
          content:
            '系统检测到异常工单 CASE202607120001 解决 SLA 已超时 30 分钟，已自动升级给值班客服继续处理。',
          createdAt: new Date('2026-07-12T08:20:00.000Z'),
        },
      ],
    });
    const transaction = {
      orderExceptionCaseAction: {
        create: jest.fn().mockResolvedValue({ id: 'action-1' }),
      },
      orderExceptionCase: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(updated),
      },
    };
    const prisma = {
      orderExceptionCase: {
        findUnique: jest.fn().mockResolvedValue(current),
      },
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const repository = new PrismaOrdersRepository(
      prisma as unknown as PrismaOrdersClient,
      () => new Date('2026-07-12T08:20:00.000Z'),
    );

    await expect(
      repository.appendOrderExceptionCaseAction(
        'case-1',
        'system:auto-escalation:resolution',
        'processing',
        {
          baseUpdatedAtIso: '2026-07-12T08:10:00.000Z',
          content:
            '系统检测到异常工单 CASE202607120001 解决 SLA 已超时 30 分钟，已自动升级给值班客服继续处理。',
        },
      ),
    ).resolves.toMatchObject({
      id: 'case-1',
      status: 'processing',
      actions: [
        expect.objectContaining({
          adminUserId: 'system:auto-escalation:resolution',
          fromStatus: 'processing',
          toStatus: 'processing',
        }),
      ],
      updatedAtIso: '2026-07-12T08:20:00.000Z',
    });
    expect(transaction.orderExceptionCase.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'case-1',
        status: 'processing',
        updatedAt: new Date('2026-07-12T08:10:00.000Z'),
      },
      data: {
        updatedAt: new Date('2026-07-12T08:20:00.000Z'),
      },
    });
    expect(transaction.orderExceptionCaseAction.create).toHaveBeenCalledWith({
      data: {
        caseId: 'case-1',
        adminUserId: 'system:auto-escalation:resolution',
        fromStatus: 'processing',
        toStatus: 'processing',
        content:
          '系统检测到异常工单 CASE202607120001 解决 SLA 已超时 30 分钟，已自动升级给值班客服继续处理。',
        createdAt: new Date('2026-07-12T08:20:00.000Z'),
      },
    });
  });

  it('returns conflict before transition side effects when the case CAS loses', async () => {
    const current = createPrismaExceptionCaseListRecord({
      id: 'case-1',
      status: 'processing',
      appealStatus: 'requested',
      updatedAt: new Date('2026-07-12T08:10:00.000Z'),
    });
    const transaction = {
      orderExceptionCase: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn(),
      },
      orderExceptionCaseAction: { create: jest.fn() },
      orderEvent: { create: jest.fn() },
    };
    const prisma = {
      orderExceptionCase: {
        findUnique: jest.fn().mockResolvedValue(current),
      },
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const repository = new PrismaOrdersRepository(
      prisma as unknown as PrismaOrdersClient,
      () => new Date('2026-07-12T08:20:00.000Z'),
    );

    await expect(
      repository.transitionOrderExceptionCase(
        'case-1',
        'admin-1',
        'processing',
        'resolved',
        {
          baseUpdatedAtIso: '2026-07-12T08:10:00.000Z',
          content: '客服复核后确认需要赔付。',
          compensationStatus: 'pending',
          appealDecision: 'accepted',
          compensationTargetRole: 'shipper',
          compensationAmountCents: 4200,
        },
      ),
    ).resolves.toBe('conflict');
    expect(transaction.orderExceptionCase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'case-1',
          status: 'processing',
          updatedAt: new Date('2026-07-12T08:10:00.000Z'),
        },
      }),
    );
    expect(transaction.orderExceptionCaseAction.create).not.toHaveBeenCalled();
    expect(transaction.orderEvent.create).not.toHaveBeenCalled();
    expect(transaction.orderExceptionCase.findUnique).not.toHaveBeenCalled();
  });

  it('returns conflict before appending an action when the case CAS loses', async () => {
    const current = createPrismaExceptionCaseListRecord({
      id: 'case-1',
      status: 'processing',
      updatedAt: new Date('2026-07-12T08:10:00.000Z'),
    });
    const transaction = {
      orderExceptionCase: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn(),
      },
      orderExceptionCaseAction: { create: jest.fn() },
    };
    const prisma = {
      orderExceptionCase: {
        findUnique: jest.fn().mockResolvedValue(current),
      },
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const repository = new PrismaOrdersRepository(
      prisma as unknown as PrismaOrdersClient,
      () => new Date('2026-07-12T08:20:00.000Z'),
    );

    await expect(
      repository.appendOrderExceptionCaseAction(
        'case-1',
        'system:auto-escalation:resolution',
        'processing',
        {
          baseUpdatedAtIso: '2026-07-12T08:10:00.000Z',
          content: '系统检测到异常工单解决 SLA 已超时。',
        },
      ),
    ).resolves.toBe('conflict');
    expect(transaction.orderExceptionCase.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'case-1',
        status: 'processing',
        updatedAt: new Date('2026-07-12T08:10:00.000Z'),
      },
      data: {
        updatedAt: new Date('2026-07-12T08:20:00.000Z'),
      },
    });
    expect(transaction.orderExceptionCaseAction.create).not.toHaveBeenCalled();
    expect(transaction.orderExceptionCase.findUnique).not.toHaveBeenCalled();
  });
});

describe('InMemoryOrdersRepository exception compensation execution', () => {
  async function seedResolvedShipperCompensation(options?: {
    financialStore?: InMemoryFinancialStore;
  }) {
    const repository = new InMemoryOrdersRepository(
      () => new Date('2026-07-20T08:00:00.000Z'),
      new InMemoryProfileCouponsStore(),
      options?.financialStore,
    );
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '货损',
      description: '司机反馈货物外包装破损。',
    });
    const created = (await repository.listOrderExceptionCases(order.id))
      .items[0];
    const processing = await repository.transitionOrderExceptionCase(
      created.id,
      'admin-1',
      'pending',
      'processing',
      {
        baseUpdatedAtIso: created.updatedAtIso,
        content: '客服已经联系双方核实异常情况。',
      },
    );

    if (
      !processing ||
      processing === 'state-invalid' ||
      processing === 'conflict'
    ) {
      throw new Error('processing transition failed');
    }

    const resolved = await repository.transitionOrderExceptionCase(
      created.id,
      'admin-1',
      'processing',
      'resolved',
      {
        baseUpdatedAtIso: processing.updatedAtIso,
        content: '客服确认需要给货主赔付。',
        compensationStatus: 'pending',
        compensationTargetRole: 'shipper',
        compensationAmountCents: 3600,
      },
    );

    if (!resolved || resolved === 'state-invalid' || resolved === 'conflict') {
      throw new Error('resolve transition failed');
    }

    return { repository, order, caseId: created.id, resolved };
  }

  it('executes a shipper compensation against a balanced ledger transaction', async () => {
    const financialStore = new InMemoryFinancialStore();
    const { repository, order, caseId, resolved } =
      await seedResolvedShipperCompensation({ financialStore });

    const result = await repository.executeExceptionCaseCompensation({
      caseId,
      adminUserId: 'admin-1',
      baseUpdatedAtIso: resolved.updatedAtIso,
      idempotencyKey: 'idem-comp-1',
      requestFingerprint: 'fp-comp-1',
      requestId: 'req-comp-1',
      content: '平台确认线下向货主赔付到账。',
    });

    expect(result).toMatchObject({
      kind: 'success',
      replayed: false,
      exceptionCase: {
        compensationStatus: 'executed',
        compensationTargetRole: 'shipper',
        compensationAmountCents: 3600,
      },
    });
    if (result.kind !== 'success') {
      throw new Error('expected success');
    }
    expect(result.exceptionCase.compensationTransactionId).toBeDefined();
    expect(result.exceptionCase.compensationExecutedAtIso).toBeDefined();

    const transactions = financialStore.listFinancialTransactions();
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      type: 'order_compensation',
      referenceId: caseId,
      amountCents: 3600,
    });
    const signed = transactions[0].entries.reduce(
      (total, entry) =>
        total +
        (entry.direction === 'credit' ? entry.amountCents : -entry.amountCents),
      0,
    );
    expect(signed).toBe(0);

    const auditLogs = financialStore.listFinancialAuditLogs();
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({
      action: 'exception_compensation.execute',
      entityType: 'order_exception_case',
      entityId: caseId,
    });

    await expect(repository.findOrderById(order.id)).resolves.toMatchObject({
      latestExceptionCase: { compensationStatus: 'executed' },
    });
  });

  it('replays the same idempotency key without creating a second ledger transaction', async () => {
    const financialStore = new InMemoryFinancialStore();
    const { repository, caseId, resolved } =
      await seedResolvedShipperCompensation({ financialStore });
    const request = {
      caseId,
      adminUserId: 'admin-1',
      baseUpdatedAtIso: resolved.updatedAtIso,
      idempotencyKey: 'idem-comp-1',
      requestFingerprint: 'fp-comp-1',
      requestId: 'req-comp-1',
      content: '平台确认线下向货主赔付到账。',
    };
    const first = await repository.executeExceptionCaseCompensation(request);
    const second = await repository.executeExceptionCaseCompensation(request);

    expect(first.kind).toBe('success');
    expect(second).toMatchObject({ kind: 'success', replayed: true });
    expect(financialStore.listFinancialTransactions()).toHaveLength(1);
    expect(financialStore.listFinancialAuditLogs()).toHaveLength(1);
  });

  it('rejects a reused idempotency key with a different fingerprint', async () => {
    const { repository, caseId, resolved } =
      await seedResolvedShipperCompensation();
    await repository.executeExceptionCaseCompensation({
      caseId,
      adminUserId: 'admin-1',
      baseUpdatedAtIso: resolved.updatedAtIso,
      idempotencyKey: 'idem-comp-1',
      requestFingerprint: 'fp-comp-1',
      requestId: 'req-comp-1',
      content: '平台确认线下向货主赔付到账。',
    });

    await expect(
      repository.executeExceptionCaseCompensation({
        caseId,
        adminUserId: 'admin-1',
        baseUpdatedAtIso: resolved.updatedAtIso,
        idempotencyKey: 'idem-comp-1',
        requestFingerprint: 'fp-comp-DIFFERENT',
        requestId: 'req-comp-2',
        content: '不同请求指纹。',
      }),
    ).resolves.toMatchObject({ kind: 'key-reused' });
  });

  it('refuses to execute compensation that is not resolved with a pending amount', async () => {
    const repository = new InMemoryOrdersRepository(
      () => new Date('2026-07-20T08:00:00.000Z'),
    );
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '货损',
      description: '货物破损，等待客服处理。',
    });
    const created = (await repository.listOrderExceptionCases(order.id))
      .items[0];

    await expect(
      repository.executeExceptionCaseCompensation({
        caseId: created.id,
        adminUserId: 'admin-1',
        baseUpdatedAtIso: created.updatedAtIso,
        idempotencyKey: 'idem-comp-x',
        requestFingerprint: 'fp-comp-x',
        requestId: 'req-comp-x',
        content: '尝试对未决议工单赔付。',
      }),
    ).resolves.toMatchObject({ kind: 'not-executable' });
  });

  it('rejects a stale baseUpdatedAtIso with a conflict', async () => {
    const { repository, caseId } = await seedResolvedShipperCompensation();

    await expect(
      repository.executeExceptionCaseCompensation({
        caseId,
        adminUserId: 'admin-1',
        baseUpdatedAtIso: '2020-01-01T00:00:00.000Z',
        idempotencyKey: 'idem-comp-stale',
        requestFingerprint: 'fp-comp-stale',
        requestId: 'req-comp-stale',
        content: '版本过期的赔付执行。',
      }),
    ).resolves.toMatchObject({ kind: 'conflict' });
  });

  it('credits the driver wallet for a driver compensation', async () => {
    const financialStore = new InMemoryFinancialStore();
    const repository = new InMemoryOrdersRepository(
      () => new Date('2026-07-20T08:00:00.000Z'),
      new InMemoryProfileCouponsStore(),
      financialStore,
    );
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({ paymentMethod: 'cod' }),
    );
    await repository.acceptDriverOrder(order.id, 'driver-9', {});
    await repository.reportDriverOrderException(order.id, 'driver-9', {
      typeLabel: '装货口错误',
      description: '货主提供的装货地址有误，导致空跑。',
    });
    const created = (await repository.listOrderExceptionCases(order.id))
      .items[0];
    const processing = await repository.transitionOrderExceptionCase(
      created.id,
      'admin-1',
      'pending',
      'processing',
      { baseUpdatedAtIso: created.updatedAtIso, content: '客服受理司机异常。' },
    );
    if (
      !processing ||
      processing === 'state-invalid' ||
      processing === 'conflict'
    ) {
      throw new Error('processing failed');
    }
    const resolved = await repository.transitionOrderExceptionCase(
      created.id,
      'admin-1',
      'processing',
      'resolved',
      {
        baseUpdatedAtIso: processing.updatedAtIso,
        content: '确认赔付司机空跑损失。',
        compensationStatus: 'pending',
        compensationTargetRole: 'driver',
        compensationAmountCents: 5000,
      },
    );
    if (!resolved || resolved === 'state-invalid' || resolved === 'conflict') {
      throw new Error('resolve failed');
    }

    const result = await repository.executeExceptionCaseCompensation({
      caseId: created.id,
      adminUserId: 'admin-1',
      baseUpdatedAtIso: resolved.updatedAtIso,
      idempotencyKey: 'idem-comp-driver',
      requestFingerprint: 'fp-comp-driver',
      requestId: 'req-comp-driver',
      content: '赔付司机空跑损失已入钱包。',
    });

    expect(result.kind).toBe('success');
    expect(financialStore.findDriverWallet('driver-9')).toMatchObject({
      availableCents: 5000,
    });
  });
});

describe('PrismaOrdersRepository exception compensation execution', () => {
  function createHarness(casCount: number) {
    const current = {
      ...createPrismaExceptionCaseListRecord({
        id: 'case-1',
        status: 'resolved',
        compensationStatus: 'pending',
        compensationTargetRole: 'shipper',
        compensationAmountCents: 3600,
        compensationUpdatedAt: new Date('2026-07-20T08:00:00.000Z'),
        resolvedAt: new Date('2026-07-20T08:00:00.000Z'),
        updatedAt: new Date('2026-07-20T08:00:00.000Z'),
      }),
      order: {
        orderNo: 'HY202607200001',
        shipperId: 'shipper-1',
        assignedDriverId: null,
      },
    };
    const updated = {
      ...current,
      compensationStatus: 'executed' as const,
      compensationTransactionId: 'financial-transaction-1',
      compensationExecutedAt: new Date('2026-07-20T08:10:00.000Z'),
      compensationUpdatedAt: new Date('2026-07-20T08:10:00.000Z'),
      updatedAt: new Date('2026-07-20T08:10:00.000Z'),
    };
    const transaction = {
      financialAuditLog: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      orderExceptionCase: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce(updated),
        updateMany: jest.fn().mockResolvedValue({ count: casCount }),
        update: jest.fn().mockResolvedValue(updated),
      },
      financialTransaction: {
        create: jest.fn().mockResolvedValue({ id: 'financial-transaction-1' }),
      },
      driverWallet: { upsert: jest.fn() },
      orderEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) },
    };
    const prisma = {
      orderExceptionCase: { findUnique: jest.fn() },
      financialAuditLog: { findUnique: jest.fn() },
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };

    return {
      current,
      updated,
      prisma,
      repository: new PrismaOrdersRepository(
        prisma as unknown as PrismaOrdersClient,
        () => new Date('2026-07-20T08:10:00.000Z'),
        undefined,
        { createId: () => 'financial-transaction-1' },
      ),
      transaction,
    };
  }

  it('claims the case version before writing compensation side effects', async () => {
    const { current, repository, transaction } = createHarness(1);

    await expect(
      repository.executeExceptionCaseCompensation({
        caseId: 'case-1',
        adminUserId: 'admin-1',
        baseUpdatedAtIso: '2026-07-20T08:00:00.000Z',
        idempotencyKey: 'idem-comp-1',
        requestFingerprint: 'fp-comp-1',
        requestId: 'req-comp-1',
        content: '平台确认向货主赔付到账。',
      }),
    ).resolves.toMatchObject({
      kind: 'success',
      replayed: false,
      exceptionCase: {
        id: 'case-1',
        compensationStatus: 'executed',
        compensationTransactionId: 'financial-transaction-1',
      },
    });
    expect(transaction.orderExceptionCase.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'case-1',
        status: 'resolved',
        compensationStatus: 'pending',
        compensationTransactionId: null,
        updatedAt: current.updatedAt,
      },
      data: {
        updatedAt: new Date('2026-07-20T08:10:00.000Z'),
      },
    });
    expect(
      transaction.orderExceptionCase.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(
      transaction.financialTransaction.create.mock.invocationCallOrder[0],
    );
    expect(transaction.orderExceptionCase.findUnique).toHaveBeenCalledTimes(2);
  });

  it('returns conflict before ledger, wallet, event, and audit writes when compensation CAS loses', async () => {
    const { repository, transaction } = createHarness(0);

    await expect(
      repository.executeExceptionCaseCompensation({
        caseId: 'case-1',
        adminUserId: 'admin-1',
        baseUpdatedAtIso: '2026-07-20T08:00:00.000Z',
        idempotencyKey: 'idem-comp-race',
        requestFingerprint: 'fp-comp-race',
        requestId: 'req-comp-race',
        content: '并发执行赔付请求。',
      }),
    ).resolves.toEqual({ kind: 'conflict' });
    expect(transaction.financialTransaction.create).not.toHaveBeenCalled();
    expect(transaction.driverWallet.upsert).not.toHaveBeenCalled();
    expect(transaction.orderExceptionCase.update).not.toHaveBeenCalled();
    expect(transaction.orderEvent.create).not.toHaveBeenCalled();
    expect(transaction.financialAuditLog.create).not.toHaveBeenCalled();
    expect(transaction.orderExceptionCase.findUnique).toHaveBeenCalledTimes(1);
  });

  it('replays a matching idempotency winner after the compensation CAS loses', async () => {
    const { prisma, repository, transaction, updated } = createHarness(0);
    prisma.financialAuditLog.findUnique.mockResolvedValue({
      entityId: 'case-1',
      requestFingerprint: 'fp-comp-race',
    });
    prisma.orderExceptionCase.findUnique.mockResolvedValue(updated);

    await expect(
      repository.executeExceptionCaseCompensation({
        caseId: 'case-1',
        adminUserId: 'admin-1',
        baseUpdatedAtIso: '2026-07-20T08:00:00.000Z',
        idempotencyKey: 'idem-comp-race',
        requestFingerprint: 'fp-comp-race',
        requestId: 'req-comp-race',
        content: '并发执行赔付请求。',
      }),
    ).resolves.toMatchObject({
      kind: 'success',
      replayed: true,
      exceptionCase: {
        id: 'case-1',
        compensationStatus: 'executed',
      },
    });
    expect(transaction.financialTransaction.create).not.toHaveBeenCalled();
    expect(transaction.driverWallet.upsert).not.toHaveBeenCalled();
    expect(transaction.orderEvent.create).not.toHaveBeenCalled();
    expect(transaction.financialAuditLog.create).not.toHaveBeenCalled();
    expect(prisma.orderExceptionCase.findUnique).toHaveBeenCalledTimes(1);
  });

  it('returns key-reused when the compensation CAS winner used the key for another request', async () => {
    const { prisma, repository, transaction } = createHarness(0);
    prisma.financialAuditLog.findUnique.mockResolvedValue({
      entityId: 'case-1',
      requestFingerprint: 'fp-comp-other',
    });

    await expect(
      repository.executeExceptionCaseCompensation({
        caseId: 'case-1',
        adminUserId: 'admin-1',
        baseUpdatedAtIso: '2026-07-20T08:00:00.000Z',
        idempotencyKey: 'idem-comp-race',
        requestFingerprint: 'fp-comp-race',
        requestId: 'req-comp-race',
        content: '并发执行赔付请求。',
      }),
    ).resolves.toEqual({ kind: 'key-reused' });
    expect(transaction.financialTransaction.create).not.toHaveBeenCalled();
    expect(transaction.orderEvent.create).not.toHaveBeenCalled();
    expect(transaction.financialAuditLog.create).not.toHaveBeenCalled();
    expect(prisma.orderExceptionCase.findUnique).not.toHaveBeenCalled();
  });

  it('replays the committed winner after an audit idempotency unique-key race', async () => {
    const { prisma, repository, updated } = createHarness(1);
    const uniqueKeyError = Object.assign(new Error('unique key race'), {
      code: 'P2002',
    });
    prisma.$transaction.mockRejectedValue(uniqueKeyError);
    prisma.financialAuditLog.findUnique.mockResolvedValue({
      entityId: 'case-1',
      requestFingerprint: 'fp-comp-race',
    });
    prisma.orderExceptionCase.findUnique.mockResolvedValue(updated);

    await expect(
      repository.executeExceptionCaseCompensation({
        caseId: 'case-1',
        adminUserId: 'admin-1',
        baseUpdatedAtIso: '2026-07-20T08:00:00.000Z',
        idempotencyKey: 'idem-comp-race',
        requestFingerprint: 'fp-comp-race',
        requestId: 'req-comp-race',
        content: '并发执行赔付请求。',
      }),
    ).resolves.toMatchObject({
      kind: 'success',
      replayed: true,
      exceptionCase: { id: 'case-1', compensationStatus: 'executed' },
    });
  });

  it('returns key-reused after an audit unique-key race with another request', async () => {
    const { prisma, repository } = createHarness(1);
    prisma.$transaction.mockRejectedValue(
      Object.assign(new Error('unique key race'), { code: 'P2002' }),
    );
    prisma.financialAuditLog.findUnique.mockResolvedValue({
      entityId: 'case-other',
      requestFingerprint: 'fp-comp-other',
    });

    await expect(
      repository.executeExceptionCaseCompensation({
        caseId: 'case-1',
        adminUserId: 'admin-1',
        baseUpdatedAtIso: '2026-07-20T08:00:00.000Z',
        idempotencyKey: 'idem-comp-race',
        requestFingerprint: 'fp-comp-race',
        requestId: 'req-comp-race',
        content: '并发执行赔付请求。',
      }),
    ).resolves.toEqual({ kind: 'key-reused' });
    expect(prisma.orderExceptionCase.findUnique).not.toHaveBeenCalled();
  });

  it('rethrows an audit unique-key error when no committed winner is visible', async () => {
    const { prisma, repository } = createHarness(1);
    const uniqueKeyError = Object.assign(new Error('unique key race'), {
      code: 'P2002',
    });
    prisma.$transaction.mockRejectedValue(uniqueKeyError);
    prisma.financialAuditLog.findUnique.mockResolvedValue(null);

    await expect(
      repository.executeExceptionCaseCompensation({
        caseId: 'case-1',
        adminUserId: 'admin-1',
        baseUpdatedAtIso: '2026-07-20T08:00:00.000Z',
        idempotencyKey: 'idem-comp-race',
        requestFingerprint: 'fp-comp-race',
        requestId: 'req-comp-race',
        content: '并发执行赔付请求。',
      }),
    ).rejects.toBe(uniqueKeyError);
  });
});

describe('InMemoryOrdersRepository exception appeal', () => {
  async function seedResolvedCase() {
    const repository = new InMemoryOrdersRepository(
      () => new Date('2026-07-20T08:00:00.000Z'),
    );
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '货损',
      description: '货物外包装破损，要求赔付。',
    });
    const created = (await repository.listOrderExceptionCases(order.id))
      .items[0];
    const processing = await repository.transitionOrderExceptionCase(
      created.id,
      'admin-1',
      'pending',
      'processing',
      { baseUpdatedAtIso: created.updatedAtIso, content: '客服已受理该异常。' },
    );
    if (
      !processing ||
      processing === 'state-invalid' ||
      processing === 'conflict'
    ) {
      throw new Error('processing failed');
    }
    const resolved = await repository.transitionOrderExceptionCase(
      created.id,
      'admin-1',
      'processing',
      'resolved',
      {
        baseUpdatedAtIso: processing.updatedAtIso,
        content: '客服判定无需赔付。',
      },
    );
    if (!resolved || resolved === 'state-invalid' || resolved === 'conflict') {
      throw new Error('resolve failed');
    }

    return { repository, order, caseId: created.id, resolved };
  }

  it('reopens a resolved case to processing when the shipper appeals', async () => {
    const { repository, order, caseId, resolved } = await seedResolvedCase();

    const result = await repository.appealExceptionCase({
      caseId,
      orderId: order.id,
      actorUserId: 'shipper-1',
      actorRole: 'shipper',
      baseUpdatedAtIso: resolved.updatedAtIso,
      reason: '货主对无需赔付的结论不认可，要求重新核定。',
    });

    expect(result).toMatchObject({
      kind: 'success',
      exceptionCase: {
        status: 'processing',
        appealStatus: 'requested',
      },
    });
    if (result.kind !== 'success') {
      throw new Error('expected success');
    }
    expect(result.exceptionCase.actions.at(-1)).toMatchObject({
      fromStatus: 'resolved',
      toStatus: 'processing',
    });
    await expect(
      repository.listAdminOrderExceptionCases({
        page: 1,
        pageSize: 20,
        appealStatus: 'requested',
        keyword: order.orderNo,
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({ id: caseId, appealStatus: 'requested' }),
      ],
    });
  });

  it('requires an appeal decision when resolving an appealed case', async () => {
    const { repository, order, caseId, resolved } = await seedResolvedCase();
    const appealed = await repository.appealExceptionCase({
      caseId,
      orderId: order.id,
      actorUserId: 'shipper-1',
      actorRole: 'shipper',
      baseUpdatedAtIso: resolved.updatedAtIso,
      reason: '货主要求重新核定处理结果。',
    });

    if (appealed.kind !== 'success') {
      throw new Error('appeal failed');
    }

    await expect(
      repository.transitionOrderExceptionCase(
        caseId,
        'admin-1',
        'processing',
        'resolved',
        {
          baseUpdatedAtIso: appealed.exceptionCase.updatedAtIso,
          content: '客服完成二次复核，但漏填申诉裁定。',
          compensationStatus: 'not_required',
        },
      ),
    ).resolves.toBe('state-invalid');
  });

  it('records appeal adjudication when an appealed case is resolved again', async () => {
    const { repository, order, caseId, resolved } = await seedResolvedCase();
    const appealed = await repository.appealExceptionCase({
      caseId,
      orderId: order.id,
      actorUserId: 'shipper-1',
      actorRole: 'shipper',
      baseUpdatedAtIso: resolved.updatedAtIso,
      reason: '货主要求重新核定处理结果。',
    });

    if (appealed.kind !== 'success') {
      throw new Error('appeal failed');
    }

    await expect(
      repository.transitionOrderExceptionCase(
        caseId,
        'admin-1',
        'processing',
        'resolved',
        {
          baseUpdatedAtIso: appealed.exceptionCase.updatedAtIso,
          content: '客服复核后改为待赔付跟进。',
          compensationStatus: 'pending',
          appealDecision: 'accepted',
          compensationTargetRole: 'shipper',
          compensationAmountCents: 4200,
        },
      ),
    ).resolves.toMatchObject({
      status: 'resolved',
      appealStatus: 'accepted',
      compensationStatus: 'pending',
      compensationTargetRole: 'shipper',
      compensationAmountCents: 4200,
    });
    await expect(repository.findOrderById(order.id)).resolves.toMatchObject({
      events: expect.arrayContaining([
        expect.objectContaining({
          eventType: 'exception_appeal_accepted',
          noteText: '异常工单申诉已受理：客服复核后改为待赔付跟进。',
        }),
      ]),
    });
  });

  it('rejects an appeal from an unrelated user with not-found', async () => {
    const { repository, order, caseId, resolved } = await seedResolvedCase();

    await expect(
      repository.appealExceptionCase({
        caseId,
        orderId: order.id,
        actorUserId: 'shipper-OTHER',
        actorRole: 'shipper',
        baseUpdatedAtIso: resolved.updatedAtIso,
        reason: '无关用户尝试申诉。',
      }),
    ).resolves.toMatchObject({ kind: 'not-found' });
  });

  it('does not allow appealing an already executed compensation', async () => {
    const { repository, order, caseId, resolved } =
      await seedResolvedShipperExecutedCase();

    await expect(
      repository.appealExceptionCase({
        caseId,
        orderId: order.id,
        actorUserId: 'shipper-1',
        actorRole: 'shipper',
        baseUpdatedAtIso: resolved.updatedAtIso,
        reason: '赔付已执行后不应允许申诉。',
      }),
    ).resolves.toMatchObject({ kind: 'not-allowed' });
  });

  async function seedResolvedShipperExecutedCase() {
    const repository = new InMemoryOrdersRepository(
      () => new Date('2026-07-20T08:00:00.000Z'),
    );
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput(),
    );
    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '货损',
      description: '货物破损，需赔付。',
    });
    const created = (await repository.listOrderExceptionCases(order.id))
      .items[0];
    const processing = await repository.transitionOrderExceptionCase(
      created.id,
      'admin-1',
      'pending',
      'processing',
      { baseUpdatedAtIso: created.updatedAtIso, content: '客服受理。' },
    );
    if (
      !processing ||
      processing === 'state-invalid' ||
      processing === 'conflict'
    ) {
      throw new Error('processing failed');
    }
    const resolvedCase = await repository.transitionOrderExceptionCase(
      created.id,
      'admin-1',
      'processing',
      'resolved',
      {
        baseUpdatedAtIso: processing.updatedAtIso,
        content: '确认赔付货主。',
        compensationStatus: 'pending',
        compensationTargetRole: 'shipper',
        compensationAmountCents: 3600,
      },
    );
    if (
      !resolvedCase ||
      resolvedCase === 'state-invalid' ||
      resolvedCase === 'conflict'
    ) {
      throw new Error('resolve failed');
    }
    const executed = await repository.executeExceptionCaseCompensation({
      caseId: created.id,
      adminUserId: 'admin-1',
      baseUpdatedAtIso: resolvedCase.updatedAtIso,
      idempotencyKey: 'idem-comp-exec',
      requestFingerprint: 'fp-comp-exec',
      requestId: 'req-comp-exec',
      content: '赔付已执行。',
    });
    if (executed.kind !== 'success') {
      throw new Error('execution failed');
    }

    return {
      repository,
      order,
      caseId: created.id,
      resolved: executed.exceptionCase,
    };
  }
});

describe('PrismaOrdersRepository exception appeal', () => {
  function createHarness(casCount: number) {
    const current = {
      ...createPrismaExceptionCaseListRecord({
        id: 'case-1',
        orderId: 'order-1',
        status: 'resolved',
        appealStatus: 'none',
        resolvedAt: new Date('2026-07-20T08:00:00.000Z'),
        updatedAt: new Date('2026-07-20T08:00:00.000Z'),
      }),
      order: {
        orderNo: 'HY202607200001',
        shipperId: 'shipper-1',
        assignedDriverId: null,
      },
    };
    const updated = {
      ...current,
      status: 'processing' as const,
      appealStatus: 'requested' as const,
      appealReason: '货主要求重新核定处理结果。',
      appealRequestedAt: new Date('2026-07-20T08:10:00.000Z'),
      updatedAt: new Date('2026-07-20T08:10:00.000Z'),
      actions: [
        {
          id: 'action-appeal-1',
          adminUserId: 'shipper-1',
          fromStatus: 'resolved' as const,
          toStatus: 'processing' as const,
          content: '货主要求重新核定处理结果。',
          createdAt: new Date('2026-07-20T08:10:00.000Z'),
        },
      ],
    };
    const transaction = {
      orderExceptionCase: {
        updateMany: jest.fn().mockResolvedValue({ count: casCount }),
        findUnique: jest.fn().mockResolvedValue(updated),
      },
      orderExceptionCaseAction: {
        create: jest.fn().mockResolvedValue({ id: 'action-appeal-1' }),
      },
      orderEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-appeal-1' }),
      },
    };
    const prisma = {
      orderExceptionCase: {
        findUnique: jest.fn().mockResolvedValue(current),
      },
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };

    return {
      current,
      repository: new PrismaOrdersRepository(
        prisma as unknown as PrismaOrdersClient,
        () => new Date('2026-07-20T08:10:00.000Z'),
      ),
      transaction,
    };
  }

  it('claims the resolved case version before writing appeal history', async () => {
    const { current, repository, transaction } = createHarness(1);

    await expect(
      repository.appealExceptionCase({
        caseId: 'case-1',
        orderId: 'order-1',
        actorUserId: 'shipper-1',
        actorRole: 'shipper',
        baseUpdatedAtIso: '2026-07-20T08:00:00.000Z',
        reason: '货主要求重新核定处理结果。',
      }),
    ).resolves.toMatchObject({
      kind: 'success',
      exceptionCase: {
        id: 'case-1',
        status: 'processing',
        appealStatus: 'requested',
      },
    });
    expect(transaction.orderExceptionCase.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'case-1',
        status: 'resolved',
        updatedAt: current.updatedAt,
      },
      data: {
        status: 'processing',
        appealStatus: 'requested',
        appealReason: '货主要求重新核定处理结果。',
        appealRequestedAt: new Date('2026-07-20T08:10:00.000Z'),
        updatedAt: new Date('2026-07-20T08:10:00.000Z'),
      },
    });
    expect(transaction.orderExceptionCase.findUnique).toHaveBeenCalledTimes(1);
  });

  it('returns conflict before appeal action and event writes when the CAS loses', async () => {
    const { repository, transaction } = createHarness(0);

    await expect(
      repository.appealExceptionCase({
        caseId: 'case-1',
        orderId: 'order-1',
        actorUserId: 'shipper-1',
        actorRole: 'shipper',
        baseUpdatedAtIso: '2026-07-20T08:00:00.000Z',
        reason: '货主要求重新核定处理结果。',
      }),
    ).resolves.toEqual({ kind: 'conflict' });
    expect(transaction.orderExceptionCaseAction.create).not.toHaveBeenCalled();
    expect(transaction.orderEvent.create).not.toHaveBeenCalled();
    expect(transaction.orderExceptionCase.findUnique).not.toHaveBeenCalled();
  });
});

function createOrderInput(overrides: Partial<CreateShipperOrderRequest> = {}) {
  return {
    cargoType: 'build',
    weightText: '2.5 吨',
    quantityText: '12 箱',
    pickupAddress: '宝安区福永物流园',
    pickupContact: '赵经理',
    pickupPhone: '13900139001',
    deliveryAddress: '龙岗区坂田仓',
    deliveryContact: '钱店长',
    deliveryPhone: '13900139002',
    vehicleRequirement: 'medium',
    needTailboard: false,
    needTarp: false,
    pickupTimeIso: '2026-07-12T09:00:00.000Z',
    pricingMode: 'fixed' as const,
    priceCents: 76000,
    paymentMethod: 'cod' as const,
    ...overrides,
  };
}

function createIdempotentCreateInput(
  input: CreateShipperOrderRequest,
): ExecuteOrderCreateInput {
  return {
    actorUserId: 'shipper-1',
    operation: 'shipper_create' as const,
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    requestFingerprint: createOrderCreateFingerprint(input),
    expiresAtIso: '2026-07-15T08:00:00.000Z',
    input,
  };
}

function createPrismaOrderRecord(
  input: CreateShipperOrderRequest,
  now: Date,
  overrides: Partial<PrismaOrderRecord> = {},
): PrismaOrderRecord {
  return {
    id: 'order-created',
    orderNo: 'HY202607140000000001',
    shipperId: 'shipper-1',
    status: 'waiting',
    pricingMode: input.pricingMode,
    priceCents: input.priceCents ?? null,
    payablePriceCents: input.payablePriceCents ?? null,
    paymentMethod: input.paymentMethod,
    paymentStatus:
      input.paymentMethod === 'online' ? 'pending' : 'not_required',
    assignedDriverId: null,
    paymentSettledAt: null,
    refundedAt: null,
    couponId: input.couponId ?? null,
    couponTitle: input.couponTitle ?? null,
    couponDiscountCents: input.couponDiscountCents ?? null,
    pickupTime: new Date(input.pickupTimeIso),
    expectedDeliveryText: input.expectedDeliveryTimeText ?? null,
    createdAt: now,
    updatedAt: now,
    cargo: {
      cargoType: input.cargoType,
      weightText: input.weightText,
      volumeText: input.volumeText ?? null,
      quantityText: input.quantityText,
      description: input.cargoDescription ?? null,
      cargoPhotoCount: input.cargoPhotoFileIds?.length ?? 0,
      cargoPhotoFileIds: input.cargoPhotoFileIds ?? [],
    },
    locations: [
      {
        type: 'pickup',
        address: input.pickupAddress,
        contactName: input.pickupContact,
        contactPhone: input.pickupPhone,
        noteText: input.pickupNoteText ?? null,
      },
      {
        type: 'delivery',
        address: input.deliveryAddress,
        contactName: input.deliveryContact,
        contactPhone: input.deliveryPhone,
        noteText: input.deliveryNoteText ?? null,
      },
    ],
    requirement: {
      vehicleType: input.vehicleRequirement,
      vehicleLengthText: input.vehicleLengthText ?? null,
      needTailboard: input.needTailboard,
      needTarp: input.needTarp,
      valueAddedServicesText: input.valueAddedServicesText ?? null,
    },
    events: [
      {
        id: 'event-created',
        actorUserId: 'shipper-1',
        eventType: 'created',
        noteText: '货主发布订单',
        attachmentFileIds: input.cargoPhotoFileIds ?? [],
        createdAt: now,
      },
    ],
    ...overrides,
  };
}

function createOrderSnapshot(
  input: CreateShipperOrderRequest,
  record: PrismaOrderRecord,
) {
  return {
    ...input,
    cargoPhotoCount: input.cargoPhotoFileIds?.length ?? 0,
    id: record.id,
    orderNo: record.orderNo,
    shipperId: record.shipperId,
    status: record.status,
    createdAtIso: record.createdAt.toISOString(),
    updatedAtIso: record.updatedAt.toISOString(),
    events: [
      {
        id: 'event-created',
        actorUserId: record.shipperId,
        eventType: 'created',
        noteText: '货主发布订单',
        attachmentFileIds: input.cargoPhotoFileIds ?? [],
        createdAtIso: record.createdAt.toISOString(),
      },
    ],
  };
}

function createPrismaCouponRecord(
  overrides: Partial<PrismaShipperCouponRecord> = {},
): PrismaShipperCouponRecord {
  return { ...createPrismaCouponRecordBase(), ...overrides };
}

function createPrismaCouponRecordBase(): PrismaShipperCouponRecord {
  return {
    id: 'coupon-1',
    shipperId: 'shipper-1',
    title: '满 300 减 30',
    status: 'usable',
    conditionText: '订单满 300 元可用',
    discountCents: 3000,
    minOrderAmountCents: 30000,
    validFrom: new Date('2026-07-01T00:00:00.000Z'),
    validUntil: new Date('2026-08-01T00:00:00.000Z'),
    sourceText: '测试发放',
    issuedAt: new Date('2026-07-01T00:00:00.000Z'),
    lockedOrderNo: null,
    lockedAt: null,
    usedOrderNo: null,
    usedAt: null,
  };
}

function createPrismaMutationHarness(
  current: PrismaOrderRecord,
  updated: PrismaOrderRecord,
  now: Date,
) {
  const transaction = {
    order: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce(current)
        .mockResolvedValueOnce(updated),
      findMany: jest.fn().mockResolvedValue([{ id: current.id }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(updated),
      create: jest.fn(),
      count: jest.fn(),
    },
    orderCargo: { upsert: jest.fn() },
    orderLocation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    orderRequirement: { upsert: jest.fn() },
    fileObject: { findMany: jest.fn().mockResolvedValue([]) },
    orderEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-updated' }),
    },
    orderIdempotencyRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'idempotency-mutation' }),
      update: jest.fn().mockResolvedValue({ id: 'idempotency-mutation' }),
    },
    shipperCoupon: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orderExceptionCase: { update: jest.fn() },
    orderExceptionCaseAction: { create: jest.fn() },
    paymentOrder: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    refund: { create: jest.fn() },
    financialOutboxEvent: { create: jest.fn() },
    financialTransaction: { create: jest.fn() },
    settlement: { create: jest.fn() },
    driverWallet: { upsert: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(
      (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
    orderIdempotencyRecord: { findUnique: jest.fn() },
  };

  return {
    repository: new PrismaOrdersRepository(
      prisma as unknown as PrismaOrdersClient,
      () => now,
    ),
    prisma,
    transaction,
  };
}

function createPrismaBatchCancelHarness(
  currentOrders: PrismaOrderRecord[],
  updatedOrders: PrismaOrderRecord[],
  now: Date,
) {
  let includeFindManyCall = 0;
  const transaction = {
    order: {
      findUnique: jest.fn(),
      findMany: jest
        .fn()
        .mockImplementation((args: { select?: { id: true } }) => {
          if (args?.select) {
            return Promise.resolve(
              currentOrders.map(order => ({ id: order.id })),
            );
          }

          includeFindManyCall += 1;
          return Promise.resolve(
            includeFindManyCall === 1 ? currentOrders : updatedOrders,
          );
        }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    orderCargo: { upsert: jest.fn() },
    orderLocation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    orderRequirement: { upsert: jest.fn() },
    orderEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-updated' }),
    },
    orderIdempotencyRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'idempotency-batch-cancel' }),
      update: jest.fn().mockResolvedValue({ id: 'idempotency-batch-cancel' }),
    },
    shipperCoupon: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orderExceptionCase: { update: jest.fn() },
    orderExceptionCaseAction: { create: jest.fn() },
    paymentOrder: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    refund: { create: jest.fn() },
    financialOutboxEvent: { create: jest.fn() },
    financialTransaction: { create: jest.fn() },
    settlement: { create: jest.fn() },
    driverWallet: { upsert: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(
      (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
    orderIdempotencyRecord: { findUnique: jest.fn().mockResolvedValue(null) },
  };

  return {
    repository: new PrismaOrdersRepository(
      prisma as unknown as PrismaOrdersClient,
      () => now,
    ),
    prisma,
    transaction,
  };
}

function createPrismaCreateHarness(created: PrismaOrderRecord, now: Date) {
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ value: 1n }]),
    order: {
      create: jest.fn().mockResolvedValue(created),
      findUnique: jest.fn().mockResolvedValue(created),
      findMany: jest.fn().mockResolvedValue([created]),
      count: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(created),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orderCargo: { upsert: jest.fn() },
    orderLocation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    orderRequirement: { upsert: jest.fn() },
    orderEvent: { create: jest.fn() },
    orderIdempotencyRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'idempotency-created' }),
      update: jest.fn().mockResolvedValue({ id: 'idempotency-created' }),
    },
    shipperCoupon: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orderExceptionCase: {
      update: jest.fn(),
    },
    orderExceptionCaseAction: {
      create: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
    order: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(created),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(created),
      update: jest.fn().mockResolvedValue(created),
    },
    orderIdempotencyRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };

  return {
    repository: new PrismaOrdersRepository(
      prisma as unknown as PrismaOrdersClient,
      () => now,
    ),
    prisma,
    transaction,
  };
}

function createCoupon(overrides: Partial<ShipperCouponRecord> = {}) {
  return { ...createCouponBase(), ...overrides } as ShipperCouponRecord;
}

function createCouponBase() {
  return {
    id: 'coupon-1',
    shipperId: 'shipper-1',
    title: '满 300 减 30',
    status: 'usable' as const,
    conditionText: '订单满 300 元可用',
    discountCents: 3000,
    minOrderAmountCents: 30000,
    validFromIso: '2026-07-01T00:00:00.000Z',
    validUntilIso: '2026-08-01T00:00:00.000Z',
    sourceText: '测试发放',
    issuedAtIso: '2026-07-01T00:00:00.000Z',
  };
}

function createPrismaExceptionCaseListRecord(
  overrides: Partial<{
    id: string;
    caseNo: string;
    orderId: string;
    orderNo: string;
    sourceEventId: string;
    reporterUserId: string;
    sourceRole: 'shipper' | 'driver';
    typeLabel: string;
    description: string;
    attachmentFileIds: string[];
    status: 'pending' | 'processing' | 'resolved' | 'closed';
    resolutionText: string | null;
    compensationStatus:
      | 'not_required'
      | 'pending'
      | 'offline_completed'
      | 'executed'
      | null;
    compensationTargetRole: 'shipper' | 'driver' | null;
    compensationAmountCents: number | null;
    compensationUpdatedAt: Date | null;
    compensationTransactionId: string | null;
    compensationExecutedAt: Date | null;
    appealStatus: 'none' | 'requested' | 'rejected' | 'accepted';
    appealReason: string | null;
    appealRequestedAt: Date | null;
    resolvedAt: Date | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    actions: Array<{
      id: string;
      adminUserId: string;
      fromStatus: 'pending' | 'processing' | 'resolved' | 'closed';
      toStatus: 'pending' | 'processing' | 'resolved' | 'closed';
      content: string;
      createdAt: Date;
    }>;
  }> = {},
) {
  const orderNo = overrides.orderNo ?? 'HY202607120001';

  return {
    id: 'case-1',
    caseNo: 'CASE202607120001',
    orderId: 'order-1',
    sourceEventId: 'event-1',
    reporterUserId: 'shipper-1',
    sourceRole: 'shipper' as const,
    typeLabel: '司机延误',
    description: '司机反馈高速拥堵，预计晚到 40 分钟',
    attachmentFileIds: [],
    status: 'pending' as const,
    resolutionText: null,
    compensationStatus: null,
    compensationTargetRole: null,
    compensationAmountCents: null,
    compensationUpdatedAt: null,
    compensationTransactionId: null,
    compensationExecutedAt: null,
    appealStatus: 'none' as const,
    appealReason: null,
    appealRequestedAt: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: new Date('2026-07-12T08:00:00.000Z'),
    updatedAt: new Date('2026-07-12T08:00:00.000Z'),
    actions: [],
    ...overrides,
    order: {
      orderNo,
    },
  };
}

function createCancelMutationInput(
  orderId: string,
  baseUpdatedAtIso: string,
  idempotencyKey = 'shipper-cancel-key',
  overrides: Partial<ExecuteOrderMutationInput> = {},
): ExecuteOrderMutationInput {
  const request = {
    reasonText: '计划变更',
    description: '客户临时取消出货',
    baseUpdatedAtIso,
  };

  return {
    actorUserId: 'shipper-1',
    orderId,
    operation: 'shipper_cancel',
    idempotencyKey,
    requestFingerprint: createOrderMutationFingerprint(orderId, request),
    baseUpdatedAtIso,
    expiresAtIso: '2026-07-13T08:00:00.000Z',
    mutation: {
      type: 'shipper_cancel',
      input: {
        reasonText: request.reasonText,
        description: request.description,
      },
    },
    ...overrides,
  };
}

function createEvaluationReplyMutationInput(
  orderId: string,
  baseUpdatedAtIso: string,
  evaluationEventId: string,
  overrides: Partial<ExecuteOrderMutationInput> = {},
): ExecuteOrderMutationInput {
  const request = {
    evaluationEventId,
    content: '谢谢认可。',
  };

  return {
    actorUserId: 'driver-1',
    orderId,
    operation: 'driver_evaluation_reply',
    idempotencyKey: 'evaluation-reply-key',
    requestFingerprint: createDriverEvaluationReplyFingerprint(
      orderId,
      request,
    ),
    baseUpdatedAtIso,
    expiresAtIso: '2026-07-15T08:00:00.000Z',
    mutation: {
      type: 'driver_evaluation_reply',
      input: request,
    },
    ...overrides,
  };
}

const driverShipperEvaluationRequest: DriverEvaluateShipperRequest = {
  rating: 5,
  tags: ['沟通顺畅', '装货配合'],
  content: '货主装货配合好，结算沟通清楚。',
  anonymous: false,
  photoFileIds: ['file-evaluation-1'],
};

function createDriverShipperEvaluationMutationInput(
  orderId: string,
  baseUpdatedAtIso: string,
  request: DriverEvaluateShipperRequest = driverShipperEvaluationRequest,
  overrides: Partial<ExecuteOrderMutationInput> = {},
): ExecuteOrderMutationInput {
  return {
    actorUserId: 'driver-1',
    orderId,
    operation: 'driver_shipper_evaluation',
    idempotencyKey: 'shipper-evaluation-key',
    requestFingerprint: createDriverShipperEvaluationFingerprint(
      orderId,
      request,
    ),
    baseUpdatedAtIso,
    expiresAtIso: '2026-07-15T08:00:00.000Z',
    mutation: {
      type: 'driver_shipper_evaluation',
      input: request,
    },
    ...overrides,
  };
}

const shipperDriverEvaluationRequest: SubmitShipperOrderEvaluationRequest = {
  rating: 5,
  tags: ['准时送达', '服务好'],
  content: '司机服务细致，整体运输体验很好。',
  anonymous: false,
  photoFileIds: ['file-evaluation-1'],
};

function createShipperDriverEvaluationMutationInput(
  orderId: string,
  baseUpdatedAtIso: string,
  request: SubmitShipperOrderEvaluationRequest =
    shipperDriverEvaluationRequest,
  overrides: Partial<ExecuteOrderMutationInput> = {},
): ExecuteOrderMutationInput {
  return {
    actorUserId: 'shipper-1',
    orderId,
    operation: 'shipper_driver_evaluation',
    idempotencyKey: 'driver-evaluation-key',
    requestFingerprint: createShipperDriverEvaluationFingerprint(
      orderId,
      request,
    ),
    baseUpdatedAtIso,
    expiresAtIso: '2026-07-15T08:00:00.000Z',
    mutation: {
      type: 'shipper_driver_evaluation',
      input: request,
    },
    ...overrides,
  };
}

function createEvaluationFile(
  overrides: Partial<FileUploadRecord> = {},
): FileUploadRecord {
  return {
    id: 'file-evaluation-1',
    ownerUserId: 'driver-1',
    purpose: 'evaluation',
    contentType: 'image/png',
    byteSize: 2048,
    objectKey: 'driver-1/evaluation/file-evaluation-1.png',
    status: 'uploaded',
    createdAtIso: '2026-07-14T07:00:00.000Z',
    ...overrides,
  };
}

function createInMemoryEvaluationRepository(
  files: FileUploadRecord[] = [createEvaluationFile()],
) {
  let now = new Date('2026-07-14T08:00:00.000Z');
  const filesRepository: Pick<FilesRepository, 'findFilesByIds'> = {
    findFilesByIds: jest.fn(async fileIds =>
      files.filter(file => fileIds.includes(file.id)),
    ),
  };
  const repository = new InMemoryOrdersRepository(
    () => now,
    new InMemoryProfileCouponsStore(),
    new InMemoryFinancialStore(),
    500,
    filesRepository,
  );

  return {
    filesRepository,
    repository,
    setNow(nextIso: string) {
      now = new Date(nextIso);
    },
  };
}

async function seedCompletedDriverOrder(
  repository: InMemoryOrdersRepository,
  driverId = 'driver-1',
) {
  const seeded = await repository.seedOrderForTest(
    'shipper-1',
    createOrderInput(),
  );
  await repository.acceptDriverOrder(seeded.id, driverId, {});
  await repository.advanceDriverOrderStatus(seeded.id, driverId, {
    nextStatus: 'transporting',
  });
  const confirming = await repository.advanceDriverOrderStatus(
    seeded.id,
    driverId,
    { nextStatus: 'confirming' },
  );
  const completed = await repository.executeIdempotentOrderMutation({
    actorUserId: 'shipper-1',
    orderId: seeded.id,
    operation: 'shipper_complete',
    idempotencyKey: `complete-${seeded.id}`,
    requestFingerprint: `complete-${seeded.id}`,
    baseUpdatedAtIso: confirming.updatedAtIso,
    expiresAtIso: '2026-07-16T08:00:00.000Z',
    mutation: { type: 'shipper_complete' },
  });

  if (completed.kind !== 'success') {
    throw new Error(`Unexpected completion result: ${completed.kind}`);
  }

  return completed.order;
}

function createAdminBatchCancelInput(
  items: BatchCancelAdminOrdersRequest['items'],
  overrides: Partial<ExecuteAdminBatchCancelInput> = {},
): ExecuteAdminBatchCancelInput {
  const request: BatchCancelAdminOrdersRequest = {
    items,
    reasonText: '后台取消',
    description: '运营按筛选结果批量清理 waiting 单',
    ...(overrides.input as Partial<BatchCancelAdminOrdersRequest> | undefined),
  };

  return {
    actorUserId: 'admin-1',
    operation: 'admin_batch_cancel',
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440001',
    requestFingerprint: createAdminOrderBatchCancelFingerprint(request),
    expiresAtIso: '2026-07-15T08:00:00.000Z',
    ...overrides,
    input: request,
  };
}

function createShipperStatusMutationInput(
  orderId: string,
  baseUpdatedAtIso: string,
  idempotencyKey = 'shipper-status-key',
  nextStatus: 'transporting' | 'confirming' = 'transporting',
): ExecuteOrderMutationInput {
  const request = {
    nextStatus,
    baseUpdatedAtIso,
  };

  return {
    actorUserId: 'shipper-1',
    orderId,
    operation: 'shipper_status',
    idempotencyKey,
    requestFingerprint: createOrderMutationFingerprint(orderId, request),
    baseUpdatedAtIso,
    expiresAtIso: '2026-07-13T08:00:00.000Z',
    mutation: {
      type: 'shipper_status',
      input: {
        nextStatus,
      },
    },
  };
}

function createShipperUpdateMutationInput(
  orderId: string,
  baseUpdatedAtIso: string,
  input: CreateShipperOrderRequest,
): ExecuteOrderMutationInput {
  const request = { ...input, baseUpdatedAtIso };

  return {
    actorUserId: 'shipper-1',
    orderId,
    operation: 'shipper_update',
    idempotencyKey: 'shipper-update-key',
    requestFingerprint: createOrderMutationFingerprint(orderId, request),
    baseUpdatedAtIso,
    expiresAtIso: '2026-07-15T08:00:00.000Z',
    mutation: {
      type: 'shipper_update',
      input,
    },
  };
}

function createCompleteMutationInput(
  orderId: string,
  baseUpdatedAtIso: string,
): ExecuteOrderMutationInput {
  const request = { baseUpdatedAtIso };

  return {
    actorUserId: 'shipper-1',
    orderId,
    operation: 'shipper_complete',
    idempotencyKey: 'shipper-complete-key',
    requestFingerprint: createOrderMutationFingerprint(orderId, request),
    baseUpdatedAtIso,
    expiresAtIso: '2026-07-15T08:00:00.000Z',
    mutation: { type: 'shipper_complete' },
  };
}

function createDriverAcceptMutationInput(
  orderId: string,
  baseUpdatedAtIso: string,
  idempotencyKey: string,
  driverId: string,
  input: DriverAcceptOrderEventPayload,
): ExecuteOrderMutationInput {
  const request = {
    ...input,
    baseUpdatedAtIso,
  };

  return {
    actorUserId: driverId,
    orderId,
    operation: 'driver_accept',
    idempotencyKey,
    requestFingerprint: createOrderMutationFingerprint(orderId, request),
    baseUpdatedAtIso,
    expiresAtIso: '2026-07-13T08:00:00.000Z',
    mutation: {
      type: 'driver_accept',
      input,
    },
  };
}

function createDriverSnapshot(driverId: string) {
  return {
    driverId,
    driverName: `${driverId}-name`,
    driverPhone: '13900139009',
    vehicleType: 'box',
    vehicleLengthText: '4.2 米',
    plateNumber: '粤B12345',
    completedOrderCount: 0,
  };
}
