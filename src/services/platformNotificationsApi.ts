import {
  PlatformApiError,
  platformGet,
  platformPost,
  type PlatformApiConfig,
} from './platformApiClient';

export type PlatformRegisterDeviceTokenRequest = {
  pushToken: string;
  platform: 'ios' | 'android';
  deviceId: string;
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

export type PlatformDeactivateDeviceTokenResponse = {
  deactivated: boolean;
};

export function createPlatformNotificationsApi(config: PlatformApiConfig) {
  return {
    async registerDeviceToken(
      request: PlatformRegisterDeviceTokenRequest,
    ) {
      const normalizedRequest = normalizeRegisterDeviceTokenRequest(request);

      return platformPost<
        PlatformRegisterDeviceTokenRequest,
        PlatformDevicePushTokenRecord
      >(config, '/me/device-token', normalizedRequest);
    },

    async listDeviceTokens() {
      return platformGet<PlatformListDeviceTokensResponse>(
        config,
        '/me/device-tokens',
      );
    },

    async deactivateDeviceToken(token: string) {
      return platformPost<
        { token: string },
        PlatformDeactivateDeviceTokenResponse
      >(
        config,
        '/me/device-tokens/deactivate',
        { token: normalizePushToken(token) },
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
  const pushToken = normalizePushToken(request.pushToken);
  const platform = request.platform;
  const deviceId = normalizeDeviceId(request.deviceId);

  return {
    pushToken,
    platform,
    deviceId,
  };
}

function normalizePushToken(pushToken: string) {
  const normalizedPushToken = pushToken.trim();

  if (normalizedPushToken.length === 0) {
    throw new PlatformApiError(
      'Push token is required',
      'PUSH_TOKEN_INVALID',
      0,
    );
  }

  return normalizedPushToken;
}

function normalizeDeviceId(deviceId: string) {
  const normalizedDeviceId = deviceId.trim();

  if (normalizedDeviceId.length === 0) {
    throw new PlatformApiError(
      'Device ID is required',
      'DEVICE_ID_INVALID',
      0,
    );
  }

  return normalizedDeviceId;
}
