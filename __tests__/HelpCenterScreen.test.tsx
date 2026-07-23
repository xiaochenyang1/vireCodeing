import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { HelpCenterScreen } from '../src/screens/home/HelpCenterScreen';
import type { SupportTicket } from '../src/types';

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join('');
}

describe('HelpCenterScreen', () => {
  const mixedTickets: SupportTicket[] = [
    {
      id: 'platform-ticket-1',
      channelName: '投诉建议',
      description: '平台工单内容',
      statusText: '待客服跟进',
      createdAtText: '2 小时前',
      createdAtIso: '2026-07-22T06:00:00.000Z',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampText: '2 小时前',
          timestampIso: '2026-07-22T06:00:00.000Z',
        },
      ],
    },
    {
      id: 'support-ticket-2',
      channelName: '订单咨询',
      description: '本地兜底工单内容',
      statusText: '待客服跟进',
      createdAtText: '刚刚提交',
      createdAtIso: '2026-07-22T08:00:00.000Z',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampText: '刚刚提交',
          timestampIso: '2026-07-22T08:00:00.000Z',
        },
      ],
    },
  ];

  it('renders platform and local fallback source labels for mixed support tickets', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <HelpCenterScreen
          supportTickets={mixedTickets}
          ticketsTitle="平台工单（含本地兜底）"
          modeBadgeText="平台同步"
          canUpdateTicketStatus={false}
          onBackHome={jest.fn()}
          onSubmitTicket={jest.fn()}
          onUpdateTicketStatus={jest.fn()}
        />,
      );
    });

    const renderedText = getRenderedText(renderer);

    expect(renderedText).toContain('来源：平台工单同步');
    expect(renderedText).toContain('来源：本地兜底工单');
  });

  it('keeps local fallback ticket actions available in platform mode', async () => {
    const onUpdateTicketStatus = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <HelpCenterScreen
          supportTickets={mixedTickets}
          ticketsTitle="平台工单（含本地兜底）"
          modeBadgeText="平台同步"
          canUpdateTicketStatus={false}
          onBackHome={jest.fn()}
          onSubmitTicket={jest.fn()}
          onUpdateTicketStatus={onUpdateTicketStatus}
        />,
      );
    });

    expect(() =>
      renderer.root.findByProps({
        testID: 'support-ticket-accept-platform-ticket-1',
      }),
    ).toThrow();
    expect(
      renderer.root.findByProps({
        testID: 'support-ticket-accept-support-ticket-2',
      }),
    ).toBeTruthy();

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'support-ticket-accept-support-ticket-2' })
        .props.onPress();
    });

    expect(onUpdateTicketStatus).toHaveBeenCalledWith(
      'support-ticket-2',
      '客服已受理',
      {
        actionText: '客服已受理',
        timestampText: '刚刚',
      },
    );
  });
});
