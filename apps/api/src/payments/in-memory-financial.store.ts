import { randomUUID } from 'crypto';
import type {
  FinancialOutboxEventRecord,
  FinancialAuditLogRecord,
  FinancialTransactionRecord,
  DriverWalletRecord,
  PaymentOrderRecord,
  RefundRecord,
  SettlementRecord,
} from './dto';

export class InMemoryFinancialStore {
  private paymentOrders: PaymentOrderRecord[];
  private refunds: RefundRecord[];
  private outboxEvents: FinancialOutboxEventRecord[];
  private financialTransactions: FinancialTransactionRecord[];
  private financialAuditLogs: FinancialAuditLogRecord[];
  private settlements: SettlementRecord[];
  private driverWallets: DriverWalletRecord[];
  private readonly createId: () => string;

  constructor(
    seed: {
      paymentOrders?: PaymentOrderRecord[];
      refunds?: RefundRecord[];
      outboxEvents?: FinancialOutboxEventRecord[];
      financialTransactions?: FinancialTransactionRecord[];
      financialAuditLogs?: FinancialAuditLogRecord[];
      settlements?: SettlementRecord[];
      driverWallets?: DriverWalletRecord[];
      createId?: () => string;
    } = {},
  ) {
    this.paymentOrders = structuredClone(seed.paymentOrders ?? []);
    this.refunds = structuredClone(seed.refunds ?? []);
    this.outboxEvents = structuredClone(seed.outboxEvents ?? []);
    this.financialTransactions = structuredClone(
      seed.financialTransactions ?? [],
    );
    this.financialAuditLogs = structuredClone(seed.financialAuditLogs ?? []);
    this.settlements = structuredClone(seed.settlements ?? []);
    this.driverWallets = structuredClone(seed.driverWallets ?? []);
    this.createId = seed.createId ?? randomUUID;
  }

  clone() {
    return new InMemoryFinancialStore({
      paymentOrders: this.paymentOrders,
      refunds: this.refunds,
      outboxEvents: this.outboxEvents,
      financialTransactions: this.financialTransactions,
      financialAuditLogs: this.financialAuditLogs,
      settlements: this.settlements,
      driverWallets: this.driverWallets,
      createId: this.createId,
    });
  }

  replace(next: InMemoryFinancialStore) {
    this.paymentOrders = next.listPaymentOrders();
    this.refunds = next.listRefunds();
    this.outboxEvents = next.listOutboxEvents();
    this.financialTransactions = next.listFinancialTransactions();
    this.financialAuditLogs = next.listFinancialAuditLogs();
    this.settlements = next.listSettlements();
    this.driverWallets = next.listDriverWallets();
  }

  listPaymentOrders() {
    return structuredClone(this.paymentOrders);
  }

  findPaymentOrderById(paymentId: string) {
    const payment = this.paymentOrders.find(item => item.id === paymentId);
    return payment ? structuredClone(payment) : undefined;
  }

  findLatestPaymentByOrderId(orderId: string) {
    const payment = [...this.paymentOrders]
      .filter(item => item.orderId === orderId)
      .sort((left, right) =>
        right.createdAtIso.localeCompare(left.createdAtIso),
      )[0];
    return payment ? structuredClone(payment) : undefined;
  }

  updatePaymentOrder(
    paymentId: string,
    patch: Partial<PaymentOrderRecord>,
  ) {
    const index = this.paymentOrders.findIndex(item => item.id === paymentId);

    if (index < 0) {
      return undefined;
    }

    this.paymentOrders[index] = {
      ...this.paymentOrders[index],
      ...structuredClone(patch),
    };
    return structuredClone(this.paymentOrders[index]);
  }

  listRefunds() {
    return structuredClone(this.refunds);
  }

  findRefundByOrderId(orderId: string) {
    const refund = this.refunds.find(item => item.orderId === orderId);
    return refund ? structuredClone(refund) : undefined;
  }

