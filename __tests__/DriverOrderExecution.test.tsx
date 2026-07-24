import { act } from 'react';
import * as ImagePicker from 'expo-image-picker';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';

import { DriverOrderExecution } from '../src/components/DriverOrderExecution';
import type { PlatformShipperOrder } from '../src/services/platformOrderApi';

const originalFetch = globalThis.fetch;

function createMockOrder(
  status: PlatformShipperOrder['status'] = 'loading',
): PlatformShipperOrder {
  return {
    id: 'order-1',
    orderNo: 'HY202607090001',
    shipperId: 'shipper-1',
    status,
    cargoType: '建材',
    weightText: '5 吨',
    quantityText: '10 件',
    volumeText: '20 立方米',
    cargoDescription: '水泥和钢筋',
    pickupAddress: '宝安区福永物流园',
    pickupContact: '赵经理',
    pickupPhone: '13800138001',
    deliveryAddress: '龙岗区坂田仓',
    deliveryContact: '钱店长',
    deliveryPhone: '13900139001',
    vehicleRequirement: '4.2 米厢货',
    needTailboard: false,
    needTarp: false,
    pickupTimeIso: '2026-07-09T03:00:00.000Z',
    pricingMode: 'fixed',
    priceCents: 88000,
    paymentMethod: 'cod',
    updatedAtIso: '2026-07-09T02:00:00.000Z',
    createdAtIso: '2026-07-09T01:00:00.000Z',
  };
}

function createMockNavigationTargets() {
  return [
    { type: 'pickup' as const, address: '宝安区福永物流园', contactName: '赵经理', contactPhone: '13800138001' },
    { type: 'delivery' as const, address: '龙岗区坂田仓', contactName: '钱店长', contactPhone: '13900139001' },
  ];
}

