import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { orderListOrders } from '../src/data/mockData';
import { OrderDetailScreen } from '../src/screens/OrderDetailScreen';

describe('OrderDetailScreen exception case progress', () => {
  it('treats a malformed empty exception case response as an empty list', async () => {
    const order = {
      ...orderListOrders[0],
      platformOrderId: 'order-platform-empty-cases',
    };
    const platformOrderApi = {
      listExceptionCases: jest.fn().mockResolvedValue({}),
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
            status: 'pending' as const,
            createdAtIso: '2026-07-12T08:00:00.000Z',
            updatedAtIso: '2026-07-12T08:00:00.000Z',
            actions: [],
          },
        ],
      }),
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
    expect(renderedText).toContain('待客服受理');
  });
});