  createRefundForPayment(
    payment: PaymentOrderRecord,
    reason: string,
    now: Date,
    amountCents = payment.amountCents,
  ) {
    const existing = this.refunds.find(
      item => item.paymentOrderId === payment.id,
    );

    if (existing) {
      return structuredClone(existing);
    }

    const nowIso = now.toISOString();
    const refund: RefundRecord = {
      id: this.createId(),
      refundNo: `RF-${payment.paymentNo}`,
      paymentOrderId: payment.id,
      orderId: payment.orderId,
      shipperId: payment.shipperId,
      channel: payment.channel,
      amountCents,
      reason,
      status: 'pending',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    this.refunds.push(refund);
    return structuredClone(refund);
  }

  listOutboxEvents() {
    return structuredClone(this.outboxEvents);
  }

  createRefundOutboxEvent(refund: RefundRecord, now: Date) {
    const existing = this.outboxEvents.find(
      item =>
        item.eventType === 'refund.requested' &&
        item.aggregateType === 'refund' &&
        item.aggregateId === refund.id,
    );

    if (existing) {
      return structuredClone(existing);
    }

    const nowIso = now.toISOString();
    const event: FinancialOutboxEventRecord = {
      id: this.createId(),
      eventType: 'refund.requested',
      aggregateType: 'refund',
      aggregateId: refund.id,
      refundId: refund.id,
      payload: {
        refundId: refund.id,
        paymentOrderId: refund.paymentOrderId,
      },
      status: 'pending',
      attemptCount: 0,
      maxAttempts: 10,
      availableAtIso: nowIso,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    this.outboxEvents.push(event);
    return structuredClone(event);
  }

  listFinancialTransactions() {
    return structuredClone(this.financialTransactions);
  }

  listFinancialTransactionsForOrder(orderId: string) {
    return structuredClone(
      this.financialTransactions.filter(item => item.orderId === orderId),
    );
  }

  createFinancialTransaction(transaction: FinancialTransactionRecord) {
    const existing = this.financialTransactions.find(
      item =>
        item.type === transaction.type &&
        item.referenceId === transaction.referenceId,
    );

    if (existing) {
      return structuredClone(existing);
    }

    this.financialTransactions.push(structuredClone(transaction));
    return structuredClone(transaction);
  }

  listFinancialAuditLogs() {
    return structuredClone(this.financialAuditLogs);
  }

  findFinancialAuditLog(
    actorAdminId: string,
    action: string,
    idempotencyKey: string,
  ) {
    const auditLog = this.financialAuditLogs.find(
      item =>
        item.actorAdminId === actorAdminId &&
        item.action === action &&
        item.idempotencyKey === idempotencyKey,
    );
    return auditLog ? structuredClone(auditLog) : undefined;
  }

  createFinancialAuditLog(auditLog: FinancialAuditLogRecord) {
    const existing = this.findFinancialAuditLog(
      auditLog.actorAdminId,
      auditLog.action,
      auditLog.idempotencyKey,
    );

    if (existing) {
      return existing;
    }

    this.financialAuditLogs.push(structuredClone(auditLog));
    return structuredClone(auditLog);
  }

  listSettlements() {
    return structuredClone(this.settlements);
  }

  findSettlementByOrderId(orderId: string) {
    const settlement = this.settlements.find(item => item.orderId === orderId);
    return settlement ? structuredClone(settlement) : undefined;
  }

  createSettlement(settlement: SettlementRecord) {
    const existing = this.settlements.find(
      item => item.orderId === settlement.orderId,
    );

    if (existing) {
      return structuredClone(existing);
    }

    this.settlements.push(structuredClone(settlement));
    return structuredClone(settlement);
  }

  listDriverWallets() {
    return structuredClone(this.driverWallets);
  }

  findDriverWallet(driverId: string) {
    const wallet = this.driverWallets.find(item => item.driverId === driverId);
    return wallet ? structuredClone(wallet) : undefined;
  }

  reserveDriverWallet(driverId: string, amountCents: number, now: Date) {
    const wallet = this.driverWallets.find(item => item.driverId === driverId);

    if (
      !wallet ||
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0 ||
      wallet.availableCents < amountCents
    ) {
      return undefined;
    }

    wallet.availableCents -= amountCents;
    wallet.reservedCents += amountCents;
    wallet.version += 1;
    wallet.updatedAtIso = now.toISOString();
    return structuredClone(wallet);
  }

  payReservedDriverWallet(driverId: string, amountCents: number, now: Date) {
    const wallet = this.driverWallets.find(item => item.driverId === driverId);

    if (
      !wallet ||
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0 ||
      wallet.reservedCents < amountCents
    ) {
      return undefined;
    }

    wallet.reservedCents -= amountCents;
    wallet.withdrawnCents += amountCents;
    wallet.version += 1;
    wallet.updatedAtIso = now.toISOString();
    return structuredClone(wallet);
  }

  releaseReservedDriverWallet(
    driverId: string,
    amountCents: number,
    now: Date,
  ) {
    const wallet = this.driverWallets.find(item => item.driverId === driverId);

    if (
      !wallet ||
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0 ||
      wallet.reservedCents < amountCents
    ) {
      return undefined;
    }

    wallet.reservedCents -= amountCents;
    wallet.availableCents += amountCents;
    wallet.version += 1;
    wallet.updatedAtIso = now.toISOString();
    return structuredClone(wallet);
  }

  creditDriverWallet(driverId: string, amountCents: number, now: Date) {
    const wallet = this.driverWallets.find(item => item.driverId === driverId);
    const nowIso = now.toISOString();

    if (wallet) {
      wallet.availableCents += amountCents;
      wallet.version += 1;
      wallet.updatedAtIso = nowIso;
      return structuredClone(wallet);
    }

    const created: DriverWalletRecord = {
      driverId,
      availableCents: amountCents,
      reservedCents: 0,
      withdrawnCents: 0,
      version: 1,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    this.driverWallets.push(created);
    return structuredClone(created);
  }
}
