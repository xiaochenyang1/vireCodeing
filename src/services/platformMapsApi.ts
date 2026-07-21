import {
  PlatformApiError,
  type PlatformApiConfig,
  platformGet,
  platformPost,
} from './platformApiClient';

export type PlatformGeocodeResult = {
  latitude: number;
  longitude: number;
  provider: 'sandbox' | 'amap';
  formattedAddress: string;
};

export type PlatformDriverLocationSnapshot = {
  driverId: string;
  orderId?: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  source: 'manual' | 'device' | 'sandbox';
  recordedAtIso: string;
  updatedAtIso: string;
};

export type PlatformNavigationTarget = {
  type: 'pickup' | 'delivery';
  address: string;
  latitude?: number;
  longitude?: number;
  contactName: string;
  contactPhone: string;
};

export type PlatformDriverNavigationTargets = {
  orderId: string;
  orderNo: string;
  targets: PlatformNavigationTarget[];
};

export function createPlatformMapsApi(config: PlatformApiConfig) {
  return {
    async geocode(address: string) {
      const normalizedAddress = normalizeAddress(address);

      return platformPost<{ address: string }, PlatformGeocodeResult>(
        config,
        '/maps/geocode',
        { address: normalizedAddress },
      );
    },
    async reportDriverLocation(request: {
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      orderId?: string;
      source?: 'manual' | 'device' | 'sandbox';
    }) {
      const normalizedRequest = normalizeDriverLocationRequest(request);

      return platformPost<
        typeof normalizedRequest,
        PlatformDriverLocationSnapshot
      >(config, '/driver/location', normalizedRequest);
    },
    async getShipperDriverLocation(orderId: string) {
      const normalizedOrderId = normalizeOrderId(orderId);

      return platformGet<PlatformDriverLocationSnapshot>(
        config,
        `/shipper/orders/${normalizedOrderId}/driver-location`,
      );
    },
    async getDriverNavigationTargets(orderId: string) {
      const normalizedOrderId = normalizeOrderId(orderId);

      return platformGet<PlatformDriverNavigationTargets>(
        config,
        `/driver/orders/${normalizedOrderId}/navigation-targets`,
      );
    },
  };
}

function normalizeAddress(address: string) {
  if (typeof address !== 'string') {
    throw new PlatformApiError(
      'Platform map address must be a string',
      'PLATFORM_MAP_ADDRESS_INVALID',
      0,
    );
  }

  const normalizedAddress = address.trim();
  if (normalizedAddress.length < 2 || normalizedAddress.length > 200) {
    throw new PlatformApiError(
      'Platform map address is invalid',
      'PLATFORM_MAP_ADDRESS_INVALID',
      0,
    );
  }

  return normalizedAddress;
}

function normalizeOrderId(orderId: string) {
  if (typeof orderId !== 'string' || !orderId.trim()) {
    throw new PlatformApiError(
      'Platform order id is invalid',
      'PLATFORM_ORDER_ID_INVALID',
      0,
    );
  }

  return orderId.trim();
}

function normalizeDriverLocationRequest(request: {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  orderId?: string;
  source?: 'manual' | 'device' | 'sandbox';
}) {
  if (
    request === null ||
    typeof request !== 'object' ||
    Array.isArray(request)
  ) {
    throw new PlatformApiError(
      'Platform driver location request must be an object',
      'PLATFORM_DRIVER_LOCATION_REQUEST_INVALID',
      0,
    );
  }

  if (
    !Number.isFinite(request.latitude) ||
    !Number.isFinite(request.longitude) ||
    Math.abs(request.latitude) > 90 ||
    Math.abs(request.longitude) > 180
  ) {
    throw new PlatformApiError(
      'Platform driver location coordinates are invalid',
      'PLATFORM_DRIVER_LOCATION_REQUEST_INVALID',
      0,
    );
  }

  const orderId =
    typeof request.orderId === 'string' && request.orderId.trim()
      ? request.orderId.trim()
      : undefined;

  return {
    latitude: request.latitude,
    longitude: request.longitude,
    ...(request.accuracyMeters === undefined
      ? {}
      : { accuracyMeters: request.accuracyMeters }),
    ...(orderId ? { orderId } : {}),
    ...(request.source ? { source: request.source } : {}),
  };
}
