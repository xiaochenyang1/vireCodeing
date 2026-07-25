export type ShipperInvoiceType = 'normal' | 'vat-special';

export type ShipperInvoiceTitleType = 'personal' | 'enterprise';

export type ShipperInvoiceApplicationStatus =
  | 'reviewing'
  | 'approved'
  | 'rejected';

export type CreateShipperInvoiceApplicationRequest = {
  invoiceType: ShipperInvoiceType;
  invoiceTitleType: ShipperInvoiceTitleType;
  invoiceTitle: string;
  receiverEmail: string;
  orderIds: string[];
};

export type ShipperInvoiceApplicationRecord =
  CreateShipperInvoiceApplicationRequest & {
    id: string;
    shipperId: string;
    orderNos: string[];
    amountCents: number;
    status: ShipperInvoiceApplicationStatus;
    rejectionReason?: string;
    createdAtIso: string;
    updatedAtIso: string;
  };

export type ShipperInvoiceOrderStatus =
  | 'waiting'
  | 'loading'
  | 'transporting'
  | 'confirming'
  | 'completed'
  | 'cancelled';

export type ShipperInvoiceOrderRecord = {
  id: string;
  shipperId: string;
  orderNo: string;
  status: ShipperInvoiceOrderStatus;
  paymentStatus: OrderPaymentStatus;
  priceCents?: number;
  payablePriceCents?: number;
  settlementAmountCents?: number;
  paymentAmountCents?: number;
  succeededRefundAmountCents?: number;
};

export type ShipperEnterpriseVerificationSnapshot = {
  status: 'reviewing' | 'approved' | 'rejected';
  rejectionReason?: string;
};

export type ReviewShipperInvoiceApplicationRequest =
  | {
      status: 'approved';
      rejectionReason?: undefined;
    }
  | {
      status: 'rejected';
      rejectionReason: string;
    };

export type ListAdminShipperInvoiceQuery = {
  status: ShipperInvoiceApplicationStatus;
  page: number;
  pageSize: number;
};

export type ListAdminShipperInvoiceResult = {
  items: ShipperInvoiceApplicationRecord[];
  page: number;
  pageSize: number;
  total: number;
};

export type AdminShipperInvoiceReviewEventType =
  | 'invoice_application_submitted'
  | 'invoice_application_approved'
  | 'invoice_application_rejected';

export type AdminShipperInvoiceReviewEventStage =
  | 'submitted'
  | 'approved'
  | 'rejected';

export type AdminShipperInvoiceReviewEvent = {
  eventId: string;
  actorUserId?: string;
  eventType: AdminShipperInvoiceReviewEventType;
  stage: AdminShipperInvoiceReviewEventStage;
  noteText?: string;
  createdAtIso: string;
};
import type { OrderPaymentStatus } from '../payments/payment-domain';