function getAdvanceButtonLabel(
  renderer: ReactTestRenderer.ReactTestRenderer | undefined,
) {
  return renderer?.root
    .findByProps({ testID: 'driver-advance-order-1' })
    .findByType(Text).props.children;
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

describe('DriverOrderExecution', () => {
  beforeEach(() => {
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

  it('renders loading stage with advance button', async () => {
    const order = createMockOrder('loading');
    const onAdvance = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverOrderExecution
          order={order}
          baseUpdatedAtIso={order.updatedAtIso}
          navigationTargets={createMockNavigationTargets()}
          onNavigate={() => {}}
          onReportLocation={() => {}}
          onAdvanceStatus={onAdvance}
          onChangeReceipt={() => {}}
          receiptFiles={{ loading: [], confirming: [] }}
          isAdvancing={false}
        />,
      );
    });

    expect(renderer?.root.findByProps({ testID: 'driver-order-execution' })).toBeTruthy();
    expect(renderer?.root.findByProps({ testID: 'driver-advance-order-1' })).toBeTruthy();
    expect(getAdvanceButtonLabel(renderer)).toBe('确认装货完成');
  });

  it('renders transporting stage with advance button', async () => {
    const order = createMockOrder('transporting');
    const onAdvance = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverOrderExecution
          order={order}
          baseUpdatedAtIso={order.updatedAtIso}
          navigationTargets={createMockNavigationTargets()}
          onNavigate={() => {}}
          onReportLocation={() => {}}
          onAdvanceStatus={onAdvance}
          onChangeReceipt={() => {}}
          receiptFiles={{ loading: [], confirming: [] }}
          isAdvancing={false}
        />,
      );
    });

    expect(getAdvanceButtonLabel(renderer)).toBe('确认卸货完成');
  });

  it('renders confirming stage with advance button', async () => {
    const order = createMockOrder('confirming');
    const onAdvance = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverOrderExecution
          order={order}
          baseUpdatedAtIso={order.updatedAtIso}
          navigationTargets={createMockNavigationTargets()}
          onNavigate={() => {}}
          onReportLocation={() => {}}
          onAdvanceStatus={onAdvance}
          onChangeReceipt={() => {}}
          receiptFiles={{ loading: [], confirming: [] }}
          isAdvancing={false}
        />,
      );
    });

    expect(getAdvanceButtonLabel(renderer)).toBe('确认送达');
  });

  it('renders completed stage without advance button', async () => {
    const order = createMockOrder('completed');
    const onAdvance = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverOrderExecution
          order={order}
          baseUpdatedAtIso={order.updatedAtIso}
          navigationTargets={createMockNavigationTargets()}
          onNavigate={() => {}}
          onReportLocation={() => {}}
          onAdvanceStatus={onAdvance}
          onChangeReceipt={() => {}}
          receiptFiles={{ loading: [], confirming: [] }}
          isAdvancing={false}
        />,
      );
    });

    expect(() =>
      renderer?.root.findByProps({ testID: 'driver-advance-order-1' }),
    ).toThrow();
  });

  it('shows receipt upload fields for loading stage', async () => {
    const order = createMockOrder('loading');

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverOrderExecution
          order={order}
          baseUpdatedAtIso={order.updatedAtIso}
          navigationTargets={[]}
          onNavigate={() => {}}
          onReportLocation={() => {}}
          onAdvanceStatus={() => {}}
          onChangeReceipt={() => {}}
          receiptFiles={{ loading: [], confirming: [] }}
          isAdvancing={false}
          platformFileApi={{
            createUploadIntent: async () => ({
              id: 'intent-1',
              ownerUserId: 'driver-1',
              purpose: 'receipt',
              objectKey: 'driver-1/receipt/intent-1.png',
              status: 'pending',
              uploadUrl: 'https://example.com/upload',
              expiresAtIso: '2026-07-09T03:00:00.000Z',
              createdAtIso: '2026-07-09T02:00:00.000Z',
            }),
            confirmUploaded: async () => ({
              id: 'file-1',
              ownerUserId: 'driver-1',
              purpose: 'receipt',
              objectKey: 'driver-1/receipt/file-1.png',
              status: 'uploaded',
              createdAtIso: '2026-07-09T02:00:00.000Z',
            }),
          }}
        />,
      );
    });

    expect(renderer?.root.findByProps({ testID: 'driver-receipt-loading-order-1' })).toBeTruthy();
  });

  it('shows receipt upload fields for transporting stage', async () => {
    const order = createMockOrder('transporting');

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverOrderExecution
          order={order}
          baseUpdatedAtIso={order.updatedAtIso}
          navigationTargets={[]}
          onNavigate={() => {}}
          onReportLocation={() => {}}
          onAdvanceStatus={() => {}}
          onChangeReceipt={() => {}}
          receiptFiles={{ loading: [], confirming: [] }}
          isAdvancing={false}
          platformFileApi={{
            createUploadIntent: async () => ({
              id: 'intent-1',
              ownerUserId: 'driver-1',
              purpose: 'receipt',
              objectKey: 'driver-1/receipt/intent-1.png',
              status: 'pending',
              uploadUrl: 'https://example.com/upload',
              expiresAtIso: '2026-07-09T03:00:00.000Z',
              createdAtIso: '2026-07-09T02:00:00.000Z',
            }),
            confirmUploaded: async () => ({
              id: 'file-1',
              ownerUserId: 'driver-1',
              purpose: 'receipt',
              objectKey: 'driver-1/receipt/file-1.png',
              status: 'uploaded',
              createdAtIso: '2026-07-09T02:00:00.000Z',
            }),
          }}
        />,
      );
    });

    expect(renderer?.root.findByProps({ testID: 'driver-receipt-confirming-order-1' })).toBeTruthy();
  });

  it('does not show receipt upload fields for confirming stage', async () => {
    const order = createMockOrder('confirming');

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverOrderExecution
          order={order}
          baseUpdatedAtIso={order.updatedAtIso}
          navigationTargets={[]}
          onNavigate={() => {}}
          onReportLocation={() => {}}
          onAdvanceStatus={() => {}}
          onChangeReceipt={() => {}}
          receiptFiles={{ loading: [], confirming: [] }}
          isAdvancing={false}
        />,
      );
    });

    expect(() =>
      renderer?.root.findByProps({ testID: 'driver-receipt-loading-order-1' }),
    ).toThrow();
    expect(() =>
      renderer?.root.findByProps({ testID: 'driver-receipt-confirming-order-1' }),
    ).toThrow();
  });

  it('calls onAdvanceStatus when advance button is pressed', async () => {
    const order = createMockOrder('loading');
    const onAdvance = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverOrderExecution
          order={order}
          baseUpdatedAtIso={order.updatedAtIso}
          navigationTargets={[]}
          onNavigate={() => {}}
          onReportLocation={() => {}}
          onAdvanceStatus={onAdvance}
          onChangeReceipt={() => {}}
          receiptFiles={{ loading: [], confirming: [] }}
          isAdvancing={false}
        />,
      );
    });

    const button = renderer?.root.findByProps({ testID: 'driver-advance-order-1' });
    await act(async () => {
      button?.props.onPress();
    });

    expect(onAdvance).toHaveBeenCalledWith({
      nextStatus: 'transporting',
    });
  });

  it('uploads and clears a loading receipt through useImageUpload', async () => {
    const order = createMockOrder('loading');
    const onChangeReceipt = jest.fn();
    const platformFileApi = {
      createUploadIntent: jest.fn().mockResolvedValue({
        id: 'file-1',
        ownerUserId: 'driver-1',
        purpose: 'receipt',
        objectKey: 'driver-1/receipt/file-1.png',
        status: 'pending',
        uploadUrl: 'https://example.com/upload/file-1',
        expiresAtIso: '2026-07-09T03:00:00.000Z',
        createdAtIso: '2026-07-09T02:00:00.000Z',
      }),
      confirmUploaded: jest.fn(),
      confirmLocalUploadTarget: jest.fn().mockResolvedValue({
        id: 'file-1',
        ownerUserId: 'driver-1',
        purpose: 'receipt',
        objectKey: 'driver-1/receipt/file-1.png',
        publicUrl: 'https://cdn.example.com/file-1.png',
        status: 'uploaded',
        createdAtIso: '2026-07-09T02:00:00.000Z',
      }),
    };
    mockSelectedImageUpload('driver-loading-receipt.png');

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverOrderExecution
          order={order}
          baseUpdatedAtIso={order.updatedAtIso}
          navigationTargets={[]}
          onNavigate={() => {}}
          onReportLocation={() => {}}
          onAdvanceStatus={() => {}}
          onChangeReceipt={onChangeReceipt}
          receiptFiles={{ loading: [], confirming: [] }}
          isAdvancing={false}
          platformFileApi={platformFileApi}
        />,
      );
      await flushMicrotasks();
    });

    await act(async () => {
      renderer?.root
        .findByProps({ testID: 'driver-receipt-loading-order-1-pick' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformFileApi.createUploadIntent).toHaveBeenCalledWith({
      purpose: 'receipt',
      fileName: '装货凭证.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com/upload/file-1',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          'Content-Type': 'image/png',
        },
        body: 'file:///tmp/picked-image.png',
      }),
    );
    expect(onChangeReceipt).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'file-1',
        publicUrl: 'https://cdn.example.com/file-1.png',
        status: 'uploaded',
      }),
      'loadingReceiptFileId',
    );

    await act(async () => {
      renderer?.root
        .findByProps({ testID: 'driver-receipt-loading-order-1-clear' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(onChangeReceipt).toHaveBeenNthCalledWith(
      2,
      undefined,
      'loadingReceiptFileId',
    );
    expect(
      renderer?.root.findByProps({
        testID: 'driver-receipt-loading-order-1-placeholder',
      }),
    ).toBeTruthy();
  });
});
