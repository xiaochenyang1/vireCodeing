import type { FileUploadRecord } from '../files/dto';
import type { OrderExceptionCaseRecord } from '../order-exception-cases/dto';
import type { OrderPaymentStatus } from '../payments/payment-domain';

export type ShipperOrderStatus =
  | 'waiting'
  | 'loading'
  | 'transporting'
  | 'confirming'
  | 'completed'
  | 'cancelled';

export type ShipperOrderPricingMode = 'fixed' | 'negotiable';
export type ShipperOrderPaymentMethod = 'cod' | 'online';

export type CreateShipperOrderRequest = {
  cargoType: string;
  weightText: string;
  volumeText?: string;
  quantityText: string;
  cargoDescription?: string;
  cargoPhotoCount?: number;
  cargoPhotoFileIds?: string[];
  pickupAddress: string;
  pickupNoteText?: string;
  pickupContact: string;
  pickupPhone: string;
  deliveryAddress: string;
  deliveryNoteText?: string;
  deliveryContact: string;
  deliveryPhone: string;
  vehicleRequirement: string;
  vehicleLengthText?: string;
  needTailboard: boolean;
  needTarp: boolean;
  pickupTimeIso: string;
  expectedDeliveryTimeText?: string;
  valueAddedServicesText?: string;
  pricingMode: ShipperOrderPricingMode;
  priceCents?: number;
  paymentMethod: ShipperOrderPaymentMethod;
  couponId?: string;
  couponTitle?: string;
  couponDiscountCents?: number;
  payablePriceCents?: number;
};

export type OrderMutationConcurrencyRequest = {
  baseUpdatedAtIso: string;
};

export type UpdateShipperOrderRequest = CreateShipperOrderRequest &
  OrderMutationConcurrencyRequest;

export type CancelShipperOrderRequest = OrderMutationConcurrencyRequest & {
  reasonText: string;
  description?: string;
};

export type AdvanceShipperOrderStatusRequest =
  OrderMutationConcurrencyRequest & {
  nextStatus: Extract<ShipperOrderStatus, 'loading' | 'transporting' | 'confirming'>;
};

export type CompleteShipperOrderRequest = OrderMutationConcurrencyRequest;

export type ReportShipperOrderExceptionRequest = {
  typeLabel: string;
  description: string;
  photoCount?: number;
  photoFileIds?: string[];
};

export type SubmitShipperOrderChangeRequest = {
  description: string;
};

export type SubmitShipperOrderEvaluationRequest = {
  rating: number;
  tags: string[];
  content: string;
  anonymous?: boolean;
  photoCount?: number;
  photoFileIds?: string[];
};

export type AdminOrderFilters = {
  status?: ShipperOrderStatus;
  statuses?: ShipperOrderStatus[];
  keyword?: string;
  createdFromIso?: string;
  createdToIso?: string;
};

export type ListShipperOrdersQuery = AdminOrderFilters & {
  page: number;
  pageSize: number;
};

export type ShipperOrderEventRecord = {
  id: string;
  actorUserId?: string;
  eventType: string;
  noteText?: string;
  attachmentFileIds?: string[];
  createdAtIso: string;
};

export type ShipperOrderRecord = CreateShipperOrderRequest & {
  id: string;
  orderNo: string;
  shipperId: string;
  status: ShipperOrderStatus;
  paymentStatus: OrderPaymentStatus;
  assignedDriverId?: string;
  paymentSettledAtIso?: string;
  refundedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
  events: ShipperOrderEventRecord[];
  latestExceptionCase?: Pick<
    OrderExceptionCaseRecord,
    | 'id'
    | 'caseNo'
    | 'sourceEventId'
    | 'sourceRole'
    | 'status'
    | 'resolutionText'
    | 'resolvedAtIso'
    | 'compensationStatus'
    | 'compensationTargetRole'
    | 'compensationAmountCents'
    | 'compensationUpdatedAtIso'
    | 'createdAtIso'
    | 'updatedAtIso'
  >;
};

