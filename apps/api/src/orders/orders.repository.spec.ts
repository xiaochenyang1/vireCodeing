import type { DriverAcceptOrderEventPayload } from '../driver-orders/dto';
import {
  createOrderCreateFingerprint,
  createOrderMutationFingerprint,
} from './order-mutation-idempotency';
import type { CreateShipperOrderRequest } from './dto';
import type { ShipperCouponRecord } from '../profile-coupons/dto';
import {
  InMemoryProfileCouponsStore,
  type PrismaShipperCouponRecord,
} from '../profile-coupons/profile-coupons.repository';
import {
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
    const current = createPrismaOrderRecord(orderInput, currentNow);
    const updated = createPrismaOrderRecord(orderInput, mutationNow, {
      status: 'loading',
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
      createShipperStatusMutationInput(
        order.id,
        order.updatedAtIso,
        'transport-key-1',
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

function createShipperStatusMutationInput(
  orderId: string,
  baseUpdatedAtIso: string,
  idempotencyKey = 'shipper-status-key',
): ExecuteOrderMutationInput {
  const request = {
    nextStatus: 'loading' as const,
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
        nextStatus: 'loading',
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
