import type { CouponItem } from './profileLocalState';
import type { PlatformProfileCouponWallet } from '../services/platformProfileApi';

export type CouponFilter = 'all' | 'usable' | 'used' | 'expired';

export type UsedCouponChanges = {
  coupons: CouponItem[];
  noticeText: string;
};

export type OrderCouponUsageChanges = {
  coupons: CouponItem[];
};

export type OrderCouponUsageInput = {
  orderId: string;
  couponId?: string;
  previousCouponId?: string;
};

export function createLocalCouponsFromPlatformWallet(
  wallet: PlatformProfileCouponWallet,
): CouponItem[] {
  return wallet.items.map(item => ({
    id: item.id,
    title: item.title,
    statusText: getLocalCouponStatusText(item.status),
    conditionText: item.conditionText,
    validUntilText: getLocalCouponValidityText(item),
    sourceText: item.sourceText,
  }));
}

export function filterCoupons(coupons: CouponItem[], filter: CouponFilter) {
  return coupons.filter(item => {
    if (filter === 'usable') {
      return item.statusText === '可使用';
    }

    if (filter === 'used') {
      return item.statusText === '已使用';
    }

    if (filter === 'expired') {
      return item.statusText === '已过期';
    }

    return true;
  });
}

export function createUsedCouponChanges(
  coupons: CouponItem[],
  couponId: string,
): UsedCouponChanges | undefined {
  const targetCoupon = coupons.find(item => item.id === couponId);

  if (!targetCoupon || targetCoupon.statusText !== '可使用') {
    return undefined;
  }

  return {
    coupons: coupons.map(item =>
      item.id === couponId ? { ...item, statusText: '已使用' } : item,
    ),
    noticeText: `优惠券已使用：${targetCoupon.title}`,
  };
}

export function createOrderCouponUsageChanges(
  coupons: CouponItem[],
  { orderId, couponId, previousCouponId }: OrderCouponUsageInput,
): OrderCouponUsageChanges | undefined {
  if (!couponId && !previousCouponId) {
    return undefined;
  }

  return {
    coupons: coupons.map(item => {
      if (previousCouponId === item.id && previousCouponId !== couponId) {
        return {
          ...item,
          statusText: '可使用',
          validUntilText: `已从订单 ${orderId} 取消使用`,
          sourceText: '本地发单释放',
        };
      }

      if (couponId === item.id) {
        return {
          ...item,
          statusText: '已使用',
          validUntilText: `已用于订单 ${orderId}`,
          sourceText: '本地发单使用',
        };
      }

      return item;
    }),
  };
}

function getLocalCouponStatusText(
  status: PlatformProfileCouponWallet['items'][number]['status'],
) {
  if (status === 'used') {
    return '已使用';
  }

  if (status === 'locked') {
    return '已锁定';
  }

  if (status === 'expired') {
    return '已过期';
  }

  return '可使用';
}

function getLocalCouponValidityText(
  item: PlatformProfileCouponWallet['items'][number],
) {
  if (item.status === 'used' && item.usedOrderNo) {
    return `已用于订单 ${item.usedOrderNo}`;
  }

  if (item.status === 'locked' && item.lockedOrderNo) {
    return `已锁定订单 ${item.lockedOrderNo}`;
  }

  return `有效期至 ${item.validUntilIso.slice(0, 10)}`;
}
