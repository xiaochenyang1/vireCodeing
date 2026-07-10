import type {
  IssueShipperCouponRequest,
  ShipperCouponRecord,
  ShipperCouponWallet,
} from './dto';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type { ProfileCouponsRepository } from './profile-coupons.repository';

export class ProfileCouponsService {
  constructor(private readonly repository: ProfileCouponsRepository) {}

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
    return this.repository.createCoupon(
      {
        ...input,
        sourceText: input.sourceText ?? '后台手工发放',
      },
      new Date(),
    );
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
  return items.reduce(
    (summary, item) => {
      if (item.status === 'usable') {
        return { ...summary, usableCount: summary.usableCount + 1 };
      }

      if (item.status === 'locked') {
        return { ...summary, lockedCount: summary.lockedCount + 1 };
      }

      if (item.status === 'used') {
        return { ...summary, usedCount: summary.usedCount + 1 };
      }

      return { ...summary, expiredCount: summary.expiredCount + 1 };
    },
    {
      usableCount: 0,
      lockedCount: 0,
      usedCount: 0,
      expiredCount: 0,
    },
  );
}
