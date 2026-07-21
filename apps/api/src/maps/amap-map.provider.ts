import { ApiErrorCode, BusinessError } from '../common/errors';
import {
  haversineDistanceMeters,
  type GeocodeResult,
  type MapCoordinates,
  type MapProvider,
} from './map-provider';

export type AmapMapProviderConfig = {
  webKey: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type AmapGeoResponse = {
  status?: string;
  info?: string;
  infocode?: string;
  geocodes?: Array<{
    location?: string;
    formatted_address?: string;
  }>;
};

type AmapRegeoResponse = {
  status?: string;
  info?: string;
  infocode?: string;
  regeocode?: {
    formatted_address?: string;
  };
};

const DEFAULT_AMAP_API_BASE_URL = 'https://restapi.amap.com';
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Real Amap Web Service geocode/regeo provider.
 * This is an HTTP integration boundary, not an in-app map SDK.
 */
export class AmapMapProvider implements MapProvider {
  readonly name = 'amap' as const;
  private readonly apiBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: AmapMapProviderConfig) {
    this.apiBaseUrl = normalizeBaseUrl(
      config.apiBaseUrl ?? DEFAULT_AMAP_API_BASE_URL,
    );
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  async geocode(address: string): Promise<GeocodeResult> {
    const normalizedAddress = address.trim();
    if (!normalizedAddress) {
      throw new BusinessError(ApiErrorCode.MAP_ADDRESS_INVALID, '地址不能为空');
    }

    const url = new URL(`${this.apiBaseUrl}/v3/geocode/geo`);
    url.searchParams.set('key', this.config.webKey);
    url.searchParams.set('address', normalizedAddress);
    url.searchParams.set('output', 'JSON');

    const payload = await this.requestJson<AmapGeoResponse>(url);
    assertAmapSuccess(payload);

    const first = payload.geocodes?.[0];
    const coordinates = parseAmapLocation(first?.location);
    if (!coordinates) {
      throw new BusinessError(
        ApiErrorCode.MAP_ADDRESS_INVALID,
        '高德地图未能解析该地址',
      );
    }

    return {
      ...coordinates,
      provider: 'amap',
      formattedAddress:
        first?.formatted_address?.trim() || normalizedAddress,
    };
  }

  async reverseGeocode(coordinates: MapCoordinates): Promise<GeocodeResult> {
    assertCoordinates(coordinates.latitude, coordinates.longitude);

    const url = new URL(`${this.apiBaseUrl}/v3/geocode/regeo`);
    url.searchParams.set('key', this.config.webKey);
    url.searchParams.set(
      'location',
      `${roundCoordinate(coordinates.longitude)},${roundCoordinate(
        coordinates.latitude,
      )}`,
    );
    url.searchParams.set('output', 'JSON');

    const payload = await this.requestJson<AmapRegeoResponse>(url);
    assertAmapSuccess(payload);

    const formattedAddress = payload.regeocode?.formatted_address?.trim();
    if (!formattedAddress) {
      throw new BusinessError(
        ApiErrorCode.MAP_ADDRESS_INVALID,
        '高德地图未能解析该坐标',
      );
    }

    return {
      latitude: roundCoordinate(coordinates.latitude),
      longitude: roundCoordinate(coordinates.longitude),
      provider: 'amap',
      formattedAddress,
    };
  }

  estimateDistanceMeters(from: MapCoordinates, to: MapCoordinates) {
    return haversineDistanceMeters(from, to);
  }

  private async requestJson<T>(url: URL): Promise<T> {
    let response: Response;

    try {
      response = await this.fetchImpl(url.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new BusinessError(
        ApiErrorCode.MAP_PROVIDER_UNAVAILABLE,
        error instanceof Error
          ? `高德地图请求失败: ${error.message}`
          : '高德地图请求失败',
      );
    }

    if (!response.ok) {
      throw new BusinessError(
        ApiErrorCode.MAP_PROVIDER_UNAVAILABLE,
        `高德地图请求失败，HTTP ${response.status}`,
      );
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new BusinessError(
        ApiErrorCode.MAP_PROVIDER_UNAVAILABLE,
        '高德地图返回了无法解析的响应',
      );
    }
  }
}

function assertAmapSuccess(payload: {
  status?: string;
  info?: string;
  infocode?: string;
}) {
  if (payload.status === '1') {
    return;
  }

  const info = payload.info || payload.infocode || 'unknown';
  if (
    info.includes('INVALID_USER_KEY') ||
    info.includes('USERKEY_PLAT_NOMATCH') ||
    info.includes('DAILY_QUERY_OVER_LIMIT') ||
    info.includes('ACCESS_TOO_FREQUENT')
  ) {
    throw new BusinessError(
      ApiErrorCode.MAP_PROVIDER_UNAVAILABLE,
      `高德地图服务不可用: ${info}`,
    );
  }

  throw new BusinessError(
    ApiErrorCode.MAP_ADDRESS_INVALID,
    `高德地图无法处理该请求: ${info}`,
  );
}

function parseAmapLocation(location?: string): MapCoordinates | null {
  if (!location || typeof location !== 'string') {
    return null;
  }

  const [lngText, latText] = location.split(',');
  const longitude = Number(lngText);
  const latitude = Number(latText);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  return {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
  };
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

function roundCoordinate(value: number) {
  return Math.round(value * 1e7) / 1e7;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}
