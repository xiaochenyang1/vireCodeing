import type { OrderListFilter, RecentOrder } from '../types';
import { formatVehicleRequirementText } from './order';
import {
  getOrderExceptionCaseCompensationSummary,
  getOrderExceptionCaseStatusText,
} from './orderExceptionCases';

export type OrderTimeFilter = 'all' | 'today' | 'week' | 'history' | 'custom';

export type OrderCustomDateRange = {
  startDateText: string;
  endDateText: string;
};

export type CustomDateRangeDayNumbers = {
  startDayNumber: number;
  endDayNumber: number;
};

export function getFilteredOrders({
  orders,
  statusFilter,
  timeFilter,
  customDateRange,
  searchKeyword,
  now,
}: {
  orders: RecentOrder[];
  statusFilter: OrderListFilter;
  timeFilter: OrderTimeFilter;
  customDateRange: OrderCustomDateRange;
  searchKeyword: string;
  now: number;
}) {
  return filterOrdersBySearchKeyword(
    filterOrdersByStatus(orders, statusFilter).filter(order =>
      matchesOrderTimeFilter(order, timeFilter, now, customDateRange),
    ),
    searchKeyword,
  );
}

export function filterOrdersByStatus(
  orders: RecentOrder[],
  filter: OrderListFilter,
) {
  return orders.filter(order => {
    if (filter === 'all') {
      return true;
    }

    if (filter === 'waiting') {
      return order.status === 'waiting';
    }

    if (filter === 'active') {
      return order.status === 'loading' || order.status === 'transporting';
    }

    if (filter === 'confirming') {
      return order.status === 'confirming';
    }

    if (filter === 'completed') {
      return order.status === 'completed';
    }

    return order.status === 'cancelled';
  });
}

export function filterOrdersBySearchKeyword(
  orders: RecentOrder[],
  searchKeyword: string,
) {
  const normalizedSearchKeyword = searchKeyword.trim().toLowerCase();

  if (!normalizedSearchKeyword) {
    return orders;
  }

  return orders.filter(order => {
    const latestExceptionCaseSearchText = order.latestExceptionCase
      ? [
          order.latestExceptionCase.caseNo,
          getOrderExceptionCaseStatusText(order.latestExceptionCase.status),
          order.latestExceptionCase.resolutionText ?? '',
          getOrderExceptionCaseCompensationSummary(order.latestExceptionCase, {
            includeUpdatedAt: false,
          }) ?? '',
        ].join(' ')
      : '';

    return [
      order.id,
      order.from,
      order.to,
      order.cargoType,
      formatVehicleRequirementText(order),
      order.driverInfo?.driverName ?? '',
      latestExceptionCaseSearchText,
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearchKeyword);
  });
}

export function matchesOrderTimeFilter(
  order: RecentOrder,
  filter: OrderTimeFilter,
  now: number,
  customDateRange: OrderCustomDateRange,
) {
  if (filter === 'all') {
    return true;
  }

  const structuredDayNumbers = extractStructuredOrderDayNumbers(order);

  if (structuredDayNumbers.length > 0) {
    const todayDayNumber = getLocalDayNumber(new Date(now));

    if (filter === 'today') {
      return structuredDayNumbers.includes(todayDayNumber);
    }

    if (filter === 'history') {
      return !structuredDayNumbers.includes(todayDayNumber);
    }

    if (filter === 'custom') {
      const dateRange = parseCustomDateRange(customDateRange);

      if (!dateRange) {
        return true;
      }

      return structuredDayNumbers.some(
        orderDayNumber =>
          orderDayNumber >= dateRange.startDayNumber &&
          orderDayNumber <= dateRange.endDayNumber,
      );
    }

    return structuredDayNumbers.some(orderDayNumber =>
      isDayNumberInCurrentWeek(orderDayNumber, todayDayNumber),
    );
  }

  const timeText = `${order.updatedAtText} ${order.pickupTimeText ?? ''}`;
  const isToday =
    timeText.includes('今天') ||
    timeText.includes('刚刚') ||
    timeText.includes('分钟前');

  if (filter === 'today') {
    return isToday;
  }

  if (filter === 'history') {
    return !isToday;
  }

  if (filter === 'custom') {
    const dateRange = parseCustomDateRange(customDateRange);

    if (!dateRange) {
      return true;
    }

    return extractOrderDayNumbers(order, now).some(
      orderDayNumber =>
        orderDayNumber >= dateRange.startDayNumber &&
        orderDayNumber <= dateRange.endDayNumber,
    );
  }

  return !timeText.includes('上周') && !timeText.includes('上月');
}

