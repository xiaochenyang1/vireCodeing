import { useCallback, useEffect, useRef, useState } from 'react';

import { Platform } from 'react-native';

import { useAppNavigation } from '../navigation/appNavigation';
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
  driverAccountId?: string,
): UseDevicePushTokenRegistrationResult {
  const navigation = useAppNavigation();
  const isRegisteringRef = useRef(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: We only want to run this once when pushToken changes from null to a value
  useEffect(() => {
    if (!pushToken || !platformNotificationsApi || permissionStatus !== 'granted') {
      return;
    }

    let cancelled = false;
    isRegisteringRef.current = true;

    const doRegister = async () => {
      try {
        await platformNotificationsApi.registerDeviceToken({
          pushToken,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          deviceId: driverAccountId ?? 'shipper-default',
        });
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : '注册推送令牌失败';
          setLastError(message);
        }
      } finally {
        if (!cancelled) {
          isRegisteringRef.current = false;
        }
      }
    };

    doRegister();

    return () => {
      cancelled = true;
      isRegisteringRef.current = false;
    };
  }, [pushToken, platformNotificationsApi, permissionStatus, driverAccountId]);

  const registerToken = useCallback(
    async (token: string) => {
      if (!platformNotificationsApi) {
        return;
      }

      setIsRegistering(true);
      setLastError(null);

      try {
        await platformNotificationsApi.registerDeviceToken({
          pushToken: token,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          deviceId: driverAccountId ?? 'shipper-default',
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '注册推送令牌失败';
        setLastError(message);
      } finally {
        setIsRegistering(false);
      }
    },
    [platformNotificationsApi, driverAccountId],
  );

  return { registerToken, isRegistering, lastError };
}
