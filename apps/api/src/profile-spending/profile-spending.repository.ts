import type { ShipperSpendingFinancialRecord } from './dto';

export interface ProfileSpendingRepository {
  listFinancialRecords(
    shipperId: string,
  ): Promise<ShipperSpendingFinancialRecord[]>;
}

export class InMemoryProfileSpendingRepository
  implements ProfileSpendingRepository
{
  private readonly financialRecords: ShipperSpendingFinancialRecord[];

  constructor(
    seed: { financialRecords?: ShipperSpendingFinancialRecord[] } = {},
  ) {
    this.financialRecords = structuredClone(seed.financialRecords ?? []);
  }

  async listFinancialRecords(shipperId: string) {
    return this.financialRecords
      .filter(record => record.shipperId === shipperId)
      .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso));
  }
}

export type PrismaProfileSpendingOrderRecord = {
  id: string;
  shipperId: string;
  orderNo: string;
  status: ShipperSpendingFinancialRecord['status'];
  paymentMethod: ShipperSpendingFinancialRecord['paymentMethod'];
  paymentStatus: ShipperSpendingFinancialRecord['paymentStatus'];
  priceCents: number | null;
  payablePriceCents: number | null;
  couponTitle: string | null;
  couponDiscountCents: number | null;
  updatedAt: Date;
  locations: Array<{
    type: string;
    address: string;
  }>;
  paymentOrders: Array<{
    channel: NonNullable<ShipperSpendingFinancialRecord['payment']>['channel'];
    amountCents: number;
    status: NonNullable<ShipperSpendingFinancialRecord['payment']>['status'];
    paidAt: Date | null;
    createdAt: Date;
  }>;
  settlement: {
    grossAmountCents: number;
    settledAt: Date;
  } | null;
  refunds: Array<{
    amountCents: number;
    status: NonNullable<ShipperSpendingFinancialRecord['refund']>['status'];
    succeededAt: Date | null;
    failedAt: Date | null;
    updatedAt: Date;
  }>;
};

export type PrismaProfileSpendingClient = {
  order: {
    findMany(args: {
      where: { shipperId: string };
      select: {
        id: true;
        shipperId: true;
        orderNo: true;
        status: true;
        paymentMethod: true;
        paymentStatus: true;
        priceCents: true;
        payablePriceCents: true;
        couponTitle: true;
        couponDiscountCents: true;
        updatedAt: true;
        locations: {
          select: {
            type: true;
            address: true;
          };
        };
        paymentOrders: {
          select: {
            channel: true;
            amountCents: true;
            status: true;
            paidAt: true;
            createdAt: true;
          };
          orderBy: { createdAt: 'desc' };
          take: 1;
        };
        settlement: {
          select: {
            grossAmountCents: true;
            settledAt: true;
          };
        };
        refunds: {
          select: {
            amountCents: true;
            status: true;
            succeededAt: true;
            failedAt: true;
            updatedAt: true;
          };
          orderBy: { createdAt: 'desc' };
          take: 1;
        };
      };
      orderBy: { updatedAt: 'desc' };
    }): Promise<PrismaProfileSpendingOrderRecord[]>;
  };
};

export class PrismaProfileSpendingRepository
  implements ProfileSpendingRepository
{
  constructor(private readonly prisma: PrismaProfileSpendingClient) {}

  async listFinancialRecords(shipperId: string) {
    const orders = await this.prisma.order.findMany({
      where: { shipperId },
      select: {
        id: true,
        shipperId: true,
        orderNo: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        priceCents: true,
        payablePriceCents: true,
        couponTitle: true,
        couponDiscountCents: true,
        updatedAt: true,
        locations: {
          select: {
            type: true,
            address: true,
          },
        },
        paymentOrders: {
          select: {
            channel: true,
            amountCents: true,
            status: true,
            paidAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        settlement: {
          select: {
            grossAmountCents: true,
            settledAt: true,
          },
        },
        refunds: {
          select: {
            amountCents: true,
            status: true,
            succeededAt: true,
            failedAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return orders.map(mapPrismaSpendingOrder);
  }
}

function mapPrismaSpendingOrder(
  order: PrismaProfileSpendingOrderRecord,
): ShipperSpendingFinancialRecord {
  const pickupLocation = order.locations.find(
    location => location.type === 'pickup',
  );
  const deliveryLocation = order.locations.find(
    location => location.type === 'delivery',
  );
  const payment = order.paymentOrders[0];
  const refund = order.refunds[0];

  return {
    id: order.id,
    shipperId: order.shipperId,
    orderNo: order.orderNo,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    ...(order.priceCents !== null ? { priceCents: order.priceCents } : {}),
    ...(order.payablePriceCents !== null
      ? { payablePriceCents: order.payablePriceCents }
      : {}),
    ...(order.couponTitle ? { couponTitle: order.couponTitle } : {}),
    ...(order.couponDiscountCents !== null
      ? { couponDiscountCents: order.couponDiscountCents }
      : {}),
    updatedAtIso: order.updatedAt.toISOString(),
    pickupAddress: pickupLocation?.address ?? '',
    deliveryAddress: deliveryLocation?.address ?? '',
    ...(payment
      ? {
          payment: {
            channel: payment.channel,
            amountCents: payment.amountCents,
            status: payment.status,
            ...(payment.paidAt
              ? { paidAtIso: payment.paidAt.toISOString() }
              : {}),
            createdAtIso: payment.createdAt.toISOString(),
          },
        }
      : {}),
    ...(order.settlement
      ? {
          settlement: {
            grossAmountCents: order.settlement.grossAmountCents,
            settledAtIso: order.settlement.settledAt.toISOString(),
          },
        }
      : {}),
    ...(refund
      ? {
          refund: {
            amountCents: refund.amountCents,
            status: refund.status,
            ...(refund.succeededAt
              ? { succeededAtIso: refund.succeededAt.toISOString() }
              : {}),
            ...(refund.failedAt
              ? { failedAtIso: refund.failedAt.toISOString() }
              : {}),
            updatedAtIso: refund.updatedAt.toISOString(),
          },
        }
      : {}),
  };
}
