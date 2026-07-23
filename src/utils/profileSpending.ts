export type SpendingFilter = 'all' | 'completed' | 'active' | 'refund';
export type SpendingTimeFilter = 'all' | 'recent' | 'history';

export type ProfileSpendingRecordItem = {
  id: string;
  statusText: string;
  amountValue: number;
  timeBucket: string;
  occurredAtIso?: string;
  statusCategory?: 'completed' | 'active' | 'refund' | 'other';
  platformOrderId?: string;
  orderId?: string;
  routeText?: string;
  methodText?: string;
  paymentTimeText?: string;
  paymentStatusText?: string;
  originalPriceText?: string;
  couponTitleText?: string;
  couponDiscountText?: string;
  payablePriceText?: string;
  settlementText?: string;
  flowText?: string;
};

export type SpendingTotals = {
  completedTotal: number;
  activeTotal: number;
  refundTotal: number;
};

export function filterSpendingRecords<T extends ProfileSpendingRecordItem>(
  records: T[],
  filter: SpendingFilter,
  timeFilter: SpendingTimeFilter,
  now = Date.now(),
) {
  return records.filter(item => {
    if (
      !matchesSpendingTimeFilter(
        item.timeBucket,
        timeFilter,
        item.occurredAtIso,
        now,
      )
    ) {
      return false;
    }

    if (filter === 'completed') {
      return getSpendingStatusCategory(item) === 'completed';
    }

    if (filter === 'active') {
      return getSpendingStatusCategory(item) === 'active';
    }

    if (filter === 'refund') {
      return getSpendingStatusCategory(item) === 'refund';
    }

    return true;
  });
}

export function getSpendingTotals(
  records: ProfileSpendingRecordItem[],
): SpendingTotals {
  return records.reduce<SpendingTotals>(
    (totals, item) => {
      const statusCategory = getSpendingStatusCategory(item);

      if (statusCategory === 'completed') {
        return {
          ...totals,
          completedTotal: totals.completedTotal + item.amountValue,
        };
      }

      if (statusCategory === 'active') {
        return {
          ...totals,
          activeTotal: totals.activeTotal + item.amountValue,
        };
      }

      if (statusCategory === 'refund') {
        return {
          ...totals,
          refundTotal: totals.refundTotal + item.amountValue,
        };
      }

      return totals;
    },
    {
      completedTotal: 0,
      activeTotal: 0,
      refundTotal: 0,
    },
  );
}

function getSpendingStatusCategory(item: ProfileSpendingRecordItem) {
  if (item.statusCategory) {
    return item.statusCategory;
  }

  if (item.statusText === '已完成') {
    return 'completed';
  }

  if (
    item.statusText === '待装货' ||
    item.statusText === '运输中' ||
    item.statusText === '待确认'
  ) {
    return 'active';
  }

  if (item.statusText.includes('退款')) {
    return 'refund';
  }

  return 'other';
}

export function matchesSpendingTimeFilter(
  timeBucket: string,
  filter: SpendingTimeFilter,
  occurredAtIso?: string,
  now = Date.now(),
) {
  const occurredDayNumber = parseIsoDateToDayNumber(occurredAtIso);

  if (occurredDayNumber !== undefined) {
    const todayDayNumber = getLocalDayNumber(new Date(now));
    const isRecent = occurredDayNumber >= todayDayNumber - 30;

    if (filter === 'recent') {
      return isRecent;
    }

    if (filter === 'history') {
      return !isRecent;
    }

    return true;
  }

  if (filter === 'recent') {
    return timeBucket === 'recent';
  }

  if (filter === 'history') {
    return timeBucket === 'history';
  }

  return true;
}

function parseIsoDateToDayNumber(value?: string) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return getLocalDayNumber(date);
}

function getLocalDayNumber(date: Date) {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) /
      24 /
      60 /
      60 /
      1000,
  );
}
