require('reflect-metadata');

const assert = require('assert/strict');
const { createHmac, randomUUID } = require('crypto');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const {
  formatDatabaseUrlForDisplay,
  resolveDatabaseUrl,
} = require('./verify-postgres');
const {
  STAGE_1_SHIPPER_PHONE,
  buildApiForSmoke,
  createOrderMutationSmokeOrderRequest,
  seedStage1Database,
} = require('./seed-stage-1');

const FINANCIAL_SMOKE_ADMIN_PHONE = '13900139032';
const FINANCIAL_SMOKE_SANDBOX_SECRET =
  'financial-ledger-smoke-secret-2026-07-15';

function parseArgs(argv) {
  const extraArgs = argv.slice(2);

  if (
    extraArgs.length > 1 ||
    (extraArgs.length === 1 && extraArgs[0] !== '--test')
  ) {
    throw new Error('Usage: node scripts/verify-financial-ledger.js [--test]');
  }

  return {
    useTestDatabase: extraArgs.includes('--test'),
  };
}

async function main(argv = process.argv, env = process.env) {
  const { useTestDatabase } = parseArgs(argv);
  const databaseUrl = resolveDatabaseUrl(env, useTestDatabase);
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
  const apiRoot = path.join(__dirname, '..');

  const buildOutputRoot = buildApiForSmoke(apiRoot);
  const runtime = loadFinancialSmokeRuntime(buildOutputRoot);
  const port = await allocateEphemeralPort();
  const smokeEnv = createFinancialSmokeEnv(env, databaseUrl, port);
  const serverController = startApiServerProcess(
    apiRoot,
    smokeEnv,
    spawn,
    buildOutputRoot,
  );
  const apiClient = createFinancialSmokeApiClient(
    `http://127.0.0.1:${port}`,
    smokeEnv.PAYMENT_SANDBOX_SECRET,
  );

  try {
    await prisma.$connect();
    await waitForApiServerReady(apiClient, serverController);
    const result = await runFinancialLedgerSmoke({
      prisma,
      apiClient,
      runtime,
      env: smokeEnv,
    });
    console.log(
      JSON.stringify({
        databaseUrl: formatDatabaseUrlForDisplay(databaseUrl),
        ...result,
      }),
    );
    return 0;
  } finally {
    await Promise.allSettled([
      stopApiServerProcess(serverController),
      prisma.$disconnect(),
    ]);
  }
}

async function runFinancialLedgerSmoke({
  prisma,
  apiClient,
  runtime,
  env,
}) {
  const driverPhone = createSmokePhone('139');

  await resetSmokeVerificationCodes(prisma, [
    STAGE_1_SHIPPER_PHONE,
    driverPhone,
    FINANCIAL_SMOKE_ADMIN_PHONE,
  ]);
  await seedStage1Database(prisma);

  const shipper = await apiClient.loginWithCode(
    STAGE_1_SHIPPER_PHONE,
    'shipper',
    `financial-ledger-shipper-${randomUUID()}`,
  );
  const driver = await apiClient.loginWithCode(
    driverPhone,
    'driver',
    `financial-ledger-driver-${randomUUID()}`,
  );
  const adminUser = await ensureAdminUser(prisma, FINANCIAL_SMOKE_ADMIN_PHONE);
  const admin = {
    user: adminUser,
    tokens: {
      accessToken: createAccessToken(
        adminUser.id,
        env.JWT_ACCESS_SECRET,
        Number(env.ACCESS_TOKEN_TTL_SECONDS || '900'),
      ),
    },
  };

  await ensureApprovedDriver(
    prisma,
    driver.user.id,
    driver.user.phone,
    'financial-ledger-driver',
  );

  const onlineSettlement = await runOnlineSettlementScenario({
    prisma,
    apiClient,
    shipper,
    driver,
  });
  const codSettlement = await runCodSettlementScenario({
    prisma,
    apiClient,
    shipper,
    driver,
  });
  const refundFlow = await runLatePaymentRefundScenario({
    prisma,
    apiClient,
    shipper,
    admin,
    runtime,
    env,
  });
  const withdrawals = await runWithdrawalScenario({
    prisma,
    apiClient,
    driver,
    admin,
  });
  const lateFailureRollback = await runLateFailureRollbackScenario({
    prisma,
    apiClient,
    shipper,
    driver,
  });

  return {
    onlinePaymentSingleWinner: onlineSettlement.paymentSingleWinner,
    onlinePaymentCallbackReplay: onlineSettlement.callbackReplay,
    onlineSettlement: onlineSettlement.settlement,
    codSettlement,
    latePaymentRefund: refundFlow,
    withdrawals,
    lateFailureRollback,
  };
}

