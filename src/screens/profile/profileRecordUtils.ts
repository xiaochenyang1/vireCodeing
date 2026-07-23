import {
  invoiceableOrderItems,
  recentOrderStatusCopy,
  spendingRecordItems,
} from '../../data/mockData';
import type { PlatformProfileSpendingRecord } from '../../services/platformProfileApi';
import type { RecentOrder } from '../../types';
import { createPlatformInvoiceOrderSelectionId } from '../../utils/profileInvoices';

export type InvoiceableOrderItem = (typeof invoiceableOrderItems)[number];
export type LocalInvoiceableOrderItem = InvoiceableOrderItem & {
  completedAtIso?: string;
  platformOrderId?: string;
};
type BaseSpendingRecordItem = (typeof spendingRecordItems)[number];
export type SpendingRecordItem = BaseSpendingRecordItem & {
  occurredAtIso?: string;
  originalPriceText?: string;
  couponTitleText?: string;
  couponDiscountText?: string;
  payablePriceText?: string;
  routeText?: string;
  statusCategory?: 'completed' | 'active' | 'refund' | 'other';
  platformOrderId?: string;
};

export function createSpendingRecords(
  orders: RecentOrder[],
  options: {
    platformOnly?: boolean;
    platformRecords?: PlatformProfileSpendingRecord[];
  } = {},
): SpendingRecordItem[] {
  const platformOnly = options.platformOnly ?? false;
  const platformRecords = options.platformRecords ?? [];

  if (platformOnly) {
    return platformRecords.map(record =>
      createSpendingRecordFromPlatformRecord(record),
    );
  }

  const existingOrderIds = new Set(spendingRecordItems.map(item => item.orderId));
  const localRecords = orders
    .filter(
      order =>
        !existingOrderIds.has(order.id) &&
        Boolean(order.paymentMethodText) &&
        Boolean(getOrderPayablePriceValue(order)),
    )
    .map(order => createSpendingRecordFromOrder(order));

  return [...localRecords, ...spendingRecordItems];
}

export function createInvoiceableOrders(
  orders: RecentOrder[],
  options: {
    platformOnly?: boolean;
    platformRecords?: PlatformProfileSpendingRecord[];
  } = {},
): LocalInvoiceableOrderItem[] {
  const platformOnly = options.platformOnly ?? false;
  const platformRecords = options.platformRecords ?? [];

  if (platformOnly) {
    return platformRecords
      .filter(isPlatformInvoiceableSpendingRecord)
      .map(record => {
        const succeededRefundCents =
          record.refundStatus === 'succeeded'
            ? record.refundAmountCents ?? 0
            : 0;
        const amountValue = convertCentsToYuan(
          record.amountCents - succeededRefundCents,
        );

        return {
          id: createPlatformInvoiceOrderSelectionId(record.orderId),
          orderId: record.orderNo,
          platformOrderId: record.orderId,
          amountValue,
          amountText: `可开票 ${formatLocalCurrency(amountValue)}`,
          routeText: record.routeText,
          completedAtIso: record.settledAtIso,
          completedTimeText: formatPlatformIsoDateTime(
            record.settledAtIso ?? record.occurredAtIso,
          ),
        };
      });
  }

  const existingOrderIds = new Set(
    invoiceableOrderItems.map(item => item.orderId),
  );
  const localOrders = orders
    .filter(
      order =>
        order.status === 'completed' &&
        Boolean(order.paymentMethodText) &&
        !existingOrderIds.has(order.id) &&
        getOrderPayablePriceValue(order) > 0,
    )
    .map(order => {
      const amountValue = getOrderPayablePriceValue(order);

      return {
        id: order.platformOrderId
          ? createPlatformInvoiceOrderSelectionId(order.platformOrderId)
          : `invoice-order-local-${order.id}`,
        orderId: order.id,
        ...(order.platformOrderId
          ? { platformOrderId: order.platformOrderId }
          : {}),
        amountValue,
        amountText: `可开票 ${formatLocalCurrency(amountValue)}`,
        routeText: `${order.from} → ${order.to}`,
        completedAtIso: order.updatedAtIso ?? order.createdAtIso,
        completedTimeText: order.updatedAtText.replace('订单已完成 · ', ''),
      };
    });

  return [...localOrders, ...invoiceableOrderItems];
}

