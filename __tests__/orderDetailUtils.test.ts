import {
  buildDetailTimeline,
  createBonusOrderChange,
  createCancellationOrderChange,
  createChangeRequestOrderChange,
  createChangeRequestReviewOrderChange,
  createEvaluationOrderChange,
  createDriverQuoteOrderChange,
  createEvaluationNotice,
  createExceptionReportOrderChange,
  createExceptionReportResolutionOrderChange,
  getCancellationSettlement,
  getOrderPrimaryActionLabel,
  getOrderProgressAction,
  getOrderSecondaryActionLabel,
} from '../src/utils/orderDetail';
import type { DriverQuote, RecentOrder, RecentOrderStatus } from '../src/types';

function createOrder(overrides: Partial<RecentOrder> = {}): RecentOrder {
  return {
    id: 'HY202607090001',
    status: 'waiting',
    from: '沈阳',
    to: '大连',
    cargoType: '建材',
    weightText: '2 吨',
    vehicleRequirement: '中型货车',
    priceText: '¥860',
    updatedAtText: '刚刚',
    ...overrides,
  };
}

test('returns local progress action metadata for active order statuses', () => {
  expect(getOrderProgressAction('waiting')).toEqual({
    label: '选择司机并进入待装货',
    nextStatus: 'loading',
    updatedAtText: '司机已接单 · 刚刚',
    description: '本地演示：模拟货主选择司机报价，订单进入待装货。',
    noticeText: '已模拟选择司机，订单进入待装货。',
  });

  expect(getOrderProgressAction('confirming')).toEqual({
    label: '确认送达并完成订单',
    nextStatus: 'completed',
    updatedAtText: '订单已完成 · 刚刚',
    description: '本地演示：确认送达后，订单进入已完成。',
    noticeText: '已确认送达，订单进入已完成。',
  });
});

test('returns platform progress action metadata for synced platform orders', () => {
  // Platform waiting orders must use accept-quote / driver-accept instead of
  // the generic waiting → loading status advance action.
  expect(getOrderProgressAction('waiting', true)).toBeUndefined();

  expect(getOrderProgressAction('confirming', true)).toEqual({
    label: '确认送达并完成平台订单',
    nextStatus: 'completed',
    updatedAtText: '订单已完成 · 刚刚',
    description: '当前订单已接平台确认送达接口，点击后会把完成态提交到平台。',
    noticeText: '已提交平台确认送达请求，订单进入已完成。',
  });
});

test('does not create local progress actions for terminal statuses', () => {
  expect(getOrderProgressAction('completed')).toBeUndefined();
  expect(getOrderProgressAction('cancelled')).toBeUndefined();
});

test('returns waiting cancellation settlement without a local penalty', () => {
  expect(getCancellationSettlement('waiting')).toEqual({
    feeText: '待接单取消，本地演示不产生违约费用。',
    settlementText: '无违约金',
    refundText: '无需退款',
    reviewStatusText: '系统自动通过',
    driverNoticeText: '订单尚未分配司机，无需通知',
  });
});

test('returns assigned cancellation settlement for driver-involved orders', () => {
  expect(getCancellationSettlement('loading')).toEqual({
    feeText: '司机已接单，本地演示提示需客服确认违约费用。',
    settlementText: '待客服确认违约金',
    refundText: '支付资金暂不变更，客服确认后更新退款状态',
    reviewStatusText: '待客服确认',
    driverNoticeText: '已生成司机取消通知，等待客服确认后同步',
  });
});

test('returns platform cancellation settlement copy for platform orders', () => {
  expect(getCancellationSettlement('waiting', true)).toEqual({
    feeText: '待接单取消已提交平台，当前不产生违约费用。',
    settlementText: '无违约金',
    refundText: '无需退款',
    reviewStatusText: '系统自动通过',
    driverNoticeText: '订单尚未分配司机，无需通知',
  });

  expect(getCancellationSettlement('loading', true)).toEqual({
    feeText: '司机已接单，平台取消已提交，违约费用待客服确认。',
    settlementText: '待平台客服确认违约金',
    refundText: '支付资金暂不变更，平台客服确认后更新退款状态',
    reviewStatusText: '待客服确认',
    driverNoticeText: '已生成平台司机取消通知，等待客服确认后同步',
  });

  expect(getCancellationSettlement('loading', true, 10000)).toEqual({
    feeText: '司机已接单，平台按规则收取违约金 ￥10（10%）。',
    settlementText: '违约金 ￥10',
    refundText: '可退 ￥90，平台将进入退款处理',
    reviewStatusText: '系统规则已核算',
    driverNoticeText: '已生成平台司机取消通知，按规则同步违约结果',
  });
});

