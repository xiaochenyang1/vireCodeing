import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { FrequentRoutesSection } from '../src/screens/home/FrequentRoutesSection';
import type { FrequentRoute } from '../src/types';

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join('');
}

describe('FrequentRoutesSection', () => {
  const routes: FrequentRoute[] = [
    {
      id: 'route-1',
      name: '宝安仓库 → 南山门店',
      from: '宝安仓库',
      to: '南山门店',
      lastUsedText: '刚刚使用',
      lastUsedIso: '2026-07-22T08:00:00.000Z',
    },
  ];

  it('shows the latest platform route snapshot version in the manager sync card', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <FrequentRoutesSection
          routes={routes}
          syncState={{
            status: 'synced',
            message: '平台常用路线已同步。',
            updatedAtText: '刚刚',
            updatedAtIso: '2026-07-22T08:45:00.000Z',
            platformUpdatedAtIso: '2026-07-22T08:30:00.000Z',
            queueItems: [],
          }}
          onRetrySync={jest.fn()}
          onMarkSyncFailed={jest.fn()}
          onAddRoute={jest.fn()}
          onUpdateRoute={jest.fn()}
          onMoveRoute={jest.fn()}
          onDeleteRoute={jest.fn()}
          onReuseRoute={jest.fn()}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root.findByProps({ testID: 'home-routes-manage' }).props.onPress();
    });

    expect(getRenderedText(renderer)).toContain('服务端路线版本：2026-07-22 16:30');
  });
});
