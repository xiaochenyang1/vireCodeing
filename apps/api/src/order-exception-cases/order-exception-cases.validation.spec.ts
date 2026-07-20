import {
  parseOrderExceptionCaseId,
  parseOrderExceptionCaseListQuery,
  parseOrderExceptionOrderId,
  parseResolveOrderExceptionCaseRequest,
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

  it('normalizes a resolve request with compensation tracking', () => {
    expect(
      parseResolveOrderExceptionCaseRequest({
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        content: '  客服确认货主承担损失，待后续赔付跟进。  ',
        compensationStatus: 'pending',
        compensationTargetRole: 'shipper',
        compensationAmountCents: 3600,
      }),
    ).toEqual({
      baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      content: '客服确认货主承担损失，待后续赔付跟进。',
      compensationStatus: 'pending',
      compensationTargetRole: 'shipper',
      compensationAmountCents: 3600,
    });
    expect(
      parseResolveOrderExceptionCaseRequest({
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        content: '双方确认只是外包装擦碰，无需赔付。',
        compensationStatus: 'not_required',
      }),
    ).toEqual({
      baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      content: '双方确认只是外包装擦碰，无需赔付。',
      compensationStatus: 'not_required',
    });
  });

  it('rejects invalid resolve compensation payloads', () => {
    expect(() =>
      parseResolveOrderExceptionCaseRequest({
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        content: '客服确认需要给货主赔付。',
        compensationStatus: 'pending',
      }),
    ).toThrow('待赔付或线下已赔付必须指定赔付对象');
    expect(() =>
      parseResolveOrderExceptionCaseRequest({
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        content: '客服确认需要给货主赔付。',
        compensationStatus: 'offline_completed',
        compensationTargetRole: 'shipper',
        compensationAmountCents: 0,
      }),
    ).toThrow('赔付金额必须是大于 0 的整数分');
    expect(() =>
      parseResolveOrderExceptionCaseRequest({
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        content: '客服确认无需赔付。',
        compensationStatus: 'not_required',
        compensationTargetRole: 'driver',
      }),
    ).toThrow('无需赔付时不能再填赔付对象或金额');
  });

  it('trims order and case ids and rejects blank ids', () => {
    expect(parseOrderExceptionOrderId(' order-1 ')).toBe('order-1');
    expect(parseOrderExceptionCaseId(' case-1 ')).toBe('case-1');
    expect(() => parseOrderExceptionOrderId('   ')).toThrow('订单 ID 不能为空');
    expect(() => parseOrderExceptionCaseId('   ')).toThrow('工单 ID 不能为空');
  });
});