function createSpendingRecordFromOrder(order: RecentOrder): SpendingRecordItem {
  const amountValue = getOrderPayablePriceValue(order);
  const paymentMethodText = order.paymentMethodText ?? '待补充';
  const isOnlinePayment = paymentMethodText.includes('在线支付');
  const hasFinancialFacts = order.paymentStatus !== undefined;
  const statusText = hasFinancialFacts
    ? getOrderFinancialStatusText(order)
    : getSpendingStatusText(order);
  const statusCategory = hasFinancialFacts
    ? getOrderFinancialStatusCategory(order)
    : getSpendingStatusCategory(order.status);
  const methodText = hasFinancialFacts
    ? getOrderFinancialMethodText(order)
    : paymentMethodText;

  return {
    id: `spending-local-${order.id}`,
    orderId: order.id,
    amountValue,
    amountText: formatLocalCurrency(amountValue),
    methodText,
    statusText,
    occurredAtIso: order.updatedAtIso ?? order.createdAtIso,
    timeText: order.updatedAtText,
    paymentTimeText: hasFinancialFacts
      ? getOrderFinancialTimeText(order)
      : isOnlinePayment
        ? `支付时间：${order.updatedAtText}`
        : `结算时间：${order.updatedAtText}`,
    paymentStatusText: hasFinancialFacts
      ? getOrderFinancialStatusSummary(order)
      : isOnlinePayment
        ? statusText === '已完成'
          ? '支付状态：支付成功'
          : statusText.includes('退款')
            ? '退款进度：原路退回处理中'
            : '支付状态：托管中'
        : statusText.includes('退款')
          ? '退款状态：待人工确认'
          : '支付状态：货到付款待确认',
    settlementText: hasFinancialFacts
      ? getOrderFinancialSettlementText(order, amountValue)
      : isOnlinePayment
        ? statusText === '已完成'
          ? `司机收入：${formatLocalCurrency(amountValue)}`
          : statusText.includes('退款')
            ? `退款金额：${formatLocalCurrency(amountValue)}`
            : `冻结资金：${formatLocalCurrency(amountValue)}`
        : statusText.includes('退款')
          ? `退款金额：${formatLocalCurrency(amountValue)}`
          : `待收款金额：${formatLocalCurrency(amountValue)}`,
    flowText: hasFinancialFacts
      ? getOrderFinancialSourceText(order)
      : isOnlinePayment
        ? statusText === '已完成'
          ? '本地演示：在线支付已完成结算。'
          : statusText.includes('退款')
            ? '本地演示：取消后原路退款处理中。'
            : '本地演示：资金托管中，确认送达后完成扣款。'
        : statusText.includes('退款')
          ? '本地演示：货到付款取消后需线下核对退款。'
          : '本地演示：货到付款将在送达确认后线下结算。',
    originalPriceText: order.originalPriceText,
    couponTitleText: order.couponTitleText,
    couponDiscountText: order.couponDiscountText,
    payablePriceText: order.payablePriceText,
    routeText: `${order.from} → ${order.to}`,
    statusCategory,
    timeBucket: 'recent',
  };
}

function getOrderFinancialStatusText(order: RecentOrder) {
  if (!order.paymentStatus) {
    return getSpendingStatusText(order);
  }

  const statusCopy: Record<NonNullable<RecentOrder['paymentStatus']>, string> =
    {
      not_required: '无需在线支付',
      pending: '待支付',
      escrowed: '已托管',
      settled: '已结算',
      failed: '支付失败',
      cancelled: '支付已取消',
      refund_pending: '退款中',
      refunded: '已退款',
      refund_failed: '退款待处理',
      legacy_unverified: '历史资金待核验',
    };

  return statusCopy[order.paymentStatus];
}

