import { ApiErrorCode, BusinessError } from '../common/errors';
import type { FilePurpose, FileUploadRecord } from '../files/dto';
import {
  LocalFilePreviewUrlSigner,
  type FilePreviewUrlSigner,
} from '../files/file-preview-url.signer';
import type { FilesRepository } from '../files/files.repository';
import type {
  AcceptShipperOrderQuoteRequest,
  AddShipperOrderBonusRequest,
  AdvanceShipperOrderStatusRequest,
  BatchCancelAdminOrdersRequest,
  BatchCancelAdminOrdersResult,
  AdminOrderFilters,
  AdminOrderAttachmentAudit,
  AdminOrderAttachmentAuditEvent,
  AdminOrderAttachmentFileRecord,
  AdminOrderAttachmentFileGroup,
  AdminOrderAttachmentAuditListQuery,
  AdminOrderAttachmentAuditSummary,
  AdminOrderReport,
  AdminOrderReportTopShipperItem,
  AdminOrderReportQuery,
  CancelShipperOrderRequest,
  CompleteShipperOrderRequest,
  CreateShipperOrderRequest,
  ListAdminOrderAttachmentAuditsResult,
  ListShipperOrdersQuery,
  ListShipperOrdersResult,
  ReportShipperOrderExceptionRequest,
  SubmitShipperOrderChangeRequest,
  SubmitShipperOrderEvaluationRequest,
  ShipperOrderRecord,
  UpdateShipperOrderRequest,
} from './dto';
import {
  createAdminOrderBatchCancelFingerprint,
  createOrderCreateFingerprint,
  createOrderMutationFingerprint,
} from './order-mutation-idempotency';
import type {
  ExecuteOrderCreateResult,
  ExecuteOrderMutationResult,
  OrdersRepository,
  ResolveExistingOrderMutationInput,
} from './orders.repository';
import { assertOrderCanCompleteFinancially } from '../payments/payment-domain';
import type { NotificationsService } from '../notifications/notifications.service';
import type { MapsService } from '../maps/maps.service';

const defaultAdminOrderReportQuery: AdminOrderReportQuery = {
  topShippersLimit: 5,
};

export class OrdersService {
  constructor(
    private readonly repository: OrdersRepository,
    private readonly filesRepository?: FilesRepository,
    private readonly previewUrlSigner: FilePreviewUrlSigner =
      new LocalFilePreviewUrlSigner(),
    private readonly now: () => Date = () => new Date(),
    private readonly orderMutationIdempotencyTtlSeconds = 86400,
    private readonly notificationsService?: NotificationsService,
    private readonly mapsService?: MapsService,
  ) {}

  async createOrder(
    shipperId: string,
    idempotencyKey: string,
    input: CreateShipperOrderRequest,
  ) {
    const requestFingerprint = createOrderCreateFingerprint(input);
    const existing = await this.repository.resolveExistingOrderCreate({
      actorUserId: shipperId,
      operation: 'shipper_create',
      idempotencyKey,
      requestFingerprint,
    });

    if (existing) {
      return this.unwrapOrderCreateResult(existing).order;
    }

    await this.assertOrderAttachmentFiles(
      shipperId,
      input.cargoPhotoFileIds,
      'cargo',
    );

    const enrichedInput = await this.enrichOrderCoordinates(input);

    const order = this.unwrapOrderCreateResult(
      await this.repository.executeIdempotentOrderCreate({
        actorUserId: shipperId,
        operation: 'shipper_create',
        idempotencyKey,
        requestFingerprint,
        expiresAtIso: this.createOrderMutationExpiresAtIso(),
        input: enrichedInput,
      }),
    ).order;

    await this.safeNotifyOrderEvent({
      event: 'order_created',
      orderId: order.id,
      orderNo: order.orderNo,
      shipperId: order.shipperId,
      driverId: order.assignedDriverId,
    });

    return order;
  }

