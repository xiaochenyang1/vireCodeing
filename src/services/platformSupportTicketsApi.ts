import {
  PlatformApiError,
  platformGet,
  platformPost,
  type PlatformApiConfig,
} from './platformApiClient';

export type PlatformSupportTicketStatus = 'pending' | 'processing' | 'resolved';

export type PlatformSupportTicketStatusHistoryItem = {
  actionText: string;
  timestampIso: string;
};

export type PlatformSupportTicket = {
  id: string;
  shipperId: string;
  channelName: string;
  description: string;
  status: PlatformSupportTicketStatus;
  statusHistory: PlatformSupportTicketStatusHistoryItem[];
  createdAtIso: string;
  updatedAtIso: string;
};

export type PlatformSupportTicketListResult = {
  shipperId: string;
  items: PlatformSupportTicket[];
};

export type PlatformCreateSupportTicketRequest = {
  channelName: string;
  description: string;
};

export function createPlatformSupportTicketsApi(config: PlatformApiConfig) {
  return {
    getSupportTickets() {
      return platformGet<PlatformSupportTicketListResult>(
        config,
        '/shipper/support-tickets',
      );
    },
    async createSupportTicket(request: PlatformCreateSupportTicketRequest) {
      const normalizedRequest = normalizeCreateSupportTicketRequest(request);

      return platformPost<
        PlatformCreateSupportTicketRequest,
        PlatformSupportTicket
      >(config, '/shipper/support-tickets', normalizedRequest);
    },
  };
}

function normalizeCreateSupportTicketRequest(
  request: PlatformCreateSupportTicketRequest,
) {
  if (!isPlainObject(request)) {
    throwInvalidSupportTicketRequest('Support ticket request must be an object');
  }

  return {
    channelName: normalizeRequiredString(
      request.channelName,
      30,
      'Support ticket channel name is invalid',
    ),
    description: normalizeRequiredString(
      request.description,
      200,
      'Support ticket description is invalid',
    ),
  };
}

function normalizeRequiredString(
  value: unknown,
  maxLength: number,
  message: string,
) {
  if (typeof value !== 'string') {
    throwInvalidSupportTicketRequest(message);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > maxLength) {
    throwInvalidSupportTicketRequest(message);
  }

  return normalizedValue;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwInvalidSupportTicketRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_SUPPORT_TICKET_REQUEST_INVALID',
    0,
  );
}
