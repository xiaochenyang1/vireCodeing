import { ApiErrorCode, BusinessError } from '../common/errors';
import {
  InMemoryProfileInvoicesRepository,
  PrismaProfileInvoicesRepository,
} from './profile-invoices.repository';
import { ProfileInvoicesService } from './profile-invoices.service';

describe('ProfileInvoicesService', () => {
  it('returns an empty invoice application list when the current shipper has no saved applications', async () => {
    const repository = new InMemoryProfileInvoicesRepository();
    const service = new ProfileInvoicesService(repository);

    await expect(service.listApplications('shipper-1')).resolves.toEqual([]);
  });

  it('creates and lists the current shipper invoice application with derived amount and order numbers', async () => {
    const repository = new InMemoryProfileInvoicesRepository(
      () => new Date('2026-07-09T09:00:00.000Z'),
      {
        orders: [
          createCompletedOrder({
            id: 'order-1',
            orderNo: 'HY202607090001',
            priceCents: 31000,
          }),
          createCompletedOrder({
            id: 'order-2',
            orderNo: 'HY202607090002',
            priceCents: 28000,
            payablePriceCents: 26000,
          }),
        ],
        enterpriseVerifications: {
          'shipper-1': { status: 'reviewing' },
        },
      },
    );
    const service = new ProfileInvoicesService(repository);

    await expect(
      service.createApplication('shipper-1', {
        invoiceType: 'vat-special',
        invoiceTitleType: 'enterprise',
        invoiceTitle: '深圳晨星贸易有限公司',
        receiverEmail: 'finance@chenxing.example',
        orderIds: ['order-1', 'order-2'],
      }),
    ).resolves.toMatchObject({
      shipperId: 'shipper-1',
      invoiceType: 'vat-special',
      invoiceTitleType: 'enterprise',
      invoiceTitle: '深圳晨星贸易有限公司',
      receiverEmail: 'finance@chenxing.example',
      orderIds: ['order-1', 'order-2'],
      orderNos: ['HY202607090001', 'HY202607090002'],
      amountCents: 57000,
      status: 'reviewing',
    });

    await expect(service.listApplications('shipper-1')).resolves.toEqual([
      expect.objectContaining({
        orderIds: ['order-1', 'order-2'],
        amountCents: 57000,
      }),
    ]);
  });

  it('rejects invoice applications that include non-completed orders', async () => {
    const repository = new InMemoryProfileInvoicesRepository(() => new Date(), {
      orders: [
        createCompletedOrder({
          id: 'order-1',
          orderNo: 'HY202607090001',
          status: 'transporting',
          priceCents: 31000,
        }),
      ],
    });
    const service = new ProfileInvoicesService(repository);

    await expect(
      service.createApplication('shipper-1', {
        invoiceType: 'normal',
        invoiceTitleType: 'personal',
        invoiceTitle: '晨星货主',
        receiverEmail: 'finance@chenxing.example',
        orderIds: ['order-1'],
      }),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '仅已完成订单可申请发票',
      ),
    );
  });

  it('rejects vat-special applications when the shipper has no usable enterprise verification snapshot', async () => {
    const repository = new InMemoryProfileInvoicesRepository(() => new Date(), {
      orders: [
        createCompletedOrder({
          id: 'order-1',
          orderNo: 'HY202607090001',
          priceCents: 31000,
        }),
      ],
      enterpriseVerifications: {
        'shipper-1': { status: 'rejected', rejectionReason: '资料不完整' },
      },
    });
    const service = new ProfileInvoicesService(repository);

    await expect(
      service.createApplication('shipper-1', {
        invoiceType: 'vat-special',
        invoiceTitleType: 'enterprise',
        invoiceTitle: '深圳晨星贸易有限公司',
        receiverEmail: 'finance@chenxing.example',
        orderIds: ['order-1'],
      }),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.VALIDATION_ERROR,
        '增值税专用发票需先提交企业认证资料',
      ),
    );
  });

  it('rejects occupied orders from reviewing applications but allows rejected applications to reuse the order ids', async () => {
    const repository = new InMemoryProfileInvoicesRepository(
      () => new Date('2026-07-09T09:00:00.000Z'),
      {
        applications: [
          {
            id: 'invoice-1',
            shipperId: 'shipper-1',
            invoiceType: 'normal',
            invoiceTitleType: 'personal',
            invoiceTitle: '晨星货主',
            receiverEmail: 'finance@chenxing.example',
            orderIds: ['order-1'],
            orderNos: ['HY202607090001'],
            amountCents: 31000,
            status: 'reviewing',
            createdAtIso: '2026-07-09T08:00:00.000Z',
            updatedAtIso: '2026-07-09T08:00:00.000Z',
          },
          {
            id: 'invoice-2',
            shipperId: 'shipper-1',
            invoiceType: 'normal',
            invoiceTitleType: 'personal',
            invoiceTitle: '晨星货主',
            receiverEmail: 'finance@chenxing.example',
            orderIds: ['order-2'],
            orderNos: ['HY202607090002'],
            amountCents: 26000,
            status: 'rejected',
            rejectionReason: '抬头不完整',
            createdAtIso: '2026-07-09T07:00:00.000Z',
            updatedAtIso: '2026-07-09T07:30:00.000Z',
          },
        ],
        orders: [
          createCompletedOrder({
            id: 'order-1',
            orderNo: 'HY202607090001',
            priceCents: 31000,
          }),
          createCompletedOrder({
            id: 'order-2',
            orderNo: 'HY202607090002',
            priceCents: 26000,
          }),
        ],
      },
    );
    const service = new ProfileInvoicesService(repository);

    await expect(
      service.createApplication('shipper-1', {
        invoiceType: 'normal',
        invoiceTitleType: 'personal',
        invoiceTitle: '晨星货主',
        receiverEmail: 'finance@chenxing.example',
        orderIds: ['order-1'],
      }),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.ORDER_STATE_INVALID, '订单已存在开票申请'),
    );

    await expect(
      service.createApplication('shipper-1', {
        invoiceType: 'normal',
        invoiceTitleType: 'personal',
        invoiceTitle: '晨星货主',
        receiverEmail: 'finance@chenxing.example',
        orderIds: ['order-2'],
      }),
    ).resolves.toMatchObject({
      orderIds: ['order-2'],
      status: 'reviewing',
    });
  });

  it('allows only one concurrent invoice application to occupy the same order', async () => {
    const repository = new InMemoryProfileInvoicesRepository(
      () => new Date('2026-07-15T08:00:00.000Z'),
      {
        orders: [
          createCompletedOrder({
            id: 'order-1',
            orderNo: 'HY202607150001',
            priceCents: 31000,
          }),
        ],
      },
    );
    const service = new ProfileInvoicesService(repository);
    const request = {
      invoiceType: 'normal' as const,
      invoiceTitleType: 'personal' as const,
      invoiceTitle: '晨星货主',
      receiverEmail: 'finance@chenxing.example',
      orderIds: ['order-1'],
    };

    const results = await Promise.allSettled([
      service.createApplication('shipper-1', request),
      service.createApplication('shipper-1', request),
    ]);

    expect(results.map(result => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    const rejected = results.find(result => result.status === 'rejected');
    expect(rejected).toMatchObject({
      reason: new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '订单已存在开票申请',
      ),
    });
    await expect(repository.listApplications('shipper-1')).resolves.toHaveLength(
      1,
    );
  });

  it('uses the settled financial snapshot instead of mutable order prices', async () => {
    const repository = new InMemoryProfileInvoicesRepository(
      () => new Date('2026-07-15T08:00:00.000Z'),
      {
        orders: [
          createCompletedOrder({
            id: 'order-1',
            orderNo: 'HY202607150001',
            priceCents: 999999,
            payablePriceCents: 888888,
            paymentStatus: 'settled',
            settlementAmountCents: 31000,
          }),
        ],
      },
    );
    const service = new ProfileInvoicesService(repository);

    await expect(
      service.createApplication('shipper-1', {
        invoiceType: 'normal',
        invoiceTitleType: 'personal',
        invoiceTitle: '晨星货主',
        receiverEmail: 'finance@chenxing.example',
        orderIds: ['order-1'],
      }),
    ).resolves.toMatchObject({
      orderIds: ['order-1'],
      amountCents: 31000,
      status: 'reviewing',
    });
  });

  it.each([
    [
      'legacy order',
      { paymentStatus: 'legacy_unverified' as const },
    ],
    [
      'fully refunded order',
      {
        paymentStatus: 'settled' as const,
        settlementAmountCents: 31000,
        succeededRefundAmountCents: 31000,
      },
    ],
  ])('rejects an ineligible %s', async (_label, financialOverrides) => {
    const repository = new InMemoryProfileInvoicesRepository(() => new Date(), {
      orders: [
        createCompletedOrder({
          id: 'order-1',
          orderNo: 'HY202607150001',
          priceCents: 31000,
          settlementAmountCents: 31000,
          ...financialOverrides,
        }),
      ],
    });
    const service = new ProfileInvoicesService(repository);

    await expect(
      service.createApplication('shipper-1', {
        invoiceType: 'normal',
        invoiceTitleType: 'personal',
        invoiceTitle: '晨星货主',
        receiverEmail: 'finance@chenxing.example',
        orderIds: ['order-1'],
      }),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '仅已结算且未全额退款订单可申请发票',
      ),
    );
  });

  it('locks selected order rows before checking Prisma eligibility and occupancy', async () => {
    const createdAt = new Date('2026-07-15T08:00:00.000Z');
    const transaction = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'order-1' }]),
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'order-1',
            shipperId: 'shipper-1',
            orderNo: 'HY202607150001',
            status: 'completed',
            paymentStatus: 'settled',
            settlement: { grossAmountCents: 31000 },
            paymentOrders: [{ amountCents: 999999 }],
            refunds: [],
          },
        ]),
      },
      shipperInvoiceApplication: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'invoice-1',
          shipperId: 'shipper-1',
          invoiceType: 'normal',
          invoiceTitleType: 'personal',
          invoiceTitle: '晨星货主',
          receiverEmail: 'finance@chenxing.example',
          orderIds: ['order-1'],
          orderNos: ['HY202607150001'],
          amountCents: 31000,
          status: 'reviewing',
          rejectionReason: null,
          createdAt,
          updatedAt: createdAt,
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(transaction)),
      shipperInvoiceApplication: { findMany: jest.fn() },
      shipperEnterpriseVerification: { findUnique: jest.fn() },
    };
    const repository = new PrismaProfileInvoicesRepository(prisma);
    const input = {
      invoiceType: 'normal' as const,
      invoiceTitleType: 'personal' as const,
      invoiceTitle: '晨星货主',
      receiverEmail: 'finance@chenxing.example',
      orderIds: ['order-1'],
    };

    await expect(
      repository.createEligibleApplication('shipper-1', input),
    ).resolves.toMatchObject({
      kind: 'success',
      application: { id: 'invoice-1', amountCents: 31000 },
    });
    expect(transaction.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT "id" FROM "Order" WHERE "shipperId" = $1 AND "id" = ANY($2::text[]) ORDER BY "id" FOR UPDATE',
      'shipper-1',
      ['order-1'],
    );
    expect(transaction.order.findMany).toHaveBeenCalledWith({
      where: {
        shipperId: 'shipper-1',
        id: { in: ['order-1'] },
      },
      select: {
        id: true,
        shipperId: true,
        orderNo: true,
        status: true,
        paymentStatus: true,
        settlement: { select: { grossAmountCents: true } },
        paymentOrders: {
          where: { status: 'settled' },
          select: { amountCents: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        refunds: {
          where: { status: 'succeeded' },
          select: { amountCents: true },
        },
      },
    });
    expect(transaction.shipperInvoiceApplication.findFirst).toHaveBeenCalledWith(
      {
        where: {
          shipperId: 'shipper-1',
          status: { not: 'rejected' },
          OR: [
            { orderIds: { array_contains: ['order-1'] } },
          ],
        },
        select: { id: true },
      },
    );
    expect(transaction.shipperInvoiceApplication.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderIds: ['order-1'],
        orderNos: ['HY202607150001'],
        amountCents: 31000,
      }),
    });
    expect(
      transaction.$queryRawUnsafe.mock.invocationCallOrder[0],
    ).toBeLessThan(transaction.order.findMany.mock.invocationCallOrder[0]);
  });
});

function createCompletedOrder(
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
    priceCents: number;
    payablePriceCents: number;
    paymentStatus:
      | 'not_required'
      | 'pending'
      | 'escrowed'
      | 'settled'
      | 'failed'
      | 'cancelled'
      | 'refund_pending'
      | 'refunded'
      | 'refund_failed'
      | 'legacy_unverified';
    settlementAmountCents: number;
    paymentAmountCents: number;
    succeededRefundAmountCents: number;
  }>,
) {
  const settlementAmountCents =
    overrides.settlementAmountCents ??
    overrides.payablePriceCents ??
    overrides.priceCents;

  return {
    id: 'order-1',
    shipperId: 'shipper-1',
    orderNo: 'HY202607090001',
    status: 'completed' as const,
    paymentStatus: 'settled' as const,
    ...(settlementAmountCents !== undefined ? { settlementAmountCents } : {}),
    ...overrides,
  };
}
