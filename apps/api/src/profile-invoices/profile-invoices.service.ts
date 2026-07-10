import { ApiErrorCode, BusinessError } from '../common/errors';
import type { CreateShipperInvoiceApplicationRequest } from './dto';
import type { ProfileInvoicesRepository } from './profile-invoices.repository';

const VAT_SPECIAL_ENTERPRISE_REQUIRED_MESSAGE =
  '增值税专用发票需先提交企业认证资料';
const INVOICE_ORDER_COMPLETED_REQUIRED_MESSAGE = '仅已完成订单可申请发票';
const INVOICE_ORDER_AMOUNT_INVALID_MESSAGE = '订单金额不可开票';
const INVOICE_ORDER_OCCUPIED_MESSAGE = '订单已存在开票申请';

export class ProfileInvoicesService {
  constructor(private readonly repository: ProfileInvoicesRepository) {}

  async listApplications(shipperId: string) {
    return this.repository.listApplications(shipperId);
  }

  async createApplication(
    shipperId: string,
    input: CreateShipperInvoiceApplicationRequest,
  ) {
    if (input.invoiceType === 'vat-special') {
      const enterpriseVerification =
        await this.repository.findEnterpriseVerification(shipperId);

      if (
        !enterpriseVerification ||
        enterpriseVerification.status === 'rejected'
      ) {
        throw new BusinessError(
          ApiErrorCode.VALIDATION_ERROR,
          VAT_SPECIAL_ENTERPRISE_REQUIRED_MESSAGE,
        );
      }
    }

    const orders = await this.repository.findOrdersByIds(shipperId, input.orderIds);

    if (orders.length !== input.orderIds.length) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    const ordersById = new Map(orders.map(order => [order.id, order]));
    const selectedOrders = input.orderIds.map(orderId => ordersById.get(orderId)!);

    if (selectedOrders.some(order => order.status !== 'completed')) {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        INVOICE_ORDER_COMPLETED_REQUIRED_MESSAGE,
      );
    }

    const amountCents = selectedOrders.reduce((totalAmount, order) => {
      const orderAmount = order.payablePriceCents ?? order.priceCents;

      if (!orderAmount || orderAmount <= 0) {
        throw new BusinessError(
          ApiErrorCode.ORDER_STATE_INVALID,
          INVOICE_ORDER_AMOUNT_INVALID_MESSAGE,
        );
      }

      return totalAmount + orderAmount;
    }, 0);
    const occupiedOrderIds = new Set(
      (await this.repository.listApplications(shipperId))
        .filter(application => application.status !== 'rejected')
        .flatMap(application => application.orderIds),
    );

    if (input.orderIds.some(orderId => occupiedOrderIds.has(orderId))) {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        INVOICE_ORDER_OCCUPIED_MESSAGE,
      );
    }

    return this.repository.createApplication(shipperId, {
      ...input,
      orderNos: selectedOrders.map(order => order.orderNo),
      amountCents,
    });
  }
}
