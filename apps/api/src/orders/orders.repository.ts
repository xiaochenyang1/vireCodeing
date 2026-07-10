import type {
  AdvanceShipperOrderStatusRequest,
  CancelShipperOrderRequest,
  CreateShipperOrderRequest,
  AdminOrderAttachmentAuditListQuery,
  ListShipperOrdersQuery,
  ReportShipperOrderExceptionRequest,
  ShipperOrderEventRecord,
  ShipperOrderRecord,
  SubmitShipperOrderChangeRequest,
  SubmitShipperOrderEvaluationRequest,
} from './dto';
import type {
  DriverAcceptOrderEventPayload,
  DriverAdvanceOrderStatusRequest,
  DriverEvaluateShipperRequest,
  DriverMyOrdersQuery,
  DriverOrderHallQuery,
  DriverQuoteOrderEventPayload,
  DriverReplyEvaluationRequest,
} from '../driver-orders/dto';

export interface OrdersRepository {
  createOrder(
    shipperId: string,
    input: CreateShipperOrderRequest,
  ): Promise<ShipperOrderRecord>;
  listOrders(
    shipperId: string,
    query: ListShipperOrdersQuery,
  ): Promise<{ items: ShipperOrderRecord[]; total: number }>;
  listAdminOrdersForAttachmentAudit(
    query: AdminOrderAttachmentAuditListQuery,
  ): Promise<ShipperOrderRecord[]>;
  findOrderById(orderId: string): Promise<ShipperOrderRecord | undefined>;
  updateOrder(
    orderId: string,
    actorUserId: string,
    input: CreateShipperOrderRequest,
  ): Promise<ShipperOrderRecord>;
  cancelOrder(
    orderId: string,
    actorUserId: string,
    input: CancelShipperOrderRequest,
  ): Promise<ShipperOrderRecord>;
  completeOrder(
    orderId: string,
    actorUserId: string,
  ): Promise<ShipperOrderRecord>;
  advanceOrderStatus(
    orderId: string,
    actorUserId: string,
    input: AdvanceShipperOrderStatusRequest,
  ): Promise<ShipperOrderRecord>;
  reportOrderException(
    orderId: string,
    actorUserId: string,
    input: ReportShipperOrderExceptionRequest,
  ): Promise<ShipperOrderRecord>;
  submitOrderChangeRequest(
    orderId: string,
    actorUserId: string,
    input: SubmitShipperOrderChangeRequest,
  ): Promise<ShipperOrderRecord>;
  submitOrderEvaluation(
    orderId: string,
    actorUserId: string,
    input: SubmitShipperOrderEvaluationRequest,
  ): Promise<ShipperOrderRecord>;
  listDriverOrderHall(
    query: DriverOrderHallQuery,
  ): Promise<{ items: ShipperOrderRecord[]; total: number }>;
  submitDriverQuote(
    orderId: string,
    driverId: string,
    input: DriverQuoteOrderEventPayload,
  ): Promise<ShipperOrderRecord>;
  acceptDriverOrder(
    orderId: string,
    driverId: string,
    input: DriverAcceptOrderEventPayload,
  ): Promise<ShipperOrderRecord>;
  listDriverAcceptedOrders(
    driverId: string,
    query: DriverMyOrdersQuery,
  ): Promise<{ items: ShipperOrderRecord[]; total: number }>;
  listDriverCompletedOrders(driverId: string): Promise<ShipperOrderRecord[]>;
  listDriverPendingSettlementOrders(
    driverId: string,
  ): Promise<ShipperOrderRecord[]>;
  findDriverAcceptedOrder(
    driverId: string,
    orderId: string,
  ): Promise<ShipperOrderRecord | undefined>;
  advanceDriverOrderStatus(
    orderId: string,
    driverId: string,
    input: DriverAdvanceOrderStatusRequest,
  ): Promise<ShipperOrderRecord>;
  replyToOrderEvaluation(
    orderId: string,
    driverId: string,
    input: DriverReplyEvaluationRequest,
  ): Promise<ShipperOrderRecord>;
  evaluateShipper(
    orderId: string,
    driverId: string,
    input: DriverEvaluateShipperRequest,
  ): Promise<ShipperOrderRecord>;
}

