import type { PlatformSupportTicket } from '../services/platformSupportTicketsApi';
import type { SupportTicket } from '../types';
import { isLocalSupportTicketId, sortSupportTickets } from './homeSupport';

export function mapPlatformSupportTicketsToLocal(
  items: PlatformSupportTicket[],
  now: Date = new Date(),
): SupportTicket[] {
  return sortSupportTickets(
    items.map(item => mapPlatformSupportTicketToLocal(item, now)),
  );
}

export function mapPlatformSupportTicketToLocal(
  item: PlatformSupportTicket,
  now: Date = new Date(),
): SupportTicket {
  return {
    id: item.id,
    channelName: item.channelName,
    description: item.description,
    statusText: mapPlatformSupportTicketStatus(item.status),
    slaText: mapPlatformSupportTicketSla(item.sla),
    createdAtText: formatSupportTicketTimestamp(item.createdAtIso, now, true),
    createdAtIso: item.createdAtIso,
    updatedAtText: formatSupportTicketTimestamp(item.updatedAtIso, now),
    updatedAtIso: item.updatedAtIso,
    statusHistory: item.statusHistory.map(historyItem => ({
      actionText: historyItem.actionText,
      timestampText: formatSupportTicketTimestamp(
        historyItem.timestampIso,
        now,
        historyItem.actionText === '工单已提交',
      ),
      timestampIso: historyItem.timestampIso,
    })),
  };
}

export function inferSupportTicketMode(
  supportTickets: SupportTicket[],
): 'local' | 'platform' {
  return supportTickets.some(ticket => !isLocalSupportTicketId(ticket.id))
    ? 'platform'
    : 'local';
}

export function mergeSupportTicketsWithLocalFallback(
  platformTickets: SupportTicket[],
  currentSupportTickets: SupportTicket[],
): SupportTicket[] {
  return sortSupportTickets([
    ...platformTickets,
    ...currentSupportTickets.filter(ticket => isLocalSupportTicketId(ticket.id)),
  ]);
}

function mapPlatformSupportTicketStatus(
  status: PlatformSupportTicket['status'],
): SupportTicket['statusText'] {
  const statusTextMap: Record<
    PlatformSupportTicket['status'],
    SupportTicket['statusText']
  > = {
    pending: '待客服跟进',
    processing: '客服已受理',
    resolved: '已处理',
  };

  return statusTextMap[status];
}

function mapPlatformSupportTicketSla(sla?: PlatformSupportTicket['sla']) {
  if (!sla) {
    return undefined;
  }

  const stageText = sla.stage === 'first_response' ? '首响 SLA' : '解决 SLA';

  if (typeof sla.overdueMinutes === 'number') {
    return `${stageText} 已超时 ${sla.overdueMinutes} 分钟`;
  }

  if (typeof sla.remainingMinutes === 'number') {
    if (sla.status === 'resolved_within_target') {
      return `${stageText} 提前 ${sla.remainingMinutes} 分钟完成`;
    }

    return `${stageText} 剩余 ${sla.remainingMinutes} 分钟`;
  }

  if (sla.status === 'resolved_overdue') {
    return `${stageText} 超时完成`;
  }

  return `${stageText} ${sla.status}`;
}

function formatSupportTicketTimestamp(
  iso: string,
  now: Date,
  submitted = false,
) {
  const timestamp = Date.parse(iso);

  if (Number.isNaN(timestamp)) {
    return submitted ? '刚刚提交' : '刚刚';
  }

  const diffMs = Math.max(0, now.getTime() - timestamp);

  if (diffMs < 60_000) {
    return submitted ? '刚刚提交' : '刚刚';
  }

  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} 小时前`;
  }

  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${month}-${day} ${hour}:${minute}`;
}