function getOrderFinancialStatusCategory(order: RecentOrder) {
  if (!order.paymentStatus) {
    return getSpendingStatusCategory(order.status);
  }

  if (
    order.paymentStatus === 'refund_pending' ||
    order.paymentStatus === 'refunded' ||
    order.paymentStatus === 'refund_failed'
  ) {
    return 'refund' as const;
  }

  if (order.paymentStatus === 'settled') {
    return 'completed' as const;
  }

  if (order.paymentStatus === 'escrowed') {
    return 'active' as const;
  }

  return getSpendingStatusCategory(order.status);
}

function getOrderFinancialMethodText(order: RecentOrder) {
  if (order.paymentMethod === 'cod') {
    return '货到付款';
  }
  if (order.paymentChannel === 'wechat') {
    return '在线支付 · 微信支付';
  }
  if (order.paymentChannel === 'alipay') {
    return '在线支付 · 支付宝';
  }
  if (order.paymentChannel === 'sandbox') {
    return '在线支付 · 沙箱支付';
  }
  return order.paymentMethodText ?? '在线支付';
}

function getOrderFinancialTimeText(order: RecentOrder) {
  if (
    order.paymentStatus === 'refunded' &&
    order.refundedAtIso
  ) {
    return `退款时间：${formatPlatformIsoDateTime(order.refundedAtIso)}`;
  }

  if (
    order.paymentStatus === 'settled' &&
    order.paymentSettledAtIso
  ) {
    return `结算时间：${formatPlatformIsoDateTime(order.paymentSettledAtIso)}`;
  }

  if (order.updatedAtIso) {
    return `资金更新时间：${formatPlatformIsoDateTime(order.updatedAtIso)}`;
  }

  return `资金更新时间：${order.updatedAtText}`;
}

function getOrderFinancialStatusSummary(order: RecentOrder) {
  if (!order.paymentStatus) {
    return '资金状态：待确认';
  }

  if (
    order.paymentStatus === 'refund_pending' ||
    order.paymentStatus === 'refunded' ||
    order.paymentStatus === 'refund_failed'
  ) {
    return `退款状态：${getOrderFinancialStatusText(order)}`;
  }

  return `资金状态：${getOrderFinancialStatusText(order)}`;
}

function getOrderFinancialSettlementText(
  order: RecentOrder,
  amountValue: number,
) {
  const amountText = formatLocalCurrency(amountValue);

  if (
    order.paymentStatus === 'refund_pending' ||
    order.paymentStatus === 'refunded' ||
    order.paymentStatus === 'refund_failed'
  ) {
    return `退款金额：${amountText}`;
  }

  if (order.paymentStatus === 'settled') {
    return `结算金额：${amountText}`;
  }

  if (order.paymentStatus === 'escrowed') {
    return `托管金额：${amountText}`;
  }

  if (order.paymentMethod === 'cod') {
    return `待结算金额：${amountText}`;
  }

  return `应付金额：${amountText}`;
}

function getOrderFinancialSourceText(order: RecentOrder) {
  if (
    order.paymentStatus === 'refund_pending' ||
    order.paymentStatus === 'refunded' ||
    order.paymentStatus === 'refund_failed'
  ) {
    return order.paymentMethod === 'online'
      ? '资金依据：订单服务端支付与退款状态'
      : '资金依据：订单服务端结算与退款状态';
  }

  if (order.paymentStatus === 'settled') {
    return order.paymentMethod === 'online'
      ? '资金依据：订单服务端支付与结算状态'
      : '资金依据：订单服务端结算状态';
  }

  if (order.paymentStatus === 'escrowed') {
    return '资金依据：订单服务端支付托管状态';
  }

  return order.paymentMethod === 'online'
    ? '资金依据：订单服务端支付状态'
    : '资金依据：订单服务端状态';
}

function isPlatformInvoiceableSpendingRecord(
  record: PlatformProfileSpendingRecord,
) {
  if (
    record.status !== 'completed' ||
    !record.settledAtIso ||
    record.paymentStatus === 'legacy_unverified' ||
    record.refundStatus === 'pending' ||
    record.refundStatus === 'processing'
  ) {
    return false;
  }

  const succeededRefundCents =
    record.refundStatus === 'succeeded'
      ? record.refundAmountCents ?? 0
      : 0;

  return (
    record.amountCents > 0 &&
    succeededRefundCents >= 0 &&
    succeededRefundCents < record.amountCents
  );
}

