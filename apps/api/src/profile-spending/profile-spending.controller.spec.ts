import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ProfileSpendingController } from './profile-spending.controller';
import type { ProfileSpendingService } from './profile-spending.service';

describe('ProfileSpendingController', () => {
  it('lists the current shipper spending records', async () => {
    const service = {
      listRecords: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        summary: {
          completedTotalCents: 31000,
          activeTotalCents: 52000,
          refundTotalCents: 26000,
        },
        items: [
          {
            orderId: 'order-1',
            orderNo: 'HY202607090001',
            status: 'completed',
            paymentMethod: 'cod',
            amountCents: 31000,
            occurredAtIso: '2026-07-09T08:00:00.000Z',
            routeText: '宝安仓库 → 南山门店',
          },
        ],
      }),
    } as unknown as ProfileSpendingService;
    const controller = new ProfileSpendingController(service);

    await expect(controller.listRecords(createRequest('shipper-1'))).resolves
      .toEqual(
        expect.objectContaining({
          code: 'OK',
          data: expect.objectContaining({
            shipperId: 'shipper-1',
            summary: expect.objectContaining({
              completedTotalCents: 31000,
            }),
          }),
          requestId: 'req_profile_spending_test',
        }),
      );
    expect(service.listRecords).toHaveBeenCalledWith('shipper-1');
  });

  it('rejects non-shipper users before reading spending records', async () => {
    const service = {
      listRecords: jest.fn(),
    } as unknown as ProfileSpendingService;
    const controller = new ProfileSpendingController(service);

    await expect(
      controller.listRecords(createRequest('driver-1', 'driver')),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是货主'),
    );
    expect(service.listRecords).not.toHaveBeenCalled();
  });
});

function createRequest(
  userId: string,
  userType: 'shipper' | 'driver' | 'admin' = 'shipper',
): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'req_profile_spending_test' },
    currentUser: { id: userId, phone: '13900139001', userType },
  };
}
