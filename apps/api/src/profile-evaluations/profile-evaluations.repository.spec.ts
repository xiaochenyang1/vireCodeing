import {
  PrismaProfileEvaluationsRepository,
  type ModerateAdminEvaluationInput,
  type PrismaEvaluationAppealActionRecord,
  type PrismaEvaluationAppealRecord,
  type PrismaEvaluationModerationActionRecord,
  type PrismaEvaluationModerationRecord,
  type PrismaProfileEvaluationsClient,
  type ResolveAdminEvaluationAppealInput,
  type SubmitEvaluationAppealInput,
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
    transaction.evaluationAppeal.findFirst = jest.fn().mockResolvedValue(null);
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
    transaction.evaluationAppeal.findFirst = jest.fn().mockResolvedValue(null);
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
    transaction.evaluationAppeal.findFirst = jest.fn().mockResolvedValue(null);
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

  it('blocks direct moderation while an appeal is requested', async () => {
    const transaction = createPrismaClientMock();
    transaction.orderEvent.findFirst = jest
      .fn()
      .mockResolvedValue({ id: 'evaluation-1' });
    transaction.evaluationAppeal.findFirst = jest
      .fn()
      .mockResolvedValue(createAppealRecord());
    const prisma = createPrismaClientMock();
    prisma.$transaction = jest.fn(callback => callback(transaction));
    const repository = new PrismaProfileEvaluationsRepository(
      prisma as unknown as PrismaProfileEvaluationsClient,
    );

    await expect(
      repository.moderateAdminEvaluation(createModerationInput()),
    ).resolves.toEqual({ kind: 'appeal-pending' });
    expect(transaction.evaluationModeration.findUnique).not.toHaveBeenCalled();
    expect(transaction.evaluationModerationAction.create).not.toHaveBeenCalled();
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

describe('PrismaProfileEvaluationsRepository appeals', () => {
  it('creates one requested appeal and its submission action atomically', async () => {
    const input = createAppealInput();
    const transaction = createPrismaClientMock();
    transaction.orderEvent.findFirst = jest.fn().mockResolvedValue({
      id: input.evaluationId,
      actorUserId: input.appellantUserId,
      evaluationModeration: createModerationRecord(),
    });
    transaction.evaluationAppeal.findFirst = jest.fn().mockResolvedValue(null);
    transaction.evaluationAppeal.create = jest
      .fn()
      .mockResolvedValue(createAppealRecord());
    transaction.evaluationAppealAction.create = jest
      .fn()
      .mockResolvedValue(createAppealActionRecord());
    const prisma = createPrismaClientMock();
    prisma.$transaction = jest.fn(callback => callback(transaction));
    const repository = new PrismaProfileEvaluationsRepository(
      prisma as unknown as PrismaProfileEvaluationsClient,
    );

    await expect(repository.submitEvaluationAppeal(input)).resolves.toMatchObject({
      kind: 'success',
      replayed: false,
      appeal: { id: 'appeal-1', status: 'requested', version: 1 },
    });
    expect(transaction.orderEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'evaluation-1',
          actorUserId: 'shipper-1',
        }),
      }),
    );
    expect(transaction.evaluationAppealAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        appealId: 'appeal-1',
        actorUserId: 'shipper-1',
        toStatus: 'requested',
        fromVersion: 0,
        toVersion: 1,
      }),
    });
  });

  it('replays the same open appeal request without appending another action', async () => {
    const transaction = createPrismaClientMock();
    transaction.orderEvent.findFirst = jest.fn().mockResolvedValue({
      id: 'evaluation-1',
      actorUserId: 'shipper-1',
      evaluationModeration: createModerationRecord(),
    });
    transaction.evaluationAppeal.findFirst = jest
      .fn()
      .mockResolvedValue(createAppealRecord());
    const prisma = createPrismaClientMock();
    prisma.$transaction = jest.fn(callback => callback(transaction));
    const repository = new PrismaProfileEvaluationsRepository(
      prisma as unknown as PrismaProfileEvaluationsClient,
    );

    await expect(
      repository.submitEvaluationAppeal(createAppealInput()),
    ).resolves.toMatchObject({ kind: 'success', replayed: true });
    expect(transaction.evaluationAppeal.create).not.toHaveBeenCalled();
    expect(transaction.evaluationAppealAction.create).not.toHaveBeenCalled();
  });

  it('converges a concurrent open-appeal unique race to the winning replay', async () => {
    const prisma = createPrismaClientMock();
    prisma.$transaction = jest.fn().mockRejectedValue({
      code: 'P2002',
      meta: { target: 'EvaluationAppeal_open_event_unique' },
    });
    prisma.evaluationAppeal.findFirst = jest
      .fn()
      .mockResolvedValue(createAppealRecord());
    const repository = new PrismaProfileEvaluationsRepository(
      prisma as unknown as PrismaProfileEvaluationsClient,
    );

    await expect(
      repository.submitEvaluationAppeal(createAppealInput()),
    ).resolves.toMatchObject({ kind: 'success', replayed: true });
  });

  it('accepts an appeal by CAS-updating it and restoring moderation in one transaction', async () => {
    const input = createResolveAppealInput();
    const transaction = createPrismaClientMock();
    transaction.evaluationAppeal.findUnique = jest
      .fn()
      .mockResolvedValue(createAppealRecord());
    transaction.evaluationAppeal.updateMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    transaction.evaluationModeration.findUnique = jest
      .fn()
      .mockResolvedValue(createModerationRecord());
    transaction.evaluationModeration.updateMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    transaction.evaluationModerationAction.create = jest
      .fn()
      .mockResolvedValue(createModerationActionRecord());
    transaction.evaluationAppealAction.create = jest
      .fn()
      .mockResolvedValue(createAppealActionRecord());
    const prisma = createPrismaClientMock();
    prisma.$transaction = jest.fn(callback => callback(transaction));
    const repository = new PrismaProfileEvaluationsRepository(
      prisma as unknown as PrismaProfileEvaluationsClient,
    );

    await expect(
      repository.resolveAdminEvaluationAppeal(input),
    ).resolves.toMatchObject({
      kind: 'success',
      appeal: { status: 'accepted', version: 2 },
      moderation: { status: 'visible', version: 2 },
    });
    expect(transaction.evaluationAppeal.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'appeal-1',
        evaluationEventId: 'evaluation-1',
        status: 'requested',
        version: 1,
      },
      data: expect.objectContaining({ status: 'accepted', version: 2 }),
    });
    expect(transaction.evaluationModeration.updateMany).toHaveBeenCalledWith({
      where: {
        evaluationEventId: 'evaluation-1',
        status: 'hidden',
        version: 1,
      },
      data: expect.objectContaining({ status: 'visible', version: 2 }),
    });
    expect(transaction.evaluationModerationAction.create).toHaveBeenCalled();
    expect(transaction.evaluationAppealAction.create).toHaveBeenCalled();
  });

  it('rejects an appeal without changing the hidden moderation snapshot', async () => {
    const transaction = createPrismaClientMock();
    transaction.evaluationAppeal.findUnique = jest
      .fn()
      .mockResolvedValue(createAppealRecord());
    transaction.evaluationAppeal.updateMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    transaction.evaluationModeration.findUnique = jest
      .fn()
      .mockResolvedValue(createModerationRecord());
    transaction.evaluationAppealAction.create = jest
      .fn()
      .mockResolvedValue(createAppealActionRecord());
    const prisma = createPrismaClientMock();
    prisma.$transaction = jest.fn(callback => callback(transaction));
    const repository = new PrismaProfileEvaluationsRepository(
      prisma as unknown as PrismaProfileEvaluationsClient,
    );

    await expect(
      repository.resolveAdminEvaluationAppeal(
        createResolveAppealInput({ decision: 'rejected' }),
      ),
    ).resolves.toMatchObject({
      kind: 'success',
      appeal: { status: 'rejected', version: 2 },
      moderation: { status: 'hidden', version: 1 },
    });
    expect(transaction.evaluationModeration.updateMany).not.toHaveBeenCalled();
    expect(
      transaction.evaluationModerationAction.create,
    ).not.toHaveBeenCalled();
  });

  it('rolls back a stale appeal decision before appending audit actions', async () => {
    const transaction = createPrismaClientMock();
    transaction.evaluationAppeal.findUnique = jest
      .fn()
      .mockResolvedValue(createAppealRecord());
    transaction.evaluationAppeal.updateMany = jest
      .fn()
      .mockResolvedValue({ count: 0 });
    transaction.evaluationModeration.findUnique = jest
      .fn()
      .mockResolvedValue(createModerationRecord());
    const prisma = createPrismaClientMock();
    prisma.$transaction = jest.fn(callback => callback(transaction));
    const repository = new PrismaProfileEvaluationsRepository(
      prisma as unknown as PrismaProfileEvaluationsClient,
    );

    await expect(
      repository.resolveAdminEvaluationAppeal(createResolveAppealInput()),
    ).resolves.toEqual({ kind: 'conflict' });
    expect(transaction.evaluationModeration.updateMany).not.toHaveBeenCalled();
    expect(transaction.evaluationAppealAction.create).not.toHaveBeenCalled();
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

function createAppealInput(
  overrides: Partial<SubmitEvaluationAppealInput> = {},
): SubmitEvaluationAppealInput {
  return {
    evaluationId: 'evaluation-1',
    appellantUserId: 'shipper-1',
    reason: '该评价内容没有违规，请重新复核。',
    baseModerationVersion: 1,
    submittedAtIso: '2026-07-27T11:00:00.000Z',
    ...overrides,
  };
}

function createResolveAppealInput(
  overrides: Partial<ResolveAdminEvaluationAppealInput> = {},
): ResolveAdminEvaluationAppealInput {
  return {
    evaluationId: 'evaluation-1',
    appealId: 'appeal-1',
    adminUserId: 'admin-2',
    decision: 'accepted',
    reason: '复核后确认评价内容可以恢复展示',
    baseAppealVersion: 1,
    baseModerationVersion: 1,
    resolvedAtIso: '2026-07-27T12:00:00.000Z',
    ...overrides,
  };
}

function createAppealRecord(
  overrides: Partial<PrismaEvaluationAppealRecord> = {},
): PrismaEvaluationAppealRecord {
  return {
    id: 'appeal-1',
    evaluationEventId: 'evaluation-1',
    appellantUserId: 'shipper-1',
    status: 'requested',
    version: 1,
    reason: '该评价内容没有违规，请重新复核。',
    moderationVersion: 1,
    submittedAt: new Date('2026-07-27T11:00:00.000Z'),
    resolutionReason: null,
    resolvedByAdminId: null,
    resolvedAt: null,
    createdAt: new Date('2026-07-27T11:00:00.000Z'),
    updatedAt: new Date('2026-07-27T11:00:00.000Z'),
    ...overrides,
  };
}

function createAppealActionRecord(
  overrides: Partial<PrismaEvaluationAppealActionRecord> = {},
): PrismaEvaluationAppealActionRecord {
  return {
    id: 'appeal-action-1',
    appealId: 'appeal-1',
    actorUserId: 'shipper-1',
    fromStatus: null,
    toStatus: 'requested',
    reason: '该评价内容没有违规，请重新复核。',
    fromVersion: 0,
    toVersion: 1,
    createdAt: new Date('2026-07-27T11:00:00.000Z'),
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
    evaluationAppeal: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    evaluationAppealAction: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };
}
