import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { orderListOrders } from '../src/data/mockData';
import { TrackingCard } from '../src/screens/order-detail/TrackingCard';
import type {
  PlatformDriverLocationSnapshot,
  PlatformGeocodeResult,
} from '../src/services/platformMapsApi';
import type { RecentOrder } from '../src/types';

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join(' ');
}

async function flushMicrotasks() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

function createDeferredPromise<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function createTrackingOrder(
  overrides: Partial<RecentOrder> = {},
): RecentOrder {
  const baseOrder =
    orderListOrders.find(order => order.status === 'transporting') ??
    orderListOrders[1];

  return {
    ...baseOrder,
    driverInfo: baseOrder.driverInfo,
    ...overrides,
  };
}

function createLocationSnapshot(
  overrides: Partial<PlatformDriverLocationSnapshot> = {},
): PlatformDriverLocationSnapshot {
  return {
    driverId: 'driver-1',
    orderId: 'platform-order-1',
    latitude: 22.5333,
    longitude: 113.9304,
    source: 'device',
    recordedAtIso: '2026-07-24T08:00:00.000Z',
    updatedAtIso: '2026-07-24T08:00:00.000Z',
    distanceToTargetMeters: 3200,
    etaMinutes: 12,
    targetType: 'delivery',
    targetAddress: '福田区车公庙展厅',
    ...overrides,
  };
}

function createGeocodeResult(
  snapshot: PlatformDriverLocationSnapshot,
  formattedAddress: string,
): PlatformGeocodeResult {
  return {
    latitude: snapshot.latitude,
    longitude: snapshot.longitude,
    provider: 'sandbox',
    formattedAddress,
  };
}

async function renderTrackingCard(
  props?: Partial<React.ComponentProps<typeof TrackingCard>>,
) {
  const order = createTrackingOrder();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <TrackingCard
        order={order}
        driver={order.driverInfo!}
        onOpenNavigation={jest.fn()}
        {...props}
      />,
    );
    await flushMicrotasks();
  });

  return renderer;
}

describe('TrackingCard', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders local tracking guidance and hides the manual refresh button without platform maps', async () => {
    const order = createTrackingOrder({
      platformOrderId: undefined,
    });
    const renderer = await renderTrackingCard({
      order,
      driver: order.driverInfo!,
      platformMapsApi: undefined,
    });

    expect(
      renderer.root.findByProps({ testID: 'order-tracking-source' }).props
        .children,
    ).toBe('本地轨迹');
    expect(getRenderedText(renderer)).toContain(
      '本地演示：真实定位、路线规划和轨迹刷新后续接入地图服务。',
    );
    expect(
      renderer.root.findAllByProps({ testID: 'order-tracking-manual-refresh' }),
    ).toHaveLength(0);

    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  });

  it('manually refreshes platform tracking and keeps the latest address visible', async () => {
    const initialSnapshot = createLocationSnapshot();
    const refreshedSnapshot = createLocationSnapshot({
      latitude: 22.5489,
      longitude: 113.9417,
      recordedAtIso: '2026-07-24T08:05:00.000Z',
      updatedAtIso: '2026-07-24T08:05:00.000Z',
      distanceToTargetMeters: 1800,
      etaMinutes: 7,
      targetAddress: '南山区科技园门店',
    });
    const deferredRefresh =
      createDeferredPromise<PlatformDriverLocationSnapshot>();
    const platformMapsApi = {
      getShipperDriverLocation: jest
        .fn()
        .mockResolvedValueOnce(initialSnapshot)
        .mockReturnValueOnce(deferredRefresh.promise),
      reverseGeocode: jest
        .fn()
        .mockResolvedValueOnce(
          createGeocodeResult(initialSnapshot, '深圳市福田区车公庙展厅'),
        )
        .mockResolvedValueOnce(
          createGeocodeResult(refreshedSnapshot, '深圳市南山区科技园门店'),
        ),
    };
    const order = createTrackingOrder({
      platformOrderId: 'platform-order-1',
    });
    const renderer = await renderTrackingCard({
      order,
      driver: order.driverInfo!,
      platformMapsApi,
    });

    expect(getRenderedText(renderer)).toContain('深圳市福田区车公庙展厅');
    expect(getRenderedText(renderer)).toContain(
      '已读取司机最新上报位置，30 秒自动刷新中。',
    );
    expect(
      renderer.root.findByProps({ testID: 'order-tracking-manual-refresh' }),
    ).toBeTruthy();

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'order-tracking-manual-refresh' })
        .props.onPress();
    });

    expect(getRenderedText(renderer)).toContain('刷新中...');
    expect(getRenderedText(renderer)).toContain(
      '正在手动刷新司机最新位置，当前保留上一条平台位置。',
    );

    await ReactTestRenderer.act(async () => {
      deferredRefresh.resolve(refreshedSnapshot);
      await flushMicrotasks();
    });

    expect(platformMapsApi.getShipperDriverLocation).toHaveBeenCalledTimes(2);
    expect(platformMapsApi.reverseGeocode).toHaveBeenCalledTimes(2);
    expect(getRenderedText(renderer)).toContain('深圳市南山区科技园门店');
    expect(getRenderedText(renderer)).toContain(
      '已手动刷新司机最新位置，30 秒自动刷新中。',
    );
    expect(getRenderedText(renderer)).toContain('立即刷新位置');

    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  });
});