export type ListShipperOrdersResult = {
  items: ShipperOrderRecord[];
  page: number;
  pageSize: number;
  total: number;
};

export type AdminOrderReportQuery = AdminOrderFilters & {
  topShippersLimit: number;
};

export type AdminOrderSummary = {
  totalOrderCount: number;
  waitingOrderCount: number;
  activeOrderCount: number;
  completedOrderCount: number;
  cancelledOrderCount: number;
  exceptionOrderCount: number;
};

export type AdminOrderReportStatusBreakdownItem = {
  status: ShipperOrderStatus;
  orderCount: number;
  payablePriceTotalCents: number;
};

export type AdminOrderReportPaymentStatusBreakdownItem = {
  paymentStatus: OrderPaymentStatus;
  orderCount: number;
  payablePriceTotalCents: number;
};

export type AdminOrderReportPricingModeBreakdownItem = {
  pricingMode: ShipperOrderPricingMode;
  orderCount: number;
  payablePriceTotalCents: number;
};

export type AdminOrderReportPaymentMethodBreakdownItem = {
  paymentMethod: ShipperOrderPaymentMethod;
  orderCount: number;
  payablePriceTotalCents: number;
};

export type AdminOrderReportTopShipperItem = {
  shipperId: string;
  orderCount: number;
  waitingOrderCount: number;
  activeOrderCount: number;
  completedOrderCount: number;
  cancelledOrderCount: number;
  payablePriceTotalCents: number;
  latestOrderCreatedAtIso?: string;
};

export type AdminOrderReport = {
  generatedAtIso: string;
  filters: AdminOrderFilters;
  summary: AdminOrderSummary;
  statusBreakdown: AdminOrderReportStatusBreakdownItem[];
  paymentStatusBreakdown: AdminOrderReportPaymentStatusBreakdownItem[];
  pricingModeBreakdown: AdminOrderReportPricingModeBreakdownItem[];
  paymentMethodBreakdown: AdminOrderReportPaymentMethodBreakdownItem[];
  topShippers: AdminOrderReportTopShipperItem[];
};

export type AdminOrderAttachmentAuditListQuery = {
  status?: ShipperOrderStatus;
  shipperId?: string;
  keyword?: string;
  createdFromIso?: string;
  createdToIso?: string;
  hasMissingFiles?: boolean;
  page: number;
  pageSize: number;
};

export type AdminOrderAttachmentAuditSummary = {
  orderId: string;
  orderNo: string;
  shipperId: string;
  status: ShipperOrderStatus;
  createdAtIso: string;
  cargoFileCount: number;
  eventAttachmentFileCount: number;
  totalFileIdCount: number;
  resolvedFileCount: number;
  missingFileIds: string[];
  hasMissingFiles: boolean;
};

export type ListAdminOrderAttachmentAuditsResult = {
  items: AdminOrderAttachmentAuditSummary[];
  page: number;
  pageSize: number;
  total: number;
};

export type AdminOrderAttachmentFileRecord = FileUploadRecord & {
  previewUrl?: string;
  previewExpiresAtIso?: string;
};

export type AdminOrderAttachmentFileGroup = {
  fileIds: string[];
  files: AdminOrderAttachmentFileRecord[];
  missingFileIds: string[];
};

export type AdminOrderAttachmentAuditEvent = {
  eventId: string;
  eventType: string;
  noteText?: string;
  createdAtIso: string;
  attachmentFileIds: string[];
  files: AdminOrderAttachmentFileRecord[];
  missingFileIds: string[];
};

export type AdminOrderAttachmentAudit = {
  orderId: string;
  orderNo: string;
  shipperId: string;
  cargo: AdminOrderAttachmentFileGroup;
  events: AdminOrderAttachmentAuditEvent[];
};
