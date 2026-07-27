import {
  PrismaProfileEvaluationsRepository,
  type ModerateAdminEvaluationInput,
  type PrismaEvaluationModerationActionRecord,
  type PrismaEvaluationModerationRecord,
  type PrismaProfileEvaluationsClient,
} from './profile-evaluations.repository';

describe('PrismaProfileEvaluationsRepository moderation', () => {
  const moderatedAt = new Date('2026-07-27T10:00:00.000Z');

  it('selects and maps moderation snapshots with admin evaluation orders', async () => {
    const prisma = createPrismaClientMock();
    prisma.order.findMany = jest.fn().mockResolvedValue([
      {
        id: 'order-1',
        shipperId: 'shipper-1',
        orderNo: 'HY202607270001',
        events: [
          {
            id: 'evaluation-1',
            actorUserId: 'shipper-1',
            eventType: 'evaluation_submitted',
            noteText: '1 星：服务态度；包含违规内容',
            attachmentFileIds: ['file-evaluation-1'],
            createdAt: new Date('2026-07-27T09:00:00.000Z'),
            evaluationModeration: createModerationRecord(),
          },
        ],
      },
    ]);
    const repository = new PrismaProfileEvaluationsRepository(
      prisma as unknown as PrismaProfileEvaluationsClient,
    );

    await expect(repository.listAdminEvaluationOrders()).resolves.toEqual([
      {
        id: 'order-1',
        shipperId: 'shipper-1',
        orderNo: 'HY202607270001',
        events: [
          {
            id: 'evaluation-1',
            actorUserId: 'shipper-1',
            eventType: 'evaluation_submitted',
            noteText: '1 星：服务态度；包含违规内容',
            attachmentFileIds: ['file-evaluation-1'],
            createdAtIso: '2026-07-27T09:00:00.000Z',
            evaluationModeration: {
              status: 'hidden',
              version: 1,
              reason: '包含违规联系方式',
              moderatedByAdminId: 'admin-1',
              moderatedAtIso: moderatedAt.toISOString(),
            },
          },
        ],
      },
    ]);
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          events: expect.objectContaining({
            select: expect.objectContaining({
              evaluationModeration: {
                select: expect.objectContaining({
                  status: true,
                  version: true,
                  reason: true,
                  moderatedByAdminId: true,
                  moderatedAt: true,
                }),
              },
            }),
          }),
        }),
      }),
    );
  });

  it('atomically creates the first moderation snapshot and audit action', async () => {
    const input = createModerationInput();
    const transaction = createPrismaClientMock();
    transaction.orderEvent.findFirst = jest
      .fn()
      .mockResolvedValue({ id: input.evaluationId });
    transaction.evaluationModeration.findUnique = jest
      .fn()
      .mockResolvedValue(null);
    transaction.evaluationModeration.create = jest
      .fn()
      .mockResolvedValue(createModerationRecord());
    transaction.evaluationModerationAction.create = jest
      .fn()
      .mockResolvedValue(createModerationActionRecord());
    const prisma = createPrismaClientMock();
    prisma.$transaction = jest.fn(callback => callback(transaction));
    const repository = new PrismaProfileEvaluationsRepository(
      prisma as unknown as PrismaProfileEvaluationsClient,
    );

    await expect(repository.moderateAdminEvaluation(input)).resolves.toEqual({
      kind: 'success',
      moderation: {
        status: 'hidden',
        version: 1,
        reason: '包含违规联系方式',
        moderatedByAdminId: 'admin-1',
        moderatedAtIso: moderatedAt.toISOString(),
      },
    });
    expect(transaction.evaluationModeration.create).toHaveBeenCalledWith({
      data: {
        evaluationEventId: 'evaluation-1',
        status: 'hidden',
        version: 1,
        reason: '包含违规联系方式',
        moderatedByAdminId: 'admin-1',
        moderatedAt,
      },
    });
    expect(transaction.evaluationModerationAction.create).toHaveBeenCalledWith({
      data: {
        evaluationEventId: 'evaluation-1',
        adminUserId: 'admin-1',
        fromStatus: 'visible',
        toStatus: 'hidden',
        reason: '包含违规联系方式',
        fromVersion: 0,
        toVersion: 1,
        createdAt: moderatedAt,
      },
    });
    expect(
      transaction.evaluationModeration.create.mock.invocationCallOrder[0],
    ).toBeLessThan(
      transaction.evaluationModerationAction.create.mock.invocationCallOrder[0],
    );
  });

  it('uses a version compare-and-set before appending later actions', async () => {
    const input = createModerationInput({
      status: 'visible',
      reason: '复核后恢复展示',
      baseModerationVersion: 1,
    });
    const transaction = createPrismaClientMock();
    transaction.orderEvent.findFirst = jest
      .fn()
      .mockResolvedValue({ id: input.evaluationId });
    transaction.evaluationModeration.findUnique = jest
      .fn()
      .mockResolvedValue(createModerationRecord());
    transaction.evaluationModeration.updateMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    transaction.evaluationModerationAction.create = jest
      .fn()
      .mockResolvedValue(
        createModerationActionRecord({
          fromStatus: 'hidden',
          toStatus: 'visible',
          fromVersion: 1,
          toVersion: 2,
        }),
      );
    const prisma = createPrismaClientMock();
    prisma.$transaction = jest.fn(callback => callback(transaction));
    const repository = new PrismaProfileEvaluationsRepository(
      prisma as unknown as PrismaProfileEvaluationsClient,
    );

    await expect(repository.moderateAdminEvaluation(input)).resolves.toMatchObject({
      kind: 'success',
      moderation: { status: 'visible', version: 2 },
    });
    expect(transaction.evaluationModeration.updateMany).toHaveBeenCalledWith({
      where: { evaluationEventId: 'evaluation-1', version: 1 },
      data: expect.objectContaining({
        status: 'visible',
        version: 2,
        reason: '复核后恢复展示',
      }),
    });
  });

  it('rejects stale versions before writing a moderation action', async () => {
    const transaction = createPrismaClientMock();
    transaction.orderEvent.findFirst = jest
      .fn()
      .mockResolvedValue({ id: 'evaluation-1' });
    transaction.evaluationModeration.findUnique = jest
      .fn()
      .mockResolvedValue(createModerationRecord());
    const prisma = createPrismaClientMock();
    prisma.$transaction = jest.fn(callback => callback(transaction));
    const repository = new PrismaProfileEvaluationsRepository(
      prisma as unknown as PrismaProfileEvaluationsClient,
    );

    await expect(
      repository.moderateAdminEvaluation(createModerationInput()),
    ).resolves.toEqual({ kind: 'conflict' });
    expect(transaction.evaluationModeration.updateMany).not.toHaveBeenCalled();
    expect(transaction.evaluationModerationAction.create).not.toHaveBeenCalled();
  });

  it('maps a concurrent first-write unique conflict to a moderation conflict', async () => {
    const prisma = createPrismaClientMock();
    prisma.$transaction = jest.fn().mockRejectedValue({
      code: 'P2002',
      meta: { target: ['evaluationEventId'] },
    });
    const repository = new PrismaProfileEvaluationsRepository(
      prisma as unknown as PrismaProfileEvaluationsClient,
    );

    await expect(
      repository.moderateAdminEvaluation(createModerationInput()),
    ).resolves.toEqual({ kind: 'conflict' });
  });

  it('does not swallow unrelated unique constraint failures', async () => {
    const uniqueError = {
      code: 'P2002',
      meta: { target: ['evaluationEventId', 'toVersion'] },
    };
    const prisma = createPrismaClientMock();
    prisma.$transaction = jest.fn().mockRejectedValue(uniqueError);
    const repository = new PrismaProfileEvaluationsRepository(
      prisma as unknown as PrismaProfileEvaluationsClient,
    );

    await expect(
      repository.moderateAdminEvaluation(createModerationInput()),
    ).rejects.toBe(uniqueError);
  });

  it('does not match unique constraint names that merely contain the snapshot key', async () => {
    const uniqueError = {
      code: 'P2002',
      meta: { target: 'EvaluationModerationAction_event_version_unique' },
    };
    const prisma = createPrismaClientMock();
    prisma.$transaction = jest.fn().mockRejectedValue(uniqueError);
    const repository = new PrismaProfileEvaluationsRepository(
      prisma as unknown as PrismaProfileEvaluationsClient,
    );

    await expect(
      repository.moderateAdminEvaluation(createModerationInput()),
    ).rejects.toBe(uniqueError);
  });

  it('returns not-found for ids that are not evaluation source events', async () => {
    const transaction = createPrismaClientMock();
    transaction.orderEvent.findFirst = jest.fn().mockResolvedValue(null);
    const prisma = createPrismaClientMock();
    prisma.$transaction = jest.fn(callback => callback(transaction));
    const repository = new PrismaProfileEvaluationsRepository(
      prisma as unknown as PrismaProfileEvaluationsClient,
    );

    await expect(
      repository.moderateAdminEvaluation(createModerationInput()),
    ).resolves.toEqual({ kind: 'not-found' });
    expect(transaction.evaluationModeration.findUnique).not.toHaveBeenCalled();
  });

  it('lists moderation audit actions newest first and maps timestamps', async () => {
    const prisma = createPrismaClientMock();
    prisma.evaluationModerationAction.findMany = jest.fn().mockResolvedValue([
      createModerationActionRecord(),
    ]);
    const repository = new PrismaProfileEvaluationsRepository(
      prisma as unknown as PrismaProfileEvaluationsClient,
    );

    await expect(
      repository.listAdminEvaluationModerationEvents('evaluation-1'),
    ).resolves.toEqual([
      {
        id: 'moderation-action-1',
        evaluationId: 'evaluation-1',
        adminUserId: 'admin-1',
        fromStatus: 'visible',
        toStatus: 'hidden',
        reason: '包含违规联系方式',
        fromVersion: 0,
        toVersion: 1,
        createdAtIso: moderatedAt.toISOString(),
      },
    ]);
    expect(prisma.evaluationModerationAction.findMany).toHaveBeenCalledWith({
      where: { evaluationEventId: 'evaluation-1' },
      orderBy: { createdAt: 'desc' },
    });
  });
});

