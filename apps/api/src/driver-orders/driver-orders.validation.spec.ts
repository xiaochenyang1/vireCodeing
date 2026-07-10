import {
  parseCreateDriverWithdrawalRequest,
  parseDriverAcceptOrderRequest,
  parseSaveDriverAcceptanceSettingsRequest,
  parseDriverAdvanceOrderStatusRequest,
  parseDriverMyOrdersQuery,
  parseDriverOrderHallQuery,
  parseDriverQuoteOrderRequest,
  parseDriverEvaluateShipperRequest,
  parseDriverReplyEvaluationRequest,
  parseDriverWithdrawalsQuery,
} from './driver-orders.validation';

describe('driver orders validation', () => {
  it('normalizes a driver quote order request', () => {
    expect(
      parseDriverQuoteOrderRequest({
        quoteCents: 88000,
        arrivalText: '  45 分钟到达  ',
        noteText: '  可带尾板，今晚可装货  ',
      }),
    ).toEqual({
      quoteCents: 88000,
      arrivalText: '45 分钟到达',
      noteText: '可带尾板，今晚可装货',
    });
  });

  it('rejects invalid driver quote order requests', () => {
    expect(() =>
      parseDriverQuoteOrderRequest({
        quoteCents: 0,
        arrivalText: '45 分钟到达',
      }),
    ).toThrow('司机报价必须大于 0');

    expect(() =>
      parseDriverQuoteOrderRequest({
        quoteCents: 88000,
        arrivalText: '',
      }),
    ).toThrow('预计到达时间不能为空');

    expect(() =>
      parseDriverQuoteOrderRequest({
        quoteCents: 88000,
        arrivalText: '45 分钟到达',
        noteText: 'x'.repeat(201),
      }),
    ).toThrow('报价备注最多 200 字');
  });

  it('parses driver order hall query defaults and page bounds', () => {
    expect(parseDriverOrderHallQuery({})).toEqual({
      page: 1,
      pageSize: 20,
    });

    expect(() => parseDriverOrderHallQuery({ pageSize: 80 })).toThrow();
  });

  it('normalizes driver accept order request notes', () => {
    expect(
      parseDriverAcceptOrderRequest({
        noteText: '  马上联系货主确认装货细节  ',
      }),
    ).toEqual({
      noteText: '马上联系货主确认装货细节',
    });

    expect(parseDriverAcceptOrderRequest({ noteText: '   ' })).toEqual({});
  });

  it('parses driver my-orders query statuses', () => {
    expect(parseDriverMyOrdersQuery({})).toEqual({
      statuses: ['loading', 'transporting', 'confirming'],
      page: 1,
      pageSize: 20,
    });

    expect(
      parseDriverMyOrdersQuery({
        statuses: 'loading, transporting,confirming',
        page: '2',
        pageSize: '10',
      }),
    ).toEqual({
      statuses: ['loading', 'transporting', 'confirming'],
      page: 2,
      pageSize: 10,
    });

    expect(() =>
      parseDriverMyOrdersQuery({ statuses: 'waiting' }),
    ).toThrow('司机执行订单状态无效');
  });

  it('parses driver status advance requests', () => {
    expect(
      parseDriverAdvanceOrderStatusRequest({ nextStatus: 'transporting' }),
    ).toEqual({ nextStatus: 'transporting' });

    expect(
      parseDriverAdvanceOrderStatusRequest({
        nextStatus: 'transporting',
        receiptPhotoFileIds: [' file-receipt-1 ', 'file-receipt-1'],
      }),
    ).toEqual({
      nextStatus: 'transporting',
      receiptPhotoFileIds: ['file-receipt-1'],
    });

    expect(() =>
      parseDriverAdvanceOrderStatusRequest({ nextStatus: 'completed' }),
    ).toThrow('司机订单目标状态无效');

    expect(() =>
      parseDriverAdvanceOrderStatusRequest({
        nextStatus: 'transporting',
        receiptPhotoFileIds: [''],
      }),
    ).toThrow('司机执行凭证文件 ID 无效');
  });

  it('parses driver evaluation reply requests', () => {
    expect(
      parseDriverReplyEvaluationRequest({
        content: '  谢谢认可，后续继续保持。  ',
      }),
    ).toEqual({
      content: '谢谢认可，后续继续保持。',
    });

    expect(() =>
      parseDriverReplyEvaluationRequest({ content: '   ' }),
    ).toThrow('评价回复不能为空');

    expect(() =>
      parseDriverReplyEvaluationRequest({ content: 'x'.repeat(201) }),
    ).toThrow('评价回复最多 200 字');
  });

  it('parses driver shipper evaluation requests', () => {
    expect(
      parseDriverEvaluateShipperRequest({
        rating: 5,
        tags: [' 沟通顺畅 ', '装货配合', '沟通顺畅'],
        content: '  货主装货配合好，结算沟通清楚。  ',
        anonymous: true,
      }),
    ).toEqual({
      rating: 5,
      tags: ['沟通顺畅', '装货配合'],
      content: '货主装货配合好，结算沟通清楚。',
      anonymous: true,
    });

    expect(() =>
      parseDriverEvaluateShipperRequest({
        rating: 0,
        tags: ['沟通顺畅'],
        content: '货主装货配合好，结算沟通清楚。',
      }),
    ).toThrow();

    expect(() =>
      parseDriverEvaluateShipperRequest({
        rating: 5,
        tags: [],
        content: '货主装货配合好，结算沟通清楚。',
      }),
    ).toThrow('请选择至少一个评价标签');

    expect(() =>
      parseDriverEvaluateShipperRequest({
        rating: 5,
        tags: ['沟通顺畅'],
        content: '太短',
      }),
    ).toThrow('请至少填写 6 个字的评价内容');
  });

  it('parses driver acceptance settings requests', () => {
    expect(
      parseSaveDriverAcceptanceSettingsRequest({
        isOnline: false,
        maxDistanceKm: 30,
        vehicleTypePreferences: [' medium ', 'box', 'medium'],
      }),
    ).toEqual({
      isOnline: false,
      maxDistanceKm: 30,
      vehicleTypePreferences: ['medium', 'box'],
    });

    expect(() =>
      parseSaveDriverAcceptanceSettingsRequest({
        isOnline: 'yes',
        maxDistanceKm: 30,
        vehicleTypePreferences: [],
      }),
    ).toThrow('接单开关无效');
    expect(() =>
      parseSaveDriverAcceptanceSettingsRequest({
        isOnline: true,
        maxDistanceKm: 0,
        vehicleTypePreferences: [],
      }),
    ).toThrow('接单范围至少 1 公里');
    expect(() =>
      parseSaveDriverAcceptanceSettingsRequest({
        isOnline: true,
        maxDistanceKm: 30,
        vehicleTypePreferences: [''],
      }),
    ).toThrow('接单车型不能为空');
  });

  it('parses driver withdrawals query defaults and page bounds', () => {
    expect(parseDriverWithdrawalsQuery({})).toEqual({
      page: 1,
      pageSize: 20,
    });

    expect(
      parseDriverWithdrawalsQuery({
        page: '2',
        pageSize: '5',
      }),
    ).toEqual({
      page: 2,
      pageSize: 5,
    });

    expect(() => parseDriverWithdrawalsQuery({ pageSize: 80 })).toThrow();
  });

  it('parses driver withdrawal requests', () => {
    expect(
      parseCreateDriverWithdrawalRequest({
        amountCents: 25600,
        bankAccountName: '  李师傅  ',
        bankName: '  招商银行深圳宝安支行  ',
        bankAccountNo: '  6225 8888 0000 1234  ',
      }),
    ).toEqual({
      amountCents: 25600,
      bankAccountName: '李师傅',
      bankName: '招商银行深圳宝安支行',
      bankAccountNo: '6225888800001234',
    });

    expect(() =>
      parseCreateDriverWithdrawalRequest({
        amountCents: 50,
        bankAccountName: '李师傅',
        bankName: '招商银行',
        bankAccountNo: '6225888800001234',
      }),
    ).toThrow('提现金额至少 1 元');

    expect(() =>
      parseCreateDriverWithdrawalRequest({
        amountCents: 25600,
        bankAccountName: '李师傅',
        bankName: '招商银行',
        bankAccountNo: 'abcd',
      }),
    ).toThrow('银行卡号无效');
  });
});
