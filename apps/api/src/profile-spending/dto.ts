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
  paymentStatus: OrderPaymentStatus;
  paymentChannel?: PaymentProviderChannel;
  paymentOrderStatus?: PaymentOrderStatus;
  refundStatus?: RefundStatus;
  amountCents: number;
  refundAmountCents?: number;
  priceCents?: number;
  payablePriceCents?: number;
  couponTitle?: string;
  couponDiscountCents?: number;
  occurredAtIso: string;
  paidAtIso?: string;
  settledAtIso?: string;
  refundedAtIso?: string;
  routeText: string;
};

export type ShipperSpendingSnapshot = {
  shipperId: string;
  summary: ShipperSpendingSummary;
  items: ShipperSpendingRecord[];
};

export type ShipperSpendingFinancialRecord = {
  id: string;
  shipperId: string;
  orderNo: string;
  status: ShipperSpendingOrderStatus;
  paymentMethod: ShipperSpendingPaymentMethod;
  paymentStatus: OrderPaymentStatus;
  priceCents?: number;
  payablePriceCents?: number;
  couponTitle?: string;
  couponDiscountCents?: number;
  updatedAtIso: string;
  pickupAddress: string;
  deliveryAddress: string;
  payment?: {
    channel: PaymentProviderChannel;
    amountCents: number;
    status: PaymentOrderStatus;
    paidAtIso?: string;
    createdAtIso: string;
  };
  settlement?: {
    grossAmountCents: number;
    settledAtIso: string;
  };
  refund?: {
    amountCents: number;
    status: RefundStatus;
    succeededAtIso?: string;
    failedAtIso?: string;
    updatedAtIso: string;
  };
};
import type {
  OrderPaymentStatus,
  PaymentOrderStatus,
  RefundStatus,
} from '../payments/payment-domain';
import type { PaymentProviderChannel } from '../payments/payment-provider';
