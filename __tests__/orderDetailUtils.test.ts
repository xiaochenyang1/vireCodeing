import {
  createBonusOrderChange,
  createChangeRequestOrderChange,
  createDriverQuoteOrderChange,
  createEvaluationNotice,
  createExceptionReportOrderChange,
  getCancellationSettlement,
  getOrderProgressAction,
} from '../src/utils/orderDetail';
import type { DriverQuote } from '../src/types';

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

  expect(createDriverQuoteOrderChange(quote)).toEqual({
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

test('creates exception report change with optional photo notice', () => {
  expect(
    createExceptionReportOrderChange({
      typeLabel: '货损',
      description: '外包装破损需要客服跟进',
      photoCount: 2,
    }),
  ).toEqual({
    changes: {
      exceptionReport: {
        typeLabel: '货损',
        description: '外包装破损需要客服跟进',
        photoCount: 2,
        statusText: '待客服跟进',
      },
    },
    noticeText: '异常已提交：货损 · 图片凭证 2 张 · 外包装破损需要客服跟进',
  });
});

test('creates non-waiting change request metadata and notice', () => {
  expect(createChangeRequestOrderChange('卸货地址改到二号门')).toEqual({
    changes: {
      modificationRequest: {
        description: '卸货地址改到二号门',
        statusText: '待客服确认',
        impactText: '司机已接单，本地演示需客服确认司机通知、费用和退款影响。',
        costImpactText: '待客服重新核算费用，当前订单金额暂不变更。',
        refundText: '支付资金暂不变更，审核通过后再同步差额。',
        driverNoticeText: '已生成司机修改确认通知，等待客服确认后同步。',
      },
    },
    noticeText: '修改申请已提交：卸货地址改到二号门',
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
