import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { ProfileSyncStatusCard } from '../src/screens/profile/ProfileSyncStatusCard';

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join('');
}

describe('ProfileSyncStatusCard', () => {
  it('uses platform-neutral copy when no sync state is provided', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ProfileSyncStatusCard
          onRetry={jest.fn()}
          onMarkFailed={jest.fn()}
        />,
      );
    });

    const renderedText = getRenderedText(renderer);

    expect(renderedText).toContain(
      '同步说明：本地资料已初始化，等待平台资料同步。',
    );
    expect(renderedText).not.toContain('真实账号中心 API 未接入');
  });

  it('shows the latest synced platform address book version when available', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ProfileSyncStatusCard
          syncState={{
            status: 'synced',
            operation: 'addressBook',
            message: '平台地址簿已同步。',
            updatedAtText: '刚刚',
            updatedAtIso: '2026-07-22T08:40:00.000Z',
            platformUpdatedAtIso: '2026-07-22T08:30:00.000Z',
            queueItems: [],
          }}
          onRetry={jest.fn()}
          onMarkFailed={jest.fn()}
        />,
      );
    });

    expect(getRenderedText(renderer)).toContain(
      '服务端地址簿版本：2026-07-22 16:30',
    );
  });
});