export class InMemoryOrdersRepository implements OrdersRepository {
  private readonly orders: ShipperOrderRecord[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  async createOrder(
    shipperId: string,
    input: CreateShipperOrderRequest,
  ): Promise<ShipperOrderRecord> {
    const sequence = this.orders.length + 1;
    const nowIso = this.now().toISOString();
    const order: ShipperOrderRecord = {
      ...input,
      cargoPhotoCount: getOrderCargoPhotoCount(input),
      id: `order-${sequence}`,
      orderNo: `HY${formatOrderDate(this.now())}${String(sequence).padStart(4, '0')}`,
      shipperId,
      status: 'waiting',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      events: [
        {
          id: `event-${sequence}`,
          eventType: 'created',
          noteText: '货主发布订单',
          attachmentFileIds: input.cargoPhotoFileIds,
          createdAtIso: nowIso,
        },
      ],
    };

    this.orders.push(order);

    return order;
  }

  async listOrders(shipperId: string, query: ListShipperOrdersQuery) {
    const matchedOrders = this.orders.filter(order => {
      return (
        order.shipperId === shipperId &&
        isOrderMatchedByStatus(order, query) &&
        isOrderInCreatedRange(order, query) &&
        isOrderMatchedByKeyword(order, query.keyword)
      );
    });
    const startIndex = (query.page - 1) * query.pageSize;

    return {
      items: matchedOrders.slice(startIndex, startIndex + query.pageSize),
      total: matchedOrders.length,
    };
  }

  async listAdminOrdersForAttachmentAudit(
    query: AdminOrderAttachmentAuditListQuery,
  ) {
    return this.orders.filter(order => {
      return (
        isOrderInCreatedRange(order, query) &&
        isOrderMatchedByKeyword(order, query.keyword)
      );
    });
  }

  async findOrderById(orderId: string) {
    return this.orders.find(order => order.id === orderId);
  }

  async updateOrder(
    orderId: string,
    _actorUserId: string,
    input: CreateShipperOrderRequest,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    Object.assign(order, input, {
      cargoPhotoCount: getOrderCargoPhotoCount(input),
      updatedAtIso: nowIso,
    });
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      eventType: 'updated',
      noteText: '货主修改订单',
      attachmentFileIds: input.cargoPhotoFileIds,
      createdAtIso: nowIso,
    });

