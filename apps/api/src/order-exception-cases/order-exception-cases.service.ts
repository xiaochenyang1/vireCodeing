import { ApiErrorCode, BusinessError } from '../common/errors';
import type { OrdersRepository } from '../orders/orders.repository';
import { createAdminActionFingerprint } from '../payments/admin-finance.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type {
  AppealOrderExceptionCaseRequest,
  ExecuteOrderExceptionCaseCompensationRequest,
  OrderExceptionCaseListQuery,
  OrderExceptionCaseSourceRole,
  OrderExceptionCaseStatus,
  ResolveOrderExceptionCaseRequest,
  UpdateOrderExceptionCaseRequest,
} from './dto';

export class OrderExceptionCasesService {
  constructor(
    private readonly repository: OrdersRepository,
    private readonly notificationsService?: NotificationsService,
  ) {}

  async listForShipper(shipperId: string, orderId: string) {
    const order = await this.repository.findOrderById(orderId);

    if (!order || order.shipperId !== shipperId) {
      throw notFoundError();
    }

    return this.repository.listOrderExceptionCases(orderId);
  }

  async listForDriver(driverId: string, orderId: string) {
    const order = await this.repository.findDriverAcceptedOrder(
      driverId,
      orderId,
    );

    if (!order) {
      throw notFoundError();
    }

    return this.repository.listOrderExceptionCases(orderId);
  }

