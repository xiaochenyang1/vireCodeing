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
import type {
  AdvanceShipperOrderStatusRequest,
  CancelShipperOrderRequest,
  CreateShipperOrderRequest,
  ReportShipperOrderExceptionRequest,
  SubmitShipperOrderChangeRequest,
  SubmitShipperOrderEvaluationRequest,
} from './dto';
import { OrdersService } from './orders.service';
import {
  cancelShipperOrderSchema,
  adminOrderAttachmentAuditListQuerySchema,
  advanceShipperOrderStatusSchema,
  createShipperOrderSchema,
  listShipperOrdersQuerySchema,
  reportShipperOrderExceptionSchema,
  submitShipperOrderChangeRequestSchema,
  submitShipperOrderEvaluationSchema,
  parseAdvanceShipperOrderStatusRequest,
  parseAdminOrderAttachmentAuditListQuery,
  parseCancelShipperOrderRequest,
  parseCreateShipperOrderRequest,
  parseListShipperOrdersQuery,
  parseReportShipperOrderExceptionRequest,
  parseSubmitShipperOrderChangeRequest,
  parseSubmitShipperOrderEvaluationRequest,
} from './orders.validation';

@Controller('shipper/orders')
@UseGuards(AccessTokenGuard, ShipperOnlyGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async createOrder(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createShipperOrderSchema))
    body: CreateShipperOrderRequest,
  ) {
    return ok(
      await this.ordersService.createOrder(
        getCurrentShipperId(request),
        parseCreateShipperOrderRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Get()
  async listOrders(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(listShipperOrdersQuerySchema)) query: unknown,
  ) {
    return ok(
      await this.ordersService.listOrders(
        getCurrentShipperId(request),
        parseListShipperOrdersQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Get(':orderId')
  async getOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return ok(
      await this.ordersService.getOrder(getCurrentShipperId(request), orderId),
      getRequestId(request),
    );
  }

  @Put(':orderId')
  async updateOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(createShipperOrderSchema))
    body: CreateShipperOrderRequest,
  ) {
    return ok(
      await this.ordersService.updateOrder(
        getCurrentShipperId(request),
        orderId,
        parseCreateShipperOrderRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post(':orderId/cancel')
  async cancelOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(cancelShipperOrderSchema))
    body: CancelShipperOrderRequest,
  ) {
    return ok(
      await this.ordersService.cancelOrder(
        getCurrentShipperId(request),
        orderId,
        parseCancelShipperOrderRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post(':orderId/complete')
  async completeOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return ok(
      await this.ordersService.completeOrder(
        getCurrentShipperId(request),
        orderId,
      ),
      getRequestId(request),
    );
  }

  @Post(':orderId/status')
  async advanceOrderStatus(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(advanceShipperOrderStatusSchema))
    body: AdvanceShipperOrderStatusRequest,
  ) {
    return ok(
      await this.ordersService.advanceOrderStatus(
        getCurrentShipperId(request),
        orderId,
        parseAdvanceShipperOrderStatusRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post(':orderId/exception')
  async reportOrderException(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(reportShipperOrderExceptionSchema))
    body: ReportShipperOrderExceptionRequest,
  ) {
    return ok(
      await this.ordersService.reportOrderException(
        getCurrentShipperId(request),
        orderId,
        parseReportShipperOrderExceptionRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post(':orderId/change-request')
  async submitOrderChangeRequest(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(submitShipperOrderChangeRequestSchema))
    body: SubmitShipperOrderChangeRequest,
  ) {
    return ok(
      await this.ordersService.submitOrderChangeRequest(
        getCurrentShipperId(request),
        orderId,
        parseSubmitShipperOrderChangeRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post(':orderId/evaluation')
  async submitOrderEvaluation(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(submitShipperOrderEvaluationSchema))
    body: SubmitShipperOrderEvaluationRequest,
  ) {
    return ok(
      await this.ordersService.submitOrderEvaluation(
        getCurrentShipperId(request),
        orderId,
        parseSubmitShipperOrderEvaluationRequest(body),
      ),
      getRequestId(request),
    );
  }
}

@Controller('admin/orders')
@UseGuards(AccessTokenGuard, AdminOnlyGuard)
export class AdminOrderAttachmentsController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('attachments')
  async listOrderAttachmentAudits(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(adminOrderAttachmentAuditListQuerySchema))
    query: unknown,
  ) {
    getCurrentAdmin(request);

    return ok(
      await this.ordersService.listAdminOrderAttachmentAudits(
        parseAdminOrderAttachmentAuditListQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Get(':orderId/attachments')
  async getOrderAttachmentAudit(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    getCurrentAdmin(request);

    return ok(
      await this.ordersService.getAdminOrderAttachmentAudit(orderId),
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

function getCurrentAdmin(request: AuthenticatedRequest) {
  const currentUser = getCurrentUser(request);

  if (currentUser.userType !== 'admin') {
    throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员');
  }

  return currentUser.id;
}

function getRequestId(request?: AuthenticatedRequest) {
  const requestIdHeader = request?.headers?.['x-request-id'];

  return Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
}
