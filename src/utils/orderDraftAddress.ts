import { PlatformApiError } from '../services/platformApiClient';
import type { PlatformGeocodeResult } from '../services/platformMapsApi';
import { formatCoordinateText } from './mapsNavigation';

export type DraftAddressPreview = {
  resolvedAddressText: string;
  formattedAddress: string;
  statusText: string;
  sourceText: string;
  coordinateText?: string;
};

export function validateDraftAddressPreviewInput(
  addressLabel: string,
  addressText: string,
) {
  const trimmedAddress = addressText.trim();

  if (trimmedAddress.length < 2) {
    return {
      notice: `请先填写${addressLabel}后再生成预览。`,
    };
  }

  return {
    notice: '',
    trimmedAddress,
  };
}

export function createLocalDraftAddressPreview(
  addressText: string,
): DraftAddressPreview {
  const trimmedAddress = addressText.trim();

  return {
    resolvedAddressText: trimmedAddress,
    formattedAddress: trimmedAddress,
    statusText: '已生成本地预览地址。',
    sourceText: '本地地址预览',
  };
}

export function createPlatformDraftAddressPreview(
  geocodeResult: PlatformGeocodeResult,
): DraftAddressPreview {
  return {
    resolvedAddressText: geocodeResult.formattedAddress,
    formattedAddress: geocodeResult.formattedAddress,
    statusText: '已同步平台标准地址。',
    sourceText: `平台地址解析（${getPlatformAddressProviderLabel(
      geocodeResult.provider,
    )}）`,
    coordinateText: formatCoordinateText(
      geocodeResult.latitude,
      geocodeResult.longitude,
    ),
  };
}

export function getDraftAddressPreviewSuccessNotice(
  addressLabel: string,
  source: 'local' | 'platform',
) {
  return source === 'platform'
    ? `${addressLabel}已同步平台标准地址。`
    : `已生成${addressLabel}预览。`;
}

export function getDraftAddressPreviewErrorNotice(
  addressLabel: string,
  error: unknown,
) {
  if (
    error instanceof PlatformApiError &&
    error.code === 'PLATFORM_MAP_ADDRESS_INVALID'
  ) {
    return `${addressLabel}不完整，请补充后再解析。`;
  }

  if (
    error instanceof PlatformApiError &&
    (error.code === 'AUTH_ACCESS_TOKEN_INVALID' ||
      error.code === 'AUTH_ACCESS_TOKEN_MISSING')
  ) {
    return '平台登录已过期，请重新登录后再解析地址。';
  }

  if (error instanceof PlatformApiError && error.code === 'NETWORK_ERROR') {
    return `${addressLabel}解析失败，请检查网络后重试。`;
  }

  return `${addressLabel}解析失败，请稍后重试。`;
}

function getPlatformAddressProviderLabel(provider: PlatformGeocodeResult['provider']) {
  return provider === 'amap' ? '高德地图' : '沙箱地图';
}
