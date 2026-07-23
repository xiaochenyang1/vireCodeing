import { InMemoryFinancialStore } from './in-memory-financial.store';
import type { DriverWalletRecord, SettlementRecord } from './dto';
import { sumSignedLedgerEntries } from './payment-domain';
import {
  InMemoryDriverFinanceRepository,
  PrismaDriverFinanceRepository,
} from './driver-finance.repository';

const NOW = new Date('2026-07-15T08:00:00.000Z');

describe('InMemoryDriverFinanceRepository', () => {
  it('builds driver income only from Settlement and DriverWallet facts', async () => {
    const financialStore = new InMemoryFinancialStore({
      settlements: [
        createSettlement(),
        createSettlement({
          id: 'settlement-other',
          orderId: 'order-other',
          driverId: 'driver-other',
          financialTransactionId: 'transaction-other',
        }),
      ],
      driverWallets: [createWallet()],
    });
    const repository = new InMemoryDriverFinanceRepository(financialStore);

    await expect(
      repository.getIncomeOverview('driver-1', NOW),
    ).resolves.toEqual({
      driverId: 'driver-1',
      summary: {
        todayIncomeCents: 72200,
        weekIncomeCents: 72200,
        monthIncomeCents: 72200,
        historyIncomeCents: 72200,
        pendingSettlementCents: 0,
        availableWithdrawalCents: 50000,
        reviewingWithdrawalCents: 12000,
        withdrawnCents: 10200,
        completedOrderCount: 1,
      },
      records: [
        {
          orderId: 'order-1',
          orderNo: 'order-1',
          completedAtIso: '2026-07-15T07:30:00.000Z',
          routeText: '',
          vehicleType: '',
          grossAmountCents: 76000,
          platformFeeCents: 3800,
          netIncomeCents: 72200,
        },
      ],
    });
  });

  it('reserves wallet balance once for an idempotent withdrawal key', async () => {
    const financialStore = new InMemoryFinancialStore({
      driverWallets: [
        createWallet({
          availableCents: 20000,
          reservedCents: 0,
          withdrawnCents: 0,
        }),
      ],
    });
    const repository = new InMemoryDriverFinanceRepository(financialStore, {
      now: () => NOW,
      createId: () => 'withdrawal-1',
    });
    const input = createWithdrawalInput();

    const first = await repository.executeIdempotentWithdrawalRequest(input);
    const replay = await repository.executeIdempotentWithdrawalRequest(input);
    const reused = await repository.executeIdempotentWithdrawalRequest({
      ...input,
      requestFingerprint: 'another-fingerprint',
      amountCents: 13000,
    });

    expect(first).toEqual({
      kind: 'success',
      replayed: false,
      withdrawal: expect.objectContaining({
        id: 'withdrawal-1',
        driverId: 'driver-1',
        amountCents: 12000,
        bankAccountMasked: '**** **** **** 1234',
        status: 'reviewing',
      }),
    });
    expect(replay).toEqual({
      kind: 'success',
      replayed: true,
      withdrawal: expect.objectContaining({ id: 'withdrawal-1' }),
    });
    expect(reused).toEqual({ kind: 'key-reused' });
    expect(financialStore.findDriverWallet('driver-1')).toMatchObject({
      availableCents: 8000,
      reservedCents: 12000,
      withdrawnCents: 0,
      version: 5,
    });
  });

  it('allows only one concurrent withdrawal when both would exceed balance', async () => {
    const financialStore = new InMemoryFinancialStore({
      driverWallets: [
        createWallet({
          availableCents: 20000,
          reservedCents: 0,
          withdrawnCents: 0,
        }),
      ],
    });
    let idSequence = 0;
    const repository = new InMemoryDriverFinanceRepository(financialStore, {
      now: () => NOW,
      createId: () => `withdrawal-${++idSequence}`,
    });

    const results = await Promise.all([
      repository.executeIdempotentWithdrawalRequest(createWithdrawalInput()),
      repository.executeIdempotentWithdrawalRequest({
        ...createWithdrawalInput(),
        idempotencyKey: '00000000-0000-4000-8000-000000000002',
        requestFingerprint: 'withdrawal-fingerprint-2',
      }),
    ]);

    expect(results.map(result => result.kind).sort()).toEqual([
      'balance-insufficient',
      'success',
    ]);
    expect(financialStore.findDriverWallet('driver-1')).toMatchObject({
      availableCents: 8000,
      reservedCents: 12000,
    });
  });

  it('approves a withdrawal once with wallet, ledger and audit facts', async () => {
    const financialStore = new InMemoryFinancialStore({
      driverWallets: [
        createWallet({
          availableCents: 20000,
          reservedCents: 0,
          withdrawnCents: 0,
        }),
      ],
    });
    let idSequence = 0;
    const repository = new InMemoryDriverFinanceRepository(financialStore, {
      now: () => NOW,
      createId: () => `finance-id-${++idSequence}`,
    });
    const created = await repository.executeIdempotentWithdrawalRequest(
      createWithdrawalInput(),
    );
    if (created.kind !== 'success') {
      throw new Error(`Unexpected create result: ${created.kind}`);
    }
    const input = {
      withdrawalId: created.withdrawal.id,
      adminId: 'admin-1',
      action: 'approve' as const,
      idempotencyKey: '00000000-0000-4000-8000-000000000010',
      requestFingerprint: 'approve-fingerprint-1',
      requestId: 'request-approve-1',
      reason: '审核通过并付款',
      expectedVersion: 0,
    };

    const first = await repository.reviewWithdrawal(input);
    const replay = await repository.reviewWithdrawal(input);

    expect(first).toMatchObject({
      kind: 'success',
      replayed: false,
      withdrawal: {
        id: 'finance-id-1',
        status: 'paid',
        version: 1,
        processedByAdminId: 'admin-1',
        financialTransactionId: 'finance-id-2',
        payoutChannel: 'sandbox',
        providerPayoutNo: 'sandbox-payout-finance-id-1',
      },
      wallet: {
        availableCents: 8000,
        reservedCents: 0,
        withdrawnCents: 12000,
      },
      financialTransaction: {
        id: 'finance-id-2',
        type: 'driver_withdrawal',
        referenceId: 'finance-id-1',
      },
      auditLog: {
        action: 'withdrawal.approve',
        entityId: 'finance-id-1',
        actorAdminId: 'admin-1',
      },
    });
    if (first.kind !== 'success' || !first.financialTransaction) {
      throw new Error('Expected an approved withdrawal transaction');
    }
    expect(
      sumSignedLedgerEntries(first.financialTransaction.entries),
    ).toBe(0);
    expect(replay).toMatchObject({
      kind: 'success',
      replayed: true,
      financialTransaction: { id: 'finance-id-2' },
    });
    expect(financialStore.listFinancialTransactions()).toHaveLength(1);
  });

  it('rejects a withdrawal once by releasing reserved balance with an audit fact', async () => {
    const financialStore = new InMemoryFinancialStore({
      driverWallets: [
        createWallet({
          availableCents: 20000,
          reservedCents: 0,
          withdrawnCents: 0,
        }),
      ],
    });
    let idSequence = 0;
    const repository = new InMemoryDriverFinanceRepository(financialStore, {
      now: () => NOW,
      createId: () => `finance-id-${++idSequence}`,
    });
    const created = await repository.executeIdempotentWithdrawalRequest(
      createWithdrawalInput(),
    );
    if (created.kind !== 'success') {
      throw new Error(`Unexpected create result: ${created.kind}`);
    }
    const input = {
      withdrawalId: created.withdrawal.id,
      adminId: 'admin-1',
      action: 'reject' as const,
      idempotencyKey: '00000000-0000-4000-8000-000000000011',
      requestFingerprint: 'reject-fingerprint-1',
      requestId: 'request-reject-1',
      reason: '收款账户信息不一致',
      expectedVersion: 0,
    };

    const first = await repository.reviewWithdrawal(input);
    const replay = await repository.reviewWithdrawal(input);

    expect(first).toMatchObject({
      kind: 'success',
      replayed: false,
      withdrawal: {
        id: 'finance-id-1',
        status: 'rejected',
        rejectionReason: '收款账户信息不一致',
        version: 1,
        processedByAdminId: 'admin-1',
      },
      wallet: {
        availableCents: 20000,
        reservedCents: 0,
        withdrawnCents: 0,
      },
      auditLog: {
        action: 'withdrawal.reject',
        entityId: 'finance-id-1',
        actorAdminId: 'admin-1',
      },
    });
    expect(first).not.toHaveProperty('financialTransaction');
    expect(replay).toMatchObject({
      kind: 'success',
      replayed: true,
      withdrawal: { id: 'finance-id-1', status: 'rejected' },
    });
    expect(financialStore.listFinancialTransactions()).toHaveLength(0);
    expect(financialStore.listFinancialAuditLogs()).toHaveLength(1);
  });

  it('approves multiple withdrawals atomically in one batch review', async () => {
    const financialStore = new InMemoryFinancialStore({
      driverWallets: [
        createWallet({
          availableCents: 40000,
          reservedCents: 0,
          withdrawnCents: 0,
          version: 0,
        }),
      ],
    });
    let idSequence = 0;
    const repository = new InMemoryDriverFinanceRepository(financialStore, {
      now: () => NOW,
      createId: () => `finance-id-${++idSequence}`,
    });
    const firstCreated = await repository.executeIdempotentWithdrawalRequest(
      createWithdrawalInput(),
    );
    const secondCreated = await repository.executeIdempotentWithdrawalRequest(
      createWithdrawalInput({
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440001',
        requestFingerprint: 'withdrawal-fingerprint-2',
        amountCents: 8000,
      }),
    );
    if (
      firstCreated.kind !== 'success' ||
      secondCreated.kind !== 'success'
    ) {
      throw new Error('Expected both withdrawals to be created successfully');
    }

    const input = createBatchReviewInput({
      items: [
        { withdrawalId: firstCreated.withdrawal.id, expectedVersion: 0 },
        { withdrawalId: secondCreated.withdrawal.id, expectedVersion: 0 },
      ],
    });

    const first = await repository.batchReviewWithdrawals(input);
    const replay = await repository.batchReviewWithdrawals(input);

    expect(first).toMatchObject({
      kind: 'success',
      replayed: false,
      action: 'approve',
      updatedCount: 2,
      withdrawalIds: [firstCreated.withdrawal.id, secondCreated.withdrawal.id],
      items: [
        {
          withdrawal: {
            id: firstCreated.withdrawal.id,
            status: 'paid',
            financialTransactionId: 'finance-id-3',
          },
          financialTransaction: {
            id: 'finance-id-3',
            type: 'driver_withdrawal',
          },
        },
        {
          withdrawal: {
            id: secondCreated.withdrawal.id,
            status: 'paid',
            financialTransactionId: 'finance-id-4',
          },
          financialTransaction: {
            id: 'finance-id-4',
            type: 'driver_withdrawal',
          },
        },
      ],
    });
    expect(replay).toMatchObject({
      kind: 'success',
      replayed: true,
      updatedCount: 2,
      withdrawalIds: [firstCreated.withdrawal.id, secondCreated.withdrawal.id],
    });
    expect(financialStore.findDriverWallet('driver-1')).toMatchObject({
      availableCents: 20000,
      reservedCents: 0,
      withdrawnCents: 20000,
      version: 4,
    });
    expect(financialStore.listFinancialTransactions()).toHaveLength(2);
    expect(financialStore.listFinancialAuditLogs()).toHaveLength(1);
  });

  it('keeps batch withdrawal review atomic when any target is missing', async () => {
    const financialStore = new InMemoryFinancialStore({
      driverWallets: [
        createWallet({
          availableCents: 20000,
          reservedCents: 0,
          withdrawnCents: 0,
          version: 0,
        }),
      ],
    });
    const repository = new InMemoryDriverFinanceRepository(financialStore, {
      now: () => NOW,
      createId: () => 'finance-id-1',
    });
    const created = await repository.executeIdempotentWithdrawalRequest(
      createWithdrawalInput(),
    );
    if (created.kind !== 'success') {
      throw new Error('Expected withdrawal creation to succeed');
    }

    await expect(
      repository.batchReviewWithdrawals(
        createBatchReviewInput({
          items: [
            { withdrawalId: created.withdrawal.id, expectedVersion: 0 },
            { withdrawalId: 'withdrawal-missing', expectedVersion: 0 },
          ],
        }),
      ),
    ).resolves.toEqual({ kind: 'not-found' });
    expect(financialStore.findDriverWallet('driver-1')).toMatchObject({
      availableCents: 8000,
      reservedCents: 12000,
      withdrawnCents: 0,
      version: 1,
    });
    expect(created.withdrawal).toMatchObject({
      id: 'finance-id-1',
      status: 'reviewing',
    });
    expect(financialStore.listFinancialTransactions()).toHaveLength(0);
    expect(financialStore.listFinancialAuditLogs()).toHaveLength(0);
  });
});