function createModerationInput(
  overrides: Partial<ModerateAdminEvaluationInput> = {},
): ModerateAdminEvaluationInput {
  return {
    evaluationId: 'evaluation-1',
    adminUserId: 'admin-1',
    status: 'hidden',
    reason: '包含违规联系方式',
    baseModerationVersion: 0,
    moderatedAtIso: '2026-07-27T10:00:00.000Z',
    ...overrides,
  };
}

function createModerationRecord(
  overrides: Partial<PrismaEvaluationModerationRecord> = {},
): PrismaEvaluationModerationRecord {
  return {
    evaluationEventId: 'evaluation-1',
    status: 'hidden',
    version: 1,
    reason: '包含违规联系方式',
    moderatedByAdminId: 'admin-1',
    moderatedAt: new Date('2026-07-27T10:00:00.000Z'),
    createdAt: new Date('2026-07-27T10:00:00.000Z'),
    updatedAt: new Date('2026-07-27T10:00:00.000Z'),
    ...overrides,
  };
}

function createModerationActionRecord(
  overrides: Partial<PrismaEvaluationModerationActionRecord> = {},
): PrismaEvaluationModerationActionRecord {
  return {
    id: 'moderation-action-1',
    evaluationEventId: 'evaluation-1',
    adminUserId: 'admin-1',
    fromStatus: 'visible',
    toStatus: 'hidden',
    reason: '包含违规联系方式',
    fromVersion: 0,
    toVersion: 1,
    createdAt: new Date('2026-07-27T10:00:00.000Z'),
    ...overrides,
  };
}

function createPrismaClientMock() {
  return {
    $transaction: jest.fn(),
    order: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    orderEvent: {
      findFirst: jest.fn(),
    },
    evaluationModeration: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    evaluationModerationAction: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };
}