  async listOrders(
    shipperId: string,
    query: ListShipperOrdersQuery,
  ): Promise<ListShipperOrdersResult> {
    const result = await this.repository.listOrders(shipperId, query);

    return {
      items: result.items,
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async listAdminOrders(
    query: ListShipperOrdersQuery,
  ): Promise<ListShipperOrdersResult> {
    const result = await this.repository.listAdminOrders(query);

    return {
      items: result.items,
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async getAdminOrderReport(
    query: AdminOrderReportQuery = defaultAdminOrderReportQuery,
  ): Promise<AdminOrderReport> {
    const effectiveQuery = {
      ...defaultAdminOrderReportQuery,
      ...query,
    };
    const orders = await this.listAllAdminOrders(effectiveQuery);

    return {
      generatedAtIso: this.now().toISOString(),
      filters: pickAdminOrderFilters(effectiveQuery),
      summary: summarizeAdminOrders(orders),
      statusBreakdown: summarizeAdminOrderStatuses(orders),
      paymentStatusBreakdown: summarizeAdminOrderPaymentStatuses(orders),
      pricingModeBreakdown: summarizeAdminOrderPricingModes(orders),
      paymentMethodBreakdown: summarizeAdminOrderPaymentMethods(orders),
      topShippers: summarizeAdminOrderTopShippers(orders).slice(
        0,
        effectiveQuery.topShippersLimit,
      ),
    };
  }

  async exportAdminOrdersCsv(query: AdminOrderFilters = {}): Promise<string> {
    const orders = await this.listAllAdminOrders(query);
    const rows = [
      [
        'orderId',
        'orderNo',
        'shipperId',
        'status',
        'paymentStatus',
        'pricingMode',
        'paymentMethod',
        'priceCents',
        'payablePriceCents',
        'createdAtIso',
        'updatedAtIso',
        'pickupAddress',
        'pickupContact',
        'pickupPhone',
        'deliveryAddress',
        'deliveryContact',
        'deliveryPhone',
        'cargoType',
        'vehicleRequirement',
        'cargoPhotoCount',
        'eventCount',
        'latestExceptionCaseNo',
        'latestExceptionCaseStatus',
      ],
      ...orders.map(order => [
        order.id,
        order.orderNo,
        order.shipperId,
        order.status,
        order.paymentStatus,
        order.pricingMode,
        order.paymentMethod,
        order.priceCents === undefined ? '' : String(order.priceCents),
        order.payablePriceCents === undefined
          ? ''
          : String(order.payablePriceCents),
        order.createdAtIso,
        order.updatedAtIso,
        order.pickupAddress,
        order.pickupContact,
        order.pickupPhone,
        order.deliveryAddress,
        order.deliveryContact,
        order.deliveryPhone,
        order.cargoType,
        order.vehicleRequirement,
        String(order.cargoPhotoCount ?? 0),
        String(order.events.length),
        order.latestExceptionCase?.caseNo ?? '',
        order.latestExceptionCase?.status ?? '',
      ]),
    ];

    return `\uFEFF${rows.map(formatCsvRow).join('\r\n')}`;
  }

  async getOrder(shipperId: string, orderId: string) {
    const order = await this.repository.findOrderById(orderId);

    if (!order || order.shipperId !== shipperId) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    return order;
  }

  async getAdminOrder(orderId: string) {
    const order = await this.repository.findOrderById(orderId);

    if (!order) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    return order;
  }

  async cancelAdminOrder(
    adminUserId: string,
    orderId: string,
    idempotencyKey: string,
    input: CancelShipperOrderRequest,
  ): Promise<ShipperOrderRecord> {
    const requestFingerprint = createOrderMutationFingerprint(orderId, input);
    const existingOrder = await this.resolveExistingOrderMutation(
      {
        actorUserId: adminUserId,
        orderId,
        operation: 'shipper_cancel',
        idempotencyKey,
        requestFingerprint,
      },
      '当前订单状态不允许后台取消',
    );

    if (existingOrder) {
      return existingOrder;
    }

    const order = await this.repository.findOrderById(orderId);

    if (!order) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    if (order.status !== 'waiting') {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许后台取消',
      );
    }

    const { baseUpdatedAtIso, ...mutationInput } = input;

    return this.unwrapOrderMutationResult(
      await this.repository.executeIdempotentOrderMutation({
        actorUserId: adminUserId,
        orderId,
        operation: 'shipper_cancel',
        idempotencyKey,
        requestFingerprint,
        baseUpdatedAtIso,
        expiresAtIso: this.createOrderMutationExpiresAtIso(),
        mutation: {
          type: 'shipper_cancel',
          input: mutationInput,
        },
      }),
      '当前订单状态不允许后台取消',
    ).order;
  }

  async batchCancelAdminOrders(
    adminUserId: string,
    idempotencyKey: string,
    input: BatchCancelAdminOrdersRequest,
  ): Promise<BatchCancelAdminOrdersResult> {
    const requestFingerprint = createAdminOrderBatchCancelFingerprint(input);
    const existingResult =
      await this.repository.resolveExistingAdminBatchCancel({
        actorUserId: adminUserId,
        operation: 'admin_batch_cancel',
        idempotencyKey,
        requestFingerprint,
      });

    if (existingResult) {
      return existingResult;
    }

    return this.repository.executeIdempotentAdminBatchCancel({
      actorUserId: adminUserId,
      operation: 'admin_batch_cancel',
      idempotencyKey,
      requestFingerprint,
      expiresAtIso: this.createOrderMutationExpiresAtIso(),
      input,
    });
  }

  async getAdminOrderAttachmentAudit(
    orderId: string,
  ): Promise<AdminOrderAttachmentAudit> {
    const order = await this.repository.findOrderById(orderId);

    if (!order) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      shipperId: order.shipperId,
      cargo: await this.resolveAttachmentFileGroup(
        order.cargoPhotoFileIds ?? [],
      ),
      events: await Promise.all(
        order.events
          .filter(event => event.attachmentFileIds?.length)
          .map(async (event): Promise<AdminOrderAttachmentAuditEvent> => {
            const attachmentGroup = await this.resolveAttachmentFileGroup(
              event.attachmentFileIds ?? [],
            );

            return {
              eventId: event.id,
              eventType: event.eventType,
              noteText: event.noteText,
              createdAtIso: event.createdAtIso,
              attachmentFileIds: attachmentGroup.fileIds,
              files: attachmentGroup.files,
              missingFileIds: attachmentGroup.missingFileIds,
            };
          }),
      ),
    };
  }

  async listAdminOrderAttachmentAudits(
    query: AdminOrderAttachmentAuditListQuery,
  ): Promise<ListAdminOrderAttachmentAuditsResult> {
    const orders =
      await this.repository.listAdminOrdersForAttachmentAudit(query);
    const summaries = await Promise.all(
      orders.map(order => this.createAdminOrderAttachmentAuditSummary(order)),
    );
    const attachedSummaries = summaries.filter(
      summary => summary.totalFileIdCount > 0,
    );
    const missingStateSummaries =
      query.hasMissingFiles === undefined
        ? attachedSummaries
        : attachedSummaries.filter(
            summary => summary.hasMissingFiles === query.hasMissingFiles,
          );
    const statusFilteredSummaries =
      query.status === undefined
        ? missingStateSummaries
        : missingStateSummaries.filter(summary => summary.status === query.status);
    const filteredSummaries =
      query.shipperId === undefined
        ? statusFilteredSummaries
        : statusFilteredSummaries.filter(
            summary => summary.shipperId === query.shipperId,
          );
    const startIndex = (query.page - 1) * query.pageSize;

    return {
      items: filteredSummaries.slice(startIndex, startIndex + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      total: filteredSummaries.length,
    };
  }

  async updateOrder(
    shipperId: string,
    orderId: string,
    idempotencyKey: string,
    input: UpdateShipperOrderRequest,
  ): Promise<ShipperOrderRecord> {
    const requestFingerprint = createOrderMutationFingerprint(orderId, input);
    const existingOrder = await this.resolveExistingOrderMutation(
      {
        actorUserId: shipperId,
        orderId,
        operation: 'shipper_update',
        idempotencyKey,
        requestFingerprint,
      },
      '当前订单状态不允许修改',
    );

    if (existingOrder) {
      return existingOrder;
    }

    const order = await this.repository.findOrderById(orderId);

    if (!order || order.shipperId !== shipperId) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    const { baseUpdatedAtIso, ...mutationInput } = input;

    await this.assertOrderAttachmentFiles(
      shipperId,
      mutationInput.cargoPhotoFileIds,
      'cargo',
    );

    const enrichedMutationInput = await this.enrichOrderCoordinates(mutationInput);

    const mutationResult = await this.repository.executeIdempotentOrderMutation({
        actorUserId: shipperId,
        orderId,
        operation: 'shipper_update',
        idempotencyKey,
        requestFingerprint,
        baseUpdatedAtIso,
        expiresAtIso: this.createOrderMutationExpiresAtIso(),
        mutation: {
          type: 'shipper_update',
          input: enrichedMutationInput,
        },
      });

    return this.unwrapOrderMutationResult(
      mutationResult,
      '当前订单状态不允许修改',
    ).order;
  }

  async cancelOrder(
    shipperId: string,
    orderId: string,
    idempotencyKey: string,
    input: CancelShipperOrderRequest,
  ): Promise<ShipperOrderRecord> {
    const requestFingerprint = createOrderMutationFingerprint(orderId, input);
    const existingOrder = await this.resolveExistingOrderMutation(
      {
        actorUserId: shipperId,
        orderId,
        operation: 'shipper_cancel',
        idempotencyKey,
        requestFingerprint,
      },
      '当前订单状态不允许取消',
    );

    if (existingOrder) {
      return existingOrder;
    }

    const order = await this.repository.findOrderById(orderId);

    if (!order || order.shipperId !== shipperId) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    const { baseUpdatedAtIso, ...mutationInput } = input;
    const cancelledOrder = this.unwrapOrderMutationResult(
      await this.repository.executeIdempotentOrderMutation({
        actorUserId: shipperId,
        orderId,
        operation: 'shipper_cancel',
        idempotencyKey,
        requestFingerprint,
        baseUpdatedAtIso,
        expiresAtIso: this.createOrderMutationExpiresAtIso(),
        mutation: {
          type: 'shipper_cancel',
          input: mutationInput,
        },
      }),
      '当前订单状态不允许取消',
    ).order;

    await this.safeNotifyOrderEvent({
      event: 'cancelled',
      orderId: cancelledOrder.id,
      orderNo: cancelledOrder.orderNo,
      shipperId: cancelledOrder.shipperId,
      driverId: cancelledOrder.assignedDriverId,
      nextStatus: cancelledOrder.status,
    });

    return cancelledOrder;
  }

  async completeOrder(
    shipperId: string,
    orderId: string,
    idempotencyKey: string,
    input: CompleteShipperOrderRequest,
  ): Promise<ShipperOrderRecord> {
    const requestFingerprint = createOrderMutationFingerprint(orderId, input);
    const existingOrder = await this.resolveExistingOrderMutation(
      {
        actorUserId: shipperId,
        orderId,
        operation: 'shipper_complete',
        idempotencyKey,
        requestFingerprint,
      },
      '当前订单状态不允许确认送达',
    );

    if (existingOrder) {
      return existingOrder;
    }

    const order = await this.repository.findOrderById(orderId);

    if (!order || order.shipperId !== shipperId) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    assertOrderCanCompleteFinancially(order);

    const completedOrder = this.unwrapOrderMutationResult(
      await this.repository.executeIdempotentOrderMutation({
        actorUserId: shipperId,
        orderId,
        operation: 'shipper_complete',
        idempotencyKey,
        requestFingerprint,
        baseUpdatedAtIso: input.baseUpdatedAtIso,
        expiresAtIso: this.createOrderMutationExpiresAtIso(),
        mutation: {
          type: 'shipper_complete',
        },
      }),
      '当前订单状态不允许确认送达',
    ).order;

    await this.safeNotifyOrderEvent({
      event: 'completed',
      orderId: completedOrder.id,
      orderNo: completedOrder.orderNo,
      shipperId: completedOrder.shipperId,
      driverId: completedOrder.assignedDriverId,
      nextStatus: completedOrder.status,
    });

    return completedOrder;
  }

  async advanceOrderStatus(
    shipperId: string,
    orderId: string,
    idempotencyKey: string,
    input: AdvanceShipperOrderStatusRequest,
  ): Promise<ShipperOrderRecord> {
    const requestFingerprint = createOrderMutationFingerprint(orderId, input);
    const existingOrder = await this.resolveExistingOrderMutation(
      {
        actorUserId: shipperId,
        orderId,
        operation: 'shipper_status',
        idempotencyKey,
        requestFingerprint,
      },
      '当前订单状态不允许推进到目标状态',
    );

    if (existingOrder) {
      return existingOrder;
    }

    const order = await this.repository.findOrderById(orderId);

    if (!order || order.shipperId !== shipperId) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    const { baseUpdatedAtIso, ...mutationInput } = input;

    const advancedOrder = this.unwrapOrderMutationResult(
      await this.repository.executeIdempotentOrderMutation({
        actorUserId: shipperId,
        orderId,
        operation: 'shipper_status',
        idempotencyKey,
        requestFingerprint,
        baseUpdatedAtIso,
        expiresAtIso: this.createOrderMutationExpiresAtIso(),
        mutation: {
          type: 'shipper_status',
          input: mutationInput,
        },
      }),
      '当前订单状态不允许推进到目标状态',
    ).order;

    await this.safeNotifyOrderEvent({
      event: 'status_advanced',
      orderId: advancedOrder.id,
      orderNo: advancedOrder.orderNo,
      shipperId: advancedOrder.shipperId,
      driverId: advancedOrder.assignedDriverId,
      nextStatus: advancedOrder.status,
    });

    return advancedOrder;
  }

  async acceptOrderQuote(
    shipperId: string,
    orderId: string,
    idempotencyKey: string,
    input: AcceptShipperOrderQuoteRequest,
  ): Promise<ShipperOrderRecord> {
    const requestFingerprint = createOrderMutationFingerprint(orderId, input);
    const existingOrder = await this.resolveExistingOrderMutation(
      {
        actorUserId: shipperId,
        orderId,
        operation: 'shipper_accept_quote',
        idempotencyKey,
        requestFingerprint,
      },
      '当前订单已不可选择司机报价',
    );

    if (existingOrder) {
      return existingOrder;
    }

    const order = await this.repository.findOrderById(orderId);

    if (!order || order.shipperId !== shipperId) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    if (order.status !== 'waiting') {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '只有待接单订单可以选择司机报价',
      );
    }

    if (order.pricingMode !== 'negotiable') {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '只有议价订单可以选择司机报价',
      );
    }

    if (order.assignedDriverId) {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '订单已分配司机，不能再次选择报价',
      );
    }

    const acceptedQuote = this.findLatestDriverQuoteEvent(
      order,
      input.driverId,
    );

    if (!acceptedQuote) {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '未找到该司机的有效报价',
      );
    }

