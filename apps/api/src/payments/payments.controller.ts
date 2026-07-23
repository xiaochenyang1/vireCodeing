import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import { ShipperOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type { CreatePaymentRequest } from './dto';
import { PaymentsService } from './payments.service';
import {
  parseCreatePaymentRequest,
  parsePaymentIdempotencyKey,
} from './payments.validation';

@Controller('shipper/orders/:orderId/payments')
@UseGuards(AccessTokenGuard, ShipperOnlyGuard)
@ApiTags('支付 (Payments)')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '创建支付订单', description: '为指定货运订单创建支付订单，返回支付参数（微信/支付宝）' })
  async createPayment(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body() body: CreatePaymentRequest,
  ) {
    const currentUser = getCurrentShipper(request);
    return ok(
      await this.paymentsService.createPayment(
        currentUser.id,
        orderId,
        parsePaymentIdempotencyKey(idempotencyKey),
        parseCreatePaymentRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Get()
  async getLatestPayment(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    const currentUser = getCurrentShipper(request);
    return ok(
      await this.paymentsService.getLatestPaymentForOrder(
        currentUser.id,
        orderId,
      ),
      getRequestId(request),
    );
  }
}

function getCurrentShipper(request: AuthenticatedRequest) {
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

function getRequestId(request: AuthenticatedRequest) {
  const value = request.headers?.['x-request-id'];
  return Array.isArray(value) ? value[0] : value;
}
