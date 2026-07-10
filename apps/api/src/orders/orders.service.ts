import { ApiErrorCode, BusinessError } from '../common/errors';
import type { FilePurpose, FileUploadRecord } from '../files/dto';
import {
  LocalFilePreviewUrlSigner,
  type FilePreviewUrlSigner,
} from '../files/file-preview-url.signer';
import type { FilesRepository } from '../files/files.repository';
import type { ProfileCouponsService } from '../profile-coupons/profile-coupons.service';
import type {
  AdvanceShipperOrderStatusRequest,
  AdminOrderAttachmentAudit,
  AdminOrderAttachmentAuditEvent,
  AdminOrderAttachmentFileRecord,
  AdminOrderAttachmentFileGroup,
  AdminOrderAttachmentAuditListQuery,
  AdminOrderAttachmentAuditSummary,
  CancelShipperOrderRequest,
  CreateShipperOrderRequest,
  ListAdminOrderAttachmentAuditsResult,
  ListShipperOrdersQuery,
  ListShipperOrdersResult,
  ReportShipperOrderExceptionRequest,
  SubmitShipperOrderChangeRequest,
  SubmitShipperOrderEvaluationRequest,
  ShipperOrderRecord,
} from './dto';
import type { OrdersRepository } from './orders.repository';

export class OrdersService {
  constructor(
    private readonly repository: OrdersRepository,
    private readonly filesRepository?: FilesRepository,
    private readonly previewUrlSigner: FilePreviewUrlSigner =
      new LocalFilePreviewUrlSigner(),
    private readonly profileCouponsService?: ProfileCouponsService,
  ) {}

  async createOrder(shipperId: string, input: CreateShipperOrderRequest) {
    await this.assertOrderAttachmentFiles(
      shipperId,
      input.cargoPhotoFileIds,
      'cargo',
    );

    await this.lockOrderCoupon(shipperId, input.couponId);

    let order: ShipperOrderRecord;
    try {
      order = await this.repository.createOrder(shipperId, input);
    } catch (error) {
      await this.releaseOrderCoupon(shipperId, input.couponId);
      throw error;
    }

    await this.bindLockedOrderCoupon(shipperId, input.couponId, order.orderNo);

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

  async getOrder(shipperId: string, orderId: string) {
    const order = await this.repository.findOrderById(orderId);

    if (!order || order.shipperId !== shipperId) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    return order;
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
    input: CreateShipperOrderRequest,
  ) {
    const order = await this.repository.findOrderById(orderId);

    if (!order || order.shipperId !== shipperId) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    if (order.status !== 'waiting') {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许修改',
      );
    }

    await this.assertOrderAttachmentFiles(
      shipperId,
      input.cargoPhotoFileIds,
      'cargo',
    );

    const previousCouponId = order.couponId;
    const nextCouponId = input.couponId;
    const shouldChangeCoupon = previousCouponId !== nextCouponId;

    if (shouldChangeCoupon) {
      await this.lockOrderCoupon(shipperId, nextCouponId, order.orderNo);
    }

    let updatedOrder: ShipperOrderRecord;
    try {
      updatedOrder = await this.repository.updateOrder(
        orderId,
        shipperId,
        input,
      );
    } catch (error) {
      if (shouldChangeCoupon) {
        await this.releaseOrderCoupon(shipperId, nextCouponId, order.orderNo);
      }
      throw error;
    }

    if (shouldChangeCoupon) {
      await this.releaseOrderCoupon(shipperId, previousCouponId, order.orderNo);
    }

    return updatedOrder;
  }

  async cancelOrder(
    shipperId: string,
    orderId: string,
    input: CancelShipperOrderRequest,
  ) {
    const order = await this.repository.findOrderById(orderId);

    if (!order || order.shipperId !== shipperId) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    if (order.status === 'completed' || order.status === 'cancelled') {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许取消',
      );
    }

    const cancelledOrder = await this.repository.cancelOrder(
      orderId,
      shipperId,
      input,
    );

    await this.releaseOrderCoupon(shipperId, order.couponId, order.orderNo);

    return cancelledOrder;
  }

  async completeOrder(shipperId: string, orderId: string) {
    const order = await this.repository.findOrderById(orderId);

    if (!order || order.shipperId !== shipperId) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    if (order.status !== 'confirming') {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许确认送达',
      );
    }

    const completedOrder = await this.repository.completeOrder(orderId, shipperId);

    await this.redeemOrderCoupon(shipperId, order.couponId, order.orderNo);

    return completedOrder;
  }

  async advanceOrderStatus(
    shipperId: string,
    orderId: string,
    input: AdvanceShipperOrderStatusRequest,
  ) {
    const order = await this.repository.findOrderById(orderId);

    if (!order || order.shipperId !== shipperId) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    if (!canAdvanceOrderStatus(order.status, input.nextStatus)) {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单状态不允许推进到目标状态',
      );
    }

    return this.repository.advanceOrderStatus(orderId, shipperId, input);
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

    return this.repository.reportOrderException(orderId, shipperId, input);
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

  private async lockOrderCoupon(
    shipperId: string,
    couponId?: string,
    orderNo?: string,
  ) {
    if (!couponId || !this.profileCouponsService) {
      return;
    }

    await this.profileCouponsService.lockCoupon(shipperId, couponId, orderNo);
  }

  private async bindLockedOrderCoupon(
    shipperId: string,
    couponId: string | undefined,
    orderNo: string,
  ) {
    if (!couponId || !this.profileCouponsService) {
      return;
    }

    await this.profileCouponsService.bindLockedCouponToOrder(
      shipperId,
      couponId,
      orderNo,
    );
  }

  private async releaseOrderCoupon(
    shipperId: string,
    couponId?: string,
    orderNo?: string,
  ) {
    if (!couponId || !this.profileCouponsService) {
      return;
    }

    await this.profileCouponsService.releaseCoupon(shipperId, couponId, orderNo);
  }

  private async redeemOrderCoupon(
    shipperId: string,
    couponId: string | undefined,
    orderNo: string,
  ) {
    if (!couponId || !this.profileCouponsService) {
      return;
    }

    await this.profileCouponsService.redeemCoupon(shipperId, couponId, orderNo);
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

function canAdvanceOrderStatus(
  currentStatus: string,
  nextStatus: AdvanceShipperOrderStatusRequest['nextStatus'],
) {
  const allowedNextStatusByCurrentStatus: Record<
    string,
    AdvanceShipperOrderStatusRequest['nextStatus'] | undefined
  > = {
    waiting: 'loading',
    loading: 'transporting',
    transporting: 'confirming',
  };

  return allowedNextStatusByCurrentStatus[currentStatus] === nextStatus;
}
