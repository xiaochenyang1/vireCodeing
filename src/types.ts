export type VerificationStatus =
  | 'unverified'
  | 'reviewing'
  | 'verified'
  | 'rejected';

export type OrderSummaryStatus =
  | 'waiting'
  | 'transporting'
  | 'confirming'
  | 'completed';

export type RecentOrderStatus =
  | 'waiting'
  | 'loading'
  | 'transporting'
  | 'confirming'
  | 'completed'
  | 'cancelled';

export type OrderSyncStatus = 'pending' | 'synced' | 'failed';
export type OrderSyncOperation =
  | 'create'
  | 'update'
  | 'cancel'
  | 'complete'
  | 'status'
  | 'exception'
  | 'changeRequest'
  | 'evaluation'
  | 'refresh'
  | 'local';

export type OrderMutationContext = {
  idempotencyKey: string;
  baseUpdatedAtIso: string;
};

export type OrderPaymentStatus =
  | 'not_required'
  | 'pending'
  | 'escrowed'
  | 'settled'
  | 'failed'
  | 'cancelled'
  | 'refund_pending'
  | 'refunded'
  | 'refund_failed'
  | 'legacy_unverified';

export type PaymentChannel = 'sandbox' | 'wechat' | 'alipay';

export type OrderCreateIdempotencyContext = {
  idempotencyKey: string;
};

export type OrderSyncQueueItem = {
  id: string;
  titleText: string;
  statusText: string;
  updatedAtText: string;
  updatedAtIso?: string;
  noteText: string;
};

export type OrderSyncState = {
  status: OrderSyncStatus;
  operation?: OrderSyncOperation;
  message: string;
  updatedAtText: string;
  updatedAtIso?: string;
  retryBlocked?: boolean;
  createContext?: OrderCreateIdempotencyContext;
  mutationContext?: OrderMutationContext;
  queueItems?: OrderSyncQueueItem[];
};

export type ShipperSummary = {
  displayName: string;
  accountType: 'personal' | 'enterprise';
  verificationStatus: VerificationStatus;
  enterpriseVerificationStatus: VerificationStatus;
  phoneNumber: string;
  city: string;
  unreadMessageCount: number;
};

export type OrderStatusSummary = {
  status: OrderSummaryStatus;
  label: string;
  count: number;
  description: string;
};

export type FrequentRoute = {
  id: string;
  name: string;
  from: string;
  to: string;
  lastUsedText: string;
  lastUsedIso?: string;
};

export type DriverInfo = {
  driverId: string;
  driverName: string;
  driverPhone: string;
  ratingText: string;
  vehicleText: string;
  plateNumber: string;
  completedOrdersText: string;
};

export type DriverQuote = DriverInfo & {
  quoteText: string;
  arrivalText: string;
  noteText: string;
};

export type RecentOrderExceptionCaseStatus =
  | 'pending'
  | 'processing'
  | 'resolved'
  | 'closed';
export type RecentOrderExceptionCaseSourceRole = 'shipper' | 'driver';
export type RecentOrderExceptionCaseCompensationStatus =
  | 'not_required'
  | 'pending'
  | 'offline_completed';
export type RecentOrderExceptionCaseCompensationTargetRole =
  RecentOrderExceptionCaseSourceRole;

