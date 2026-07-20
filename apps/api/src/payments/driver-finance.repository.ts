import { createHash, randomUUID } from 'crypto';
import type {
  CreateDriverWithdrawalRequest,
  DriverIncomeOverview,
  DriverIncomeRecord,
  DriverWithdrawalRecord,
} from '../driver-orders/dto';
import type {
  DriverWalletRecord,
  FinancialAuditLogRecord,
  FinancialTransactionRecord,
} from './dto';
import { InMemoryFinancialStore } from './in-memory-financial.store';
import {
  assertLedgerBalanced,
  createWithdrawalEntries,
} from './payment-domain';

export interface DriverFinanceRepository {
  getIncomeOverview(
    driverId: string,
    now: Date,
  ): Promise<DriverIncomeOverview>;
  executeIdempotentWithdrawalRequest(
    input: ExecuteDriverWithdrawalInput,
  ): Promise<ExecuteDriverWithdrawalResult>;
  reviewWithdrawal(
    input: ReviewDriverWithdrawalInput,
  ): Promise<ReviewDriverWithdrawalResult>;
}

export type ExecuteDriverWithdrawalInput = {
  driverId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  amountCents: number;
  bankAccountName: string;
  bankName: string;
  bankAccountNo: string;
};

export type ExecuteDriverWithdrawalResult =
  | {
      kind: 'success';
      replayed: boolean;
      withdrawal: DriverWithdrawalRecord;
    }
  | { kind: 'key-reused' }
  | { kind: 'balance-insufficient' };

export type ReviewDriverWithdrawalInput = {
  withdrawalId: string;
  adminId: string;
  action: 'approve' | 'reject';
  idempotencyKey: string;
  requestFingerprint: string;
  requestId: string;
  reason: string;
  expectedVersion: number;
};

export type ReviewedDriverWithdrawalRecord = DriverWithdrawalRecord & {
  version: number;
  processedByAdminId?: string;
  processedAtIso?: string;
  financialTransactionId?: string;
};

export type ReviewDriverWithdrawalResult =
  | {
      kind: 'success';
      replayed: boolean;
      withdrawal: ReviewedDriverWithdrawalRecord;
      wallet: DriverWalletRecord;
      financialTransaction?: FinancialTransactionRecord;
      auditLog: FinancialAuditLogRecord;
    }
  | { kind: 'key-reused' }
  | { kind: 'not-found' }
  | { kind: 'conflict' };

export function createDriverWithdrawalFingerprint(
  input: CreateDriverWithdrawalRequest,
) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        amountCents: input.amountCents,
        bankAccountName: input.bankAccountName.trim(),
        bankName: input.bankName.trim(),
        bankAccountNo: input.bankAccountNo.replace(/\s+/g, ''),
      }),
    )
    .digest('hex');
}

type InMemoryDriverWithdrawal = DriverWithdrawalRecord & {
  idempotencyKey: string;
  requestFingerprint: string;
  version: number;
  processedByAdminId?: string;
  processedAtIso?: string;
  financialTransactionId?: string;
};

