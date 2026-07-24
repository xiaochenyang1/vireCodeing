import { ApiErrorCode, BusinessError } from '../common/errors';
import type {
  DriverLocationSnapshotRecord,
  DriverNavigationTargetsRecord,
  GeocodeRequest,
  ReverseGeocodeRequest,
  ReportDriverLocationRequest,
} from './dto';
import type { MapProvider } from './map-provider';
import type {
  DriverLocationOrderContext,
  InMemoryMapsRepository,
  PrismaMapsRepository,
} from './maps.repository';

type MapsRepository = InMemoryMapsRepository | PrismaMapsRepository;

const DRIVER_ACTIVE_LOCATION_STATUSES = new Set([
  'loading',
  'transporting',
  'confirming',
]);

export class MapsService {
  constructor(
    private readonly repository: MapsRepository,
    private readonly mapProvider: MapProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async geocode(request: GeocodeRequest) {
    const address = request.address.trim();
    if (!address) {
      throw new BusinessError(ApiErrorCode.MAP_ADDRESS_INVALID, '地址不能为空');
    }

    return this.mapProvider.geocode(address);
  }

  async reverseGeocode(request: ReverseGeocodeRequest) {
    assertCoordinates(request.latitude, request.longitude);
    return this.mapProvider.reverseGeocode({
      latitude: request.latitude,
      longitude: request.longitude,
    });
  }

  async reportDriverLocation(
    driverId: string,
    request: ReportDriverLocationRequest,
  ): Promise<DriverLocationSnapshotRecord> {
    assertCoordinates(request.latitude, request.longitude);

    if (request.orderId) {
      const order = await this.requireOrderContext(request.orderId);
      if (order.assignedDriverId !== driverId) {
        throw new BusinessError(
          ApiErrorCode.DRIVER_LOCATION_ORDER_INVALID,
          '只能向自己已接的订单上报位置',
        );
      }
      if (!DRIVER_ACTIVE_LOCATION_STATUSES.has(order.status)) {
        throw new BusinessError(
          ApiErrorCode.DRIVER_LOCATION_ORDER_INVALID,
          '当前订单状态不允许上报位置',
        );
      }
    }

    return this.repository.upsertDriverLocation({
      driverId,
      latitude: request.latitude,
      longitude: request.longitude,
      accuracyMeters: request.accuracyMeters,
      orderId: request.orderId,
      source: request.source ?? 'device',
      recordedAt: this.now(),
    });
  }

  async getShipperDriverLocation(
    shipperId: string,
    orderId: string,
  ): Promise<DriverLocationSnapshotRecord> {
    const order = await this.requireOrderContext(orderId);
    if (order.shipperId !== shipperId) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }
    if (!order.assignedDriverId) {
      throw new BusinessError(
        ApiErrorCode.DRIVER_LOCATION_NOT_FOUND,
        '订单尚未分配司机位置',
      );
    }

    const snapshot = await this.repository.findDriverLocation(
      order.assignedDriverId,
    );
    if (!snapshot) {
      throw new BusinessError(
        ApiErrorCode.DRIVER_LOCATION_NOT_FOUND,
        '司机尚未上报位置',
      );
    }

    return enrichSnapshotWithTargetEstimate(snapshot, order, this.mapProvider);
  }

  async getDriverLocation(
    driverId: string,
  ): Promise<DriverLocationSnapshotRecord | null> {
    return this.repository.findDriverLocation(driverId);
  }

  async getDriverNavigationTargets(
    driverId: string,
    orderId: string,
  ): Promise<DriverNavigationTargetsRecord> {
    const order = await this.requireOrderContext(orderId);
    if (order.assignedDriverId !== driverId) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      targets: [order.pickup, order.delivery],
    };
  }

  private async requireOrderContext(
    orderId: string,
  ): Promise<DriverLocationOrderContext> {
    const order = await this.repository.findOrderLocationContext(orderId);
    if (!order) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }
    return order;
  }
}

function assertCoordinates(latitude: number, longitude: number) {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    throw new BusinessError(ApiErrorCode.MAP_COORDINATES_INVALID, '坐标不合法');
  }
}

/** ~30 km/h urban truck average → 500 meters per minute. */
const ESTIMATED_TRUCK_METERS_PER_MINUTE = 500;

function enrichSnapshotWithTargetEstimate(
  snapshot: DriverLocationSnapshotRecord,
  order: DriverLocationOrderContext,
  mapProvider: MapProvider,
): DriverLocationSnapshotRecord {
  const target = resolveActiveNavigationTarget(order);
  if (
    !target ||
    typeof target.latitude !== 'number' ||
    typeof target.longitude !== 'number' ||
    !Number.isFinite(target.latitude) ||
    !Number.isFinite(target.longitude)
  ) {
    return snapshot;
  }

  const distanceToTargetMeters = mapProvider.estimateDistanceMeters(
    {
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
    },
    {
      latitude: target.latitude,
      longitude: target.longitude,
    },
  );

  return {
    ...snapshot,
    distanceToTargetMeters,
    etaMinutes: Math.max(
      1,
      Math.ceil(distanceToTargetMeters / ESTIMATED_TRUCK_METERS_PER_MINUTE),
    ),
    targetType: target.type,
    targetAddress: target.address,
  };
}

function resolveActiveNavigationTarget(order: DriverLocationOrderContext) {
  if (order.status === 'loading') {
    return order.pickup;
  }

  if (
    order.status === 'transporting' ||
    order.status === 'confirming' ||
    order.status === 'completed'
  ) {
    return order.delivery;
  }

  return order.delivery.latitude !== undefined &&
    order.delivery.longitude !== undefined
    ? order.delivery
    : order.pickup;
}
