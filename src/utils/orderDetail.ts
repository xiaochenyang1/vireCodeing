import type {
  DriverQuote,
  FileAttachmentRef,
  RecentOrder,
  RecentOrderStatus,
} from '../types';
import { formatPriceText } from './order';

export type OrderProgressAction = {
  label: string;
  nextStatus: RecentOrderStatus;
  updatedAtText: string;
  description: string;
  noticeText: string;
};

export type CancellationSettlement = {
  feeText: string;
  settlementText: string;
  refundText: string;
  reviewStatusText: string;
  driverNoticeText: string;
};

export type OrderDetailChange = {
  changes: Partial<RecentOrder>;
  noticeText: string;
};

export function getOrderProgressAction(
  status: RecentOrderStatus,
  usesPlatformOrderActions = false,
): OrderProgressAction | undefined {
  if (status === 'waiting') {
    return {
      label: usesPlatformOrderActions
        ? '推进平台订单进入待装货'
        : '选择司机并进入待装货',
      nextStatus: 'loading',
      updatedAtText: '司机已接单 · 刚刚',
      description: usesPlatformOrderActions
        ? '当前订单已接平台状态推进接口，点击后会把订单推进到待装货；真实司机接单仍待后续闭环。'
        : '本地演示：模拟货主选择司机报价，订单进入待装货。',
      noticeText: usesPlatformOrderActions
        ? '已提交平台状态推进请求，订单进入待装货。'
        : '已模拟选择司机，订单进入待装货。',
    };
  }

  if (status === 'loading') {
    return {
      label: usesPlatformOrderActions
        ? '推进平台订单进入运输中'
        : '确认装货并进入运输中',
      nextStatus: 'transporting',
      updatedAtText: '货物运输中 · 刚刚',
      description: usesPlatformOrderActions
        ? '当前订单已接平台状态推进接口，点击后会把订单推进到运输中；装货确认仍待后续闭环。'
        : '本地演示：模拟司机完成装货，订单进入运输中。',
      noticeText: usesPlatformOrderActions
        ? '已提交平台状态推进请求，订单进入运输中。'
        : '已模拟装货完成，订单进入运输中。',
    };
  }

  if (status === 'transporting') {
    return {
      label: usesPlatformOrderActions
        ? '推进平台订单进入待确认'
        : '模拟送达并进入待确认',
      nextStatus: 'confirming',
      updatedAtText: '等待货主确认 · 刚刚',
      description: usesPlatformOrderActions
        ? '当前订单已接平台状态推进接口，点击后会把订单推进到待确认；实时送达确认仍待后续闭环。'
        : '本地演示：模拟司机送达卸货点，等待货主确认。',
      noticeText: usesPlatformOrderActions
        ? '已提交平台状态推进请求，订单进入待确认。'
        : '已模拟司机送达，等待货主确认。',
    };
  }

  if (status === 'confirming') {
    return {
      label: usesPlatformOrderActions
        ? '确认送达并完成平台订单'
        : '确认送达并完成订单',
      nextStatus: 'completed',
      updatedAtText: '订单已完成 · 刚刚',
      description: usesPlatformOrderActions
        ? '当前订单已接平台确认送达接口，点击后会把完成态提交到平台。'
        : '本地演示：确认送达后，订单进入已完成。',
      noticeText: usesPlatformOrderActions
        ? '已提交平台确认送达请求，订单进入已完成。'
        : '已确认送达，订单进入已完成。',
    };
  }

  return undefined;
}

export function getCancellationSettlement(
  status: RecentOrderStatus,
  usesPlatformCancellation = false,
): CancellationSettlement {
  if (status === 'waiting') {
    return {
      feeText: usesPlatformCancellation
        ? '待接单取消已提交平台，当前不产生违约费用。'
        : '待接单取消，本地演示不产生违约费用。',
      settlementText: '无违约金',
      refundText: '无需退款',
      reviewStatusText: '系统自动通过',
      driverNoticeText: '订单尚未分配司机，无需通知',
    };
  }

  return {
    feeText: usesPlatformCancellation
      ? '司机已接单，平台取消已提交，违约费用待客服确认。'
      : '司机已接单，本地演示提示需客服确认违约费用。',
    settlementText: usesPlatformCancellation
      ? '待平台客服确认违约金'
      : '待客服确认违约金',
    refundText: usesPlatformCancellation
      ? '支付资金暂不变更，平台客服确认后更新退款状态'
      : '支付资金暂不变更，客服确认后更新退款状态',
    reviewStatusText: '待客服确认',
    driverNoticeText: usesPlatformCancellation
      ? '已生成平台司机取消通知，等待客服确认后同步'
      : '已生成司机取消通知，等待客服确认后同步',
  };
}

export function createDriverQuoteOrderChange(
  quote: DriverQuote,
): OrderDetailChange {
  const { quoteText, arrivalText, noteText, ...driverInfo } = quote;

  return {
    changes: {
      status: 'loading',
      priceText: quoteText,
      driverInfo,
      updatedAtText: '司机已接单 · 刚刚',
    },
    noticeText: `${driverInfo.driverName} 已接单，${arrivalText}。${noteText}`,
  };
}