export type RecentOrderLatestExceptionCase = {
  id: string;
  caseNo: string;
  sourceEventId: string;
  sourceRole: RecentOrderExceptionCaseSourceRole;
  status: RecentOrderExceptionCaseStatus;
  resolutionText?: string;
  resolvedAtIso?: string;
  compensationStatus?: RecentOrderExceptionCaseCompensationStatus;
  compensationTargetRole?: RecentOrderExceptionCaseCompensationTargetRole;
  compensationAmountCents?: number;
  compensationUpdatedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type RecentOrder = {
  id: string;
  platformOrderId?: string;
  status: RecentOrderStatus;
  from: string;
  to: string;
  cargoType: string;
  weightText: string;
  volumeText?: string;
  quantityText?: string;
  cargoDescription?: string;
  cargoPhotoCount?: number;
  cargoPhotoFiles?: FileAttachmentRef[];
  vehicleRequirement: string;
  vehicleLengthText?: string;
  vehicleExtraRequirementsText?: string;
  priceText: string;
  couponId?: string;
  originalPriceText?: string;
  couponTitleText?: string;
  couponDiscountText?: string;
  payablePriceText?: string;
  bonusText?: string;
  paymentMethod?: PaymentMethod;
  paymentMethodText?: string;
  paymentStatus?: OrderPaymentStatus;
  paymentChannel?: PaymentChannel;
  assignedDriverId?: string;
  paymentSettledAtIso?: string;
  refundedAtIso?: string;
  createdAtIso?: string;
  updatedAtIso?: string;
  updatedAtText: string;
  pickupContact?: string;
  pickupPhone?: string;
  pickupNoteText?: string;
  deliveryContact?: string;
  deliveryPhone?: string;
  deliveryNoteText?: string;
  pickupTimeIso?: string;
  pickupTimeText?: string;
  expectedDeliveryTimeText?: string;
  valueAddedServicesText?: string;
  driverInfo?: DriverInfo;
  driverQuotes?: DriverQuote[];
  exceptionReport?: {
    typeLabel: string;
    description: string;
    statusText?: string;
    photoCount?: number;
    photoFiles?: FileAttachmentRef[];
  };
  modificationRequest?: {
    description: string;
    statusText: string;
    impactText: string;
    costImpactText?: string;
    refundText?: string;
    driverNoticeText?: string;
    reviewResultText?: string;
  };
  cancellation?: {
    reasonText: string;
    description: string;
    feeText: string;
    settlementText?: string;
    refundText?: string;
    reviewStatusText?: string;
    driverNoticeText?: string;
  };
  evaluation?: {
    rating: number;
    tags: string[];
    content: string;
    anonymous?: boolean;
    photoCount?: number;
    photoFiles?: FileAttachmentRef[];
  };
  latestExceptionCase?: RecentOrderLatestExceptionCase;
  reorderSource?: {
    orderId: string;
    copiedAtText: string;
    noteText: string;
  };
  syncState?: OrderSyncState;
};

export type FileAttachmentRef = {
  fileId: string;
  fileName: string;
  purpose:
    | 'identity'
    | 'cargo'
    | 'exception'
    | 'evaluation'
    | 'receipt'
    | 'invoice';
  status: 'pending' | 'uploaded' | 'rejected';
  objectKey?: string;
  publicUrl?: string;
};

export type CargoTypeOption = {
  id: 'build' | 'food' | 'home' | 'chemistry' | 'digital' | 'daily' | 'other';
  label: string;
};

export type VehicleRequirementOption = {
  id: 'small' | 'medium' | 'large' | 'box' | 'flat';
  label: string;
};

export type VehicleLengthRequirementOption = {
  id: 'unlimited' | '3m' | '4m' | '6m' | '9m';
  label: string;
};

export type ValueAddedServiceOption = {
  id: 'loading' | 'insurance' | 'protection';
  label: string;
};

export type PricingMode = 'fixed' | 'negotiable';

export type PaymentMethod = 'cod' | 'online';

export type DraftOrderInput = {
  cargoType: CargoTypeOption['id'];
  weightText: string;
  volumeText?: string;
  quantityText: string;
  cargoDescription: string;
  cargoPhotoCount?: number;
  cargoPhotoFiles?: FileAttachmentRef[];
  pickupAddress: string;
  pickupNoteText?: string;
  pickupContact: string;
  pickupPhone: string;
  deliveryAddress: string;
  deliveryNoteText?: string;
  deliveryContact: string;
  deliveryPhone: string;
  vehicleRequirement: VehicleRequirementOption['id'];
  vehicleLengthRequirement: VehicleLengthRequirementOption['id'];
  needTailboard: boolean;
  needTarp: boolean;
  pickupTimeText: string;
  expectedDeliveryTimeText?: string;
  valueAddedServiceIds: ValueAddedServiceOption['id'][];
  loadingWorkerCount?: number;
  insuredValueText?: string;
  pricingMode: PricingMode;
  priceText: string;
  paymentMethod: PaymentMethod;
  couponId?: string;
  couponTitleText?: string;
  couponDiscountText?: string;
  payablePriceText?: string;
  reorderSourceOrderId?: string;
};

export type DraftOrderPrefill = Partial<DraftOrderInput> & {
  noticeText?: string;
  editingOrderId?: string;
};

export type RootScreen =
  | 'onboarding'
  | 'auth'
  | 'driver-home'
  | 'home'
  | 'network-error'
  | 'order-draft'
  | 'order-detail'
  | 'orders';

export type OrderDetailReturnTarget = 'home' | 'orders' | 'messages';

export type HomeSupportView = 'home' | 'messages' | 'help' | 'profile';

export type AuthMode = 'login' | 'register';

export type OrderListFilter =
  | 'all'
  | 'waiting'
  | 'active'
  | 'confirming'
  | 'completed'
  | 'cancelled';

export type MessageCenterItem = {
  id: string;
  category: 'order' | 'system' | 'service';
  title: string;
  content: string;
  timeText: string;
  unread: boolean;
};

export type HelpTopic = {
  id: string;
  phase: string;
  title: string;
  answer: string;
};

export type ServiceChannel = {
  id: string;
  name: string;
  description: string;
  availabilityText: string;
  phoneNumber?: string;
};

export type SupportTicketStatusHistoryItem = {
  actionText: string;
  timestampText: string;
  timestampIso?: string;
};

export type SupportTicket = {
  id: string;
  channelName: string;
  description: string;
  statusText: string;
  createdAtText: string;
  createdAtIso?: string;
  statusHistory?: SupportTicketStatusHistoryItem[];
};
