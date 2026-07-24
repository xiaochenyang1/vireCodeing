import type { DriverAcceptOrderEventPayload } from '../driver-orders/dto';
import {
  createAdminOrderBatchCancelFingerprint,
  createOrderCreateFingerprint,
  createOrderMutationFingerprint,
} from './order-mutation-idempotency';
import type {
  BatchCancelAdminOrdersRequest,
  CreateShipperOrderRequest,
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
        OR: [
          { lockedOrderNo: current.orderNo },
          { lockedOrderNo: null },
        ],
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
        OR: [
          { lockedOrderNo: current.orderNo },
          { lockedOrderNo: null },
        ],
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
        createCompleteMutationInput(current.id, current.updatedAt.toISOString()),
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
    const firstUpdated = createPrismaOrderRecord(createOrderInput(), updatedAt, {
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
    });
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
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());
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
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());

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
        createCancelMutationInput(
          order.id,
          order.updatedAtIso,
          'cancel-key-2',
        ),
      ),
    ).resolves.toEqual({ kind: 'conflict' });
  });

  it('rejects reuse of the key for a different fingerprint', async () => {
    const { repository } = createRepository();
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());
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
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());
    const input = createCancelMutationInput(order.id, order.updatedAtIso, 'key-1', {
      expiresAtIso: '2026-07-12T08:00:01.000Z',
    });

    await repository.executeIdempotentOrderMutation(input);
    setNow('2026-07-13T08:00:02.000Z');

    await expect(
      repository.executeIdempotentOrderMutation(input),
    ).resolves.toEqual({ kind: 'key-expired' });
  });

  it('only lets one driver accept mutation win a shared baseline', async () => {
    const { repository } = createRepository();
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());

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
    expect((await repository.findOrderById(firstOrder.id))?.events).toHaveLength(2);
    expect((await repository.findOrderById(secondOrder.id))?.events).toHaveLength(2);
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
    await expect(repository.findOrderById(waitingOrder.id)).resolves.toMatchObject({
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
    const repository = new InMemoryOrdersRepository(() => new Date('2026-07-14T08:00:00.000Z'), couponStore);
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
    const repository = new InMemoryOrdersRepository(() => new Date('2026-07-14T08:00:00.000Z'), couponStore);
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
    const repository = new InMemoryOrdersRepository(() => new Date('2026-07-14T08:00:00.000Z'), couponStore);
    const seeded = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({ couponId: 'coupon-1' }),
    );
    await repository.acceptDriverOrder(seeded.id, 'driver-1', {});
    const order = await repository.advanceOrderStatus(
      seeded.id,
      'shipper-1',
      { nextStatus: 'confirming' },
    );

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
    const repository = new InMemoryOrdersRepository(() => new Date('2026-07-14T08:00:00.000Z'), couponStore);
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
  it('filters admin case lists and preserves case action ordering', async () => {
    const repository = new InMemoryOrdersRepository(
      () => new Date('2026-07-12T08:00:00.000Z'),
    );
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());
    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '司机延误',
      description: '司机反馈高速拥堵，预计晚到 40 分钟',
    });
    const created = (await repository.listOrderExceptionCases(order.id)).items[0];
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
    const order = await repository.seedOrderForTest('shipper-1', createOrderInput());
    await repository.reportOrderException(order.id, 'shipper-1', {
      typeLabel: '货损',
      description: '司机反馈货物外包装破损。',
    });
    const created = (await repository.listOrderExceptionCases(order.id)).items[0];
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

    if (!processing || processing === 'state-invalid' || processing === 'conflict') {
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
        (entry.direction === 'credit'
          ? entry.amountCents
          : -entry.amountCents),
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
      { baseUpdatedAtIso: processing.updatedAtIso, content: '客服判定无需赔付。' },
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

    return { repository, order, caseId: created.id, resolved: executed.exceptionCase };
  }
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
    orderEvent: { create: jest.fn().mockResolvedValue({ id: 'event-updated' }) },
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
      findMany: jest.fn().mockImplementation((args: { select?: { id: true } }) => {
        if (args?.select) {
          return Promise.resolve(currentOrders.map(order => ({ id: order.id })));
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
    orderEvent: { create: jest.fn().mockResolvedValue({ id: 'event-updated' }) },
    orderIdempotencyRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'idempotency-batch-cancel' }),
      update: jest
        .fn()
        .mockResolvedValue({ id: 'idempotency-batch-cancel' }),
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

function createCoupon(
  overrides: Partial<ShipperCouponRecord> = {},
) {
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