function createSpendingRecordFromPlatformRecord(
  record: PlatformProfileSpendingRecord,
): SpendingRecordItem {
  const amountValue = convertCentsToYuan(record.amountCents);
  const amountText = formatLocalCurrency(amountValue);
  const statusCategory = getPlatformSpendingStatusCategory(record);
  const statusText = getPlatformSpendingStatusText(record);
  const methodText = getPlatformSpendingMethodText(record);

  return {
    id: `spending-platform-${record.orderId}`,
    orderId: record.orderNo,
    amountValue,
    amountText,
    methodText,
    statusText,
    occurredAtIso: record.occurredAtIso,
    timeText: `平台更新时间：${formatPlatformIsoDateTime(record.occurredAtIso)}`,
    paymentTimeText: getPlatformPaymentTimeText(record),
    paymentStatusText: getPlatformPaymentStatusText(record),
    settlementText: getPlatformSettlementText(record, amountText),
    flowText: getPlatformFinancialSourceText(record),
    originalPriceText:
      record.priceCents !== undefined &&
      record.payablePriceCents !== undefined &&
      record.priceCents !== record.payablePriceCents
        ? formatLocalCurrency(convertCentsToYuan(record.priceCents))
        : undefined,
    couponTitleText: record.couponTitle,
    couponDiscountText:
      record.couponDiscountCents !== undefined &&
      record.couponDiscountCents > 0
        ? `-${formatLocalCurrency(convertCentsToYuan(record.couponDiscountCents))}`
        : undefined,
    payablePriceText:
      record.payablePriceCents !== undefined
        ? formatLocalCurrency(convertCentsToYuan(record.payablePriceCents))
        : undefined,
    routeText: record.routeText,
    statusCategory,
    timeBucket: 'recent',
  };
}

function getOrderPayablePriceValue(order: RecentOrder) {
  return parsePriceValue(order.payablePriceText ?? order.priceText);
}

function getSpendingStatusText(order: RecentOrder) {
  if (order.status === 'completed') {
    return '已完成';
  }

  if (order.status === 'cancelled') {
    return '退款中';
  }

  return recentOrderStatusCopy[order.status].label;
}

function getPlatformSpendingStatusText(
  record: PlatformProfileSpendingRecord,
) {
  if (record.refundStatus === 'succeeded') {
    return '已退款';
  }
  if (
    record.refundStatus === 'pending' ||
    record.refundStatus === 'processing'
  ) {
    return '退款中';
  }
  if (record.refundStatus === 'failed') {
    return '退款待处理';
  }

  const statusCopy: Record<
    PlatformProfileSpendingRecord['paymentStatus'],
    string
  > = {
    not_required: '无需在线支付',
    pending: '待支付',
    escrowed: '已托管',
    settled: '已结算',
    failed: '支付失败',
    cancelled: '支付已取消',
    refund_pending: '退款中',
    refunded: '已退款',
    refund_failed: '退款待处理',
    legacy_unverified: '历史资金待核验',
  };

  return statusCopy[record.paymentStatus];
}

function getPlatformSpendingMethodText(
  record: PlatformProfileSpendingRecord,
) {
  if (record.paymentMethod === 'cod') {
    return '货到付款';
  }

  const channelText =
    record.paymentChannel === 'wechat'
      ? '微信支付'
      : record.paymentChannel === 'alipay'
        ? '支付宝'
        : record.paymentChannel === 'sandbox'
          ? '沙箱支付'
          : undefined;

  return channelText ? `在线支付 · ${channelText}` : '在线支付';
}

function getPlatformSpendingStatusCategory(
  record: PlatformProfileSpendingRecord,
) {
  if (
    record.refundStatus ||
    record.paymentStatus === 'refund_pending' ||
    record.paymentStatus === 'refunded' ||
    record.paymentStatus === 'refund_failed'
  ) {
    return 'refund' as const;
  }
  if (record.paymentStatus === 'settled') {
    return 'completed' as const;
  }
  if (record.paymentStatus === 'escrowed') {
    return 'active' as const;
  }
  return 'other' as const;
}

