import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { PaymentStatusCard } from '../src/screens/order-detail/PaymentStatusCard';
import type { PlatformPaymentRecord } from '../src/services/platformPaymentApi';

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join(' ');
}

async function renderPaymentStatusCard(
  props?: Partial<React.ComponentProps<typeof PaymentStatusCard>>,
) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <PaymentStatusCard
        orderPaymentStatus="pending"
        selectedChannel="wechat"
        isBusy={false}
        onSelectChannel={jest.fn()}
        onPay={jest.fn()}
        onRefresh={jest.fn()}
        {...props}
      />,
    );
  });

  return renderer;
}

describe('PaymentStatusCard', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders order-level financial facts when the payment snapshot is not loaded', async () => {
    const renderer = await renderPaymentStatusCard({
      orderPaymentStatus: 'refunded',
      orderPaymentChannel: 'alipay',
      paymentSettledAtIso: '2026-07-15T08:10:00.000Z',
      refundedAtIso: '2026-07-15T10:00:00.000Z',
      canSubmitPaymentAction: false,
    });

    const renderedText = getRenderedText(renderer);

    expect(renderedText).toContain('已退款');
    expect(renderedText).toContain('渠道 支付宝');
    expect(renderedText).toContain('结算时间 2026-07-15 16:10');
    expect(renderedText).toContain('退款时间 2026-07-15 18:00');
  });

  it('renders server payment identifiers and timing facts when a payment snapshot exists', async () => {
    const renderer = await renderPaymentStatusCard({
      payment: createPayment({
        channel: 'wechat',
        status: 'pending',
        paymentNo: 'PAY-DETAIL-1',
        providerTradeNo: 'WX-TRADE-1',
        expiresAtIso: '2026-07-15T08:15:00.000Z',
        updatedAtIso: '2026-07-15T08:05:00.000Z',
      }),
    });

    const renderedText = getRenderedText(renderer);

    expect(renderedText).toContain('金额 ￥310.00');
    expect(renderedText).toContain('渠道 微信支付');
    expect(renderedText).toContain('支付单号 PAY-DETAIL-1');
    expect(renderedText).toContain('渠道流水 WX-TRADE-1');
    expect(renderedText).toContain('有效期至 2026-07-15 16:15');
    expect(renderedText).toContain('服务端更新 2026-07-15 16:05');
  });

  it('prefers refundedAtIso from the payment snapshot when rendering refund timing facts', async () => {
    const renderer = await renderPaymentStatusCard({
      orderPaymentStatus: 'refunded',
      payment: createPayment({
        channel: 'alipay',
        status: 'refunded',
        settledAtIso: '2026-07-15T08:10:00.000Z',
        refundedAtIso: '2026-07-15T10:00:00.000Z',
        paidAtIso: '2026-07-15T08:05:00.000Z',
        updatedAtIso: '2026-07-15T10:00:00.000Z',
      }),
      canSubmitPaymentAction: false,
    });

    const renderedText = getRenderedText(renderer);

    expect(renderedText).toContain('已退款');
    expect(renderedText).toContain('退款时间 2026-07-15 18:00');
    expect(renderedText).toContain('结算时间 2026-07-15 16:10');
    expect(renderedText).toContain('支付时间 2026-07-15 16:05');
  });

  it('shows a top-up pay action when the order is escrowed but a top-up payment is pending', async () => {
    const onPay = jest.fn();
    const renderer = await renderPaymentStatusCard({
      orderPaymentStatus: 'escrowed',
      payment: createPayment({
        paymentNo: 'PAY-TOPUP-PAY-main-6000',
        amountCents: 6000,
        status: 'pending',
      }),
      onPay,
      supportsPlatformPaymentFlow: true,
      hasPlatformOrderBinding: true,
    });

    const renderedText = getRenderedText(renderer);
    expect(renderedText).toContain('改单补差');
    expect(renderedText).toContain('待补差支付');
    expect(renderedText).toContain('￥60.00');
    expect(renderedText).toContain('继续补差支付');

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'payment-submit' }).props.onPress();
    });
    expect(onPay).toHaveBeenCalled();
  });

  it('hides the top-up pay action after the top-up payment is escrowed', async () => {
    const renderer = await renderPaymentStatusCard({
      orderPaymentStatus: 'escrowed',
      payment: createPayment({
        paymentNo: 'PAY-TOPUP-PAY-main-6000',
        amountCents: 6000,
        status: 'escrowed',
      }),
      supportsPlatformPaymentFlow: true,
      hasPlatformOrderBinding: true,
    });

    expect(
      renderer.root.findAllByProps({ testID: 'payment-submit' }),
    ).toHaveLength(0);
  });
});

function createPayment(
  overrides: Partial<PlatformPaymentRecord> = {},
): PlatformPaymentRecord {
  return {
    id: 'payment-1',
    paymentNo: 'PAY-1',
    orderId: 'order-1',
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
