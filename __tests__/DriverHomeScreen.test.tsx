import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { DriverHomeScreen } from '../src/screens/DriverHomeScreen';
import { PlatformApiError } from '../src/services/platformApiClient';

const driverEvaluationReplyQueueStorageKey =
  '@vireCodeing/driver-evaluation-reply-queue';
const driverOrderMutationQueueStorageKey =
  '@vireCodeing/driver-order-mutation-queue:local-driver';
const originalFetch = globalThis.fetch;
const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createDriverCertificationSnapshot() {
  return {
    driver: {
      id: 'driver-1',
      phone: '13900139009',
    },
    identity: {
      driverId: 'driver-1',
      status: 'unsubmitted' as const,
    },
    vehicle: {
      driverId: 'driver-1',
      status: 'unsubmitted' as const,
    },
  };
}

function createDriverOrdersPage() {
  return {
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
  };
}

function createDriverAcceptanceSettingsSnapshot() {
  return {
    driverId: 'driver-1',
    isOnline: true,
    maxDistanceKm: 50,
    vehicleTypePreferences: ['medium'],
    createdAtIso: '2026-07-09T02:00:00.000Z',
    updatedAtIso: '2026-07-09T02:00:00.000Z',
  };
}

function createDriverIncomeOverviewSnapshot() {
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
      withdrawnCents: 8000,
      completedOrderCount: 1,
    },
    records: [
      {
        orderId: 'order-completed-1',
        orderNo: 'HY202607090001',
        completedAtIso: '2026-07-09T02:00:00.000Z',
        routeText: '宝安区福永物流园 -> 龙岗区坂田仓',
        vehicleType: 'medium',
        grossAmountCents: 38000,
        platformFeeCents: 1900,
        netIncomeCents: 36100,
      },
    ],
  };
}

function createDriverWithdrawalsPage() {
  return {
    items: [
      {
        id: 'withdrawal-1',
        driverId: 'driver-1',
        amountCents: 12000,
        bankAccountName: '李师傅',
        bankName: '招商银行',
        bankAccountMasked: '**** **** **** 1234',
        status: 'reviewing' as const,
        createdAtIso: '2026-07-09T02:10:00.000Z',
        updatedAtIso: '2026-07-09T02:10:00.000Z',
      },
    ],
    page: 1,
    pageSize: 5,
    total: 1,
  };
}

function createDriverBankCardsPage(
  overrides: Partial<{
    id: string;
    bankAccountName: string;
    bankName: string;
    bankAccountMasked: string;
    isDefault: boolean;
    lastUsedAtIso: string;
    createdAtIso: string;
    updatedAtIso: string;
  }> = {},
) {
  return {
    items: [
      {
        id: 'bank-card-1',
        bankAccountName: '李师傅',
        bankName: '招商银行',
        bankAccountMasked: '**** **** **** 1234',
        isDefault: true,
        createdAtIso: '2026-07-09T02:20:00.000Z',
        updatedAtIso: '2026-07-09T02:20:00.000Z',
        ...overrides,
      },
    ],
    total: 1,
  };
}

function createMockDriverOrderApi() {
  return {
    listOrderHall: jest.fn().mockResolvedValue(createDriverOrdersPage()),
    listMyOrders: jest.fn().mockResolvedValue(createDriverOrdersPage()),
    getIncomeOverview: jest
      .fn()
      .mockResolvedValue(createDriverIncomeOverviewSnapshot()),
    listWithdrawals: jest
      .fn()
      .mockResolvedValue(createDriverWithdrawalsPage()),
    createWithdrawal: jest.fn(),
    listBankCards: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    createBankCard: jest.fn(),
    updateBankCard: jest.fn(),
    deleteBankCard: jest.fn(),
    getAcceptanceSettings: jest
      .fn()
      .mockResolvedValue(createDriverAcceptanceSettingsSnapshot()),
    saveAcceptanceSettings: jest.fn(),
    getOrder: jest.fn(),
    listExceptionCases: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    appealExceptionCase: jest.fn(),
    quoteOrder: jest.fn(),
    acceptOrder: jest.fn(),
    advanceOrderStatus: jest.fn(),
    cancelOrder: jest.fn(),
    replyToEvaluation: jest.fn(),
    evaluateShipper: jest.fn(),
    reportException: jest.fn(),
  };
}

function createMockDriverCertificationApi() {
  return {
    getCertification: jest
      .fn()
      .mockResolvedValue(createDriverCertificationSnapshot()),
    submitIdentity: jest.fn(),
    submitVehicle: jest.fn(),
    listAdminCertifications: jest.fn(),
    reviewAdminIdentity: jest.fn(),
    reviewAdminVehicle: jest.fn(),
    getAdminAttachmentPreviews: jest.fn(),
    listAdminReviewEvents: jest.fn(),
  };
}

function createMockDriverMapsApi() {
  return {
    getDriverLocation: jest.fn().mockRejectedValue(
      new PlatformApiError(
        'driver location not found',
        'DRIVER_LOCATION_NOT_FOUND',
        404,
      ),
    ),
    reportDriverLocation: jest.fn().mockResolvedValue({
      driverId: 'driver-1',
      latitude: 22.6,
      longitude: 113.9,
      source: 'sandbox' as const,
      recordedAtIso: '2026-07-09T02:00:00.000Z',
      updatedAtIso: '2026-07-09T02:00:00.000Z',
    }),
    getDriverNavigationTargets: jest.fn().mockResolvedValue({
      orderId: 'order-1',
      orderNo: 'HY202607090001',
      targets: [],
    }),
  };
}

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join('');
}

function getWithdrawalRecordCardTestIds(
  renderer: ReactTestRenderer.ReactTestRenderer,
) {
  return Array.from(
    new Set(
      renderer.root
        .findAll(
          node =>
            typeof node.props.testID === 'string' &&
            node.props.testID.startsWith('driver-withdrawal-record-card-'),
        )
        .map(node => node.props.testID),
    ),
  );
}

function getIncomeRecordCardTestIds(
  renderer: ReactTestRenderer.ReactTestRenderer,
) {
  return Array.from(
    new Set(
      renderer.root
        .findAll(
          node =>
            typeof node.props.testID === 'string' &&
            node.props.testID.startsWith('driver-income-record-card-'),
        )
        .map(node => node.props.testID),
    ),
  );
}

function getDriverOrderCardTestIds(
  renderer: ReactTestRenderer.ReactTestRenderer,
) {
  return Array.from(
    new Set(
      renderer.root
        .findAll(
          node =>
            typeof node.props.testID === 'string' &&
            node.props.testID.startsWith('driver-order-card-'),
        )
        .map(node => node.props.testID),
    ),
  );
}

function getDriverMyOrderCardTestIds(
  renderer: ReactTestRenderer.ReactTestRenderer,
) {
  return Array.from(
    new Set(
      renderer.root
        .findAll(
          node =>
            typeof node.props.testID === 'string' &&
            node.props.testID.startsWith('driver-my-order-card-'),
        )
        .map(node => node.props.testID),
    ),
  );
}

function getDriverCompletedOrderCardTestIds(
  renderer: ReactTestRenderer.ReactTestRenderer,
) {
  return Array.from(
    new Set(
      renderer.root
        .findAll(
          node =>
            typeof node.props.testID === 'string' &&
            node.props.testID.startsWith('driver-completed-order-card-'),
        )
        .map(node => node.props.testID),
    ),
  );
}

async function flushMicrotasks() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
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

beforeEach(async () => {
  await AsyncStorage.clear();
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
  }) as unknown as typeof fetch;
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
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.clearAllMocks();
});

