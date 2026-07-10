import { ApiErrorCode, BusinessError } from '../common/errors';
import {
  InMemoryProfileInvoicesRepository,
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
  }>,
) {
  return {
    id: 'order-1',
    shipperId: 'shipper-1',
    orderNo: 'HY202607090001',
    status: 'completed' as const,
    ...overrides,
  };
}