async function runOnlineSettlementScenario({
  prisma,
  apiClient,
  shipper,
  driver,
}) {
  const order = await apiClient.createShipperOrder(
    shipper.tokens.accessToken,
    createOnlineOrderRequest('financial-online-settlement'),
    randomUUID(),
  );

  const orderHallBeforePayment = await apiClient.listDriverOrderHall(
    driver.tokens.accessToken,
  );
  assert.ok(
    !orderHallBeforePayment.items.some(item => item.id === order.id),
    '在线未支付订单不应出现在司机大厅',
  );

  const paymentResults = await Promise.allSettled([
    apiClient.createPayment(
      shipper.tokens.accessToken,
      order.id,
      randomUUID(),
      { channel: 'wechat' },
    ),
    apiClient.createPayment(
      shipper.tokens.accessToken,
      order.id,
      randomUUID(),
      { channel: 'wechat' },
    ),
  ]);
  const paymentRace = summarizeConcurrentResults(
    paymentResults,
    'PAYMENT_ORDER_NOT_AVAILABLE',
    'payment create race',
  );
  const payment = paymentRace.success.value.payment;

  const paymentRows = await prisma.paymentOrder.findMany({
    where: {
      orderId: order.id,
      status: {
        in: ['pending', 'processing', 'escrowed', 'refund_pending'],
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
  assert.equal(paymentRows.length, 1, '同一订单只能保留一个活跃支付单');

  const callbackPayload = {
    eventId: `payment-event-${randomUUID()}`,
    paymentNo: payment.paymentNo,
    providerTradeNo: `sandbox-trade-${randomUUID()}`,
    amountCents: payment.amountCents,
    status: 'succeeded',
    occurredAtIso: new Date().toISOString(),
  };
  await apiClient.postSandboxPaymentCallback(callbackPayload);
  await apiClient.postSandboxPaymentCallback(callbackPayload);

  const callbackEventCount = await prisma.paymentCallbackEvent.count({
    where: {
      channel: 'sandbox',
      eventId: callbackPayload.eventId,
    },
  });
  assert.equal(callbackEventCount, 1, '重复支付回调不应重复落库');

  const escrowTransaction = await prisma.financialTransaction.findFirst({
    where: {
      paymentOrderId: payment.id,
      type: 'online_payment_escrow',
    },
    include: {
      entries: {
        orderBy: {
          sequence: 'asc',
        },
      },
    },
  });
  assert.ok(escrowTransaction, '支付成功回调必须生成托管流水');
  assertLedgerBalanced(escrowTransaction.entries);

  const orderHallAfterPayment = await apiClient.listDriverOrderHall(
    driver.tokens.accessToken,
  );
  assert.ok(
    orderHallAfterPayment.items.some(item => item.id === order.id),
    '托管后的在线订单应出现在司机大厅',
  );

  const settledOrder = await settleOrder({
    apiClient,
    shipperToken: shipper.tokens.accessToken,
    driverToken: driver.tokens.accessToken,
    orderId: order.id,
  });

  const latestPayment = await prisma.paymentOrder.findUnique({
    where: {
      id: payment.id,
    },
  });
  const settlement = await prisma.settlement.findFirst({
    where: {
      orderId: order.id,
    },
  });
  const wallet = await prisma.driverWallet.findUnique({
    where: {
      driverId: driver.user.id,
    },
  });
  const settlementTransaction = await prisma.financialTransaction.findFirst({
    where: {
      orderId: order.id,
      type: 'online_order_settlement',
    },
    include: {
      entries: {
        orderBy: {
          sequence: 'asc',
        },
      },
    },
  });

  assert.equal(settledOrder.status, 'completed', '在线订单应完成');
  assert.equal(settledOrder.paymentStatus, 'settled', '在线订单资金应已结算');
  assert.equal(latestPayment?.status, 'settled', '支付单应标记为 settled');
  assert.ok(settlement, '在线完成订单必须生成结算快照');
  assert.ok(settlementTransaction, '在线完成订单必须生成结算流水');
  assertLedgerBalanced(settlementTransaction.entries);

  const expectedDriverNet =
    settlement.grossAmountCents - settlement.platformFeeCents;
  assert.equal(
    settlement.driverNetAmountCents,
    expectedDriverNet,
    '结算净收入必须等于总额减平台费',
  );
  assert.equal(
    wallet?.availableCents,
    expectedDriverNet,
    '司机钱包可提现余额应等于首笔结算净收入',
  );

  return {
    paymentSingleWinner: {
      orderId: order.id,
      paymentId: payment.id,
      failureCode: paymentRace.failure.code,
    },
    callbackReplay: {
      eventId: callbackPayload.eventId,
      callbackEventCount,
      transactionId: escrowTransaction.id,
    },
    settlement: {
      orderId: order.id,
      settlementId: settlement.id,
      transactionId: settlementTransaction.id,
      driverNetAmountCents: settlement.driverNetAmountCents,
      walletAvailableCents: wallet?.availableCents ?? 0,
    },
  };
}

async function runCodSettlementScenario({
  prisma,
  apiClient,
  shipper,
  driver,
}) {
  const order = await apiClient.createShipperOrder(
    shipper.tokens.accessToken,
    createCodOrderRequest('financial-cod-settlement'),
    randomUUID(),
  );

  const orderHall = await apiClient.listDriverOrderHall(driver.tokens.accessToken);
  assert.ok(
    orderHall.items.some(item => item.id === order.id),
    '货到付款订单应立即出现在司机大厅',
  );

  const settledOrder = await settleOrder({
    apiClient,
    shipperToken: shipper.tokens.accessToken,
    driverToken: driver.tokens.accessToken,
    orderId: order.id,
  });
  const settlement = await prisma.settlement.findFirst({
    where: {
      orderId: order.id,
    },
  });
  const transaction = await prisma.financialTransaction.findFirst({
    where: {
      orderId: order.id,
      type: 'offline_order_settlement',
    },
    include: {
      entries: {
        orderBy: {
          sequence: 'asc',
        },
      },
    },
  });
  const wallet = await prisma.driverWallet.findUnique({
    where: {
      driverId: driver.user.id,
    },
  });

  assert.equal(settledOrder.status, 'completed', 'COD 订单应完成');
  assert.equal(settledOrder.paymentStatus, 'settled', 'COD 订单资金应已结算');
  assert.ok(settlement, 'COD 完成订单必须生成结算快照');
  assert.ok(transaction, 'COD 完成订单必须生成线下结算流水');
  assertLedgerBalanced(transaction.entries);
  assert.equal(
    wallet?.availableCents,
    144400,
    '两笔 76000 元订单结算后司机余额应累计为 144400 分',
  );

  return {
    orderId: order.id,
    settlementId: settlement.id,
    transactionId: transaction.id,
    walletAvailableCents: wallet?.availableCents ?? 0,
  };
}

async function runLatePaymentRefundScenario({
  prisma,
  apiClient,
  shipper,
  admin,
  runtime,
  env,
}) {
  const order = await apiClient.createShipperOrder(
    shipper.tokens.accessToken,
    createOnlineOrderRequest('financial-late-payment-refund'),
    randomUUID(),
  );
  const paymentCreate = await apiClient.createPayment(
    shipper.tokens.accessToken,
    order.id,
    randomUUID(),
    { channel: 'wechat' },
  );
  const payment = paymentCreate.payment;

  const cancelledOrder = await apiClient.cancelShipperOrder(
    shipper.tokens.accessToken,
    order.id,
    randomUUID(),
    {
      baseUpdatedAtIso: order.updatedAtIso,
      reasonText: 'financial-ledger-smoke cancel before pay callback',
    },
  );
  assert.equal(cancelledOrder.status, 'cancelled', '订单应先进入取消状态');
  assert.equal(
    cancelledOrder.paymentStatus,
    'cancelled',
    '未支付取消订单的 paymentStatus 应为 cancelled',
  );

  const latePaymentPayload = {
    eventId: `late-payment-${randomUUID()}`,
    paymentNo: payment.paymentNo,
    providerTradeNo: `sandbox-trade-${randomUUID()}`,
    amountCents: payment.amountCents,
    status: 'succeeded',
    occurredAtIso: new Date().toISOString(),
  };
  await apiClient.postSandboxPaymentCallback(latePaymentPayload);

  const lateRefundOrder = await apiClient.getShipperOrder(
    shipper.tokens.accessToken,
    order.id,
  );
  const lateRefundPayment = await prisma.paymentOrder.findUnique({
    where: {
      id: payment.id,
    },
  });
  const refund = await prisma.refund.findFirst({
    where: {
      orderId: order.id,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
  const outboxEvent = await prisma.financialOutboxEvent.findFirst({
    where: {
      refundId: refund?.id,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  assert.equal(lateRefundOrder.status, 'cancelled', '迟到支付不得复活订单');
  assert.equal(
    lateRefundOrder.paymentStatus,
    'refund_pending',
    '迟到支付应进入退款中状态',
  );
  assert.equal(
    lateRefundPayment?.status,
    'refund_pending',
    '迟到支付对应支付单应进入 refund_pending',
  );
  assert.ok(refund, '迟到支付应生成退款单');
  assert.ok(outboxEvent, '迟到支付应生成退款 outbox 事件');

  const repository = new runtime.PrismaPaymentsRepository(prisma);
  const failingWorker = new runtime.FinancialOutboxWorker(
    repository,
    {
      async processRefundOutboxEvent() {
        throw new Error('forced refund worker failure');
      },
    },
    {
      workerId: 'financial-ledger-failing-worker',
      retryBaseDelayMs: 0,
      retryMaxDelayMs: 0,
      leaseDurationMs: 1000,
      batchSize: 1,
    },
  );

  let failedToDead = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await failingWorker.runOnce();
    if (result.deadCount > 0) {
      failedToDead = true;
      break;
    }
    if (result.claimedCount === 0) {
      break;
    }
  }
  assert.ok(failedToDead, '退款 outbox 应在多次失败后进入 dead');

  const deadRefund = await prisma.refund.findUnique({
    where: {
      id: refund.id,
    },
  });
  const deadOutbox = await prisma.financialOutboxEvent.findUnique({
    where: {
      id: outboxEvent.id,
    },
  });
  const deadPayment = await prisma.paymentOrder.findUnique({
    where: {
      id: payment.id,
    },
  });
  const deadOrder = await prisma.order.findUnique({
    where: {
      id: order.id,
    },
  });

  assert.equal(deadRefund?.status, 'failed', '退款失败后 refund 应为 failed');
  assert.equal(deadOutbox?.status, 'dead', '退款 outbox 应为 dead');
  assert.equal(
    deadPayment?.status,
    'refund_failed',
    '退款 worker 失败后支付单应标记为 refund_failed',
  );
  assert.equal(
    deadOrder?.paymentStatus,
    'refund_failed',
    '退款 worker 失败后订单支付状态应标记为 refund_failed',
  );

  const retriedRefund = await apiClient.retryRefund(
    admin.tokens.accessToken,
    refund.id,
    randomUUID(),
    {
      expectedVersion: deadOutbox.attemptCount,
      reason: 'financial-ledger-smoke retry refund',
    },
  );
  assert.equal(retriedRefund.refund.status, 'pending', '退款重试应重置 refund');
  assert.equal(
    retriedRefund.outboxEvent.status,
    'pending',
    '退款重试应重置 outbox',
  );

  const paymentsService = new runtime.PaymentsService(
    repository,
    runtime.createPaymentProviderResolverFromEnv(env),
  );
  const successWorker = new runtime.FinancialOutboxWorker(
    repository,
    paymentsService,
    {
      workerId: 'financial-ledger-success-worker',
      retryBaseDelayMs: 0,
      retryMaxDelayMs: 0,
      leaseDurationMs: 1000,
      batchSize: 1,
    },
  );
  const successRun = await successWorker.runOnce();
  assert.equal(successRun.succeededCount, 1, '退款重试后应成功发起一次退款');

  const processingRefund = await prisma.refund.findUnique({
    where: {
      id: refund.id,
    },
  });
  const processingOutbox = await prisma.financialOutboxEvent.findUnique({
    where: {
      id: outboxEvent.id,
    },
  });
  assert.equal(processingRefund?.status, 'processing', '退款请求发出后应进入 processing');
  assert.equal(processingOutbox?.status, 'completed', '退款 outbox 应完成');

  const refundCallbackPayload = {
    eventId: `refund-event-${randomUUID()}`,
    refundNo: processingRefund.refundNo,
    providerRefundNo: processingRefund.providerRefundNo,
    amountCents: processingRefund.amountCents,
    status: 'succeeded',
    occurredAtIso: new Date().toISOString(),
  };
  await apiClient.postSandboxRefundCallback(refundCallbackPayload);

  const finalRefund = await prisma.refund.findUnique({
    where: {
      id: refund.id,
    },
  });
  const finalPayment = await prisma.paymentOrder.findUnique({
    where: {
      id: payment.id,
    },
  });
  const finalOrder = await prisma.order.findUnique({
    where: {
      id: order.id,
    },
  });
  const refundTransaction = await prisma.financialTransaction.findFirst({
    where: {
      referenceId: refund.id,
      type: 'online_refund',
    },
    include: {
      entries: {
        orderBy: {
          sequence: 'asc',
        },
      },
    },
  });

  assert.equal(finalRefund?.status, 'succeeded', '退款回调后 refund 应成功');
  assert.equal(finalPayment?.status, 'refunded', '退款回调后 payment 应 refunded');
  assert.equal(finalOrder?.paymentStatus, 'refunded', '退款回调后订单应 refunded');
  assert.ok(refundTransaction, '退款成功必须写 refund 资金流水');
  assertLedgerBalanced(refundTransaction.entries);

  return {
    orderId: order.id,
    refundId: refund.id,
    deadAttemptCount: deadOutbox.attemptCount,
    retryResetStatus: retriedRefund.outboxEvent.status,
    finalPaymentStatus: finalPayment.status,
    finalRefundStatus: finalRefund.status,
    refundTransactionId: refundTransaction.id,
  };
}

async function runWithdrawalScenario({
  prisma,
  apiClient,
  driver,
  admin,
}) {
  const incomeBefore = await apiClient.getDriverIncome(driver.tokens.accessToken);
  assert.equal(
    incomeBefore.summary.availableWithdrawalCents,
    144400,
    '提现前司机可提现余额应来自两笔结算',
  );

  const withdrawalResults = await Promise.allSettled([
    apiClient.createDriverWithdrawal(
      driver.tokens.accessToken,
      randomUUID(),
      {
        amountCents: 100000,
        bankAccountName: '财务冒烟司机',
        bankName: '中国银行',
        bankAccountNo: '6222020202020202',
      },
    ),
    apiClient.createDriverWithdrawal(
      driver.tokens.accessToken,
      randomUUID(),
      {
        amountCents: 100000,
        bankAccountName: '财务冒烟司机',
        bankName: '中国银行',
        bankAccountNo: '6222020202020202',
      },
    ),
  ]);
  const withdrawalRace = summarizeConcurrentResults(
    withdrawalResults,
    'DRIVER_WITHDRAWAL_BALANCE_INSUFFICIENT',
    'driver withdrawal race',
  );
  const approvedCandidate = withdrawalRace.success.value;

  const rejectedCandidate = await apiClient.createDriverWithdrawal(
    driver.tokens.accessToken,
    randomUUID(),
    {
      amountCents: 10000,
      bankAccountName: '财务冒烟司机',
      bankName: '农业银行',
      bankAccountNo: '6228480404040404',
    },
  );

  const approved = await apiClient.approveWithdrawal(
    admin.tokens.accessToken,
    approvedCandidate.id,
    randomUUID(),
    {
      expectedVersion: 0,
      reason: 'financial-ledger-smoke approve withdrawal',
    },
  );
  const rejected = await apiClient.rejectWithdrawal(
    admin.tokens.accessToken,
    rejectedCandidate.id,
    randomUUID(),
    {
      expectedVersion: 0,
      reason: 'financial-ledger-smoke reject withdrawal',
    },
  );

  const wallet = await prisma.driverWallet.findUnique({
    where: {
      driverId: driver.user.id,
    },
  });
  const approvedWithdrawal = await prisma.driverWithdrawal.findUnique({
    where: {
      id: approvedCandidate.id,
    },
  });
  const rejectedWithdrawal = await prisma.driverWithdrawal.findUnique({
    where: {
      id: rejectedCandidate.id,
    },
  });
  const approvedTransaction = approvedWithdrawal?.financialTransactionId
    ? await prisma.financialTransaction.findUnique({
        where: {
          id: approvedWithdrawal.financialTransactionId,
        },
        include: {
          entries: {
            orderBy: {
              sequence: 'asc',
            },
          },
        },
      })
    : null;

  assert.equal(
    wallet?.availableCents,
    44400,
    '审批通过 10 万并驳回 1 万后，可提现余额应回到 44400 分',
  );
  assert.equal(wallet?.reservedCents, 0, '审批完成后 reserved 应清零');
  assert.equal(wallet?.withdrawnCents, 100000, 'withdrawn 应累计审批通过金额');
  assert.equal(approvedWithdrawal?.status, 'paid', '通过后的提现单应为 paid');
  assert.equal(
    rejectedWithdrawal?.status,
    'rejected',
    '驳回后的提现单应为 rejected',
  );
  assert.equal(
    approved.withdrawal.id,
    approvedCandidate.id,
    '审批通过响应应返回对应提现单',
  );
  assert.equal(
    approved.withdrawal.status,
    'paid',
    '审批通过响应应反映 paid 状态',
  );
  assert.equal(
    approved.wallet.availableCents,
    34400,
    '审批通过后响应中的可提现余额应扣除审核中的第二笔提现',
  );
  assert.equal(
    approved.wallet.reservedCents,
    10000,
    '审批通过后响应中的 reserved 应保留待驳回提现金额',
  );
  assert.equal(
    approved.wallet.withdrawnCents,
    100000,
    '审批通过后响应中的 withdrawn 应累计通过金额',
  );
  assert.equal(
    rejected.withdrawal.id,
    rejectedCandidate.id,
    '驳回响应应返回对应提现单',
  );
  assert.equal(
    rejected.withdrawal.status,
    'rejected',
    '驳回响应应反映 rejected 状态',
  );
  assert.equal(
    rejected.wallet.availableCents,
    44400,
    '驳回后响应中的可提现余额应返还被驳回金额',
  );
  assert.equal(
    rejected.wallet.reservedCents,
    0,
    '驳回后响应中的 reserved 应清零',
  );
  assert.equal(
    rejected.wallet.withdrawnCents,
    100000,
    '驳回后响应中的 withdrawn 不应回退已打款金额',
  );
  assert.ok(
    approvedTransaction,
    '审批通过的提现单必须生成 driver_withdrawal 流水',
  );
  assertLedgerBalanced(approvedTransaction.entries);
  assert.equal(
    approved.financialTransaction?.id,
    approvedTransaction.id,
    '审批通过响应应返回对应资金流水',
  );
  assert.equal(
    rejectedWithdrawal?.financialTransactionId ?? null,
    null,
    '驳回的提现单不应生成付款流水',
  );
  assert.equal(
    rejected.financialTransaction ?? null,
    null,
    '驳回响应不应返回资金流水',
  );

  return {
    raceFailureCode: withdrawalRace.failure.code,
    approvedWithdrawalId: approved.withdrawal.id,
    rejectedWithdrawalId: rejected.withdrawal.id,
    walletAvailableCents: wallet?.availableCents ?? 0,
    walletWithdrawnCents: wallet?.withdrawnCents ?? 0,
    approvedTransactionId: approvedTransaction?.id,
  };
}

async function runLateFailureRollbackScenario({
  prisma,
  apiClient,
  shipper,
  driver,
}) {
  const order = await apiClient.createShipperOrder(
    shipper.tokens.accessToken,
    createCodOrderRequest('financial-late-failure-rollback'),
    randomUUID(),
  );
  let currentOrder = await apiClient.acceptDriverOrder(
    driver.tokens.accessToken,
    order.id,
    randomUUID(),
    {
      baseUpdatedAtIso: order.updatedAtIso,
    },
  );
  currentOrder = await apiClient.advanceDriverOrderStatus(
    driver.tokens.accessToken,
    order.id,
    randomUUID(),
    {
      baseUpdatedAtIso: currentOrder.updatedAtIso,
      nextStatus: 'transporting',
    },
  );
  currentOrder = await apiClient.advanceDriverOrderStatus(
    driver.tokens.accessToken,
    order.id,
    randomUUID(),
    {
      baseUpdatedAtIso: currentOrder.updatedAtIso,
      nextStatus: 'confirming',
    },
  );

  const walletBefore = await prisma.driverWallet.findUnique({
    where: {
      driverId: driver.user.id,
    },
  });
  const settlementCountBefore = await prisma.settlement.count({
    where: {
      orderId: order.id,
    },
  });
  const transactionCountBefore = await prisma.financialTransaction.count({
    where: {
      orderId: order.id,
    },
  });

  await withFinancialLateFailureTrigger(prisma, async () => {
    await assert.rejects(
      apiClient.completeShipperOrder(
        shipper.tokens.accessToken,
        order.id,
        randomUUID(),
        {
          baseUpdatedAtIso: currentOrder.updatedAtIso,
        },
      ),
      error => {
        assert.equal(error.status, 500);
        return true;
      },
    );
  });

  const orderAfter = await apiClient.getShipperOrder(
    shipper.tokens.accessToken,
    order.id,
  );
  const walletAfter = await prisma.driverWallet.findUnique({
    where: {
      driverId: driver.user.id,
    },
  });
  const settlementCountAfter = await prisma.settlement.count({
    where: {
      orderId: order.id,
    },
  });
  const transactionCountAfter = await prisma.financialTransaction.count({
    where: {
      orderId: order.id,
    },
  });

  assert.equal(
    orderAfter.status,
    'confirming',
    '财务晚失败后订单状态必须完整回滚',
  );
  assert.equal(
    orderAfter.paymentStatus,
    'not_required',
    '财务晚失败后支付状态必须完整回滚',
  );
  assert.equal(
    settlementCountAfter,
    settlementCountBefore,
    '财务晚失败后不应残留 settlement',
  );
  assert.equal(
    transactionCountAfter,
    transactionCountBefore,
    '财务晚失败后不应残留 financial transaction',
  );
  assert.deepEqual(
    serializeWallet(walletAfter),
    serializeWallet(walletBefore),
    '财务晚失败后司机钱包必须回滚',
  );

  return {
    orderId: order.id,
    statusAfterFailure: orderAfter.status,
    paymentStatusAfterFailure: orderAfter.paymentStatus,
    walletAvailableCents: walletAfter?.availableCents ?? 0,
  };
}

async function settleOrder({
  apiClient,
  shipperToken,
  driverToken,
  orderId,
}) {
  let currentOrder = await apiClient.getShipperOrder(shipperToken, orderId);
  currentOrder = await apiClient.acceptDriverOrder(
    driverToken,
    orderId,
    randomUUID(),
    {
      baseUpdatedAtIso: currentOrder.updatedAtIso,
    },
  );
  currentOrder = await apiClient.advanceDriverOrderStatus(
    driverToken,
    orderId,
    randomUUID(),
    {
      baseUpdatedAtIso: currentOrder.updatedAtIso,
      nextStatus: 'transporting',
    },
  );
  currentOrder = await apiClient.advanceDriverOrderStatus(
    driverToken,
    orderId,
    randomUUID(),
    {
      baseUpdatedAtIso: currentOrder.updatedAtIso,
      nextStatus: 'confirming',
    },
  );

  return apiClient.completeShipperOrder(shipperToken, orderId, randomUUID(), {
    baseUpdatedAtIso: currentOrder.updatedAtIso,
  });
}

function createOnlineOrderRequest(label) {
  return {
    ...createOrderMutationSmokeOrderRequest(new Date()),
    cargoDescription: `financial-ledger:${label}:${randomUUID()}`,
    paymentMethod: 'online',
  };
}

function createCodOrderRequest(label) {
  return {
    ...createOrderMutationSmokeOrderRequest(new Date()),
    cargoDescription: `financial-ledger:${label}:${randomUUID()}`,
    paymentMethod: 'cod',
  };
}

function summarizeConcurrentResults(results, expectedFailureCode, label) {
  const successes = [];
  const failures = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successes.push({
        index,
        value: result.value,
      });
      return;
    }

    failures.push({
      index,
      reason: result.reason,
    });
  });

  assert.equal(
    successes.length,
    1,
    `${label} 应该只有一个成功请求，实际为 ${successes.length}`,
  );
  assert.equal(
    failures.length,
    1,
    `${label} 应该只有一个失败请求，实际为 ${failures.length}`,
  );
  assert.equal(
    failures[0].reason?.code,
    expectedFailureCode,
    `${label} 失败码不匹配`,
  );

  return {
    success: successes[0],
    failure: failures[0].reason,
  };
}

function assertLedgerBalanced(entries) {
  const balance = entries.reduce((total, entry) => {
    return entry.direction === 'debit'
      ? total + entry.amountCents
      : total - entry.amountCents;
  }, 0);

  assert.equal(balance, 0, '资金分录借贷不平');
}

function serializeWallet(wallet) {
  if (!wallet) {
    return null;
  }

  return {
    driverId: wallet.driverId,
    availableCents: wallet.availableCents,
    reservedCents: wallet.reservedCents,
    withdrawnCents: wallet.withdrawnCents,
    version: wallet.version,
  };
}

function loadFinancialSmokeRuntime(buildOutputRoot) {
  return {
    PrismaPaymentsRepository: require(path.join(
      buildOutputRoot,
      'payments',
      'payments.repository.js',
    )).PrismaPaymentsRepository,
    FinancialOutboxWorker: require(path.join(
      buildOutputRoot,
      'payments',
      'financial-outbox.worker.js',
    )).FinancialOutboxWorker,
    PaymentsService: require(path.join(
      buildOutputRoot,
      'payments',
      'payments.service.js',
    )).PaymentsService,
    createPaymentProviderResolverFromEnv: require(path.join(
      buildOutputRoot,
      'payments',
      'payments.module.js',
    )).createPaymentProviderResolverFromEnv,
  };
}

function createFinancialSmokeEnv(env, databaseUrl, port) {
  return {
    ...env,
    NODE_ENV: 'development',
    PORT: String(port),
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET:
      env.JWT_ACCESS_SECRET || 'replace-with-dev-access-secret',
    ACCESS_TOKEN_TTL_SECONDS: env.ACCESS_TOKEN_TTL_SECONDS || '900',
    REFRESH_TOKEN_TTL_SECONDS: env.REFRESH_TOKEN_TTL_SECONDS || '604800',
    VERIFICATION_CODE_TTL_SECONDS:
      env.VERIFICATION_CODE_TTL_SECONDS || '300',
    ORDER_IDEMPOTENCY_TTL_SECONDS:
      env.ORDER_IDEMPOTENCY_TTL_SECONDS || '86400',
    PAYMENT_PROVIDER_MODE: 'sandbox',
    PAYMENT_SANDBOX_SECRET:
      env.PAYMENT_SANDBOX_SECRET || FINANCIAL_SMOKE_SANDBOX_SECRET,
    PAYMENT_ORDER_TTL_SECONDS: env.PAYMENT_ORDER_TTL_SECONDS || '900',
    FILE_STORAGE_PROVIDER: env.FILE_STORAGE_PROVIDER || 'local',
  };
}

function createFinancialSmokeApiClient(baseUrl, sandboxSecret, fetchImpl = fetch) {
  return {
    async ping() {
      const response = await fetchImpl(`${baseUrl}/api/me`, {
        method: 'GET',
      });

      return response.status > 0;
    },
    async loginWithCode(phone, userType, deviceId) {
      const sendCodeResult = await requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        '/api/auth/send-code',
        {
          body: {
            phone,
            purpose: 'login',
          },
        },
      );
      const code = sendCodeResult.devCode || '123456';

      return requestApi(fetchImpl, baseUrl, 'POST', '/api/auth/login', {
        body: {
          phone,
          code,
          userType,
          deviceId,
        },
      });
    },
    createShipperOrder(accessToken, body, idempotencyKey) {
      return requestApi(fetchImpl, baseUrl, 'POST', '/api/shipper/orders', {
        accessToken,
        idempotencyKey,
        body,
      });
    },
    getShipperOrder(accessToken, orderId) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'GET',
        `/api/shipper/orders/${orderId}`,
        {
          accessToken,
        },
      );
    },
    cancelShipperOrder(accessToken, orderId, idempotencyKey, body) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        `/api/shipper/orders/${orderId}/cancel`,
        {
          accessToken,
          idempotencyKey,
          body,
        },
      );
    },
    completeShipperOrder(accessToken, orderId, idempotencyKey, body) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        `/api/shipper/orders/${orderId}/complete`,
        {
          accessToken,
          idempotencyKey,
          body,
        },
      );
    },
    acceptDriverOrder(accessToken, orderId, idempotencyKey, body) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        `/api/driver/orders/${orderId}/accept`,
        {
          accessToken,
          idempotencyKey,
          body,
        },
      );
    },
    advanceDriverOrderStatus(accessToken, orderId, idempotencyKey, body) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        `/api/driver/orders/${orderId}/status`,
        {
          accessToken,
          idempotencyKey,
          body,
        },
      );
    },
    listDriverOrderHall(accessToken, query = { page: 1, pageSize: 50 }) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'GET',
        `/api/driver/order-hall?${new URLSearchParams({
          page: String(query.page),
          pageSize: String(query.pageSize),
        }).toString()}`,
        {
          accessToken,
        },
      );
    },
    createPayment(accessToken, orderId, idempotencyKey, body) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        `/api/shipper/orders/${orderId}/payments`,
        {
          accessToken,
          idempotencyKey,
          body,
        },
      );
    },
    getLatestPayment(accessToken, orderId) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'GET',
        `/api/shipper/orders/${orderId}/payments`,
        {
          accessToken,
        },
      );
    },
    getDriverIncome(accessToken) {
      return requestApi(fetchImpl, baseUrl, 'GET', '/api/driver/income', {
        accessToken,
      });
    },
    createDriverWithdrawal(accessToken, idempotencyKey, body) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        '/api/driver/withdrawals',
        {
          accessToken,
          idempotencyKey,
          body,
        },
      );
    },
    approveWithdrawal(accessToken, withdrawalId, idempotencyKey, body) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        `/api/admin/finance/withdrawals/${withdrawalId}/approve`,
        {
          accessToken,
          idempotencyKey,
          body,
        },
      );
    },
    rejectWithdrawal(accessToken, withdrawalId, idempotencyKey, body) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        `/api/admin/finance/withdrawals/${withdrawalId}/reject`,
        {
          accessToken,
          idempotencyKey,
          body,
        },
      );
    },
    retryRefund(accessToken, refundId, idempotencyKey, body) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        `/api/admin/finance/refunds/${refundId}/retry`,
        {
          accessToken,
          idempotencyKey,
          body,
        },
      );
    },
    async postSandboxPaymentCallback(payload) {
      return requestCallback(fetchImpl, baseUrl, '/api/callbacks/payment/sandbox', {
        payload,
        secret: sandboxSecret,
      });
    },
    async postSandboxRefundCallback(payload) {
      return requestCallback(fetchImpl, baseUrl, '/api/callbacks/refund/sandbox', {
        payload,
        secret: sandboxSecret,
      });
    },
  };
}