export class InMemoryDriverFinanceRepository
  implements DriverFinanceRepository
{
  private readonly withdrawals: InMemoryDriverWithdrawal[] = [];
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly financialStore: InMemoryFinancialStore,
    options: { now?: () => Date; createId?: () => string } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  async getIncomeOverview(
    driverId: string,
    now: Date,
  ): Promise<DriverIncomeOverview> {
    const records = this.financialStore
      .listSettlements()
      .filter(settlement => settlement.driverId === driverId)
      .sort((left, right) =>
        right.settledAtIso.localeCompare(left.settledAtIso),
      )
      .map<DriverIncomeRecord>(settlement => ({
        orderId: settlement.orderId,
        orderNo: settlement.orderId,
        completedAtIso: settlement.settledAtIso,
        routeText: '',
        vehicleType: '',
        grossAmountCents: settlement.grossAmountCents,
        platformFeeCents: settlement.platformFeeCents,
        netIncomeCents: settlement.driverNetAmountCents,
      }));
    const wallet = this.financialStore.findDriverWallet(driverId);

    return createIncomeOverview(driverId, now, records, wallet);
  }

  async executeIdempotentWithdrawalRequest(
    input: ExecuteDriverWithdrawalInput,
  ): Promise<ExecuteDriverWithdrawalResult> {
    const existing = this.withdrawals.find(
      withdrawal =>
        withdrawal.driverId === input.driverId &&
        withdrawal.idempotencyKey === input.idempotencyKey,
    );

    if (existing) {
      return existing.requestFingerprint === input.requestFingerprint
        ? {
            kind: 'success',
            replayed: true,
            withdrawal: structuredClone(existing),
          }
        : { kind: 'key-reused' };
    }

    const now = this.now();
    const wallet = this.financialStore.reserveDriverWallet(
      input.driverId,
      input.amountCents,
      now,
    );

    if (!wallet) {
      return { kind: 'balance-insufficient' };
    }

    const nowIso = now.toISOString();
    const withdrawal: InMemoryDriverWithdrawal = {
      id: this.createId(),
      driverId: input.driverId,
      amountCents: input.amountCents,
      bankAccountName: input.bankAccountName,
      bankName: input.bankName,
      bankAccountMasked: maskBankAccountNo(input.bankAccountNo),
      status: 'reviewing',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      version: 0,
    };
    this.withdrawals.push(withdrawal);

    return {
      kind: 'success',
      replayed: false,
      withdrawal: structuredClone(withdrawal),
    };
  }

  async reviewWithdrawal(
    input: ReviewDriverWithdrawalInput,
  ): Promise<ReviewDriverWithdrawalResult> {
    const action = `withdrawal.${input.action}`;
    const existingAuditLog = this.financialStore.findFinancialAuditLog(
      input.adminId,
      action,
      input.idempotencyKey,
    );

    if (existingAuditLog) {
      if (
        existingAuditLog.requestFingerprint !== input.requestFingerprint ||
        existingAuditLog.entityId !== input.withdrawalId
      ) {
        return { kind: 'key-reused' };
      }

      return this.mapInMemoryReviewReplay(existingAuditLog);
    }

    const withdrawal = this.withdrawals.find(
      item => item.id === input.withdrawalId,
    );
    if (!withdrawal) {
      return { kind: 'not-found' };
    }
    if (
      withdrawal.status !== 'reviewing' ||
      withdrawal.version !== input.expectedVersion
    ) {
      return { kind: 'conflict' };
    }

    const now = this.now();
    const beforeWithdrawal = structuredClone(withdrawal);
    const beforeWallet = this.financialStore.findDriverWallet(
      withdrawal.driverId,
    );
    const wallet =
      input.action === 'approve'
        ? this.financialStore.payReservedDriverWallet(
            withdrawal.driverId,
            withdrawal.amountCents,
            now,
          )
        : this.financialStore.releaseReservedDriverWallet(
            withdrawal.driverId,
            withdrawal.amountCents,
            now,
          );
    if (!wallet || !beforeWallet) {
      return { kind: 'conflict' };
    }

    const nowIso = now.toISOString();
    const financialTransaction =
      input.action === 'approve'
        ? this.createInMemoryWithdrawalTransaction(withdrawal, nowIso)
        : undefined;

    withdrawal.status = input.action === 'approve' ? 'paid' : 'rejected';
    if (input.action === 'reject') {
      withdrawal.rejectionReason = input.reason;
    }
    withdrawal.version += 1;
    withdrawal.processedByAdminId = input.adminId;
    withdrawal.processedAtIso = nowIso;
    if (financialTransaction) {
      withdrawal.financialTransactionId = financialTransaction.id;
    }
    withdrawal.updatedAtIso = nowIso;

    const auditLog = this.financialStore.createFinancialAuditLog({
      id: this.createId(),
      actorAdminId: input.adminId,
      action,
      entityType: 'driver_withdrawal',
      entityId: withdrawal.id,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      requestId: input.requestId,
      reason: input.reason,
      beforeState: {
        withdrawal: beforeWithdrawal,
        wallet: beforeWallet,
      },
      afterState: {
        withdrawal: structuredClone(withdrawal),
        wallet,
        ...(financialTransaction
          ? { financialTransactionId: financialTransaction.id }
          : {}),
      },
      createdAtIso: nowIso,
    });

    return {
      kind: 'success',
      replayed: false,
      withdrawal: structuredClone(withdrawal),
      wallet,
      ...(financialTransaction ? { financialTransaction } : {}),
      auditLog,
    };
  }

  private createInMemoryWithdrawalTransaction(
    withdrawal: InMemoryDriverWithdrawal,
    nowIso: string,
  ) {
    const transactionId = this.createId();
    const entryDrafts = createWithdrawalEntries(
      withdrawal.amountCents,
      withdrawal.driverId,
    );
    assertLedgerBalanced(entryDrafts);

    return this.financialStore.createFinancialTransaction({
      id: transactionId,
      transactionNo: `FT-${transactionId}`,
      type: 'driver_withdrawal',
      referenceId: withdrawal.id,
      amountCents: withdrawal.amountCents,
      occurredAtIso: nowIso,
      createdAtIso: nowIso,
      entries: entryDrafts.map((entry, sequence) => ({
        id: `${transactionId}-${sequence + 1}`,
        transactionId,
        sequence: sequence + 1,
        ...entry,
        createdAtIso: nowIso,
      })),
    });
  }

  private mapInMemoryReviewReplay(
    auditLog: FinancialAuditLogRecord,
  ): ReviewDriverWithdrawalResult {
    const withdrawal = this.withdrawals.find(
      item => item.id === auditLog.entityId,
    );
    const wallet = withdrawal
      ? this.financialStore.findDriverWallet(withdrawal.driverId)
      : undefined;
    if (!withdrawal || !wallet) {
      return { kind: 'conflict' };
    }

    const financialTransaction = withdrawal.financialTransactionId
      ? this.financialStore
          .listFinancialTransactions()
          .find(item => item.id === withdrawal.financialTransactionId)
      : undefined;

    return {
      kind: 'success',
      replayed: true,
      withdrawal: structuredClone(withdrawal),
      wallet,
      ...(financialTransaction ? { financialTransaction } : {}),
      auditLog,
    };
  }
}

