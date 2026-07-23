import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { DraftSyncStatusCard } from '../src/screens/order-draft/DraftSyncStatusCard';

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join('');
}

describe('DraftSyncStatusCard', () => {
  it('uses platform-neutral copy when no sync state is provided', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<DraftSyncStatusCard />);
    });

    const renderedText = getRenderedText(renderer);

    expect(renderedText).toContain(
      '同步说明：本地草稿尚未变更，等待平台草稿同步。',
    );
    expect(renderedText).not.toContain('真实草稿 API 未接入');
  });

  it('shows the known draft baseline version when a queued sync keeps a platform base snapshot', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DraftSyncStatusCard
          syncState={{
            status: 'failed',
            message: '草稿同步失败，等待本地重试。',
            updatedAtText: '刚刚',
            updatedAtIso: '2026-07-22T08:35:00.000Z',
            platformUpdatedAtIso: '2026-07-22T08:20:00.000Z',
            queueItems: [
              {
                id: 'draft-local-change',
                titleText: '发单草稿变更',
                statusText: '同步失败',
                updatedAtText: '刚刚',
                updatedAtIso: '2026-07-22T08:35:00.000Z',
                noteText: '草稿同步未完成，已保留本地草稿队列。',
              },
            ],
          }}
        />,
      );
    });

    expect(getRenderedText(renderer)).toContain('草稿基线版本：2026-07-22 16:20');
  });
});
