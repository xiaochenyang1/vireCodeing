import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import type { AuthenticatedUser } from '../auth/dto';
import { ShipperOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { SaveShipperOrderDraftRequest } from './dto';
import { OrderDraftsService } from './order-drafts.service';
import {
  parseSaveShipperOrderDraftRequest,
  saveShipperOrderDraftSchema,
} from './order-drafts.validation';

@Controller('shipper/order-draft')
@UseGuards(AccessTokenGuard, ShipperOnlyGuard)
@ApiTags('订单草稿 (Order Drafts)')
export class OrderDraftsController {
  constructor(private readonly orderDraftsService: OrderDraftsService) {}

  @Get()
  async getDraft(@Req() request: AuthenticatedRequest) {
    const draft = await this.orderDraftsService.getDraft(
      getCurrentShipperId(request),
    );

    return ok(
      draft ?? null,
      getRequestId(request),
    );
  }

  @Put()
  async saveDraft(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(saveShipperOrderDraftSchema))
    body: SaveShipperOrderDraftRequest,
  ) {
    return ok(
      await this.orderDraftsService.saveDraft(
        getCurrentShipperId(request),
        parseSaveShipperOrderDraftRequest(body),
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
