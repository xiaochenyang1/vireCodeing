export type MapCoordinates = {
  latitude: number;
  longitude: number;
};

export type GeocodeResult = MapCoordinates & {
  provider: 'sandbox';
  formattedAddress: string;
};

export interface MapProvider {
  readonly name: 'sandbox';
  geocode(address: string): Promise<GeocodeResult>;
  reverseGeocode(coordinates: MapCoordinates): Promise<GeocodeResult>;
  estimateDistanceMeters(
    from: MapCoordinates,
    to: MapCoordinates,
  ): number;
}

const EARTH_RADIUS_METERS = 6_371_000;

export function haversineDistanceMeters(
  from: MapCoordinates,
  to: MapCoordinates,
): number {
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLng = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_METERS * c);
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}
