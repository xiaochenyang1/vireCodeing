import type {
  AdminEvaluationModerationEventRecord,
  AdminEvaluationModerationSnapshot,
  EvaluationAppealEventRecord,
  EvaluationAppealSnapshot,
  ModerateAdminEvaluationRequest,
  ResolveAdminEvaluationAppealRequest,
  SubmitEvaluationAppealRequest,
  ShipperProfileEvaluationOrderRecord,
} from './dto';

export type ModerateAdminEvaluationInput = ModerateAdminEvaluationRequest & {
  evaluationId: string;
  adminUserId: string;
  moderatedAtIso: string;
};

export type ModerateAdminEvaluationResult =
  | {
      kind: 'success';
      moderation: AdminEvaluationModerationSnapshot;
    }
  | { kind: 'not-found' }
  | { kind: 'conflict' }
  | { kind: 'appeal-pending' };

export type SubmitEvaluationAppealInput = SubmitEvaluationAppealRequest & {
  evaluationId: string;
  appellantUserId: string;
  submittedAtIso: string;
};

export type SubmitEvaluationAppealResult =
  | {
      kind: 'success';
      appeal: EvaluationAppealSnapshot;
      replayed: boolean;
    }
  | { kind: 'not-found' }
  | { kind: 'not-allowed' }
  | { kind: 'conflict' }
  | { kind: 'already-requested' };

export type ResolveAdminEvaluationAppealInput =
  ResolveAdminEvaluationAppealRequest & {
    evaluationId: string;
    appealId: string;
    adminUserId: string;
    resolvedAtIso: string;
  };

export type ResolveAdminEvaluationAppealResult =
  | {
      kind: 'success';
      appeal: EvaluationAppealSnapshot;
      moderation: AdminEvaluationModerationSnapshot;
    }
  | { kind: 'not-found' }
  | { kind: 'not-allowed' }
  | { kind: 'conflict' };

export interface ProfileEvaluationsRepository {
  listOrders(shipperId: string): Promise<ShipperProfileEvaluationOrderRecord[]>;
  listReceivedEvaluationOrders(
    shipperId: string,
  ): Promise<ShipperProfileEvaluationOrderRecord[]>;
  listAdminEvaluationOrders(): Promise<ShipperProfileEvaluationOrderRecord[]>;
  listAuthoredEvaluationOrders(
    actorUserId: string,
  ): Promise<ShipperProfileEvaluationOrderRecord[]>;
  findAdminEvaluationOrderByEventId(
    evaluationId: string,
  ): Promise<ShipperProfileEvaluationOrderRecord | undefined>;
  listAdminEvaluationModerationEvents(
    evaluationId: string,
  ): Promise<AdminEvaluationModerationEventRecord[]>;
  listLatestEvaluationAppeals(
    evaluationIds: string[],
  ): Promise<EvaluationAppealSnapshot[]>;
  listEvaluationAppealEvents(
    evaluationId: string,
  ): Promise<EvaluationAppealEventRecord[]>;
  submitEvaluationAppeal(
    input: SubmitEvaluationAppealInput,
  ): Promise<SubmitEvaluationAppealResult>;
  resolveAdminEvaluationAppeal(
    input: ResolveAdminEvaluationAppealInput,
  ): Promise<ResolveAdminEvaluationAppealResult>;
  moderateAdminEvaluation(
    input: ModerateAdminEvaluationInput,
  ): Promise<ModerateAdminEvaluationResult>;
}

