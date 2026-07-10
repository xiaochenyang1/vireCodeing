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

export type IssueShipperCouponRequest = {
  shipperId: string;
  title: string;
  conditionText: string;
  discountCents: number;
  minOrderAmountCents: number;
  validFromIso: string;
  validUntilIso: string;
  sourceText?: string;
};
