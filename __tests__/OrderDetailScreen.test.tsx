import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { orderListOrders } from '../src/data/mockData';
import { OrderDetailScreen } from '../src/screens/OrderDetailScreen';
import type {
  PlatformPaymentRecord,
  PlatformPaymentSdk,
} from '../src/services/platformPaymentApi';
import type { RecentOrder } from '../src/types';

describe('OrderDetailScreen payment status', () => {
  it('selects a channel and waits for the server escrow state after SDK success', async () => {
    const order = createOnlineOrder({ paymentStatus: 'pending' });
    const pending = createPayment({ status: 'pending' });
    const escrowed = createPayment({ status: 'escrowed' });
    const platformPaymentApi = {
      createPayment: jest.fn().mockResolvedValue({
        replayed: false,
        payment: pending,
      }),
      getLatestPayment: jest
        .fn()
        .mockRejectedValueOnce(new Error('payment does not exist'))
        .mockResolvedValueOnce(escrowed),
    };
    const platformPaymentSdk: PlatformPaymentSdk = {
      openPayment: jest.fn().mockResolvedValue({ status: 'succeeded' }),
    };
    const onUpdateOrder = jest.fn();

    const renderer = await renderOrderDetail({
      order,
      onUpdateOrder,
      platformPaymentApi,
      platformPaymentSdk,
    });

    expect(getRenderedText(renderer)).toContain('资金状态');
    expect(getRenderedText(renderer)).toContain('待支付');
    expect(getRenderedText(renderer)).not.toContain(
      '本地演示暂不扣款，后续接入微信/支付宝。',
    );

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'payment-channel-alipay' })
        .props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'payment-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformPaymentApi.createPayment).toHaveBeenCalledWith(
      'order-platform-payment-1',
      { channel: 'alipay' },
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    );
    expect(platformPaymentSdk.openPayment).toHaveBeenCalledWith(
      'alipay',
      pending.clientPayload,
    );
    expect(platformPaymentApi.getLatestPayment).toHaveBeenCalledTimes(2);
    expect(getRenderedText(renderer)).toContain('资金已托管');
    expect(
      renderer.root.findAllByProps({ testID: 'payment-submit' }),
    ).toHaveLength(0);
    expect(onUpdateOrder).toHaveBeenCalledWith(order.id, {
      paymentStatus: 'escrowed',
      paymentChannel: 'wechat',
    });
  });

  it('reopens an existing active payment instead of creating another one', async () => {
    const order = createOnlineOrder({ paymentStatus: 'pending' });
    const pending = createPayment({ status: 'processing' });
    const escrowed = createPayment({ status: 'escrowed' });
    const platformPaymentApi = {
      createPayment: jest.fn(),
      getLatestPayment: jest
        .fn()
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce(escrowed),
    };
    const platformPaymentSdk: PlatformPaymentSdk = {
      openPayment: jest.fn().mockResolvedValue({ status: 'succeeded' }),
    };
    const renderer = await renderOrderDetail({
      order,
      platformPaymentApi,
      platformPaymentSdk,
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'payment-submit' }).props.onPress();
      await flushMicrotasks();
    });

    expect(platformPaymentApi.createPayment).not.toHaveBeenCalled();
    expect(platformPaymentSdk.openPayment).toHaveBeenCalledWith(
      'wechat',
      pending.clientPayload,
    );
    expect(getRenderedText(renderer)).toContain('资金已托管');
  });

  it('refreshes server state and hides payment actions after settlement', async () => {
    const order = createOnlineOrder({ paymentStatus: 'pending' });
    const platformPaymentApi = {
      createPayment: jest.fn(),
      getLatestPayment: jest
        .fn()
        .mockResolvedValueOnce(createPayment({ status: 'pending' }))
        .mockResolvedValueOnce(createPayment({ status: 'settled' })),
    };
    const renderer = await renderOrderDetail({
      order,
      platformPaymentApi,
      platformPaymentSdk: {
        openPayment: jest.fn(),
      },
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'payment-refresh' }).props.onPress();
      await flushMicrotasks();
    });

    expect(getRenderedText(renderer)).toContain('已完成结算');
    expect(
      renderer.root.findAllByProps({ testID: 'payment-submit' }),
    ).toHaveLength(0);
  });

  it('blocks duplicate cancellation while a refund is pending', async () => {
    const order = createOnlineOrder({ paymentStatus: 'refund_pending' });
    const renderer = await renderOrderDetail({ order });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'order-detail-secondary-action' })
        .props.onPress();
    });

    expect(getRenderedText(renderer)).toContain('退款处理中，请勿重复取消订单');
    expect(getRenderedText(renderer)).not.toContain('取消原因');
    expect(
      renderer.root.findAllByProps({ testID: 'payment-submit' }),
    ).toHaveLength(0);
  });
});

