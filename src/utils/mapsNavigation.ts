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
