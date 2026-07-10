import type {
  ShipperSpendingOrderRecord,
  ShipperSpendingRecord,
  ShipperSpendingSnapshot,
  ShipperSpendingSummary,
} from './dto';
import type { ProfileSpendingRepository } from './profile-spending.repository';

const ACTIVE_ORDER_STATUSES = new Set(['loading', 'transporting', 'confirming']);

export class ProfileSpendingService {
  constructor(private readonly repository: ProfileSpendingRepository) {}

  async listRecords(shipperId: string): Promise<ShipperSpendingSnapshot> {
    const items = (await this.repository.listOrders(shipperId))
      .map(createSpendingRecord)
      .filter(
        (item): item is ShipperSpendingRecord =>
          item !== undefined,
      );

    return {
      shipperId,
      summary: createSpendingSummary(items),
      items,
    };
  }
}

function createSpendingRecord(
  order: ShipperSpendingOrderRecord,
): ShipperSpendingRecord | undefined {
  const amountCents = order.payablePriceCents ?? order.priceCents;

  if (!amountCents || amountCents <= 0) {
    return undefined;
  }

  return {
    orderId: order.id,
    orderNo: order.orderNo,
    status: order.status,
    paymentMethod: order.paymentMethod,
    amountCents,
    ...(order.priceCents !== undefined ? { priceCents: order.priceCents } : {}),
    ...(order.payablePriceCents !== undefined
      ? { payablePriceCents: order.payablePriceCents }
      : {}),
    ...(order.couponTitle ? { couponTitle: order.couponTitle } : {}),
    ...(order.couponDiscountCents !== undefined
      ? { couponDiscountCents: order.couponDiscountCents }
      : {}),
    occurredAtIso: order.updatedAtIso,
    routeText: createRouteText(order),
  };
}

function createSpendingSummary(
  items: ShipperSpendingRecord[],
): ShipperSpendingSummary {
  return items.reduce<ShipperSpendingSummary>(
    (summary, item) => {
      if (item.status === 'completed') {
        return {
          ...summary,
          completedTotalCents: summary.completedTotalCents + item.amountCents,
        };
      }

      if (ACTIVE_ORDER_STATUSES.has(item.status)) {
        return {
          ...summary,
          activeTotalCents: summary.activeTotalCents + item.amountCents,
        };
      }

      if (item.status === 'cancelled') {
        return {
          ...summary,
          refundTotalCents: summary.refundTotalCents + item.amountCents,
        };
      }

      return summary;
    },
    {
      completedTotalCents: 0,
      activeTotalCents: 0,
      refundTotalCents: 0,
    },
  );
}

function createRouteText(
  order: Pick<
    ShipperSpendingOrderRecord,
    'pickupAddress' | 'deliveryAddress' | 'orderNo'
  >,
) {
  if (order.pickupAddress && order.deliveryAddress) {
    return `${order.pickupAddress} → ${order.deliveryAddress}`;
  }

  return order.orderNo;
}
