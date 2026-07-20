import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ApiErrorCode } from '../common/errors';
import { PaymentCallbacksController } from './payment-callbacks.controller';
import type { PaymentsService } from './payments.service';

describe('PaymentCallbacksController', () => {
  it('does not require bearer guards for provider callbacks', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PaymentCallbacksController) ?? [],
    ).toEqual([]);
  });

  it.each([
    ['payment', 'wechat', 'handleWechatPaymentCallback'],
    ['payment', 'alipay', 'handleAlipayPaymentCallback'],
    ['payment', 'sandbox', 'handleSandboxPaymentCallback'],
    ['refund', 'wechat', 'handleWechatRefundCallback'],
    ['refund', 'alipay', 'handleAlipayRefundCallback'],
    ['refund', 'sandbox', 'handleSandboxRefundCallback'],
  ] as const)(
    'forwards raw %s callbacks for %s without body reconstruction',
    async (kind, channel, methodName) => {
      const service = createPaymentsServiceMock();
      const controller = new PaymentCallbacksController(service);
      const rawBody = Buffer.from('{"signed":"payload"}');
      const request = {
        headers: { 'x-provider-signature': 'signature-1' },
        rawBody,
      };

      const result = await controller[methodName](request);

      const handler =
        kind === 'payment'
          ? service.handlePaymentCallback
          : service.handleRefundCallback;
      expect(handler).toHaveBeenCalledWith(channel, {
        headers: request.headers,
        rawBody,
      });
      expect(result).toEqual(
        channel === 'wechat'
          ? { code: 'SUCCESS', message: '成功' }
          : channel === 'alipay'
            ? 'success'
            : { ok: true },
      );
      if (typeof result === 'object') {
        expect(result).not.toHaveProperty('data');
      }
    },
  );

  it('rejects callbacks when Nest rawBody is unavailable before service I/O', async () => {
    const service = createPaymentsServiceMock();
    const controller = new PaymentCallbacksController(service);

    await expect(
      controller.handleWechatPaymentCallback({ headers: {}, rawBody: undefined }),
    ).rejects.toMatchObject({ code: ApiErrorCode.PAYMENT_CALLBACK_INVALID });
    expect(service.handlePaymentCallback).not.toHaveBeenCalled();
  });
});

function createPaymentsServiceMock() {
  return {
    handlePaymentCallback: jest.fn().mockResolvedValue({ kind: 'applied' }),
    handleRefundCallback: jest.fn().mockResolvedValue({ kind: 'applied' }),
  } as unknown as jest.Mocked<PaymentsService>;
}
