export type ShipperSpendingOrderStatus =
  | 'waiting'
  | 'loading'
  | 'transporting'
  | 'confirming'
  | 'completed'
  | 'cancelled';

export type ShipperSpendingPaymentMethod = 'cod' | 'online';

export type ShipperSpendingSummary = {
  completedTotalCents: number;
  activeTotalCents: number;
  refundTotalCents: number;
};

export type ShipperSpendingRecord = {
  orderId: string;
  orderNo: string;
  status: ShipperSpendingOrderStatus;
  paymentMethod: ShipperSpendingPaymentMethod;
  amountCents: number;
  priceCents?: number;
  payablePriceCents?: number;
  couponTitle?: string;
  couponDiscountCents?: number;
  occurredAtIso: string;
  routeText: string;
};

export type ShipperSpendingSnapshot = {
  shipperId: string;
  summary: ShipperSpendingSummary;
  items: ShipperSpendingRecord[];
};

export type ShipperSpendingOrderRecord = {
  id: string;
  shipperId: string;
  orderNo: string;
  status: ShipperSpendingOrderStatus;
  paymentMethod: ShipperSpendingPaymentMethod;
  priceCents?: number;
  payablePriceCents?: number;
  couponTitle?: string;
  couponDiscountCents?: number;
  updatedAtIso: string;
  pickupAddress: string;
  deliveryAddress: string;
};
