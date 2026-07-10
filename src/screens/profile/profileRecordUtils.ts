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
  } = {},
): LocalInvoiceableOrderItem[] {
  const platformOnly = options.platformOnly ?? false;
  const existingOrderIds = new Set(
    platformOnly ? [] : invoiceableOrderItems.map(item => item.orderId),
  );
  const localOrders = orders
    .filter(
      order =>
        order.status === 'completed' &&
        Boolean(order.paymentMethodText) &&
        (!platformOnly || Boolean(order.platformOrderId)) &&
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

  return platformOnly ? localOrders : [...localOrders, ...invoiceableOrderItems];
}

function createSpendingRecordFromOrder(order: RecentOrder): SpendingRecordItem {
  const amountValue = getOrderPayablePriceValue(order);
  const statusText = getSpendingStatusText(order);
  const statusCategory = getSpendingStatusCategory(order.status);
  const paymentMethodText = order.paymentMethodText ?? '待补充';
  const isOnlinePayment = paymentMethodText.includes('在线支付');

  return {
    id: `spending-local-${order.id}`,
    orderId: order.id,
    amountValue,
    amountText: formatLocalCurrency(amountValue),
    methodText: paymentMethodText,
    statusText,
    occurredAtIso: order.updatedAtIso ?? order.createdAtIso,
    timeText: order.updatedAtText,
    paymentTimeText: isOnlinePayment
      ? `支付时间：${order.updatedAtText}`
      : `结算时间：${order.updatedAtText}`,
    paymentStatusText: isOnlinePayment
      ? statusText === '已完成'
        ? '支付状态：支付成功'
        : statusText.includes('退款')
        ? '退款进度：原路退回处理中'
        : '支付状态：托管中'
      : statusText.includes('退款')
      ? '退款状态：待人工确认'
      : '支付状态：货到付款待确认',
    settlementText: isOnlinePayment
      ? statusText === '已完成'
        ? `司机收入：${formatLocalCurrency(amountValue)}`
        : statusText.includes('退款')
        ? `退款金额：${formatLocalCurrency(amountValue)}`
        : `冻结资金：${formatLocalCurrency(amountValue)}`
      : statusText.includes('退款')
      ? `退款金额：${formatLocalCurrency(amountValue)}`
      : `待收款金额：${formatLocalCurrency(amountValue)}`,
    flowText: isOnlinePayment
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

function createSpendingRecordFromPlatformRecord(
  record: PlatformProfileSpendingRecord,
): SpendingRecordItem {
  const amountValue = convertCentsToYuan(record.amountCents);
  const amountText = formatLocalCurrency(amountValue);
  const statusCategory = getSpendingStatusCategory(record.status);
  const statusText = getPlatformSpendingStatusText(record.status);
  const methodText = record.paymentMethod === 'online' ? '在线支付' : '货到付款';

  return {
    id: `spending-platform-${record.orderId}`,
    orderId: record.orderNo,
    amountValue,
    amountText,
    methodText,
    statusText,
    occurredAtIso: record.occurredAtIso,
    timeText: `平台更新时间：${formatPlatformIsoDateTime(record.occurredAtIso)}`,
    paymentTimeText:
      record.paymentMethod === 'online'
        ? `支付时间：${formatPlatformIsoDateTime(record.occurredAtIso)}`
        : `结算时间：${formatPlatformIsoDateTime(record.occurredAtIso)}`,
    paymentStatusText: getPlatformPaymentStatusText({
      paymentMethod: record.paymentMethod,
      statusCategory,
    }),
    settlementText: getPlatformSettlementText({
      paymentMethod: record.paymentMethod,
      statusCategory,
      amountText,
    }),
    flowText:
      record.paymentMethod === 'online'
        ? '平台快照：订单金额已同步，真实支付/退款流水待接入。'
        : '平台快照：线下结算金额已同步，真实对账待接入。',
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
  status: PlatformProfileSpendingRecord['status'],
) {
  if (status === 'cancelled') {
    return '退款中';
  }

  return recentOrderStatusCopy[status].label;
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

function getPlatformPaymentStatusText({
  paymentMethod,
  statusCategory,
}: {
  paymentMethod: PlatformProfileSpendingRecord['paymentMethod'];
  statusCategory: SpendingRecordItem['statusCategory'];
}) {
  if (statusCategory === 'completed') {
    return paymentMethod === 'online'
      ? '支付状态：支付成功'
      : '支付状态：货到付款已确认';
  }

  if (statusCategory === 'refund') {
    return paymentMethod === 'online'
      ? '退款进度：原路退回处理中'
      : '退款状态：待人工确认';
  }

  if (statusCategory === 'active') {
    return paymentMethod === 'online'
      ? '支付状态：托管中'
      : '支付状态：货到付款待确认';
  }

  return paymentMethod === 'online'
    ? '支付状态：待平台确认'
    : '支付状态：货到付款待确认';
}

function getPlatformSettlementText({
  paymentMethod,
  statusCategory,
  amountText,
}: {
  paymentMethod: PlatformProfileSpendingRecord['paymentMethod'];
  statusCategory: SpendingRecordItem['statusCategory'];
  amountText: string;
}) {
  if (statusCategory === 'completed') {
    return `司机收入：${amountText}`;
  }

  if (statusCategory === 'refund') {
    return `退款金额：${amountText}`;
  }

  if (statusCategory === 'active') {
    return paymentMethod === 'online'
      ? `冻结资金：${amountText}`
      : `待收款金额：${amountText}`;
  }

  return paymentMethod === 'online'
    ? `待处理金额：${amountText}`
    : `待收款金额：${amountText}`;
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
