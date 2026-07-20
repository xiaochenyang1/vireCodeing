import type {
  ShipperSpendingFinancialRecord,
  ShipperSpendingRecord,
  ShipperSpendingSnapshot,
  ShipperSpendingSummary,
} from './dto';
import type { ProfileSpendingRepository } from './profile-spending.repository';

export class ProfileSpendingService {
  constructor(private readonly repository: ProfileSpendingRepository) {}

  async listRecords(shipperId: string): Promise<ShipperSpendingSnapshot> {
    const items = (await this.repository.listFinancialRecords(shipperId))
      .map(createSpendingRecord)
      .filter(
        (item): item is ShipperSpendingRecord =>
          item !== undefined,
      )
      .sort((left, right) =>
        right.occurredAtIso.localeCompare(left.occurredAtIso),
      );

    return {
      shipperId,
      summary: createSpendingSummary(items),
      items,
    };
  }
}

function createSpendingRecord(
  order: ShipperSpendingFinancialRecord,
): ShipperSpendingRecord | undefined {
  const amountCents =
    order.paymentStatus === 'settled'
      ? order.settlement?.grossAmountCents
      : order.payment?.amountCents;

  if (
    !amountCents ||
    amountCents <= 0 ||
    !isRecordedFinancialStatus(order.paymentStatus)
  ) {
    return undefined;
  }

  const occurredAtIso =
    order.refund?.succeededAtIso ??
    order.refund?.failedAtIso ??
    order.refund?.updatedAtIso ??
    order.settlement?.settledAtIso ??
    order.payment?.paidAtIso ??
    order.payment?.createdAtIso;
  if (!occurredAtIso) {
    return undefined;
  }

  return {
    orderId: order.id,
    orderNo: order.orderNo,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    ...(order.payment
      ? {
          paymentChannel: order.payment.channel,
          paymentOrderStatus: order.payment.status,
          ...(order.payment.paidAtIso
            ? { paidAtIso: order.payment.paidAtIso }
            : {}),
        }
      : {}),
    ...(order.settlement
      ? { settledAtIso: order.settlement.settledAtIso }
      : {}),
    ...(order.refund
      ? {
          refundStatus: order.refund.status,
          refundAmountCents: order.refund.amountCents,
          ...(order.refund.succeededAtIso
            ? { refundedAtIso: order.refund.succeededAtIso }
            : {}),
        }
      : {}),
    amountCents,
    ...(order.priceCents !== undefined ? { priceCents: order.priceCents } : {}),
    ...(order.payablePriceCents !== undefined
      ? { payablePriceCents: order.payablePriceCents }
      : {}),
    ...(order.couponTitle ? { couponTitle: order.couponTitle } : {}),
    ...(order.couponDiscountCents !== undefined
      ? { couponDiscountCents: order.couponDiscountCents }
      : {}),
    occurredAtIso,
    routeText: createRouteText(order),
  };
}

function createSpendingSummary(
  items: ShipperSpendingRecord[],
): ShipperSpendingSummary {
  return items.reduce<ShipperSpendingSummary>(
    (summary, item) => {
      if (item.paymentStatus === 'settled') {
        return {
          ...summary,
          completedTotalCents: summary.completedTotalCents + item.amountCents,
        };
      }

      if (item.paymentStatus === 'escrowed') {
        return {
          ...summary,
          activeTotalCents: summary.activeTotalCents + item.amountCents,
        };
      }

      if (item.refundStatus === 'succeeded') {
        return {
          ...summary,
          refundTotalCents:
            summary.refundTotalCents + (item.refundAmountCents ?? 0),
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
    ShipperSpendingFinancialRecord,
    'pickupAddress' | 'deliveryAddress' | 'orderNo'
  >,
) {
  if (order.pickupAddress && order.deliveryAddress) {
    return `${order.pickupAddress} → ${order.deliveryAddress}`;
  }

  return order.orderNo;
}

function isRecordedFinancialStatus(
  status: ShipperSpendingFinancialRecord['paymentStatus'],
) {
  return (
    status === 'escrowed' ||
    status === 'settled' ||
    status === 'refund_pending' ||
    status === 'refunded' ||
    status === 'refund_failed'
  );
}
