import {
  getOrderExceptionCaseSourceText,
  getOrderExceptionCaseStatusText,
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