describe('DriverHomeScreen certification uploads', () => {
  it('loads and saves driver acceptance settings through the driver order api', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.saveAcceptanceSettings.mockResolvedValue({
      ...createDriverAcceptanceSettingsSnapshot(),
      isOnline: false,
      maxDistanceKm: 30,
      vehicleTypePreferences: ['medium', 'box'],
      updatedAtIso: '2026-07-09T02:05:00.000Z',
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.getAcceptanceSettings).toHaveBeenCalledTimes(1);
    expect(getRenderedText(renderer)).toContain('车型匹配：中型货车');

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-settings-max-distance-km' })
        .props.onChangeText('30');
      renderer.root
        .findByProps({ testID: 'driver-settings-vehicle-type-box' })
        .props.onPress();
      renderer.root
        .findByProps({ testID: 'driver-settings-toggle-online' })
        .props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-settings-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.saveAcceptanceSettings).toHaveBeenCalledWith({
      isOnline: false,
      maxDistanceKm: 30,
      vehicleTypePreferences: ['medium', 'box'],
    });
    expect(getRenderedText(renderer)).toContain('接单设置已保存，当前为离线接单。');
    expect(getRenderedText(renderer)).toContain('车型匹配：中型货车、厢式货车');
  });

  it('manually refreshes driver home snapshots including certification, settings, income and bank cards', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.getAcceptanceSettings
      .mockResolvedValueOnce(createDriverAcceptanceSettingsSnapshot())
      .mockResolvedValueOnce({
        ...createDriverAcceptanceSettingsSnapshot(),
        isOnline: false,
        maxDistanceKm: 30,
        vehicleTypePreferences: ['box'],
        updatedAtIso: '2026-07-09T02:20:00.000Z',
      });
    platformDriverOrderApi.getIncomeOverview
      .mockResolvedValueOnce(createDriverIncomeOverviewSnapshot())
      .mockResolvedValueOnce({
        ...createDriverIncomeOverviewSnapshot(),
        summary: {
          ...createDriverIncomeOverviewSnapshot().summary,
          todayIncomeCents: 40200,
          availableWithdrawalCents: 28000,
          completedOrderCount: 2,
        },
      });
    platformDriverOrderApi.listWithdrawals
      .mockResolvedValueOnce(createDriverWithdrawalsPage())
      .mockResolvedValueOnce({
        items: [
          {
            id: 'withdrawal-2',
            driverId: 'driver-1',
            amountCents: 18000,
            bankAccountName: '李师傅',
            bankName: '建设银行',
            bankAccountMasked: '**** **** **** 5678',
            status: 'reviewing' as const,
            createdAtIso: '2026-07-09T03:10:00.000Z',
            updatedAtIso: '2026-07-09T03:10:00.000Z',
          },
        ],
        page: 1,
        pageSize: 5,
        total: 1,
      });
    platformDriverOrderApi.listBankCards
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'bank-card-1',
            driverId: 'driver-1',
            bankName: '建设银行',
            bankAccountName: '李师傅',
            bankAccountMasked: '**** **** **** 5678',
            isDefault: true,
            createdAtIso: '2026-07-09T03:20:00.000Z',
            updatedAtIso: '2026-07-09T03:20:00.000Z',
          },
        ],
        total: 1,
      });
    const platformDriverCertificationApi = createMockDriverCertificationApi();
    platformDriverCertificationApi.getCertification
      .mockResolvedValueOnce(createDriverCertificationSnapshot())
      .mockResolvedValueOnce({
        ...createDriverCertificationSnapshot(),
        identity: {
          driverId: 'driver-1',
          realName: '李师傅',
          identityNumber: '11010119900307201X',
          identityFrontFileId: 'file-id-front',
          identityBackFileId: 'file-id-back',
          status: 'approved' as const,
        },
        vehicle: {
          driverId: 'driver-1',
          plateNumber: '粤B12345',
          vehicleType: '厢式货车',
          vehicleLengthText: '4.2 米',
          loadCapacityText: '2 吨',
          hasTailboard: true,
          vehiclePhotoFileId: 'file-vehicle-photo',
          status: 'reviewing' as const,
        },
      });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={platformDriverCertificationApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    expect(getRenderedText(renderer)).toContain('接单状态：在线');
    expect(getRenderedText(renderer)).toContain('暂无绑定银行卡。');
    expect(getRenderedText(renderer)).toContain('实名认证：未提交');

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-refresh-home' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverCertificationApi.getCertification).toHaveBeenCalledTimes(2);
    expect(platformDriverOrderApi.getAcceptanceSettings).toHaveBeenCalledTimes(2);
    expect(platformDriverOrderApi.getIncomeOverview).toHaveBeenCalledTimes(2);
    expect(platformDriverOrderApi.listWithdrawals).toHaveBeenCalledTimes(2);
    expect(platformDriverOrderApi.listBankCards).toHaveBeenCalledTimes(2);
    expect(getRenderedText(renderer)).toContain('司机主页已手动刷新到最新平台快照。');
    expect(getRenderedText(renderer)).toContain('接单状态：离线');
    expect(getRenderedText(renderer)).toContain('接单范围：30 公里');
    expect(getRenderedText(renderer)).toContain('车型匹配：厢式货车');
    expect(getRenderedText(renderer)).toContain('今日收入：￥402.00');
    expect(getRenderedText(renderer)).toContain('已完成 2 单');
    expect(getRenderedText(renderer)).toContain('建设银行 · **** **** **** 5678');
    expect(getRenderedText(renderer)).toContain('实名认证：已通过');
    expect(getRenderedText(renderer)).toContain('车辆认证：审核中');
  });

  it('manually refreshes the currently opened driver order detail snapshots', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607090009',
      status: 'loading' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-09T02:00:00.000Z',
      updatedAtIso: '2026-07-09T02:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T03:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const refreshedOrder = {
      ...order,
      deliveryAddress: '南山区科技园仓',
      deliveryContact: '周主管',
      deliveryPhone: '13900139009',
      updatedAtIso: '2026-07-09T03:00:00.000Z',
      events: [
        {
          type: 'status_changed',
          status: 'transporting',
          createdAtIso: '2026-07-09T03:00:00.000Z',
        },
      ],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders
      .mockResolvedValueOnce({
        items: [order],
        page: 1,
        pageSize: 20,
        total: 1,
      })
      .mockResolvedValueOnce({
        items: [refreshedOrder],
        page: 1,
        pageSize: 20,
        total: 1,
      });
    platformDriverOrderApi.getOrder
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce(refreshedOrder);
    platformDriverOrderApi.listExceptionCases
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'case-1',
            caseNo: 'EC202607090001',
            orderId: 'order-1',
            orderNo: 'HY202607090009',
            sourceEventId: 'event-1',
            reporterUserId: 'driver-1',
            sourceRole: 'driver',
            typeLabel: '货损',
            description: '卸货前发现外包装受损。',
            status: 'processing' as const,
            attachmentFileIds: [],
            appealStatus: 'not_requested' as const,
            createdAtIso: '2026-07-09T03:05:00.000Z',
            updatedAtIso: '2026-07-09T03:05:00.000Z',
            actions: [],
          },
        ],
        total: 1,
      });
    const platformMapsApi = createMockDriverMapsApi();
    platformMapsApi.getDriverNavigationTargets
      .mockResolvedValueOnce({
        orderId: 'order-1',
        orderNo: 'HY202607090009',
        targets: [
          {
            type: 'delivery',
            address: '龙岗区坂田仓 A 栋',
            contactName: '钱店长',
            contactPhone: '13900139002',
          },
        ],
      })
      .mockResolvedValueOnce({
        orderId: 'order-1',
        orderNo: 'HY202607090009',
        targets: [
          {
            type: 'delivery',
            address: '南山区科技园仓 2 号门',
            contactName: '周主管',
            contactPhone: '13900139009',
          },
        ],
      });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          platformMapsApi={platformMapsApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607090009' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(
      renderer.root.findByProps({
        testID: 'driver-order-route-HY202607090009',
      }).props.children,
    ).toBe('路线：宝安区福永物流园 → 龙岗区坂田仓');

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-refresh-home' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.getOrder).toHaveBeenCalledTimes(2);
    expect(platformDriverOrderApi.listExceptionCases).toHaveBeenCalledTimes(2);
    expect(platformMapsApi.getDriverNavigationTargets).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findByProps({
        testID: 'driver-order-route-HY202607090009',
      }).props.children,
    ).toBe('路线：宝安区福永物流园 → 南山区科技园仓');
    expect(
      renderer.root.findByProps({
        testID: 'driver-navigation-target-address-delivery-HY202607090009',
      }).props.children,
    ).toBe('南山区科技园仓 2 号门');
    expect(getRenderedText(renderer)).toContain('事件记录：1 条');
    expect(getRenderedText(renderer)).toContain('司机主页已手动刷新到最新平台快照。');
  });

  it('keeps local certification and acceptance drafts when manually refreshing the driver home screen', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    const platformDriverCertificationApi = createMockDriverCertificationApi();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={platformDriverCertificationApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-settings-max-distance-km' })
        .props.onChangeText('88');
      renderer.root
        .findByProps({ testID: 'driver-cert-real-name' })
        .props.onChangeText('本地李师傅');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-refresh-home' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.getAcceptanceSettings).toHaveBeenCalledTimes(1);
    expect(platformDriverCertificationApi.getCertification).toHaveBeenCalledTimes(
      1,
    );
    expect(platformDriverOrderApi.getIncomeOverview).toHaveBeenCalledTimes(2);
    expect(platformDriverOrderApi.listBankCards).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findByProps({ testID: 'driver-settings-max-distance-km' }).props
        .value,
    ).toBe('88');
    expect(
      renderer.root.findByProps({ testID: 'driver-cert-real-name' }).props.value,
    ).toBe('本地李师傅');
    expect(getRenderedText(renderer)).toContain(
      '司机主页已手动刷新；已保留未保存的接单设置、司机认证草稿。',
    );
  });

  it('reports a sandbox hall location and refreshes nearby orders from the driver hall', async () => {
    const hallOrder = {
      id: 'order-hall-1',
      orderNo: 'HY202607090001',
      status: 'waiting' as const,
      pickupDistanceMeters: 1200,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-09T02:00:00.000Z',
      updatedAtIso: '2026-07-09T02:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T03:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listOrderHall
      .mockResolvedValueOnce(createDriverOrdersPage())
      .mockResolvedValueOnce({
        items: [hallOrder],
        page: 1,
        pageSize: 20,
        total: 1,
      });
    const platformMapsApi = createMockDriverMapsApi();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          platformMapsApi={platformMapsApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root.findByProps({ testID: 'driver-report-hall-location' }).props
        .onPress();
    });

    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
    });

    expect(platformMapsApi.reportDriverLocation).toHaveBeenCalledWith({
      latitude: 22.6,
      longitude: 113.9,
      accuracyMeters: 25,
      source: 'sandbox',
    });
    expect(platformDriverOrderApi.listOrderHall).toHaveBeenCalledTimes(2);
    expect(getRenderedText(renderer)).toContain(
      '已上报 sandbox 大厅位置，接单范围已按最新位置刷新。',
    );
    expect(getRenderedText(renderer)).toContain('约 1.2 公里');
    expect(
      renderer.root.findByProps({ testID: 'driver-hall-location-coordinate' }).props
        .children,
    ).toBe('22.600000, 113.900000');
    expect(
      renderer.root.findByProps({ testID: 'driver-hall-location-meta' }).props
        .children,
    ).toBe('来源：sandbox 上报 · 上报时间：2026-07-09 10:00');
  });

  it('sorts hall orders by pickup distance before rendering cards', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listOrderHall.mockResolvedValue({
      items: [
        {
          id: 'order-hall-unknown',
          orderNo: 'HY202607090003',
          status: 'waiting' as const,
          pickupAddress: '龙岗区坂田仓',
          deliveryAddress: '南山区科技园',
          cargoType: 'build',
          weightText: '2.5 吨',
          quantityText: '12 箱',
          pickupContact: '赵经理',
          pickupPhone: '13900139001',
          deliveryContact: '钱店长',
          deliveryPhone: '13900139002',
          vehicleRequirement: 'medium',
          createdAtIso: '2026-07-09T04:00:00.000Z',
          updatedAtIso: '2026-07-09T04:00:00.000Z',
          needTailboard: false,
          needTarp: false,
          pickupTimeIso: '2026-07-09T05:00:00.000Z',
          pricingMode: 'fixed' as const,
          priceCents: 76000,
          paymentMethod: 'cod' as const,
          shipperId: 'shipper-1',
          events: [],
        },
        {
          id: 'order-hall-far',
          orderNo: 'HY202607090002',
          status: 'waiting' as const,
          pickupDistanceMeters: 6400,
          pickupAddress: '宝安区西乡仓',
          deliveryAddress: '福田区会展中心',
          cargoType: 'build',
          weightText: '2.5 吨',
          quantityText: '12 箱',
          pickupContact: '赵经理',
          pickupPhone: '13900139001',
          deliveryContact: '钱店长',
          deliveryPhone: '13900139002',
          vehicleRequirement: 'medium',
          createdAtIso: '2026-07-09T03:00:00.000Z',
          updatedAtIso: '2026-07-09T03:10:00.000Z',
          needTailboard: false,
          needTarp: false,
          pickupTimeIso: '2026-07-09T04:00:00.000Z',
          pricingMode: 'fixed' as const,
          priceCents: 76000,
          paymentMethod: 'cod' as const,
          shipperId: 'shipper-1',
          events: [],
        },
        {
          id: 'order-hall-near',
          orderNo: 'HY202607090001',
          status: 'waiting' as const,
          pickupDistanceMeters: 1200,
          pickupAddress: '宝安区福永物流园',
          deliveryAddress: '龙岗区坂田仓',
          cargoType: 'build',
          weightText: '2.5 吨',
          quantityText: '12 箱',
          pickupContact: '赵经理',
          pickupPhone: '13900139001',
          deliveryContact: '钱店长',
          deliveryPhone: '13900139002',
          vehicleRequirement: 'medium',
          createdAtIso: '2026-07-09T02:00:00.000Z',
          updatedAtIso: '2026-07-09T02:00:00.000Z',
          needTailboard: false,
          needTarp: false,
          pickupTimeIso: '2026-07-09T03:00:00.000Z',
          pricingMode: 'fixed' as const,
          priceCents: 76000,
          paymentMethod: 'cod' as const,
          shipperId: 'shipper-1',
          events: [],
        },
      ],
      page: 1,
      pageSize: 20,
      total: 3,
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    expect(getDriverOrderCardTestIds(renderer)).toEqual([
      'driver-order-card-HY202607090001',
      'driver-order-card-HY202607090002',
      'driver-order-card-HY202607090003',
    ]);
  });

  it('sorts my orders by latest activity before rendering execution and completed cards', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    const baseOrder = {
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T03:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [
        {
          ...baseOrder,
          id: 'order-completed-earlier',
          orderNo: 'HY202607090011',
          status: 'completed' as const,
          createdAtIso: '2026-07-09T01:00:00.000Z',
          updatedAtIso: '2026-07-09T01:05:00.000Z',
        },
        {
          ...baseOrder,
          id: 'order-loading-middle',
          orderNo: 'HY202607090010',
          status: 'loading' as const,
          createdAtIso: '2026-07-09T02:00:00.000Z',
          updatedAtIso: '2026-07-09T02:05:00.000Z',
        },
        {
          ...baseOrder,
          id: 'order-completed-later',
          orderNo: 'HY202607090012',
          status: 'completed' as const,
          createdAtIso: '2026-07-09T03:00:00.000Z',
          updatedAtIso: '2026-07-09T03:05:00.000Z',
        },
        {
          ...baseOrder,
          id: 'order-transporting-latest',
          orderNo: 'HY202607090013',
          status: 'transporting' as const,
          createdAtIso: '2026-07-09T04:00:00.000Z',
          updatedAtIso: '2026-07-09T04:05:00.000Z',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 4,
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.listMyOrders).toHaveBeenCalledWith({
      statuses: ['loading', 'transporting', 'confirming', 'completed'],
      page: 1,
      pageSize: 40,
    });
    expect(
      renderer.root.findAllByProps({ testID: 'driver-my-orders-tab-completed' }),
    ).toHaveLength(0);
    expect(getDriverMyOrderCardTestIds(renderer)).toEqual([
      'driver-my-order-card-HY202607090013',
      'driver-my-order-card-HY202607090010',
    ]);
    expect(getDriverCompletedOrderCardTestIds(renderer)).toEqual([
      'driver-completed-order-card-HY202607090012',
      'driver-completed-order-card-HY202607090011',
    ]);
  });

  it('hydrates the latest hall location snapshot on load and manual refresh', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    const platformMapsApi = createMockDriverMapsApi();
    platformMapsApi.getDriverLocation
      .mockResolvedValueOnce({
        driverId: 'driver-1',
        latitude: 22.61,
        longitude: 113.91,
        source: 'manual' as const,
        recordedAtIso: '2026-07-09T02:00:00.000Z',
        updatedAtIso: '2026-07-09T02:00:00.000Z',
      })
      .mockResolvedValueOnce({
        driverId: 'driver-1',
        latitude: 22.62,
        longitude: 113.92,
        source: 'device' as const,
        recordedAtIso: '2026-07-09T03:00:00.000Z',
        updatedAtIso: '2026-07-09T03:00:00.000Z',
      });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          platformMapsApi={platformMapsApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    expect(platformMapsApi.getDriverLocation).toHaveBeenCalledTimes(1);
    expect(
      renderer.root.findByProps({ testID: 'driver-hall-location-coordinate' }).props
        .children,
    ).toBe('22.610000, 113.910000');
    expect(
      renderer.root.findByProps({ testID: 'driver-hall-location-meta' }).props
        .children,
    ).toBe('来源：手动上报 · 上报时间：2026-07-09 10:00');

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-refresh-home' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformMapsApi.getDriverLocation).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findByProps({ testID: 'driver-hall-location-coordinate' }).props
        .children,
    ).toBe('22.620000, 113.920000');
    expect(
      renderer.root.findByProps({ testID: 'driver-hall-location-meta' }).props
        .children,
    ).toBe('来源：设备定位 · 上报时间：2026-07-09 11:00');
    expect(getRenderedText(renderer)).toContain('司机主页已手动刷新到最新平台快照。');
  });

  it('ignores execution-order location snapshots when hydrating hall location feedback', async () => {
    const platformMapsApi = createMockDriverMapsApi();
    platformMapsApi.getDriverLocation.mockResolvedValue({
      driverId: 'driver-1',
      orderId: 'order-1',
      latitude: 22.61,
      longitude: 113.91,
      source: 'sandbox' as const,
      recordedAtIso: '2026-07-09T02:00:00.000Z',
      updatedAtIso: '2026-07-09T02:00:00.000Z',
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={createMockDriverOrderApi()}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          platformMapsApi={platformMapsApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    expect(platformMapsApi.getDriverLocation).toHaveBeenCalledTimes(1);
    expect(
      renderer.root.findAllByProps({ testID: 'driver-hall-location-coordinate' }),
    ).toHaveLength(0);
  });

  it('keeps hall location feedback visible when the latest snapshot has no coordinates', async () => {
    const platformMapsApi = createMockDriverMapsApi();
    platformMapsApi.getDriverLocation.mockResolvedValue({
      driverId: 'driver-1',
      source: 'sandbox' as const,
      updatedAtIso: '2026-07-09T02:00:00.000Z',
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={createMockDriverOrderApi()}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          platformMapsApi={platformMapsApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    expect(platformMapsApi.getDriverLocation).toHaveBeenCalledTimes(1);
    expect(
      renderer.root.findAllByProps({ testID: 'driver-hall-location-coordinate' }),
    ).toHaveLength(0);
    expect(
      renderer.root.findByProps({ testID: 'driver-hall-location-meta' }).props
        .children,
    ).toBe('来源：sandbox 上报');
  });

  it('shows route and navigation target details in the selected driver order detail', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607090010',
      status: 'loading' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-09T02:00:00.000Z',
      updatedAtIso: '2026-07-09T02:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T03:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    const platformMapsApi = createMockDriverMapsApi();
    platformMapsApi.getDriverNavigationTargets.mockResolvedValue({
      orderId: 'order-1',
      orderNo: 'HY202607090010',
      targets: [
        {
          type: 'pickup',
          address: '宝安区福永物流园 1 号门',
          contactName: '赵经理',
          contactPhone: '13900139001',
        },
        {
          type: 'delivery',
          address: '龙岗区坂田仓 A 栋',
          contactName: '钱店长',
          contactPhone: '13900139002',
        },
      ],
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          platformMapsApi={platformMapsApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607090010' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(
      renderer.root.findByProps({
        testID: 'driver-order-route-HY202607090010',
      }).props.children,
    ).toBe('路线：宝安区福永物流园 → 龙岗区坂田仓');
    expect(
      renderer.root.findByProps({
        testID: 'driver-navigation-target-address-pickup-HY202607090010',
      }).props.children,
    ).toBe('宝安区福永物流园 1 号门');
    expect(
      renderer.root.findByProps({
        testID: 'driver-navigation-target-contact-delivery-HY202607090010',
      }).props.children,
    ).toBe('联系人：钱店长 13900139002');
  });

  it('switches the visible driver order detail context immediately before getOrder resolves', async () => {
    const firstOrder = {
      id: 'order-1',
      orderNo: 'HY202607090020',
      status: 'loading' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-09T02:00:00.000Z',
      updatedAtIso: '2026-07-09T02:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T03:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const secondOrder = {
      ...firstOrder,
      id: 'order-2',
      orderNo: 'HY202607090021',
      pickupAddress: '南山区科技园',
      deliveryAddress: '宝安机场仓',
      pickupContact: '王主管',
      pickupPhone: '13900139008',
      deliveryContact: '刘经理',
      deliveryPhone: '13900139007',
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [firstOrder, secondOrder],
      page: 1,
      pageSize: 20,
      total: 2,
    });
    let resolveSecondOrderDetail:
      | ((value: typeof secondOrder) => void)
      | undefined;
    const pendingSecondOrderDetail = new Promise<typeof secondOrder>(resolve => {
      resolveSecondOrderDetail = resolve;
    });
    platformDriverOrderApi.getOrder
      .mockResolvedValueOnce(firstOrder)
      .mockReturnValueOnce(pendingSecondOrderDetail);

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607090020' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(
      renderer.root.findByProps({
        testID: 'driver-order-route-HY202607090020',
      }).props.children,
    ).toBe('路线：宝安区福永物流园 → 龙岗区坂田仓');

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607090021' })
        .props.onPress();
    });

    expect(
      renderer.root.findByProps({
        testID: 'driver-order-route-HY202607090021',
      }).props.children,
    ).toBe('路线：南山区科技园 → 宝安机场仓');
    expect(
      renderer.root.findAllByProps({
        testID: 'driver-order-route-HY202607090020',
      }),
    ).toHaveLength(0);

    await ReactTestRenderer.act(async () => {
      resolveSecondOrderDetail?.(secondOrder);
      await flushMicrotasks();
    });
  });

  it('shows the latest reported driver location snapshot after reporting sandbox order location', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607090011',
      status: 'loading' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-09T02:00:00.000Z',
      updatedAtIso: '2026-07-09T02:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T03:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    const platformMapsApi = createMockDriverMapsApi();
    platformMapsApi.getDriverNavigationTargets.mockResolvedValue({
      orderId: 'order-1',
      orderNo: 'HY202607090011',
      targets: [
        {
          type: 'pickup',
          address: '宝安区福永物流园 1 号门',
          latitude: 22.6,
          longitude: 113.9,
          contactName: '赵经理',
          contactPhone: '13900139001',
        },
      ],
    });
    platformMapsApi.reportDriverLocation.mockResolvedValue({
      driverId: 'driver-1',
      orderId: 'order-1',
      latitude: 22.61,
      longitude: 113.91,
      accuracyMeters: 25,
      source: 'sandbox' as const,
      recordedAtIso: '2026-07-09T03:10:00.000Z',
      updatedAtIso: '2026-07-09T03:10:00.000Z',
      distanceToTargetMeters: 3200,
      etaMinutes: 7,
      targetType: 'delivery' as const,
      targetAddress: '龙岗区坂田仓',
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          platformMapsApi={platformMapsApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607090011' })
        .props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findAllByProps({
        testID: 'driver-report-location-HY202607090011',
      })[0].props.onPress();
      await flushMicrotasks();
    });

    expect(platformMapsApi.reportDriverLocation).toHaveBeenCalledWith({
      latitude: 22.6,
      longitude: 113.9,
      orderId: 'order-1',
      source: 'sandbox',
      accuracyMeters: 25,
    });
    expect(
      renderer.root.findByProps({
        testID: 'driver-latest-location-coordinate-HY202607090011',
      }).props.children,
    ).toBe('22.610000, 113.910000');
    expect(
      renderer.root.findByProps({
        testID: 'driver-latest-location-meta-HY202607090011',
      }).props.children,
    ).toBe('来源：sandbox 上报 · 上报时间：2026-07-09 11:10');
    expect(
      renderer.root.findByProps({
        testID: 'driver-latest-location-estimate-HY202607090011',
      }).props.children,
    ).toBe('距卸货点（龙岗区坂田仓） 约 3.2 公里 · 预计 约 7 分钟');
    expect(
      renderer.root.findByProps({
        testID: 'driver-latest-location-target-HY202607090011',
      }).props.children,
    ).toBe('当前目标：龙岗区坂田仓');
  });

  it('hydrates the latest reported driver location when reopening an executing order detail', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607090012',
      status: 'loading' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-09T02:00:00.000Z',
      updatedAtIso: '2026-07-09T02:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T03:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    const platformMapsApi = createMockDriverMapsApi();
    platformMapsApi.getDriverNavigationTargets.mockResolvedValue({
      orderId: 'order-1',
      orderNo: 'HY202607090012',
      targets: [
        {
          type: 'pickup',
          address: '宝安区福永物流园 1 号门',
          contactName: '赵经理',
          contactPhone: '13900139001',
        },
      ],
    });
    platformMapsApi.getDriverLocation
      .mockRejectedValueOnce(
        new PlatformApiError(
          'driver location not found',
          'DRIVER_LOCATION_NOT_FOUND',
          404,
        ),
      )
      .mockResolvedValueOnce({
        driverId: 'driver-1',
        orderId: 'order-1',
        latitude: 22.61,
        longitude: 113.91,
        source: 'device' as const,
        recordedAtIso: '2026-07-09T02:30:00.000Z',
        updatedAtIso: '2026-07-09T02:30:00.000Z',
        distanceToTargetMeters: 860,
        etaMinutes: 2,
        targetType: 'pickup' as const,
        targetAddress: '宝安区福永物流园 1 号门',
      });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          platformMapsApi={platformMapsApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607090012' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformMapsApi.getDriverLocation).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findByProps({
        testID: 'driver-latest-location-coordinate-HY202607090012',
      }).props.children,
    ).toBe('22.610000, 113.910000');
    expect(
      renderer.root.findByProps({
        testID: 'driver-latest-location-meta-HY202607090012',
      }).props.children,
    ).toBe('来源：设备定位 · 上报时间：2026-07-09 10:30');
    expect(
      renderer.root.findByProps({
        testID: 'driver-latest-location-estimate-HY202607090012',
      }).props.children,
    ).toBe('距装货点（宝安区福永物流园 1 号门） 860 米 · 预计 约 2 分钟');
  });

  it('ignores another order latest location snapshot when opening driver order detail', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607090013',
      status: 'loading' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-09T02:00:00.000Z',
      updatedAtIso: '2026-07-09T02:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T03:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    const platformMapsApi = createMockDriverMapsApi();
    platformMapsApi.getDriverLocation
      .mockRejectedValueOnce(
        new PlatformApiError(
          'driver location not found',
          'DRIVER_LOCATION_NOT_FOUND',
          404,
        ),
      )
      .mockResolvedValueOnce({
        driverId: 'driver-1',
        orderId: 'order-2',
        latitude: 22.61,
        longitude: 113.91,
        source: 'sandbox' as const,
        recordedAtIso: '2026-07-09T02:30:00.000Z',
        updatedAtIso: '2026-07-09T02:30:00.000Z',
      });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          platformMapsApi={platformMapsApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607090013' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(
      renderer.root.findAllByProps({
        testID: 'driver-latest-location-coordinate-HY202607090013',
      }),
    ).toHaveLength(0);
  });

  it('blocks quoting when saved acceptance settings are offline', async () => {
    const hallOrder = {
      id: 'order-1',
      orderNo: 'HY202607090001',
      status: 'waiting' as const,
      pickupDistanceMeters: 12800,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-09T02:00:00.000Z',
      updatedAtIso: '2026-07-09T02:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T03:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listOrderHall.mockResolvedValue({
      items: [hallOrder],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getAcceptanceSettings.mockResolvedValue({
      ...createDriverAcceptanceSettingsSnapshot(),
      isOnline: false,
      vehicleTypePreferences: [],
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-quote-cents-HY202607090001' })
        .props.onChangeText('880');
      renderer.root
        .findByProps({ testID: 'driver-arrival-HY202607090001' })
        .props.onChangeText('45 分钟到达');
      renderer.root
        .findByProps({ testID: 'driver-quote-submit-HY202607090001' })
        .props.onPress();
    });

    expect(platformDriverOrderApi.quoteOrder).not.toHaveBeenCalled();
    expect(getRenderedText(renderer)).toContain('约 12.8 公里');
    expect(getRenderedText(renderer)).toContain(
      '当前处于离线接单，请先打开接单开关。',
    );
  });

  it('shows latest exception summaries in the hall and executing order cards', async () => {
    const hallOrder = {
      id: 'order-hall-1',
      orderNo: 'HY202607180001',
      status: 'waiting' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: '建材',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-18T08:00:00.000Z',
      updatedAtIso: '2026-07-18T08:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-18T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      latestExceptionCase: {
        id: 'case-hall-1',
        caseNo: 'YC202607180003',
        sourceEventId: 'event-hall-1',
        sourceRole: 'driver' as const,
        status: 'resolved' as const,
        resolutionText: '客服判定货主线下赔付司机。',
        compensationStatus: 'offline_completed' as const,
        compensationTargetRole: 'driver' as const,
        compensationAmountCents: 8800,
        compensationUpdatedAtIso: '2026-07-18T09:15:00.000Z',
        createdAtIso: '2026-07-18T09:00:00.000Z',
        updatedAtIso: '2026-07-18T09:10:00.000Z',
      },
      events: [],
    };
    const myOrder = {
      id: 'order-my-1',
      orderNo: 'HY202607180002',
      status: 'loading' as const,
      pickupAddress: '南山区西丽仓',
      deliveryAddress: '龙华区民治门店',
      cargoType: '百货',
      weightText: '1.2 吨',
      quantityText: '8 箱',
      pickupContact: '孙主管',
      pickupPhone: '13900139003',
      deliveryContact: '周店长',
      deliveryPhone: '13900139004',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-18T08:30:00.000Z',
      updatedAtIso: '2026-07-18T08:30:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-18T10:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 58000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-2',
      latestExceptionCase: {
        id: 'case-my-1',
        caseNo: 'YC202607180004',
        sourceEventId: 'event-my-1',
        sourceRole: 'shipper' as const,
        status: 'processing' as const,
        resolutionText: '客服已要求双方补充装卸现场凭证。',
        compensationStatus: 'pending' as const,
        compensationTargetRole: 'shipper' as const,
        compensationAmountCents: 12000,
        compensationUpdatedAtIso: '2026-07-18T10:05:00.000Z',
        createdAtIso: '2026-07-18T09:40:00.000Z',
        updatedAtIso: '2026-07-18T09:55:00.000Z',
      },
      events: [],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listOrderHall.mockResolvedValue({
      items: [hallOrder],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [myOrder],
      page: 1,
      pageSize: 20,
      total: 1,
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    const renderedText = getRenderedText(renderer);
    expect(renderedText).toContain('最新异常：YC202607180003 · 已解决');
    expect(renderedText).toContain(
      '赔付决议：线下已赔付 · 对象：司机 · 金额：￥88.00',
    );
    expect(renderedText).toContain('最新异常：YC202607180004 · 处理中');
    expect(renderedText).toContain(
      '赔付决议：待赔付跟进 · 对象：货主 · 金额：￥120.00',
    );
    expect(renderedText).not.toContain(
      '更新时间：2026-07-18T09:15:00.000Z',
    );
    expect(renderedText).not.toContain(
      '更新时间：2026-07-18T10:05:00.000Z',
    );
  });

  it('passes mutation context when accepting an order from the hall', async () => {
    const hallOrder = {
      id: 'order-1',
      orderNo: 'HY202607090001',
      status: 'waiting' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-09T02:00:00.000Z',
      updatedAtIso: '2026-07-09T02:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T03:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const acceptedOrder = {
      ...hallOrder,
      status: 'loading' as const,
      events: [
        {
          id: 'event-driver-accepted',
          eventType: 'driver_accepted',
          noteText: '马上联系货主',
          createdAtIso: '2026-07-09T02:05:00.000Z',
        },
      ],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listOrderHall.mockResolvedValue({
      items: [hallOrder],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.acceptOrder.mockResolvedValue(acceptedOrder);

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-quote-note-HY202607090001' })
        .props.onChangeText('马上联系货主');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-accept-HY202607090001' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.acceptOrder).toHaveBeenCalledWith(
      'order-1',
      {
        noteText: '马上联系货主',
        baseUpdatedAtIso: '2026-07-09T02:00:00.000Z',
      },
      expect.stringMatching(uuidV4Pattern),
    );
    expect(getRenderedText(renderer)).toContain('接单成功，订单已进入待装货。');
  });

  it('persists a failed driver accept and retries with the original mutation context', async () => {
    const hallOrder = {
      id: 'order-1',
      orderNo: 'HY202607090001',
      status: 'waiting' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-09T02:00:00.000Z',
      updatedAtIso: '2026-07-09T02:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T03:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const acceptedOrder = {
      ...hallOrder,
      status: 'loading' as const,
      updatedAtIso: '2026-07-09T02:05:00.000Z',
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listOrderHall.mockResolvedValue({
      items: [hallOrder],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.acceptOrder
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce(acceptedOrder);

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-quote-note-HY202607090001' })
        .props.onChangeText('马上联系货主');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-accept-HY202607090001' })
        .props.onPress();
      await flushMicrotasks();
    });

    const firstCall = platformDriverOrderApi.acceptOrder.mock.calls[0];
    expect(getRenderedText(renderer)).toContain('司机订单同步队列');
    expect(await AsyncStorage.getItem(driverOrderMutationQueueStorageKey)).toContain(
      firstCall[2],
    );

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-accept-HY202607090001' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.acceptOrder).toHaveBeenNthCalledWith(
      2,
      firstCall[0],
      firstCall[1],
      firstCall[2],
    );
    expect(await AsyncStorage.getItem(driverOrderMutationQueueStorageKey)).toBeNull();
    expect(getRenderedText(renderer)).toContain('接单成功，订单已进入待装货。');
  });

  it('refreshes the driver hall without queueing when accept hits a conflict', async () => {
    const hallOrder = {
      id: 'order-1',
      orderNo: 'HY202607090001',
      status: 'waiting' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-09T02:00:00.000Z',
      updatedAtIso: '2026-07-09T02:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T03:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listOrderHall
      .mockResolvedValueOnce({ items: [hallOrder], page: 1, pageSize: 20, total: 1 })
      .mockResolvedValueOnce({ items: [], page: 1, pageSize: 20, total: 0 });
    platformDriverOrderApi.acceptOrder.mockRejectedValue(
      new PlatformApiError('订单已被其他操作更新', 'ORDER_CONFLICT', 409),
    );

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-accept-HY202607090001' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.listOrderHall).toHaveBeenCalledTimes(2);
    expect(await AsyncStorage.getItem(driverOrderMutationQueueStorageKey)).toBeNull();
    expect(getRenderedText(renderer)).toContain(
      '订单已被其他操作更新，请确认最新状态。',
    );
  });

  it('loads driver income overview and submits a withdrawal request', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.createWithdrawal.mockResolvedValue({
      id: 'withdrawal-2',
      driverId: 'driver-1',
      amountCents: 12000,
      bankAccountName: '李师傅',
      bankName: '招商银行',
      bankAccountMasked: '**** **** **** 1234',
      status: 'reviewing' as const,
      createdAtIso: '2026-07-09T02:30:00.000Z',
      updatedAtIso: '2026-07-09T02:30:00.000Z',
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    expect(getRenderedText(renderer)).toContain('今日收入：￥361.00');
    expect(getRenderedText(renderer)).toContain('可提现：￥241.00');
    expect(getRenderedText(renderer)).toContain('已提现：￥80.00');

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-amount' })
        .props.onChangeText('120');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-name' })
        .props.onChangeText('招商银行');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.onChangeText('李师傅');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.onChangeText('6225 0000 0002 1234');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-withdrawal-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.createWithdrawal).toHaveBeenCalledWith(
      {
        amountCents: 12000,
        bankAccountName: '李师傅',
        bankName: '招商银行',
        bankAccountNo: '6225000000021234',
      },
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    );
    expect(getRenderedText(renderer)).toContain('提现申请已提交审核。');
  });

  it('sanitizes a pasted withdrawal bank card number before submit', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.createWithdrawal.mockResolvedValue({
      id: 'withdrawal-sanitized',
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-amount' })
        .props.onChangeText('120');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-name' })
        .props.onChangeText('招商银行');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.onChangeText('李师傅');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.onChangeText(' 6225-0000 abc0002 1234 ');
    });

    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.value,
    ).toBe('6225 0000 0002 1234');

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-withdrawal-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.createWithdrawal).toHaveBeenCalledWith(
      {
        amountCents: 12000,
        bankAccountName: '李师傅',
        bankName: '招商银行',
        bankAccountNo: '6225000000021234',
      },
      expect.stringMatching(uuidV4Pattern),
    );
  });

  it('shows withdrawal rejection reasons and payout details in the withdrawal list', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listWithdrawals.mockResolvedValue({
      items: [
        {
          id: 'withdrawal-paid',
          driverId: 'driver-1',
          amountCents: 8000,
          bankAccountName: '李师傅',
          bankName: '招商银行',
          bankAccountMasked: '**** **** **** 1234',
          status: 'paid' as const,
          payoutChannel: 'sandbox',
          providerPayoutNo: 'sandbox-payout-1',
          payoutExecutedAtIso: '2026-07-10T10:30:00.000Z',
          createdAtIso: '2026-07-10T09:00:00.000Z',
          updatedAtIso: '2026-07-10T10:30:00.000Z',
        },
        {
          id: 'withdrawal-rejected',
          driverId: 'driver-1',
          amountCents: 12000,
          bankAccountName: '李师傅',
          bankName: '平安银行',
          bankAccountMasked: '**** **** **** 5678',
          status: 'rejected' as const,
          rejectionReason: '银行卡户名校验失败',
          createdAtIso: '2026-07-11T09:15:00.000Z',
          updatedAtIso: '2026-07-11T09:30:00.000Z',
        },
      ],
      page: 1,
      pageSize: 5,
      total: 2,
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    expect(
      renderer.root.findByProps({
        testID: 'driver-withdrawal-record-created-at-withdrawal-paid',
      }).props.children,
    ).toBe('申请时间：2026-07-10 17:00');
    expect(
      renderer.root.findByProps({
        testID: 'driver-withdrawal-record-detail-withdrawal-paid',
      }).props.children,
    ).toBe(
      '打款渠道：沙箱打款 · 打款时间：2026-07-10 18:30 · 流水号：sandbox-payout-1',
    );
    expect(
      renderer.root.findByProps({
        testID: 'driver-withdrawal-record-created-at-withdrawal-rejected',
      }).props.children,
    ).toBe('申请时间：2026-07-11 17:15');
    expect(
      renderer.root.findByProps({
        testID: 'driver-withdrawal-record-detail-withdrawal-rejected',
      }).props.children,
    ).toBe('驳回原因：银行卡户名校验失败');
  });

  it('sorts withdrawal records by latest updatedAtIso before rendering', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listWithdrawals.mockResolvedValue({
      items: [
        {
          id: 'withdrawal-created-later',
          driverId: 'driver-1',
          amountCents: 12000,
          bankAccountName: '李师傅',
          bankName: '招商银行',
          bankAccountMasked: '**** **** **** 1234',
          status: 'reviewing' as const,
          createdAtIso: '2026-07-11T09:15:00.000Z',
          updatedAtIso: '2026-07-11T09:20:00.000Z',
        },
        {
          id: 'withdrawal-updated-later',
          driverId: 'driver-1',
          amountCents: 8000,
          bankAccountName: '李师傅',
          bankName: '平安银行',
          bankAccountMasked: '**** **** **** 5678',
          status: 'paid' as const,
          payoutChannel: 'sandbox',
          providerPayoutNo: 'sandbox-payout-1',
          payoutExecutedAtIso: '2026-07-11T09:30:00.000Z',
          createdAtIso: '2026-07-10T09:00:00.000Z',
          updatedAtIso: '2026-07-11T09:30:00.000Z',
        },
      ],
      page: 1,
      pageSize: 5,
      total: 2,
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    expect(getWithdrawalRecordCardTestIds(renderer)).toEqual([
      'driver-withdrawal-record-card-withdrawal-updated-later',
      'driver-withdrawal-record-card-withdrawal-created-later',
    ]);
  });

  it('sorts income records by completedAtIso before rendering the latest three rows', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.getIncomeOverview.mockResolvedValue({
      ...createDriverIncomeOverviewSnapshot(),
      summary: {
        ...createDriverIncomeOverviewSnapshot().summary,
        completedOrderCount: 4,
      },
      records: [
        {
          orderId: 'income-earliest',
          orderNo: 'HY202607110001',
          completedAtIso: '2026-07-11T09:30:00.000Z',
          routeText: '最早完成路线',
          vehicleType: 'medium',
          grossAmountCents: 48000,
          platformFeeCents: 2400,
          netIncomeCents: 45600,
        },
        {
          orderId: 'income-middle',
          orderNo: 'HY202607120002',
          completedAtIso: '2026-07-12T10:30:00.000Z',
          routeText: '中间完成路线',
          vehicleType: 'medium',
          grossAmountCents: 52000,
          platformFeeCents: 2600,
          netIncomeCents: 49400,
        },
        {
          orderId: 'income-latest',
          orderNo: 'HY202607120003',
          completedAtIso: '2026-07-12T11:30:00.000Z',
          routeText: '最新完成路线',
          vehicleType: 'medium',
          grossAmountCents: 56000,
          platformFeeCents: 2800,
          netIncomeCents: 53200,
        },
        {
          orderId: 'income-third',
          orderNo: 'HY202607120004',
          completedAtIso: '2026-07-12T11:00:00.000Z',
          routeText: '第三新路线',
          vehicleType: 'medium',
          grossAmountCents: 30000,
          platformFeeCents: 1500,
          netIncomeCents: 28500,
        },
      ],
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    expect(getIncomeRecordCardTestIds(renderer)).toEqual([
      'driver-income-record-card-HY202607120003',
      'driver-income-record-card-HY202607120004',
      'driver-income-record-card-HY202607120002',
    ]);
    expect(getRenderedText(renderer)).not.toContain('最早完成路线');
  });

  it('restores the default withdrawal card after a successful withdrawal submit', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards.mockResolvedValue(
      createDriverBankCardsPage(),
    );
    platformDriverOrderApi.createWithdrawal.mockResolvedValue({
      id: 'withdrawal-2',
      driverId: 'driver-1',
      amountCents: 12000,
      bankAccountName: '李师傅',
      bankName: '招商银行',
      bankAccountMasked: '**** **** **** 1234',
      status: 'reviewing' as const,
      createdAtIso: '2026-07-09T02:30:00.000Z',
      updatedAtIso: '2026-07-09T02:30:00.000Z',
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-amount' })
        .props.onChangeText('120');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.onChangeText('6225 0000 0002 1234');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-withdrawal-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.createWithdrawal).toHaveBeenCalledWith(
      {
        amountCents: 12000,
        bankAccountName: '李师傅',
        bankName: '招商银行',
        bankAccountNo: '6225000000021234',
        bankCardId: 'bank-card-1',
      },
      expect.stringMatching(uuidV4Pattern),
    );
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-amount' }).props
        .value,
    ).toBe('');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-name' }).props
        .value,
    ).toBe('招商银行');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.value,
    ).toBe('李师傅');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.value,
    ).toBe('');
    expect(getRenderedText(renderer)).toContain(
      '当前提现银行卡：招商银行 · **** **** **** 1234',
    );
  });

  it('links the selected bank card to the withdrawal request', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards.mockResolvedValue(
      createDriverBankCardsPage(),
    );
    platformDriverOrderApi.createWithdrawal.mockResolvedValue({
      id: 'withdrawal-card-linked',
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-select-bank-card-1' })
        .props.onPress();
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-amount' })
        .props.onChangeText('120');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.onChangeText('6225 0000 0002 1234');
    });

    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-name' }).props
        .value,
    ).toBe('招商银行');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.value,
    ).toBe('李师傅');
    expect(getRenderedText(renderer)).toContain(
      '当前提现银行卡：招商银行 · **** **** **** 1234',
    );

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-withdrawal-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.createWithdrawal).toHaveBeenCalledWith(
      {
        amountCents: 12000,
        bankAccountName: '李师傅',
        bankName: '招商银行',
        bankAccountNo: '6225000000021234',
        bankCardId: 'bank-card-1',
      },
      expect.stringMatching(uuidV4Pattern),
    );
  });

  it('shows the selected withdrawal card and last-used context in the bank card list', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards.mockResolvedValue({
      items: [
        {
          id: 'bank-card-1',
          bankAccountName: '李师傅',
          bankName: '招商银行',
          bankAccountMasked: '**** **** **** 1234',
          isDefault: true,
          lastUsedAtIso: '2026-07-24T12:00:00.000Z',
          createdAtIso: '2026-07-09T02:20:00.000Z',
          updatedAtIso: '2026-07-24T12:00:00.000Z',
        },
        {
          id: 'bank-card-2',
          bankAccountName: '王师傅',
          bankName: '平安银行',
          bankAccountMasked: '**** **** **** 5678',
          isDefault: false,
          createdAtIso: '2026-07-09T02:30:00.000Z',
          updatedAtIso: '2026-07-09T02:30:00.000Z',
        },
      ],
      total: 2,
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    expect(
      renderer.root.findByProps({
        testID: 'driver-bank-card-selected-bank-card-1',
      }),
    ).toBeDefined();
    expect(
      renderer.root.findByProps({
        testID: 'driver-bank-card-last-used-bank-card-1',
      }).props.children,
    ).toBe('最近用于提现：2026-07-24 20:00');
    expect(
      renderer.root.findByProps({ testID: 'driver-bank-card-select-bank-card-1' })
        .props.disabled,
    ).toBe(true);
  });

  it('refreshes bank cards after a successful withdrawal submit', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards
      .mockResolvedValueOnce(createDriverBankCardsPage())
      .mockResolvedValueOnce(
        createDriverBankCardsPage({
          lastUsedAtIso: '2026-07-25T12:00:00.000Z',
          updatedAtIso: '2026-07-25T12:00:00.000Z',
        }),
      );
    platformDriverOrderApi.createWithdrawal.mockResolvedValue({
      id: 'withdrawal-refresh-bank-cards',
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-amount' })
        .props.onChangeText('120');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.onChangeText('6225 0000 0002 1234');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-withdrawal-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.listBankCards).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findByProps({
        testID: 'driver-bank-card-last-used-bank-card-1',
      }).props.children,
    ).toBe('最近用于提现：2026-07-25 20:00');
  });

  it('keeps a manually selected withdrawal card after a successful withdrawal submit', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards.mockResolvedValue({
      items: [
        {
          id: 'bank-card-1',
          bankAccountName: '李师傅',
          bankName: '招商银行',
          bankAccountMasked: '**** **** **** 1234',
          isDefault: true,
          createdAtIso: '2026-07-09T02:20:00.000Z',
          updatedAtIso: '2026-07-09T02:20:00.000Z',
        },
        {
          id: 'bank-card-2',
          bankAccountName: '王师傅',
          bankName: '平安银行',
          bankAccountMasked: '**** **** **** 5678',
          isDefault: false,
          createdAtIso: '2026-07-09T02:30:00.000Z',
          updatedAtIso: '2026-07-09T02:30:00.000Z',
        },
      ],
      total: 2,
    });
    platformDriverOrderApi.createWithdrawal.mockResolvedValue({
      id: 'withdrawal-manual-card',
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-select-bank-card-2' })
        .props.onPress();
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-amount' })
        .props.onChangeText('120');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.onChangeText('6225 9999 0000 5678');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-withdrawal-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.createWithdrawal).toHaveBeenCalledWith(
      {
        amountCents: 12000,
        bankAccountName: '王师傅',
        bankName: '平安银行',
        bankAccountNo: '6225999900005678',
        bankCardId: 'bank-card-2',
      },
      expect.stringMatching(uuidV4Pattern),
    );
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-amount' }).props
        .value,
    ).toBe('');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-name' }).props
        .value,
    ).toBe('平安银行');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.value,
    ).toBe('王师傅');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.value,
    ).toBe('');
    expect(getRenderedText(renderer)).toContain(
      '当前提现银行卡：平安银行 · **** **** **** 5678',
    );
  });

  it('rejects a withdrawal when the bank card number fails checksum validation', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-amount' })
        .props.onChangeText('120');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-name' })
        .props.onChangeText('招商银行');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.onChangeText('李师傅');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.onChangeText('6225 0000 0002 1235');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-withdrawal-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.createWithdrawal).not.toHaveBeenCalled();
    expect(getRenderedText(renderer)).toContain('请输入有效的银行卡号。');
  });

  it('clears bank-card-derived withdrawal fields when manually unselecting a bank card', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards.mockResolvedValue(
      createDriverBankCardsPage(),
    );

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-select-bank-card-1' })
        .props.onPress();
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-amount' })
        .props.onChangeText('120');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.onChangeText('6225 0000 0002 1234');
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-clear-bank-card' })
        .props.onPress();
    });

    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-amount' }).props
        .value,
    ).toBe('120');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-name' }).props
        .value,
    ).toBe('');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.value,
    ).toBe('');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.value,
    ).toBe('');
    expect(
      renderer.root.findAllByProps({
        testID: 'driver-withdrawal-selected-bank-card',
      }),
    ).toHaveLength(0);
  });

  it('keeps an explicitly cleared withdrawal card empty after refreshing the same default card', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards.mockResolvedValue(
      createDriverBankCardsPage(),
    );

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-amount' })
        .props.onChangeText('120');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.onChangeText('6225 0000 0002 1234');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-clear-bank-card' })
        .props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-refresh-home' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.listBankCards).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-amount' }).props
        .value,
    ).toBe('120');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-name' }).props
        .value,
    ).toBe('');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.value,
    ).toBe('');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.value,
    ).toBe('');
    expect(
      renderer.root.findAllByProps({
        testID: 'driver-withdrawal-selected-bank-card',
      }),
    ).toHaveLength(0);
  });

  it('clears the selected bank card when withdrawal payee info changes', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards.mockResolvedValue(
      createDriverBankCardsPage(),
    );
    platformDriverOrderApi.createWithdrawal.mockResolvedValue({
      id: 'withdrawal-card-cleared',
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-select-bank-card-1' })
        .props.onPress();
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-name' })
        .props.onChangeText('平安银行');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-amount' })
        .props.onChangeText('120');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.onChangeText('6225 0000 0002 1234');
    });

    expect(
      renderer.root.findAllByProps({
        testID: 'driver-withdrawal-selected-bank-card',
      }),
    ).toHaveLength(0);

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-withdrawal-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.createWithdrawal).toHaveBeenCalledWith(
      {
        amountCents: 12000,
        bankAccountName: '李师傅',
        bankName: '平安银行',
        bankAccountNo: '6225000000021234',
      },
      expect.stringMatching(uuidV4Pattern),
    );
  });

  it('auto-selects the default bank card for a pristine withdrawal form', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards.mockResolvedValue(
      createDriverBankCardsPage(),
    );

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-name' }).props
        .value,
    ).toBe('招商银行');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.value,
    ).toBe('李师傅');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.value,
    ).toBe('');
    expect(getRenderedText(renderer)).toContain(
      '当前提现银行卡：招商银行 · **** **** **** 1234',
    );
  });

  it('follows the latest default bank card when the withdrawal form is using auto-default selection', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards
      .mockResolvedValueOnce(createDriverBankCardsPage())
      .mockResolvedValueOnce({
        items: [
          {
            id: 'bank-card-2',
            bankAccountName: '王师傅',
            bankName: '平安银行',
            bankAccountMasked: '**** **** **** 5678',
            isDefault: true,
            createdAtIso: '2026-07-09T03:00:00.000Z',
            updatedAtIso: '2026-07-09T03:00:00.000Z',
          },
          {
            id: 'bank-card-1',
            bankAccountName: '李师傅',
            bankName: '招商银行',
            bankAccountMasked: '**** **** **** 1234',
            isDefault: false,
            createdAtIso: '2026-07-09T02:20:00.000Z',
            updatedAtIso: '2026-07-09T03:00:00.000Z',
          },
        ],
        total: 2,
      });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-amount' })
        .props.onChangeText('120');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.onChangeText('6225 0000 0002 1234');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-refresh-home' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-amount' }).props
        .value,
    ).toBe('120');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-name' }).props
        .value,
    ).toBe('平安银行');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.value,
    ).toBe('王师傅');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.value,
    ).toBe('');
    expect(getRenderedText(renderer)).toContain(
      '当前提现银行卡：平安银行 · **** **** **** 5678',
    );
  });

  it('follows a replacement default bank card when the previous auto-selected default card disappears', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards
      .mockResolvedValueOnce(createDriverBankCardsPage())
      .mockResolvedValueOnce({
        items: [
          {
            id: 'bank-card-2',
            bankAccountName: '王师傅',
            bankName: '平安银行',
            bankAccountMasked: '**** **** **** 5678',
            isDefault: true,
            createdAtIso: '2026-07-09T03:00:00.000Z',
            updatedAtIso: '2026-07-09T03:00:00.000Z',
          },
        ],
        total: 1,
      });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-amount' })
        .props.onChangeText('120');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.onChangeText('6225 0000 0002 1234');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-refresh-home' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.listBankCards).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-amount' }).props
        .value,
    ).toBe('120');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-name' }).props
        .value,
    ).toBe('平安银行');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.value,
    ).toBe('王师傅');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.value,
    ).toBe('');
    expect(getRenderedText(renderer)).toContain(
      '当前提现银行卡：平安银行 · **** **** **** 5678',
    );
  });

  it('clears an auto-selected withdrawal card when the platform no longer has any default card', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards
      .mockResolvedValueOnce(createDriverBankCardsPage())
      .mockResolvedValueOnce({
        items: [
          {
            id: 'bank-card-1',
            bankAccountName: '李师傅',
            bankName: '招商银行',
            bankAccountMasked: '**** **** **** 1234',
            isDefault: false,
            createdAtIso: '2026-07-09T02:20:00.000Z',
            updatedAtIso: '2026-07-09T03:00:00.000Z',
          },
        ],
        total: 1,
      });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-amount' })
        .props.onChangeText('120');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.onChangeText('6225 0000 0002 1234');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-refresh-home' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.listBankCards).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-amount' }).props
        .value,
    ).toBe('120');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-name' }).props
        .value,
    ).toBe('');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.value,
    ).toBe('');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.value,
    ).toBe('');
    expect(
      renderer.root.findAllByProps({
        testID: 'driver-withdrawal-selected-bank-card',
      }),
    ).toHaveLength(0);
  });

  it('resumes following a new default withdrawal card after the auto-default selection temporarily loses any default card', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards
      .mockResolvedValueOnce(createDriverBankCardsPage())
      .mockResolvedValueOnce({
        items: [
          {
            id: 'bank-card-1',
            bankAccountName: '李师傅',
            bankName: '招商银行',
            bankAccountMasked: '**** **** **** 1234',
            isDefault: false,
            createdAtIso: '2026-07-09T02:20:00.000Z',
            updatedAtIso: '2026-07-09T03:00:00.000Z',
          },
        ],
        total: 1,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'bank-card-2',
            bankAccountName: '王师傅',
            bankName: '平安银行',
            bankAccountMasked: '**** **** **** 5678',
            isDefault: true,
            createdAtIso: '2026-07-09T03:20:00.000Z',
            updatedAtIso: '2026-07-09T03:20:00.000Z',
          },
          {
            id: 'bank-card-1',
            bankAccountName: '李师傅',
            bankName: '招商银行',
            bankAccountMasked: '**** **** **** 1234',
            isDefault: false,
            createdAtIso: '2026-07-09T02:20:00.000Z',
            updatedAtIso: '2026-07-09T03:20:00.000Z',
          },
        ],
        total: 2,
      });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-amount' })
        .props.onChangeText('120');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.onChangeText('6225 0000 0002 1234');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-refresh-home' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-name' }).props
        .value,
    ).toBe('');
    expect(
      renderer.root.findAllByProps({
        testID: 'driver-withdrawal-selected-bank-card',
      }),
    ).toHaveLength(0);

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-refresh-home' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.listBankCards).toHaveBeenCalledTimes(3);
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-amount' }).props
        .value,
    ).toBe('120');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-name' }).props
        .value,
    ).toBe('平安银行');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.value,
    ).toBe('王师傅');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.value,
    ).toBe('');
    expect(getRenderedText(renderer)).toContain(
      '当前提现银行卡：平安银行 · **** **** **** 5678',
    );
  });

  it('keeps a manually selected withdrawal card when the platform default card changes', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards
      .mockResolvedValueOnce({
        items: [
          {
            id: 'bank-card-1',
            bankAccountName: '李师傅',
            bankName: '招商银行',
            bankAccountMasked: '**** **** **** 1234',
            isDefault: true,
            createdAtIso: '2026-07-09T02:20:00.000Z',
            updatedAtIso: '2026-07-09T02:20:00.000Z',
          },
          {
            id: 'bank-card-2',
            bankAccountName: '王师傅',
            bankName: '平安银行',
            bankAccountMasked: '**** **** **** 5678',
            isDefault: false,
            createdAtIso: '2026-07-09T02:30:00.000Z',
            updatedAtIso: '2026-07-09T02:30:00.000Z',
          },
        ],
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'bank-card-3',
            bankAccountName: '赵师傅',
            bankName: '建设银行',
            bankAccountMasked: '**** **** **** 8888',
            isDefault: true,
            createdAtIso: '2026-07-09T03:00:00.000Z',
            updatedAtIso: '2026-07-09T03:00:00.000Z',
          },
          {
            id: 'bank-card-2',
            bankAccountName: '王师傅',
            bankName: '平安银行',
            bankAccountMasked: '**** **** **** 5678',
            isDefault: false,
            createdAtIso: '2026-07-09T02:30:00.000Z',
            updatedAtIso: '2026-07-09T03:00:00.000Z',
          },
          {
            id: 'bank-card-1',
            bankAccountName: '李师傅',
            bankName: '招商银行',
            bankAccountMasked: '**** **** **** 1234',
            isDefault: false,
            createdAtIso: '2026-07-09T02:20:00.000Z',
            updatedAtIso: '2026-07-09T03:00:00.000Z',
          },
        ],
        total: 3,
      });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-select-bank-card-2' })
        .props.onPress();
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-amount' })
        .props.onChangeText('120');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.onChangeText('6225 9999 0000 5678');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-refresh-home' }).props.onPress();
      await flushMicrotasks();
    });

    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-name' }).props
        .value,
    ).toBe('平安银行');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.value,
    ).toBe('王师傅');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-amount' }).props
        .value,
    ).toBe('120');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.value,
    ).toBe('6225 9999 0000 5678');
    expect(getRenderedText(renderer)).toContain(
      '当前提现银行卡：平安银行 · **** **** **** 5678',
    );
  });

  it('keeps the local withdrawal draft when refreshing bank cards with a default card', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce(createDriverBankCardsPage());

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-name' })
        .props.onChangeText('平安银行');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.onChangeText('本地收款人');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-refresh-home' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.listBankCards).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-name' }).props
        .value,
    ).toBe('平安银行');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.value,
    ).toBe('本地收款人');
    expect(
      renderer.root.findAllByProps({
        testID: 'driver-withdrawal-selected-bank-card',
      }),
    ).toHaveLength(0);
  });

  it('syncs the selected withdrawal card details after refreshing bank cards', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards
      .mockResolvedValueOnce(
        createDriverBankCardsPage({
          isDefault: false,
        }),
      )
      .mockResolvedValueOnce(
        createDriverBankCardsPage({
          bankAccountName: '李队长',
          bankName: '平安银行',
          isDefault: false,
          updatedAtIso: '2026-07-09T03:00:00.000Z',
        }),
      );

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-select-bank-card-1' })
        .props.onPress();
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-amount' })
        .props.onChangeText('120');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.onChangeText('6225 0000 0002 1234');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-refresh-home' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.listBankCards).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-name' }).props
        .value,
    ).toBe('平安银行');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.value,
    ).toBe('李队长');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-amount' }).props
        .value,
    ).toBe('120');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.value,
    ).toBe('6225 0000 0002 1234');
    expect(getRenderedText(renderer)).toContain(
      '当前提现银行卡：平安银行 · **** **** **** 1234',
    );
  });

  it('edits a bank card without forcing the driver to re-enter the card number', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards
      .mockResolvedValueOnce(
        createDriverBankCardsPage({
          isDefault: false,
        }),
      )
      .mockResolvedValueOnce(
        createDriverBankCardsPage({
          bankAccountName: '李队长',
          bankName: '平安银行',
          isDefault: false,
          updatedAtIso: '2026-07-09T03:10:00.000Z',
        }),
      );
    platformDriverOrderApi.updateBankCard.mockResolvedValue({
      id: 'bank-card-1',
      bankAccountName: '李队长',
      bankName: '平安银行',
      bankAccountMasked: '**** **** **** 1234',
      isDefault: false,
      createdAtIso: '2026-07-09T02:20:00.000Z',
      updatedAtIso: '2026-07-09T03:10:00.000Z',
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-edit-bank-card-1' })
        .props.onPress();
    });

    expect(
      renderer.root.findByProps({ testID: 'driver-bank-card-edit-name-bank-card-1' })
        .props.value,
    ).toBe('招商银行');
    expect(
      renderer.root.findByProps({
        testID: 'driver-bank-card-edit-account-name-bank-card-1',
      }).props.value,
    ).toBe('李师傅');
    expect(
      renderer.root.findByProps({
        testID: 'driver-bank-card-edit-account-no-bank-card-1',
      }).props.value,
    ).toBe('');

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-edit-name-bank-card-1' })
        .props.onChangeText('平安银行');
      renderer.root
        .findByProps({
          testID: 'driver-bank-card-edit-account-name-bank-card-1',
        })
        .props.onChangeText('李队长');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-edit-submit-bank-card-1' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.updateBankCard).toHaveBeenCalledWith(
      'bank-card-1',
      {
        bankAccountName: '李队长',
        bankName: '平安银行',
        isDefault: false,
      },
    );
    expect(platformDriverOrderApi.listBankCards).toHaveBeenCalledTimes(2);
    expect(getRenderedText(renderer)).toContain('银行卡已更新。');
    expect(getRenderedText(renderer)).toContain('平安银行 · **** **** **** 1234');
  });

  it('allows marking a newly added bank card as the default card', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards
      .mockResolvedValueOnce(
        createDriverBankCardsPage({
          isDefault: false,
        }),
      )
      .mockResolvedValueOnce(
        createDriverBankCardsPage({
          id: 'bank-card-2',
          bankAccountName: '王师傅',
          bankName: '平安银行',
          bankAccountMasked: '**** **** **** 5678',
          isDefault: true,
          updatedAtIso: '2026-07-09T03:20:00.000Z',
        }),
      );
    platformDriverOrderApi.createBankCard.mockResolvedValue({
      id: 'bank-card-2',
      bankAccountName: '王师傅',
      bankName: '平安银行',
      bankAccountMasked: '**** **** **** 5678',
      isDefault: true,
      createdAtIso: '2026-07-09T03:20:00.000Z',
      updatedAtIso: '2026-07-09T03:20:00.000Z',
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-bank-card-add' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-toggle-default' })
        .props.onPress();
      renderer.root
        .findByProps({ testID: 'driver-bank-card-bank-name' })
        .props.onChangeText('平安银行');
      renderer.root
        .findByProps({ testID: 'driver-bank-card-account-name' })
        .props.onChangeText('王师傅');
      renderer.root
        .findByProps({ testID: 'driver-bank-card-account-no' })
        .props.onChangeText('6225 9999 0000 5678');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-bank-card-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.createBankCard).toHaveBeenCalledWith({
      bankAccountName: '王师傅',
      bankName: '平安银行',
      bankAccountNo: '6225999900005678',
      isDefault: true,
    });
    expect(platformDriverOrderApi.listBankCards).toHaveBeenCalledTimes(2);
    expect(getRenderedText(renderer)).toContain('银行卡已添加。');
    expect(getRenderedText(renderer)).toContain('平安银行 · **** **** **** 5678');
  });

  it('sanitizes bank card number inputs in add and edit forms', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards.mockResolvedValue(
      createDriverBankCardsPage(),
    );

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-bank-card-add' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-account-no' })
        .props.onChangeText(' 6225-9999 xxxx0000 5678 ');
    });

    expect(
      renderer.root.findByProps({ testID: 'driver-bank-card-account-no' }).props
        .value,
    ).toBe('6225 9999 0000 5678');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-cancel' })
        .props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-edit-bank-card-1' })
        .props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-edit-account-no-bank-card-1' })
        .props.onChangeText('6225_0000 0002-1234');
    });

    expect(
      renderer.root.findByProps({
        testID: 'driver-bank-card-edit-account-no-bank-card-1',
      }).props.value,
    ).toBe('6225 0000 0002 1234');
  });

  it('rejects adding a bank card when the card number fails checksum validation', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards.mockResolvedValue(
      createDriverBankCardsPage({
        isDefault: false,
      }),
    );

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-bank-card-add' }).props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-bank-name' })
        .props.onChangeText('平安银行');
      renderer.root
        .findByProps({ testID: 'driver-bank-card-account-name' })
        .props.onChangeText('王师傅');
      renderer.root
        .findByProps({ testID: 'driver-bank-card-account-no' })
        .props.onChangeText('6225 0000 0002 1235');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-bank-card-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.createBankCard).not.toHaveBeenCalled();
    expect(getRenderedText(renderer)).toContain('请输入有效的银行卡号。');
  });

  it('allows marking an edited bank card as the default card', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards
      .mockResolvedValueOnce(
        createDriverBankCardsPage({
          isDefault: false,
        }),
      )
      .mockResolvedValueOnce(
        createDriverBankCardsPage({
          bankAccountName: '李队长',
          bankName: '平安银行',
          isDefault: true,
          updatedAtIso: '2026-07-09T03:25:00.000Z',
        }),
      );
    platformDriverOrderApi.updateBankCard.mockResolvedValue({
      id: 'bank-card-1',
      bankAccountName: '李队长',
      bankName: '平安银行',
      bankAccountMasked: '**** **** **** 1234',
      isDefault: true,
      createdAtIso: '2026-07-09T02:20:00.000Z',
      updatedAtIso: '2026-07-09T03:25:00.000Z',
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-edit-bank-card-1' })
        .props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-edit-toggle-default-bank-card-1' })
        .props.onPress();
      renderer.root
        .findByProps({ testID: 'driver-bank-card-edit-name-bank-card-1' })
        .props.onChangeText('平安银行');
      renderer.root
        .findByProps({
          testID: 'driver-bank-card-edit-account-name-bank-card-1',
        })
        .props.onChangeText('李队长');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-edit-submit-bank-card-1' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.updateBankCard).toHaveBeenCalledWith(
      'bank-card-1',
      {
        bankAccountName: '李队长',
        bankName: '平安银行',
        isDefault: true,
      },
    );
    expect(getRenderedText(renderer)).toContain('默认');
  });

  it('clears stale withdrawal payee info when the selected bank card disappears', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listBankCards
      .mockResolvedValueOnce(
        createDriverBankCardsPage({
          isDefault: false,
        }),
      )
      .mockResolvedValueOnce({ items: [], total: 0 });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-bank-card-select-bank-card-1' })
        .props.onPress();
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-amount' })
        .props.onChangeText('120');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.onChangeText('6225 0000 0002 1234');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-refresh-home' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.listBankCards).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-amount' }).props
        .value,
    ).toBe('120');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-name' }).props
        .value,
    ).toBe('');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.value,
    ).toBe('');
    expect(
      renderer.root.findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.value,
    ).toBe('');
    expect(
      renderer.root.findAllByProps({
        testID: 'driver-withdrawal-selected-bank-card',
      }),
    ).toHaveLength(0);
  });

  it('reuses the same withdrawal idempotency key after a transient failure', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.createWithdrawal
      .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
      .mockResolvedValueOnce({ id: 'withdrawal-replayed' });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-amount' })
        .props.onChangeText('120');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-name' })
        .props.onChangeText('招商银行');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-name' })
        .props.onChangeText('李师傅');
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-bank-account-no' })
        .props.onChangeText('6225 0000 0002 1234');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-submit' })
        .props.onPress();
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-withdrawal-submit' })
        .props.onPress();
      await flushMicrotasks();
    });

    const firstKey = platformDriverOrderApi.createWithdrawal.mock.calls[0][1];
    const secondKey = platformDriverOrderApi.createWithdrawal.mock.calls[1][1];
    expect(firstKey).toEqual(expect.stringMatching(uuidV4Pattern));
    expect(secondKey).toBe(firstKey);
  });

  it('uploads identity certification attachments through the platform file api before submit', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    const platformDriverCertificationApi = createMockDriverCertificationApi();
    platformDriverCertificationApi.submitIdentity.mockResolvedValue({
        ...createDriverCertificationSnapshot(),
        identity: {
          driverId: 'driver-1',
          status: 'reviewing' as const,
          identityFrontFileId: 'file-identity-front',
          identityBackFileId: 'file-identity-back',
        },
      });
    const platformFileApi = {
      createUploadIntent: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'file-identity-front',
          ownerUserId: 'driver-1',
          purpose: 'identity',
          objectKey: 'driver-1/identity/file-identity-front.png',
          status: 'pending',
          uploadUrl:
            'http://localhost:3000/api/files/uploads/file-identity-front',
          expiresAtIso: '2026-07-07T08:15:00.000Z',
          createdAtIso: '2026-07-07T08:00:00.000Z',
        })
        .mockResolvedValueOnce({
          id: 'file-identity-back',
          ownerUserId: 'driver-1',
          purpose: 'identity',
          objectKey: 'driver-1/identity/file-identity-back.png',
          status: 'pending',
          uploadUrl:
            'http://localhost:3000/api/files/uploads/file-identity-back',
          expiresAtIso: '2026-07-07T08:15:00.000Z',
          createdAtIso: '2026-07-07T08:00:00.000Z',
        }),
      confirmLocalUploadTarget: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'file-identity-front',
          ownerUserId: 'driver-1',
          purpose: 'identity',
          objectKey: 'driver-1/identity/file-identity-front.png',
          status: 'uploaded',
          createdAtIso: '2026-07-07T08:00:00.000Z',
        })
        .mockResolvedValueOnce({
          id: 'file-identity-back',
          ownerUserId: 'driver-1',
          purpose: 'identity',
          objectKey: 'driver-1/identity/file-identity-back.png',
          status: 'uploaded',
          createdAtIso: '2026-07-07T08:00:00.000Z',
        }),
      confirmUploaded: jest.fn(),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={platformDriverCertificationApi}
          platformFileApi={platformFileApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-cert-real-name' })
        .props.onChangeText('李师傅');
      renderer.root
        .findByProps({ testID: 'driver-cert-identity-number' })
        .props.onChangeText('11010119900307201x');
    });
    mockSelectedImageUpload('driver-identity-upload.png');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-cert-upload-identity-front' })
        .props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-cert-upload-identity-back' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformFileApi.createUploadIntent).toHaveBeenNthCalledWith(1, {
      purpose: 'identity',
      fileName: '身份证人像面.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
    expect(platformFileApi.createUploadIntent).toHaveBeenNthCalledWith(2, {
      purpose: 'identity',
      fileName: '身份证国徽面.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
    expect(platformFileApi.confirmLocalUploadTarget).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/files/uploads/file-identity-front',
    );
    expect(platformFileApi.confirmLocalUploadTarget).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/files/uploads/file-identity-back',
    );
    expect(
      renderer.root.findByProps({ testID: 'driver-cert-identity-front-file' })
        .props.value,
    ).toBe('file-identity-front');
    expect(
      renderer.root.findByProps({ testID: 'driver-cert-identity-back-file' })
        .props.value,
    ).toBe('file-identity-back');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-cert-submit-identity' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverCertificationApi.submitIdentity).toHaveBeenCalledWith({
      realName: '李师傅',
      identityNumber: '11010119900307201x',
      identityFrontFileId: 'file-identity-front',
      identityBackFileId: 'file-identity-back',
    });
    expect(getRenderedText(renderer)).toContain('司机实名认证已提交审核。');
  });

  it('hydrates certification snapshot attachments through the platform file metadata api on load', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    const platformDriverCertificationApi = createMockDriverCertificationApi();
    platformDriverCertificationApi.getCertification.mockResolvedValue({
      ...createDriverCertificationSnapshot(),
      identity: {
        driverId: 'driver-1',
        realName: '李师傅',
        identityNumber: '11010119900307201X',
        identityFrontFileId: 'file-id-front',
        identityBackFileId: 'file-id-back',
        status: 'reviewing' as const,
      },
      vehicle: {
        driverId: 'driver-1',
        vehiclePhotoFileId: 'file-vehicle-photo',
        status: 'approved' as const,
      },
    });
    const platformFileApi = {
      createUploadIntent: jest.fn(),
      confirmUploaded: jest.fn(),
      getFileMetadata: jest.fn().mockImplementation((fileId: string) =>
        Promise.resolve({
          id: fileId,
          ownerUserId: 'driver-1',
          purpose: 'identity',
          objectKey: `driver-1/identity/${fileId}.png`,
          status: 'uploaded',
          publicUrl: `https://cdn.example.com/${fileId}.png`,
          createdAtIso: '2026-07-07T08:00:00.000Z',
        }),
      ),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={platformDriverCertificationApi}
          platformFileApi={platformFileApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    expect(platformFileApi.getFileMetadata).toHaveBeenCalledWith('file-id-front');
    expect(platformFileApi.getFileMetadata).toHaveBeenCalledWith('file-id-back');
    expect(platformFileApi.getFileMetadata).toHaveBeenCalledWith(
      'file-vehicle-photo',
    );
    expect(
      renderer.root.findByProps({
        testID: 'driver-cert-preview-image-identityFrontFileId',
      }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-id-front.png',
    });
    expect(
      renderer.root.findByProps({
        testID: 'driver-cert-preview-image-vehiclePhotoFileId',
      }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-vehicle-photo.png',
    });

    const renderedText = getRenderedText(renderer);

    expect(renderedText).toContain('身份证人像面：身份证人像面.png');
    expect(renderedText).toContain('车辆照片：车辆照片.png');
    expect(renderedText).toContain('来源：平台文件对象（已上传）');
    expect(renderedText).not.toContain('平台已同步文件 ID');
  });

  it('shows manual file id sources when certification attachments are typed without uploaded file objects', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-cert-identity-front-file' })
        .props.onChangeText('manual-identity-front');
      renderer.root
        .findByProps({ testID: 'driver-cert-vehicle-photo-file' })
        .props.onChangeText('manual-vehicle-photo');
    });

    const renderedText = getRenderedText(renderer);

    expect(renderedText).toContain('身份证人像面：本地已填写文件 ID');
    expect(renderedText).toContain('车辆照片：本地已填写文件 ID');
    expect(renderedText).toContain('来源：手动填写文件 ID');
    expect(renderedText).toContain('文件 ID：manual-identity-front');
    expect(renderedText).toContain('文件 ID：manual-vehicle-photo');
  });

  it('uploads vehicle certification attachments through the platform file api before submit', async () => {
    const platformDriverOrderApi = createMockDriverOrderApi();
    const platformDriverCertificationApi = createMockDriverCertificationApi();
    platformDriverCertificationApi.submitVehicle.mockResolvedValue({
        ...createDriverCertificationSnapshot(),
        vehicle: {
          driverId: 'driver-1',
          status: 'reviewing' as const,
          drivingLicenseFileId: 'file-vehicle-license',
          driverLicenseFileId: 'file-driver-license',
          transportQualificationFileId: 'file-transport-qualification',
          operationPermitFileId: 'file-operation-permit',
          vehiclePhotoFileId: 'file-vehicle-photo',
        },
      });
    const platformFileApi = {
      createUploadIntent: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'file-vehicle-license',
          ownerUserId: 'driver-1',
          purpose: 'identity',
          objectKey: 'driver-1/identity/file-vehicle-license.png',
          status: 'pending',
          uploadUrl:
            'http://localhost:3000/api/files/uploads/file-vehicle-license',
          expiresAtIso: '2026-07-07T08:15:00.000Z',
          createdAtIso: '2026-07-07T08:00:00.000Z',
        })
        .mockResolvedValueOnce({
          id: 'file-driver-license',
          ownerUserId: 'driver-1',
          purpose: 'identity',
          objectKey: 'driver-1/identity/file-driver-license.png',
          status: 'pending',
          uploadUrl:
            'http://localhost:3000/api/files/uploads/file-driver-license',
          expiresAtIso: '2026-07-07T08:15:00.000Z',
          createdAtIso: '2026-07-07T08:00:00.000Z',
        })
        .mockResolvedValueOnce({
          id: 'file-transport-qualification',
          ownerUserId: 'driver-1',
          purpose: 'identity',
          objectKey: 'driver-1/identity/file-transport-qualification.png',
          status: 'pending',
          uploadUrl:
            'http://localhost:3000/api/files/uploads/file-transport-qualification',
          expiresAtIso: '2026-07-07T08:15:00.000Z',
          createdAtIso: '2026-07-07T08:00:00.000Z',
        })
        .mockResolvedValueOnce({
          id: 'file-operation-permit',
          ownerUserId: 'driver-1',
          purpose: 'identity',
          objectKey: 'driver-1/identity/file-operation-permit.png',
          status: 'pending',
          uploadUrl:
            'http://localhost:3000/api/files/uploads/file-operation-permit',
          expiresAtIso: '2026-07-07T08:15:00.000Z',
          createdAtIso: '2026-07-07T08:00:00.000Z',
        })
        .mockResolvedValueOnce({
          id: 'file-vehicle-photo',
          ownerUserId: 'driver-1',
          purpose: 'identity',
          objectKey: 'driver-1/identity/file-vehicle-photo.png',
          status: 'pending',
          uploadUrl:
            'http://localhost:3000/api/files/uploads/file-vehicle-photo',
          expiresAtIso: '2026-07-07T08:15:00.000Z',
          createdAtIso: '2026-07-07T08:00:00.000Z',
        }),
      confirmLocalUploadTarget: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'file-vehicle-license',
          ownerUserId: 'driver-1',
          purpose: 'identity',
          objectKey: 'driver-1/identity/file-vehicle-license.png',
          status: 'uploaded',
          createdAtIso: '2026-07-07T08:00:00.000Z',
        })
        .mockResolvedValueOnce({
          id: 'file-driver-license',
          ownerUserId: 'driver-1',
          purpose: 'identity',
          objectKey: 'driver-1/identity/file-driver-license.png',
          status: 'uploaded',
          createdAtIso: '2026-07-07T08:00:00.000Z',
        })
        .mockResolvedValueOnce({
          id: 'file-transport-qualification',
          ownerUserId: 'driver-1',
          purpose: 'identity',
          objectKey: 'driver-1/identity/file-transport-qualification.png',
          status: 'uploaded',
          createdAtIso: '2026-07-07T08:00:00.000Z',
        })
        .mockResolvedValueOnce({
          id: 'file-operation-permit',
          ownerUserId: 'driver-1',
          purpose: 'identity',
          objectKey: 'driver-1/identity/file-operation-permit.png',
          status: 'uploaded',
          createdAtIso: '2026-07-07T08:00:00.000Z',
        })
        .mockResolvedValueOnce({
          id: 'file-vehicle-photo',
          ownerUserId: 'driver-1',
          purpose: 'identity',
          objectKey: 'driver-1/identity/file-vehicle-photo.png',
          status: 'uploaded',
          createdAtIso: '2026-07-07T08:00:00.000Z',
        }),
      confirmUploaded: jest.fn(),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={platformDriverCertificationApi}
          platformFileApi={platformFileApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-cert-plate-number' })
        .props.onChangeText('粤B12345');
      renderer.root
        .findByProps({ testID: 'driver-cert-vehicle-type' })
        .props.onChangeText('厢式货车');
      renderer.root
        .findByProps({ testID: 'driver-cert-vehicle-length' })
        .props.onChangeText('4.2 米');
      renderer.root
        .findByProps({ testID: 'driver-cert-load-capacity' })
        .props.onChangeText('2 吨');
    });
    mockSelectedImageUpload('driver-vehicle-upload.png');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-cert-upload-driving-license' })
        .props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-cert-upload-driver-license' })
        .props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-cert-upload-transport-qualification' })
        .props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-cert-upload-operation-permit' })
        .props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-cert-upload-vehicle-photo' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformFileApi.createUploadIntent).toHaveBeenNthCalledWith(1, {
      purpose: 'identity',
      fileName: '行驶证.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
    expect(platformFileApi.createUploadIntent).toHaveBeenNthCalledWith(2, {
      purpose: 'identity',
      fileName: '驾驶证.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
    expect(platformFileApi.createUploadIntent).toHaveBeenNthCalledWith(3, {
      purpose: 'identity',
      fileName: '从业资格证.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
    expect(platformFileApi.createUploadIntent).toHaveBeenNthCalledWith(4, {
      purpose: 'identity',
      fileName: '营运证.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
    expect(platformFileApi.createUploadIntent).toHaveBeenNthCalledWith(5, {
      purpose: 'identity',
      fileName: '车辆照片.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
    expect(
      renderer.root.findByProps({ testID: 'driver-cert-driving-license-file' })
        .props.value,
    ).toBe('file-vehicle-license');
    expect(
      renderer.root.findByProps({ testID: 'driver-cert-driver-license-file' })
        .props.value,
    ).toBe('file-driver-license');
    expect(
      renderer.root.findByProps({
        testID: 'driver-cert-transport-qualification-file',
      }).props.value,
    ).toBe('file-transport-qualification');
    expect(
      renderer.root.findByProps({ testID: 'driver-cert-operation-permit-file' })
        .props.value,
    ).toBe('file-operation-permit');
    expect(
      renderer.root.findByProps({ testID: 'driver-cert-vehicle-photo-file' })
        .props.value,
    ).toBe('file-vehicle-photo');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-cert-submit-vehicle' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverCertificationApi.submitVehicle).toHaveBeenCalledWith({
      plateNumber: '粤B12345',
      vehicleType: '厢式货车',
      vehicleLengthText: '4.2 米',
      loadCapacityText: '2 吨',
      hasTailboard: false,
      drivingLicenseFileId: 'file-vehicle-license',
      driverLicenseFileId: 'file-driver-license',
      transportQualificationFileId: 'file-transport-qualification',
      operationPermitFileId: 'file-operation-permit',
      vehiclePhotoFileId: 'file-vehicle-photo',
    });
    expect(getRenderedText(renderer)).toContain('车辆认证已提交审核。');
  });

  it('uploads a loading receipt proof before advancing the selected driver order', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607070001',
      status: 'loading' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-07T08:00:00.000Z',
      updatedAtIso: '2026-07-07T08:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-07T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    platformDriverOrderApi.advanceOrderStatus.mockResolvedValue({
      ...order,
      status: 'transporting',
      events: [
        {
          id: 'event-driver-status-1',
          eventType: 'driver_status_changed',
          attachmentFileIds: ['file-receipt-1'],
          createdAtIso: '2026-07-07T08:05:00.000Z',
        },
      ],
    });
    const platformFileApi = {
      createUploadIntent: jest.fn().mockResolvedValue({
        id: 'file-receipt-1',
        ownerUserId: 'driver-1',
        purpose: 'receipt',
        objectKey: 'driver-1/receipt/file-receipt-1.png',
        status: 'pending',
        uploadUrl: 'http://localhost:3000/api/files/uploads/file-receipt-1',
        expiresAtIso: '2026-07-07T08:15:00.000Z',
        createdAtIso: '2026-07-07T08:00:00.000Z',
      }),
      confirmLocalUploadTarget: jest.fn().mockResolvedValue({
        id: 'file-receipt-1',
        ownerUserId: 'driver-1',
        purpose: 'receipt',
        objectKey: 'driver-1/receipt/file-receipt-1.png',
        publicUrl: 'https://cdn.example.com/file-receipt-1.png',
        status: 'uploaded',
        createdAtIso: '2026-07-07T08:00:00.000Z',
      }),
      confirmUploaded: jest.fn(),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          platformFileApi={platformFileApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607070001' })
        .props.onPress();
      await flushMicrotasks();
    });
    mockSelectedImageUpload('driver-receipt-upload.png');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-upload-receipt-HY202607070001' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(renderer)).toContain('装货凭证清单');
    expect(getRenderedText(renderer)).toContain('装货凭证 1：装货凭证.png');
    expect(getRenderedText(renderer)).toContain('来源：平台文件对象（已上传）');
    expect(getRenderedText(renderer)).toContain('文件 ID：file-receipt-1');
    expect(getRenderedText(renderer)).toContain('已生成预览地址。');
    expect(
      renderer.root.findByProps({
        testID: 'driver-receipt-preview-image-loading-1',
      }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-receipt-1.png',
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-advance-status-HY202607070001' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.advanceOrderStatus).toHaveBeenCalledWith(
      'order-1',
      {
        baseUpdatedAtIso: '2026-07-07T08:00:00.000Z',
        nextStatus: 'transporting',
        receiptPhotoFileIds: ['file-receipt-1'],
      },
      expect.stringMatching(uuidV4Pattern),
    );
  });

  it('cancels a loading driver order from the execution detail view', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607070011',
      status: 'loading' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-07T08:00:00.000Z',
      updatedAtIso: '2026-07-07T08:10:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-07T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const cancelledOrder = {
      ...order,
      status: 'cancelled' as const,
      updatedAtIso: '2026-07-07T08:15:00.000Z',
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    platformDriverOrderApi.cancelOrder.mockResolvedValue(cancelledOrder);

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607070011' })
        .props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-cancel-order-1' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.cancelOrder).toHaveBeenCalledWith(
      'order-1',
      {
        baseUpdatedAtIso: '2026-07-07T08:10:00.000Z',
        reasonText: '执行异常无法继续',
        description: '司机端提交取消，订单停止继续执行。',
      },
      expect.stringMatching(uuidV4Pattern),
    );
    expect(getRenderedText(renderer)).toContain('订单已取消，货主将收到取消通知。');
    expect(
      renderer.root.findAllByProps({ testID: 'driver-cancel-order-1' }),
    ).toHaveLength(0);
  });

  it('hydrates platform receipt history when opening an existing driver order', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607070009',
      status: 'confirming' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-07T08:00:00.000Z',
      updatedAtIso: '2026-07-07T10:05:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-07T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [
        {
          id: 'event-driver-status-1',
          eventType: 'driver_status_changed',
          attachmentFileIds: ['file-loading-receipt-1'],
          createdAtIso: '2026-07-07T08:05:00.000Z',
        },
        {
          id: 'event-driver-status-2',
          eventType: 'driver_status_changed',
          attachmentFileIds: ['file-arrival-receipt-1'],
          createdAtIso: '2026-07-07T10:00:00.000Z',
        },
      ],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    const platformFileApi = {
      createUploadIntent: jest.fn(),
      confirmUploaded: jest.fn(),
      confirmLocalUploadTarget: jest.fn(),
      getFileMetadata: jest.fn().mockImplementation((fileId: string) =>
        Promise.resolve({
          id: fileId,
          ownerUserId: 'driver-1',
          purpose: 'receipt' as const,
          objectKey: `driver-1/receipt/${fileId}.png`,
          publicUrl: `https://cdn.example.com/${fileId}.png`,
          status: 'uploaded' as const,
          createdAtIso: '2026-07-07T08:00:00.000Z',
        }),
      ),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          platformFileApi={platformFileApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607070009' })
        .props.onPress();
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
    });

    expect(platformFileApi.getFileMetadata).toHaveBeenCalledWith(
      'file-loading-receipt-1',
    );
    expect(platformFileApi.getFileMetadata).toHaveBeenCalledWith(
      'file-arrival-receipt-1',
    );
    expect(getRenderedText(renderer)).toContain('已关联凭证：2 张');
    expect(getRenderedText(renderer)).toContain('装货凭证清单');
    expect(getRenderedText(renderer)).toContain('到达凭证清单');
    expect(
      renderer.root.findByProps({
        testID: 'driver-receipt-preview-image-loading-1',
      }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-loading-receipt-1.png',
    });
    expect(
      renderer.root.findByProps({
        testID: 'driver-receipt-preview-image-confirming-1',
      }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-arrival-receipt-1.png',
    });
  });

  it('restores a failed driver status mutation and retries with the original context', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607070001',
      status: 'transporting' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-07T08:00:00.000Z',
      updatedAtIso: '2026-07-07T08:05:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-07T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const advancedOrder = {
      ...order,
      status: 'confirming' as const,
      updatedAtIso: '2026-07-07T08:10:00.000Z',
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    platformDriverOrderApi.advanceOrderStatus
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce(advancedOrder);

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607070001' })
        .props.onPress();
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-advance-status-HY202607070001' })
        .props.onPress();
      await flushMicrotasks();
    });

    const firstCall = platformDriverOrderApi.advanceOrderStatus.mock.calls[0];
    expect(await AsyncStorage.getItem(driverOrderMutationQueueStorageKey)).toContain(
      firstCall[2],
    );

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    expect(getRenderedText(renderer)).toContain('司机订单同步队列');
    expect(getRenderedText(renderer)).toContain('原始版本：2026-07-07 16:05');
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-order-mutation-retry-status-order-1' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.advanceOrderStatus).toHaveBeenNthCalledWith(
      2,
      firstCall[0],
      firstCall[1],
      firstCall[2],
    );
    expect(await AsyncStorage.getItem(driverOrderMutationQueueStorageKey)).toBeNull();
    expect(getRenderedText(renderer)).toContain('司机已确认到达，等待货主确认。');
  });

  it('uploads proof and reports a driver exception from an executing order', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607110001',
      status: 'loading' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-11T08:00:00.000Z',
      updatedAtIso: '2026-07-11T08:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-11T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const updatedOrder = {
      ...order,
      events: [
        {
          id: 'event-driver-exception-1',
          actorUserId: 'driver-1',
          eventType: 'driver_exception_reported',
          noteText:
            '货物损坏：装货时发现外包装已经破损。；图片凭证 1 张',
          attachmentFileIds: ['file-exception-1'],
          createdAtIso: '2026-07-11T08:05:00.000Z',
        },
      ],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    platformDriverOrderApi.listExceptionCases.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'case-driver-1',
          caseNo: 'YC202607120002',
          orderId: 'order-1',
          orderNo: 'HY202607110001',
          sourceEventId: 'event-driver-exception-1',
          reporterUserId: 'driver-1',
          sourceRole: 'driver',
          typeLabel: '货物损坏',
          description: '装货时发现外包装已经破损。',
          attachmentFileIds: [],
          status: 'resolved',
          resolutionText: '客服判定货主线下赔付司机。',
          compensationStatus: 'offline_completed',
          compensationTargetRole: 'driver',
          compensationAmountCents: 6600,
          compensationUpdatedAtIso: '2026-07-12T08:15:00.000Z',
          createdAtIso: '2026-07-12T08:00:00.000Z',
          updatedAtIso: '2026-07-12T08:10:00.000Z',
          actions: [],
        },
      ],
    });
    platformDriverOrderApi.reportException.mockResolvedValue(updatedOrder);
    const platformFileApi = {
      createUploadIntent: jest.fn().mockResolvedValue({
        id: 'file-exception-1',
        ownerUserId: 'driver-1',
        purpose: 'exception',
        objectKey: 'driver-1/exception/file-exception-1.png',
        status: 'pending',
        uploadUrl:
          'http://localhost:3000/api/files/uploads/file-exception-1',
        expiresAtIso: '2026-07-11T08:15:00.000Z',
        createdAtIso: '2026-07-11T08:00:00.000Z',
      }),
      confirmLocalUploadTarget: jest.fn().mockResolvedValue({
        id: 'file-exception-1',
        ownerUserId: 'driver-1',
        purpose: 'exception',
        objectKey: 'driver-1/exception/file-exception-1.png',
        status: 'uploaded',
        createdAtIso: '2026-07-11T08:00:00.000Z',
      }),
      confirmUploaded: jest.fn(),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          platformFileApi={platformFileApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607110001' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.listExceptionCases).toHaveBeenCalledWith(
      'order-1',
    );
    expect(getRenderedText(renderer)).toContain('异常处理进度');
    expect(getRenderedText(renderer)).toContain('YC202607120002');
    expect(getRenderedText(renderer)).toContain('已解决');
    expect(getRenderedText(renderer)).toContain(
      '赔付决议：线下已赔付 · 对象：司机 · 金额：￥66.00 · 更新时间：2026-07-12 16:15',
    );

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({
          testID:
            'driver-exception-type-cargo-damage-HY202607110001',
        })
        .props.onPress();
      renderer.root
        .findByProps({
          testID: 'driver-exception-description-HY202607110001',
        })
        .props.onChangeText('  装货时发现外包装已经破损。  ');
    });
    mockSelectedImageUpload('driver-exception-upload.png');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({
          testID: 'driver-upload-exception-proof-HY202607110001',
        })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(renderer)).toContain('异常凭证清单');
    expect(getRenderedText(renderer)).toContain('异常凭证 1：异常凭证-1.png');
    expect(getRenderedText(renderer)).toContain('来源：平台文件对象（已上传）');
    expect(getRenderedText(renderer)).toContain('文件 ID：file-exception-1');
    expect(getRenderedText(renderer)).toContain('已写入平台对象存储。');
    expect(
      renderer.root.findByProps({
        testID: 'driver-exception-preview-placeholder-1',
      }).props.children,
    ).toBe('异常凭证 1');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-submit-exception-HY202607110001' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformFileApi.createUploadIntent).toHaveBeenCalledWith({
      purpose: 'exception',
      fileName: '异常凭证-1.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
    expect(platformDriverOrderApi.reportException).toHaveBeenCalledWith(
      'order-1',
      {
        typeLabel: '货物损坏',
        description: '装货时发现外包装已经破损。',
        photoCount: 1,
        photoFileIds: ['file-exception-1'],
      },
    );
    expect(getRenderedText(renderer)).toContain(
      '异常已上报，等待客服跟进。',
    );
    expect(getRenderedText(renderer)).toContain(
      '最新异常：货物损坏：装货时发现外包装已经破损。；图片凭证 1 张',
    );
  });

  it('hydrates the latest reported exception attachments when reopening an order', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607110006',
      status: 'transporting' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-11T08:00:00.000Z',
      updatedAtIso: '2026-07-11T08:10:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-11T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [
        {
          id: 'event-driver-exception-2',
          actorUserId: 'driver-1',
          eventType: 'driver_exception_reported',
          noteText: '货物损坏：装货时发现外包装已经破损。；图片凭证 2 张',
          attachmentFileIds: ['file-exception-history-1', 'file-exception-history-2'],
          createdAtIso: '2026-07-11T08:05:00.000Z',
        },
      ],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    const platformFileApi = {
      createUploadIntent: jest.fn(),
      confirmUploaded: jest.fn(),
      confirmLocalUploadTarget: jest.fn(),
      getFileMetadata: jest.fn().mockImplementation((fileId: string) =>
        Promise.resolve({
          id: fileId,
          ownerUserId: 'driver-1',
          purpose: 'exception' as const,
          objectKey: `driver-1/exception/${fileId}.png`,
          publicUrl: `https://cdn.example.com/${fileId}.png`,
          status: 'uploaded' as const,
          createdAtIso: '2026-07-11T08:05:00.000Z',
        }),
      ),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          platformFileApi={platformFileApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607110006' })
        .props.onPress();
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
    });

    expect(platformFileApi.getFileMetadata).toHaveBeenCalledWith(
      'file-exception-history-1',
    );
    expect(platformFileApi.getFileMetadata).toHaveBeenCalledWith(
      'file-exception-history-2',
    );
    expect(getRenderedText(renderer)).toContain('最近一次异常凭证');
    expect(
      renderer.root.findByProps({
        testID: 'driver-reported-exception-preview-image-1',
      }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-exception-history-1.png',
    });
    expect(
      renderer.root.findByProps({
        testID: 'driver-reported-exception-preview-image-2',
      }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-exception-history-2.png',
    });
  });

  it('falls back to exception case attachments when the latest exception event has no files', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607110007',
      status: 'transporting' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-11T08:00:00.000Z',
      updatedAtIso: '2026-07-11T08:10:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-11T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [
        {
          id: 'event-driver-exception-3',
          actorUserId: 'driver-1',
          eventType: 'driver_exception_reported',
          noteText: '货物损坏：装货时发现外包装已经破损。；图片凭证 1 张',
          attachmentFileIds: [],
          createdAtIso: '2026-07-11T08:05:00.000Z',
        },
      ],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    platformDriverOrderApi.listExceptionCases.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'case-driver-3',
          caseNo: 'YC202607120007',
          orderId: 'order-1',
          orderNo: 'HY202607110007',
          sourceEventId: 'event-driver-exception-3',
          reporterUserId: 'driver-1',
          sourceRole: 'driver',
          typeLabel: '货物损坏',
          description: '装货时发现外包装已经破损。',
          attachmentFileIds: ['file-exception-case-1'],
          status: 'processing',
          appealStatus: 'none',
          createdAtIso: '2026-07-11T08:06:00.000Z',
          updatedAtIso: '2026-07-11T08:06:00.000Z',
          actions: [],
        },
      ],
    });
    const platformFileApi = {
      createUploadIntent: jest.fn(),
      confirmUploaded: jest.fn(),
      confirmLocalUploadTarget: jest.fn(),
      getFileMetadata: jest.fn().mockImplementation((fileId: string) =>
        Promise.resolve({
          id: fileId,
          ownerUserId: 'driver-1',
          purpose: 'exception' as const,
          objectKey: `driver-1/exception/${fileId}.png`,
          publicUrl: `https://cdn.example.com/${fileId}.png`,
          status: 'uploaded' as const,
          createdAtIso: '2026-07-11T08:06:00.000Z',
        }),
      ),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          platformFileApi={platformFileApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607110007' })
        .props.onPress();
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
    });

    expect(platformFileApi.getFileMetadata).toHaveBeenCalledWith(
      'file-exception-case-1',
    );
    expect(getRenderedText(renderer)).toContain('最近一次异常凭证');
    expect(
      renderer.root.findByProps({
        testID: 'driver-reported-exception-preview-image-1',
      }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-exception-case-1.png',
    });
  });

  it('prefers the latest updated exception case attachments when falling back from an event without files', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607110008',
      status: 'transporting' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-11T08:00:00.000Z',
      updatedAtIso: '2026-07-11T08:10:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-11T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [
        {
          id: 'event-driver-exception-4',
          actorUserId: 'driver-1',
          eventType: 'driver_exception_reported',
          noteText: '货物损坏：装货时发现外包装已经破损。；图片凭证 1 张',
          attachmentFileIds: [],
          createdAtIso: '2026-07-11T08:05:00.000Z',
        },
      ],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    platformDriverOrderApi.listExceptionCases.mockResolvedValue({
      total: 2,
      items: [
        {
          id: 'case-created-later',
          caseNo: 'YC202607120008',
          orderId: 'order-1',
          orderNo: 'HY202607110008',
          sourceEventId: 'event-driver-exception-4',
          reporterUserId: 'driver-1',
          sourceRole: 'driver',
          typeLabel: '货物损坏',
          description: 'created later',
          attachmentFileIds: ['file-exception-case-created-later'],
          status: 'processing',
          appealStatus: 'none',
          createdAtIso: '2026-07-11T08:06:00.000Z',
          updatedAtIso: '2026-07-11T08:06:00.000Z',
          actions: [],
        },
        {
          id: 'case-updated-later',
          caseNo: 'YC202607120009',
          orderId: 'order-1',
          orderNo: 'HY202607110008',
          sourceEventId: 'event-driver-exception-4',
          reporterUserId: 'driver-1',
          sourceRole: 'driver',
          typeLabel: '货物损坏',
          description: 'updated later',
          attachmentFileIds: ['file-exception-case-updated-later'],
          status: 'resolved',
          appealStatus: 'requested',
          createdAtIso: '2026-07-11T08:05:30.000Z',
          updatedAtIso: '2026-07-11T08:10:00.000Z',
          actions: [],
        },
      ],
    });
    const platformFileApi = {
      createUploadIntent: jest.fn(),
      confirmUploaded: jest.fn(),
      confirmLocalUploadTarget: jest.fn(),
      getFileMetadata: jest.fn().mockImplementation((fileId: string) =>
        Promise.resolve({
          id: fileId,
          ownerUserId: 'driver-1',
          purpose: 'exception' as const,
          objectKey: `driver-1/exception/${fileId}.png`,
          publicUrl: `https://cdn.example.com/${fileId}.png`,
          status: 'uploaded' as const,
          createdAtIso: '2026-07-11T08:06:00.000Z',
        }),
      ),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          platformFileApi={platformFileApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607110008' })
        .props.onPress();
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      await flushMicrotasks();
    });

    expect(getRenderedText(renderer)).toContain('最近一次异常凭证');
    expect(
      renderer.root.findByProps({
        testID: 'driver-reported-exception-preview-image-1',
      }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-exception-case-updated-later.png',
    });
  });

  it('keeps the exception form and explains unfinished proof files', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607110002',
      status: 'transporting' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-11T08:00:00.000Z',
      updatedAtIso: '2026-07-11T08:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-11T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    platformDriverOrderApi.reportException.mockRejectedValue(
      new PlatformApiError(
        'pending',
        'FILE_STATE_INVALID',
        409,
      ),
    );

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607110002' })
        .props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({
          testID:
            'driver-exception-type-cargo-damage-HY202607110002',
        })
        .props.onPress();
      renderer.root
        .findByProps({
          testID: 'driver-exception-description-HY202607110002',
        })
        .props.onChangeText('装货时发现外包装已经破损。');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-submit-exception-HY202607110002' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(renderer)).toContain('异常图片尚未上传完成。');
    expect(
      renderer.root.findByProps({
        testID: 'driver-exception-description-HY202607110002',
      }).props.value,
    ).toBe('装货时发现外包装已经破损。');
  });

  it('blocks a seventh exception proof before calling the file api', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607110004',
      status: 'confirming' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-11T08:00:00.000Z',
      updatedAtIso: '2026-07-11T08:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-11T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    let uploadSequence = 0;
    const platformFileApi = {
      createUploadIntent: jest.fn().mockImplementation(async () => {
        uploadSequence += 1;
        return {
          id: `file-exception-${uploadSequence}`,
          ownerUserId: 'driver-1',
          purpose: 'exception',
          objectKey: `driver-1/exception/file-exception-${uploadSequence}.png`,
          status: 'pending',
          uploadUrl: `http://localhost:3000/api/files/uploads/file-exception-${uploadSequence}`,
          expiresAtIso: '2026-07-11T08:15:00.000Z',
          createdAtIso: '2026-07-11T08:00:00.000Z',
        };
      }),
      confirmLocalUploadTarget: jest.fn().mockImplementation(async fileId => ({
        id: fileId,
        ownerUserId: 'driver-1',
        purpose: 'exception',
        objectKey: `driver-1/exception/${fileId}.png`,
        status: 'uploaded',
        createdAtIso: '2026-07-11T08:00:00.000Z',
      })),
      confirmUploaded: jest.fn(),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          platformFileApi={platformFileApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607110004' })
        .props.onPress();
      await flushMicrotasks();
    });
    mockSelectedImageUpload('driver-exception-cap-upload.png');

    for (let index = 0; index < 7; index += 1) {
      await ReactTestRenderer.act(async () => {
        renderer.root
          .findByProps({
            testID: 'driver-upload-exception-proof-HY202607110004',
          })
          .props.onPress();
        await flushMicrotasks();
      });
    }

    expect(platformFileApi.createUploadIntent).toHaveBeenCalledTimes(6);
    expect(getRenderedText(renderer)).toContain('异常图片最多上传 6 张。');
  });

  it('does not render the exception form for completed orders', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607110003',
      status: 'completed' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-11T08:00:00.000Z',
      updatedAtIso: '2026-07-11T08:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-11T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607110003' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(
      renderer.root.findAllByProps({
        testID: 'driver-submit-exception-HY202607110003',
      }),
    ).toHaveLength(0);
  });

  it('submits a driver reply for an evaluated order detail', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607090088',
      status: 'completed' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-09T08:00:00.000Z',
      updatedAtIso: '2026-07-09T08:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [
        {
          id: 'event-evaluation-1',
          eventType: 'evaluation_submitted',
          noteText: '服务准时，沟通顺畅。',
          createdAtIso: '2026-07-09T10:00:00.000Z',
        },
      ],
    };
    const updatedOrder = {
      ...order,
      events: [
        ...order.events,
        {
          id: 'event-evaluation-reply-1',
          eventType: 'evaluation_replied',
          noteText: '谢谢认可，后续继续保持。',
          createdAtIso: '2026-07-09T10:05:00.000Z',
        },
      ],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    platformDriverOrderApi.replyToEvaluation.mockResolvedValue(updatedOrder);

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607090088' })
        .props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-evaluation-reply-HY202607090088' })
        .props.onChangeText('  谢谢认可，后续继续保持。  ');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({
          testID: 'driver-submit-evaluation-reply-HY202607090088',
        })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.replyToEvaluation).toHaveBeenCalledWith(
      'order-1',
      { content: '谢谢认可，后续继续保持。' },
    );
    expect(getRenderedText(renderer)).toContain('评价回复已提交。');
    expect(getRenderedText(renderer)).toContain(
      '司机回复：谢谢认可，后续继续保持。',
    );
    expect(
      renderer.root.findByProps({
        testID: 'driver-evaluation-reply-HY202607090088',
      }).props.value,
    ).toBe('');
  });

  it('submits a driver evaluation for the shipper on completed orders', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607090104',
      status: 'completed' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-09T08:00:00.000Z',
      updatedAtIso: '2026-07-09T08:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [],
    };
    const updatedOrder = {
      ...order,
      events: [
        {
          id: 'event-shipper-evaluation-1',
          eventType: 'shipper_evaluation_submitted',
          noteText:
            '5 星：沟通顺畅、装货配合；评价信息：实名；图片凭证 1 张；评价正文：货主装货配合好，结算沟通清楚。',
          attachmentFileIds: ['file-shipper-evaluation-1'],
          createdAtIso: '2026-07-09T10:20:00.000Z',
        },
      ],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    platformDriverOrderApi.evaluateShipper.mockResolvedValue(updatedOrder);
    const platformFileApi = {
      createUploadIntent: jest.fn().mockResolvedValue({
        id: 'file-shipper-evaluation-1',
        ownerUserId: 'driver-1',
        purpose: 'evaluation',
        objectKey: 'driver-1/evaluation/file-shipper-evaluation-1.png',
        status: 'pending',
        uploadUrl:
          'http://localhost:3000/api/files/uploads/file-shipper-evaluation-1',
        expiresAtIso: '2026-07-09T08:15:00.000Z',
        createdAtIso: '2026-07-09T08:00:00.000Z',
      }),
      confirmLocalUploadTarget: jest.fn().mockResolvedValue({
        id: 'file-shipper-evaluation-1',
        ownerUserId: 'driver-1',
        purpose: 'evaluation',
        objectKey: 'driver-1/evaluation/file-shipper-evaluation-1.png',
        publicUrl: 'https://cdn.example.com/file-shipper-evaluation-1.png',
        status: 'uploaded',
        createdAtIso: '2026-07-09T08:00:00.000Z',
      }),
      confirmUploaded: jest.fn(),
      getFileMetadata: jest.fn(),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          platformFileApi={platformFileApi}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607090104' })
        .props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({
          testID: 'driver-shipper-evaluation-rating-HY202607090104',
        })
        .props.onChangeText('5');
      renderer.root
        .findByProps({
          testID: 'driver-shipper-evaluation-tags-HY202607090104',
        })
        .props.onChangeText(' 沟通顺畅、装货配合、沟通顺畅 ');
      renderer.root
        .findByProps({
          testID: 'driver-shipper-evaluation-content-HY202607090104',
        })
        .props.onChangeText('  货主装货配合好，结算沟通清楚。  ');
    });

    mockSelectedImageUpload('shipper-evaluation-upload.png');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({
          testID:
            'driver-upload-shipper-evaluation-proof-HY202607090104',
        })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformFileApi.createUploadIntent).toHaveBeenCalledWith({
      purpose: 'evaluation',
      fileName: '评价货主凭证-1.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
    expect(getRenderedText(renderer)).toContain('评价货主凭证清单');
    expect(
      renderer.root.findByProps({
        testID: 'driver-shipper-evaluation-preview-image-1',
      }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-shipper-evaluation-1.png',
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({
          testID: 'driver-submit-shipper-evaluation-HY202607090104',
        })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.evaluateShipper).toHaveBeenCalledWith(
      'order-1',
      {
        rating: 5,
        tags: ['沟通顺畅', '装货配合'],
        content: '货主装货配合好，结算沟通清楚。',
        photoCount: 1,
        photoFileIds: ['file-shipper-evaluation-1'],
      },
    );
    expect(getRenderedText(renderer)).toContain('货主评价已提交。');
    expect(getRenderedText(renderer)).toContain(
      '司机评价货主：5 星：沟通顺畅、装货配合；评价信息：实名；图片凭证 1 张；评价正文：货主装货配合好，结算沟通清楚。',
    );
    expect(getRenderedText(renderer)).toContain('最近一次评价货主凭证');
    expect(
      renderer.root.findByProps({
        testID: 'driver-reported-shipper-evaluation-preview-image-1',
      }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-shipper-evaluation-1.png',
    });
  });

  it('blocks blank driver evaluation replies before calling the api', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607090099',
      status: 'completed' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-09T08:00:00.000Z',
      updatedAtIso: '2026-07-09T08:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [
        {
          id: 'event-evaluation-1',
          eventType: 'evaluation_submitted',
          noteText: '服务准时，沟通顺畅。',
          createdAtIso: '2026-07-09T10:00:00.000Z',
        },
      ],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    platformDriverOrderApi.replyToEvaluation.mockResolvedValue(order);

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607090099' })
        .props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-evaluation-reply-HY202607090099' })
        .props.onChangeText('   ');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({
          testID: 'driver-submit-evaluation-reply-HY202607090099',
        })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.replyToEvaluation).not.toHaveBeenCalled();
    expect(getRenderedText(renderer)).toContain('请填写评价回复内容。');
  });

  it('shows a specific notice when a driver replies before shipper evaluation exists', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607090100',
      status: 'completed' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-09T08:00:00.000Z',
      updatedAtIso: '2026-07-09T08:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [
        {
          id: 'event-evaluation-1',
          eventType: 'evaluation_submitted',
          noteText: '服务准时，沟通顺畅。',
          createdAtIso: '2026-07-09T10:00:00.000Z',
        },
      ],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    platformDriverOrderApi.replyToEvaluation.mockRejectedValue(
      new PlatformApiError(
        '订单尚未收到货主评价',
        'ORDER_STATE_INVALID',
        409,
      ),
    );

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607090100' })
        .props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-evaluation-reply-HY202607090100' })
        .props.onChangeText('谢谢认可，后续继续保持。');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({
          testID: 'driver-submit-evaluation-reply-HY202607090100',
        })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.replyToEvaluation).toHaveBeenCalledWith(
      'order-1',
      { content: '谢谢认可，后续继续保持。' },
    );
    expect(getRenderedText(renderer)).toContain(
      '订单尚未收到货主评价，暂不能回复。',
    );
  });

  it('queues failed driver evaluation replies and retries them', async () => {
    const order = {
      id: 'order-1',
      orderNo: 'HY202607090101',
      status: 'completed' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-09T08:00:00.000Z',
      updatedAtIso: '2026-07-09T08:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [
        {
          id: 'event-evaluation-1',
          eventType: 'evaluation_submitted',
          noteText: '服务准时，沟通顺畅。',
          createdAtIso: '2026-07-09T10:00:00.000Z',
        },
      ],
    };
    const updatedOrder = {
      ...order,
      events: [
        ...order.events,
        {
          id: 'event-evaluation-reply-1',
          eventType: 'evaluation_replied',
          noteText: '网络恢复后补交回复。',
          createdAtIso: '2026-07-09T10:08:00.000Z',
        },
      ],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    platformDriverOrderApi.replyToEvaluation
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce(updatedOrder);

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607090101' })
        .props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-evaluation-reply-HY202607090101' })
        .props.onChangeText('  网络恢复后补交回复。  ');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({
          testID: 'driver-submit-evaluation-reply-HY202607090101',
        })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.replyToEvaluation).toHaveBeenCalledWith(
      'order-1',
      { content: '网络恢复后补交回复。' },
    );
    expect(getRenderedText(renderer)).toContain(
      '评价回复提交失败，已加入本地重试队列。',
    );
    expect(getRenderedText(renderer)).toContain('评价回复同步队列');
    expect(getRenderedText(renderer)).toContain('网络恢复后补交回复。');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({
          testID: 'driver-retry-evaluation-reply-HY202607090101',
        })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.replyToEvaluation).toHaveBeenNthCalledWith(
      2,
      'order-1',
      { content: '网络恢复后补交回复。' },
    );
    expect(getRenderedText(renderer)).toContain('评价回复已重新提交。');
    expect(getRenderedText(renderer)).toContain(
      '司机回复：网络恢复后补交回复。',
    );
    expect(
      renderer.root.findAllByProps({
        testID: 'driver-evaluation-reply-queue-HY202607090101',
      }),
    ).toHaveLength(0);
  });

  it('keeps driver evaluation replies queued when the access token is missing', async () => {
    await AsyncStorage.removeItem(driverEvaluationReplyQueueStorageKey);

    const order = {
      id: 'order-1',
      orderNo: 'HY202607090103',
      status: 'completed' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-09T08:00:00.000Z',
      updatedAtIso: '2026-07-09T08:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [
        {
          id: 'event-evaluation-1',
          eventType: 'evaluation_submitted',
          noteText: '服务准时，沟通顺畅。',
          createdAtIso: '2026-07-09T10:00:00.000Z',
        },
      ],
    };
    const platformDriverOrderApi = createMockDriverOrderApi();
    platformDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    platformDriverOrderApi.getOrder.mockResolvedValue(order);
    platformDriverOrderApi.replyToEvaluation.mockRejectedValue(
      new PlatformApiError(
        'Platform API access token is missing',
        'AUTH_ACCESS_TOKEN_MISSING',
        0,
      ),
    );

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={platformDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607090103' })
        .props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-evaluation-reply-HY202607090103' })
        .props.onChangeText('  登录恢复后继续同步。  ');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({
          testID: 'driver-submit-evaluation-reply-HY202607090103',
        })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(renderer)).toContain(
      '评价回复需要重新登录后再同步。',
    );
    expect(getRenderedText(renderer)).toContain('评价回复同步队列');
    expect(
      JSON.parse(
        (await AsyncStorage.getItem(driverEvaluationReplyQueueStorageKey)) ??
          '{}',
      ),
    ).toMatchObject({
      version: 1,
      queue: {
        'order-1': {
          orderId: 'order-1',
          orderNo: 'HY202607090103',
          content: '登录恢复后继续同步。',
        },
      },
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({
          testID: 'driver-retry-evaluation-reply-HY202607090103',
        })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(renderer)).toContain(
      '评价回复重试需要重新登录后再同步。',
    );
    expect(getRenderedText(renderer)).toContain('登录恢复后继续同步。');
    expect(
      JSON.parse(
        (await AsyncStorage.getItem(driverEvaluationReplyQueueStorageKey)) ??
          '{}',
      ),
    ).toMatchObject({
      queue: {
        'order-1': {
          content: '登录恢复后继续同步。',
        },
      },
    });
  });

  it('persists failed driver evaluation replies and clears them after retry', async () => {
    await AsyncStorage.removeItem(driverEvaluationReplyQueueStorageKey);

    const order = {
      id: 'order-1',
      orderNo: 'HY202607090102',
      status: 'completed' as const,
      pickupAddress: '宝安区福永物流园',
      deliveryAddress: '龙岗区坂田仓',
      cargoType: 'build',
      weightText: '2.5 吨',
      quantityText: '12 箱',
      pickupContact: '赵经理',
      pickupPhone: '13900139001',
      deliveryContact: '钱店长',
      deliveryPhone: '13900139002',
      vehicleRequirement: 'medium',
      createdAtIso: '2026-07-09T08:00:00.000Z',
      updatedAtIso: '2026-07-09T08:00:00.000Z',
      needTailboard: false,
      needTarp: false,
      pickupTimeIso: '2026-07-09T09:00:00.000Z',
      pricingMode: 'fixed' as const,
      priceCents: 76000,
      paymentMethod: 'cod' as const,
      shipperId: 'shipper-1',
      events: [
        {
          id: 'event-evaluation-1',
          eventType: 'evaluation_submitted',
          noteText: '服务准时，沟通顺畅。',
          createdAtIso: '2026-07-09T10:00:00.000Z',
        },
      ],
    };
    const updatedOrder = {
      ...order,
      events: [
        ...order.events,
        {
          id: 'event-evaluation-reply-1',
          eventType: 'evaluation_replied',
          noteText: '持久化队列恢复后重试。',
          createdAtIso: '2026-07-09T10:12:00.000Z',
        },
      ],
    };
    const failingDriverOrderApi = createMockDriverOrderApi();
    failingDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    failingDriverOrderApi.getOrder.mockResolvedValue(order);
    failingDriverOrderApi.replyToEvaluation.mockRejectedValue(
      new Error('Network request failed'),
    );

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={failingDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607090102' })
        .props.onPress();
      await flushMicrotasks();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'driver-evaluation-reply-HY202607090102' })
        .props.onChangeText('  持久化队列恢复后重试。  ');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({
          testID: 'driver-submit-evaluation-reply-HY202607090102',
        })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(
      JSON.parse(
        (await AsyncStorage.getItem(driverEvaluationReplyQueueStorageKey)) ??
          '{}',
      ),
    ).toMatchObject({
      version: 1,
      queue: {
        'order-1': {
          orderId: 'order-1',
          orderNo: 'HY202607090102',
          content: '持久化队列恢复后重试。',
        },
      },
    });

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });

    const retryDriverOrderApi = createMockDriverOrderApi();
    retryDriverOrderApi.listMyOrders.mockResolvedValue({
      items: [order],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    retryDriverOrderApi.getOrder.mockResolvedValue(order);
    retryDriverOrderApi.replyToEvaluation.mockResolvedValue(updatedOrder);

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverHomeScreen
          platformDriverOrderApi={retryDriverOrderApi}
          platformDriverCertificationApi={createMockDriverCertificationApi()}
          onLogout={jest.fn()}
        />,
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-open-order-HY202607090102' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(renderer)).toContain('评价回复同步队列');
    expect(getRenderedText(renderer)).toContain('持久化队列恢复后重试。');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({
          testID: 'driver-retry-evaluation-reply-HY202607090102',
        })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(retryDriverOrderApi.replyToEvaluation).toHaveBeenCalledWith(
      'order-1',
      { content: '持久化队列恢复后重试。' },
    );
    expect(await AsyncStorage.getItem(driverEvaluationReplyQueueStorageKey)).toBeNull();
    expect(getRenderedText(renderer)).toContain('评价回复已重新提交。');
  });
});