async function requestCallback(fetchImpl, baseUrl, pathname, { payload, secret }) {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomUUID();
  const signature = createSandboxCallbackSignature(
    secret,
    timestamp,
    nonce,
    rawBody,
  );
  const response = await fetchImpl(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-payment-timestamp': timestamp,
      'x-payment-nonce': nonce,
      'x-payment-signature': signature,
    },
    body: rawBody,
  });
  const body = await parseJsonSafely(response);

  if (!response.ok) {
    throw createApiError(response.status, body, pathname);
  }

  return body;
}

function createSandboxCallbackSignature(secret, timestamp, nonce, rawBody) {
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${nonce}\n`)
    .update(rawBody)
    .digest('hex');
}

function createSmokePhone(prefix) {
  return `${prefix}${randomUUID().replace(/\D/g, '').padEnd(8, '0').slice(0, 8)}`;
}

async function requestApi(
  fetchImpl,
  baseUrl,
  method,
  pathname,
  {
    accessToken,
    idempotencyKey,
    body,
    requestId = `financial-smoke-${randomUUID()}`,
  } = {},
) {
  const headers = {
    'x-request-id': requestId,
  };

  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const response = await fetchImpl(`${baseUrl}${pathname}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const responseBody = await parseJsonSafely(response);

  if (!response.ok) {
    throw createApiError(response.status, responseBody, pathname);
  }

  if (
    !responseBody ||
    responseBody.code !== 'OK' ||
    !Object.prototype.hasOwnProperty.call(responseBody, 'data')
  ) {
    throw new Error(`Unexpected API success envelope from ${pathname}`);
  }

  return responseBody.data;
}

