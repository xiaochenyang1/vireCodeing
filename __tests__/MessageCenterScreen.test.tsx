import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { MessageCenterScreen } from '../src/screens/home/MessageCenterScreen';
import type { MessageCenterItem } from '../src/types';

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join('');
}

function getMessageListTestIds(renderer: ReactTestRenderer.ReactTestRenderer) {
  return Array.from(
    new Set(
      renderer.root
        .findAll(
          node =>
            typeof node.props.testID === 'string' &&
            (node.props.testID.startsWith('message-conversation-') ||
              node.props.testID.startsWith('message-mark-read-') ||
              node.props.testID.startsWith('message-open-order-')),
        )
        .map(node => node.props.testID),
    ),
  );
}

describe('MessageCenterScreen', () => {
  it('sorts conversation previews and notifications by structured message time and keeps chat messages chronological', async () => {
    const onMarkMessageRead = jest.fn();
    const messages: MessageCenterItem[] = [
      {
        id: 'message-system-older',
        category: 'system',
        title: '旧系统通知',
        content: '较早的系统消息',
        timeText: '昨天 18:00',
        unread: false,
        createdAtIso: '2026-07-22T10:00:00.000Z',
        updatedAtIso: '2026-07-22T10:00:00.000Z',
      },
      {
        id: 'message-order-latest',
        category: 'order',
        title: '订单状态更新',
        content: '订单 HY202607230001 已到装货点。',
        timeText: '1 分钟前',
        unread: true,
        createdAtIso: '2026-07-23T10:05:00.000Z',
        updatedAtIso: '2026-07-23T10:05:00.000Z',
        platformOrderId: 'order-platform-1',
        orderNo: 'HY202607230001',
      },
      {
        id: 'message-finance-latest',
        category: 'finance',
        title: '最新财务通知',
        content: '最新到账提醒',
        timeText: '刚刚',
        unread: true,
        createdAtIso: '2026-07-23T10:06:00.000Z',
        updatedAtIso: '2026-07-23T10:06:00.000Z',
      },
      {
        id: 'message-order-older',
        category: 'service',
        title: '司机接单提醒',
        content: '订单 HY202607230001 司机已接单。',
        timeText: '10 分钟前',
        unread: false,
        createdAtIso: '2026-07-23T09:56:00.000Z',
        updatedAtIso: '2026-07-23T09:56:00.000Z',
        platformOrderId: 'order-platform-1',
        orderNo: 'HY202607230001',
      },
    ];

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <MessageCenterScreen
          messages={messages}
          unreadCount={2}
          onBackHome={jest.fn()}
          onMarkMessageRead={onMarkMessageRead}
          onMarkAllMessagesRead={jest.fn()}
          onOpenOrderDetail={jest.fn()}
        />,
      );
      await Promise.resolve();
    });

    expect(getMessageListTestIds(renderer)).toEqual([
      'message-conversation-order-order-platform-1',
      'message-mark-read-message-finance-latest',
      'message-mark-read-message-system-older',
    ]);

    const conversationText = renderer.root
      .findByProps({ testID: 'message-conversation-order-order-platform-1' })
      .findAllByType(Text)
      .map(node => node.props.children)
      .flat(Number.POSITIVE_INFINITY)
      .filter(Boolean)
      .join('');

    expect(conversationText).toContain('订单状态更新');
    expect(conversationText).toContain('订单 HY202607230001 已到装货点。');
    expect(conversationText).toContain('1 分钟前');

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'message-conversation-order-order-platform-1' })
        .props.onPress();
    });

    const renderedText = getRenderedText(renderer);

    expect(renderedText.indexOf('订单 HY202607230001 司机已接单。')).toBeLessThan(
      renderedText.indexOf('订单 HY202607230001 已到装货点。'),
    );
    expect(onMarkMessageRead).toHaveBeenCalledWith('message-order-latest');
  });
});
