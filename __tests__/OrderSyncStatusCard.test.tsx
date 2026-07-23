import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { OrderSyncStatusCard } from '../src/screens/order-detail/OrderSyncStatusCard';

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join('');
}

describe('OrderSyncStatusCard', () => {
  it('keeps the retry block reason and retry base version visible when automatic retry is stopped', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <OrderSyncStatusCard
          syncState={{
            status: 'failed',
            operation: 'update',
            message: '平台更新凭证已失效，请确认后重新发起操作。',
            updatedAtText: '刚刚',
            updatedAtIso: '2026-07-22T08:45:00.000Z',
            retryBlocked: true,
            mutationContext: {
              idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
              baseUpdatedAtIso: '2026-07-22T08:10:00.000Z',
            },
            queueItems: [
              {
                id: 'order-update',
                titleText: '订单变更',
                statusText: '同步失败',
                updatedAtText: '刚刚',
                updatedAtIso: '2026-07-22T08:45:00.000Z',
                noteText: '等待人工确认后重新发起。',
              },
            ],
          }}
          onRetry={jest.fn()}
          onMarkFailed={jest.fn()}
        />,
      );
    });

    expect(getRenderedText(renderer)).toContain('重试基线版本：2026-07-22 16:10');
    expect(getRenderedText(renderer)).toContain(
      '自动重试已停止，请根据当前同步说明确认后重新发起操作。',
    );
    expect(
      renderer.root.findAllByProps({ testID: 'order-sync-retry' }),
    ).toHaveLength(0);
  });
});
