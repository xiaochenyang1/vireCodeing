import { randomUUID } from 'crypto';
import type {
  FinancialAuditLogRecord,
  FinancialTransactionRecord,
} from './dto';
import {
  buildFinanceReconciliationReport,
  type FinanceReconciliationReport,
} from './finance-reconciliation';

export type AdminFinanceListQuery = {
  page: number;
  pageSize: number;
  status?: string;
  orderId?: string;
};

export type AdminFinancePage<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminPaymentRecord = Record<string, unknown> & { id: string };
export type AdminRefundRecord = Record<string, unknown> & { id: string };
export type AdminSettlementRecord = Record<string, unknown> & { id: string };
export type AdminWithdrawalRecord = Record<string, unknown> & { id: string };

export type AdminFinanceAmountBreakdownItem = {
  status: string;
  count: number;
  amountCents: number;
};

export type AdminFinanceCountBreakdownItem = {
  status: string;
  count: number;
};

export type AdminFinanceSettlementSummary = {
  count: number;
  grossAmountCents: number;
  platformFeeCents: number;
  driverNetAmountCents: number;
};

export type AdminFinanceReport = {
  generatedAtIso: string;
  summary: {
    paymentCount: number;
    paymentAmountCents: number;
    refundCount: number;
    refundAmountCents: number;
    settlementCount: number;
    settlementGrossAmountCents: number;
    settlementPlatformFeeCents: number;
    settlementDriverNetAmountCents: number;
    pendingWithdrawalCount: number;
    pendingWithdrawalAmountCents: number;
    deadRefundOutboxCount: number;
  };
  paymentStatusBreakdown: AdminFinanceAmountBreakdownItem[];
  refundStatusBreakdown: AdminFinanceAmountBreakdownItem[];
  withdrawalStatusBreakdown: AdminFinanceAmountBreakdownItem[];
  refundOutboxStatusBreakdown: AdminFinanceCountBreakdownItem[];
  settlementSummary: AdminFinanceSettlementSummary;
};

export type RetryRefundInput = {
  refundId: string;
  adminId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  requestId: string;
  expectedVersion: number;
  reason: string;
};

export type RetryRefundResult =
  | {
      kind: 'success';
      replayed: boolean;
      refund: AdminRefundRecord;
      outboxEvent: Record<string, unknown> & { id: string };
      auditLog: Record<string, unknown> & { id: string };
    }
  | { kind: 'key-reused' }
  | { kind: 'not-found' }
  | { kind: 'conflict' };

export interface AdminFinanceRepository {
  getReport(): Promise<AdminFinanceReport>;
  getReconciliation(): Promise<FinanceReconciliationReport>;
  listPayments(
    query: AdminFinanceListQuery,
  ): Promise<AdminFinancePage<AdminPaymentRecord>>;
  listRefunds(
    query: AdminFinanceListQuery,
  ): Promise<AdminFinancePage<AdminRefundRecord>>;
  retryRefund(input: RetryRefundInput): Promise<RetryRefundResult>;
  listSettlements(
    query: AdminFinanceListQuery,
  ): Promise<AdminFinancePage<AdminSettlementRecord>>;
  getLedgerTransaction(
    transactionId: string,
  ): Promise<FinancialTransactionRecord | undefined>;
  listWithdrawals(
    query: AdminFinanceListQuery,
  ): Promise<AdminFinancePage<AdminWithdrawalRecord>>;
}

