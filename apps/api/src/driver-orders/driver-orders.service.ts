import type { AuthenticatedUser } from '../auth/dto';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type { DriverCertificationRepository } from '../driver-certification/driver-certification.repository';
import type { FilesRepository } from '../files/files.repository';
import type { ShipperOrderRecord } from '../orders/dto';
import type { OrdersRepository } from '../orders/orders.repository';
import type { DriverAcceptanceSettingsRepository } from './driver-acceptance-settings.repository';
import type { DriverWithdrawalsRepository } from './driver-withdrawals.repository';
import type {
  DriverAcceptOrderEventPayload,
  CreateDriverWithdrawalRequest,
  DriverAcceptOrderRequest,
  DriverAdvanceOrderStatusRequest,
  DriverOrderEventSnapshot,
  DriverEvaluateShipperRequest,
  DriverIncomeOverview,
  DriverMyOrdersQuery,
  DriverMyOrdersResult,
  DriverOrderHallQuery,
  DriverOrderHallResult,
  DriverQuoteOrderEventPayload,
  DriverQuoteOrderRequest,
  DriverReplyEvaluationRequest,
  DriverReportExceptionRequest,
  DriverWithdrawalListResult,
  DriverWithdrawalsQuery,
  SaveDriverAcceptanceSettingsRequest,
} from './dto';

