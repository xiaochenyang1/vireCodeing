import { act } from 'react';
import { Platform } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {
  useDevicePushTokenRegistration,
  type UseDevicePushTokenRegistrationResult,
} from '../src/hooks/useDevicePushTokenRegistration';

function getCapturedState(state: {
  current: UseDevicePushTokenRegistrationResult | null;
}): UseDevicePushTokenRegistrationResult {
  if (!state.current) {
    throw new Error('Hook state not captured');
  }

  return state.current;
}

async function flushMicrotasks() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

describe('useDevicePushTokenRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('auto-registers the current push token with the active device id', async () => {
    const platformNotificationsApi = {
      registerDeviceToken: jest.fn().mockResolvedValue({
        registered: true,
        token: 'ExponentPushToken[auto-token]',
      }),
    };
    const capturedState = {
      current: null as UseDevicePushTokenRegistrationResult | null,
    };

    function CaptureHook() {
      capturedState.current = useDevicePushTokenRegistration(
        platformNotificationsApi,
        'ExponentPushToken[auto-token]',
        'granted',
        'mobile-device-auto',
      );
      return null;
    }

    await act(async () => {
      ReactTestRenderer.create(<CaptureHook />);
      await flushMicrotasks();
    });

    expect(platformNotificationsApi.registerDeviceToken).toHaveBeenCalledWith({
      pushToken: 'ExponentPushToken[auto-token]',
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      deviceId: 'mobile-device-auto',
    });
    expect(getCapturedState(capturedState).lastError).toBeNull();
  });

  it('uses the provided device id for manual registration', async () => {
    const platformNotificationsApi = {
      registerDeviceToken: jest.fn().mockResolvedValue({
        registered: true,
        token: 'ExponentPushToken[manual-token]',
      }),
    };
    const capturedState = {
      current: null as UseDevicePushTokenRegistrationResult | null,
    };

    function CaptureHook() {
      capturedState.current = useDevicePushTokenRegistration(
        platformNotificationsApi,
        null,
        'undetermined',
        'mobile-device-manual',
      );
      return null;
    }

    await act(async () => {
      ReactTestRenderer.create(<CaptureHook />);
      await flushMicrotasks();
    });

    await act(async () => {
      await getCapturedState(capturedState).registerToken(
        'ExponentPushToken[manual-token]',
      );
    });

    expect(platformNotificationsApi.registerDeviceToken).toHaveBeenCalledWith({
      pushToken: 'ExponentPushToken[manual-token]',
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      deviceId: 'mobile-device-manual',
    });
    expect(getCapturedState(capturedState).isRegistering).toBe(false);
  });
});
