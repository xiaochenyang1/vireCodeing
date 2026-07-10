import {
  createLocalOrder,
  createOrderUpdateFromDraft,
  createPrefillFromOrder,
  isValidLocalPickupTimeText,
} from '../src/utils/order';
import type { DraftOrderInput } from '../src/types';

test('accepts two-digit relative pickup hours inside local publish window', () => {
  const now = new Date(2026, 5, 30, 8, 0).getTime();

  expect(isValidLocalPickupTimeText('今天 10:30', now)).toBe(true);
});

test('prefills negotiable orders as negotiable drafts', () => {
  const draftPrefill = createPrefillFromOrder({
    id: 'HYLOCAL009',
    status: 'waiting',
    from: '宝安临时仓',
    to: '南山门店',
    cargoType: '数码',
    weightText: '1.8 吨',
    quantityText: '18 箱',
    vehicleRequirement: '中型货车',
    priceText: '司机报价',
    updatedAtText: '刚刚发布',
    pickupContact: '赵经理',
    pickupPhone: '13800138001',
    deliveryContact: '钱店长',
    deliveryPhone: '13800138002',
    pickupTimeText: '明天 09:30',
  });

  expect(draftPrefill.pricingMode).toBe('negotiable');
  expect(draftPrefill.priceText).toBe('');
});

test('stores structured local order timestamps for list filtering', () => {
  const now = new Date('2026-06-30T08:00:00+08:00').getTime();
  const draftOrder = createDraftOrder({ pickupTimeText: '明天 09:30' });
  const order = createLocalOrder(draftOrder, [], now);
  const update = createOrderUpdateFromDraft(
    createDraftOrder({ pickupTimeText: '后天 10:00' }),
    now,
  );

  expect(order.createdAtIso).toBe(new Date(now).toISOString());
  expect(order.updatedAtIso).toBe(new Date(now).toISOString());
  expect(order.syncState?.updatedAtIso).toBe(new Date(now).toISOString());
  expect(order.syncState?.queueItems?.[0].updatedAtIso).toBe(
    new Date(now).toISOString(),
  );
  expect(new Date(order.pickupTimeIso ?? '').getTime()).toBe(
    new Date(2026, 6, 1, 9, 30).getTime(),
  );
  expect(update.createdAtIso).toBeUndefined();
  expect(update.updatedAtIso).toBe(new Date(now).toISOString());
  expect(update.syncState?.updatedAtIso).toBe(new Date(now).toISOString());
  expect(update.syncState?.queueItems?.[0].updatedAtIso).toBe(
    new Date(now).toISOString(),
  );
  expect(new Date(update.pickupTimeIso ?? '').getTime()).toBe(
    new Date(2026, 6, 2, 10, 0).getTime(),
  );
});

test('uses payable price as local order display price when applying a coupon', () => {
  const draftOrder = createDraftOrder({
    priceText: '760',
    couponId: 'coupon-1',
    couponTitleText: '满 300 减 30',
    couponDiscountText: '-￥30',
    payablePriceText: '￥730',
  });

  const order = createLocalOrder(draftOrder, [], Date.now());
  const update = createOrderUpdateFromDraft(draftOrder, Date.now());

  expect(order).toMatchObject({
    priceText: '￥730',
    originalPriceText: '￥760',
    couponTitleText: '满 300 减 30',
    couponDiscountText: '-￥30',
    payablePriceText: '￥730',
  });
  expect(update).toMatchObject({
    priceText: '￥730',
    originalPriceText: '￥760',
    couponTitleText: '满 300 减 30',
    couponDiscountText: '-￥30',
    payablePriceText: '￥730',
  });
});

test('drops stale coupon amounts when creating or updating negotiable orders', () => {
  const draftOrder = createDraftOrder({
    pricingMode: 'negotiable',
    priceText: '',
    couponId: 'coupon-1',
    couponTitleText: '满 300 减 30',
    couponDiscountText: '-￥30',
    payablePriceText: '￥730',
  });

  const order = createLocalOrder(draftOrder, [], Date.now());
  const update = createOrderUpdateFromDraft(draftOrder, Date.now());

  expect(order).toMatchObject({
    priceText: '司机报价',
    couponId: undefined,
    originalPriceText: undefined,
    couponTitleText: undefined,
    couponDiscountText: undefined,
    payablePriceText: undefined,
  });
  expect(update).toMatchObject({
    priceText: '司机报价',
    couponId: undefined,
    originalPriceText: undefined,
    couponTitleText: undefined,
    couponDiscountText: undefined,
    payablePriceText: undefined,
  });
});

function createDraftOrder(
  overrides: Partial<DraftOrderInput> = {},
): DraftOrderInput {
  return {
    cargoType: 'build',
    weightText: '2 吨',
    quantityText: '10 件',
    cargoDescription: '建材',
    pickupAddress: '深圳南山仓',
    pickupContact: '赵经理',
    pickupPhone: '13800138001',
    deliveryAddress: '广州天河店',
    deliveryContact: '钱店长',
    deliveryPhone: '13800138002',
    vehicleRequirement: 'medium',
    vehicleLengthRequirement: '4m',
    needTailboard: false,
    needTarp: false,
    pickupTimeText: '明天 09:30',
    valueAddedServiceIds: [],
    pricingMode: 'fixed',
    priceText: '1800',
    paymentMethod: 'online',
    ...overrides,
  };
}