export class DriverOrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly certificationRepository: DriverCertificationRepository,
    private readonly acceptanceSettingsRepository: DriverAcceptanceSettingsRepository,
    private readonly driverWithdrawalsRepository: DriverWithdrawalsRepository,
    private readonly filesRepository?: FilesRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listOrderHall(
    currentUser: AuthenticatedUser,
    query: DriverOrderHallQuery,
  ): Promise<DriverOrderHallResult> {
    this.assertDriver(currentUser);
    const result = await this.ordersRepository.listDriverOrderHall(query);

    return {
      items: result.items,
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async getAcceptanceSettings(currentUser: AuthenticatedUser) {
    this.assertDriver(currentUser);

    return this.acceptanceSettingsRepository.getAcceptanceSettings(currentUser.id);
  }

  async saveAcceptanceSettings(
    currentUser: AuthenticatedUser,
    input: SaveDriverAcceptanceSettingsRequest,
  ) {
    this.assertDriver(currentUser);

    return this.acceptanceSettingsRepository.saveAcceptanceSettings(
      currentUser.id,
      input,
    );
  }

  async getIncomeOverview(
    currentUser: AuthenticatedUser,
  ): Promise<DriverIncomeOverview> {
    this.assertDriver(currentUser);
    const incomeContext = await this.buildDriverIncomeContext(currentUser.id);
    const now = this.now();
    const startOfToday = getStartOfUtcDay(now);
    const startOfWeek = getStartOfUtcWeek(now);
    const startOfMonth = getStartOfUtcMonth(now);

    return {
      driverId: currentUser.id,
      summary: {
        todayIncomeCents: sumDriverIncomeSince(
          incomeContext.completedIncomeRecords,
          startOfToday,
        ),
        weekIncomeCents: sumDriverIncomeSince(
          incomeContext.completedIncomeRecords,
          startOfWeek,
        ),
        monthIncomeCents: sumDriverIncomeSince(
          incomeContext.completedIncomeRecords,
          startOfMonth,
        ),
        historyIncomeCents: incomeContext.historyIncomeCents,
        pendingSettlementCents: incomeContext.pendingSettlementCents,
        availableWithdrawalCents: Math.max(
          incomeContext.historyIncomeCents - incomeContext.consumedWithdrawalCents,
          0,
        ),
        reviewingWithdrawalCents: incomeContext.reviewingWithdrawalCents,
        completedOrderCount: incomeContext.completedOrderCount,
      },
      records: incomeContext.completedIncomeRecords.slice(0, 20),
    };
  }

  async listWithdrawals(
    currentUser: AuthenticatedUser,
    query: DriverWithdrawalsQuery,
  ): Promise<DriverWithdrawalListResult> {
    this.assertDriver(currentUser);
    const result = await this.driverWithdrawalsRepository.listWithdrawals(
      currentUser.id,
      query,
    );

    return {
      items: result.items,
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async createWithdrawal(
    currentUser: AuthenticatedUser,
    input: CreateDriverWithdrawalRequest,
  ) {
    this.assertDriver(currentUser);
    const incomeContext = await this.buildDriverIncomeContext(currentUser.id);
    const availableWithdrawalCents = Math.max(
      incomeContext.historyIncomeCents - incomeContext.consumedWithdrawalCents,
      0,
    );

    if (input.amountCents > availableWithdrawalCents) {
      throw new BusinessError(
        ApiErrorCode.DRIVER_WITHDRAWAL_BALANCE_INSUFFICIENT,
        '可提现余额不足',
      );
    }

    return this.driverWithdrawalsRepository.createWithdrawal(
      currentUser.id,
      input,
    );
  }

  async quoteOrder(
    currentUser: AuthenticatedUser,
    orderId: string,
    input: DriverQuoteOrderRequest,
  ): Promise<ShipperOrderRecord> {
    this.assertDriver(currentUser);
    await this.assertDriverOnline(currentUser.id);
    const certification = await this.assertDriverCertified(currentUser.id);
    const order = await this.getWaitingOrder(orderId);
    const driverSnapshot = await this.createDriverOrderEventSnapshot(
      currentUser,
      certification,
    );
    const eventPayload: DriverQuoteOrderEventPayload = {
      ...input,
      driverSnapshot,
    };

    return this.ordersRepository.submitDriverQuote(
      order.id,
      currentUser.id,
      eventPayload,
    );
  }

  async acceptOrder(
    currentUser: AuthenticatedUser,
    orderId: string,
    input: DriverAcceptOrderRequest,
  ): Promise<ShipperOrderRecord> {
    this.assertDriver(currentUser);
    await this.assertDriverOnline(currentUser.id);
    const certification = await this.assertDriverCertified(currentUser.id);
    const order = await this.getWaitingOrder(orderId);
    const driverSnapshot = await this.createDriverOrderEventSnapshot(
      currentUser,
      certification,
    );
    const eventPayload: DriverAcceptOrderEventPayload = {
      ...input,
      driverSnapshot,
    };

    return this.ordersRepository.acceptDriverOrder(
      order.id,
      currentUser.id,
      eventPayload,
    );
  }

  async listMyOrders(
    currentUser: AuthenticatedUser,
    query: DriverMyOrdersQuery,
  ): Promise<DriverMyOrdersResult> {
    this.assertDriver(currentUser);
    const result = await this.ordersRepository.listDriverAcceptedOrders(
      currentUser.id,
      query,
    );

    return {
      items: result.items,
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async getOrder(
    currentUser: AuthenticatedUser,
    orderId: string,
  ): Promise<ShipperOrderRecord> {
    this.assertDriver(currentUser);
    const order = await this.ordersRepository.findDriverAcceptedOrder(
      currentUser.id,
      orderId,
    );

    if (!order) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    return order;
  }

  async advanceOrderStatus(
    currentUser: AuthenticatedUser,
    orderId: string,
    input: DriverAdvanceOrderStatusRequest,
  ): Promise<ShipperOrderRecord> {
    this.assertDriver(currentUser);
    const order = await this.getOrder(currentUser, orderId);

    if (!canDriverAdvanceOrderStatus(order.status, input.nextStatus)) {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前司机订单状态不允许推进到目标状态',
      );
    }

    await this.assertReceiptProofFiles(
      currentUser.id,
      input.receiptPhotoFileIds,
    );

    return this.ordersRepository.advanceDriverOrderStatus(
      order.id,
      currentUser.id,
      input,
    );
  }

  async replyToEvaluation(
    currentUser: AuthenticatedUser,
    orderId: string,
    input: DriverReplyEvaluationRequest,
  ): Promise<ShipperOrderRecord> {
    this.assertDriver(currentUser);
    const order = await this.getOrder(currentUser, orderId);

    if (!hasSubmittedEvaluation(order)) {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '订单尚未收到货主评价',
      );
    }

    return this.ordersRepository.replyToOrderEvaluation(
      order.id,
      currentUser.id,
      input,
    );
  }

  async reportException(
    currentUser: AuthenticatedUser,
    orderId: string,
    input: DriverReportExceptionRequest,
  ): Promise<ShipperOrderRecord> {
    this.assertDriver(currentUser);
    const order = await this.getOrder(currentUser, orderId);

    if (!isDriverExecutingOrderStatus(order.status)) {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前司机订单状态不允许上报异常',
      );
    }

    await this.assertExceptionProofFiles(currentUser.id, input.photoFileIds);

    return this.ordersRepository.reportDriverOrderException(
      order.id,
      currentUser.id,
      input,
    );
  }

  async evaluateShipper(
    currentUser: AuthenticatedUser,
    orderId: string,
    input: DriverEvaluateShipperRequest,
  ): Promise<ShipperOrderRecord> {
    this.assertDriver(currentUser);
    const order = await this.getOrder(currentUser, orderId);

    if (order.status !== 'completed') {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '订单完成后才能评价货主',
      );
    }

    return this.ordersRepository.evaluateShipper(
      order.id,
      currentUser.id,
      input,
    );
  }

  private assertDriver(currentUser: AuthenticatedUser) {
    if (currentUser.userType !== 'driver') {
      throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是司机');
    }
  }

  private async assertDriverCertified(driverId: string) {
    const certification =
      await this.certificationRepository.getCertification(driverId);

    if (
      certification.identity.status !== 'approved' ||
      certification.vehicle.status !== 'approved'
    ) {
      throw new BusinessError(
        ApiErrorCode.DRIVER_CERTIFICATION_REQUIRED,
        '司机实名和车辆认证通过后才能接单',
      );
    }

    return certification;
  }

  private async assertDriverOnline(driverId: string) {
    const acceptanceSettings =
      await this.acceptanceSettingsRepository.getAcceptanceSettings(driverId);

    if (!acceptanceSettings.isOnline) {
      throw new BusinessError(
        ApiErrorCode.DRIVER_ACCEPTANCE_OFFLINE,
        '司机当前处于离线接单状态',
      );
    }
  }

  private async getWaitingOrder(orderId: string) {
    const order = await this.ordersRepository.findOrderById(orderId);

    if (!order) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    if (order.status !== 'waiting') {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单已不可接单',
      );
    }

    return order;
  }

  private async assertReceiptProofFiles(
    driverId: string,
    fileIds: string[] | undefined,
  ) {
    if (!fileIds?.length) {
      return;
    }

    if (!this.filesRepository) {
      throw new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '司机执行凭证不存在');
    }

    for (const fileId of fileIds) {
      const file = await this.filesRepository.findFileByIdAndOwner(
        fileId,
        driverId,
      );

      if (!file) {
        throw new BusinessError(
          ApiErrorCode.FILE_NOT_FOUND,
          '司机执行凭证不存在',
        );
      }

      if (file.status !== 'uploaded') {
        throw new BusinessError(
          ApiErrorCode.FILE_STATE_INVALID,
          '司机执行凭证尚未上传完成',
        );
      }

      if (file.purpose !== 'receipt') {
        throw new BusinessError(
          ApiErrorCode.FILE_PURPOSE_INVALID,
          '司机执行凭证用途不匹配',
        );
      }
    }
  }

  private async assertExceptionProofFiles(
    driverId: string,
    fileIds: string[] | undefined,
  ) {
    if (!fileIds?.length) {
      return;
    }

    if (!this.filesRepository) {
      throw new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '异常图片不存在');
    }

    for (const fileId of fileIds) {
      const file = await this.filesRepository.findFileByIdAndOwner(
        fileId,
        driverId,
      );

      if (!file) {
        throw new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '异常图片不存在');
      }

      if (file.status !== 'uploaded') {
        throw new BusinessError(
          ApiErrorCode.FILE_STATE_INVALID,
          '异常图片尚未上传完成',
        );
      }

      if (file.purpose !== 'exception') {
        throw new BusinessError(
          ApiErrorCode.FILE_PURPOSE_INVALID,
          '异常图片用途不匹配',
        );
      }
    }
  }

  private async createDriverOrderEventSnapshot(
    currentUser: AuthenticatedUser,
    certification: Awaited<
      ReturnType<DriverCertificationRepository['getCertification']>
    >,
  ): Promise<DriverOrderEventSnapshot> {
    const completedOrderCount = (
      await this.ordersRepository.listDriverCompletedOrders(currentUser.id)
    ).length;
    const vehicleType = certification.vehicle.vehicleType?.trim();
    const vehicleLengthText = certification.vehicle.vehicleLengthText?.trim();
    const plateNumber = certification.vehicle.plateNumber?.trim();

    return {
      driverId: currentUser.id,
      driverName:
        certification.identity.realName?.trim() ||
        `平台司机 ${currentUser.id}`,
      driverPhone:
        certification.driver.phone?.trim() || currentUser.phone,
      ...(vehicleType ? { vehicleType } : {}),
      ...(vehicleLengthText ? { vehicleLengthText } : {}),
      ...(plateNumber ? { plateNumber } : {}),
      completedOrderCount,
    };
  }

  private async buildDriverIncomeContext(driverId: string) {
    const [completedOrders, pendingOrders, withdrawals] = await Promise.all([
      this.ordersRepository.listDriverCompletedOrders(driverId),
      this.ordersRepository.listDriverPendingSettlementOrders(driverId),
      this.driverWithdrawalsRepository.listAllWithdrawals(driverId),
    ]);
    const completedIncomeRecords = completedOrders
      .map(order => createDriverIncomeRecord(order, driverId))
      .sort((left, right) => right.completedAtIso.localeCompare(left.completedAtIso));
    const historyIncomeCents = completedIncomeRecords.reduce(
      (total, record) => total + record.netIncomeCents,
      0,
    );
    const pendingSettlementCents = pendingOrders.reduce(
      (total, order) =>
        total +
        calculateDriverNetIncomeCents(
          getDriverSettlementBaseAmountCents(order, driverId),
        ),
      0,
    );
    const reviewingWithdrawalCents = withdrawals.reduce(
      (total, withdrawal) =>
        withdrawal.status === 'reviewing' ? total + withdrawal.amountCents : total,
      0,
    );
    const consumedWithdrawalCents = withdrawals.reduce(
      (total, withdrawal) =>
        withdrawal.status === 'rejected'
          ? total
          : total + withdrawal.amountCents,
      0,
    );

    return {
      completedIncomeRecords,
      completedOrderCount: completedOrders.length,
      consumedWithdrawalCents,
      historyIncomeCents,
      pendingSettlementCents,
      reviewingWithdrawalCents,
    };
  }
}