    return order;
  }

  async cancelOrder(
    orderId: string,
    _actorUserId: string,
    input: CancelShipperOrderRequest,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.status = 'cancelled';
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      eventType: 'cancelled',
      noteText: createOrderCancellationNote(input),
      createdAtIso: nowIso,
    });

    return order;
  }

  async completeOrder(orderId: string, _actorUserId: string) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.status = 'completed';
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      eventType: 'completed',
      noteText: '货主确认送达',
      createdAtIso: nowIso,
    });

    return order;
  }

  async advanceOrderStatus(
    orderId: string,
    _actorUserId: string,
    input: AdvanceShipperOrderStatusRequest,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.status = input.nextStatus;
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      eventType: 'status_changed',
      noteText: createOrderStatusAdvanceNote(input.nextStatus),
      createdAtIso: nowIso,
    });

    return order;
  }

  async reportOrderException(
    orderId: string,
    _actorUserId: string,
    input: ReportShipperOrderExceptionRequest,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      eventType: 'exception_reported',
      noteText: createOrderExceptionNote(input),
      attachmentFileIds: input.photoFileIds,
      createdAtIso: nowIso,
    });

    return order;
  }

  async submitOrderChangeRequest(
    orderId: string,
    _actorUserId: string,
    input: SubmitShipperOrderChangeRequest,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      eventType: 'change_requested',
      noteText: input.description,
      createdAtIso: nowIso,
    });

    return order;
  }

  async submitOrderEvaluation(
    orderId: string,
    _actorUserId: string,
    input: SubmitShipperOrderEvaluationRequest,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      eventType: 'evaluation_submitted',
      noteText: createOrderEvaluationNote(input),
      attachmentFileIds: input.photoFileIds,
      createdAtIso: nowIso,
    });

    return order;
  }

  async listDriverOrderHall(query: DriverOrderHallQuery) {
    const matchedOrders = this.orders.filter(order => order.status === 'waiting');
    const startIndex = (query.page - 1) * query.pageSize;

    return {
      items: matchedOrders.slice(startIndex, startIndex + query.pageSize),
      total: matchedOrders.length,
    };
  }

  async submitDriverQuote(
    orderId: string,
    driverId: string,
    input: DriverQuoteOrderEventPayload,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      actorUserId: driverId,
      eventType: 'driver_quote_submitted',
      noteText: JSON.stringify(input),
      createdAtIso: nowIso,
    });

    return order;
  }

  async acceptDriverOrder(
    orderId: string,
    driverId: string,
    input: DriverAcceptOrderEventPayload,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.status = 'loading';
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      actorUserId: driverId,
      eventType: 'driver_accepted',
      noteText: serializeDriverAcceptOrderEventPayload(input),
      createdAtIso: nowIso,
    });

    return order;
  }

  async listDriverAcceptedOrders(driverId: string, query: DriverMyOrdersQuery) {
    const matchedOrders = this.orders.filter(
      order =>
        query.statuses.includes(
          order.status as DriverMyOrdersQuery['statuses'][number],
        ) && isOrderAcceptedByDriver(order, driverId),
    );
    const startIndex = (query.page - 1) * query.pageSize;

    return {
      items: matchedOrders.slice(startIndex, startIndex + query.pageSize),
      total: matchedOrders.length,
    };
  }

  async listDriverCompletedOrders(driverId: string) {
    return this.orders
      .filter(
        order => order.status === 'completed' && isOrderAcceptedByDriver(order, driverId),
      )
      .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso));
  }

  async listDriverPendingSettlementOrders(driverId: string) {
    return this.orders
      .filter(
        order =>
          ['loading', 'transporting', 'confirming'].includes(order.status) &&
          isOrderAcceptedByDriver(order, driverId),
      )
      .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso));
  }

  async findDriverAcceptedOrder(driverId: string, orderId: string) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    return order && isOrderAcceptedByDriver(order, driverId) ? order : undefined;
  }

  async advanceDriverOrderStatus(
    orderId: string,
    driverId: string,
    input: DriverAdvanceOrderStatusRequest,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.status = input.nextStatus;
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      actorUserId: driverId,
      eventType: 'driver_status_changed',
      noteText: createDriverStatusAdvanceNote(input.nextStatus),
      attachmentFileIds: input.receiptPhotoFileIds ?? [],
      createdAtIso: nowIso,
    });

    return order;
  }

  async replyToOrderEvaluation(
    orderId: string,
    driverId: string,
    input: DriverReplyEvaluationRequest,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      actorUserId: driverId,
      eventType: 'evaluation_replied',
      noteText: input.content,
      createdAtIso: nowIso,
    });

    return order;
  }

  async evaluateShipper(
    orderId: string,
    driverId: string,
    input: DriverEvaluateShipperRequest,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      actorUserId: driverId,
      eventType: 'shipper_evaluation_submitted',
      noteText: createOrderEvaluationNote(input),
      createdAtIso: nowIso,
    });

    return order;
  }
}

export type PrismaOrderRecord = {
  id: string;
  orderNo: string;
  shipperId: string;
  status: ShipperOrderRecord['status'];
  pricingMode: ShipperOrderRecord['pricingMode'];
  priceCents: number | null;
  payablePriceCents: number | null;
  paymentMethod: ShipperOrderRecord['paymentMethod'];
  couponId: string | null;
  couponTitle: string | null;
  couponDiscountCents: number | null;
  pickupTime: Date;
  expectedDeliveryText: string | null;
  createdAt: Date;
  updatedAt: Date;
  cargo: {
    cargoType: string;
    weightText: string;
    volumeText: string | null;
    quantityText: string;
    description: string | null;
    cargoPhotoCount: number;
    cargoPhotoFileIds: unknown;
  } | null;
  locations: Array<{
    type: string;
    address: string;
    contactName: string;
    contactPhone: string;
    noteText: string | null;
  }>;
  requirement: {
    vehicleType: string;
    vehicleLengthText: string | null;
    needTailboard: boolean;
    needTarp: boolean;
    valueAddedServicesText: string | null;
  } | null;
  events: Array<{
    id: string;
    actorUserId: string;
    eventType: string;
    noteText: string | null;
    attachmentFileIds: unknown;
    createdAt: Date;
  }>;
};

