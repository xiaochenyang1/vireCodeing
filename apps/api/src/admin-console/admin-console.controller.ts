import {
  Controller,
  Get,
  Header,
  Inject,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import { AdminOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { AdminConsoleOverviewService } from './admin-console-overview.service';
import { AdminPermissionMatrixService } from './admin-permission-matrix.service';
import { renderAdminConsoleHome } from './admin-console-home';
import { renderAdminLoginConsole } from './admin-login-console';
import { renderAccountManagementAdminConsole } from './account-management-admin-console';
import { renderDriverCertificationAdminConsole } from './driver-certification-admin-console';
import { renderEvaluationAuditAdminConsole } from './evaluation-audit-admin-console';
import { renderFileMaintenanceAdminConsole } from './file-maintenance-admin-console';
import { renderFinanceAdminConsole } from './finance-admin-console';
import { renderOrderManagementAdminConsole } from './order-management-admin-console';
import { renderOrderAttachmentAdminConsole } from './order-attachment-admin-console';
import { renderOrderExceptionCaseAdminConsole } from './order-exception-case-admin-console';
import { renderAdminPermissionMatrixConsole } from './permission-matrix-admin-console';
import { renderSessionGovernanceAdminConsole } from './session-governance-admin-console';
import { renderShipperCouponAdminConsole } from './shipper-coupon-admin-console';
import { renderSupportTicketAdminConsole } from './support-ticket-admin-console';

@Controller('admin')
export class AdminConsoleController {
  constructor(
    @Inject(AdminConsoleOverviewService)
    private readonly overviewService: Pick<
      AdminConsoleOverviewService,
      'getOverview'
    > = {
      getOverview: async () => {
        throw new Error('AdminConsoleOverviewService not configured');
      },
    },
    @Inject(AdminPermissionMatrixService)
    private readonly permissionMatrixService: Pick<
      AdminPermissionMatrixService,
      'getMatrix'
    > = {
      getMatrix: async () => {
        throw new Error('AdminPermissionMatrixService not configured');
      },
    },
  ) {}

  @Get('console')
  @Header('content-type', 'text/html; charset=utf-8')
  getAdminConsoleHome() {
    return renderAdminConsoleHome();
  }

  @Get('login')
  @Header('content-type', 'text/html; charset=utf-8')
  getAdminLoginConsole() {
    return renderAdminLoginConsole();
  }

  @Get('console/overview')
  @UseGuards(AccessTokenGuard, AdminOnlyGuard)
  async getAdminConsoleOverview(@Req() request: AuthenticatedRequest) {
    return ok(
      await this.overviewService.getOverview(),
      getRequestId(request),
    );
  }

  @Get('permissions/matrix')
  @UseGuards(AccessTokenGuard, AdminOnlyGuard)
  async getAdminPermissionMatrix(@Req() request: AuthenticatedRequest) {
    return ok(
      await this.permissionMatrixService.getMatrix(),
      getRequestId(request),
    );
  }

  @Get('driver-certification-console')
  @Header('content-type', 'text/html; charset=utf-8')
  getDriverCertificationConsole() {
    return renderDriverCertificationAdminConsole();
  }

  @Get('order-management-console')
  @Header('content-type', 'text/html; charset=utf-8')
  getOrderManagementConsole() {
    return renderOrderManagementAdminConsole();
  }

  @Get('session-governance-console')
  @Header('content-type', 'text/html; charset=utf-8')
  getSessionGovernanceConsole() {
    return renderSessionGovernanceAdminConsole();
  }

  @Get('account-management-console')
  @Header('content-type', 'text/html; charset=utf-8')
  getAccountManagementConsole() {
    return renderAccountManagementAdminConsole();
  }

  @Get('permission-matrix-console')
  @Header('content-type', 'text/html; charset=utf-8')
  getPermissionMatrixConsole() {
    return renderAdminPermissionMatrixConsole();
  }

  @Get('order-attachment-console')
  @Header('content-type', 'text/html; charset=utf-8')
  getOrderAttachmentAuditConsole() {
    return renderOrderAttachmentAdminConsole();
  }

  @Get('file-maintenance-console')
  @Header('content-type', 'text/html; charset=utf-8')
  getFileMaintenanceConsole() {
    return renderFileMaintenanceAdminConsole();
  }

  @Get('shipper-coupon-console')
  @Header('content-type', 'text/html; charset=utf-8')
  getShipperCouponConsole() {
    return renderShipperCouponAdminConsole();
  }

  @Get('order-exception-case-console')
  @Header('content-type', 'text/html; charset=utf-8')
  getOrderExceptionCaseConsole() {
    return renderOrderExceptionCaseAdminConsole();
  }

  @Get('support-ticket-console')
  @Header('content-type', 'text/html; charset=utf-8')
  getSupportTicketConsole() {
    return renderSupportTicketAdminConsole();
  }

  @Get('evaluation-audit-console')
  @Header('content-type', 'text/html; charset=utf-8')
  getEvaluationAuditConsole() {
    return renderEvaluationAuditAdminConsole();
  }

  @Get('finance-console')
  @Header('content-type', 'text/html; charset=utf-8')
  getFinanceConsole() {
    return renderFinanceAdminConsole();
  }
}

function getRequestId(request: AuthenticatedRequest) {
  const value = request.headers?.['x-request-id'];

  return (Array.isArray(value) ? value[0] : value) ?? 'req_local';
}
