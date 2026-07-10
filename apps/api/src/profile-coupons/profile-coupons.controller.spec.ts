import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { ApiErrorCode, BusinessError } from '../common/errors';
import {
  AdminProfileCouponsController,
  ProfileCouponsController,
} from './profile-coupons.controller';
import type { ProfileCouponsService } from './profile-coupons.service';

describe('ProfileCouponsController', () => {
  it('lists the current shipper coupon wallet', async () => {
    const service = {
      listCoupons: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        summary: {
          usableCount: 1,
          lockedCount: 0,
          usedCount: 0,
          expiredCount: 0,
        },
        items: [
          {
            id: 'coupon-1',
            shipperId: 'shipper-1',
            title: '满 300 减 30',
            status: 'usable',
            conditionText: '发单满 300 元可用',
            discountCents: 3000,
            minOrderAmountCents: 30000,
            validFromIso: '2026-07-01T00:00:00.000Z',
            validUntilIso: '2026-07-31T15:59:59.000Z',
            sourceText: '平台活动发放',
            issuedAtIso: '2026-07-09T08:00:00.000Z',
          },
        ],
      }),
    } as unknown as ProfileCouponsService;
    const controller = new ProfileCouponsController(service);

    await expect(controller.listCoupons(createRequest('shipper-1'))).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: expect.objectContaining({
          shipperId: 'shipper-1',
          summary: expect.objectContaining({ usableCount: 1 }),
        }),
        requestId: 'req_profile_coupons_test',
      }),
    );
    expect(service.listCoupons).toHaveBeenCalledWith('shipper-1');
  });

  it('rejects non-shipper users before reading coupons', async () => {
    const service = {
      listCoupons: jest.fn(),
    } as unknown as ProfileCouponsService;
    const controller = new ProfileCouponsController(service);

    await expect(
      controller.listCoupons(createRequest('driver-1', 'driver')),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是货主'),
    );
    expect(service.listCoupons).not.toHaveBeenCalled();
  });
});

describe('AdminProfileCouponsController', () => {
  it('issues a coupon as an authenticated admin', async () => {
    const service = {
      issueCoupon: jest.fn().mockResolvedValue({
        id: 'coupon-admin-1',
        shipperId: 'shipper-1',
        title: '后台满 500 减 50',
        status: 'usable',
        conditionText: '平台订单满 500 元可用',
        discountCents: 5000,
        minOrderAmountCents: 50000,
        validFromIso: '2026-07-09T00:00:00.000Z',
        validUntilIso: '2026-08-09T00:00:00.000Z',
        sourceText: '后台手工发放',
        issuedAtIso: '2026-07-09T08:00:00.000Z',
      }),
    } as unknown as ProfileCouponsService;
    const controller = new AdminProfileCouponsController(service);
    const requestBody = {
      shipperId: 'shipper-1',
      title: '后台满 500 减 50',
      conditionText: '平台订单满 500 元可用',
      discountCents: 5000,
      minOrderAmountCents: 50000,
      validFromIso: '2026-07-09T00:00:00.000Z',
      validUntilIso: '2026-08-09T00:00:00.000Z',
    };

    await expect(
      controller.issueCoupon(createRequest('admin-1', 'admin'), requestBody),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: expect.objectContaining({
          id: 'coupon-admin-1',
          shipperId: 'shipper-1',
          status: 'usable',
        }),
        requestId: 'req_profile_coupons_test',
      }),
    );
    expect(service.issueCoupon).toHaveBeenCalledWith('admin-1', requestBody);
  });

  it('rejects non-admin users before issuing coupons', async () => {
    const service = {
      issueCoupon: jest.fn(),
    } as unknown as ProfileCouponsService;
    const controller = new AdminProfileCouponsController(service);

    await expect(
      controller.issueCoupon(createRequest('shipper-1', 'shipper'), {
        shipperId: 'shipper-1',
        title: '后台满 500 减 50',
        conditionText: '平台订单满 500 元可用',
        discountCents: 5000,
        minOrderAmountCents: 50000,
        validFromIso: '2026-07-09T00:00:00.000Z',
        validUntilIso: '2026-08-09T00:00:00.000Z',
      }),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
    expect(service.issueCoupon).not.toHaveBeenCalled();
  });
});

function createRequest(
  userId: string,
  userType: 'shipper' | 'driver' | 'admin' = 'shipper',
): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'req_profile_coupons_test' },
    currentUser: { id: userId, phone: '13900139001', userType },
  };
}
