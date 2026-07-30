import {
  PrismaProfileSpendingRepository,
  type PrismaProfileSpendingClient,
} from './profile-spending.repository';

const NOW = new Date('2026-07-30T08:00:00.000Z');

describe('PrismaProfileSpendingRepository', () => {
  it('aggregates all succeeded refunds and preserves the latest refund status', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'order-1',
        shipperId: 'shipper-1',
        orderNo: 'HY202607300001',
        status: 'loading',
        paymentMethod: 'online',
        paymentStatus: 'escrowed',
        priceCents: 76000,
        payablePriceCents: 64000,
        couponTitle: null,
        couponDiscountCents: null,
        updatedAt: NOW,
        locations: [],
        paymentOrders: [
          {
            channel: 'wechat',
            amountCents: 76000,
            status: 'escrowed',
            paidAt: NOW,
            createdAt: NOW,
          },
        ],
        settlement: null,
        refunds: [
          {
            amountCents: 6000,
            status: 'pending',
            succeededAt: null,
            failedAt: null,
            updatedAt: new Date('2026-07-30T07:30:00.000Z'),
          },
          {
            amountCents: 4000,
            status: 'succeeded',
            succeededAt: new Date('2026-07-30T07:00:00.000Z'),
            failedAt: null,
            updatedAt: new Date('2026-07-30T07:00:00.000Z'),
          },
          {
            amountCents: 2000,
            status: 'succeeded',
            succeededAt: new Date('2026-07-30T06:00:00.000Z'),
            failedAt: null,
            updatedAt: new Date('2026-07-30T06:00:00.000Z'),
          },
        ],
      },
    ]);
    const repository = new PrismaProfileSpendingRepository({
      order: { findMany },
    } as PrismaProfileSpendingClient);

    await expect(repository.listFinancialRecords('shipper-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'order-1',
        refund: {
          amountCents: 6000,
          status: 'pending',
          succeededAtIso: '2026-07-30T07:00:00.000Z',
          updatedAtIso: '2026-07-30T07:30:00.000Z',
        },
      }),
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          refunds: expect.not.objectContaining({ take: expect.anything() }),
        }),
      }),
    );
  });
});
