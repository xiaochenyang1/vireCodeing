import type { AuthenticatedUser } from '../auth/dto';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type {
  CreateShipperInvoiceApplicationRequest,
  ListAdminShipperInvoiceQuery,
  ReviewShipperInvoiceApplicationRequest,
  ShipperInvoiceApplicationRecord,
  ShipperInvoiceDownloadFile,
} from './dto';
import type { ProfileInvoicesRepository } from './profile-invoices.repository';

const VAT_SPECIAL_ENTERPRISE_REQUIRED_MESSAGE =
  '增值税专用发票需先提交企业认证资料';
const INVOICE_ORDER_COMPLETED_REQUIRED_MESSAGE = '仅已完成订单可申请发票';
const INVOICE_ORDER_FINANCIALLY_INELIGIBLE_MESSAGE =
  '仅已结算且未全额退款订单可申请发票';
const INVOICE_ORDER_OCCUPIED_MESSAGE = '订单已存在开票申请';
const INVOICE_DOWNLOAD_STATE_INVALID_MESSAGE = '仅已通过的发票申请支持下载';

export class ProfileInvoicesService {
  constructor(private readonly repository: ProfileInvoicesRepository) {}

  async listApplications(shipperId: string) {
    return this.repository.listApplications(shipperId);
  }

  async listAdminApplications(
    currentUser: AuthenticatedUser,
    query: ListAdminShipperInvoiceQuery,
  ) {
    this.assertAdmin(currentUser);
    return this.repository.listAdminApplications(query);
  }

  async reviewApplication(
    currentUser: AuthenticatedUser,
    applicationId: string,
    input: ReviewShipperInvoiceApplicationRequest,
  ) {
    this.assertAdmin(currentUser);
    return this.repository.reviewApplication(applicationId, currentUser.id, input);
  }

  async listAdminApplicationReviewEvents(
    currentUser: AuthenticatedUser,
    applicationId: string,
  ) {
    this.assertAdmin(currentUser);
    return this.repository.listAdminApplicationReviewEvents(applicationId);
  }

  async downloadApplication(
    currentUser: AuthenticatedUser,
    applicationId: string,
  ) {
    this.assertShipper(currentUser);
    const application = await this.getDownloadableApplication(applicationId);

    if (application.shipperId !== currentUser.id) {
      throw new BusinessError(
        ApiErrorCode.AUTH_FORBIDDEN,
        '当前发票申请不属于当前货主',
      );
    }

    return createInvoiceDownloadFile(application);
  }

  async downloadAdminApplication(
    currentUser: AuthenticatedUser,
    applicationId: string,
  ) {
    this.assertAdmin(currentUser);

    return createInvoiceDownloadFile(
      await this.getDownloadableApplication(applicationId),
    );
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

  private async getDownloadableApplication(applicationId: string) {
    const application =
      await this.repository.findApplicationById(applicationId);

    if (!application) {
      throw new BusinessError(
        ApiErrorCode.INVOICE_APPLICATION_NOT_FOUND,
        '发票申请不存在',
      );
    }

    if (application.status !== 'approved') {
      throw new BusinessError(
        ApiErrorCode.INVOICE_APPLICATION_STATE_INVALID,
        INVOICE_DOWNLOAD_STATE_INVALID_MESSAGE,
      );
    }

    return application;
  }

  private assertShipper(currentUser: AuthenticatedUser) {
    if (currentUser.userType !== 'shipper') {
      throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是货主');
    }
  }

  private assertAdmin(currentUser: AuthenticatedUser) {
    if (currentUser.userType !== 'admin') {
      throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员');
    }
  }
}

function createInvoiceDownloadFile(
  application: ShipperInvoiceApplicationRecord,
): ShipperInvoiceDownloadFile {
  return {
    fileName: `invoice-${sanitizeFileNameSegment(application.id)}.txt`,
    contentType: 'text/plain; charset=utf-8',
    content: Buffer.from(
      [
        '货主发票开票凭证',
        `申请编号：${application.id}`,
        `货主编号：${application.shipperId}`,
        `发票状态：已开票`,
        `发票类型：${formatInvoiceType(application.invoiceType)}`,
        `抬头类型：${formatInvoiceTitleType(application.invoiceTitleType)}`,
        `发票抬头：${application.invoiceTitle}`,
        `接收邮箱：${application.receiverEmail}`,
        `订单编号：${formatInvoiceOrders(application)}`,
        `开票金额：${formatInvoiceAmount(application.amountCents)}`,
        `申请时间：${application.createdAtIso}`,
        `开票时间：${application.updatedAtIso}`,
        '',
        '说明：当前为系统生成的文本开票凭证，正式电子票文件与税局回调仍待接入。',
      ].join('\n'),
      'utf8',
    ),
  };
}

function formatInvoiceType(
  invoiceType: ShipperInvoiceApplicationRecord['invoiceType'],
) {
  return invoiceType === 'vat-special' ? '增值税专用发票' : '电子普通发票';
}

function formatInvoiceTitleType(
  invoiceTitleType: ShipperInvoiceApplicationRecord['invoiceTitleType'],
) {
  return invoiceTitleType === 'enterprise' ? '企业抬头' : '个人抬头';
}

function formatInvoiceOrders(application: ShipperInvoiceApplicationRecord) {
  return application.orderNos.join('、') || application.orderIds.join('、') || '无';
}

function formatInvoiceAmount(amountCents: number) {
  return `¥${(amountCents / 100).toFixed(2)}`;
}

function sanitizeFileNameSegment(value: string) {
  const sanitizedValue = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-');

  return sanitizedValue || 'application';
}
