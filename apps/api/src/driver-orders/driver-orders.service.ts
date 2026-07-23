import type { AuthenticatedUser } from '../auth/dto';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type { DriverCertificationRepository } from '../driver-certification/driver-certification.repository';
import type { FilesRepository } from '../files/files.repository';
import type { MapsService } from '../maps/maps.service';
import type { ShipperOrderRecord } from '../orders/dto';
import { assertOrderCanEnterDriverHall } from '../payments/payment-domain';
import {
  createDriverWithdrawalFingerprint,
  type DriverFinanceRepository,
} from '../payments/driver-finance.repository';
import { createOrderMutationFingerprint } from '../orders/order-mutation-idempotency';
import type {
  ExecuteOrderMutationResult,
  OrdersRepository,
  ResolveExistingOrderMutationInput,
} from '../orders/orders.repository';
import type { NotificationsService } from '../notifications/notifications.service';
import type { DriverAcceptanceSettingsRepository } from './driver-acceptance-settings.repository';
import type { DriverBankCardsRepository } from './driver-bank-cards.repository';
import type { DriverWithdrawalsRepository } from './driver-withdrawals.repository';
import type {
  CreateDriverBankCardRequest,
  CreateDriverWithdrawalRequest,
  DriverAcceptOrderEventPayload,
  DriverAcceptOrderRequest,
  DriverAdvanceOrderStatusRequest,
  DriverBankCardListResult,
  DriverBankCardRecord,
  DriverEvaluateShipperRequest,
  DriverIncomeOverview,
  DriverMyOrdersQuery,
  DriverMyOrdersResult,
  DriverOrderEventSnapshot,
  DriverOrderHallQuery,
  DriverOrderHallResult,
  DriverQuoteOrderEventPayload,
  DriverQuoteOrderRequest,
  DriverReplyEvaluationRequest,
  DriverReportExceptionRequest,
  DriverWithdrawalListResult,
  DriverWithdrawalsQuery,
  SaveDriverAcceptanceSettingsRequest,
  UpdateDriverBankCardRequest,
} from './dto';

