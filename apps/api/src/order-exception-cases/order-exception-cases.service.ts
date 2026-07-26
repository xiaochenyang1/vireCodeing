import { ApiErrorCode, BusinessError } from '../common/errors';
import type { OrdersRepository } from '../orders/orders.repository';
import { createAdminActionFingerprint } from '../payments/admin-finance.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type {
  AppealOrderExceptionCaseRequest,
  AssignOrderExceptionCaseRequest,
  ClaimOrderExceptionCaseRequest,
  OrderExceptionCaseRecord,
  ExecuteOrderExceptionCaseCompensationRequest,
  OrderExceptionCaseListQuery,
  OrderExceptionCaseSourceRole,
  OrderExceptionCaseStatus,
  ResolveOrderExceptionCaseRequest,
  UpdateOrderExceptionCaseRequest,
} from './dto';
import {
  createOrderExceptionCaseAssignContent,
  createOrderExceptionCaseClaimContent,
  createOrderExceptionCaseUnclaimContent,
  mapOrderExceptionCaseListWithSla,
  mapOrderExceptionCaseWithSla,
} from './order-exception-case-helpers';

const EXCEPTION_CASE_SLA_MATCH_PAGE_SIZE = 200;

export class OrderExceptionCasesService {
  constructor(
    private readonly repository: OrdersRepository,
    private readonly notificationsService?: NotificationsService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listForShipper(shipperId: string, orderId: string) {
    const order = await this.repository.findOrderById(orderId);

    if (!order || order.shipperId !== shipperId) {
      throw notFoundError();
    }

    const result = await this.repository.listOrderExceptionCases(orderId);

    return mapOrderExceptionCaseListWithSla(result, this.now());
  }

  async listForDriver(driverId: string, orderId: string) {
    const order = await this.repository.findDriverAcceptedOrder(
      driverId,
      orderId,
    );

    if (!order) {
      throw notFoundError();
    }

    const result = await this.repository.listOrderExceptionCases(orderId);

    return mapOrderExceptionCaseListWithSla(result, this.now());
  }

  async listForAdmin(query: OrderExceptionCaseListQuery) {
    const currentTime = this.now();

    if (query.slaStatus || query.claimStatus || query.claimedByAdminUserId) {
      const filteredItems = (
        await this.listAllAdminExceptionCasesMatching(query)
      )
        .map(exceptionCase =>
          mapOrderExceptionCaseWithSla(exceptionCase, currentTime),
        )
        .filter(exceptionCase =>
          matchesOrderExceptionCaseClaimFilters(exceptionCase, query),
        )
        .filter(
          exceptionCase =>
            query.slaStatus === undefined ||
            exceptionCase.sla?.status === query.slaStatus,
        );

      return createAdminOrderExceptionCasePage(
        filteredItems,
        query.page,
        query.pageSize,
      );
    }

    const result = await this.repository.listAdminOrderExceptionCases(
      toAdminOrderExceptionCaseMatchQuery(query),
    );

    return {
      ...result,
      items: result.items.map(exceptionCase =>
        mapOrderExceptionCaseWithSla(exceptionCase, currentTime),
      ),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getForAdmin(caseId: string) {
    const exceptionCase = await this.repository.findOrderExceptionCaseById(caseId);

    if (!exceptionCase) {
      throw notFoundError();
    }

    return mapOrderExceptionCaseWithSla(exceptionCase, this.now());
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

  async claimCase(
    adminUserId: string,
    caseId: string,
    input: ClaimOrderExceptionCaseRequest,
  ) {
    const exceptionCase = await this.repository.findOrderExceptionCaseById(caseId);

    if (!exceptionCase) {
      throw notFoundError();
    }

    if (
      exceptionCase.status !== 'pending' &&
      exceptionCase.status !== 'processing'
    ) {
      throw new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前异常工单状态不允许执行该操作',
      );
    }

    const result = await this.repository.appendOrderExceptionCaseAction(
      caseId,
      adminUserId,
      exceptionCase.status,
      {
        baseUpdatedAtIso: input.baseUpdatedAtIso,
        content: createOrderExceptionCaseClaimContent(input.content),
      },
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

    return mapOrderExceptionCaseWithSla(result, this.now());
  }

  async assignCase(
    adminUserId: string,
    caseId: string,
    input: AssignOrderExceptionCaseRequest,
  ) {
    const exceptionCase = await this.repository.findOrderExceptionCaseById(caseId);

    if (!exceptionCase) {
      throw notFoundError();
    }

    if (
      exceptionCase.status !== 'pending' &&
      exceptionCase.status !== 'processing'
    ) {
      throw new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前异常工单状态不允许执行该操作',
      );
    }

    const currentSnapshot = mapOrderExceptionCaseWithSla(
      exceptionCase,
      this.now(),
    );

    if (currentSnapshot.claimedByAdminUserId === input.targetAdminUserId) {
      throw new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前异常工单已在目标客服名下，无需重复指派',
      );
    }

    const assignmentMode = currentSnapshot.claimedByAdminUserId
      ? 'transfer'
      : 'assign';

    if (
      assignmentMode === 'transfer' &&
      currentSnapshot.claimedByAdminUserId !== adminUserId
    ) {
      throw new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前管理员不是该异常工单的认领人，不能转派给其他客服',
      );
    }

    const result = await this.repository.appendOrderExceptionCaseAction(
      caseId,
      adminUserId,
      exceptionCase.status,
      {
        baseUpdatedAtIso: input.baseUpdatedAtIso,
        content: createOrderExceptionCaseAssignContent(
          input.targetAdminUserId,
          assignmentMode,
          input.content,
        ),
      },
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

    return mapOrderExceptionCaseWithSla(result, this.now());
  }

  async unclaimCase(
    adminUserId: string,
    caseId: string,
    input: ClaimOrderExceptionCaseRequest,
  ) {
    const exceptionCase = await this.repository.findOrderExceptionCaseById(caseId);

    if (!exceptionCase) {
      throw notFoundError();
    }

    if (
      exceptionCase.status !== 'pending' &&
      exceptionCase.status !== 'processing'
    ) {
      throw new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前异常工单状态不允许执行该操作',
      );
    }

    const currentSnapshot = mapOrderExceptionCaseWithSla(
      exceptionCase,
      this.now(),
    );

    if (!currentSnapshot.claimedByAdminUserId) {
      throw new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前异常工单尚未被认领，无需释放认领',
      );
    }

    if (currentSnapshot.claimedByAdminUserId !== adminUserId) {
      throw new BusinessError(
        ApiErrorCode.EXCEPTION_CASE_STATE_INVALID,
        '当前管理员不是该异常工单的认领人，不能释放认领',
      );
    }

    const result = await this.repository.appendOrderExceptionCaseAction(
      caseId,
      adminUserId,
      exceptionCase.status,
      {
        baseUpdatedAtIso: input.baseUpdatedAtIso,
        content: createOrderExceptionCaseUnclaimContent(input.content),
      },
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

    return mapOrderExceptionCaseWithSla(result, this.now());
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
        return mapOrderExceptionCaseWithSla(result.exceptionCase, this.now());
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
        return mapOrderExceptionCaseWithSla(result.exceptionCase, this.now());
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
      const appealDecision =
        'appealDecision' in input ? input.appealDecision : undefined;
      await this.safeNotifyExceptionEvent({
        event:
          appealDecision === 'accepted'
            ? 'exception_appeal_accepted'
            : appealDecision === 'rejected'
              ? 'exception_appeal_rejected'
              : 'exception_case_resolved',
        caseId: result.id,
        caseNo: result.caseNo,
        orderId: result.orderId,
        orderNo: result.orderNo,
        shipperId: order?.shipperId ?? '',
        driverId: order?.assignedDriverId,
      });
    }

    return mapOrderExceptionCaseWithSla(result, this.now());
  }

