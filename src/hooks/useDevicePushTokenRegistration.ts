import { useCallback, useEffect, useState } from 'react';

import { Platform } from 'react-native';

import type { PlatformNotificationsApi } from '../services/platformNotificationsApi';
import type { PushNotificationPermissionStatus } from '../hooks/usePushNotifications';

export type UseDevicePushTokenRegistrationResult = {
  registerToken: (pushToken: string) => Promise<void>;
  isRegistering: boolean;
  lastError: string | null;
};

export function useDevicePushTokenRegistration(
  platformNotificationsApi: PlatformNotificationsApi | undefined,
  pushToken: string | null,
  permissionStatus: PushNotificationPermissionStatus,
  deviceId?: string,
): UseDevicePushTokenRegistrationResult {
  const [isRegistering, setIsRegistering] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (
      !pushToken ||
      !platformNotificationsApi ||
      permissionStatus !== 'granted' ||
      !deviceId
    ) {
      return;
    }

    let cancelled = false;

    const doRegister = async () => {
      try {
        await platformNotificationsApi.registerDeviceToken({
          pushToken,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          deviceId,
        });
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : '注册推送令牌失败';
          setLastError(message);
        }
      }
    };

    doRegister();

    return () => {
      cancelled = true;
    };
  }, [pushToken, platformNotificationsApi, permissionStatus, deviceId]);

  const registerToken = useCallback(
    async (token: string) => {
      if (!platformNotificationsApi || !deviceId) {
        return;
      }

      setIsRegistering(true);
      setLastError(null);

      try {
        await platformNotificationsApi.registerDeviceToken({
          pushToken: token,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          deviceId,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '注册推送令牌失败';
        setLastError(message);
      } finally {
        setIsRegistering(false);
      }
    },
    [platformNotificationsApi, deviceId],
  );

  return { registerToken, isRegistering, lastError };
}
