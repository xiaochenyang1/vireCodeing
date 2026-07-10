import {
  InMemoryProfileSpendingRepository,
} from './profile-spending.repository';
import { ProfileSpendingService } from './profile-spending.service';

describe('ProfileSpendingService', () => {
  it('returns a spending snapshot derived from current shipper orders', async () => {
    const repository = new InMemoryProfileSpendingRepository({
      orders: [
        createOrder({
          id: 'order-waiting',
          shipperId: 'shipper-1',
          orderNo: 'HY202607090004',
          status: 'waiting',
          paymentMethod: 'online',
          priceCents: 76000,
          updatedAtIso: '2026-07-09T10:00:00.000Z',
          pickupAddress: '宝安仓库',
          deliveryAddress: '罗湖门店',
        }),
        createOrder({
          id: 'order-active',
          shipperId: 'shipper-1',
          orderNo: 'HY202607090003',
          status: 'loading',
          paymentMethod: 'online',
          priceCents: 54000,
          payablePriceCents: 52000,
          couponTitle: '满 500 减 20',
          couponDiscountCents: 2000,
          updatedAtIso: '2026-07-09T09:00:00.000Z',
          pickupAddress: '龙华仓库',
          deliveryAddress: '福田门店',
        }),
        createOrder({
          id: 'order-completed',
          shipperId: 'shipper-1',
          orderNo: 'HY202607090002',
          status: 'completed',
          paymentMethod: 'cod',
          priceCents: 31000,
          updatedAtIso: '2026-07-09T08:00:00.000Z',
          pickupAddress: '坪山工厂',
          deliveryAddress: '南山门店',
        }),
        createOrder({
          id: 'order-refund',
          shipperId: 'shipper-1',
          orderNo: 'HY202607090001',
          status: 'cancelled',
          paymentMethod: 'online',
          priceCents: 26000,
          updatedAtIso: '2026-07-08T08:00:00.000Z',
          pickupAddress: '光明仓库',
          deliveryAddress: '前海门店',
        }),
      ],
    });
    const service = new ProfileSpendingService(repository);

    await expect(service.listRecords('shipper-1')).resolves.toEqual({
      shipperId: 'shipper-1',
      summary: {
        completedTotalCents: 31000,
        activeTotalCents: 52000,
        refundTotalCents: 26000,
      },
      items: [
        expect.objectContaining({
          orderId: 'order-waiting',
          orderNo: 'HY202607090004',
          status: 'waiting',
          paymentMethod: 'online',
          amountCents: 76000,
          routeText: '宝安仓库 → 罗湖门店',
          occurredAtIso: '2026-07-09T10:00:00.000Z',
        }),
        expect.objectContaining({
          orderId: 'order-active',
          orderNo: 'HY202607090003',
          status: 'loading',
          paymentMethod: 'online',
          amountCents: 52000,
          priceCents: 54000,
          payablePriceCents: 52000,
          couponTitle: '满 500 减 20',
          couponDiscountCents: 2000,
          routeText: '龙华仓库 → 福田门店',
        }),
        expect.objectContaining({
          orderId: 'order-completed',
          orderNo: 'HY202607090002',
          status: 'completed',
          paymentMethod: 'cod',
          amountCents: 31000,
          routeText: '坪山工厂 → 南山门店',
        }),
        expect.objectContaining({
          orderId: 'order-refund',
          orderNo: 'HY202607090001',
          status: 'cancelled',
          paymentMethod: 'online',
          amountCents: 26000,
          routeText: '光明仓库 → 前海门店',
        }),
      ],
    });
  });

  it('skips orders without payable or original amount when building the spending snapshot', async () => {
    const repository = new InMemoryProfileSpendingRepository({
      orders: [
        createOrder({
          shipperId: 'shipper-1',
          orderNo: 'HY202607090001',
          status: 'completed',
          paymentMethod: 'online',
          updatedAtIso: '2026-07-09T08:00:00.000Z',
        }),
      ],
    });
    const service = new ProfileSpendingService(repository);

    await expect(service.listRecords('shipper-1')).resolves.toEqual({
      shipperId: 'shipper-1',
      summary: {
        completedTotalCents: 0,
        activeTotalCents: 0,
        refundTotalCents: 0,
      },
      items: [],
    });
  });
});

function createOrder(
  overrides: Partial<{
    id: string;
    shipperId: string;
    orderNo: string;
    status:
      | 'waiting'
      | 'loading'
      | 'transporting'
      | 'confirming'
      | 'completed'
      | 'cancelled';
    paymentMethod: 'cod' | 'online';
    priceCents: number;
    payablePriceCents: number;
    couponTitle: string;
    couponDiscountCents: number;
    updatedAtIso: string;
    pickupAddress: string;
    deliveryAddress: string;
  }>,
) {
  return {
    id: 'order-1',
    shipperId: 'shipper-1',
    orderNo: 'HY202607090001',
    status: 'completed' as const,
    paymentMethod: 'online' as const,
    updatedAtIso: '2026-07-09T08:00:00.000Z',
    pickupAddress: '默认装货地',
    deliveryAddress: '默认卸货地',
    ...overrides,
  };
}
