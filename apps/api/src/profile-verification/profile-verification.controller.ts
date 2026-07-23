import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import type { AuthenticatedUser } from '../auth/dto';
import { ShipperOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  SaveShipperEnterpriseVerificationRequest,
  SaveShipperIdentityVerificationRequest,
} from './dto';
import { ProfileVerificationService } from './profile-verification.service';
import {
  parseSaveShipperEnterpriseVerificationRequest,
  parseSaveShipperIdentityVerificationRequest,
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

function getRequestId(request?: AuthenticatedRequest) {
  const requestIdHeader = request?.headers?.['x-request-id'];

  return Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
}
