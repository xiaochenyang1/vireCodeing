export type GeocodeRequest = {
  address: string;
};

export type ReverseGeocodeRequest = {
  latitude: number;
  longitude: number;
};

export type GeocodeResponse = {
  latitude: number;
  longitude: number;
  provider: 'sandbox' | 'amap';
  formattedAddress: string;
};

export type DriverLocationSource = 'manual' | 'device' | 'sandbox';

export type ReportDriverLocationRequest = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  orderId?: string;
  source?: DriverLocationSource;
};

export type DriverLocationSnapshotRecord = {
  driverId: string;
  orderId?: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  source: DriverLocationSource;
  recordedAtIso: string;
  updatedAtIso: string;
  /**
   * Best-effort straight-line estimate toward the active navigation target.
   * Present only when the order has usable coordinates for the current stage.
   */
  distanceToTargetMeters?: number;
  /**
   * Rough ETA in minutes assuming ~30 km/h urban truck speed.
   * Not a live traffic/routing ETA.
   */
  etaMinutes?: number;
  targetType?: 'pickup' | 'delivery';
  targetAddress?: string;
};

export type NavigationTarget = {
  type: 'pickup' | 'delivery';
  address: string;
  latitude?: number;
  longitude?: number;
  contactName: string;
  contactPhone: string;
};

export type DriverNavigationTargetsRecord = {
  orderId: string;
  orderNo: string;
  targets: NavigationTarget[];
};