describe('PrismaDriverFinanceRepository', () => {
  it('queries Settlement and DriverWallet as the only income facts', async () => {
    const prisma = {
      $transaction: jest.fn(),
      settlement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'settlement-1',
            orderId: 'order-1',
            driverId: 'driver-1',
            grossAmountCents: 76000,
            platformFeeRateBps: 500,
            platformFeeCents: 3800,
            driverNetAmountCents: 72200,
            financialTransactionId: 'transaction-1',
            settledAt: new Date('2026-07-15T07:30:00.000Z'),
            createdAt: new Date('2026-07-15T07:30:00.000Z'),
            order: {
              orderNo: 'HY202607150001',
              locations: [
                { type: 'pickup', address: '宝安区福永物流园' },
                { type: 'delivery', address: '南山区科技园' },
              ],
              requirement: { vehicleType: '厢式货车' },
            },
          },
        ]),
      },
      driverWallet: {
        findUnique: jest.fn().mockResolvedValue({
          driverId: 'driver-1',
          availableCents: 50000,
          reservedCents: 12000,
          withdrawnCents: 10200,
          version: 4,
          createdAt: new Date('2026-07-15T07:30:00.000Z'),
          updatedAt: NOW,
        }),
      },
      driverWithdrawal: { findUnique: jest.fn() },
      financialTransaction: { findUnique: jest.fn() },
      financialAuditLog: { findUnique: jest.fn() },
    };
    const repository = new PrismaDriverFinanceRepository(prisma);

    await expect(
      repository.getIncomeOverview('driver-1', NOW),
    ).resolves.toMatchObject({
      summary: {
        historyIncomeCents: 72200,
        availableWithdrawalCents: 50000,
        reviewingWithdrawalCents: 12000,
        withdrawnCents: 10200,
      },
      records: [
        {
          orderId: 'order-1',
          orderNo: 'HY202607150001',
          routeText: '宝安区福永物流园 -> 南山区科技园',
          vehicleType: '厢式货车',
          netIncomeCents: 72200,
        },
      ],
    });
    expect(prisma.settlement.findMany).toHaveBeenCalledWith({
      where: { driverId: 'driver-1' },
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
    });
    expect(prisma.driverWallet.findUnique).toHaveBeenCalledWith({
      where: { driverId: 'driver-1' },
    });
  });

  it('reserves withdrawal balance with one conditional wallet update', async () => {
    const transaction = {
      driverWithdrawal: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createPrismaWithdrawal()),
      },
      driverWallet: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(transaction)),
      settlement: { findMany: jest.fn() },
      driverWallet: { findUnique: jest.fn() },
      driverWithdrawal: { findUnique: jest.fn() },
      financialTransaction: { findUnique: jest.fn() },
      financialAuditLog: { findUnique: jest.fn() },
    };
    const repository = new PrismaDriverFinanceRepository(prisma, {
      now: () => NOW,
      createId: () => 'withdrawal-1',
    });

    await expect(
      repository.executeIdempotentWithdrawalRequest(createWithdrawalInput()),
    ).resolves.toEqual({
      kind: 'success',
      replayed: false,
      withdrawal: expect.objectContaining({
        id: 'withdrawal-1',
        amountCents: 12000,
        status: 'reviewing',
      }),
    });
    expect(transaction.driverWallet.updateMany).toHaveBeenCalledWith({
      where: {
        driverId: 'driver-1',
        availableCents: { gte: 12000 },
      },
      data: {
        availableCents: { decrement: 12000 },
        reservedCents: { increment: 12000 },
        version: { increment: 1 },
        updatedAt: NOW,
      },
    });
    expect(transaction.driverWithdrawal.create).toHaveBeenCalledWith({
      data: {
        id: 'withdrawal-1',
        driverId: 'driver-1',
        amountCents: 12000,
        bankAccountName: '李师傅',
        bankName: '招商银行',
        bankAccountMasked: '**** **** **** 1234',
        status: 'reviewing',
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        requestFingerprint: 'withdrawal-fingerprint-1',
        version: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    });
  });

  it('converges a concurrent withdrawal key P2002 only after finding the winner', async () => {
    const duplicate = { code: 'P2002' };
    const winner = createPrismaWithdrawal();
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(duplicate),
      settlement: { findMany: jest.fn() },
      driverWallet: { findUnique: jest.fn() },
      driverWithdrawal: {
        findUnique: jest.fn().mockResolvedValue(winner),
      },
      financialTransaction: { findUnique: jest.fn() },
      financialAuditLog: { findUnique: jest.fn() },
    };
    const repository = new PrismaDriverFinanceRepository(prisma);

    await expect(
      repository.executeIdempotentWithdrawalRequest(createWithdrawalInput()),
    ).resolves.toEqual({
      kind: 'success',
      replayed: true,
      withdrawal: expect.objectContaining({ id: 'withdrawal-1' }),
    });
    expect(prisma.driverWithdrawal.findUnique).toHaveBeenCalledWith({
      where: {
        DriverWithdrawal_driver_idempotency_key_unique: {
          driverId: 'driver-1',
          idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        },
      },
    });
  });

  it('approves a reviewing withdrawal with version and reserved-balance CAS in one transaction', async () => {
    const reviewing = createPrismaWithdrawal();
    const paid = createPrismaWithdrawal({
      status: 'paid',
      version: 1,
      processedByAdminId: 'admin-1',
      processedAt: NOW,
      financialTransactionId: 'review-id-1',
      payoutChannel: 'sandbox',
      providerPayoutNo: 'sandbox-payout-withdrawal-1',
      payoutExecutedAt: NOW,
    });
    const walletBefore = createPrismaWallet({
      availableCents: 8000,
      reservedCents: 12000,
      withdrawnCents: 0,
      version: 5,
    });
    const walletAfter = createPrismaWallet({
      availableCents: 8000,
      reservedCents: 0,
      withdrawnCents: 12000,
      version: 6,
    });
    const financialTransaction = createPrismaWithdrawalTransaction();
    const auditLog = createPrismaFinancialAuditLog();
    const transaction = {
      driverWithdrawal: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(reviewing)
          .mockResolvedValueOnce(paid),
        create: jest.fn(),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 }),
      },
      driverWallet: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(walletBefore)
          .mockResolvedValueOnce(walletAfter),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      financialTransaction: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue(financialTransaction),
      },
      financialAuditLog: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(auditLog),
      },
    };
    const prisma = createPrismaFinanceClient(transaction);
    let idSequence = 0;
    const repository = new PrismaDriverFinanceRepository(prisma, {
      now: () => NOW,
      createId: () => `review-id-${++idSequence}`,
    });
    const input = createReviewInput();

    await expect(repository.reviewWithdrawal(input)).resolves.toMatchObject({
      kind: 'success',
      replayed: false,
      withdrawal: {
        id: 'withdrawal-1',
        status: 'paid',
        version: 1,
        financialTransactionId: 'review-id-1',
        payoutChannel: 'sandbox',
        providerPayoutNo: 'sandbox-payout-withdrawal-1',
      },
      wallet: {
        reservedCents: 0,
        withdrawnCents: 12000,
      },
      financialTransaction: {
        id: 'review-id-1',
        type: 'driver_withdrawal',
      },
      auditLog: {
        action: 'withdrawal.approve',
        actorAdminId: 'admin-1',
      },
    });
    expect(transaction.driverWithdrawal.updateMany).toHaveBeenCalledTimes(2);
    expect(transaction.driverWithdrawal.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'withdrawal-1',
        status: 'reviewing',
        version: 0,
      },
      data: {
        status: 'paid',
        version: { increment: 1 },
        processedByAdminId: 'admin-1',
        processedAt: NOW,
        payoutChannel: 'sandbox',
        providerPayoutNo: 'sandbox-payout-withdrawal-1',
        payoutExecutedAt: NOW,
        updatedAt: NOW,
      },
    });
    expect(transaction.driverWithdrawal.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'withdrawal-1',
        financialTransactionId: null,
      },
      data: {
        financialTransactionId: 'review-id-1',
        updatedAt: NOW,
      },
    });
    expect(transaction.driverWallet.updateMany).toHaveBeenCalledWith({
      where: {
        driverId: 'driver-1',
        reservedCents: { gte: 12000 },
      },
      data: {
        reservedCents: { decrement: 12000 },
        withdrawnCents: { increment: 12000 },
        version: { increment: 1 },
        updatedAt: NOW,
      },
    });
    expect(transaction.financialTransaction.create).toHaveBeenCalledWith({
      data: {
        id: 'review-id-1',
        transactionNo: 'FT-review-id-1',
        type: 'driver_withdrawal',
        referenceId: 'withdrawal-1',
        amountCents: 12000,
        occurredAt: NOW,
        entries: {
          create: [
            {
              sequence: 1,
              accountType: 'driver_payable',
              accountUserId: 'driver-1',
              direction: 'debit',
              amountCents: 12000,
              createdAt: NOW,
            },
            {
              sequence: 2,
              accountType: 'gateway_clearing',
              direction: 'credit',
              amountCents: 12000,
              createdAt: NOW,
            },
          ],
        },
        createdAt: NOW,
      },
      include: { entries: { orderBy: { sequence: 'asc' } } },
    });
    expect(
      transaction.financialTransaction.create.mock.invocationCallOrder[0],
    ).toBeGreaterThan(transaction.driverWallet.updateMany.mock.invocationCallOrder[0]);
    expect(
      transaction.driverWithdrawal.updateMany.mock.invocationCallOrder[1],
    ).toBeGreaterThan(
      transaction.financialTransaction.create.mock.invocationCallOrder[0],
    );
    expect(transaction.financialAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'review-id-2',
        actorAdminId: 'admin-1',
        action: 'withdrawal.approve',
        entityType: 'driver_withdrawal',
        entityId: 'withdrawal-1',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        requestId: input.requestId,
        reason: input.reason,
      }),
    });
  });

  it('rejects a reviewing withdrawal by atomically releasing reserved balance without a payment ledger', async () => {
    const reviewing = createPrismaWithdrawal();
    const rejected = createPrismaWithdrawal({
      status: 'rejected',
      version: 1,
      rejectionReason: '收款账户信息不一致',
      processedByAdminId: 'admin-1',
      processedAt: NOW,
    });
    const walletBefore = createPrismaWallet();
    const walletAfter = createPrismaWallet({
      availableCents: 20000,
      reservedCents: 0,
      withdrawnCents: 0,
      version: 6,
    });
    const auditLog = createPrismaFinancialAuditLog({
      id: 'review-id-1',
      action: 'withdrawal.reject',
      idempotencyKey: '00000000-0000-4000-8000-000000000011',
      requestFingerprint: 'reject-fingerprint-1',
      requestId: 'request-reject-1',
      reason: '收款账户信息不一致',
    });
    const transaction = {
      driverWithdrawal: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(reviewing)
          .mockResolvedValueOnce(rejected),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      driverWallet: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(walletBefore)
          .mockResolvedValueOnce(walletAfter),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      financialTransaction: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      financialAuditLog: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(auditLog),
      },
    };
    const prisma = createPrismaFinanceClient(transaction);
    let idSequence = 0;
    const repository = new PrismaDriverFinanceRepository(prisma, {
      now: () => NOW,
      createId: () => `review-id-${++idSequence}`,
    });
    const input = createReviewInput({
      action: 'reject',
      idempotencyKey: '00000000-0000-4000-8000-000000000011',
      requestFingerprint: 'reject-fingerprint-1',
      requestId: 'request-reject-1',
      reason: '收款账户信息不一致',
    });

    const result = await repository.reviewWithdrawal(input);

    expect(result).toMatchObject({
      kind: 'success',
      replayed: false,
      withdrawal: {
        id: 'withdrawal-1',
        status: 'rejected',
        rejectionReason: '收款账户信息不一致',
        version: 1,
      },
      wallet: {
        availableCents: 20000,
        reservedCents: 0,
        withdrawnCents: 0,
      },
      auditLog: {
        action: 'withdrawal.reject',
        actorAdminId: 'admin-1',
      },
    });
    expect(result).not.toHaveProperty('financialTransaction');
    expect(transaction.driverWithdrawal.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'withdrawal-1',
        status: 'reviewing',
        version: 0,
      },
      data: {
        status: 'rejected',
        version: { increment: 1 },
        processedByAdminId: 'admin-1',
        processedAt: NOW,
        rejectionReason: '收款账户信息不一致',
        updatedAt: NOW,
      },
    });
    expect(transaction.driverWallet.updateMany).toHaveBeenCalledWith({
      where: {
        driverId: 'driver-1',
        reservedCents: { gte: 12000 },
      },
      data: {
        reservedCents: { decrement: 12000 },
        availableCents: { increment: 12000 },
        version: { increment: 1 },
        updatedAt: NOW,
      },
    });
    expect(transaction.financialTransaction.create).not.toHaveBeenCalled();
    expect(transaction.financialAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'review-id-1',
        action: 'withdrawal.reject',
        entityId: 'withdrawal-1',
        reason: '收款账户信息不一致',
      }),
    });
  });

  it('approves multiple withdrawals in one atomic batch review transaction', async () => {
    const reviewingFirst = createPrismaWithdrawal();
    const reviewingSecond = createPrismaWithdrawal({
      id: 'withdrawal-2',
      driverId: 'driver-2',
      amountCents: 8000,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440001',
      requestFingerprint: 'withdrawal-fingerprint-2',
    });
    const paidFirst = createPrismaWithdrawal({
      status: 'paid',
      version: 1,
      processedByAdminId: 'admin-1',
      processedAt: NOW,
      financialTransactionId: 'batch-review-id-1',
      payoutChannel: 'sandbox',
      providerPayoutNo: 'sandbox-payout-withdrawal-1',
      payoutExecutedAt: NOW,
    });
    const paidSecond = createPrismaWithdrawal({
      id: 'withdrawal-2',
      driverId: 'driver-2',
      amountCents: 8000,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440001',
      requestFingerprint: 'withdrawal-fingerprint-2',
      status: 'paid',
      version: 1,
      processedByAdminId: 'admin-1',
      processedAt: NOW,
      financialTransactionId: 'batch-review-id-2',
      payoutChannel: 'sandbox',
      providerPayoutNo: 'sandbox-payout-withdrawal-2',
      payoutExecutedAt: NOW,
    });
    const firstWalletBefore = createPrismaWallet({
      driverId: 'driver-1',
      availableCents: 8000,
      reservedCents: 12000,
      withdrawnCents: 0,
      version: 5,
    });
    const firstWalletAfter = createPrismaWallet({
      driverId: 'driver-1',
      availableCents: 8000,
      reservedCents: 0,
      withdrawnCents: 12000,
      version: 6,
    });
    const secondWalletBefore = createPrismaWallet({
      driverId: 'driver-2',
      availableCents: 4000,
      reservedCents: 8000,
      withdrawnCents: 0,
      version: 2,
    });
    const secondWalletAfter = createPrismaWallet({
      driverId: 'driver-2',
      availableCents: 4000,
      reservedCents: 0,
      withdrawnCents: 8000,
      version: 3,
    });
    const firstTransaction = createPrismaWithdrawalTransaction({
      id: 'batch-review-id-1',
      transactionNo: 'FT-batch-review-id-1',
      referenceId: 'withdrawal-1',
    });
    const secondTransaction = createPrismaWithdrawalTransaction({
      id: 'batch-review-id-2',
      transactionNo: 'FT-batch-review-id-2',
      referenceId: 'withdrawal-2',
      amountCents: 8000,
      entries: [
        {
          id: 'entry-3',
          transactionId: 'batch-review-id-2',
          sequence: 1,
          accountType: 'driver_payable',
          accountUserId: 'driver-2',
          direction: 'debit',
          amountCents: 8000,
          createdAt: NOW,
        },
        {
          id: 'entry-4',
          transactionId: 'batch-review-id-2',
          sequence: 2,
          accountType: 'gateway_clearing',
          accountUserId: null,
          direction: 'credit',
          amountCents: 8000,
          createdAt: NOW,
        },
      ],
    });
    const batchAuditLog = createPrismaFinancialAuditLog({
      id: 'batch-review-id-3',
      action: 'withdrawal.batch.approve',
      entityType: 'driver_withdrawal_batch',
      entityId: 'driver-withdrawal-batch-1',
      idempotencyKey: '00000000-0000-4000-8000-000000000020',
      requestFingerprint: 'batch-approve-fingerprint-1',
      requestId: 'request-batch-approve-1',
      reason: '财务复核后统一放款',
    });
    const transaction = {
      driverWithdrawal: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(reviewingFirst)
          .mockResolvedValueOnce(paidFirst)
          .mockResolvedValueOnce(reviewingSecond)
          .mockResolvedValueOnce(paidSecond),
        create: jest.fn(),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 }),
      },
      driverWallet: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(firstWalletBefore)
          .mockResolvedValueOnce(firstWalletAfter)
          .mockResolvedValueOnce(secondWalletBefore)
          .mockResolvedValueOnce(secondWalletAfter),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 }),
      },
      financialTransaction: {
        findUnique: jest.fn(),
        create: jest
          .fn()
          .mockResolvedValueOnce(firstTransaction)
          .mockResolvedValueOnce(secondTransaction),
      },
      financialAuditLog: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(batchAuditLog),
      },
    };
    let idSequence = 0;
    const repository = new PrismaDriverFinanceRepository(
      createPrismaFinanceClient(transaction),
      {
        now: () => NOW,
        createId: () => `batch-review-id-${++idSequence}`,
      },
    );

    await expect(
      repository.batchReviewWithdrawals(
        createBatchReviewInput({
          items: [
            { withdrawalId: 'withdrawal-1', expectedVersion: 0 },
            { withdrawalId: 'withdrawal-2', expectedVersion: 0 },
          ],
        }),
      ),
    ).resolves.toMatchObject({
      kind: 'success',
      replayed: false,
      action: 'approve',
      updatedCount: 2,
      withdrawalIds: ['withdrawal-1', 'withdrawal-2'],
      items: [
        {
          withdrawal: {
            id: 'withdrawal-1',
            status: 'paid',
            financialTransactionId: 'batch-review-id-1',
          },
        },
        {
          withdrawal: {
            id: 'withdrawal-2',
            status: 'paid',
            financialTransactionId: 'batch-review-id-2',
          },
        },
      ],
    });
    expect(transaction.financialTransaction.create).toHaveBeenCalledTimes(2);
    expect(transaction.financialAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'batch-review-id-3',
        action: 'withdrawal.batch.approve',
        entityType: 'driver_withdrawal_batch',
        idempotencyKey: '00000000-0000-4000-8000-000000000020',
        requestFingerprint: 'batch-approve-fingerprint-1',
        requestId: 'request-batch-approve-1',
        reason: '财务复核后统一放款',
      }),
    });
  });

  it('replays a batch withdrawal review from the audited snapshot without mutating again', async () => {
    const batchAuditLog = createPrismaFinancialAuditLog({
      id: 'batch-review-id-3',
      action: 'withdrawal.batch.approve',
      entityType: 'driver_withdrawal_batch',
      entityId: 'driver-withdrawal-batch-1',
      idempotencyKey: '00000000-0000-4000-8000-000000000020',
      requestFingerprint: 'batch-approve-fingerprint-1',
      requestId: 'request-batch-approve-1',
      reason: '财务复核后统一放款',
      afterState: {
        action: 'approve',
        items: [
          {
            withdrawal: {
              id: 'withdrawal-1',
              driverId: 'driver-1',
              amountCents: 12000,
              bankAccountName: '李师傅',
              bankName: '招商银行',
              bankAccountMasked: '**** **** **** 1234',
              status: 'paid',
              version: 1,
              processedByAdminId: 'admin-1',
              processedAtIso: NOW.toISOString(),
              financialTransactionId: 'batch-review-id-1',
              payoutChannel: 'sandbox',
              providerPayoutNo: 'sandbox-payout-withdrawal-1',
              payoutExecutedAtIso: NOW.toISOString(),
              createdAtIso: NOW.toISOString(),
              updatedAtIso: NOW.toISOString(),
            },
            wallet: {
              driverId: 'driver-1',
              availableCents: 8000,
              reservedCents: 0,
              withdrawnCents: 12000,
              version: 6,
              createdAtIso: NOW.toISOString(),
              updatedAtIso: NOW.toISOString(),
            },
            financialTransaction: {
              id: 'batch-review-id-1',
              transactionNo: 'FT-batch-review-id-1',
              type: 'driver_withdrawal',
              referenceId: 'withdrawal-1',
              amountCents: 12000,
              occurredAtIso: NOW.toISOString(),
              createdAtIso: NOW.toISOString(),
              entries: [
                {
                  id: 'entry-1',
                  transactionId: 'batch-review-id-1',
                  sequence: 1,
                  accountType: 'driver_payable',
                  accountUserId: 'driver-1',
                  direction: 'debit',
                  amountCents: 12000,
                  createdAtIso: NOW.toISOString(),
                },
                {
                  id: 'entry-2',
                  transactionId: 'batch-review-id-1',
                  sequence: 2,
                  accountType: 'gateway_clearing',
                  direction: 'credit',
                  amountCents: 12000,
                  createdAtIso: NOW.toISOString(),
                },
              ],
            },
          },
        ],
      },
    });
    const transaction = {
      driverWithdrawal: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      driverWallet: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      financialTransaction: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      financialAuditLog: {
        findUnique: jest.fn().mockResolvedValue(batchAuditLog),
        create: jest.fn(),
      },
    };
    const repository = new PrismaDriverFinanceRepository(
      createPrismaFinanceClient(transaction),
    );

    await expect(
      repository.batchReviewWithdrawals(createBatchReviewInput()),
    ).resolves.toMatchObject({
      kind: 'success',
      replayed: true,
      action: 'approve',
      updatedCount: 1,
      withdrawalIds: ['withdrawal-1'],
      items: [
        {
          withdrawal: {
            id: 'withdrawal-1',
            payoutChannel: 'sandbox',
            providerPayoutNo: 'sandbox-payout-withdrawal-1',
          },
          financialTransaction: { id: 'batch-review-id-1' },
        },
      ],
    });
    expect(transaction.driverWithdrawal.updateMany).not.toHaveBeenCalled();
    expect(transaction.driverWallet.updateMany).not.toHaveBeenCalled();
    expect(transaction.financialTransaction.create).not.toHaveBeenCalled();
    expect(transaction.financialAuditLog.create).not.toHaveBeenCalled();
  });

  it('replays the audited review snapshot even when the current wallet changed later', async () => {
    const paid = createPrismaWithdrawal({
      status: 'paid',
      version: 1,
      processedByAdminId: 'admin-1',
      processedAt: NOW,
      financialTransactionId: 'review-id-1',
      payoutChannel: 'sandbox',
      providerPayoutNo: 'sandbox-payout-withdrawal-1',
      payoutExecutedAt: NOW,
    });
    const auditedWallet = {
      driverId: 'driver-1',
      availableCents: 8000,
      reservedCents: 0,
      withdrawnCents: 12000,
      version: 6,
      createdAtIso: NOW.toISOString(),
      updatedAtIso: NOW.toISOString(),
    };
    const auditLog = createPrismaFinancialAuditLog({
      afterState: {
        withdrawal: {
          id: 'withdrawal-1',
          driverId: 'driver-1',
          amountCents: 12000,
          bankAccountName: '李师傅',
          bankName: '招商银行',
          bankAccountMasked: '**** **** **** 1234',
          status: 'paid',
          version: 1,
          processedByAdminId: 'admin-1',
          processedAtIso: NOW.toISOString(),
          financialTransactionId: 'review-id-1',
          payoutChannel: 'sandbox',
          providerPayoutNo: 'sandbox-payout-withdrawal-1',
          payoutExecutedAtIso: NOW.toISOString(),
          createdAtIso: NOW.toISOString(),
          updatedAtIso: NOW.toISOString(),
        },
        wallet: auditedWallet,
        financialTransactionId: 'review-id-1',
      },
    });
    const transaction = {
      driverWithdrawal: {
        findUnique: jest.fn().mockResolvedValue(paid),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      driverWallet: {
        findUnique: jest.fn().mockResolvedValue(
          createPrismaWallet({
            availableCents: 18000,
            reservedCents: 0,
            withdrawnCents: 22000,
            version: 9,
          }),
        ),
        updateMany: jest.fn(),
      },
      financialTransaction: {
        findUnique: jest
          .fn()
          .mockResolvedValue(createPrismaWithdrawalTransaction()),
        create: jest.fn(),
      },
      financialAuditLog: {
        findUnique: jest.fn().mockResolvedValue(auditLog),
        create: jest.fn(),
      },
    };
    const repository = new PrismaDriverFinanceRepository(
      createPrismaFinanceClient(transaction),
    );

    await expect(
      repository.reviewWithdrawal(createReviewInput()),
    ).resolves.toMatchObject({
      kind: 'success',
      replayed: true,
      withdrawal: {
        id: 'withdrawal-1',
        status: 'paid',
        version: 1,
      },
      wallet: auditedWallet,
      financialTransaction: { id: 'review-id-1' },
      auditLog: { id: 'review-id-2' },
    });
    expect(transaction.driverWithdrawal.updateMany).not.toHaveBeenCalled();
    expect(transaction.driverWallet.updateMany).not.toHaveBeenCalled();
    expect(transaction.financialTransaction.create).not.toHaveBeenCalled();
    expect(transaction.financialAuditLog.create).not.toHaveBeenCalled();
  });

  it('rejects a reused review key with a different request fingerprint before mutation', async () => {
    const transaction = {
      driverWithdrawal: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      driverWallet: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      financialTransaction: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      financialAuditLog: {
        findUnique: jest
          .fn()
          .mockResolvedValue(createPrismaFinancialAuditLog()),
        create: jest.fn(),
      },
    };
    const repository = new PrismaDriverFinanceRepository(
      createPrismaFinanceClient(transaction),
    );

    await expect(
      repository.reviewWithdrawal(
        createReviewInput({ requestFingerprint: 'different-fingerprint' }),
      ),
    ).resolves.toEqual({ kind: 'key-reused' });
    expect(transaction.driverWithdrawal.findUnique).not.toHaveBeenCalled();
    expect(transaction.driverWithdrawal.updateMany).not.toHaveBeenCalled();
    expect(transaction.driverWallet.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a stale withdrawal version before touching reserved balance', async () => {
    const transaction = {
      driverWithdrawal: {
        findUnique: jest
          .fn()
          .mockResolvedValue(createPrismaWithdrawal({ version: 1 })),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      driverWallet: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      financialTransaction: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      financialAuditLog: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    const repository = new PrismaDriverFinanceRepository(
      createPrismaFinanceClient(transaction),
    );

    await expect(
      repository.reviewWithdrawal(createReviewInput()),
    ).resolves.toEqual({ kind: 'conflict' });
    expect(transaction.driverWithdrawal.updateMany).not.toHaveBeenCalled();
    expect(transaction.driverWallet.findUnique).not.toHaveBeenCalled();
    expect(transaction.driverWallet.updateMany).not.toHaveBeenCalled();
  });

  it('forces transaction rollback when reserved-balance CAS fails after withdrawal CAS', async () => {
    let transactionRolledBack = false;
    const transaction = {
      driverWithdrawal: {
        findUnique: jest.fn().mockResolvedValue(createPrismaWithdrawal()),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      driverWallet: {
        findUnique: jest.fn().mockResolvedValue(createPrismaWallet()),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      financialTransaction: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      financialAuditLog: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    const prisma = {
      ...createPrismaFinanceClient(transaction),
      $transaction: jest.fn(async callback => {
        try {
          return await callback(transaction);
        } catch (error) {
          transactionRolledBack = true;
          throw error;
        }
      }),
    };
    const repository = new PrismaDriverFinanceRepository(prisma, {
      now: () => NOW,
      createId: () => 'review-id-1',
    });

    await expect(
      repository.reviewWithdrawal(createReviewInput()),
    ).resolves.toEqual({ kind: 'conflict' });
    expect(transactionRolledBack).toBe(true);
    expect(transaction.financialTransaction.create).not.toHaveBeenCalled();
    expect(transaction.financialAuditLog.create).not.toHaveBeenCalled();
  });
});

function createSettlement(
  overrides: Partial<SettlementRecord> = {},
): SettlementRecord {
  return {
    id: 'settlement-1',
    orderId: 'order-1',
    driverId: 'driver-1',
    grossAmountCents: 76000,
    platformFeeRateBps: 500,
    platformFeeCents: 3800,
    driverNetAmountCents: 72200,
    financialTransactionId: 'transaction-1',
    settledAtIso: '2026-07-15T07:30:00.000Z',
    createdAtIso: '2026-07-15T07:30:00.000Z',
    ...overrides,
  };
}

function createWallet(
  overrides: Partial<DriverWalletRecord> = {},
): DriverWalletRecord {
  return {
    driverId: 'driver-1',
    availableCents: 50000,
    reservedCents: 12000,
    withdrawnCents: 10200,
    version: 4,
    createdAtIso: '2026-07-15T07:30:00.000Z',
    updatedAtIso: NOW.toISOString(),
    ...overrides,
  };
}

function createWithdrawalInput(overrides: Record<string, unknown> = {}) {
  return {
    driverId: 'driver-1',
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    requestFingerprint: 'withdrawal-fingerprint-1',
    amountCents: 12000,
    bankAccountName: '李师傅',
    bankName: '招商银行',
    bankAccountNo: '6225888800001234',
    ...overrides,
  };
}

function createPrismaWithdrawal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'withdrawal-1',
    driverId: 'driver-1',
    amountCents: 12000,
    bankAccountName: '李师傅',
    bankName: '招商银行',
    bankAccountMasked: '**** **** **** 1234',
    status: 'reviewing',
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    requestFingerprint: 'withdrawal-fingerprint-1',
    version: 0,
    rejectionReason: null,
    processedByAdminId: null,
    processedAt: null,
    payoutChannel: null,
    providerPayoutNo: null,
    payoutExecutedAt: null,
    financialTransactionId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createPrismaWallet(overrides: Record<string, unknown> = {}) {
  return {
    driverId: 'driver-1',
    availableCents: 8000,
    reservedCents: 12000,
    withdrawnCents: 0,
    version: 5,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createPrismaWithdrawalTransaction(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'review-id-1',
    transactionNo: 'FT-review-id-1',
    type: 'driver_withdrawal',
    referenceId: 'withdrawal-1',
    orderId: null,
    paymentOrderId: null,
    amountCents: 12000,
    occurredAt: NOW,
    createdAt: NOW,
    entries: [
      {
        id: 'entry-1',
        transactionId: 'review-id-1',
        sequence: 1,
        accountType: 'driver_payable',
        accountUserId: 'driver-1',
        direction: 'debit',
        amountCents: 12000,
        createdAt: NOW,
      },
      {
        id: 'entry-2',
        transactionId: 'review-id-1',
        sequence: 2,
        accountType: 'gateway_clearing',
        accountUserId: null,
        direction: 'credit',
        amountCents: 12000,
        createdAt: NOW,
      },
    ],
    ...overrides,
  };
}

function createPrismaFinancialAuditLog(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'review-id-2',
    actorAdminId: 'admin-1',
    action: 'withdrawal.approve',
    entityType: 'driver_withdrawal',
    entityId: 'withdrawal-1',
    idempotencyKey: '00000000-0000-4000-8000-000000000010',
    requestFingerprint: 'approve-fingerprint-1',
    requestId: 'request-approve-1',
    reason: '审核通过并付款',
    beforeState: {},
    afterState: {},
    createdAt: NOW,
    ...overrides,
  };
}

function createReviewInput(overrides: Record<string, unknown> = {}) {
  return {
    withdrawalId: 'withdrawal-1',
    adminId: 'admin-1',
    action: 'approve' as const,
    idempotencyKey: '00000000-0000-4000-8000-000000000010',
    requestFingerprint: 'approve-fingerprint-1',
    requestId: 'request-approve-1',
    reason: '审核通过并付款',
    expectedVersion: 0,
    ...overrides,
  };
}

function createBatchReviewInput(overrides: Record<string, unknown> = {}) {
  return {
    adminId: 'admin-1',
    action: 'approve' as const,
    idempotencyKey: '00000000-0000-4000-8000-000000000020',
    requestFingerprint: 'batch-approve-fingerprint-1',
    requestId: 'request-batch-approve-1',
    reason: '财务复核后统一放款',
    items: [{ withdrawalId: 'withdrawal-1', expectedVersion: 0 }],
    ...overrides,
  };
}

function createPrismaFinanceClient(transaction: Record<string, unknown>) {
  return {
    $transaction: jest.fn(async callback => callback(transaction)),
    settlement: { findMany: jest.fn() },
    driverWallet: { findUnique: jest.fn() },
    driverWithdrawal: { findUnique: jest.fn() },
    financialTransaction: { findUnique: jest.fn() },
    financialAuditLog: { findUnique: jest.fn() },
  };
}
