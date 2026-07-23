import { useState } from 'react';

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type PushNotificationPermissionStatus =
  | 'granted'
  | 'denied'
  | 'undetermined';

export type UsePushNotificationsResult = {
  pushToken: string | null;
  permissionStatus: PushNotificationPermissionStatus;
  isRequestingPermission: boolean;
  error: string | null;
  requestPermission: () => Promise<string | null>;
};

export function usePushNotifications(): UsePushNotificationsResult {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<
    PushNotificationPermissionStatus
  >('undetermined');
  const [isRequestingPermission, setIsRequestingPermission] =
    useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestPermission = async (): Promise<string | null> => {
    setIsRequestingPermission(true);
    setError(null);

    try {
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      setPermissionStatus(
        existingStatus === 'granted'
          ? 'granted'
          : existingStatus === 'denied'
            ? 'denied'
            : 'undetermined',
      );

      if (existingStatus === 'granted') {
        const token = await registerForPushNotificationsAsync();
        setPushToken(token);
        return token;
      }

      if (existingStatus === 'denied') {
        setError('通知权限已被拒绝，请在系统设置中开启。');
        return null;
      }

      const { status: newStatus } =
        await Notifications.requestPermissionsAsync();

      setPermissionStatus(
        newStatus === 'granted'
          ? 'granted'
          : newStatus === 'denied'
            ? 'denied'
            : 'undetermined',
      );

      if (newStatus !== 'granted') {
        setError('通知权限被拒绝，无法接收推送通知。');
        return null;
      }

      const token = await registerForPushNotificationsAsync();
      setPushToken(token);
      return token;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '请求通知权限失败。';
      setError(message);
      return null;
    } finally {
      setIsRequestingPermission(false);
    }
  };

  return {
    pushToken,
    permissionStatus,
    isRequestingPermission,
    error,
    requestPermission,
  };
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId: undefined,
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: '默认通知',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0E6F5C',
      });
    }

    return tokenResponse.data;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : '获取推送令牌失败。',
    );
  }
}
