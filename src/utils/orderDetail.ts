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
): OrderProgressAction | undefined {
  if (status === 'waiting') {
    return {
      label: '选择司机并进入待装货',
      nextStatus: 'loading',
      updatedAtText: '司机已接单 · 刚刚',
      description: '本地演示：模拟货主选择司机报价，订单进入待装货。',
      noticeText: '已模拟选择司机，订单进入待装货。',
    };
  }

  if (status === 'loading') {
    return {
      label: '确认装货并进入运输中',
      nextStatus: 'transporting',
      updatedAtText: '货物运输中 · 刚刚',
      description: '本地演示：模拟司机完成装货，订单进入运输中。',
      noticeText: '已模拟装货完成，订单进入运输中。',
    };
  }

  if (status === 'transporting') {
    return {
      label: '模拟送达并进入待确认',
      nextStatus: 'confirming',
      updatedAtText: '等待货主确认 · 刚刚',
      description: '本地演示：模拟司机送达卸货点，等待货主确认。',
      noticeText: '已模拟司机送达，等待货主确认。',
    };
  }

  if (status === 'confirming') {
    return {
      label: '确认送达并完成订单',
      nextStatus: 'completed',
      updatedAtText: '订单已完成 · 刚刚',
      description: '本地演示：确认送达后，订单进入已完成。',
      noticeText: '已确认送达，订单进入已完成。',
    };
  }

  return undefined;
}

export function getCancellationSettlement(
  status: RecentOrderStatus,
): CancellationSettlement {
  if (status === 'waiting') {
    return {
      feeText: '待接单取消，本地演示不产生违约费用。',
      settlementText: '无违约金',
      refundText: '无需退款',
      reviewStatusText: '系统自动通过',
      driverNoticeText: '订单尚未分配司机，无需通知',
    };
  }

  return {
    feeText: '司机已接单，本地演示提示需客服确认违约费用。',
    settlementText: '待客服确认违约金',
    refundText: '支付资金暂不变更，客服确认后更新退款状态',
    reviewStatusText: '待客服确认',
    driverNoticeText: '已生成司机取消通知，等待客服确认后同步',
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

export function createBonusOrderChange(bonusAmount: string): OrderDetailChange {
  const bonusText = formatPriceText(bonusAmount);

  return {
    changes: {
      bonusText,
      updatedAtText: '已追加赏金 · 刚刚',
    },
    noticeText: `已追加赏金 ${bonusText}，待接单订单曝光权重本地提升。`,
  };
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
): OrderDetailChange {
  return {
    changes: {
      modificationRequest: {
        description,
        statusText: '待客服确认',
        impactText: '司机已接单，本地演示需客服确认司机通知、费用和退款影响。',
        costImpactText: '待客服重新核算费用，当前订单金额暂不变更。',
        refundText: '支付资金暂不变更，审核通过后再同步差额。',
        driverNoticeText: '已生成司机修改确认通知，等待客服确认后同步。',
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
