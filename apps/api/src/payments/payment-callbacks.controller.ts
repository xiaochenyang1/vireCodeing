import {
  ArgumentsHost,
  Catch,
  Controller,
  ExceptionFilter,
  HttpCode,
  Post,
  Req,
  UseFilters,
} from '@nestjs/common';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type {
  PaymentProviderChannel,
  ProviderRawCallback,
} from './payment-provider';
import { PaymentsService } from './payments.service';

export type PaymentCallbackRequest = {
  headers: ProviderRawCallback['headers'];
  rawBody?: Buffer;
  originalUrl?: string;
  url?: string;
};

@Catch()
export class PaymentCallbackExceptionFilter implements ExceptionFilter {
  catch(_exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<PaymentCallbackRequest>();
    const response = http.getResponse<CallbackResponse>();
    const channel = resolveCallbackChannel(
      request.originalUrl ?? request.url ?? '',
    );

    response.status(400);
    if (channel === 'alipay') {
      response.type('text/plain; charset=utf-8').send('failure');
      return;
    }
    if (channel === 'wechat') {
      response.send({ code: 'FAIL', message: '回调处理失败' });
      return;
    }

    response.send({ ok: false });
  }
}

@Controller('callbacks')
@UseFilters(PaymentCallbackExceptionFilter)
export class PaymentCallbacksController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('payment/wechat')
  @HttpCode(200)
  handleWechatPaymentCallback(@Req() request: PaymentCallbackRequest) {
    return this.handle('payment', 'wechat', request);
  }

  @Post('payment/alipay')
  @HttpCode(200)
  handleAlipayPaymentCallback(@Req() request: PaymentCallbackRequest) {
    return this.handle('payment', 'alipay', request);
  }

  @Post('payment/sandbox')
  @HttpCode(200)
  handleSandboxPaymentCallback(@Req() request: PaymentCallbackRequest) {
    return this.handle('payment', 'sandbox', request);
  }

  @Post('refund/wechat')
  @HttpCode(200)
  handleWechatRefundCallback(@Req() request: PaymentCallbackRequest) {
    return this.handle('refund', 'wechat', request);
  }

  @Post('refund/alipay')
  @HttpCode(200)
  handleAlipayRefundCallback(@Req() request: PaymentCallbackRequest) {
    return this.handle('refund', 'alipay', request);
  }

  @Post('refund/sandbox')
  @HttpCode(200)
  handleSandboxRefundCallback(@Req() request: PaymentCallbackRequest) {
    return this.handle('refund', 'sandbox', request);
  }

  private async handle(
    kind: 'payment' | 'refund',
    channel: PaymentProviderChannel,
    request: PaymentCallbackRequest,
  ) {
    if (!Buffer.isBuffer(request.rawBody)) {
      throw new BusinessError(
        ApiErrorCode.PAYMENT_CALLBACK_INVALID,
        '支付回调缺少原始请求体',
      );
    }

    const rawCallback = {
      headers: request.headers,
      rawBody: request.rawBody,
    };
    if (kind === 'payment') {
      await this.paymentsService.handlePaymentCallback(channel, rawCallback);
    } else {
      await this.paymentsService.handleRefundCallback(channel, rawCallback);
    }

    return createCallbackSuccessAck(channel);
  }
}

type CallbackResponse = {
  status(code: number): CallbackResponse;
  type(contentType: string): CallbackResponse;
  send(body: unknown): unknown;
};

function createCallbackSuccessAck(channel: PaymentProviderChannel) {
  if (channel === 'wechat') {
    return { code: 'SUCCESS' as const, message: '成功' as const };
  }
  if (channel === 'alipay') {
    return 'success' as const;
  }

  return { ok: true as const };
}

function resolveCallbackChannel(path: string): PaymentProviderChannel {
  if (path.endsWith('/wechat')) {
    return 'wechat';
  }
  if (path.endsWith('/alipay')) {
    return 'alipay';
  }

  return 'sandbox';
}
