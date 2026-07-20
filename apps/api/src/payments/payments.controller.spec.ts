import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { ShipperOnlyGuard } from '../auth/role.guard';
import { ApiErrorCode } from '../common/errors';
import { PaymentsController } from './payments.controller';
import type { PaymentsService } from './payments.service';

describe('PaymentsController', () => {
  it('uses access-token and shipper guards in that order', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PaymentsController) ?? [],
    ).toEqual([AccessTokenGuard, ShipperOnlyGuard]);
  });

  it('rejects a missing idempotency key before payment service I/O', async () => {
    const service = createPaymentsServiceMock();
    const controller = new PaymentsController(service);

    await expect(
      controller.createPayment(
        createRequest(),
        'order-1',
        undefined,
        { channel: 'wechat' },
      ),
    ).rejects.toMatchObject({ code: ApiErrorCode.IDEMPOTENCY_KEY_INVALID });
    expect(service.createPayment).not.toHaveBeenCalled();
  });

  it('creates a payment for the current shipper and preserves request id', async () => {
    const service = createPaymentsServiceMock();
    service.createPayment.mockResolvedValue({
      replayed: false,
      payment: { id: 'payment-1' },
    } as never);
    const controller = new PaymentsController(service);

    await expect(
      controller.createPayment(
        createRequest(),
        'order-1',
        '550e8400-e29b-41d4-a716-446655440000',
        { channel: 'wechat' },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      requestId: 'request-payment-1',
      data: {
        replayed: false,
        payment: { id: 'payment-1' },
      },
    });
    expect(service.createPayment).toHaveBeenCalledWith(
      'shipper-1',
      'order-1',
      '550e8400-e29b-41d4-a716-446655440000',
      { channel: 'wechat' },
    );
  });

  it('gets the latest payment for an order owned by the current shipper', async () => {
    const service = createPaymentsServiceMock();
    service.getLatestPaymentForOrder.mockResolvedValue({
      id: 'payment-1',
    } as never);
    const controller = new PaymentsController(service);

    await expect(
      controller.getLatestPayment(createRequest(), 'order-1'),
    ).resolves.toMatchObject({
      code: 'OK',
      data: { id: 'payment-1' },
    });
    expect(service.getLatestPaymentForOrder).toHaveBeenCalledWith(
      'shipper-1',
      'order-1',
    );
  });
});

function createPaymentsServiceMock() {
  return {
    createPayment: jest.fn(),
    getLatestPaymentForOrder: jest.fn(),
  } as unknown as jest.Mocked<PaymentsService>;
}

function createRequest(): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'request-payment-1' },
    currentUser: {
      id: 'shipper-1',
      phone: '13900139001',
      userType: 'shipper',
    },
  } as AuthenticatedRequest;
}
