import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ProfileFrequentRoutesController } from './profile-frequent-routes.controller';
import type { ProfileFrequentRoutesService } from './profile-frequent-routes.service';

describe('ProfileFrequentRoutesController', () => {
  it('gets the current shipper profile frequent routes', async () => {
    const service = {
      getFrequentRoutes: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        routes: [{ id: 'route-1', name: '宝安仓库 -> 南山门店' }],
      }),
    } as unknown as ProfileFrequentRoutesService;
    const controller = new ProfileFrequentRoutesController(service);

    await expect(
      controller.getFrequentRoutes(createRequest('shipper-1')),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        shipperId: 'shipper-1',
        routes: [{ id: 'route-1', name: '宝安仓库 -> 南山门店' }],
      },
      requestId: 'req_profile_frequent_routes_test',
    });
    expect(service.getFrequentRoutes).toHaveBeenCalledWith('shipper-1');
  });

  it('returns null data when the current shipper has no frequent routes', async () => {
    const service = {
      getFrequentRoutes: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProfileFrequentRoutesService;
    const controller = new ProfileFrequentRoutesController(service);

    await expect(
      controller.getFrequentRoutes(createRequest('shipper-1')),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: null,
        requestId: 'req_profile_frequent_routes_test',
      }),
    );
    expect(service.getFrequentRoutes).toHaveBeenCalledWith('shipper-1');
  });

  it('saves the current shipper profile frequent routes', async () => {
    const service = {
      saveFrequentRoutes: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        routes: [{ id: 'route-1', name: '宝安仓库 -> 南山门店' }],
      }),
    } as unknown as ProfileFrequentRoutesService;
    const controller = new ProfileFrequentRoutesController(service);
    const body = {
      routes: [
        {
          id: 'route-1',
          name: '宝安仓库 -> 南山门店',
          from: '宝安仓库',
          to: '南山门店',
          lastUsedText: '刚刚添加',
        },
      ],
    };

    await expect(
      controller.saveFrequentRoutes(createRequest('shipper-1'), body),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        shipperId: 'shipper-1',
        routes: [{ id: 'route-1', name: '宝安仓库 -> 南山门店' }],
      },
      requestId: 'req_profile_frequent_routes_test',
    });
    expect(service.saveFrequentRoutes).toHaveBeenCalledWith('shipper-1', body);
  });

  it('rejects non-shipper users before reading frequent route data', async () => {
    const service = {
      getFrequentRoutes: jest.fn(),
    } as unknown as ProfileFrequentRoutesService;
    const controller = new ProfileFrequentRoutesController(service);

    await expect(
      controller.getFrequentRoutes(createRequest('driver-1', 'driver')),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是货主'),
    );
    expect(service.getFrequentRoutes).not.toHaveBeenCalled();
  });
});

function createRequest(
  userId: string,
  userType: 'shipper' | 'driver' | 'admin' = 'shipper',
): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'req_profile_frequent_routes_test' },
    currentUser: { id: userId, phone: '13900139001', userType },
  };
}
