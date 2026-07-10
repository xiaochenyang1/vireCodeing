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
  priceCents?: number;
  payablePriceCents?: number;
};

export type ShipperEnterpriseVerificationSnapshot = {
  status: 'reviewing' | 'approved' | 'rejected';
  rejectionReason?: string;
};
