import { act } from 'react';
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

function getCapturedState(state: {
  current: UsePushNotificationsResult | null;
}): UsePushNotificationsResult {
  if (!state.current) {
    throw new Error('Hook state not captured');
  }

  return state.current;
}

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

    const capturedState = {
      current: null as UsePushNotificationsResult | null,
    };

    function CaptureHook() {
      capturedState.current = usePushNotifications();
      return null;
    }

    await act(async () => {
      ReactTestRenderer.create(<CaptureHook />);
    });

    expect(getCapturedState(capturedState).permissionStatus).toBe(
      'undetermined',
    );
    expect(getCapturedState(capturedState).pushToken).toBeNull();
    expect(getCapturedState(capturedState).isRequestingPermission).toBe(
      false,
    );
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

    const capturedState = {
      current: null as UsePushNotificationsResult | null,
    };

    function CaptureHook() {
      capturedState.current = usePushNotifications();
      return null;
    }

    await act(async () => {
      ReactTestRenderer.create(<CaptureHook />);
    });

    let token: string | null = null;
    await act(async () => {
      token = await getCapturedState(capturedState).requestPermission();
    });

    expect(token).toBe('ExponentPushToken[test-token-123]');
    expect(getCapturedState(capturedState).permissionStatus).toBe('granted');
    expect(getCapturedState(capturedState).pushToken).toBe(
      'ExponentPushToken[test-token-123]',
    );
  });

  it('handles denied permission', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
    });

    const capturedState = {
      current: null as UsePushNotificationsResult | null,
    };

    function CaptureHook() {
      capturedState.current = usePushNotifications();
      return null;
    }

    await act(async () => {
      ReactTestRenderer.create(<CaptureHook />);
    });

    let token: string | null = null;
    await act(async () => {
      token = await getCapturedState(capturedState).requestPermission();
    });

    expect(token).toBeNull();
    expect(getCapturedState(capturedState).permissionStatus).toBe('denied');
    expect(getCapturedState(capturedState).error).not.toBeNull();
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

    const capturedState = {
      current: null as UsePushNotificationsResult | null,
    };

    function CaptureHook() {
      capturedState.current = usePushNotifications();
      return null;
    }

    await act(async () => {
      ReactTestRenderer.create(<CaptureHook />);
    });

    let token: string | null = null;
    await act(async () => {
      token = await getCapturedState(capturedState).requestPermission();
    });

    expect(token).toBeNull();
    expect(getCapturedState(capturedState).error).toBe('FCM error');
  });

  it('skips permission request when already granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[cached-token]',
    });

    const capturedState = {
      current: null as UsePushNotificationsResult | null,
    };

    function CaptureHook() {
      capturedState.current = usePushNotifications();
      return null;
    }

    await act(async () => {
      ReactTestRenderer.create(<CaptureHook />);
    });

    let token: string | null = null;
    await act(async () => {
      token = await getCapturedState(capturedState).requestPermission();
    });

    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(token).toBe('ExponentPushToken[cached-token]');
  });
});