export function validateCustomDateRange(
  customDateRange: OrderCustomDateRange,
) {
  const hasCustomInput =
    customDateRange.startDateText.trim().length > 0 ||
    customDateRange.endDateText.trim().length > 0;

  if (!hasCustomInput) {
    return '';
  }

  const dateRange = parseCustomDateRange(customDateRange);

  if (!dateRange) {
    return '自定义日期请按 YYYY-MM-DD 填写完整开始和结束日期。';
  }

  if (dateRange.startDayNumber > dateRange.endDayNumber) {
    return '开始日期不能晚于结束日期。';
  }

  return '';
}

export function parseCustomDateRange(
  customDateRange: OrderCustomDateRange,
): CustomDateRangeDayNumbers | undefined {
  const startDayNumber = parseDateInputToDayNumber(
    customDateRange.startDateText,
  );
  const endDayNumber = parseDateInputToDayNumber(customDateRange.endDateText);

  if (startDayNumber === undefined || endDayNumber === undefined) {
    return undefined;
  }

  return {
    startDayNumber,
    endDayNumber,
  };
}

export function extractOrderDayNumbers(order: RecentOrder, now: number) {
  const structuredDayNumbers = extractStructuredOrderDayNumbers(order);

  if (structuredDayNumbers.length > 0) {
    return structuredDayNumbers;
  }

  const dayNumbers = [
    ...extractDayNumbersFromText(order.updatedAtText, now),
    ...extractDayNumbersFromText(order.pickupTimeText ?? '', now),
  ];

  return Array.from(new Set(dayNumbers));
}

function extractStructuredOrderDayNumbers(order: RecentOrder) {
  const dayNumbers = [
    order.updatedAtIso,
    order.createdAtIso,
    order.pickupTimeIso,
  ]
    .map(parseIsoDateToDayNumber)
    .filter((value): value is number => value !== undefined);

  return Array.from(new Set(dayNumbers));
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

function extractDayNumbersFromText(text: string, now: number) {
  const dayNumbers: number[] = [];
  const todayDayNumber = getLocalDayNumber(new Date(now));
  const absoluteDateMatches = text.match(/\d{4}-\d{2}-\d{2}/g) ?? [];

  absoluteDateMatches.forEach(dateText => {
    const dayNumber = parseDateInputToDayNumber(dateText);

    if (dayNumber !== undefined) {
      dayNumbers.push(dayNumber);
    }
  });

  if (text.includes('今天') || text.includes('刚刚') || text.includes('分钟前')) {
    dayNumbers.push(todayDayNumber);
  }

  if (text.includes('明天')) {
    dayNumbers.push(todayDayNumber + 1);
  }

  if (text.includes('后天')) {
    dayNumbers.push(todayDayNumber + 2);
  }

  if (text.includes('昨天')) {
    dayNumbers.push(todayDayNumber - 1);
  }

  const daysAgoMatch = text.match(/(\d+)\s*天前/);

  if (daysAgoMatch) {
    dayNumbers.push(todayDayNumber - Number(daysAgoMatch[1]));
  }

  return dayNumbers;
}

function parseDateInputToDayNumber(dateText: string) {
  const trimmedDateText = dateText.trim();
  const match = trimmedDateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
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

function isDayNumberInCurrentWeek(dayNumber: number, todayDayNumber: number) {
  const today = new Date(todayDayNumber * 24 * 60 * 60 * 1000);
  const mondayOffset = (today.getUTCDay() + 6) % 7;
  const weekStartDayNumber = todayDayNumber - mondayOffset;
  const weekEndDayNumber = weekStartDayNumber + 6;

  return dayNumber >= weekStartDayNumber && dayNumber <= weekEndDayNumber;
}