function canDriverAdvanceOrderStatus(
  currentStatus: string,
  nextStatus: DriverAdvanceOrderStatusRequest['nextStatus'],
) {
  const allowedNextStatusByCurrentStatus: Record<
    string,
    DriverAdvanceOrderStatusRequest['nextStatus'] | undefined
  > = {
    loading: 'transporting',
    transporting: 'confirming',
  };

  return allowedNextStatusByCurrentStatus[currentStatus] === nextStatus;
}

function hasSubmittedEvaluation(order: ShipperOrderRecord) {
  return order.events.some(event => event.eventType === 'evaluation_submitted');
}

function isDriverExecutingOrderStatus(status: ShipperOrderRecord['status']) {
  return (
    status === 'loading' ||
    status === 'transporting' ||
    status === 'confirming'
  );
}

const DRIVER_NET_INCOME_PERCENTAGE = 95;

function createDriverIncomeRecord(
  order: ShipperOrderRecord,
  driverId: string,
) {
  const grossAmountCents = getDriverSettlementBaseAmountCents(order, driverId);
  const netIncomeCents = calculateDriverNetIncomeCents(grossAmountCents);

  return {
    orderId: order.id,
    orderNo: order.orderNo,
    completedAtIso: getDriverOrderCompletedAtIso(order),
    routeText: `${order.pickupAddress} -> ${order.deliveryAddress}`,
    vehicleType: order.vehicleRequirement,
    grossAmountCents,
    platformFeeCents: grossAmountCents - netIncomeCents,
    netIncomeCents,
  };
}

