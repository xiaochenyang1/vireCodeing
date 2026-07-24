import {
  Body,
  Controller,
  Delete,
  Get,
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
import { DriverOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type {
  CreateDriverBankCardRequest,
  CreateDriverWithdrawalRequest,
  DriverAcceptOrderRequest,
  DriverAdvanceOrderStatusRequest,
  DriverCancelOrderRequest,
  DriverEvaluateShipperRequest,
  DriverQuoteOrderRequest,
  DriverReplyEvaluationRequest,
  DriverReportExceptionRequest,
  SaveDriverAcceptanceSettingsRequest,
  UpdateDriverBankCardRequest,
} from './dto';
import { DriverOrdersService } from './driver-orders.service';
import { parseOrderIdempotencyKey } from '../orders/order-mutation-idempotency';
import {
  createDriverBankCardSchema,
  createDriverWithdrawalSchema,
  driverAcceptOrderSchema,
  driverAdvanceOrderStatusSchema,
  driverCancelOrderSchema,
  driverEvaluateShipperSchema,
  driverMyOrdersQuerySchema,
  driverOrderHallQuerySchema,
  driverQuoteOrderSchema,
  driverReplyEvaluationSchema,
  driverReportExceptionSchema,
  driverWithdrawalsQuerySchema,
  parseCreateDriverBankCardRequest,
  parseCreateDriverWithdrawalRequest,
  parseDriverMyOrdersQuery,
  parseDriverOrderHallQuery,
  parseDriverWithdrawalsQuery,
  parseUpdateDriverBankCardRequest,
  parseDriverAdvanceOrderStatusRequest,
  parseDriverAcceptOrderRequest,
  parseDriverCancelOrderRequest,
  parseDriverEvaluateShipperRequest,
  parseDriverQuoteOrderRequest,
  parseDriverReplyEvaluationRequest,
  parseDriverReportExceptionRequest,
  saveDriverAcceptanceSettingsSchema,
  parseSaveDriverAcceptanceSettingsRequest,
  updateDriverBankCardSchema,
} from './driver-orders.validation';

@Controller()
@UseGuards(AccessTokenGuard, DriverOnlyGuard)
@ApiTags('司机订单 (Driver Orders)')
export class DriverOrdersController {
  constructor(private readonly driverOrdersService: DriverOrdersService) {}

  @Get('driver/order-hall')
  @ApiOperation({ summary: '订单大厅', description: '司机查看可接的货运订单列表，支持按距离、车型、价格筛选' })
  async listOrderHall(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(driverOrderHallQuerySchema)) query: unknown,
  ) {
    return ok(
      await this.driverOrdersService.listOrderHall(
        getCurrentDriver(request),
        parseDriverOrderHallQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Get('driver/settings/acceptance')
  async getAcceptanceSettings(@Req() request: AuthenticatedRequest) {
    return ok(
      await this.driverOrdersService.getAcceptanceSettings(
        getCurrentDriver(request),
      ),
      getRequestId(request),
    );
  }

  @Put('driver/settings/acceptance')
  async saveAcceptanceSettings(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(saveDriverAcceptanceSettingsSchema))
    body: SaveDriverAcceptanceSettingsRequest,
  ) {
    return ok(
      await this.driverOrdersService.saveAcceptanceSettings(
        getCurrentDriver(request),
        parseSaveDriverAcceptanceSettingsRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Get('driver/income')
  @ApiOperation({ summary: '收入概览', description: '获取司机的收入概览（今日/本周/本月/总收入，订单数量统计）' })
  async getIncomeOverview(@Req() request: AuthenticatedRequest) {
    return ok(
      await this.driverOrdersService.getIncomeOverview(getCurrentDriver(request)),
      getRequestId(request),
    );
  }

  @Get('driver/withdrawals')
  async listWithdrawals(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(driverWithdrawalsQuerySchema)) query: unknown,
  ) {
    return ok(
      await this.driverOrdersService.listWithdrawals(
        getCurrentDriver(request),
        parseDriverWithdrawalsQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Post('driver/withdrawals')
  @ApiOperation({ summary: '申请提现', description: '司机申请提现到绑定银行卡，支持幂等性' })
  async createWithdrawal(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body(new ZodValidationPipe(createDriverWithdrawalSchema))
    body: CreateDriverWithdrawalRequest,
  ) {
    return ok(
      await this.driverOrdersService.createWithdrawal(
        getCurrentDriver(request),
        parseRequiredOrderIdempotencyKey(idempotencyKey),
        parseCreateDriverWithdrawalRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Get('driver/bank-cards')
  async listBankCards(@Req() request: AuthenticatedRequest) {
    return ok(
      await this.driverOrdersService.listBankCards(getCurrentDriver(request)),
      getRequestId(request),
    );
  }

  @Post('driver/bank-cards')
  @ApiOperation({ summary: '添加银行卡', description: '司机添加用于收款的银行卡' })
  async createBankCard(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createDriverBankCardSchema))
    body: CreateDriverBankCardRequest,
  ) {
    return ok(
      await this.driverOrdersService.createBankCard(
        getCurrentDriver(request),
        parseCreateDriverBankCardRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Put('driver/bank-cards/:cardId')
  async updateBankCard(
    @Req() request: AuthenticatedRequest,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(updateDriverBankCardSchema))
    body: UpdateDriverBankCardRequest,
  ) {
    return ok(
      await this.driverOrdersService.updateBankCard(
        getCurrentDriver(request),
        cardId,
        parseUpdateDriverBankCardRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Delete('driver/bank-cards/:cardId')
  async deleteBankCard(
    @Req() request: AuthenticatedRequest,
    @Param('cardId') cardId: string,
  ) {
    await this.driverOrdersService.deleteBankCard(
      getCurrentDriver(request),
      cardId,
    );

    return ok(null, getRequestId(request));
  }

  @Post('driver/orders/:orderId/quote')
  @ApiOperation({ summary: '司机报价', description: '司机对订单进行报价，支持议价模式' })
  async quoteOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(driverQuoteOrderSchema))
    body: DriverQuoteOrderRequest,
  ) {
    return ok(
      await this.driverOrdersService.quoteOrder(
        getCurrentDriver(request),
        orderId,
        parseDriverQuoteOrderRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post('driver/orders/:orderId/accept')
  @ApiOperation({ summary: '接单', description: '司机接受订单，需要完成实名认证和车辆认证，支持幂等性' })
  async acceptOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body(new ZodValidationPipe(driverAcceptOrderSchema))
    body: DriverAcceptOrderRequest,
  ) {
    return ok(
      await this.driverOrdersService.acceptOrder(
        getCurrentDriver(request),
        orderId,
        parseRequiredOrderIdempotencyKey(idempotencyKey),
        parseDriverAcceptOrderRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Get('driver/orders')
  async listMyOrders(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(driverMyOrdersQuerySchema)) query: unknown,
  ) {
    return ok(
      await this.driverOrdersService.listMyOrders(
        getCurrentDriver(request),
        parseDriverMyOrdersQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Get('driver/orders/:orderId')
  async getOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return ok(
      await this.driverOrdersService.getOrder(getCurrentDriver(request), orderId),
      getRequestId(request),
    );
  }

  @Post('driver/orders/:orderId/status')
  async advanceOrderStatus(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body(new ZodValidationPipe(driverAdvanceOrderStatusSchema))
    body: DriverAdvanceOrderStatusRequest,
  ) {
    return ok(
      await this.driverOrdersService.advanceOrderStatus(
        getCurrentDriver(request),
        orderId,
        parseRequiredOrderIdempotencyKey(idempotencyKey),
        parseDriverAdvanceOrderStatusRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post('driver/orders/:orderId/evaluation-reply')
  async replyToEvaluation(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(driverReplyEvaluationSchema))
    body: DriverReplyEvaluationRequest,
  ) {
    return ok(
      await this.driverOrdersService.replyToEvaluation(
        getCurrentDriver(request),
        orderId,
        parseDriverReplyEvaluationRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post('driver/orders/:orderId/cancel')
  @ApiOperation({
    summary: '司机取消订单',
    description: '司机取消待装货或运输中订单，写入取消事件并通知货主',
  })
  async cancelOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body(new ZodValidationPipe(driverCancelOrderSchema))
    body: DriverCancelOrderRequest,
  ) {
    return ok(
      await this.driverOrdersService.cancelOrder(
        getCurrentDriver(request),
        orderId,
        parseRequiredOrderIdempotencyKey(idempotencyKey),
        parseDriverCancelOrderRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post('driver/orders/:orderId/exception')
  async reportException(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(driverReportExceptionSchema))
    body: DriverReportExceptionRequest,
  ) {
    return ok(
      await this.driverOrdersService.reportException(
        getCurrentDriver(request),
        orderId,
        parseDriverReportExceptionRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post('driver/orders/:orderId/shipper-evaluation')
  async evaluateShipper(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(driverEvaluateShipperSchema))
    body: DriverEvaluateShipperRequest,
  ) {
    return ok(
      await this.driverOrdersService.evaluateShipper(
        getCurrentDriver(request),
        orderId,
        parseDriverEvaluateShipperRequest(body),
      ),
      getRequestId(request),
    );
  }
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

function getCurrentDriver(request: AuthenticatedRequest): AuthenticatedUser {
  const currentUser = getCurrentUser(request);

  if (currentUser.userType !== 'driver') {
    throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是司机');
  }

  return currentUser;
}

function getRequestId(request?: AuthenticatedRequest) {
  const requestIdHeader = request?.headers?.['x-request-id'];

  return Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
}

function parseRequiredOrderIdempotencyKey(value: unknown) {
  return parseOrderIdempotencyKey(value);
}
