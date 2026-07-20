import {
  InMemoryProfileSpendingRepository,
} from './profile-spending.repository';
import { ProfileSpendingService } from './profile-spending.service';
import type { ShipperSpendingFinancialRecord } from './dto';

describe('ProfileSpendingService', () => {
  it('builds spending totals only from payment, settlement and refund facts', async () => {
    const repository = new InMemoryProfileSpendingRepository({
      financialRecords: [
        createFinancialRecord({
          id: 'order-settled',
          orderNo: 'HY202607150001',
          status: 'completed',
          paymentMethod: 'cod',
          paymentStatus: 'settled',
          priceCents: 999999,
          settlement: {
            grossAmountCents: 31000,
            settledAtIso: '2026-07-15T08:00:00.000Z',
          },
        }),
        createFinancialRecord({
          id: 'order-escrowed',
          orderNo: 'HY202607150002',
          status: 'loading',
          paymentMethod: 'online',
          paymentStatus: 'escrowed',
          payablePriceCents: 888888,
          payment: {
            channel: 'wechat',
            amountCents: 52000,
            status: 'escrowed',
            paidAtIso: '2026-07-15T07:00:00.000Z',
            createdAtIso: '2026-07-15T06:55:00.000Z',
          },
        }),
        createFinancialRecord({
          id: 'order-refunded',
          orderNo: 'HY202607150003',
          status: 'cancelled',
          paymentMethod: 'online',
          paymentStatus: 'refunded',
          payment: {
            channel: 'alipay',
            amountCents: 26000,
            status: 'refunded',
            paidAtIso: '2026-07-14T07:00:00.000Z',
            createdAtIso: '2026-07-14T06:55:00.000Z',
          },
          refund: {
            amountCents: 26000,
            status: 'succeeded',
            succeededAtIso: '2026-07-15T06:00:00.000Z',
            updatedAtIso: '2026-07-15T06:00:00.000Z',
          },
        }),
        createFinancialRecord({
          id: 'order-cancelled-unpaid',
          orderNo: 'HY202607150004',
          status: 'cancelled',
          paymentMethod: 'online',
          paymentStatus: 'cancelled',
          priceCents: 45000,
        }),
        createFinancialRecord({
          id: 'order-legacy',
          orderNo: 'HY202607150005',
          status: 'completed',
          paymentMethod: 'cod',
          paymentStatus: 'legacy_unverified',
          priceCents: 73000,
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
          orderId: 'order-settled',
          amountCents: 31000,
          paymentStatus: 'settled',
          settledAtIso: '2026-07-15T08:00:00.000Z',
          occurredAtIso: '2026-07-15T08:00:00.000Z',
        }),
        expect.objectContaining({
          orderId: 'order-escrowed',
          amountCents: 52000,
          paymentStatus: 'escrowed',
          paymentChannel: 'wechat',
          paymentOrderStatus: 'escrowed',
          paidAtIso: '2026-07-15T07:00:00.000Z',
        }),
        expect.objectContaining({
          orderId: 'order-refunded',
          amountCents: 26000,
          paymentStatus: 'refunded',
          paymentChannel: 'alipay',
          refundStatus: 'succeeded',
          refundedAtIso: '2026-07-15T06:00:00.000Z',
        }),
      ],
    });
  });

});

function createFinancialRecord(
  overrides: Partial<ShipperSpendingFinancialRecord> = {},
): ShipperSpendingFinancialRecord {
  return {
    id: 'order-1',
    shipperId: 'shipper-1',
    orderNo: 'HY202607150001',
    status: 'completed',
    paymentMethod: 'online',
    paymentStatus: 'settled',
    updatedAtIso: '2026-07-15T08:00:00.000Z',
    pickupAddress: '宝安仓库',
    deliveryAddress: '南山门店',
    ...overrides,
  };
}
