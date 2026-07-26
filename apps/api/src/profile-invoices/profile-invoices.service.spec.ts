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

  it('lists and reviews invoice applications for admin', async () => {
    const repository = new InMemoryProfileInvoicesRepository(
      () => new Date('2026-07-24T08:00:00.000Z'),
      {
        orders: [
          createCompletedOrder({
            id: 'order-1',
            orderNo: 'HY202607240001',
            priceCents: 31000,
          }),
        ],
      },
    );
    const service = new ProfileInvoicesService(repository);
    const admin = {
      id: 'admin-1',
      phone: '13900000000',
      userType: 'admin' as const,
    };

    const created = await service.createApplication('shipper-1', {
      invoiceType: 'normal',
      invoiceTitleType: 'personal',
      invoiceTitle: '晨星货主',
      receiverEmail: 'finance@chenxing.example',
      orderIds: ['order-1'],
    });

    await expect(
      service.listAdminApplications(admin, {
        status: 'reviewing',
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: created.id, status: 'reviewing' })],
    });

    await expect(
      service.listAdminApplicationReviewEvents(admin, created.id),
    ).resolves.toEqual([
      expect.objectContaining({
        eventType: 'invoice_application_submitted',
        stage: 'submitted',
        actorUserId: 'shipper-1',
        noteText: '申请开票 ¥310.00，订单 HY202607240001',
      }),
    ]);

    await expect(
      service.reviewApplication(admin, created.id, { status: 'approved' }),
    ).resolves.toMatchObject({
      id: created.id,
      status: 'approved',
    });

    await expect(
      service.listAdminApplicationReviewEvents(admin, created.id),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'invoice_application_approved',
          stage: 'approved',
          actorUserId: 'admin-1',
          reviewerAdminId: 'admin-1',
          fromStatus: 'reviewing',
          toStatus: 'approved',
          noteText: '管理员已通过发票申请',
        }),
        expect.objectContaining({
          eventType: 'invoice_application_submitted',
          stage: 'submitted',
          actorUserId: 'shipper-1',
        }),
      ]),
    );
  });

  it('keeps a reviewer-less fallback for legacy terminal applications', async () => {
    const repository = new InMemoryProfileInvoicesRepository(() => new Date(), {
      applications: [
        {
          id: 'invoice-legacy',
          shipperId: 'shipper-1',
          invoiceType: 'normal',
          invoiceTitleType: 'personal',
          invoiceTitle: '晨星货主',
          receiverEmail: 'finance@chenxing.example',
          orderIds: ['order-1'],
          orderNos: ['HY202607240001'],
          amountCents: 31000,
          status: 'approved',
          createdAtIso: '2026-07-24T08:00:00.000Z',
          updatedAtIso: '2026-07-24T08:30:00.000Z',
        },
      ],
    });
    const service = new ProfileInvoicesService(repository);

    const events = await service.listAdminApplicationReviewEvents(
      { id: 'admin-1', phone: '13900000000', userType: 'admin' },
      'invoice-legacy',
    );
    const legacyDecision = events.find(event => event.stage === 'approved');

    expect(legacyDecision).toMatchObject({
      eventId: 'invoice-legacy:approved',
      eventType: 'invoice_application_approved',
      stage: 'approved',
    });
    expect(legacyDecision).not.toHaveProperty('reviewerAdminId');
    expect(legacyDecision).not.toHaveProperty('actorUserId');
  });

  it('downloads an approved invoice application for the owning shipper', async () => {
    const repository = new InMemoryProfileInvoicesRepository(
      () => new Date('2026-07-24T08:00:00.000Z'),
      {
        applications: [
          {
            id: 'invoice-1',
            shipperId: 'shipper-1',
            invoiceType: 'vat-special',
            invoiceTitleType: 'enterprise',
            invoiceTitle: '深圳晨星贸易有限公司',
            receiverEmail: 'finance@chenxing.example',
            orderIds: ['order-1'],
            orderNos: ['HY202607240001'],
            amountCents: 31000,
            status: 'approved',
            createdAtIso: '2026-07-24T08:00:00.000Z',
            updatedAtIso: '2026-07-24T08:30:00.000Z',
          },
        ],
      },
    );
    const service = new ProfileInvoicesService(repository);

    await expect(
      service.downloadApplication(
        { id: 'shipper-1', phone: '13900000000', userType: 'shipper' },
        'invoice-1',
      ),
    ).resolves.toMatchObject({
      fileName: 'invoice-invoice-1.txt',
      contentType: 'text/plain; charset=utf-8',
    });

    const downloaded = await service.downloadApplication(
      { id: 'shipper-1', phone: '13900000000', userType: 'shipper' },
      'invoice-1',
    );

    expect(downloaded.content.toString('utf8')).toContain('申请编号：invoice-1');
    expect(downloaded.content.toString('utf8')).toContain(
      '发票抬头：深圳晨星贸易有限公司',
    );
    expect(downloaded.content.toString('utf8')).toContain(
      '开票金额：¥310.00',
    );
  });

  it('rejects invoice download when the application is not approved', async () => {
    const repository = new InMemoryProfileInvoicesRepository(
      () => new Date('2026-07-24T08:00:00.000Z'),
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
            orderNos: ['HY202607240001'],
            amountCents: 31000,
            status: 'reviewing',
            createdAtIso: '2026-07-24T08:00:00.000Z',
            updatedAtIso: '2026-07-24T08:05:00.000Z',
          },
        ],
      },
    );
    const service = new ProfileInvoicesService(repository);

    await expect(
      service.downloadApplication(
        { id: 'shipper-1', phone: '13900000000', userType: 'shipper' },
        'invoice-1',
      ),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.INVOICE_APPLICATION_STATE_INVALID,
        '仅已通过的发票申请支持下载',
      ),
    );
  });

  it('rejects downloading another shipper invoice application', async () => {
    const repository = new InMemoryProfileInvoicesRepository(
      () => new Date('2026-07-24T08:00:00.000Z'),
      {
        applications: [
          {
            id: 'invoice-1',
            shipperId: 'shipper-2',
            invoiceType: 'normal',
            invoiceTitleType: 'personal',
            invoiceTitle: '另一位货主',
            receiverEmail: 'finance@chenxing.example',
            orderIds: ['order-1'],
            orderNos: ['HY202607240001'],
            amountCents: 31000,
            status: 'approved',
            createdAtIso: '2026-07-24T08:00:00.000Z',
            updatedAtIso: '2026-07-24T08:05:00.000Z',
          },
        ],
      },
    );
    const service = new ProfileInvoicesService(repository);

    await expect(
      service.downloadApplication(
        { id: 'shipper-1', phone: '13900000000', userType: 'shipper' },
        'invoice-1',
      ),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.AUTH_FORBIDDEN,
        '当前发票申请不属于当前货主',
      ),
    );
  });

  it('allows only admins to download invoice applications through the admin flow', async () => {
    const repository = new InMemoryProfileInvoicesRepository(
      () => new Date('2026-07-24T08:00:00.000Z'),
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
            orderNos: ['HY202607240001'],
            amountCents: 31000,
            status: 'approved',
            createdAtIso: '2026-07-24T08:00:00.000Z',
            updatedAtIso: '2026-07-24T08:30:00.000Z',
          },
        ],
      },
    );
    const service = new ProfileInvoicesService(repository);

    await expect(
      service.downloadAdminApplication(
        { id: 'admin-1', phone: '13900000000', userType: 'admin' },
        'invoice-1',
      ),
    ).resolves.toMatchObject({
      fileName: 'invoice-invoice-1.txt',
      contentType: 'text/plain; charset=utf-8',
    });

    await expect(
      service.downloadAdminApplication(
        { id: 'shipper-1', phone: '13900000000', userType: 'shipper' },
        'invoice-1',
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
  });

  it('rejects non-admin users from invoice review', async () => {
    const repository = new InMemoryProfileInvoicesRepository();
    const service = new ProfileInvoicesService(repository);

    await expect(
      service.listAdminApplications(
        { id: 'shipper-1', phone: '13800138000', userType: 'shipper' },
        { status: 'reviewing', page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
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

  it('allows only one concurrent Prisma invoice review transition', async () => {
    const createdAt = new Date('2026-07-26T08:00:00.000Z');
    const reviewedAt = new Date('2026-07-26T08:01:00.000Z');
    const initialApplication = {
      id: 'invoice-1',
      shipperId: 'shipper-1',
      invoiceType: 'normal',
      invoiceTitleType: 'personal',
      invoiceTitle: '晨星货主',
      receiverEmail: 'finance@chenxing.example',
      orderIds: ['order-1'],
      orderNos: ['HY202607260001'],
      amountCents: 31000,
      status: 'reviewing' as const,
      rejectionReason: null,
      createdAt,
      updatedAt: createdAt,
    };
    let currentApplication = { ...initialApplication };
    const prisma = {
      $transaction: jest.fn(),
      shipperInvoiceApplication: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(async () => ({ ...currentApplication })),
        updateMany: jest.fn(async ({ where, data }) => {
          if (
            currentApplication.id !== where.id ||
            currentApplication.status !== where.status ||
            currentApplication.updatedAt.getTime() !== where.updatedAt.getTime()
          ) {
            return { count: 0 };
          }
          currentApplication = {
            ...currentApplication,
            ...data,
            updatedAt: reviewedAt,
          };
          return { count: 1 };
        }),
      },
      shipperEnterpriseVerification: { findUnique: jest.fn() },
      shipperInvoiceReviewEvent: {
        findMany: jest.fn(),
        create: jest.fn(async ({ data }) => ({
          id: 'invoice-review-event-1',
          ...data,
        })),
      },
    };
    prisma.$transaction.mockImplementation(async callback => callback(prisma));
    const repository = new PrismaProfileInvoicesRepository(prisma);

    const results = await Promise.allSettled([
      repository.reviewApplication('invoice-1', 'admin-1', {
        status: 'approved',
      }),
      repository.reviewApplication('invoice-1', 'admin-2', {
        status: 'rejected',
        rejectionReason: '抬头信息不完整',
      }),
    ]);

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'fulfilled',
          value: expect.objectContaining({ status: 'approved' }),
        }),
        expect.objectContaining({
          status: 'rejected',
          reason: expect.objectContaining({
            code: ApiErrorCode.INVOICE_APPLICATION_STATE_INVALID,
          }),
        }),
      ]),
    );
    expect(prisma.shipperInvoiceApplication.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.shipperInvoiceApplication.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'invoice-1',
        status: 'reviewing',
        updatedAt: createdAt,
      },
      data: { status: 'approved', rejectionReason: null },
    });
    expect(prisma.shipperInvoiceReviewEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.shipperInvoiceReviewEvent.create).toHaveBeenCalledWith({
      data: {
        applicationId: 'invoice-1',
        reviewerAdminId: 'admin-1',
        fromStatus: 'reviewing',
        toStatus: 'approved',
        rejectionReason: null,
        createdAt: reviewedAt,
      },
    });
  });

  it('rolls back the Prisma invoice status when review event persistence fails', async () => {
    const createdAt = new Date('2026-07-26T08:00:00.000Z');
    const reviewedAt = new Date('2026-07-26T08:01:00.000Z');
    const initialApplication = {
      id: 'invoice-1',
      shipperId: 'shipper-1',
      invoiceType: 'normal',
      invoiceTitleType: 'personal',
      invoiceTitle: '晨星货主',
      receiverEmail: 'finance@chenxing.example',
      orderIds: ['order-1'],
      orderNos: ['HY202607260001'],
      amountCents: 31000,
      status: 'reviewing' as const,
      rejectionReason: null,
      createdAt,
      updatedAt: createdAt,
    };
    let committedApplication = { ...initialApplication };
    const transactionEventCreate = jest.fn(async () => {
      throw new Error('review event write failed');
    });
    const rootEventCreate = jest.fn(async () => {
      throw new Error('review event write failed');
    });
    const prisma = {
      $transaction: jest.fn(async callback => {
        let pendingApplication = { ...committedApplication };
        const transaction = {
          $queryRawUnsafe: jest.fn(),
          order: { findMany: jest.fn() },
          shipperInvoiceApplication: {
            findFirst: jest.fn(),
            create: jest.fn(),
            findUnique: jest.fn(async () => ({ ...pendingApplication })),
            updateMany: jest.fn(async ({ where, data }) => {
              if (
                pendingApplication.id !== where.id ||
                pendingApplication.status !== where.status ||
                pendingApplication.updatedAt.getTime() !==
                  where.updatedAt.getTime()
              ) {
                return { count: 0 };
              }
              pendingApplication = {
                ...pendingApplication,
                ...data,
                updatedAt: reviewedAt,
              };
              return { count: 1 };
            }),
          },
          shipperInvoiceReviewEvent: {
            create: transactionEventCreate,
          },
        };

        const result = await callback(transaction);
        committedApplication = pendingApplication;
        return result;
      }),
      shipperInvoiceApplication: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(async () => ({ ...committedApplication })),
        updateMany: jest.fn(),
      },
      shipperEnterpriseVerification: { findUnique: jest.fn() },
      shipperInvoiceReviewEvent: {
        findMany: jest.fn(),
        create: rootEventCreate,
      },
    };
    const repository = new PrismaProfileInvoicesRepository(prisma);

    await expect(
      repository.reviewApplication('invoice-1', 'admin-1', {
        status: 'approved',
      }),
    ).rejects.toThrow('review event write failed');

    expect(committedApplication).toEqual(initialApplication);
    expect(transactionEventCreate).toHaveBeenCalledTimes(1);
    expect(rootEventCreate).not.toHaveBeenCalled();
  });

  it('reads the application before persisted decisions with their real admin actors', async () => {
    const createdAt = new Date('2026-07-26T08:00:00.000Z');
    const reviewedAt = new Date('2026-07-26T08:01:00.000Z');
    const application = {
      id: 'invoice-1',
      shipperId: 'shipper-1',
      invoiceType: 'normal',
      invoiceTitleType: 'personal',
      invoiceTitle: '晨星货主',
      receiverEmail: 'finance@chenxing.example',
      orderIds: ['order-1'],
      orderNos: ['HY202607260001'],
      amountCents: 31000,
      status: 'rejected' as const,
      rejectionReason: '抬头信息不完整',
      createdAt,
      updatedAt: reviewedAt,
    };
    let applicationReadCompleted = false;
    const findUnique = jest.fn(async () => {
      await Promise.resolve();
      applicationReadCompleted = true;
      return application;
    });
    const findMany = jest.fn(async () => {
      expect(applicationReadCompleted).toBe(true);
      return [
        {
          id: 'invoice-review-event-1',
          applicationId: 'invoice-1',
          reviewerAdminId: 'admin-2',
          fromStatus: 'reviewing' as const,
          toStatus: 'rejected' as const,
          rejectionReason: '抬头信息不完整',
          createdAt: reviewedAt,
        },
      ];
    });
    const repository = new PrismaProfileInvoicesRepository({
      $transaction: jest.fn(),
      shipperInvoiceApplication: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique,
        updateMany: jest.fn(),
      },
      shipperEnterpriseVerification: { findUnique: jest.fn() },
      shipperInvoiceReviewEvent: {
        findMany,
      },
    });

    const events = await repository.listAdminApplicationReviewEvents(
      'invoice-1',
    );

    expect(events).toEqual([
      expect.objectContaining({
        eventId: 'invoice-review-event-1',
        actorUserId: 'admin-2',
        reviewerAdminId: 'admin-2',
        fromStatus: 'reviewing',
        toStatus: 'rejected',
        stage: 'rejected',
        noteText: '抬头信息不完整',
      }),
      expect.objectContaining({
        eventId: 'invoice-1:submitted',
        actorUserId: 'shipper-1',
        stage: 'submitted',
      }),
    ]);
    expect(events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventId: 'invoice-1:rejected' }),
      ]),
    );
    expect(findMany).toHaveBeenCalledWith({
      where: { applicationId: 'invoice-1' },
      orderBy: { createdAt: 'desc' },
    });
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
        findUnique: jest.fn(),
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
        updateMany: jest.fn(),
      },
      shipperInvoiceReviewEvent: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(transaction)),
      shipperInvoiceApplication: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      shipperEnterpriseVerification: { findUnique: jest.fn() },
      shipperInvoiceReviewEvent: { findMany: jest.fn() },
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
