export type ExternalNavigationTarget = {
  label: string;
  address: string;
  latitude?: number;
  longitude?: number;
};

export type ExternalNavigationUrls = {
  geo: string;
  appleMaps: string;
  amapAndroid: string;
  amapIos: string;
  baidu: string;
};

export function buildExternalNavigationUrls(
  target: ExternalNavigationTarget,
): ExternalNavigationUrls {
  const label = target.label.trim() || '目的地';
  const address = target.address.trim();
  const hasCoordinates =
    typeof target.latitude === 'number' &&
    typeof target.longitude === 'number' &&
    Number.isFinite(target.latitude) &&
    Number.isFinite(target.longitude);

  if (hasCoordinates) {
    const latitude = target.latitude as number;
    const longitude = target.longitude as number;
    const encodedLabel = encodeURIComponent(label);

    return {
      geo: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodedLabel})`,
      appleMaps: `http://maps.apple.com/?daddr=${latitude},${longitude}&q=${encodedLabel}`,
      amapAndroid: `androidamap://navi?sourceApplication=vireCodeing&lat=${latitude}&lon=${longitude}&dev=0&style=2&poiname=${encodedLabel}`,
      amapIos: `iosamap://navi?sourceApplication=vireCodeing&lat=${latitude}&lon=${longitude}&dev=0&style=2&poiname=${encodedLabel}`,
      baidu: `baidumap://map/direction?destination=name:${encodedLabel}|latlng:${latitude},${longitude}&mode=driving`,
    };
  }

  const encodedAddress = encodeURIComponent(address || label);

  return {
    geo: `geo:0,0?q=${encodedAddress}`,
    appleMaps: `http://maps.apple.com/?daddr=${encodedAddress}`,
    amapAndroid: `androidamap://poi?sourceApplication=vireCodeing&keywords=${encodedAddress}`,
    amapIos: `iosamap://poi?sourceApplication=vireCodeing&keywords=${encodedAddress}`,
    baidu: `baidumap://map/direction?destination=${encodedAddress}&mode=driving`,
  };
}

export function formatCoordinateText(latitude: number, longitude: number) {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

export function formatDistanceMetersText(meters: number) {
  if (!Number.isFinite(meters) || meters < 0) {
    return undefined;
  }

  if (meters < 1000) {
    return `${Math.round(meters)} 米`;
  }

  const kilometers = meters / 1000;
  const rounded =
    kilometers >= 10 ? Math.round(kilometers) : Math.round(kilometers * 10) / 10;

  return `约 ${rounded} 公里`;
}

export function formatEtaMinutesText(etaMinutes: number) {
  if (!Number.isFinite(etaMinutes) || etaMinutes < 1) {
    return undefined;
  }

  const minutes = Math.round(etaMinutes);
  if (minutes < 60) {
    return `约 ${minutes} 分钟`;
  }

  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return remainMinutes === 0
    ? `约 ${hours} 小时`
    : `约 ${hours} 小时 ${remainMinutes} 分钟`;
}

export function formatTrackingEstimateText(input: {
  distanceToTargetMeters?: number;
  etaMinutes?: number;
  targetType?: 'pickup' | 'delivery';
  targetAddress?: string;
}) {
  const distanceText =
    typeof input.distanceToTargetMeters === 'number'
      ? formatDistanceMetersText(input.distanceToTargetMeters)
      : undefined;
  const etaText =
    typeof input.etaMinutes === 'number'
      ? formatEtaMinutesText(input.etaMinutes)
      : undefined;

  if (!distanceText && !etaText) {
    return undefined;
  }

  const targetLabel =
    input.targetType === 'pickup'
      ? '装货点'
      : input.targetType === 'delivery'
        ? '卸货点'
        : '目的地';
  const addressSuffix = input.targetAddress?.trim()
    ? `（${input.targetAddress.trim()}）`
    : '';
  const parts = [
    distanceText ? `距${targetLabel}${addressSuffix} ${distanceText}` : undefined,
    etaText ? `预计 ${etaText}` : undefined,
  ].filter(Boolean);

  return parts.join(' · ');
}
