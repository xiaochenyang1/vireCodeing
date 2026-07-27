import { ApiErrorCode } from '../common/errors';
import {
  PrismaProfileVerificationRepository,
  type PrismaShipperEnterpriseVerificationRecord,
  type PrismaShipperIdentityVerificationRecord,
} from './profile-verification.repository';

describe('PrismaProfileVerificationRepository review concurrency', () => {
  const createdAt = new Date('2026-07-26T09:00:00.000Z');
  const reviewedAt = new Date('2026-07-26T09:01:00.000Z');

  it('allows only one concurrent identity review transition', async () => {
    let current: PrismaShipperIdentityVerificationRecord = {
      shipperId: 'shipper-1',
      realName: '张先生',
      idNumber: '44030019900101123X',
      identityFrontFileId: 'file-front',
      identityBackFileId: 'file-back',
      faceVerified: true,
      status: 'reviewing',
      rejectionReason: null,
      createdAt,
      updatedAt: createdAt,
    };
    const identity = {
      findUnique: jest.fn(async () => ({ ...current })),
      findMany: jest.fn(),
      upsert: jest.fn(),
      updateManyAndReturn: jest.fn(async ({ where, data }) => {
        if (
          current.shipperId !== where.shipperId ||
          current.status !== where.status ||
          current.updatedAt.getTime() !== where.updatedAt.getTime()
        ) {
          return [];
        }
        current = { ...current, ...data, updatedAt: reviewedAt };
        return [{ ...current }];
      }),
    };
    const reviewEvent = {
      findMany: jest.fn(),
      create: jest.fn(async ({ data }) => ({
        id: 'review-event-identity-1',
        ...data,
      })),
    };
    const prisma = {
      shipperIdentityVerification: identity,
      shipperEnterpriseVerification: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        updateManyAndReturn: jest.fn(),
      },
      shipperVerificationReviewEvent: reviewEvent,
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async callback => callback(prisma));
    const repository = new PrismaProfileVerificationRepository(prisma);

    const results = await Promise.allSettled([
      repository.reviewIdentity('shipper-1', 'admin-1', {
        status: 'approved',
      }),
      repository.reviewIdentity('shipper-1', 'admin-2', {
        status: 'rejected',
        rejectionReason: '证件照片不清晰',
      }),
    ]);

    expectSingleWinner(results, 'approved');
    expect(identity.updateManyAndReturn).toHaveBeenCalledWith({
      where: {
        shipperId: 'shipper-1',
        status: 'reviewing',
        updatedAt: createdAt,
      },
      data: { status: 'approved', rejectionReason: null },
    });
    expect(reviewEvent.create).toHaveBeenCalledTimes(1);
    expect(reviewEvent.create).toHaveBeenCalledWith({
      data: {
        shipperId: 'shipper-1',
        reviewerAdminId: 'admin-1',
        verificationType: 'identity',
        fromStatus: 'reviewing',
        toStatus: 'approved',
        rejectionReason: null,
        createdAt: reviewedAt,
      },
    });
  });

  it('allows only one concurrent enterprise review transition', async () => {
    let current: PrismaShipperEnterpriseVerificationRecord = {
      shipperId: 'shipper-2',
      enterpriseName: '深圳晨星贸易有限公司',
      creditCode: '91440300MA5TEST001',
      legalName: '张先生',
      legalId: '44030019900101123X',
      enterprisePhone: '13900139088',
      licenseFileId: 'file-license',
      status: 'reviewing',
      rejectionReason: null,
      createdAt,
      updatedAt: createdAt,
    };
    const enterprise = {
      findUnique: jest.fn(async () => ({ ...current })),
      findMany: jest.fn(),
      upsert: jest.fn(),
      updateManyAndReturn: jest.fn(async ({ where, data }) => {
        if (
          current.shipperId !== where.shipperId ||
          current.status !== where.status ||
          current.updatedAt.getTime() !== where.updatedAt.getTime()
        ) {
          return [];
        }
        current = { ...current, ...data, updatedAt: reviewedAt };
        return [{ ...current }];
      }),
    };
    const reviewEvent = {
      findMany: jest.fn(),
      create: jest.fn(async ({ data }) => ({
        id: 'review-event-enterprise-1',
        ...data,
      })),
    };
    const prisma = {
      shipperIdentityVerification: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        updateManyAndReturn: jest.fn(),
      },
      shipperEnterpriseVerification: enterprise,
      shipperVerificationReviewEvent: reviewEvent,
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async callback => callback(prisma));
    const repository = new PrismaProfileVerificationRepository(prisma);

    const results = await Promise.allSettled([
      repository.reviewEnterprise('shipper-2', 'admin-1', {
        status: 'approved',
      }),
      repository.reviewEnterprise('shipper-2', 'admin-2', {
        status: 'rejected',
        rejectionReason: '营业执照信息不完整',
      }),
    ]);

    expectSingleWinner(results, 'approved');
    expect(enterprise.updateManyAndReturn).toHaveBeenCalledWith({
      where: {
        shipperId: 'shipper-2',
        status: 'reviewing',
        updatedAt: createdAt,
      },
      data: { status: 'approved', rejectionReason: null },
    });
    expect(reviewEvent.create).toHaveBeenCalledTimes(1);
    expect(reviewEvent.create).toHaveBeenCalledWith({
      data: {
        shipperId: 'shipper-2',
        reviewerAdminId: 'admin-1',
        verificationType: 'enterprise',
        fromStatus: 'reviewing',
        toStatus: 'approved',
        rejectionReason: null,
        createdAt: reviewedAt,
      },
    });
  });

  it('reads verification snapshots before persisted decisions with their real admin actors', async () => {
    const identity: PrismaShipperIdentityVerificationRecord = {
      shipperId: 'shipper-1',
      realName: '张先生',
      idNumber: '44030019900101123X',
      identityFrontFileId: 'file-front',
      identityBackFileId: 'file-back',
      faceVerified: true,
      status: 'rejected',
      rejectionReason: '证件照片不清晰',
      createdAt,
      updatedAt: new Date('2026-07-26T09:02:00.000Z'),
    };
    const reviewEvents = [
      {
        id: 'review-event-2',
        shipperId: 'shipper-1',
        reviewerAdminId: 'admin-2',
        verificationType: 'identity' as const,
        fromStatus: 'reviewing' as const,
        toStatus: 'rejected' as const,
        rejectionReason: '证件照片不清晰',
        createdAt: new Date('2026-07-26T09:02:00.000Z'),
      },
      {
        id: 'review-event-1',
        shipperId: 'shipper-1',
        reviewerAdminId: 'admin-1',
        verificationType: 'identity' as const,
        fromStatus: 'reviewing' as const,
        toStatus: 'approved' as const,
        rejectionReason: null,
        createdAt: reviewedAt,
      },
    ];
    let identityReadCompleted = false;
    let enterpriseReadCompleted = false;
    const identityFindUnique = jest.fn(async () => {
      await Promise.resolve();
      identityReadCompleted = true;
      return identity;
    });
    const enterpriseFindUnique = jest.fn(async () => {
      await Promise.resolve();
      enterpriseReadCompleted = true;
      return null;
    });
    const findMany = jest.fn(async () => {
      expect(identityReadCompleted).toBe(true);
      expect(enterpriseReadCompleted).toBe(true);
      return reviewEvents;
    });
    const transaction = {
      shipperIdentityVerification: {
        findUnique: identityFindUnique,
        findMany: jest.fn(),
        upsert: jest.fn(),
        updateManyAndReturn: jest.fn(),
      },
      shipperEnterpriseVerification: {
        findUnique: enterpriseFindUnique,
        findMany: jest.fn(),
        upsert: jest.fn(),
        updateManyAndReturn: jest.fn(),
      },
      shipperVerificationReviewEvent: {
        findMany,
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const rootIdentityFindUnique = jest.fn();
    const rootEnterpriseFindUnique = jest.fn();
    const rootReviewEventFindMany = jest.fn();
    const runTransaction = jest.fn(async callback => callback(transaction));
    const repository = new PrismaProfileVerificationRepository({
      shipperIdentityVerification: {
        findUnique: rootIdentityFindUnique,
        findMany: jest.fn(),
        upsert: jest.fn(),
        updateManyAndReturn: jest.fn(),
      },
      shipperEnterpriseVerification: {
        findUnique: rootEnterpriseFindUnique,
        findMany: jest.fn(),
        upsert: jest.fn(),
        updateManyAndReturn: jest.fn(),
      },
      shipperVerificationReviewEvent: {
        findMany: rootReviewEventFindMany,
        create: jest.fn(),
      },
      $transaction: runTransaction,
    });

    const events = await repository.listReviewEvents('shipper-1');

    expect(events).toEqual([
      expect.objectContaining({
        eventId: 'review-event-2',
        actorUserId: 'admin-2',
        reviewerAdminId: 'admin-2',
        fromStatus: 'reviewing',
        toStatus: 'rejected',
        stage: 'rejected',
      }),
      expect.objectContaining({
        eventId: 'review-event-1',
        actorUserId: 'admin-1',
        reviewerAdminId: 'admin-1',
        fromStatus: 'reviewing',
        toStatus: 'approved',
        stage: 'approved',
      }),
      expect.objectContaining({
        eventId: 'shipper-1:identity:submitted',
        actorUserId: 'shipper-1',
        stage: 'submitted',
      }),
    ]);
    expect(events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: 'shipper-1:identity:rejected',
        }),
      ]),
    );
    expect(findMany).toHaveBeenCalledWith({
      where: { shipperId: 'shipper-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(rootIdentityFindUnique).not.toHaveBeenCalled();
    expect(rootEnterpriseFindUnique).not.toHaveBeenCalled();
    expect(rootReviewEventFindMany).not.toHaveBeenCalled();
  });
});

