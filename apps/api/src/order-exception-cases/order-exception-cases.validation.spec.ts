import {
  parseOrderExceptionCaseId,
  parseOrderExceptionCaseListQuery,
  parseOrderExceptionOrderId,
  parseUpdateOrderExceptionCaseRequest,
} from './order-exception-cases.validation';

describe('order exception case validation', () => {
  it('applies list defaults and normalizes optional filters', () => {
    expect(parseOrderExceptionCaseListQuery({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(
      parseOrderExceptionCaseListQuery({
        status: 'processing',
        sourceRole: 'driver',
        keyword: ' HY2026 ',
        createdFromIso: '2026-07-01T00:00:00.000Z',
        createdToIso: '2026-08-01T00:00:00.000Z',
      }),
    ).toEqual({
      page: 1,
      pageSize: 20,
      status: 'processing',
      sourceRole: 'driver',
      keyword: 'HY2026',
      createdFromIso: '2026-07-01T00:00:00.000Z',
      createdToIso: '2026-08-01T00:00:00.000Z',
    });
  });

  it('rejects invalid pagination and date ranges', () => {
    expect(() =>
      parseOrderExceptionCaseListQuery({ pageSize: 51 }),
    ).toThrow();
    expect(() =>
      parseOrderExceptionCaseListQuery({
        createdFromIso: '2026-08-01T00:00:00.000Z',
        createdToIso: '2026-07-01T00:00:00.000Z',
      }),
    ).toThrow('开始时间必须早于结束时间');
  });

  it('normalizes valid transition requests', () => {
    expect(
      parseUpdateOrderExceptionCaseRequest({
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        content: '  客服已经联系双方核实情况。  ',
      }),
    ).toEqual({
      baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      content: '客服已经联系双方核实情况。',
    });
  });

  it('rejects invalid transition requests', () => {
    expect(() =>
      parseUpdateOrderExceptionCaseRequest({
        baseUpdatedAtIso: 'bad-date',
        content: '客服已经联系双方核实情况。',
      }),
    ).toThrow('工单版本时间不合法');
    expect(() =>
      parseUpdateOrderExceptionCaseRequest({
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        content: '太短',
      }),
    ).toThrow('处理说明至少 6 个字');
  });

  it('trims order and case ids and rejects blank ids', () => {
    expect(parseOrderExceptionOrderId(' order-1 ')).toBe('order-1');
    expect(parseOrderExceptionCaseId(' case-1 ')).toBe('case-1');
    expect(() => parseOrderExceptionOrderId('   ')).toThrow('订单 ID 不能为空');
    expect(() => parseOrderExceptionCaseId('   ')).toThrow('工单 ID 不能为空');
  });
});