function createOnlineOrder(
  overrides: Partial<RecentOrder> = {},
): RecentOrder {
  return {
    ...orderListOrders[0],
    platformOrderId: 'order-platform-payment-1',
    paymentMethod: 'online',
    paymentStatus: 'pending',
    ...overrides,
  };
}

function createPayment(
  overrides: Partial<PlatformPaymentRecord> = {},
): PlatformPaymentRecord {
  return {
    id: 'payment-1',
    paymentNo: 'PAY-1',
    orderId: 'order-platform-payment-1',
    orderNo: 'HY202607150001',
    shipperId: 'shipper-1',
    channel: 'wechat',
    amountCents: 31000,
    status: 'pending',
    clientPayload: { prepayId: 'prepay-1' },
    expiresAtIso: '2026-07-15T08:15:00.000Z',
    createdAtIso: '2026-07-15T08:00:00.000Z',
    updatedAtIso: '2026-07-15T08:00:00.000Z',
    ...overrides,
  };
}

async function renderOrderDetail({
  order,
  onUpdateOrder = jest.fn(),
  platformPaymentApi,
  platformPaymentSdk,
  platformMapsApi,
}: {
  order: RecentOrder;
  onUpdateOrder?: jest.Mock;
  platformPaymentApi?: {
    createPayment: jest.Mock;
    getLatestPayment: jest.Mock;
  };
  platformPaymentSdk?: PlatformPaymentSdk;
  platformMapsApi?: {
    getShipperDriverLocation: jest.Mock;
    reverseGeocode?: jest.Mock;
  };
}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <OrderDetailScreen
        orderId={order.id}
        now={Date.parse('2026-07-15T08:00:00.000Z')}
        orders={[order]}
        onBack={jest.fn()}
        onUpdateOrder={onUpdateOrder}
        onReorder={jest.fn()}
        onEditOrder={jest.fn()}
        platformPaymentApi={platformPaymentApi}
        platformMapsApi={platformMapsApi}
        platformPaymentSdk={platformPaymentSdk}
      />,
    );
    await flushMicrotasks();
  });
  return renderer;
}

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .flatMap(node => node.props.children)
    .join(' ');
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('OrderDetailScreen exception case progress', () => {
  it('treats a malformed empty exception case response as an empty list', async () => {
    const order = {
      ...orderListOrders[0],
      platformOrderId: 'order-platform-empty-cases',
    };
    const platformOrderApi = {
      listExceptionCases: jest.fn().mockResolvedValue({}),
      appealExceptionCase: jest.fn(),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <OrderDetailScreen
          orderId={order.id}
          now={Date.parse('2026-07-12T08:00:00.000Z')}
          orders={[order]}
          onBack={jest.fn()}
          onUpdateOrder={jest.fn()}
          onReorder={jest.fn()}
          onEditOrder={jest.fn()}
          platformOrderApi={platformOrderApi}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const renderedText = renderer.root
      .findAllByType(Text)
      .flatMap(node => node.props.children)
      .join(' ');

    expect(renderedText).toContain('暂无异常处理工单');
  });

  it('loads and renders server exception case progress independently', async () => {
    const order = {
      ...orderListOrders[0],
      platformOrderId: 'order-platform-1',
    };
    const platformOrderApi = {
      listExceptionCases: jest.fn().mockResolvedValue({
        total: 1,
        items: [
          {
            id: 'case-1',
            caseNo: 'YC202607120001',
            orderId: 'order-platform-1',
            orderNo: order.id,
            sourceEventId: 'event-1',
            reporterUserId: 'driver-1',
            sourceRole: 'driver' as const,
            typeLabel: '货物损坏',
            description: '装货时发现外包装已经破损。',
            attachmentFileIds: [],
            status: 'resolved' as const,
            resolutionText: '客服判定需线下赔付。',
            compensationStatus: 'pending' as const,
            compensationTargetRole: 'driver' as const,
            compensationAmountCents: 12800,
            compensationUpdatedAtIso: '2026-07-12T08:20:00.000Z',
            createdAtIso: '2026-07-12T08:00:00.000Z',
            updatedAtIso: '2026-07-12T08:00:00.000Z',
            actions: [],
          },
        ],
      }),
      appealExceptionCase: jest.fn(),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <OrderDetailScreen
          orderId={order.id}
          now={Date.parse('2026-07-12T08:00:00.000Z')}
          orders={[order]}
          onBack={jest.fn()}
          onUpdateOrder={jest.fn()}
          onReorder={jest.fn()}
          onEditOrder={jest.fn()}
          platformOrderApi={platformOrderApi}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const renderedText = renderer.root
      .findAllByType(Text)
      .flatMap(node => node.props.children)
      .join(' ');

    expect(platformOrderApi.listExceptionCases).toHaveBeenCalledWith(
      'order-platform-1',
    );
    expect(renderedText).toContain('异常处理进度');
    expect(renderedText).toContain('YC202607120001');
    expect(renderedText).toContain('已解决');
    expect(renderedText).toContain('处理结论： 客服判定需线下赔付。');
    expect(renderedText).toContain(
      '赔付决议：待赔付跟进 · 对象：司机 · 金额：￥128.00 · 更新时间：2026-07-12T08:20:00.000Z',
    );
  });
});

describe('OrderDetailScreen tracking', () => {
  it('shows a reverse geocoded driver location when available', async () => {
    const order = {
      ...orderListOrders[1],
      platformOrderId: 'order-platform-tracking-1',
    };
    const platformMapsApi = {
      getShipperDriverLocation: jest.fn().mockResolvedValue({
        driverId: 'driver-1',
        orderId: 'order-platform-tracking-1',
        latitude: 22.61,
        longitude: 113.91,
        source: 'sandbox',
        recordedAtIso: '2026-07-21T10:00:00.000Z',
        updatedAtIso: '2026-07-21T10:00:00.000Z',
      }),
      reverseGeocode: jest.fn().mockResolvedValue({
        latitude: 22.61,
        longitude: 113.91,
        provider: 'amap',
        formattedAddress: '深圳市宝安区福永街道平台司机位置',
      }),
    };

    const renderer = await renderOrderDetail({
      order,
      platformMapsApi,
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'order-detail-primary-action' })
        .props.onPress();
      await flushMicrotasks();
    });

    const renderedText = getRenderedText(renderer);

    expect(platformMapsApi.getShipperDriverLocation).toHaveBeenCalledWith(
      'order-platform-tracking-1',
    );
    expect(platformMapsApi.reverseGeocode).toHaveBeenCalledWith({
      latitude: 22.61,
      longitude: 113.91,
    });
    expect(renderedText).toContain('位置跟踪');
    expect(renderedText).toContain('司机位置：深圳市宝安区福永街道平台司机位置');
    expect(renderedText).toContain(
      '坐标：22.610000, 113.910000 · 更新时间：2026-07-21T10:00:00.000Z',
    );
    expect(renderedText).toContain('已读取司机最新上报位置。');
  });

  it('falls back to coordinates when reverse geocoding fails', async () => {
    const order = {
      ...orderListOrders[1],
      platformOrderId: 'order-platform-tracking-2',
    };
    const platformMapsApi = {
      getShipperDriverLocation: jest.fn().mockResolvedValue({
        driverId: 'driver-2',
        orderId: 'order-platform-tracking-2',
        latitude: 22.61,
        longitude: 113.91,
        source: 'sandbox',
        recordedAtIso: '2026-07-21T10:05:00.000Z',
        updatedAtIso: '2026-07-21T10:05:00.000Z',
      }),
      reverseGeocode: jest.fn().mockRejectedValue(new Error('reverse failed')),
    };

    const renderer = await renderOrderDetail({
      order,
      platformMapsApi,
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'order-detail-primary-action' })
        .props.onPress();
      await flushMicrotasks();
    });

    const renderedText = getRenderedText(renderer);

    expect(renderedText).toContain('司机位置：22.610000, 113.910000');
    expect(renderedText).toContain('更新时间：2026-07-21T10:05:00.000Z');
    expect(renderedText).toContain('司机位置地址解析失败，仍展示坐标。');
  });
});