type PrismaSettlementIncomeRecord = {
  orderId: string;
  driverId: string;
  grossAmountCents: number;
  platformFeeCents: number;
  driverNetAmountCents: number;
  settledAt: Date;
  order: {
    orderNo: string;
    locations: Array<{ type: string; address: string }>;
    requirement: { vehicleType: string } | null;
  };
};

type PrismaDriverWalletRecord = {
  driverId: string;
  availableCents: number;
  reservedCents: number;
  withdrawnCents: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaDriverWithdrawalRecord = {
  id: string;
  driverId: string;
  amountCents: number;
  bankAccountName: string;
  bankName: string;
  bankAccountMasked: string;
  status: DriverWithdrawalRecord['status'];
  idempotencyKey: string | null;
  requestFingerprint: string | null;
  version: number;
  rejectionReason: string | null;
  processedByAdminId: string | null;
  processedAt: Date | null;
  financialTransactionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaFinancialLedgerEntryRecord = {
  id: string;
  transactionId: string;
  sequence: number;
  accountType: FinancialTransactionRecord['entries'][number]['accountType'];
  accountUserId: string | null;
  direction: FinancialTransactionRecord['entries'][number]['direction'];
  amountCents: number;
  createdAt: Date;
};

type PrismaFinancialTransactionRecord = {
  id: string;
  transactionNo: string;
  type: FinancialTransactionRecord['type'];
  referenceId: string;
  orderId: string | null;
  paymentOrderId: string | null;
  amountCents: number;
  occurredAt: Date;
  createdAt: Date;
  entries: PrismaFinancialLedgerEntryRecord[];
};

type PrismaFinancialAuditLogRecord = {
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

type PrismaDriverFinanceTransactionClient = {
  driverWithdrawal: {
    findUnique(args: unknown): Promise<PrismaDriverWithdrawalRecord | null>;
    create(args: unknown): Promise<PrismaDriverWithdrawalRecord>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  driverWallet: {
    findUnique(args: unknown): Promise<PrismaDriverWalletRecord | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  financialTransaction: {
    findUnique(args: unknown): Promise<PrismaFinancialTransactionRecord | null>;
    create(args: unknown): Promise<PrismaFinancialTransactionRecord>;
  };
  financialAuditLog: {
    findUnique(args: unknown): Promise<PrismaFinancialAuditLogRecord | null>;
    create(args: unknown): Promise<PrismaFinancialAuditLogRecord>;
  };
};

type PrismaDriverFinanceReviewReadClient = {
  driverWithdrawal: {
    findUnique(args: unknown): Promise<PrismaDriverWithdrawalRecord | null>;
  };
  driverWallet: {
    findUnique(args: unknown): Promise<PrismaDriverWalletRecord | null>;
  };
  financialTransaction: {
    findUnique(args: unknown): Promise<PrismaFinancialTransactionRecord | null>;
  };
};

export type PrismaDriverFinanceClient = {
  $transaction<T>(
    callback: (transaction: PrismaDriverFinanceTransactionClient) => Promise<T>,
  ): Promise<T>;
  settlement: {
    findMany(args: unknown): Promise<PrismaSettlementIncomeRecord[]>;
  };
  driverWallet: {
    findUnique(args: unknown): Promise<PrismaDriverWalletRecord | null>;
  };
  driverWithdrawal: {
    findUnique(args: unknown): Promise<PrismaDriverWithdrawalRecord | null>;
  };
  financialTransaction: {
    findUnique(args: unknown): Promise<PrismaFinancialTransactionRecord | null>;
  };
  financialAuditLog: {
    findUnique(args: unknown): Promise<PrismaFinancialAuditLogRecord | null>;
  };
};

export class PrismaDriverFinanceRepository implements DriverFinanceRepository {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly prisma: PrismaDriverFinanceClient,
    options: { now?: () => Date; createId?: () => string } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  async getIncomeOverview(
    driverId: string,
    now: Date,
  ): Promise<DriverIncomeOverview> {
    const [settlements, wallet] = await Promise.all([
      this.prisma.settlement.findMany({
        where: { driverId },
        orderBy: { settledAt: 'desc' },
        include: {
          order: {
            select: {
              orderNo: true,
              locations: {
                select: { type: true, address: true },
              },
              requirement: {
                select: { vehicleType: true },
              },
            },
          },
        },
      }),
      this.prisma.driverWallet.findUnique({ where: { driverId } }),
    ]);
    const records = settlements.map<DriverIncomeRecord>(settlement => {
      const pickupAddress = settlement.order.locations.find(
        location => location.type === 'pickup',
      )?.address;
      const deliveryAddress = settlement.order.locations.find(
        location => location.type === 'delivery',
      )?.address;

      return {
        orderId: settlement.orderId,
        orderNo: settlement.order.orderNo,
        completedAtIso: settlement.settledAt.toISOString(),
        routeText:
          pickupAddress && deliveryAddress
            ? `${pickupAddress} -> ${deliveryAddress}`
            : '',
        vehicleType: settlement.order.requirement?.vehicleType ?? '',
        grossAmountCents: settlement.grossAmountCents,
        platformFeeCents: settlement.platformFeeCents,
        netIncomeCents: settlement.driverNetAmountCents,
      };
    });

    return createIncomeOverview(
      driverId,
      now,
      records,
      wallet
        ? {
            driverId: wallet.driverId,
            availableCents: wallet.availableCents,
            reservedCents: wallet.reservedCents,
            withdrawnCents: wallet.withdrawnCents,
            version: wallet.version,
            createdAtIso: wallet.createdAt.toISOString(),
            updatedAtIso: wallet.updatedAt.toISOString(),
          }
        : undefined,
    );
  }

  async executeIdempotentWithdrawalRequest(
    input: ExecuteDriverWithdrawalInput,
  ): Promise<ExecuteDriverWithdrawalResult> {
    try {
      return await this.prisma.$transaction(async transaction => {
        const existing = await transaction.driverWithdrawal.findUnique({
          where: {
            DriverWithdrawal_driver_idempotency_key_unique: {
              driverId: input.driverId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });

        if (existing) {
          return mapExistingPrismaWithdrawal(existing, input);
        }

        const now = this.now();
        const reserved = await transaction.driverWallet.updateMany({
          where: {
            driverId: input.driverId,
            availableCents: { gte: input.amountCents },
          },
          data: {
            availableCents: { decrement: input.amountCents },
            reservedCents: { increment: input.amountCents },
            version: { increment: 1 },
            updatedAt: now,
          },
        });

        if (reserved.count !== 1) {
          return { kind: 'balance-insufficient' as const };
        }

        const withdrawal = await transaction.driverWithdrawal.create({
          data: {
            id: this.createId(),
            driverId: input.driverId,
            amountCents: input.amountCents,
            bankAccountName: input.bankAccountName,
            bankName: input.bankName,
            bankAccountMasked: maskBankAccountNo(input.bankAccountNo),
            status: 'reviewing',
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            version: 0,
            createdAt: now,
            updatedAt: now,
          },
        });

        return {
          kind: 'success' as const,
          replayed: false,
          withdrawal: mapPrismaWithdrawal(withdrawal),
        };
      });
    } catch (error) {
      if (!isPrismaErrorCode(error, 'P2002')) {
        throw error;
      }

      const existing = await this.prisma.driverWithdrawal.findUnique({
        where: {
          DriverWithdrawal_driver_idempotency_key_unique: {
            driverId: input.driverId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });

      if (!existing) {
        throw error;
      }

      return mapExistingPrismaWithdrawal(existing, input);
    }
  }

  async reviewWithdrawal(
    input: ReviewDriverWithdrawalInput,
  ): Promise<ReviewDriverWithdrawalResult> {
    try {
      return await this.prisma.$transaction(async transaction => {
        const action = `withdrawal.${input.action}`;
        const existingAuditLog = await transaction.financialAuditLog.findUnique(
          {
            where: {
              FinancialAuditLog_actor_action_key_unique: {
                actorAdminId: input.adminId,
                action,
                idempotencyKey: input.idempotencyKey,
              },
            },
          },
        );
        if (existingAuditLog) {
          return this.mapPrismaReviewReplay(
            transaction,
            existingAuditLog,
            input,
          );
        }

        const withdrawal = await transaction.driverWithdrawal.findUnique({
          where: { id: input.withdrawalId },
        });
        if (!withdrawal) {
          return { kind: 'not-found' as const };
        }
        if (
          withdrawal.status !== 'reviewing' ||
          withdrawal.version !== input.expectedVersion
        ) {
          return { kind: 'conflict' as const };
        }

        const walletBefore = await transaction.driverWallet.findUnique({
          where: { driverId: withdrawal.driverId },
        });
        if (!walletBefore) {
          return { kind: 'conflict' as const };
        }

        const now = this.now();
        const transactionId =
          input.action === 'approve' ? this.createId() : undefined;
        const updatedWithdrawal =
          await transaction.driverWithdrawal.updateMany({
            where: {
              id: withdrawal.id,
              status: 'reviewing',
              version: input.expectedVersion,
            },
            data: {
              status: input.action === 'approve' ? 'paid' : 'rejected',
              version: { increment: 1 },
              processedByAdminId: input.adminId,
              processedAt: now,
              ...(input.action === 'reject'
                ? { rejectionReason: input.reason }
                : {}),
              updatedAt: now,
            },
          });
        if (updatedWithdrawal.count !== 1) {
          const winner = await transaction.financialAuditLog.findUnique({
            where: {
              FinancialAuditLog_actor_action_key_unique: {
                actorAdminId: input.adminId,
                action,
                idempotencyKey: input.idempotencyKey,
              },
            },
          });
          return winner
            ? this.mapPrismaReviewReplay(transaction, winner, input)
            : { kind: 'conflict' as const };
        }

        const updatedWallet = await transaction.driverWallet.updateMany({
          where: {
            driverId: withdrawal.driverId,
            reservedCents: { gte: withdrawal.amountCents },
          },
          data:
            input.action === 'approve'
              ? {
                  reservedCents: { decrement: withdrawal.amountCents },
                  withdrawnCents: { increment: withdrawal.amountCents },
                  version: { increment: 1 },
                  updatedAt: now,
                }
              : {
                  reservedCents: { decrement: withdrawal.amountCents },
                  availableCents: { increment: withdrawal.amountCents },
                  version: { increment: 1 },
                  updatedAt: now,
                },
        });
        if (updatedWallet.count !== 1) {
          throw new DriverWithdrawalReviewConflictError();
        }

        const financialTransaction = transactionId
          ? await this.createPrismaWithdrawalTransaction(
              transaction,
              transactionId,
              withdrawal,
              now,
            )
          : undefined;
        if (transactionId) {
          const linkedWithdrawal = await transaction.driverWithdrawal.updateMany({
            where: {
              id: withdrawal.id,
              financialTransactionId: null,
            },
            data: {
              financialTransactionId: transactionId,
              updatedAt: now,
            },
          });

          if (linkedWithdrawal.count !== 1) {
            throw new DriverWithdrawalReviewConflictError();
          }
        }
        const withdrawalAfter = await transaction.driverWithdrawal.findUnique({
          where: { id: withdrawal.id },
        });
        const walletAfter = await transaction.driverWallet.findUnique({
          where: { driverId: withdrawal.driverId },
        });
        if (!withdrawalAfter || !walletAfter) {
          throw new DriverWithdrawalReviewConflictError();
        }

        const auditLog = await transaction.financialAuditLog.create({
          data: {
            id: this.createId(),
            actorAdminId: input.adminId,
            action,
            entityType: 'driver_withdrawal',
            entityId: withdrawal.id,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            requestId: input.requestId,
            reason: input.reason,
            beforeState: {
              withdrawal: mapPrismaReviewedWithdrawal(withdrawal),
              wallet: mapPrismaWallet(walletBefore),
            },
            afterState: {
              withdrawal: mapPrismaReviewedWithdrawal(withdrawalAfter),
              wallet: mapPrismaWallet(walletAfter),
              ...(financialTransaction
                ? { financialTransactionId: financialTransaction.id }
                : {}),
            },
            createdAt: now,
          },
        });

        return {
          kind: 'success' as const,
          replayed: false,
          withdrawal: mapPrismaReviewedWithdrawal(withdrawalAfter),
          wallet: mapPrismaWallet(walletAfter),
          ...(financialTransaction
            ? {
                financialTransaction:
                  mapPrismaFinancialTransaction(financialTransaction),
              }
            : {}),
          auditLog: mapPrismaFinancialAuditLog(auditLog),
        };
      });
    } catch (error) {
      if (error instanceof DriverWithdrawalReviewConflictError) {
        return { kind: 'conflict' };
      }
      if (!isPrismaErrorCode(error, 'P2002')) {
        throw error;
      }

      const action = `withdrawal.${input.action}`;
      const auditLog = await this.prisma.financialAuditLog.findUnique({
        where: {
          FinancialAuditLog_actor_action_key_unique: {
            actorAdminId: input.adminId,
            action,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (!auditLog) {
        throw error;
      }

      return this.mapPrismaReviewReplay(this.prisma, auditLog, input);
    }
  }

  private async createPrismaWithdrawalTransaction(
    transaction: PrismaDriverFinanceTransactionClient,
    transactionId: string,
    withdrawal: PrismaDriverWithdrawalRecord,
    now: Date,
  ) {
    const entries = createWithdrawalEntries(
      withdrawal.amountCents,
      withdrawal.driverId,
    );
    assertLedgerBalanced(entries);

    return transaction.financialTransaction.create({
      data: {
        id: transactionId,
        transactionNo: `FT-${transactionId}`,
        type: 'driver_withdrawal',
        referenceId: withdrawal.id,
        amountCents: withdrawal.amountCents,
        occurredAt: now,
        entries: {
          create: entries.map((entry, sequence) => ({
            sequence: sequence + 1,
            ...entry,
            createdAt: now,
          })),
        },
        createdAt: now,
      },
      include: { entries: { orderBy: { sequence: 'asc' } } },
    });
  }

  private async mapPrismaReviewReplay(
    client: PrismaDriverFinanceReviewReadClient,
    auditLog: PrismaFinancialAuditLogRecord,
    input: ReviewDriverWithdrawalInput,
  ): Promise<ReviewDriverWithdrawalResult> {
    if (
      auditLog.requestFingerprint !== input.requestFingerprint ||
      auditLog.entityId !== input.withdrawalId
    ) {
      return { kind: 'key-reused' };
    }

    const auditedSnapshot = parseReviewAfterState(auditLog.afterState);
    if (auditedSnapshot) {
      const financialTransactionId =
        auditedSnapshot.withdrawal.financialTransactionId;
      const financialTransaction = financialTransactionId
        ? await client.financialTransaction.findUnique({
            where: { id: financialTransactionId },
            include: { entries: { orderBy: { sequence: 'asc' } } },
          })
        : null;
      if (auditLog.action === 'withdrawal.approve' && !financialTransaction) {
        return { kind: 'conflict' };
      }

      return {
        kind: 'success',
        replayed: true,
        withdrawal: auditedSnapshot.withdrawal,
        wallet: auditedSnapshot.wallet,
        ...(financialTransaction
          ? {
              financialTransaction:
                mapPrismaFinancialTransaction(financialTransaction),
            }
          : {}),
        auditLog: mapPrismaFinancialAuditLog(auditLog),
      };
    }

    const withdrawal = await client.driverWithdrawal.findUnique({
      where: { id: auditLog.entityId },
    });
    const wallet = withdrawal
      ? await client.driverWallet.findUnique({
          where: { driverId: withdrawal.driverId },
        })
      : null;
    if (!withdrawal || !wallet) {
      return { kind: 'conflict' };
    }

    const financialTransaction = withdrawal.financialTransactionId
      ? await client.financialTransaction.findUnique({
          where: { id: withdrawal.financialTransactionId },
          include: { entries: { orderBy: { sequence: 'asc' } } },
        })
      : null;

    return {
      kind: 'success',
      replayed: true,
      withdrawal: mapPrismaReviewedWithdrawal(withdrawal),
      wallet: mapPrismaWallet(wallet),
      ...(financialTransaction
        ? { financialTransaction: mapPrismaFinancialTransaction(financialTransaction) }
        : {}),
      auditLog: mapPrismaFinancialAuditLog(auditLog),
    };
  }
}

function createIncomeOverview(
  driverId: string,
  now: Date,
  records: DriverIncomeRecord[],
  wallet: DriverWalletRecord | undefined,
): DriverIncomeOverview {
  const historyIncomeCents = sumIncomeSince(records, new Date(0));

  return {
    driverId,
    summary: {
      todayIncomeCents: sumIncomeSince(records, getStartOfUtcDay(now)),
      weekIncomeCents: sumIncomeSince(records, getStartOfUtcWeek(now)),
      monthIncomeCents: sumIncomeSince(records, getStartOfUtcMonth(now)),
      historyIncomeCents,
      pendingSettlementCents: 0,
      availableWithdrawalCents: wallet?.availableCents ?? 0,
      reviewingWithdrawalCents: wallet?.reservedCents ?? 0,
      withdrawnCents: wallet?.withdrawnCents ?? 0,
      completedOrderCount: records.length,
    },
    records: records.slice(0, 20),
  };
}

function sumIncomeSince(records: DriverIncomeRecord[], startAt: Date) {
  const startTimestamp = startAt.getTime();

  return records.reduce(
    (total, record) =>
      new Date(record.completedAtIso).getTime() >= startTimestamp
        ? total + record.netIncomeCents
        : total,
    0,
  );
}

function getStartOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function getStartOfUtcWeek(date: Date) {
  const startOfDay = getStartOfUtcDay(date);
  const utcDay = startOfDay.getUTCDay();
  const diff = utcDay === 0 ? 6 : utcDay - 1;

  return new Date(startOfDay.getTime() - diff * 24 * 60 * 60 * 1000);
}

function getStartOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function maskBankAccountNo(bankAccountNo: string) {
  return `**** **** **** ${bankAccountNo.replace(/\s+/g, '').slice(-4)}`;
}

function mapPrismaWithdrawal(
  withdrawal: PrismaDriverWithdrawalRecord,
): DriverWithdrawalRecord {
  return {
    id: withdrawal.id,
    driverId: withdrawal.driverId,
    amountCents: withdrawal.amountCents,
    bankAccountName: withdrawal.bankAccountName,
    bankName: withdrawal.bankName,
    bankAccountMasked: withdrawal.bankAccountMasked,
    status: withdrawal.status,
    ...(withdrawal.rejectionReason
      ? { rejectionReason: withdrawal.rejectionReason }
      : {}),
    createdAtIso: withdrawal.createdAt.toISOString(),
    updatedAtIso: withdrawal.updatedAt.toISOString(),
  };
}

function mapPrismaReviewedWithdrawal(
  withdrawal: PrismaDriverWithdrawalRecord,
): ReviewedDriverWithdrawalRecord {
  return {
    ...mapPrismaWithdrawal(withdrawal),
    version: withdrawal.version,
    ...(withdrawal.processedByAdminId
      ? { processedByAdminId: withdrawal.processedByAdminId }
      : {}),
    ...(withdrawal.processedAt
      ? { processedAtIso: withdrawal.processedAt.toISOString() }
      : {}),
    ...(withdrawal.financialTransactionId
      ? { financialTransactionId: withdrawal.financialTransactionId }
      : {}),
  };
}

function mapPrismaWallet(
  wallet: PrismaDriverWalletRecord,
): DriverWalletRecord {
  return {
    driverId: wallet.driverId,
    availableCents: wallet.availableCents,
    reservedCents: wallet.reservedCents,
    withdrawnCents: wallet.withdrawnCents,
    version: wallet.version,
    createdAtIso: wallet.createdAt.toISOString(),
    updatedAtIso: wallet.updatedAt.toISOString(),
  };
}

function mapPrismaFinancialTransaction(
  transaction: PrismaFinancialTransactionRecord,
): FinancialTransactionRecord {
  return {
    id: transaction.id,
    transactionNo: transaction.transactionNo,
    type: transaction.type,
    referenceId: transaction.referenceId,
    ...(transaction.orderId ? { orderId: transaction.orderId } : {}),
    ...(transaction.paymentOrderId
      ? { paymentOrderId: transaction.paymentOrderId }
      : {}),
    amountCents: transaction.amountCents,
    occurredAtIso: transaction.occurredAt.toISOString(),
    createdAtIso: transaction.createdAt.toISOString(),
    entries: transaction.entries.map(entry => ({
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

function mapPrismaFinancialAuditLog(
  auditLog: PrismaFinancialAuditLogRecord,
): FinancialAuditLogRecord {
  return {
    id: auditLog.id,
    actorAdminId: auditLog.actorAdminId,
    action: auditLog.action,
    entityType: auditLog.entityType,
    entityId: auditLog.entityId,
    idempotencyKey: auditLog.idempotencyKey,
    requestFingerprint: auditLog.requestFingerprint,
    requestId: auditLog.requestId,
    reason: auditLog.reason,
    ...(isRecord(auditLog.beforeState)
      ? { beforeState: auditLog.beforeState }
      : {}),
    ...(isRecord(auditLog.afterState)
      ? { afterState: auditLog.afterState }
      : {}),
    createdAtIso: auditLog.createdAt.toISOString(),
  };
}

function mapExistingPrismaWithdrawal(
  existing: PrismaDriverWithdrawalRecord,
  input: ExecuteDriverWithdrawalInput,
): ExecuteDriverWithdrawalResult {
  return existing.requestFingerprint === input.requestFingerprint
    ? {
        kind: 'success',
        replayed: true,
        withdrawal: mapPrismaWithdrawal(existing),
      }
    : { kind: 'key-reused' };
}

function isPrismaErrorCode(error: unknown, code: string) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseReviewAfterState(value: unknown):
  | {
      withdrawal: ReviewedDriverWithdrawalRecord;
      wallet: DriverWalletRecord;
    }
  | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const withdrawal = parseReviewedDriverWithdrawal(value.withdrawal);
  const wallet = parseDriverWallet(value.wallet);
  return withdrawal && wallet ? { withdrawal, wallet } : undefined;
}

function parseReviewedDriverWithdrawal(
  value: unknown,
): ReviewedDriverWithdrawalRecord | undefined {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.driverId) ||
    !isSafeInteger(value.amountCents) ||
    !isString(value.bankAccountName) ||
    !isString(value.bankName) ||
    !isString(value.bankAccountMasked) ||
    !isDriverWithdrawalStatus(value.status) ||
    !isSafeInteger(value.version) ||
    !isString(value.createdAtIso) ||
    !isString(value.updatedAtIso)
  ) {
    return undefined;
  }

  return {
    id: value.id,
    driverId: value.driverId,
    amountCents: value.amountCents,
    bankAccountName: value.bankAccountName,
    bankName: value.bankName,
    bankAccountMasked: value.bankAccountMasked,
    status: value.status,
    ...(isString(value.rejectionReason)
      ? { rejectionReason: value.rejectionReason }
      : {}),
    version: value.version,
    ...(isString(value.processedByAdminId)
      ? { processedByAdminId: value.processedByAdminId }
      : {}),
    ...(isString(value.processedAtIso)
      ? { processedAtIso: value.processedAtIso }
      : {}),
    ...(isString(value.financialTransactionId)
      ? { financialTransactionId: value.financialTransactionId }
      : {}),
    createdAtIso: value.createdAtIso,
    updatedAtIso: value.updatedAtIso,
  };
}

function parseDriverWallet(value: unknown): DriverWalletRecord | undefined {
  if (
    !isRecord(value) ||
    !isString(value.driverId) ||
    !isSafeInteger(value.availableCents) ||
    !isSafeInteger(value.reservedCents) ||
    !isSafeInteger(value.withdrawnCents) ||
    !isSafeInteger(value.version) ||
    !isString(value.createdAtIso) ||
    !isString(value.updatedAtIso)
  ) {
    return undefined;
  }

  return {
    driverId: value.driverId,
    availableCents: value.availableCents,
    reservedCents: value.reservedCents,
    withdrawnCents: value.withdrawnCents,
    version: value.version,
    createdAtIso: value.createdAtIso,
    updatedAtIso: value.updatedAtIso,
  };
}

function isDriverWithdrawalStatus(
  value: unknown,
): value is DriverWithdrawalRecord['status'] {
  return value === 'reviewing' || value === 'paid' || value === 'rejected';
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

class DriverWithdrawalReviewConflictError extends Error {}
