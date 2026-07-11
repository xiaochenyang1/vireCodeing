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
import { DriverOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type {
  CreateDriverWithdrawalRequest,
  DriverAcceptOrderRequest,
  DriverAdvanceOrderStatusRequest,
  DriverEvaluateShipperRequest,
  DriverQuoteOrderRequest,
  DriverReplyEvaluationRequest,
  DriverReportExceptionRequest,
  SaveDriverAcceptanceSettingsRequest,
} from './dto';
import { DriverOrdersService } from './driver-orders.service';
import {
  driverAcceptOrderSchema,
  driverAdvanceOrderStatusSchema,
  driverEvaluateShipperSchema,
  driverReplyEvaluationSchema,
  createDriverWithdrawalSchema,
  driverMyOrdersQuerySchema,
  driverOrderHallQuerySchema,
  driverWithdrawalsQuerySchema,
  driverQuoteOrderSchema,
  driverReportExceptionSchema,
  parseCreateDriverWithdrawalRequest,
  parseSaveDriverAcceptanceSettingsRequest,
  parseDriverAdvanceOrderStatusRequest,
  parseDriverAcceptOrderRequest,
  parseDriverEvaluateShipperRequest,
  parseDriverMyOrdersQuery,
  parseDriverOrderHallQuery,
  parseDriverQuoteOrderRequest,
  parseDriverReplyEvaluationRequest,
  parseDriverReportExceptionRequest,
  parseDriverWithdrawalsQuery,
  saveDriverAcceptanceSettingsSchema,
} from './driver-orders.validation';

@Controller()
@UseGuards(AccessTokenGuard, DriverOnlyGuard)
export class DriverOrdersController {
  constructor(private readonly driverOrdersService: DriverOrdersService) {}

  @Get('driver/order-hall')
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
  async createWithdrawal(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createDriverWithdrawalSchema))
    body: CreateDriverWithdrawalRequest,
  ) {
    return ok(
      await this.driverOrdersService.createWithdrawal(
        getCurrentDriver(request),
        parseCreateDriverWithdrawalRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post('driver/orders/:orderId/quote')
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
  async acceptOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(driverAcceptOrderSchema))
    body: DriverAcceptOrderRequest,
  ) {
    return ok(
      await this.driverOrdersService.acceptOrder(
        getCurrentDriver(request),
        orderId,
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
    @Body(new ZodValidationPipe(driverAdvanceOrderStatusSchema))
    body: DriverAdvanceOrderStatusRequest,
  ) {
    return ok(
      await this.driverOrdersService.advanceOrderStatus(
        getCurrentDriver(request),
        orderId,
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
