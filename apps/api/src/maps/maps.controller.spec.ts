import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { MapsController } from './maps.controller';
import type { MapsService } from './maps.service';

describe('MapsController', () => {
  it('gets the current driver latest location snapshot', async () => {
    const service = {
      getDriverLocation: jest.fn().mockResolvedValue({
        driverId: 'driver-1',
        latitude: 22.61,
        longitude: 113.91,
        source: 'sandbox',
        recordedAtIso: '2026-07-25T08:00:00.000Z',
        updatedAtIso: '2026-07-25T08:00:00.000Z',
      }),
    } as unknown as MapsService;
    const controller = new MapsController(service);

    await expect(
      controller.getDriverLocation(createRequest('driver-1')),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        driverId: 'driver-1',
        latitude: 22.61,
        longitude: 113.91,
      },
      requestId: 'req_maps_controller_test',
    });
    expect(service.getDriverLocation).toHaveBeenCalledWith('driver-1');
  });

  it('returns not found when the current driver has no latest location snapshot', async () => {
    const service = {
      getDriverLocation: jest.fn().mockResolvedValue(null),
    } as unknown as MapsService;
    const controller = new MapsController(service);

    await expect(
      controller.getDriverLocation(createRequest('driver-1')),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.DRIVER_LOCATION_NOT_FOUND, '司机尚未上报位置'),
    );
    expect(service.getDriverLocation).toHaveBeenCalledWith('driver-1');
  });

  it('rejects non-driver users before reading the current driver latest location', async () => {
    const service = {
      getDriverLocation: jest.fn(),
    } as unknown as MapsService;
    const controller = new MapsController(service);

    await expect(
      controller.getDriverLocation(createRequest('shipper-1', 'shipper')),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号角色不匹配'),
    );
    expect(service.getDriverLocation).not.toHaveBeenCalled();
  });
});

function createRequest(
  userId: string,
  userType: 'shipper' | 'driver' | 'admin' = 'driver',
): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'req_maps_controller_test' },
    currentUser: { id: userId, phone: '13900139001', userType },
  };
}
