/**
 * @format
 */

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Linking, Platform, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import {
  clearAuthSession,
  getAuthSessionSnapshot,
  hydrateAuthSession,
  refreshAuthSession,
  saveAuthSession,
} from '../src/utils/authSession';
import { clearDeviceId, getDeviceId } from '../src/utils/deviceId';
import {
  clearSavedDraft,
  getDraftStorageSnapshot,
  getSavedDraft,
  replaceDraftStorageSnapshotForTest,
  saveDraft,
} from '../src/utils/draftStorage';
import {
  clearHomeLocalState,
  createFailedHomeSyncState,
  createPendingHomeSyncState,
  getHomeLocalState,
  saveHomeLocalState,
} from '../src/utils/homeLocalState';
import {
  clearProfileLocalState,
  createFailedProfileSyncState,
  createPendingProfileSyncState,
  getProfileLocalState,
  saveProfileLocalState,
} from '../src/utils/profileLocalState';
import {
  clearAppRuntimeState,
  getAppRuntimeState,
  saveAppRuntimeState,
} from '../src/utils/appRuntimeState';
import {
  createPendingOrderSyncState,
  isValidLocalPickupTimeText,
} from '../src/utils/order';
import { privacyPolicyDocumentInfo } from '../src/utils/profileSettings';
import type { PlatformPaymentSdk } from '../src/services/platformPaymentApi';

type AppRenderer = ReturnType<typeof ReactTestRenderer.create>;
type PlatformRuntimeConfigGlobal = typeof globalThis & {
  __TRUCK_PLATFORM_CONFIG__?: {
    apiBaseUrl?: string;
  };
};

jest.setTimeout(20000);

const mountedRenderers: AppRenderer[] = [];
const originalGlobalFetch = globalThis.fetch;
const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(
    '@vireCodeing/onboarding-state',
    JSON.stringify({
      version: 1,
      completedAt: 1000,
    }),
  );
  clearAuthSession();
  await clearDeviceId();
  clearSavedDraft();
  clearHomeLocalState();
  clearProfileLocalState();
  clearAppRuntimeState();
  (ImagePicker.getMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'granted',
  });
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue(
    {
      status: 'granted',
    },
  );
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: true,
    assets: [],
  });
  delete (globalThis as PlatformRuntimeConfigGlobal).__TRUCK_PLATFORM_CONFIG__;
});

afterEach(() => {
  unmountMountedRenderers();
  globalThis.fetch = originalGlobalFetch;
  delete (globalThis as PlatformRuntimeConfigGlobal).__TRUCK_PLATFORM_CONFIG__;
  jest.clearAllMocks();
});

function unmountMountedRenderers() {
  const renderers = mountedRenderers.splice(0);

  if (!renderers.length) {
    return;
  }

  ReactTestRenderer.act(() => {
    renderers.forEach(renderer => {
      renderer.unmount();
    });
  });
}

function expectOrderMutationContext(
  mutationContext:
    | {
        idempotencyKey?: string;
        baseUpdatedAtIso?: string;
      }
    | undefined,
  baseUpdatedAtIso: string,
) {
  expect(mutationContext).toMatchObject({
    idempotencyKey: expect.stringMatching(uuidV4Pattern),
    baseUpdatedAtIso,
  });
}

function mockSelectedImageUpload(
  fileName = 'picked-image.png',
  uri = 'file:///tmp/picked-image.png',
) {
  (ImagePicker.getMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'granted',
  });
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue(
    {
      status: 'granted',
    },
  );
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri,
        fileName,
        fileSize: 2048,
      },
    ],
  });
}

test('stores local draft metadata and returns cloned draft values', () => {
  const now = 1000;
  const expectedIso = new Date(now).toISOString();

  saveDraft(
    {
      weightText: '2.5 吨',
      pickupAddress: '宝安仓库',
      deliveryAddress: '南山门店',
    },
    now,
  );

  const snapshot = getDraftStorageSnapshot();
  const firstDraft = getSavedDraft(now);

  expect(snapshot?.version).toBe(1);
  expect(snapshot?.savedAt).toBe(1000);
  expect(snapshot?.syncState?.updatedAtIso).toBe(expectedIso);
  expect(snapshot?.syncState?.queueItems?.[0].updatedAtIso).toBe(expectedIso);
  expect(firstDraft?.weightText).toBe('2.5 吨');

  if (firstDraft) {
    firstDraft.weightText = '被外部修改';
  }

  expect(getSavedDraft(now)?.weightText).toBe('2.5 吨');
});

test('drops invalid local draft snapshots', () => {
  replaceDraftStorageSnapshotForTest({
    version: 999,
    savedAt: 1000,
    draft: {
      weightText: '2.5 吨',
      pickupAddress: '宝安仓库',
    },
  });

  expect(getSavedDraft()).toBeUndefined();
  expect(getDraftStorageSnapshot()).toBeUndefined();
});

test('drops local draft snapshots older than twenty-four hours', () => {
  replaceDraftStorageSnapshotForTest({
    version: 1,
    savedAt: 1000,
    draft: {
      weightText: '2.5 吨',
      pickupAddress: '宝安仓库',
      deliveryAddress: '南山门店',
    },
  });

  const expiredAt = 1000 + 24 * 60 * 60 * 1000 + 1;

  expect(getSavedDraft(expiredAt)).toBeUndefined();
  expect(getDraftStorageSnapshot()).toBeUndefined();
});

test('validates local pickup time upper bound and half-hour interval', () => {
  const now = new Date('2026-06-24T08:00:00+08:00').getTime();

  expect(isValidLocalPickupTimeText('2026-07-01 08:00', now)).toBe(true);
  expect(isValidLocalPickupTimeText('2026-07-01 08:30', now)).toBe(false);
  expect(isValidLocalPickupTimeText('今天 10:15', now)).toBe(false);
});

test('shows local onboarding before auth and persists completion', async () => {
  await AsyncStorage.removeItem('@vireCodeing/onboarding-state');

  const app = await renderApp(2000);

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('货主端上手引导');
  expect(renderedText).toContain('本地发单');
  expect(renderedText).not.toContain('账号验证');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'onboarding-next' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('订单跟踪');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'onboarding-finish' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('账号验证');

  await flushMicrotasks();

  const onboardingState = await getStoredSnapshot<{
    version: number;
    completedAt: number;
  }>('@vireCodeing/onboarding-state');

  expect(onboardingState).toEqual({
    version: 1,
    completedAt: 2000,
  });
});
test('restores persisted local app state from device storage on cold start', async () => {
  await AsyncStorage.setMany({
    '@vireCodeing/auth-session': JSON.stringify({
      issuedAt: 1000,
      expiresAt: 1000 + 7 * 24 * 60 * 60 * 1000,
    }),
    '@vireCodeing/app-runtime-state': JSON.stringify({
      version: 1,
      state: {
        orders: [
          {
            id: 'HYLOCAL999',
            status: 'waiting',
            from: '持久化装货地',
            to: '持久化卸货地',
            cargoType: '数码',
            weightText: '9 吨',
            quantityText: '99 箱',
            vehicleRequirement: '厢式货车',
            priceText: '￥1888',
            updatedAtText: '刚刚发布',
          },
        ],
        messages: [],
      },
    }),
    '@vireCodeing/home-local-state': JSON.stringify({
      version: 1,
      state: {
        selectedCity: '广州',
        routes: [],
      },
    }),
    '@vireCodeing/profile-local-state': JSON.stringify({
      version: 1,
      state: {
        addresses: [],
        contacts: [],
        coupons: [],
        invoices: [],
        invoiceDetails: {},
        invoiceRejectionReasons: {},
        invoiceType: 'normal',
        invoiceTitle: 'enterprise',
        receiverEmail: 'persisted@example.com',
        selectedInvoiceOrderIds: [],
        settings: [],
        account: {
          displayName: '持久化货主',
          boundPhone: '13800138000',
          avatarPhotoCount: 0,
        },
        password: {
          savedPassword: 'abc123',
          updatedAt: '未修改',
        },
      },
    }),
  });

  const app = await renderApp(2000);
  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('广州');
  expect(renderedText).toContain('持久化货主');
  expect(renderedText).toContain('持久化装货地');
  expect(renderedText).toContain('持久化卸货地');
});

test('resumes a pending platform payment from the server on cold start', async () => {
  const now = Date.parse('2026-07-15T08:00:00.000Z');
  const persistedPendingPaymentOrder = {
    ...getAppRuntimeState().orders[0],
    id: 'HY202607150001',
    platformOrderId: 'order-platform-payment-1',
    paymentMethod: 'online' as const,
    paymentMethodText: '在线支付',
    paymentStatus: 'pending' as const,
    syncState: {
      status: 'synced' as const,
      message: '订单已从平台 API 同步。',
      updatedAtText: '刚刚',
      updatedAtIso: '2026-07-15T07:58:00.000Z',
      queueItems: [],
    },
  };
  await AsyncStorage.setMany({
    '@vireCodeing/auth-session': JSON.stringify({
      issuedAt: now - 1000,
      expiresAt: now + 60 * 60 * 1000,
      accessToken: 'access.pending-payment.3600',
    }),
    '@vireCodeing/pending-platform-payment': JSON.stringify({
      orderId: 'order-platform-payment-1',
      paymentId: 'payment-1',
      channel: 'wechat',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      createdAtIso: '2026-07-15T07:59:00.000Z',
    }),
    '@vireCodeing/app-runtime-state': JSON.stringify({
      version: 1,
      state: {
        orders: [persistedPendingPaymentOrder],
        messages: [],
        messageUnreadCount: 0,
      },
    }),
  });
  const terminalPayment = {
    id: 'payment-1',
    paymentNo: 'PAY-1',
    orderId: 'order-platform-payment-1',
    orderNo: 'HY202607150001',
    shipperId: 'shipper-pending-payment',
    channel: 'wechat',
    amountCents: 31000,
    status: 'escrowed',
    clientPayload: { prepayId: 'prepay-1' },
    expiresAtIso: '2026-07-15T08:15:00.000Z',
    paidAtIso: '2026-07-15T08:00:30.000Z',
    createdAtIso: '2026-07-15T07:59:00.000Z',
    updatedAtIso: '2026-07-15T08:00:30.000Z',
  };
  const fetchMock = jest.fn((input: RequestInfo | URL) => {
    const requestUrl = String(input);
    if (requestUrl.endsWith('/me')) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'shipper-pending-payment',
          phone: '13800138000',
          userType: 'shipper',
        }),
      );
    }
    if (
      requestUrl.endsWith(
        '/shipper/orders/order-platform-payment-1/payments',
      )
    ) {
      return Promise.resolve(createPlatformApiResponse(terminalPayment));
    }
    return Promise.reject(new Error(`Unexpected request: ${requestUrl}`));
  });
  installPlatformFetchMock(fetchMock);
  const paymentSdk: PlatformPaymentSdk = {
    openPayment: jest.fn(),
  };

  await renderApp(now, {
    platformApiBaseUrl: 'http://localhost:3000/api',
    paymentSdk,
  });

  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:3000/api/shipper/orders/order-platform-payment-1/payments',
    expect.objectContaining({ method: 'GET' }),
  );
  await expect(
    AsyncStorage.getItem('@vireCodeing/pending-platform-payment'),
  ).resolves.toBeNull();
  expect(paymentSdk.openPayment).not.toHaveBeenCalled();
  expect(getAppRuntimeState().orders[0]).toMatchObject({
    id: 'HY202607150001',
    platformOrderId: 'order-platform-payment-1',
    paymentStatus: 'escrowed',
    paymentChannel: 'wechat',
    syncState: {
      status: 'synced',
    },
  });
});

test('registers the push token with the platform after restoring a platform session', async () => {
  const originalFetch = globalThis.fetch;
  const now = Date.parse('2026-07-24T08:00:00.000Z');

  saveAuthSession(
    now,
    {
      accessToken: 'access.push-registration.old',
      refreshToken: 'refresh.push-registration.old',
      expiresIn: 900,
    },
    'mobile-device-restored',
  );
  await flushMicrotasks();

  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(input);
    const requestMethod = init?.method ?? 'GET';

    if (
      requestUrl === 'http://localhost:3000/api/auth/refresh' &&
      requestMethod === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          accessToken: 'access.push-registration.new',
          refreshToken: 'refresh.push-registration.new',
          expiresIn: 900,
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/me' &&
      requestMethod === 'GET'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'shipper-push-registration',
          phone: '13800138000',
          userType: 'shipper',
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/me/device-token' &&
      requestMethod === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          registered: true,
          token: 'ExponentPushToken[mock-token]',
        }),
      );
    }

    return Promise.reject(new Error(`Unexpected request: ${requestUrl}`));
  });
  installPlatformFetchMock(fetchMock);

  try {
    await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
      await flushMacrotask();
      await flushMicrotasks();
    });

    const registerCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/me/device-token',
      method: 'POST',
    });

    expect(registerCall).toBeDefined();
    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/me/device-token',
        method: 'POST',
      }),
    ).toHaveLength(1);
    expect(registerCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(
            /^Bearer access\.push-registration\./,
          ),
        }),
      }),
    );
    expect(JSON.parse(String(registerCall?.[1]?.body))).toEqual({
      pushToken: 'ExponentPushToken[mock-token]',
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      deviceId: 'mobile-device-restored',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not register the push token after restoring a platform session when order notifications are disabled locally', async () => {
  const originalFetch = globalThis.fetch;
  const now = Date.parse('2026-07-24T08:00:00.000Z');

  await setLocalOrderNotificationsEnabled(false);
  saveAuthSession(
    now,
    {
      accessToken: 'access.push-disabled.old',
      refreshToken: 'refresh.push-disabled.old',
      expiresIn: 900,
    },
    'mobile-device-restored',
  );
  await flushMicrotasks();

  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(input);
    const requestMethod = init?.method ?? 'GET';
    const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (
      requestUrl === 'http://localhost:3000/api/auth/refresh' &&
      requestMethod === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          accessToken: 'access.push-disabled.new',
          refreshToken: 'refresh.push-disabled.new',
          expiresIn: 900,
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/me' &&
      requestMethod === 'GET'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'shipper-push-disabled',
          phone: '13800138000',
          userType: 'shipper',
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/me/device-tokens' &&
      requestMethod === 'GET'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          items: [
            {
              id: 'push-current-device',
              userId: 'shipper-push-disabled',
              token: 'ExponentPushToken[current-disabled-token]',
              platform: Platform.OS === 'ios' ? 'ios' : 'android',
              deviceId: 'mobile-device-restored',
              isActive: true,
              createdAtIso: '2026-07-24T07:00:00.000Z',
              updatedAtIso: '2026-07-24T07:30:00.000Z',
            },
            {
              id: 'push-other-device',
              userId: 'shipper-push-disabled',
              token: 'ExponentPushToken[other-device-token]',
              platform: Platform.OS === 'ios' ? 'ios' : 'android',
              deviceId: 'mobile-device-other',
              isActive: true,
              createdAtIso: '2026-07-24T06:00:00.000Z',
              updatedAtIso: '2026-07-24T06:30:00.000Z',
            },
          ],
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/me/device-tokens/deactivate' &&
      requestMethod === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          deactivated:
            requestBody?.token ===
            'ExponentPushToken[current-disabled-token]',
        }),
      );
    }

    return Promise.reject(new Error(`Unexpected request: ${requestUrl}`));
  });
  installPlatformFetchMock(fetchMock);

  try {
    await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
      await flushMacrotask();
      await flushMicrotasks();
    });

    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/me/device-token',
        method: 'POST',
      }),
    ).toHaveLength(0);
    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/me/device-tokens',
        method: 'GET',
      }),
    ).toHaveLength(1);
    expect(
      getFetchCallBody<{
        token: string;
      }>(
        findFetchCall(fetchMock, {
          url: 'http://localhost:3000/api/me/device-tokens/deactivate',
          method: 'POST',
        }),
      ),
    ).toEqual({
      token: 'ExponentPushToken[current-disabled-token]',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses the default sandbox payment sdk in platform mode when no native sdk is injected', async () => {
  const originalFetch = globalThis.fetch;
  const now = Date.parse('2026-07-15T09:00:00.000Z');
  const platformOrder = createPlatformOrderFixture({
    id: 'order-platform-payment-default-sdk',
    orderNo: 'HY202607150002',
    shipperId: 'shipper-default-payment',
    status: 'waiting',
    cargoType: 'digital',
    weightText: '1.8 吨',
    quantityText: '18 箱',
    pickupAddress: '宝安临时仓',
    pickupContact: '赵经理',
    pickupPhone: '13800138001',
    deliveryAddress: '南山门店新址',
    deliveryContact: '钱店长',
    deliveryPhone: '13800138002',
    vehicleRequirement: 'medium',
    pickupTimeIso: '2026-07-15T10:30:00.000Z',
    pricingMode: 'fixed',
    priceCents: 76000,
    paymentMethod: 'online',
    createdAtIso: '2026-07-15T08:30:00.000Z',
    updatedAtIso: '2026-07-15T08:30:00.000Z',
  });
  const persistedOnlineOrder = {
    ...getAppRuntimeState().orders[0],
    id: 'HY202607150002',
    platformOrderId: 'order-platform-payment-default-sdk',
    from: '宝安临时仓',
    to: '南山门店新址',
    status: 'waiting' as const,
    paymentMethod: 'online' as const,
    paymentMethodText: '在线支付',
    paymentStatus: 'pending' as const,
    syncState: {
      status: 'synced' as const,
      message: '订单已从平台 API 同步。',
      updatedAtText: '刚刚',
      updatedAtIso: '2026-07-15T08:58:00.000Z',
      queueItems: [],
    },
  };
  await AsyncStorage.setMany({
    '@vireCodeing/auth-session': JSON.stringify({
      issuedAt: now - 1000,
      expiresAt: now + 60 * 60 * 1000,
      accessToken: 'access.default-sandbox-payment.900',
    }),
    '@vireCodeing/app-runtime-state': JSON.stringify({
      version: 1,
      state: {
        orders: [persistedOnlineOrder],
        messages: [],
        messageUnreadCount: 0,
      },
    }),
  });
  const pendingPayment = {
    id: 'payment-default-sdk-1',
    paymentNo: 'PAY-DEFAULT-1',
    orderId: 'order-platform-payment-default-sdk',
    orderNo: 'HY202607150002',
    shipperId: 'shipper-default-payment',
    channel: 'wechat',
    amountCents: 76000,
    status: 'pending',
    clientPayload: { prepayId: 'prepay-default-1' },
    expiresAtIso: '2026-07-15T09:15:00.000Z',
    createdAtIso: '2026-07-15T09:00:00.000Z',
    updatedAtIso: '2026-07-15T09:00:00.000Z',
  };
  const escrowedPayment = {
    ...pendingPayment,
    status: 'escrowed',
    paidAtIso: '2026-07-15T09:00:10.000Z',
    updatedAtIso: '2026-07-15T09:00:10.000Z',
  };
  let paymentCreated = false;
  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(input);
    const requestMethod = normalizeFetchMethod(init?.method);

    if (requestUrl.endsWith('/me') && requestMethod === 'GET') {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'shipper-default-payment',
          phone: '13800138000',
          userType: 'shipper',
        }),
      );
    }

    if (
      requestUrl.endsWith('/shipper/orders/order-platform-payment-default-sdk') &&
      requestMethod === 'GET'
    ) {
      return Promise.resolve(createPlatformApiResponse(platformOrder));
    }

    if (
      requestUrl.endsWith(
        '/shipper/orders/order-platform-payment-default-sdk/payments',
      ) &&
      requestMethod === 'GET'
    ) {
      return paymentCreated
        ? Promise.resolve(createPlatformApiResponse(escrowedPayment))
        : Promise.resolve(
            createPlatformApiErrorResponse(
              404,
              'PAYMENT_ORDER_NOT_AVAILABLE',
              'payment order not available',
            ),
          );
    }

    if (
      requestUrl.endsWith(
        '/shipper/orders/order-platform-payment-default-sdk/payments',
      ) &&
      requestMethod === 'POST'
    ) {
      paymentCreated = true;
      return Promise.resolve(
        createPlatformApiResponse({
          replayed: false,
          payment: pendingPayment,
        }),
      );
    }

    return Promise.reject(new Error(`Unexpected request: ${requestUrl}`));
  });
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'home-recent-order-HY202607150002' })
        .props.onPress();
      await flushMicrotasks();
      await flushMacrotask();
      await flushMicrotasks();
    });

    expect(getRenderedText(app)).toContain('立即支付');
    expect(getRenderedText(app)).not.toContain(
      '当前客户端未配置可用的原生支付能力。',
    );

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'payment-submit' }).props.onPress();
      await flushMicrotasks();
      await flushMacrotask();
      await flushMicrotasks();
    });

    const paymentCreateCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders/order-platform-payment-default-sdk/payments',
      method: 'POST',
    });
    expect(paymentCreateCall).toBeDefined();
    expect(getFetchCallHeaders(paymentCreateCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.default-sandbox-payment.900',
        'Idempotency-Key': expect.stringMatching(uuidV4Pattern),
      }),
    );
    expect(getFetchCallBody(paymentCreateCall)).toEqual({
      channel: 'wechat',
    });
    expect(getRenderedText(app)).toContain('资金已托管');
    expect(getRenderedText(app)).not.toContain('立即支付');
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607150002',
      platformOrderId: 'order-platform-payment-default-sdk',
      paymentStatus: 'escrowed',
      paymentChannel: 'wechat',
      syncState: {
        status: 'synced',
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('restores refundedAtIso when a resumed platform payment has already been refunded', async () => {
  const now = Date.parse('2026-07-15T10:00:00.000Z');
  const persistedPendingPaymentOrder = {
    ...getAppRuntimeState().orders[0],
    id: 'HY202607150001',
    platformOrderId: 'order-platform-payment-1',
    paymentMethod: 'online' as const,
    paymentMethodText: '在线支付',
    paymentStatus: 'refund_pending' as const,
    syncState: {
      status: 'synced' as const,
      message: '订单已从平台 API 同步。',
      updatedAtText: '刚刚',
      updatedAtIso: '2026-07-15T09:58:00.000Z',
      queueItems: [],
    },
  };
  await AsyncStorage.setMany({
    '@vireCodeing/auth-session': JSON.stringify({
      issuedAt: now - 1000,
      expiresAt: now + 60 * 60 * 1000,
      accessToken: 'access.pending-payment.refund',
    }),
    '@vireCodeing/pending-platform-payment': JSON.stringify({
      orderId: 'order-platform-payment-1',
      paymentId: 'payment-1',
      channel: 'wechat',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      createdAtIso: '2026-07-15T09:59:00.000Z',
    }),
    '@vireCodeing/app-runtime-state': JSON.stringify({
      version: 1,
      state: {
        orders: [persistedPendingPaymentOrder],
        messages: [],
        messageUnreadCount: 0,
      },
    }),
  });
  const terminalPayment = {
    id: 'payment-1',
    paymentNo: 'PAY-1',
    orderId: 'order-platform-payment-1',
    orderNo: 'HY202607150001',
    shipperId: 'shipper-pending-payment',
    channel: 'wechat',
    amountCents: 31000,
    status: 'refunded',
    clientPayload: { prepayId: 'prepay-1' },
    expiresAtIso: '2026-07-15T08:15:00.000Z',
    paidAtIso: '2026-07-15T08:00:30.000Z',
    settledAtIso: '2026-07-15T08:30:00.000Z',
    refundedAtIso: '2026-07-15T10:00:00.000Z',
    createdAtIso: '2026-07-15T07:59:00.000Z',
    updatedAtIso: '2026-07-15T10:00:00.000Z',
  };
  const fetchMock = jest.fn((input: RequestInfo | URL) => {
    const requestUrl = String(input);
    if (requestUrl.endsWith('/me')) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'shipper-pending-payment',
          phone: '13800138000',
          userType: 'shipper',
        }),
      );
    }
    if (
      requestUrl.endsWith(
        '/shipper/orders/order-platform-payment-1/payments',
      )
    ) {
      return Promise.resolve(createPlatformApiResponse(terminalPayment));
    }
    return Promise.reject(new Error(`Unexpected request: ${requestUrl}`));
  });
  installPlatformFetchMock(fetchMock);

  await renderApp(now, {
    platformApiBaseUrl: 'http://localhost:3000/api',
    paymentSdk: { openPayment: jest.fn() },
  });

  expect(getAppRuntimeState().orders[0]).toMatchObject({
    id: 'HY202607150001',
    platformOrderId: 'order-platform-payment-1',
    paymentStatus: 'refunded',
    paymentChannel: 'wechat',
    paymentSettledAtIso: '2026-07-15T08:30:00.000Z',
    refundedAtIso: '2026-07-15T10:00:00.000Z',
  });
  await expect(
    AsyncStorage.getItem('@vireCodeing/pending-platform-payment'),
  ).resolves.toBeNull();
});

test('restores persisted local draft from device storage on cold start', async () => {
  await AsyncStorage.setMany({
    '@vireCodeing/auth-session': JSON.stringify({
      issuedAt: 1000,
      expiresAt: 1000 + 7 * 24 * 60 * 60 * 1000,
    }),
    '@vireCodeing/draft-storage': JSON.stringify({
      version: 1,
      savedAt: 1000,
      draft: {
        cargoType: 'digital',
        weightText: '9 吨',
        quantityText: '18 箱',
        pickupAddress: '持久化仓库',
        pickupContact: '赵经理',
        pickupPhone: '13800138001',
        deliveryAddress: '持久化门店',
        deliveryContact: '钱店长',
        deliveryPhone: '13800138002',
        vehicleRequirement: 'box',
        vehicleLengthRequirement: '6m',
        needTailboard: true,
        needTarp: true,
        pickupTimeText: '明天 09:30',
        valueAddedServiceIds: ['loading'],
        pricingMode: 'fixed',
        priceText: '880',
        paymentMethod: 'online',
      },
    }),
  });

  const app = await renderApp(2000);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  expect(app.root.findByProps({ testID: 'draft-weight' }).props.value).toBe(
    '9 吨',
  );
  expect(
    app.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
  ).toBe('持久化仓库');
  expect(
    app.root.findByProps({ testID: 'draft-delivery-address' }).props.value,
  ).toBe('持久化门店');
  expect(app.root.findByProps({ testID: 'draft-price' }).props.value).toBe(
    '880',
  );
});

test('restores persisted negotiable local draft without forcing fixed price mode', async () => {
  await AsyncStorage.setMany({
    '@vireCodeing/auth-session': JSON.stringify({
      issuedAt: 1000,
      expiresAt: 1000 + 7 * 24 * 60 * 60 * 1000,
    }),
    '@vireCodeing/draft-storage': JSON.stringify({
      version: 1,
      savedAt: 1000,
      draft: {
        cargoType: 'digital',
        weightText: '9 吨',
        quantityText: '18 箱',
        pickupAddress: '持久化仓库',
        pickupContact: '赵经理',
        pickupPhone: '13800138001',
        deliveryAddress: '持久化门店',
        deliveryContact: '钱店长',
        deliveryPhone: '13800138002',
        vehicleRequirement: 'box',
        vehicleLengthRequirement: '6m',
        pickupTimeText: '明天 09:30',
        pricingMode: 'negotiable',
        priceText: '',
        paymentMethod: 'cod',
      },
    }),
  });

  const app = await renderApp(2000);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain(
    '议价模式发布后，司机可在待接单阶段提交报价。',
  );
  expect(app.root.findAllByProps({ testID: 'draft-price' })).toHaveLength(0);
});

test('does not restore expired persisted local draft on cold start', async () => {
  const now = 1000 + 24 * 60 * 60 * 1000 + 1;

  await AsyncStorage.setMany({
    '@vireCodeing/auth-session': JSON.stringify({
      issuedAt: 1000,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000,
    }),
    '@vireCodeing/draft-storage': JSON.stringify({
      version: 1,
      savedAt: 1000,
      draft: {
        cargoType: 'digital',
        weightText: '9 吨',
        quantityText: '18 箱',
        pickupAddress: '过期仓库',
        pickupContact: '赵经理',
        pickupPhone: '13800138001',
        deliveryAddress: '过期门店',
        deliveryContact: '钱店长',
        deliveryPhone: '13800138002',
        vehicleRequirement: 'box',
        vehicleLengthRequirement: '6m',
        pickupTimeText: '明天 09:30',
        pricingMode: 'fixed',
        priceText: '880',
        paymentMethod: 'online',
      },
    }),
  });

  const app = await renderApp(now);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  expect(app.root.findByProps({ testID: 'draft-weight' }).props.value).toBe('');
  expect(
    app.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
  ).toBe('');
  expect(getRenderedText(app)).not.toContain('过期仓库');
});

test('marks local draft changes as pending backend sync and retries them', async () => {
  const now = new Date('2026-06-30T03:15:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const app = await renderApp(now);

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('2.5 吨');
  });

  expect(getRenderedText(app)).toContain('草稿同步：待同步');
  expect(getDraftStorageSnapshot()?.syncState?.status).toBe('pending');
  expect(getDraftStorageSnapshot()?.syncState?.updatedAtIso).toBe(expectedIso);
  expect(
    getDraftStorageSnapshot()?.syncState?.queueItems?.[0].updatedAtIso,
  ).toBe(expectedIso);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-sync-retry' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('草稿同步：已同步');
  expect(renderedText).toContain(
    '同步说明：本地草稿已记录，等待平台草稿同步。',
  );
  expect(getDraftStorageSnapshot()?.syncState?.status).toBe('synced');
  expect(getDraftStorageSnapshot()?.syncState?.updatedAtIso).toBe(expectedIso);
});

test('shows a local draft sync failure queue and retries it', async () => {
  const now = new Date('2026-06-30T03:15:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const app = await renderApp(now);

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('3.2 吨');
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('草稿同步队列');
  expect(renderedText).toContain('发单草稿变更：待同步');
  expect(renderedText).toContain('草稿已保留在本地，待平台草稿同步');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-sync-mark-failed' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('草稿同步：同步失败');
  expect(renderedText).toContain('发单草稿变更：同步失败');
  expect(renderedText).toContain('草稿同步未完成，已保留本地草稿队列');
  expect(getDraftStorageSnapshot()?.syncState?.status).toBe('failed');
  expect(getDraftStorageSnapshot()?.syncState?.updatedAtIso).toBe(expectedIso);
  expect(
    getDraftStorageSnapshot()?.syncState?.queueItems?.[0].updatedAtIso,
  ).toBe(expectedIso);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-sync-retry' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('草稿同步：已同步');
  expect(renderedText).toContain('暂无待同步草稿');
  expect(getDraftStorageSnapshot()?.syncState?.status).toBe('synced');
  expect(getDraftStorageSnapshot()?.syncState?.updatedAtIso).toBe(expectedIso);
});

function collectText(node: unknown): string[] {
  if (typeof node === 'string') {
    return [node];
  }

  if (Array.isArray(node)) {
    return node.flatMap(collectText);
  }

  if (node && typeof node === 'object' && 'children' in node) {
    const children = (node as { children?: unknown }).children;
    return collectText(children ?? []);
  }

  return [];
}

async function renderApp(
  now?: number,
  options: {
    platformApiBaseUrl?: string;
    paymentSdk?: PlatformPaymentSdk;
  } = {},
): Promise<AppRenderer> {
  let renderer: AppRenderer | undefined;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <App
        now={now}
        platformApiBaseUrl={options.platformApiBaseUrl}
        paymentSdk={options.paymentSdk}
      />,
    );
    await flushMicrotasks();
    await flushMacrotask();
    await flushMicrotasks();
  });

  if (!renderer) {
    throw new Error('Renderer was not created');
  }

  mountedRenderers.push(renderer);

  return renderer;
}

async function setLocalOrderNotificationsEnabled(enabled: boolean) {
  const currentProfileState = getProfileLocalState();
  const nextState = {
    ...currentProfileState,
    settings: currentProfileState.settings.map(setting =>
      setting.id === 'setting-notification'
        ? {
            ...setting,
            statusText: enabled ? '已开启' : '已关闭',
          }
        : setting,
    ),
  };

  await AsyncStorage.setItem(
    '@vireCodeing/profile-local-state',
    JSON.stringify({
      version: 1,
      state: nextState,
    }),
  );
  saveProfileLocalState(nextState);
}

async function flushMicrotasks() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

async function flushMacrotask() {
  await new Promise<void>(resolve => {
    setTimeout(() => resolve(), 0);
  });
}

function createPlatformApiResponse<T>(data: T) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      code: 'OK',
      message: 'success',
      data,
      requestId: 'req-test',
      timestamp: '2026-06-26T00:00:00.000Z',
    }),
  };
}

async function publishDigitalPlatformOrderFromHome(app: AppRenderer) {
  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
    await flushMicrotasks();
  });
  fillDigitalDraft(app);
  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
    await flushMicrotasks();
  });
}

function installPlatformFetchMock(fetchMock: jest.Mock) {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(input);

    if (
      requestUrl.includes('/me/messages?') &&
      (!init?.method || init.method === 'GET')
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          items: [],
          page: 1,
          pageSize: 50,
          total: 0,
          unreadCount: 0,
        }),
      );
    }

    if (
      requestUrl.endsWith('/navigation-targets') &&
      (!init?.method || init.method === 'GET')
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          orderId: 'order-platform-navigation-fallback',
          orderNo: 'HYTESTNAVIGATION',
          targets: [],
        }),
      );
    }

    if (
      requestUrl.endsWith('/exception-cases') &&
      (!init?.method || init.method === 'GET')
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          items: [],
          total: 0,
        }),
      );
    }

    if (
      requestUrl.endsWith('/driver/bank-cards') &&
      (!init?.method || init.method === 'GET')
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          items: [],
          total: 0,
        }),
      );
    }

    return fetchMock(input, init);
  }) as typeof fetch;
}

type FetchRequestMatcher = {
  url?: string;
  urlEndsWith?: string;
  urlIncludes?: string;
  method?: string;
};

type FetchMockCall = [RequestInfo | URL, RequestInit | undefined];

function normalizeFetchMethod(method?: string) {
  return (method ?? 'GET').toUpperCase();
}

function matchesFetchCall(call: FetchMockCall, matcher: FetchRequestMatcher) {
  const [input, init] = call;
  const requestUrl = String(input);

  return (
    (!matcher.url || requestUrl === matcher.url) &&
    (!matcher.urlEndsWith || requestUrl.endsWith(matcher.urlEndsWith)) &&
    (!matcher.urlIncludes || requestUrl.includes(matcher.urlIncludes)) &&
    (!matcher.method ||
      normalizeFetchMethod(init?.method) === matcher.method.toUpperCase())
  );
}

function findFetchCall(fetchMock: jest.Mock, matcher: FetchRequestMatcher) {
  return fetchMock.mock.calls.find(call =>
    matchesFetchCall(call as FetchMockCall, matcher),
  ) as FetchMockCall | undefined;
}

function findFetchCalls(fetchMock: jest.Mock, matcher: FetchRequestMatcher) {
  return fetchMock.mock.calls.filter(call =>
    matchesFetchCall(call as FetchMockCall, matcher),
  ) as FetchMockCall[];
}

function findLastFetchCall(fetchMock: jest.Mock, matcher: FetchRequestMatcher) {
  const matchingCalls = findFetchCalls(fetchMock, matcher);

  return matchingCalls[matchingCalls.length - 1];
}

function getFetchCallBody<T>(call: FetchMockCall | undefined) {
  if (!call?.[1]?.body) {
    throw new Error('Expected fetch call body');
  }

  return JSON.parse(String(call[1].body)) as T;
}

function getFetchCallHeaders(call: FetchMockCall | undefined) {
  return (call?.[1]?.headers ?? {}) as Record<string, string>;
}

function createPlatformApiErrorResponse(
  status: number,
  code: string,
  message: string,
) {
  return {
    ok: false,
    status,
    json: async () => ({
      code,
      message,
      requestId: 'req-test',
      timestamp: '2026-06-26T00:00:00.000Z',
    }),
  };
}

function createLocalDayIsoRange(now: number) {
  const currentDate = new Date(now);
  const startOfDay = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate(),
  );
  const nextDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  return {
    createdFromIso: startOfDay.toISOString(),
    createdToIso: nextDay.toISOString(),
  };
}

function createPlatformOrderFixture(
  overrides: Partial<{
    id: string;
    orderNo: string;
    shipperId: string;
    status: string;
    cargoType: string;
    weightText: string;
    quantityText: string;
    cargoDescription: string;
    cargoPhotoCount: number;
    pickupAddress: string;
    pickupContact: string;
    pickupPhone: string;
    deliveryAddress: string;
    deliveryContact: string;
    deliveryPhone: string;
    vehicleRequirement: string;
    needTailboard: boolean;
    needTarp: boolean;
    pickupTimeIso: string;
    pricingMode: string;
    priceCents: number;
    paymentMethod: string;
    createdAtIso: string;
    updatedAtIso: string;
  }>,
) {
  return {
    id: 'order-platform-fixture',
    orderNo: 'HY202607020000',
    shipperId: 'user-platform-order-list',
    status: 'waiting',
    cargoType: 'food',
    weightText: '3 吨',
    quantityText: '20 箱',
    pickupAddress: '平台装货地',
    pickupContact: '赵经理',
    pickupPhone: '13800138001',
    deliveryAddress: '平台卸货地',
    deliveryContact: '钱店长',
    deliveryPhone: '13800138002',
    vehicleRequirement: 'medium',
    needTailboard: false,
    needTarp: false,
    pickupTimeIso: '2026-07-02T01:30:00.000Z',
    pricingMode: 'fixed',
    priceCents: 88000,
    paymentMethod: 'cod',
    createdAtIso: '2026-07-01T08:00:00.000Z',
    updatedAtIso: '2026-07-01T09:00:00.000Z',
    ...overrides,
  };
}

async function loginToHome(app: AppRenderer) {
  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-phone' })
      .props.onChangeText('13800138000');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-login-code-send' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-code' })
      .props.onChangeText('123456');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
  });
}

async function loginToHomeWithPlatformAuth(app: AppRenderer) {
  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-phone' })
      .props.onChangeText('13800138000');
  });

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'auth-login-code-send' }).props.onPress();
    await flushMicrotasks();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-code' })
      .props.onChangeText('999999');
  });

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
    await flushMicrotasks();
    await flushMacrotask();
    await flushMicrotasks();
  });
}

function fillDigitalDraft(app: AppRenderer) {
  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });
}

async function submitLocalEnterpriseVerificationFromHome(
  app: AppRenderer,
  enterpriseName = '深圳晨星贸易有限公司',
) {
  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-entry-enterprise-verification' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'enterprise-verification-name' })
      .props.onChangeText(enterpriseName);
    app.root
      .findByProps({ testID: 'enterprise-verification-code' })
      .props.onChangeText('91440300MA5TEST001');
    app.root
      .findByProps({ testID: 'enterprise-verification-legal-name' })
      .props.onChangeText('张先生');
    app.root
      .findByProps({ testID: 'enterprise-verification-legal-id' })
      .props.onChangeText('440300199001011234');
    app.root
      .findByProps({ testID: 'enterprise-verification-phone' })
      .props.onChangeText('13900139088');
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'enterprise-verification-license-photo' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'enterprise-verification-submit' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });
}

function getRenderedText(app: AppRenderer) {
  return app.root
    .findAllByType(Text)
    .flatMap(node => collectText(node.props.children))
    .join(' ');
}

async function getStoredSnapshot<T>(key: string): Promise<T> {
  const storedValue = await AsyncStorage.getItem(key);

  if (storedValue) {
    return JSON.parse(storedValue) as T;
  }

  const matchingSetItemCall = [
    ...(AsyncStorage.setItem as jest.Mock).mock.calls,
  ]
    .reverse()
    .find(([storedKey]) => storedKey === key);

  if (!matchingSetItemCall) {
    throw new Error(`Missing stored value for ${key}`);
  }

  return JSON.parse(matchingSetItemCall[1]) as T;
}

function getFrequentRouteNameOrder(app: AppRenderer) {
  const routeNames = ['宝安仓库 → 南山门店', '龙岗工厂 → 福田展厅'];

  return app.root
    .findAllByType(Text)
    .map(node => collectText(node.props.children).join(''))
    .filter(text => routeNames.includes(text));
}

async function openFirstRecentOrder(app: AppRenderer) {
  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260622001' })
      .props.onPress();
  });
}

async function openOrderList(app: AppRenderer) {
  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-orders-view-all' }).props.onPress();
  });
}

test('logs in from the auth screen and reaches the shipper home', async () => {
  const renderer = await renderApp();

  const initialText = renderer.root
    .findAllByType(Text)
    .flatMap(node => collectText(node.props.children))
    .join(' ');

  expect(initialText).toContain('账号验证');
  expect(initialText).toContain('登录');
  expect(initialText).toContain('注册');

  const phoneInput = renderer.root.findByProps({
    testID: 'auth-login-phone',
  });
  const codeInput = renderer.root.findByProps({
    testID: 'auth-login-code',
  });
  const codeSendButton = renderer.root.findByProps({
    testID: 'auth-login-code-send',
  });
  const submitButton = renderer.root.findByProps({
    testID: 'auth-login-submit',
  });

  ReactTestRenderer.act(() => {
    phoneInput.props.onChangeText('13800138000');
  });

  ReactTestRenderer.act(() => {
    codeSendButton.props.onPress();
  });

  ReactTestRenderer.act(() => {
    codeInput.props.onChangeText('123456');
  });

  ReactTestRenderer.act(() => {
    submitButton.props.onPress();
  });

  const renderedText = renderer.root
    .findAllByType(Text)
    .flatMap(node => collectText(node.props.children))
    .join(' ');

  expect(renderedText).toContain('货运发单');
  expect(renderedText).toContain('立即发货');
  expect(renderedText).toContain('待接单');
  expect(renderedText).toContain('常用路线');
  expect(renderedText).toContain('最近订单');
});

test('opens the recent order detail from the home screen', async () => {
  const renderer = await renderApp();

  await loginToHome(renderer);

  const recentOrder = renderer.root.findByProps({
    testID: 'home-recent-order-HY20260622001',
  });

  ReactTestRenderer.act(() => {
    recentOrder.props.onPress();
  });

  const renderedText = renderer.root
    .findAllByType(Text)
    .flatMap(node => collectText(node.props.children))
    .join(' ');

  expect(renderedText).toContain('订单详情');
  expect(renderedText).toContain('HY20260622001');
  expect(renderedText).toContain('查看报价');
});

test('shows latest exception compensation snapshots on recent order cards', async () => {
  await AsyncStorage.setItem(
    '@vireCodeing/app-runtime-state',
    JSON.stringify({
      version: 1,
      state: {
        orders: [
          {
            id: 'HYCASE001',
            status: 'transporting',
            from: '深圳南山仓',
            to: '东莞松山湖仓',
            cargoType: '建材',
            weightText: '3 吨',
            vehicleRequirement: '中型货车',
            priceText: '￥880',
            updatedAtText: '刚刚更新',
            latestExceptionCase: {
              id: 'case-1',
              caseNo: 'YC202607180003',
              sourceEventId: 'event-1',
              sourceRole: 'driver',
              status: 'resolved',
              resolutionText: '客服判定货主线下赔付司机。',
              compensationStatus: 'offline_completed',
              compensationTargetRole: 'driver',
              compensationAmountCents: 8800,
              compensationUpdatedAtIso: '2026-07-18T08:25:00.000Z',
              createdAtIso: '2026-07-18T08:00:00.000Z',
              updatedAtIso: '2026-07-18T08:25:00.000Z',
            },
          },
        ],
        messages: [],
      },
    }),
  );

  const app = await renderApp();

  await loginToHome(app);

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('最新异常：YC202607180003 · 已解决');
  expect(renderedText).toContain(
    '赔付决议：线下已赔付 · 对象：司机 · 金额：￥88.00',
  );
});

test('advances a waiting order through the local status flow', async () => {
  const app = await renderApp();

  await loginToHome(app);
  await openFirstRecentOrder(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-progress-action' })
      .props.onPress();
  });

  expect(getRenderedText(app)).toContain('司机已接单 · 刚刚');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-progress-action' })
      .props.onPress();
  });

  expect(getRenderedText(app)).toContain('货物运输中 · 刚刚');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-progress-action' })
      .props.onPress();
  });

  expect(getRenderedText(app)).toContain('等待货主确认 · 刚刚');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-progress-action' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('订单已完成 · 刚刚');
  expect(renderedText).toContain('评价司机');
});

test('cancels a waiting order from the detail screen', async () => {
  const app = await renderApp();

  await loginToHome(app);
  await openFirstRecentOrder(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-secondary-action' })
      .props.onPress();
  });

  expect(getRenderedText(app)).toContain('取消原因');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'cancel-reason-plan-change' })
      .props.onPress();
    app.root
      .findByProps({ testID: 'cancel-description' })
      .props.onChangeText('客户临时调整发货计划');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'cancel-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('已取消 · 刚刚');
  expect(renderedText).toContain('已取消');
  expect(renderedText).toContain('取消原因：计划有变');
  expect(renderedText).toContain('客户临时调整发货计划');
  expect(renderedText).toContain(
    '违约提示：待接单取消，本地演示不产生违约费用。',
  );
  expect(renderedText).toContain('结算结果：无违约金');
  expect(renderedText).toContain('退款状态：无需退款');
  expect(renderedText).toContain('客服审核：系统自动通过');
  expect(renderedText).toContain('重新下单');
});

test('records local settlement review when cancelling an assigned order', async () => {
  const app = await renderApp();

  await loginToHome(app);
  await openFirstRecentOrder(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-quote-select-D1001' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-secondary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'cancel-description' })
      .props.onChangeText('司机接单后客户取消运输');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'cancel-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain(
    '违约提示：司机已接单，本地演示提示需客服确认违约费用。',
  );
  expect(renderedText).toContain('结算结果：待客服确认违约金');
  expect(renderedText).toContain(
    '退款状态：支付资金暂不变更，客服确认后更新退款状态',
  );
  expect(renderedText).toContain('客服审核：待客服确认');
  expect(renderedText).toContain(
    '司机通知：已生成司机取消通知，等待客服确认后同步',
  );
});

test('adds a local bonus to a waiting order', async () => {
  const app = await renderApp();

  await loginToHome(app);
  await openFirstRecentOrder(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-bonus-action' })
      .props.onPress();
  });

  expect(getRenderedText(app)).toContain('追加赏金');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'bonus-option-50' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'bonus-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('曝光赏金：￥50');
  expect(renderedText).toContain(
    '已追加赏金 ￥50，待接单订单曝光权重本地提升。',
  );
});

test('accumulates an existing local bonus when appending another bonus', async () => {
  const runtimeState = getAppRuntimeState();
  saveAppRuntimeState({
    ...runtimeState,
    orders: runtimeState.orders.map((order, index) =>
      index === 0
        ? {
            ...order,
            bonusText: '￥20',
          }
        : order,
    ),
  });

  const app = await renderApp();

  await loginToHome(app);
  await openFirstRecentOrder(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-bonus-action' })
      .props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('当前曝光赏金：￥20');
  expect(renderedText).toContain('追加后总赏金：￥40');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'bonus-option-50' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'bonus-submit' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('曝光赏金：￥70');
  expect(renderedText).toContain(
    '已追加赏金 ￥50，当前总赏金 ￥70，待接单订单曝光权重本地提升。',
  );
});

test('opens the order list from the recent orders header', async () => {
  const renderer = await renderApp();

  await loginToHome(renderer);

  const viewAllOrders = renderer.root.findByProps({
    testID: 'home-orders-view-all',
  });

  ReactTestRenderer.act(() => {
    viewAllOrders.props.onPress();
  });

  const renderedText = renderer.root
    .findAllByType(Text)
    .flatMap(node => collectText(node.props.children))
    .join(' ');

  expect(renderedText).toContain('全部订单');
  expect(renderedText).toContain('待接单');
  expect(renderedText).toContain('已完成');
});

test('opens the order list from the order status header', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-status-view-all' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('我的订单');
  expect(renderedText).toContain('全部订单');
  expect(renderedText).toContain('订单管理');
});

test('returns to the order list after opening a detail from the order list', async () => {
  const app = await renderApp();

  await loginToHome(app);
  await openOrderList(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260622001' })
      .props.onPress();
  });

  expect(getRenderedText(app)).toContain('订单详情');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('我的订单');
  expect(renderedText).toContain('订单管理');
  expect(renderedText).not.toContain('货运发单');
});

test('requires agreement before registering', async () => {
  const renderer = await renderApp();

  const registerTab = renderer.root.findByProps({
    testID: 'auth-tab-register',
  });

  ReactTestRenderer.act(() => {
    registerTab.props.onPress();
  });

  const phoneInput = renderer.root.findByProps({
    testID: 'auth-register-phone',
  });
  const codeInput = renderer.root.findByProps({
    testID: 'auth-register-code',
  });
  const codeSendButton = renderer.root.findByProps({
    testID: 'auth-register-code-send',
  });
  const passwordInput = renderer.root.findByProps({
    testID: 'auth-register-password',
  });
  const submitButton = renderer.root.findByProps({
    testID: 'auth-register-submit',
  });

  ReactTestRenderer.act(() => {
    phoneInput.props.onChangeText('13800138000');
  });

  ReactTestRenderer.act(() => {
    codeSendButton.props.onPress();
  });

  ReactTestRenderer.act(() => {
    codeInput.props.onChangeText('123456');
    passwordInput.props.onChangeText('abc123');
  });

  ReactTestRenderer.act(() => {
    submitButton.props.onPress();
  });

  let renderedText = renderer.root
    .findAllByType(Text)
    .flatMap(node => collectText(node.props.children))
    .join(' ');

  expect(renderedText).toContain('请先勾选用户协议和隐私政策');

  const agreement = renderer.root.findByProps({
    testID: 'auth-register-agreement',
  });

  ReactTestRenderer.act(() => {
    agreement.props.onPress();
  });

  const agreedSubmitButton = renderer.root.findByProps({
    testID: 'auth-register-submit',
  });

  ReactTestRenderer.act(() => {
    agreedSubmitButton.props.onPress();
  });

  renderedText = renderer.root
    .findAllByType(Text)
    .flatMap(node => collectText(node.props.children))
    .join(' ');

  expect(renderedText).toContain('货运发单');
});

test('requires requesting a login code before logging in', async () => {
  const app = await renderApp();

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-phone' })
      .props.onChangeText('13800138000');
    app.root
      .findByProps({ testID: 'auth-login-code' })
      .props.onChangeText('123456');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('请先获取验证码');
  expect(renderedText).not.toContain('货运发单');
});

test('injects platform auth api into the auth screen when base url is configured', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-1',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-user.900',
          refreshToken: 'refresh.platform-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null));

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'auth-login-phone' })
        .props.onChangeText('13800138000');
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'auth-login-code-send' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'auth-login-code' })
        .props.onChangeText('999999');
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
      await flushMicrotasks();
    });

    const sendCodeCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/auth/send-code',
      method: 'POST',
    });
    expect(sendCodeCall).toBeDefined();
    expect(getFetchCallBody(sendCodeCall)).toMatchObject({
      phone: '13800138000',
      purpose: 'login',
    });

    const loginCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/auth/login',
      method: 'POST',
    });
    expect(loginCall).toBeDefined();
    expect(getFetchCallBody(loginCall)).toMatchObject({
      phone: '13800138000',
      code: '999999',
      userType: 'shipper',
      deviceId: getDeviceId(),
    });
    expect(getRenderedText(app)).toContain('货运发单');
    expect(getAuthSessionSnapshot()).toMatchObject({
      accessToken: 'access.platform-user.900',
      refreshToken: 'refresh.platform-user.604800',
      expiresAt: 1000 + 900 * 1000,
      deviceId: getDeviceId(),
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('syncs the platform authenticated phone into local profile account state', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-profile',
          phone: '13900139999',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-profile-user.900',
          refreshToken: 'refresh.platform-profile-user.604800',
          expiresIn: 900,
        },
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'auth-login-phone' })
        .props.onChangeText('13900139999');
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'auth-login-code-send' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'auth-login-code' })
        .props.onChangeText('999999');
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(app)).toContain('手机号：139****9999');

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
    });

    expect(getRenderedText(app)).toContain('绑定手机号：13900139999');
    expect(getProfileLocalState().account.boundPhone).toBe('13900139999');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shows platform-aware profile entry descriptions and badge in profile center overview', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-profile-overview',
          phone: '13900139999',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-profile-overview.900',
          refreshToken: 'refresh.platform-profile-overview.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null));

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
      await flushMicrotasks();
    });

    const renderedText = getRenderedText(app);

    expect(renderedText).toContain('平台同步');
    expect(renderedText).toContain(
      '管理装货和卸货地址，并同步平台地址簿快照',
    );
    expect(renderedText).toContain(
      '保存装卸联系人，并同步平台地址簿快照',
    );
    expect(renderedText).toContain(
      '查看平台优惠券状态、锁定和使用结果',
    );
    expect(renderedText).not.toContain('本地版展示高频地址');
    expect(renderedText).not.toContain('本地版展示高频联系人');
    expect(renderedText).not.toContain('本地版演示筛选和使用');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses platform auth api from runtime config when prop base url is not provided', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '888888',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-runtime-config',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.runtime-user.900',
          refreshToken: 'refresh.runtime-user.604800',
          expiresIn: 900,
        },
      }),
    );

  (globalThis as PlatformRuntimeConfigGlobal).__TRUCK_PLATFORM_CONFIG__ = {
    apiBaseUrl: 'http://runtime.example/api',
  };
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(1000);

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'auth-login-phone' })
        .props.onChangeText('13800138000');
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'auth-login-code-send' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'auth-login-code' })
        .props.onChangeText('888888');
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
      await flushMicrotasks();
    });

    const sendCodeCall = findFetchCall(fetchMock, {
      url: 'http://runtime.example/api/auth/send-code',
      method: 'POST',
    });
    expect(sendCodeCall).toBeDefined();
    expect(getFetchCallBody(sendCodeCall)).toMatchObject({
      phone: '13800138000',
      purpose: 'login',
    });

    const loginCall = findFetchCall(fetchMock, {
      url: 'http://runtime.example/api/auth/login',
      method: 'POST',
    });
    expect(loginCall).toBeDefined();
    expect(getFetchCallBody(loginCall)).toMatchObject({
      phone: '13800138000',
      code: '888888',
      userType: 'shipper',
      deviceId: getDeviceId(),
    });
    expect(getRenderedText(app)).toContain('货运发单');
    expect(getAuthSessionSnapshot()).toMatchObject({
      accessToken: 'access.runtime-user.900',
      refreshToken: 'refresh.runtime-user.604800',
      expiresAt: 1000 + 900 * 1000,
      deviceId: getDeviceId(),
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete (globalThis as PlatformRuntimeConfigGlobal)
      .__TRUCK_PLATFORM_CONFIG__;
  }
});

test('refreshes platform auth tokens on startup when a refresh token is saved', async () => {
  await AsyncStorage.setItem(
    '@vireCodeing/auth-session',
    JSON.stringify({
      issuedAt: 1000,
      expiresAt: 901000,
      accessToken: 'access.old-platform-user.900',
      refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440101',
    }),
  );

  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn().mockResolvedValueOnce(
    createPlatformApiResponse({
      accessToken: 'access.refreshed-platform-user.900',
      refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440102',
      expiresIn: 900,
    }),
  );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(2000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440101',
          deviceId: 'local-device',
        }),
      }),
    );
    expect(getRenderedText(app)).toContain('货运发单');
    expect(getAuthSessionSnapshot()).toMatchObject({
      issuedAt: 2000,
      expiresAt: 902000,
      accessToken: 'access.refreshed-platform-user.900',
      refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440102',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps a saved platform auth session when startup token refresh has a network failure', async () => {
  await AsyncStorage.setItem(
    '@vireCodeing/auth-session',
    JSON.stringify({
      issuedAt: 1000,
      expiresAt: 901000,
      accessToken: 'access.cached-platform-user.900',
      refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440103',
    }),
  );

  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockRejectedValue(new TypeError('Network request failed'));

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(2000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440103',
          deviceId: 'local-device',
        }),
      }),
    );
    expect(getRenderedText(app)).toContain('货运发单');
    expect(getAuthSessionSnapshot()).toMatchObject({
      issuedAt: 1000,
      expiresAt: 901000,
      accessToken: 'access.cached-platform-user.900',
      refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440103',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('clears a saved platform auth session when startup token refresh is rejected as invalid', async () => {
  await AsyncStorage.setItem(
    '@vireCodeing/auth-session',
    JSON.stringify({
      issuedAt: 1000,
      expiresAt: 901000,
      accessToken: 'access.invalid-platform-user.900',
      refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440104',
    }),
  );

  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn().mockResolvedValueOnce({
    ok: false,
    status: 401,
    json: async () => ({
      code: 'AUTH_REFRESH_TOKEN_INVALID',
      message: '刷新令牌无效',
      requestId: 'req-refresh-invalid',
      timestamp: '2026-06-26T00:00:00.000Z',
    }),
  });

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(2000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440104',
          deviceId: 'local-device',
        }),
      }),
    );
    expect(getAuthSessionSnapshot()).toBeUndefined();
    expect(getRenderedText(app)).toContain('账号验证');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('syncs platform current user profile after startup token refresh', async () => {
  await AsyncStorage.setItem(
    '@vireCodeing/auth-session',
    JSON.stringify({
      issuedAt: 1000,
      expiresAt: 901000,
      accessToken: 'access.old-profile-user.900',
      refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440105',
    }),
  );

  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        accessToken: 'access.refreshed-profile-user.900',
        refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440106',
        expiresIn: 900,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        id: 'user-refreshed-profile',
        phone: '13900139999',
        userType: 'shipper',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(2000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    const currentUserCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/me',
      method: 'GET',
    });
    expect(currentUserCall).toBeDefined();
    expect(getFetchCallHeaders(currentUserCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.refreshed-profile-user.900',
      }),
    );

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(app)).toContain('手机号：139****9999');
    expect(getProfileLocalState().account.boundPhone).toBe('13900139999');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('clears a saved platform auth session when startup current user lookup reports a disabled user', async () => {
  await AsyncStorage.setItem(
    '@vireCodeing/auth-session',
    JSON.stringify({
      issuedAt: 1000,
      expiresAt: 901000,
      accessToken: 'access.old-disabled-user.900',
      refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440107',
    }),
  );

  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        accessToken: 'access.refreshed-disabled-user.900',
        refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440108',
        expiresIn: 900,
      }),
    )
    .mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        code: 'AUTH_USER_DISABLED',
        message: '账号已禁用',
        requestId: 'req-user-disabled',
        timestamp: '2026-06-26T00:00:00.000Z',
      }),
    });

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(2000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    const currentUserCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/me',
      method: 'GET',
    });
    expect(currentUserCall).toBeDefined();
    expect(getFetchCallHeaders(currentUserCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.refreshed-disabled-user.900',
      }),
    );
    expect(getAuthSessionSnapshot()).toBeUndefined();
    expect(getRenderedText(app)).toContain('账号验证');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('logs out the platform refresh session and deactivates current-device push tokens before clearing local auth state', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(input);
    const requestMethod = init?.method ?? 'GET';
    const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (
      requestUrl === 'http://localhost:3000/api/auth/send-code' &&
      requestMethod === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '777777',
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/auth/login' &&
      requestMethod === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-logout',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-logout-user.900',
            refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440109',
            expiresIn: 900,
          },
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/me/device-tokens' &&
      requestMethod === 'GET'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          items: [
            {
              id: 'push-current-device',
              userId: 'user-platform-logout',
              token: 'ExponentPushToken[logout-current-token]',
              platform: Platform.OS === 'ios' ? 'ios' : 'android',
              deviceId: getDeviceId(),
              isActive: true,
              createdAtIso: '2026-07-24T08:00:00.000Z',
              updatedAtIso: '2026-07-24T08:05:00.000Z',
            },
            {
              id: 'push-other-device',
              userId: 'user-platform-logout',
              token: 'ExponentPushToken[logout-other-token]',
              platform: Platform.OS === 'ios' ? 'ios' : 'android',
              deviceId: 'mobile-device-other',
              isActive: true,
              createdAtIso: '2026-07-24T07:00:00.000Z',
              updatedAtIso: '2026-07-24T07:05:00.000Z',
            },
          ],
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/me/device-tokens/deactivate' &&
      requestMethod === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          deactivated:
            requestBody?.token === 'ExponentPushToken[logout-current-token]',
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/auth/logout' &&
      requestMethod === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          loggedOut: true,
        }),
      );
    }

    return Promise.reject(new Error(`Unexpected request: ${requestUrl}`));
  });

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'auth-login-phone' })
        .props.onChangeText('13800138000');
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'auth-login-code-send' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'auth-login-code' })
        .props.onChangeText('777777');
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-logout' }).props.onPress();
      await flushMicrotasks();
    });

    const logoutCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/auth/logout',
      method: 'POST',
    });
    expect(logoutCall).toBeDefined();
    expect(getFetchCallBody(logoutCall)).toMatchObject({
      refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440109',
      deviceId: getDeviceId(),
    });
    expect(
      getFetchCallBody<{
        token: string;
      }>(
        findFetchCall(fetchMock, {
          url: 'http://localhost:3000/api/me/device-tokens/deactivate',
          method: 'POST',
        }),
      ),
    ).toEqual({
      token: 'ExponentPushToken[logout-current-token]',
    });
    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/me/device-tokens',
        method: 'GET',
      }),
    ).toHaveLength(1);
    expect(getAuthSessionSnapshot()).toBeUndefined();
    expect(getRenderedText(app)).toContain('账号验证');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects a mismatched local login code', async () => {
  const app = await renderApp(1000);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-phone' })
      .props.onChangeText('13800138000');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-login-code-send' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-code' })
      .props.onChangeText('654321');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('验证码不正确，请输入本地演示验证码');
  expect(renderedText).toContain('账号验证');
  expect(renderedText).not.toContain('货运发单');
});

test('expires a local login code after five minutes', async () => {
  const app = await renderApp(1000);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-phone' })
      .props.onChangeText('13800138000');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-login-code-send' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.update(<App now={301001} />);
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-code' })
      .props.onChangeText('123456');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('验证码已过期，请重新获取');
  expect(renderedText).not.toContain('货运发单');
});

test('shows a local login code resend countdown before allowing another code', async () => {
  const app = await renderApp(1000);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-phone' })
      .props.onChangeText('13800138000');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-login-code-send' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('60 秒后重试');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-login-code-send' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('请 60 秒后重新获取验证码');

  ReactTestRenderer.act(() => {
    app.update(<App now={31000} />);
  });

  expect(getRenderedText(app)).toContain('30 秒后重试');

  ReactTestRenderer.act(() => {
    app.update(<App now={61000} />);
  });

  expect(getRenderedText(app)).toContain('重新获取');
});

test('enforces the local login code hourly request limit', async () => {
  const app = await renderApp(1000);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-phone' })
      .props.onChangeText('13800138000');
  });

  for (let sendIndex = 0; sendIndex < 5; sendIndex += 1) {
    ReactTestRenderer.act(() => {
      app.update(<App now={1000 + sendIndex * 61000} />);
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'auth-login-code-send' }).props.onPress();
    });
  }

  ReactTestRenderer.act(() => {
    app.update(<App now={306000} />);
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-login-code-send' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain(
    '同一手机号 1 小时内最多获取 5 次验证码',
  );

  ReactTestRenderer.act(() => {
    app.update(<App now={3601001} />);
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-login-code-send' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain(
    '验证码已发送到 138****8000，当前为本地演示页。',
  );
});

test('requires a stronger register password', async () => {
  const app = await renderApp();

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-tab-register' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-register-phone' })
      .props.onChangeText('13800138000');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-register-code-send' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-register-code' })
      .props.onChangeText('123456');
    app.root
      .findByProps({ testID: 'auth-register-password' })
      .props.onChangeText('123456');
    app.root.findByProps({ testID: 'auth-register-agreement' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-register-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('密码需至少 6 位并包含字母和数字');
  expect(renderedText).not.toContain('货运发单');
  expect(renderedText).not.toContain('立即发货');
});

test('rejects a mismatched local register code', async () => {
  const app = await renderApp(1000);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-tab-register' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-register-phone' })
      .props.onChangeText('13800138000');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-register-code-send' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-register-code' })
      .props.onChangeText('654321');
    app.root
      .findByProps({ testID: 'auth-register-password' })
      .props.onChangeText('abc123');
    app.root.findByProps({ testID: 'auth-register-agreement' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-register-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('验证码不正确，请输入本地演示验证码');
  expect(renderedText).toContain('账号验证');
  expect(renderedText).not.toContain('货运发单');
});

test('requires requesting a register code before registering', async () => {
  const app = await renderApp();

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-tab-register' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-register-phone' })
      .props.onChangeText('13800138000');
    app.root
      .findByProps({ testID: 'auth-register-code' })
      .props.onChangeText('123456');
    app.root
      .findByProps({ testID: 'auth-register-password' })
      .props.onChangeText('abc123');
    app.root.findByProps({ testID: 'auth-register-agreement' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-register-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('请先获取验证码');
  expect(renderedText).not.toContain('货运发单');
});

test('expires a local register code after five minutes', async () => {
  const app = await renderApp(1000);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-tab-register' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-register-phone' })
      .props.onChangeText('13800138000');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-register-code-send' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.update(<App now={301001} />);
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-register-code' })
      .props.onChangeText('123456');
    app.root
      .findByProps({ testID: 'auth-register-password' })
      .props.onChangeText('abc123');
    app.root.findByProps({ testID: 'auth-register-agreement' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-register-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('验证码已过期，请重新获取');
  expect(renderedText).not.toContain('货运发单');
});

test('shows a local register code resend countdown before allowing another code', async () => {
  const app = await renderApp(1000);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-tab-register' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-register-phone' })
      .props.onChangeText('13800138000');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-register-code-send' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('60 秒后重试');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-register-code-send' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('请 60 秒后重新获取验证码');

  ReactTestRenderer.act(() => {
    app.update(<App now={61000} />);
  });

  expect(getRenderedText(app)).toContain('重新获取');
});

test('enforces the local register code hourly request limit', async () => {
  const app = await renderApp(1000);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-tab-register' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-register-phone' })
      .props.onChangeText('13800138000');
  });

  for (let sendIndex = 0; sendIndex < 5; sendIndex += 1) {
    ReactTestRenderer.act(() => {
      app.update(<App now={1000 + sendIndex * 61000} />);
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'auth-register-code-send' })
        .props.onPress();
    });
  }

  ReactTestRenderer.act(() => {
    app.update(<App now={306000} />);
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-register-code-send' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain(
    '同一手机号 1 小时内最多获取 5 次验证码',
  );
});

test('persists the local auth session to device storage', async () => {
  const app = await renderApp();

  await loginToHome(app);

  expect(getRenderedText(app)).toContain('货运发单');

  await flushMicrotasks();

  const storedSession = await getStoredSnapshot<{
    issuedAt: number;
    expiresAt: number;
  }>('@vireCodeing/auth-session');

  expect(storedSession.expiresAt).toBeGreaterThan(storedSession.issuedAt);
});

test('expires the local auth session after the configured lifetime', async () => {
  const app = await renderApp();

  await loginToHome(app);

  const snapshot = getAuthSessionSnapshot();

  expect(snapshot?.expiresAt).toBeGreaterThan(snapshot?.issuedAt ?? 0);

  await flushMicrotasks();
  await hydrateAuthSession(snapshot!.expiresAt + 1);

  expect(getAuthSessionSnapshot()).toBeUndefined();
  expect(await AsyncStorage.getItem('@vireCodeing/auth-session')).toBeNull();
});

test('refreshes the local auth session lifetime', async () => {
  const app = await renderApp(1000);

  await loginToHome(app);

  const firstSnapshot = getAuthSessionSnapshot();

  expect(firstSnapshot?.issuedAt).toBe(1000);

  refreshAuthSession(2000);

  const refreshedSnapshot = getAuthSessionSnapshot();

  expect(refreshedSnapshot?.issuedAt).toBe(2000);
  expect(refreshedSnapshot?.expiresAt).toBeGreaterThan(
    firstSnapshot?.expiresAt ?? 0,
  );
});

test('publishes a local order from the draft flow and opens the detail', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  const renderedText = app.root
    .findAllByType(Text)
    .flatMap(node => collectText(node.props.children))
    .join(' ');

  expect(renderedText).toContain('订单详情');
  expect(renderedText).toContain('待接单');
  expect(renderedText).toContain('宝安临时仓');
  expect(renderedText).toContain('南山门店新址');
  expect(renderedText).toContain('数码');
  expect(renderedText).toContain('￥760');
});

test('marks a newly published local order as pending backend sync and retries it', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('后端同步：待同步');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'order-sync-retry' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('后端同步：已同步');
  expect(renderedText).toContain(
    '同步说明：本地订单已记录，等待平台订单同步。',
  );
});

test('shows a local order sync failure queue and retries it', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('订单同步队列');
  expect(renderedText).toContain('订单变更：待同步');
  expect(renderedText).toContain('订单已保留在本地，待平台订单同步');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'order-sync-mark-failed' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('后端同步：同步失败');
  expect(renderedText).toContain('订单变更：同步失败');
  expect(renderedText).toContain('订单同步未完成，已保留本地订单队列');
  expect(getAppRuntimeState().orders[0]?.syncState?.status).toBe('failed');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'order-sync-retry' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('后端同步：已同步');
  expect(renderedText).toContain('暂无待同步订单');
  expect(getAppRuntimeState().orders[0]?.syncState?.status).toBe('synced');
});

test('fills local draft addresses from saved address suggestions', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({
        testID: 'draft-pickup-address-suggestion-address-warehouse',
      })
      .props.onPress();
    app.root
      .findByProps({
        testID: 'draft-delivery-address-suggestion-address-store',
      })
      .props.onPress();
  });

  expect(
    app.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
  ).toBe('宝安区福永物流园');
  expect(
    app.root.findByProps({ testID: 'draft-pickup-contact' }).props.value,
  ).toBe('赵经理');
  expect(
    app.root.findByProps({ testID: 'draft-pickup-phone' }).props.value,
  ).toBe('13800138001');
  expect(
    app.root.findByProps({ testID: 'draft-delivery-address' }).props.value,
  ).toBe('南山区科技园门店');
  expect(
    app.root.findByProps({ testID: 'draft-delivery-contact' }).props.value,
  ).toBe('钱店长');
  expect(
    app.root.findByProps({ testID: 'draft-delivery-phone' }).props.value,
  ).toBe('13800138002');
  expect(getRenderedText(app)).toContain('常用地址建议');
  expect(getRenderedText(app)).toContain(
    '当前建议来自个人中心本地地址簿，登录平台后可同步地址簿快照。',
  );
});

test('uses locally added profile addresses as draft address suggestions', async () => {
  const app = await renderApp();

  await loginToHome(app);
  await flushMicrotasks();
  await flushMacrotask();
  await flushMicrotasks();

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-addresses' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-address-name' })
      .props.onChangeText('龙华临时仓');
    app.root
      .findByProps({ testID: 'profile-address-detail' })
      .props.onChangeText('龙华区临时中转仓');
    app.root
      .findByProps({ testID: 'profile-address-contact' })
      .props.onChangeText('吴主管 13900139001');
    app.root
      .findByProps({ testID: 'profile-address-tag' })
      .props.onChangeText('备用装货地');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-address-submit' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'support-back-home' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({
        testID: 'draft-pickup-address-suggestion-address-local-3',
      })
      .props.onPress();
  });

  expect(
    app.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
  ).toBe('龙华区临时中转仓');
  expect(
    app.root.findByProps({ testID: 'draft-pickup-contact' }).props.value,
  ).toBe('吴主管');
  expect(
    app.root.findByProps({ testID: 'draft-pickup-phone' }).props.value,
  ).toBe('13900139001');
  expect(getRenderedText(app)).toContain('装货：龙华临时仓');
});

test('uses locally added profile contacts as draft contact suggestions', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-contacts' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-contact-name' })
      .props.onChangeText('吴主管');
    app.root
      .findByProps({ testID: 'profile-contact-role' })
      .props.onChangeText('备用装货负责人');
    app.root
      .findByProps({ testID: 'profile-contact-phone' })
      .props.onChangeText('13900139001');
    app.root
      .findByProps({ testID: 'profile-contact-note' })
      .props.onChangeText('龙华临时仓');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-contact-submit' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'support-back-home' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({
        testID: 'draft-pickup-contact-suggestion-contact-local-3',
      })
      .props.onPress();
    app.root
      .findByProps({
        testID: 'draft-delivery-contact-suggestion-contact-local-3',
      })
      .props.onPress();
  });

  expect(
    app.root.findByProps({ testID: 'draft-pickup-contact' }).props.value,
  ).toBe('吴主管');
  expect(
    app.root.findByProps({ testID: 'draft-pickup-phone' }).props.value,
  ).toBe('13900139001');
  expect(
    app.root.findByProps({ testID: 'draft-delivery-contact' }).props.value,
  ).toBe('吴主管');
  expect(
    app.root.findByProps({ testID: 'draft-delivery-phone' }).props.value,
  ).toBe('13900139001');
  expect(getRenderedText(app)).toContain('常用联系人建议');
  expect(getRenderedText(app)).toContain(
    '当前建议来自个人中心本地联系人，登录平台后可同步地址簿快照。',
  );
});

test('generates a local pickup address preview in the order draft flow', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安区福永物流园');
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'draft-pickup-address-preview' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('装货地址预览');
  expect(renderedText).toContain('标准地址：宝安区福永物流园');
  expect(renderedText).toContain('来源：本地地址预览');
  expect(renderedText).toContain('已生成本地预览地址。');
  expect(renderedText).toContain('已生成装货地址预览。');
});

test('publishes a local order with pickup and delivery address notes', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-note' })
      .props.onChangeText('仓库在 3 号门');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-note' })
      .props.onChangeText('卸货停靠西侧货梯');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('装货备注：仓库在 3 号门');
  expect(getRenderedText(app)).toContain('卸货备注：卸货停靠西侧货梯');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);
  const runtimeState = getAppRuntimeState();

  expect(renderedText).toContain('装货备注：仓库在 3 号门');
  expect(renderedText).toContain('卸货备注：卸货停靠西侧货梯');
  expect(runtimeState.orders[0].pickupNoteText).toBe('仓库在 3 号门');
  expect(runtimeState.orders[0].deliveryNoteText).toBe('卸货停靠西侧货梯');
});

test('previews a local order before final publish', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('确认发布订单');
  expect(renderedText).toContain('宝安临时仓');
  expect(renderedText).toContain('南山门店新址');
  expect(renderedText).toContain('数码');
  expect(renderedText).toContain('1.8 吨');
  expect(renderedText).toContain('18 箱');
  expect(renderedText).toContain('装货时间');
  expect(renderedText).toContain('明天 09:30');
  expect(renderedText).toContain('价格');
  expect(renderedText).toContain('￥760');
  expect(renderedText).not.toContain('订单详情');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('订单详情');
  expect(renderedText).toContain('待接单');
});

test('publishes a negotiable local order and shows an empty driver quote state', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root
      .findByProps({ testID: 'draft-pricing-negotiable' })
      .props.onPress();
  });

  expect(app.root.findAllByProps({ testID: 'draft-price' })).toHaveLength(0);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('订单详情');
  expect(renderedText).toContain('待接单');
  expect(renderedText).toContain('宝安临时仓');
  expect(renderedText).toContain('南山门店新址');
  expect(renderedText).toContain('数码');
  expect(renderedText).toContain('司机报价');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('司机报价列表');
  expect(renderedText).toContain(
    '暂无司机报价，议价订单发布后将等待司机提交报价。',
  );
});

test('publishes a local order with a cargo photo voucher', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root.findByProps({ testID: 'draft-cargo-photo-add' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('订单详情');
  expect(renderedText).toContain('货物图片凭证 1 张');
});

test('caps local cargo photo vouchers at six before publishing', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
  });

  for (let index = 0; index < 7; index += 1) {
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-cargo-photo-add' }).props.onPress();
    });
  }

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('货物图片凭证 6 张');
  expect(renderedText).toContain('最多添加 6 张货物图片凭证');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('货物图片凭证 6 张');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('货物图片凭证 6 张');
  expect(getAppRuntimeState().orders[0].cargoPhotoCount).toBe(6);
});

test('shows local cargo photo voucher placeholders and removes one before publishing', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-photo-add' }).props.onPress();
    app.root.findByProps({ testID: 'draft-cargo-photo-add' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('货物图片凭证清单');
  expect(renderedText).toContain('本地图片凭证 1：本地已保存');
  expect(renderedText).toContain('本地图片凭证 2：本地已保存');
  expect(renderedText).toContain('来源：本地图片凭证占位');
  expect(
    app.root.findByProps({ testID: 'draft-cargo-photo-preview-placeholder-1' })
      .props.children,
  ).toBe('货物图片 1');
  expect(
    app.root.findByProps({ testID: 'draft-cargo-photo-preview-placeholder-2' })
      .props.children,
  ).toBe('货物图片 2');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'draft-cargo-photo-remove-latest' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('货物图片凭证 1 张');
  expect(renderedText).toContain('本地图片凭证 1：本地已保存');
  expect(renderedText).not.toContain('本地图片凭证 2：本地已保存');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('货物图片凭证 1 张');
  expect(getAppRuntimeState().orders[0].cargoPhotoCount).toBe(1);
});

test('publishes a local order with value-added service requirements', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
    app.root.findByProps({ testID: 'draft-service-loading' }).props.onPress();
    app.root.findByProps({ testID: 'draft-service-insurance' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-service-protection' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'draft-insured-value' })
      .props.onChangeText('9000');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('增值服务');
  expect(renderedText).toContain('装卸协助');
  expect(renderedText).toContain('保价运输');
  expect(renderedText).toContain('防震包装');
  expect(renderedText).toContain('增值服务参考附加费：￥97');
  expect(renderedText).toContain(
    '本地参考附加费不会自动叠加到一口价，请按实际需求自行计入报价。',
  );

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  renderedText = getRenderedText(app);
  expect(renderedText).toContain('增值服务： 装卸协助（1 人）、保价运输（货值 ￥9000）、防震包装');
});

test('publishes local value-added service details for loading workers and insured value', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
    app.root.findByProps({ testID: 'draft-service-loading' }).props.onPress();
    app.root.findByProps({ testID: 'draft-service-insurance' }).props.onPress();
  });

  const loadingWorkerCountOptions = app.root.findAllByProps({
    testID: 'draft-loading-worker-count-2',
  });
  const insuredValueFields = app.root.findAllByProps({
    testID: 'draft-insured-value',
  });
  const loadingWorkerCountOption = loadingWorkerCountOptions.find(
    option => typeof option.props.onPress === 'function',
  );
  const insuredValueField = insuredValueFields.find(
    field => typeof field.props.onChangeText === 'function',
  );

  expect(loadingWorkerCountOption).toBeTruthy();
  expect(insuredValueField).toBeTruthy();

  ReactTestRenderer.act(() => {
    loadingWorkerCountOption?.props.onPress();
    insuredValueField?.props.onChangeText('12000');
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('装卸协助：￥80（2 人 × ￥40/人）');
  expect(renderedText).toContain('保价运输：￥36（货值 × 0.3%，最低 ￥12）');
  expect(renderedText).toContain('参考附加费合计：￥116');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });
  renderedText = getRenderedText(app);

  expect(renderedText).toContain('增值服务参考附加费：￥116');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });
  const createdOrder = getAppRuntimeState().orders[0];

  expect(renderedText).toContain('装卸协助（2 人）');
  expect(renderedText).toContain('保价运输（货值 ￥12000）');
  expect(createdOrder.valueAddedServicesText).toContain('装卸协助（2 人）');
  expect(createdOrder.valueAddedServicesText).toContain(
    '保价运输（货值 ￥12000）',
  );
});

test('requires insured cargo value when publishing with local insurance service', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
    app.root.findByProps({ testID: 'draft-service-insurance' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('保价运输：待填写货值后生成预估');
  expect(renderedText).toContain(
    '补全保价货值后会生成完整附加费预估；当前不会自动叠加到一口价。',
  );
  expect(renderedText).toContain('请填写有效的保价货值');
  expect(renderedText).not.toContain('确认发布订单');
});

test('publishes a local order with a selected payment method', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
    app.root.findByProps({ testID: 'draft-payment-online' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('支付方式：在线支付');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('支付方式：在线支付');
  expect(renderedText).toContain(
    '当前仍是本地演示订单，切到平台模式后可在订单页继续在线支付。',
  );
});

test('applies a local usable coupon when previewing and publishing a fixed price order', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
    app.root.findByProps({ testID: 'draft-coupon-coupon-1' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('优惠券：满 300 减 30');
  expect(renderedText).toContain('优惠金额：-￥30');
  expect(renderedText).toContain('实付金额：￥730');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('优惠券：满 300 减 30');
  expect(renderedText).toContain('优惠金额：-￥30');
  expect(renderedText).toContain('实付金额：￥730');
  expect(getAppRuntimeState().orders[0].couponTitleText).toBe('满 300 减 30');
  expect(getAppRuntimeState().orders[0].payablePriceText).toBe('￥730');
  expect(
    getProfileLocalState().coupons.find(item => item.id === 'coupon-1')
      ?.statusText,
  ).toBe('已使用');
  expect(
    getProfileLocalState().coupons.find(item => item.id === 'coupon-1')
      ?.validUntilText,
  ).toBe('已用于订单 HYLOCAL001');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-spending' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('HYLOCAL001');
  expect(renderedText).toContain('￥730');
  expect(renderedText).toContain('优惠券：满 300 减 30');
  expect(renderedText).toContain('优惠金额：-￥30');
  expect(renderedText).toContain('原价：￥760');
});

test('keeps a local coupon when editing a couponed waiting order without changing coupon selection', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
    app.root.findByProps({ testID: 'draft-coupon-coupon-1' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-edit-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('优惠券：满 300 减 30');
  expect(renderedText).toContain('优惠金额：-￥30');
  expect(renderedText).toContain('实付金额：￥730');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('优惠券：满 300 减 30');
  expect(renderedText).toContain('优惠金额：-￥30');
  expect(renderedText).toContain('实付金额：￥730');
  expect(getAppRuntimeState().orders[0].couponId).toBe('coupon-1');
  expect(getAppRuntimeState().orders[0].couponTitleText).toBe('满 300 减 30');
  expect(getAppRuntimeState().orders[0].payablePriceText).toBe('￥730');
});

test('releases a local coupon when editing a couponed waiting order without that coupon', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
    app.root.findByProps({ testID: 'draft-coupon-coupon-1' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-edit-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-coupon-clear' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  expect(getRenderedText(app)).not.toContain('优惠券：满 300 减 30');
  expect(getRenderedText(app)).not.toContain('实付金额：￥730');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);
  const releasedCoupon = getProfileLocalState().coupons.find(
    item => item.id === 'coupon-1',
  );

  expect(renderedText).not.toContain('优惠券：满 300 减 30');
  expect(getAppRuntimeState().orders[0].couponId).toBeUndefined();
  expect(getAppRuntimeState().orders[0].couponTitleText).toBeUndefined();
  expect(getAppRuntimeState().orders[0].payablePriceText).toBeUndefined();
  expect(releasedCoupon?.statusText).toBe('可使用');
  expect(releasedCoupon?.validUntilText).toBe(
    '已从订单 HYLOCAL001 取消使用',
  );
});

test('publishes a local order with an expected delivery time preference', async () => {
  const app = await renderApp(new Date('2026-06-24T08:00:00+08:00').getTime());

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  const asapDeliveryButton = app.root
    .findAllByProps({
      testID: 'draft-expected-delivery-asap',
    })
    .find(node => typeof node.props.onPress === 'function');

  expect(asapDeliveryButton).toBeDefined();

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    asapDeliveryButton?.props.onPress();
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  expect(getRenderedText(app)).toMatch(/期望送达：\s*尽快送达/);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toMatch(/期望送达：\s*尽快送达/);

  await flushMicrotasks();

  const storedState = await getStoredSnapshot<{
    state: {
      orders: Array<{
        expectedDeliveryTimeText?: string;
      }>;
    };
  }>('@vireCodeing/app-runtime-state');

  expect(storedState.state.orders[0].expectedDeliveryTimeText).toBe('尽快送达');
});

test('publishes a local order with cargo volume', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-volume' })
      .props.onChangeText('12.5 立方米');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('体积：12.5 立方米');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('体积：12.5 立方米');
});

test('publishes a local order with detailed vehicle requirements', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root.findByProps({ testID: 'draft-vehicle-length-6m' }).props.onPress();
    app.root.findByProps({ testID: 'draft-vehicle-tailboard' }).props.onPress();
    app.root.findByProps({ testID: 'draft-vehicle-tarp' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain(
    '车辆要求：中型货车 · 6米 · 需要尾板 · 需要篷布',
  );

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain(
    '中型货车 · 6米 · 需要尾板 · 需要篷布',
  );
});

test('requires different pickup and delivery addresses before publishing', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('装货地址和卸货地址不能相同');
  expect(renderedText).not.toContain('订单详情');
});

test('requires a valid cargo weight before publishing', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root.findByProps({ testID: 'draft-weight' }).props.onChangeText('很重');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('请输入有效的货物重量');
  expect(renderedText).not.toContain('订单详情');
});

test.each(['0.05 吨', '80 吨'])(
  'requires cargo weight within local range before publishing: %s',
  async invalidWeightText => {
    const app = await renderApp();

    await loginToHome(app);

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
      app.root
        .findByProps({ testID: 'draft-weight' })
        .props.onChangeText(invalidWeightText);
      app.root
        .findByProps({ testID: 'draft-quantity' })
        .props.onChangeText('18 箱');
      app.root
        .findByProps({ testID: 'draft-description' })
        .props.onChangeText('高价值设备，轻拿轻放');
      app.root
        .findByProps({ testID: 'draft-pickup-address' })
        .props.onChangeText('宝安临时仓');
      app.root
        .findByProps({ testID: 'draft-pickup-contact' })
        .props.onChangeText('赵经理');
      app.root
        .findByProps({ testID: 'draft-pickup-phone' })
        .props.onChangeText('13800138001');
      app.root
        .findByProps({ testID: 'draft-delivery-address' })
        .props.onChangeText('南山门店新址');
      app.root
        .findByProps({ testID: 'draft-delivery-contact' })
        .props.onChangeText('钱店长');
      app.root
        .findByProps({ testID: 'draft-delivery-phone' })
        .props.onChangeText('13800138002');
      app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
      app.root
        .findByProps({ testID: 'draft-pickup-time' })
        .props.onChangeText('明天 09:30');
      app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });

    const renderedText = getRenderedText(app);

    expect(renderedText).toContain('货物重量需在 0.1 到 50 吨之间');
    expect(renderedText).not.toContain('订单详情');
  },
);

test('requires a valid cargo quantity before publishing', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('一堆');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('请输入有效的货物数量');
  expect(renderedText).not.toContain('订单详情');
});

test('requires cargo description within 200 characters before publishing', async () => {
  const app = await renderApp();
  const overLimitDescription = '货'.repeat(201);

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText(overLimitDescription);
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('货物描述最多 200 字');
  expect(renderedText).not.toContain('确认发布订单');
});

test('requires pickup and delivery address notes within 50 characters before publishing', async () => {
  const app = await renderApp();
  const overLimitNote = '门'.repeat(51);

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-note' })
      .props.onChangeText(overLimitNote);
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-note' })
      .props.onChangeText('西侧货梯');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('装货备注最多 50 字');
  expect(renderedText).not.toContain('确认发布订单');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'draft-pickup-note' })
      .props.onChangeText('仓库在 3 号门');
    app.root
      .findByProps({ testID: 'draft-delivery-note' })
      .props.onChangeText(overLimitNote);
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('卸货备注最多 50 字');
  expect(renderedText).not.toContain('确认发布订单');
});

test('requires cargo volume within local range before publishing', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-volume' })
      .props.onChangeText('120 立方米');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('货物体积需在 0.1 到 100 立方米之间');
  expect(renderedText).not.toContain('订单详情');
});

test('requires a clear pickup time before publishing', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('随便');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('请输入明确的装货时间');
  expect(renderedText).not.toContain('订单详情');
});

test('requires pickup time to be at least two hours away before publishing', async () => {
  const app = await renderApp(new Date('2026-06-24T08:00:00+08:00').getTime());

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('今天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain(
    '装货时间需在当前时间 2 小时后、7 天内，并按半小时填写',
  );
  expect(renderedText).not.toContain('确认发布订单');
});

test('requires a clear expected delivery time when specified before publishing', async () => {
  const app = await renderApp(new Date('2026-06-24T08:00:00+08:00').getTime());

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root
      .findByProps({ testID: 'draft-expected-delivery-time' })
      .props.onChangeText('随便送');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('期望送达时间请填写明确时间，或选择尽快送达');
  expect(renderedText).not.toContain('确认发布订单');
});

test('requires a local fixed price within range before publishing', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-description' })
      .props.onChangeText('高价值设备，轻拿轻放');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('南山门店新址');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root.findByProps({ testID: 'draft-vehicle-medium' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root
      .findByProps({ testID: 'draft-price' })
      .props.onChangeText('999999');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('一口价金额需在 1 到 50000 元之间');
  expect(renderedText).not.toContain('订单详情');
});

test('opens order list from a home status card with an exact status filter', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-status-confirming' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('我的订单');
  expect(renderedText).toContain('待确认');
  expect(renderedText).toContain('HY20260620003');
  expect(renderedText).not.toContain('HY20260622001');
});

test('switches the home city with the local city selector', async () => {
  const app = await renderApp();

  await loginToHome(app);

  expect(getRenderedText(app)).toContain('深圳');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-city-selector' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('当前城市');
  expect(renderedText).toContain('当前展示已命中常用路线 2 条、订单路线 4 单。');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'city-option-guangzhou' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('广州');
  expect(renderedText).toContain('已切换城市：广州');
  expect(renderedText).not.toContain('城市选择暂未接入');
});

test('opens the local network error screen and retries back to home', async () => {
  const app = await renderApp();

  await loginToHome(app);

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('本地在线，当前没有待处理同步队列。');
  expect(renderedText).toContain('异常演练');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-network-error' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('网络异常');
  expect(renderedText).toContain('本地网络状态演练');
  expect(renderedText).toContain('订单、草稿、消息和个人中心仍可读取本地缓存');
  expect(renderedText).toContain('重新检测会自动重试发单草稿和订单的待同步项');
  expect(renderedText).toContain('常用路线和个人中心资料仍需返回原页面继续处理');
  expect(renderedText).not.toContain('货运发单');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'network-error-retry' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('货运发单');
  expect(renderedText).toContain('最近订单');
  expect(renderedText).toContain('网络状态已恢复，当前没有待处理同步队列。');
  expect(renderedText).not.toContain('网络异常');
});

test('shows mixed network retry summary on the home dashboard', async () => {
  const now = new Date('2026-07-22T08:20:00.000Z').getTime();
  saveDraft(
    {
      weightText: '2.5 吨',
      pickupAddress: '宝安仓库',
      deliveryAddress: '南山门店',
    },
    now,
  );
  saveHomeLocalState({
    ...getHomeLocalState(),
    syncState: createFailedHomeSyncState(undefined, now),
  });
  await AsyncStorage.setItem(
    '@vireCodeing/draft-storage',
    JSON.stringify(getDraftStorageSnapshot()),
  );
  await AsyncStorage.setItem(
    '@vireCodeing/home-local-state',
    JSON.stringify({
      version: 1,
      state: getHomeLocalState(),
    }),
  );

  const app = await renderApp(now);

  await loginToHome(app);

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain(
    '检测到 2 条待处理同步队列，其中 1 条同步失败、1 条待同步。',
  );
  expect(renderedText).toContain('同步详情');
  expect(renderedText).not.toContain('异常演练');
});

test('retries pending draft and order queues from the network error screen', async () => {
  const now = new Date('2026-07-22T08:35:00.000Z').getTime();
  saveDraft(
    {
      weightText: '2.5 吨',
      pickupAddress: '宝安仓库',
      deliveryAddress: '南山门店',
    },
    now,
  );
  saveHomeLocalState({
    ...getHomeLocalState(),
    syncState: createPendingHomeSyncState(undefined, now),
  });
  saveProfileLocalState({
    ...getProfileLocalState(),
    syncState: createPendingProfileSyncState(undefined, now),
  });
  const runtimeState = getAppRuntimeState();
  saveAppRuntimeState({
    ...runtimeState,
    orders: runtimeState.orders.map((order, index) =>
      index === 0
        ? {
            ...order,
            syncState: createPendingOrderSyncState(undefined, 'update', now),
          }
        : order,
    ),
  });
  await AsyncStorage.setItem(
    '@vireCodeing/draft-storage',
    JSON.stringify(getDraftStorageSnapshot()),
  );
  await AsyncStorage.setItem(
    '@vireCodeing/home-local-state',
    JSON.stringify({
      version: 1,
      state: getHomeLocalState(),
    }),
  );
  await AsyncStorage.setItem(
    '@vireCodeing/profile-local-state',
    JSON.stringify({
      version: 1,
      state: getProfileLocalState(),
    }),
  );
  await AsyncStorage.setItem(
    '@vireCodeing/app-runtime-state',
    JSON.stringify({
      version: 1,
      state: getAppRuntimeState(),
    }),
  );

  const app = await renderApp(now);

  await loginToHome(app);
  saveProfileLocalState({
    ...getProfileLocalState(),
    syncState: createPendingProfileSyncState(undefined, now),
  });
  await AsyncStorage.setItem(
    '@vireCodeing/profile-local-state',
    JSON.stringify({
      version: 1,
      state: getProfileLocalState(),
    }),
  );

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-network-error' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain(
    '检测到 4 条待处理同步队列，网络恢复后可继续处理。',
  );
  expect(renderedText).toContain('发单草稿变更：待同步');
  expect(renderedText).toContain('订单变更（HY20260622001）：待同步');
  expect(renderedText).toContain('常用路线变更：待同步');
  expect(renderedText).toContain('个人中心资料变更：待同步');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'network-error-retry' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('货运发单');
  expect(renderedText).toContain(
    '检测到 2 条待处理同步队列，网络恢复后可继续处理。',
  );
  expect(renderedText).toContain('同步详情');
  expect(renderedText).toContain(
    '网络状态已恢复，已自动重试 2 条草稿/订单待同步队列；常用路线和个人中心待同步项请返回原页面继续处理。',
  );
  expect(getDraftStorageSnapshot()?.syncState?.status).toBe('synced');
  expect(getAppRuntimeState().orders[0]?.syncState?.status).toBe('synced');
  expect(getHomeLocalState().syncState?.status).toBe('pending');
  expect(getProfileLocalState().syncState?.status).toBe('pending');
});

test('shows aggregated network retry queues and can mark pending items as failed', async () => {
  const now = new Date('2026-07-22T08:40:00.000Z').getTime();
  saveDraft(
    {
      weightText: '2.5 吨',
      pickupAddress: '宝安仓库',
      deliveryAddress: '南山门店',
    },
    now,
  );
  saveHomeLocalState({
    ...getHomeLocalState(),
    syncState: createPendingHomeSyncState(undefined, now),
  });
  saveProfileLocalState({
    ...getProfileLocalState(),
    syncState: createPendingProfileSyncState(undefined, now),
  });
  const runtimeState = getAppRuntimeState();
  saveAppRuntimeState({
    ...runtimeState,
    orders: runtimeState.orders.map((order, index) =>
      index === 0
        ? {
            ...order,
            syncState: createPendingOrderSyncState(undefined, 'update', now),
          }
        : order,
    ),
  });
  await AsyncStorage.setItem(
    '@vireCodeing/draft-storage',
    JSON.stringify(getDraftStorageSnapshot()),
  );
  await AsyncStorage.setItem(
    '@vireCodeing/home-local-state',
    JSON.stringify({
      version: 1,
      state: getHomeLocalState(),
    }),
  );
  await AsyncStorage.setItem(
    '@vireCodeing/profile-local-state',
    JSON.stringify({
      version: 1,
      state: getProfileLocalState(),
    }),
  );
  await AsyncStorage.setItem(
    '@vireCodeing/app-runtime-state',
    JSON.stringify({
      version: 1,
      state: getAppRuntimeState(),
    }),
  );

  const app = await renderApp(now);

  await loginToHome(app);
  saveProfileLocalState({
    ...getProfileLocalState(),
    syncState: createPendingProfileSyncState(undefined, now),
  });
  await AsyncStorage.setItem(
    '@vireCodeing/profile-local-state',
    JSON.stringify({
      version: 1,
      state: getProfileLocalState(),
    }),
  );

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-network-error' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('待处理同步队列');
  expect(renderedText).toContain('同步队列详情');
  expect(renderedText).toContain('待处理同步');
  expect(renderedText).toContain(
    '检测到 4 条待处理同步队列，网络恢复后可继续处理。',
  );
  expect(renderedText).toContain('发单草稿变更：待同步');
  expect(renderedText).toContain('订单变更（HY20260622001）：待同步');
  expect(renderedText).toContain('常用路线变更：待同步');
  expect(renderedText).toContain('个人中心资料变更：待同步');
  expect(renderedText).toContain('草稿已保留在本地，待平台草稿同步。');
  expect(renderedText).toContain('当前说明：草稿已在本地更新，等待平台草稿同步。');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'network-retry-mark-failed' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('发单草稿变更：同步失败');
  expect(renderedText).toContain('订单变更（HY20260622001）：同步失败');
  expect(renderedText).toContain('常用路线变更：同步失败');
  expect(renderedText).toContain('个人中心资料变更：同步失败');
  expect(renderedText).toContain(
    '检测到 4 条同步失败队列，请进入同步详情处理。',
  );
  expect(renderedText).toContain('草稿同步未完成，已保留本地草稿队列。');
  expect(getDraftStorageSnapshot()?.syncState?.status).toBe('failed');
  expect(getHomeLocalState().syncState?.status).toBe('failed');
  expect(getProfileLocalState().syncState?.status).toBe('failed');
  expect(getAppRuntimeState().orders[0]?.syncState?.status).toBe('failed');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'network-error-retry' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('货运发单');
  expect(renderedText).toContain(
    '检测到 4 条同步失败队列，请进入同步详情处理。',
  );
  expect(renderedText).toContain('同步详情');
  expect(renderedText).toContain(
    '网络状态已恢复，当前没有可自动重试的待同步队列；已失败队列请进入对应页面处理。',
  );
});

test('filters the order list by search keyword', async () => {
  const app = await renderApp();

  await loginToHome(app);
  await openOrderList(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'orders-search' })
      .props.onChangeText('盐田');
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('HY20260620003');
  expect(renderedText).toContain('盐田港仓储中心');
  expect(renderedText).not.toContain('HY20260622001');
});

test('filters the order list by local time range', async () => {
  const app = await renderApp();

  await loginToHome(app);
  await openOrderList(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'orders-time-today' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('HY20260622001');
  expect(renderedText).toContain('HY20260621008');
  expect(renderedText).not.toContain('HY20260620003');
  expect(renderedText).not.toContain('HY20260619005');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'orders-time-history' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('HY20260620003');
  expect(renderedText).toContain('HY20260619005');
  expect(renderedText).not.toContain('HY20260622001');
});

test('filters the order list by a local custom date range', async () => {
  const app = await renderApp(new Date('2026-06-26T08:00:00+08:00').getTime());

  await loginToHome(app);
  await openOrderList(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'orders-custom-start-date' })
      .props.onChangeText('2026-06-25');
    app.root
      .findByProps({ testID: 'orders-custom-end-date' })
      .props.onChangeText('2026-06-25');
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('自定义日期范围：2026-06-25 至 2026-06-25');
  expect(renderedText).toContain('HY20260620003');
  expect(renderedText).not.toContain('HY20260622001');
  expect(renderedText).not.toContain('HY20260621008');
  expect(renderedText).not.toContain('HY20260619005');
});

test('shows driver quotes and selects a driver from a waiting order', async () => {
  const app = await renderApp();

  await loginToHome(app);
  await openFirstRecentOrder(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  expect(getRenderedText(app)).toContain('司机报价列表');
  expect(getRenderedText(app)).toContain('王师傅');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-quote-select-D1001' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('司机已接单 · 刚刚');
  expect(renderedText).toContain('司机信息');
  expect(renderedText).toContain('王师傅');
  expect(renderedText).toContain('粤B·A12345');
});

test('opens the system dialer for an assigned driver', async () => {
  const openUrlSpy = jest
    .spyOn(Linking, 'openURL')
    .mockResolvedValue(undefined);

  try {
    const app = await renderApp();

    await loginToHome(app);
    await openFirstRecentOrder(app);

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'order-detail-primary-action' })
        .props.onPress();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'order-quote-select-D1001' })
        .props.onPress();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'order-detail-primary-action' })
        .props.onPress();
    });

    expect(openUrlSpy).toHaveBeenCalledWith('tel:13900139000');
    expect(getRenderedText(app)).toContain('正在联系司机：王师傅 13900139000');
  } finally {
    openUrlSpy.mockRestore();
  }
});

test('opens the system dialer for pickup and delivery contacts', async () => {
  const openUrlSpy = jest
    .spyOn(Linking, 'openURL')
    .mockResolvedValue(undefined);

  try {
    const app = await renderApp();

    await loginToHome(app);
    await openFirstRecentOrder(app);

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'order-contact-call-pickup' })
        .props.onPress();
    });

    expect(openUrlSpy).toHaveBeenCalledWith('tel:13800138001');
    expect(getRenderedText(app)).toContain(
      '正在联系装货联系人：赵经理 13800138001',
    );

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'order-contact-call-delivery' })
        .props.onPress();
    });

    expect(openUrlSpy).toHaveBeenCalledWith('tel:13800138002');
    expect(getRenderedText(app)).toContain(
      '正在联系卸货联系人：钱店长 13800138002',
    );
  } finally {
    openUrlSpy.mockRestore();
  }
});

test('confirms delivery from a confirming order primary action', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260620003' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('订单已完成 · 刚刚');
  expect(renderedText).toContain('评价司机');
});

test('prefills the draft from a frequent route', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'route-reuse-route-1' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('发布订单');
  expect(renderedText).toContain('已带入常用路线：宝安仓库 → 南山门店');
  expect(
    app.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
  ).toBe('宝安区福永物流园');
  expect(
    app.root.findByProps({ testID: 'draft-delivery-address' }).props.value,
  ).toBe('南山区科技园门店');
});

test('adds and deletes a local frequent route from the home screen', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-routes-manage' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'route-name' })
      .props.onChangeText('番禺仓库 → 天河门店');
    app.root
      .findByProps({ testID: 'route-from' })
      .props.onChangeText('番禺区南村仓库');
    app.root
      .findByProps({ testID: 'route-to' })
      .props.onChangeText('天河区体育西门店');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'route-submit' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('常用路线已添加');
  expect(renderedText).toContain('番禺仓库 → 天河门店');
  expect(renderedText).toContain('番禺区南村仓库');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'route-delete-route-local-3' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('常用路线已删除');
  expect(renderedText).not.toContain('番禺仓库 → 天河门店');
});

test('marks local frequent route changes as pending backend sync and retries them', async () => {
  const now = new Date('2026-06-30T03:15:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const app = await renderApp(now);

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-routes-manage' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('常用路线同步：已同步');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'route-name' })
      .props.onChangeText('南沙仓库 → 越秀门店');
    app.root
      .findByProps({ testID: 'route-from' })
      .props.onChangeText('南沙区港口仓库');
    app.root
      .findByProps({ testID: 'route-to' })
      .props.onChangeText('越秀区北京路门店');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'route-submit' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('常用路线同步：待同步');
  expect(getHomeLocalState().syncState?.status).toBe('pending');
  expect(getHomeLocalState().syncState?.updatedAtIso).toBe(expectedIso);
  expect(getHomeLocalState().syncState?.queueItems?.[0].updatedAtIso).toBe(
    expectedIso,
  );

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'route-sync-retry' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('常用路线同步：已同步');
  expect(renderedText).toContain(
    '同步说明：本地常用路线已记录，等待平台常用路线同步。',
  );
  expect(getHomeLocalState().syncState?.status).toBe('synced');
  expect(getHomeLocalState().syncState?.updatedAtIso).toBe(expectedIso);
});

test('syncs frequent routes through the platform frequent routes api', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-04T08:00:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-frequent-routes-sync',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.frequent-routes.900',
          refreshToken: 'refresh.frequent-routes.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(null),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-frequent-routes-sync',
        routes: [
          {
            id: 'route-1',
            name: '宝安仓库 → 南山门店',
            from: '宝安区物流园',
            to: '南山区科技园门店',
            lastUsedText: '刚刚添加',
            lastUsedIso: '2026-07-04T08:00:00.000Z',
          },
          {
            id: 'route-2',
            name: '龙岗工厂 → 福田展厅',
            from: '龙岗区制造基地',
            to: '福田区中心展厅',
            lastUsedText: '刚刚添加',
            lastUsedIso: '2026-07-04T08:00:00.000Z',
          },
          {
            id: 'route-local-3',
            name: '南沙仓库 → 越秀门店',
            from: '南沙区港口仓库',
            to: '越秀区北京路门店',
            lastUsedText: '刚刚添加',
            lastUsedIso: '2026-07-04T08:00:00.000Z',
          },
        ],
        updatedAtIso: '2026-07-04T08:30:00.000Z',
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-routes-manage' }).props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'route-name' })
        .props.onChangeText('南沙仓库 → 越秀门店');
      app.root
        .findByProps({ testID: 'route-from' })
        .props.onChangeText('南沙区港口仓库');
      app.root
        .findByProps({ testID: 'route-to' })
        .props.onChangeText('越秀区北京路门店');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'route-submit' }).props.onPress();
      await flushMicrotasks();
    });

    const routeSyncCall = fetchMock.mock.calls.find(([url, init]) => {
      return (
        url === 'http://localhost:3000/api/shipper/profile/frequent-routes' &&
        init?.method === 'PUT'
      );
    });

    expect(routeSyncCall).toBeDefined();
    expect(routeSyncCall?.[1].headers).toMatchObject({
      Authorization: 'Bearer access.frequent-routes.900',
    });
    expect(JSON.parse(routeSyncCall?.[1].body as string)).toMatchObject({
      clientUpdatedAtIso: '2026-07-04T08:00:00.000Z',
      routes: expect.arrayContaining([
        expect.objectContaining({ id: 'route-local-3', name: '南沙仓库 → 越秀门店' }),
      ]),
    });
    expect(getHomeLocalState().syncState).toMatchObject({
      status: 'synced',
      platformUpdatedAtIso: '2026-07-04T08:30:00.000Z',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps platform frequent route save queued when saving has no auth token', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-04T08:00:00.000Z').getTime();
  await AsyncStorage.setItem(
    '@vireCodeing/home-local-state',
    JSON.stringify({
      version: 1,
      state: {
        selectedCity: '深圳',
        routes: [],
        supportTickets: [],
        syncState: {
          status: 'pending',
          message: '常用路线已在本地更新，等待平台常用路线同步。',
          updatedAtText: '刚刚',
          updatedAtIso: '2026-07-04T07:50:00.000Z',
          queueItems: [],
        },
      },
    }),
  );
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-frequent-routes-missing-token-save',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.frequent-routes.missing-token-save',
          refreshToken: 'refresh.frequent-routes.missing-token-save',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-frequent-routes-missing-token-save',
        routes: [
          {
            id: 'route-local-missing-token',
            name: '南沙仓库 → 越秀门店',
            from: '南沙区港口仓库',
            to: '越秀区北京路门店',
            lastUsedText: '刚刚添加',
            lastUsedIso: '2026-07-04T08:00:00.000Z',
          },
        ],
        updatedAtIso: '2026-07-04T08:30:00.000Z',
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    clearAuthSession();

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-routes-manage' }).props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'route-name' })
        .props.onChangeText('南沙仓库 → 越秀门店');
      app.root
        .findByProps({ testID: 'route-from' })
        .props.onChangeText('南沙区港口仓库');
      app.root
        .findByProps({ testID: 'route-to' })
        .props.onChangeText('越秀区北京路门店');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'route-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      fetchMock.mock.calls.some(([url, init]) => {
        return (
          url === 'http://localhost:3000/api/shipper/profile/frequent-routes' &&
          init?.method === 'PUT'
        );
      }),
    ).toBe(false);
    expect(getRenderedText(app)).toContain(
      '平台常用路线保存需要重新登录后再同步。',
    );
    expect(getHomeLocalState().syncState).toMatchObject({
      status: 'failed',
      message: '平台常用路线保存需要重新登录后再同步。',
    });
    expect(getHomeLocalState().syncState?.queueItems?.[0]).toMatchObject({
      statusText: '同步失败',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loads platform frequent routes when opening the route manager', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-frequent-routes-load',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.frequent-routes.load',
          refreshToken: 'refresh.frequent-routes.load',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-frequent-routes-load',
        routes: [
          {
            id: 'route-platform-1',
            name: '平台仓库 → 平台门店',
            from: '平台装货地',
            to: '平台卸货地',
            lastUsedText: '平台刚刚同步',
            lastUsedIso: '2026-07-04T08:00:00.000Z',
          },
        ],
        updatedAtIso: '2026-07-04T08:40:00.000Z',
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-04T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-routes-manage' }).props.onPress();
      await flushMicrotasks();
    });

    const routeLoadCall = fetchMock.mock.calls.find(([url, init]) => {
      return (
        url === 'http://localhost:3000/api/shipper/profile/frequent-routes' &&
        init?.method === 'GET'
      );
    });

    expect(routeLoadCall).toBeDefined();
    expect(routeLoadCall?.[1].headers).toMatchObject({
      Authorization: 'Bearer access.frequent-routes.load',
    });
    expect(getRenderedText(app)).toContain('平台仓库 → 平台门店');
    expect(getHomeLocalState()).toMatchObject({
      routes: [expect.objectContaining({ id: 'route-platform-1' })],
      syncState: {
        status: 'synced',
        platformUpdatedAtIso: '2026-07-04T08:40:00.000Z',
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps platform frequent route load queued when opening manager has no auth token', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-04T08:00:00.000Z').getTime();
  await AsyncStorage.setItem(
    '@vireCodeing/home-local-state',
    JSON.stringify({
      version: 1,
      state: {
        selectedCity: '深圳',
        routes: [
          {
            id: 'route-local-load-missing-auth',
            name: '本地缺登录路线',
            from: '本地缺登录仓库',
            to: '本地缺登录门店',
            lastUsedText: '刚刚使用',
            lastUsedIso: '2026-07-04T07:55:00.000Z',
          },
        ],
        supportTickets: [],
        syncState: {
          status: 'synced',
          message: '本地常用路线已同步。',
          updatedAtText: '刚刚',
          updatedAtIso: '2026-07-04T07:55:00.000Z',
          queueItems: [],
        },
      },
    }),
  );
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-frequent-routes-load-missing-token',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.frequent-routes.load-missing-token',
          refreshToken: 'refresh.frequent-routes.load-missing-token',
          expiresIn: 900,
        },
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    clearAuthSession();

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-routes-manage' }).props.onPress();
      await flushMicrotasks();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getRenderedText(app)).toContain('本地缺登录路线');
    expect(getRenderedText(app)).toContain(
      '平台常用路线拉取需要重新登录后再同步。',
    );
    expect(getHomeLocalState().syncState).toMatchObject({
      status: 'failed',
      message: '平台常用路线拉取需要重新登录后再同步。',
    });
    expect(getHomeLocalState().syncState?.queueItems?.[0]).toMatchObject({
      statusText: '同步失败',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps platform frequent route load queued when opening manager load fails', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-04T08:00:00.000Z').getTime();
  await AsyncStorage.setItem(
    '@vireCodeing/home-local-state',
    JSON.stringify({
      version: 1,
      state: {
        selectedCity: '深圳',
        routes: [
          {
            id: 'route-local-load-failure',
            name: '本地失败保留路线',
            from: '本地失败仓库',
            to: '本地失败门店',
            lastUsedText: '刚刚使用',
            lastUsedIso: '2026-07-04T07:55:00.000Z',
          },
        ],
        supportTickets: [],
        syncState: {
          status: 'synced',
          message: '本地常用路线已同步。',
          updatedAtText: '刚刚',
          updatedAtIso: '2026-07-04T07:55:00.000Z',
          platformUpdatedAtIso: '2026-07-04T07:30:00.000Z',
          platformRouteIds: ['route-platform-known-load-failure'],
          queueItems: [],
        },
      },
    }),
  );
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-frequent-routes-load-failure',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.frequent-routes.load-failure',
          refreshToken: 'refresh.frequent-routes.load-failure',
          expiresIn: 900,
        },
      }),
    )
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'));
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-routes-manage' }).props.onPress();
      await flushMicrotasks();
    });

    const routeLoadCall = fetchMock.mock.calls.find(([url, init]) => {
      return (
        url === 'http://localhost:3000/api/shipper/profile/frequent-routes' &&
        init?.method === 'GET'
      );
    });

    expect(routeLoadCall).toBeDefined();
    expect(routeLoadCall?.[1].headers).toMatchObject({
      Authorization: 'Bearer access.frequent-routes.load-failure',
    });
    expect(getRenderedText(app)).toContain('本地失败保留路线');
    expect(getRenderedText(app)).toContain(
      '平台常用路线拉取失败，已保留本地常用路线。',
    );
    expect(getHomeLocalState()).toMatchObject({
      routes: [expect.objectContaining({ id: 'route-local-load-failure' })],
      syncState: {
        status: 'failed',
        message: '平台常用路线拉取失败，已保留本地常用路线。',
        platformUpdatedAtIso: '2026-07-04T07:30:00.000Z',
        platformRouteIds: ['route-platform-known-load-failure'],
      },
    });
    expect(getHomeLocalState().syncState?.queueItems?.[0]).toMatchObject({
      statusText: '同步失败',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps local pending frequent routes when platform routes load', async () => {
  const originalFetch = globalThis.fetch;
  await AsyncStorage.setItem(
    '@vireCodeing/home-local-state',
    JSON.stringify({
      version: 1,
      state: {
        selectedCity: '深圳',
        routes: [
          {
            id: 'route-local-pending',
            name: '本地待同步路线',
            from: '本地仓库',
            to: '本地门店',
            lastUsedText: '刚刚添加',
            lastUsedIso: '2026-07-04T08:00:00.000Z',
          },
        ],
        supportTickets: [],
        syncState: {
          status: 'pending',
          message: '常用路线已在本地更新，等待平台常用路线同步。',
          updatedAtText: '刚刚',
          updatedAtIso: '2026-07-04T08:00:00.000Z',
          queueItems: [],
        },
      },
    }),
  );

  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-frequent-routes-pending',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.frequent-routes.pending',
          refreshToken: 'refresh.frequent-routes.pending',
          expiresIn: 900,
        },
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-04T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-routes-manage' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      fetchMock.mock.calls.some(([url]) => {
        return (
          url === 'http://localhost:3000/api/shipper/profile/frequent-routes'
        );
      }),
    ).toBe(false);
    expect(getRenderedText(app)).toContain('本地待同步路线');
    expect(getHomeLocalState()).toMatchObject({
      routes: [expect.objectContaining({ id: 'route-local-pending' })],
      syncState: { status: 'pending' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps local frequent routes when platform save conflicts and retries with latest base version', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-04T08:00:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-frequent-routes-conflict',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.frequent-routes.conflict',
          refreshToken: 'refresh.frequent-routes.conflict',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-frequent-routes-conflict',
        routes: [
          {
            id: 'route-1',
            name: '宝安仓库 → 南山门店',
            from: '宝安区物流园',
            to: '南山区科技园门店',
            lastUsedText: '平台刚刚同步',
            lastUsedIso: '2026-07-04T08:00:00.000Z',
          },
          {
            id: 'route-server-deleted',
            name: '服务端旧路线',
            from: '龙华旧仓库',
            to: '福田旧门店',
            lastUsedText: '平台稍早同步',
            lastUsedIso: '2026-07-04T07:50:00.000Z',
          },
        ],
        updatedAtIso: '2026-07-04T08:20:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiErrorResponse(
        409,
        'PROFILE_FREQUENT_ROUTES_CONFLICT',
        '常用路线已被其他设备更新，请先拉取最新路线后再保存。',
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-frequent-routes-conflict',
        routes: [
          {
            id: 'route-1',
            name: '宝安仓库 → 南山门店',
            from: '服务端修正仓库',
            to: '南山区科技园门店',
            lastUsedText: '服务端刚刚修正',
            lastUsedIso: '2026-07-04T08:28:00.000Z',
          },
          {
            id: 'route-server-new',
            name: '服务端新增路线',
            from: '服务端仓库',
            to: '服务端门店',
            lastUsedText: '服务端刚刚添加',
            lastUsedIso: '2026-07-04T08:25:00.000Z',
          },
        ],
        updatedAtIso: '2026-07-04T08:30:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-frequent-routes-conflict',
        routes: [
          {
            id: 'route-1',
            name: '宝安仓库 → 南山门店',
            from: '服务端修正仓库',
            to: '南山区科技园门店',
            lastUsedText: '服务端刚刚修正',
            lastUsedIso: '2026-07-04T08:28:00.000Z',
          },
          {
            id: 'route-local-2',
            name: '南沙仓库 → 越秀门店',
            from: '南沙区港口仓库',
            to: '越秀区北京路门店',
            lastUsedText: '刚刚添加',
            lastUsedIso: '2026-07-04T08:00:00.000Z',
          },
          {
            id: 'route-server-new',
            name: '服务端新增路线',
            from: '服务端仓库',
            to: '服务端门店',
            lastUsedText: '服务端刚刚添加',
            lastUsedIso: '2026-07-04T08:25:00.000Z',
          },
        ],
        updatedAtIso: '2026-07-04T08:35:00.000Z',
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-routes-manage' }).props.onPress();
      await flushMicrotasks();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'route-name' })
        .props.onChangeText('南沙仓库 → 越秀门店');
      app.root
        .findByProps({ testID: 'route-from' })
        .props.onChangeText('南沙区港口仓库');
      app.root
        .findByProps({ testID: 'route-to' })
        .props.onChangeText('越秀区北京路门店');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'route-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(app)).toContain('南沙仓库 → 越秀门店');
    expect(getHomeLocalState().syncState).toMatchObject({
      status: 'failed',
      platformUpdatedAtIso: '2026-07-04T08:30:00.000Z',
      conflictSummaryText: '服务端常用路线：宝安仓库 → 南山门店',
    });
    expect(getRenderedText(app)).toContain(
      '服务端常用路线：宝安仓库 → 南山门店',
    );
    expect(getRenderedText(app)).toContain(
      '装货地：宝安区物流园 -> 服务端修正仓库',
    );
    expect(getRenderedText(app)).toContain('服务端已删除路线：服务端旧路线');
    expect(getRenderedText(app)).toContain('服务端新增路线');

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({
          testID: 'route-sync-adopt-conflict-route-field-route-1-from',
        })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({
          testID: 'route-sync-adopt-conflict-deleted-route-route-server-deleted',
        })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({
          testID: 'route-sync-adopt-conflict-route-route-server-new',
        })
        .props.onPress();
    });

    expect(getHomeLocalState().routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'route-1',
          from: '服务端修正仓库',
        }),
        expect.objectContaining({ name: '南沙仓库 → 越秀门店' }),
        expect.objectContaining({ name: '服务端新增路线' }),
      ]),
    );
    expect(getHomeLocalState().routes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'route-server-deleted' }),
      ]),
    );
    expect(getHomeLocalState().syncState?.conflictSummaryText).toBeUndefined();
    expect(getHomeLocalState().syncState?.conflictRouteItems).toBeUndefined();
    expect(
      getHomeLocalState().syncState?.conflictRouteFieldItems,
    ).toBeUndefined();
    expect(
      getHomeLocalState().syncState?.conflictDeletedRouteItems,
    ).toBeUndefined();
    expect(getRenderedText(app)).not.toContain(
      '服务端常用路线：宝安仓库 → 南山门店',
    );

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'route-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const saveCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return (
        url === 'http://localhost:3000/api/shipper/profile/frequent-routes' &&
        init?.method === 'PUT'
      );
    });
    const retryBody = JSON.parse(saveCalls[1][1].body as string);

    expect(retryBody).toMatchObject({
      baseUpdatedAtIso: '2026-07-04T08:30:00.000Z',
      routes: expect.arrayContaining([
        expect.objectContaining({
          id: 'route-1',
          from: '服务端修正仓库',
        }),
        expect.objectContaining({ name: '南沙仓库 → 越秀门店' }),
        expect.objectContaining({ name: '服务端新增路线' }),
      ]),
    });
    expect(retryBody.routes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'route-server-deleted' }),
      ]),
    );
    expect(getHomeLocalState().syncState).toMatchObject({
      status: 'synced',
      platformUpdatedAtIso: '2026-07-04T08:35:00.000Z',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps platform frequent route conflict handling queued when auth token is missing', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-04T08:00:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-frequent-routes-conflict-missing-auth',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.frequent-routes.conflict-missing-auth',
          refreshToken: 'refresh.frequent-routes.conflict-missing-auth',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-frequent-routes-conflict-missing-auth',
        routes: [
          {
            id: 'route-1',
            name: '宝安仓库 → 南山门店',
            from: '宝安区物流园',
            to: '南山区科技园门店',
            lastUsedText: '平台刚刚同步',
            lastUsedIso: '2026-07-04T08:00:00.000Z',
          },
        ],
        updatedAtIso: '2026-07-04T08:20:00.000Z',
      }),
    )
    .mockImplementationOnce(async () => {
      clearAuthSession();

      return createPlatformApiErrorResponse(
        409,
        'PROFILE_FREQUENT_ROUTES_CONFLICT',
        '常用路线已被其他设备更新，请先拉取最新路线后再保存。',
      );
    });
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-routes-manage' }).props.onPress();
      await flushMicrotasks();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'route-name' })
        .props.onChangeText('南沙仓库 → 越秀门店');
      app.root
        .findByProps({ testID: 'route-from' })
        .props.onChangeText('南沙区港口仓库');
      app.root
        .findByProps({ testID: 'route-to' })
        .props.onChangeText('越秀区北京路门店');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'route-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(getHomeLocalState().syncState).toMatchObject({
      status: 'failed',
      message: '平台常用路线冲突处理需要重新登录后再同步。',
      platformUpdatedAtIso: '2026-07-04T08:20:00.000Z',
    });
    expect(getHomeLocalState().syncState?.queueItems).toHaveLength(1);
    expect(getRenderedText(app)).toContain(
      '平台常用路线冲突处理需要重新登录后再同步。',
    );
    expect(getRenderedText(app)).not.toContain('服务端常用路线：');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shows a local frequent route sync failure queue and retries it', async () => {
  const now = new Date('2026-06-30T03:15:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const app = await renderApp(now);

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-routes-manage' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'route-name' })
      .props.onChangeText('龙华仓库 → 罗湖门店');
    app.root
      .findByProps({ testID: 'route-from' })
      .props.onChangeText('龙华区民治仓库');
    app.root
      .findByProps({ testID: 'route-to' })
      .props.onChangeText('罗湖区东门门店');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'route-submit' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('常用路线同步队列');
  expect(renderedText).toContain('常用路线变更：待同步');
  expect(renderedText).toContain('常用路线已保留在本地，待平台常用路线同步');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'route-sync-mark-failed' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('常用路线同步：同步失败');
  expect(renderedText).toContain('常用路线变更：同步失败');
  expect(renderedText).toContain(
    '常用路线同步未完成，已保留本地常用路线队列',
  );
  expect(getHomeLocalState().syncState?.status).toBe('failed');
  expect(getHomeLocalState().syncState?.updatedAtIso).toBe(expectedIso);
  expect(getHomeLocalState().syncState?.queueItems?.[0].updatedAtIso).toBe(
    expectedIso,
  );

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'route-sync-retry' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('常用路线同步：已同步');
  expect(renderedText).toContain('暂无待同步路线');
  expect(getHomeLocalState().syncState?.status).toBe('synced');
  expect(getHomeLocalState().syncState?.updatedAtIso).toBe(expectedIso);
});

test('keeps platform frequent route retry queued when retrying has no auth token', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-04T08:00:00.000Z').getTime();
  await AsyncStorage.setItem(
    '@vireCodeing/home-local-state',
    JSON.stringify({
      version: 1,
      state: {
        selectedCity: '深圳',
        routes: [
          {
            id: 'route-local-retry-missing-token',
            name: '龙华仓库 → 罗湖门店',
            from: '龙华区民治仓库',
            to: '罗湖区东门门店',
            lastUsedText: '刚刚添加',
            lastUsedIso: '2026-07-04T07:50:00.000Z',
          },
        ],
        supportTickets: [],
        syncState: {
          status: 'failed',
          message: '常用路线同步失败，等待本地重试。',
          updatedAtText: '刚刚',
          updatedAtIso: '2026-07-04T07:50:00.000Z',
          queueItems: [
            {
              id: 'route-local-change',
              titleText: '常用路线变更',
              statusText: '同步失败',
              updatedAtText: '刚刚',
              updatedAtIso: '2026-07-04T07:50:00.000Z',
              noteText: '常用路线同步未完成，已保留本地常用路线队列。',
            },
          ],
        },
      },
    }),
  );
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-frequent-routes-missing-token-retry',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.frequent-routes.missing-token-retry',
          refreshToken: 'refresh.frequent-routes.missing-token-retry',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-frequent-routes-missing-token-retry',
        routes: [
          {
            id: 'route-local-retry-missing-token',
            name: '龙华仓库 → 罗湖门店',
            from: '龙华区民治仓库',
            to: '罗湖区东门门店',
            lastUsedText: '刚刚添加',
            lastUsedIso: '2026-07-04T07:50:00.000Z',
          },
        ],
        updatedAtIso: '2026-07-04T08:30:00.000Z',
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    clearAuthSession();

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-routes-manage' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'route-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      fetchMock.mock.calls.some(([url, init]) => {
        return (
          url === 'http://localhost:3000/api/shipper/profile/frequent-routes' &&
          init?.method === 'PUT'
        );
      }),
    ).toBe(false);
    expect(getRenderedText(app)).toContain(
      '平台常用路线重试需要重新登录后再同步。',
    );
    expect(getHomeLocalState().syncState).toMatchObject({
      status: 'failed',
      message: '平台常用路线重试需要重新登录后再同步。',
    });
    expect(getHomeLocalState().syncState?.queueItems?.[0]).toMatchObject({
      statusText: '同步失败',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('edits a local frequent route from the home screen', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-routes-manage' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'route-edit-route-1' }).props.onPress();
  });

  expect(app.root.findByProps({ testID: 'route-name' }).props.value).toBe(
    '宝安仓库 → 南山门店',
  );

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'route-name' })
      .props.onChangeText('宝安仓库 → 前海门店');
    app.root
      .findByProps({ testID: 'route-to' })
      .props.onChangeText('前海合作区门店');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'route-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('常用路线已更新');
  expect(renderedText).toContain('宝安仓库 → 前海门店');
  expect(renderedText).toContain('前海合作区门店');
  expect(renderedText).not.toContain('宝安仓库 → 南山门店');
});

test('reorders local frequent routes from the home screen', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-routes-manage' }).props.onPress();
  });

  expect(getFrequentRouteNameOrder(app)).toEqual([
    '宝安仓库 → 南山门店',
    '龙岗工厂 → 福田展厅',
  ]);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'route-move-down-route-1' }).props.onPress();
  });

  expect(getFrequentRouteNameOrder(app)).toEqual([
    '龙岗工厂 → 福田展厅',
    '宝安仓库 → 南山门店',
  ]);
  expect(getRenderedText(app)).toContain('常用路线顺序已更新');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'route-move-up-route-1' }).props.onPress();
  });

  expect(getFrequentRouteNameOrder(app)).toEqual([
    '宝安仓库 → 南山门店',
    '龙岗工厂 → 福田展厅',
  ]);
});

test('persists local frequent routes to device storage', async () => {
  const now = new Date('2026-06-30T03:15:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const app = await renderApp(now);

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-routes-manage' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'route-name' })
      .props.onChangeText('番禺仓库 → 天河门店');
    app.root
      .findByProps({ testID: 'route-from' })
      .props.onChangeText('番禺区南村仓库');
    app.root
      .findByProps({ testID: 'route-to' })
      .props.onChangeText('天河区体育西门店');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'route-submit' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('番禺仓库 → 天河门店');

  await flushMicrotasks();

  const storedHomeState = await getStoredSnapshot<{
    state: {
      routes: Array<{
        name: string;
        from: string;
        to: string;
        lastUsedIso?: string;
      }>;
    };
  }>('@vireCodeing/home-local-state');

  expect(
    storedHomeState.state.routes.find(
      route => route.name === '番禺仓库 → 天河门店',
    ),
  ).toMatchObject({
    name: '番禺仓库 → 天河门店',
    from: '番禺区南村仓库',
    to: '天河区体育西门店',
    lastUsedIso: expectedIso,
  });
});

test('updates home verification panel metrics after local route and order changes', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-routes-manage' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'route-name' })
      .props.onChangeText('坪山仓库 → 前海门店');
    app.root
      .findByProps({ testID: 'route-from' })
      .props.onChangeText('坪山新区临时仓');
    app.root
      .findByProps({ testID: 'route-to' })
      .props.onChangeText('前海品牌门店');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'route-submit' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('坪山新区临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('前海品牌门店');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('5 单');
  expect(renderedText).toContain('3 条');
  expect(renderedText).not.toContain('12 单');
});

test('reorders a completed order into a prefilled draft', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260620003' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-secondary-action' })
      .props.onPress();
  });

  expect(getRenderedText(app)).toContain('发布订单');
  expect(getRenderedText(app)).toContain('已带入历史订单：HY20260620003');
  expect(
    app.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
  ).toBe('盐田港仓储中心');
  expect(
    app.root.findByProps({ testID: 'draft-delivery-address' }).props.value,
  ).toBe('罗湖区翠竹门店');
});

test('records the source order when publishing a reordered local order', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260620003' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-secondary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138000');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13900139000');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('12 箱');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('680');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('复制来源：HY20260620003');
  expect(renderedText).toContain('来源记录：从历史订单重新下单');

  const storedState = await getStoredSnapshot<{
    state: {
      orders: Array<{
        id: string;
        reorderSource?: {
          orderId: string;
          copiedAtText: string;
          noteText: string;
        };
      }>;
    };
  }>('@vireCodeing/app-runtime-state');

  expect(storedState.state.orders[0].reorderSource).toEqual({
    orderId: 'HY20260620003',
    copiedAtText: '刚刚复制',
    noteText: '从历史订单重新下单',
  });
});

test('publishes a reordered local order without manually repairing required fields', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260620003' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-secondary-action' })
      .props.onPress();
  });

  expect(app.root.findByProps({ testID: 'draft-quantity' }).props.value).toBe(
    '1 件',
  );
  expect(
    app.root.findByProps({ testID: 'draft-pickup-time' }).props.value,
  ).toBe('明天 09:30');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  const renderedTextItems = app.root
    .findAllByType(Text)
    .map(node => collectText(node.props.children).join(''));
  const renderedText = renderedTextItems.join(' ');

  expect(renderedText).toContain('HYLOCAL001');
  expect(renderedTextItems).toContain('数量：1 件');
  expect(renderedText).toContain('复制来源：HY20260620003');
});

test('submits an exception report for a transporting order', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260621008' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-secondary-action' })
      .props.onPress();
  });

  expect(getRenderedText(app)).toContain('异常上报');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'exception-type-delay' }).props.onPress();
    app.root
      .findByProps({ testID: 'exception-description' })
      .props.onChangeText('司机预计晚到 30 分钟');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'exception-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('异常已提交：司机延误');
  expect(renderedText).toContain('司机预计晚到 30 分钟');
});

test('requires an explicit exception type before submitting a report', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260621008' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-secondary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'exception-description' })
      .props.onChangeText('未选择类型时不应该提交异常');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'exception-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('请选择异常类型后再提交');
  expect(renderedText).not.toContain('异常已提交');
});

test('requires a detailed exception description before submitting a report', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260621008' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-secondary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'exception-type-delay' }).props.onPress();
    app.root
      .findByProps({ testID: 'exception-description' })
      .props.onChangeText('晚到');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'exception-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('请至少填写 6 个字的异常说明');
  expect(renderedText).not.toContain('异常已提交：');
  expect(renderedText).not.toContain('异常记录');
});

test('adds and removes local exception photo vouchers before submitting', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260621008' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-secondary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'exception-type-damage' }).props.onPress();
    app.root.findByProps({ testID: 'exception-photo-add' }).props.onPress();
    app.root.findByProps({ testID: 'exception-photo-add' }).props.onPress();
    app.root
      .findByProps({ testID: 'exception-description' })
      .props.onChangeText('卸货时发现外包装破损');
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('异常图片凭证清单');
  expect(renderedText).toContain('本地图片凭证 1：本地已保存');
  expect(renderedText).toContain('本地图片凭证 2：本地已保存');
  expect(renderedText).toContain('来源：本地图片凭证占位');
  expect(
    app.root.findByProps({ testID: 'exception-photo-preview-placeholder-1' })
      .props.children,
  ).toBe('异常图片 1');
  expect(
    app.root.findByProps({ testID: 'exception-photo-preview-placeholder-2' })
      .props.children,
  ).toBe('异常图片 2');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'exception-photo-remove-latest' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('图片凭证 1 张');
  expect(renderedText).toContain('本地图片凭证 1：本地已保存');
  expect(renderedText).not.toContain('本地图片凭证 2：本地已保存');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'exception-submit' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('异常已提交：货物损坏');
  expect(renderedText).toContain('卸货时发现外包装破损');
  expect(renderedText).toContain('图片凭证 1 张');
});

test('shows a local tracking card for a transporting order', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260621008' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('位置跟踪');
  expect(renderedText).toContain(
    '当前位置：龙岗区坂田工厂 → 福田区车公庙展厅途中',
  );
  expect(renderedText).toContain('预计到达：预计 18:20 到达');
  expect(renderedText).toContain('陈师傅');
});

test('submits a change request for a non-waiting order', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260621008' })
      .props.onPress();
  });

  expect(getRenderedText(app)).toContain('运输中');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-change-request-action' })
      .props.onPress();
  });

  expect(getRenderedText(app)).toContain('修改申请');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'change-request-submit' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('请填写修改说明后再提交');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'change-request-description' })
      .props.onChangeText('卸货地址改到福田会展中心，需司机确认');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'change-request-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('修改申请记录');
  expect(renderedText).toContain('卸货地址改到福田会展中心，需司机确认');
  expect(renderedText).toContain('处理状态：待客服确认');
  expect(renderedText).toContain(
    '司机已接单，本地演示需客服确认司机通知、费用和退款影响。',
  );
  expect(renderedText).toContain(
    '费用影响：待客服重新核算费用，当前订单金额暂不变更。',
  );
  expect(renderedText).toContain(
    '退款状态：支付资金暂不变更，审核通过后再同步差额。',
  );
  expect(renderedText).toContain(
    '司机通知：已生成司机修改确认通知，等待客服确认后同步。',
  );
});

test('updates the local change request review status from the order detail', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260621008' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-change-request-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'change-request-description' })
      .props.onChangeText('卸货地址改到福田会展中心，需司机确认');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'change-request-submit' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'change-request-approve-HY20260621008' })
      .props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('处理状态：已确认');
  expect(renderedText).toContain(
    '审核结果：客服已确认修改申请，司机通知已同步。',
  );

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-change-request-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'change-request-description' })
      .props.onChangeText('再次修改卸货时间，需重新审核');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'change-request-submit' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'change-request-reject-HY20260621008' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('处理状态：已驳回');
  expect(renderedText).toContain(
    '审核结果：客服驳回修改申请，订单按原信息继续执行。',
  );
});

test('updates the local exception processing status from the order detail', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260621008' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-secondary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'exception-type-delay' }).props.onPress();
    app.root
      .findByProps({ testID: 'exception-description' })
      .props.onChangeText('司机预计晚到 30 分钟');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'exception-submit' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('处理状态：待客服跟进');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'exception-resolve-HY20260621008' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('处理状态：已处理');
  expect(renderedText).toContain('异常处理状态已更新：已处理');
});

test('submits a driver evaluation for a completed order', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260620003' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  expect(getRenderedText(app)).toContain('评价司机');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-rating-5' }).props.onPress();
    app.root.findByProps({ testID: 'evaluation-tag-punctual' }).props.onPress();
    app.root
      .findByProps({ testID: 'evaluation-content' })
      .props.onChangeText('师傅准时，货物保护不错');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('评价已提交：5 星');
  expect(renderedText).toContain('准时');
  expect(renderedText).toContain('师傅准时，货物保护不错');
});

test('prevents editing a submitted driver evaluation', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260620003' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-rating-5' }).props.onPress();
    app.root.findByProps({ testID: 'evaluation-tag-punctual' }).props.onPress();
    app.root
      .findByProps({ testID: 'evaluation-content' })
      .props.onChangeText('师傅准时，货物保护不错');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-submit' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('查看评价');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('评价已提交，不可修改。');
  expect(renderedText).toContain('师傅准时，货物保护不错');
  expect(app.root.findAllByProps({ testID: 'evaluation-submit' })).toHaveLength(
    0,
  );
});

test('requires a detailed driver evaluation content before submitting', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260620003' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-tag-punctual' }).props.onPress();
    app.root
      .findByProps({ testID: 'evaluation-content' })
      .props.onChangeText('好');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('请至少填写 6 个字的评价内容');
  expect(renderedText).not.toContain('评价已提交：');
  expect(renderedText).not.toContain('我的评价');
});

test('rejects a driver evaluation longer than 200 characters', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260620003' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-rating-5' }).props.onPress();
    app.root.findByProps({ testID: 'evaluation-tag-punctual' }).props.onPress();
    app.root
      .findByProps({ testID: 'evaluation-content' })
      .props.onChangeText('很'.repeat(201));
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('评价内容最多 200 字');
  expect(renderedText).not.toContain('评价已提交：');
  expect(renderedText).not.toContain('我的评价');
});

test('shows a submitted driver evaluation in the local profile evaluation records', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260620003' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-rating-4' }).props.onPress();
    app.root
      .findByProps({ testID: 'evaluation-tag-communicate' })
      .props.onPress();
    app.root
      .findByProps({ testID: 'evaluation-content' })
      .props.onChangeText('司机搬运配合度很好，沟通及时');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-submit' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-entry-evaluations' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('HY20260620003');
  expect(renderedText).toContain('李师傅');
  expect(renderedText).toContain('4 星');
  expect(renderedText).toContain('司机搬运配合度很好，沟通及时');
});

test('shows driver replies in local profile evaluation records', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-entry-evaluations' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('司机回复：感谢认可，后续继续保持准时装卸。');
  expect(renderedText).toContain('回复时间：昨天 19:10');
});

test('submits an anonymous driver evaluation and shows it in profile records', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260620003' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-rating-5' }).props.onPress();
    app.root.findByProps({ testID: 'evaluation-tag-punctual' }).props.onPress();
    app.root
      .findByProps({ testID: 'evaluation-anonymous-toggle' })
      .props.onPress();
    app.root
      .findByProps({ testID: 'evaluation-content' })
      .props.onChangeText('希望这条评价匿名展示');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-submit' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('匿名评价');
  expect(renderedText).toContain('希望这条评价匿名展示');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-entry-evaluations' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('匿名评价');
  expect(renderedText).toContain('希望这条评价匿名展示');
});

test('adds and removes local evaluation photo vouchers before submitting', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260620003' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-rating-5' }).props.onPress();
    app.root.findByProps({ testID: 'evaluation-tag-punctual' }).props.onPress();
    app.root.findByProps({ testID: 'evaluation-photo-add' }).props.onPress();
    app.root.findByProps({ testID: 'evaluation-photo-add' }).props.onPress();
    app.root
      .findByProps({ testID: 'evaluation-content' })
      .props.onChangeText('已补充现场交付图片');
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('评价图片凭证清单');
  expect(renderedText).toContain('本地图片凭证 1：本地已保存');
  expect(renderedText).toContain('本地图片凭证 2：本地已保存');
  expect(renderedText).toContain('来源：本地图片凭证占位');
  expect(
    app.root.findByProps({ testID: 'evaluation-photo-preview-placeholder-1' })
      .props.children,
  ).toBe('评价图片 1');
  expect(
    app.root.findByProps({ testID: 'evaluation-photo-preview-placeholder-2' })
      .props.children,
  ).toBe('评价图片 2');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-photo-remove-latest' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('图片凭证 1 张');
  expect(renderedText).toContain('本地图片凭证 1：本地已保存');
  expect(renderedText).not.toContain('本地图片凭证 2：本地已保存');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-submit' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('图片凭证 1 张');
  expect(renderedText).toContain('已补充现场交付图片');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-entry-evaluations' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('图片凭证 1 张');
  expect(renderedText).toContain('已补充现场交付图片');
});

test('filters local profile evaluation records by rating level', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'home-recent-order-HY20260620003' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-rating-4' }).props.onPress();
    app.root.findByProps({ testID: 'evaluation-tag-service' }).props.onPress();
    app.root
      .findByProps({ testID: 'evaluation-content' })
      .props.onChangeText('服务态度不错，但到场稍慢');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-submit' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-entry-evaluations' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-filter-lower' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('4 星');
  expect(renderedText).toContain('服务态度不错，但到场稍慢');
  expect(renderedText).not.toContain('师傅准时，货物保护不错。');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'evaluation-filter-high' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('5 星');
  expect(renderedText).toContain('师傅准时，货物保护不错。');
  expect(renderedText).not.toContain('服务态度不错，但到场稍慢');
});

test('keeps an unfinished draft when leaving and reopening the draft screen', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('3.2 吨');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('龙华临时仓');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('福田会展中心');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-back' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('货运发单');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  expect(app.root.findByProps({ testID: 'draft-weight' }).props.value).toBe(
    '3.2 吨',
  );
  expect(
    app.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
  ).toBe('龙华临时仓');
  expect(
    app.root.findByProps({ testID: 'draft-delivery-address' }).props.value,
  ).toBe('福田会展中心');
});

test('persists a saved draft to device storage', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('4.4 吨');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('坪山临时仓');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('前海展示厅');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-save' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('草稿已保存');

  await flushMicrotasks();

  const storedDraft = await getStoredSnapshot<{
    draft: {
      weightText?: string;
      pickupAddress?: string;
      deliveryAddress?: string;
    };
  }>('@vireCodeing/draft-storage');

  expect(storedDraft.draft).toMatchObject({
    weightText: '4.4 吨',
    pickupAddress: '坪山临时仓',
    deliveryAddress: '前海展示厅',
  });
});

test('edits a waiting order from the detail screen and updates the original order', async () => {
  const app = await renderApp();

  await loginToHome(app);
  await openFirstRecentOrder(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-edit-action' })
      .props.onPress();
  });

  expect(getRenderedText(app)).toContain('正在修改订单：HY20260622001');
  expect(app.root.findByProps({ testID: 'draft-weight' }).props.value).toBe(
    '2.5 吨',
  );

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('3.6 吨');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安新仓');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('890');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('订单详情');
  expect(renderedText).toContain('HY20260622001');
  expect(renderedText).toContain('宝安新仓');
  expect(renderedText).toContain('3.6 吨');
  expect(renderedText).toContain('￥890');
  expect(renderedText).not.toContain('HYLOCAL001');
});

test('marks a local coupon as used when editing a waiting order with that coupon', async () => {
  const app = await renderApp();

  await loginToHome(app);
  await openFirstRecentOrder(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-edit-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-coupon-coupon-1' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('实付金额：￥650');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);
  const editedOrder = getAppRuntimeState().orders.find(
    order => order.id === 'HY20260622001',
  );
  const usedCoupon = getProfileLocalState().coupons.find(
    item => item.id === 'coupon-1',
  );

  expect(renderedText).toContain('HY20260622001');
  expect(renderedText).toContain('优惠券：满 300 减 30');
  expect(editedOrder?.couponTitleText).toBe('满 300 减 30');
  expect(editedOrder?.payablePriceText).toBe('￥650');
  expect(usedCoupon?.statusText).toBe('已使用');
  expect(usedCoupon?.validUntilText).toBe('已用于订单 HY20260622001');
});

test('keeps an editing order draft and still updates the original order', async () => {
  const app = await renderApp();

  await loginToHome(app);
  await openFirstRecentOrder(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-edit-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('3.6 吨');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('宝安恢复仓');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-back' }).props.onPress();
  });

  await flushMicrotasks();

  const storedDraft = await getStoredSnapshot<{
    draft: {
      editingOrderId?: string;
      weightText?: string;
      pickupAddress?: string;
    };
  }>('@vireCodeing/draft-storage');

  expect(storedDraft.draft).toMatchObject({
    editingOrderId: 'HY20260622001',
    weightText: '3.6 吨',
    pickupAddress: '宝安恢复仓',
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  expect(app.root.findByProps({ testID: 'draft-weight' }).props.value).toBe(
    '3.6 吨',
  );
  expect(
    app.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
  ).toBe('宝安恢复仓');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('订单详情');
  expect(renderedText).toContain('HY20260622001');
  expect(renderedText).toContain('宝安恢复仓');
  expect(renderedText).toContain('3.6 吨');
  expect(renderedText).not.toContain('HYLOCAL001');
});

test('logs out from the home screen and returns to auth', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-logout' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('账号验证');
  expect(renderedText).toContain('登录');
  expect(renderedText).toContain('注册');
  expect(renderedText).not.toContain('货运发单');
});

test('opens the local message center from the home screen', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('消息中心');
  expect(renderedText).toContain('本地版');
  expect(renderedText).toContain('司机报价提醒');
  expect(renderedText).toContain('订单 HY20260622001 收到 2 个司机报价');
  expect(renderedText).toContain('系统通知');
  expect(renderedText).toContain('财务到账提醒');
  expect(
    app.root.findByProps({ testID: 'message-category-message-finance-1' }).props
      .children,
  ).toBe('财务通知');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'support-back-home' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('货运发单');
  expect(renderedText).toContain('最近订单');
});

test('filters unread messages in the local message center', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'message-filter-view-unread' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('司机报价提醒');
  expect(renderedText).toContain('系统通知');
  expect(renderedText).not.toContain('客服处理进度');
  expect(renderedText).not.toContain('财务到账提醒');
  expect(
    app.root.findByProps({ testID: 'message-filter-summary' }).props.children,
  ).toBe('当前筛选显示 2 条消息');
  expect(
    app.root.findByProps({ testID: 'message-unread-summary' }).props.children,
  ).toBe('2 条未读');
  expect(
    app.root.findAllByProps({ testID: 'message-mark-read-message-finance-1' }),
  ).toHaveLength(0);
});

test('filters messages by category in the local message center', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'message-filter-category-finance' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('财务到账提醒');
  expect(renderedText).not.toContain('司机报价提醒');
  expect(renderedText).not.toContain('系统通知');
  expect(renderedText).not.toContain('客服处理进度');
  expect(
    app.root.findByProps({ testID: 'message-filter-summary' }).props.children,
  ).toBe('当前筛选显示 1 条消息');
  expect(
    app.root.findByProps({ testID: 'message-status-message-finance-1' }).props
      .children,
  ).toBe('已读');
  expect(
    app.root.findAllByProps({
      testID: 'message-conversation-order-HY20260622001',
    }),
  ).toHaveLength(0);
});

test('hides the manual refresh button in local message mode', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
  });

  expect(
    app.root.findAllByProps({ testID: 'message-manual-refresh' }),
  ).toHaveLength(0);
});

test('opens an order detail from an order message', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'message-conversation-order-HY20260622001' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'support-topbar-right-action' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('订单详情');
  expect(renderedText).toContain('HY20260622001');
  expect(renderedText).toContain('查看报价');
});

test('returns to the message center after opening a detail from an order message', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'message-conversation-order-HY20260622001' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'support-topbar-right-action' })
      .props.onPress();
  });

  expect(getRenderedText(app)).toContain('订单详情');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('消息中心');
  expect(renderedText).toContain('订单 HY20260622001 收到 2 个司机报价');
  expect(
    getAppRuntimeState().messages.find(message => message.id === 'message-quote-1')
      ?.unread,
  ).toBe(false);
  expect(renderedText).not.toContain('货运发单');
});

test('marks an order message as read and updates the local unread count', async () => {
  const app = await renderApp();

  await loginToHome(app);

  expect(
    app.root.findByProps({ testID: 'home-unread-message-count' }).props
      .children,
  ).toBe(2);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'message-conversation-order-HY20260622001' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'support-back-home' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('消息中心');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'support-back-home' }).props.onPress();
  });

  expect(
    app.root.findByProps({ testID: 'home-unread-message-count' }).props
      .children,
  ).toBe(1);
  expect(
    getAppRuntimeState().messages.find(message => message.id === 'message-quote-1')
      ?.unread,
  ).toBe(false);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
  });

  expect(
    app.root.findByProps({ testID: 'message-unread-summary' }).props.children,
  ).toBe('1 条未读');
});

test('marks a non-order message as read and updates the local unread count', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
  });

  expect(
    app.root.findByProps({ testID: 'message-status-message-system-1' }).props
      .children,
  ).toBe('未读');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'message-mark-read-message-system-1' })
      .props.onPress();
  });

  expect(
    app.root.findByProps({ testID: 'message-status-message-system-1' }).props
      .children,
  ).toBe('已读');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'support-back-home' }).props.onPress();
  });

  expect(
    app.root.findByProps({ testID: 'home-unread-message-count' }).props
      .children,
  ).toBe(1);
});

test('marks all messages as read and persists the unread count reset', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
  });

  expect(
    app.root.findByProps({ testID: 'message-unread-summary' }).props.children,
  ).toBe('2 条未读');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'message-mark-all-read' }).props.onPress();
  });

  expect(
    app.root.findByProps({ testID: 'message-status-message-system-1' }).props
      .children,
  ).toBe('已读');
  expect(
    getAppRuntimeState().messages.find(message => message.id === 'message-quote-1')
      ?.unread,
  ).toBe(false);
  expect(
    app.root.findByProps({ testID: 'message-unread-summary' }).props.children,
  ).toBe('全部已读');
  expect(getAppRuntimeState().messages.every(message => !message.unread)).toBe(
    true,
  );

  await flushMicrotasks();

  const storedState = await getStoredSnapshot<{
    state: {
      messages: Array<{
        id: string;
        unread: boolean;
      }>;
    };
  }>('@vireCodeing/app-runtime-state');

  expect(
    storedState.state.messages.every(message => message.unread === false),
  ).toBe(true);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'support-back-home' }).props.onPress();
  });

  expect(
    app.root.findByProps({ testID: 'home-unread-message-count' }).props
      .children,
  ).toBe(0);
});

test('rolls back a platform message read when the platform request fails', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(input);

    if (
      requestUrl === 'http://localhost:3000/api/auth/send-code' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/auth/login' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'platform-user-message-read-failure',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-message-read-failure.900',
            refreshToken: 'refresh.platform-message-read-failure.900',
            expiresIn: 3600,
          },
        }),
      );
    }

    if (
      requestUrl.includes('/me/messages?') &&
      (!init?.method || init.method === 'GET')
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          items: [
            {
              id: 'msg-platform-read-fail-1',
              userId: 'platform-user-message-read-failure',
              audience: 'shipper',
              category: 'system',
              title: '系统提醒',
              content: '请核对账单',
              unread: true,
              createdAtIso: '2026-07-21T09:00:00.000Z',
              updatedAtIso: '2026-07-21T09:00:00.000Z',
            },
            {
              id: 'msg-platform-read-fail-2',
              userId: 'platform-user-message-read-failure',
              audience: 'shipper',
              category: 'service',
              title: '客服通知',
              content: '客服已受理您的问题',
              unread: true,
              createdAtIso: '2026-07-21T09:10:00.000Z',
              updatedAtIso: '2026-07-21T09:10:00.000Z',
            },
          ],
          page: 1,
          pageSize: 50,
          total: 2,
          unreadCount: 2,
        }),
      );
    }

    if (
      requestUrl ===
        'http://localhost:3000/api/me/messages/msg-platform-read-fail-1/read' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiErrorResponse(
          500,
          'MESSAGE_READ_FAILED',
          'message read failed',
        ),
      );
    }

    return Promise.reject(new Error(`Unexpected request: ${requestUrl}`));
  });

  globalThis.fetch = fetchMock as unknown as typeof fetch;

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      app.root.findByProps({ testID: 'message-status-msg-platform-read-fail-1' })
        .props.children,
    ).toBe('未读');
    expect(
      app.root.findByProps({ testID: 'message-unread-summary' }).props.children,
    ).toBe('2 条未读');

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'message-mark-read-msg-platform-read-fail-1' })
        .props.onPress();
    });

    expect(
      app.root.findByProps({ testID: 'message-status-msg-platform-read-fail-1' })
        .props.children,
    ).toBe('已读');
    expect(
      app.root.findByProps({ testID: 'message-unread-summary' }).props.children,
    ).toBe('1 条未读');
    expect(getAppRuntimeState().messageUnreadCount).toBe(1);

    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
    });

    expect(
      app.root.findByProps({ testID: 'message-status-msg-platform-read-fail-1' })
        .props.children,
    ).toBe('未读');
    expect(
      app.root.findByProps({ testID: 'message-unread-summary' }).props.children,
    ).toBe('2 条未读');
    expect(getAppRuntimeState().messageUnreadCount).toBe(2);
    expect(
      app.root.findByProps({ testID: 'message-refresh-notice' }).props.children,
    ).toBe('平台消息已读同步失败，已恢复当前状态。');

    const storedState = await getStoredSnapshot<{
      state: {
        messages: Array<{
          id: string;
          unread: boolean;
        }>;
        messageUnreadCount: number;
      };
    }>('@vireCodeing/app-runtime-state');

    expect(
      storedState.state.messages.find(
        message => message.id === 'msg-platform-read-fail-1',
      )?.unread,
    ).toBe(true);
    expect(storedState.state.messageUnreadCount).toBe(2);
    expect(
      findFetchCall(fetchMock, {
        url: 'http://localhost:3000/api/me/messages/msg-platform-read-fail-1/read',
        method: 'POST',
      }),
    ).toBeDefined();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rolls back mark-all-read when the platform request fails', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(input);

    if (
      requestUrl === 'http://localhost:3000/api/auth/send-code' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/auth/login' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'platform-user-message-read-all-failure',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-message-read-all-failure.900',
            refreshToken: 'refresh.platform-message-read-all-failure.900',
            expiresIn: 3600,
          },
        }),
      );
    }

    if (
      requestUrl.includes('/me/messages?') &&
      (!init?.method || init.method === 'GET')
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          items: [
            {
              id: 'msg-platform-read-all-fail-1',
              userId: 'platform-user-message-read-all-failure',
              audience: 'shipper',
              category: 'order',
              title: '订单更新',
              content: '司机已到达装货点',
              orderId: 'order-platform-read-all-fail-1',
              orderNo: 'HY202607220001',
              unread: true,
              createdAtIso: '2026-07-22T08:00:00.000Z',
              updatedAtIso: '2026-07-22T08:00:00.000Z',
            },
            {
              id: 'msg-platform-read-all-fail-2',
              userId: 'platform-user-message-read-all-failure',
              audience: 'shipper',
              category: 'finance',
              title: '财务提醒',
              content: '请确认本月结算单',
              unread: true,
              createdAtIso: '2026-07-22T08:10:00.000Z',
              updatedAtIso: '2026-07-22T08:10:00.000Z',
            },
          ],
          page: 1,
          pageSize: 50,
          total: 2,
          unreadCount: 2,
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/me/messages/read-all' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiErrorResponse(
          500,
          'MESSAGE_READ_ALL_FAILED',
          'message read all failed',
        ),
      );
    }

    return Promise.reject(new Error(`Unexpected request: ${requestUrl}`));
  });

  globalThis.fetch = fetchMock as unknown as typeof fetch;

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      app.root.findByProps({ testID: 'message-unread-summary' }).props.children,
    ).toBe('2 条未读');

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'message-mark-all-read' }).props.onPress();
    });

    expect(
      app.root.findByProps({
        testID: 'message-status-msg-platform-read-all-fail-2',
      }).props.children,
    ).toBe('已读');
    expect(
      app.root.findByProps({ testID: 'message-unread-summary' }).props.children,
    ).toBe('全部已读');
    expect(
      getAppRuntimeState().messages.find(
        message => message.id === 'msg-platform-read-all-fail-1',
      )?.unread,
    ).toBe(false);
    expect(getAppRuntimeState().messageUnreadCount).toBe(0);

    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
    });

    expect(
      app.root.findByProps({
        testID: 'message-status-msg-platform-read-all-fail-2',
      }).props.children,
    ).toBe('未读');
    expect(
      app.root.findByProps({ testID: 'message-unread-summary' }).props.children,
    ).toBe('2 条未读');
    expect(
      getAppRuntimeState().messages.find(
        message => message.id === 'msg-platform-read-all-fail-1',
      )?.unread,
    ).toBe(true);
    expect(getAppRuntimeState().messageUnreadCount).toBe(2);
    expect(
      app.root.findByProps({ testID: 'message-refresh-notice' }).props.children,
    ).toBe('平台消息全部已读同步失败，已恢复当前状态。');

    const storedState = await getStoredSnapshot<{
      state: {
        messages: Array<{
          id: string;
          unread: boolean;
        }>;
        messageUnreadCount: number;
      };
    }>('@vireCodeing/app-runtime-state');

    expect(
      storedState.state.messages.every(message => message.unread === true),
    ).toBe(true);
    expect(storedState.state.messageUnreadCount).toBe(2);
    expect(
      findFetchCall(fetchMock, {
        url: 'http://localhost:3000/api/me/messages/read-all',
        method: 'POST',
      }),
    ).toBeDefined();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses the platform unread count even when the current page has no unread messages', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(input);

    if (
      requestUrl === 'http://localhost:3000/api/auth/send-code' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/auth/login' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'platform-user-1',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-messages-total.900',
            refreshToken: 'refresh.platform-messages-total.900',
            expiresIn: 3600,
          },
        }),
      );
    }

    if (
      requestUrl.includes('/me/messages?') &&
      (!init?.method || init.method === 'GET')
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          items: [
            {
              id: 'msg-platform-1',
              userId: 'platform-user-1',
              audience: 'shipper',
              category: 'order',
              title: '订单状态更新',
              content: '司机已接单',
              orderId: 'order-platform-1',
              orderNo: 'HY202607210001',
              unread: false,
              createdAtIso: '2026-07-21T09:00:00.000Z',
              updatedAtIso: '2026-07-21T09:00:00.000Z',
            },
          ],
          page: 1,
          pageSize: 50,
          total: 51,
          unreadCount: 3,
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/me/messages/read-all' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          updatedCount: 3,
        }),
      );
    }

    return Promise.reject(new Error(`Unexpected request: ${requestUrl}`));
  });

  globalThis.fetch = fetchMock as unknown as typeof fetch;

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
    });

    expect(getRenderedText(app)).toContain('货运发单');
    expect(
      app.root.findByProps({ testID: 'home-unread-message-count' }).props
        .children,
    ).toBe(3);
    expect(getAppRuntimeState().messageUnreadCount).toBe(3);

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
    });

    expect(
      app.root.findByProps({ testID: 'message-unread-summary' }).props.children,
    ).toBe('3 条未读');
    expect(
      app.root.findByProps({
        testID: 'message-conversation-order-order-platform-1',
      }),
    ).toBeTruthy();

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'message-mark-all-read' }).props.onPress();
    });

    await flushMicrotasks();

    expect(
      app.root.findByProps({ testID: 'message-unread-summary' }).props.children,
    ).toBe('全部已读');
    expect(getAppRuntimeState().messageUnreadCount).toBe(0);

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'support-back-home' }).props.onPress();
    });

    expect(
      app.root.findByProps({ testID: 'home-unread-message-count' }).props
        .children,
    ).toBe(0);
    expect(
      findFetchCall(fetchMock, {
        url: 'http://localhost:3000/api/me/messages/read-all',
        method: 'POST',
      }),
    ).toBeDefined();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshes platform messages when opening the message center from home', async () => {
  const originalFetch = globalThis.fetch;
  let messageListRequestCount = 0;
  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(input);

    if (
      requestUrl === 'http://localhost:3000/api/auth/send-code' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/auth/login' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'platform-user-2',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-messages-refresh.900',
            refreshToken: 'refresh.platform-messages-refresh.900',
            expiresIn: 3600,
          },
        }),
      );
    }

    if (
      requestUrl.includes('/me/messages?') &&
      (!init?.method || init.method === 'GET')
    ) {
      messageListRequestCount += 1;

      return Promise.resolve(
        createPlatformApiResponse(
          messageListRequestCount === 1
            ? {
                items: [
                  {
                    id: 'msg-platform-old',
                    userId: 'platform-user-2',
                    audience: 'shipper',
                    category: 'system',
                    title: '旧消息',
                    content: '首次登录时的消息',
                    unread: false,
                    createdAtIso: '2026-07-21T08:00:00.000Z',
                    updatedAtIso: '2026-07-21T08:00:00.000Z',
                  },
                ],
                page: 1,
                pageSize: 50,
                total: 1,
                unreadCount: 1,
              }
            : {
                items: [
                  {
                    id: 'msg-platform-new',
                    userId: 'platform-user-2',
                    audience: 'shipper',
                    category: 'service',
                    title: '新的平台消息',
                    content: '消息中心打开时已刷新',
                    unread: true,
                    createdAtIso: '2026-07-21T09:30:00.000Z',
                    updatedAtIso: '2026-07-21T09:30:00.000Z',
                  },
                ],
                page: 1,
                pageSize: 50,
                total: 1,
                unreadCount: 4,
              },
        ),
      );
    }

    return Promise.reject(new Error(`Unexpected request: ${requestUrl}`));
  });

  globalThis.fetch = fetchMock as unknown as typeof fetch;

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
    });

    expect(getRenderedText(app)).toContain('货运发单');
    expect(
      app.root.findByProps({ testID: 'home-unread-message-count' }).props
        .children,
    ).toBe(1);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
      await flushMicrotasks();
    });

    const renderedText = getRenderedText(app);

    expect(renderedText).toContain('平台同步');
    expect(renderedText).toContain('新的平台消息');
    expect(
      app.root.findByProps({ testID: 'message-unread-summary' }).props.children,
    ).toBe('4 条未读');
    expect(
      app.root.findByProps({ testID: 'message-status-msg-platform-new' }).props
        .children,
    ).toBe('未读');
    expect(messageListRequestCount).toBe(2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshes platform messages manually from the message center', async () => {
  const originalFetch = globalThis.fetch;
  let messageListRequestCount = 0;
  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(input);

    if (
      requestUrl === 'http://localhost:3000/api/auth/send-code' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/auth/login' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'platform-user-3',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-messages-manual-refresh.900',
            refreshToken: 'refresh.platform-messages-manual-refresh.900',
            expiresIn: 3600,
          },
        }),
      );
    }

    if (
      requestUrl.includes('/me/messages?') &&
      (!init?.method || init.method === 'GET')
    ) {
      messageListRequestCount += 1;

      return Promise.resolve(
        createPlatformApiResponse(
          messageListRequestCount === 1
            ? {
                items: [
                  {
                    id: 'msg-platform-manual-old',
                    userId: 'platform-user-3',
                    audience: 'shipper',
                    category: 'system',
                    title: '启动消息',
                    content: '应用启动时同步的消息',
                    unread: false,
                    createdAtIso: '2026-07-23T08:00:00.000Z',
                    updatedAtIso: '2026-07-23T08:00:00.000Z',
                  },
                ],
                page: 1,
                pageSize: 50,
                total: 1,
                unreadCount: 1,
              }
            : messageListRequestCount === 2
            ? {
                items: [
                  {
                    id: 'msg-platform-manual-open',
                    userId: 'platform-user-3',
                    audience: 'shipper',
                    category: 'service',
                    title: '打开消息中心后的同步',
                    content: '消息中心打开时已刷新',
                    unread: true,
                    createdAtIso: '2026-07-23T09:00:00.000Z',
                    updatedAtIso: '2026-07-23T09:00:00.000Z',
                  },
                ],
                page: 1,
                pageSize: 50,
                total: 1,
                unreadCount: 2,
              }
            : {
                items: [
                  {
                    id: 'msg-platform-manual-latest',
                    userId: 'platform-user-3',
                    audience: 'shipper',
                    category: 'finance',
                    title: '手动刷新后的最新消息',
                    content: '手动刷新拉取到最新消息',
                    unread: true,
                    createdAtIso: '2026-07-23T09:30:00.000Z',
                    updatedAtIso: '2026-07-23T09:30:00.000Z',
                  },
                ],
                page: 1,
                pageSize: 50,
                total: 1,
                unreadCount: 5,
              },
        ),
      );
    }

    return Promise.reject(new Error(`Unexpected request: ${requestUrl}`));
  });

  globalThis.fetch = fetchMock as unknown as typeof fetch;

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(app)).toContain('消息中心打开时已刷新');
    expect(
      app.root.findByProps({ testID: 'message-unread-summary' }).props.children,
    ).toBe('2 条未读');
    expect(
      app.root.findByProps({ testID: 'message-manual-refresh' }),
    ).toBeTruthy();

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'message-manual-refresh' }).props.onPress();
      await flushMicrotasks();
    });

    const renderedText = getRenderedText(app);

    expect(renderedText).toContain('手动刷新后的最新消息');
    expect(renderedText).toContain('手动刷新拉取到最新消息');
    expect(renderedText).not.toContain('打开消息中心后的同步');
    expect(
      app.root.findByProps({ testID: 'message-unread-summary' }).props.children,
    ).toBe('5 条未读');
    expect(messageListRequestCount).toBe(3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shows cached message notice when a platform refresh fails and clears it after recovery', async () => {
  const originalFetch = globalThis.fetch;
  let messageListRequestCount = 0;
  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(input);

    if (
      requestUrl === 'http://localhost:3000/api/auth/send-code' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/auth/login' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'platform-user-message-refresh-notice',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-message-refresh-notice.900',
            refreshToken: 'refresh.platform-message-refresh-notice.900',
            expiresIn: 3600,
          },
        }),
      );
    }

    if (
      requestUrl.includes('/me/messages?') &&
      (!init?.method || init.method === 'GET')
    ) {
      messageListRequestCount += 1;

      if (messageListRequestCount === 2) {
        return Promise.reject(new Error('message refresh failed'));
      }

      return Promise.resolve(
        createPlatformApiResponse(
          messageListRequestCount === 1
            ? {
                items: [
                  {
                    id: 'msg-platform-refresh-cached',
                    userId: 'platform-user-message-refresh-notice',
                    audience: 'shipper',
                    category: 'system',
                    title: '首次加载的消息',
                    content: '这是启动时拿到的缓存消息',
                    unread: true,
                    createdAtIso: '2026-07-22T08:00:00.000Z',
                    updatedAtIso: '2026-07-22T08:00:00.000Z',
                  },
                ],
                page: 1,
                pageSize: 50,
                total: 1,
                unreadCount: 1,
              }
            : {
                items: [
                  {
                    id: 'msg-platform-refresh-recovered',
                    userId: 'platform-user-message-refresh-notice',
                    audience: 'shipper',
                    category: 'service',
                    title: '重试后同步成功',
                    content: '平台消息刷新已经恢复',
                    unread: true,
                    createdAtIso: '2026-07-22T08:30:00.000Z',
                    updatedAtIso: '2026-07-22T08:30:00.000Z',
                  },
                ],
                page: 1,
                pageSize: 50,
                total: 2,
                unreadCount: 2,
              },
        ),
      );
    }

    return Promise.reject(new Error(`Unexpected request: ${requestUrl}`));
  });

  globalThis.fetch = fetchMock as unknown as typeof fetch;

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
    });

    expect(
      app.root.findByProps({ testID: 'home-unread-message-count' }).props
        .children,
    ).toBe(1);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(app)).toContain('首次加载的消息');
    expect(
      app.root.findByProps({ testID: 'message-refresh-notice' }).props.children,
    ).toBe('平台消息刷新失败，当前显示本地缓存。');

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'support-back-home' }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(app)).toContain('重试后同步成功');
    expect(
      app.root.findAllByProps({ testID: 'message-refresh-notice' }),
    ).toHaveLength(0);
    expect(
      app.root.findByProps({ testID: 'message-unread-summary' }).props.children,
    ).toBe('2 条未读');
    expect(messageListRequestCount).toBe(3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps local read state when a later platform message refresh is stale', async () => {
  const originalFetch = globalThis.fetch;
  let messageListRequestCount = 0;
  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(input);

    if (
      requestUrl === 'http://localhost:3000/api/auth/send-code' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/auth/login' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'platform-user-message-stale-refresh',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-message-stale-refresh.900',
            refreshToken: 'refresh.platform-message-stale-refresh.900',
            expiresIn: 3600,
          },
        }),
      );
    }

    if (
      requestUrl.includes('/me/messages?') &&
      (!init?.method || init.method === 'GET')
    ) {
      messageListRequestCount += 1;

      return Promise.resolve(
        createPlatformApiResponse({
          items: [
            {
              id: 'msg-platform-stale-read',
              userId: 'platform-user-message-stale-refresh',
              audience: 'shipper',
              category: 'system',
              title: '平台消息',
              content: '服务端刷新仍返回旧未读状态',
              unread: true,
              createdAtIso: '2026-07-22T09:00:00.000Z',
              updatedAtIso: '2026-07-22T09:00:00.000Z',
            },
          ],
          page: 1,
          pageSize: 50,
          total: 1,
          unreadCount: 1,
        }),
      );
    }

    if (
      requestUrl ===
        'http://localhost:3000/api/me/messages/msg-platform-stale-read/read' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'msg-platform-stale-read',
          userId: 'platform-user-message-stale-refresh',
          audience: 'shipper',
          category: 'system',
          title: '平台消息',
          content: '服务端已接收已读',
          unread: false,
          readAtIso: '2026-07-22T09:05:00.000Z',
          createdAtIso: '2026-07-22T09:00:00.000Z',
          updatedAtIso: '2026-07-22T09:05:00.000Z',
        }),
      );
    }

    return Promise.reject(new Error(`Unexpected request: ${requestUrl}`));
  });

  globalThis.fetch = fetchMock as unknown as typeof fetch;

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
    });

    expect(
      app.root.findByProps({ testID: 'home-unread-message-count' }).props
        .children,
    ).toBe(1);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      app.root.findByProps({ testID: 'message-status-msg-platform-stale-read' })
        .props.children,
    ).toBe('未读');

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'message-mark-read-msg-platform-stale-read' })
        .props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
    });

    expect(
      app.root.findByProps({ testID: 'message-status-msg-platform-stale-read' })
        .props.children,
    ).toBe('已读');
    expect(
      app.root.findByProps({ testID: 'message-unread-summary' }).props.children,
    ).toBe('全部已读');
    expect(getAppRuntimeState().messageUnreadCount).toBe(0);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'support-back-home' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      app.root.findByProps({ testID: 'home-unread-message-count' }).props
        .children,
    ).toBe(0);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      app.root.findByProps({ testID: 'message-status-msg-platform-stale-read' })
        .props.children,
    ).toBe('已读');
    expect(
      app.root.findByProps({ testID: 'message-unread-summary' }).props.children,
    ).toBe('全部已读');
    expect(getAppRuntimeState().messageUnreadCount).toBe(0);
    expect(messageListRequestCount).toBeGreaterThanOrEqual(3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('opens the local help center from the home screen', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-help' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('客服帮助');
  expect(renderedText).toContain('本地版');
  expect(renderedText).toContain('发单前');
  expect(renderedText).toContain('修改订单');
  expect(renderedText).toContain('在线客服');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'support-back-home' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('货运发单');
  expect(renderedText).toContain('立即发货');
});

test('submits a local support ticket from the help center', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-help' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'support-channel-service-complaint' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'support-ticket-description' })
      .props.onChangeText('司机沟通不及时，希望客服协助跟进');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'support-ticket-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('工单已提交：投诉建议');
  expect(renderedText).toContain('司机沟通不及时，希望客服协助跟进');
  expect(renderedText).toContain('处理状态：待客服跟进');
});

test('persists local support tickets to device storage', async () => {
  const now = new Date('2026-06-30T03:15:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const app = await renderApp(now);

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-help' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'support-channel-service-complaint' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'support-ticket-description' })
      .props.onChangeText('装货现场联系不上司机，请客服介入');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'support-ticket-submit' }).props.onPress();
  });

  const storedHomeState = await getStoredSnapshot<{
    state: {
      supportTickets: Array<{
        channelName: string;
        description: string;
        statusText: string;
        createdAtIso?: string;
        statusHistory?: Array<{
          actionText: string;
          timestampText: string;
          timestampIso?: string;
        }>;
      }>;
    };
  }>('@vireCodeing/home-local-state');

  expect(storedHomeState.state.supportTickets[0]).toMatchObject({
    channelName: '投诉建议',
    description: '装货现场联系不上司机，请客服介入',
    statusText: '待客服跟进',
    createdAtIso: expectedIso,
    statusHistory: [
      {
        actionText: '工单已提交',
        timestampText: '刚刚提交',
        timestampIso: expectedIso,
      },
    ],
  });
});

test('restores persisted local support tickets from device storage', async () => {
  await AsyncStorage.setMany({
    '@vireCodeing/auth-session': JSON.stringify({
      issuedAt: 1000,
      expiresAt: 1000 + 7 * 24 * 60 * 60 * 1000,
    }),
    '@vireCodeing/home-local-state': JSON.stringify({
      version: 1,
      state: {
        selectedCity: '深圳',
        routes: [],
        supportTickets: [
          {
            id: 'support-ticket-restored',
            channelName: '投诉建议',
            description: '已持久化的客服工单说明',
            statusText: '待客服跟进',
            createdAtText: '昨天 10:00',
          },
        ],
      },
    }),
  });

  const app = await renderApp(2000);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-help' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('已持久化的客服工单说明');
  expect(renderedText).toContain('处理状态：待客服跟进');
});

test('updates local support ticket processing status and history', async () => {
  const now = new Date('2026-06-30T03:15:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const app = await renderApp(now);

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-help' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'support-channel-service-complaint' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'support-ticket-description' })
      .props.onChangeText('司机临时改价，请客服确认费用');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'support-ticket-submit' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'support-ticket-accept-support-ticket-1' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'support-ticket-resolve-support-ticket-1' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('处理状态：已处理');
  expect(renderedText).toContain('处理记录：工单已提交 · 刚刚提交');
  expect(renderedText).toContain('处理记录：客服已受理 · 刚刚');
  expect(renderedText).toContain('处理记录：客服已处理 · 刚刚');

  const storedHomeState = await getStoredSnapshot<{
    state: {
      supportTickets: Array<{
        statusText: string;
        statusHistory: Array<{
          actionText: string;
          timestampText: string;
          timestampIso?: string;
        }>;
      }>;
    };
  }>('@vireCodeing/home-local-state');

  expect(storedHomeState.state.supportTickets[0].statusText).toBe('已处理');
  expect(storedHomeState.state.supportTickets[0].statusHistory).toEqual([
    {
      actionText: '工单已提交',
      timestampText: '刚刚提交',
      timestampIso: expectedIso,
    },
    {
      actionText: '客服已受理',
      timestampText: '刚刚',
      timestampIso: expectedIso,
    },
    {
      actionText: '客服已处理',
      timestampText: '刚刚',
      timestampIso: expectedIso,
    },
  ]);
});

test('opens the system dialer for a support service channel', async () => {
  const openUrlSpy = jest
    .spyOn(Linking, 'openURL')
    .mockResolvedValue(undefined);

  try {
    const app = await renderApp();

    await loginToHome(app);

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-open-help' }).props.onPress();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'support-channel-call-service-online' })
        .props.onPress();
    });

    expect(openUrlSpy).toHaveBeenCalledWith('tel:4001001000');
    expect(getRenderedText(app)).toContain('正在联系在线客服：4001001000');
  } finally {
    openUrlSpy.mockRestore();
  }
});

test('loads platform support tickets when opening the help center', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-support-ticket-load',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.support-ticket.load',
          refreshToken: 'refresh.support-ticket.load',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-support-ticket-load',
        items: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            shipperId: 'user-support-ticket-load',
            channelName: '投诉建议',
            description: '平台已存在工单',
            status: 'processing',
            statusHistory: [
              {
                actionText: '工单已提交',
                timestampIso: '2026-07-22T08:30:00.000Z',
              },
              {
                actionText: '客服已受理',
                timestampIso: '2026-07-22T08:35:00.000Z',
              },
            ],
            createdAtIso: '2026-07-22T08:30:00.000Z',
            updatedAtIso: '2026-07-22T08:35:00.000Z',
          },
        ],
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-22T08:40:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-help' }).props.onPress();
      await flushMicrotasks();
    });

    const renderedText = getRenderedText(app);
    const ticketLoadCall = fetchMock.mock.calls.find(([url, init]) => {
      return (
        url === 'http://localhost:3000/api/shipper/support-tickets' &&
        init?.method === 'GET'
      );
    });

    expect(ticketLoadCall).toBeDefined();
    expect(ticketLoadCall?.[1].headers).toMatchObject({
      Authorization: 'Bearer access.support-ticket.load',
    });
    expect(renderedText).toContain('平台同步');
    expect(renderedText).toContain('平台工单');
    expect(renderedText).toContain('平台已存在工单');
    expect(renderedText).toContain('处理状态：客服已受理');
    expect(renderedText).toContain('平台工单已同步到当前列表。');
    expect(
      app.root.findAllByProps({
        testID: 'support-ticket-accept-550e8400-e29b-41d4-a716-446655440000',
      }),
    ).toHaveLength(0);
    expect(getHomeLocalState().supportTickets[0]).toMatchObject({
      id: '550e8400-e29b-41d4-a716-446655440000',
      statusText: '客服已受理',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshes platform support tickets from the help center', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-22T08:40:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-support-ticket-refresh',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.support-ticket.refresh',
          refreshToken: 'refresh.support-ticket.refresh',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-support-ticket-refresh',
        items: [
          {
            id: '550e8400-e29b-41d4-a716-446655440020',
            shipperId: 'user-support-ticket-refresh',
            channelName: '投诉建议',
            description: '平台工单初始状态',
            status: 'pending',
            statusHistory: [
              {
                actionText: '工单已提交',
                timestampIso: '2026-07-22T08:30:00.000Z',
              },
            ],
            createdAtIso: '2026-07-22T08:30:00.000Z',
            updatedAtIso: '2026-07-22T08:30:00.000Z',
          },
        ],
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-support-ticket-refresh',
        items: [
          {
            id: '550e8400-e29b-41d4-a716-446655440020',
            shipperId: 'user-support-ticket-refresh',
            channelName: '投诉建议',
            description: '平台工单刷新后状态',
            status: 'resolved',
            statusHistory: [
              {
                actionText: '工单已提交',
                timestampIso: '2026-07-22T08:30:00.000Z',
              },
              {
                actionText: '客服已受理',
                timestampIso: '2026-07-22T08:35:00.000Z',
              },
              {
                actionText: '客服已处理',
                timestampIso: '2026-07-22T08:38:00.000Z',
              },
            ],
            createdAtIso: '2026-07-22T08:30:00.000Z',
            updatedAtIso: '2026-07-22T08:38:00.000Z',
          },
        ],
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-help' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      getRenderedText(app),
    ).toContain('刷新平台工单');

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'support-ticket-refresh-platform' })
        .props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
    });

    const refreshedCalls = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/support-tickets',
      method: 'GET',
    });

    expect(refreshedCalls).toHaveLength(2);
    expect(getFetchCallHeaders(refreshedCalls[0])).toMatchObject({
      Authorization: 'Bearer access.support-ticket.refresh',
    });
    expect(getFetchCallHeaders(refreshedCalls[1])).toMatchObject({
      Authorization: 'Bearer access.support-ticket.refresh',
    });

    const renderedText = getRenderedText(app);

    expect(renderedText).toContain('平台工单刷新后状态');
    expect(renderedText).toContain('处理状态：已处理');
    expect(renderedText).toContain('处理记录：客服已处理 · 2 分钟前');
    expect(getHomeLocalState().supportTickets[0]).toMatchObject({
      id: '550e8400-e29b-41d4-a716-446655440020',
      statusText: '已处理',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps local fallback support tickets when platform help-center refresh succeeds', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-22T08:40:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-support-ticket-merge',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.support-ticket.merge',
          refreshToken: 'refresh.support-ticket.merge',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-support-ticket-merge',
        items: [
          {
            id: '550e8400-e29b-41d4-a716-446655440010',
            shipperId: 'user-support-ticket-merge',
            channelName: '投诉建议',
            description: '平台已存在工单',
            status: 'processing',
            statusHistory: [
              {
                actionText: '工单已提交',
                timestampIso: '2026-07-22T08:30:00.000Z',
              },
              {
                actionText: '客服已受理',
                timestampIso: '2026-07-22T08:35:00.000Z',
              },
            ],
            createdAtIso: '2026-07-22T08:30:00.000Z',
            updatedAtIso: '2026-07-22T08:35:00.000Z',
          },
        ],
      }),
    );
  installPlatformFetchMock(fetchMock);
  const persistedHomeState = {
    ...getHomeLocalState(),
    supportTickets: [
      {
        id: 'support-ticket-1',
        channelName: '投诉建议',
        description: '本地兜底工单',
        statusText: '待客服跟进',
        createdAtText: '刚刚提交',
        createdAtIso: '2026-07-22T08:20:00.000Z',
        statusHistory: [
          {
            actionText: '工单已提交',
            timestampText: '刚刚提交',
            timestampIso: '2026-07-22T08:20:00.000Z',
          },
        ],
      },
    ],
  };
  saveHomeLocalState(persistedHomeState);
  await AsyncStorage.setItem(
    '@vireCodeing/home-local-state',
    JSON.stringify({
      version: 1,
      state: persistedHomeState,
    }),
  );

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-help' }).props.onPress();
      await flushMicrotasks();
    });

    const renderedText = getRenderedText(app);

    expect(renderedText).toContain('平台工单（含本地兜底）');
    expect(renderedText).toContain('平台已存在工单');
    expect(renderedText).toContain('本地兜底工单');
    expect(renderedText).toContain('来源：平台工单同步');
    expect(renderedText).toContain('来源：本地兜底工单');
    expect(renderedText).toContain(
      '平台工单已同步到当前列表，本地兜底工单已保留。',
    );
    expect(
      app.root.findAllByProps({
        testID: 'support-ticket-accept-550e8400-e29b-41d4-a716-446655440010',
      }),
    ).toHaveLength(0);
    expect(
      app.root.findAllByProps({
        testID: 'support-ticket-accept-support-ticket-1',
      }),
    ).not.toHaveLength(0);

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'support-ticket-accept-support-ticket-1' })
        .props.onPress();
    });

    expect(getRenderedText(app)).toContain('平台工单（含本地兜底）');
    expect(getRenderedText(app)).toContain('工单已更新：客服已受理');
    expect(
      getHomeLocalState().supportTickets.find(
        ticket => ticket.id === 'support-ticket-1',
      )?.statusText,
    ).toBe('客服已受理');
    expect(
      app.root.findAllByProps({
        testID: 'support-ticket-accept-550e8400-e29b-41d4-a716-446655440010',
      }),
    ).toHaveLength(0);
    expect(getHomeLocalState().supportTickets.map(ticket => ticket.id)).toEqual([
      '550e8400-e29b-41d4-a716-446655440010',
      'support-ticket-1',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('submits a platform support ticket from the help center', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-22T08:40:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-support-ticket-create',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.support-ticket.create',
          refreshToken: 'refresh.support-ticket.create',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-support-ticket-create',
        items: [],
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        id: '550e8400-e29b-41d4-a716-446655440001',
        shipperId: 'user-support-ticket-create',
        channelName: '投诉建议',
        description: '司机沟通不及时，希望客服协助跟进',
        status: 'pending',
        statusHistory: [
          {
            actionText: '工单已提交',
            timestampIso: '2026-07-22T08:40:00.000Z',
          },
        ],
        createdAtIso: '2026-07-22T08:40:00.000Z',
        updatedAtIso: '2026-07-22T08:40:00.000Z',
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-help' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'support-channel-service-complaint' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'support-ticket-description' })
        .props.onChangeText('司机沟通不及时，希望客服协助跟进');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'support-ticket-submit' }).props.onPress();
      await flushMicrotasks();
    });

    const renderedText = getRenderedText(app);
    const ticketCreateCall = fetchMock.mock.calls.find(([url, init]) => {
      return (
        url === 'http://localhost:3000/api/shipper/support-tickets' &&
        init?.method === 'POST'
      );
    });

    expect(ticketCreateCall).toBeDefined();
    expect(ticketCreateCall?.[1].headers).toMatchObject({
      Authorization: 'Bearer access.support-ticket.create',
    });
    expect(JSON.parse(ticketCreateCall?.[1].body as string)).toEqual({
      channelName: '投诉建议',
      description: '司机沟通不及时，希望客服协助跟进',
    });
    expect(renderedText).toContain('平台工单已提交：投诉建议');
    expect(renderedText).toContain('司机沟通不及时，希望客服协助跟进');
    expect(renderedText).toContain('处理状态：待客服跟进');
    expect(getHomeLocalState().supportTickets[0]).toMatchObject({
      id: '550e8400-e29b-41d4-a716-446655440001',
      statusText: '待客服跟进',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('falls back to a local support ticket when platform submit has no auth token', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-22T08:40:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-support-ticket-fallback',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.support-ticket.fallback',
          refreshToken: 'refresh.support-ticket.fallback',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-support-ticket-fallback',
        items: [],
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-help' }).props.onPress();
      await flushMicrotasks();
    });
    clearAuthSession();

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'support-channel-service-complaint' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'support-ticket-description' })
        .props.onChangeText('司机沟通不及时，希望客服协助跟进');
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'support-ticket-submit' }).props.onPress();
    });

    const renderedText = getRenderedText(app);

    expect(
      fetchMock.mock.calls.some(([url, init]) => {
        return (
          url === 'http://localhost:3000/api/shipper/support-tickets' &&
          init?.method === 'POST'
        );
      }),
    ).toBe(false);
    expect(renderedText).toContain(
      '平台工单提交需要重新登录，已改为本地保存工单。',
    );
    expect(renderedText).toContain('本地工单');
    expect(renderedText).toContain('本地版');
    expect(getHomeLocalState().supportTickets[0]).toMatchObject({
      id: 'support-ticket-1',
      statusText: '待客服跟进',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('opens the local profile center from the home screen', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('个人中心');
  expect(renderedText).toContain('张先生');
  expect(renderedText).toContain('实名认证');
  expect(renderedText).toContain('常用地址');
  expect(renderedText).toContain('我的评价');
  expect(renderedText).toContain('消费记录');
  expect(renderedText).toContain('实名认证');
  expect(renderedText).toContain('企业认证');
  expect(renderedText).toContain('发票管理');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'support-back-home' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('货运发单');
  expect(renderedText).toContain('最近订单');
});

test('shows local profile identity summary with masked phone and badges', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('头像占位：张');
  expect(renderedText).toContain('个人货主 · 手机号：138****8000');
  expect(renderedText).toContain('手机号：138****8000');
  expect(renderedText).toContain('实名认证：已认证');
  expect(renderedText).toContain('企业认证：未认证');
  expect(renderedText).toContain('96 分');
  expect(renderedText).toContain('2 条');
});

test('updates profile account type and credit score after submitting enterprise verification', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('个人货主 · 手机号：138****8000');
  expect(getRenderedText(app)).toContain('96 分');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-entry-enterprise-verification' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'enterprise-verification-name' })
      .props.onChangeText('深圳晨星贸易有限公司');
    app.root
      .findByProps({ testID: 'enterprise-verification-code' })
      .props.onChangeText('91440300MA5TEST001');
    app.root
      .findByProps({ testID: 'enterprise-verification-legal-name' })
      .props.onChangeText('张先生');
    app.root
      .findByProps({ testID: 'enterprise-verification-legal-id' })
      .props.onChangeText('440300199001011234');
    app.root
      .findByProps({ testID: 'enterprise-verification-phone' })
      .props.onChangeText('13900139088');
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'enterprise-verification-license-photo' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'enterprise-verification-submit' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('企业货主 · 手机号：138****8000');
  expect(renderedText).toContain('98 分');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'support-back-home' }).props.onPress();
  });

  const homeRenderedText = getRenderedText(app);

  expect(homeRenderedText).toContain('企业货主');
  expect(homeRenderedText).toContain('98 分');
  expect(homeRenderedText).not.toContain('个人货主');
});

test('updates local profile monthly order count after publishing a new order', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('坪山新区临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('前海品牌门店');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('5 单');
  expect(renderedText).not.toContain('12 单');
});

test('updates local profile unread count after reading a message', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'message-mark-read-message-system-1' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'support-back-home' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('1 条');
});

test('opens local profile detail pages from the profile center', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  const profilePages = [
    {
      testID: 'profile-entry-addresses',
      title: '常用地址',
      expected: ['宝安仓库', '宝安区福永物流园', '默认装货地'],
    },
    {
      testID: 'profile-entry-contacts',
      title: '常用联系人',
      expected: ['赵经理', '装货负责人', '13800138001'],
    },
    {
      testID: 'profile-entry-evaluations',
      title: '我的评价',
      expected: ['HY20260620003', '李师傅', '师傅准时'],
    },
    {
      testID: 'profile-entry-spending',
      title: '消费记录',
      expected: ['HY20260620003', '￥310', '货到付款'],
    },
    {
      testID: 'profile-entry-identity-verification',
      title: '实名认证',
      expected: ['实名认证资料', '真实姓名', '身份证正面凭证'],
    },
    {
      testID: 'profile-entry-enterprise-verification',
      title: '企业认证',
      expected: [
        '企业认证资料',
        '统一社会信用代码',
        '企业联系电话',
        '添加营业执照凭证',
      ],
    },
    {
      testID: 'profile-entry-invoices',
      title: '发票管理',
      expected: ['张先生', '电子普通发票', '待提交'],
    },
    {
      testID: 'profile-entry-coupons',
      title: '优惠券',
      expected: ['满 300 减 30', '可使用', '夜间运输券'],
    },
    {
      testID: 'profile-entry-settings',
      title: '设置',
      expected: ['手机号保护', '订单通知', '隐私政策'],
    },
  ];

  for (const page of profilePages) {
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: page.testID }).props.onPress();
    });

    let renderedText = getRenderedText(app);

    expect(renderedText).toContain(page.title);
    page.expected.forEach(expectedText => {
      expect(renderedText).toContain(expectedText);
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
    });

    renderedText = getRenderedText(app);

    expect(renderedText).toContain('个人中心');
    expect(renderedText).toContain('功能入口');
  }
});

test('submits a local identity verification request from the profile center', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-entry-identity-verification' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'identity-verification-name' })
      .props.onChangeText('张先生');
    app.root
      .findByProps({ testID: 'identity-verification-id-number' })
      .props.onChangeText('440300199001011234');
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'identity-verification-front-photo' })
      .props.onPress();
    app.root
      .findByProps({ testID: 'identity-verification-back-photo' })
      .props.onPress();
    app.root
      .findByProps({ testID: 'identity-verification-face-check' })
      .props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('身份证凭证清单');
  expect(renderedText).toContain('身份证正面凭证：本地已保存');
  expect(renderedText).toContain('身份证反面凭证：本地已保存');
  expect(renderedText).toContain('来源：本地图片凭证占位');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'identity-verification-submit' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('实名认证审核中');
  expect(renderedText).toContain('张先生');
  expect(renderedText).toContain('身份证号：440300199001011234');
  expect(renderedText).toContain('身份证正反面凭证 2 张');
  expect(renderedText).toContain('人脸核验已完成');
  expect(renderedText).toContain('预计 1 个工作日内完成审核');
});

test('shows local identity verification rejection reason and allows resubmission', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-entry-identity-verification' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'identity-verification-name' })
      .props.onChangeText('张先生');
    app.root
      .findByProps({ testID: 'identity-verification-id-number' })
      .props.onChangeText('440300199001011234');
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'identity-verification-front-photo' })
      .props.onPress();
    app.root
      .findByProps({ testID: 'identity-verification-back-photo' })
      .props.onPress();
    app.root
      .findByProps({ testID: 'identity-verification-face-check' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'identity-verification-submit' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'identity-verification-reject' })
      .props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('实名认证认证失败');
  expect(renderedText).toContain(
    '失败原因：身份证照片边缘不完整，请重新上传清晰照片',
  );

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('实名认证：认证失败');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-entry-identity-verification' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'identity-verification-name' })
      .props.onChangeText('张先生复核');
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'identity-verification-submit' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('实名认证审核中');
  expect(renderedText).toContain('张先生复核');
  expect(renderedText).not.toContain('失败原因：身份证照片边缘不完整');
});

test('updates profile and home verification summaries after submitting identity verification', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-entry-identity-verification' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'identity-verification-name' })
      .props.onChangeText('张先生');
    app.root
      .findByProps({ testID: 'identity-verification-id-number' })
      .props.onChangeText('440300199001011234');
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'identity-verification-front-photo' })
      .props.onPress();
    app.root
      .findByProps({ testID: 'identity-verification-back-photo' })
      .props.onPress();
    app.root
      .findByProps({ testID: 'identity-verification-face-check' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'identity-verification-submit' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('实名认证：审核中');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'support-back-home' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('审核中');
  expect(renderedText).toContain('认证审核中，预计 1 个工作日内完成');
  expect(renderedText).not.toContain('可发布货运订单');
});

test('blocks local order publishing while identity verification is reviewing', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-entry-identity-verification' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'identity-verification-name' })
      .props.onChangeText('张先生');
    app.root
      .findByProps({ testID: 'identity-verification-id-number' })
      .props.onChangeText('440300199001011234');
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'identity-verification-front-photo' })
      .props.onPress();
    app.root
      .findByProps({ testID: 'identity-verification-back-photo' })
      .props.onPress();
    app.root
      .findByProps({ testID: 'identity-verification-face-check' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'identity-verification-submit' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'support-back-home' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('实名认证审核中，审核通过后才能发布订单');
  expect(renderedText).toContain('立即发货');
  expect(renderedText).not.toContain('保存草稿');
  expect(app.root.findAllByProps({ testID: 'draft-publish' })).toHaveLength(0);
});

test('submits a local enterprise verification request from the profile center', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-entry-enterprise-verification' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'enterprise-verification-name' })
      .props.onChangeText('深圳晨星贸易有限公司');
    app.root
      .findByProps({ testID: 'enterprise-verification-code' })
      .props.onChangeText('91440300MA5TEST001');
    app.root
      .findByProps({ testID: 'enterprise-verification-legal-name' })
      .props.onChangeText('张先生');
    app.root
      .findByProps({ testID: 'enterprise-verification-legal-id' })
      .props.onChangeText('440300199001011234');
    app.root
      .findByProps({ testID: 'enterprise-verification-phone' })
      .props.onChangeText('13900139088');
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'enterprise-verification-license-photo' })
      .props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('营业执照凭证清单');
  expect(renderedText).toContain('营业执照凭证：本地已保存');
  expect(renderedText).toContain('来源：本地图片凭证占位');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'enterprise-verification-submit' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('企业认证审核中');
  expect(renderedText).toContain('深圳晨星贸易有限公司');
  expect(renderedText).toContain('统一社会信用代码：91440300MA5TEST001');
  expect(renderedText).toContain('企业联系电话：13900139088');
  expect(renderedText).toContain('营业执照凭证 1 张');
  expect(renderedText).toContain('预计 1 个工作日内完成审核');
});

test('shows local enterprise verification rejection reason and allows resubmission', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-entry-enterprise-verification' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'enterprise-verification-name' })
      .props.onChangeText('深圳晨星贸易有限公司');
    app.root
      .findByProps({ testID: 'enterprise-verification-code' })
      .props.onChangeText('91440300MA5TEST001');
    app.root
      .findByProps({ testID: 'enterprise-verification-legal-name' })
      .props.onChangeText('张先生');
    app.root
      .findByProps({ testID: 'enterprise-verification-legal-id' })
      .props.onChangeText('440300199001011234');
    app.root
      .findByProps({ testID: 'enterprise-verification-phone' })
      .props.onChangeText('13900139088');
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'enterprise-verification-license-photo' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'enterprise-verification-submit' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'enterprise-verification-reject' })
      .props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('企业认证认证失败');
  expect(renderedText).toContain(
    '失败原因：营业执照信息与企业名称不一致，请重新上传清晰凭证',
  );

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('企业认证：认证失败');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-entry-enterprise-verification' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'enterprise-verification-name' })
      .props.onChangeText('深圳晨星贸易有限公司复核');
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'enterprise-verification-submit' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('企业认证审核中');
  expect(renderedText).toContain('深圳晨星贸易有限公司复核');
  expect(renderedText).not.toContain('失败原因：营业执照信息与企业名称不一致');
});

test('updates the profile enterprise badge after submitting enterprise verification', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-entry-enterprise-verification' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'enterprise-verification-name' })
      .props.onChangeText('深圳晨星贸易有限公司');
    app.root
      .findByProps({ testID: 'enterprise-verification-code' })
      .props.onChangeText('91440300MA5TEST001');
    app.root
      .findByProps({ testID: 'enterprise-verification-legal-name' })
      .props.onChangeText('张先生');
    app.root
      .findByProps({ testID: 'enterprise-verification-legal-id' })
      .props.onChangeText('440300199001011234');
    app.root
      .findByProps({ testID: 'enterprise-verification-phone' })
      .props.onChangeText('13900139088');
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'enterprise-verification-license-photo' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'enterprise-verification-submit' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('企业认证：审核中');
});

test('adds and confirms removal of local profile addresses and contacts', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-addresses' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-address-name' })
      .props.onChangeText('龙华临时仓');
    app.root
      .findByProps({ testID: 'profile-address-detail' })
      .props.onChangeText('龙华区临时中转仓');
    app.root
      .findByProps({ testID: 'profile-address-contact' })
      .props.onChangeText('吴主管 13900139001');
    app.root
      .findByProps({ testID: 'profile-address-tag' })
      .props.onChangeText('备用装货地');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-address-submit' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('龙华临时仓');
  expect(renderedText).toContain('龙华区临时中转仓');
  expect(renderedText).toContain('备用装货地');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-address-delete-address-local-3' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('再次确认删除地址：龙华临时仓');
  expect(renderedText).toContain('龙华临时仓');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-address-delete-address-local-3' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).not.toContain('龙华临时仓');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-contacts' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-contact-name' })
      .props.onChangeText('吴主管');
    app.root
      .findByProps({ testID: 'profile-contact-role' })
      .props.onChangeText('备用装货负责人');
    app.root
      .findByProps({ testID: 'profile-contact-phone' })
      .props.onChangeText('13900139001');
    app.root
      .findByProps({ testID: 'profile-contact-note' })
      .props.onChangeText('龙华临时仓');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-contact-submit' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('吴主管');
  expect(renderedText).toContain('备用装货负责人');
  expect(renderedText).toContain('13900139001');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-contact-delete-contact-local-3' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).not.toContain('备用装货负责人');
});

test('prevents adding more than 20 local profile addresses', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-addresses' }).props.onPress();
  });

  const addAddress = async (index: number, name = `临时地址${index}`) => {
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'profile-address-name' })
        .props.onChangeText(name);
      app.root
        .findByProps({ testID: 'profile-address-detail' })
        .props.onChangeText(`龙华区临时中转仓 ${index} 号`);
      app.root
        .findByProps({ testID: 'profile-address-contact' })
        .props.onChangeText(`吴主管 13900139${String(index).padStart(3, '0')}`);
      app.root
        .findByProps({ testID: 'profile-address-tag' })
        .props.onChangeText('备用装货地');
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'profile-address-submit' })
        .props.onPress();
    });
  };

  for (let index = 1; index <= 18; index += 1) {
    await addAddress(index);
  }

  await addAddress(19, '超限地址');

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('最多保存 20 个常用地址');
  expect(renderedText).not.toContain('超限地址');
});

test('requires a contact phone for local profile addresses', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-addresses' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-address-name' })
      .props.onChangeText('无效联系人地址');
    app.root
      .findByProps({ testID: 'profile-address-detail' })
      .props.onChangeText('龙华区临时中转仓');
    app.root
      .findByProps({ testID: 'profile-address-contact' })
      .props.onChangeText('吴主管');
    app.root
      .findByProps({ testID: 'profile-address-tag' })
      .props.onChangeText('备用装货地');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-address-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('请填写正确的常用地址联系人电话');
  expect(renderedText).not.toContain('无效联系人地址');
});

test('prevents adding more than 50 local profile contacts', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-contacts' }).props.onPress();
  });

  const addContact = async (index: number, name = `临时联系人${index}`) => {
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'profile-contact-name' })
        .props.onChangeText(name);
      app.root
        .findByProps({ testID: 'profile-contact-role' })
        .props.onChangeText('备用装货负责人');
      app.root
        .findByProps({ testID: 'profile-contact-phone' })
        .props.onChangeText(`13900140${String(index).padStart(3, '0')}`);
      app.root
        .findByProps({ testID: 'profile-contact-note' })
        .props.onChangeText(`龙华临时仓 ${index} 号门`);
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'profile-contact-submit' })
        .props.onPress();
    });
  };

  for (let index = 1; index <= 48; index += 1) {
    await addContact(index);
  }

  await addContact(49, '超限联系人');

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('最多保存 50 个常用联系人');
  expect(renderedText).not.toContain('超限联系人');
});

test('requires a valid phone for local profile contacts', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-contacts' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-contact-name' })
      .props.onChangeText('无效电话联系人');
    app.root
      .findByProps({ testID: 'profile-contact-role' })
      .props.onChangeText('备用装货负责人');
    app.root
      .findByProps({ testID: 'profile-contact-phone' })
      .props.onChangeText('12345');
    app.root
      .findByProps({ testID: 'profile-contact-note' })
      .props.onChangeText('龙华临时仓');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-contact-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('请输入正确的常用联系人电话');
  expect(renderedText).not.toContain('无效电话联系人');
});

test('edits local profile addresses and contacts', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-addresses' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-address-edit-address-warehouse' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-address-name' })
      .props.onChangeText('宝安主仓');
    app.root
      .findByProps({ testID: 'profile-address-detail' })
      .props.onChangeText('宝安区福永物流园 3 号库');
    app.root
      .findByProps({ testID: 'profile-address-contact' })
      .props.onChangeText('赵经理 13800138001');
    app.root
      .findByProps({ testID: 'profile-address-tag' })
      .props.onChangeText('主装货地');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-address-submit' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('宝安主仓');
  expect(renderedText).toContain('宝安区福永物流园 3 号库');
  expect(renderedText).toContain('主装货地');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-contacts' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-contact-edit-contact-pickup' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-contact-name' })
      .props.onChangeText('赵主管');
    app.root
      .findByProps({ testID: 'profile-contact-role' })
      .props.onChangeText('主装货负责人');
    app.root
      .findByProps({ testID: 'profile-contact-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'profile-contact-note' })
      .props.onChangeText('宝安主仓 3 号门');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-contact-submit' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('赵主管');
  expect(renderedText).toContain('主装货负责人');
  expect(renderedText).toContain('宝安主仓 3 号门');
});

test('filters local spending records and submits a local invoice request', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-spending' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'spending-filter-completed' })
      .props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('HY20260620003');
  expect(renderedText).toContain('已完成');
  expect(renderedText).not.toContain('HY20260621008');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'spending-filter-active' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('HY20260621008');
  expect(renderedText).toContain('运输中');
  expect(renderedText).not.toContain('HY20260620003');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('待提交');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('申请中');
  expect(renderedText).toContain('发票申请已提交');
  expect(renderedText).toContain('发票抬头：张先生');
  expect(renderedText).not.toContain('待提交');
});

test('shows local spending statistics and payment lifecycle details', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-spending' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('总消费统计');
  expect(renderedText).toContain('已完成消费：￥310');
  expect(renderedText).toContain('托管中金额：￥520');
  expect(renderedText).toContain('退款中金额：￥260');
  expect(renderedText).toContain('支付时间：昨天 18:28');
  expect(renderedText).toContain('支付状态：支付成功');
  expect(renderedText).toContain('司机收入：￥294.50');
  expect(renderedText).toContain('冻结资金：￥520');
  expect(renderedText).toContain('退款进度：原路退回处理中');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'spending-time-history' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('HY20260619005');
  expect(renderedText).toContain('退款中');
  expect(renderedText).not.toContain('HY20260620003');
  expect(renderedText).not.toContain('HY20260621008');
});

test('shows platform spending snapshot when opening spending in platform mode', async () => {
  const originalFetch = globalThis.fetch;
  const platformSpendingSnapshot = {
    shipperId: 'user-platform-spending',
    summary: {
      completedTotalCents: 31000,
      activeTotalCents: 52000,
      refundTotalCents: 26000,
    },
    items: [
      {
        orderId: 'platform-order-spending-3',
        orderNo: 'HY202607090003',
        status: 'loading' as const,
        paymentMethod: 'online' as const,
        paymentStatus: 'escrowed' as const,
        paymentChannel: 'wechat' as const,
        paymentOrderStatus: 'escrowed' as const,
        amountCents: 52000,
        priceCents: 54000,
        payablePriceCents: 52000,
        couponTitle: '满 500 减 20',
        couponDiscountCents: 2000,
        occurredAtIso: '2026-07-09T09:20:00.000Z',
        paidAtIso: '2026-07-09T09:10:00.000Z',
        routeText: '龙华仓库 → 福田门店',
      },
      {
        orderId: 'platform-order-spending-2',
        orderNo: 'HY202607090002',
        status: 'completed' as const,
        paymentMethod: 'cod' as const,
        paymentStatus: 'settled' as const,
        amountCents: 31000,
        occurredAtIso: '2026-07-09T08:30:00.000Z',
        settledAtIso: '2026-07-09T08:30:00.000Z',
        routeText: '宝安仓库 → 南山门店',
      },
      {
        orderId: 'platform-order-spending-1',
        orderNo: 'HY202607090001',
        status: 'cancelled' as const,
        paymentMethod: 'online' as const,
        paymentStatus: 'refunded' as const,
        paymentChannel: 'alipay' as const,
        paymentOrderStatus: 'refunded' as const,
        refundStatus: 'succeeded' as const,
        amountCents: 26000,
        refundAmountCents: 26000,
        occurredAtIso: '2026-07-08T18:30:00.000Z',
        paidAtIso: '2026-07-08T18:00:00.000Z',
        refundedAtIso: '2026-07-08T18:30:00.000Z',
        routeText: '光明仓库 → 前海门店',
      },
    ],
  };
  const fetchMock = jest.fn((url, init) => {
    const requestUrl = String(url);

    if (requestUrl === 'http://localhost:3000/api/auth/send-code') {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (requestUrl === 'http://localhost:3000/api/auth/login') {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-spending',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-spending',
            refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440121',
            expiresIn: 3600,
          },
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/address-book' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (
      requestUrl ===
        'http://localhost:3000/api/shipper/profile/spending-records' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(createPlatformApiResponse(platformSpendingSnapshot));
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-entry-spending' }).props.onPress();
      await flushMicrotasks();
      await flushMacrotask();
      await flushMicrotasks();
    });

    const renderedText = getRenderedText(app);

    expect(renderedText).toContain('消费记录已按平台资金流水同步');
    expect(renderedText).toContain('HY202607090003');
    expect(renderedText).toContain('HY202607090002');
    expect(renderedText).toContain('HY202607090001');
    expect(renderedText).toContain('龙华仓库 → 福田门店');
    expect(renderedText).toContain('在线支付 · 微信支付');
    expect(renderedText).toContain('资金状态：已托管');
    expect(renderedText).toContain('退款状态：已退款');
    expect(renderedText).toContain('已完成消费：￥310');
    expect(renderedText).toContain('托管中金额：￥520');
    expect(renderedText).toContain('已退款金额：￥260');
    expect(renderedText).not.toContain('退款中金额');
    expect(renderedText).not.toContain('HY20260620003');
    expect(renderedText).not.toContain('真实支付/退款流水尚未接通');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/spending-records',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-spending',
        }),
      }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shows a newly published online payment order in local spending records', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('坪山新区临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('前海品牌门店');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
    app.root.findByProps({ testID: 'draft-payment-online' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-spending' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('HYLOCAL001');
  expect(renderedText).toContain('￥760');
  expect(renderedText).toContain('在线支付');
});

test('shows a completed local online payment order in invoiceable orders', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('坪山新区临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('前海品牌门店');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
    app.root.findByProps({ testID: 'draft-payment-online' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-progress-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-progress-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-progress-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-progress-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  expect(getRenderedText(app)).toContain('订单已完成 · 刚刚');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('HYLOCAL001');
  expect(renderedText).toContain('可开票 ￥760');
});

test('submits an invoice request with a completed local online payment order selected', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-digital' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('1.8 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('18 箱');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('坪山新区临时仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('前海品牌门店');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('明天 09:30');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('760');
    app.root.findByProps({ testID: 'draft-payment-online' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-progress-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-progress-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-progress-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-progress-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-order-invoice-order-local-HYLOCAL001' })
      .props.onPress();
    app.root
      .findByProps({ testID: 'invoice-email' })
      .props.onChangeText('finance@morningstar.test');
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('已选 2 单');
  expect(renderedText).toContain('本次申请金额：￥1070');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('开票订单：HYLOCAL001、HY20260620003');
  expect(renderedText).toContain('申请金额：￥1070');
});

test('shows a completed local cash-on-delivery order in invoiceable orders', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-cargo-build' }).props.onPress();
    app.root
      .findByProps({ testID: 'draft-weight' })
      .props.onChangeText('2.4 吨');
    app.root
      .findByProps({ testID: 'draft-quantity' })
      .props.onChangeText('24 件');
    app.root
      .findByProps({ testID: 'draft-pickup-address' })
      .props.onChangeText('龙华中心仓');
    app.root
      .findByProps({ testID: 'draft-pickup-contact' })
      .props.onChangeText('赵经理');
    app.root
      .findByProps({ testID: 'draft-pickup-phone' })
      .props.onChangeText('13800138001');
    app.root
      .findByProps({ testID: 'draft-delivery-address' })
      .props.onChangeText('坂田项目点');
    app.root
      .findByProps({ testID: 'draft-delivery-contact' })
      .props.onChangeText('钱店长');
    app.root
      .findByProps({ testID: 'draft-delivery-phone' })
      .props.onChangeText('13800138002');
    app.root
      .findByProps({ testID: 'draft-pickup-time' })
      .props.onChangeText('后天 08:00');
    app.root.findByProps({ testID: 'draft-price' }).props.onChangeText('880');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-progress-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-progress-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-progress-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-progress-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-primary-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('HYLOCAL001');
  expect(renderedText).toContain('可开票 ￥880');
});

test('submits a local invoice request with application details', async () => {
  const app = await renderApp();

  await loginToHome(app);
  await submitLocalEnterpriseVerificationFromHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-email' })
      .props.onChangeText('finance@morningstar.test');
    app.root
      .findByProps({ testID: 'invoice-type-vat-special' })
      .props.onPress();
    app.root
      .findByProps({ testID: 'invoice-title-enterprise' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('申请中');
  expect(renderedText).toContain('发票类型：增值税专用发票');
  expect(renderedText).toContain('发票抬头：深圳晨星贸易有限公司');
  expect(renderedText).toContain('接收邮箱：finance@morningstar.test');
});

test('blocks local VAT invoice requests before enterprise verification', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-type-vat-special' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);
  const invoiceState = getProfileLocalState().invoices.find(
    item => item.id === 'invoice-1',
  );

  expect(renderedText).toContain('增值税专用发票需先提交企业认证资料');
  expect(invoiceState?.statusText).toBe('待提交');
  expect(getProfileLocalState().invoiceDetails['invoice-1']).toBeUndefined();
});

test('keeps personal invoice title selected before enterprise verification', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'invoice-title-enterprise' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('企业抬头需先提交企业认证资料');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('申请中');
  expect(renderedText).toContain('发票抬头：张先生');
  expect(renderedText).not.toContain('发票抬头：深圳晨星贸易有限公司');
});

test('submits a platform invoice request and refreshes platform invoice records', async () => {
  const defaultProfileState = getProfileLocalState();
  const platformCompletedOrder = {
    id: 'HY202607080001',
    platformOrderId: 'platform-order-invoice-1',
    status: 'transporting' as const,
    from: '平台南山仓',
    to: '平台福田店',
    cargoType: '食品',
    weightText: '3 吨',
    vehicleRequirement: '中型货车',
    priceText: '￥9999',
    paymentMethodText: '在线支付',
    updatedAtText: '订单已完成 · 今天 10:00',
    updatedAtIso: '2026-07-08T02:00:00.000Z',
  };
  const platformInvoiceSpendingSnapshot = {
    shipperId: 'user-platform-invoice',
    summary: {
      completedTotalCents: 85000,
      activeTotalCents: 0,
      refundTotalCents: 0,
    },
    items: [
      {
        orderId: 'platform-order-invoice-1',
        orderNo: 'HY202607080001',
        status: 'completed' as const,
        paymentMethod: 'online' as const,
        paymentStatus: 'settled' as const,
        paymentChannel: 'wechat' as const,
        paymentOrderStatus: 'settled' as const,
        amountCents: 85000,
        occurredAtIso: '2026-07-08T02:00:00.000Z',
        paidAtIso: '2026-07-08T01:30:00.000Z',
        settledAtIso: '2026-07-08T02:00:00.000Z',
        routeText: '平台南山仓 → 平台福田店',
      },
    ],
  };
  const createdPlatformInvoice = {
    id: 'invoice-platform-1',
    shipperId: 'user-platform-invoice',
    invoiceType: 'normal' as const,
    invoiceTitleType: 'personal' as const,
    invoiceTitle: '平台货主',
    receiverEmail: 'invoice@platform.test',
    orderIds: ['platform-order-invoice-1'],
    orderNos: ['HY202607080001'],
    amountCents: 85000,
    status: 'reviewing' as const,
    createdAtIso: '2026-07-09T08:00:00.000Z',
    updatedAtIso: '2026-07-09T08:00:00.000Z',
  };
  let invoiceListLoadCount = 0;

  await AsyncStorage.setMany({
    '@vireCodeing/app-runtime-state': JSON.stringify({
      version: 1,
      state: {
        orders: [platformCompletedOrder],
        messages: [],
      },
    }),
    '@vireCodeing/profile-local-state': JSON.stringify({
      version: 1,
      state: {
        ...defaultProfileState,
        invoiceType: 'normal',
        invoiceTitle: 'personal',
        receiverEmail: 'invoice@platform.test',
        selectedInvoiceOrderIds: [],
        account: {
          ...defaultProfileState.account,
          displayName: '平台货主',
        },
      },
    }),
  });

  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(input);

    if (requestUrl === 'http://localhost:3000/api/auth/send-code') {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (requestUrl === 'http://localhost:3000/api/auth/login') {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-invoice',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-invoice',
            refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440120',
            expiresIn: 3600,
          },
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/address-book' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/invoices' &&
      init?.method === 'GET'
    ) {
      invoiceListLoadCount += 1;

      return Promise.resolve(
        createPlatformApiResponse(
          invoiceListLoadCount === 1 ? [] : [createdPlatformInvoice],
        ),
      );
    }

    if (
      requestUrl ===
        'http://localhost:3000/api/shipper/profile/spending-records' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(
        createPlatformApiResponse(platformInvoiceSpendingSnapshot),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/invoices' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(createPlatformApiResponse(createdPlatformInvoice));
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });
  installPlatformFetchMock(fetchMock);

  const app = await renderApp(1000, {
    platformApiBaseUrl: 'http://localhost:3000/api',
  });

  await loginToHomeWithPlatformAuth(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
    await flushMicrotasks();
    await flushMacrotask();
    await flushMicrotasks();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('提交平台发票申请');
  expect(renderedText).toContain('暂无平台发票申请记录');
  expect(renderedText).not.toContain('待提交');
  expect(renderedText).toContain('HY202607080001');
  expect(renderedText).toContain('可开票 ￥850');
  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:3000/api/shipper/profile/spending-records',
    expect.objectContaining({ method: 'GET' }),
  );

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({
        testID:
          'invoice-order-invoice-order-platform-platform-order-invoice-1',
      })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('已选 1 单');
  expect(renderedText).toContain('本次申请金额：￥850');

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'invoice-submit-platform' }).props.onPress();
    await flushMicrotasks();
    await flushMacrotask();
    await flushMicrotasks();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('平台发票申请已提交');
  expect(renderedText).toContain('申请中');
  expect(renderedText).toContain('发票抬头：平台货主');
  expect(renderedText).toContain('开票订单：HY202607080001');
  expect(renderedText).toContain('申请金额：￥850');
  expect(renderedText).not.toContain('本地审核通过');
  expect(renderedText).not.toContain('下载凭证');

  const invoiceCreateCall = fetchMock.mock.calls.find(
    ([url, requestInit]) =>
      String(url) === 'http://localhost:3000/api/shipper/profile/invoices' &&
      requestInit?.method === 'POST',
  );

  expect(invoiceCreateCall).toBeDefined();
  expect(
    JSON.parse((invoiceCreateCall?.[1] as RequestInit).body as string),
  ).toEqual({
    invoiceType: 'normal',
    invoiceTitleType: 'personal',
    invoiceTitle: '平台货主',
    receiverEmail: 'invoice@platform.test',
    orderIds: ['platform-order-invoice-1'],
  });
  expect(
    fetchMock.mock.calls.filter(
      ([url, requestInit]) =>
        String(url) === 'http://localhost:3000/api/shipper/profile/invoices' &&
        requestInit?.method === 'GET',
    ),
  ).toHaveLength(2);
  expect(getProfileLocalState().invoices).toEqual([
    expect.objectContaining({
      id: 'invoice-platform-1',
      statusText: '申请中',
    }),
  ]);
  expect(getProfileLocalState().selectedInvoiceOrderIds).toEqual([]);
});

test('keeps a failed platform invoice application queued locally and retries it successfully', async () => {
  const defaultProfileState = getProfileLocalState();
  const platformCompletedOrder = {
    id: 'HY202607080001',
    platformOrderId: 'platform-order-invoice-1',
    status: 'transporting' as const,
    from: '平台南山仓',
    to: '平台福田店',
    cargoType: '食品',
    weightText: '3 吨',
    vehicleRequirement: '中型货车',
    priceText: '￥9999',
    paymentMethodText: '在线支付',
    updatedAtText: '订单已完成 · 今天 10:00',
    updatedAtIso: '2026-07-08T02:00:00.000Z',
  };
  const platformInvoiceSpendingSnapshot = {
    shipperId: 'user-platform-invoice-retry',
    summary: {
      completedTotalCents: 85000,
      activeTotalCents: 0,
      refundTotalCents: 0,
    },
    items: [
      {
        orderId: 'platform-order-invoice-1',
        orderNo: 'HY202607080001',
        status: 'completed' as const,
        paymentMethod: 'online' as const,
        paymentStatus: 'settled' as const,
        paymentChannel: 'wechat' as const,
        paymentOrderStatus: 'settled' as const,
        amountCents: 85000,
        occurredAtIso: '2026-07-08T02:00:00.000Z',
        paidAtIso: '2026-07-08T01:30:00.000Z',
        settledAtIso: '2026-07-08T02:00:00.000Z',
        routeText: '平台南山仓 → 平台福田店',
      },
    ],
  };
  const createdPlatformInvoice = {
    id: 'invoice-platform-1',
    shipperId: 'user-platform-invoice-retry',
    invoiceType: 'normal' as const,
    invoiceTitleType: 'personal' as const,
    invoiceTitle: '平台货主',
    receiverEmail: 'invoice@platform.test',
    orderIds: ['platform-order-invoice-1'],
    orderNos: ['HY202607080001'],
    amountCents: 85000,
    status: 'reviewing' as const,
    createdAtIso: '2026-07-09T08:00:00.000Z',
    updatedAtIso: '2026-07-09T08:00:00.000Z',
  };
  let invoiceCreateCount = 0;
  let invoiceListLoadCount = 0;

  await AsyncStorage.setMany({
    '@vireCodeing/app-runtime-state': JSON.stringify({
      version: 1,
      state: {
        orders: [platformCompletedOrder],
        messages: [],
      },
    }),
    '@vireCodeing/profile-local-state': JSON.stringify({
      version: 1,
      state: {
        ...defaultProfileState,
        invoiceType: 'normal',
        invoiceTitle: 'personal',
        receiverEmail: 'invoice@platform.test',
        selectedInvoiceOrderIds: [],
        account: {
          ...defaultProfileState.account,
          displayName: '平台货主',
        },
      },
    }),
  });

  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(input);

    if (requestUrl === 'http://localhost:3000/api/auth/send-code') {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (requestUrl === 'http://localhost:3000/api/auth/login') {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-invoice-retry',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-invoice-retry',
            refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440121',
            expiresIn: 3600,
          },
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/address-book' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/invoices' &&
      init?.method === 'GET'
    ) {
      invoiceListLoadCount += 1;

      return Promise.resolve(
        createPlatformApiResponse(
          invoiceListLoadCount === 1 ? [] : [createdPlatformInvoice],
        ),
      );
    }

    if (
      requestUrl ===
        'http://localhost:3000/api/shipper/profile/spending-records' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(
        createPlatformApiResponse(platformInvoiceSpendingSnapshot),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/invoices' &&
      init?.method === 'POST'
    ) {
      invoiceCreateCount += 1;

      if (invoiceCreateCount === 1) {
        throw new Error('NETWORK_ERROR');
      }

      return Promise.resolve(createPlatformApiResponse(createdPlatformInvoice));
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });
  installPlatformFetchMock(fetchMock);

  const app = await renderApp(1000, {
    platformApiBaseUrl: 'http://localhost:3000/api',
  });

  await loginToHomeWithPlatformAuth(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
    await flushMicrotasks();
    await flushMacrotask();
    await flushMicrotasks();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({
        testID:
          'invoice-order-invoice-order-platform-platform-order-invoice-1',
      })
      .props.onPress();
  });

  expect(getProfileLocalState().syncState?.status).toBe('synced');

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'invoice-submit-platform' }).props.onPress();
    await flushMicrotasks();
  });

  expect(getRenderedText(app)).toContain('平台发票申请失败，请检查网络后重试。');
  expect(getProfileLocalState().selectedInvoiceOrderIds).toEqual([
    'invoice-order-platform-platform-order-invoice-1',
  ]);
  expect(getProfileLocalState().syncState).toMatchObject({
    status: 'failed',
    operation: 'invoiceApplication',
    message: '平台发票申请失败，请检查网络后重试。',
    invoiceApplicationSyncMode: 'submit',
    invoiceApplicationRequest: {
      invoiceType: 'normal',
      invoiceTitleType: 'personal',
      invoiceTitle: '平台货主',
      receiverEmail: 'invoice@platform.test',
      orderIds: ['platform-order-invoice-1'],
    },
    queueItems: [
      expect.objectContaining({
        titleText: '发票申请',
        statusText: '同步失败',
        noteText: '发票申请同步未完成，已保留本地申请，请返回个人中心重试。',
      }),
    ],
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('资料同步：同步失败');
  expect(getRenderedText(app)).toContain(
    '同步说明：平台发票申请失败，请检查网络后重试。',
  );
  expect(getRenderedText(app)).toContain('发票申请：同步失败');

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'profile-sync-retry' }).props.onPress();
    await flushMicrotasks();
    await flushMacrotask();
    await flushMicrotasks();
  });

  expect(
    findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/profile/invoices',
      method: 'POST',
    }),
  ).toHaveLength(2);
  expect(
    findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/profile/invoices',
      method: 'GET',
    }),
  ).toHaveLength(2);
  expect(getProfileLocalState().selectedInvoiceOrderIds).toEqual([]);
  expect(getProfileLocalState().syncState).toMatchObject({
    status: 'synced',
    operation: 'invoiceApplication',
    message: '平台发票申请已提交，状态已同步。',
    queueItems: [],
  });
  expect(getProfileLocalState().invoices).toEqual([
    expect.objectContaining({
      id: 'invoice-platform-1',
      statusText: '申请中',
    }),
  ]);
});

test('keeps a submitted platform invoice refresh queued locally and retries it successfully', async () => {
  const defaultProfileState = getProfileLocalState();
  const platformCompletedOrder = {
    id: 'HY202607080001',
    platformOrderId: 'platform-order-invoice-1',
    status: 'transporting' as const,
    from: '平台南山仓',
    to: '平台福田店',
    cargoType: '食品',
    weightText: '3 吨',
    vehicleRequirement: '中型货车',
    priceText: '￥9999',
    paymentMethodText: '在线支付',
    updatedAtText: '订单已完成 · 今天 10:00',
    updatedAtIso: '2026-07-08T02:00:00.000Z',
  };
  const platformInvoiceSpendingSnapshot = {
    shipperId: 'user-platform-invoice-refresh-retry',
    summary: {
      completedTotalCents: 85000,
      activeTotalCents: 0,
      refundTotalCents: 0,
    },
    items: [
      {
        orderId: 'platform-order-invoice-1',
        orderNo: 'HY202607080001',
        status: 'completed' as const,
        paymentMethod: 'online' as const,
        paymentStatus: 'settled' as const,
        paymentChannel: 'wechat' as const,
        paymentOrderStatus: 'settled' as const,
        amountCents: 85000,
        occurredAtIso: '2026-07-08T02:00:00.000Z',
        paidAtIso: '2026-07-08T01:30:00.000Z',
        settledAtIso: '2026-07-08T02:00:00.000Z',
        routeText: '平台南山仓 → 平台福田店',
      },
    ],
  };
  const createdPlatformInvoice = {
    id: 'invoice-platform-1',
    shipperId: 'user-platform-invoice-refresh-retry',
    invoiceType: 'normal' as const,
    invoiceTitleType: 'personal' as const,
    invoiceTitle: '平台货主',
    receiverEmail: 'invoice@platform.test',
    orderIds: ['platform-order-invoice-1'],
    orderNos: ['HY202607080001'],
    amountCents: 85000,
    status: 'reviewing' as const,
    createdAtIso: '2026-07-09T08:00:00.000Z',
    updatedAtIso: '2026-07-09T08:00:00.000Z',
  };
  let invoiceListLoadCount = 0;

  await AsyncStorage.setMany({
    '@vireCodeing/app-runtime-state': JSON.stringify({
      version: 1,
      state: {
        orders: [platformCompletedOrder],
        messages: [],
      },
    }),
    '@vireCodeing/profile-local-state': JSON.stringify({
      version: 1,
      state: {
        ...defaultProfileState,
        invoiceType: 'normal',
        invoiceTitle: 'personal',
        receiverEmail: 'invoice@platform.test',
        selectedInvoiceOrderIds: [],
        account: {
          ...defaultProfileState.account,
          displayName: '平台货主',
        },
      },
    }),
  });

  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(input);

    if (requestUrl === 'http://localhost:3000/api/auth/send-code') {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (requestUrl === 'http://localhost:3000/api/auth/login') {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-invoice-refresh-retry',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-invoice-refresh-retry',
            refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440122',
            expiresIn: 3600,
          },
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/address-book' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (
      requestUrl ===
        'http://localhost:3000/api/shipper/profile/spending-records' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(
        createPlatformApiResponse(platformInvoiceSpendingSnapshot),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/invoices' &&
      init?.method === 'GET'
    ) {
      invoiceListLoadCount += 1;

      if (invoiceListLoadCount === 2) {
        throw new Error('NETWORK_ERROR');
      }

      return Promise.resolve(
        createPlatformApiResponse(
          invoiceListLoadCount === 1 ? [] : [createdPlatformInvoice],
        ),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/invoices' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(createPlatformApiResponse(createdPlatformInvoice));
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });
  installPlatformFetchMock(fetchMock);

  const app = await renderApp(1000, {
    platformApiBaseUrl: 'http://localhost:3000/api',
  });

  await loginToHomeWithPlatformAuth(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
    await flushMicrotasks();
    await flushMacrotask();
    await flushMicrotasks();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({
        testID:
          'invoice-order-invoice-order-platform-platform-order-invoice-1',
      })
      .props.onPress();
  });

  expect(getProfileLocalState().syncState?.status).toBe('synced');

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'invoice-submit-platform' }).props.onPress();
    await flushMicrotasks();
    await flushMacrotask();
    await flushMicrotasks();
  });

  expect(getRenderedText(app)).toContain(
    '平台发票申请已提交，但申请记录刷新失败，请稍后重试。',
  );
  expect(getProfileLocalState().selectedInvoiceOrderIds).toEqual([]);
  expect(getProfileLocalState().syncState).toMatchObject({
    status: 'failed',
    operation: 'invoiceApplication',
    message: '平台发票申请已提交，但申请记录刷新失败，请稍后重试。',
    invoiceApplicationSyncMode: 'refresh',
    queueItems: [
      expect.objectContaining({
        titleText: '发票申请',
        statusText: '同步失败',
        noteText: '发票申请同步未完成，已保留本地申请，请返回个人中心重试。',
      }),
    ],
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('资料同步：同步失败');
  expect(getRenderedText(app)).toContain(
    '同步说明：平台发票申请已提交，但申请记录刷新失败，请稍后重试。',
  );
  expect(getRenderedText(app)).toContain('发票申请：同步失败');

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'profile-sync-retry' }).props.onPress();
    await flushMicrotasks();
    await flushMacrotask();
    await flushMicrotasks();
  });

  expect(
    findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/profile/invoices',
      method: 'POST',
    }),
  ).toHaveLength(1);
  expect(
    findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/profile/invoices',
      method: 'GET',
    }),
  ).toHaveLength(3);
  expect(getProfileLocalState().syncState).toMatchObject({
    status: 'synced',
    operation: 'invoiceApplication',
    message: '平台发票申请记录已同步。',
    queueItems: [],
  });
  expect(getProfileLocalState().invoices).toEqual([
    expect.objectContaining({
      id: 'invoice-platform-1',
      statusText: '申请中',
    }),
  ]);
});

test('uses the saved profile display name for personal invoice titles', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'setting-display-name' })
      .props.onChangeText('晨星货主');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'setting-account-submit' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-email' })
      .props.onChangeText('finance@morningstar.test');
    app.root.findByProps({ testID: 'invoice-title-personal' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('申请中');
  expect(renderedText).toContain('发票抬头：晨星货主');
  expect(renderedText).not.toContain('发票抬头：张先生');
});

test('uses local enterprise verification name for enterprise invoice titles', async () => {
  const app = await renderApp();

  await loginToHome(app);
  await submitLocalEnterpriseVerificationFromHome(app, '深圳星河物流有限公司');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-title-enterprise' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('发票抬头：深圳星河物流有限公司');
  expect(getProfileLocalState().invoices[0].title).toBe('深圳星河物流有限公司');
});

test('updates invoice record title for personal invoice requests', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'setting-display-name' })
      .props.onChangeText('晨星货主');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'setting-account-submit' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'invoice-title-personal' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  expect(getProfileLocalState().invoices[0].title).toBe('晨星货主');
});

test('submits a local invoice request with selected invoiceable orders', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('可开票订单');
  expect(renderedText).toContain('HY20260620003');
  expect(renderedText).toContain('本次申请金额：￥310');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-order-invoice-order-2' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('已选 2 单');
  expect(renderedText).toContain('本次申请金额：￥570');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('开票订单：HY20260620003、HY20260618002');
  expect(renderedText).toContain('申请金额：￥570');
});

test('updates invoice record summary after submitting a local invoice request', async () => {
  const app = await renderApp();

  await loginToHome(app);
  await submitLocalEnterpriseVerificationFromHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-type-vat-special' })
      .props.onPress();
    app.root
      .findByProps({ testID: 'invoice-order-invoice-order-2' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('增值税专用发票');
  expect(renderedText).toContain('待开票 ￥570');
});

test('removes submitted invoice orders from the invoiceable list', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
  });

  expect(
    app.root.findAllByProps({ testID: 'invoice-order-invoice-order-1' }).length,
  ).toBeGreaterThan(0);
  expect(
    app.root.findAllByProps({ testID: 'invoice-order-invoice-order-2' }).length,
  ).toBeGreaterThan(0);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-order-invoice-order-2' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  expect(getProfileLocalState().invoiceDetails['invoice-1']).toMatchObject({
    selectedOrderIds: ['invoice-order-1', 'invoice-order-2'],
  });
  expect(
    app.root.findAllByProps({ testID: 'invoice-order-invoice-order-1' }).length,
  ).toBe(0);
  expect(
    app.root.findAllByProps({ testID: 'invoice-order-invoice-order-2' }).length,
  ).toBe(0);
});

test('rejects a local invoice request with a visible reason', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-reject-invoice-1' })
      .props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('已驳回');
  expect(renderedText).toContain('发票申请已驳回：企业认证信息待补充。');
  expect(renderedText).toContain('驳回原因：企业认证信息待补充');
  expect(renderedText).toContain('重新提交');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-order-invoice-order-1' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('申请中');
  expect(renderedText).not.toContain(
    ' 驳回原因：企业认证信息待补充 本地审核通过',
  );
  expect(renderedText).toContain('第 1 次申请');
  expect(renderedText).toContain('第 2 次申请');
});

test('keeps local invoice history after rejecting and resubmitting', async () => {
  const app = await renderApp(new Date('2026-06-24T11:00:00+08:00').getTime());

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-reject-invoice-1' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-order-invoice-order-2' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);
  const invoiceHistory =
    getProfileLocalState().invoiceDetails['invoice-1'].statusHistory ?? [];

  expect(renderedText).toContain('处理记录');
  expect(renderedText).toContain('申请提交：2026-06-24 11:00');
  expect(renderedText).toContain('审核驳回：2026-06-24 11:00');
  expect(renderedText).toContain('重新提交：2026-06-24 11:00');
  expect(renderedText).toContain('驳回说明：企业认证信息待补充');
  expect(renderedText).toContain('开票订单：HY20260618002');
  expect(invoiceHistory).toHaveLength(3);
});

test('creates separate local invoice application history entries after resubmitting', async () => {
  const app = await renderApp(new Date('2026-06-24T11:30:00+08:00').getTime());

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-reject-invoice-1' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-order-invoice-order-2' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);
  const historyEntries =
    getProfileLocalState().invoiceDetails['invoice-1'].historyEntries ?? [];

  expect(renderedText).toContain('申请历史');
  expect(renderedText).toContain('第 1 次申请');
  expect(renderedText).toContain('第 2 次申请');
  expect(renderedText).toContain('HY20260620003');
  expect(renderedText).toContain('HY20260618002');
  expect(renderedText).toContain('已驳回');
  expect(renderedText).toContain('申请中');
  expect(historyEntries).toHaveLength(2);
});

test('shows only the latest local invoice application in the current summary after resubmitting', async () => {
  const app = await renderApp(new Date('2026-06-24T12:00:00+08:00').getTime());

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-reject-invoice-1' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-order-invoice-order-2' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('当前申请');
  expect(renderedText).toContain('开票订单：HY20260618002');
  expect(renderedText).toContain('申请历史');
  expect(renderedText).toContain('第 1 次申请');
  expect(renderedText).toContain('第 2 次申请');
  expect(renderedText).not.toContain(
    '当前申请 发票类型：电子普通发票 发票抬头：张先生 接收邮箱：finance@chenxing.example 开票订单：HY20260620003',
  );
});

test('filters and uses local profile coupons', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-coupons' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('优惠券');
  expect(renderedText).toContain('满 300 减 30');
  expect(renderedText).toContain('可使用');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'coupon-filter-usable' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('满 300 减 30');
  expect(renderedText).toContain('可使用');
  expect(renderedText).not.toContain('新客立减 20');
  expect(renderedText).not.toContain('夜间运输券');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'coupon-use-coupon-1' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('优惠券已使用：满 300 减 30');
  expect(renderedText).not.toContain('发单满 300 元可用');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'coupon-filter-used' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('满 300 减 30');
  expect(renderedText).toContain('已使用');
});

test('shows platform coupon wallet when opening coupons in platform mode', async () => {
  const originalFetch = globalThis.fetch;
  const platformCouponWallet = {
    shipperId: 'user-platform-coupon',
    summary: {
      usableCount: 1,
      lockedCount: 0,
      usedCount: 1,
      expiredCount: 0,
    },
    items: [
      {
        id: 'coupon-platform-usable',
        shipperId: 'user-platform-coupon',
        title: '平台满 500 减 50',
        status: 'usable' as const,
        conditionText: '平台订单满 500 元可用',
        discountCents: 5000,
        minOrderAmountCents: 50000,
        validFromIso: '2026-07-01T00:00:00.000Z',
        validUntilIso: '2026-07-31T15:59:59.000Z',
        sourceText: '平台活动发放',
        issuedAtIso: '2026-07-09T08:00:00.000Z',
      },
      {
        id: 'coupon-platform-used',
        shipperId: 'user-platform-coupon',
        title: '平台新客立减 20',
        status: 'used' as const,
        conditionText: '首单平台订单可用',
        discountCents: 2000,
        minOrderAmountCents: 0,
        validFromIso: '2026-07-01T00:00:00.000Z',
        validUntilIso: '2026-07-31T15:59:59.000Z',
        sourceText: '新客礼包',
        issuedAtIso: '2026-07-09T08:00:00.000Z',
        usedOrderNo: 'HY202607090009',
        usedAtIso: '2026-07-09T10:00:00.000Z',
      },
    ],
  };
  const fetchMock = jest.fn((url, init) => {
    const requestUrl = String(url);

    if (requestUrl === 'http://localhost:3000/api/auth/send-code') {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (requestUrl === 'http://localhost:3000/api/auth/login') {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-coupon',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-coupon',
            refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440131',
            expiresIn: 3600,
          },
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/address-book' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/coupons' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(createPlatformApiResponse(platformCouponWallet));
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-entry-coupons' }).props.onPress();
      await flushMicrotasks();
      await flushMacrotask();
      await flushMicrotasks();
    });

    const renderedText = getRenderedText(app);

    expect(renderedText).toContain('平台满 500 减 50');
    expect(renderedText).toContain('平台订单满 500 元可用');
    expect(renderedText).toContain('有效期至 2026-07-31');
    expect(renderedText).toContain('平台新客立减 20');
    expect(renderedText).toContain('已用于订单 HY202607090009');
    expect(renderedText).not.toContain('满 300 减 30');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/coupons',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-coupon',
        }),
      }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shows platform evaluation records when opening evaluations in platform mode', async () => {
  const originalFetch = globalThis.fetch;
  const platformEvaluationSnapshot = {
    shipperId: 'user-platform-evaluation',
    items: [
      {
        id: 'evaluation-platform-1',
        orderId: 'order-platform-1',
        orderNo: 'HY202607090001',
        driverName: '平台司机 driver-1',
        rating: 5,
        tags: ['准时送达', '服务好'],
        content: '平台评价同步内容',
        anonymous: false,
        photoCount: 2,
        photoFileIds: ['file-eval-1', 'file-eval-2'],
        submittedAtIso: '2026-07-09T09:00:00.000Z',
      },
      {
        id: 'evaluation-platform-2',
        orderId: 'order-platform-2',
        orderNo: 'HY202607090002',
        driverName: '平台司机 driver-2',
        rating: 4,
        tags: ['沟通顺畅'],
        content: '匿名平台评价同步内容',
        anonymous: true,
        photoCount: 0,
        submittedAtIso: '2026-07-09T08:00:00.000Z',
      },
    ],
  };
  const platformReceivedEvaluationSnapshot = {
    shipperId: 'user-platform-evaluation',
    items: [
      {
        id: 'received-platform-1',
        orderId: 'order-platform-received-1',
        orderNo: 'HY202607090003',
        driverName: '平台司机 driver-3',
        rating: 5,
        tags: ['沟通顺畅'],
        content: '司机评价货主同步内容',
        anonymous: false,
        photoCount: 1,
        photoFileIds: ['file-received-1'],
        submittedAtIso: '2026-07-09T10:00:00.000Z',
      },
    ],
  };
  const fetchMock = jest.fn((url, init) => {
    const requestUrl = String(url);

    if (requestUrl === 'http://localhost:3000/api/auth/send-code') {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (requestUrl === 'http://localhost:3000/api/auth/login') {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-evaluation',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-evaluation',
            refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440132',
            expiresIn: 3600,
          },
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/address-book' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (
      requestUrl ===
        'http://localhost:3000/api/shipper/profile/evaluations' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(
        createPlatformApiResponse(platformEvaluationSnapshot),
      );
    }

    if (
      requestUrl ===
        'http://localhost:3000/api/shipper/profile/evaluations/received' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(
        createPlatformApiResponse(platformReceivedEvaluationSnapshot),
      );
    }

    if (requestUrl === 'http://localhost:3000/api/files/file-eval-1') {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-eval-1',
          ownerUserId: 'user-platform-evaluation',
          purpose: 'evaluation',
          objectKey: 'shipper-1/evaluation/file-eval-1.png',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-eval-1.png',
          createdAtIso: '2026-07-09T09:00:00.000Z',
        }),
      );
    }

    if (requestUrl === 'http://localhost:3000/api/files/file-eval-2') {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-eval-2',
          ownerUserId: 'user-platform-evaluation',
          purpose: 'evaluation',
          objectKey: 'shipper-1/evaluation/file-eval-2.png',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-eval-2.png',
          createdAtIso: '2026-07-09T09:00:00.000Z',
        }),
      );
    }

    if (requestUrl === 'http://localhost:3000/api/files/file-received-1') {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-received-1',
          ownerUserId: 'user-platform-evaluation',
          purpose: 'evaluation',
          objectKey: 'shipper-1/evaluation/file-received-1.png',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-received-1.png',
          createdAtIso: '2026-07-09T10:00:00.000Z',
        }),
      );
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'profile-entry-evaluations' })
        .props.onPress();
      await flushMicrotasks();
      await flushMacrotask();
      await flushMicrotasks();
    });

    const renderedText = getRenderedText(app);

    expect(renderedText).toContain('平台评价同步内容');
    expect(renderedText).toContain('图片凭证 2 张');
    expect(renderedText).toContain('匿名评价');
    expect(renderedText).toContain('匿名平台评价同步内容');
    expect(renderedText).toContain('司机评价货主同步内容');
    expect(renderedText).toContain('司机评价：2026-07-09 10:00');
    expect(renderedText).toContain('评价图片凭证 清单');
    expect(renderedText).toContain('司机评价图片凭证 清单');
    expect(renderedText).toContain('文件 ID：file-eval-1');
    expect(renderedText).toContain('文件 ID：file-received-1');
    expect(renderedText).not.toContain('师傅准时，货物保护不错。');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/evaluations',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-evaluation',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/evaluations/received',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-evaluation',
        }),
      }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('filters local spending refund records', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-spending' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'spending-filter-refund' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('HY20260619005');
  expect(renderedText).toContain('退款中');
  expect(renderedText).toContain('取消退款');
  expect(renderedText).not.toContain('HY20260620003');
  expect(renderedText).not.toContain('HY20260621008');
});

test('approves and downloads a local invoice voucher', async () => {
  const app = await renderApp(new Date('2026-06-24T10:30:00+08:00').getTime());

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-invoices' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-submit-invoice-1' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-approve-invoice-1' })
      .props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('已开票');
  expect(renderedText).toContain('已开票 ￥310');
  expect(renderedText).toContain('发票审核通过');
  expect(renderedText).toContain('提交时间：2026-06-24 10:30');
  expect(renderedText).toContain('开票时间：2026-06-24 10:30');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'invoice-download-invoice-1' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('发票下载凭证：INV-LOCAL-invoice-1');
  expect(renderedText).toContain('下载时间：2026-06-24 10:30');
});

test('toggles local profile settings and shows the updated state', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('手机号保护');
  expect(renderedText).toContain('已开启');
  expect(renderedText).toContain('订单通知');
  expect(renderedText).toContain('本地展示');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'setting-toggle-setting-phone' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('已关闭');
  expect(renderedText).toContain('设置已更新：手机号保护已关闭');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'setting-toggle-setting-notification' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('订单通知');
  expect(renderedText).toContain('设置已更新：订单通知已开启');
});

test('toggles local account security protection and checks device status', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('异地登录保护');
  expect(renderedText).toContain('真实异地登录风控和多设备管理尚未接入');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'setting-toggle-setting-login-protection' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('设置已更新：异地登录保护已关闭');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'account-security-local-check' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('账号安全检查');
  expect(renderedText).toContain('需处理');
  expect(renderedText).toContain('当前设备：本机演示设备（本地会话）');
  expect(renderedText).toContain('仅检测到当前设备会话，本地未发现其他设备快照。');
  expect(renderedText).toContain('当前会话：本地演示会话 · 有效');
  expect(renderedText).toContain('登录保护：已关闭');
  expect(renderedText).toContain('手机号保护：已开启');
  expect(renderedText).toContain('风险结论：发现 1 项待处理风险');
  expect(renderedText).toContain(
    '风险提示：异地登录保护已关闭，本地无法拦截异常设备登录。',
  );
  expect(
    getProfileLocalState().settings.find(
      setting => setting.id === 'setting-login-protection',
    )?.statusText,
  ).toBe('已关闭');
});

test('updates local account settings and opens policy documents', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'setting-display-name' })
      .props.onChangeText('晨星货主');
    app.root
      .findByProps({ testID: 'setting-bound-phone' })
      .props.onChangeText('13900139999');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'setting-avatar-upload' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'setting-account-submit' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('昵称：晨星货主');
  expect(renderedText).toContain('绑定手机号：13900139999');
  expect(renderedText).toContain('头像凭证 1 张');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'setting-toggle-setting-promotion' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('促销通知');
  expect(renderedText).toContain('设置已更新：促销通知已开启');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'setting-open-user-agreement' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('用户协议摘要');
  expect(renderedText).toContain('本地演示版展示协议要点');
  expect(renderedText).toContain('权限说明');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'setting-open-permissions' })
      .props.onPress();
  });

  await flushMicrotasks();
  await flushMacrotask();
  await flushMicrotasks();

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('权限说明：定位用于发单城市与路线展示');
  expect(renderedText).toContain('相机用于本地图片凭证占位');
  expect(renderedText).toContain('通知用于订单状态提醒');
  expect(renderedText).toContain('通知、相机和相册会读取当前系统状态');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'setting-open-about' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('关于我们');
  expect(renderedText).toContain('货主端本地 MVP');
});

test('checks local permission status and shows denied guidance', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'setting-open-permissions' })
      .props.onPress();
  });

  await flushMicrotasks();
  await flushMacrotask();
  await flushMicrotasks();

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('权限状态');
  expect(renderedText).toContain('定位权限：未检测');
  expect(renderedText).toContain('相机权限：系统已授权');
  expect(renderedText).toContain('相册权限：系统已授权');
  expect(renderedText).toContain('通知权限：系统已授权');
  expect(renderedText).toContain('通知、相机和相册会读取当前系统状态');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'permission-local-check' }).props.onPress();
  });
  await flushMicrotasks();
  await flushMacrotask();
  await flushMicrotasks();

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('定位权限：本地未授权');
  expect(renderedText).toContain('相机权限：系统已授权');
  expect(renderedText).toContain('相册权限：系统已授权');
  expect(renderedText).toContain('通知权限：系统已授权');
  expect(renderedText).toContain(
    '权限检查完成：通知、相机和相册已同步系统状态，定位权限仍为本地演练。',
  );

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'permission-denied-guide-location' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('定位权限拒绝引导');
  expect(renderedText).toContain('请到系统设置中为货主端开启定位权限');
  expect(renderedText).toContain('当前不会拉起真实系统设置页');
});

test('confirms the local privacy policy from profile settings', async () => {
  const now = 1000;
  const app = await renderApp(now);

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'setting-open-privacy' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('隐私政策确认');
  expect(renderedText).toContain('确认状态：未确认');
  expect(renderedText).toContain(
    `当前版本：${privacyPolicyDocumentInfo.versionTitle}`,
  );
  expect(renderedText).toContain(
    '平台会同步隐私确认时间和已确认版本留痕；历史旧数据可能只有确认时间。',
  );

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'privacy-policy-confirm' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('隐私政策已确认');
  expect(renderedText).toContain('确认状态：已确认');
  expect(renderedText).toContain('本地确认时间：刚刚');
  expect(renderedText).toContain(
    `已确认版本：${privacyPolicyDocumentInfo.versionTitle}`,
  );
  expect(
    getProfileLocalState().settings.find(
      setting => setting.id === 'setting-privacy',
    ),
  ).toMatchObject({
    statusText: '已确认',
    confirmedAtText: '刚刚',
    confirmedAtIso: new Date(now).toISOString(),
    confirmedVersionId: privacyPolicyDocumentInfo.version,
    confirmedVersionTitle: privacyPolicyDocumentInfo.versionTitle,
  });
});

test('checks local app version update from profile settings', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('版本更新');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'setting-open-version-update' })
      .props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('版本更新：当前版本 0.0.1');
  expect(renderedText).toContain('更新结果：本地 MVP 暂无线上更新包');
  expect(renderedText).toContain('检查时间：刚刚');
});

test('adds the local version update setting when restoring older profile settings', async () => {
  await AsyncStorage.setMany({
    '@vireCodeing/auth-session': JSON.stringify({
      issuedAt: 1000,
      expiresAt: 1000 + 7 * 24 * 60 * 60 * 1000,
    }),
    '@vireCodeing/profile-local-state': JSON.stringify({
      version: 1,
      state: {
        addresses: [],
        contacts: [],
        coupons: [],
        invoices: [],
        invoiceDetails: {},
        invoiceRejectionReasons: {},
        invoiceType: 'normal',
        invoiceTitle: 'enterprise',
        receiverEmail: 'persisted@example.com',
        selectedInvoiceOrderIds: [],
        settings: [
          {
            id: 'setting-phone',
            title: '手机号保护',
            description: '向司机展示脱敏号码，真实拨号后续接入系统能力。',
            statusText: '已关闭',
          },
        ],
        account: {
          displayName: '旧版货主',
          boundPhone: '13800138000',
          avatarPhotoCount: 0,
        },
        password: {
          savedPassword: 'abc123',
          updatedAt: '未修改',
        },
      },
    }),
  });

  const app = await renderApp(2000);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('手机号保护');
  expect(renderedText).toContain('已关闭');
  expect(renderedText).toContain('版本更新');
});

test('marks local profile changes as pending backend sync and retries them', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('资料同步：已同步');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'setting-display-name' })
      .props.onChangeText('待同步货主');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'setting-account-submit' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('资料同步：待同步');
  expect(getProfileLocalState().syncState?.status).toBe('pending');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-sync-retry' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('资料同步：已同步');
  expect(renderedText).toContain(
    '同步说明：本地资料已记录，等待平台资料同步。',
  );
  expect(getProfileLocalState().syncState?.status).toBe('synced');
});

test('shows a local profile sync failure queue and retries it', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'setting-display-name' })
      .props.onChangeText('失败队列货主');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'setting-account-submit' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });

  let renderedText = getRenderedText(app);

  expect(renderedText).toContain('资料同步队列');
  expect(renderedText).toContain('个人中心资料变更：待同步');
  expect(renderedText).toContain(
    '个人中心资料已保留在本地，待平台资料同步',
  );

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-sync-mark-failed' })
      .props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('资料同步：同步失败');
  expect(renderedText).toContain('个人中心资料变更：同步失败');
  expect(renderedText).toContain(
    '个人中心资料同步未完成，已保留本地变更，请返回个人中心重试',
  );
  expect(getProfileLocalState().syncState?.status).toBe('failed');

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-sync-retry' }).props.onPress();
  });

  renderedText = getRenderedText(app);

  expect(renderedText).toContain('资料同步：已同步');
  expect(renderedText).toContain('暂无待同步资料');
  expect(getProfileLocalState().syncState?.status).toBe('synced');
});

test('syncs profile addresses through the platform address book api', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-profile-address-book',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.profile-address-book.900',
          refreshToken: 'refresh.profile-address-book.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-profile-address-book',
        addresses: [],
        contacts: [],
        updatedAtIso: '2026-07-03T08:20:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-profile-address-book',
        addresses: [
          {
            id: 'address-local-1',
            name: '龙华临时仓',
            address: '龙华区临时中转仓',
            contactText: '吴主管 13900139001',
            tagText: '备用装货地',
          },
        ],
        contacts: [],
        updatedAtIso: '2026-07-03T08:30:00.000Z',
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-03T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
      await flushMicrotasks();
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-entry-addresses' }).props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'profile-address-name' })
        .props.onChangeText('龙华临时仓');
      app.root
        .findByProps({ testID: 'profile-address-detail' })
        .props.onChangeText('龙华区临时中转仓');
      app.root
        .findByProps({ testID: 'profile-address-contact' })
        .props.onChangeText('吴主管 13900139001');
      app.root
        .findByProps({ testID: 'profile-address-tag' })
        .props.onChangeText('备用装货地');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-address-submit' }).props.onPress();
      await flushMicrotasks();
    });

    const saveCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/profile/address-book',
      method: 'PUT',
    });

    expect(saveCall).toBeDefined();
    expect(saveCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.profile-address-book.900',
        }),
        body: expect.stringContaining('龙华临时仓'),
      }),
    );
    expect(
      getFetchCallBody<{ baseUpdatedAtIso: string }>(saveCall),
    ).toMatchObject({
      baseUpdatedAtIso: '2026-07-03T08:20:00.000Z',
    });
    expect(getProfileLocalState()).toMatchObject({
      addresses: expect.arrayContaining([
        expect.objectContaining({ name: '龙华临时仓' }),
      ]),
      syncState: { status: 'synced' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps platform profile address book save queued when saving has no auth token', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-03T08:00:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-profile-address-book-missing-token-save',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.profile-address-book.missing-token-save',
          refreshToken: 'refresh.profile-address-book.missing-token-save',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-profile-address-book-missing-token-save',
        addresses: [],
        contacts: [],
        updatedAtIso: '2026-07-03T08:20:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-profile-address-book-missing-token-save',
        addresses: [
          {
            id: 'address-local-missing-token',
            name: '龙华临时仓',
            address: '龙华区临时中转仓',
            contactText: '吴主管 13900139001',
            tagText: '备用装货地',
          },
        ],
        contacts: [],
        updatedAtIso: '2026-07-03T08:30:00.000Z',
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
      await flushMicrotasks();
    });
    clearAuthSession();

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-entry-addresses' }).props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'profile-address-name' })
        .props.onChangeText('龙华临时仓');
      app.root
        .findByProps({ testID: 'profile-address-detail' })
        .props.onChangeText('龙华区临时中转仓');
      app.root
        .findByProps({ testID: 'profile-address-contact' })
        .props.onChangeText('吴主管 13900139001');
      app.root
        .findByProps({ testID: 'profile-address-tag' })
        .props.onChangeText('备用装货地');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-address-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      findFetchCall(fetchMock, {
        url: 'http://localhost:3000/api/shipper/profile/address-book',
        method: 'PUT',
      }),
    ).toBeUndefined();
    expect(getProfileLocalState().syncState).toMatchObject({
      status: 'failed',
      operation: 'addressBook',
      message: '平台地址簿保存需要重新登录后再同步。',
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
    });

    expect(getRenderedText(app)).toContain(
      '平台地址簿保存需要重新登录后再同步。',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loads the platform profile address book when opening profile center', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-profile-address-book-load',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.profile-address-book-load.900',
          refreshToken: 'refresh.profile-address-book-load.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-profile-address-book-load',
        addresses: [
          {
            id: 'address-platform-1',
            name: '平台宝安仓',
            address: '宝安区平台仓库',
            contactText: '平台仓管 13900139011',
          },
        ],
        contacts: [
          {
            id: 'contact-platform-1',
            name: '平台仓管',
            roleText: '装货联系人',
            phoneText: '13900139011',
          },
        ],
        clientUpdatedAtIso: '2026-07-03T08:00:00.000Z',
        updatedAtIso: '2026-07-03T08:30:00.000Z',
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-03T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
      await flushMicrotasks();
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-entry-addresses' }).props.onPress();
    });

    const loadCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/profile/address-book',
      method: 'GET',
    });

    expect(loadCall).toBeDefined();
    expect(loadCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.profile-address-book-load.900',
        }),
      }),
    );
    expect(getRenderedText(app)).toContain('平台宝安仓');
    expect(getRenderedText(app)).toContain('平台仓管 13900139011');
    expect(getProfileLocalState()).toMatchObject({
      addresses: expect.arrayContaining([
        expect.objectContaining({
          id: 'address-platform-1',
          name: '平台宝安仓',
          tagText: '',
        }),
      ]),
      contacts: expect.arrayContaining([
        expect.objectContaining({
          id: 'contact-platform-1',
          name: '平台仓管',
          noteText: '',
        }),
      ]),
      syncState: { status: 'synced', operation: 'addressBook' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses platform-loaded profile address book entries as draft suggestions', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-profile-address-book-draft',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.profile-address-book-draft.900',
          refreshToken: 'refresh.profile-address-book-draft.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-profile-address-book-draft',
        addresses: [
          {
            id: 'address-platform-draft-1',
            name: '平台前海仓',
            address: '前海平台仓库',
            contactText: '平台调度 13900139021',
          },
        ],
        contacts: [
          {
            id: 'contact-platform-draft-1',
            name: '平台调度',
            roleText: '卸货联系人',
            phoneText: '13900139021',
          },
        ],
        clientUpdatedAtIso: '2026-07-03T08:00:00.000Z',
        updatedAtIso: '2026-07-03T08:30:00.000Z',
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null));
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-03T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
    });

    expect(
      findFetchCall(fetchMock, {
        url: 'http://localhost:3000/api/shipper/profile/address-book',
        method: 'GET',
      }),
    ).toBeDefined();

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'support-back-home' }).props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });

    let renderedText = getRenderedText(app);

    expect(renderedText).toContain('常用地址建议');
    expect(renderedText).toContain('常用联系人建议');
    expect(renderedText).toContain(
      '当前建议来自个人中心地址簿，平台地址簿快照已同步到当前列表。',
    );
    expect(renderedText).toContain('装货：平台前海仓');
    expect(renderedText).toContain('卸货：平台调度');

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({
          testID: 'draft-pickup-address-suggestion-address-platform-draft-1',
        })
        .props.onPress();
      app.root
        .findByProps({
          testID: 'draft-delivery-contact-suggestion-contact-platform-draft-1',
        })
        .props.onPress();
    });

    expect(
      app.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
    ).toBe('前海平台仓库');
    expect(
      app.root.findByProps({ testID: 'draft-pickup-contact' }).props.value,
    ).toBe('平台调度');
    expect(
      app.root.findByProps({ testID: 'draft-pickup-phone' }).props.value,
    ).toBe('13900139021');
    expect(
      app.root.findByProps({ testID: 'draft-delivery-contact' }).props.value,
    ).toBe('平台调度');
    expect(
      app.root.findByProps({ testID: 'draft-delivery-phone' }).props.value,
    ).toBe('13900139021');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps platform profile address book load queued when opening profile has no auth token', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-03T08:00:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-profile-address-book-load-missing-token',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.profile-address-book-load-missing-token.900',
          refreshToken: 'refresh.profile-address-book-load-missing-token.604800',
          expiresIn: 900,
        },
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    saveProfileLocalState({
      ...getProfileLocalState(),
      addresses: [
        {
          id: 'address-local-synced',
          name: '本地已同步仓',
          address: '宝安区本地仓库',
          contactText: '本地仓管 13900139015',
          tagText: '本地',
        },
      ],
      contacts: [
        {
          id: 'contact-local-synced',
          name: '本地仓管',
          roleText: '装货联系人',
          phoneText: '13900139015',
          noteText: '本地联系人',
        },
      ],
      syncState: {
        status: 'synced',
        operation: 'addressBook',
        message: '平台地址簿已拉取到本地常用地址/联系人。',
        updatedAtText: '今天 16:00',
        updatedAtIso: '2026-07-03T08:00:00.000Z',
        platformUpdatedAtIso: '2026-07-03T07:30:00.000Z',
        platformAddressIds: ['address-local-synced'],
        platformContactIds: ['contact-local-synced'],
      },
    });
    clearAuthSession();

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
      await flushMicrotasks();
    });
    expect(getRenderedText(app)).toContain(
      '平台地址簿拉取需要重新登录后再同步。',
    );
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-entry-addresses' }).props.onPress();
    });

    expect(
      findFetchCall(fetchMock, {
        url: 'http://localhost:3000/api/shipper/profile/address-book',
        method: 'GET',
      }),
    ).toBeUndefined();
    expect(getRenderedText(app)).toContain('本地已同步仓');
    expect(getRenderedText(app)).toContain('本地仓管 13900139015');
    expect(getProfileLocalState()).toMatchObject({
      addresses: expect.arrayContaining([
        expect.objectContaining({
          id: 'address-local-synced',
          name: '本地已同步仓',
        }),
      ]),
      contacts: expect.arrayContaining([
        expect.objectContaining({
          id: 'contact-local-synced',
          name: '本地仓管',
        }),
      ]),
      syncState: {
        status: 'failed',
        operation: 'addressBook',
        message: '平台地址簿拉取需要重新登录后再同步。',
        platformUpdatedAtIso: '2026-07-03T07:30:00.000Z',
        platformAddressIds: ['address-local-synced'],
        platformContactIds: ['contact-local-synced'],
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps platform profile address book load queued when opening profile load fails', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-03T08:00:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-profile-address-book-load-failure',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.profile-address-book-load-failure.900',
          refreshToken: 'refresh.profile-address-book-load-failure.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'));
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    saveProfileLocalState({
      ...getProfileLocalState(),
      addresses: [
        {
          id: 'address-local-load-failure',
          name: '本地失败保留仓',
          address: '龙华区本地保留仓库',
          contactText: '保留仓管 13900139016',
          tagText: '本地',
        },
      ],
      contacts: [
        {
          id: 'contact-local-load-failure',
          name: '保留仓管',
          roleText: '装货联系人',
          phoneText: '13900139016',
          noteText: '本地联系人',
        },
      ],
      syncState: {
        status: 'synced',
        operation: 'addressBook',
        message: '平台地址簿已拉取到本地常用地址/联系人。',
        updatedAtText: '今天 16:00',
        updatedAtIso: '2026-07-03T08:00:00.000Z',
        platformUpdatedAtIso: '2026-07-03T07:30:00.000Z',
        platformAddressIds: ['address-local-load-failure'],
        platformContactIds: ['contact-local-load-failure'],
      },
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
      await flushMicrotasks();
    });
    const loadCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/profile/address-book',
      method: 'GET',
    });

    expect(loadCall).toBeDefined();
    expect(loadCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.profile-address-book-load-failure.900',
        }),
      }),
    );
    expect(getRenderedText(app)).toContain(
      '平台地址簿拉取失败，已保留本地常用地址/联系人。',
    );
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-entry-addresses' }).props.onPress();
    });

    expect(getRenderedText(app)).toContain('本地失败保留仓');
    expect(getRenderedText(app)).toContain('保留仓管 13900139016');
    expect(getProfileLocalState()).toMatchObject({
      addresses: expect.arrayContaining([
        expect.objectContaining({
          id: 'address-local-load-failure',
          name: '本地失败保留仓',
        }),
      ]),
      contacts: expect.arrayContaining([
        expect.objectContaining({
          id: 'contact-local-load-failure',
          name: '保留仓管',
        }),
      ]),
      syncState: {
        status: 'failed',
        operation: 'addressBook',
        message: '平台地址簿拉取失败，已保留本地常用地址/联系人。',
        platformUpdatedAtIso: '2026-07-03T07:30:00.000Z',
        platformAddressIds: ['address-local-load-failure'],
        platformContactIds: ['contact-local-load-failure'],
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps local pending profile address book changes when platform profile opens', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-profile-address-book-pending',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.profile-address-book-pending.900',
          refreshToken: 'refresh.profile-address-book-pending.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-profile-address-book-pending',
        addresses: [
          {
            id: 'address-platform-old',
            name: '平台旧仓',
            address: '平台旧地址',
            contactText: '旧联系人 13900139012',
          },
        ],
        contacts: [],
        updatedAtIso: '2026-07-03T08:30:00.000Z',
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-03T08:10:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    saveProfileLocalState({
      ...getProfileLocalState(),
      addresses: [
        {
          id: 'address-local-pending',
          name: '本地待同步仓',
          address: '本地新地址',
          contactText: '本地联系人 13900139013',
          tagText: '本地',
        },
      ],
      contacts: [],
      syncState: createPendingProfileSyncState(
        '常用地址/联系人已在本地更新，正在同步平台地址簿。',
        new Date('2026-07-03T08:05:00.000Z').getTime(),
        'addressBook',
      ),
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
      await flushMicrotasks();
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-entry-addresses' }).props.onPress();
    });

    expect(getRenderedText(app)).toContain('本地待同步仓');
    expect(getRenderedText(app)).not.toContain('平台旧仓');
    expect(getProfileLocalState()).toMatchObject({
      addresses: [
        expect.objectContaining({
          id: 'address-local-pending',
          name: '本地待同步仓',
        }),
      ],
      syncState: { status: 'pending', operation: 'addressBook' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps local profile address book changes when platform save conflicts', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-profile-address-book-conflict',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.profile-address-book-conflict.900',
          refreshToken: 'refresh.profile-address-book-conflict.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-profile-address-book-conflict',
        addresses: [
          {
            id: 'address-server-deleted',
            name: '服务端旧仓',
            address: '服务端旧地址',
            contactText: '旧联系人 13900139020',
            tagText: '旧服务端',
          },
        ],
        contacts: [
          {
            id: 'contact-shared-conflict',
            name: '本地调度',
            roleText: '装货联系人',
            phoneText: '13900139023',
            noteText: '本地联系人备注',
          },
          {
            id: 'contact-server-deleted',
            name: '服务端旧调度',
            roleText: '卸货联系人',
            phoneText: '13900139026',
            noteText: '旧服务端联系人备注',
          },
        ],
        updatedAtIso: '2026-07-03T08:20:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiErrorResponse(
        409,
        'PROFILE_ADDRESS_BOOK_CONFLICT',
        '常用地址/联系人已被其他设备更新，请先拉取最新地址簿后再保存。',
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-profile-address-book-conflict',
        addresses: [
          {
            id: 'address-platform-conflict',
            name: '服务端新仓',
            address: '服务端新地址',
            contactText: '服务端联系人 13900139022',
            tagText: '服务端',
          },
          {
            id: 'address-local-2',
            name: '服务端冲突仓',
            address: '服务端修正地址',
            contactText: '服务端联系人 13900139024',
            tagText: '服务端标签',
          },
        ],
        contacts: [
          {
            id: 'contact-shared-conflict',
            name: '平台调度',
            roleText: '平台联系人',
            phoneText: '13900139025',
            noteText: '服务端联系人备注',
          },
          {
            id: 'contact-platform-conflict',
            name: '服务端调度',
            roleText: '平台联系人',
            phoneText: '13900139023',
            noteText: '服务端联系人备注',
          },
        ],
        updatedAtIso: '2026-07-03T08:30:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-profile-address-book-conflict',
        addresses: [
          {
            id: 'address-local-2',
            name: '本地冲突仓',
            address: '服务端修正地址',
            contactText: '本地联系人 13900139021',
            tagText: '冲突',
          },
          {
            id: 'address-platform-conflict',
            name: '服务端新仓',
            address: '服务端新地址',
            contactText: '服务端联系人 13900139022',
            tagText: '服务端',
          },
        ],
        contacts: [
          {
            id: 'contact-shared-conflict',
            name: '本地调度',
            roleText: '装货联系人',
            phoneText: '13900139025',
            noteText: '本地联系人备注',
          },
          {
            id: 'contact-platform-conflict',
            name: '服务端调度',
            roleText: '平台联系人',
            phoneText: '13900139023',
            noteText: '服务端联系人备注',
          },
        ],
        updatedAtIso: '2026-07-03T08:35:00.000Z',
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-03T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
      await flushMicrotasks();
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-entry-addresses' }).props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'profile-address-name' })
        .props.onChangeText('本地冲突仓');
      app.root
        .findByProps({ testID: 'profile-address-detail' })
        .props.onChangeText('本地冲突地址');
      app.root
        .findByProps({ testID: 'profile-address-contact' })
        .props.onChangeText('本地联系人 13900139021');
      app.root
        .findByProps({ testID: 'profile-address-tag' })
        .props.onChangeText('冲突');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-address-submit' }).props.onPress();
      await flushMicrotasks();
    });

    const state = getProfileLocalState();

    const initialSaveCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/profile/address-book',
      method: 'PUT',
    });

    expect(
      getFetchCallBody<{ baseUpdatedAtIso: string }>(initialSaveCall),
    ).toMatchObject({
      baseUpdatedAtIso: '2026-07-03T08:20:00.000Z',
    });
    expect(state.addresses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '本地冲突仓' }),
      ]),
    );
    expect(state.syncState).toMatchObject({
      status: 'failed',
      operation: 'addressBook',
      message: '平台地址簿已被其他设备更新，已保留本地常用地址/联系人。',
      platformUpdatedAtIso: '2026-07-03T08:30:00.000Z',
      conflictSummaryText: '服务端地址簿：服务端新仓',
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
    });

    expect(getRenderedText(app)).toContain('服务端地址簿：服务端新仓');
    expect(getRenderedText(app)).toContain('服务端新仓');
    expect(getRenderedText(app)).toContain('服务端调度');
    expect(getRenderedText(app)).toContain(
      '详细地址：本地冲突地址 -> 服务端修正地址',
    );
    expect(getRenderedText(app)).toContain('电话：13900139023 -> 13900139025');
    expect(getRenderedText(app)).toContain('服务端已删除地址：服务端旧仓');
    expect(getRenderedText(app)).toContain('服务端已删除联系人：服务端旧调度');

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({
          testID:
            'profile-sync-adopt-conflict-address-field-address-local-2-address',
        })
        .props.onPress();
    });

    expect(getProfileLocalState().addresses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'address-local-2',
          name: '本地冲突仓',
          address: '服务端修正地址',
          contactText: '本地联系人 13900139021',
          tagText: '冲突',
        }),
      ]),
    );
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({
          testID:
            'profile-sync-adopt-conflict-deleted-address-address-server-deleted',
        })
        .props.onPress();
    });

    expect(
      getProfileLocalState().addresses.some(
        address => address.id === 'address-server-deleted',
      ),
    ).toBe(false);
    expect(getProfileLocalState().addresses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'address-local-2', name: '本地冲突仓' }),
      ]),
    );
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({
          testID:
            'profile-sync-adopt-conflict-deleted-contact-contact-server-deleted',
        })
        .props.onPress();
    });

    expect(
      getProfileLocalState().contacts.some(
        contact => contact.id === 'contact-server-deleted',
      ),
    ).toBe(false);
    expect(getProfileLocalState().contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'contact-shared-conflict',
          name: '本地调度',
        }),
      ]),
    );
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({
          testID:
            'profile-sync-adopt-conflict-contact-field-contact-shared-conflict-phoneText',
        })
        .props.onPress();
    });

    expect(getProfileLocalState().contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'contact-shared-conflict',
          name: '本地调度',
          roleText: '装货联系人',
          phoneText: '13900139025',
          noteText: '本地联系人备注',
        }),
      ]),
    );

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({
          testID:
            'profile-sync-adopt-conflict-address-address-platform-conflict',
        })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({
          testID:
            'profile-sync-adopt-conflict-contact-contact-platform-conflict',
        })
        .props.onPress();
    });

    expect(getProfileLocalState().addresses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '本地冲突仓' }),
        expect.objectContaining({ name: '服务端新仓' }),
      ]),
    );
    expect(getProfileLocalState().contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '服务端调度' }),
      ]),
    );
    expect(getProfileLocalState().syncState).toMatchObject({
      status: 'failed',
      operation: 'addressBook',
      platformUpdatedAtIso: '2026-07-03T08:30:00.000Z',
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({
          testID:
            'profile-sync-adopt-conflict-address-field-address-local-2-name',
        })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({
          testID:
            'profile-sync-adopt-conflict-address-field-address-local-2-contactText',
        })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({
          testID:
            'profile-sync-adopt-conflict-address-field-address-local-2-tagText',
        })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({
          testID:
            'profile-sync-adopt-conflict-contact-field-contact-shared-conflict-name',
        })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({
          testID:
            'profile-sync-adopt-conflict-contact-field-contact-shared-conflict-roleText',
        })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({
          testID:
            'profile-sync-adopt-conflict-contact-field-contact-shared-conflict-noteText',
        })
        .props.onPress();
    });

    expect(getProfileLocalState().syncState?.conflictSummaryText).toBeUndefined();
    expect(getProfileLocalState().syncState?.conflictAddressItems).toBeUndefined();
    expect(
      getProfileLocalState().syncState?.conflictAddressFieldItems,
    ).toBeUndefined();
    expect(
      getProfileLocalState().syncState?.conflictDeletedAddressItems,
    ).toBeUndefined();
    expect(getProfileLocalState().syncState?.conflictContactItems).toBeUndefined();
    expect(
      getProfileLocalState().syncState?.conflictContactFieldItems,
    ).toBeUndefined();
    expect(
      getProfileLocalState().syncState?.conflictDeletedContactItems,
    ).toBeUndefined();
    expect(getRenderedText(app)).not.toContain('服务端地址簿：服务端新仓');

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const addressBookSaveCalls = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/profile/address-book',
      method: 'PUT',
    });
    const retryBody = getFetchCallBody<{
      baseUpdatedAtIso: string;
      addresses: Array<Record<string, unknown>>;
      contacts: Array<Record<string, unknown>>;
    }>(addressBookSaveCalls[addressBookSaveCalls.length - 1]);

    expect(retryBody).toMatchObject({
      baseUpdatedAtIso: '2026-07-03T08:30:00.000Z',
      addresses: expect.arrayContaining([
        expect.objectContaining({
          name: '服务端冲突仓',
          address: '服务端修正地址',
          contactText: '服务端联系人 13900139024',
          tagText: '服务端标签',
        }),
        expect.objectContaining({ name: '服务端新仓' }),
      ]),
      contacts: expect.arrayContaining([
        expect.objectContaining({
          id: 'contact-shared-conflict',
          name: '平台调度',
          roleText: '平台联系人',
          phoneText: '13900139025',
          noteText: '服务端联系人备注',
        }),
        expect.objectContaining({ name: '服务端调度' }),
      ]),
    });
    expect(retryBody.addresses).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ id: 'address-server-deleted' }),
      ]),
    );
    expect(retryBody.contacts).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ id: 'contact-server-deleted' }),
      ]),
    );
    expect(getProfileLocalState().syncState).toMatchObject({
      status: 'synced',
      operation: 'addressBook',
      platformUpdatedAtIso: '2026-07-03T08:35:00.000Z',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps platform profile address book conflict handling queued when auth token is missing', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-03T08:00:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-profile-address-book-conflict-missing-token',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.profile-address-book-conflict-missing-token.900',
          refreshToken:
            'refresh.profile-address-book-conflict-missing-token.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-profile-address-book-conflict-missing-token',
        addresses: [
          {
            id: 'address-platform-base',
            name: '服务端基线仓',
            address: '服务端基线地址',
            contactText: '服务端联系人 13900139020',
            tagText: '服务端',
          },
        ],
        contacts: [],
        updatedAtIso: '2026-07-03T08:20:00.000Z',
      }),
    )
    .mockImplementationOnce(async () => {
      clearAuthSession();

      return createPlatformApiErrorResponse(
        409,
        'PROFILE_ADDRESS_BOOK_CONFLICT',
        '常用地址/联系人已被其他设备更新，请先拉取最新地址簿后再保存。',
      );
    });
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
      await flushMicrotasks();
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-entry-addresses' }).props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'profile-address-name' })
        .props.onChangeText('本地冲突缺登录仓');
      app.root
        .findByProps({ testID: 'profile-address-detail' })
        .props.onChangeText('本地冲突缺登录地址');
      app.root
        .findByProps({ testID: 'profile-address-contact' })
        .props.onChangeText('本地联系人 13900139021');
      app.root
        .findByProps({ testID: 'profile-address-tag' })
        .props.onChangeText('冲突');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-address-submit' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
    });

    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/shipper/profile/address-book',
        method: 'PUT',
      }),
    ).toHaveLength(1);
    expect(getProfileLocalState().syncState).toMatchObject({
      status: 'failed',
      operation: 'addressBook',
      message: '平台地址簿冲突处理需要重新登录后再同步。',
      platformUpdatedAtIso: '2026-07-03T08:20:00.000Z',
    });
    expect(getProfileLocalState().syncState?.queueItems).toHaveLength(1);
    expect(getRenderedText(app)).toContain(
      '平台地址簿冲突处理需要重新登录后再同步。',
    );
    expect(getRenderedText(app)).not.toContain('服务端地址簿：');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('retries a failed profile address book sync through the platform api', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-profile-address-book-retry',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.profile-address-book-retry.900',
          refreshToken: 'refresh.profile-address-book-retry.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-profile-address-book-retry',
        addresses: [
          {
            id: 'address-local-3',
            name: '龙华临时仓',
            address: '龙华区临时中转仓',
            contactText: '吴主管 13900139001',
          },
        ],
        contacts: [],
        updatedAtIso: '2026-07-03T08:35:00.000Z',
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-03T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-entry-addresses' }).props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'profile-address-name' })
        .props.onChangeText('龙华临时仓');
      app.root
        .findByProps({ testID: 'profile-address-detail' })
        .props.onChangeText('龙华区临时中转仓');
      app.root
        .findByProps({ testID: 'profile-address-contact' })
        .props.onChangeText('吴主管 13900139001');
      app.root
        .findByProps({ testID: 'profile-address-tag' })
        .props.onChangeText('备用装货地');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-address-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getProfileLocalState().syncState?.status).toBe('failed');

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const saveCalls = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/profile/address-book',
      method: 'PUT',
    });

    expect(saveCalls).toHaveLength(2);
    expect(saveCalls[1]?.[1]).toEqual(
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.profile-address-book-retry.900',
        }),
        body: expect.stringContaining('龙华临时仓'),
      }),
    );
    expect(getProfileLocalState().syncState?.status).toBe('synced');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps platform profile address book retry queued when retrying has no auth token', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-03T08:00:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-profile-address-book-missing-token-retry',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.profile-address-book.missing-token-retry',
          refreshToken: 'refresh.profile-address-book.missing-token-retry',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-profile-address-book-missing-token-retry',
        addresses: [
          {
            id: 'address-local-retry-missing-token',
            name: '龙华临时仓',
            address: '龙华区临时中转仓',
            contactText: '吴主管 13900139001',
            tagText: '备用装货地',
          },
        ],
        contacts: [],
        updatedAtIso: '2026-07-03T08:30:00.000Z',
      }),
    );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
      await flushMicrotasks();
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-entry-addresses' }).props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'profile-address-name' })
        .props.onChangeText('龙华临时仓');
      app.root
        .findByProps({ testID: 'profile-address-detail' })
        .props.onChangeText('龙华区临时中转仓');
      app.root
        .findByProps({ testID: 'profile-address-contact' })
        .props.onChangeText('吴主管 13900139001');
      app.root
        .findByProps({ testID: 'profile-address-tag' })
        .props.onChangeText('备用装货地');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-address-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getProfileLocalState().syncState?.status).toBe('failed');

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
    });
    clearAuthSession();
    const putCallCountBeforeRetry = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/profile/address-book',
      method: 'PUT',
    }).length;

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/shipper/profile/address-book',
        method: 'PUT',
      }),
    ).toHaveLength(putCallCountBeforeRetry);
    expect(getProfileLocalState().syncState).toMatchObject({
      status: 'failed',
      operation: 'addressBook',
      message: '平台地址簿重试需要重新登录后再同步。',
    });
    expect(getRenderedText(app)).toContain(
      '平台地址簿重试需要重新登录后再同步。',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('logs out from local profile settings and returns to auth', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'setting-logout' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('账号验证');
  expect(renderedText).toContain('登录');
  expect(renderedText).toContain('注册');
  expect(renderedText).not.toContain('货运发单');
});

test('updates the local profile login password from settings', async () => {
  const now = 1000;
  const app = await renderApp(now);

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'setting-current-password' })
      .props.onChangeText('abc123');
    app.root
      .findByProps({ testID: 'setting-new-password' })
      .props.onChangeText('newpass1');
    app.root
      .findByProps({ testID: 'setting-confirm-password' })
      .props.onChangeText('newpass1');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'setting-password-submit' }).props.onPress();
  });

  const renderedText = getRenderedText(app);

  expect(renderedText).toContain('账号安全');
  expect(renderedText).toContain('登录密码已更新，当前为本地演示状态。');
  expect(renderedText).toContain('密码更新时间：刚刚');
  expect(getProfileLocalState().password).toMatchObject({
    savedPassword: 'newpass1',
    updatedAt: '刚刚',
    updatedAtIso: new Date(now).toISOString(),
  });
});

test('changes the platform login password from profile settings with bearer token', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-settings',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-settings-user.900',
          refreshToken: 'refresh.platform-settings-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        changed: true,
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'auth-login-phone' })
        .props.onChangeText('13800138000');
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'auth-login-code-send' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'auth-login-code' })
        .props.onChangeText('999999');
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'setting-current-password' })
        .props.onChangeText('abc123');
      app.root
        .findByProps({ testID: 'setting-new-password' })
        .props.onChangeText('newpass1');
      app.root
        .findByProps({ testID: 'setting-confirm-password' })
        .props.onChangeText('newpass1');
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'setting-password-submit' }).props.onPress();
      await flushMicrotasks();
    });

    const changePasswordCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/auth/change-password',
      method: 'POST',
    });
    expect(changePasswordCall).toBeDefined();
    expect(getFetchCallHeaders(changePasswordCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-settings-user.900',
      }),
    );
    expect(getFetchCallBody(changePasswordCall)).toMatchObject({
      currentPassword: 'abc123',
      newPassword: 'newpass1',
    });

    const renderedText = getRenderedText(app);

    expect(renderedText).toContain('登录密码已通过平台更新。');
    expect(renderedText).toContain('密码更新时间：刚刚');
    expect(getProfileLocalState().password).toMatchObject({
      savedPassword: 'newpass1',
      updatedAt: '刚刚',
      updatedAtIso: new Date(1000).toISOString(),
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not call platform password change when auth token is missing', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-settings-missing-token',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-settings-missing-token.900',
          refreshToken: 'refresh.platform-settings-missing-token.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        changed: true,
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'auth-login-phone' })
        .props.onChangeText('13800138000');
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'auth-login-code-send' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'auth-login-code' })
        .props.onChangeText('999999');
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
    });

    clearAuthSession();

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'setting-current-password' })
        .props.onChangeText('abc123');
      app.root
        .findByProps({ testID: 'setting-new-password' })
        .props.onChangeText('newpass1');
      app.root
        .findByProps({ testID: 'setting-confirm-password' })
        .props.onChangeText('newpass1');
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'setting-password-submit' }).props.onPress();
      await flushMicrotasks();
    });

    const renderedText = getRenderedText(app);

    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/auth/change-password',
        method: 'POST',
      }),
    ).toHaveLength(0);
    expect(renderedText).toContain(
      '平台登录已过期，请重新登录后再修改密码。',
    );
    expect(renderedText).not.toContain('登录密码已通过平台更新。');
    expect(getProfileLocalState().password?.savedPassword).toBe('abc123');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shows current password error when platform password change is rejected', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-settings-invalid',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-settings-invalid-user.900',
          refreshToken: 'refresh.platform-settings-invalid-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        code: 'AUTH_PASSWORD_INVALID',
        message: '当前密码错误',
        requestId: 'req_password_invalid',
        timestamp: '2026-06-26T00:00:00.000Z',
      }),
    });

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'auth-login-phone' })
        .props.onChangeText('13800138000');
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'auth-login-code-send' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'auth-login-code' })
        .props.onChangeText('999999');
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'setting-current-password' })
        .props.onChangeText('wrong123');
      app.root
        .findByProps({ testID: 'setting-new-password' })
        .props.onChangeText('newpass1');
      app.root
        .findByProps({ testID: 'setting-confirm-password' })
        .props.onChangeText('newpass1');
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'setting-password-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(app)).toContain('当前密码错误');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('syncs platform account snapshots without leaving profile sync pending', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(url);
    const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (requestUrl === 'http://localhost:3000/api/auth/send-code') {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (requestUrl === 'http://localhost:3000/api/auth/login') {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-account-sync',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-account-sync.900',
            refreshToken: 'refresh.platform-account-sync.900',
            expiresIn: 900,
          },
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/address-book' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/account' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          shipperId: 'user-platform-account-sync',
          displayName: '旧昵称',
          phone: '13800138000',
          phoneProtectionEnabled: true,
          loginProtectionEnabled: true,
          orderNotificationEnabled: true,
          promotionNotificationEnabled: false,
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/account' &&
      init?.method === 'PUT'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          shipperId: 'user-platform-account-sync',
          displayName: requestBody.displayName,
          phone: '13800138000',
          phoneProtectionEnabled: requestBody.phoneProtectionEnabled,
          loginProtectionEnabled: requestBody.loginProtectionEnabled,
          orderNotificationEnabled: requestBody.orderNotificationEnabled,
          promotionNotificationEnabled: requestBody.promotionNotificationEnabled,
        }),
      );
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'setting-display-name' })
        .props.onChangeText('平台昵称');
    });

    await ReactTestRenderer.act(async () => {
      await app.root.findByProps({ testID: 'setting-account-submit' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
    });

    const saveCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/profile/account',
      method: 'PUT',
    });
    expect(getFetchCallBody(saveCall)).toMatchObject({
      displayName: '平台昵称',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
    });
    expect(getProfileLocalState().account).toMatchObject({
      displayName: '平台昵称',
      boundPhone: '13800138000',
    });
    expect(getProfileLocalState().syncState?.status).toBe('synced');
    expect(getRenderedText(app)).toContain('资料同步：已同步');
    expect(getRenderedText(app)).not.toContain('资料同步：待同步');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not register the push token after platform login when order notifications are disabled locally', async () => {
  const originalFetch = globalThis.fetch;

  await setLocalOrderNotificationsEnabled(false);

  const fetchMock = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(url);
    const requestMethod = init?.method ?? 'GET';
    const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (requestUrl === 'http://localhost:3000/api/auth/send-code') {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (requestUrl === 'http://localhost:3000/api/auth/login') {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-login-push-disabled',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-login-push-disabled.900',
            refreshToken: 'refresh.platform-login-push-disabled.900',
            expiresIn: 900,
          },
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/me/device-tokens' &&
      requestMethod === 'GET'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          items: [
            {
              id: 'push-login-current-device',
              userId: 'user-platform-login-push-disabled',
              token: 'ExponentPushToken[current-login-disabled-token]',
              platform: Platform.OS === 'ios' ? 'ios' : 'android',
              deviceId: getDeviceId(),
              isActive: true,
              createdAtIso: '2026-07-24T07:00:00.000Z',
              updatedAtIso: '2026-07-24T07:30:00.000Z',
            },
          ],
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/me/device-tokens/deactivate' &&
      requestMethod === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          deactivated:
            requestBody?.token ===
            'ExponentPushToken[current-login-disabled-token]',
        }),
      );
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
      await flushMacrotask();
      await flushMicrotasks();
    });

    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/me/device-token',
        method: 'POST',
      }),
    ).toHaveLength(0);
    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/me/device-tokens',
        method: 'GET',
      }),
    ).toHaveLength(1);
    expect(
      getFetchCallBody<{
        token: string;
      }>(
        findFetchCall(fetchMock, {
          url: 'http://localhost:3000/api/me/device-tokens/deactivate',
          method: 'POST',
        }),
      ),
    ).toEqual({
      token: 'ExponentPushToken[current-login-disabled-token]',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps a failed platform account snapshot queued locally and retries it successfully', async () => {
  const originalFetch = globalThis.fetch;
  let accountSaveAttempts = 0;
  const fetchMock = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(url);
    const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (requestUrl === 'http://localhost:3000/api/auth/send-code') {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (requestUrl === 'http://localhost:3000/api/auth/login') {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-account-retry',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-account-retry.900',
            refreshToken: 'refresh.platform-account-retry.900',
            expiresIn: 900,
          },
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/address-book' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/account' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          shipperId: 'user-platform-account-retry',
          displayName: '旧昵称',
          phone: '13800138000',
          phoneProtectionEnabled: true,
          loginProtectionEnabled: true,
          orderNotificationEnabled: true,
          promotionNotificationEnabled: false,
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/account' &&
      init?.method === 'PUT'
    ) {
      accountSaveAttempts += 1;

      if (accountSaveAttempts === 1) {
        return Promise.reject(new Error('NETWORK_ERROR'));
      }

      return Promise.resolve(
        createPlatformApiResponse({
          shipperId: 'user-platform-account-retry',
          displayName: requestBody.displayName,
          phone: requestBody.phone,
          phoneProtectionEnabled: requestBody.phoneProtectionEnabled,
          loginProtectionEnabled: requestBody.loginProtectionEnabled,
          orderNotificationEnabled: requestBody.orderNotificationEnabled,
          promotionNotificationEnabled: requestBody.promotionNotificationEnabled,
        }),
      );
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'setting-display-name' })
        .props.onChangeText('失败后重试昵称');
      app.root
        .findByProps({ testID: 'setting-bound-phone' })
        .props.onChangeText('13900139999');
    });

    await ReactTestRenderer.act(async () => {
      await app.root.findByProps({ testID: 'setting-account-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getProfileLocalState().account).toMatchObject({
      displayName: '失败后重试昵称',
      boundPhone: '13900139999',
    });
    expect(getProfileLocalState().syncState).toMatchObject({
      status: 'failed',
      operation: 'accountProfile',
      message: '网络连接不可用，请检查网络后重试',
      queueItems: [
        expect.objectContaining({
          titleText: '账号资料与设置',
          statusText: '同步失败',
          noteText:
            '账号资料与设置同步未完成，已保留本地修改，请返回个人中心重试。',
        }),
      ],
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
    });

    expect(getRenderedText(app)).toContain('资料同步：同步失败');
    expect(getRenderedText(app)).toContain('账号资料与设置：同步失败');

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const saveCalls = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/profile/account',
      method: 'PUT',
    });
    expect(saveCalls).toHaveLength(2);
    expect(getFetchCallBody(saveCalls[1])).toMatchObject({
      displayName: '失败后重试昵称',
      phone: '13900139999',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
    });
    expect(getProfileLocalState().account).toMatchObject({
      displayName: '失败后重试昵称',
      boundPhone: '13900139999',
    });
    expect(getProfileLocalState().syncState).toMatchObject({
      status: 'synced',
      operation: 'accountProfile',
      message: '账号资料与设置快照已同步到平台。',
      queueItems: [],
    });
    expect(getRenderedText(app)).toContain('资料同步：已同步');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not overwrite a failed local account snapshot when reopening profile settings', async () => {
  const originalFetch = globalThis.fetch;
  const now = 1000;
  const queuedProfileState = {
    ...getProfileLocalState(),
    account: {
      displayName: '本地待重试昵称',
      boundPhone: '13900139999',
      avatarPhotoCount: 0,
    },
    syncState: createFailedProfileSyncState(
      '网络连接不可用，请检查网络后重试',
      now,
      'accountProfile',
    ),
  };
  await AsyncStorage.setItem(
    '@vireCodeing/profile-local-state',
    JSON.stringify({
      version: 1,
      state: queuedProfileState,
    }),
  );
  saveProfileLocalState(queuedProfileState);

  const fetchMock = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(url);

    if (requestUrl === 'http://localhost:3000/api/auth/send-code') {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (requestUrl === 'http://localhost:3000/api/auth/login') {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-account-skip-load',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-account-skip-load.900',
            refreshToken: 'refresh.platform-account-skip-load.900',
            expiresIn: 900,
          },
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/address-book' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/shipper/profile/account',
        method: 'GET',
      }),
    ).toHaveLength(0);
    expect(getRenderedText(app)).toContain('昵称：本地待重试昵称');
    expect(getRenderedText(app)).toContain('绑定手机号：13900139999');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('syncs platform settings toggles and privacy confirmation through the account snapshot api', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(url);
    const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (requestUrl === 'http://localhost:3000/api/auth/send-code') {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (requestUrl === 'http://localhost:3000/api/auth/login') {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-settings-snapshot',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-settings-snapshot.900',
            refreshToken: 'refresh.platform-settings-snapshot.900',
            expiresIn: 900,
          },
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/address-book' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/account' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          shipperId: 'user-platform-settings-snapshot',
          displayName: '平台昵称',
          phone: '13800138000',
          phoneProtectionEnabled: true,
          loginProtectionEnabled: true,
          orderNotificationEnabled: true,
          promotionNotificationEnabled: false,
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/account' &&
      init?.method === 'PUT'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          shipperId: 'user-platform-settings-snapshot',
          displayName: requestBody.displayName,
          phone: '13800138000',
          phoneProtectionEnabled: requestBody.phoneProtectionEnabled,
          loginProtectionEnabled: requestBody.loginProtectionEnabled,
          orderNotificationEnabled: requestBody.orderNotificationEnabled,
          promotionNotificationEnabled: requestBody.promotionNotificationEnabled,
          ...(requestBody.privacyConfirmedAtIso
            ? { privacyConfirmedAtIso: requestBody.privacyConfirmedAtIso }
            : {}),
          ...(requestBody.privacyPolicyVersion
            ? { privacyPolicyVersion: requestBody.privacyPolicyVersion }
            : {}),
          ...(requestBody.privacyPolicyVersionTitle
            ? {
                privacyPolicyVersionTitle:
                  requestBody.privacyPolicyVersionTitle,
              }
            : {}),
        }),
      );
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      await app.root
        .findByProps({ testID: 'setting-toggle-setting-promotion' })
        .props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'setting-open-privacy' }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      await app.root.findByProps({ testID: 'privacy-policy-confirm' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
    });

    const saveCalls = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/profile/account',
      method: 'PUT',
    });
    expect(saveCalls).toHaveLength(2);
    expect(getFetchCallBody(saveCalls[0])).toMatchObject({
      displayName: '平台昵称',
      promotionNotificationEnabled: true,
    });
    expect(getFetchCallBody(saveCalls[1])).toMatchObject({
      displayName: '平台昵称',
      promotionNotificationEnabled: true,
      privacyConfirmedAtIso: new Date(1000).toISOString(),
      privacyPolicyVersion: privacyPolicyDocumentInfo.version,
      privacyPolicyVersionTitle: privacyPolicyDocumentInfo.versionTitle,
    });
    expect(getProfileLocalState().settings.find(
      setting => setting.id === 'setting-promotion',
    )).toMatchObject({
      statusText: '已开启',
    });
    expect(getProfileLocalState().settings.find(
      setting => setting.id === 'setting-privacy',
    )).toMatchObject({
      statusText: '已确认',
      confirmedAtIso: new Date(1000).toISOString(),
      confirmedVersionId: privacyPolicyDocumentInfo.version,
      confirmedVersionTitle: privacyPolicyDocumentInfo.versionTitle,
    });
    expect(getProfileLocalState().syncState?.status).toBe('synced');
    expect(getRenderedText(app)).toContain('资料同步：已同步');
    expect(getRenderedText(app)).toContain('同步说明：隐私确认快照已同步到平台。');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('deactivates current-device push tokens when platform order notifications are turned off and re-registers them when turned back on', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(url);
    const requestMethod = init?.method ?? 'GET';
    const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (requestUrl === 'http://localhost:3000/api/auth/send-code') {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (requestUrl === 'http://localhost:3000/api/auth/login') {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-order-notification-toggle',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-order-notification-toggle.900',
            refreshToken: 'refresh.platform-order-notification-toggle.900',
            expiresIn: 900,
          },
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/address-book' &&
      requestMethod === 'GET'
    ) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/account' &&
      requestMethod === 'GET'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          shipperId: 'user-platform-order-notification-toggle',
          displayName: '平台昵称',
          phone: '13800138000',
          phoneProtectionEnabled: true,
          loginProtectionEnabled: true,
          orderNotificationEnabled: true,
          promotionNotificationEnabled: false,
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/shipper/profile/account' &&
      requestMethod === 'PUT'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          shipperId: 'user-platform-order-notification-toggle',
          displayName: requestBody.displayName,
          phone: '13800138000',
          phoneProtectionEnabled: requestBody.phoneProtectionEnabled,
          loginProtectionEnabled: requestBody.loginProtectionEnabled,
          orderNotificationEnabled: requestBody.orderNotificationEnabled,
          promotionNotificationEnabled: requestBody.promotionNotificationEnabled,
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/me/device-token' &&
      requestMethod === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'push-current-device',
          userId: 'user-platform-order-notification-toggle',
          token: requestBody.pushToken,
          platform: requestBody.platform,
          deviceId: requestBody.deviceId,
          isActive: true,
          createdAtIso: '2026-07-24T08:00:00.000Z',
          updatedAtIso: '2026-07-24T08:00:00.000Z',
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/me/device-tokens' &&
      requestMethod === 'GET'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          items: [
            {
              id: 'push-current-device',
              userId: 'user-platform-order-notification-toggle',
              token: 'ExponentPushToken[current-toggle-token]',
              platform: Platform.OS === 'ios' ? 'ios' : 'android',
              deviceId: getDeviceId(),
              isActive: true,
              createdAtIso: '2026-07-24T08:00:00.000Z',
              updatedAtIso: '2026-07-24T08:10:00.000Z',
            },
            {
              id: 'push-other-device',
              userId: 'user-platform-order-notification-toggle',
              token: 'ExponentPushToken[other-toggle-token]',
              platform: Platform.OS === 'ios' ? 'ios' : 'android',
              deviceId: 'mobile-device-other',
              isActive: true,
              createdAtIso: '2026-07-24T07:00:00.000Z',
              updatedAtIso: '2026-07-24T07:10:00.000Z',
            },
          ],
        }),
      );
    }

    if (
      requestUrl === 'http://localhost:3000/api/me/device-tokens/deactivate' &&
      requestMethod === 'POST'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          deactivated:
            requestBody?.token === 'ExponentPushToken[current-toggle-token]',
        }),
      );
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
      await flushMacrotask();
      await flushMicrotasks();
    });

    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/me/device-token',
        method: 'POST',
      }),
    ).toHaveLength(0);

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      await app.root
        .findByProps({ testID: 'setting-toggle-setting-notification' })
        .props.onPress();
      await flushMicrotasks();
      await flushMacrotask();
      await flushMicrotasks();
    });

    const saveCallsAfterDisable = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/profile/account',
      method: 'PUT',
    });
    expect(saveCallsAfterDisable).toHaveLength(1);
    expect(getFetchCallBody(saveCallsAfterDisable[0])).toMatchObject({
      orderNotificationEnabled: false,
    });
    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/me/device-tokens',
        method: 'GET',
      }),
    ).toHaveLength(1);
    expect(
      getFetchCallBody<{
        token: string;
      }>(
        findFetchCall(fetchMock, {
          url: 'http://localhost:3000/api/me/device-tokens/deactivate',
          method: 'POST',
        }),
      ),
    ).toEqual({
      token: 'ExponentPushToken[current-toggle-token]',
    });
    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/me/device-token',
        method: 'POST',
      }),
    ).toHaveLength(0);

    await ReactTestRenderer.act(async () => {
      await app.root
        .findByProps({ testID: 'setting-toggle-setting-notification' })
        .props.onPress();
      await flushMicrotasks();
      await flushMacrotask();
      await flushMicrotasks();
    });

    const saveCallsAfterEnable = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/profile/account',
      method: 'PUT',
    });
    expect(saveCallsAfterEnable).toHaveLength(2);
    expect(getFetchCallBody(saveCallsAfterEnable[1])).toMatchObject({
      orderNotificationEnabled: true,
    });
    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/me/device-token',
        method: 'POST',
      }),
    ).toHaveLength(1);
    expect(
      getFetchCallBody<{
        pushToken: string;
        deviceId: string;
      }>(
        findLastFetchCall(fetchMock, {
          url: 'http://localhost:3000/api/me/device-token',
          method: 'POST',
        }),
      ),
    ).toMatchObject({
      pushToken: 'ExponentPushToken[mock-token]',
      deviceId: getDeviceId(),
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('persists published local orders to device storage', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
  });

  fillDigitalDraft(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
  });

  const runtimeState = getAppRuntimeState();

  expect(runtimeState.orders[0].from).toBe('宝安临时仓');
  expect(runtimeState.orders[0].to).toBe('南山门店新址');
  expect(runtimeState.orders[0].cargoType).toBe('数码');

  await flushMicrotasks();

  const storedState = await getStoredSnapshot<{
    state: {
      orders: Array<{
        from: string;
        to: string;
        cargoType: string;
        priceText: string;
      }>;
    };
  }>('@vireCodeing/app-runtime-state');

  expect(storedState.state.orders[0]).toMatchObject({
    from: '宝安临时仓',
    to: '南山门店新址',
    cargoType: '数码',
    priceText: '￥760',
  });
});

test('syncs local draft changes to the platform order draft api', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-02T08:30:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-user.900',
          refreshToken: 'refresh.platform-draft-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValue(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft',
        draftSnapshot: {
          pickupAddress: '宝安平台草稿仓',
        },
        clientUpdatedAtIso: new Date(now).toISOString(),
        updatedAtIso: '2026-07-02T08:30:01.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'draft-pickup-address' })
        .props.onChangeText('宝安平台草稿仓');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-save' }).props.onPress();
      await flushMicrotasks();
    });

    const draftCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/order-draft',
      method: 'PUT',
    });
    expect(draftCall).toBeDefined();
    expect(getFetchCallHeaders(draftCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-draft-user.900',
      }),
    );
    expect(getFetchCallBody(draftCall)).toMatchObject({
      draftSnapshot: {
        pickupAddress: '宝安平台草稿仓',
      },
      clientUpdatedAtIso: new Date(now).toISOString(),
      baseUpdatedAtIso: '2026-07-02T08:30:01.000Z',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps platform draft save queued when saving has no auth token', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-02T08:30:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft-save-missing-auth',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-save-missing-auth.900',
          refreshToken: 'refresh.platform-draft-save-missing-auth.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null));

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });

    const draftLoadCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/order-draft',
      method: 'GET',
    });
    expect(draftLoadCall).toBeDefined();

    clearAuthSession();

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'draft-pickup-address' })
        .props.onChangeText('宝安缺登录草稿仓');
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-save' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/shipper/order-draft',
        method: 'PUT',
      }),
    ).toHaveLength(0);
    expect(getDraftStorageSnapshot()?.syncState).toMatchObject({
      status: 'failed',
      message: '平台发单草稿保存需要重新登录后再同步。',
    });
    expect(getDraftStorageSnapshot()?.syncState?.queueItems).toHaveLength(1);
    expect(getRenderedText(app)).toContain(
      '平台发单草稿保存需要重新登录后再同步。',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loads the latest platform draft and shows a conflict when saving a stale draft', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-02T08:30:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft-save-conflict',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-save-conflict-user.900',
          refreshToken: 'refresh.platform-draft-save-conflict-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-save-conflict',
        draftSnapshot: {
          pickupAddress: '服务端基线草稿仓',
          deliveryAddress: '服务端基线门店',
          weightText: '2.1 吨',
        },
        clientUpdatedAtIso: '2026-07-02T08:29:00.000Z',
        updatedAtIso: '2026-07-02T08:30:01.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiErrorResponse(
        409,
        'ORDER_DRAFT_CONFLICT',
        '发单草稿已被其他设备更新，请先拉取最新草稿后再保存。',
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-save-conflict',
        draftSnapshot: {
          pickupAddress: '另一设备新草稿仓',
          deliveryAddress: '另一设备新门店',
          weightText: '2.9 吨',
        },
        clientUpdatedAtIso: '2026-07-02T08:31:00.000Z',
        updatedAtIso: '2026-07-02T08:32:00.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'draft-pickup-address' })
        .props.onChangeText('本地保存冲突仓');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-save' }).props.onPress();
      await flushMicrotasks();
      await flushMicrotasks();
    });

    expect(
      app.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
    ).toBe('本地保存冲突仓');
    const draftSaveCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/order-draft',
      method: 'PUT',
    });
    expect(draftSaveCall).toBeDefined();
    expect(getFetchCallBody(draftSaveCall)).toMatchObject({
      baseUpdatedAtIso: '2026-07-02T08:30:01.000Z',
    });
    const draftLoadCalls = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/order-draft',
      method: 'GET',
    });
    expect(draftLoadCalls.length).toBeGreaterThanOrEqual(2);
    expect(getFetchCallHeaders(draftLoadCalls[draftLoadCalls.length - 1])).toEqual(
      expect.objectContaining({
        Authorization:
          'Bearer access.platform-draft-save-conflict-user.900',
      }),
    );
    expect(getRenderedText(app)).toContain(
      '服务端草稿已被其他设备更新，已保留本地草稿，请处理冲突。',
    );
    expect(getRenderedText(app)).toContain('装货地址');
    expect(getRenderedText(app)).toContain('本地：本地保存冲突仓');
    expect(getRenderedText(app)).toContain('服务端：另一设备新草稿仓');
    expect(
      app.root.findAllByProps({
        testID: 'draft-use-platform-field-pickupAddress',
      }).length,
    ).toBeGreaterThan(0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps platform draft conflict handling queued when auth token is missing', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-02T08:30:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft-conflict-missing-auth',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-conflict-missing-auth.900',
          refreshToken: 'refresh.platform-draft-conflict-missing-auth.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-conflict-missing-auth',
        draftSnapshot: {
          pickupAddress: '服务端基线草稿仓',
          deliveryAddress: '服务端基线门店',
          weightText: '2.1 吨',
        },
        clientUpdatedAtIso: '2026-07-02T08:29:00.000Z',
        updatedAtIso: '2026-07-02T08:30:01.000Z',
      }),
    )
    .mockImplementationOnce(async () => {
      clearAuthSession();

      return createPlatformApiErrorResponse(
        409,
        'ORDER_DRAFT_CONFLICT',
        '发单草稿已被其他设备更新，请先拉取最新草稿后再保存。',
      );
    });

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'draft-pickup-address' })
        .props.onChangeText('本地冲突缺登录草稿仓');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-save' }).props.onPress();
      await flushMicrotasks();
      await flushMicrotasks();
    });

    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/shipper/order-draft',
        method: 'GET',
      }),
    ).toHaveLength(1);
    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/shipper/order-draft',
        method: 'PUT',
      }),
    ).toHaveLength(1);
    expect(getDraftStorageSnapshot()?.syncState).toMatchObject({
      status: 'failed',
      message: '平台发单草稿冲突处理需要重新登录后再同步。',
      platformUpdatedAtIso: '2026-07-02T08:30:01.000Z',
    });
    expect(getDraftStorageSnapshot()?.syncState?.queueItems).toHaveLength(1);
    expect(getRenderedText(app)).toContain(
      '平台发单草稿冲突处理需要重新登录后再同步。',
    );
    expect(getRenderedText(app)).not.toContain(
      '服务端草稿已被其他设备更新，已保留本地草稿，请处理冲突。',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('retries a failed local draft sync through the platform order draft api', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-02T08:30:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft-retry',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-retry-user.900',
          refreshToken: 'refresh.platform-draft-retry-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-retry',
        draftSnapshot: {
          pickupAddress: '宝安重试草稿仓',
        },
        clientUpdatedAtIso: new Date(now).toISOString(),
        updatedAtIso: '2026-07-02T08:30:02.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'draft-pickup-address' })
        .props.onChangeText('宝安重试草稿仓');
      await flushMicrotasks();
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-sync-mark-failed' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const retryDraftCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/order-draft',
      method: 'PUT',
    });
    expect(retryDraftCall).toBeDefined();
    expect(getFetchCallHeaders(retryDraftCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-draft-retry-user.900',
      }),
    );
    expect(getFetchCallBody(retryDraftCall)).toMatchObject({
      draftSnapshot: {
        pickupAddress: '宝安重试草稿仓',
      },
      clientUpdatedAtIso: new Date(now).toISOString(),
    });
    expect(getDraftStorageSnapshot()?.syncState?.status).toBe('synced');
    expect(getDraftStorageSnapshot()?.syncState?.updatedAtIso).toBe(
      '2026-07-02T08:30:02.000Z',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps platform draft retry queued when retry has no auth token', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-02T08:30:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft-retry-missing-auth',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-retry-missing-auth.900',
          refreshToken: 'refresh.platform-draft-retry-missing-auth.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null));

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'draft-pickup-address' })
        .props.onChangeText('宝安重试缺登录草稿仓');
      await flushMicrotasks();
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-sync-mark-failed' }).props.onPress();
    });

    clearAuthSession();

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/shipper/order-draft',
        method: 'PUT',
      }),
    ).toHaveLength(0);
    expect(getDraftStorageSnapshot()?.syncState).toMatchObject({
      status: 'failed',
      message: '平台发单草稿重试需要重新登录后再同步。',
    });
    expect(getDraftStorageSnapshot()?.syncState?.queueItems).toHaveLength(1);
    expect(getRenderedText(app)).toContain(
      '平台发单草稿重试需要重新登录后再同步。',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps platform draft restore queued when opening draft has no auth token', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-02T08:30:00.000Z').getTime();
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft-restore-missing-auth',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-restore-missing-auth.900',
          refreshToken: 'refresh.platform-draft-restore-missing-auth.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null));

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'draft-pickup-address' })
        .props.onChangeText('宝安恢复缺登录草稿仓');
      await flushMicrotasks();
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-back' }).props.onPress();
    });

    clearAuthSession();

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/shipper/order-draft',
        method: 'GET',
      }),
    ).toHaveLength(1);
    expect(
      app.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
    ).toBe('宝安恢复缺登录草稿仓');
    expect(getDraftStorageSnapshot()?.syncState).toMatchObject({
      status: 'failed',
      message: '平台发单草稿恢复需要重新登录后再同步。',
    });
    expect(getDraftStorageSnapshot()?.syncState?.queueItems).toHaveLength(1);
    expect(getRenderedText(app)).toContain(
      '平台发单草稿恢复需要重新登录后再同步。',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps platform draft restore queued when opening draft load fails', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-02T08:30:00.000Z').getTime();
  await AsyncStorage.setItem(
    '@vireCodeing/draft-storage',
    JSON.stringify({
      version: 1,
      savedAt: new Date('2026-07-02T08:20:00.000Z').getTime(),
      draft: {
        cargoType: 'digital',
        weightText: '2.8 吨',
        volumeText: '',
        quantityText: '28 箱',
        cargoDescription: '',
        cargoPhotoCount: 0,
        pickupAddress: '宝安恢复失败草稿仓',
        pickupNoteText: '',
        pickupContact: '赵经理',
        pickupPhone: '13800138001',
        deliveryAddress: '南山恢复失败门店',
        deliveryNoteText: '',
        deliveryContact: '钱店长',
        deliveryPhone: '13800138002',
        vehicleRequirement: 'medium',
        vehicleLengthRequirement: 'unlimited',
        needTailboard: false,
        needTarp: false,
        pickupTimeText: '明天 10:30',
        expectedDeliveryTimeText: '',
        valueAddedServiceIds: [],
        loadingWorkerCount: 1,
        insuredValueText: '',
        pricingMode: 'fixed',
        priceText: '880',
        paymentMethod: 'cod',
      },
      syncState: {
        status: 'synced',
        message: '本地发单草稿已同步。',
        updatedAtText: '刚刚',
        updatedAtIso: '2026-07-02T08:20:00.000Z',
        platformUpdatedAtIso: '2026-07-02T08:10:00.000Z',
        queueItems: [],
      },
    }),
  );
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft-restore-load-failure',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-restore-load-failure.900',
          refreshToken: 'refresh.platform-draft-restore-load-failure.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'));

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });

    const draftLoadCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/order-draft',
      method: 'GET',
    });
    expect(draftLoadCall).toBeDefined();
    expect(getFetchCallHeaders(draftLoadCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-draft-restore-load-failure.900',
      }),
    );
    expect(
      app.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
    ).toBe('宝安恢复失败草稿仓');
    expect(
      app.root.findByProps({ testID: 'draft-delivery-address' }).props.value,
    ).toBe('南山恢复失败门店');
    expect(getDraftStorageSnapshot()?.syncState).toMatchObject({
      status: 'failed',
      message: '平台发单草稿恢复失败，已保留本地草稿。',
      platformUpdatedAtIso: '2026-07-02T08:10:00.000Z',
    });
    expect(getDraftStorageSnapshot()?.syncState?.queueItems).toHaveLength(1);
    expect(getRenderedText(app)).toContain(
      '平台发单草稿恢复失败，已保留本地草稿。',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('restores the current platform order draft when opening the draft screen', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft-restore',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-restore-user.900',
          refreshToken: 'refresh.platform-draft-restore-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-restore',
        draftSnapshot: {
          cargoType: 'digital',
          pickupAddress: '宝安服务端草稿仓',
          pickupContact: '赵经理',
          pickupPhone: '13800138001',
          deliveryAddress: '南山服务端门店',
          deliveryContact: '钱店长',
          deliveryPhone: '13800138002',
          weightText: '2.6 吨',
          quantityText: '26 箱',
          vehicleRequirement: 'medium',
          pickupTimeText: '明天 10:30',
          priceText: '860',
        },
        clientUpdatedAtIso: '2026-07-02T08:20:00.000Z',
        updatedAtIso: '2026-07-02T08:21:00.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-02T08:30:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });

    const draftLoadCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/order-draft',
      method: 'GET',
    });
    expect(draftLoadCall).toBeDefined();
    expect(getFetchCallHeaders(draftLoadCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-draft-restore-user.900',
      }),
    );
    expect(
      app.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
    ).toBe('宝安服务端草稿仓');
    expect(
      app.root.findByProps({ testID: 'draft-delivery-address' }).props.value,
    ).toBe('南山服务端门店');
    expect(app.root.findByProps({ testID: 'draft-weight' }).props.value).toBe(
      '2.6 吨',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps the newer local draft and shows a conflict notice when the platform draft is older', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-02T08:30:00.000Z').getTime();

  await AsyncStorage.setItem(
    '@vireCodeing/draft-storage',
    JSON.stringify({
      version: 1,
      savedAt: now,
      draft: {
        pickupAddress: '本地较新草稿仓',
        deliveryAddress: '本地较新门店',
        weightText: '3.2 吨',
      },
      syncState: {
        status: 'pending',
        message: '本地草稿较新，等待同步。',
        updatedAtText: '刚刚',
        updatedAtIso: '2026-07-02T08:30:00.000Z',
        queueItems: [],
      },
    }),
  );

  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft-conflict',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-conflict-user.900',
          refreshToken: 'refresh.platform-draft-conflict-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-conflict',
        draftSnapshot: {
          pickupAddress: '服务端旧草稿仓',
          deliveryAddress: '服务端旧门店',
          weightText: '1.1 吨',
        },
        clientUpdatedAtIso: '2026-07-02T08:19:00.000Z',
        updatedAtIso: '2026-07-02T08:20:00.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      app.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
    ).toBe('本地较新草稿仓');
    expect(getRenderedText(app)).toContain(
      '已保留本地较新的发单草稿，服务端草稿未覆盖。',
    );

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-use-platform-draft' }).props.onPress();
    });

    expect(
      app.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
    ).toBe('服务端旧草稿仓');
    expect(
      app.root.findByProps({ testID: 'draft-delivery-address' }).props.value,
    ).toBe('服务端旧门店');
    expect(app.root.findByProps({ testID: 'draft-weight' }).props.value).toBe(
      '1.1 吨',
    );
    expect(getRenderedText(app)).toContain('已切换为服务端发单草稿。');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps the newer local draft and syncs it over the older platform draft on conflict', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-02T08:30:00.000Z').getTime();

  await AsyncStorage.setItem(
    '@vireCodeing/draft-storage',
    JSON.stringify({
      version: 1,
      savedAt: now,
      draft: {
        pickupAddress: '本地覆盖草稿仓',
        deliveryAddress: '本地覆盖门店',
        weightText: '4.5 吨',
      },
      syncState: {
        status: 'pending',
        message: '本地草稿较新，等待同步。',
        updatedAtText: '刚刚',
        updatedAtIso: '2026-07-02T08:30:00.000Z',
        queueItems: [],
      },
    }),
  );

  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft-keep-local',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-keep-local-user.900',
          refreshToken: 'refresh.platform-draft-keep-local-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-keep-local',
        draftSnapshot: {
          pickupAddress: '服务端待覆盖旧仓',
          deliveryAddress: '服务端待覆盖旧门店',
          weightText: '0.9 吨',
        },
        clientUpdatedAtIso: '2026-07-02T08:19:00.000Z',
        updatedAtIso: '2026-07-02T08:20:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-keep-local',
        draftSnapshot: {
          pickupAddress: '本地覆盖草稿仓',
          deliveryAddress: '本地覆盖门店',
          weightText: '4.5 吨',
        },
        clientUpdatedAtIso: '2026-07-02T08:30:00.000Z',
        updatedAtIso: '2026-07-02T08:31:00.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-keep-local-draft' }).props.onPress();
      await flushMicrotasks();
    });

    const keepLocalDraftCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/order-draft',
      method: 'PUT',
    });
    expect(keepLocalDraftCall).toBeDefined();
    expect(getFetchCallHeaders(keepLocalDraftCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-draft-keep-local-user.900',
      }),
    );
    expect(getFetchCallBody(keepLocalDraftCall)).toMatchObject({
      draftSnapshot: {
        pickupAddress: '本地覆盖草稿仓',
        deliveryAddress: '本地覆盖门店',
        weightText: '4.5 吨',
      },
      clientUpdatedAtIso: '2026-07-02T08:30:00.000Z',
    });
    expect(getRenderedText(app)).toContain(
      '已保留本地发单草稿并同步到服务端。',
    );
    expect(getDraftStorageSnapshot()?.syncState).toMatchObject({
      status: 'synced',
      message: '平台发单草稿已同步。',
      updatedAtIso: '2026-07-02T08:31:00.000Z',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('merges missing local draft fields from an older platform draft without replacing local values', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-02T08:30:00.000Z').getTime();

  await AsyncStorage.setItem(
    '@vireCodeing/draft-storage',
    JSON.stringify({
      version: 1,
      savedAt: now,
      draft: {
        pickupAddress: '本地保留装货仓',
        deliveryAddress: '',
        weightText: '5.2 吨',
        quantityText: '',
        pickupContact: '',
        pickupPhone: '',
      },
      syncState: {
        status: 'pending',
        message: '本地草稿较新，等待同步。',
        updatedAtText: '刚刚',
        updatedAtIso: '2026-07-02T08:30:00.000Z',
        queueItems: [],
      },
    }),
  );

  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft-merge',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-merge-user.900',
          refreshToken: 'refresh.platform-draft-merge-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-merge',
        draftSnapshot: {
          pickupAddress: '服务端旧装货仓',
          deliveryAddress: '服务端补全卸货门店',
          weightText: '1.1 吨',
          quantityText: '16 箱',
          pickupContact: '服务端赵经理',
          pickupPhone: '13800138001',
        },
        clientUpdatedAtIso: '2026-07-02T08:19:00.000Z',
        updatedAtIso: '2026-07-02T08:20:00.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-merge-platform-draft' }).props.onPress();
    });

    expect(
      app.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
    ).toBe('本地保留装货仓');
    expect(app.root.findByProps({ testID: 'draft-weight' }).props.value).toBe(
      '5.2 吨',
    );
    expect(
      app.root.findByProps({ testID: 'draft-delivery-address' }).props.value,
    ).toBe('服务端补全卸货门店');
    expect(app.root.findByProps({ testID: 'draft-quantity' }).props.value).toBe(
      '16 箱',
    );
    expect(
      app.root.findByProps({ testID: 'draft-pickup-contact' }).props.value,
    ).toBe('服务端赵经理');
    expect(
      app.root.findByProps({ testID: 'draft-pickup-phone' }).props.value,
    ).toBe('13800138001');
    expect(getRenderedText(app)).toContain(
      '已合并服务端草稿缺失字段，请确认后保存。',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shows draft conflict field differences and applies one platform field without replacing others', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-02T08:30:00.000Z').getTime();

  await AsyncStorage.setItem(
    '@vireCodeing/draft-storage',
    JSON.stringify({
      version: 1,
      savedAt: now,
      draft: {
        pickupAddress: '本地装货仓 A',
        deliveryAddress: '本地卸货门店 A',
        weightText: '6.6 吨',
      },
      syncState: {
        status: 'pending',
        message: '本地草稿较新，等待同步。',
        updatedAtText: '刚刚',
        updatedAtIso: '2026-07-02T08:30:00.000Z',
        queueItems: [],
      },
    }),
  );

  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft-field-diff',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-field-diff-user.900',
          refreshToken: 'refresh.platform-draft-field-diff-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-field-diff',
        draftSnapshot: {
          pickupAddress: '服务端装货仓 B',
          deliveryAddress: '服务端卸货门店 B',
          weightText: '2.2 吨',
        },
        clientUpdatedAtIso: '2026-07-02T08:19:00.000Z',
        updatedAtIso: '2026-07-02T08:20:00.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(app)).toContain('装货地址');
    expect(getRenderedText(app)).toContain('本地：本地装货仓 A');
    expect(getRenderedText(app)).toContain('服务端：服务端装货仓 B');

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'draft-use-platform-field-pickupAddress' })
        .props.onPress();
    });

    expect(
      app.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
    ).toBe('服务端装货仓 B');
    expect(
      app.root.findByProps({ testID: 'draft-delivery-address' }).props.value,
    ).toBe('本地卸货门店 A');
    expect(app.root.findByProps({ testID: 'draft-weight' }).props.value).toBe(
      '6.6 吨',
    );
    expect(getRenderedText(app)).toContain(
      '已采用服务端草稿字段：装货地址。',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shows draft conflict boolean differences and applies one platform field without replacing others', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-02T08:30:00.000Z').getTime();

  await AsyncStorage.setItem(
    '@vireCodeing/draft-storage',
    JSON.stringify({
      version: 1,
      savedAt: now,
      draft: {
        pickupAddress: '本地尾板装货仓',
        deliveryAddress: '本地尾板卸货门店',
        weightText: '7.7 吨',
        needTailboard: false,
        needTarp: false,
      },
      syncState: {
        status: 'pending',
        message: '本地草稿较新，等待同步。',
        updatedAtText: '刚刚',
        updatedAtIso: '2026-07-02T08:30:00.000Z',
        queueItems: [],
      },
    }),
  );

  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft-boolean-field-diff',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-boolean-field-diff-user.900',
          refreshToken: 'refresh.platform-draft-boolean-field-diff-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-boolean-field-diff',
        draftSnapshot: {
          pickupAddress: '服务端尾板装货仓',
          deliveryAddress: '服务端尾板卸货门店',
          weightText: '1.2 吨',
          needTailboard: true,
          needTarp: false,
        },
        clientUpdatedAtIso: '2026-07-02T08:19:00.000Z',
        updatedAtIso: '2026-07-02T08:20:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-boolean-field-diff',
        draftSnapshot: {
          pickupAddress: '本地尾板装货仓',
          deliveryAddress: '本地尾板卸货门店',
          weightText: '7.7 吨',
          needTailboard: true,
          needTarp: false,
        },
        clientUpdatedAtIso: '2026-07-02T08:30:00.000Z',
        updatedAtIso: '2026-07-02T08:31:00.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(app)).toContain('需要尾板');
    expect(getRenderedText(app)).toContain('本地：否');
    expect(getRenderedText(app)).toContain('服务端：是');

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'draft-use-platform-field-needTailboard' })
        .props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-save' }).props.onPress();
      await flushMicrotasks();
    });

    const draftSaveCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/order-draft',
      method: 'PUT',
    });
    expect(draftSaveCall).toBeDefined();
    expect(getFetchCallBody(draftSaveCall)).toMatchObject({
      draftSnapshot: {
        pickupAddress: '本地尾板装货仓',
        deliveryAddress: '本地尾板卸货门店',
        weightText: '7.7 吨',
        needTailboard: true,
        needTarp: false,
      },
      clientUpdatedAtIso: '2026-07-02T08:30:00.000Z',
    });
    expect(getRenderedText(app)).toContain(
      '已采用服务端草稿字段：需要尾板。',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shows draft conflict enum differences and applies one platform field without replacing others', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-02T08:30:00.000Z').getTime();

  await AsyncStorage.setItem(
    '@vireCodeing/draft-storage',
    JSON.stringify({
      version: 1,
      savedAt: now,
      draft: {
        pickupAddress: '本地车型装货仓',
        deliveryAddress: '本地车型卸货门店',
        weightText: '8.8 吨',
        vehicleRequirement: 'small',
        vehicleLengthRequirement: '3m',
      },
      syncState: {
        status: 'pending',
        message: '本地草稿较新，等待同步。',
        updatedAtText: '刚刚',
        updatedAtIso: '2026-07-02T08:30:00.000Z',
        queueItems: [],
      },
    }),
  );

  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft-enum-field-diff',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-enum-field-diff-user.900',
          refreshToken: 'refresh.platform-draft-enum-field-diff-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-enum-field-diff',
        draftSnapshot: {
          pickupAddress: '服务端车型装货仓',
          deliveryAddress: '服务端车型卸货门店',
          weightText: '1.3 吨',
          vehicleRequirement: 'medium',
          vehicleLengthRequirement: '6m',
        },
        clientUpdatedAtIso: '2026-07-02T08:19:00.000Z',
        updatedAtIso: '2026-07-02T08:20:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-enum-field-diff',
        draftSnapshot: {
          pickupAddress: '本地车型装货仓',
          deliveryAddress: '本地车型卸货门店',
          weightText: '8.8 吨',
          vehicleRequirement: 'medium',
          vehicleLengthRequirement: '3m',
        },
        clientUpdatedAtIso: '2026-07-02T08:30:00.000Z',
        updatedAtIso: '2026-07-02T08:31:00.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(app)).toContain('车型要求');
    expect(getRenderedText(app)).toContain('本地：小货车');
    expect(getRenderedText(app)).toContain('服务端：中型货车');
    expect(getRenderedText(app)).toContain('车长要求');
    expect(getRenderedText(app)).toContain('本地：3米');
    expect(getRenderedText(app)).toContain('服务端：6米');

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'draft-use-platform-field-vehicleRequirement' })
        .props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-save' }).props.onPress();
      await flushMicrotasks();
    });

    const draftSaveCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/order-draft',
      method: 'PUT',
    });
    expect(draftSaveCall).toBeDefined();
    expect(getFetchCallBody(draftSaveCall)).toMatchObject({
      draftSnapshot: {
        pickupAddress: '本地车型装货仓',
        deliveryAddress: '本地车型卸货门店',
        weightText: '8.8 吨',
        vehicleRequirement: 'medium',
        vehicleLengthRequirement: '3m',
      },
      clientUpdatedAtIso: '2026-07-02T08:30:00.000Z',
    });
    expect(getRenderedText(app)).toContain(
      '已采用服务端草稿字段：车型要求。',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shows draft conflict array differences and applies one platform field without replacing others', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-02T08:30:00.000Z').getTime();

  await AsyncStorage.setItem(
    '@vireCodeing/draft-storage',
    JSON.stringify({
      version: 1,
      savedAt: now,
      draft: {
        pickupAddress: '本地增值服务装货仓',
        deliveryAddress: '本地增值服务卸货门店',
        weightText: '9.9 吨',
        valueAddedServiceIds: ['loading'],
        needTailboard: false,
      },
      syncState: {
        status: 'pending',
        message: '本地草稿较新，等待同步。',
        updatedAtText: '刚刚',
        updatedAtIso: '2026-07-02T08:30:00.000Z',
        queueItems: [],
      },
    }),
  );

  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft-array-field-diff',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-array-field-diff-user.900',
          refreshToken: 'refresh.platform-draft-array-field-diff-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-array-field-diff',
        draftSnapshot: {
          pickupAddress: '服务端增值服务装货仓',
          deliveryAddress: '服务端增值服务卸货门店',
          weightText: '1.4 吨',
          valueAddedServiceIds: ['insurance', 'protection'],
          needTailboard: true,
        },
        clientUpdatedAtIso: '2026-07-02T08:19:00.000Z',
        updatedAtIso: '2026-07-02T08:20:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-array-field-diff',
        draftSnapshot: {
          pickupAddress: '本地增值服务装货仓',
          deliveryAddress: '本地增值服务卸货门店',
          weightText: '9.9 吨',
          valueAddedServiceIds: ['insurance', 'protection'],
          needTailboard: false,
        },
        clientUpdatedAtIso: '2026-07-02T08:30:00.000Z',
        updatedAtIso: '2026-07-02T08:31:00.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(app)).toContain('增值服务');
    expect(getRenderedText(app)).toContain('本地：装卸协助');
    expect(getRenderedText(app)).toContain('服务端：保价运输、防震包装');

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'draft-use-platform-field-valueAddedServiceIds' })
        .props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-save' }).props.onPress();
      await flushMicrotasks();
    });

    const draftSaveCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/order-draft',
      method: 'PUT',
    });
    expect(draftSaveCall).toBeDefined();
    expect(getFetchCallBody(draftSaveCall)).toMatchObject({
      draftSnapshot: {
        pickupAddress: '本地增值服务装货仓',
        deliveryAddress: '本地增值服务卸货门店',
        weightText: '9.9 吨',
        valueAddedServiceIds: ['insurance', 'protection'],
        needTailboard: false,
      },
      clientUpdatedAtIso: '2026-07-02T08:30:00.000Z',
    });
    expect(getRenderedText(app)).toContain(
      '已采用服务端草稿字段：增值服务。',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shows draft conflict number differences and applies one platform field without replacing others', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-02T08:30:00.000Z').getTime();

  await AsyncStorage.setItem(
    '@vireCodeing/draft-storage',
    JSON.stringify({
      version: 1,
      savedAt: now,
      draft: {
        pickupAddress: '本地装卸人数装货仓',
        deliveryAddress: '本地装卸人数卸货门店',
        weightText: '10.1 吨',
        valueAddedServiceIds: ['loading'],
        loadingWorkerCount: 1,
      },
      syncState: {
        status: 'pending',
        message: '本地草稿较新，等待同步。',
        updatedAtText: '刚刚',
        updatedAtIso: '2026-07-02T08:30:00.000Z',
        queueItems: [],
      },
    }),
  );

  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft-number-field-diff',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-number-field-diff-user.900',
          refreshToken: 'refresh.platform-draft-number-field-diff-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-number-field-diff',
        draftSnapshot: {
          pickupAddress: '服务端装卸人数装货仓',
          deliveryAddress: '服务端装卸人数卸货门店',
          weightText: '1.5 吨',
          valueAddedServiceIds: ['loading'],
          loadingWorkerCount: 4,
        },
        clientUpdatedAtIso: '2026-07-02T08:19:00.000Z',
        updatedAtIso: '2026-07-02T08:20:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-number-field-diff',
        draftSnapshot: {
          pickupAddress: '本地装卸人数装货仓',
          deliveryAddress: '本地装卸人数卸货门店',
          weightText: '10.1 吨',
          valueAddedServiceIds: ['loading'],
          loadingWorkerCount: 4,
        },
        clientUpdatedAtIso: '2026-07-02T08:30:00.000Z',
        updatedAtIso: '2026-07-02T08:31:00.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(app)).toContain('装卸工人数');
    expect(getRenderedText(app)).toContain('本地：1 人');
    expect(getRenderedText(app)).toContain('服务端：4 人');

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'draft-use-platform-field-loadingWorkerCount' })
        .props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-save' }).props.onPress();
      await flushMicrotasks();
    });

    const draftSaveCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/order-draft',
      method: 'PUT',
    });
    expect(draftSaveCall).toBeDefined();
    expect(getFetchCallBody(draftSaveCall)).toMatchObject({
      draftSnapshot: {
        pickupAddress: '本地装卸人数装货仓',
        deliveryAddress: '本地装卸人数卸货门店',
        weightText: '10.1 吨',
        valueAddedServiceIds: ['loading'],
        loadingWorkerCount: 4,
      },
      clientUpdatedAtIso: '2026-07-02T08:30:00.000Z',
    });
    expect(getRenderedText(app)).toContain(
      '已采用服务端草稿字段：装卸工人数。',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolves the draft conflict after applying the last differing platform field', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date('2026-07-02T08:30:00.000Z').getTime();

  await AsyncStorage.setItem(
    '@vireCodeing/draft-storage',
    JSON.stringify({
      version: 1,
      savedAt: now,
      draft: {
        pickupAddress: '本地唯一差异装货仓',
      },
      syncState: {
        status: 'pending',
        message: '本地草稿较新，等待同步。',
        updatedAtText: '刚刚',
        updatedAtIso: '2026-07-02T08:30:00.000Z',
        queueItems: [],
      },
    }),
  );

  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft-last-field-diff',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-last-field-diff-user.900',
          refreshToken: 'refresh.platform-draft-last-field-diff-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-last-field-diff',
        draftSnapshot: {
          pickupAddress: '服务端唯一差异装货仓',
        },
        clientUpdatedAtIso: '2026-07-02T08:19:00.000Z',
        updatedAtIso: '2026-07-02T08:20:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        shipperId: 'user-platform-draft-last-field-diff',
        draftSnapshot: {
          pickupAddress: '服务端唯一差异装货仓',
        },
        clientUpdatedAtIso: '2026-07-02T08:30:00.000Z',
        updatedAtIso: '2026-07-02T08:31:00.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(app)).toContain('本地：本地唯一差异装货仓');
    expect(getRenderedText(app)).toContain('服务端：服务端唯一差异装货仓');

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'draft-use-platform-field-pickupAddress' })
        .props.onPress();
    });

    expect(
      app.root.findByProps({ testID: 'draft-pickup-address' }).props.value,
    ).toBe('服务端唯一差异装货仓');
    expect(getRenderedText(app)).toContain(
      '已采用服务端草稿字段：装货地址，草稿冲突已处理完。',
    );
    expect(
      app.root.findAllByProps({ testID: 'draft-keep-local-draft' }),
    ).toHaveLength(0);
    expect(
      app.root.findAllByProps({ testID: 'draft-use-platform-draft' }),
    ).toHaveLength(0);
    expect(
      app.root.findAllByProps({ testID: 'draft-merge-platform-draft' }),
    ).toHaveLength(0);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const retryDraftCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/order-draft',
      method: 'PUT',
    });
    expect(retryDraftCall).toBeDefined();
    expect(getFetchCallBody(retryDraftCall)).toMatchObject({
      draftSnapshot: {
        pickupAddress: '服务端唯一差异装货仓',
      },
      clientUpdatedAtIso: '2026-07-02T08:30:00.000Z',
      baseUpdatedAtIso: '2026-07-02T08:20:00.000Z',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shows platform pricing notices on the draft screen when platform order api is enabled', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-draft-pricing-copy',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-draft-pricing-copy.900',
          refreshToken: 'refresh.platform-draft-pricing-copy.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null));

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });

    const renderedText = getRenderedText(app);

    expect(renderedText).toContain(
      '固定价发单会同步优惠券选择和实付预估，实际核销以后端订单与支付状态为准。',
    );
    expect(renderedText).toContain(
      '平台发单会同步支付方式选择；若选择在线支付，支付单会在发单后的订单页中发起。',
    );
    expect(renderedText).not.toContain('本地优惠券');
    expect(renderedText).not.toContain(
      '仅做本地计价预览，真实优惠券核销和支付抵扣后续接入。',
    );
    expect(renderedText).not.toContain(
      '当前只记录本地选择，真实微信/支付宝支付后续接入。',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses platform order api when publishing and keeps local fallback on failure', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-user.900',
          refreshToken: 'refresh.platform-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(null),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        id: 'order-platform-777',
        orderNo: 'HY202607010777',
        shipperId: 'user-platform-order',
        status: 'waiting',
        cargoType: 'digital',
        weightText: '1.8 吨',
        quantityText: '18 箱',
        cargoDescription: '高价值设备，轻拿轻放',
        cargoPhotoCount: 0,
        pickupAddress: '宝安临时仓',
        pickupContact: '赵经理',
        pickupPhone: '13800138001',
        deliveryAddress: '南山门店新址',
        deliveryContact: '钱店长',
        deliveryPhone: '13800138002',
        vehicleRequirement: 'medium',
        needTailboard: false,
        needTarp: false,
        pickupTimeIso: '2026-07-02T01:30:00.000Z',
        pricingMode: 'fixed',
        priceCents: 76000,
        paymentMethod: 'cod',
        createdAtIso: '2026-07-01T08:00:00.000Z',
        updatedAtIso: '2026-07-01T08:00:00.000Z',
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'));

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    const createCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders',
      method: 'POST',
    });

    expect(createCall).toBeDefined();
    expect(createCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-user.900',
          'Idempotency-Key': expect.stringMatching(uuidV4Pattern),
        }),
      }),
    );
    expect(
      getFetchCallBody<{ cargoType: string; vehicleRequirement: string }>(
        createCall,
      ),
    ).toMatchObject({
      cargoType: 'digital',
      vehicleRequirement: 'medium',
    });
    expect(getRenderedText(app)).toContain('HY202607010777');
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010777',
      syncState: { status: 'synced' },
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getAppRuntimeState().orders[0].syncState).toMatchObject({
      status: 'failed',
      operation: 'create',
      updatedAtIso: '2026-07-01T08:00:00.000Z',
      queueItems: [
        expect.objectContaining({
          updatedAtIso: '2026-07-01T08:00:00.000Z',
        }),
      ],
      message: expect.stringContaining(
        '平台订单接口不可用，已保留本地待同步订单。',
      ),
      createContext: {
        idempotencyKey: expect.stringMatching(uuidV4Pattern),
      },
    });
    expect(getRenderedText(app)).toContain(
      '平台订单接口不可用，已保留本地待同步订单。',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('persists the create key before sending a platform order request', async () => {
  const originalFetch = globalThis.fetch;
  const setItemMock = AsyncStorage.setItem as jest.Mock;
  const originalSetItemImplementation = setItemMock.getMockImplementation();
  const durableWrite = createDeferred<void>();
  const createResponse = createDeferred<unknown>();
  let durableWriteStarted = false;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({ expireSeconds: 300, devCode: '999999' }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-durable-create',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-durable-create.900',
          refreshToken: 'refresh.platform-durable-create.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockImplementationOnce(() => createResponse.promise);

  if (!originalSetItemImplementation) {
    throw new Error('AsyncStorage.setItem mock implementation is required');
  }

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });

    setItemMock.mockImplementation((key: string, value: string) => {
      if (
        key === '@vireCodeing/app-runtime-state' &&
        !durableWriteStarted &&
        JSON.parse(value).state.orders[0]?.syncState?.createContext
      ) {
        durableWriteStarted = true;
        return durableWrite.promise.then(() =>
          originalSetItemImplementation(key, value),
        );
      }

      return originalSetItemImplementation(key, value);
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
    });

    expect(durableWriteStarted).toBe(true);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith('/shipper/orders'),
      ),
    ).toHaveLength(0);

    await ReactTestRenderer.act(async () => {
      durableWrite.resolve(undefined);
      await flushMicrotasks();
    });

    const createCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders',
      method: 'POST',
    });
    const storedSnapshot = JSON.parse(
      String(await AsyncStorage.getItem('@vireCodeing/app-runtime-state')),
    );
    const storedKey =
      storedSnapshot.state.orders[0].syncState.createContext.idempotencyKey;
    const requestHeaders = getFetchCallHeaders(createCall);

    expect(storedKey).toMatch(uuidV4Pattern);
    expect(requestHeaders['Idempotency-Key']).toBe(storedKey);

    await ReactTestRenderer.act(async () => {
      createResponse.resolve(
        createPlatformApiResponse(
          createPlatformOrderFixture({
            id: 'order-platform-durable-create',
            orderNo: 'HY202607010990',
            shipperId: 'user-platform-durable-create',
          }),
        ),
      );
      await flushMicrotasks();
    });
  } finally {
    durableWrite.resolve(undefined);
    createResponse.resolve(createPlatformApiResponse(null));
    setItemMock.mockImplementation(originalSetItemImplementation);
    globalThis.fetch = originalFetch;
  }
});

test('does not send a platform create when durable runtime storage fails', async () => {
  const originalFetch = globalThis.fetch;
  const setItemMock = AsyncStorage.setItem as jest.Mock;
  const originalSetItemImplementation = setItemMock.getMockImplementation();
  let rejectedDurableWrite = false;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({ expireSeconds: 300, devCode: '999999' }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-storage-failure',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-storage-failure.900',
          refreshToken: 'refresh.platform-storage-failure.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null));

  if (!originalSetItemImplementation) {
    throw new Error('AsyncStorage.setItem mock implementation is required');
  }

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });

    setItemMock.mockImplementation((key: string, value: string) => {
      if (
        key === '@vireCodeing/app-runtime-state' &&
        !rejectedDurableWrite &&
        JSON.parse(value).state.orders[0]?.syncState?.createContext
      ) {
        rejectedDurableWrite = true;
        return Promise.reject(new Error('storage failed'));
      }

      return originalSetItemImplementation(key, value);
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    expect(rejectedDurableWrite).toBe(true);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith('/shipper/orders'),
      ),
    ).toHaveLength(0);
    expect(getAppRuntimeState().orders[0].syncState).toMatchObject({
      status: 'failed',
      operation: 'create',
      message: '本地订单安全保存失败，未发送平台发布请求。',
      createContext: {
        idempotencyKey: expect.stringMatching(uuidV4Pattern),
      },
    });
    expect(getRenderedText(app)).toContain(
      '本地订单安全保存失败，未发送平台发布请求。',
    );
  } finally {
    setItemMock.mockImplementation(originalSetItemImplementation);
    globalThis.fetch = originalFetch;
  }
});

test.each([
  [
    'IDEMPOTENCY_KEY_REUSED',
    '平台发布凭证与原请求不一致，已刷新平台订单；自动重试已停止，请确认后重新发布。',
  ],
  [
    'IDEMPOTENCY_KEY_EXPIRED',
    '平台发布凭证已过期，已刷新平台订单；自动重试已停止，请确认后重新发布。',
  ],
])(
  'refreshes platform orders and blocks create retry when initial create returns %s',
  async (errorCode, expectedMessage) => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      )
      .mockResolvedValueOnce(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-create-key-invalid',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-create-key-invalid.900',
            refreshToken: 'refresh.platform-create-key-invalid.604800',
            expiresIn: 900,
          },
        }),
      )
      .mockResolvedValueOnce(createPlatformApiResponse(null))
      .mockResolvedValueOnce(
        createPlatformApiErrorResponse(409, errorCode, errorCode),
      )
      .mockResolvedValueOnce(
        createPlatformApiResponse({
          items: [],
          page: 1,
          pageSize: 20,
          total: 0,
        }),
      );

    installPlatformFetchMock(fetchMock);

    try {
      const app = await renderApp(
        new Date('2026-07-14T08:00:00.000Z').getTime(),
        { platformApiBaseUrl: 'http://localhost:3000/api' },
      );

      await loginToHomeWithPlatformAuth(app);
      await publishDigitalPlatformOrderFromHome(app);

      const createCalls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith('/shipper/orders') && init?.method === 'POST',
      );
      const originalCreateKey = createCalls[0]?.[1]?.headers?.[
        'Idempotency-Key'
      ] as string;

      expect(createCalls).toHaveLength(1);
      expect(originalCreateKey).toMatch(uuidV4Pattern);
      const refreshCall = findFetchCall(fetchMock, {
        url: 'http://localhost:3000/api/shipper/orders?page=1&pageSize=20',
        method: 'GET',
      });

      expect(refreshCall?.[1]).toEqual(
        expect.objectContaining({ method: 'GET' }),
      );
      expect(getAppRuntimeState().orders[0].syncState).toMatchObject({
        status: 'failed',
        operation: 'create',
        message: expectedMessage,
        retryBlocked: true,
        createContext: { idempotencyKey: originalCreateKey },
      });
      expect(
        app.root.findAllByProps({ testID: 'order-sync-retry' }),
      ).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

test('blocks create retry without mutation refresh when create returns ORDER_CONFLICT', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-create-contract-error',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-create-contract-error.900',
          refreshToken: 'refresh.platform-create-contract-error.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(
      createPlatformApiErrorResponse(
        409,
        'ORDER_CONFLICT',
        'ORDER_CONFLICT',
      ),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(
      new Date('2026-07-14T08:00:00.000Z').getTime(),
      { platformApiBaseUrl: 'http://localhost:3000/api' },
    );

    await loginToHomeWithPlatformAuth(app);
    await publishDigitalPlatformOrderFromHome(app);

    const createCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders',
      method: 'POST',
    });
    const originalCreateKey = getFetchCallHeaders(createCall)['Idempotency-Key'];

    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/shipper/orders',
        method: 'POST',
      }),
    ).toHaveLength(1);
    expect(
      findFetchCall(fetchMock, {
        urlIncludes: '/shipper/orders?',
        method: 'GET',
      }),
    ).toBeUndefined();
    expect(getAppRuntimeState().orders[0].syncState).toMatchObject({
      status: 'failed',
      operation: 'create',
      message:
        '平台创建接口返回契约异常（ORDER_CONFLICT），已停止自动重试并保留本地订单。',
      retryBlocked: true,
      createContext: { idempotencyKey: originalCreateKey },
    });
    expect(
      app.root.findAllByProps({ testID: 'order-sync-retry' }),
    ).toHaveLength(0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshes and blocks create retry when a replayed create key expires', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-create-retry-expired',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-create-retry-expired.900',
          refreshToken: 'refresh.platform-create-retry-expired.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
    .mockResolvedValueOnce(
      createPlatformApiErrorResponse(
        409,
        'IDEMPOTENCY_KEY_EXPIRED',
        'IDEMPOTENCY_KEY_EXPIRED',
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(
      new Date('2026-07-14T08:00:00.000Z').getTime(),
      { platformApiBaseUrl: 'http://localhost:3000/api' },
    );

    await loginToHomeWithPlatformAuth(app);
    await publishDigitalPlatformOrderFromHome(app);

    const createCallsBeforeRetry = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders',
      method: 'POST',
    });
    const originalCreateKey = getFetchCallHeaders(createCallsBeforeRetry[0])[
      'Idempotency-Key'
    ];

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'order-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const createCalls = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders',
      method: 'POST',
    });
    const retryCreateKey = getFetchCallHeaders(createCalls[1])['Idempotency-Key'];

    expect(retryCreateKey).toBe(originalCreateKey);
    expect(
      findFetchCall(fetchMock, {
        url: 'http://localhost:3000/api/shipper/orders?page=1&pageSize=20',
        method: 'GET',
      })?.[1],
    ).toEqual(expect.objectContaining({ method: 'GET' }));
    expect(getAppRuntimeState().orders[0].syncState).toMatchObject({
      status: 'failed',
      operation: 'create',
      message:
        '平台发布凭证已过期，已刷新平台订单；自动重试已停止，请确认后重新发布。',
      retryBlocked: true,
      createContext: { idempotencyKey: originalCreateKey },
    });
    expect(
      app.root.findAllByProps({ testID: 'order-sync-retry' }),
    ).toHaveLength(0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reuses a persisted create key when retrying after a cold start', async () => {
  const persistedCreateKey = '550e8400-e29b-41d4-a716-446655440000';
  const originalFetch = globalThis.fetch;
  const syncedPlatformOrder = createPlatformOrderFixture({
    id: 'order-platform-cold-retry',
    orderNo: 'HY202607140901',
    shipperId: 'user-platform-cold-retry',
    cargoType: 'digital',
    weightText: '1.8 吨',
    quantityText: '18 箱',
    pickupAddress: '宝安临时仓',
    deliveryAddress: '南山门店新址',
    priceCents: 76000,
  });
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-cold-retry',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-cold-retry.900',
          refreshToken: 'refresh.platform-cold-retry.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(syncedPlatformOrder));

  await AsyncStorage.setItem(
    '@vireCodeing/app-runtime-state',
    JSON.stringify({
      version: 1,
      state: {
        orders: [
          {
            id: 'HYLOCAL-COLD-RETRY',
            status: 'waiting',
            from: '宝安临时仓',
            to: '南山门店新址',
            cargoType: '数码',
            weightText: '1.8 吨',
            quantityText: '18 箱',
            cargoDescription: '高价值设备，轻拿轻放',
            vehicleRequirement: '中型货车',
            priceText: '￥760',
            paymentMethodText: '货到付款',
            updatedAtText: '同步失败',
            createdAtIso: '2026-07-14T08:00:00.000Z',
            updatedAtIso: '2026-07-14T08:00:00.000Z',
            pickupContact: '赵经理',
            pickupPhone: '13800138001',
            deliveryContact: '钱店长',
            deliveryPhone: '13800138002',
            pickupTimeIso: '2026-07-15T01:30:00.000Z',
            pickupTimeText: '明天 09:30',
            syncState: {
              status: 'failed',
              operation: 'create',
              message: '平台订单接口不可用，已保留本地待同步订单。',
              updatedAtText: '刚刚',
              updatedAtIso: '2026-07-14T08:00:00.000Z',
              createContext: { idempotencyKey: persistedCreateKey },
              queueItems: [],
            },
          },
        ],
        messages: [],
      },
    }),
  );
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(
      new Date('2026-07-14T08:00:00.000Z').getTime(),
      { platformApiBaseUrl: 'http://localhost:3000/api' },
    );

    await loginToHomeWithPlatformAuth(app);
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'home-recent-order-HYLOCAL-COLD-RETRY' })
        .props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'order-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const createCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders',
      method: 'POST',
    });

    expect(createCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Idempotency-Key': persistedCreateKey,
        }),
      }),
    );
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607140901',
      platformOrderId: 'order-platform-cold-retry',
      syncState: { status: 'synced' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('attaches platform file objects to cargo photo vouchers when publishing', async () => {
  const originalFetch = globalThis.fetch;
  const createdPlatformOrder = createPlatformOrderFixture({
    id: 'order-platform-cargo-file',
    orderNo: 'HY202607010778',
    shipperId: 'user-platform-cargo-file',
    status: 'waiting',
    cargoType: 'digital',
    weightText: '1.8 吨',
    quantityText: '18 箱',
    cargoDescription: '高价值设备，轻拿轻放',
    cargoPhotoCount: 1,
    pickupAddress: '宝安临时仓',
    pickupContact: '赵经理',
    pickupPhone: '13800138001',
    deliveryAddress: '南山门店新址',
    deliveryContact: '钱店长',
    deliveryPhone: '13800138002',
    vehicleRequirement: 'medium',
    pickupTimeIso: '2026-07-02T01:30:00.000Z',
    pricingMode: 'fixed',
    priceCents: 76000,
    paymentMethod: 'cod',
    createdAtIso: '2026-07-01T08:00:00.000Z',
    updatedAtIso: '2026-07-01T08:00:00.000Z',
  });
  const fetchMock = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(url);
    const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (requestUrl.endsWith('/auth/send-code')) {
      return Promise.resolve(
        createPlatformApiResponse({ expireSeconds: 300, devCode: '999999' }),
      );
    }

    if (requestUrl.endsWith('/auth/login')) {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-cargo-file',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-cargo-file.900',
            refreshToken: 'refresh.platform-cargo-file.604800',
            expiresIn: 900,
          },
        }),
      );
    }

    if (requestUrl.endsWith('/shipper/profile/address-book')) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (requestUrl.endsWith('/files/upload-intents')) {
      expect(requestBody).toMatchObject({
        purpose: 'cargo',
        fileName: '货物图片凭证1.png',
        contentType: 'image/png',
      });

      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-cargo-1',
          ownerUserId: 'user-platform-cargo-file',
          purpose: 'cargo',
          objectKey: 'user-platform-cargo-file/cargo/file-cargo-1.png',
          status: 'pending',
          uploadUrl: 'http://localhost:3000/api/files/uploads/file-cargo-1',
          publicUrl: 'https://cdn.example.com/file-cargo-1.png',
          expiresAtIso: '2026-07-01T08:15:00.000Z',
          createdAtIso: '2026-07-01T08:00:00.000Z',
        }),
      );
    }

    if (requestUrl.endsWith('/files/uploads/file-cargo-1')) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-cargo-1',
          ownerUserId: 'user-platform-cargo-file',
          purpose: 'cargo',
          objectKey: 'user-platform-cargo-file/cargo/file-cargo-1.png',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-cargo-1.png',
          createdAtIso: '2026-07-01T08:00:00.000Z',
        }),
      );
    }

    if (requestUrl.endsWith('/shipper/orders') && init?.method === 'POST') {
      expect(requestBody).toMatchObject({
        cargoType: 'digital',
        cargoPhotoCount: 1,
        cargoPhotoFileIds: ['file-cargo-1'],
      });
      expect(requestBody).not.toHaveProperty('cargoPhotoFiles');

      return Promise.resolve(createPlatformApiResponse(createdPlatformOrder));
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);

    mockSelectedImageUpload('cargo-upload.png');

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-cargo-photo-add' }).props.onPress();
      await flushMicrotasks();
    });

    let renderedText = getRenderedText(app);

    expect(renderedText).toContain('货物图片凭证清单');
    expect(renderedText).toContain('货物图片凭证：货物图片凭证1.png');
    expect(renderedText).toContain('来源：平台文件对象（已上传）');
    expect(renderedText).toContain('文件 ID：file-cargo-1');
    expect(renderedText).not.toContain('本地图片凭证 1：本地已保存');
    expect(
      app.root.findByProps({ testID: 'draft-cargo-photo-preview-image-1' }).props
        .source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-cargo-1.png',
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith('/files/upload-intents'),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith('/files/uploads/file-cargo-1'),
      ),
    ).toBe(true);
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010778',
      cargoPhotoCount: 1,
      cargoPhotoFiles: [
        {
          fileId: 'file-cargo-1',
          fileName: '货物图片凭证1.png',
          purpose: 'cargo',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-cargo-1.png',
        },
      ],
      syncState: { status: 'synced' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps a new platform order creation queued when publish has no auth token', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-create-missing-token',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-create-missing-token.900',
          refreshToken: 'refresh.platform-order-create-missing-token.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null));

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);

    clearAuthSession();

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      findFetchCall(fetchMock, {
        url: 'http://localhost:3000/api/shipper/orders',
        method: 'POST',
      }),
    ).toBeUndefined();
    expect(getAppRuntimeState().orders[0].syncState).toMatchObject({
      status: 'failed',
      operation: 'create',
      message: '平台订单发布需要重新登录后再同步。',
    });
    expect(getAppRuntimeState().orders[0].syncState?.queueItems).toHaveLength(1);
    expect(getRenderedText(app)).toContain('平台订单发布需要重新登录后再同步。');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps reorder source when publishing a reordered platform order', async () => {
  const originalFetch = globalThis.fetch;
  const reorderedPlatformOrder = createPlatformOrderFixture({
    id: 'order-platform-reorder-1',
    orderNo: 'HY202607010779',
    shipperId: 'user-platform-reorder',
    status: 'waiting',
    cargoType: 'food',
    weightText: '1 吨',
    quantityText: '1 件',
    pickupAddress: '盐田港仓储中心',
    deliveryAddress: '罗湖区翠竹门店',
  });
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-reorder',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-reorder.900',
          refreshToken: 'refresh.platform-reorder.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(reorderedPlatformOrder));

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'home-recent-order-HY20260620003' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'order-detail-primary-action' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'order-detail-secondary-action' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    const createCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders',
      method: 'POST',
    });

    expect(createCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-reorder.900',
        }),
      }),
    );
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010779',
      platformOrderId: 'order-platform-reorder-1',
      reorderSource: {
        orderId: 'HY20260620003',
        copiedAtText: '刚刚复制',
        noteText: '从历史订单重新下单',
      },
      syncState: { status: 'synced' },
    });
    expect(getRenderedText(app)).toContain('复制来源：HY20260620003');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('replays a failed platform order creation from the order sync queue', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-retry',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-retry-user.900',
          refreshToken: 'refresh.platform-order-retry-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-retry-888',
          orderNo: 'HY202607010888',
          shipperId: 'user-platform-order-retry',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '宝安临时仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:05:00.000Z',
          updatedAtIso: '2026-07-01T08:05:00.000Z',
        }),
      ),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getAppRuntimeState().orders[0].syncState).toMatchObject({
      status: 'failed',
      createContext: {
        idempotencyKey: expect.stringMatching(uuidV4Pattern),
      },
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'order-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const createCalls = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders',
      method: 'POST',
    });
    const retryCreateCall = createCalls[1];

    expect(createCalls).toHaveLength(2);
    expect(retryCreateCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-order-retry-user.900',
          'Idempotency-Key': expect.stringMatching(uuidV4Pattern),
        }),
      }),
    );
    expect(
      getFetchCallBody<{
        cargoType: string;
        vehicleRequirement: string;
        weightText: string;
        quantityText: string;
        pickupAddress: string;
        deliveryAddress: string;
        pricingMode: string;
        priceCents: number;
      }>(retryCreateCall),
    ).toMatchObject({
      cargoType: 'digital',
      vehicleRequirement: 'medium',
      weightText: '1.8 吨',
      quantityText: '18 箱',
      pickupAddress: '宝安临时仓',
      deliveryAddress: '南山门店新址',
      pricingMode: 'fixed',
      priceCents: 76000,
    });
    expect(getRenderedText(app)).toContain('HY202607010888');
    expect(getRenderedText(app)).toContain('后端同步：已同步');
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010888',
      platformOrderId: 'order-platform-retry-888',
      syncState: { status: 'synced' },
    });
    const firstCreateHeaders = getFetchCallHeaders(createCalls[0]);
    const retryCreateHeaders = getFetchCallHeaders(retryCreateCall);

    expect(firstCreateHeaders['Idempotency-Key']).toBe(
      retryCreateHeaders['Idempotency-Key'],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fails closed for legacy platform order creations without a create key', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-negotiable-retry',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-negotiable-retry-user.900',
          refreshToken: 'refresh.platform-negotiable-retry-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    );

  await AsyncStorage.setItem(
    '@vireCodeing/app-runtime-state',
    JSON.stringify({
      version: 1,
      state: {
        orders: [
          {
            id: 'HYLOCAL889',
            status: 'waiting',
            from: '宝安临时仓',
            to: '南山门店新址',
            cargoType: '数码',
            weightText: '1.8 吨',
            quantityText: '18 箱',
            cargoDescription: '高价值设备，轻拿轻放',
            vehicleRequirement: '中型货车',
            priceText: '司机报价',
            couponId: 'coupon-1',
            couponTitleText: '满 300 减 30',
            couponDiscountText: '-￥30',
            payablePriceText: '￥730',
            paymentMethodText: '货到付款',
            updatedAtText: '同步失败',
            pickupContact: '赵经理',
            pickupPhone: '13800138001',
            deliveryContact: '钱店长',
            deliveryPhone: '13800138002',
            pickupTimeIso: '2026-07-02T01:30:00.000Z',
            pickupTimeText: '明天 09:30',
            syncState: {
              status: 'failed',
              operation: 'create',
              message: '平台订单接口不可用，已保留本地待同步订单。',
              updatedAtText: '刚刚',
              updatedAtIso: '2026-07-01T08:00:00.000Z',
              queueItems: [],
            },
          },
        ],
        messages: [],
      },
    }),
  );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'home-recent-order-HYLOCAL889' })
        .props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'order-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const refreshCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders?page=1&pageSize=20',
      method: 'GET',
    });

    expect(refreshCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-negotiable-retry-user.900',
        }),
      }),
    );
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith('/shipper/orders') && init?.method === 'POST',
      ),
    ).toHaveLength(0);
    expect(getAppRuntimeState().orders[0].syncState).toMatchObject({
      status: 'failed',
      operation: 'create',
      retryBlocked: true,
      message:
        '旧创建记录缺少安全重试凭证，已刷新平台订单，请人工确认后作为新订单发布。',
    });
    expect(
      getAppRuntimeState().orders[0].syncState?.createContext,
    ).toBeUndefined();
    expect(
      app.root.findAllByProps({ testID: 'order-sync-retry' }),
    ).toHaveLength(0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps a failed platform order creation queued when retry has no auth token', async () => {
  const originalFetch = globalThis.fetch;
  const retriedPlatformOrder = createPlatformOrderFixture({
    id: 'order-platform-order-retry-after-login',
    orderNo: 'HY202607010889',
    shipperId: 'user-platform-order-retry-missing-token',
    cargoType: 'digital',
    weightText: '1.8 吨',
    quantityText: '18 箱',
    pickupAddress: '宝安临时仓',
    deliveryAddress: '南山门店新址',
    priceCents: 76000,
  });
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-retry-missing-token',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-retry-missing-token.900',
          refreshToken: 'refresh.platform-order-retry-missing-token.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
    .mockResolvedValueOnce(createPlatformApiResponse(retriedPlatformOrder));

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getAppRuntimeState().orders[0].syncState).toMatchObject({
      status: 'failed',
      operation: 'create',
    });
    const createCallsBeforeRetry = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders',
      method: 'POST',
    });
    const originalCreateKey = getFetchCallHeaders(createCallsBeforeRetry[0])[
      'Idempotency-Key'
    ];

    clearAuthSession();

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'order-sync-retry' }).props.onPress();
    });

    expect(createCallsBeforeRetry).toHaveLength(1);
    expect(getAppRuntimeState().orders[0].syncState).toMatchObject({
      status: 'failed',
      operation: 'create',
      message: '平台订单重试需要重新登录后再同步。',
    });
    expect(getAppRuntimeState().orders[0].syncState?.queueItems).toHaveLength(1);
    expect(getRenderedText(app)).toContain('平台订单重试需要重新登录后再同步。');

    saveAuthSession(new Date('2026-07-01T08:01:00.000Z').getTime(), {
      accessToken: 'access.platform-order-retry-restored.900',
      refreshToken: 'refresh.platform-order-retry-restored.604800',
      expiresIn: 900,
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'order-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const createCalls = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders',
      method: 'POST',
    });

    expect(createCalls[1]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-order-retry-restored.900',
          'Idempotency-Key': originalCreateKey,
        }),
      }),
    );
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010889',
      platformOrderId: 'order-platform-order-retry-after-login',
      syncState: { status: 'synced' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('cancels a platform order through the shipper order api', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-cancel',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-cancel-user.900',
          refreshToken: 'refresh.platform-order-cancel-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-cancel-777',
          orderNo: 'HY202607010777',
          shipperId: 'user-platform-order-cancel',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '宝安临时仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:00:00.000Z',
          updatedAtIso: '2026-07-01T08:00:00.000Z',
        }),
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-cancel-777',
          orderNo: 'HY202607010777',
          shipperId: 'user-platform-order-cancel',
          status: 'cancelled',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '宝安临时仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:00:00.000Z',
          updatedAtIso: '2026-07-01T08:10:00.000Z',
        }),
      ),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'order-detail-secondary-action' })
        .props.onPress();
    });
    expect(getRenderedText(app)).toContain(
      '当前订单已接平台取消接口；提交后会同步平台订单状态，违约金和退款仍待客服确认。',
    );
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'cancel-reason-plan-change' })
        .props.onPress();
      app.root
        .findByProps({ testID: 'cancel-description' })
        .props.onChangeText('客户临时调整发货计划');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'cancel-submit' }).props.onPress();
      await flushMicrotasks();
    });

    const cancelCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders/order-platform-cancel-777/cancel',
      method: 'POST',
    });

    expect(cancelCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-order-cancel-user.900',
          'Idempotency-Key': expect.stringMatching(uuidV4Pattern),
        }),
      }),
    );
    expect(getFetchCallBody(cancelCall)).toEqual({
      baseUpdatedAtIso: '2026-07-01T08:00:00.000Z',
      reasonText: '计划有变',
      description: '客户临时调整发货计划',
    });
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010777',
      platformOrderId: 'order-platform-cancel-777',
      status: 'cancelled',
      cancellation: {
        reasonText: '计划有变',
        description: '客户临时调整发货计划',
        feeText: '待接单取消已提交平台，当前不产生违约费用。',
        settlementText: '无违约金',
        refundText: '无需退款',
        reviewStatusText: '系统自动通过',
        driverNoticeText: '订单尚未分配司机，无需通知',
      },
      syncState: { status: 'synced' },
    });
    expect(getRenderedText(app)).toContain('后端同步：已同步');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps a platform order cancellation queued when action has no auth token', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-cancel-missing-token',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-cancel-missing-token.900',
          refreshToken: 'refresh.platform-order-cancel-missing-token.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-cancel-missing-token-777',
          orderNo: 'HY202607010777',
          shipperId: 'user-platform-order-cancel-missing-token',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '宝安临时仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:00:00.000Z',
          updatedAtIso: '2026-07-01T08:00:00.000Z',
        }),
      ),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    clearAuthSession();

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'order-detail-secondary-action' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'cancel-reason-plan-change' })
        .props.onPress();
      app.root
        .findByProps({ testID: 'cancel-description' })
        .props.onChangeText('客户临时调整发货计划');
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'cancel-submit' }).props.onPress();
    });

    expect(
      findFetchCall(fetchMock, {
        url:
          'http://localhost:3000/api/shipper/orders/order-platform-cancel-missing-token-777/cancel',
        method: 'POST',
      }),
    ).toBeUndefined();
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010777',
      platformOrderId: 'order-platform-cancel-missing-token-777',
      status: 'cancelled',
      cancellation: {
        reasonText: '计划有变',
        description: '客户临时调整发货计划',
      },
      syncState: {
        status: 'failed',
        operation: 'cancel',
        message: '平台订单取消需要重新登录后再同步。',
      },
    });
    expectOrderMutationContext(
      getAppRuntimeState().orders[0].syncState?.mutationContext,
      '2026-07-01T08:00:00.000Z',
    );
    expect(getAppRuntimeState().orders[0].syncState?.queueItems).toHaveLength(1);
    expect(getRenderedText(app)).toContain('平台订单取消需要重新登录后再同步。');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('retries a failed platform order cancellation through the cancel api', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-cancel-retry',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-cancel-retry-user.900',
          refreshToken: 'refresh.platform-order-cancel-retry-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-cancel-retry-777',
          orderNo: 'HY202607010777',
          shipperId: 'user-platform-order-cancel-retry',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '宝安临时仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:00:00.000Z',
          updatedAtIso: '2026-07-01T08:00:00.000Z',
        }),
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiErrorResponse(
        409,
        'ORDER_STATE_INVALID',
        '当前订单状态不允许取消',
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-cancel-retry-777',
          orderNo: 'HY202607010777',
          shipperId: 'user-platform-order-cancel-retry',
          status: 'cancelled',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '宝安临时仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:00:00.000Z',
          updatedAtIso: '2026-07-01T08:20:00.000Z',
        }),
      ),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'order-detail-secondary-action' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'cancel-reason-plan-change' })
        .props.onPress();
      app.root
        .findByProps({ testID: 'cancel-description' })
        .props.onChangeText('客户临时调整发货计划');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'cancel-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010777',
      platformOrderId: 'order-platform-cancel-retry-777',
      status: 'cancelled',
      cancellation: {
        reasonText: '计划有变',
        description: '客户临时调整发货计划',
      },
      syncState: { status: 'failed' },
    });
    const cancelRetryContext =
      getAppRuntimeState().orders[0].syncState?.mutationContext;
    expectOrderMutationContext(
      cancelRetryContext,
      '2026-07-01T08:00:00.000Z',
    );

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'order-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const cancelCalls = findFetchCalls(fetchMock, {
      url:
        'http://localhost:3000/api/shipper/orders/order-platform-cancel-retry-777/cancel',
      method: 'POST',
    });
    const retryCancelCall = cancelCalls[cancelCalls.length - 1];

    expect(cancelCalls).toHaveLength(2);
    expect(retryCancelCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-order-cancel-retry-user.900',
          'Idempotency-Key': cancelRetryContext?.idempotencyKey,
        }),
      }),
    );
    expect(getFetchCallBody(retryCancelCall)).toEqual({
      baseUpdatedAtIso: cancelRetryContext?.baseUpdatedAtIso,
      reasonText: '计划有变',
      description: '客户临时调整发货计划',
    });
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010777',
      platformOrderId: 'order-platform-cancel-retry-777',
      status: 'cancelled',
      cancellation: {
        reasonText: '计划有变',
        description: '客户临时调整发货计划',
      },
      syncState: { status: 'synced' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('completes a platform order through the shipper order api', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-complete',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-complete-user.900',
          refreshToken: 'refresh.platform-order-complete-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-complete-777',
          orderNo: 'HY202607010777',
          shipperId: 'user-platform-order-complete',
          status: 'confirming',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '宝安临时仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:00:00.000Z',
          updatedAtIso: '2026-07-01T08:00:00.000Z',
        }),
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-complete-777',
          orderNo: 'HY202607010777',
          shipperId: 'user-platform-order-complete',
          status: 'completed',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '宝安临时仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:00:00.000Z',
          updatedAtIso: '2026-07-01T08:20:00.000Z',
        }),
      ),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'order-detail-primary-action' })
        .props.onPress();
      await flushMicrotasks();
    });

    const completeCall = findFetchCall(fetchMock, {
      url:
        'http://localhost:3000/api/shipper/orders/order-platform-complete-777/complete',
      method: 'POST',
    });

    expect(completeCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-order-complete-user.900',
          'Idempotency-Key': expect.stringMatching(uuidV4Pattern),
        }),
      }),
    );
    expect(getFetchCallBody(completeCall)).toEqual({
      baseUpdatedAtIso: '2026-07-01T08:00:00.000Z',
    });
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010777',
      platformOrderId: 'order-platform-complete-777',
      status: 'completed',
      syncState: { status: 'synced' },
    });
    expect(getRenderedText(app)).toContain('后端同步：已同步');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('retries a failed platform order completion through the complete api', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-complete-retry',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-complete-retry-user.900',
          refreshToken: 'refresh.platform-order-complete-retry-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-complete-retry-777',
          orderNo: 'HY202607010777',
          shipperId: 'user-platform-order-complete-retry',
          status: 'confirming',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '宝安临时仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:00:00.000Z',
          updatedAtIso: '2026-07-01T08:00:00.000Z',
        }),
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiErrorResponse(
        409,
        'ORDER_STATE_INVALID',
        '当前订单状态不允许确认送达',
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-complete-retry-777',
          orderNo: 'HY202607010777',
          shipperId: 'user-platform-order-complete-retry',
          status: 'completed',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '宝安临时仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:00:00.000Z',
          updatedAtIso: '2026-07-01T08:20:00.000Z',
        }),
      ),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'order-detail-primary-action' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010777',
      platformOrderId: 'order-platform-complete-retry-777',
      status: 'completed',
      syncState: { status: 'failed' },
    });
    const completeRetryContext =
      getAppRuntimeState().orders[0].syncState?.mutationContext;
    expectOrderMutationContext(
      completeRetryContext,
      '2026-07-01T08:00:00.000Z',
    );

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'order-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const completeCalls = findFetchCalls(fetchMock, {
      url:
        'http://localhost:3000/api/shipper/orders/order-platform-complete-retry-777/complete',
      method: 'POST',
    });
    const retryCompleteCall = completeCalls[completeCalls.length - 1];

    expect(completeCalls).toHaveLength(2);
    expect(retryCompleteCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-order-complete-retry-user.900',
          'Idempotency-Key': completeRetryContext?.idempotencyKey,
        }),
      }),
    );
    expect(getFetchCallBody(retryCompleteCall)).toEqual({
      baseUpdatedAtIso: completeRetryContext?.baseUpdatedAtIso,
    });
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010777',
      platformOrderId: 'order-platform-complete-retry-777',
      status: 'completed',
      syncState: { status: 'synced' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('updates a waiting platform order through the shipper order api', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-update',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-update-user.900',
          refreshToken: 'refresh.platform-order-update-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-update-777',
          orderNo: 'HY202607010777',
          shipperId: 'user-platform-order-update',
          status: 'waiting',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '宝安临时仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:00:00.000Z',
          updatedAtIso: '2026-07-01T08:00:00.000Z',
        }),
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-update-777',
          orderNo: 'HY202607010777',
          shipperId: 'user-platform-order-update',
          status: 'waiting',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '宝安平台新仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:00:00.000Z',
          updatedAtIso: '2026-07-01T08:15:00.000Z',
        }),
      ),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'order-detail-edit-action' }).props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'draft-pickup-address' })
        .props.onChangeText('宝安平台新仓');
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    const updateCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders/order-platform-update-777',
      method: 'PUT',
    });

    expect(updateCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-order-update-user.900',
          'Idempotency-Key': expect.stringMatching(uuidV4Pattern),
        }),
      }),
    );
    expect(getFetchCallBody(updateCall)).toMatchObject({
      cargoType: 'digital',
      vehicleRequirement: 'medium',
      pickupAddress: '宝安平台新仓',
      deliveryAddress: '南山门店新址',
      pricingMode: 'fixed',
      priceCents: 76000,
      baseUpdatedAtIso: '2026-07-01T08:00:00.000Z',
    });
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010777',
      platformOrderId: 'order-platform-update-777',
      from: '宝安平台新仓',
      syncState: { status: 'synced' },
    });
    expect(getRenderedText(app)).toContain('宝安平台新仓');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps a waiting platform order update queued when publish has no auth token', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-update-missing-token',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-update-missing-token.900',
          refreshToken: 'refresh.platform-order-update-missing-token.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-update-missing-token-777',
          orderNo: 'HY202607010777',
          shipperId: 'user-platform-order-update-missing-token',
          status: 'waiting',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '宝安临时仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:00:00.000Z',
          updatedAtIso: '2026-07-01T08:00:00.000Z',
        }),
      ),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    clearAuthSession();

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'order-detail-edit-action' }).props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'draft-pickup-address' })
        .props.onChangeText('宝安离线新仓');
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
    });

    expect(
      findFetchCall(fetchMock, {
        url:
          'http://localhost:3000/api/shipper/orders/order-platform-update-missing-token-777',
        method: 'PUT',
      }),
    ).toBeUndefined();
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010777',
      platformOrderId: 'order-platform-update-missing-token-777',
      from: '宝安离线新仓',
      syncState: {
        status: 'failed',
        operation: 'update',
        message: '平台订单修改需要重新登录后再同步。',
      },
    });
    expectOrderMutationContext(
      getAppRuntimeState().orders[0].syncState?.mutationContext,
      '2026-07-01T08:00:00.000Z',
    );
    expect(getAppRuntimeState().orders[0].syncState?.queueItems).toHaveLength(1);
    expect(getRenderedText(app)).toContain('平台订单修改需要重新登录后再同步。');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('retries a failed platform order update through the update api', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-update-retry',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-update-retry-user.900',
          refreshToken: 'refresh.platform-order-update-retry-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-update-retry-777',
          orderNo: 'HY202607010777',
          shipperId: 'user-platform-order-update-retry',
          status: 'waiting',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '宝安临时仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:00:00.000Z',
          updatedAtIso: '2026-07-01T08:00:00.000Z',
        }),
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiErrorResponse(
        409,
        'ORDER_STATE_INVALID',
        '当前订单状态不允许修改',
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-update-retry-777',
          orderNo: 'HY202607010777',
          shipperId: 'user-platform-order-update-retry',
          status: 'waiting',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '宝安重试新仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:00:00.000Z',
          updatedAtIso: '2026-07-01T08:20:00.000Z',
        }),
      ),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'order-detail-edit-action' }).props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'draft-pickup-address' })
        .props.onChangeText('宝安重试新仓');
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010777',
      platformOrderId: 'order-platform-update-retry-777',
      from: '宝安重试新仓',
      syncState: { status: 'failed' },
    });
    const updateRetryContext =
      getAppRuntimeState().orders[0].syncState?.mutationContext;
    expectOrderMutationContext(
      updateRetryContext,
      '2026-07-01T08:00:00.000Z',
    );

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'order-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const updateCalls = findFetchCalls(fetchMock, {
      url:
        'http://localhost:3000/api/shipper/orders/order-platform-update-retry-777',
      method: 'PUT',
    });
    const retryUpdateCall = updateCalls[updateCalls.length - 1];

    expect(updateCalls).toHaveLength(2);
    expect(retryUpdateCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-order-update-retry-user.900',
          'Idempotency-Key': updateRetryContext?.idempotencyKey,
        }),
      }),
    );
    expect(getFetchCallBody(retryUpdateCall)).toMatchObject({
      cargoType: 'digital',
      vehicleRequirement: 'medium',
      pickupAddress: '宝安重试新仓',
      deliveryAddress: '南山门店新址',
      pricingMode: 'fixed',
      priceCents: 76000,
      baseUpdatedAtIso: updateRetryContext?.baseUpdatedAtIso,
    });
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010777',
      platformOrderId: 'order-platform-update-retry-777',
      from: '宝安重试新仓',
      syncState: { status: 'synced' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshes the latest platform order when an update mutation hits ORDER_CONFLICT', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-update-conflict',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-update-conflict-user.900',
          refreshToken: 'refresh.platform-order-update-conflict-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-update-conflict-777',
          orderNo: 'HY202607010777',
          shipperId: 'user-platform-order-update-conflict',
          status: 'waiting',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '宝安临时仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:00:00.000Z',
          updatedAtIso: '2026-07-01T08:00:00.000Z',
        }),
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiErrorResponse(
        409,
        'ORDER_CONFLICT',
        '订单已被其他操作更新',
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-update-conflict-777',
          orderNo: 'HY202607010777',
          shipperId: 'user-platform-order-update-conflict',
          status: 'waiting',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '服务端冲突后新仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:00:00.000Z',
          updatedAtIso: '2026-07-01T08:18:00.000Z',
        }),
      ),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'order-detail-edit-action' }).props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'draft-pickup-address' })
        .props.onChangeText('本地冲突新仓');
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
      await flushMicrotasks();
    });

    const refreshCall = findFetchCall(fetchMock, {
      url:
        'http://localhost:3000/api/shipper/orders/order-platform-update-conflict-777',
      method: 'GET',
    });

    expect(refreshCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-order-update-conflict-user.900',
        }),
      }),
    );
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010777',
      platformOrderId: 'order-platform-update-conflict-777',
      from: '服务端冲突后新仓',
      syncState: {
        status: 'synced',
        message: '平台订单已被其他操作更新，已刷新最新详情，请重新发起操作。',
      },
    });
    expect(getAppRuntimeState().orders[0].syncState?.mutationContext).toBeUndefined();
    expect(getRenderedText(app)).toContain(
      '平台订单已被其他操作更新，已刷新最新详情，请重新发起操作。',
    );
    expect(getRenderedText(app)).toContain('服务端冲突后新仓');
    expect(getRenderedText(app)).not.toContain('本地冲突新仓');
    expect(app.root.findAllByProps({ testID: 'order-sync-retry' })).toHaveLength(0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshes latest platform order and clears retry context when the retry key is expired', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-update-expired',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-update-expired-user.900',
          refreshToken: 'refresh.platform-order-update-expired-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-update-expired-777',
          orderNo: 'HY202607010777',
          shipperId: 'user-platform-order-update-expired',
          status: 'waiting',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '宝安临时仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:00:00.000Z',
          updatedAtIso: '2026-07-01T08:00:00.000Z',
        }),
      ),
    )
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
    .mockResolvedValueOnce(
      createPlatformApiErrorResponse(
        409,
        'IDEMPOTENCY_KEY_EXPIRED',
        'Idempotency-Key 已过期',
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformOrderFixture({
          id: 'order-platform-update-expired-777',
          orderNo: 'HY202607010777',
          shipperId: 'user-platform-order-update-expired',
          status: 'waiting',
          cargoType: 'digital',
          weightText: '1.8 吨',
          quantityText: '18 箱',
          pickupAddress: '服务端过期后新仓',
          deliveryAddress: '南山门店新址',
          priceCents: 76000,
          createdAtIso: '2026-07-01T08:00:00.000Z',
          updatedAtIso: '2026-07-01T08:22:00.000Z',
        }),
      ),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'order-detail-edit-action' }).props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'draft-pickup-address' })
        .props.onChangeText('本地过期重试仓');
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    const expiredRetryContext =
      getAppRuntimeState().orders[0].syncState?.mutationContext;
    expectOrderMutationContext(
      expiredRetryContext,
      '2026-07-01T08:00:00.000Z',
    );

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'order-sync-retry' }).props.onPress();
      await flushMicrotasks();
      await flushMicrotasks();
    });

    const retryUpdateCalls = findFetchCalls(fetchMock, {
      url:
        'http://localhost:3000/api/shipper/orders/order-platform-update-expired-777',
      method: 'PUT',
    });
    const refreshCall = findFetchCall(fetchMock, {
      url:
        'http://localhost:3000/api/shipper/orders/order-platform-update-expired-777',
      method: 'GET',
    });

    expect(retryUpdateCalls[retryUpdateCalls.length - 1]?.[1]).toEqual(
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-order-update-expired-user.900',
          'Idempotency-Key': expiredRetryContext?.idempotencyKey,
        }),
      }),
    );
    expect(refreshCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-order-update-expired-user.900',
        }),
      }),
    );
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010777',
      platformOrderId: 'order-platform-update-expired-777',
      from: '服务端过期后新仓',
      syncState: {
        status: 'synced',
        message: '当前重试凭证已失效，已刷新最新详情，请重新发起操作。',
      },
    });
    expect(getAppRuntimeState().orders[0].syncState?.mutationContext).toBeUndefined();
    expect(getRenderedText(app)).toContain(
      '当前重试凭证已失效，已刷新最新详情，请重新发起操作。',
    );
    expect(app.root.findAllByProps({ testID: 'order-sync-retry' })).toHaveLength(0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshes platform order detail with backend order id when opening detail', async () => {
  const originalFetch = globalThis.fetch;
  const createdPlatformOrder = {
    id: 'order-platform-777',
    orderNo: 'HY202607010777',
    shipperId: 'user-platform-order',
    status: 'waiting',
    cargoType: 'digital',
    weightText: '1.8 吨',
    quantityText: '18 箱',
    cargoDescription: '高价值设备，轻拿轻放',
    cargoPhotoCount: 0,
    pickupAddress: '宝安临时仓',
    pickupContact: '赵经理',
    pickupPhone: '13800138001',
    deliveryAddress: '南山门店新址',
    deliveryContact: '钱店长',
    deliveryPhone: '13800138002',
    vehicleRequirement: 'medium',
    needTailboard: false,
    needTarp: false,
    pickupTimeIso: '2026-07-02T01:30:00.000Z',
    pricingMode: 'fixed',
    priceCents: 76000,
    paymentMethod: 'cod',
    createdAtIso: '2026-07-01T08:00:00.000Z',
    updatedAtIso: '2026-07-01T08:00:00.000Z',
  };
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-user.900',
          refreshToken: 'refresh.platform-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(createPlatformApiResponse(createdPlatformOrder))
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        ...createdPlatformOrder,
        status: 'loading',
        deliveryAddress: '南山平台详情门店',
        updatedAtIso: '2026-07-01T09:00:00.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010777',
      platformOrderId: 'order-platform-777',
      to: '南山门店新址',
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'home-recent-order-HY202607010777' })
        .props.onPress();
      await flushMicrotasks();
    });

    const orderDetailCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders/order-platform-777',
      method: 'GET',
    });
    expect(orderDetailCall).toBeDefined();
    expect(getFetchCallHeaders(orderDetailCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-user.900',
      }),
    );
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607010777',
      platformOrderId: 'order-platform-777',
      status: 'loading',
      to: '南山平台详情门店',
    });
    expect(getRenderedText(app)).toContain('南山平台详情门店');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps the current platform order detail selected when refresh changes the display order id', async () => {
  const originalFetch = globalThis.fetch;
  await AsyncStorage.setItem(
    '@vireCodeing/app-runtime-state',
    JSON.stringify({
      version: 1,
      state: {
        orders: [
          {
            id: 'HY-FIRST-LOCAL',
            platformOrderId: 'order-platform-first',
            status: 'waiting',
            from: '第一单装货地',
            to: '第一单卸货地',
            cargoType: '建材',
            weightText: '2 吨',
            quantityText: '10 件',
            vehicleRequirement: 'medium',
            priceText: '￥300',
            updatedAtText: '本地第一单',
          },
          {
            id: 'HYLOCAL-TEMP-DETAIL',
            platformOrderId: 'order-platform-temp-detail',
            status: 'waiting',
            from: '第二单旧装货地',
            to: '第二单旧卸货地',
            cargoType: '数码设备',
            weightText: '1 吨',
            quantityText: '8 箱',
            vehicleRequirement: 'medium',
            priceText: '￥500',
            updatedAtText: '本地第二单',
          },
        ],
        messages: [],
      },
    }),
  );

  const refreshedPlatformOrder = createPlatformOrderFixture({
    id: 'order-platform-temp-detail',
    orderNo: 'HY202607030301',
    pickupAddress: '第二单平台正式装货地',
    deliveryAddress: '第二单平台正式卸货地',
    updatedAtIso: '2026-07-03T08:30:00.000Z',
  });
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-detail-id-change',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-detail-id-change.900',
          refreshToken: 'refresh.platform-detail-id-change.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(refreshedPlatformOrder));

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-03T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'home-recent-order-HYLOCAL-TEMP-DETAIL' })
        .props.onPress();
      await flushMicrotasks();
    });

    const orderDetailCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders/order-platform-temp-detail',
      method: 'GET',
    });
    expect(orderDetailCall).toBeDefined();
    expect(getFetchCallHeaders(orderDetailCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-detail-id-change.900',
      }),
    );
    expect(getAppRuntimeState().orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'HY202607030301',
          platformOrderId: 'order-platform-temp-detail',
          to: '第二单平台正式卸货地',
        }),
      ]),
    );
    expect(getRenderedText(app)).toContain('第二单平台正式卸货地');
    expect(getRenderedText(app)).not.toContain('第一单卸货地');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses platform order list query when opening a filtered status list', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-list',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-list-user.900',
          refreshToken: 'refresh.platform-list-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [
          {
            id: 'order-platform-confirming',
            orderNo: 'HY202607020001',
            shipperId: 'user-platform-order-list',
            status: 'confirming',
            cargoType: 'food',
            weightText: '3 吨',
            quantityText: '20 箱',
            pickupAddress: '平台筛选装货地',
            pickupContact: '赵经理',
            pickupPhone: '13800138001',
            deliveryAddress: '平台筛选卸货地',
            deliveryContact: '钱店长',
            deliveryPhone: '13800138002',
            vehicleRequirement: 'medium',
            needTailboard: false,
            needTarp: false,
            pickupTimeIso: '2026-07-02T01:30:00.000Z',
            pricingMode: 'fixed',
            priceCents: 88000,
            paymentMethod: 'cod',
            createdAtIso: '2026-07-01T08:00:00.000Z',
            updatedAtIso: '2026-07-01T09:00:00.000Z',
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-status-confirming' }).props.onPress();
      await flushMicrotasks();
    });

    const filteredListCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders?status=confirming&page=1&pageSize=20',
      method: 'GET',
    });
    expect(filteredListCall).toBeDefined();
    expect(getFetchCallHeaders(filteredListCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-list-user.900',
      }),
    );
    expect(getRenderedText(app)).toContain('平台筛选卸货地');
    expect(getAppRuntimeState().orders).toHaveLength(1);
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607020001',
      platformOrderId: 'order-platform-confirming',
      status: 'confirming',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses platform order list query when changing order list filters', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-filter-list',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-filter-user.900',
          refreshToken: 'refresh.platform-filter-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValue(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const now = new Date('2026-07-01T08:00:00.000Z').getTime();
    const app = await renderApp(now, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-orders-view-all' }).props.onPress();
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'orders-search' }).props.onChangeText(
        '南山门店',
      );
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'orders-time-today' }).props.onPress();
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'orders-tab-completed' }).props.onPress();
      await flushMicrotasks();
    });

    const todayRange = createLocalDayIsoRange(now);

    const initialListCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders?page=1&pageSize=20',
      method: 'GET',
    });
    expect(initialListCall).toBeDefined();
    expect(getFetchCallHeaders(initialListCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-filter-user.900',
      }),
    );
    expect(
      findFetchCall(fetchMock, {
        url: 'http://localhost:3000/api/shipper/orders?keyword=%E5%8D%97%E5%B1%B1%E9%97%A8%E5%BA%97&page=1&pageSize=20',
        method: 'GET',
      }),
    ).toBeDefined();
    expect(
      findFetchCall(fetchMock, {
        url: `http://localhost:3000/api/shipper/orders?keyword=%E5%8D%97%E5%B1%B1%E9%97%A8%E5%BA%97&createdFromIso=${encodeURIComponent(
          todayRange.createdFromIso,
        )}&createdToIso=${encodeURIComponent(
          todayRange.createdToIso,
        )}&page=1&pageSize=20`,
        method: 'GET',
      }),
    ).toBeDefined();
    expect(
      findFetchCall(fetchMock, {
        url: `http://localhost:3000/api/shipper/orders?status=completed&keyword=%E5%8D%97%E5%B1%B1%E9%97%A8%E5%BA%97&createdFromIso=${encodeURIComponent(
          todayRange.createdFromIso,
        )}&createdToIso=${encodeURIComponent(
          todayRange.createdToIso,
        )}&page=1&pageSize=20`,
        method: 'GET',
      }),
    ).toBeDefined();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses platform status collection query for the active order list filter', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-active-list',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-active-user.900',
          refreshToken: 'refresh.platform-active-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValue(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-orders-view-all' }).props.onPress();
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'orders-tab-active' }).props.onPress();
      await flushMicrotasks();
    });

    const activeListCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders?statuses=loading%2Ctransporting&page=1&pageSize=20',
      method: 'GET',
    });
    expect(activeListCall).toBeDefined();
    expect(getFetchCallHeaders(activeListCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-active-user.900',
      }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loads the next platform order list page and appends it locally', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-paged-list',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-paged-user.900',
          refreshToken: 'refresh.platform-paged-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [
          createPlatformOrderFixture({
            id: 'order-platform-page-1',
            orderNo: 'HY202607020101',
            deliveryAddress: '第一页平台卸货地',
          }),
        ],
        page: 1,
        pageSize: 20,
        total: 2,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [
          createPlatformOrderFixture({
            id: 'order-platform-page-2',
            orderNo: 'HY202607020102',
            deliveryAddress: '第二页平台卸货地',
          }),
        ],
        page: 2,
        pageSize: 20,
        total: 2,
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-orders-view-all' }).props.onPress();
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'orders-load-more' }).props.onPress();
      await flushMicrotasks();
    });

    const firstPageCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders?page=1&pageSize=20',
      method: 'GET',
    });
    expect(firstPageCall).toBeDefined();
    expect(getFetchCallHeaders(firstPageCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-paged-user.900',
      }),
    );
    const secondPageCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders?page=2&pageSize=20',
      method: 'GET',
    });
    expect(secondPageCall).toBeDefined();
    expect(getFetchCallHeaders(secondPageCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-paged-user.900',
      }),
    );
    expect(getRenderedText(app)).toContain('第一页平台卸货地');
    expect(getRenderedText(app)).toContain('第二页平台卸货地');
    expect(getAppRuntimeState().orders).toHaveLength(2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shows a local notice when platform order list refresh fails', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-list-failure',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-list-user.900',
          refreshToken: 'refresh.platform-list-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'));

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-orders-view-all' }).props.onPress();
      await flushMicrotasks();
    });

    const orderListCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders?page=1&pageSize=20',
      method: 'GET',
    });
    expect(orderListCall).toBeDefined();
    expect(getFetchCallHeaders(orderListCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-list-user.900',
      }),
    );
    expect(getRenderedText(app)).toContain(
      '平台订单列表刷新失败，已保留本地订单列表。',
    );
    expect(getAppRuntimeState().orders.length).toBeGreaterThan(0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shows a relogin notice when platform order list refresh has no auth token', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-list-missing-auth',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-list-missing-auth.900',
          refreshToken: 'refresh.platform-list-missing-auth.604800',
          expiresIn: 900,
        },
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);
    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/shipper/orders?page=1&pageSize=20',
        method: 'GET',
      }),
    ).toHaveLength(0);

    clearAuthSession();

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-orders-view-all' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      findFetchCalls(fetchMock, {
        url: 'http://localhost:3000/api/shipper/orders?page=1&pageSize=20',
        method: 'GET',
      }),
    ).toHaveLength(0);
    expect(getRenderedText(app)).toContain(
      '平台订单列表刷新需要重新登录后再同步。',
    );
    expect(getAppRuntimeState().orders.length).toBeGreaterThan(0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('clears stale platform pagination when a new order list refresh fails', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-stale-paging-failure',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-stale-paging-user.900',
          refreshToken: 'refresh.platform-stale-paging-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [
          createPlatformOrderFixture({
            id: 'order-platform-stale-paging-page-1',
            orderNo: 'HY202607020301',
            deliveryAddress: '旧查询第一页平台卸货地',
          }),
        ],
        page: 1,
        pageSize: 20,
        total: 2,
      }),
    )
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'));

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-orders-view-all' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      app.root.findAll(
        node =>
          node.props.testID === 'orders-load-more' &&
          typeof node.props.onPress === 'function',
      ),
    ).toHaveLength(1);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'orders-search' }).props.onChangeText(
        '失败的新查询',
      );
      await flushMicrotasks();
    });

    const refreshedListCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders?keyword=%E5%A4%B1%E8%B4%A5%E7%9A%84%E6%96%B0%E6%9F%A5%E8%AF%A2&page=1&pageSize=20',
      method: 'GET',
    });
    expect(refreshedListCall).toBeDefined();
    expect(getFetchCallHeaders(refreshedListCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-stale-paging-user.900',
      }),
    );
    expect(getRenderedText(app)).toContain(
      '平台订单列表刷新失败，已保留本地订单列表。',
    );
    expect(
      app.root.findAll(
        node =>
          node.props.testID === 'orders-load-more' &&
          typeof node.props.onPress === 'function',
      ),
    ).toHaveLength(0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps failed local order creations when platform order list refresh succeeds', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-list-local-failed-order',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-list-local-failed-order.900',
          refreshToken: 'refresh.platform-list-local-failed-order.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverCertificationSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverAcceptanceSettingsSnapshot()),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    const failedOrderId = getAppRuntimeState().orders[0].id;

    expect(getAppRuntimeState().orders[0].syncState).toMatchObject({
      status: 'failed',
      operation: 'create',
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-orders-view-all' }).props.onPress();
      await flushMicrotasks();
    });

    const orderListCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders?page=1&pageSize=20',
      method: 'GET',
    });
    expect(orderListCall).toBeDefined();
    expect(getFetchCallHeaders(orderListCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-list-local-failed-order.900',
      }),
    );
    expect(getAppRuntimeState().orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: failedOrderId,
          syncState: expect.objectContaining({
            status: 'failed',
            operation: 'create',
          }),
        }),
      ]),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps platform pagination available when local failed order creations are preserved', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-list-local-failed-order-paged',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-list-local-failed-order-paged.900',
          refreshToken: 'refresh.platform-list-local-failed-order-paged.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [
          createPlatformOrderFixture({
            id: 'order-platform-local-failed-page-1',
            orderNo: 'HY202607020201',
            deliveryAddress: '平台第一页有本地失败单',
          }),
        ],
        page: 1,
        pageSize: 20,
        total: 2,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [
          createPlatformOrderFixture({
            id: 'order-platform-local-failed-page-2',
            orderNo: 'HY202607020202',
            deliveryAddress: '平台第二页仍可加载',
          }),
        ],
        page: 2,
        pageSize: 20,
        total: 2,
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-orders-view-all' }).props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'orders-load-more' }).props.onPress();
      await flushMicrotasks();
    });

    const secondPageCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders?page=2&pageSize=20',
      method: 'GET',
    });
    expect(secondPageCall).toBeDefined();
    expect(getFetchCallHeaders(secondPageCall)).toEqual(
      expect.objectContaining({
        Authorization:
          'Bearer access.platform-list-local-failed-order-paged.900',
      }),
    );
    expect(getRenderedText(app)).toContain('平台第二页仍可加载');
    expect(getAppRuntimeState().orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'HYLOCAL001',
          syncState: expect.objectContaining({
            status: 'failed',
            operation: 'create',
          }),
        }),
        expect.objectContaining({
          id: 'HY202607020201',
          platformOrderId: 'order-platform-local-failed-page-1',
        }),
        expect.objectContaining({
          id: 'HY202607020202',
          platformOrderId: 'order-platform-local-failed-page-2',
        }),
      ]),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps failed local order creations when opening a filtered platform order list', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-filter-local-failed-order',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-filter-local-failed-order.900',
          refreshToken: 'refresh.platform-filter-local-failed-order.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverCertificationSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverAcceptanceSettingsSnapshot()),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    const failedOrderId = getAppRuntimeState().orders[0].id;

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-status-completed' }).props.onPress();
      await flushMicrotasks();
    });

    const filteredListCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders?status=completed&page=1&pageSize=20',
      method: 'GET',
    });
    expect(filteredListCall).toBeDefined();
    expect(getFetchCallHeaders(filteredListCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-filter-local-failed-order.900',
      }),
    );
    expect(getAppRuntimeState().orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: failedOrderId,
          status: 'waiting',
          syncState: expect.objectContaining({
            status: 'failed',
            operation: 'create',
          }),
        }),
      ]),
    );
    expect(getRenderedText(app)).toContain('暂无订单');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('marks the current order sync state when platform order detail refresh fails', async () => {
  const originalFetch = globalThis.fetch;
  const createdPlatformOrder = {
    id: 'order-platform-778',
    orderNo: 'HY202607010778',
    shipperId: 'user-platform-order-detail-failure',
    status: 'waiting',
    cargoType: 'digital',
    weightText: '1.8 吨',
    quantityText: '18 箱',
    cargoDescription: '高价值设备，轻拿轻放',
    cargoPhotoCount: 0,
    pickupAddress: '宝安临时仓',
    pickupContact: '赵经理',
    pickupPhone: '13800138001',
    deliveryAddress: '南山门店新址',
    deliveryContact: '钱店长',
    deliveryPhone: '13800138002',
    vehicleRequirement: 'medium',
    needTailboard: false,
    needTarp: false,
    pickupTimeIso: '2026-07-02T01:30:00.000Z',
    pricingMode: 'fixed',
    priceCents: 76000,
    paymentMethod: 'cod',
    createdAtIso: '2026-07-01T08:00:00.000Z',
    updatedAtIso: '2026-07-01T08:00:00.000Z',
  };
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-detail-failure',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-detail-user.900',
          refreshToken: 'refresh.platform-detail-user.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(createPlatformApiResponse(createdPlatformOrder))
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        ...createdPlatformOrder,
        pickupAddress: '平台刷新后装货仓',
        deliveryAddress: '平台刷新后卸货点',
        updatedAtIso: '2026-07-01T08:10:00.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'home-recent-order-HY202607010778' })
        .props.onPress();
      await flushMicrotasks();
    });

    const initialDetailRefreshCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders/order-platform-778',
      method: 'GET',
    });
    expect(initialDetailRefreshCall).toBeDefined();
    expect(getFetchCallHeaders(initialDetailRefreshCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-detail-user.900',
      }),
    );
    expect(getAppRuntimeState().orders[0].syncState).toMatchObject({
      status: 'failed',
      operation: 'refresh',
      message: '平台订单详情刷新失败，已保留本地订单详情。',
    });
    expect(getRenderedText(app)).toContain(
      '平台订单详情刷新失败，已保留本地订单详情。',
    );

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'order-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const retriedDetailRefreshCalls = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders/order-platform-778',
      method: 'GET',
    });
    expect(retriedDetailRefreshCalls).toHaveLength(2);
    expect(getFetchCallHeaders(findLastFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders/order-platform-778',
      method: 'GET',
    }))).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-detail-user.900',
      }),
    );
    const orderCreateCalls = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders',
      method: 'POST',
    });
    expect(orderCreateCalls).toHaveLength(1);
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      from: '平台刷新后装货仓',
      to: '平台刷新后卸货点',
      syncState: { status: 'synced' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps platform order detail refresh queued when opening detail has no auth token', async () => {
  const originalFetch = globalThis.fetch;
  const createdPlatformOrder = createPlatformOrderFixture({
    id: 'order-platform-detail-missing-token-778',
    orderNo: 'HY202607010788',
    shipperId: 'user-platform-order-detail-missing-token',
    status: 'waiting',
    cargoType: 'digital',
    weightText: '1.8 吨',
    quantityText: '18 箱',
    pickupAddress: '宝安临时仓',
    deliveryAddress: '南山门店新址',
    priceCents: 76000,
    createdAtIso: '2026-07-01T08:00:00.000Z',
    updatedAtIso: '2026-07-01T08:00:00.000Z',
  });
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-detail-missing-token',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-detail-missing-token.900',
          refreshToken: 'refresh.platform-detail-missing-token.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(createPlatformApiResponse(createdPlatformOrder));

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-01T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    clearAuthSession();

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'home-recent-order-HY202607010788' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(getAppRuntimeState().orders[0].syncState).toMatchObject({
      status: 'failed',
      operation: 'refresh',
      message: '平台订单详情刷新需要重新登录后再同步。',
    });
    expect(getAppRuntimeState().orders[0].syncState?.queueItems).toHaveLength(1);
    expect(getRenderedText(app)).toContain(
      '平台订单详情刷新需要重新登录后再同步。',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('persists local order progress to device storage', async () => {
  const now = new Date('2026-06-30T08:00:00+08:00').getTime();
  const app = await renderApp(now);

  await loginToHome(app);
  await openFirstRecentOrder(app);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-progress-action' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'order-detail-progress-action' })
      .props.onPress();
  });

  expect(getAppRuntimeState().orders[0].status).toBe('transporting');

  await flushMicrotasks();

  const storedState = await getStoredSnapshot<{
    state: {
      orders: Array<{
        status: string;
        updatedAtIso?: string;
        updatedAtText: string;
      }>;
    };
  }>('@vireCodeing/app-runtime-state');

  expect(storedState.state.orders[0]).toMatchObject({
    status: 'transporting',
    updatedAtIso: new Date(now).toISOString(),
    updatedAtText: '货物运输中 · 刚刚',
  });
});

test('hides waiting-to-loading platform status advance and keeps waiting state', async () => {
  const originalFetch = globalThis.fetch;
  const createdPlatformOrder = createPlatformOrderFixture({
    id: 'order-platform-status-1',
    orderNo: 'HY202607030001',
    shipperId: 'user-platform-order-status',
    status: 'waiting',
    cargoType: 'digital',
    weightText: '1.8 吨',
    quantityText: '18 箱',
    pickupAddress: '宝安临时仓',
    deliveryAddress: '南山门店新址',
  });
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-status',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-status.900',
          refreshToken: 'refresh.platform-order-status.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(createPlatformApiResponse(createdPlatformOrder));

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-03T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      app.root.findAllByProps({ testID: 'order-detail-progress-action' }),
    ).toHaveLength(0);
    expect(
      findFetchCall(fetchMock, {
        url: 'http://localhost:3000/api/shipper/orders/order-platform-status-1/status',
        method: 'POST',
      }),
    ).toBeUndefined();
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607030001',
      platformOrderId: 'order-platform-status-1',
      status: 'waiting',
      syncState: { status: 'synced' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('retries a failed platform order status advance through the status api', async () => {
  const originalFetch = globalThis.fetch;
  const createdPlatformOrder = createPlatformOrderFixture({
    id: 'order-platform-status-retry',
    orderNo: 'HY202607030002',
    shipperId: 'user-platform-order-status-retry',
    status: 'loading',
    cargoType: 'digital',
    weightText: '1.8 吨',
    quantityText: '18 箱',
    pickupAddress: '宝安临时仓',
    deliveryAddress: '南山门店新址',
  });
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-status-retry',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-status-retry.900',
          refreshToken: 'refresh.platform-order-status-retry.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(createPlatformApiResponse(createdPlatformOrder))
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        ...createdPlatformOrder,
        status: 'transporting',
        updatedAtIso: '2026-07-03T09:00:00.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-03T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'order-detail-progress-action' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607030002',
      platformOrderId: 'order-platform-status-retry',
      status: 'transporting',
      syncState: {
        status: 'failed',
        operation: 'status',
      },
    });
    const statusRetryContext =
      getAppRuntimeState().orders[0].syncState?.mutationContext;
    expectOrderMutationContext(
      statusRetryContext,
      '2026-07-01T09:00:00.000Z',
    );

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'order-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const statusRetryCalls = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders/order-platform-status-retry/status',
      method: 'POST',
    });
    expect(statusRetryCalls).toHaveLength(2);
    expect(
      getFetchCallHeaders(findLastFetchCall(fetchMock, {
        url: 'http://localhost:3000/api/shipper/orders/order-platform-status-retry/status',
        method: 'POST',
      })),
    ).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-order-status-retry.900',
        'Idempotency-Key': statusRetryContext?.idempotencyKey,
      }),
    );
    expect(
      getFetchCallBody(
        findLastFetchCall(fetchMock, {
          url: 'http://localhost:3000/api/shipper/orders/order-platform-status-retry/status',
          method: 'POST',
        }),
      ),
    ).toMatchObject({
      baseUpdatedAtIso: statusRetryContext?.baseUpdatedAtIso,
      nextStatus: 'transporting',
    });
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607030002',
      platformOrderId: 'order-platform-status-retry',
      status: 'transporting',
      syncState: { status: 'synced' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reports a platform order exception through the exception api', async () => {
  const originalFetch = globalThis.fetch;
  const transportingPlatformOrder = createPlatformOrderFixture({
    id: 'order-platform-exception-1',
    orderNo: 'HY202607030003',
    shipperId: 'user-platform-order-exception',
    status: 'transporting',
    cargoType: 'digital',
    weightText: '1.8 吨',
    quantityText: '18 箱',
    pickupAddress: '宝安临时仓',
    deliveryAddress: '南山门店新址',
  });
  const fetchMock = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(url);
    const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (requestUrl.endsWith('/auth/send-code')) {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (requestUrl.endsWith('/auth/login')) {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-order-exception',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-order-exception.900',
            refreshToken: 'refresh.platform-order-exception.604800',
            expiresIn: 900,
          },
        }),
      );
    }

    if (requestUrl.endsWith('/shipper/order-draft')) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (requestUrl.endsWith('/shipper/orders') && init?.method === 'POST') {
      return Promise.resolve(createPlatformApiResponse(transportingPlatformOrder));
    }

    if (requestUrl.endsWith('/files/upload-intents')) {
      expect(requestBody).toMatchObject({
        purpose: 'exception',
        fileName: '异常图片凭证.png',
        contentType: 'image/png',
      });

      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-exception-fast-1',
          ownerUserId: 'user-platform-order-exception',
          purpose: 'exception',
          objectKey:
            'user-platform-order-exception/exception/file-exception-fast-1.png',
          status: 'pending',
          uploadUrl:
            'http://localhost:3000/api/files/uploads/file-exception-fast-1',
          publicUrl: 'https://cdn.example.com/file-exception-fast-1.png',
          expiresAtIso: '2026-07-03T09:10:00.000Z',
          createdAtIso: '2026-07-03T08:55:00.000Z',
        }),
      );
    }

    if (requestUrl.endsWith('/files/uploads/file-exception-fast-1')) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-exception-fast-1',
          ownerUserId: 'user-platform-order-exception',
          purpose: 'exception',
          objectKey:
            'user-platform-order-exception/exception/file-exception-fast-1.png',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-exception-fast-1.png',
          createdAtIso: '2026-07-03T08:55:00.000Z',
        }),
      );
    }

    if (
      requestUrl.endsWith('/shipper/orders/order-platform-exception-1/exception')
    ) {
      expect(requestBody).toEqual({
        typeLabel: '司机延误',
        description: '司机反馈高速拥堵，预计晚到 40 分钟',
        photoCount: 1,
      });

      return Promise.resolve(
        createPlatformApiResponse({
          ...transportingPlatformOrder,
          updatedAtIso: '2026-07-03T09:10:00.000Z',
        }),
      );
    }

    if (
      requestUrl.endsWith('/shipper/orders/order-platform-exception-1/status')
    ) {
      expect(requestBody).toMatchObject({
        baseUpdatedAtIso: '2026-07-03T09:10:00.000Z',
        nextStatus: 'confirming',
      });

      return Promise.resolve(
        createPlatformApiResponse({
          ...transportingPlatformOrder,
          status: 'confirming',
          updatedAtIso: '2026-07-03T09:20:00.000Z',
        }),
      );
    }

    if (requestUrl === 'http://localhost:3000/api/shipper/orders?page=1&pageSize=20') {
      return Promise.resolve(
        createPlatformApiResponse({
          items: [
            {
              ...transportingPlatformOrder,
              status: 'confirming',
              deliveryAddress: '南山列表刷新后门店',
              updatedAtIso: '2026-07-03T09:30:00.000Z',
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
        }),
      );
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-03T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'order-detail-secondary-action' })
        .props.onPress();
    });

    mockSelectedImageUpload('exception-fast-upload.png');

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'exception-type-delay' }).props.onPress();
      app.root
        .findByProps({ testID: 'exception-description' })
        .props.onChangeText('司机反馈高速拥堵，预计晚到 40 分钟');
      app.root.findByProps({ testID: 'exception-photo-add' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'exception-submit' }).props.onPress();
      await flushMicrotasks();
    });

    const exceptionSubmitCall = fetchMock.mock.calls.find(([url]) => {
      return (
        url ===
        'http://localhost:3000/api/shipper/orders/order-platform-exception-1/exception'
      );
    });
    expect(exceptionSubmitCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-order-exception.900',
        }),
        body: JSON.stringify({
          typeLabel: '司机延误',
          description: '司机反馈高速拥堵，预计晚到 40 分钟',
          photoCount: 1,
        }),
      }),
    );
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607030003',
      platformOrderId: 'order-platform-exception-1',
      status: 'transporting',
      exceptionReport: {
        typeLabel: '司机延误',
        description: '司机反馈高速拥堵，预计晚到 40 分钟',
        photoCount: 1,
        statusText: '待客服跟进',
      },
      syncState: { status: 'synced' },
    });

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'order-detail-progress-action' })
        .props.onPress();
      await flushMicrotasks();
    });

    const statusSubmitCall = fetchMock.mock.calls.find(([url]) => {
      return (
        url ===
        'http://localhost:3000/api/shipper/orders/order-platform-exception-1/status'
      );
    });
    expect(statusSubmitCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-order-exception.900',
          'Idempotency-Key': expect.stringMatching(uuidV4Pattern),
        }),
        body: JSON.stringify({
          baseUpdatedAtIso: '2026-07-03T09:10:00.000Z',
          nextStatus: 'confirming',
        }),
      }),
    );
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607030003',
      platformOrderId: 'order-platform-exception-1',
      status: 'confirming',
      exceptionReport: {
        typeLabel: '司机延误',
        description: '司机反馈高速拥堵，预计晚到 40 分钟',
        photoCount: 1,
        statusText: '待客服跟进',
      },
      syncState: { status: 'synced' },
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-orders-view-all' }).props.onPress();
      await flushMicrotasks();
    });

    const orderListCall = fetchMock.mock.calls.find(([url]) => {
      return url === 'http://localhost:3000/api/shipper/orders?page=1&pageSize=20';
    });
    expect(orderListCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-order-exception.900',
        }),
      }),
    );
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607030003',
      platformOrderId: 'order-platform-exception-1',
      status: 'confirming',
      to: '南山列表刷新后门店',
      exceptionReport: {
        typeLabel: '司机延误',
        description: '司机反馈高速拥堵，预计晚到 40 分钟',
        photoCount: 1,
        statusText: '待客服跟进',
      },
      syncState: { status: 'synced' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('attaches platform file objects to exception report photos', async () => {
  const originalFetch = globalThis.fetch;
  const transportingPlatformOrder = createPlatformOrderFixture({
    id: 'order-platform-exception-file',
    orderNo: 'HY202607030006',
    shipperId: 'user-platform-order-exception-file',
    status: 'transporting',
    cargoType: 'digital',
    weightText: '1.8 吨',
    quantityText: '18 箱',
    pickupAddress: '宝安临时仓',
    deliveryAddress: '南山门店新址',
  });
  let exceptionUploadCount = 0;
  const fetchMock = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(url);
    const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (requestUrl.endsWith('/auth/send-code')) {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (requestUrl.endsWith('/auth/login')) {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-order-exception-file',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-order-exception-file.900',
            refreshToken: 'refresh.platform-order-exception-file.604800',
            expiresIn: 900,
          },
        }),
      );
    }

    if (requestUrl.endsWith('/shipper/order-draft')) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (
      requestUrl.endsWith('/shipper/orders') &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(createPlatformApiResponse(transportingPlatformOrder));
    }

    if (requestUrl.endsWith('/files/upload-intents')) {
      expect(requestBody).toMatchObject({
        purpose: 'exception',
        fileName: '异常图片凭证.png',
        contentType: 'image/png',
      });

      exceptionUploadCount += 1;
      const fileId = `file-exception-${exceptionUploadCount}`;

      return Promise.resolve(
        createPlatformApiResponse({
          id: fileId,
          ownerUserId: 'user-platform-order-exception-file',
          purpose: 'exception',
          objectKey: `user-platform-order-exception-file/exception/${fileId}.png`,
          status: 'pending',
          uploadUrl: `http://localhost:3000/api/files/uploads/${fileId}`,
          publicUrl: `https://cdn.example.com/${fileId}.png`,
          expiresAtIso: '2026-07-03T09:10:00.000Z',
          createdAtIso: '2026-07-03T08:55:00.000Z',
        }),
      );
    }

    if (requestUrl.endsWith('/files/uploads/file-exception-1')) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-exception-1',
          ownerUserId: 'user-platform-order-exception-file',
          purpose: 'exception',
          objectKey:
            'user-platform-order-exception-file/exception/file-exception-1.png',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-exception-1.png',
          createdAtIso: '2026-07-03T08:55:00.000Z',
        }),
      );
    }

    if (requestUrl.endsWith('/files/uploads/file-exception-2')) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-exception-2',
          ownerUserId: 'user-platform-order-exception-file',
          purpose: 'exception',
          objectKey:
            'user-platform-order-exception-file/exception/file-exception-2.png',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-exception-2.png',
          createdAtIso: '2026-07-03T08:56:00.000Z',
        }),
      );
    }

    if (
      requestUrl.endsWith(
        '/shipper/orders/order-platform-exception-file/exception',
      )
    ) {
      expect(requestBody).toEqual({
        typeLabel: '司机延误',
        description: '司机反馈高速拥堵，预计晚到 40 分钟',
        photoCount: 2,
        photoFileIds: ['file-exception-1', 'file-exception-2'],
      });

      return Promise.resolve(
        createPlatformApiResponse({
          ...transportingPlatformOrder,
          updatedAtIso: '2026-07-03T09:10:00.000Z',
        }),
      );
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-03T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'order-detail-secondary-action' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'exception-type-delay' }).props.onPress();
      app.root
        .findByProps({ testID: 'exception-description' })
        .props.onChangeText('司机反馈高速拥堵，预计晚到 40 分钟');
    });

    mockSelectedImageUpload('exception-upload.png');

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'exception-photo-add' }).props.onPress();
      await flushMicrotasks();
    });
    mockSelectedImageUpload('exception-upload-2.png');
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'exception-photo-add' }).props.onPress();
      await flushMicrotasks();
    });

    let renderedText = getRenderedText(app);

    expect(renderedText).toContain('异常图片凭证清单');
    expect(renderedText).toContain('异常图片凭证：异常图片凭证.png');
    expect(renderedText).toContain('异常图片凭证：异常图片凭证2.png');
    expect(renderedText).toContain('来源：平台文件对象（已上传）');
    expect(renderedText).toContain('文件 ID：file-exception-1');
    expect(renderedText).toContain('文件 ID：file-exception-2');
    expect(renderedText).not.toContain('本地图片凭证 1：本地已保存');
    expect(
      app.root.findByProps({ testID: 'exception-photo-preview-image-1' }).props
        .source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-exception-1.png',
    });
    expect(
      app.root.findByProps({ testID: 'exception-photo-preview-image-2' }).props
        .source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-exception-2.png',
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'exception-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith('/files/upload-intents'),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith('/files/uploads/file-exception-1'),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith('/files/uploads/file-exception-2'),
      ),
    ).toBe(true);
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607030006',
      platformOrderId: 'order-platform-exception-file',
      exceptionReport: {
        typeLabel: '司机延误',
        description: '司机反馈高速拥堵，预计晚到 40 分钟',
        photoCount: 2,
        photoFiles: [
          {
            fileId: 'file-exception-1',
            fileName: '异常图片凭证.png',
            purpose: 'exception',
            status: 'uploaded',
            publicUrl: 'https://cdn.example.com/file-exception-1.png',
          },
          {
            fileId: 'file-exception-2',
            fileName: '异常图片凭证2.png',
            purpose: 'exception',
            status: 'uploaded',
            publicUrl: 'https://cdn.example.com/file-exception-2.png',
          },
        ],
      },
      syncState: { status: 'synced' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('retries a failed platform order exception report through the exception api', async () => {
  const originalFetch = globalThis.fetch;
  const transportingPlatformOrder = createPlatformOrderFixture({
    id: 'order-platform-exception-retry',
    orderNo: 'HY202607030004',
    shipperId: 'user-platform-order-exception-retry',
    status: 'transporting',
    cargoType: 'digital',
    weightText: '1.8 吨',
    quantityText: '18 箱',
    pickupAddress: '宝安临时仓',
    deliveryAddress: '南山门店新址',
  });
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-exception-retry',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-exception-retry.900',
          refreshToken: 'refresh.platform-order-exception-retry.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(createPlatformApiResponse(transportingPlatformOrder))
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        ...transportingPlatformOrder,
        updatedAtIso: '2026-07-03T09:20:00.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-03T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'order-detail-secondary-action' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'exception-type-delay' }).props.onPress();
      app.root
        .findByProps({ testID: 'exception-description' })
        .props.onChangeText('司机反馈高速拥堵，预计晚到 40 分钟');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'exception-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607030004',
      platformOrderId: 'order-platform-exception-retry',
      exceptionReport: {
        typeLabel: '司机延误',
        description: '司机反馈高速拥堵，预计晚到 40 分钟',
      },
      syncState: {
        status: 'failed',
        operation: 'exception',
      },
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'order-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const exceptionRetryCalls = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders/order-platform-exception-retry/exception',
      method: 'POST',
    });
    expect(exceptionRetryCalls).toHaveLength(2);
    expect(
      getFetchCallHeaders(findLastFetchCall(fetchMock, {
        url: 'http://localhost:3000/api/shipper/orders/order-platform-exception-retry/exception',
        method: 'POST',
      })),
    ).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-order-exception-retry.900',
      }),
    );
    expect(
      getFetchCallBody(
        findLastFetchCall(fetchMock, {
          url: 'http://localhost:3000/api/shipper/orders/order-platform-exception-retry/exception',
          method: 'POST',
        }),
      ),
    ).toMatchObject({
      typeLabel: '司机延误',
      description: '司机反馈高速拥堵，预计晚到 40 分钟',
    });
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607030004',
      platformOrderId: 'order-platform-exception-retry',
      exceptionReport: {
        typeLabel: '司机延误',
        description: '司机反馈高速拥堵，预计晚到 40 分钟',
      },
      syncState: { status: 'synced' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('submits a platform order evaluation through the evaluation api', async () => {
  const originalFetch = globalThis.fetch;
  const completedPlatformOrder = createPlatformOrderFixture({
    id: 'order-platform-evaluation-1',
    orderNo: 'HY202607030005',
    shipperId: 'user-platform-order-evaluation',
    status: 'completed',
    cargoType: 'digital',
    weightText: '1.8 吨',
    quantityText: '18 箱',
    pickupAddress: '宝安临时仓',
    deliveryAddress: '南山门店新址',
  });
  const fetchMock = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(url);
    const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (requestUrl.endsWith('/auth/send-code')) {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (requestUrl.endsWith('/auth/login')) {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-order-evaluation',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-order-evaluation.900',
            refreshToken: 'refresh.platform-order-evaluation.604800',
            expiresIn: 900,
          },
        }),
      );
    }

    if (requestUrl.endsWith('/shipper/order-draft')) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (requestUrl.endsWith('/shipper/orders') && init?.method === 'POST') {
      return Promise.resolve(createPlatformApiResponse(completedPlatformOrder));
    }

    if (requestUrl.endsWith('/files/upload-intents')) {
      expect(requestBody).toMatchObject({
        purpose: 'evaluation',
        fileName: '评价图片凭证.png',
        contentType: 'image/png',
      });

      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-evaluation-fast-1',
          ownerUserId: 'user-platform-order-evaluation',
          purpose: 'evaluation',
          objectKey:
            'user-platform-order-evaluation/evaluation/file-evaluation-fast-1.png',
          status: 'pending',
          uploadUrl:
            'http://localhost:3000/api/files/uploads/file-evaluation-fast-1',
          publicUrl: 'https://cdn.example.com/file-evaluation-fast-1.png',
          expiresAtIso: '2026-07-03T09:20:00.000Z',
          createdAtIso: '2026-07-03T09:05:00.000Z',
        }),
      );
    }

    if (requestUrl.endsWith('/files/uploads/file-evaluation-fast-1')) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-evaluation-fast-1',
          ownerUserId: 'user-platform-order-evaluation',
          purpose: 'evaluation',
          objectKey:
            'user-platform-order-evaluation/evaluation/file-evaluation-fast-1.png',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-evaluation-fast-1.png',
          createdAtIso: '2026-07-03T09:05:00.000Z',
        }),
      );
    }

    if (
      requestUrl.endsWith('/shipper/orders/order-platform-evaluation-1/evaluation')
    ) {
      expect(requestBody).toEqual({
        rating: 5,
        tags: ['准时'],
        content: '司机服务细致，整体运输体验很好',
        anonymous: false,
        photoCount: 1,
      });

      return Promise.resolve(
        createPlatformApiResponse({
          ...completedPlatformOrder,
          updatedAtIso: '2026-07-03T09:30:00.000Z',
        }),
      );
    }

    if (
      requestUrl ===
        'http://localhost:3000/api/shipper/orders/order-platform-evaluation-1' &&
      init?.method === 'GET'
    ) {
      return Promise.resolve(
        createPlatformApiResponse({
          ...completedPlatformOrder,
          deliveryAddress: '南山刷新后门店',
          updatedAtIso: '2026-07-03T09:40:00.000Z',
        }),
      );
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-03T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'order-detail-primary-action' })
        .props.onPress();
    });

    mockSelectedImageUpload('evaluation-fast-upload.png');

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'evaluation-rating-5' }).props.onPress();
      app.root.findByProps({ testID: 'evaluation-tag-punctual' }).props.onPress();
      app.root.findByProps({ testID: 'evaluation-photo-add' }).props.onPress();
      app.root
        .findByProps({ testID: 'evaluation-content' })
        .props.onChangeText('司机服务细致，整体运输体验很好');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'evaluation-submit' }).props.onPress();
      await flushMicrotasks();
    });

    const evaluationSubmitCall = fetchMock.mock.calls.find(([url]) => {
      return (
        url ===
        'http://localhost:3000/api/shipper/orders/order-platform-evaluation-1/evaluation'
      );
    });
    expect(evaluationSubmitCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-order-evaluation.900',
        }),
        body: JSON.stringify({
          rating: 5,
          tags: ['准时'],
          content: '司机服务细致，整体运输体验很好',
          anonymous: false,
          photoCount: 1,
        }),
      }),
    );
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607030005',
      platformOrderId: 'order-platform-evaluation-1',
      status: 'completed',
      evaluation: {
        rating: 5,
        tags: ['准时'],
        content: '司机服务细致，整体运输体验很好',
        photoCount: 1,
      },
      syncState: { status: 'synced' },
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'order-detail-back' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'home-recent-order-HY202607030005' })
        .props.onPress();
      await flushMicrotasks();
    });

    const evaluationDetailCall = fetchMock.mock.calls.find(([url, init]) => {
      return (
        url ===
          'http://localhost:3000/api/shipper/orders/order-platform-evaluation-1' &&
        init?.method === 'GET'
      );
    });
    expect(evaluationDetailCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.platform-order-evaluation.900',
        }),
      }),
    );
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607030005',
      platformOrderId: 'order-platform-evaluation-1',
      to: '南山刷新后门店',
      evaluation: {
        rating: 5,
        tags: ['准时'],
        content: '司机服务细致，整体运输体验很好',
        photoCount: 1,
      },
      syncState: { status: 'synced' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('attaches platform file objects to evaluation photos', async () => {
  const originalFetch = globalThis.fetch;
  const completedPlatformOrder = createPlatformOrderFixture({
    id: 'order-platform-evaluation-file',
    orderNo: 'HY202607030007',
    shipperId: 'user-platform-order-evaluation-file',
    status: 'completed',
    cargoType: 'digital',
    weightText: '1.8 吨',
    quantityText: '18 箱',
    pickupAddress: '宝安临时仓',
    deliveryAddress: '南山门店新址',
  });
  let evaluationUploadCount = 0;
  const fetchMock = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(url);
    const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (requestUrl.endsWith('/auth/send-code')) {
      return Promise.resolve(
        createPlatformApiResponse({
          expireSeconds: 300,
          devCode: '999999',
        }),
      );
    }

    if (requestUrl.endsWith('/auth/login')) {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-order-evaluation-file',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access.platform-order-evaluation-file.900',
            refreshToken: 'refresh.platform-order-evaluation-file.604800',
            expiresIn: 900,
          },
        }),
      );
    }

    if (requestUrl.endsWith('/shipper/order-draft')) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (
      requestUrl.endsWith('/shipper/orders') &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(createPlatformApiResponse(completedPlatformOrder));
    }

    if (requestUrl.endsWith('/files/upload-intents')) {
      expect(requestBody).toMatchObject({
        purpose: 'evaluation',
        fileName: '评价图片凭证.png',
        contentType: 'image/png',
      });

      evaluationUploadCount += 1;
      const fileId = `file-evaluation-${evaluationUploadCount}`;

      return Promise.resolve(
        createPlatformApiResponse({
          id: fileId,
          ownerUserId: 'user-platform-order-evaluation-file',
          purpose: 'evaluation',
          objectKey:
            `user-platform-order-evaluation-file/evaluation/${fileId}.png`,
          status: 'pending',
          uploadUrl: `http://localhost:3000/api/files/uploads/${fileId}`,
          publicUrl: `https://cdn.example.com/${fileId}.png`,
          expiresAtIso: '2026-07-03T09:20:00.000Z',
          createdAtIso: '2026-07-03T09:05:00.000Z',
        }),
      );
    }

    if (requestUrl.endsWith('/files/uploads/file-evaluation-1')) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-evaluation-1',
          ownerUserId: 'user-platform-order-evaluation-file',
          purpose: 'evaluation',
          objectKey:
            'user-platform-order-evaluation-file/evaluation/file-evaluation-1.png',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-evaluation-1.png',
          createdAtIso: '2026-07-03T09:05:00.000Z',
        }),
      );
    }

    if (requestUrl.endsWith('/files/uploads/file-evaluation-2')) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-evaluation-2',
          ownerUserId: 'user-platform-order-evaluation-file',
          purpose: 'evaluation',
          objectKey:
            'user-platform-order-evaluation-file/evaluation/file-evaluation-2.png',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-evaluation-2.png',
          createdAtIso: '2026-07-03T09:06:00.000Z',
        }),
      );
    }

    if (
      requestUrl.endsWith(
        '/shipper/orders/order-platform-evaluation-file/evaluation',
      )
    ) {
      expect(requestBody).toEqual({
        rating: 5,
        tags: ['准时'],
        content: '司机服务细致，整体运输体验很好',
        anonymous: false,
        photoCount: 2,
        photoFileIds: ['file-evaluation-1', 'file-evaluation-2'],
      });

      return Promise.resolve(
        createPlatformApiResponse({
          ...completedPlatformOrder,
          updatedAtIso: '2026-07-03T09:20:00.000Z',
        }),
      );
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });
  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-03T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'order-detail-primary-action' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'evaluation-rating-5' }).props.onPress();
      app.root.findByProps({ testID: 'evaluation-tag-punctual' }).props.onPress();
      app.root
        .findByProps({ testID: 'evaluation-content' })
        .props.onChangeText('司机服务细致，整体运输体验很好');
    });

    mockSelectedImageUpload('evaluation-upload.png');

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'evaluation-photo-add' }).props.onPress();
      await flushMicrotasks();
    });
    mockSelectedImageUpload('evaluation-upload-2.png');
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'evaluation-photo-add' }).props.onPress();
      await flushMicrotasks();
    });

    let renderedText = getRenderedText(app);

    expect(renderedText).toContain('评价图片凭证清单');
    expect(renderedText).toContain('评价图片凭证：评价图片凭证.png');
    expect(renderedText).toContain('评价图片凭证：评价图片凭证2.png');
    expect(renderedText).toContain('来源：平台文件对象（已上传）');
    expect(renderedText).toContain('文件 ID：file-evaluation-1');
    expect(renderedText).toContain('文件 ID：file-evaluation-2');
    expect(renderedText).not.toContain('本地图片凭证 1：本地已保存');
    expect(
      app.root.findByProps({ testID: 'evaluation-photo-preview-image-1' }).props
        .source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-evaluation-1.png',
    });
    expect(
      app.root.findByProps({ testID: 'evaluation-photo-preview-image-2' }).props
        .source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-evaluation-2.png',
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'evaluation-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith('/files/upload-intents'),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith('/files/uploads/file-evaluation-1'),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith('/files/uploads/file-evaluation-2'),
      ),
    ).toBe(true);
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607030007',
      platformOrderId: 'order-platform-evaluation-file',
      evaluation: {
        rating: 5,
        tags: ['准时'],
        content: '司机服务细致，整体运输体验很好',
        photoCount: 2,
        photoFiles: [
          {
            fileId: 'file-evaluation-1',
            fileName: '评价图片凭证.png',
            purpose: 'evaluation',
            status: 'uploaded',
            publicUrl: 'https://cdn.example.com/file-evaluation-1.png',
          },
          {
            fileId: 'file-evaluation-2',
            fileName: '评价图片凭证2.png',
            purpose: 'evaluation',
            status: 'uploaded',
            publicUrl: 'https://cdn.example.com/file-evaluation-2.png',
          },
        ],
      },
      syncState: { status: 'synced' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('retries a failed platform order evaluation through the evaluation api', async () => {
  const originalFetch = globalThis.fetch;
  const completedPlatformOrder = createPlatformOrderFixture({
    id: 'order-platform-evaluation-retry',
    orderNo: 'HY202607030006',
    shipperId: 'user-platform-order-evaluation-retry',
    status: 'completed',
    cargoType: 'digital',
    weightText: '1.8 吨',
    quantityText: '18 箱',
    pickupAddress: '宝安临时仓',
    deliveryAddress: '南山门店新址',
  });
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-evaluation-retry',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-evaluation-retry.900',
          refreshToken: 'refresh.platform-order-evaluation-retry.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(createPlatformApiResponse(completedPlatformOrder))
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        ...completedPlatformOrder,
        updatedAtIso: '2026-07-03T09:40:00.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-03T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'order-detail-primary-action' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'evaluation-rating-5' }).props.onPress();
      app.root.findByProps({ testID: 'evaluation-tag-punctual' }).props.onPress();
      app.root
        .findByProps({ testID: 'evaluation-content' })
        .props.onChangeText('司机服务细致，整体运输体验很好');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'evaluation-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607030006',
      platformOrderId: 'order-platform-evaluation-retry',
      evaluation: {
        rating: 5,
        tags: ['准时'],
        content: '司机服务细致，整体运输体验很好',
      },
      syncState: {
        status: 'failed',
        operation: 'evaluation',
      },
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'order-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const evaluationRetryCalls = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders/order-platform-evaluation-retry/evaluation',
      method: 'POST',
    });
    expect(evaluationRetryCalls).toHaveLength(2);
    expect(
      getFetchCallHeaders(findLastFetchCall(fetchMock, {
        url: 'http://localhost:3000/api/shipper/orders/order-platform-evaluation-retry/evaluation',
        method: 'POST',
      })),
    ).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-order-evaluation-retry.900',
      }),
    );
    expect(
      getFetchCallBody(
        findLastFetchCall(fetchMock, {
          url: 'http://localhost:3000/api/shipper/orders/order-platform-evaluation-retry/evaluation',
          method: 'POST',
        }),
      ),
    ).toMatchObject({
      rating: 5,
      tags: ['准时'],
      content: '司机服务细致，整体运输体验很好',
      anonymous: false,
    });
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607030006',
      platformOrderId: 'order-platform-evaluation-retry',
      evaluation: {
        rating: 5,
        tags: ['准时'],
        content: '司机服务细致，整体运输体验很好',
      },
      syncState: { status: 'synced' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('submits a platform order change request through the change request api', async () => {
  const originalFetch = globalThis.fetch;
  const transportingPlatformOrder = createPlatformOrderFixture({
    id: 'order-platform-change-request-1',
    orderNo: 'HY202607030007',
    shipperId: 'user-platform-order-change-request',
    status: 'transporting',
    cargoType: 'digital',
    weightText: '1.8 吨',
    quantityText: '18 箱',
    pickupAddress: '宝安临时仓',
    deliveryAddress: '南山门店新址',
  });
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-change-request',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-change-request.900',
          refreshToken: 'refresh.platform-order-change-request.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(createPlatformApiResponse(transportingPlatformOrder))
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        ...transportingPlatformOrder,
        updatedAtIso: '2026-07-03T09:50:00.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-03T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'order-detail-change-request-action' })
        .props.onPress();
    });
    expect(getRenderedText(app)).toContain(
      '当前订单已接平台修改申请接口，提交后会进入平台客服确认流程。',
    );
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'change-request-description' })
        .props.onChangeText('请把卸货地址改到南山门店二期');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'change-request-submit' }).props.onPress();
      await flushMicrotasks();
    });

    const changeRequestCall = findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders/order-platform-change-request-1/change-request',
      method: 'POST',
    });
    expect(changeRequestCall).toBeDefined();
    expect(getFetchCallHeaders(changeRequestCall)).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-order-change-request.900',
      }),
    );
    expect(getFetchCallBody(changeRequestCall)).toMatchObject({
      description: '请把卸货地址改到南山门店二期',
    });
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607030007',
      platformOrderId: 'order-platform-change-request-1',
      status: 'transporting',
      modificationRequest: {
        description: '请把卸货地址改到南山门店二期',
        statusText: '待客服确认',
      },
      syncState: { status: 'synced' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('retries a failed platform order change request through the change request api', async () => {
  const originalFetch = globalThis.fetch;
  const transportingPlatformOrder = createPlatformOrderFixture({
    id: 'order-platform-change-request-retry',
    orderNo: 'HY202607030008',
    shipperId: 'user-platform-order-change-request-retry',
    status: 'transporting',
    cargoType: 'digital',
    weightText: '1.8 吨',
    quantityText: '18 箱',
    pickupAddress: '宝安临时仓',
    deliveryAddress: '南山门店新址',
  });
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        expireSeconds: 300,
        devCode: '999999',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: {
          id: 'user-platform-order-change-request-retry',
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: 'access.platform-order-change-request-retry.900',
          refreshToken: 'refresh.platform-order-change-request-retry.604800',
          expiresIn: 900,
        },
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(createPlatformApiResponse(transportingPlatformOrder))
    .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        ...transportingPlatformOrder,
        updatedAtIso: '2026-07-03T10:00:00.000Z',
      }),
    );

  installPlatformFetchMock(fetchMock);

  try {
    const app = await renderApp(new Date('2026-07-03T08:00:00.000Z').getTime(), {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });

    await loginToHomeWithPlatformAuth(app);

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'home-create-order' }).props.onPress();
      await flushMicrotasks();
    });
    fillDigitalDraft(app);
    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'draft-publish' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'draft-confirm-publish' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'order-detail-change-request-action' })
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'change-request-description' })
        .props.onChangeText('请把卸货地址改到南山门店二期');
    });
    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'change-request-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607030008',
      platformOrderId: 'order-platform-change-request-retry',
      modificationRequest: {
        description: '请把卸货地址改到南山门店二期',
        statusText: '待客服确认',
      },
      syncState: {
        status: 'failed',
        operation: 'changeRequest',
      },
    });

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'order-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const changeRequestRetryCalls = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/orders/order-platform-change-request-retry/change-request',
      method: 'POST',
    });
    expect(changeRequestRetryCalls).toHaveLength(2);
    expect(
      getFetchCallHeaders(findLastFetchCall(fetchMock, {
        url: 'http://localhost:3000/api/shipper/orders/order-platform-change-request-retry/change-request',
        method: 'POST',
      })),
    ).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access.platform-order-change-request-retry.900',
      }),
    );
    expect(
      getFetchCallBody(
        findLastFetchCall(fetchMock, {
          url: 'http://localhost:3000/api/shipper/orders/order-platform-change-request-retry/change-request',
          method: 'POST',
        }),
      ),
    ).toMatchObject({
      description: '请把卸货地址改到南山门店二期',
    });
    expect(getAppRuntimeState().orders[0]).toMatchObject({
      id: 'HY202607030008',
      platformOrderId: 'order-platform-change-request-retry',
      modificationRequest: {
        description: '请把卸货地址改到南山门店二期',
        statusText: '待客服确认',
      },
      syncState: { status: 'synced' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('persists local message read state to device storage', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-messages' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'message-mark-read-message-system-1' })
      .props.onPress();
  });

  expect(
    getAppRuntimeState().messages.find(
      message => message.id === 'message-system-1',
    )?.unread,
  ).toBe(false);

  await flushMicrotasks();

  const storedState = await getStoredSnapshot<{
    state: {
      messages: Array<{
        id: string;
        unread: boolean;
      }>;
    };
  }>('@vireCodeing/app-runtime-state');

  expect(
    storedState.state.messages.find(
      message => message.id === 'message-system-1',
    )?.unread,
  ).toBe(false);
});

test('persists local profile settings and verification records to device storage', async () => {
  const app = await renderApp();

  await loginToHome(app);

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-entry-settings' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'setting-display-name' })
      .props.onChangeText('晨星货主');
    app.root
      .findByProps({ testID: 'setting-bound-phone' })
      .props.onChangeText('13900139999');
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'setting-avatar-upload' }).props.onPress();
    app.root.findByProps({ testID: 'setting-account-submit' }).props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
  });

  expect(getRenderedText(app)).toContain('头像凭证：本地已保存');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'profile-entry-identity-verification' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'identity-verification-name' })
      .props.onChangeText('张先生');
    app.root
      .findByProps({ testID: 'identity-verification-id-number' })
      .props.onChangeText('440300199001011234');
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'identity-verification-front-photo' })
      .props.onPress();
    app.root
      .findByProps({ testID: 'identity-verification-back-photo' })
      .props.onPress();
    app.root
      .findByProps({ testID: 'identity-verification-face-check' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'identity-verification-submit' })
      .props.onPress();
  });

  expect(getProfileLocalState().identityVerification).toEqual({
    realName: '张先生',
    idNumber: '440300199001011234',
    identityPhotoCount: 2,
    faceVerified: true,
    status: 'reviewing',
  });

  await flushMicrotasks();

  const storedState = await getStoredSnapshot<{
    state: {
      account: {
        displayName: string;
        boundPhone: string;
        avatarPhotoCount: number;
      };
      identityVerification?: {
        realName: string;
        idNumber: string;
        identityPhotoCount: number;
        faceVerified: boolean;
      };
    };
  }>('@vireCodeing/profile-local-state');

  expect(storedState.state.account).toEqual({
    displayName: '晨星货主',
    boundPhone: '13900139999',
    avatarPhotoCount: 1,
  });
  expect(storedState.state.identityVerification).toEqual({
    realName: '张先生',
    idNumber: '440300199001011234',
    identityPhotoCount: 2,
    faceVerified: true,
    status: 'reviewing',
  });
});

test('attaches platform file objects to identity verification photos', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(url);
    const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (requestUrl.endsWith('/auth/send-code')) {
      return Promise.resolve(
        createPlatformApiResponse({ expireSeconds: 300, devCode: '999999' }),
      );
    }

    if (requestUrl.endsWith('/auth/login')) {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-file',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access-platform-file',
            refreshToken: 'refresh.platform-file',
            expiresIn: 3600,
          },
        }),
      );
    }

    if (requestUrl.endsWith('/shipper/profile/address-book')) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (requestUrl.endsWith('/shipper/profile/identity-verification')) {
      if (init?.method === 'GET') {
        return Promise.resolve(createPlatformApiResponse(null));
      }

      return Promise.resolve(
        createPlatformApiResponse({
          shipperId: 'user-platform-file',
          realName: requestBody.realName,
          idNumber: requestBody.idNumber,
          identityFrontFileId: requestBody.identityFrontFileId,
          identityBackFileId: requestBody.identityBackFileId,
          faceVerified: true,
          status: 'reviewing',
          createdAtIso: '2026-07-06T03:00:00.000Z',
          updatedAtIso: '2026-07-06T03:05:00.000Z',
        }),
      );
    }

    if (requestUrl.endsWith('/files/upload-intents')) {
      const fileId =
        requestBody.fileName === '身份证正面.png'
          ? 'file-front'
          : 'file-back';

      return Promise.resolve(
        createPlatformApiResponse({
          id: fileId,
          ownerUserId: 'user-platform-file',
          purpose: 'identity',
          objectKey: `user-platform-file/identity/${fileId}.png`,
          status: 'pending',
          uploadUrl: `http://localhost:3000/api/files/uploads/${fileId}`,
          publicUrl: `https://cdn.example.com/${fileId}.png`,
          expiresAtIso: '2026-07-06T03:15:00.000Z',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        }),
      );
    }

    if (requestUrl.endsWith('/files/uploads/file-front')) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-front',
          ownerUserId: 'user-platform-file',
          purpose: 'identity',
          objectKey: 'user-platform-file/identity/file-front.png',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-front.png',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        }),
      );
    }

    if (requestUrl.endsWith('/files/uploads/file-back')) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-back',
          ownerUserId: 'user-platform-file',
          purpose: 'identity',
          objectKey: 'user-platform-file/identity/file-back.png',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-back.png',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        }),
      );
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });
  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });
    installPlatformFetchMock(fetchMock);

    await loginToHomeWithPlatformAuth(app);

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'profile-entry-identity-verification' })
        .props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'identity-verification-name' })
        .props.onChangeText('张先生');
      app.root
        .findByProps({ testID: 'identity-verification-id-number' })
        .props.onChangeText('440300199001011234');
    });

    mockSelectedImageUpload('identity-upload.png');

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'identity-verification-front-photo' })
        .props.onPress();
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'identity-verification-back-photo' })
        .props.onPress();
      await flushMicrotasks();
    });

    let renderedText = getRenderedText(app);

    expect(renderedText).toContain('身份证凭证清单');
    expect(renderedText).toContain('身份证正面凭证：身份证正面.png');
    expect(renderedText).toContain('身份证反面凭证：身份证反面.png');
    expect(renderedText).toContain('来源：平台文件对象（已上传）');
    expect(renderedText).toContain('文件 ID：file-front');
    expect(renderedText).toContain('文件 ID：file-back');
    expect(renderedText).not.toContain('待上传占位');

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'identity-verification-face-check' })
        .props.onPress();
    });

    expect(getRenderedText(app)).toContain(
      '人脸核验已完成，当前客户端未接入平台人脸 SDK，已使用平台占位校验标记。',
    );

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'identity-verification-submit' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(getProfileLocalState().identityVerification).toMatchObject({
      realName: '张先生',
      idNumber: '440300199001011234',
      identityPhotoCount: 2,
      identityPhotoFiles: [
        {
          fileId: 'file-front',
          fileName: '身份证正面.png',
          purpose: 'identity',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-front.png',
        },
        {
          fileId: 'file-back',
          fileName: '身份证反面.png',
          purpose: 'identity',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-back.png',
        },
      ],
      faceVerified: true,
      status: 'reviewing',
    });
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith('/files/upload-intents'),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith('/files/uploads/file-front'),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url, init]) => {
        return (
          String(url).endsWith('/shipper/profile/identity-verification') &&
          init?.method === 'PUT'
        );
      }),
    ).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps platform identity verification locally when initial submit fails and retries it successfully', async () => {
  const originalFetch = globalThis.fetch;
  let identitySubmitCount = 0;
  const fetchMock = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(url);
    const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (requestUrl.endsWith('/auth/send-code')) {
      return Promise.resolve(
        createPlatformApiResponse({ expireSeconds: 300, devCode: '999999' }),
      );
    }

    if (requestUrl.endsWith('/auth/login')) {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-identity-retry',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access-platform-identity-retry',
            refreshToken: 'refresh.platform-identity-retry',
            expiresIn: 3600,
          },
        }),
      );
    }

    if (requestUrl.endsWith('/shipper/profile/address-book')) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (requestUrl.endsWith('/shipper/profile/identity-verification')) {
      if (init?.method === 'GET') {
        return Promise.resolve(createPlatformApiResponse(null));
      }

      identitySubmitCount += 1;

      if (identitySubmitCount === 1) {
        return Promise.reject(new Error('NETWORK_ERROR'));
      }

      return Promise.resolve(
        createPlatformApiResponse({
          shipperId: 'user-platform-identity-retry',
          realName: requestBody.realName,
          idNumber: requestBody.idNumber,
          identityFrontFileId: requestBody.identityFrontFileId,
          identityBackFileId: requestBody.identityBackFileId,
          faceVerified: true,
          status: 'reviewing',
          createdAtIso: '2026-07-06T03:00:00.000Z',
          updatedAtIso: '2026-07-06T03:10:00.000Z',
        }),
      );
    }

    if (requestUrl.endsWith('/files/upload-intents')) {
      const fileId =
        requestBody.fileName === '身份证正面.png'
          ? 'file-front'
          : 'file-back';

      return Promise.resolve(
        createPlatformApiResponse({
          id: fileId,
          ownerUserId: 'user-platform-identity-retry',
          purpose: 'identity',
          objectKey: `user-platform-identity-retry/identity/${fileId}.png`,
          status: 'pending',
          uploadUrl: `http://localhost:3000/api/files/uploads/${fileId}`,
          publicUrl: `https://cdn.example.com/${fileId}.png`,
          expiresAtIso: '2026-07-06T03:15:00.000Z',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        }),
      );
    }

    if (requestUrl.endsWith('/files/uploads/file-front')) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-front',
          ownerUserId: 'user-platform-identity-retry',
          purpose: 'identity',
          objectKey: 'user-platform-identity-retry/identity/file-front.png',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-front.png',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        }),
      );
    }

    if (requestUrl.endsWith('/files/uploads/file-back')) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-back',
          ownerUserId: 'user-platform-identity-retry',
          purpose: 'identity',
          objectKey: 'user-platform-identity-retry/identity/file-back.png',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-back.png',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        }),
      );
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });
    installPlatformFetchMock(fetchMock);

    await loginToHomeWithPlatformAuth(app);

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'profile-entry-identity-verification' })
        .props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'identity-verification-name' })
        .props.onChangeText('张先生');
      app.root
        .findByProps({ testID: 'identity-verification-id-number' })
        .props.onChangeText('440300199001011234');
    });

    mockSelectedImageUpload('identity-retry-upload.png');

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'identity-verification-front-photo' })
        .props.onPress();
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'identity-verification-back-photo' })
        .props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'identity-verification-face-check' })
        .props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'identity-verification-submit' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(app)).toContain(
      '实名认证资料提交失败，已保留本地资料，请稍后重试。',
    );
    expect(getProfileLocalState().identityVerification).toMatchObject({
      realName: '张先生',
      idNumber: '440300199001011234',
      identityPhotoCount: 2,
      faceVerified: true,
      status: 'reviewing',
      identityPhotoFiles: [
        {
          fileId: 'file-front',
          fileName: '身份证正面.png',
          purpose: 'identity',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-front.png',
        },
        {
          fileId: 'file-back',
          fileName: '身份证反面.png',
          purpose: 'identity',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-back.png',
        },
      ],
    });
    expect(getProfileLocalState().syncState).toMatchObject({
      status: 'failed',
      operation: 'identityVerification',
      message: '实名认证资料提交失败，已保留本地资料，请稍后重试。',
      queueItems: [
        expect.objectContaining({
          titleText: '实名认证资料',
          statusText: '同步失败',
          noteText:
            '实名认证资料提交未完成，已保留本地资料，请返回个人中心重试。',
        }),
      ],
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
    });

    expect(getRenderedText(app)).toContain('资料同步：同步失败');
    expect(getRenderedText(app)).toContain(
      '同步说明：实名认证资料提交失败，已保留本地资料，请稍后重试。',
    );
    expect(getRenderedText(app)).toContain('实名认证资料：同步失败');

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const saveCalls = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/profile/identity-verification',
      method: 'PUT',
    });

    expect(saveCalls).toHaveLength(2);
    expect(getFetchCallBody(saveCalls[1])).toEqual({
      realName: '张先生',
      idNumber: '440300199001011234',
      identityFrontFileId: 'file-front',
      identityBackFileId: 'file-back',
      faceVerified: true,
    });
    expect(getProfileLocalState().identityVerification).toMatchObject({
      realName: '张先生',
      idNumber: '440300199001011234',
      identityPhotoCount: 2,
      faceVerified: true,
      status: 'reviewing',
      updatedAtIso: '2026-07-06T03:10:00.000Z',
      identityPhotoFiles: [
        {
          fileId: 'file-front',
          fileName: '身份证正面.png',
          purpose: 'identity',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-front.png',
        },
        {
          fileId: 'file-back',
          fileName: '身份证反面.png',
          purpose: 'identity',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-back.png',
        },
      ],
    });
    expect(getProfileLocalState().syncState).toMatchObject({
      status: 'synced',
      operation: 'identityVerification',
      message: '实名认证资料已同步到平台审核。',
    });
    expect(getRenderedText(app)).toContain('资料同步：已同步');
    expect(getRenderedText(app)).toContain(
      '同步说明：实名认证资料已同步到平台审核。',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('submits enterprise verification to platform from the profile center', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(url);
    const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (requestUrl.endsWith('/auth/send-code')) {
      return Promise.resolve(
        createPlatformApiResponse({ expireSeconds: 300, devCode: '999999' }),
      );
    }

    if (requestUrl.endsWith('/auth/login')) {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-enterprise',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access-platform-enterprise',
            refreshToken: 'refresh.platform-enterprise',
            expiresIn: 3600,
          },
        }),
      );
    }

    if (requestUrl.endsWith('/shipper/profile/address-book')) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (requestUrl.endsWith('/shipper/profile/enterprise-verification')) {
      if (init?.method === 'GET') {
        return Promise.resolve(createPlatformApiResponse(null));
      }

      return Promise.resolve(
        createPlatformApiResponse({
          shipperId: 'user-platform-enterprise',
          enterpriseName: requestBody.enterpriseName,
          creditCode: requestBody.creditCode,
          legalName: requestBody.legalName,
          legalId: requestBody.legalId,
          enterprisePhone: requestBody.enterprisePhone,
          licenseFileId: requestBody.licenseFileId,
          status: 'reviewing',
          createdAtIso: '2026-07-06T03:00:00.000Z',
          updatedAtIso: '2026-07-06T03:05:00.000Z',
        }),
      );
    }

    if (requestUrl.endsWith('/files/upload-intents')) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-license',
          ownerUserId: 'user-platform-enterprise',
          purpose: 'identity',
          objectKey: 'user-platform-enterprise/identity/file-license.png',
          status: 'pending',
          uploadUrl: 'http://localhost:3000/api/files/uploads/file-license',
          publicUrl: 'https://cdn.example.com/file-license.png',
          expiresAtIso: '2026-07-06T03:15:00.000Z',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        }),
      );
    }

    if (requestUrl.endsWith('/files/uploads/file-license')) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-license',
          ownerUserId: 'user-platform-enterprise',
          purpose: 'identity',
          objectKey: 'user-platform-enterprise/identity/file-license.png',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-license.png',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        }),
      );
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });
    installPlatformFetchMock(fetchMock);

    await loginToHomeWithPlatformAuth(app);

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'profile-entry-enterprise-verification' })
        .props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'enterprise-verification-name' })
        .props.onChangeText('深圳晨星贸易有限公司');
      app.root
        .findByProps({ testID: 'enterprise-verification-code' })
        .props.onChangeText('91440300MA5TEST001');
      app.root
        .findByProps({ testID: 'enterprise-verification-legal-name' })
        .props.onChangeText('张先生');
      app.root
        .findByProps({ testID: 'enterprise-verification-legal-id' })
        .props.onChangeText('440300199001011234');
      app.root
        .findByProps({ testID: 'enterprise-verification-phone' })
        .props.onChangeText('13900139088');
    });

    mockSelectedImageUpload('enterprise-license-upload.png');

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'enterprise-verification-license-photo' })
        .props.onPress();
      await flushMicrotasks();
    });

    let renderedText = getRenderedText(app);

    expect(renderedText).toContain('营业执照凭证清单');
    expect(renderedText).toContain('营业执照凭证：营业执照.png');
    expect(renderedText).toContain('来源：平台文件对象（已上传）');
    expect(renderedText).toContain('文件 ID：file-license');
    expect(renderedText).not.toContain('待上传占位');

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'enterprise-verification-submit' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(getProfileLocalState().enterpriseVerification).toMatchObject({
      enterpriseName: '深圳晨星贸易有限公司',
      creditCode: '91440300MA5TEST001',
      legalName: '张先生',
      legalId: '440300199001011234',
      enterprisePhone: '13900139088',
      licensePhotoCount: 1,
      licenseFiles: [
        {
          fileId: 'file-license',
          fileName: '营业执照.png',
          purpose: 'identity',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-license.png',
        },
      ],
      status: 'reviewing',
    });
    expect(
      fetchMock.mock.calls.some(([url, init]) => {
        return (
          String(url).endsWith('/shipper/profile/enterprise-verification') &&
          init?.method === 'PUT'
        );
      }),
    ).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps platform enterprise verification locally when initial submit fails and retries it successfully', async () => {
  const originalFetch = globalThis.fetch;
  let enterpriseSubmitCount = 0;
  const fetchMock = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(url);
    const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (requestUrl.endsWith('/auth/send-code')) {
      return Promise.resolve(
        createPlatformApiResponse({ expireSeconds: 300, devCode: '999999' }),
      );
    }

    if (requestUrl.endsWith('/auth/login')) {
      return Promise.resolve(
        createPlatformApiResponse({
          user: {
            id: 'user-platform-enterprise-retry',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens: {
            accessToken: 'access-platform-enterprise-retry',
            refreshToken: 'refresh.platform-enterprise-retry',
            expiresIn: 3600,
          },
        }),
      );
    }

    if (requestUrl.endsWith('/shipper/profile/address-book')) {
      return Promise.resolve(createPlatformApiResponse(null));
    }

    if (requestUrl.endsWith('/shipper/profile/enterprise-verification')) {
      if (init?.method === 'GET') {
        return Promise.resolve(createPlatformApiResponse(null));
      }

      enterpriseSubmitCount += 1;

      if (enterpriseSubmitCount === 1) {
        return Promise.reject(new Error('NETWORK_ERROR'));
      }

      return Promise.resolve(
        createPlatformApiResponse({
          shipperId: 'user-platform-enterprise-retry',
          enterpriseName: requestBody.enterpriseName,
          creditCode: requestBody.creditCode,
          legalName: requestBody.legalName,
          legalId: requestBody.legalId,
          enterprisePhone: requestBody.enterprisePhone,
          licenseFileId: requestBody.licenseFileId,
          status: 'reviewing',
          createdAtIso: '2026-07-06T03:00:00.000Z',
          updatedAtIso: '2026-07-06T03:10:00.000Z',
        }),
      );
    }

    if (requestUrl.endsWith('/files/upload-intents')) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-license',
          ownerUserId: 'user-platform-enterprise-retry',
          purpose: 'identity',
          objectKey: 'user-platform-enterprise-retry/identity/file-license.png',
          status: 'pending',
          uploadUrl: 'http://localhost:3000/api/files/uploads/file-license',
          publicUrl: 'https://cdn.example.com/file-license.png',
          expiresAtIso: '2026-07-06T03:15:00.000Z',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        }),
      );
    }

    if (requestUrl.endsWith('/files/uploads/file-license')) {
      return Promise.resolve(
        createPlatformApiResponse({
          id: 'file-license',
          ownerUserId: 'user-platform-enterprise-retry',
          purpose: 'identity',
          objectKey: 'user-platform-enterprise-retry/identity/file-license.png',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-license.png',
          createdAtIso: '2026-07-06T03:00:00.000Z',
        }),
      );
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  });

  try {
    const app = await renderApp(1000, {
      platformApiBaseUrl: 'http://localhost:3000/api',
    });
    installPlatformFetchMock(fetchMock);

    await loginToHomeWithPlatformAuth(app);

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'home-open-profile' }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'profile-entry-enterprise-verification' })
        .props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      app.root
        .findByProps({ testID: 'enterprise-verification-name' })
        .props.onChangeText('深圳晨星贸易有限公司');
      app.root
        .findByProps({ testID: 'enterprise-verification-code' })
        .props.onChangeText('91440300MA5TEST001');
      app.root
        .findByProps({ testID: 'enterprise-verification-legal-name' })
        .props.onChangeText('张先生');
      app.root
        .findByProps({ testID: 'enterprise-verification-legal-id' })
        .props.onChangeText('440300199001011234');
      app.root
        .findByProps({ testID: 'enterprise-verification-phone' })
        .props.onChangeText('13900139088');
    });

    mockSelectedImageUpload('enterprise-license-retry-upload.png');

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'enterprise-verification-license-photo' })
        .props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      app.root
        .findByProps({ testID: 'enterprise-verification-submit' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(app)).toContain(
      '企业认证资料提交失败，已保留本地资料，请稍后重试。',
    );
    expect(getProfileLocalState().enterpriseVerification).toMatchObject({
      enterpriseName: '深圳晨星贸易有限公司',
      creditCode: '91440300MA5TEST001',
      legalName: '张先生',
      legalId: '440300199001011234',
      enterprisePhone: '13900139088',
      licensePhotoCount: 1,
      status: 'reviewing',
      licenseFiles: [
        {
          fileId: 'file-license',
          fileName: '营业执照.png',
          purpose: 'identity',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-license.png',
        },
      ],
    });
    expect(getProfileLocalState().syncState).toMatchObject({
      status: 'failed',
      operation: 'enterpriseVerification',
      message: '企业认证资料提交失败，已保留本地资料，请稍后重试。',
      queueItems: [
        expect.objectContaining({
          titleText: '企业认证资料',
          statusText: '同步失败',
          noteText:
            '企业认证资料提交未完成，已保留本地资料，请返回个人中心重试。',
        }),
      ],
    });

    ReactTestRenderer.act(() => {
      app.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
    });

    expect(getRenderedText(app)).toContain('资料同步：同步失败');
    expect(getRenderedText(app)).toContain(
      '同步说明：企业认证资料提交失败，已保留本地资料，请稍后重试。',
    );
    expect(getRenderedText(app)).toContain('企业认证资料：同步失败');

    await ReactTestRenderer.act(async () => {
      app.root.findByProps({ testID: 'profile-sync-retry' }).props.onPress();
      await flushMicrotasks();
    });

    const saveCalls = findFetchCalls(fetchMock, {
      url: 'http://localhost:3000/api/shipper/profile/enterprise-verification',
      method: 'PUT',
    });

    expect(saveCalls).toHaveLength(2);
    expect(getFetchCallBody(saveCalls[1])).toEqual({
      enterpriseName: '深圳晨星贸易有限公司',
      creditCode: '91440300MA5TEST001',
      legalName: '张先生',
      legalId: '440300199001011234',
      enterprisePhone: '13900139088',
      licenseFileId: 'file-license',
    });
    expect(getProfileLocalState().enterpriseVerification).toMatchObject({
      enterpriseName: '深圳晨星贸易有限公司',
      creditCode: '91440300MA5TEST001',
      legalName: '张先生',
      legalId: '440300199001011234',
      enterprisePhone: '13900139088',
      licensePhotoCount: 1,
      status: 'reviewing',
      updatedAtIso: '2026-07-06T03:10:00.000Z',
      licenseFiles: [
        {
          fileId: 'file-license',
          fileName: '营业执照.png',
          purpose: 'identity',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/file-license.png',
        },
      ],
    });
    expect(getProfileLocalState().syncState).toMatchObject({
      status: 'synced',
      operation: 'enterpriseVerification',
      message: '企业认证资料已同步到平台审核。',
    });
    expect(getRenderedText(app)).toContain('资料同步：已同步');
    expect(getRenderedText(app)).toContain(
      '同步说明：企业认证资料已同步到平台审核。',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('logs in as a driver and loads the platform order hall', async () => {
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        tokens: {
          accessToken: 'driver-access-token',
          refreshToken: 'refresh.driver',
          expiresIn: 3600,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [createPlatformDriverHallOrder()],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverCertificationSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverAcceptanceSettingsSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverIncomeSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverWithdrawalsSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        id: 'file-id-front',
        ownerUserId: 'driver-1',
        purpose: 'identity',
        objectKey: 'driver-1/identity/file-id-front.png',
        status: 'uploaded',
        publicUrl: 'https://cdn.example.com/file-id-front.png',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        id: 'file-id-back',
        ownerUserId: 'driver-1',
        purpose: 'identity',
        objectKey: 'driver-1/identity/file-id-back.png',
        status: 'uploaded',
        publicUrl: 'https://cdn.example.com/file-id-back.png',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        id: 'file-driving-license',
        ownerUserId: 'driver-1',
        purpose: 'identity',
        objectKey: 'driver-1/identity/file-driving-license.png',
        status: 'uploaded',
        publicUrl: 'https://cdn.example.com/file-driving-license.png',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        id: 'file-driver-license',
        ownerUserId: 'driver-1',
        purpose: 'identity',
        objectKey: 'driver-1/identity/file-driver-license.png',
        status: 'uploaded',
        publicUrl: 'https://cdn.example.com/file-driver-license.png',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        id: 'file-transport-qualification',
        ownerUserId: 'driver-1',
        purpose: 'identity',
        objectKey: 'driver-1/identity/file-transport-qualification.png',
        status: 'uploaded',
        publicUrl: 'https://cdn.example.com/file-transport-qualification.png',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        id: 'file-operation-permit',
        ownerUserId: 'driver-1',
        purpose: 'identity',
        objectKey: 'driver-1/identity/file-operation-permit.png',
        status: 'uploaded',
        publicUrl: 'https://cdn.example.com/file-operation-permit.png',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        id: 'file-vehicle-photo',
        ownerUserId: 'driver-1',
        purpose: 'identity',
        objectKey: 'driver-1/identity/file-vehicle-photo.png',
        status: 'uploaded',
        publicUrl: 'https://cdn.example.com/file-vehicle-photo.png',
        createdAtIso: '2026-07-06T03:00:00.000Z',
      }),
    );
  installPlatformFetchMock(fetchMock);
  const app = await renderApp(1000, {
    platformApiBaseUrl: 'http://localhost:3000/api',
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-user-type-driver' }).props.onPress();
    app.root
      .findByProps({ testID: 'auth-login-method-password' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-phone' })
      .props.onChangeText('13900139009');
    app.root
      .findByProps({ testID: 'auth-login-password' })
      .props.onChangeText('abc123');
  });

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
    await flushMicrotasks();
  });

  expect(app.root.findByProps({ testID: 'driver-home-title' }).props.children).toBe(
    '司机接单大厅',
  );
  expect(app.root.findByProps({ testID: 'driver-order-card-HY202607060001' }))
    .toBeTruthy();
  expect(
    fetchMock.mock.calls.some(([url, init]) => {
      return (
        url === 'http://localhost:3000/api/driver/order-hall?page=1&pageSize=20' &&
        init?.method === 'GET' &&
        init.headers.Authorization === 'Bearer driver-access-token'
      );
    }),
  ).toBe(true);
});

test('shows pricing tags and filters driver hall orders locally', async () => {
  const nearbyOrder = {
    ...createPlatformDriverHallOrder(),
    pickupDistanceMeters: 6000,
  };
  const bonusOrder = {
    ...createPlatformDriverHallOrder(),
    id: 'order-3',
    orderNo: 'HY202607060003',
    pickupAddress: '南山区白石洲仓',
    deliveryAddress: '龙华区油松门店',
    pickupDistanceMeters: 18000,
    exposureBonusCents: 3000,
    priceCents: 88000,
    updatedAtIso: '2026-07-06T08:10:00.000Z',
  };
  const negotiableOrder = {
    ...createPlatformDriverHallOrder(),
    id: 'order-4',
    orderNo: 'HY202607060004',
    pickupAddress: '坪山区坑梓仓',
    deliveryAddress: '福田区会展中心',
    pickupDistanceMeters: 15000,
    pricingMode: 'negotiable' as const,
    priceCents: undefined,
    updatedAtIso: '2026-07-06T08:20:00.000Z',
  };
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        tokens: {
          accessToken: 'driver-access-token',
          refreshToken: 'refresh.driver',
          expiresIn: 3600,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [nearbyOrder, bonusOrder, negotiableOrder],
        page: 1,
        pageSize: 20,
        total: 3,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformDriverCertificationSnapshot({
          identityStatus: 'approved',
          vehicleStatus: 'approved',
        }),
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverAcceptanceSettingsSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverIncomeSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverWithdrawalsSnapshot()),
    );
  installPlatformFetchMock(fetchMock);
  const app = await renderApp(1000, {
    platformApiBaseUrl: 'http://localhost:3000/api',
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-user-type-driver' }).props.onPress();
    app.root
      .findByProps({ testID: 'auth-login-method-password' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-phone' })
      .props.onChangeText('13900139009');
    app.root
      .findByProps({ testID: 'auth-login-password' })
      .props.onChangeText('abc123');
  });

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
    await flushMicrotasks();
  });

  expect(
    app.root.findByProps({ testID: 'driver-order-pricing-HY202607060001' }).props
      .children,
  ).toBe('固定价 ￥760.00');
  expect(
    app.root.findByProps({ testID: 'driver-order-distance-HY202607060001' }).props
      .children,
  ).toBe('约 6.0 公里');
  expect(
    app.root.findByProps({ testID: 'driver-order-bonus-HY202607060003' }).props
      .children,
  ).toBe('赏金 ￥30.00');
  expect(
    app.root.findByProps({ testID: 'driver-order-pricing-HY202607060004' }).props
      .children,
  ).toBe('司机报价');

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'driver-order-hall-filter-nearby' })
      .props.onPress();
  });

  expect(
    app.root.findByProps({ testID: 'driver-order-hall-filter-summary' }).props
      .children,
  ).toBe('当前筛选显示 1 单');
  expect(app.root.findByProps({ testID: 'driver-order-card-HY202607060001' }))
    .toBeTruthy();
  expect(app.root.findAllByProps({ testID: 'driver-order-card-HY202607060003' }))
    .toHaveLength(0);
  expect(app.root.findAllByProps({ testID: 'driver-order-card-HY202607060004' }))
    .toHaveLength(0);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'driver-order-hall-filter-bonus' })
      .props.onPress();
  });

  expect(
    app.root.findByProps({ testID: 'driver-order-hall-filter-summary' }).props
      .children,
  ).toBe('当前筛选显示 1 单');
  expect(app.root.findByProps({ testID: 'driver-order-card-HY202607060003' }))
    .toBeTruthy();
  expect(app.root.findAllByProps({ testID: 'driver-order-card-HY202607060001' }))
    .toHaveLength(0);
  expect(app.root.findAllByProps({ testID: 'driver-order-card-HY202607060004' }))
    .toHaveLength(0);

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'driver-order-hall-filter-negotiable' })
      .props.onPress();
  });

  expect(
    app.root.findByProps({ testID: 'driver-order-hall-filter-summary' }).props
      .children,
  ).toBe('当前筛选显示 1 单');
  expect(app.root.findByProps({ testID: 'driver-order-card-HY202607060004' }))
    .toBeTruthy();
  expect(app.root.findAllByProps({ testID: 'driver-order-card-HY202607060001' }))
    .toHaveLength(0);
  expect(app.root.findAllByProps({ testID: 'driver-order-card-HY202607060003' }))
    .toHaveLength(0);
});

test('loads driver certification snapshot after driver login', async () => {
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        tokens: {
          accessToken: 'driver-access-token',
          refreshToken: 'refresh.driver',
          expiresIn: 3600,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        identity: {
          driverId: 'driver-1',
          realName: '李师傅',
          identityNumber: '11010119900307201X',
          identityFrontFileId: 'file-id-front',
          identityBackFileId: 'file-id-back',
          status: 'reviewing',
        },
        vehicle: {
          driverId: 'driver-1',
          plateNumber: '粤B12345',
          vehicleType: '厢式货车',
          vehicleLengthText: '4.2 米',
          loadCapacityText: '2 吨',
          hasTailboard: true,
          drivingLicenseFileId: 'file-driving-license',
          driverLicenseFileId: 'file-driver-license',
          transportQualificationFileId: 'file-transport-qualification',
          operationPermitFileId: 'file-operation-permit',
          vehiclePhotoFileId: 'file-vehicle-photo',
          status: 'approved',
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverAcceptanceSettingsSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverIncomeSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverWithdrawalsSnapshot()),
    );
  installPlatformFetchMock(fetchMock);
  const app = await renderApp(1000, {
    platformApiBaseUrl: 'http://localhost:3000/api',
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-user-type-driver' }).props.onPress();
    app.root
      .findByProps({ testID: 'auth-login-method-password' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-phone' })
      .props.onChangeText('13900139009');
    app.root
      .findByProps({ testID: 'auth-login-password' })
      .props.onChangeText('abc123');
  });

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
    await flushMicrotasks();
  });

  expect(
    app.root.findByProps({ testID: 'driver-certification-title' }).props
      .children,
  ).toBe('司机认证');
  expect(getRenderedText(app)).toContain('实名认证：审核中');
  expect(getRenderedText(app)).toContain('车辆认证：已通过');
  expect(
    app.root.findByProps({ testID: 'driver-cert-real-name' }).props.value,
  ).toBe('李师傅');
  expect(
    app.root.findByProps({ testID: 'driver-cert-identity-number' }).props.value,
  ).toBe('11010119900307201X');
  expect(
    app.root.findByProps({ testID: 'driver-cert-plate-number' }).props.value,
  ).toBe('粤B12345');
  expect(getRenderedText(app)).toContain('实名认证附件');
  expect(getRenderedText(app)).toContain('身份证人像面：平台已同步文件 ID');
  expect(getRenderedText(app)).toContain('来源：平台认证快照');
  expect(getRenderedText(app)).toContain('文件 ID：file-id-front');
  expect(getRenderedText(app)).toContain('车辆认证附件');
  expect(getRenderedText(app)).toContain('车辆照片：平台已同步文件 ID');
  expect(getRenderedText(app)).toContain('文件 ID：file-vehicle-photo');
  expect(
    app.root.findByProps({
      testID: 'driver-cert-preview-placeholder-identityFrontFileId',
    }).props.children,
  ).toBe('身份证人像面');
  expect(
    app.root.findByProps({
      testID: 'driver-cert-preview-placeholder-vehiclePhotoFileId',
    }).props.children,
  ).toBe('车辆照片');
  expect(
    fetchMock.mock.calls.some(([url, init]) => {
      return (
        url === 'http://localhost:3000/api/driver/certification' &&
        init?.method === 'GET' &&
        init.headers.Authorization === 'Bearer driver-access-token'
      );
    }),
  ).toBe(true);
});

test('submits driver identity certification from the driver home', async () => {
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        tokens: {
          accessToken: 'driver-access-token',
          refreshToken: 'refresh.driver',
          expiresIn: 3600,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformDriverCertificationSnapshot({
          identityStatus: 'approved',
          vehicleStatus: 'approved',
        }),
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverAcceptanceSettingsSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverIncomeSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverWithdrawalsSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        id: 'file-id-front',
        ownerUserId: 'driver-1',
        purpose: 'identity',
        objectKey: 'driver-1/identity/file-id-front.png',
        status: 'pending',
        uploadUrl: 'http://localhost:3000/api/files/uploads/file-id-front',
        publicUrl: 'https://cdn.example.com/file-id-front.png',
        expiresAtIso: '2026-07-09T02:30:00.000Z',
        createdAtIso: '2026-07-09T02:20:00.000Z',
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        id: 'file-id-front',
        ownerUserId: 'driver-1',
        purpose: 'identity',
        objectKey: 'driver-1/identity/file-id-front.png',
        publicUrl: 'https://cdn.example.com/file-id-front.png',
        status: 'uploaded',
        createdAtIso: '2026-07-09T02:20:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        id: 'file-id-back',
        ownerUserId: 'driver-1',
        purpose: 'identity',
        objectKey: 'driver-1/identity/file-id-back.png',
        status: 'pending',
        uploadUrl: 'http://localhost:3000/api/files/uploads/file-id-back',
        publicUrl: 'https://cdn.example.com/file-id-back.png',
        expiresAtIso: '2026-07-09T02:31:00.000Z',
        createdAtIso: '2026-07-09T02:21:00.000Z',
      }),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(null))
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        id: 'file-id-back',
        ownerUserId: 'driver-1',
        purpose: 'identity',
        objectKey: 'driver-1/identity/file-id-back.png',
        publicUrl: 'https://cdn.example.com/file-id-back.png',
        status: 'uploaded',
        createdAtIso: '2026-07-09T02:21:00.000Z',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        identity: {
          driverId: 'driver-1',
          realName: '李师傅',
          identityNumber: '11010119900307201X',
          identityFrontFileId: 'file-id-front',
          identityBackFileId: 'file-id-back',
          status: 'reviewing',
        },
        vehicle: { driverId: 'driver-1', status: 'unsubmitted' },
      }),
    );
  installPlatformFetchMock(fetchMock);
  const app = await renderApp(1000, {
    platformApiBaseUrl: 'http://localhost:3000/api',
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-user-type-driver' }).props.onPress();
    app.root
      .findByProps({ testID: 'auth-login-method-password' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-phone' })
      .props.onChangeText('13900139009');
    app.root
      .findByProps({ testID: 'auth-login-password' })
      .props.onChangeText('abc123');
  });

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
    await flushMicrotasks();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'driver-cert-real-name' })
      .props.onChangeText('李师傅');
    app.root
      .findByProps({ testID: 'driver-cert-identity-number' })
      .props.onChangeText('11010119900307201x');
  });
  mockSelectedImageUpload('driver-identity-upload.png');

  await ReactTestRenderer.act(async () => {
    app.root
      .findByProps({ testID: 'driver-cert-upload-identity-front' })
      .props.onPress();
    await flushMicrotasks();
    await flushMacrotask();
    await flushMicrotasks();
  });
  await ReactTestRenderer.act(async () => {
    app.root
      .findByProps({ testID: 'driver-cert-upload-identity-back' })
      .props.onPress();
    await flushMicrotasks();
    await flushMacrotask();
    await flushMicrotasks();
  });

  expect(
    app.root.findByProps({ testID: 'driver-cert-identity-front-file' }).props
      .value,
  ).toBe('file-id-front');
  expect(
    app.root.findByProps({ testID: 'driver-cert-identity-back-file' }).props
      .value,
  ).toBe('file-id-back');
  expect(getRenderedText(app)).toContain('身份证人像面：身份证人像面.png');
  expect(getRenderedText(app)).toContain('身份证国徽面：身份证国徽面.png');
  expect(getRenderedText(app)).toContain('文件 ID：file-id-front');
  expect(getRenderedText(app)).toContain('文件 ID：file-id-back');
  expect(getRenderedText(app)).toContain('已生成预览地址。');
  expect(
    app.root.findByProps({
      testID: 'driver-cert-preview-image-identityFrontFileId',
    }).props.source,
  ).toEqual({
    uri: 'https://cdn.example.com/file-id-front.png',
  });
  expect(
    app.root.findByProps({
      testID: 'driver-cert-preview-image-identityBackFileId',
    }).props.source,
  ).toEqual({
    uri: 'https://cdn.example.com/file-id-back.png',
  });

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'driver-cert-submit-identity' }).props.onPress();
    await flushMicrotasks();
  });

  expect(app.root.findByProps({ testID: 'driver-notice' }).props.children).toBe(
    '司机实名认证已提交审核。',
  );
  expect(getRenderedText(app)).toContain('实名认证：审核中');
  const uploadIntentCalls = findFetchCalls(fetchMock, {
    url: 'http://localhost:3000/api/files/upload-intents',
    method: 'POST',
  });
  expect(uploadIntentCalls).toHaveLength(2);
  expect(getFetchCallBody(uploadIntentCalls[0])).toEqual({
    purpose: 'identity',
    fileName: '身份证人像面.png',
    contentType: 'image/png',
    byteSize: 2048,
  });
  expect(getFetchCallBody(uploadIntentCalls[1])).toEqual({
    purpose: 'identity',
    fileName: '身份证国徽面.png',
    contentType: 'image/png',
    byteSize: 2048,
  });
  expect(
    findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/files/uploads/file-id-front',
      method: 'POST',
    }),
  ).toBeDefined();
  expect(
    findFetchCall(fetchMock, {
      url: 'http://localhost:3000/api/files/uploads/file-id-back',
      method: 'POST',
    }),
  ).toBeDefined();
  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:3000/api/driver/certification/identity',
    expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        realName: '李师傅',
        identityNumber: '11010119900307201X',
        identityFrontFileId: 'file-id-front',
        identityBackFileId: 'file-id-back',
      }),
    }),
  );
});

test('keeps driver certification panel visible when vehicle certification submit fails', async () => {
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        tokens: {
          accessToken: 'driver-access-token',
          refreshToken: 'refresh.driver',
          expiresIn: 3600,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformDriverCertificationSnapshot({
          identityStatus: 'approved',
          vehicleStatus: 'approved',
        }),
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverAcceptanceSettingsSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverIncomeSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverWithdrawalsSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiErrorResponse(
        400,
        'DRIVER_VEHICLE_CERTIFICATION_INVALID',
        '车辆认证资料不完整',
      ),
    );
  installPlatformFetchMock(fetchMock);
  const app = await renderApp(1000, {
    platformApiBaseUrl: 'http://localhost:3000/api',
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-user-type-driver' }).props.onPress();
    app.root
      .findByProps({ testID: 'auth-login-method-password' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-phone' })
      .props.onChangeText('13900139009');
    app.root
      .findByProps({ testID: 'auth-login-password' })
      .props.onChangeText('abc123');
  });

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
    await flushMicrotasks();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'driver-cert-plate-number' })
      .props.onChangeText('粤B12345');
    app.root
      .findByProps({ testID: 'driver-cert-vehicle-type' })
      .props.onChangeText('厢式货车');
    app.root
      .findByProps({ testID: 'driver-cert-vehicle-length' })
      .props.onChangeText('4.2 米');
    app.root
      .findByProps({ testID: 'driver-cert-load-capacity' })
      .props.onChangeText('2 吨');
    app.root
      .findByProps({ testID: 'driver-cert-driving-license-file' })
      .props.onChangeText('file-driving-license');
    app.root
      .findByProps({ testID: 'driver-cert-driver-license-file' })
      .props.onChangeText('file-driver-license');
    app.root
      .findByProps({ testID: 'driver-cert-transport-qualification-file' })
      .props.onChangeText('file-transport-qualification');
    app.root
      .findByProps({ testID: 'driver-cert-operation-permit-file' })
      .props.onChangeText('file-operation-permit');
    app.root
      .findByProps({ testID: 'driver-cert-vehicle-photo-file' })
      .props.onChangeText('file-vehicle-photo');
  });

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'driver-cert-submit-vehicle' }).props.onPress();
    await flushMicrotasks();
  });

  expect(app.root.findByProps({ testID: 'driver-certification-title' })).toBeTruthy();
  expect(app.root.findByProps({ testID: 'driver-notice' }).props.children).toBe(
    '车辆认证提交失败，请检查资料后重试。',
  );
  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:3000/api/driver/certification/vehicle',
    expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        plateNumber: '粤B12345',
        vehicleType: '厢式货车',
        vehicleLengthText: '4.2 米',
        loadCapacityText: '2 吨',
        hasTailboard: false,
        drivingLicenseFileId: 'file-driving-license',
        driverLicenseFileId: 'file-driver-license',
        transportQualificationFileId: 'file-transport-qualification',
        operationPermitFileId: 'file-operation-permit',
        vehiclePhotoFileId: 'file-vehicle-photo',
      }),
    }),
  );
});

test('shows driver certification gate notice when quote is rejected before approval', async () => {
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        tokens: {
          accessToken: 'driver-access-token',
          refreshToken: 'refresh.driver',
          expiresIn: 3600,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [createPlatformDriverHallOrder()],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        identity: { driverId: 'driver-1', status: 'reviewing' },
        vehicle: { driverId: 'driver-1', status: 'approved' },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverAcceptanceSettingsSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverIncomeSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverWithdrawalsSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiErrorResponse(
        403,
        'DRIVER_CERTIFICATION_REQUIRED',
        '司机实名和车辆认证通过后才能接单',
      ),
    );
  installPlatformFetchMock(fetchMock);
  const app = await renderApp(1000, {
    platformApiBaseUrl: 'http://localhost:3000/api',
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-user-type-driver' }).props.onPress();
    app.root
      .findByProps({ testID: 'auth-login-method-password' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-phone' })
      .props.onChangeText('13900139009');
    app.root
      .findByProps({ testID: 'auth-login-password' })
      .props.onChangeText('abc123');
  });

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
    await flushMicrotasks();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'driver-quote-cents-HY202607060001' })
      .props.onChangeText('880');
    app.root
      .findByProps({ testID: 'driver-arrival-HY202607060001' })
      .props.onChangeText('45 分钟到达');
  });

  await ReactTestRenderer.act(async () => {
    app.root
      .findByProps({ testID: 'driver-quote-submit-HY202607060001' })
      .props.onPress();
    await flushMicrotasks();
  });

  expect(app.root.findByProps({ testID: 'driver-notice' }).props.children).toBe(
    '司机实名和车辆认证通过后才能接单。',
  );
});

test('quotes and accepts a platform driver order from the hall', async () => {
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        tokens: {
          accessToken: 'driver-access-token',
          refreshToken: 'refresh.driver',
          expiresIn: 3600,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [createPlatformDriverHallOrder()],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(
        createPlatformDriverCertificationSnapshot({
          identityStatus: 'approved',
          vehicleStatus: 'approved',
        }),
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverAcceptanceSettingsSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverIncomeSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverWithdrawalsSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        ...createPlatformDriverHallOrder(),
        events: [
          {
            id: 'event-driver-quote',
            actorUserId: 'driver-1',
            eventType: 'driver_quote_submitted',
            noteText: JSON.stringify({
              quoteCents: 88000,
              arrivalText: '45 分钟到达',
              noteText: '可带尾板',
            }),
            createdAtIso: '2026-07-06T08:05:00.000Z',
          },
        ],
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        ...createPlatformDriverHallOrder(),
        status: 'loading',
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverIncomeSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverWithdrawalsSnapshot()),
    );
  installPlatformFetchMock(fetchMock);
  const app = await renderApp(1000, {
    platformApiBaseUrl: 'http://localhost:3000/api',
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-user-type-driver' }).props.onPress();
    app.root
      .findByProps({ testID: 'auth-login-method-password' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-phone' })
      .props.onChangeText('13900139009');
    app.root
      .findByProps({ testID: 'auth-login-password' })
      .props.onChangeText('abc123');
  });

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
    await flushMicrotasks();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'driver-quote-cents-HY202607060001' })
      .props.onChangeText('880');
    app.root
      .findByProps({ testID: 'driver-arrival-HY202607060001' })
      .props.onChangeText('45 分钟到达');
    app.root
      .findByProps({ testID: 'driver-quote-note-HY202607060001' })
      .props.onChangeText('可带尾板');
  });

  await ReactTestRenderer.act(async () => {
    app.root
      .findByProps({ testID: 'driver-quote-submit-HY202607060001' })
      .props.onPress();
    await flushMicrotasks();
  });

  expect(app.root.findByProps({ testID: 'driver-notice' }).props.children).toBe(
    '司机报价已提交。',
  );
  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:3000/api/driver/orders/order-1/quote',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        quoteCents: 88000,
        arrivalText: '45 分钟到达',
        noteText: '可带尾板',
      }),
    }),
  );

  await ReactTestRenderer.act(async () => {
    app.root
      .findByProps({ testID: 'driver-accept-HY202607060001' })
      .props.onPress();
    await flushMicrotasks();
  });

  const acceptOrderCall = fetchMock.mock.calls.find(([url]) => {
    return url === 'http://localhost:3000/api/driver/orders/order-1/accept';
  });

  expect(acceptOrderCall?.[1]).toMatchObject(
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer driver-access-token',
        'Idempotency-Key': expect.stringMatching(uuidV4Pattern),
      }),
    }),
  );
  expect(JSON.parse(String(acceptOrderCall?.[1]?.body))).toEqual(
    expect.objectContaining({
      noteText: '可带尾板',
      baseUpdatedAtIso: '2026-07-06T08:00:00.000Z',
    }),
  );
  expect(app.root.findByProps({ testID: 'driver-notice' }).props.children).toBe(
    '接单成功，订单已进入待装货。',
  );
  expect(app.root.findAllByProps({ testID: 'driver-order-card-HY202607060001' }))
    .toHaveLength(0);
});

test('keeps the driver hall visible when platform order hall loading fails', async () => {
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        tokens: {
          accessToken: 'driver-access-token',
          refreshToken: 'refresh.driver',
          expiresIn: 3600,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiErrorResponse(
        500,
        'DRIVER_ORDER_HALL_UNAVAILABLE',
        '司机订单大厅暂不可用',
      ),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverCertificationSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverAcceptanceSettingsSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverIncomeSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverWithdrawalsSnapshot()),
    );
  installPlatformFetchMock(fetchMock);
  const app = await renderApp(1000, {
    platformApiBaseUrl: 'http://localhost:3000/api',
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-user-type-driver' }).props.onPress();
    app.root
      .findByProps({ testID: 'auth-login-method-password' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-phone' })
      .props.onChangeText('13900139009');
    app.root
      .findByProps({ testID: 'auth-login-password' })
      .props.onChangeText('abc123');
  });

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
    await flushMicrotasks();
  });

  expect(app.root.findByProps({ testID: 'driver-home-title' }).props.children).toBe(
    '司机接单大厅',
  );
  expect(app.root.findByProps({ testID: 'driver-notice' }).props.children).toBe(
    '司机订单大厅刷新失败，请稍后重试。',
  );
});

test('loads current driver orders and advances execution status', async () => {
  const loadingOrder = createPlatformDriverExecutingOrder('loading');
  const transportingOrder = createPlatformDriverExecutingOrder('transporting');
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        tokens: {
          accessToken: 'driver-access-token',
          refreshToken: 'refresh.driver',
          expiresIn: 3600,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [loadingOrder],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverCertificationSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverAcceptanceSettingsSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverIncomeSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverWithdrawalsSnapshot()),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(loadingOrder))
    .mockResolvedValueOnce(createPlatformApiResponse(transportingOrder))
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverIncomeSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverWithdrawalsSnapshot()),
    );
  installPlatformFetchMock(fetchMock);
  const app = await renderApp(1000, {
    platformApiBaseUrl: 'http://localhost:3000/api',
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-user-type-driver' }).props.onPress();
    app.root
      .findByProps({ testID: 'auth-login-method-password' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-phone' })
      .props.onChangeText('13900139009');
    app.root
      .findByProps({ testID: 'auth-login-password' })
      .props.onChangeText('abc123');
  });

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
    await flushMicrotasks();
  });

  expect(app.root.findByProps({ testID: 'driver-my-orders-title' }).props.children)
    .toBe('我的执行订单');
  expect(app.root.findByProps({ testID: 'driver-my-order-card-HY202607060002' }))
    .toBeTruthy();

  await ReactTestRenderer.act(async () => {
    app.root
      .findByProps({ testID: 'driver-open-order-HY202607060002' })
      .props.onPress();
    await flushMicrotasks();
  });

  expect(
    app.root.findByProps({ testID: 'driver-order-detail-title' }).props.children,
  ).toBe('执行订单详情');

  await ReactTestRenderer.act(async () => {
    app.root
      .findByProps({ testID: 'driver-advance-status-HY202607060002' })
      .props.onPress();
    await flushMicrotasks();
  });

  expect(app.root.findByProps({ testID: 'driver-notice' }).props.children).toBe(
    '司机已确认发车。',
  );
  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:3000/api/driver/orders/order-2/status',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer driver-access-token',
        'Idempotency-Key': expect.stringMatching(uuidV4Pattern),
      }),
      body: JSON.stringify({
        nextStatus: 'transporting',
        baseUpdatedAtIso: '2026-07-06T08:00:00.000Z',
      }),
    }),
  );
});

test('keeps current driver order detail visible when status advance fails', async () => {
  const loadingOrder = createPlatformDriverExecutingOrder('loading');
  const transportingOrder = createPlatformDriverExecutingOrder('transporting');
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        user: { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        tokens: {
          accessToken: 'driver-access-token',
          refreshToken: 'refresh.driver',
          expiresIn: 3600,
        },
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse({
        items: [loadingOrder],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverCertificationSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverAcceptanceSettingsSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverIncomeSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverWithdrawalsSnapshot()),
    )
    .mockResolvedValueOnce(createPlatformApiResponse(loadingOrder))
    .mockResolvedValueOnce(
      createPlatformApiErrorResponse(
        409,
        'ORDER_STATE_INVALID',
        '当前司机订单状态不允许推进到目标状态',
      ),
    );
  installPlatformFetchMock(fetchMock);
  const app = await renderApp(1000, {
    platformApiBaseUrl: 'http://localhost:3000/api',
  });

  ReactTestRenderer.act(() => {
    app.root.findByProps({ testID: 'auth-user-type-driver' }).props.onPress();
    app.root
      .findByProps({ testID: 'auth-login-method-password' })
      .props.onPress();
  });

  ReactTestRenderer.act(() => {
    app.root
      .findByProps({ testID: 'auth-login-phone' })
      .props.onChangeText('13900139009');
    app.root
      .findByProps({ testID: 'auth-login-password' })
      .props.onChangeText('abc123');
  });

  await ReactTestRenderer.act(async () => {
    app.root.findByProps({ testID: 'auth-login-submit' }).props.onPress();
    await flushMicrotasks();
  });

  await ReactTestRenderer.act(async () => {
    app.root
      .findByProps({ testID: 'driver-open-order-HY202607060002' })
      .props.onPress();
    await flushMicrotasks();
  });

  await ReactTestRenderer.act(async () => {
    app.root
      .findByProps({ testID: 'driver-advance-status-HY202607060002' })
      .props.onPress();
    await flushMicrotasks();
  });

  expect(app.root.findByProps({ testID: 'driver-order-detail-title' })).toBeTruthy();
  expect(app.root.findByProps({ testID: 'driver-notice' }).props.children).toBe(
    '司机状态更新失败，已加入本地重试队列。',
  );
  expect(
    app.root.findByProps({
      testID: 'driver-order-mutation-retry-status-order-2',
    }),
  ).toBeTruthy();

  const statusEndpoint =
    'http://localhost:3000/api/driver/orders/order-2/status';
  const firstStatusRequest = fetchMock.mock.calls.find(
    ([requestUrl]) => requestUrl === statusEndpoint,
  );
  const originalIdempotencyKey = firstStatusRequest?.[1]?.headers?.[
    'Idempotency-Key'
  ] as string;

  expect(originalIdempotencyKey).toMatch(uuidV4Pattern);

  fetchMock
    .mockResolvedValueOnce(createPlatformApiResponse(transportingOrder))
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverIncomeSnapshot()),
    )
    .mockResolvedValueOnce(
      createPlatformApiResponse(createPlatformDriverWithdrawalsSnapshot()),
    );

  await ReactTestRenderer.act(async () => {
    app.root
      .findByProps({ testID: 'driver-order-mutation-retry-status-order-2' })
      .props.onPress();
    await flushMicrotasks();
  });

  const statusRequests = fetchMock.mock.calls.filter(
    ([requestUrl]) => requestUrl === statusEndpoint,
  );

  expect(statusRequests).toHaveLength(2);
  expect(statusRequests[1]?.[1]).toEqual(
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer driver-access-token',
        'Idempotency-Key': originalIdempotencyKey,
      }),
      body: firstStatusRequest?.[1]?.body,
    }),
  );
  expect(
    app.root.findAllByProps({
      testID: 'driver-order-mutation-retry-status-order-2',
    }),
  ).toHaveLength(0);
});

function createPlatformDriverHallOrder() {
  return {
    id: 'order-1',
    orderNo: 'HY202607060001',
    shipperId: 'shipper-1',
    status: 'waiting',
    cargoType: 'build',
    weightText: '2.5 吨',
    quantityText: '12 箱',
    pickupAddress: '宝安区福永物流园',
    pickupContact: '赵经理',
    pickupPhone: '13900139001',
    deliveryAddress: '龙岗区坂田仓',
    deliveryContact: '钱店长',
    deliveryPhone: '13900139002',
    vehicleRequirement: 'medium',
    needTailboard: false,
    needTarp: false,
    pickupTimeIso: '2026-07-07T02:00:00.000Z',
    pricingMode: 'fixed',
    priceCents: 76000,
    paymentMethod: 'cod',
    createdAtIso: '2026-07-06T08:00:00.000Z',
    updatedAtIso: '2026-07-06T08:00:00.000Z',
    events: [],
  };
}

function createPlatformDriverExecutingOrder(
  status: 'loading' | 'transporting' | 'confirming',
) {
  return {
    ...createPlatformDriverHallOrder(),
    id: 'order-2',
    orderNo: 'HY202607060002',
    status,
    events: [
      {
        id: 'event-driver-accepted',
        actorUserId: 'driver-1',
        eventType: 'driver_accepted',
        noteText: '马上联系货主',
        createdAtIso: '2026-07-06T08:05:00.000Z',
      },
    ],
  };
}

function createPlatformDriverCertificationSnapshot({
  identityStatus = 'unsubmitted',
  vehicleStatus = 'unsubmitted',
}: {
  identityStatus?: 'unsubmitted' | 'reviewing' | 'approved' | 'rejected';
  vehicleStatus?: 'unsubmitted' | 'reviewing' | 'approved' | 'rejected';
} = {}) {
  return {
    identity: { driverId: 'driver-1', status: identityStatus },
    vehicle: { driverId: 'driver-1', status: vehicleStatus },
  };
}

function createPlatformDriverAcceptanceSettingsSnapshot({
  isOnline = true,
  maxDistanceKm = 50,
  vehicleTypePreferences = ['medium'],
}: {
  isOnline?: boolean;
  maxDistanceKm?: number;
  vehicleTypePreferences?: string[];
} = {}) {
  return {
    driverId: 'driver-1',
    isOnline,
    maxDistanceKm,
    vehicleTypePreferences,
    createdAtIso: '2026-07-09T02:00:00.000Z',
    updatedAtIso: '2026-07-09T02:00:00.000Z',
  };
}

function createPlatformDriverIncomeSnapshot() {
  return {
    driverId: 'driver-1',
    summary: {
      todayIncomeCents: 36100,
      weekIncomeCents: 36100,
      monthIncomeCents: 36100,
      historyIncomeCents: 36100,
      pendingSettlementCents: 12000,
      availableWithdrawalCents: 24100,
      reviewingWithdrawalCents: 12000,
      completedOrderCount: 1,
    },
    records: [
      {
        orderId: 'order-completed-1',
        orderNo: 'HY202607090001',
        completedAtIso: '2026-07-09T02:10:00.000Z',
        routeText: '宝安区福永物流园 -> 龙岗区坂田仓',
        vehicleType: 'medium',
        grossAmountCents: 38000,
        platformFeeCents: 1900,
        netIncomeCents: 36100,
      },
    ],
  };
}

function createPlatformDriverWithdrawalsSnapshot() {
  return {
    items: [
      {
        id: 'withdrawal-1',
        driverId: 'driver-1',
        amountCents: 12000,
        bankAccountName: '李师傅',
        bankName: '招商银行',
        bankAccountMasked: '**** **** **** 1234',
        status: 'reviewing',
        createdAtIso: '2026-07-09T02:20:00.000Z',
        updatedAtIso: '2026-07-09T02:20:00.000Z',
      },
    ],
    page: 1,
    pageSize: 5,
    total: 1,
  };
}
