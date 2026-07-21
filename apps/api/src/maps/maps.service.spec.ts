import { ApiErrorCode, BusinessError } from '../common/errors';
import type { DriverLocationOrderContext } from './maps.repository';
import { InMemoryMapsRepository } from './maps.repository';
import { MapsService } from './maps.service';
import { SandboxMapProvider } from './sandbox-map.provider';

describe('MapsService', () => {
  it('geocodes an address through the sandbox provider', async () => {
    const service = createService();
    const result = await service.geocode({ address: '宝安区福永物流园' });

    expect(result.provider).toBe('sandbox');
    expect(result.formattedAddress).toBe('宝安区福永物流园');
    expect(result.latitude).toBeGreaterThan(22);
    expect(result.longitude).toBeGreaterThan(113);
  });

  it('reports a driver location and lets the shipper read it', async () => {
    const service = createService(createOrderContext());

    const reported = await service.reportDriverLocation('driver-1', {
      latitude: 22.61,
      longitude: 113.91,
      orderId: 'order-1',
      accuracyMeters: 12,
      source: 'device',
    });

    expect(reported).toMatchObject({
      driverId: 'driver-1',
      orderId: 'order-1',
      latitude: 22.61,
      longitude: 113.91,
      source: 'device',
    });

    await expect(
      service.getShipperDriverLocation('shipper-1', 'order-1'),
    ).resolves.toMatchObject({
      driverId: 'driver-1',
      latitude: 22.61,
      longitude: 113.91,
    });
  });

  it('rejects driver location reports for foreign orders', async () => {
    const service = createService(
      createOrderContext({ assignedDriverId: 'driver-2' }),
    );

    await expect(
      service.reportDriverLocation('driver-1', {
        latitude: 22.61,
        longitude: 113.91,
        orderId: 'order-1',
      }),
    ).rejects.toMatchObject({
      code: ApiErrorCode.DRIVER_LOCATION_ORDER_INVALID,
    });
  });

  it('returns navigation targets for the assigned driver', async () => {
    const service = createService(createOrderContext({ status: 'loading' }));

    await expect(
      service.getDriverNavigationTargets('driver-1', 'order-1'),
    ).resolves.toMatchObject({
      orderId: 'order-1',
      targets: [
        expect.objectContaining({ type: 'pickup', latitude: 22.6 }),
        expect.objectContaining({ type: 'delivery', address: '龙岗区坂田仓' }),
      ],
    });
  });

  it('returns not found when the shipper has no driver location yet', async () => {
    const service = createService(createOrderContext());

    await expect(
      service.getShipperDriverLocation('shipper-1', 'order-1'),
    ).rejects.toBeInstanceOf(BusinessError);
    await expect(
      service.getShipperDriverLocation('shipper-1', 'order-1'),
    ).rejects.toMatchObject({
      code: ApiErrorCode.DRIVER_LOCATION_NOT_FOUND,
    });
  });
});

function createService(order?: DriverLocationOrderContext | null) {
  const repository = new InMemoryMapsRepository({
    findOrderLocationContext: async orderId => {
      if (!order || order.id !== orderId) {
        return null;
      }

      return order;
    },
  });

  return new MapsService(
    repository,
    new SandboxMapProvider(),
    () => new Date('2026-07-21T08:00:00.000Z'),
  );
}

function createOrderContext(
  overrides: Partial<DriverLocationOrderContext> = {},
): DriverLocationOrderContext {
  return {
    id: 'order-1',
    orderNo: 'HY1',
    shipperId: 'shipper-1',
    assignedDriverId: 'driver-1',
    status: 'transporting',
    pickup: {
      type: 'pickup',
      address: '宝安区福永物流园',
      latitude: 22.6,
      longitude: 113.9,
      contactName: '赵经理',
      contactPhone: '13900139001',
    },
    delivery: {
      type: 'delivery',
      address: '龙岗区坂田仓',
      latitude: 22.7,
      longitude: 114.1,
      contactName: '钱店长',
      contactPhone: '13900139002',
    },
    ...overrides,
  };
}