describe('PrismaProfileVerificationRepository review queue', () => {
  it('hydrates both verification records after selecting shippers by status', async () => {
    const createdAt = new Date('2026-07-26T09:00:00.000Z');
    const identity: PrismaShipperIdentityVerificationRecord = {
      shipperId: 'shipper-1',
      realName: '张先生',
      idNumber: '44030019900101123X',
      identityFrontFileId: 'file-front',
      identityBackFileId: 'file-back',
      faceVerified: true,
      status: 'reviewing',
      rejectionReason: null,
      createdAt,
      updatedAt: createdAt,
    };
    const enterprise: PrismaShipperEnterpriseVerificationRecord = {
      shipperId: 'shipper-1',
      enterpriseName: '深圳晨星贸易有限公司',
      creditCode: '91440300MA5TEST001',
      legalName: '张先生',
      legalId: '44030019900101123X',
      enterprisePhone: '13900139088',
      licenseFileId: 'file-license',
      status: 'approved',
      rejectionReason: null,
      createdAt,
      updatedAt: createdAt,
    };
    const identityFindMany = jest
      .fn()
      .mockResolvedValueOnce([identity])
      .mockResolvedValueOnce([identity]);
    const enterpriseFindMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([enterprise]);
    const repository = new PrismaProfileVerificationRepository({
      shipperIdentityVerification: {
        findUnique: jest.fn(),
        findMany: identityFindMany,
        upsert: jest.fn(),
        updateManyAndReturn: jest.fn(),
      },
      shipperEnterpriseVerification: {
        findUnique: jest.fn(),
        findMany: enterpriseFindMany,
        upsert: jest.fn(),
        updateManyAndReturn: jest.fn(),
      },
      shipperVerificationReviewEvent: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    });

    await expect(
      repository.listVerifications({
        status: 'reviewing',
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        {
          shipperId: 'shipper-1',
          identity: { status: 'reviewing' },
          enterprise: { status: 'approved' },
        },
      ],
    });
    expect(identityFindMany).toHaveBeenNthCalledWith(1, {
      where: { status: 'reviewing' },
      orderBy: { updatedAt: 'desc' },
    });
    expect(enterpriseFindMany).toHaveBeenNthCalledWith(1, {
      where: { status: 'reviewing' },
      orderBy: { updatedAt: 'desc' },
    });
    expect(identityFindMany).toHaveBeenNthCalledWith(2, {
      where: { shipperId: { in: ['shipper-1'] } },
    });
    expect(enterpriseFindMany).toHaveBeenNthCalledWith(2, {
      where: { shipperId: { in: ['shipper-1'] } },
    });
  });
});

function expectSingleWinner(
  results: PromiseSettledResult<{ status: string }>[],
  winningStatus: string,
) {
  expect(results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        status: 'fulfilled',
        value: expect.objectContaining({ status: winningStatus }),
      }),
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({
          code: ApiErrorCode.SHIPPER_VERIFICATION_STATE_INVALID,
        }),
      }),
    ]),
  );
}
