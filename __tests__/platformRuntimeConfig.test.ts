import {
  installPlatformRuntimeConfig,
  resolvePlatformApiBaseUrl,
  type PlatformRuntimeConfig,
} from '../src/services/platformRuntimeConfig';

type PlatformRuntimeConfigGlobal = typeof globalThis & {
  __TRUCK_PLATFORM_CONFIG__?: PlatformRuntimeConfig;
};

beforeEach(() => {
  delete (globalThis as PlatformRuntimeConfigGlobal).__TRUCK_PLATFORM_CONFIG__;
});

afterEach(() => {
  delete (globalThis as PlatformRuntimeConfigGlobal).__TRUCK_PLATFORM_CONFIG__;
});

test('installs a build-time platform api base url into runtime config', () => {
  installPlatformRuntimeConfig({
    apiBaseUrl: ' http://localhost:3000/api ',
  });

  expect(
    (globalThis as PlatformRuntimeConfigGlobal).__TRUCK_PLATFORM_CONFIG__,
  ).toEqual({
    apiBaseUrl: 'http://localhost:3000/api',
  });
  expect(resolvePlatformApiBaseUrl()).toBe('http://localhost:3000/api');
});

test('normalizes trailing slashes from platform api base urls', () => {
  installPlatformRuntimeConfig({
    apiBaseUrl: ' http://localhost:3000/api/ ',
  });

  expect(resolvePlatformApiBaseUrl(' http://explicit.example/api/ ')).toBe(
    'http://explicit.example/api',
  );
  expect(resolvePlatformApiBaseUrl()).toBe('http://localhost:3000/api');
});

test('does not replace an existing runtime base url with an empty build value', () => {
  installPlatformRuntimeConfig({
    apiBaseUrl: 'http://runtime.example/api',
  });
  installPlatformRuntimeConfig({
    apiBaseUrl: '   ',
  });

  expect(resolvePlatformApiBaseUrl()).toBe('http://runtime.example/api');
});