type PrismaAdminPaymentRecord = {
  id: string;
  paymentNo: string;
  orderId: string;
  shipperId: string;
  channel: string;
  amountCents: number;
  status: string;
  providerTradeNo: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  expiresAt: Date;
  paidAt: Date | null;
  settledAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaAdminRefundRecord = {
  id: string;
  refundNo: string;
  paymentOrderId: string;
  orderId: string;
  shipperId: string;
  channel: string;
  amountCents: number;
  reason: string;
  status: string;
  providerRefundNo: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  processingStartedAt: Date | null;
  succeededAt: Date | null;
  failedAt: Date | null;
  financialTransactionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaAdminSettlementRecord = {
  id: string;
  orderId: string;
  paymentOrderId: string | null;
  driverId: string;
  grossAmountCents: number;
  platformFeeRateBps: number;
  platformFeeCents: number;
  driverNetAmountCents: number;
  financialTransactionId: string;
  settledAt: Date;
  createdAt: Date;
};

type PrismaAdminWithdrawalRecord = {
  id: string;
  driverId: string;
  amountCents: number;
  bankAccountName: string;
  bankName: string;
  bankAccountMasked: string;
  status: string;
  version: number;
  rejectionReason: string | null;
  processedByAdminId: string | null;
  processedAt: Date | null;
  payoutChannel: string | null;
  providerPayoutNo: string | null;
  payoutExecutedAt: Date | null;
  financialTransactionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaAdminLedgerTransactionRecord = {
  id: string;
  transactionNo: string;
  type: FinancialTransactionRecord['type'];
  referenceId: string;
  orderId: string | null;
  paymentOrderId: string | null;
  amountCents: number;
  occurredAt: Date;
  createdAt: Date;
  entries: Array<{
    id: string;
    transactionId: string;
    sequence: number;
    accountType: FinancialTransactionRecord['entries'][number]['accountType'];
    accountUserId: string | null;
    direction: FinancialTransactionRecord['entries'][number]['direction'];
    amountCents: number;
    createdAt: Date;
  }>;
};

type PrismaAdminOutboxEventRecord = {
  id: string;
  refundId: string | null;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  availableAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaAdminAuditLogRecord = {
  id: string;
  actorAdminId: string;
  action: string;
  entityType: string;
  entityId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  requestId: string;
  reason: string;
  beforeState: unknown | null;
  afterState: unknown | null;
  createdAt: Date;
};

export type PrismaAdminFinanceTransactionClient = {
  financialAuditLog: {
    findUnique(args: unknown): Promise<PrismaAdminAuditLogRecord | null>;
    create(args: unknown): Promise<PrismaAdminAuditLogRecord>;
  };
  refund: {
    findUnique(args: unknown): Promise<PrismaAdminRefundRecord | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  financialOutboxEvent: {
    findFirst(args: unknown): Promise<PrismaAdminOutboxEventRecord | null>;
    findMany(args: unknown): Promise<PrismaAdminOutboxEventRecord[]>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  paymentOrder: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  order: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
};

export type PrismaAdminFinanceClient = {
  $transaction<T>(
    callback: (transaction: PrismaAdminFinanceTransactionClient) => Promise<T>,
  ): Promise<T>;
  paymentOrder: {
    findMany(args: unknown): Promise<PrismaAdminPaymentRecord[]>;
    count(args: unknown): Promise<number>;
  };
  refund: {
    findMany(args: unknown): Promise<PrismaAdminRefundRecord[]>;
    count(args: unknown): Promise<number>;
    findUnique(args: unknown): Promise<PrismaAdminRefundRecord | null>;
  };
  settlement: {
    findMany(args: unknown): Promise<PrismaAdminSettlementRecord[]>;
    count(args: unknown): Promise<number>;
  };
  financialTransaction: {
    findUnique(args: unknown): Promise<PrismaAdminLedgerTransactionRecord | null>;
    findMany(args: unknown): Promise<
      Array<{
        id: string;
        type: string;
        referenceId: string;
        amountCents: number;
      }>
    >;
  };
  driverWallet?: {
    findMany(args: unknown): Promise<
      Array<{
        driverId: string;
        availableCents: number;
        reservedCents: number;
        withdrawnCents: number;
      }>
    >;
  };
  driverWithdrawal: {
    findMany(args: unknown): Promise<PrismaAdminWithdrawalRecord[]>;
    count(args: unknown): Promise<number>;
  };
  order?: {
    findMany(args: unknown): Promise<Array<{ id: string; orderNo: string }>>;
  };
  financialAuditLog: {
    findUnique(args: unknown): Promise<PrismaAdminAuditLogRecord | null>;
  };
  financialOutboxEvent: {
    findFirst(args: unknown): Promise<PrismaAdminOutboxEventRecord | null>;
    findMany(args: unknown): Promise<PrismaAdminOutboxEventRecord[]>;
  };
};

export class PrismaAdminFinanceRepository implements AdminFinanceRepository {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly prisma: PrismaAdminFinanceClient,
    options: { now?: () => Date; createId?: () => string } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  async getReport() {
    const [payments, refunds, settlements, withdrawals, refundOutboxEvents] =
      await Promise.all([
        this.prisma.paymentOrder.findMany({
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.refund.findMany({
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.settlement.findMany({
          orderBy: { settledAt: 'desc' },
        }),
        this.prisma.driverWithdrawal.findMany({
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.financialOutboxEvent.findMany({
          where: { eventType: 'refund.requested' },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
    const settlementSummary = createSettlementSummary(settlements);

    return {
      generatedAtIso: this.now().toISOString(),
      summary: {
        paymentCount: payments.length,
        paymentAmountCents: sumBy(payments, item => item.amountCents),
        refundCount: refunds.length,
        refundAmountCents: sumBy(refunds, item => item.amountCents),
        settlementCount: settlementSummary.count,
        settlementGrossAmountCents: settlementSummary.grossAmountCents,
        settlementPlatformFeeCents: settlementSummary.platformFeeCents,
        settlementDriverNetAmountCents: settlementSummary.driverNetAmountCents,
        pendingWithdrawalCount: withdrawals.filter(
          item => item.status === 'reviewing',
        ).length,
        pendingWithdrawalAmountCents: sumBy(
          withdrawals.filter(item => item.status === 'reviewing'),
          item => item.amountCents,
        ),
        deadRefundOutboxCount: refundOutboxEvents.filter(
          item => item.status === 'dead',
        ).length,
      },
      paymentStatusBreakdown: createAmountBreakdown(
        payments,
        item => item.status,
        item => item.amountCents,
      ),
      refundStatusBreakdown: createAmountBreakdown(
        refunds,
        item => item.status,
        item => item.amountCents,
      ),
      withdrawalStatusBreakdown: createAmountBreakdown(
        withdrawals,
        item => item.status,
        item => item.amountCents,
      ),
      refundOutboxStatusBreakdown: createCountBreakdown(
        refundOutboxEvents,
        item => item.status,
      ),
      settlementSummary,
    };
  }

  async getReconciliation() {
    return buildFinanceReconciliationReport(
      {
        listWallets: async () =>
          this.prisma.driverWallet
            ? this.prisma.driverWallet.findMany({})
            : [],
        listSettlements: async () =>
          (
            await this.prisma.settlement.findMany({
              orderBy: { settledAt: 'desc' },
            })
          ).map(item => ({
            id: item.id,
            driverId: item.driverId,
            driverNetAmountCents: item.driverNetAmountCents,
            financialTransactionId: item.financialTransactionId,
          })),
        listWithdrawals: async () =>
          (
            await this.prisma.driverWithdrawal.findMany({
              orderBy: { createdAt: 'desc' },
            })
          ).map(item => ({
            id: item.id,
            driverId: item.driverId,
            amountCents: item.amountCents,
            status: item.status,
            providerPayoutNo: item.providerPayoutNo,
            financialTransactionId: item.financialTransactionId,
          })),
        listFinancialTransactions: async () =>
          this.prisma.financialTransaction.findMany
            ? this.prisma.financialTransaction.findMany({
                orderBy: { occurredAt: 'desc' },
              })
            : [],
        listLegacyUnverifiedOrders: async () =>
          this.prisma.order
            ? this.prisma.order.findMany({
                where: { paymentStatus: 'legacy_unverified' },
                select: { id: true, orderNo: true },
              })
            : [],
      },
      this.now,
    );
  }

  async listPayments(query: AdminFinanceListQuery) {
    const where = createListWhere(query);
    const [items, total] = await Promise.all([
      this.prisma.paymentOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: getSkip(query),
        take: query.pageSize,
      }),
      this.prisma.paymentOrder.count({ where }),
    ]);
    return createPage(items.map(mapAdminPayment), total, query);
  }

  async listRefunds(query: AdminFinanceListQuery) {
    const where = createListWhere(query);
    const [items, total] = await Promise.all([
      this.prisma.refund.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: getSkip(query),
        take: query.pageSize,
      }),
      this.prisma.refund.count({ where }),
    ]);
    const outboxByRefundId = items.length
      ? mapLatestRefundOutboxEvents(
          await this.prisma.financialOutboxEvent.findMany({
            where: {
              refundId: {
                in: items.map(item => item.id),
              },
              eventType: 'refund.requested',
            },
            orderBy: [{ refundId: 'asc' }, { createdAt: 'desc' }],
          }),
        )
      : new Map<string, PrismaAdminOutboxEventRecord>();
    return createPage(
      items.map(item => mapAdminRefund(item, outboxByRefundId.get(item.id))),
      total,
      query,
    );
  }

  async listSettlements(query: AdminFinanceListQuery) {
    const where = createListWhere(query, {
      includeStatus: false,
    });
    const [items, total] = await Promise.all([
      this.prisma.settlement.findMany({
        where,
        orderBy: { settledAt: 'desc' },
        skip: getSkip(query),
        take: query.pageSize,
      }),
      this.prisma.settlement.count({ where }),
    ]);
    return createPage(items.map(mapAdminSettlement), total, query);
  }

  async getLedgerTransaction(transactionId: string) {
    const transaction = await this.prisma.financialTransaction.findUnique({
      where: { id: transactionId },
      include: { entries: { orderBy: { sequence: 'asc' } } },
    });
    return transaction ? mapAdminLedgerTransaction(transaction) : undefined;
  }

  async listWithdrawals(query: AdminFinanceListQuery) {
    const where = createListWhere(query, {
      includeOrderId: false,
    });
    const [items, total] = await Promise.all([
      this.prisma.driverWithdrawal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: getSkip(query),
        take: query.pageSize,
      }),
      this.prisma.driverWithdrawal.count({ where }),
    ]);
    return createPage(items.map(mapAdminWithdrawal), total, query);
  }

  async retryRefund(input: RetryRefundInput): Promise<RetryRefundResult> {
    try {
      return await this.prisma.$transaction(async transaction => {
        const existingAudit = await transaction.financialAuditLog.findUnique({
          where: createAuditWhere(input),
        });
        if (existingAudit) {
          return this.mapRetryReplay(existingAudit, input);
        }

        const refund = await transaction.refund.findUnique({
          where: { id: input.refundId },
        });
        const outboxEvent = await transaction.financialOutboxEvent.findFirst({
          where: {
            refundId: input.refundId,
            eventType: 'refund.requested',
          },
          orderBy: { createdAt: 'desc' },
        });
        if (!refund || !outboxEvent) {
          return { kind: 'not-found' as const };
        }
        if (
          refund.status !== 'failed' ||
          outboxEvent.status !== 'dead' ||
          outboxEvent.attemptCount !== input.expectedVersion
        ) {
          return { kind: 'conflict' as const };
        }

        const now = this.now();
        const eventUpdated =
          await transaction.financialOutboxEvent.updateMany({
            where: {
              id: outboxEvent.id,
              status: 'dead',
              attemptCount: input.expectedVersion,
            },
            data: {
              status: 'pending',
              attemptCount: 0,
              availableAt: now,
              claimedAt: null,
              leaseExpiresAt: null,
              claimedBy: null,
              processedAt: null,
              lastError: null,
              updatedAt: now,
            },
          });
        const refundUpdated = await transaction.refund.updateMany({
          where: { id: refund.id, status: 'failed' },
          data: {
            status: 'pending',
            failureCode: null,
            failureMessage: null,
            failedAt: null,
            updatedAt: now,
          },
        });
        const paymentUpdated = await transaction.paymentOrder.updateMany({
          where: {
            id: refund.paymentOrderId,
            status: 'refund_failed',
          },
          data: {
            status: 'refund_pending',
            failureCode: null,
            failureMessage: null,
            updatedAt: now,
          },
        });
        const orderUpdated = await transaction.order.updateMany({
          where: { id: refund.orderId, paymentStatus: 'refund_failed' },
          data: { paymentStatus: 'refund_pending', updatedAt: now },
        });
        if (
          eventUpdated.count !== 1 ||
          refundUpdated.count !== 1 ||
          paymentUpdated.count !== 1 ||
          orderUpdated.count !== 1
        ) {
          throw new AdminRefundRetryConflictError();
        }

        const nextRefund = {
          ...refund,
          status: 'pending',
          failureCode: null,
          failureMessage: null,
          failedAt: null,
          updatedAt: now,
        };
        const nextOutbox = {
          ...outboxEvent,
          status: 'pending',
          attemptCount: 0,
          availableAt: now,
          updatedAt: now,
        };
        const auditLog = await transaction.financialAuditLog.create({
          data: {
            id: this.createId(),
            actorAdminId: input.adminId,
            action: 'refund.retry',
            entityType: 'refund',
            entityId: refund.id,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            requestId: input.requestId,
            reason: input.reason,
            beforeState: {
              refund: mapAdminRefund(refund),
              outboxEvent: mapAdminOutboxEvent(outboxEvent),
            },
            afterState: {
              refund: mapAdminRefund(nextRefund),
              outboxEvent: mapAdminOutboxEvent(nextOutbox),
            },
            createdAt: now,
          },
        });

        return {
          kind: 'success' as const,
          replayed: false,
          refund: mapAdminRefund(nextRefund),
          outboxEvent: mapAdminOutboxEvent(nextOutbox),
          auditLog: mapAdminAuditLog(auditLog),
        };
      });
    } catch (error) {
      if (
        error instanceof AdminRefundRetryConflictError ||
        isPrismaErrorCode(error, 'P2002')
      ) {
        const auditLog = await this.prisma.financialAuditLog.findUnique({
          where: createAuditWhere(input),
        });
        if (auditLog) {
          return this.mapRetryReplay(auditLog, input);
        }
        if (error instanceof AdminRefundRetryConflictError) {
          return { kind: 'conflict' };
        }
      }
      throw error;
    }
  }

  private async mapRetryReplay(
    auditLog: PrismaAdminAuditLogRecord,
    input: RetryRefundInput,
  ): Promise<RetryRefundResult> {
    if (
      auditLog.requestFingerprint !== input.requestFingerprint ||
      auditLog.entityId !== input.refundId
    ) {
      return { kind: 'key-reused' };
    }

    const [refund, outboxEvent] = await Promise.all([
      this.prisma.refund.findUnique({ where: { id: input.refundId } }),
      this.prisma.financialOutboxEvent.findFirst({
        where: {
          refundId: input.refundId,
          eventType: 'refund.requested',
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    if (!refund || !outboxEvent) {
      return { kind: 'conflict' };
    }

    return {
      kind: 'success',
      replayed: true,
      refund: mapAdminRefund(refund),
      outboxEvent: mapAdminOutboxEvent(outboxEvent),
      auditLog: mapAdminAuditLog(auditLog),
    };
  }
}

function getSkip(query: AdminFinanceListQuery) {
  return (query.page - 1) * query.pageSize;
}

function createListWhere(
  query: AdminFinanceListQuery,
  options: {
    includeStatus?: boolean;
    includeOrderId?: boolean;
  } = {},
) {
  return {
    ...(options.includeStatus === false || !query.status
      ? {}
      : { status: query.status }),
    ...(options.includeOrderId === false || !query.orderId
      ? {}
      : { orderId: query.orderId }),
  };
}

function sumBy<T>(items: T[], getAmount: (item: T) => number) {
  return items.reduce((total, item) => total + Number(getAmount(item) || 0), 0);
}

function createAmountBreakdown<T>(
  items: T[],
  getStatus: (item: T) => string,
  getAmount: (item: T) => number,
): AdminFinanceAmountBreakdownItem[] {
  const breakdown = new Map<
    string,
    { status: string; count: number; amountCents: number }
  >();

  items.forEach(item => {
    const status = String(getStatus(item) || 'unknown');
    const current = breakdown.get(status) ?? {
      status,
      count: 0,
      amountCents: 0,
    };
    current.count += 1;
    current.amountCents += Number(getAmount(item) || 0);
    breakdown.set(status, current);
  });

  return Array.from(breakdown.values()).sort((left, right) =>
    left.status.localeCompare(right.status),
  );
}

function createCountBreakdown<T>(
  items: T[],
  getStatus: (item: T) => string,
): AdminFinanceCountBreakdownItem[] {
  const breakdown = new Map<string, { status: string; count: number }>();

  items.forEach(item => {
    const status = String(getStatus(item) || 'unknown');
    const current = breakdown.get(status) ?? { status, count: 0 };
    current.count += 1;
    breakdown.set(status, current);
  });

  return Array.from(breakdown.values()).sort((left, right) =>
    left.status.localeCompare(right.status),
  );
}

function createSettlementSummary(
  settlements: PrismaAdminSettlementRecord[],
): AdminFinanceSettlementSummary {
  return settlements.reduce<AdminFinanceSettlementSummary>(
    (summary, settlement) => ({
      count: summary.count + 1,
      grossAmountCents:
        summary.grossAmountCents + Number(settlement.grossAmountCents || 0),
      platformFeeCents:
        summary.platformFeeCents + Number(settlement.platformFeeCents || 0),
      driverNetAmountCents:
        summary.driverNetAmountCents +
        Number(settlement.driverNetAmountCents || 0),
    }),
    {
      count: 0,
      grossAmountCents: 0,
      platformFeeCents: 0,
      driverNetAmountCents: 0,
    },
  );
}

function createPage<T>(
  items: T[],
  total: number,
  query: AdminFinanceListQuery,
): AdminFinancePage<T> {
  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

function createAuditWhere(input: RetryRefundInput) {
  return {
    FinancialAuditLog_actor_action_key_unique: {
      actorAdminId: input.adminId,
      action: 'refund.retry',
      idempotencyKey: input.idempotencyKey,
    },
  };
}

function mapAdminPayment(record: PrismaAdminPaymentRecord) {
  return {
    id: record.id,
    paymentNo: record.paymentNo,
    orderId: record.orderId,
    shipperId: record.shipperId,
    channel: record.channel,
    amountCents: record.amountCents,
    status: record.status,
    ...(record.providerTradeNo
      ? { providerTradeNo: record.providerTradeNo }
      : {}),
    ...(record.failureCode ? { failureCode: record.failureCode } : {}),
    ...(record.failureMessage
      ? { failureMessage: record.failureMessage }
      : {}),
    expiresAtIso: record.expiresAt.toISOString(),
    ...(record.paidAt ? { paidAtIso: record.paidAt.toISOString() } : {}),
    ...(record.settledAt
      ? { settledAtIso: record.settledAt.toISOString() }
      : {}),
    ...(record.cancelledAt
      ? { cancelledAtIso: record.cancelledAt.toISOString() }
      : {}),
    createdAtIso: record.createdAt.toISOString(),
    updatedAtIso: record.updatedAt.toISOString(),
  };
}

function mapAdminRefund(
  record: PrismaAdminRefundRecord,
  outboxEvent?: PrismaAdminOutboxEventRecord,
) {
  return {
    id: record.id,
    refundNo: record.refundNo,
    paymentOrderId: record.paymentOrderId,
    orderId: record.orderId,
    shipperId: record.shipperId,
    channel: record.channel,
    amountCents: record.amountCents,
    reason: record.reason,
    status: record.status,
    ...(record.providerRefundNo
      ? { providerRefundNo: record.providerRefundNo }
      : {}),
    ...(record.failureCode ? { failureCode: record.failureCode } : {}),
    ...(record.failureMessage
      ? { failureMessage: record.failureMessage }
      : {}),
    ...(record.processingStartedAt
      ? { processingStartedAtIso: record.processingStartedAt.toISOString() }
      : {}),
    ...(record.succeededAt
      ? { succeededAtIso: record.succeededAt.toISOString() }
      : {}),
    ...(record.failedAt ? { failedAtIso: record.failedAt.toISOString() } : {}),
    ...(record.financialTransactionId
      ? { financialTransactionId: record.financialTransactionId }
      : {}),
    ...(outboxEvent ? { outboxEvent: mapAdminOutboxEvent(outboxEvent) } : {}),
    createdAtIso: record.createdAt.toISOString(),
    updatedAtIso: record.updatedAt.toISOString(),
  };
}

function mapAdminSettlement(record: PrismaAdminSettlementRecord) {
  return {
    id: record.id,
    orderId: record.orderId,
    ...(record.paymentOrderId ? { paymentOrderId: record.paymentOrderId } : {}),
    driverId: record.driverId,
    grossAmountCents: record.grossAmountCents,
    platformFeeRateBps: record.platformFeeRateBps,
    platformFeeCents: record.platformFeeCents,
    driverNetAmountCents: record.driverNetAmountCents,
    financialTransactionId: record.financialTransactionId,
    settledAtIso: record.settledAt.toISOString(),
    createdAtIso: record.createdAt.toISOString(),
  };
}

function mapAdminWithdrawal(record: PrismaAdminWithdrawalRecord) {
  return {
    id: record.id,
    driverId: record.driverId,
    amountCents: record.amountCents,
    bankAccountName: record.bankAccountName,
    bankName: record.bankName,
    bankAccountMasked: record.bankAccountMasked,
    status: record.status,
    version: record.version,
    ...(record.rejectionReason
      ? { rejectionReason: record.rejectionReason }
      : {}),
    ...(record.processedByAdminId
      ? { processedByAdminId: record.processedByAdminId }
      : {}),
    ...(record.processedAt
      ? { processedAtIso: record.processedAt.toISOString() }
      : {}),
    ...(record.payoutChannel ? { payoutChannel: record.payoutChannel } : {}),
    ...(record.providerPayoutNo
      ? { providerPayoutNo: record.providerPayoutNo }
      : {}),
    ...(record.payoutExecutedAt
      ? { payoutExecutedAtIso: record.payoutExecutedAt.toISOString() }
      : {}),
    ...(record.financialTransactionId
      ? { financialTransactionId: record.financialTransactionId }
      : {}),
    createdAtIso: record.createdAt.toISOString(),
    updatedAtIso: record.updatedAt.toISOString(),
  };
}

function mapAdminLedgerTransaction(
  record: PrismaAdminLedgerTransactionRecord,
): FinancialTransactionRecord {
  return {
    id: record.id,
    transactionNo: record.transactionNo,
    type: record.type,
    referenceId: record.referenceId,
    ...(record.orderId ? { orderId: record.orderId } : {}),
    ...(record.paymentOrderId ? { paymentOrderId: record.paymentOrderId } : {}),
    amountCents: record.amountCents,
    occurredAtIso: record.occurredAt.toISOString(),
    createdAtIso: record.createdAt.toISOString(),
    entries: record.entries.map(entry => ({
      id: entry.id,
      transactionId: entry.transactionId,
      sequence: entry.sequence,
      accountType: entry.accountType,
      ...(entry.accountUserId ? { accountUserId: entry.accountUserId } : {}),
      direction: entry.direction,
      amountCents: entry.amountCents,
      createdAtIso: entry.createdAt.toISOString(),
    })),
  };
}

function mapAdminOutboxEvent(record: PrismaAdminOutboxEventRecord) {
  return {
    id: record.id,
    ...(record.refundId ? { refundId: record.refundId } : {}),
    status: record.status,
    attemptCount: record.attemptCount,
    maxAttempts: record.maxAttempts,
    availableAtIso: record.availableAt.toISOString(),
    createdAtIso: record.createdAt.toISOString(),
    updatedAtIso: record.updatedAt.toISOString(),
  };
}

function mapLatestRefundOutboxEvents(
  records: PrismaAdminOutboxEventRecord[],
) {
  const result = new Map<string, PrismaAdminOutboxEventRecord>();

  records.forEach(record => {
    if (!record.refundId || result.has(record.refundId)) {
      return;
    }
    result.set(record.refundId, record);
  });

  return result;
}

function mapAdminAuditLog(
  record: PrismaAdminAuditLogRecord,
): FinancialAuditLogRecord {
  return {
    id: record.id,
    actorAdminId: record.actorAdminId,
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId,
    idempotencyKey: record.idempotencyKey,
    requestFingerprint: record.requestFingerprint,
    requestId: record.requestId,
    reason: record.reason,
    ...(isRecord(record.beforeState) ? { beforeState: record.beforeState } : {}),
    ...(isRecord(record.afterState) ? { afterState: record.afterState } : {}),
    createdAtIso: record.createdAt.toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPrismaErrorCode(error: unknown, code: string) {
  return (
    isRecord(error) &&
    typeof error.code === 'string' &&
    error.code === code
  );
}

class AdminRefundRetryConflictError extends Error {}
