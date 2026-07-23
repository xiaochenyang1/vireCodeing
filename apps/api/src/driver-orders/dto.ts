import type { ShipperOrderRecord } from '../orders/dto';

export type DriverOrderHallQuery = {
  page: number;
  pageSize: number;
  driverLatitude?: number;
  driverLongitude?: number;
  maxDistanceKm?: number;
  vehicleTypePreferences?: string[];
};

export type DriverExecutingOrderStatus = 'loading' | 'transporting' | 'confirming';

export type DriverMyOrdersQuery = {
  statuses: DriverExecutingOrderStatus[];
  page: number;
  pageSize: number;
};

export type DriverQuoteOrderRequest = {
  quoteCents: number;
  arrivalText: string;
  noteText?: string;
};

export type DriverAcceptOrderRequest = {
  baseUpdatedAtIso: string;
  noteText?: string;
};

export type DriverOrderEventSnapshot = {
  driverId: string;
  driverName: string;
  driverPhone: string;
  vehicleType?: string;
  vehicleLengthText?: string;
  plateNumber?: string;
  completedOrderCount: number;
};

export type DriverQuoteOrderEventPayload = DriverQuoteOrderRequest & {
  driverSnapshot?: DriverOrderEventSnapshot;
};

export type DriverAcceptOrderEventPayload = {
  noteText?: string;
  driverSnapshot?: DriverOrderEventSnapshot;
};

export type DriverAdvanceOrderStatusRequest = {
  nextStatus: Extract<DriverExecutingOrderStatus, 'transporting' | 'confirming'>;
  baseUpdatedAtIso: string;
  receiptPhotoFileIds?: string[];
};

export type DriverReplyEvaluationRequest = {
  content: string;
};

export type DriverReportExceptionRequest = {
  typeLabel: string;
  description: string;
  photoCount?: number;
  photoFileIds?: string[];
};

export type DriverEvaluateShipperRequest = {
  rating: number;
  tags: string[];
  content: string;
  anonymous?: boolean;
};

export type DriverIncomeRecord = {
  orderId: string;
  orderNo: string;
  completedAtIso: string;
  routeText: string;
  vehicleType: string;
  grossAmountCents: number;
  platformFeeCents: number;
  netIncomeCents: number;
};

export type DriverIncomeSummary = {
  todayIncomeCents: number;
  weekIncomeCents: number;
  monthIncomeCents: number;
  historyIncomeCents: number;
  pendingSettlementCents: number;
  availableWithdrawalCents: number;
  reviewingWithdrawalCents: number;
  withdrawnCents: number;
  completedOrderCount: number;
};

export type DriverIncomeOverview = {
  driverId: string;
  summary: DriverIncomeSummary;
  records: DriverIncomeRecord[];
};

export type SaveDriverAcceptanceSettingsRequest = {
  isOnline: boolean;
  maxDistanceKm: number;
  vehicleTypePreferences: string[];
};

export type DriverAcceptanceSettingsRecord = {
  driverId: string;
  isOnline: boolean;
  maxDistanceKm: number;
  vehicleTypePreferences: string[];
  createdAtIso: string;
  updatedAtIso: string;
};

export type DriverOrderHallResult = {
  items: ShipperOrderRecord[];
  page: number;
  pageSize: number;
  total: number;
};

export type DriverMyOrdersResult = DriverOrderHallResult;

export type DriverWithdrawalStatus = 'reviewing' | 'paid' | 'rejected';

export type DriverWithdrawalsQuery = {
  page: number;
  pageSize: number;
};

export type CreateDriverWithdrawalRequest = {
  amountCents: number;
  bankAccountName: string;
  bankName: string;
  bankAccountNo: string;
  bankCardId?: string;
};

export type DriverWithdrawalRecord = {
  id: string;
  driverId: string;
  amountCents: number;
  bankAccountName: string;
  bankName: string;
  bankAccountMasked: string;
  status: DriverWithdrawalStatus;
  rejectionReason?: string;
  payoutChannel?: string;
  providerPayoutNo?: string;
  payoutExecutedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type DriverWithdrawalListResult = {
  items: DriverWithdrawalRecord[];
  page: number;
  pageSize: number;
  total: number;
};

export type DriverBankCardRecord = {
  id: string;
  bankAccountName: string;
  bankName: string;
  bankAccountMasked: string;
  isDefault: boolean;
  lastUsedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type CreateDriverBankCardRequest = {
  bankAccountName: string;
  bankName: string;
  bankAccountNo: string;
  isDefault?: boolean;
};

export type UpdateDriverBankCardRequest = {
  bankAccountName?: string;
  bankName?: string;
  bankAccountNo?: string;
  isDefault?: boolean;
};

export type DriverBankCardListResult = {
  items: DriverBankCardRecord[];
  total: number;
};
