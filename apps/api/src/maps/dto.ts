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
