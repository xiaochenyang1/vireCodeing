export type PlatformRuntimeConfig = {
  apiBaseUrl?: string;
};

type PlatformRuntimeConfigHost = typeof globalThis & {
  __TRUCK_PLATFORM_CONFIG__?: PlatformRuntimeConfig;
};

export function resolvePlatformApiBaseUrl(explicitBaseUrl?: string) {
  return (
    normalizeBaseUrl(explicitBaseUrl) ??
    normalizeBaseUrl(
      (globalThis as PlatformRuntimeConfigHost).__TRUCK_PLATFORM_CONFIG__
        ?.apiBaseUrl,
    )
  );
}

export function installPlatformRuntimeConfig(config: PlatformRuntimeConfig) {
  const apiBaseUrl = normalizeBaseUrl(config.apiBaseUrl);

  if (!apiBaseUrl) {
    return;
  }

  const configHost = globalThis as PlatformRuntimeConfigHost;

  configHost.__TRUCK_PLATFORM_CONFIG__ = {
    ...configHost.__TRUCK_PLATFORM_CONFIG__,
    apiBaseUrl,
  };
}

function normalizeBaseUrl(baseUrl?: string) {
  const normalizedBaseUrl = baseUrl?.trim().replace(/\/+$/, '');

  return normalizedBaseUrl || undefined;
}