test('creates auto-reviewed cancellation timing for waiting orders', () => {
  expect(
    createCancellationOrderChange(
      {
        reasonText: '计划有变',
        description: '客户临时调整发货计划',
      },
      'waiting',
      false,
      undefined,
      '2026-07-15T08:00:00.000Z',
    ),
  ).toEqual({
    changes: {
      status: 'cancelled',
      updatedAtText: '已取消 · 刚刚',
      cancellation: {
        reasonText: '计划有变',
        description: '客户临时调整发货计划',
        submittedAtIso: '2026-07-15T08:00:00.000Z',
        submittedAtText: '2026-07-15 16:00',
        reviewedAtIso: '2026-07-15T08:00:00.000Z',
        reviewedAtText: '2026-07-15 16:00',
        feeText: '待接单取消，本地演示不产生违约费用。',
        settlementText: '无违约金',
        refundText: '无需退款',
        reviewStatusText: '系统自动通过',
        driverNoticeText: '订单尚未分配司机，无需通知',
      },
    },
    noticeText: '订单已取消：计划有变',
  });
});

test('creates pending-review cancellation timing for assigned orders', () => {
  expect(
    createCancellationOrderChange(
      {
        reasonText: '计划有变',
        description: '司机接单后客户取消运输',
      },
      'loading',
      false,
      undefined,
      '2026-07-15T08:00:00.000Z',
    ),
  ).toEqual({
    changes: {
      status: 'cancelled',
      updatedAtText: '已取消 · 刚刚',
      cancellation: {
        reasonText: '计划有变',
        description: '司机接单后客户取消运输',
        submittedAtIso: '2026-07-15T08:00:00.000Z',
        submittedAtText: '2026-07-15 16:00',
        feeText: '司机已接单，本地演示提示需客服确认违约费用。',
        settlementText: '待客服确认违约金',
        refundText: '支付资金暂不变更，客服确认后更新退款状态',
        reviewStatusText: '待客服确认',
        driverNoticeText: '已生成司机取消通知，等待客服确认后同步',
      },
    },
    noticeText: '订单已取消：计划有变',
  });
});

test('creates order change and notice for selecting a driver quote', () => {
  const quote: DriverQuote = {
    driverId: 'D1001',
    driverName: '张师傅',
    driverPhone: '13800000001',
    ratingText: '4.9 分',
    vehicleText: '4.2 米厢货',
    plateNumber: '辽A12345',
    completedOrdersText: '已完成 312 单',
    quoteText: '¥860',
    arrivalText: '预计 20 分钟到达',
    noteText: '可协助搬运',
  };

  expect(
    createDriverQuoteOrderChange(quote, '2026-07-15T08:00:00.000Z'),
  ).toEqual({
    changes: {
      status: 'loading',
      priceText: '¥860',
      driverInfo: {
        driverId: 'D1001',
        driverName: '张师傅',
        driverPhone: '13800000001',
        ratingText: '4.9 分',
        vehicleText: '4.2 米厢货',
        plateNumber: '辽A12345',
        completedOrdersText: '已完成 312 单',
        acceptedAtIso: '2026-07-15T08:00:00.000Z',
        acceptedAtText: '2026-07-15 16:00',
      },
      updatedAtText: '司机已接单 · 刚刚',
    },
    noticeText: '张师傅 已接单，预计 20 分钟到达。可协助搬运',
  });
});

test('creates bonus order change and local notice', () => {
  expect(createBonusOrderChange('50')).toEqual({
    changes: {
      bonusText: '￥50',
      updatedAtText: '已追加赏金 · 刚刚',
    },
    noticeText: '已追加赏金 ￥50，待接单订单曝光权重本地提升。',
  });
});

