import {
  getOrderExceptionCaseCompensationStatusText,
  getOrderExceptionCaseCompensationSummary,
  getOrderExceptionCaseCompensationTargetText,
  getOrderExceptionCaseSourceText,
  getOrderExceptionCaseStatusText,
  getOrderExceptionCaseSummaryHeadline,
  getOrderExceptionCaseSummaryText,
  sortOrderExceptionCaseActions,
} from '../src/utils/orderExceptionCases';

describe('order exception case utilities', () => {
  it('maps status and source labels', () => {
    expect(getOrderExceptionCaseStatusText('pending')).toBe('待客服受理');
    expect(getOrderExceptionCaseStatusText('processing')).toBe('处理中');
    expect(getOrderExceptionCaseStatusText('resolved')).toBe('已解决');
    expect(getOrderExceptionCaseStatusText('closed')).toBe('已关闭');
    expect(getOrderExceptionCaseSourceText('shipper')).toBe('货主上报');
    expect(getOrderExceptionCaseSourceText('driver')).toBe('司机上报');
  });

  it('formats compensation decision snapshots', () => {
    expect(getOrderExceptionCaseCompensationStatusText('not_required')).toBe(
      '无需赔付',
    );
    expect(getOrderExceptionCaseCompensationStatusText('pending')).toBe(
      '待赔付跟进',
    );
    expect(
      getOrderExceptionCaseCompensationStatusText('offline_completed'),
    ).toBe('线下已赔付');
    expect(getOrderExceptionCaseCompensationTargetText('shipper')).toBe('货主');
    expect(getOrderExceptionCaseCompensationTargetText('driver')).toBe('司机');
    expect(
      getOrderExceptionCaseCompensationSummary({
        compensationStatus: 'not_required',
      }),
    ).toBe('赔付决议：无需赔付');
    expect(
      getOrderExceptionCaseCompensationSummary({
        compensationStatus: 'pending',
        compensationTargetRole: 'driver',
        compensationAmountCents: 8800,
        compensationUpdatedAtIso: '2026-07-12T08:30:00.000Z',
      }),
    ).toBe(
      '赔付决议：待赔付跟进 · 对象：司机 · 金额：￥88.00 · 更新时间：2026-07-12T08:30:00.000Z',
    );
    expect(
      getOrderExceptionCaseCompensationSummary({
        compensationStatus: 'offline_completed',
        compensationTargetRole: 'shipper',
        compensationAmountCents: 1250,
      }),
    ).toBe('赔付决议：线下已赔付 · 对象：货主 · 金额：￥12.50');
    expect(
      getOrderExceptionCaseCompensationSummary(
        {
          compensationStatus: 'offline_completed',
          compensationTargetRole: 'shipper',
          compensationAmountCents: 1250,
          compensationUpdatedAtIso: '2026-07-12T09:00:00.000Z',
        },
        {
          includeUpdatedAt: false,
        },
      ),
    ).toBe('赔付决议：线下已赔付 · 对象：货主 · 金额：￥12.50');
    expect(getOrderExceptionCaseCompensationSummary({})).toBeUndefined();
  });

  it('formats compact latest exception summaries', () => {
    expect(
      getOrderExceptionCaseSummaryHeadline({
        caseNo: 'YC202607180003',
        status: 'resolved',
      }),
    ).toBe('最新异常：YC202607180003 · 已解决');
    expect(
      getOrderExceptionCaseSummaryText({
        compensationStatus: 'offline_completed',
        compensationTargetRole: 'driver',
        compensationAmountCents: 8800,
        compensationUpdatedAtIso: '2026-07-18T09:15:00.000Z',
      }),
    ).toBe('赔付决议：线下已赔付 · 对象：司机 · 金额：￥88.00');
    expect(
      getOrderExceptionCaseSummaryText({
        resolutionText: '客服已要求双方补充装卸现场凭证。',
      }),
    ).toBe('处理结论：客服已要求双方补充装卸现场凭证。');
    expect(getOrderExceptionCaseSummaryText({})).toBeUndefined();
  });

  it('sorts actions chronologically without mutating the input', () => {
    const actions = [
      {
        id: 'action-new',
        adminUserId: 'admin-1',
        fromStatus: 'processing' as const,
        toStatus: 'resolved' as const,
        content: '处理完成',
        createdAtIso: '2026-07-12T09:00:00.000Z',
      },
      {
        id: 'action-old',
        adminUserId: 'admin-1',
        fromStatus: 'pending' as const,
        toStatus: 'processing' as const,
        content: '开始处理',
        createdAtIso: '2026-07-12T08:00:00.000Z',
      },
    ];

    expect(sortOrderExceptionCaseActions(actions).map(item => item.id)).toEqual([
      'action-old',
      'action-new',
    ]);
    expect(actions.map(item => item.id)).toEqual(['action-new', 'action-old']);
  });
});
