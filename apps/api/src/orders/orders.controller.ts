import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
  BatchCancelAdminOrdersRequest,
  CancelShipperOrderRequest,
  CompleteShipperOrderRequest,
  CreateShipperOrderRequest,
  ReportShipperOrderExceptionRequest,
  SubmitShipperOrderChangeRequest,
  SubmitShipperOrderEvaluationRequest,
  UpdateShipperOrderRequest,
} from './dto';
import { OrdersService } from './orders.service';
import { parseOrderIdempotencyKey } from './order-mutation-idempotency';
import {
  cancelShipperOrderSchema,
  adminOrderAttachmentAuditListQuerySchema,
  adminOrderFiltersSchema,
  adminOrderReportQuerySchema,
  advanceShipperOrderStatusSchema,
  batchCancelAdminOrdersSchema,
  completeShipperOrderSchema,
  createShipperOrderSchema,
  listShipperOrdersQuerySchema,
  reportShipperOrderExceptionSchema,
  parseAdminOrderFilters,
  parseAdminOrderReportQuery,
  submitShipperOrderChangeRequestSchema,
  submitShipperOrderEvaluationSchema,
  parseAdvanceShipperOrderStatusRequest,
  parseAdminOrderAttachmentAuditListQuery,
  parseBatchCancelAdminOrdersRequest,
  parseCancelShipperOrderRequest,
  parseCompleteShipperOrderRequest,
  parseCreateShipperOrderRequest,
  parseListShipperOrdersQuery,
  parseReportShipperOrderExceptionRequest,
  parseSubmitShipperOrderChangeRequest,
  parseSubmitShipperOrderEvaluationRequest,
  parseUpdateShipperOrderRequest,
  updateShipperOrderSchema,
} from './orders.validation';

@Controller('shipper/orders')
@UseGuards(AccessTokenGuard, ShipperOnlyGuard)
@ApiTags('货主订单 (Shipper Orders)')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: '创建订单', description: '货主发布货运订单，支持幂等性（通过 Idempotency-Key 头）' })
  async createOrder(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body(new ZodValidationPipe(createShipperOrderSchema))
    body: CreateShipperOrderRequest,
  ) {
    return ok(
      await this.ordersService.createOrder(
        getCurrentShipperId(request),
        parseRequiredOrderIdempotencyKey(idempotencyKey),
        parseCreateShipperOrderRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Get()
  @ApiOperation({ summary: '订单列表', description: '获取当前货主的订单列表，支持状态筛选、时间范围筛选和关键词搜索' })
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
  @ApiOperation({ summary: '订单详情', description: '获取指定订单的详细信息，包括货物、地址、司机、报价、支付状态等' })
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
  @ApiOperation({ summary: '更新订单', description: '修改订单信息（装货前可修改），支持幂等性' })
  async updateOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body(new ZodValidationPipe(updateShipperOrderSchema))
    body: UpdateShipperOrderRequest,
  ) {
    return ok(
      await this.ordersService.updateOrder(
        getCurrentShipperId(request),
        orderId,
        parseRequiredOrderIdempotencyKey(idempotencyKey),
        parseUpdateShipperOrderRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post(':orderId/cancel')
  @ApiOperation({ summary: '取消订单', description: '取消订单，根据订单状态可能产生违约金，支持幂等性' })
  async cancelOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body(new ZodValidationPipe(cancelShipperOrderSchema))
    body: CancelShipperOrderRequest,
  ) {
    return ok(
      await this.ordersService.cancelOrder(
        getCurrentShipperId(request),
        orderId,
        parseRequiredOrderIdempotencyKey(idempotencyKey),
        parseCancelShipperOrderRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post(':orderId/complete')
  @ApiOperation({ summary: '确认送达', description: '货主确认货物已送达，触发支付结算流程，支持幂等性' })
  async completeOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body(new ZodValidationPipe(completeShipperOrderSchema))
    body: CompleteShipperOrderRequest,
  ) {
    return ok(
      await this.ordersService.completeOrder(
        getCurrentShipperId(request),
        orderId,
        parseRequiredOrderIdempotencyKey(idempotencyKey),
        parseCompleteShipperOrderRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post(':orderId/status')
  async advanceOrderStatus(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body(new ZodValidationPipe(advanceShipperOrderStatusSchema))
    body: AdvanceShipperOrderStatusRequest,
  ) {
    return ok(
      await this.ordersService.advanceOrderStatus(
        getCurrentShipperId(request),
        orderId,
        parseRequiredOrderIdempotencyKey(idempotencyKey),
        parseAdvanceShipperOrderStatusRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post(':orderId/exception')
  @ApiOperation({ summary: '上报异常', description: '货主上报订单异常（货物损坏、地址错误等）' })
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
  @ApiOperation({ summary: '评价司机', description: '货主对司机进行星级评分和文字评价' })
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
@ApiTags('管理员订单 (Admin Orders)')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: '管理员订单列表', description: '获取所有订单的分页列表' })
  async listAdminOrders(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(listShipperOrdersQuerySchema)) query: unknown,
  ) {
    getCurrentAdmin(request);

    return ok(
      await this.ordersService.listAdminOrders(
        parseListShipperOrdersQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Get('report')
  @ApiOperation({ summary: '订单统计报表', description: '获取订单统计报表，包括状态分布、支付分布、价格分布、热门货主等' })
  async getAdminOrderReport(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(adminOrderReportQuerySchema)) query: unknown,
  ) {
    getCurrentAdmin(request);

    return ok(
      await this.ordersService.getAdminOrderReport(
        parseAdminOrderReportQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Get('export')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="admin-orders.csv"')
  async exportAdminOrders(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(adminOrderFiltersSchema)) query: unknown,
  ) {
    getCurrentAdmin(request);

    return this.ordersService.exportAdminOrdersCsv(
      parseAdminOrderFilters(query),
    );
  }

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

  @Post('batch-cancel')
  async batchCancelAdminOrders(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body(new ZodValidationPipe(batchCancelAdminOrdersSchema))
    body: BatchCancelAdminOrdersRequest,
  ) {
    return ok(
      await this.ordersService.batchCancelAdminOrders(
        getCurrentAdmin(request),
        parseRequiredOrderIdempotencyKey(idempotencyKey),
        parseBatchCancelAdminOrdersRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post(':orderId/cancel')
  async cancelAdminOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body(new ZodValidationPipe(cancelShipperOrderSchema))
    body: CancelShipperOrderRequest,
  ) {
    return ok(
      await this.ordersService.cancelAdminOrder(
        getCurrentAdmin(request),
        orderId,
        parseRequiredOrderIdempotencyKey(idempotencyKey),
        parseCancelShipperOrderRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Get(':orderId')
  async getAdminOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    getCurrentAdmin(request);

    return ok(
      await this.ordersService.getAdminOrder(orderId),
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

function parseRequiredOrderIdempotencyKey(value: unknown) {
  return parseOrderIdempotencyKey(value);
}
