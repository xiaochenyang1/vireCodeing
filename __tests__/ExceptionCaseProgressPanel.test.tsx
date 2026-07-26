import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { ExceptionCaseProgressPanel } from '../src/screens/order-detail/ExceptionCaseProgressPanel';
import type { PlatformOrderExceptionCase } from '../src/services/platformOrderApi';

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join('');
}

function getExceptionCaseTestIds(
  renderer: ReactTestRenderer.ReactTestRenderer,
) {
  return Array.from(
    new Set(
      renderer.root
        .findAll(
          node =>
            typeof node.props.testID === 'string' &&
            node.props.testID.startsWith('exception-case-'),
        )
        .map(node => node.props.testID),
    ),
  );
}

describe('ExceptionCaseProgressPanel', () => {
  it('shows lifecycle, compensation, and action timing context', async () => {
    const exceptionCase: PlatformOrderExceptionCase = {
      id: 'case-1',
      caseNo: 'YC202607250001',
      orderId: 'order-1',
      orderNo: 'HY202607250001',
      sourceEventId: 'event-1',
      reporterUserId: 'driver-1',
      sourceRole: 'driver',
      typeLabel: '货损',
      description: '外包装已经破损。',
      attachmentFileIds: [],
      status: 'closed',
      resolutionText: '平台已完成赔付。',
      compensationStatus: 'executed',
      compensationTargetRole: 'driver',
      compensationAmountCents: 3600,
      compensationUpdatedAtIso: '2026-07-25T02:30:00.000Z',
      compensationTransactionId: 'ft-3600',
      compensationExecutedAtIso: '2026-07-25T02:35:00.000Z',
      appealStatus: 'accepted',
      appealReason: '补充装货现场照片。',
      appealRequestedAtIso: '2026-07-25T02:40:00.000Z',
      resolvedAtIso: '2026-07-25T02:45:00.000Z',
      closedAtIso: '2026-07-25T02:50:00.000Z',
      sla: {
        policyKey: 'exception_case_default_v1',
        stage: 'resolution',
        status: 'resolved_within_target',
        targetAtIso: '2026-07-25T03:30:00.000Z',
        remainingMinutes: 45,
      },
      createdAtIso: '2026-07-25T02:00:00.000Z',
      updatedAtIso: '2026-07-25T02:50:00.000Z',
      actions: [
        {
          id: 'action-2',
          adminUserId: 'admin-1',
          fromStatus: 'processing',
          toStatus: 'resolved',
          content: '平台已完成赔付。',
          createdAtIso: '2026-07-25T02:45:00.000Z',
        },
        {
          id: 'action-1',
          adminUserId: 'admin-1',
          fromStatus: 'pending',
          toStatus: 'processing',
          content: '客服已接单。',
          createdAtIso: '2026-07-25T02:10:00.000Z',
        },
        {
          id: 'action-3',
          adminUserId: 'admin-1',
          fromStatus: 'resolved',
          toStatus: 'closed',
          content: '工单归档。',
          createdAtIso: '2026-07-25T02:50:00.000Z',
        },
      ],
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ExceptionCaseProgressPanel cases={[exceptionCase]} isLoading={false} />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const renderedText = getRenderedText(renderer);

    expect(renderedText).toContain('提交时间：2026-07-25 10:00');
    expect(renderedText).toContain(
      'SLA：解决 SLA · 提前 45 分钟完成 · 目标 2026-07-25 11:30',
    );
    expect(renderedText).toContain(
      '赔付决议：平台已赔付到账 · 对象：司机 · 金额：￥36.00 · 更新时间：2026-07-25 10:30',
    );
    expect(renderedText).toContain('赔付流水号：ft-3600');
    expect(renderedText).toContain('赔付执行时间：2026-07-25 10:35');
    expect(renderedText).toContain('申诉状态：申诉已受理');
    expect(renderedText).toContain('申诉理由：补充装货现场照片。');
    expect(renderedText).toContain('申诉提交时间：2026-07-25 10:40');
    expect(renderedText).toContain('解决时间：2026-07-25 10:45');
    expect(renderedText).toContain('结案时间：2026-07-25 10:50');
    expect(renderedText).toContain(
      '待客服受理 → 处理中：客服已接单。 · 2026-07-25 10:10',
    );
    expect(renderedText).toContain(
      '处理中 → 已解决：平台已完成赔付。 · 2026-07-25 10:45',
    );
    expect(renderedText).toContain('已解决 → 已关闭：工单归档。 · 2026-07-25 10:50');
  });

  it('sorts exception cases by latest activity before rendering', async () => {
    const baseCase = {
      orderId: 'order-1',
      orderNo: 'HY202607250001',
      reporterUserId: 'driver-1',
      sourceRole: 'driver' as const,
      typeLabel: '货损',
      description: '外包装已经破损。',
      attachmentFileIds: [],
      appealStatus: 'none' as const,
      actions: [],
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ExceptionCaseProgressPanel
          cases={[
            {
              ...baseCase,
              id: 'case-created-later',
              caseNo: 'YC202607250021',
              sourceEventId: 'event-1',
              status: 'processing',
              createdAtIso: '2026-07-25T02:10:00.000Z',
              updatedAtIso: '2026-07-25T02:15:00.000Z',
            },
            {
              ...baseCase,
              id: 'case-updated-later',
              caseNo: 'YC202607250022',
              sourceEventId: 'event-2',
              status: 'resolved',
              createdAtIso: '2026-07-25T02:00:00.000Z',
              updatedAtIso: '2026-07-25T02:20:00.000Z',
            },
          ]}
          isLoading={false}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getExceptionCaseTestIds(renderer)).toEqual([
      'exception-case-YC202607250022',
      'exception-case-YC202607250021',
    ]);
  });
});