    const acceptedOrder = this.unwrapOrderMutationResult(
      await this.repository.executeIdempotentOrderMutation({
        actorUserId: shipperId,
        orderId,
        operation: 'shipper_accept_quote',
        idempotencyKey,
        requestFingerprint,
        baseUpdatedAtIso: input.baseUpdatedAtIso,
        expiresAtIso: this.createOrderMutationExpiresAtIso(),
        mutation: {
          type: 'shipper_accept_quote',
          input: {
            driverId: input.driverId,
            quoteCents: acceptedQuote.quoteCents,
            arrivalText: acceptedQuote.arrivalText,
            ...(acceptedQuote.noteText
              ? { noteText: acceptedQuote.noteText }
              : {}),
            ...(acceptedQuote.driverSnapshot
              ? { driverSnapshot: acceptedQuote.driverSnapshot }
              : {}),
          },
        },
      }),
      '当前订单已不可选择司机报价',
    ).order;

    await this.safeNotifyOrderEvent({
      event: 'driver_accepted',
      orderId: acceptedOrder.id,
      orderNo: acceptedOrder.orderNo,
      shipperId: acceptedOrder.shipperId,
      driverId: acceptedOrder.assignedDriverId,
      nextStatus: acceptedOrder.status,
    });

    return acceptedOrder;
  }

  async addOrderBonus(
    shipperId: string,
    orderId: string,
    idempotencyKey: string,
    input: AddShipperOrderBonusRequest,
  ): Promise<ShipperOrderRecord> {
    const requestFingerprint = createOrderMutationFingerprint(orderId, input);
    const existingOrder = await this.resolveExistingOrderMutation(
      {
        actorUserId: shipperId,
        orderId,
        operation: 'shipper_add_bonus',
        idempotencyKey,
        requestFingerprint,
      },
      '当前订单已不可追加赏金',
    );

    if (existingOrder) {
      return existingOrder;
    }

    const order = await this.repository.findOrderById(orderId);

    if (!order || order.shipperId !== shipperId) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    if (order.status !== 'waiting') {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '只有待接单订单可以追加曝光赏金',
      );
    }

    const currentBonusCents = order.exposureBonusCents ?? 0;
    if (currentBonusCents + input.bonusCents > 500_000) {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '订单曝光赏金累计不能超过 5000 元',
      );
    }

    return this.unwrapOrderMutationResult(
      await this.repository.executeIdempotentOrderMutation({
        actorUserId: shipperId,
        orderId,
        operation: 'shipper_add_bonus',
        idempotencyKey,
        requestFingerprint,
        baseUpdatedAtIso: input.baseUpdatedAtIso,
        expiresAtIso: this.createOrderMutationExpiresAtIso(),
        mutation: {
          type: 'shipper_add_bonus',
          input: {
            bonusCents: input.bonusCents,
          },
        },
      }),
      '当前订单已不可追加赏金',
    ).order;
  }

  private findLatestDriverQuoteEvent(
    order: ShipperOrderRecord,
    driverId: string,
  ): {
    quoteCents: number;
    arrivalText: string;
    noteText?: string;
    driverSnapshot?: {
      driverId: string;
      driverName: string;
      driverPhone: string;
      vehicleType?: string;
      vehicleLengthText?: string;
      plateNumber?: string;
      completedOrderCount: number;
    };
  } | null {
    const quoteEvent = [...order.events]
      .reverse()
      .find(
        event =>
          event.eventType === 'driver_quote_submitted' &&
          event.actorUserId === driverId,
      );

    if (!quoteEvent?.noteText) {
      return null;
    }

    try {
      const payload = JSON.parse(quoteEvent.noteText) as {
        quoteCents?: unknown;
        arrivalText?: unknown;
        noteText?: unknown;
        driverSnapshot?: {
          driverId?: string;
          driverName?: string;
          driverPhone?: string;
          vehicleType?: string;
          vehicleLengthText?: string;
          plateNumber?: string;
          completedOrderCount?: number;
        };
      };

      if (
        typeof payload.quoteCents !== 'number' ||
        !Number.isInteger(payload.quoteCents) ||
        payload.quoteCents <= 0 ||
        typeof payload.arrivalText !== 'string' ||
        !payload.arrivalText.trim()
      ) {
        return null;
      }

      return {
        quoteCents: payload.quoteCents,
        arrivalText: payload.arrivalText.trim(),
        ...(typeof payload.noteText === 'string' && payload.noteText.trim()
          ? { noteText: payload.noteText.trim() }
          : {}),
        ...(payload.driverSnapshot &&
        typeof payload.driverSnapshot.driverId === 'string' &&
        typeof payload.driverSnapshot.driverName === 'string' &&
        typeof payload.driverSnapshot.driverPhone === 'string' &&
        typeof payload.driverSnapshot.completedOrderCount === 'number'
          ? {
              driverSnapshot: {
                driverId: payload.driverSnapshot.driverId,
                driverName: payload.driverSnapshot.driverName,
                driverPhone: payload.driverSnapshot.driverPhone,
                ...(payload.driverSnapshot.vehicleType
                  ? { vehicleType: payload.driverSnapshot.vehicleType }
                  : {}),
                ...(payload.driverSnapshot.vehicleLengthText
                  ? {
                      vehicleLengthText:
                        payload.driverSnapshot.vehicleLengthText,
                    }
                  : {}),
                ...(payload.driverSnapshot.plateNumber
                  ? { plateNumber: payload.driverSnapshot.plateNumber }
                  : {}),
                completedOrderCount:
                  payload.driverSnapshot.completedOrderCount,
              },
            }
          : {}),
      };
    } catch {
      return null;
    }
  }

  async reportOrderException(
    shipperId: string,
    orderId: string,
    input: ReportShipperOrderExceptionRequest,
  ) {
    const order = await this.repository.findOrderById(orderId);

    if (!order || order.shipperId !== shipperId) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    if (order.status !== 'transporting' && order.status !== 'confirming') {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许上报异常',
      );
    }

    await this.assertOrderAttachmentFiles(
      shipperId,
      input.photoFileIds,
      'exception',
    );

    const updatedOrder = await this.repository.reportOrderException(
      orderId,
      shipperId,
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
        driverId: updatedOrder.assignedDriverId,
      });
    }

    return updatedOrder;
  }

  async submitOrderChangeRequest(
    shipperId: string,
    orderId: string,
    input: SubmitShipperOrderChangeRequest,
  ) {
    const order = await this.repository.findOrderById(orderId);

    if (!order || order.shipperId !== shipperId) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    if (
      order.status !== 'loading' &&
      order.status !== 'transporting' &&
      order.status !== 'confirming'
    ) {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许提交修改申请',
      );
    }

    return this.repository.submitOrderChangeRequest(orderId, shipperId, input);
  }

  async submitOrderEvaluation(
    shipperId: string,
    orderId: string,
    input: SubmitShipperOrderEvaluationRequest,
  ) {
    const order = await this.repository.findOrderById(orderId);

    if (!order || order.shipperId !== shipperId) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    if (order.status !== 'completed') {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许评价',
      );
    }

    await this.assertOrderAttachmentFiles(
      shipperId,
      input.photoFileIds,
      'evaluation',
    );

    return this.repository.submitOrderEvaluation(orderId, shipperId, input);
  }

  private async assertOrderAttachmentFiles(
    shipperId: string,
    fileIds: string[] | undefined,
    expectedPurpose: FilePurpose,
  ) {
    if (!fileIds?.length) {
      return;
    }

    if (!this.filesRepository) {
      throw new BusinessError(
        ApiErrorCode.FILE_NOT_FOUND,
        '订单附件不存在',
      );
    }

    for (const fileId of fileIds) {
      const file = await this.filesRepository.findFileByIdAndOwner(
        fileId,
        shipperId,
      );

      if (!file) {
        throw new BusinessError(
          ApiErrorCode.FILE_NOT_FOUND,
          '订单附件不存在',
        );
      }

      if (file.status !== 'uploaded') {
        throw new BusinessError(
          ApiErrorCode.FILE_STATE_INVALID,
          '订单附件尚未上传完成',
        );
      }

      if (file.purpose !== expectedPurpose) {
        throw new BusinessError(
          ApiErrorCode.FILE_PURPOSE_INVALID,
          '订单附件用途不匹配',
        );
      }
    }
  }

  private async listAllAdminOrders(
    query: AdminOrderFilters = {},
  ): Promise<ShipperOrderRecord[]> {
    const pageSize = 50;
    const items: ShipperOrderRecord[] = [];
    let page = 1;

    while (true) {
      const result = await this.repository.listAdminOrders({
        ...query,
        page,
        pageSize,
      });
      items.push(...result.items);

      if (items.length >= result.total || result.items.length === 0) {
        return items;
      }

      page += 1;
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
      // Inbox/push is best-effort and must not break order mutations.
    }
  }

  private async enrichOrderCoordinates<
    T extends {
      pickupAddress: string;
      deliveryAddress: string;
      pickupLatitude?: number;
      pickupLongitude?: number;
      pickupGeocodeStatus?: 'manual' | 'sandbox' | 'amap';
      deliveryLatitude?: number;
      deliveryLongitude?: number;
      deliveryGeocodeStatus?: 'manual' | 'sandbox' | 'amap';
    },
  >(input: T): Promise<T> {
    if (!this.mapsService) {
      return input;
    }

    const next = { ...input };

    const needsPickup =
      next.pickupLatitude === undefined || next.pickupLongitude === undefined;
    const needsDelivery =
      next.deliveryLatitude === undefined ||
      next.deliveryLongitude === undefined;

    if (!needsPickup && !needsDelivery) {
      return next;
    }

    if (needsPickup) {
      try {
        const geocoded = await this.mapsService.geocode({
          address: next.pickupAddress,
        });
        next.pickupLatitude = geocoded.latitude;
        next.pickupLongitude = geocoded.longitude;
        next.pickupGeocodeStatus =
          geocoded.provider === 'amap' ? 'amap' : 'sandbox';
      } catch {
        // Geocode is best-effort; address text remains authoritative.
      }
    } else if (!next.pickupGeocodeStatus) {
      next.pickupGeocodeStatus = 'manual';
    }

    if (needsDelivery) {
      try {
        const geocoded = await this.mapsService.geocode({
          address: next.deliveryAddress,
        });
        next.deliveryLatitude = geocoded.latitude;
        next.deliveryLongitude = geocoded.longitude;
        next.deliveryGeocodeStatus =
          geocoded.provider === 'amap' ? 'amap' : 'sandbox';
      } catch {
        // Geocode is best-effort; address text remains authoritative.
      }
    } else if (!next.deliveryGeocodeStatus) {
      next.deliveryGeocodeStatus = 'manual';
    }

    return next;
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
    const result = await this.repository.resolveExistingOrderMutation(input);

    return result
      ? this.unwrapOrderMutationResult(result, stateInvalidMessage).order
      : undefined;
  }

  private unwrapOrderCreateResult(result: ExecuteOrderCreateResult) {
    switch (result.kind) {
      case 'success':
        return result;
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
    }
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

  private async resolveAttachmentFileGroup(
    fileIds: string[],
  ): Promise<AdminOrderAttachmentFileGroup> {
    const normalizedFileIds = normalizeAttachmentFileIds(fileIds);

    if (!this.filesRepository) {
      return {
        fileIds: normalizedFileIds,
        files: [],
        missingFileIds: normalizedFileIds,
      };
    }

    const files = await Promise.all(
      normalizedFileIds.map(fileId => this.filesRepository?.findFileById(fileId)),
    );
    const foundFiles = files.filter(
      (file): file is NonNullable<typeof file> => Boolean(file),
    );
    const foundFileIds = new Set(foundFiles.map(file => file.id));

    return {
      fileIds: normalizedFileIds,
      files: foundFiles.map(file =>
        mapAdminOrderAttachmentFile(file, this.previewUrlSigner),
      ),
      missingFileIds: normalizedFileIds.filter(
        fileId => !foundFileIds.has(fileId),
      ),
    };
  }

  private async createAdminOrderAttachmentAuditSummary(
    order: ShipperOrderRecord,
  ): Promise<AdminOrderAttachmentAuditSummary> {
    const cargoFileIds = normalizeAttachmentFileIds(
      order.cargoPhotoFileIds ?? [],
    );
    const eventAttachmentFileIds = normalizeAttachmentFileIds(
      order.events.flatMap(event => event.attachmentFileIds ?? []),
    );
    const allFileIds = normalizeAttachmentFileIds([
      ...cargoFileIds,
      ...eventAttachmentFileIds,
    ]);
    const attachmentGroup = await this.resolveAttachmentFileGroup(allFileIds);

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      shipperId: order.shipperId,
      status: order.status,
      createdAtIso: order.createdAtIso,
      cargoFileCount: cargoFileIds.length,
      eventAttachmentFileCount: eventAttachmentFileIds.length,
      totalFileIdCount: attachmentGroup.fileIds.length,
      resolvedFileCount: attachmentGroup.files.length,
      missingFileIds: attachmentGroup.missingFileIds,
      hasMissingFiles: attachmentGroup.missingFileIds.length > 0,
    };
  }
}

