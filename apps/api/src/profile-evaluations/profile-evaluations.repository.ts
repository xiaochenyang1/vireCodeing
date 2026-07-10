import type { ShipperProfileEvaluationOrderRecord } from './dto';

export interface ProfileEvaluationsRepository {
  listOrders(shipperId: string): Promise<ShipperProfileEvaluationOrderRecord[]>;
  listReceivedEvaluationOrders(
    shipperId: string,
  ): Promise<ShipperProfileEvaluationOrderRecord[]>;
  listAdminEvaluationOrders(): Promise<ShipperProfileEvaluationOrderRecord[]>;
}

export class InMemoryProfileEvaluationsRepository
  implements ProfileEvaluationsRepository
{
  private readonly orders: ShipperProfileEvaluationOrderRecord[];

  constructor(seed: { orders?: ShipperProfileEvaluationOrderRecord[] } = {}) {
    this.orders = [...(seed.orders ?? [])];
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
}

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
  }>;
};

export type PrismaProfileEvaluationsClient = {
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
  };
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
    })),
  };
}

function parseAttachmentFileIds(value: unknown) {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
    ? value
    : undefined;
}
