import { act } from 'react';
import { Platform } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {
  usePushNotifications,
  type UsePushNotificationsResult,
} from '../src/hooks/usePushNotifications';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  Notifications: {
    AndroidImportance: {
      MAX: 5,
      MIN: 1,
      LOW: 2,
      HIGH: 4,
    },
  },
}));

import * as Notifications from 'expo-notifications';

describe('usePushNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts with undetermined permission status', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
    });

    let capturedState: UsePushNotificationsResult | null = null;

    function CaptureHook() {
      capturedState = usePushNotifications() as UsePushNotificationsResult;
      return null;
    }

    await act(async () => {
      ReactTestRenderer.create(<CaptureHook />);
    });

    expect(capturedState?.permissionStatus).toBe('undetermined');
    expect(capturedState?.pushToken).toBeNull();
    expect(capturedState?.isRequestingPermission).toBe(false);
  });

  it('grants permission and returns push token', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[test-token-123]',
    });

    let capturedState: UsePushNotificationsResult | null = null;

    function CaptureHook() {
      capturedState = usePushNotifications() as UsePushNotificationsResult;
      return null;
    }

    await act(async () => {
      ReactTestRenderer.create(<CaptureHook />);
    });

    const token = await act(async () => {
      return await capturedState?.requestPermission();
    });

    expect(token).toBe('ExponentPushToken[test-token-123]');
    expect(capturedState?.permissionStatus).toBe('granted');
    expect(capturedState?.pushToken).toBe('ExponentPushToken[test-token-123]');
  });

  it('handles denied permission', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
    });

    let capturedState: UsePushNotificationsResult | null = null;

    function CaptureHook() {
      capturedState = usePushNotifications() as UsePushNotificationsResult;
      return null;
    }

    await act(async () => {
      ReactTestRenderer.create(<CaptureHook />);
    });

    const token = await act(async () => {
      return await capturedState?.requestPermission();
    });

    expect(token).toBeNull();
    expect(capturedState?.permissionStatus).toBe('denied');
    expect(capturedState?.error).not.toBeNull();
  });

  it('handles push token error', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValue(
      new Error('FCM error'),
    );

    let capturedState: UsePushNotificationsResult | null = null;

    function CaptureHook() {
      capturedState = usePushNotifications() as UsePushNotificationsResult;
      return null;
    }

    await act(async () => {
      ReactTestRenderer.create(<CaptureHook />);
    });

    const token = await act(async () => {
      return await capturedState?.requestPermission();
    });

    expect(token).toBeNull();
    expect(capturedState?.error).toBe('FCM error');
  });

  it('skips permission request when already granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[cached-token]',
    });

    let capturedState: UsePushNotificationsResult | null = null;

    function CaptureHook() {
      capturedState = usePushNotifications() as UsePushNotificationsResult;
      return null;
    }

    await act(async () => {
      ReactTestRenderer.create(<CaptureHook />);
    });

    const token = await act(async () => {
      return await capturedState?.requestPermission();
    });

    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(token).toBe('ExponentPushToken[cached-token]');
  });
});