export class InMemoryProfileEvaluationsRepository
  implements ProfileEvaluationsRepository
{
  private readonly orders: ShipperProfileEvaluationOrderRecord[];
  private readonly moderationEvents: AdminEvaluationModerationEventRecord[];
  private readonly appeals: EvaluationAppealSnapshot[];
  private readonly appealEvents: EvaluationAppealEventRecord[];

  constructor(
    seed: {
      orders?: ShipperProfileEvaluationOrderRecord[];
      moderationEvents?: AdminEvaluationModerationEventRecord[];
      appeals?: EvaluationAppealSnapshot[];
      appealEvents?: EvaluationAppealEventRecord[];
    } = {},
  ) {
    this.orders = structuredClone(seed.orders ?? []);
    this.moderationEvents = structuredClone(seed.moderationEvents ?? []);
    this.appeals = structuredClone(seed.appeals ?? []);
    this.appealEvents = structuredClone(seed.appealEvents ?? []);
  }

  async listOrders(shipperId: string) {
    return this.orders
      .filter(order => order.shipperId === shipperId)
      .filter(order =>
        order.events.some(event => event.eventType === 'evaluation_submitted'),
      );
  }

  async listReceivedEvaluationOrders(shipperId: string) {
    return this.orders
      .filter(order => order.shipperId === shipperId)
      .filter(order =>
        order.events.some(
          event => event.eventType === 'shipper_evaluation_submitted',
        ),
      );
  }

  async listAdminEvaluationOrders() {
    return this.orders.filter(order =>
      order.events.some(event => isEvaluationAuditEventType(event.eventType)),
    );
  }

  async listAuthoredEvaluationOrders(actorUserId: string) {
    return structuredClone(
      this.orders.filter(order =>
        order.events.some(
          event =>
            event.actorUserId === actorUserId &&
            isEvaluationAuditEventType(event.eventType),
        ),
      ),
    );
  }

  async findAdminEvaluationOrderByEventId(evaluationId: string) {
    return this.orders.find(order =>
      order.events.some(
        event =>
          event.id === evaluationId &&
          isEvaluationAuditEventType(event.eventType),
      ),
    );
  }

  async listAdminEvaluationModerationEvents(evaluationId: string) {
    return structuredClone(
      this.moderationEvents
        .filter(event => event.evaluationId === evaluationId)
        .sort((left, right) =>
          right.createdAtIso.localeCompare(left.createdAtIso),
        ),
    );
  }

  async listLatestEvaluationAppeals(evaluationIds: string[]) {
    const evaluationIdSet = new Set(evaluationIds);
    const latestByEvaluationId = new Map<string, EvaluationAppealSnapshot>();

    for (const appeal of [...this.appeals].sort((left, right) =>
      right.submittedAtIso.localeCompare(left.submittedAtIso),
    )) {
      if (
        evaluationIdSet.has(appeal.evaluationId) &&
        !latestByEvaluationId.has(appeal.evaluationId)
      ) {
        latestByEvaluationId.set(appeal.evaluationId, structuredClone(appeal));
      }
    }

    return [...latestByEvaluationId.values()];
  }

  async listEvaluationAppealEvents(evaluationId: string) {
    return structuredClone(
      this.appealEvents
        .filter(event => event.evaluationId === evaluationId)
        .sort((left, right) =>
          right.createdAtIso.localeCompare(left.createdAtIso),
        ),
    );
  }

  async submitEvaluationAppeal(input: SubmitEvaluationAppealInput) {
    const evaluationEvent = this.orders
      .flatMap(order => order.events)
      .find(
        event =>
          event.id === input.evaluationId &&
          event.actorUserId === input.appellantUserId &&
          isEvaluationAuditEventType(event.eventType),
      );

    if (!evaluationEvent) {
      return { kind: 'not-found' as const };
    }

    const moderation = normalizeEvaluationModeration(
      evaluationEvent.evaluationModeration,
    );
    if (moderation.status !== 'hidden') {
      return { kind: 'not-allowed' as const };
    }
    if (moderation.version !== input.baseModerationVersion) {
      return { kind: 'conflict' as const };
    }

    const existing = this.appeals.find(
      appeal =>
        appeal.evaluationId === input.evaluationId &&
        appeal.status === 'requested',
    );
    if (existing) {
      return isSameEvaluationAppealRequest(existing, input)
        ? {
            kind: 'success' as const,
            appeal: structuredClone(existing),
            replayed: true,
          }
        : { kind: 'already-requested' as const };
    }

    const appeal: EvaluationAppealSnapshot = {
      id: `evaluation-appeal-${this.appeals.length + 1}`,
      evaluationId: input.evaluationId,
      appellantUserId: input.appellantUserId,
      status: 'requested',
      version: 1,
      reason: input.reason,
      moderationVersion: input.baseModerationVersion,
      submittedAtIso: input.submittedAtIso,
    };
    const action: EvaluationAppealEventRecord = {
      id: `evaluation-appeal-action-${this.appealEvents.length + 1}`,
      appealId: appeal.id,
      evaluationId: input.evaluationId,
      actorUserId: input.appellantUserId,
      toStatus: 'requested',
      reason: input.reason,
      fromVersion: 0,
      toVersion: 1,
      createdAtIso: input.submittedAtIso,
    };
    this.appeals.push(appeal);
    this.appealEvents.push(action);

    return {
      kind: 'success' as const,
      appeal: structuredClone(appeal),
      replayed: false,
    };
  }

  async resolveAdminEvaluationAppeal(
    input: ResolveAdminEvaluationAppealInput,
  ) {
    const appeal = this.appeals.find(
      item =>
        item.id === input.appealId &&
        item.evaluationId === input.evaluationId,
    );
    const evaluationEvent = this.orders
      .flatMap(order => order.events)
      .find(event => event.id === input.evaluationId);

    if (!appeal || !evaluationEvent) {
      return { kind: 'not-found' as const };
    }
    if (appeal.status !== 'requested') {
      return { kind: 'not-allowed' as const };
    }

    const currentModeration = normalizeEvaluationModeration(
      evaluationEvent.evaluationModeration,
    );
    if (
      appeal.version !== input.baseAppealVersion ||
      currentModeration.version !== input.baseModerationVersion
    ) {
      return { kind: 'conflict' as const };
    }
    if (currentModeration.status !== 'hidden') {
      return { kind: 'not-allowed' as const };
    }

    appeal.status = input.decision;
    appeal.version += 1;
    appeal.resolutionReason = input.reason;
    appeal.resolvedByAdminId = input.adminUserId;
    appeal.resolvedAtIso = input.resolvedAtIso;

    let nextModeration = currentModeration;
    if (input.decision === 'accepted') {
      nextModeration = {
        status: 'visible',
        version: currentModeration.version + 1,
        reason: input.reason,
        moderatedByAdminId: input.adminUserId,
        moderatedAtIso: input.resolvedAtIso,
      };
      evaluationEvent.evaluationModeration = structuredClone(nextModeration);
      this.moderationEvents.push({
        id: `evaluation-moderation-action-${this.moderationEvents.length + 1}`,
        evaluationId: input.evaluationId,
        adminUserId: input.adminUserId,
        fromStatus: 'hidden',
        toStatus: 'visible',
        reason: input.reason,
        fromVersion: currentModeration.version,
        toVersion: nextModeration.version,
        createdAtIso: input.resolvedAtIso,
      });
    }

    this.appealEvents.push({
      id: `evaluation-appeal-action-${this.appealEvents.length + 1}`,
      appealId: appeal.id,
      evaluationId: appeal.evaluationId,
      actorUserId: input.adminUserId,
      fromStatus: 'requested',
      toStatus: input.decision,
      reason: input.reason,
      fromVersion: input.baseAppealVersion,
      toVersion: appeal.version,
      createdAtIso: input.resolvedAtIso,
    });

    return {
      kind: 'success' as const,
      appeal: structuredClone(appeal),
      moderation: structuredClone(nextModeration),
    };
  }

  async moderateAdminEvaluation(input: ModerateAdminEvaluationInput) {
    const order = this.orders.find(candidate =>
      candidate.events.some(
        event =>
          event.id === input.evaluationId &&
          isEvaluationAuditEventType(event.eventType),
      ),
    );
    const evaluationEvent = order?.events.find(
      event => event.id === input.evaluationId,
    );

    if (!evaluationEvent) {
      return { kind: 'not-found' as const };
    }

    if (
      this.appeals.some(
        appeal =>
          appeal.evaluationId === input.evaluationId &&
          appeal.status === 'requested',
      )
    ) {
      return { kind: 'appeal-pending' as const };
    }

    const currentModeration = normalizeEvaluationModeration(
      evaluationEvent.evaluationModeration,
    );
    if (currentModeration.version !== input.baseModerationVersion) {
      return { kind: 'conflict' as const };
    }

    const nextModeration: AdminEvaluationModerationSnapshot = {
      status: input.status,
      version: currentModeration.version + 1,
      reason: input.reason,
      moderatedByAdminId: input.adminUserId,
      moderatedAtIso: input.moderatedAtIso,
    };
    const action: AdminEvaluationModerationEventRecord = {
      id: `evaluation-moderation-action-${this.moderationEvents.length + 1}`,
      evaluationId: input.evaluationId,
      adminUserId: input.adminUserId,
      fromStatus: currentModeration.status,
      toStatus: input.status,
      reason: input.reason,
      fromVersion: currentModeration.version,
      toVersion: nextModeration.version,
      createdAtIso: input.moderatedAtIso,
    };

    evaluationEvent.evaluationModeration = structuredClone(nextModeration);
    this.moderationEvents.push(action);

    return {
      kind: 'success' as const,
      moderation: structuredClone(nextModeration),
    };
  }
}