export class DriverOrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly certificationRepository: DriverCertificationRepository,
    private readonly acceptanceSettingsRepository: DriverAcceptanceSettingsRepository,
    private readonly driverBankCardsRepository: DriverBankCardsRepository,
    private readonly driverWithdrawalsRepository: DriverWithdrawalsRepository,
    private readonly filesRepository?: FilesRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly orderMutationIdempotencyTtlSeconds = 86400,
    private readonly driverFinanceRepository?: DriverFinanceRepository,
    private readonly notificationsService?: NotificationsService,
    private readonly mapsService?: Pick<MapsService, 'getDriverLocation'>,
  ) {}

  async listOrderHall(
    currentUser: AuthenticatedUser,
    query: DriverOrderHallQuery,
  ): Promise<DriverOrderHallResult> {
    this.assertDriver(currentUser);
    const acceptanceSettings = await this.acceptanceSettingsRepository.getAcceptanceSettings(
      currentUser.id,
    );
    const driverLocation = this.mapsService
      ? await this.mapsService.getDriverLocation(currentUser.id)
      : null;
    const result = await this.ordersRepository.listDriverOrderHall({
      ...query,
      maxDistanceKm: acceptanceSettings.maxDistanceKm,
      vehicleTypePreferences: acceptanceSettings.vehicleTypePreferences,
      ...(driverLocation
        ? {
            driverLatitude: driverLocation.latitude,
            driverLongitude: driverLocation.longitude,
          }
        : {}),
    });

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

    if (!this.driverFinanceRepository) {
      throw new BusinessError(
        ApiErrorCode.DRIVER_WITHDRAWAL_CONFLICT,
        '司机财务仓储未配置',
      );
    }

    return this.driverFinanceRepository.getIncomeOverview(
      currentUser.id,
      this.now(),
    );
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
    idempotencyKey: string,
    input: CreateDriverWithdrawalRequest,
  ) {
    this.assertDriver(currentUser);

    if (!this.driverFinanceRepository) {
      throw new BusinessError(
        ApiErrorCode.DRIVER_WITHDRAWAL_CONFLICT,
        '司机财务仓储未配置',
      );
    }

    const result =
      await this.driverFinanceRepository.executeIdempotentWithdrawalRequest({
        driverId: currentUser.id,
        idempotencyKey,
        requestFingerprint: createDriverWithdrawalFingerprint(input),
        ...input,
      });

    switch (result.kind) {
      case 'success':
        return { ...result.withdrawal, replayed: result.replayed };
      case 'key-reused':
        throw new BusinessError(
          ApiErrorCode.IDEMPOTENCY_KEY_REUSED,
          'Idempotency-Key 已被其他提现请求使用',
        );
      case 'balance-insufficient':
        throw new BusinessError(
          ApiErrorCode.DRIVER_WITHDRAWAL_BALANCE_INSUFFICIENT,
          '可提现余额不足',
        );
    }
  }

  async listBankCards(
    currentUser: AuthenticatedUser,
  ): Promise<DriverBankCardListResult> {
    this.assertDriver(currentUser);

    return this.driverBankCardsRepository.listBankCards(currentUser.id);
  }

  async createBankCard(
    currentUser: AuthenticatedUser,
    input: CreateDriverBankCardRequest,
  ): Promise<DriverBankCardRecord> {
    this.assertDriver(currentUser);

    return this.driverBankCardsRepository.createBankCard(
      currentUser.id,
      input,
    );
  }

  async updateBankCard(
    currentUser: AuthenticatedUser,
    cardId: string,
    input: UpdateDriverBankCardRequest,
  ): Promise<DriverBankCardRecord> {
    this.assertDriver(currentUser);

    return this.driverBankCardsRepository.updateBankCard(
      currentUser.id,
      cardId,
      input,
    );
  }

  async deleteBankCard(
    currentUser: AuthenticatedUser,
    cardId: string,
  ): Promise<void> {
    this.assertDriver(currentUser);

    await this.driverBankCardsRepository.deleteBankCard(currentUser.id, cardId);
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
    idempotencyKey: string,
    input: DriverAcceptOrderRequest,
  ): Promise<ShipperOrderRecord> {
    this.assertDriver(currentUser);
    const { baseUpdatedAtIso, noteText } = input;
    const requestFingerprint = createOrderMutationFingerprint(orderId, {
      noteText,
      baseUpdatedAtIso,
    });
    const existingOrder = await this.resolveExistingOrderMutation(
      {
        actorUserId: currentUser.id,
        orderId,
        operation: 'driver_accept',
        idempotencyKey,
        requestFingerprint,
      },
      '当前订单已不可接单',
    );

    if (existingOrder) {
      return existingOrder;
    }

    const order = await this.ordersRepository.findOrderById(orderId);

    if (!order) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    const eventPayload: DriverAcceptOrderEventPayload = {
      ...(noteText ? { noteText } : {}),
    };

    if (order.status === 'waiting') {
      await this.assertDriverOnline(currentUser.id);
      const certification = await this.assertDriverCertified(currentUser.id);
      eventPayload.driverSnapshot = await this.createDriverOrderEventSnapshot(
        currentUser,
        certification,
      );
    }

    const acceptedOrder = this.unwrapOrderMutationResult(
      await this.ordersRepository.executeIdempotentOrderMutation({
        actorUserId: currentUser.id,
        orderId,
        operation: 'driver_accept',
        idempotencyKey,
        requestFingerprint,
        baseUpdatedAtIso,
        expiresAtIso: this.createOrderMutationExpiresAtIso(),
        mutation: {
          type: 'driver_accept',
          input: eventPayload,
        },
      }),
      '当前订单已不可接单',
    ).order;

    await this.safeNotifyOrderEvent({
      event: 'driver_accepted',
      orderId: acceptedOrder.id,
      orderNo: acceptedOrder.orderNo,
      shipperId: acceptedOrder.shipperId,
      driverId: acceptedOrder.assignedDriverId ?? currentUser.id,
      nextStatus: acceptedOrder.status,
    });

    return acceptedOrder;
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
    idempotencyKey: string,
    input: DriverAdvanceOrderStatusRequest,
  ): Promise<ShipperOrderRecord> {
    this.assertDriver(currentUser);
    const requestFingerprint = createOrderMutationFingerprint(orderId, input);
    const existingOrder = await this.resolveExistingOrderMutation(
      {
        actorUserId: currentUser.id,
        orderId,
        operation: 'driver_status',
        idempotencyKey,
        requestFingerprint,
      },
      '当前司机订单状态不允许推进到目标状态',
    );

    if (existingOrder) {
      return existingOrder;
    }

    const order = await this.ordersRepository.findDriverAcceptedOrder(
      currentUser.id,
      orderId,
    );

    if (!order) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    await this.assertReceiptProofFiles(currentUser.id, input.receiptPhotoFileIds);

    const { baseUpdatedAtIso, ...mutationInput } = input;

    const advancedOrder = this.unwrapOrderMutationResult(
      await this.ordersRepository.executeIdempotentOrderMutation({
        actorUserId: currentUser.id,
        orderId,
        operation: 'driver_status',
        idempotencyKey,
        requestFingerprint,
        baseUpdatedAtIso,
        expiresAtIso: this.createOrderMutationExpiresAtIso(),
        mutation: {
          type: 'driver_status',
          input: mutationInput,
        },
      }),
      '当前司机订单状态不允许推进到目标状态',
    ).order;

    await this.safeNotifyOrderEvent({
      event: 'status_advanced',
      orderId: advancedOrder.id,
      orderNo: advancedOrder.orderNo,
      shipperId: advancedOrder.shipperId,
      driverId: advancedOrder.assignedDriverId ?? currentUser.id,
      nextStatus: advancedOrder.status,
    });

    return advancedOrder;
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

    const updatedOrder = await this.ordersRepository.reportDriverOrderException(
      order.id,
      currentUser.id,
      input,
    );

    if (updatedOrder.latestExceptionCase) {
      await this.safeNotifyExceptionEvent({
        event: 'exception_case_created',
        caseId: updatedOrder.latestExceptionCase.id,
        caseNo: updatedOrder.latestExceptionCase.caseNo,
        orderId: updatedOrder.id,
        orderNo: updatedOrder.orderNo,
        shipperId: updatedOrder.shipperId,
        driverId: updatedOrder.assignedDriverId ?? currentUser.id,
      });
    }

    return updatedOrder;
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

    assertOrderCanEnterDriverHall(order);

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

  private createOrderMutationExpiresAtIso() {
    return new Date(
      this.now().getTime() + this.orderMutationIdempotencyTtlSeconds * 1000,
    ).toISOString();
  }

  private async safeNotifyOrderEvent(input: {
    event:
      | 'order_created'
      | 'driver_accepted'
      | 'status_advanced'
      | 'completed'
      | 'cancelled';
    orderId: string;
    orderNo: string;
    shipperId: string;
    driverId?: string | null;
    nextStatus?: string;
  }) {
    if (!this.notificationsService) {
      return;
    }

    try {
      await this.notificationsService.notifyOrderEvent(input);
    } catch {
      // Inbox/push is best-effort and must not break driver order mutations.
    }
  }

  private async safeNotifyExceptionEvent(input: {
    event:
      | 'exception_case_created'
      | 'exception_case_resolved'
      | 'exception_compensation_executed'
      | 'exception_appeal_requested';
    caseId: string;
    caseNo?: string;
    orderId: string;
    orderNo: string;
    shipperId: string;
    driverId?: string | null;
    compensationTargetRole?: 'shipper' | 'driver' | null;
    actorRole?: 'shipper' | 'driver';
  }) {
    if (!this.notificationsService) {
      return;
    }

    try {
      await this.notificationsService.notifyExceptionEvent(input);
    } catch {
      // Inbox/push is best-effort and must not break exception reporting.
    }
  }

  private async resolveExistingOrderMutation(
    input: ResolveExistingOrderMutationInput,
    stateInvalidMessage: string,
  ) {
    const result =
      await this.ordersRepository.resolveExistingOrderMutation(input);

    return result
      ? this.unwrapOrderMutationResult(result, stateInvalidMessage).order
      : undefined;
  }

  private unwrapOrderMutationResult(
    result: ExecuteOrderMutationResult,
    stateInvalidMessage: string,
  ) {
    switch (result.kind) {
      case 'success':
        return result;
      case 'conflict':
        throw new BusinessError(
          ApiErrorCode.ORDER_CONFLICT,
          '订单已被其他操作更新',
        );
      case 'key-reused':
        throw new BusinessError(
          ApiErrorCode.IDEMPOTENCY_KEY_REUSED,
          'Idempotency-Key 已被其他请求复用',
        );
      case 'key-expired':
        throw new BusinessError(
          ApiErrorCode.IDEMPOTENCY_KEY_EXPIRED,
          'Idempotency-Key 已过期',
        );
      case 'state-invalid':
        throw new BusinessError(
          ApiErrorCode.ORDER_STATE_INVALID,
          stateInvalidMessage,
        );
      case 'not-found':
        throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
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
