import { evaluationRecordItems } from '../data/mockData';
import type {
  PlatformProfileEvaluationSnapshot,
  PlatformProfileReceivedEvaluationSnapshot,
} from '../services/platformProfileApi';
import type { RecentOrder } from '../types';

export type ProfileEvaluationRecordItem =
  (typeof evaluationRecordItems)[number];

export type EvaluationFilter = 'all' | 'high' | 'lower';

export function filterEvaluationRecords<T extends ProfileEvaluationRecordItem>(
  records: T[],
  filter: EvaluationFilter,
) {
  return records.filter(item => {
    if (filter === 'high') {
      return item.ratingText === '5 星';
    }

    if (filter === 'lower') {
      return item.ratingText !== '5 星';
    }

    return true;
  });
}

export function createEvaluationRecords(
  orders: RecentOrder[],
): ProfileEvaluationRecordItem[] {
  const localRecords = orders
    .filter(order => order.evaluation)
    .map(order => ({
      id: `evaluation-local-${order.id}`,
      orderId: order.id,
      driverName: order.evaluation?.anonymous
        ? '匿名评价'
        : order.driverInfo?.driverName ?? '未知司机',
      ratingText: `${order.evaluation?.rating ?? 0} 星`,
      content: order.evaluation?.content ?? '',
      photoText: order.evaluation?.photoCount
        ? `图片凭证 ${order.evaluation.photoCount} 张`
        : '',
      timeText: '刚刚提交',
      driverReplyText: '',
      driverReplyTimeText: '',
    }));

  return [...localRecords, ...evaluationRecordItems];
}

export function createLocalEvaluationRecordsFromPlatformSnapshot(
  snapshot: PlatformProfileEvaluationSnapshot,
): ProfileEvaluationRecordItem[] {
  return snapshot.items.map(item => ({
    id: `evaluation-platform-${item.id}`,
    orderId: item.orderNo,
    driverName: item.anonymous ? '匿名评价' : item.driverName,
    ratingText: `${item.rating} 星`,
    content: item.content,
    photoText:
      item.photoCount > 0 ? `图片凭证 ${item.photoCount} 张` : '',
    timeText: `平台提交：${formatIsoMinute(item.submittedAtIso)}`,
    driverReplyText: item.driverReplyText ?? '',
    driverReplyTimeText: item.driverReplyAtIso
      ? formatIsoMinute(item.driverReplyAtIso)
      : '',
  }));
}

export function createLocalReceivedEvaluationRecordsFromPlatformSnapshot(
  snapshot: PlatformProfileReceivedEvaluationSnapshot,
): ProfileEvaluationRecordItem[] {
  return snapshot.items.map(item => ({
    id: `received-evaluation-platform-${item.id}`,
    orderId: item.orderNo,
    driverName: item.anonymous ? '匿名司机评价' : item.driverName,
    ratingText: `${item.rating} 星`,
    content: item.content,
    photoText: '',
    timeText: `司机评价：${formatIsoMinute(item.submittedAtIso)}`,
    driverReplyText: '',
    driverReplyTimeText: '',
  }));
}

function formatIsoMinute(isoText: string) {
  return isoText.slice(0, 16).replace('T', ' ');
}
