import { createHash } from 'crypto';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type {
  AdminFinanceListQuery,
  AdminFinanceRepository,
  RetryRefundInput,
} from './admin-finance.repository';
import type {
  BatchReviewDriverWithdrawalsInput,
  DriverFinanceRepository,
  ReviewDriverWithdrawalInput,
} from './driver-finance.repository';

export type AdminReviewWithdrawalInput = Omit<
  ReviewDriverWithdrawalInput,
  'requestFingerprint'
>;

export type AdminRetryRefundInput = Omit<
  RetryRefundInput,
  'requestFingerprint'
>;

export type AdminBatchReviewWithdrawalsInput = Omit<
  BatchReviewDriverWithdrawalsInput,
  'requestFingerprint'
>;

export class AdminFinanceService {
  constructor(
    private readonly repository: AdminFinanceRepository,
    private readonly driverFinanceRepository: DriverFinanceRepository,
  ) {}

  getReport() {
    return this.repository.getReport();
  }

  getReconciliation() {
    return this.repository.getReconciliation();
  }

  listPayments(query: AdminFinanceListQuery) {
    return this.repository.listPayments(query);
  }

  listRefunds(query: AdminFinanceListQuery) {
    return this.repository.listRefunds(query);
  }

  listSettlements(query: AdminFinanceListQuery) {
    return this.repository.listSettlements(query);
  }

  listWithdrawals(query: AdminFinanceListQuery) {
    return this.repository.listWithdrawals(query);
  }

  async getLedgerTransaction(transactionId: string) {
    const transaction =
      await this.repository.getLedgerTransaction(transactionId);
    if (!transaction) {
      throw new BusinessError(
        ApiErrorCode.PAYMENT_ORDER_NOT_AVAILABLE,
        '资金流水不存在',
      );
    }

    return transaction;
  }

  async reviewWithdrawal(input: AdminReviewWithdrawalInput) {
    const result = await this.driverFinanceRepository.reviewWithdrawal({
      ...input,
      requestFingerprint: createAdminActionFingerprint(
        'withdrawal.review',
        input,
      ),
    });
    switch (result.kind) {
      case 'success':
        return result;
      case 'key-reused':
        throw new BusinessError(
          ApiErrorCode.IDEMPOTENCY_KEY_REUSED,
          'Idempotency-Key 已被其他提现审核使用',
        );
      case 'not-found':
        throw new BusinessError(
          ApiErrorCode.DRIVER_WITHDRAWAL_CONFLICT,
          '提现申请不存在',
        );
      case 'conflict':
        throw new BusinessError(
          ApiErrorCode.DRIVER_WITHDRAWAL_CONFLICT,
          '提现申请状态或版本已变化',
        );
    }
  }

  async batchReviewWithdrawals(input: AdminBatchReviewWithdrawalsInput) {
    const result = await this.driverFinanceRepository.batchReviewWithdrawals({
      ...input,
      requestFingerprint: createAdminActionFingerprint(
        'withdrawal.batch_review',
        input,
      ),
    });
    switch (result.kind) {
      case 'success':
        return result;
      case 'key-reused':
        throw new BusinessError(
          ApiErrorCode.IDEMPOTENCY_KEY_REUSED,
          'Idempotency-Key 已被其他批量提现审核使用',
        );
      case 'not-found':
        throw new BusinessError(
          ApiErrorCode.DRIVER_WITHDRAWAL_CONFLICT,
          '批量提现申请不存在',
        );
      case 'conflict':
        throw new BusinessError(
          ApiErrorCode.DRIVER_WITHDRAWAL_CONFLICT,
          '批量提现申请状态、版本或钱包余额已变化',
        );
    }
  }

  async retryRefund(input: AdminRetryRefundInput) {
    const result = await this.repository.retryRefund({
      ...input,
      requestFingerprint: createAdminActionFingerprint('refund.retry', input),
    });
    switch (result.kind) {
      case 'success':
        return result;
      case 'key-reused':
        throw new BusinessError(
          ApiErrorCode.IDEMPOTENCY_KEY_REUSED,
          'Idempotency-Key 已被其他退款重试使用',
        );
      case 'not-found':
        throw new BusinessError(
          ApiErrorCode.REFUND_NOT_AVAILABLE,
          '退款记录不存在',
        );
      case 'conflict':
        throw new BusinessError(
          ApiErrorCode.REFUND_NOT_AVAILABLE,
          '退款状态或重试版本已变化',
        );
    }
  }
}

export function createAdminActionFingerprint(
  operation: string,
  input: Record<string, unknown>,
) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        operation,
        ...input,
        idempotencyKey: undefined,
        requestId: undefined,
      }),
    )
    .digest('hex');
}