function normalizeAttachmentFileIds(fileIds: string[]) {
  return fileIds.filter(
    (fileId, index, allFileIds) => allFileIds.indexOf(fileId) === index,
  );
}

function mapAdminOrderAttachmentFile(
  file: FileUploadRecord,
  previewUrlSigner: FilePreviewUrlSigner,
): AdminOrderAttachmentFileRecord {
  return {
    ...file,
    ...previewUrlSigner.signPreviewUrl(file),
  };
}

const shipperOrderStatusReportOrder = [
  'waiting',
  'loading',
  'transporting',
  'confirming',
  'completed',
  'cancelled',
] as const;

const orderPaymentStatusReportOrder = [
  'not_required',
  'pending',
  'escrowed',
  'settled',
  'failed',
  'cancelled',
  'refund_pending',
  'refunded',
  'refund_failed',
  'legacy_unverified',
] as const;

const shipperOrderPricingModeReportOrder = ['fixed', 'negotiable'] as const;
const shipperOrderPaymentMethodReportOrder = ['cod', 'online'] as const;

function pickAdminOrderFilters(query: AdminOrderFilters): AdminOrderFilters {
  return {
    status: query.status,
    statuses: query.statuses ? [...query.statuses] : undefined,
    keyword: query.keyword,
    createdFromIso: query.createdFromIso,
    createdToIso: query.createdToIso,
  };
}