export type PrismaOrdersClient = {
  order: {
    count(args: {
      where: PrismaOrderWhere;
    }): Promise<number>;
    create(args: {
      data: unknown;
      include: typeof orderInclude;
    }): Promise<PrismaOrderRecord>;
    findMany(args: {
      where: PrismaOrderWhere;
      include: typeof orderInclude;
      orderBy: { createdAt: 'desc' } | { updatedAt: 'desc' };
      skip?: number;
      take?: number;
    }): Promise<PrismaOrderRecord[]>;
    findUnique(args: {
      where: { id: string };
      include: typeof orderInclude;
    }): Promise<PrismaOrderRecord | null>;
    update(args: {
      where: { id: string };
      data: unknown;
      include: typeof orderInclude;
    }): Promise<PrismaOrderRecord>;
  };
};

type PrismaOrderWhere = {
  shipperId?: string;
  status?:
    | ShipperOrderRecord['status']
    | { in: ShipperOrderRecord['status'][] };
  createdAt?: {
    gte?: Date;
    lt?: Date;
  };
  events?: {
    some: {
      actorUserId: string;
      eventType: string;
    };
  };
  OR?: Array<Record<string, unknown>>;
};

const orderInclude = {
  cargo: true,
  locations: true,
  requirement: true,
  events: {
    orderBy: {
      createdAt: 'asc',
    },
  },
} as const;

