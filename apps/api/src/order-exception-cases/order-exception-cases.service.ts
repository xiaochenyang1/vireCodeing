import { ApiErrorCode, BusinessError } from '../common/errors';
import type { OrdersRepository } from '../orders/orders.repository';
import { createAdminActionFingerprint } from '../payments/admin-finance.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type {
  AppealOrderExceptionCaseRequest,
  OrderExceptionCaseActionRecord,
  OrderExceptionCaseRecord,
  ExecuteOrderExceptionCaseCompensationRequest,
  OrderExceptionCaseListQuery,
  OrderExceptionCaseSlaSnapshot,
  OrderExceptionCaseSourceRole,
  OrderExceptionCaseStatus,
  ResolveOrderExceptionCaseRequest,
  UpdateOrderExceptionCaseRequest,
} from './dto';

const EXCEPTION_CASE_SLA_POLICY_KEY = 'exception_case_default_v1';
const EXCEPTION_CASE_ACCEPTANCE_TARGET_MS = 15 * 60 * 1000;
const EXCEPTION_CASE_RESOLUTION_TARGET_MS = 4 * 60 * 60 * 1000;
const EXCEPTION_CASE_SLA_MATCH_PAGE_SIZE = 200;
const MILLIS_PER_MINUTE = 60 * 1000;

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

    if (query.slaStatus) {
      const filteredItems = (
        await this.listAllAdminExceptionCasesMatching(query)
      )
        .map(exceptionCase =>
          mapOrderExceptionCaseWithSla(exceptionCase, currentTime),
        )
        .filter(exceptionCase => exceptionCase.sla?.status === query.slaStatus);

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

function mapOrderExceptionCaseListWithSla(
  result: {
    items: OrderExceptionCaseRecord[];
    total: number;
  },
  now: Date,
) {
  return {
    ...result,
    items: result.items.map(exceptionCase =>
      mapOrderExceptionCaseWithSla(exceptionCase, now),
    ),
  };
}

function mapOrderExceptionCaseWithSla(
  exceptionCase: OrderExceptionCaseRecord,
  now: Date,
): OrderExceptionCaseRecord {
  return {
    ...exceptionCase,
    sla: buildOrderExceptionCaseSlaSnapshot(exceptionCase, now),
  };
}

function buildOrderExceptionCaseSlaSnapshot(
  exceptionCase: OrderExceptionCaseRecord,
  now: Date,
): OrderExceptionCaseSlaSnapshot {
  if (exceptionCase.status === 'pending') {
    const targetTimestamp =
      parseTimestamp(exceptionCase.createdAtIso, now.getTime()) +
      EXCEPTION_CASE_ACCEPTANCE_TARGET_MS;

    return buildOpenOrderExceptionCaseSla(
      'acceptance',
      targetTimestamp,
      now.getTime(),
    );
  }

  const resolutionAnchorTimestamp = parseTimestamp(
    findOrderExceptionCaseTransitionIso(
      exceptionCase.actions,
      'processing',
      exceptionCase.updatedAtIso,
    ),
    parseTimestamp(exceptionCase.updatedAtIso, now.getTime()),
  );
  const targetTimestamp =
    resolutionAnchorTimestamp + EXCEPTION_CASE_RESOLUTION_TARGET_MS;

  if (
    exceptionCase.status === 'resolved' ||
    exceptionCase.status === 'closed'
  ) {
    return buildResolvedOrderExceptionCaseSla(
      targetTimestamp,
      parseTimestamp(
        exceptionCase.resolvedAtIso ??
          exceptionCase.closedAtIso ??
          exceptionCase.updatedAtIso,
        now.getTime(),
      ),
    );
  }

  return buildOpenOrderExceptionCaseSla(
    'resolution',
    targetTimestamp,
    now.getTime(),
  );
}

function buildOpenOrderExceptionCaseSla(
  stage: OrderExceptionCaseSlaSnapshot['stage'],
  targetTimestamp: number,
  evaluationTimestamp: number,
): OrderExceptionCaseSlaSnapshot {
  if (evaluationTimestamp > targetTimestamp) {
    return {
      policyKey: EXCEPTION_CASE_SLA_POLICY_KEY,
      stage,
      status: 'overdue',
      targetAtIso: new Date(targetTimestamp).toISOString(),
      overdueMinutes: calculateSlaMinutes(
        evaluationTimestamp - targetTimestamp,
      ),
    };
  }

  return {
    policyKey: EXCEPTION_CASE_SLA_POLICY_KEY,
    stage,
    status: 'within_target',
    targetAtIso: new Date(targetTimestamp).toISOString(),
    remainingMinutes: calculateSlaMinutes(
      targetTimestamp - evaluationTimestamp,
    ),
  };
}

function buildResolvedOrderExceptionCaseSla(
  targetTimestamp: number,
  resolvedTimestamp: number,
): OrderExceptionCaseSlaSnapshot {
  if (resolvedTimestamp > targetTimestamp) {
    return {
      policyKey: EXCEPTION_CASE_SLA_POLICY_KEY,
      stage: 'resolution',
      status: 'resolved_overdue',
      targetAtIso: new Date(targetTimestamp).toISOString(),
      overdueMinutes: calculateSlaMinutes(
        resolvedTimestamp - targetTimestamp,
      ),
    };
  }

  return {
    policyKey: EXCEPTION_CASE_SLA_POLICY_KEY,
    stage: 'resolution',
    status: 'resolved_within_target',
    targetAtIso: new Date(targetTimestamp).toISOString(),
    remainingMinutes: calculateSlaMinutes(
      targetTimestamp - resolvedTimestamp,
    ),
  };
}

function findOrderExceptionCaseTransitionIso(
  actions: OrderExceptionCaseActionRecord[],
  toStatus: OrderExceptionCaseStatus,
  fallbackIso: string,
) {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    if (actions[index]?.toStatus === toStatus) {
      return actions[index].createdAtIso;
    }
  }

  return fallbackIso;
}

function parseTimestamp(value: string | undefined, fallback: number) {
  const timestamp = Date.parse(value ?? '');

  return Number.isNaN(timestamp) ? fallback : timestamp;
}

function calculateSlaMinutes(deltaMs: number) {
  return Math.max(0, Math.ceil(deltaMs / MILLIS_PER_MINUTE));
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
