import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import type { AuthenticatedUser } from '../auth/dto';
import { AdminOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type {
  BatchIssueShipperCouponsRequest,
  IssueShipperCouponRequest,
} from './dto';
import { ProfileCouponsService } from './profile-coupons.service';
import {
  batchIssueShipperCouponsSchema,
  parseAdminShipperCouponReportQuery,
  parseBatchIssueShipperCouponsRequest,
  issueShipperCouponSchema,
  parseIssueShipperCouponRequest,
} from './profile-coupons.validation';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@Controller('shipper/profile/coupons')
@UseGuards(AccessTokenGuard, ShipperOnlyGuard)
@ApiBearerAuth('access-token')
@ApiTags('个人资料 (Profile)')
export class ProfileCouponsController {
  constructor(private readonly profileCouponsService: ProfileCouponsService) {}

  @Get()
  async listCoupons(@Req() request: AuthenticatedRequest) {
    const currentUser = getCurrentShipper(request);

    return ok(
      await this.profileCouponsService.listCoupons(currentUser.id),
      getRequestId(request),
    );
  }
}

@Controller('admin/shipper-coupons')
@UseGuards(AccessTokenGuard, AdminOnlyGuard)
@ApiTags('个人资料 (Profile)')
export class AdminProfileCouponsController {
  constructor(private readonly profileCouponsService: ProfileCouponsService) {}

  @Post()
  async issueCoupon(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(issueShipperCouponSchema))
    body: IssueShipperCouponRequest,
  ) {
    const currentAdmin = getCurrentAdmin(request);

    return ok(
      await this.profileCouponsService.issueCoupon(
        currentAdmin.id,
        parseIssueShipperCouponRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post('batch-issue')
  async batchIssueCoupons(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(batchIssueShipperCouponsSchema))
    body: BatchIssueShipperCouponsRequest,
  ) {
    const currentAdmin = getCurrentAdmin(request);

    return ok(
      await this.profileCouponsService.batchIssueCoupons(
        currentAdmin.id,
        parseBatchIssueShipperCouponsRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Get('report')
  async getCouponReport(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    getCurrentAdmin(request);

    return ok(
      await this.profileCouponsService.getAdminCouponReport(
        parseAdminShipperCouponReportQuery(query),
      ),
      getRequestId(request),
    );
  }
}

function getCurrentShipper(request: AuthenticatedRequest): AuthenticatedUser {
  const currentUser = request.currentUser;

  if (!currentUser) {
    throw new BusinessError(
      ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
      '访问令牌无效',
    );
  }

  if (currentUser.userType !== 'shipper') {
    throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是货主');
  }

  return currentUser;
}

function getCurrentAdmin(request: AuthenticatedRequest): AuthenticatedUser {
  const currentUser = request.currentUser;

  if (!currentUser) {
    throw new BusinessError(
      ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
      '访问令牌无效',
    );
  }

  if (currentUser.userType !== 'admin') {
    throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员');
  }

  return currentUser;
}

function getRequestId(request?: AuthenticatedRequest) {
  const requestIdHeader = request?.headers?.['x-request-id'];

  return Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
}