export type PrismaEvaluationModerationRecord = {
  evaluationEventId: string;
  status: string;
  version: number;
  reason: string;
  moderatedByAdminId: string;
  moderatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type PrismaEvaluationModerationActionRecord = {
  id: string;
  evaluationEventId: string;
  adminUserId: string;
  fromStatus: string;
  toStatus: string;
  reason: string;
  fromVersion: number;
  toVersion: number;
  createdAt: Date;
};

export type PrismaEvaluationAppealRecord = {
  id: string;
  evaluationEventId: string;
  appellantUserId: string;
  status: string;
  version: number;
  reason: string;
  moderationVersion: number;
  submittedAt: Date;
  resolutionReason: string | null;
  resolvedByAdminId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PrismaEvaluationAppealActionRecord = {
  id: string;
  appealId: string;
  actorUserId: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string;
  fromVersion: number;
  toVersion: number;
  createdAt: Date;
};

export type PrismaEvaluationAppealActionWithEvaluationRecord =
  PrismaEvaluationAppealActionRecord & {
    appeal: { evaluationEventId: string };
  };

type PrismaEvaluationAppealSourceRecord = {
  id: string;
  actorUserId: string;
  evaluationModeration: PrismaEvaluationModerationRecord | null;
};

export type PrismaProfileEvaluationOrderRecord = {
  id: string;
  shipperId: string;
  orderNo: string;
  events: Array<{
    id: string;
    actorUserId: string;
    eventType: string;
    noteText: string | null;
    attachmentFileIds: unknown;
    createdAt: Date;
    evaluationModeration: PrismaEvaluationModerationRecord | null;
  }>;
};

export type PrismaProfileEvaluationsClient = {
  $transaction<T>(
    callback: (transaction: PrismaProfileEvaluationsClient) => Promise<T>,
  ): Promise<T>;
  order: {
    findMany(args: {
      where: Record<string, unknown>;
      select: {
        id: true;
        shipperId: true;
        orderNo: true;
        events: {
          select: {
            id: true;
            actorUserId: true;
            eventType: true;
            noteText: true;
            attachmentFileIds: true;
            createdAt: true;
            evaluationModeration: {
              select: EvaluationModerationSelect;
            };
          };
          orderBy: {
            createdAt: 'asc';
          };
        };
      };
      orderBy: {
        updatedAt: 'desc';
      };
    }): Promise<PrismaProfileEvaluationOrderRecord[]>;
    findFirst(args: {
      where: Record<string, unknown>;
      select: {
        id: true;
        shipperId: true;
        orderNo: true;
        events: {
          select: {
            id: true;
            actorUserId: true;
            eventType: true;
            noteText: true;
            attachmentFileIds: true;
            createdAt: true;
            evaluationModeration: {
              select: EvaluationModerationSelect;
            };
          };
          orderBy: {
            createdAt: 'asc';
          };
        };
      };
      orderBy: {
        updatedAt: 'desc';
      };
    }): Promise<PrismaProfileEvaluationOrderRecord | null>;
  };
  orderEvent: {
    findFirst(args: {
      where: {
        id: string;
        eventType: { in: string[] };
        actorUserId?: string;
      };
      select: {
        id: true;
        actorUserId: true;
        evaluationModeration: { select: EvaluationModerationSelect };
      };
    }): Promise<PrismaEvaluationAppealSourceRecord | null>;
  };
  evaluationModeration: {
    findUnique(args: {
      where: { evaluationEventId: string };
    }): Promise<PrismaEvaluationModerationRecord | null>;
    create(args: {
      data: {
        evaluationEventId: string;
        status: 'visible' | 'hidden';
        version: number;
        reason: string;
        moderatedByAdminId: string;
        moderatedAt: Date;
      };
    }): Promise<PrismaEvaluationModerationRecord>;
    updateMany(args: {
      where: {
        evaluationEventId: string;
        version: number;
        status?: 'hidden' | 'visible';
      };
      data: {
        status: 'visible' | 'hidden';
        version: number;
        reason: string;
        moderatedByAdminId: string;
        moderatedAt: Date;
      };
    }): Promise<{ count: number }>;
  };
  evaluationModerationAction: {
    findMany(args: {
      where: { evaluationEventId: string };
      orderBy: { createdAt: 'desc' };
    }): Promise<PrismaEvaluationModerationActionRecord[]>;
    create(args: {
      data: {
        evaluationEventId: string;
        adminUserId: string;
        fromStatus: 'visible' | 'hidden';
        toStatus: 'visible' | 'hidden';
        reason: string;
        fromVersion: number;
        toVersion: number;
        createdAt: Date;
      };
    }): Promise<PrismaEvaluationModerationActionRecord>;
  };
  evaluationAppeal: {
    findMany(args: {
      where: { evaluationEventId: { in: string[] } };
      orderBy: { submittedAt: 'desc' };
    }): Promise<PrismaEvaluationAppealRecord[]>;
    findFirst(args: {
      where: {
        evaluationEventId: string;
        status: 'requested';
      };
      orderBy?: { submittedAt: 'desc' };
    }): Promise<PrismaEvaluationAppealRecord | null>;
    findUnique(args: {
      where: { id: string };
    }): Promise<PrismaEvaluationAppealRecord | null>;
    create(args: {
      data: {
        evaluationEventId: string;
        appellantUserId: string;
        status: 'requested';
        version: number;
        reason: string;
        moderationVersion: number;
        submittedAt: Date;
      };
    }): Promise<PrismaEvaluationAppealRecord>;
    updateMany(args: {
      where: {
        id: string;
        evaluationEventId: string;
        status: 'requested';
        version: number;
      };
      data: {
        status: 'accepted' | 'rejected';
        version: number;
        resolutionReason: string;
        resolvedByAdminId: string;
        resolvedAt: Date;
      };
    }): Promise<{ count: number }>;
  };
  evaluationAppealAction: {
    findMany(args: {
      where: { appeal: { evaluationEventId: string } };
      include: { appeal: { select: { evaluationEventId: true } } };
      orderBy: { createdAt: 'desc' };
    }): Promise<PrismaEvaluationAppealActionWithEvaluationRecord[]>;
    create(args: {
      data: {
        appealId: string;
        actorUserId: string;
        fromStatus?: 'requested';
        toStatus: 'requested' | 'accepted' | 'rejected';
        reason: string;
        fromVersion: number;
        toVersion: number;
        createdAt: Date;
      };
    }): Promise<PrismaEvaluationAppealActionRecord>;
  };
};

type EvaluationModerationSelect = {
  evaluationEventId: true;
  status: true;
  version: true;
  reason: true;
  moderatedByAdminId: true;
  moderatedAt: true;
  createdAt: true;
  updatedAt: true;
};

type EvaluationAppealSourceSelect = {
  id: true;
  actorUserId: true;
  evaluationModeration: { select: EvaluationModerationSelect };
};

export class PrismaProfileEvaluationsRepository
  implements ProfileEvaluationsRepository
{
  constructor(private readonly prisma: PrismaProfileEvaluationsClient) {}

  async listOrders(shipperId: string) {
    return this.listOrdersByEventType(shipperId, 'evaluation_submitted');
  }

  async listReceivedEvaluationOrders(shipperId: string) {
    return this.listOrdersByEventType(
      shipperId,
      'shipper_evaluation_submitted',
    );
  }

  async listAdminEvaluationOrders() {
    const orders = await this.prisma.order.findMany({
      where: {
        events: {
          some: {
            eventType: {
              in: ['evaluation_submitted', 'shipper_evaluation_submitted'],
            },
          },
        },
      },
      select: {
        id: true,
        shipperId: true,
        orderNo: true,
        events: {
          select: {
            id: true,
            actorUserId: true,
            eventType: true,
            noteText: true,
            attachmentFileIds: true,
            createdAt: true,
            evaluationModeration: {
              select: createEvaluationModerationSelect(),
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return orders.map(mapPrismaProfileEvaluationOrder);
  }

  async listAuthoredEvaluationOrders(actorUserId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        events: {
          some: {
            actorUserId,
            eventType: {
              in: ['evaluation_submitted', 'shipper_evaluation_submitted'],
            },
          },
        },
      },
      select: {
        id: true,
        shipperId: true,
        orderNo: true,
        events: {
          select: {
            id: true,
            actorUserId: true,
            eventType: true,
            noteText: true,
            attachmentFileIds: true,
            createdAt: true,
            evaluationModeration: {
              select: createEvaluationModerationSelect(),
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return orders.map(mapPrismaProfileEvaluationOrder);
  }

  async findAdminEvaluationOrderByEventId(evaluationId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        events: {
          some: {
            id: evaluationId,
            eventType: {
              in: ['evaluation_submitted', 'shipper_evaluation_submitted'],
            },
          },
        },
      },
      select: {
        id: true,
        shipperId: true,
        orderNo: true,
        events: {
          select: {
            id: true,
            actorUserId: true,
            eventType: true,
            noteText: true,
            attachmentFileIds: true,
            createdAt: true,
            evaluationModeration: {
              select: createEvaluationModerationSelect(),
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return order ? mapPrismaProfileEvaluationOrder(order) : undefined;
  }

  async listAdminEvaluationModerationEvents(evaluationId: string) {
    const events = await this.prisma.evaluationModerationAction.findMany({
      where: { evaluationEventId: evaluationId },
      orderBy: { createdAt: 'desc' },
    });

    return events.map(mapPrismaEvaluationModerationAction);
  }

  async listLatestEvaluationAppeals(evaluationIds: string[]) {
    if (evaluationIds.length === 0) {
      return [];
    }

    const appeals = await this.prisma.evaluationAppeal.findMany({
      where: { evaluationEventId: { in: evaluationIds } },
      orderBy: { submittedAt: 'desc' },
    });
    const latestByEvaluationId = new Map<string, EvaluationAppealSnapshot>();

    for (const appeal of appeals) {
      if (!latestByEvaluationId.has(appeal.evaluationEventId)) {
        latestByEvaluationId.set(
          appeal.evaluationEventId,
          mapPrismaEvaluationAppeal(appeal),
        );
      }
    }

    return [...latestByEvaluationId.values()];
  }

  async listEvaluationAppealEvents(evaluationId: string) {
    const events = await this.prisma.evaluationAppealAction.findMany({
      where: { appeal: { evaluationEventId: evaluationId } },
      include: { appeal: { select: { evaluationEventId: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return events.map(mapPrismaEvaluationAppealAction);
  }

  async submitEvaluationAppeal(input: SubmitEvaluationAppealInput) {
    try {
      return await this.prisma.$transaction(async transaction => {
        const evaluationEvent = await transaction.orderEvent.findFirst({
          where: {
            id: input.evaluationId,
            actorUserId: input.appellantUserId,
            eventType: {
              in: ['evaluation_submitted', 'shipper_evaluation_submitted'],
            },
          },
          select: createEvaluationAppealSourceSelect(),
        });

        if (!evaluationEvent) {
          return { kind: 'not-found' as const };
        }

        const moderation = evaluationEvent.evaluationModeration
          ? mapPrismaEvaluationModeration(
              evaluationEvent.evaluationModeration,
            )
          : normalizeEvaluationModeration(undefined);
        if (moderation.status !== 'hidden') {
          return { kind: 'not-allowed' as const };
        }
        if (moderation.version !== input.baseModerationVersion) {
          return { kind: 'conflict' as const };
        }

        const existing = await transaction.evaluationAppeal.findFirst({
          where: {
            evaluationEventId: input.evaluationId,
            status: 'requested',
          },
          orderBy: { submittedAt: 'desc' },
        });
        if (existing) {
          return isSameEvaluationAppealRequest(existing, input)
            ? {
                kind: 'success' as const,
                appeal: mapPrismaEvaluationAppeal(existing),
                replayed: true,
              }
            : { kind: 'already-requested' as const };
        }

        const submittedAt = new Date(input.submittedAtIso);
        const created = await transaction.evaluationAppeal.create({
          data: {
            evaluationEventId: input.evaluationId,
            appellantUserId: input.appellantUserId,
            status: 'requested',
            version: 1,
            reason: input.reason,
            moderationVersion: input.baseModerationVersion,
            submittedAt,
          },
        });
        await transaction.evaluationAppealAction.create({
          data: {
            appealId: created.id,
            actorUserId: input.appellantUserId,
            toStatus: 'requested',
            reason: input.reason,
            fromVersion: 0,
            toVersion: 1,
            createdAt: submittedAt,
          },
        });

        return {
          kind: 'success' as const,
          appeal: mapPrismaEvaluationAppeal(created),
          replayed: false,
        };
      });
    } catch (error) {
      if (!isEvaluationAppealOpenConflict(error)) {
        throw error;
      }

      const existing = await this.prisma.evaluationAppeal.findFirst({
        where: {
          evaluationEventId: input.evaluationId,
          status: 'requested',
        },
        orderBy: { submittedAt: 'desc' },
      });

      return existing && isSameEvaluationAppealRequest(existing, input)
        ? {
            kind: 'success' as const,
            appeal: mapPrismaEvaluationAppeal(existing),
            replayed: true,
          }
        : { kind: 'already-requested' as const };
    }
  }

  async resolveAdminEvaluationAppeal(
    input: ResolveAdminEvaluationAppealInput,
  ) {
    try {
      return await this.prisma.$transaction(async transaction => {
        const appeal = await transaction.evaluationAppeal.findUnique({
          where: { id: input.appealId },
        });
        if (!appeal || appeal.evaluationEventId !== input.evaluationId) {
          return { kind: 'not-found' as const };
        }
        if (appeal.status !== 'requested') {
          return { kind: 'not-allowed' as const };
        }

        const moderationRecord =
          await transaction.evaluationModeration.findUnique({
            where: { evaluationEventId: input.evaluationId },
          });
        if (!moderationRecord) {
          return { kind: 'not-allowed' as const };
        }
        const currentModeration =
          mapPrismaEvaluationModeration(moderationRecord);
        if (
          appeal.version !== input.baseAppealVersion ||
          currentModeration.version !== input.baseModerationVersion
        ) {
          return { kind: 'conflict' as const };
        }
        if (currentModeration.status !== 'hidden') {
          return { kind: 'not-allowed' as const };
        }

        const resolvedAt = new Date(input.resolvedAtIso);
        const nextAppealVersion = appeal.version + 1;
        const appealTransition = await transaction.evaluationAppeal.updateMany({
          where: {
            id: input.appealId,
            evaluationEventId: input.evaluationId,
            status: 'requested',
            version: appeal.version,
          },
          data: {
            status: input.decision,
            version: nextAppealVersion,
            resolutionReason: input.reason,
            resolvedByAdminId: input.adminUserId,
            resolvedAt,
          },
        });
        if (appealTransition.count !== 1) {
          throw new EvaluationAppealTransactionAbort('conflict');
        }

        let nextModeration = currentModeration;
        if (input.decision === 'accepted') {
          const nextModerationVersion = currentModeration.version + 1;
          const moderationTransition =
            await transaction.evaluationModeration.updateMany({
              where: {
                evaluationEventId: input.evaluationId,
                status: 'hidden',
                version: currentModeration.version,
              },
              data: {
                status: 'visible',
                version: nextModerationVersion,
                reason: input.reason,
                moderatedByAdminId: input.adminUserId,
                moderatedAt: resolvedAt,
              },
            });
          if (moderationTransition.count !== 1) {
            throw new EvaluationAppealTransactionAbort('conflict');
          }

          nextModeration = {
            status: 'visible',
            version: nextModerationVersion,
            reason: input.reason,
            moderatedByAdminId: input.adminUserId,
            moderatedAtIso: input.resolvedAtIso,
          };
          await transaction.evaluationModerationAction.create({
            data: {
              evaluationEventId: input.evaluationId,
              adminUserId: input.adminUserId,
              fromStatus: 'hidden',
              toStatus: 'visible',
              reason: input.reason,
              fromVersion: currentModeration.version,
              toVersion: nextModerationVersion,
              createdAt: resolvedAt,
            },
          });
        }

        await transaction.evaluationAppealAction.create({
          data: {
            appealId: input.appealId,
            actorUserId: input.adminUserId,
            fromStatus: 'requested',
            toStatus: input.decision,
            reason: input.reason,
            fromVersion: appeal.version,
            toVersion: nextAppealVersion,
            createdAt: resolvedAt,
          },
        });

        return {
          kind: 'success' as const,
          appeal: {
            ...mapPrismaEvaluationAppeal(appeal),
            status: input.decision,
            version: nextAppealVersion,
            resolutionReason: input.reason,
            resolvedByAdminId: input.adminUserId,
            resolvedAtIso: input.resolvedAtIso,
          },
          moderation: nextModeration,
        };
      });
    } catch (error) {
      if (error instanceof EvaluationAppealTransactionAbort) {
        return { kind: error.kind };
      }

      throw error;
    }
  }

  async moderateAdminEvaluation(input: ModerateAdminEvaluationInput) {
    try {
      return await this.prisma.$transaction(async transaction => {
        const evaluationEvent = await transaction.orderEvent.findFirst({
          where: {
            id: input.evaluationId,
            eventType: {
              in: ['evaluation_submitted', 'shipper_evaluation_submitted'],
            },
          },
          select: createEvaluationAppealSourceSelect(),
        });

        if (!evaluationEvent) {
          return { kind: 'not-found' as const };
        }

        const pendingAppeal = await transaction.evaluationAppeal.findFirst({
          where: {
            evaluationEventId: input.evaluationId,
            status: 'requested',
          },
        });
        if (pendingAppeal) {
          return { kind: 'appeal-pending' as const };
        }

        const existing = await transaction.evaluationModeration.findUnique({
          where: { evaluationEventId: input.evaluationId },
        });
        const current = existing
          ? mapPrismaEvaluationModeration(existing)
          : normalizeEvaluationModeration(undefined);

        if (current.version !== input.baseModerationVersion) {
          return { kind: 'conflict' as const };
        }

        const moderatedAt = new Date(input.moderatedAtIso);
        const nextVersion = current.version + 1;
        const nextModeration: AdminEvaluationModerationSnapshot = {
          status: input.status,
          version: nextVersion,
          reason: input.reason,
          moderatedByAdminId: input.adminUserId,
          moderatedAtIso: input.moderatedAtIso,
        };

        if (existing) {
          const transition = await transaction.evaluationModeration.updateMany({
            where: {
              evaluationEventId: input.evaluationId,
              version: current.version,
            },
            data: {
              status: input.status,
              version: nextVersion,
              reason: input.reason,
              moderatedByAdminId: input.adminUserId,
              moderatedAt,
            },
          });

          if (transition.count !== 1) {
            return { kind: 'conflict' as const };
          }
        } else {
          await transaction.evaluationModeration.create({
            data: {
              evaluationEventId: input.evaluationId,
              status: input.status,
              version: nextVersion,
              reason: input.reason,
              moderatedByAdminId: input.adminUserId,
              moderatedAt,
            },
          });
        }

        await transaction.evaluationModerationAction.create({
          data: {
            evaluationEventId: input.evaluationId,
            adminUserId: input.adminUserId,
            fromStatus: current.status,
            toStatus: input.status,
            reason: input.reason,
            fromVersion: current.version,
            toVersion: nextVersion,
            createdAt: moderatedAt,
          },
        });

        return {
          kind: 'success' as const,
          moderation: nextModeration,
        };
      });
    } catch (error) {
      if (isEvaluationModerationFirstWriteConflict(error)) {
        return { kind: 'conflict' as const };
      }

      throw error;
    }
  }

  private async listOrdersByEventType(shipperId: string, eventType: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        shipperId,
        events: {
          some: {
            eventType,
          },
        },
      },
      select: {
        id: true,
        shipperId: true,
        orderNo: true,
        events: {
          select: {
            id: true,
            actorUserId: true,
            eventType: true,
            noteText: true,
            attachmentFileIds: true,
            createdAt: true,
            evaluationModeration: {
              select: createEvaluationModerationSelect(),
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return orders.map(mapPrismaProfileEvaluationOrder);
  }
}

function isEvaluationAuditEventType(eventType: string) {
  return (
    eventType === 'evaluation_submitted' ||
    eventType === 'shipper_evaluation_submitted'
  );
}

function mapPrismaProfileEvaluationOrder(
  order: PrismaProfileEvaluationOrderRecord,
): ShipperProfileEvaluationOrderRecord {
  return {
    id: order.id,
    shipperId: order.shipperId,
    orderNo: order.orderNo,
    events: order.events.map(event => ({
      id: event.id,
      actorUserId: event.actorUserId,
      eventType: event.eventType,
      noteText: event.noteText ?? undefined,
      attachmentFileIds: parseAttachmentFileIds(event.attachmentFileIds),
      createdAtIso: event.createdAt.toISOString(),
      ...(event.evaluationModeration
        ? {
            evaluationModeration: mapPrismaEvaluationModeration(
              event.evaluationModeration,
            ),
          }
        : {}),
    })),
  };
}

function createEvaluationModerationSelect(): EvaluationModerationSelect {
  return {
    evaluationEventId: true,
    status: true,
    version: true,
    reason: true,
    moderatedByAdminId: true,
    moderatedAt: true,
    createdAt: true,
    updatedAt: true,
  };
}

function createEvaluationAppealSourceSelect(): EvaluationAppealSourceSelect {
  return {
    id: true,
    actorUserId: true,
    evaluationModeration: {
      select: createEvaluationModerationSelect(),
    },
  };
}

function normalizeEvaluationModeration(
  moderation: AdminEvaluationModerationSnapshot | undefined,
): AdminEvaluationModerationSnapshot {
  return moderation
    ? structuredClone(moderation)
    : {
        status: 'visible',
        version: 0,
      };
}

function mapPrismaEvaluationModeration(
  moderation: PrismaEvaluationModerationRecord,
): AdminEvaluationModerationSnapshot {
  return {
    status: normalizeEvaluationModerationStatus(moderation.status),
    version: moderation.version,
    reason: moderation.reason,
    moderatedByAdminId: moderation.moderatedByAdminId,
    moderatedAtIso: moderation.moderatedAt.toISOString(),
  };
}

function mapPrismaEvaluationModerationAction(
  event: PrismaEvaluationModerationActionRecord,
): AdminEvaluationModerationEventRecord {
  return {
    id: event.id,
    evaluationId: event.evaluationEventId,
    adminUserId: event.adminUserId,
    fromStatus: normalizeEvaluationModerationStatus(event.fromStatus),
    toStatus: normalizeEvaluationModerationStatus(event.toStatus),
    reason: event.reason,
    fromVersion: event.fromVersion,
    toVersion: event.toVersion,
    createdAtIso: event.createdAt.toISOString(),
  };
}

function mapPrismaEvaluationAppeal(
  appeal: PrismaEvaluationAppealRecord,
): EvaluationAppealSnapshot {
  return {
    id: appeal.id,
    evaluationId: appeal.evaluationEventId,
    appellantUserId: appeal.appellantUserId,
    status: normalizeEvaluationAppealStatus(appeal.status),
    version: appeal.version,
    reason: appeal.reason,
    moderationVersion: appeal.moderationVersion,
    submittedAtIso: appeal.submittedAt.toISOString(),
    ...(appeal.resolutionReason
      ? { resolutionReason: appeal.resolutionReason }
      : {}),
    ...(appeal.resolvedByAdminId
      ? { resolvedByAdminId: appeal.resolvedByAdminId }
      : {}),
    ...(appeal.resolvedAt
      ? { resolvedAtIso: appeal.resolvedAt.toISOString() }
      : {}),
  };
}

function mapPrismaEvaluationAppealAction(
  event: PrismaEvaluationAppealActionWithEvaluationRecord,
): EvaluationAppealEventRecord {
  return {
    id: event.id,
    appealId: event.appealId,
    evaluationId: event.appeal.evaluationEventId,
    actorUserId: event.actorUserId,
    ...(event.fromStatus
      ? { fromStatus: normalizeEvaluationAppealStatus(event.fromStatus) }
      : {}),
    toStatus: normalizeEvaluationAppealStatus(event.toStatus),
    reason: event.reason,
    fromVersion: event.fromVersion,
    toVersion: event.toVersion,
    createdAtIso: event.createdAt.toISOString(),
  };
}

function normalizeEvaluationModerationStatus(status: string) {
  if (status === 'visible' || status === 'hidden') {
    return status;
  }

  throw new Error(`Unsupported evaluation moderation status: ${status}`);
}

function normalizeEvaluationAppealStatus(status: string) {
  if (
    status === 'requested' ||
    status === 'accepted' ||
    status === 'rejected'
  ) {
    return status;
  }

  throw new Error(`Unsupported evaluation appeal status: ${status}`);
}

function isSameEvaluationAppealRequest(
  appeal: Pick<
    EvaluationAppealSnapshot | PrismaEvaluationAppealRecord,
    'appellantUserId' | 'reason' | 'moderationVersion'
  >,
  input: SubmitEvaluationAppealInput,
) {
  return (
    appeal.appellantUserId === input.appellantUserId &&
    appeal.reason === input.reason &&
    appeal.moderationVersion === input.baseModerationVersion
  );
}

class EvaluationAppealTransactionAbort extends Error {
  constructor(readonly kind: 'conflict') {
    super(kind);
  }
}

function isPrismaErrorCode(error: unknown, code: string) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function isEvaluationModerationFirstWriteConflict(error: unknown) {
  if (!isPrismaErrorCode(error, 'P2002')) {
    return false;
  }

  const meta =
    typeof error === 'object' && error !== null && 'meta' in error
      ? (error as { meta?: unknown }).meta
      : undefined;
  const target =
    typeof meta === 'object' && meta !== null && 'target' in meta
      ? (meta as { target?: unknown }).target
      : undefined;

  if (typeof target === 'string') {
    return (
      target === 'EvaluationModeration_pkey' || target === 'evaluationEventId'
    );
  }

  return (
    Array.isArray(target) &&
    target.length === 1 &&
    target[0] === 'evaluationEventId'
  );
}

function isEvaluationAppealOpenConflict(error: unknown) {
  if (!isPrismaErrorCode(error, 'P2002')) {
    return false;
  }

  const meta =
    typeof error === 'object' && error !== null && 'meta' in error
      ? (error as { meta?: unknown }).meta
      : undefined;
  const target =
    typeof meta === 'object' && meta !== null && 'target' in meta
      ? (meta as { target?: unknown }).target
      : undefined;

  if (typeof target === 'string') {
    return target === 'EvaluationAppeal_open_event_unique';
  }

  return (
    Array.isArray(target) &&
    target.length === 1 &&
    target[0] === 'evaluationEventId'
  );
}

function parseAttachmentFileIds(value: unknown) {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
    ? value
    : undefined;
}
