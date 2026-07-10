import type { ShipperSpendingOrderRecord } from './dto';

export interface ProfileSpendingRepository {
  listOrders(shipperId: string): Promise<ShipperSpendingOrderRecord[]>;
}

export class InMemoryProfileSpendingRepository
  implements ProfileSpendingRepository
{
  private readonly orders: ShipperSpendingOrderRecord[];

  constructor(seed: { orders?: ShipperSpendingOrderRecord[] } = {}) {
    this.orders = [...(seed.orders ?? [])];
  }

  async listOrders(shipperId: string) {
    return this.orders
      .filter(order => order.shipperId === shipperId)
      .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso));
  }
}

export type PrismaProfileSpendingOrderRecord = {
  id: string;
  shipperId: string;
  orderNo: string;
  status: ShipperSpendingOrderRecord['status'];
  paymentMethod: ShipperSpendingOrderRecord['paymentMethod'];
  priceCents: number | null;
  payablePriceCents: number | null;
  couponTitle: string | null;
  couponDiscountCents: number | null;
  updatedAt: Date;
  locations: Array<{
    type: string;
    address: string;
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
      };
      orderBy: { updatedAt: 'desc' };
    }): Promise<PrismaProfileSpendingOrderRecord[]>;
  };
};

export class PrismaProfileSpendingRepository
  implements ProfileSpendingRepository
{
  constructor(private readonly prisma: PrismaProfileSpendingClient) {}

  async listOrders(shipperId: string) {
    const orders = await this.prisma.order.findMany({
      where: { shipperId },
      select: {
        id: true,
        shipperId: true,
        orderNo: true,
        status: true,
        paymentMethod: true,
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
      },
      orderBy: { updatedAt: 'desc' },
    });

    return orders.map(mapPrismaSpendingOrder);
  }
}

function mapPrismaSpendingOrder(
  order: PrismaProfileSpendingOrderRecord,
): ShipperSpendingOrderRecord {
  const pickupLocation = order.locations.find(
    location => location.type === 'pickup',
  );
  const deliveryLocation = order.locations.find(
    location => location.type === 'delivery',
  );

  return {
    id: order.id,
    shipperId: order.shipperId,
    orderNo: order.orderNo,
    status: order.status,
    paymentMethod: order.paymentMethod,
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
  };
}