function summarizeAdminOrders(orders: ShipperOrderRecord[]) {
  return {
    totalOrderCount: orders.length,
    waitingOrderCount: orders.filter(order => order.status === 'waiting').length,
    activeOrderCount: orders.filter(order => isActiveOrderStatus(order.status))
      .length,
    completedOrderCount: orders.filter(order => order.status === 'completed')
      .length,
    cancelledOrderCount: orders.filter(order => order.status === 'cancelled')
      .length,
    exceptionOrderCount: orders.filter(order => order.latestExceptionCase).length,
  };
}

function summarizeAdminOrderStatuses(orders: ShipperOrderRecord[]) {
  return shipperOrderStatusReportOrder
    .map(status => {
      const matchedOrders = orders.filter(order => order.status === status);

      return {
        status,
        orderCount: matchedOrders.length,
        payablePriceTotalCents: matchedOrders.reduce(
          (sum, order) => sum + getOrderPayablePriceCents(order),
          0,
        ),
      };
    })
    .filter(item => item.orderCount > 0);
}

function summarizeAdminOrderPaymentStatuses(orders: ShipperOrderRecord[]) {
  return orderPaymentStatusReportOrder
    .map(paymentStatus => {
      const matchedOrders = orders.filter(
        order => order.paymentStatus === paymentStatus,
      );

      return {
        paymentStatus,
        orderCount: matchedOrders.length,
        payablePriceTotalCents: matchedOrders.reduce(
          (sum, order) => sum + getOrderPayablePriceCents(order),
          0,
        ),
      };
    })
    .filter(item => item.orderCount > 0);
}