test('accumulates an existing bonus when appending another local bonus', () => {
  expect(createBonusOrderChange('50', '￥20')).toEqual({
    changes: {
      bonusText: '￥70',
      updatedAtText: '已追加赏金 · 刚刚',
    },
    noticeText: '已追加赏金 ￥50，当前总赏金 ￥70，待接单订单曝光权重本地提升。',
  });
});

test('creates exception report change with optional photo notice', () => {
  expect(
    createExceptionReportOrderChange({
      typeLabel: '货损',
      description: '外包装破损需要客服跟进',
      photoCount: 2,
    }, '2026-07-15T08:00:00.000Z'),
  ).toEqual({
    changes: {
      exceptionReport: {
        typeLabel: '货损',
        description: '外包装破损需要客服跟进',
        photoCount: 2,
        statusText: '待客服跟进',
        submittedAtIso: '2026-07-15T08:00:00.000Z',
        submittedAtText: '2026-07-15 16:00',
      },
    },
    noticeText: '异常已提交：货损 · 图片凭证 2 张 · 外包装破损需要客服跟进',
  });
});

test('creates exception report resolution metadata with handled timing', () => {
  expect(
    createExceptionReportResolutionOrderChange(
      {
        typeLabel: '货损',
        description: '外包装破损需要客服跟进',
        statusText: '待客服跟进',
        submittedAtIso: '2026-07-15T08:00:00.000Z',
        submittedAtText: '2026-07-15 16:00',
      },
      '2026-07-15T09:30:00.000Z',
    ),
  ).toEqual({
    changes: {
      exceptionReport: {
        typeLabel: '货损',
        description: '外包装破损需要客服跟进',
        statusText: '已处理',
        submittedAtIso: '2026-07-15T08:00:00.000Z',
        submittedAtText: '2026-07-15 16:00',
        resolvedAtIso: '2026-07-15T09:30:00.000Z',
        resolvedAtText: '2026-07-15 17:30',
      },
    },
    noticeText: '异常处理状态已更新：已处理',
  });
});

test('creates non-waiting change request metadata and notice', () => {
  expect(
    createChangeRequestOrderChange(
      '卸货地址改到二号门',
      false,
      '2026-07-15T08:00:00.000Z',
    ),
  ).toEqual({
    changes: {
      modificationRequest: {
        description: '卸货地址改到二号门',
        statusText: '待客服确认',
        submittedAtIso: '2026-07-15T08:00:00.000Z',
        submittedAtText: '2026-07-15 16:00',
        impactText: '司机已接单，本地演示需客服确认司机通知、费用和退款影响。',
        costImpactText: '待客服重新核算费用，当前订单金额暂不变更。',
        refundText: '支付资金暂不变更，审核通过后再同步差额。',
        driverNoticeText: '已生成司机修改确认通知，等待客服确认后同步。',
      },
    },
    noticeText: '修改申请已提交：卸货地址改到二号门',
  });
});

test('creates platform change request metadata with platform-specific guidance', () => {
  expect(
    createChangeRequestOrderChange(
      '卸货地址改到二号门',
      true,
      '2026-07-15T08:00:00.000Z',
    ),
  ).toEqual({
    changes: {
      modificationRequest: {
        description: '卸货地址改到二号门',
        statusText: '待客服确认',
        submittedAtIso: '2026-07-15T08:00:00.000Z',
        submittedAtText: '2026-07-15 16:00',
        impactText:
          '司机已接单，当前订单已进入平台修改申请流程，客服将确认司机通知、费用和退款影响。',
        costImpactText: '待平台重新核算费用，当前订单金额暂不变更。',
        refundText: '支付资金暂不变更，平台审核通过后再同步差额。',
        driverNoticeText: '已生成平台修改确认通知，等待客服确认后同步。',
      },
    },
    noticeText: '修改申请已提交：卸货地址改到二号门',
  });
});