async function parseJsonSafely(response) {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text,
    };
  }
}

function createApiError(status, payload, pathname = '') {
  const message = payload?.message || `HTTP ${status}`;
  const error = new Error(pathname ? `${pathname}: ${message}` : message);

  error.status = status;
  error.code = payload?.code || `HTTP_${status}`;
  error.payload = payload;
  error.pathname = pathname;

  return error;
}

async function allocateEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close(() => {
          reject(new Error('Failed to allocate ephemeral port'));
        });
        return;
      }

      server.close(error => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

function startApiServerProcess(
  apiRoot,
  env,
  spawnImpl = spawn,
  buildOutputRoot,
) {
  const builtApiRoot = buildOutputRoot || path.join(apiRoot, 'dist');
  const child = spawnImpl(process.execPath, [path.join(builtApiRoot, 'main.js')], {
    cwd: apiRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = [];
  const stderr = [];

  child.stdout?.on('data', chunk => {
    stdout.push(Buffer.from(chunk));
  });
  child.stderr?.on('data', chunk => {
    stderr.push(Buffer.from(chunk));
  });

  return {
    child,
    getLogs() {
      return Buffer.concat([...stdout, ...stderr]).toString('utf8');
    },
  };
}

async function waitForApiServerReady(
  apiClient,
  serverController,
  timeoutMs = 30000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (hasChildProcessExited(serverController.child)) {
      throw new Error(
        `API smoke server exited early with code ${
          serverController.child.exitCode ?? serverController.child.signalCode
        }\n${serverController.getLogs()}`,
      );
    }

    try {
      if (await apiClient.ping()) {
        return;
      }
    } catch {
      // ignore startup race
    }

    await delay(250);
  }

  throw new Error(
    `Timed out waiting for API smoke server readiness\n${serverController.getLogs()}`,
  );
}

async function stopApiServerProcess(serverController) {
  if (!serverController || hasChildProcessExited(serverController.child)) {
    return;
  }

  serverController.child.kill();
  await Promise.race([
    new Promise(resolve => {
      serverController.child.once('exit', () => resolve(undefined));
    }),
    delay(5000),
  ]);
}

function hasChildProcessExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function resetSmokeVerificationCodes(prisma, phones) {
  if (!prisma.verificationCode?.deleteMany) {
    return;
  }

  await prisma.verificationCode.deleteMany({
    where: {
      phone: {
        in: phones,
      },
    },
  });
}

async function ensureApprovedDriver(prisma, driverId, _driverPhone, label) {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const [identityFrontFile, identityBackFile, drivingLicenseFile, vehiclePhotoFile] =
    await Promise.all(
      ['identity-front', 'identity-back', 'driving-license', 'vehicle-photo'].map(
        key =>
          prisma.fileObject.create({
            data: {
              ownerUserId: driverId,
              purpose: 'identity',
              contentType: 'image/png',
              byteSize: 2048,
              objectKey: `${driverId}/identity/${label}-${key}-${suffix}.png`,
              publicUrl: `https://cdn.example.com/${driverId}/identity/${label}-${key}-${suffix}.png`,
              status: 'uploaded',
            },
          }),
      ),
    );

  await Promise.all([
    prisma.driverIdentityCertification.upsert({
      where: {
        driverId,
      },
      create: {
        driverId,
        realName: `${label} 司机`,
        identityNumber: '110101199003071234',
        identityFrontFileId: identityFrontFile.id,
        identityBackFileId: identityBackFile.id,
        status: 'approved',
        rejectionReason: null,
      },
      update: {
        realName: `${label} 司机`,
        identityNumber: '110101199003071234',
        identityFrontFileId: identityFrontFile.id,
        identityBackFileId: identityBackFile.id,
        status: 'approved',
        rejectionReason: null,
      },
    }),
    prisma.driverVehicleCertification.upsert({
      where: {
        driverId,
      },
      create: {
        driverId,
        plateNumber: '粤B12345',
        vehicleType: 'medium',
        vehicleLengthText: '6.8 米',
        loadCapacityText: '8 吨',
        hasTailboard: true,
        drivingLicenseFileId: drivingLicenseFile.id,
        driverLicenseFileId: null,
        transportQualificationFileId: null,
        operationPermitFileId: null,
        vehiclePhotoFileId: vehiclePhotoFile.id,
        status: 'approved',
        rejectionReason: null,
      },
      update: {
        plateNumber: '粤B12345',
        vehicleType: 'medium',
        vehicleLengthText: '6.8 米',
        loadCapacityText: '8 吨',
        hasTailboard: true,
        drivingLicenseFileId: drivingLicenseFile.id,
        driverLicenseFileId: null,
        transportQualificationFileId: null,
        operationPermitFileId: null,
        vehiclePhotoFileId: vehiclePhotoFile.id,
        status: 'approved',
        rejectionReason: null,
      },
    }),
    prisma.driverAcceptanceSettings.upsert({
      where: {
        driverId,
      },
      create: {
        driverId,
        isOnline: true,
        maxDistanceKm: 50,
        vehicleTypePreferences: ['medium'],
      },
      update: {
        isOnline: true,
        maxDistanceKm: 50,
        vehicleTypePreferences: ['medium'],
      },
    }),
  ]);
}

async function ensureAdminUser(prisma, phone) {
  return prisma.user.upsert({
    where: {
      phone,
    },
    create: {
      phone,
      userType: 'admin',
      status: 'active',
    },
    update: {
      userType: 'admin',
      status: 'active',
    },
  });
}

function createAccessToken(userId, secret, ttlSeconds, now = new Date()) {
  const iat = Math.floor(now.getTime() / 1000);
  const header = Buffer.from(
    JSON.stringify({
      alg: 'HS256',
      typ: 'JWT',
    }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      type: 'access',
      iat,
      exp: iat + ttlSeconds,
    }),
  ).toString('base64url');
  const signedContent = `${header}.${payload}`;
  const signature = createHmac('sha256', secret)
    .update(signedContent)
    .digest('base64url');

  return `${signedContent}.${signature}`;
}

async function withFinancialLateFailureTrigger(prisma, callback) {
  const suffix = randomUUID().replace(/-/g, '');
  const functionName = `"financial_ledger_smoke_fail_${suffix}"`;
  const triggerName = `"financial_ledger_smoke_fail_trigger_${suffix}"`;
  let primaryError;
  let result;

  await prisma.$executeRawUnsafe(`
CREATE OR REPLACE FUNCTION ${functionName}()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."type" = 'offline_order_settlement' THEN
    RAISE EXCEPTION 'financial ledger smoke late failure';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
  `.trim());
  await prisma.$executeRawUnsafe(`
CREATE CONSTRAINT TRIGGER ${triggerName}
AFTER INSERT ON "FinancialTransaction"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION ${functionName}();
  `.trim());

  try {
    result = await callback();
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors = [];

  try {
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS ${triggerName} ON "FinancialTransaction";`,
    );
  } catch (error) {
    cleanupErrors.push(error);
  }

  try {
    await prisma.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS ${functionName}();`,
    );
  } catch (error) {
    cleanupErrors.push(error);
  }

  if (primaryError) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [primaryError, ...cleanupErrors],
        primaryError instanceof Error
          ? primaryError.message
          : 'Financial late-failure callback failed',
      );
    }

    throw primaryError;
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      'Failed to clean up financial late-failure trigger',
    );
  }

  return result;
}

if (require.main === module) {
  main().then(
    exitCode => {
      process.exitCode = exitCode;
    },
    error => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    },
  );
}

module.exports = {
  createFinancialSmokeApiClient,
  main,
  parseArgs,
  withFinancialLateFailureTrigger,
};
