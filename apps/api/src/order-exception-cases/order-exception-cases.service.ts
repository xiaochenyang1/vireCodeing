import { ApiErrorCode, BusinessError } from '../common/errors';
import type { OrdersRepository } from '../orders/orders.repository';
import type {
  OrderExceptionCaseListQuery,
  OrderExceptionCaseStatus,
  UpdateOrderExceptionCaseRequest,
} from './dto';

export class OrderExceptionCasesService {
  constructor(private readonly repository: OrdersRepository) {}

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
    return this.repository.listAdminOrderExceptionCases(query);
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
    input: UpdateOrderExceptionCaseRequest,
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

  private async transition(
    adminUserId: string,
    caseId: string,
    expectedStatus: OrderExceptionCaseStatus,
    nextStatus: OrderExceptionCaseStatus,
    input: UpdateOrderExceptionCaseRequest,
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

    return result;
  }
}

function notFoundError() {
  return new BusinessError(
    ApiErrorCode.EXCEPTION_CASE_NOT_FOUND,
    '异常工单不存在',
  );
}
