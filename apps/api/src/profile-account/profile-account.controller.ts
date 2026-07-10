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
import type { SaveShipperProfileAccountRequest } from './dto';
import { ProfileAccountService } from './profile-account.service';
import {
  parseSaveShipperProfileAccountRequest,
  saveShipperProfileAccountSchema,
} from './profile-account.validation';

@Controller('shipper/profile/account')
@UseGuards(AccessTokenGuard, ShipperOnlyGuard)
export class ProfileAccountController {
  constructor(private readonly profileAccountService: ProfileAccountService) {}

  @Get()
  async getAccount(@Req() request: AuthenticatedRequest) {
    const currentUser = getCurrentShipper(request);

    return ok(
      (await this.profileAccountService.getAccount(
        currentUser.id,
        currentUser.phone,
      )) ?? null,
      getRequestId(request),
    );
  }

  @Put()
  async saveAccount(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(saveShipperProfileAccountSchema))
    body: SaveShipperProfileAccountRequest,
  ) {
    const currentUser = getCurrentShipper(request);

    return ok(
      await this.profileAccountService.saveAccount(
        currentUser.id,
        currentUser.phone,
        parseSaveShipperProfileAccountRequest(body),
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
