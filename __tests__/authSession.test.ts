import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearAuthSession,
  getAuthSessionSnapshot,
  hasSavedAuthSession,
  hydrateAuthSession,
  refreshAuthSession,
  saveAuthSession,
} from '../src/utils/authSession';
import { clearDeviceId } from '../src/utils/deviceId';

describe('auth session storage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    clearAuthSession();
    await clearDeviceId();
  });

  it('stores platform token metadata when saving an API-backed session', async () => {
    saveAuthSession(1000, {
      accessToken: 'access.local-user-13800138000.900',
      refreshToken: 'refresh.local-user-13800138000.604800',
      expiresIn: 900,
    }, 'mobile-device-test');

    await hydrateAuthSession(1000);

    expect(getAuthSessionSnapshot()).toEqual({
      issuedAt: 1000,
      expiresAt: 901000,
      accessToken: 'access.local-user-13800138000.900',
      refreshToken: 'refresh.local-user-13800138000.604800',
      deviceId: 'mobile-device-test',
    });
    expect(hasSavedAuthSession(901000)).toBe(false);
  });

  it('keeps the local demo session TTL when no platform tokens are provided', async () => {
    saveAuthSession(1000);

    await hydrateAuthSession(1000);

    expect(getAuthSessionSnapshot()).toEqual({
      issuedAt: 1000,
      expiresAt: 604801000,
    });
    expect(hasSavedAuthSession(604800999)).toBe(true);
  });

  it('does not extend platform token expiry when refreshing a saved API-backed session lifetime', async () => {
    saveAuthSession(1000, {
      accessToken: 'access.local-user-13800138000.900',
      refreshToken: 'refresh.local-user-13800138000.604800',
      expiresIn: 900,
    }, 'mobile-device-test');

    expect(refreshAuthSession(2000)).toBe(true);

    expect(getAuthSessionSnapshot()).toEqual({
      issuedAt: 1000,
      expiresAt: 901000,
      accessToken: 'access.local-user-13800138000.900',
      refreshToken: 'refresh.local-user-13800138000.604800',
      deviceId: 'mobile-device-test',
    });

    await hydrateAuthSession(2000);

    expect(getAuthSessionSnapshot()).toEqual({
      issuedAt: 1000,
      expiresAt: 901000,
      accessToken: 'access.local-user-13800138000.900',
      refreshToken: 'refresh.local-user-13800138000.604800',
      deviceId: 'mobile-device-test',
    });
  });

  it('migrates legacy platform sessions to a fallback device id when hydrating', async () => {
    await AsyncStorage.setItem(
      '@vireCodeing/auth-session',
      JSON.stringify({
        issuedAt: 1000,
        expiresAt: 901000,
        accessToken: 'access.legacy-user.900',
        refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440123',
      }),
    );

    await hydrateAuthSession(1000, 'local-device');

    expect(getAuthSessionSnapshot()).toEqual({
      issuedAt: 1000,
      expiresAt: 901000,
      accessToken: 'access.legacy-user.900',
      refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440123',
      deviceId: 'local-device',
    });
  });
});
