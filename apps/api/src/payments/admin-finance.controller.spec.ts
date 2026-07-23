import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AdminOnlyGuard } from '../auth/role.guard';
import { ApiErrorCode } from '../common/errors';
import { AdminFinanceController } from './admin-finance.controller';
import type { AdminFinanceService } from './admin-finance.service';

describe('AdminFinanceController', () => {
  it('uses access-token and admin guards in that order', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminFinanceController) ?? [],
    ).toEqual([AccessTokenGuard, AdminOnlyGuard]);
  });

  it('normalizes payment list pagination and order filter before service I/O', async () => {
    const service = createAdminFinanceServiceMock();
    service.listPayments.mockResolvedValue({ items: [], total: 0 } as never);
    const controller = new AdminFinanceController(service);

    await expect(
      controller.listPayments(createRequest(), {
        page: '2',
        pageSize: '50',
        status: 'escrowed',
        orderId: 'order-1',
      }),
    ).resolves.toMatchObject({ code: 'OK', requestId: 'request-admin-1' });
    expect(service.listPayments).toHaveBeenCalledWith({
      page: 2,
      pageSize: 50,
      status: 'escrowed',
      orderId: 'order-1',
    });
  });

  it.each([
    {
      name: 'refund',
      call: (controller: AdminFinanceController) =>
        controller.listRefunds(createRequest(), {
          page: '3',
          pageSize: '10',
          status: 'refund_failed',
          orderId: 'order-2',
        }),
      serviceKey: 'listRefunds' as const,
      expected: {
        page: 3,
        pageSize: 10,
        status: 'refund_failed',
        orderId: 'order-2',
      },
    },
    {
      name: 'settlement',
      call: (controller: AdminFinanceController) =>
        controller.listSettlements(createRequest(), {
          page: '1',
          pageSize: '30',
          orderId: 'order-3',
        }),
      serviceKey: 'listSettlements' as const,
      expected: {
        page: 1,
        pageSize: 30,
        orderId: 'order-3',
      },
    },
  ])(
    'normalizes $name list pagination and order filter before service I/O',
    async ({ call, expected, serviceKey }) => {
      const service = createAdminFinanceServiceMock();
      const serviceMethod =
        serviceKey === 'listRefunds'
          ? service.listRefunds
          : service.listSettlements;
      serviceMethod.mockResolvedValue({ items: [], total: 0 } as never);
      const controller = new AdminFinanceController(service);

      await expect(call(controller)).resolves.toMatchObject({
        code: 'OK',
        requestId: 'request-admin-1',
      });
      expect(serviceMethod).toHaveBeenCalledWith(expected);
    },
  );

  it('returns the finance report snapshot with the current request id', async () => {
    const service = createAdminFinanceServiceMock();
    service.getReport.mockResolvedValue({
      generatedAtIso: '2026-07-18T09:00:00.000Z',
      summary: {
        paymentCount: 4,
        deadRefundOutboxCount: 1,
      },
    } as never);
    const controller = new AdminFinanceController(service);

    await expect(controller.getReport(createRequest())).resolves.toMatchObject({
      code: 'OK',
      requestId: 'request-admin-1',
      data: expect.objectContaining({
        generatedAtIso: '2026-07-18T09:00:00.000Z',
      }),
    });
    expect(service.getReport).toHaveBeenCalledTimes(1);
  });

  it('rejects withdrawal approval without a key before review I/O', async () => {
    const service = createAdminFinanceServiceMock();
    const controller = new AdminFinanceController(service);

    await expect(
      controller.approveWithdrawal(
        createRequest(),
        'withdrawal-1',
        undefined,
        { expectedVersion: 0, reason: '审核通过并付款' },
      ),
    ).rejects.toMatchObject({ code: ApiErrorCode.IDEMPOTENCY_KEY_INVALID });
    expect(service.reviewWithdrawal).not.toHaveBeenCalled();
  });

  it.each(['approve', 'reject'] as const)(
    '%s withdrawal forwards admin, key, baseline, reason and request id',
    async action => {
      const service = createAdminFinanceServiceMock();
      service.reviewWithdrawal.mockResolvedValue({
        withdrawal: { id: 'withdrawal-1' },
      } as never);
      const controller = new AdminFinanceController(service);
      const method =
        action === 'approve'
          ? controller.approveWithdrawal.bind(controller)
          : controller.rejectWithdrawal.bind(controller);
      const key = '550e8400-e29b-41d4-a716-446655440000';

      await expect(
        method(createRequest(), 'withdrawal-1', key, {
          expectedVersion: 0,
          reason: action === 'approve' ? '审核通过并付款' : '账户信息不一致',
        }),
      ).resolves.toMatchObject({ code: 'OK' });
      expect(service.reviewWithdrawal).toHaveBeenCalledWith({
        withdrawalId: 'withdrawal-1',
        adminId: 'admin-1',
        action,
        idempotencyKey: key,
        requestId: 'request-admin-1',
        expectedVersion: 0,
        reason:
          action === 'approve' ? '审核通过并付款' : '账户信息不一致',
      });
    },
  );

  it('rejects batch withdrawal review without a key before service I/O', async () => {
    const service = createAdminFinanceServiceMock();
    const controller = new AdminFinanceController(service);

    await expect(
      controller.batchReviewWithdrawals(createRequest(), undefined, {
        items: [{ withdrawalId: 'withdrawal-1', expectedVersion: 0 }],
        action: 'approve',
        reason: '财务复核后统一放款',
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.IDEMPOTENCY_KEY_INVALID });
    expect(service.batchReviewWithdrawals).not.toHaveBeenCalled();
  });

  it('forwards batch withdrawal review items, action, reason and request id', async () => {
    const service = createAdminFinanceServiceMock();
    service.batchReviewWithdrawals.mockResolvedValue({
      kind: 'success',
      replayed: false,
      action: 'approve',
      withdrawalIds: ['withdrawal-1', 'withdrawal-2'],
      updatedCount: 2,
      items: [],
    } as never);
    const controller = new AdminFinanceController(service);
    const key = '550e8400-e29b-41d4-a716-446655440002';

    await expect(
      controller.batchReviewWithdrawals(createRequest(), key, {
        items: [
          { withdrawalId: 'withdrawal-1', expectedVersion: 0 },
          { withdrawalId: 'withdrawal-2', expectedVersion: 3 },
        ],
        action: 'approve',
        reason: '财务复核后统一放款',
      }),
    ).resolves.toMatchObject({ code: 'OK' });
    expect(service.batchReviewWithdrawals).toHaveBeenCalledWith({
      adminId: 'admin-1',
      idempotencyKey: key,
      requestId: 'request-admin-1',
      items: [
        { withdrawalId: 'withdrawal-1', expectedVersion: 0 },
        { withdrawalId: 'withdrawal-2', expectedVersion: 3 },
      ],
      action: 'approve',
      reason: '财务复核后统一放款',
    });
  });

  it('forwards an audited refund retry with attempt baseline', async () => {
    const service = createAdminFinanceServiceMock();
    service.retryRefund.mockResolvedValue({ refund: { id: 'refund-1' } } as never);
    const controller = new AdminFinanceController(service);
    const key = '550e8400-e29b-41d4-a716-446655440001';

    await controller.retryRefund(createRequest(), 'refund-1', key, {
      expectedVersion: 10,
      reason: '人工确认渠道恢复',
    });

    expect(service.retryRefund).toHaveBeenCalledWith({
      refundId: 'refund-1',
      adminId: 'admin-1',
      idempotencyKey: key,
      requestId: 'request-admin-1',
      expectedVersion: 10,
      reason: '人工确认渠道恢复',
    });
  });
});

function createAdminFinanceServiceMock() {
  return {
    getReport: jest.fn(),
    listPayments: jest.fn(),
    listRefunds: jest.fn(),
    retryRefund: jest.fn(),
    listSettlements: jest.fn(),
    getLedgerTransaction: jest.fn(),
    listWithdrawals: jest.fn(),
    reviewWithdrawal: jest.fn(),
    batchReviewWithdrawals: jest.fn(),
  } as unknown as jest.Mocked<AdminFinanceService>;
}

function createRequest(): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'request-admin-1' },
    currentUser: {
      id: 'admin-1',
      phone: '13900139000',
      userType: 'admin',
    },
  } as AuthenticatedRequest;
}