  async listForAdmin(query: OrderExceptionCaseListQuery) {
    const result = await this.repository.listAdminOrderExceptionCases(query);

    return {
      ...result,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getForAdmin(caseId: string) {
    const exceptionCase = await this.repository.findOrderExceptionCaseById(caseId);

    if (!exceptionCase) {
      throw notFoundError();
    }

    return exceptionCase;
  }

  async processCase(
    adminUserId: string,
    caseId: string,
    input: UpdateOrderExceptionCaseRequest,
  ) {
    return this.transition(
      adminUserId,
      caseId,
      'pending',
      'processing',
      input,
    );
  }

  async resolveCase(
    adminUserId: string,
    caseId: string,
    input: ResolveOrderExceptionCaseRequest,
  ) {
    return this.transition(
      adminUserId,
      caseId,
      'processing',
      'resolved',
      input,
    );
  }

  async closeCase(
    adminUserId: string,
    caseId: string,
    input: UpdateOrderExceptionCaseRequest,
  ) {
    return this.transition(
      adminUserId,
      caseId,
      'resolved',
      'closed',
      input,
    );
  }

  async executeCompensation(
    adminUserId: string,
    caseId: string,
    requestId: string,
    input: ExecuteOrderExceptionCaseCompensationRequest,
  ) {
    const result = await this.repository.executeExceptionCaseCompensation({
      caseId,
      adminUserId,
      baseUpdatedAtIso: input.baseUpdatedAtIso,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: createAdminActionFingerprint(
        'exception_compensation.execute',
        { caseId, content: input.content },
      ),
      requestId,
      content: input.content,
    });

    switch (result.kind) {
      case 'success': {
        const order = await this.repository.findOrderById(
          result.exceptionCase.orderId,
        );
        await this.safeNotifyExceptionEvent({
          event: 'exception_compensation_executed',
          caseId: result.exceptionCase.id,
          caseNo: result.exceptionCase.caseNo,
          orderId: result.exceptionCase.orderId,
          orderNo: result.exceptionCase.orderNo,
          shipperId: order?.shipperId ?? '',
          driverId: order?.assignedDriverId,
          compensationTargetRole: result.exceptionCase.compensationTargetRole,
        });
        return result.exceptionCase;
      }
      case 'not-found':
        throw notFoundError();
      case 'key-reused':
        throw new BusinessError(
          ApiErrorCode.IDEMPOTENCY_KEY_REUSED,
          'Idempotency-Key 已被其他赔付执行请求使用',
        );
      case 'conflict':
        throw new BusinessError(
          ApiErrorCode.EXCEPTION_CASE_CONFLICT,
          '异常工单已被其他管理员更新，请刷新后重试',
        );
      case 'already-executed':
        throw new BusinessError(
          ApiErrorCode.EXCEPTION_CASE_COMPENSATION_ALREADY_EXECUTED,
          '该异常工单赔付已执行，不能重复赔付',
        );
      case 'not-executable':
        throw new BusinessError(
          ApiErrorCode.EXCEPTION_CASE_COMPENSATION_NOT_EXECUTABLE,
          '当前异常工单状态不允许执行赔付',
        );
      case 'target-missing':
        throw new BusinessError(
          ApiErrorCode.EXCEPTION_CASE_COMPENSATION_NOT_EXECUTABLE,
          '赔付对象缺失，无法执行赔付',
        );
    }
  }

  async appealForShipper(
    shipperId: string,
    orderId: string,
    caseId: string,
    input: AppealOrderExceptionCaseRequest,
  ) {
    return this.appeal(shipperId, 'shipper', orderId, caseId, input);
  }

  async appealForDriver(
    driverId: string,
    orderId: string,
    caseId: string,
    input: AppealOrderExceptionCaseRequest,
  ) {
    return this.appeal(driverId, 'driver', orderId, caseId, input);
  }

  private async appeal(
    actorUserId: string,
    actorRole: OrderExceptionCaseSourceRole,
    orderId: string,
    caseId: string,
    input: AppealOrderExceptionCaseRequest,
  ) {
    const result = await this.repository.appealExceptionCase({
      caseId,
      orderId,
      actorUserId,
      actorRole,
      baseUpdatedAtIso: input.baseUpdatedAtIso,
      reason: input.reason,
    });

    switch (result.kind) {
      case 'success': {
        const order = await this.repository.findOrderById(
          result.exceptionCase.orderId,
        );
        await this.safeNotifyExceptionEvent({
          event: 'exception_appeal_requested',
          caseId: result.exceptionCase.id,
          caseNo: result.exceptionCase.caseNo,
          orderId: result.exceptionCase.orderId,
          orderNo: result.exceptionCase.orderNo,
          shipperId: order?.shipperId ?? '',
          driverId: order?.assignedDriverId,
          actorRole,
        });
        return result.exceptionCase;
      }
      case 'not-found':
        throw notFoundError();
      case 'conflict':
        throw new BusinessError(
          ApiErrorCode.EXCEPTION_CASE_CONFLICT,
          '异常工单已被其他人更新，请刷新后重试',
        );
      case 'not-allowed':
        throw new BusinessError(
          ApiErrorCode.EXCEPTION_CASE_APPEAL_NOT_ALLOWED,
          '当前异常工单状态不允许申诉',
        );
    }
  }

  private async transition(
    adminUserId: string,
    caseId: string,
    expectedStatus: OrderExceptionCaseStatus,
    nextStatus: OrderExceptionCaseStatus,
    input: UpdateOrderExceptionCaseRequest | ResolveOrderExceptionCaseRequest,
  ) {
    const result = await this.repository.transitionOrderExceptionCase(
      caseId,
      adminUserId,
      expectedStatus,
      nextStatus,
      input,
    );

    if (!result) {
      throw notFoundError();
    }

    if (result === 'state-invalid') {
      throw new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前异常工单状态不允许执行该操作',
      );
    }

    if (result === 'conflict') {
      throw new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_CONFLICT,
        '异常工单已被其他管理员更新，请刷新后重试',
      );
    }

    if (nextStatus === 'resolved') {
      const order = await this.repository.findOrderById(result.orderId);
      await this.safeNotifyExceptionEvent({
        event: 'exception_case_resolved',
        caseId: result.id,
        caseNo: result.caseNo,
        orderId: result.orderId,
        orderNo: result.orderNo,
        shipperId: order?.shipperId ?? '',
        driverId: order?.assignedDriverId,
      });
    }

    return result;
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
      // Inbox/push is best-effort and must not break exception workflows.
    }
  }
}

function notFoundError() {
  return new BusinessError(
    ApiErrorCode.EXCEPTION_CASE_NOT_FOUND,
    '异常工单不存在',
  );
}
