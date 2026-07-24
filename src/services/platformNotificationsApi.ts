import {
  PlatformApiError,
  platformPost,
  type PlatformApiConfig,
} from './platformApiClient';

export type PlatformRegisterDeviceTokenRequest = {
  pushToken: string;
  platform: 'ios' | 'android';
  deviceId: string;
};

export type PlatformRegisterDeviceTokenResponse = {
  registered: boolean;
  token: string;
};

export type PlatformDevicePushTokenRecord = {
  id: string;
  userId: string;
  token: string;
  platform: 'ios' | 'android';
  deviceId: string;
  isActive: boolean;
  lastUsedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type PlatformListDeviceTokensResponse = {
  items: PlatformDevicePushTokenRecord[];
};

export function createPlatformNotificationsApi(config: PlatformApiConfig) {
  return {
    async registerDeviceToken(
      request: PlatformRegisterDeviceTokenRequest,
    ) {
      const normalizedRequest = normalizeRegisterDeviceTokenRequest(request);

      return platformPost<
        PlatformRegisterDeviceTokenRequest,
        PlatformRegisterDeviceTokenResponse
      >(config, '/me/device-token', normalizedRequest);
    },

    async listDeviceTokens() {
      return platformPost<
        Record<string, never>,
        PlatformListDeviceTokensResponse
      >(config, '/me/device-tokens', {});
    },

    async deactivateDeviceToken(token: string) {
      return platformPost<{ token: string }, { deactivated: boolean }>(
        config,
        '/me/device-tokens/deactivate',
        { token },
      );
    },
  };
}

export type PlatformNotificationsApi = ReturnType<
  typeof createPlatformNotificationsApi
>;

function normalizeRegisterDeviceTokenRequest(
  request: PlatformRegisterDeviceTokenRequest,
): PlatformRegisterDeviceTokenRequest {
  const pushToken = request.pushToken.trim();
  const platform = request.platform;
  const deviceId = request.deviceId.trim();

  if (pushToken.length === 0) {
    throw new PlatformApiError(
      'Push token is required',
      'PUSH_TOKEN_INVALID',
      0,
    );
  }

  if (deviceId.length === 0) {
    throw new PlatformApiError(
      'Device ID is required',
      'DEVICE_ID_INVALID',
      0,
    );
  }

  return {
    pushToken,
    platform,
    deviceId,
  };
}
