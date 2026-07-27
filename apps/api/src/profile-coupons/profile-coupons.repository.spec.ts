import type { IssueShipperCouponRequest } from './dto';
import {
  PrismaProfileCouponsRepository,
  type ExecuteAdminCouponIssueInput,
  type PrismaAdminCouponIssueIdempotencyRecord,
  type PrismaProfileCouponsClient,
  type PrismaShipperCouponRecord,
} from './profile-coupons.repository';

describe('PrismaProfileCouponsRepository coupon issue idempotency', () => {
  const now = new Date('2026-07-27T08:00:00.000Z');

  it('reserves the key before atomically creating a batch and snapshot', async () => {
    const input = createExecuteInput();
    const firstCoupon = createPrismaCoupon('coupon-1', input.couponInputs[0]);
    const secondCoupon = createPrismaCoupon('coupon-2', input.couponInputs[1]);
    const reservation = createPrismaIdempotencyRecord(input, {});
    const transaction = createPrismaClientMock();
    transaction.adminCouponIssueIdempotencyRecord.create = jest
      .fn()
      .mockResolvedValue(reservation);
    transaction.adminCouponIssueIdempotencyRecord.update = jest
      .fn()
      .mockImplementation(({ data }) =>
        Promise.resolve({
          ...reservation,
          responseSnapshot: data.responseSnapshot,
        }),
      );
    transaction.shipperCoupon.create = jest
      .fn()
      .mockResolvedValueOnce(firstCoupon)
      .mockResolvedValueOnce(secondCoupon);
    const prisma = createPrismaClientMock();
    prisma.adminCouponIssueIdempotencyRecord.findUnique = jest
      .fn()
      .mockResolvedValue(null);
    prisma.$transaction = jest.fn(callback => callback(transaction));
    const repository = new PrismaProfileCouponsRepository(
      prisma as unknown as PrismaProfileCouponsClient,
      () => now,
    );

    await expect(
      repository.executeIdempotentCouponIssue(input),
    ).resolves.toEqual({
      kind: 'success',
      replayed: false,
      response: {
        requestedCount: 2,
        issuedCount: 2,
        coupons: [
          expect.objectContaining({ id: 'coupon-1', shipperId: 'shipper-1' }),
          expect.objectContaining({ id: 'coupon-2', shipperId: 'shipper-2' }),
        ],
      },
    });
    expect(
      transaction.adminCouponIssueIdempotencyRecord.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorAdminId: 'admin-1',
        operation: 'batch_issue',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        responseSnapshot: {},
        expiresAt: new Date(input.expiresAtIso),
      }),
    });
    expect(
      transaction.adminCouponIssueIdempotencyRecord.create.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      transaction.shipperCoupon.create.mock.invocationCallOrder[0],
    );
    expect(
      transaction.adminCouponIssueIdempotencyRecord.update.mock.calls[0][0],
    ).toEqual({
      where: { id: reservation.id },
      data: {
        responseSnapshot: expect.objectContaining({
          requestedCount: 2,
          issuedCount: 2,
        }),
      },
    });
  });

  it.each([
    {
      name: 'replays the winner for the same request',
      fingerprint: undefined,
      expiresAt: new Date('2026-07-28T08:00:00.000Z'),
      expected: expect.objectContaining({ kind: 'success', replayed: true }),
    },
    {
      name: 'rejects a different request before expiry checks',
      fingerprint: 'different-fingerprint',
      expiresAt: new Date('2026-07-27T07:59:59.000Z'),
      expected: { kind: 'key-reused' },
    },
    {
      name: 'keeps an expired key reserved',
      fingerprint: undefined,
      expiresAt: new Date('2026-07-27T07:59:59.000Z'),
      expected: { kind: 'key-expired' },
    },
  ])('$name after a P2002 race', async testCase => {
    const input = createExecuteInput();
    const snapshot = {
      requestedCount: 2,
      issuedCount: 2,
      coupons: input.couponInputs.map((couponInput, index) =>
        mapCouponForSnapshot(createPrismaCoupon(`coupon-${index + 1}`, couponInput)),
      ),
    };
    const winner = {
      ...createPrismaIdempotencyRecord(input, snapshot),
      requestFingerprint:
        testCase.fingerprint ?? input.requestFingerprint,
      expiresAt: testCase.expiresAt,
    };
    const prisma = createPrismaClientMock();
    prisma.adminCouponIssueIdempotencyRecord.findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    prisma.$transaction = jest.fn().mockRejectedValue({ code: 'P2002' });
    const repository = new PrismaProfileCouponsRepository(
      prisma as unknown as PrismaProfileCouponsClient,
      () => now,
    );

    await expect(
      repository.executeIdempotentCouponIssue(input),
    ).resolves.toEqual(testCase.expected);
    expect(
      prisma.adminCouponIssueIdempotencyRecord.findUnique,
    ).toHaveBeenLastCalledWith({
      where: {
        AdminCouponIssueIdempotency_actor_operation_key_unique: {
          actorAdminId: input.actorAdminId,
          operation: input.operation,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
  });

  it('does not swallow an unrelated P2002 without a matching winner', async () => {
    const input = createExecuteInput();
    const uniqueError = { code: 'P2002', meta: { target: ['otherKey'] } };
    const prisma = createPrismaClientMock();
    prisma.adminCouponIssueIdempotencyRecord.findUnique = jest
      .fn()
      .mockResolvedValue(null);
    prisma.$transaction = jest.fn().mockRejectedValue(uniqueError);
    const repository = new PrismaProfileCouponsRepository(
      prisma as unknown as PrismaProfileCouponsClient,
    );

    await expect(
      repository.executeIdempotentCouponIssue(input),
    ).rejects.toBe(uniqueError);
  });
});

function createExecuteInput(): ExecuteAdminCouponIssueInput {
  return {
    actorAdminId: 'admin-1',
    operation: 'batch_issue',
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440001',
    requestFingerprint: 'coupon-request-fingerprint',
    couponInputs: [
      createIssueInput('shipper-1'),
      createIssueInput('shipper-2'),
    ],
    issuedAtIso: '2026-07-27T08:00:00.000Z',
    expiresAtIso: '2026-07-28T08:00:00.000Z',
  };
}

function createIssueInput(shipperId: string): IssueShipperCouponRequest {
  return {
    shipperId,
    title: '批量补偿券',
    conditionText: '平台订单满 100 元可用',
    discountCents: 1000,
    minOrderAmountCents: 10000,
    validFromIso: '2026-07-27T00:00:00.000Z',
    validUntilIso: '2026-08-27T00:00:00.000Z',
    sourceText: '运营补偿',
  };
}

function createPrismaCoupon(
  id: string,
  input: IssueShipperCouponRequest,
): PrismaShipperCouponRecord {
  return {
    id,
    shipperId: input.shipperId,
    title: input.title,
    status: 'usable',
    conditionText: input.conditionText,
    discountCents: input.discountCents,
    minOrderAmountCents: input.minOrderAmountCents,
    validFrom: new Date(input.validFromIso),
    validUntil: new Date(input.validUntilIso),
    sourceText: input.sourceText ?? '后台手工发放',
    issuedAt: new Date('2026-07-27T08:00:00.000Z'),
    lockedOrderNo: null,
    lockedAt: null,
    usedOrderNo: null,
    usedAt: null,
  };
}

function mapCouponForSnapshot(coupon: PrismaShipperCouponRecord) {
  return {
    id: coupon.id,
    shipperId: coupon.shipperId,
    title: coupon.title,
    status: 'usable' as const,
    conditionText: coupon.conditionText,
    discountCents: coupon.discountCents,
    minOrderAmountCents: coupon.minOrderAmountCents,
    validFromIso: coupon.validFrom.toISOString(),
    validUntilIso: coupon.validUntil.toISOString(),
    sourceText: coupon.sourceText,
    issuedAtIso: coupon.issuedAt.toISOString(),
  };
}

function createPrismaIdempotencyRecord(
  input: ExecuteAdminCouponIssueInput,
  responseSnapshot: unknown,
): PrismaAdminCouponIssueIdempotencyRecord {
  return {
    id: 'coupon-idempotency-1',
    actorAdminId: input.actorAdminId,
    operation: input.operation,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: input.requestFingerprint,
    responseSnapshot,
    createdAt: new Date(input.issuedAtIso),
    expiresAt: new Date(input.expiresAtIso),
  };
}

function createPrismaClientMock() {
  return {
    $transaction: jest.fn(),
    shipperCoupon: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    adminCouponIssueIdempotencyRecord: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}