function getDriverSettlementBaseAmountCents(
  order: ShipperOrderRecord,
  driverId: string,
) {
  if (typeof order.payablePriceCents === 'number' && order.payablePriceCents >= 0) {
    return order.payablePriceCents;
  }

  if (typeof order.priceCents === 'number' && order.priceCents >= 0) {
    return order.priceCents;
  }

  const quoteEvent = [...order.events]
    .reverse()
    .find(
      event =>
        event.actorUserId === driverId &&
        event.eventType === 'driver_quote_submitted',
    );

  if (!quoteEvent?.noteText) {
    return 0;
  }

  try {
    const parsedNote = JSON.parse(quoteEvent.noteText) as {
      quoteCents?: unknown;
    };

    return typeof parsedNote.quoteCents === 'number' &&
      Number.isInteger(parsedNote.quoteCents) &&
      parsedNote.quoteCents > 0
      ? parsedNote.quoteCents
      : 0;
  } catch {
    return 0;
  }
}

function calculateDriverNetIncomeCents(grossAmountCents: number) {
  return Math.round((grossAmountCents * DRIVER_NET_INCOME_PERCENTAGE) / 100);
}

function getDriverOrderCompletedAtIso(order: ShipperOrderRecord) {
  return (
    order.events.find(event => event.eventType === 'completed')?.createdAtIso ??
    order.updatedAtIso
  );
}

function sumDriverIncomeSince(
  records: Array<{ completedAtIso: string; netIncomeCents: number }>,
  startAt: Date,
) {
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