  private async listAllAdminExceptionCasesMatching(
    query: OrderExceptionCaseListQuery,
  ) {
    const items: OrderExceptionCaseRecord[] = [];
    const baseQuery = toAdminOrderExceptionCaseMatchQuery(query);
    let page = 1;

    while (true) {
      const result = await this.repository.listAdminOrderExceptionCases({
        ...baseQuery,
        page,
        pageSize: EXCEPTION_CASE_SLA_MATCH_PAGE_SIZE,
      });

      items.push(...result.items);

      if (
        result.items.length === 0 ||
        items.length >= result.total ||
        result.items.length < EXCEPTION_CASE_SLA_MATCH_PAGE_SIZE
      ) {
        return items;
      }

      page += 1;
    }
  }

  private async safeNotifyExceptionEvent(input: {
    event:
      | 'exception_case_created'
      | 'exception_case_resolved'
      | 'exception_compensation_executed'
      | 'exception_appeal_requested'
      | 'exception_appeal_accepted'
      | 'exception_appeal_rejected';
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

function toAdminOrderExceptionCaseMatchQuery(
  query: OrderExceptionCaseListQuery,
) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    ...(query.status ? { status: query.status } : {}),
    ...(query.sourceRole ? { sourceRole: query.sourceRole } : {}),
    ...(query.compensationStatus
      ? { compensationStatus: query.compensationStatus }
      : {}),
    ...(query.appealStatus ? { appealStatus: query.appealStatus } : {}),
    ...(query.keyword ? { keyword: query.keyword } : {}),
    ...(query.createdFromIso ? { createdFromIso: query.createdFromIso } : {}),
    ...(query.createdToIso ? { createdToIso: query.createdToIso } : {}),
  };
}

function createAdminOrderExceptionCasePage(
  items: OrderExceptionCaseRecord[],
  page: number,
  pageSize: number,
) {
  const startIndex = (page - 1) * pageSize;

  return {
    items: items.slice(startIndex, startIndex + pageSize),
    page,
    pageSize,
    total: items.length,
  };
}

function matchesOrderExceptionCaseClaimFilters(
  exceptionCase: OrderExceptionCaseRecord,
  query: OrderExceptionCaseListQuery,
) {
  if (
    query.claimStatus === 'claimed' &&
    !exceptionCase.claimedByAdminUserId
  ) {
    return false;
  }

  if (
    query.claimStatus === 'unclaimed' &&
    exceptionCase.claimedByAdminUserId
  ) {
    return false;
  }

  if (
    query.claimedByAdminUserId &&
    exceptionCase.claimedByAdminUserId !== query.claimedByAdminUserId
  ) {
    return false;
  }

  return true;
}