export class PrismaOrdersRepository implements OrdersRepository {
  constructor(
    private readonly prisma: PrismaOrdersClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createOrder(
    shipperId: string,
    input: CreateShipperOrderRequest,
  ): Promise<ShipperOrderRecord> {
    const now = this.now();
    const orderNo = await this.createOrderNo(shipperId, now);
    const order = await this.prisma.order.create({
      data: {
        orderNo,
        shipperId,
        status: 'waiting',
        pricingMode: input.pricingMode,
        priceCents: input.priceCents,
        payablePriceCents: input.payablePriceCents,
        paymentMethod: input.paymentMethod,
        couponId: input.couponId,
        couponTitle: input.couponTitle,
        couponDiscountCents: input.couponDiscountCents,
        pickupTime: new Date(input.pickupTimeIso),
        expectedDeliveryText: input.expectedDeliveryTimeText,
        cargo: {
          create: {
            cargoType: input.cargoType,
            weightText: input.weightText,
            volumeText: input.volumeText,
            quantityText: input.quantityText,
            description: input.cargoDescription,
            cargoPhotoCount: getOrderCargoPhotoCount(input),
            cargoPhotoFileIds: input.cargoPhotoFileIds ?? [],
          },
        },
        locations: {
          create: [
            {
              type: 'pickup',
              address: input.pickupAddress,
              contactName: input.pickupContact,
              contactPhone: input.pickupPhone,
              noteText: input.pickupNoteText,
            },
            {
              type: 'delivery',
              address: input.deliveryAddress,
              contactName: input.deliveryContact,
              contactPhone: input.deliveryPhone,
              noteText: input.deliveryNoteText,
            },
          ],
        },
        requirement: {
          create: {
            vehicleType: input.vehicleRequirement,
            vehicleLengthText: input.vehicleLengthText,
            needTailboard: input.needTailboard,
            needTarp: input.needTarp,
            valueAddedServicesText: input.valueAddedServicesText,
          },
        },
        events: {
          create: {
            actorUserId: shipperId,
            eventType: 'created',
            noteText: '货主发布订单',
            attachmentFileIds: input.cargoPhotoFileIds ?? [],
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async listOrders(shipperId: string, query: ListShipperOrdersQuery) {
    const where = createPrismaOrderListWhere(shipperId, query);
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({
        where,
      }),
    ]);

    return {
      items: items.map(mapPrismaOrder),
      total,
    };
  }

  async findOrderById(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: orderInclude,
    });

    return order ? mapPrismaOrder(order) : undefined;
  }

  async listAdminOrdersForAttachmentAudit(
    query: AdminOrderAttachmentAuditListQuery,
  ) {
    const orders = await this.prisma.order.findMany({
      where: {
        ...createPrismaCreatedAtFilter(query),
        ...createPrismaKeywordFilter(query.keyword),
      },
      include: orderInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return orders.map(mapPrismaOrder);
  }

  async updateOrder(
    orderId: string,
    actorUserId: string,
    input: CreateShipperOrderRequest,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        pricingMode: input.pricingMode,
        priceCents: input.priceCents ?? null,
        payablePriceCents: input.payablePriceCents ?? null,
        paymentMethod: input.paymentMethod,
        couponId: input.couponId ?? null,
        couponTitle: input.couponTitle ?? null,
        couponDiscountCents: input.couponDiscountCents ?? null,
        pickupTime: new Date(input.pickupTimeIso),
        expectedDeliveryText: input.expectedDeliveryTimeText ?? null,
        cargo: {
          upsert: {
            create: {
              cargoType: input.cargoType,
              weightText: input.weightText,
              volumeText: input.volumeText ?? null,
              quantityText: input.quantityText,
              description: input.cargoDescription ?? null,
              cargoPhotoCount: getOrderCargoPhotoCount(input),
              cargoPhotoFileIds: input.cargoPhotoFileIds ?? [],
            },
            update: {
              cargoType: input.cargoType,
              weightText: input.weightText,
              volumeText: input.volumeText ?? null,
              quantityText: input.quantityText,
              description: input.cargoDescription ?? null,
              cargoPhotoCount: getOrderCargoPhotoCount(input),
              cargoPhotoFileIds: input.cargoPhotoFileIds ?? [],
            },
          },
        },
        locations: {
          updateMany: [
            {
              where: {
                type: 'pickup',
              },
              data: {
                address: input.pickupAddress,
                contactName: input.pickupContact,
                contactPhone: input.pickupPhone,
                noteText: input.pickupNoteText ?? null,
              },
            },
            {
              where: {
                type: 'delivery',
              },
              data: {
                address: input.deliveryAddress,
                contactName: input.deliveryContact,
                contactPhone: input.deliveryPhone,
                noteText: input.deliveryNoteText ?? null,
              },
            },
          ],
        },
        requirement: {
          upsert: {
            create: {
              vehicleType: input.vehicleRequirement,
              vehicleLengthText: input.vehicleLengthText ?? null,
              needTailboard: input.needTailboard,
              needTarp: input.needTarp,
              valueAddedServicesText: input.valueAddedServicesText ?? null,
            },
            update: {
              vehicleType: input.vehicleRequirement,
              vehicleLengthText: input.vehicleLengthText ?? null,
              needTailboard: input.needTailboard,
              needTarp: input.needTarp,
              valueAddedServicesText: input.valueAddedServicesText ?? null,
            },
          },
        },
        events: {
          create: {
            actorUserId,
            eventType: 'updated',
            noteText: '货主修改订单',
            attachmentFileIds: input.cargoPhotoFileIds ?? [],
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async cancelOrder(
    orderId: string,
    actorUserId: string,
    input: CancelShipperOrderRequest,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        status: 'cancelled',
        events: {
          create: {
            actorUserId,
            eventType: 'cancelled',
            noteText: createOrderCancellationNote(input),
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async completeOrder(orderId: string, actorUserId: string) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        status: 'completed',
        events: {
          create: {
            actorUserId,
            eventType: 'completed',
            noteText: '货主确认送达',
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async advanceOrderStatus(
    orderId: string,
    actorUserId: string,
    input: AdvanceShipperOrderStatusRequest,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        status: input.nextStatus,
        events: {
          create: {
            actorUserId,
            eventType: 'status_changed',
            noteText: createOrderStatusAdvanceNote(input.nextStatus),
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async reportOrderException(
    orderId: string,
    actorUserId: string,
    input: ReportShipperOrderExceptionRequest,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        events: {
          create: {
            actorUserId,
            eventType: 'exception_reported',
            noteText: createOrderExceptionNote(input),
            attachmentFileIds: input.photoFileIds ?? [],
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async submitOrderChangeRequest(
    orderId: string,
    actorUserId: string,
    input: SubmitShipperOrderChangeRequest,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        events: {
          create: {
            actorUserId,
            eventType: 'change_requested',
            noteText: input.description,
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async submitOrderEvaluation(
    orderId: string,
    actorUserId: string,
    input: SubmitShipperOrderEvaluationRequest,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        events: {
          create: {
            actorUserId,
            eventType: 'evaluation_submitted',
            noteText: createOrderEvaluationNote(input),
            attachmentFileIds: input.photoFileIds ?? [],
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async listDriverOrderHall(query: DriverOrderHallQuery) {
    const where: PrismaOrderWhere = {
      status: 'waiting',
    };

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({
        where,
      }),
    ]);

    return {
      items: items.map(mapPrismaOrder),
      total,
    };
  }

  async submitDriverQuote(
    orderId: string,
    driverId: string,
    input: DriverQuoteOrderEventPayload,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        events: {
          create: {
            actorUserId: driverId,
            eventType: 'driver_quote_submitted',
            noteText: JSON.stringify(input),
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async acceptDriverOrder(
    orderId: string,
    driverId: string,
    input: DriverAcceptOrderEventPayload,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        status: 'loading',
        events: {
          create: {
            actorUserId: driverId,
            eventType: 'driver_accepted',
            noteText: serializeDriverAcceptOrderEventPayload(input),
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async listDriverAcceptedOrders(driverId: string, query: DriverMyOrdersQuery) {
    const where: PrismaOrderWhere = {
      status: {
        in: query.statuses,
      },
      events: {
        some: {
          actorUserId: driverId,
          eventType: 'driver_accepted',
        },
      },
    };

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({
        where,
      }),
    ]);

    return {
      items: items.map(mapPrismaOrder),
      total,
    };
  }

  async listDriverCompletedOrders(driverId: string) {
    const items = await this.prisma.order.findMany({
      where: {
        status: 'completed',
        events: {
          some: {
            actorUserId: driverId,
            eventType: 'driver_accepted',
          },
        },
      },
      include: orderInclude,
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return items.map(mapPrismaOrder);
  }

  async listDriverPendingSettlementOrders(driverId: string) {
    const items = await this.prisma.order.findMany({
      where: {
        status: {
          in: ['loading', 'transporting', 'confirming'],
        },
        events: {
          some: {
            actorUserId: driverId,
            eventType: 'driver_accepted',
          },
        },
      },
      include: orderInclude,
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return items.map(mapPrismaOrder);
  }

  async findDriverAcceptedOrder(driverId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: orderInclude,
    });

    if (!order) {
      return undefined;
    }

    const mappedOrder = mapPrismaOrder(order);

    return isOrderAcceptedByDriver(mappedOrder, driverId)
      ? mappedOrder
      : undefined;
  }

  async advanceDriverOrderStatus(
    orderId: string,
    driverId: string,
    input: DriverAdvanceOrderStatusRequest,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        status: input.nextStatus,
        events: {
          create: {
            actorUserId: driverId,
            eventType: 'driver_status_changed',
            noteText: createDriverStatusAdvanceNote(input.nextStatus),
            attachmentFileIds: input.receiptPhotoFileIds ?? [],
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async replyToOrderEvaluation(
    orderId: string,
    driverId: string,
    input: DriverReplyEvaluationRequest,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        events: {
          create: {
            actorUserId: driverId,
            eventType: 'evaluation_replied',
            noteText: input.content,
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async evaluateShipper(
    orderId: string,
    driverId: string,
    input: DriverEvaluateShipperRequest,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        events: {
          create: {
            actorUserId: driverId,
            eventType: 'shipper_evaluation_submitted',
            noteText: createOrderEvaluationNote(input),
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  private async createOrderNo(shipperId: string, now: Date) {
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const dailyCount = await this.prisma.order.count({
      where: {
        shipperId,
        createdAt: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
    });

    return `HY${formatOrderDate(now)}${String(dailyCount + 1).padStart(4, '0')}`;
  }
}

function createPrismaOrderListWhere(
  shipperId: string,
  query: ListShipperOrdersQuery,
): PrismaOrderWhere {
  return {
    shipperId,
    ...createPrismaStatusFilter(query),
    ...createPrismaCreatedAtFilter(query),
    ...createPrismaKeywordFilter(query.keyword),
  };
}

function createPrismaStatusFilter(query: ListShipperOrdersQuery) {
  if (query.status) {
    return {
      status: query.status,
    };
  }

  if (query.statuses?.length) {
    return {
      status: {
        in: query.statuses,
      },
    };
  }

  return {};
}

function createPrismaCreatedAtFilter(query: ListShipperOrdersQuery) {
  if (!query.createdFromIso && !query.createdToIso) {
    return {};
  }

  return {
    createdAt: {
      ...(query.createdFromIso
        ? { gte: new Date(query.createdFromIso) }
        : {}),
      ...(query.createdToIso ? { lt: new Date(query.createdToIso) } : {}),
    },
  };
}

function createPrismaKeywordFilter(keyword?: string) {
  if (!keyword) {
    return {};
  }

  const contains = {
    contains: keyword,
    mode: 'insensitive',
  };

  return {
    OR: [
      { orderNo: contains },
      {
        cargo: {
          is: {
            OR: [
              { cargoType: contains },
              { weightText: contains },
              { quantityText: contains },
              { description: contains },
            ],
          },
        },
      },
      {
        locations: {
          some: {
            OR: [
              { address: contains },
              { contactName: contains },
              { contactPhone: contains },
              { noteText: contains },
            ],
          },
        },
      },
      {
        requirement: {
          is: {
            OR: [
              { vehicleType: contains },
              { vehicleLengthText: contains },
              { valueAddedServicesText: contains },
            ],
          },
        },
      },
    ],
  };
}

function isOrderInCreatedRange(
  order: ShipperOrderRecord,
  query: ListShipperOrdersQuery,
) {
  const createdAt = Date.parse(order.createdAtIso);

  if (
    query.createdFromIso &&
    createdAt < Date.parse(query.createdFromIso)
  ) {
    return false;
  }

  if (query.createdToIso && createdAt >= Date.parse(query.createdToIso)) {
    return false;
  }

  return true;
}

function isOrderMatchedByStatus(
  order: ShipperOrderRecord,
  query: ListShipperOrdersQuery,
) {
  if (query.status) {
    return order.status === query.status;
  }

  if (query.statuses?.length) {
    return query.statuses.includes(order.status);
  }

  return true;
}

function isOrderMatchedByKeyword(
  order: ShipperOrderRecord,
  keyword?: string,
) {
  if (!keyword) {
    return true;
  }

  const normalizedKeyword = keyword.toLocaleLowerCase();
  const searchableText = [
    order.orderNo,
    order.cargoType,
    order.weightText,
    order.volumeText,
    order.quantityText,
    order.cargoDescription,
    order.pickupAddress,
    order.pickupNoteText,
    order.pickupContact,
    order.pickupPhone,
    order.deliveryAddress,
    order.deliveryNoteText,
    order.deliveryContact,
    order.deliveryPhone,
    order.vehicleRequirement,
    order.vehicleLengthText,
    order.valueAddedServicesText,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLocaleLowerCase();

  return searchableText.includes(normalizedKeyword);
}

function mapPrismaOrder(order: PrismaOrderRecord): ShipperOrderRecord {
  const pickupLocation = order.locations.find(
    location => location.type === 'pickup',
  );
  const deliveryLocation = order.locations.find(
    location => location.type === 'delivery',
  );
  const isFixedPrice = order.pricingMode === 'fixed';

  return {
    id: order.id,
    orderNo: order.orderNo,
    shipperId: order.shipperId,
    status: order.status,
    cargoType: order.cargo?.cargoType ?? '',
    weightText: order.cargo?.weightText ?? '',
    volumeText: order.cargo?.volumeText ?? undefined,
    quantityText: order.cargo?.quantityText ?? '',
    cargoDescription: order.cargo?.description ?? undefined,
    cargoPhotoCount: order.cargo?.cargoPhotoCount ?? 0,
    cargoPhotoFileIds: parseAttachmentFileIds(
      order.cargo?.cargoPhotoFileIds ?? [],
    ),
    pickupAddress: pickupLocation?.address ?? '',
    pickupNoteText: pickupLocation?.noteText ?? undefined,
    pickupContact: pickupLocation?.contactName ?? '',
    pickupPhone: pickupLocation?.contactPhone ?? '',
    deliveryAddress: deliveryLocation?.address ?? '',
    deliveryNoteText: deliveryLocation?.noteText ?? undefined,
    deliveryContact: deliveryLocation?.contactName ?? '',
    deliveryPhone: deliveryLocation?.contactPhone ?? '',
    vehicleRequirement: order.requirement?.vehicleType ?? '',
    vehicleLengthText: order.requirement?.vehicleLengthText ?? undefined,
    needTailboard: order.requirement?.needTailboard ?? false,
    needTarp: order.requirement?.needTarp ?? false,
    pickupTimeIso: order.pickupTime.toISOString(),
    expectedDeliveryTimeText: order.expectedDeliveryText ?? undefined,
    valueAddedServicesText:
      order.requirement?.valueAddedServicesText ?? undefined,
    pricingMode: order.pricingMode,
    priceCents: isFixedPrice ? (order.priceCents ?? undefined) : undefined,
    paymentMethod: order.paymentMethod,
    couponId: isFixedPrice ? (order.couponId ?? undefined) : undefined,
    couponTitle: isFixedPrice ? (order.couponTitle ?? undefined) : undefined,
    couponDiscountCents: isFixedPrice
      ? (order.couponDiscountCents ?? undefined)
      : undefined,
    payablePriceCents: isFixedPrice
      ? (order.payablePriceCents ?? undefined)
      : undefined,
    createdAtIso: order.createdAt.toISOString(),
    updatedAtIso: order.updatedAt.toISOString(),
    events: order.events.map(mapPrismaOrderEvent),
  };
}

function mapPrismaOrderEvent(
  event: PrismaOrderRecord['events'][number],
): ShipperOrderEventRecord {
  return {
    id: event.id,
    actorUserId: event.actorUserId,
    eventType: event.eventType,
    noteText: event.noteText ?? undefined,
    attachmentFileIds: parseAttachmentFileIds(event.attachmentFileIds),
    createdAtIso: event.createdAt.toISOString(),
  };
}

function parseAttachmentFileIds(value: unknown) {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
    ? value
    : undefined;
}

function getOrderCargoPhotoCount(input: CreateShipperOrderRequest) {
  return input.cargoPhotoFileIds?.length ?? input.cargoPhotoCount ?? 0;
}

function createOrderCancellationNote(input: CancelShipperOrderRequest) {
  return input.description
    ? `${input.reasonText}：${input.description}`
    : input.reasonText;
}

function createOrderStatusAdvanceNote(
  nextStatus: AdvanceShipperOrderStatusRequest['nextStatus'],
) {
  const noteTextByStatus = {
    loading: '订单进入待装货',
    transporting: '订单进入运输中',
    confirming: '订单进入待确认',
  };

  return noteTextByStatus[nextStatus];
}

function createDriverStatusAdvanceNote(
  nextStatus: DriverAdvanceOrderStatusRequest['nextStatus'],
) {
  const noteTextByStatus = {
    transporting: '司机确认发车',
    confirming: '司机确认到达',
  };

  return noteTextByStatus[nextStatus];
}

function serializeDriverAcceptOrderEventPayload(
  input: DriverAcceptOrderEventPayload,
) {
  if (!input.driverSnapshot) {
    return input.noteText;
  }

  return JSON.stringify({
    ...(input.noteText ? { noteText: input.noteText } : {}),
    driverSnapshot: input.driverSnapshot,
  });
}

function isOrderAcceptedByDriver(order: ShipperOrderRecord, driverId: string) {
  return order.events.some(
    event =>
      event.actorUserId === driverId && event.eventType === 'driver_accepted',
  );
}

function createOrderExceptionNote(input: ReportShipperOrderExceptionRequest) {
  const photoCount = getOrderEventPhotoCount(input);
  const photoText =
    photoCount > 0
      ? `；图片凭证 ${photoCount} 张`
      : '';

  return `${input.typeLabel}：${input.description}${photoText}`;
}

function createOrderEvaluationNote(input: SubmitShipperOrderEvaluationRequest) {
  const anonymousText = input.anonymous ? '；匿名评价' : '';
  const photoCount = getOrderEventPhotoCount(input);
  const photoText =
    photoCount > 0
      ? `；图片凭证 ${photoCount} 张`
      : '';

  return `${input.rating} 星：${input.tags.join('、')}${anonymousText}${photoText}；${input.content}`;
}

function getOrderEventPhotoCount(input: {
  photoCount?: number;
  photoFileIds?: string[];
}) {
  return input.photoFileIds?.length ?? input.photoCount ?? 0;
}

function formatOrderDate(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}${String(date.getDate()).padStart(2, '0')}`;
}
