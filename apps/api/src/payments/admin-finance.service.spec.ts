import { ApiErrorCode } from '../common/errors';
import type { AdminFinanceRepository } from './admin-finance.repository';
import {
  AdminFinanceService,
  createAdminActionFingerprint,
} from './admin-finance.service';
import type { DriverFinanceRepository } from './driver-finance.repository';

describe('AdminFinanceService', () => {
  it('forwards batch withdrawal review with a stable admin fingerprint', async () => {
    const { service, driverFinanceRepository } = createService();
    const input = {
      adminId: 'admin-1',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440100',
      requestId: 'request-admin-1',
      action: 'approve' as const,
      reason: '财务复核后统一放款',
      items: [
        { withdrawalId: 'withdrawal-1', expectedVersion: 0 },
        { withdrawalId: 'withdrawal-2', expectedVersion: 3 },
      ],
    };
    driverFinanceRepository.batchReviewWithdrawals.mockResolvedValue({
      kind: 'success',
      replayed: false,
      action: 'approve',
      withdrawalIds: ['withdrawal-1', 'withdrawal-2'],
      updatedCount: 2,
      items: [],
    });

    await expect(service.batchReviewWithdrawals(input)).resolves.toMatchObject({
      kind: 'success',
      updatedCount: 2,
    });
    expect(driverFinanceRepository.batchReviewWithdrawals).toHaveBeenCalledWith({
      ...input,
      requestFingerprint: createAdminActionFingerprint(
        'withdrawal.batch_review',
        input,
      ),
    });
  });

  it.each([
    {
      result: { kind: 'key-reused' as const },
      code: ApiErrorCode.IDEMPOTENCY_KEY_REUSED,
    },
    {
      result: { kind: 'not-found' as const },
      code: ApiErrorCode.DRIVER_WITHDRAWAL_CONFLICT,
    },
    {
      result: { kind: 'conflict' as const },
      code: ApiErrorCode.DRIVER_WITHDRAWAL_CONFLICT,
    },
  ])('maps batch withdrawal review failure %p to a stable business error', async ({ result, code }) => {
    const { service, driverFinanceRepository } = createService();
    driverFinanceRepository.batchReviewWithdrawals.mockResolvedValue(result);

    await expect(
      service.batchReviewWithdrawals({
        adminId: 'admin-1',
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440100',
        requestId: 'request-admin-1',
        action: 'approve',
        reason: '财务复核后统一放款',
        items: [{ withdrawalId: 'withdrawal-1', expectedVersion: 0 }],
      }),
    ).rejects.toMatchObject({ code });
  });
});

function createService() {
  const repository = {
    getReport: jest.fn(),
    getReconciliation: jest.fn(),
    listPayments: jest.fn(),
    listRefunds: jest.fn(),
    retryRefund: jest.fn(),
    listSettlements: jest.fn(),
    getLedgerTransaction: jest.fn(),
    listWithdrawals: jest.fn(),
  } as unknown as jest.Mocked<AdminFinanceRepository>;
  const driverFinanceRepository = {
    getIncomeOverview: jest.fn(),
    executeIdempotentWithdrawalRequest: jest.fn(),
    reviewWithdrawal: jest.fn(),
    batchReviewWithdrawals: jest.fn(),
  } as unknown as jest.Mocked<DriverFinanceRepository>;

  return {
    service: new AdminFinanceService(repository, driverFinanceRepository),
    repository,
    driverFinanceRepository,
  };
}
