import { ApiErrorCode, BusinessError } from '../common/errors';
import type { CreateShipperInvoiceApplicationRequest } from './dto';
import type { ProfileInvoicesRepository } from './profile-invoices.repository';

const VAT_SPECIAL_ENTERPRISE_REQUIRED_MESSAGE =
  '增值税专用发票需先提交企业认证资料';
const INVOICE_ORDER_COMPLETED_REQUIRED_MESSAGE = '仅已完成订单可申请发票';
const INVOICE_ORDER_FINANCIALLY_INELIGIBLE_MESSAGE =
  '仅已结算且未全额退款订单可申请发票';
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

    const result = await this.repository.createEligibleApplication(
      shipperId,
      input,
    );

    switch (result.kind) {
      case 'success':
        return result.application;
      case 'orders-not-found':
        throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
      case 'order-not-completed':
        throw new BusinessError(
          ApiErrorCode.ORDER_STATE_INVALID,
          INVOICE_ORDER_COMPLETED_REQUIRED_MESSAGE,
        );
      case 'financially-ineligible':
        throw new BusinessError(
          ApiErrorCode.ORDER_STATE_INVALID,
          INVOICE_ORDER_FINANCIALLY_INELIGIBLE_MESSAGE,
        );
      case 'order-occupied':
        throw new BusinessError(
          ApiErrorCode.ORDER_STATE_INVALID,
          INVOICE_ORDER_OCCUPIED_MESSAGE,
        );
    }
  }
}