function summarizeAdminOrderPricingModes(orders: ShipperOrderRecord[]) {
  return shipperOrderPricingModeReportOrder
    .map(pricingMode => {
      const matchedOrders = orders.filter(
        order => order.pricingMode === pricingMode,
      );

      return {
        pricingMode,
        orderCount: matchedOrders.length,
        payablePriceTotalCents: matchedOrders.reduce(
          (sum, order) => sum + getOrderPayablePriceCents(order),
          0,
        ),
      };
    })
    .filter(item => item.orderCount > 0);
}

function summarizeAdminOrderPaymentMethods(orders: ShipperOrderRecord[]) {
  return shipperOrderPaymentMethodReportOrder
    .map(paymentMethod => {
      const matchedOrders = orders.filter(
        order => order.paymentMethod === paymentMethod,
      );

      return {
        paymentMethod,
        orderCount: matchedOrders.length,
        payablePriceTotalCents: matchedOrders.reduce(
          (sum, order) => sum + getOrderPayablePriceCents(order),
          0,
        ),
      };
    })
    .filter(item => item.orderCount > 0);
}

function summarizeAdminOrderTopShippers(
  orders: ShipperOrderRecord[],
): AdminOrderReportTopShipperItem[] {
  const summaryByShipperId = new Map<string, AdminOrderReportTopShipperItem>();

  for (const order of orders) {
    const summary = summaryByShipperId.get(order.shipperId) ?? {
      shipperId: order.shipperId,
      orderCount: 0,
      waitingOrderCount: 0,
      activeOrderCount: 0,
      completedOrderCount: 0,
      cancelledOrderCount: 0,
      payablePriceTotalCents: 0,
      latestOrderCreatedAtIso: undefined,
    };

    summary.orderCount += 1;
    summary.payablePriceTotalCents += getOrderPayablePriceCents(order);
    summary.latestOrderCreatedAtIso =
      !summary.latestOrderCreatedAtIso ||
      summary.latestOrderCreatedAtIso < order.createdAtIso
        ? order.createdAtIso
        : summary.latestOrderCreatedAtIso;

    if (order.status === 'waiting') {
      summary.waitingOrderCount += 1;
    } else if (isActiveOrderStatus(order.status)) {
      summary.activeOrderCount += 1;
    } else if (order.status === 'completed') {
      summary.completedOrderCount += 1;
    } else if (order.status === 'cancelled') {
      summary.cancelledOrderCount += 1;
    }

    summaryByShipperId.set(order.shipperId, summary);
  }

  return [...summaryByShipperId.values()].sort(compareAdminOrderTopShippers);
}

function compareAdminOrderTopShippers(
  left: AdminOrderReportTopShipperItem,
  right: AdminOrderReportTopShipperItem,
) {
  return (
    right.orderCount - left.orderCount ||
    right.activeOrderCount - left.activeOrderCount ||
    right.completedOrderCount - left.completedOrderCount ||
    right.payablePriceTotalCents - left.payablePriceTotalCents ||
    (right.latestOrderCreatedAtIso ?? '').localeCompare(
      left.latestOrderCreatedAtIso ?? '',
    ) ||
    left.shipperId.localeCompare(right.shipperId)
  );
}

function isActiveOrderStatus(status: ShipperOrderRecord['status']) {
  return (
    status === 'loading' ||
    status === 'transporting' ||
    status === 'confirming'
  );
}

function getOrderPayablePriceCents(order: ShipperOrderRecord) {
  return order.payablePriceCents ?? order.priceCents ?? 0;
}

function formatCsvRow(values: Array<string>) {
  return values
    .map(value => {
      const normalized = String(value ?? '');

      return /[",\r\n]/.test(normalized)
        ? `"${normalized.replace(/"/g, '""')}"`
        : normalized;
    })
    .join(',');
}