export function createBonusOrderChange(
  bonusAmount: string,
  currentBonusText?: string,
): OrderDetailChange {
  const bonusText = getAccumulatedBonusText(currentBonusText, bonusAmount);
  const addedBonusText = formatPriceText(bonusAmount);
  const hasExistingBonus = getBonusAmountValue(currentBonusText) > 0;

  return {
    changes: {
      bonusText,
      updatedAtText: '已追加赏金 · 刚刚',
    },
    noticeText: hasExistingBonus
      ? `已追加赏金 ${addedBonusText}，当前总赏金 ${bonusText}，待接单订单曝光权重本地提升。`
      : `已追加赏金 ${bonusText}，待接单订单曝光权重本地提升。`,
  };
}

export function getBonusAmountValue(bonusText?: string) {
  const normalized = (bonusText ?? '').trim().replace(/[^\d.]/g, '');
  const amountValue = Number(normalized);

  if (!normalized || Number.isNaN(amountValue)) {
    return 0;
  }

  return amountValue;
}

export function getAccumulatedBonusText(
  currentBonusText: string | undefined,
  bonusAmount: string,
) {
  return formatPriceText(
    `${getBonusAmountValue(currentBonusText) + getBonusAmountValue(bonusAmount)}`,
  );
}

export function createExceptionReportOrderChange(report: {
  typeLabel: string;
  description: string;
  photoCount?: number;
  photoFiles?: FileAttachmentRef[];
}): OrderDetailChange {
  return {
    changes: {
      exceptionReport: {
        ...report,
        statusText: '待客服跟进',
      },
    },
    noticeText: `异常已提交：${report.typeLabel} · ${
      report.photoCount ? `图片凭证 ${report.photoCount} 张 · ` : ''
    }${report.description}`,
  };
}

export function createChangeRequestOrderChange(
  description: string,
  usesPlatformChangeRequest = false,
): OrderDetailChange {
  return {
    changes: {
      modificationRequest: {
        description,
        statusText: '待客服确认',
        impactText: usesPlatformChangeRequest
          ? '司机已接单，当前订单已进入平台修改申请流程，客服将确认司机通知、费用和退款影响。'
          : '司机已接单，本地演示需客服确认司机通知、费用和退款影响。',
        costImpactText: usesPlatformChangeRequest
          ? '待平台重新核算费用，当前订单金额暂不变更。'
          : '待客服重新核算费用，当前订单金额暂不变更。',
        refundText: usesPlatformChangeRequest
          ? '支付资金暂不变更，平台审核通过后再同步差额。'
          : '支付资金暂不变更，审核通过后再同步差额。',
        driverNoticeText: usesPlatformChangeRequest
          ? '已生成平台修改确认通知，等待客服确认后同步。'
          : '已生成司机修改确认通知，等待客服确认后同步。',
      },
    },
    noticeText: `修改申请已提交：${description}`,
  };
}

export function createEvaluationNotice(evaluation: {
  rating: number;
  tags: string[];
  content: string;
  anonymous?: boolean;
  photoCount?: number;
}) {
  return `评价已提交：${evaluation.rating} 星 · ${evaluation.tags.join('、')} · ${
    evaluation.anonymous ? '匿名评价 · ' : ''
  }${
    evaluation.photoCount ? `图片凭证 ${evaluation.photoCount} 张 · ` : ''
  }${evaluation.content}`;
}

export function getOrderPrimaryActionLabel(order: RecentOrder): string {
  switch (order.status) {
    case 'waiting':
      return '查看报价';
    case 'loading':
      return '联系司机';
    case 'transporting':
      return '查看位置';
    case 'confirming':
      return '确认送达';
    default:
      return order.evaluation ? '查看评价' : '评价司机';
  }
}

export function getOrderSecondaryActionLabel(order: RecentOrder): string {
  switch (order.status) {
    case 'waiting':
    case 'loading':
      return '取消订单';
    case 'transporting':
    case 'confirming':
      return '上报异常';
    default:
      return '重新下单';
  }
}

export const ORDER_DETAIL_TIMELINE_STEPS = [
  '待接单',
  '待装货',
  '运输中',
  '待确认',
  '已完成',
] as const;

export type OrderDetailTimelineStep = {
  label: string;
  active: boolean;
};

export function buildDetailTimeline(
  currentStatusLabel: string,
): OrderDetailTimelineStep[] {
  const currentIndex = ORDER_DETAIL_TIMELINE_STEPS.indexOf(
    currentStatusLabel as (typeof ORDER_DETAIL_TIMELINE_STEPS)[number],
  );

  return ORDER_DETAIL_TIMELINE_STEPS.map(label => ({
    label,
    active:
      label === currentStatusLabel ||
      ORDER_DETAIL_TIMELINE_STEPS.indexOf(label) <= currentIndex,
  }));
}
