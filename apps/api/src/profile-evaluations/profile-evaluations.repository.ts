import type {
  AdminEvaluationModerationEventRecord,
  AdminEvaluationModerationSnapshot,
  ModerateAdminEvaluationRequest,
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
  | { kind: 'conflict' };

export interface ProfileEvaluationsRepository {
  listOrders(shipperId: string): Promise<ShipperProfileEvaluationOrderRecord[]>;
  listReceivedEvaluationOrders(
    shipperId: string,
  ): Promise<ShipperProfileEvaluationOrderRecord[]>;
  listAdminEvaluationOrders(): Promise<ShipperProfileEvaluationOrderRecord[]>;
  findAdminEvaluationOrderByEventId(
    evaluationId: string,
  ): Promise<ShipperProfileEvaluationOrderRecord | undefined>;
  listAdminEvaluationModerationEvents(
    evaluationId: string,
  ): Promise<AdminEvaluationModerationEventRecord[]>;
  moderateAdminEvaluation(
    input: ModerateAdminEvaluationInput,
  ): Promise<ModerateAdminEvaluationResult>;
}

export class InMemoryProfileEvaluationsRepository
  implements ProfileEvaluationsRepository
{
  private readonly orders: ShipperProfileEvaluationOrderRecord[];
  private readonly moderationEvents: AdminEvaluationModerationEventRecord[];

  constructor(
    seed: {
      orders?: ShipperProfileEvaluationOrderRecord[];
      moderationEvents?: AdminEvaluationModerationEventRecord[];
    } = {},
  ) {
    this.orders = structuredClone(seed.orders ?? []);
    this.moderationEvents = structuredClone(seed.moderationEvents ?? []);
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
      };
      select: { id: true };
    }): Promise<{ id: string } | null>;
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
      where: { evaluationEventId: string; version: number };
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
          select: { id: true },
        });

        if (!evaluationEvent) {
          return { kind: 'not-found' as const };
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

function normalizeEvaluationModerationStatus(status: string) {
  if (status === 'visible' || status === 'hidden') {
    return status;
  }

  throw new Error(`Unsupported evaluation moderation status: ${status}`);
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

function parseAttachmentFileIds(value: unknown) {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
    ? value
    : undefined;
}
