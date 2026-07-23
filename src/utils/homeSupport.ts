import type { SupportTicket, SupportTicketStatusHistoryItem } from '../types';

export type SupportTicketDraft = Pick<
  SupportTicket,
  'channelName' | 'description'
>;

export type SupportTicketChange = {
  supportTickets: SupportTicket[];
};

const localSupportTicketIdPrefix = 'support-ticket-';

export function getMessageOrderId(
  content: string,
  options?: { orderNo?: string; platformOrderId?: string },
) {
  if (options?.platformOrderId) {
    return options.platformOrderId;
  }
  if (options?.orderNo) {
    return options.orderNo;
  }
  return content.match(/HY\d{11}/)?.[0];
}

export function isLocalSupportTicketId(ticketId: string) {
  return ticketId.startsWith(localSupportTicketIdPrefix);
}

export function createLocalSupportTicket({
  currentTicketCount,
  channelName,
  description,
  now = Date.now(),
}: {
  currentTicketCount: number;
  channelName: string;
  description: string;
  now?: number;
}): SupportTicket {
  return createSupportTicket(
    `support-ticket-${currentTicketCount + 1}`,
    {
      channelName,
      description,
    },
    now,
  );
}

export function appendSupportTicketStatus(
  supportTickets: SupportTicket[],
  ticketId: string,
  statusText: string,
  historyItem: SupportTicketStatusHistoryItem,
) {
  return supportTickets.map(ticket =>
    ticket.id === ticketId
      ? {
          ...ticket,
          statusText,
          statusHistory: [...(ticket.statusHistory ?? []), historyItem],
        }
      : ticket,
  );
}

export function createAddSupportTicketChange(
  supportTickets: SupportTicket[],
  ticketDraft: SupportTicketDraft,
  now = Date.now(),
): SupportTicketChange {
  const ticket = createSupportTicket(
    createNextLocalSupportTicketId(supportTickets),
    ticketDraft,
    now,
  );

  return {
    supportTickets: [ticket, ...supportTickets],
  };
}

export function createUpdateSupportTicketStatusChange(
  supportTickets: SupportTicket[],
  ticketId: string,
  statusText: string,
  historyItem: SupportTicketStatusHistoryItem,
  now = Date.now(),
): SupportTicketChange {
  const historyItemWithTimestampIso: SupportTicketStatusHistoryItem = {
    ...historyItem,
    timestampIso: historyItem.timestampIso ?? new Date(now).toISOString(),
  };

  return {
    supportTickets: appendSupportTicketStatus(
      supportTickets,
      ticketId,
      statusText,
      historyItemWithTimestampIso,
    ),
  };
}

function createSupportTicket(
  id: string,
  { channelName, description }: SupportTicketDraft,
  now = Date.now(),
): SupportTicket {
  const createdAtIso = new Date(now).toISOString();

  return {
    id,
    channelName,
    description,
    statusText: '待客服跟进',
    createdAtText: '刚刚提交',
    createdAtIso,
    statusHistory: [
      {
        actionText: '工单已提交',
        timestampText: '刚刚提交',
        timestampIso: createdAtIso,
      },
    ],
  };
}

function createNextLocalSupportTicketId(supportTickets: SupportTicket[]) {
  const localIndexes = supportTickets
    .map(ticket => ticket.id.match(/^support-ticket-(\d+)$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(value => Number(value));
  const nextIndexFromLocalIds =
    localIndexes.length > 0 ? Math.max(...localIndexes) + 1 : 1;
  const nextIndex = Math.max(supportTickets.length + 1, nextIndexFromLocalIds);

  return `support-ticket-${nextIndex}`;
}