function getSpendingStatusCategory(
  status: RecentOrder['status'] | PlatformProfileSpendingRecord['status'],
) {
  if (status === 'completed') {
    return 'completed' as const;
  }

  if (
    status === 'loading' ||
    status === 'transporting' ||
    status === 'confirming'
  ) {
    return 'active' as const;
  }

  if (status === 'cancelled') {
    return 'refund' as const;
  }

  return 'other' as const;
}

function getPlatformPaymentTimeText(record: PlatformProfileSpendingRecord) {
  if (record.paymentMethod === 'online') {
    return record.paidAtIso
      ? `支付时间：${formatPlatformIsoDateTime(record.paidAtIso)}`
      : '支付时间：服务端尚未确认';
  }

  return record.settledAtIso
    ? `结算时间：${formatPlatformIsoDateTime(record.settledAtIso)}`
    : '结算时间：服务端尚未确认';
}

function getPlatformPaymentStatusText(
  record: PlatformProfileSpendingRecord,
) {
  if (record.refundStatus === 'succeeded') {
    return '退款状态：已退款';
  }
  if (
    record.refundStatus === 'pending' ||
    record.refundStatus === 'processing'
  ) {
    return '退款状态：处理中';
  }
  if (record.refundStatus === 'failed') {
    return '退款状态：失败，待平台处理';
  }

  return `资金状态：${getPlatformSpendingStatusText(record)}`;
}

function getPlatformSettlementText(
  record: PlatformProfileSpendingRecord,
  amountText: string,
) {
  if (
    record.refundStatus ||
    record.paymentStatus === 'refund_pending' ||
    record.paymentStatus === 'refunded' ||
    record.paymentStatus === 'refund_failed'
  ) {
    const refundAmountText = formatLocalCurrency(
      convertCentsToYuan(record.refundAmountCents ?? 0),
    );
    return `退款金额：${refundAmountText}`;
  }
  if (record.paymentStatus === 'settled') {
    return `结算金额：${amountText}`;
  }
  if (record.paymentStatus === 'escrowed') {
    return `托管金额：${amountText}`;
  }
  return `资金金额：${amountText}`;
}

function getPlatformFinancialSourceText(
  record: PlatformProfileSpendingRecord,
) {
  if (
    record.refundStatus ||
    record.paymentStatus === 'refund_pending' ||
    record.paymentStatus === 'refunded' ||
    record.paymentStatus === 'refund_failed'
  ) {
    return record.paymentMethod === 'online'
      ? '资金依据：平台支付与退款记录'
      : '资金依据：平台结算与退款记录';
  }
  if (record.paymentStatus === 'settled') {
    return record.paymentMethod === 'online'
      ? '资金依据：平台支付与结算记录'
      : '资金依据：平台结算记录';
  }
  return record.paymentMethod === 'online'
    ? '资金依据：平台支付记录'
    : '资金依据：平台结算记录';
}

function convertCentsToYuan(cents: number) {
  return cents / 100;
}

export function parsePriceValue(priceText: string) {
  const normalized = priceText.replace(/[^\d.]/g, '');
  const amountValue = Number(normalized);

  return Number.isFinite(amountValue) ? amountValue : 0;
}

export function formatLocalCurrency(amount: number) {
  return Number.isInteger(amount) ? `￥${amount}` : `￥${amount.toFixed(2)}`;
}

export function formatLocalDateTime(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

const SHANGHAI_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;

function formatPlatformIsoDateTime(value: string) {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return value;
  }

  const shanghaiTime = new Date(timestamp + SHANGHAI_TIME_OFFSET_MS);
  const year = shanghaiTime.getUTCFullYear();
  const month = `${shanghaiTime.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${shanghaiTime.getUTCDate()}`.padStart(2, '0');
  const hours = `${shanghaiTime.getUTCHours()}`.padStart(2, '0');
  const minutes = `${shanghaiTime.getUTCMinutes()}`.padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
