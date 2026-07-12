import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import { AdminOnlyGuard, DriverOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { UpdateOrderExceptionCaseRequest } from './dto';
import { OrderExceptionCasesService } from './order-exception-cases.service';
import {
  orderExceptionCaseListQuerySchema,
  parseOrderExceptionCaseId,
  parseOrderExceptionCaseListQuery,
  parseOrderExceptionOrderId,
  parseUpdateOrderExceptionCaseRequest,
  updateOrderExceptionCaseSchema,
} from './order-exception-cases.validation';

@Controller('shipper/orders')
@UseGuards(AccessTokenGuard, ShipperOnlyGuard)
export class ShipperOrderExceptionCasesController {
  constructor(private readonly service: OrderExceptionCasesService) {}

  @Get(':orderId/exception-cases')
  async listCases(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return ok(
      await this.service.listForShipper(
        getCurrentUserId(request, 'shipper'),
        parseOrderExceptionOrderId(orderId),
      ),
      getRequestId(request),
    );
  }
}

@Controller('driver/orders')
@UseGuards(AccessTokenGuard, DriverOnlyGuard)
export class DriverOrderExceptionCasesController {
  constructor(private readonly service: OrderExceptionCasesService) {}

  @Get(':orderId/exception-cases')
  async listCases(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return ok(
      await this.service.listForDriver(
        getCurrentUserId(request, 'driver'),
        parseOrderExceptionOrderId(orderId),
      ),
      getRequestId(request),
    );
  }
}

@Controller('admin/order-exception-cases')
@UseGuards(AccessTokenGuard, AdminOnlyGuard)
export class AdminOrderExceptionCasesController {
  constructor(private readonly service: OrderExceptionCasesService) {}

  @Get()
  async listCases(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(orderExceptionCaseListQuerySchema)) query: unknown,
  ) {
    getCurrentUserId(request, 'admin');

    return ok(
      await this.service.listForAdmin(
        parseOrderExceptionCaseListQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Get(':caseId')
  async getCase(
    @Req() request: AuthenticatedRequest,
    @Param('caseId') caseId: string,
  ) {
    getCurrentUserId(request, 'admin');

    return ok(
      await this.service.getForAdmin(parseOrderExceptionCaseId(caseId)),
      getRequestId(request),
    );
  }

  @Post(':caseId/process')
  async processCase(
    @Req() request: AuthenticatedRequest,
    @Param('caseId') caseId: string,
    @Body(new ZodValidationPipe(updateOrderExceptionCaseSchema))
    body: UpdateOrderExceptionCaseRequest,
  ) {
    return this.mutate(request, caseId, body, 'processCase');
  }

  @Post(':caseId/resolve')
  async resolveCase(
    @Req() request: AuthenticatedRequest,
    @Param('caseId') caseId: string,
    @Body(new ZodValidationPipe(updateOrderExceptionCaseSchema))
    body: UpdateOrderExceptionCaseRequest,
  ) {
    return this.mutate(request, caseId, body, 'resolveCase');
  }

  @Post(':caseId/close')
  async closeCase(
    @Req() request: AuthenticatedRequest,
    @Param('caseId') caseId: string,
    @Body(new ZodValidationPipe(updateOrderExceptionCaseSchema))
    body: UpdateOrderExceptionCaseRequest,
  ) {
    return this.mutate(request, caseId, body, 'closeCase');
  }

  private async mutate(
    request: AuthenticatedRequest,
    caseId: string,
    body: UpdateOrderExceptionCaseRequest,
    method: 'processCase' | 'resolveCase' | 'closeCase',
  ) {
    const adminUserId = getCurrentUserId(request, 'admin');
    const result = await this.service[method](
      adminUserId,
      parseOrderExceptionCaseId(caseId),
      parseUpdateOrderExceptionCaseRequest(body),
    );

    return ok(result, getRequestId(request));
  }
}

function getCurrentUserId(
  request: AuthenticatedRequest,
  expectedRole: 'shipper' | 'driver' | 'admin',
) {
  const currentUser = request.currentUser;

  if (!currentUser) {
    throw new BusinessError(
      ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
      '访问令牌无效',
    );
  }

  if (currentUser.userType !== expectedRole) {
    throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号角色不匹配');
  }

  return currentUser.id;
}

function getRequestId(request: AuthenticatedRequest) {
  const value = request.headers?.['x-request-id'];

  return Array.isArray(value) ? value[0] : value;
}