test('creates local change request review metadata with review timing', () => {
  expect(
    createChangeRequestReviewOrderChange(
      {
        description: '卸货地址改到二号门',
        statusText: '待客服确认',
        submittedAtIso: '2026-07-15T08:00:00.000Z',
        submittedAtText: '2026-07-15 16:00',
        impactText: '司机已接单，本地演示需客服确认司机通知、费用和退款影响。',
      },
      '已确认',
      '客服已确认修改申请，司机通知已同步。',
      '2026-07-15T09:30:00.000Z',
    ),
  ).toEqual({
    changes: {
      modificationRequest: {
        description: '卸货地址改到二号门',
        statusText: '已确认',
        submittedAtIso: '2026-07-15T08:00:00.000Z',
        submittedAtText: '2026-07-15 16:00',
        reviewedAtIso: '2026-07-15T09:30:00.000Z',
        reviewedAtText: '2026-07-15 17:30',
        impactText: '司机已接单，本地演示需客服确认司机通知、费用和退款影响。',
        reviewResultText: '客服已确认修改申请，司机通知已同步。',
      },
    },
    noticeText: '客服已确认修改申请，司机通知已同步。',
  });
});

test('formats evaluation notice with anonymous flag and photo vouchers', () => {
  expect(
    createEvaluationNotice({
      rating: 5,
      tags: ['准时', '服务好'],
      content: '司机沟通顺畅，送达很及时',
      anonymous: true,
      photoCount: 1,
    }),
  ).toBe('评价已提交：5 星 · 准时、服务好 · 匿名评价 · 图片凭证 1 张 · 司机沟通顺畅，送达很及时');
});

test('creates evaluation change with submitted timing', () => {
  expect(
    createEvaluationOrderChange(
      {
        rating: 5,
        tags: ['准时', '服务好'],
        content: '司机沟通顺畅，送达很及时',
        anonymous: true,
        photoCount: 1,
      },
      '2026-07-15T08:00:00.000Z',
    ),
  ).toEqual({
    changes: {
      evaluation: {
        rating: 5,
        tags: ['准时', '服务好'],
        content: '司机沟通顺畅，送达很及时',
        anonymous: true,
        submittedAtIso: '2026-07-15T08:00:00.000Z',
        submittedAtText: '2026-07-15 16:00',
        photoCount: 1,
      },
    },
    noticeText:
      '评价已提交：5 星 · 准时、服务好 · 匿名评价 · 图片凭证 1 张 · 司机沟通顺畅，送达很及时',
  });
});

test('derives the primary action label from order status', () => {
  const cases: Array<[RecentOrderStatus, string]> = [
    ['waiting', '查看报价'],
    ['loading', '联系司机'],
    ['transporting', '查看位置'],
    ['confirming', '确认送达'],
  ];

  cases.forEach(([status, label]) => {
    expect(getOrderPrimaryActionLabel(createOrder({ status }))).toBe(label);
  });

  expect(getOrderPrimaryActionLabel(createOrder({ status: 'completed' }))).toBe(
    '评价司机',
  );
  expect(
    getOrderPrimaryActionLabel(
      createOrder({
        status: 'completed',
        evaluation: { rating: 5, tags: ['准时'], content: '很好' },
      }),
    ),
  ).toBe('查看评价');
});

test('derives the secondary action label from order status', () => {
  const cases: Array<[RecentOrderStatus, string]> = [
    ['waiting', '取消订单'],
    ['loading', '取消订单'],
    ['transporting', '上报异常'],
    ['confirming', '上报异常'],
    ['completed', '重新下单'],
    ['cancelled', '重新下单'],
  ];

  cases.forEach(([status, label]) => {
    expect(getOrderSecondaryActionLabel(createOrder({ status }))).toBe(label);
  });
});

test('builds an active timeline up to the current status label', () => {
  expect(buildDetailTimeline('运输中')).toEqual([
    { label: '待接单', active: true },
    { label: '待装货', active: true },
    { label: '运输中', active: true },
    { label: '待确认', active: false },
    { label: '已完成', active: false },
  ]);
});

test('marks no timeline steps active for labels outside the flow', () => {
  expect(buildDetailTimeline('已取消')).toEqual([
    { label: '待接单', active: false },
    { label: '待装货', active: false },
    { label: '运输中', active: false },
    { label: '待确认', active: false },
    { label: '已完成', active: false },
  ]);
});
