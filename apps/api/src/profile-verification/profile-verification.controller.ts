import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import type { AuthenticatedUser } from '../auth/dto';
import { AdminOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  ReviewShipperVerificationRequest,
  SaveShipperEnterpriseVerificationRequest,
  SaveShipperIdentityVerificationRequest,
} from './dto';
import { ProfileVerificationService } from './profile-verification.service';
import {
  parseListShipperVerificationQuery,
  parseReviewShipperVerificationRequest,
  parseSaveShipperEnterpriseVerificationRequest,
  parseSaveShipperIdentityVerificationRequest,
  reviewShipperVerificationSchema,
  saveShipperEnterpriseVerificationSchema,
  saveShipperIdentityVerificationSchema,
} from './profile-verification.validation';

@Controller('shipper/profile')
@UseGuards(AccessTokenGuard, ShipperOnlyGuard)
@ApiBearerAuth('access-token')
@ApiTags('个人资料 (Profile)')
export class ProfileVerificationController {
  constructor(
    private readonly profileVerificationService: ProfileVerificationService,
  ) {}

  @Get('identity-verification')
  async getIdentity(@Req() request: AuthenticatedRequest) {
    const currentUser = getCurrentShipper(request);

    return ok(
      (await this.profileVerificationService.getIdentity(currentUser.id)) ?? null,
      getRequestId(request),
    );
  }

  @Put('identity-verification')
  async saveIdentity(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(saveShipperIdentityVerificationSchema))
    body: SaveShipperIdentityVerificationRequest,
  ) {
    const currentUser = getCurrentShipper(request);

    return ok(
      await this.profileVerificationService.saveIdentity(
        currentUser.id,
        parseSaveShipperIdentityVerificationRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Get('enterprise-verification')
  async getEnterprise(@Req() request: AuthenticatedRequest) {
    const currentUser = getCurrentShipper(request);

    return ok(
      (await this.profileVerificationService.getEnterprise(currentUser.id)) ??
        null,
      getRequestId(request),
    );
  }

  @Put('enterprise-verification')
  async saveEnterprise(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(saveShipperEnterpriseVerificationSchema))
    body: SaveShipperEnterpriseVerificationRequest,
  ) {
    const currentUser = getCurrentShipper(request);

    return ok(
      await this.profileVerificationService.saveEnterprise(
        currentUser.id,
        parseSaveShipperEnterpriseVerificationRequest(body),
      ),
      getRequestId(request),
    );
  }
}

@Controller('admin/shipper-verifications')
@UseGuards(AccessTokenGuard, AdminOnlyGuard)
@ApiBearerAuth('access-token')
@ApiTags('管理员货主认证 (Admin Shipper Verification)')
export class AdminShipperVerificationController {
  constructor(
    private readonly profileVerificationService: ProfileVerificationService,
  ) {}

  @Get()
  async listVerifications(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return ok(
      await this.profileVerificationService.listVerifications(
        getCurrentAdmin(request),
        parseListShipperVerificationQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Post(':shipperId/identity/review')
  async reviewIdentity(
    @Req() request: AuthenticatedRequest,
    @Param('shipperId') shipperId: string,
    @Body(new ZodValidationPipe(reviewShipperVerificationSchema))
    body: ReviewShipperVerificationRequest,
  ) {
    return ok(
      await this.profileVerificationService.reviewIdentity(
        getCurrentAdmin(request),
        shipperId,
        parseReviewShipperVerificationRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post(':shipperId/enterprise/review')
  async reviewEnterprise(
    @Req() request: AuthenticatedRequest,
    @Param('shipperId') shipperId: string,
    @Body(new ZodValidationPipe(reviewShipperVerificationSchema))
    body: ReviewShipperVerificationRequest,
  ) {
    return ok(
      await this.profileVerificationService.reviewEnterprise(
        getCurrentAdmin(request),
        shipperId,
        parseReviewShipperVerificationRequest(body),
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
