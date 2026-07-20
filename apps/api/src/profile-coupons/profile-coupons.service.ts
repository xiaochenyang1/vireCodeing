import type {
  AdminShipperCouponReportQuery,
  AdminShipperCouponReportResult,
  AdminShipperCouponReportSourceBreakdownItem,
  AdminShipperCouponReportSummary,
  AdminShipperCouponReportTopShipperItem,
  BatchIssueShipperCouponsRequest,
  BatchIssueShipperCouponsResult,
  IssueShipperCouponRequest,
  ShipperCouponRecord,
  ShipperCouponWallet,
} from './dto';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type { ProfileCouponsRepository } from './profile-coupons.repository';

export class ProfileCouponsService {
  constructor(
    private readonly repository: ProfileCouponsRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listCoupons(shipperId: string): Promise<ShipperCouponWallet> {
    const items = await this.repository.listCoupons(shipperId);

    return {
      shipperId,
      summary: createSummary(items),
      items,
    };
  }

  async issueCoupon(
    _adminId: string,
    input: IssueShipperCouponRequest,
  ): Promise<ShipperCouponRecord> {
    return this.repository.createCoupon(normalizeIssueCouponInput(input), new Date());
  }

  async batchIssueCoupons(
    _adminId: string,
    input: BatchIssueShipperCouponsRequest,
  ): Promise<BatchIssueShipperCouponsResult> {
    const issuedAt = new Date();
    const coupons = await this.repository.createCoupons(
      input.shipperIds.map(shipperId =>
        normalizeIssueCouponInput({
          shipperId,
          title: input.title,
          conditionText: input.conditionText,
          discountCents: input.discountCents,
          minOrderAmountCents: input.minOrderAmountCents,
          validFromIso: input.validFromIso,
          validUntilIso: input.validUntilIso,
          sourceText: input.sourceText,
        }),
      ),
      issuedAt,
    );

    return {
      requestedCount: input.shipperIds.length,
      issuedCount: coupons.length,
      coupons,
    };
  }

  async getAdminCouponReport(
    input: AdminShipperCouponReportQuery,
  ): Promise<AdminShipperCouponReportResult> {
    const items = await this.repository.listAllCoupons();

    return {
      generatedAtIso: this.now().toISOString(),
      summary: createAdminCouponReportSummary(items),
      sourceBreakdown: createSourceBreakdown(items),
      topShippers: createTopShippers(items, input.topShippersLimit),
    };
  }

  async lockCoupon(shipperId: string, couponId: string, orderNo?: string) {
    const coupon = await this.repository.lockCoupon(
      shipperId,
      couponId,
      new Date(),
      orderNo,
    );

    if (!coupon) {
      throw new BusinessError(
        ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
        '优惠券不可用',
      );
    }

    return coupon;
  }

  async bindLockedCouponToOrder(
    shipperId: string,
    couponId: string,
    orderNo: string,
  ) {
    const coupon = await this.repository.bindLockedCouponToOrder(
      shipperId,
      couponId,
      orderNo,
    );

    if (!coupon) {
      throw new BusinessError(
        ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
        '优惠券不可用',
      );
    }

    return coupon;
  }

  async releaseCoupon(shipperId: string, couponId: string, orderNo?: string) {
    return this.repository.releaseCoupon(shipperId, couponId, orderNo);
  }

  async redeemCoupon(shipperId: string, couponId: string, orderNo: string) {
    const coupon = await this.repository.redeemCoupon(
      shipperId,
      couponId,
      orderNo,
      new Date(),
    );

    if (!coupon) {
      throw new BusinessError(
        ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
        '优惠券不可用',
      );
    }

    return coupon;
  }
}

function createSummary(items: ShipperCouponRecord[]) {
  const summary = createAdminCouponReportSummary(items);

  return {
    usableCount: summary.usableCount,
    lockedCount: summary.lockedCount,
    usedCount: summary.usedCount,
    expiredCount: summary.expiredCount,
  };
}

function normalizeIssueCouponInput(
  input: IssueShipperCouponRequest,
): IssueShipperCouponRequest {
  return {
    ...input,
    sourceText: input.sourceText ?? '后台手工发放',
  };
}

function createAdminCouponReportSummary(
  items: ShipperCouponRecord[],
): AdminShipperCouponReportSummary {
  return items.reduce<AdminShipperCouponReportSummary>((summary, item) => {
    summary.totalCount += 1;
    summary.totalDiscountCents += item.discountCents;

    if (item.status === 'usable') {
      summary.usableCount += 1;
      return summary;
    }

    if (item.status === 'locked') {
      summary.lockedCount += 1;
      return summary;
    }

    if (item.status === 'used') {
      summary.usedCount += 1;
      summary.redeemedDiscountCents += item.discountCents;
      return summary;
    }

    summary.expiredCount += 1;
    return summary;
  }, createEmptyAdminCouponReportSummary());
}

function createSourceBreakdown(
  items: ShipperCouponRecord[],
): AdminShipperCouponReportSourceBreakdownItem[] {
  const breakdown = new Map<string, AdminShipperCouponReportSourceBreakdownItem>();

  for (const item of items) {
    const existing = breakdown.get(item.sourceText) ?? {
      sourceText: item.sourceText,
      totalCount: 0,
      usedCount: 0,
      redeemedDiscountCents: 0,
    };

    existing.totalCount += 1;
    if (item.status === 'used') {
      existing.usedCount += 1;
      existing.redeemedDiscountCents += item.discountCents;
    }

    breakdown.set(item.sourceText, existing);
  }

  return [...breakdown.values()].sort((left, right) => {
    if (right.totalCount !== left.totalCount) {
      return right.totalCount - left.totalCount;
    }

    if (right.usedCount !== left.usedCount) {
      return right.usedCount - left.usedCount;
    }

    if (right.redeemedDiscountCents !== left.redeemedDiscountCents) {
      return right.redeemedDiscountCents - left.redeemedDiscountCents;
    }

    return left.sourceText.localeCompare(right.sourceText, 'zh-CN');
  });
}

function createTopShippers(
  items: ShipperCouponRecord[],
  topShippersLimit: number,
): AdminShipperCouponReportTopShipperItem[] {
  const grouped = new Map<string, AdminShipperCouponReportTopShipperItem>();

  for (const item of items) {
    const existing = grouped.get(item.shipperId) ?? {
      shipperId: item.shipperId,
      latestIssuedAtIso: item.issuedAtIso,
      ...createEmptyAdminCouponReportSummary(),
    };

    existing.totalCount += 1;
    existing.totalDiscountCents += item.discountCents;
    if (item.issuedAtIso > existing.latestIssuedAtIso) {
      existing.latestIssuedAtIso = item.issuedAtIso;
    }

    if (item.status === 'usable') {
      existing.usableCount += 1;
    } else if (item.status === 'locked') {
      existing.lockedCount += 1;
    } else if (item.status === 'used') {
      existing.usedCount += 1;
      existing.redeemedDiscountCents += item.discountCents;
    } else {
      existing.expiredCount += 1;
    }

    grouped.set(item.shipperId, existing);
  }

  return [...grouped.values()]
    .sort((left, right) => {
      if (right.totalCount !== left.totalCount) {
        return right.totalCount - left.totalCount;
      }

      if (right.redeemedDiscountCents !== left.redeemedDiscountCents) {
        return right.redeemedDiscountCents - left.redeemedDiscountCents;
      }

      if (right.latestIssuedAtIso !== left.latestIssuedAtIso) {
        return right.latestIssuedAtIso.localeCompare(left.latestIssuedAtIso);
      }

      return left.shipperId.localeCompare(right.shipperId, 'zh-CN');
    })
    .slice(0, topShippersLimit);
}

function createEmptyAdminCouponReportSummary(): AdminShipperCouponReportSummary {
  return {
    totalCount: 0,
    usableCount: 0,
    lockedCount: 0,
    usedCount: 0,
    expiredCount: 0,
    totalDiscountCents: 0,
    redeemedDiscountCents: 0,
  };
}
