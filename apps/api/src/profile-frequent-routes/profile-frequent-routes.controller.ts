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
import type { SaveShipperProfileFrequentRoutesRequest } from './dto';
import { ProfileFrequentRoutesService } from './profile-frequent-routes.service';
import {
  parseSaveShipperProfileFrequentRoutesRequest,
  saveShipperProfileFrequentRoutesSchema,
} from './profile-frequent-routes.validation';

@Controller('shipper/profile/frequent-routes')
@UseGuards(AccessTokenGuard, ShipperOnlyGuard)
export class ProfileFrequentRoutesController {
  constructor(
    private readonly profileFrequentRoutesService: ProfileFrequentRoutesService,
  ) {}

  @Get()
  async getFrequentRoutes(@Req() request: AuthenticatedRequest) {
    const frequentRoutes =
      await this.profileFrequentRoutesService.getFrequentRoutes(
        getCurrentShipperId(request),
      );

    return ok(
      frequentRoutes ?? null,
      getRequestId(request),
    );
  }

  @Put()
  async saveFrequentRoutes(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(saveShipperProfileFrequentRoutesSchema))
    body: SaveShipperProfileFrequentRoutesRequest,
  ) {
    return ok(
      await this.profileFrequentRoutesService.saveFrequentRoutes(
        getCurrentShipperId(request),
        parseSaveShipperProfileFrequentRoutesRequest(body),
      ),
      getRequestId(request),
    );
  }
}

function getCurrentShipperId(request: AuthenticatedRequest) {
  const currentUser = getCurrentUser(request);

  if (currentUser.userType !== 'shipper') {
    throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是货主');
  }

  return currentUser.id;
}

function getCurrentUser(request: AuthenticatedRequest): AuthenticatedUser {
  if (!request.currentUser) {
    throw new BusinessError(
      ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
      '访问令牌无效',
    );
  }

  return request.currentUser;
}

function getRequestId(request?: AuthenticatedRequest) {
  const requestIdHeader = request?.headers?.['x-request-id'];

  return Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
}
