import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import type { AuthenticatedUser } from '../auth/dto';
import { AdminOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { IssueShipperCouponRequest } from './dto';
import { ProfileCouponsService } from './profile-coupons.service';
import {
  issueShipperCouponSchema,
  parseIssueShipperCouponRequest,
} from './profile-coupons.validation';

@Controller('shipper/profile/coupons')
@UseGuards(AccessTokenGuard, ShipperOnlyGuard)
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
