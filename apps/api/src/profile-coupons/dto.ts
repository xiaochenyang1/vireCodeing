export type ShipperCouponStatus = 'usable' | 'locked' | 'used' | 'expired';

export type ShipperCouponRecord = {
  id: string;
  shipperId: string;
  title: string;
  status: ShipperCouponStatus;
  conditionText: string;
  discountCents: number;
  minOrderAmountCents: number;
  validFromIso: string;
  validUntilIso: string;
  sourceText: string;
  issuedAtIso: string;
  lockedOrderNo?: string;
  lockedAtIso?: string;
  usedOrderNo?: string;
  usedAtIso?: string;
};

export type ShipperCouponSummary = {
  usableCount: number;
  lockedCount: number;
  usedCount: number;
  expiredCount: number;
};

export type ShipperCouponWallet = {
  shipperId: string;
  summary: ShipperCouponSummary;
  items: ShipperCouponRecord[];
};

export type ShipperCouponIssueTemplate = {
  title: string;
  conditionText: string;
  discountCents: number;
  minOrderAmountCents: number;
  validFromIso: string;
  validUntilIso: string;
  sourceText?: string;
};

export type IssueShipperCouponRequest = ShipperCouponIssueTemplate & {
  shipperId: string;
};

export type BatchIssueShipperCouponsRequest = ShipperCouponIssueTemplate & {
  shipperIds: string[];
};

export type BatchIssueShipperCouponsResult = {
  requestedCount: number;
  issuedCount: number;
  coupons: ShipperCouponRecord[];
};

export type AdminShipperCouponReportQuery = {
  topShippersLimit: number;
};

export type AdminShipperCouponReportSummary = {
  totalCount: number;
  usableCount: number;
  lockedCount: number;
  usedCount: number;
  expiredCount: number;
  totalDiscountCents: number;
  redeemedDiscountCents: number;
};

export type AdminShipperCouponReportSourceBreakdownItem = {
  sourceText: string;
  totalCount: number;
  usedCount: number;
  redeemedDiscountCents: number;
};

export type AdminShipperCouponReportTopShipperItem =
  AdminShipperCouponReportSummary & {
    shipperId: string;
    latestIssuedAtIso: string;
  };

export type AdminShipperCouponReportResult = {
  generatedAtIso: string;
  summary: AdminShipperCouponReportSummary;
  sourceBreakdown: AdminShipperCouponReportSourceBreakdownItem[];
  topShippers: AdminShipperCouponReportTopShipperItem[];
};
