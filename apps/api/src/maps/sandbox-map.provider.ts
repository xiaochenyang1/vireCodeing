import { createHash } from 'crypto';
import {
  haversineDistanceMeters,
  type GeocodeResult,
  type MapCoordinates,
  type MapProvider,
} from './map-provider';

// Shenzhen-ish sandbox rectangle used only for deterministic fake coordinates.
const SANDBOX_LAT_MIN = 22.45;
const SANDBOX_LAT_MAX = 22.85;
const SANDBOX_LNG_MIN = 113.8;
const SANDBOX_LNG_MAX = 114.4;

export class SandboxMapProvider implements MapProvider {
  readonly name = 'sandbox' as const;

  async geocode(address: string): Promise<GeocodeResult> {
    const formattedAddress = address.trim();
    const coordinates = hashAddressToCoordinates(formattedAddress);

    return {
      ...coordinates,
      provider: 'sandbox',
      formattedAddress,
    };
  }

  async reverseGeocode(coordinates: MapCoordinates): Promise<GeocodeResult> {
    const latitude = roundCoordinate(coordinates.latitude);
    const longitude = roundCoordinate(coordinates.longitude);

    return {
      latitude,
      longitude,
      provider: 'sandbox',
      formattedAddress: `沙箱坐标 ${latitude.toFixed(6)},${longitude.toFixed(6)}`,
    };
  }

  estimateDistanceMeters(from: MapCoordinates, to: MapCoordinates) {
    return haversineDistanceMeters(from, to);
  }
}

function hashAddressToCoordinates(address: string): MapCoordinates {
  const digest = createHash('sha256').update(address).digest();
  const latRatio = digest.readUInt32BE(0) / 0xffffffff;
  const lngRatio = digest.readUInt32BE(4) / 0xffffffff;

  return {
    latitude: roundCoordinate(
      SANDBOX_LAT_MIN + latRatio * (SANDBOX_LAT_MAX - SANDBOX_LAT_MIN),
    ),
    longitude: roundCoordinate(
      SANDBOX_LNG_MIN + lngRatio * (SANDBOX_LNG_MAX - SANDBOX_LNG_MIN),
    ),
  };
}

function roundCoordinate(value: number) {
  return Math.round(value * 1e7) / 1e7;
}
