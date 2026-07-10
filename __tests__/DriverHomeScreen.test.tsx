import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { DriverHomeScreen } from '../src/screens/DriverHomeScreen';
import { PlatformApiError } from '../src/services/platformApiClient';

const driverEvaluationReplyQueueStorageKey =
  '@vireCodeing/driver-evaluation-reply-queue';

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
    getAcceptanceSettings: jest
      .fn()
      .mockResolvedValue(createDriverAcceptanceSettingsSnapshot()),
    saveAcceptanceSettings: jest.fn(),
    getOrder: jest.fn(),
    quoteOrder: jest.fn(),
    acceptOrder: jest.fn(),
    advanceOrderStatus: jest.fn(),
    replyToEvaluation: jest.fn(),
    evaluateShipper: jest.fn(),
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

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join('');
}

async function flushMicrotasks() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

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

  it('blocks quoting when saved acceptance settings are offline', async () => {
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
    expect(getRenderedText(renderer)).toContain(
      '当前处于离线接单，请先打开接单开关。',
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
        .props.onChangeText('6225 8888 0000 1234');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'driver-withdrawal-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformDriverOrderApi.createWithdrawal).toHaveBeenCalledWith({
      amountCents: 12000,
      bankAccountName: '李师傅',
      bankName: '招商银行',
      bankAccountNo: '6225888800001234',
    });
    expect(getRenderedText(renderer)).toContain('提现申请已提交审核。');
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

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'driver-upload-receipt-HY202607070001' })
        .props.onPress();
      await flushMicrotasks();
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
        nextStatus: 'transporting',
        receiptPhotoFileIds: ['file-receipt-1'],
      },
    );
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
            '5 星：沟通顺畅、装货配合；货主装货配合好，结算沟通清楚。',
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
      },
    );
    expect(getRenderedText(renderer)).toContain('货主评价已提交。');
    expect(getRenderedText(renderer)).toContain(
      '司机评价货主：5 星：沟通顺畅、装货配合；货主装货配合好，结算沟通清楚。',
    );
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
