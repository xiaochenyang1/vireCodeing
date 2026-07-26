import {
  PlatformApiError,
  platformGet,
  platformPost,
  type PlatformApiConfig,
} from './platformApiClient';

export type PlatformSupportTicketStatus = 'pending' | 'processing' | 'resolved';

export type PlatformSupportTicketSlaPolicyKey =
  'support_ticket_default_v1';

export type PlatformSupportTicketSlaStage =
  | 'first_response'
  | 'resolution';

export type PlatformSupportTicketSlaStatus =
  | 'within_target'
  | 'overdue'
  | 'resolved_within_target'
  | 'resolved_overdue';

export type PlatformSupportTicketSlaSnapshot = {
  policyKey: PlatformSupportTicketSlaPolicyKey;
  stage: PlatformSupportTicketSlaStage;
  status: PlatformSupportTicketSlaStatus;
  targetAtIso: string;
  remainingMinutes?: number;
  overdueMinutes?: number;
};

export type PlatformSupportTicketStatusHistoryItem = {
  actionText: string;
  timestampIso: string;
  fromStatus?: PlatformSupportTicketStatus;
  toStatus?: PlatformSupportTicketStatus;
  operatorUserId?: string;
  content?: string;
};

export type PlatformSupportTicket = {
  id: string;
  shipperId: string;
  channelName: string;
  description: string;
  status: PlatformSupportTicketStatus;
  statusHistory: PlatformSupportTicketStatusHistoryItem[];
  claimedByAdminUserId?: string;
  claimedAtIso?: string;
  claimNote?: string;
  sla?: PlatformSupportTicketSlaSnapshot;
  createdAtIso: string;
  updatedAtIso: string;
};

export type PlatformSupportTicketListResult = {
  shipperId: string;
  items: PlatformSupportTicket[];
};

export type PlatformListAdminSupportTicketsQuery = {
  page?: number;
  pageSize?: number;
  status?: PlatformSupportTicketStatus;
  slaStatus?: PlatformSupportTicketSlaStatus;
  claimStatus?: 'claimed' | 'unclaimed';
  claimedByAdminUserId?: string;
  keyword?: string;
};

export type PlatformAdminSupportTicketListResult = {
  items: PlatformSupportTicket[];
  page: number;
  pageSize: number;
  total: number;
};

export type PlatformCreateSupportTicketRequest = {
  channelName: string;
  description: string;
};

export type PlatformUpdateSupportTicketRequest = {
  baseUpdatedAtIso: string;
  content: string;
};

export type PlatformClaimSupportTicketRequest = {
  baseUpdatedAtIso: string;
  content?: string;
};

export type PlatformSupportTicketOverdueEscalationSweepTrigger =
  | 'admin'
  | 'scheduler';

export type PlatformSupportTicketOverdueEscalationSweepResult = {
  trigger: PlatformSupportTicketOverdueEscalationSweepTrigger;
  triggeredAtIso: string;
  scannedCount: number;
  overdueCount: number;
  escalatedCount: number;
  skippedCount: number;
  conflictCount: number;
  escalatedTicketIds: string[];
};

const SUPPORT_TICKET_REQUEST_INVALID =
  'PLATFORM_SUPPORT_TICKET_REQUEST_INVALID';

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
    async listAdminSupportTickets(
      query: PlatformListAdminSupportTicketsQuery = {},
    ) {
      const normalizedQuery = normalizeAdminSupportTicketListQuery(query);

      return platformGet<PlatformAdminSupportTicketListResult>(
        config,
        `/admin/support-tickets?${new URLSearchParams(
          normalizedQuery,
        ).toString()}`,
      );
    },
    async getAdminSupportTicket(ticketId: string) {
      return platformGet<PlatformSupportTicket>(
        config,
        `/admin/support-tickets/${encodeURIComponent(
          normalizeSupportTicketId(ticketId),
        )}`,
      );
    },
    async processAdminSupportTicket(
      ticketId: string,
      request: PlatformUpdateSupportTicketRequest,
    ) {
      return platformPost<
        PlatformUpdateSupportTicketRequest,
        PlatformSupportTicket
      >(
        config,
        `/admin/support-tickets/${encodeURIComponent(
          normalizeSupportTicketId(ticketId),
        )}/process`,
        normalizeUpdateSupportTicketRequest(request),
      );
    },
    async claimAdminSupportTicket(
      ticketId: string,
      request: PlatformClaimSupportTicketRequest,
    ) {
      return platformPost<
        PlatformClaimSupportTicketRequest,
        PlatformSupportTicket
      >(
        config,
        `/admin/support-tickets/${encodeURIComponent(
          normalizeSupportTicketId(ticketId),
        )}/claim`,
        normalizeClaimSupportTicketRequest(request),
      );
    },
    async unclaimAdminSupportTicket(
      ticketId: string,
      request: PlatformClaimSupportTicketRequest,
    ) {
      return platformPost<
        PlatformClaimSupportTicketRequest,
        PlatformSupportTicket
      >(
        config,
        `/admin/support-tickets/${encodeURIComponent(
          normalizeSupportTicketId(ticketId),
        )}/unclaim`,
        normalizeClaimSupportTicketRequest(request),
      );
    },
    async resolveAdminSupportTicket(
      ticketId: string,
      request: PlatformUpdateSupportTicketRequest,
    ) {
      return platformPost<
        PlatformUpdateSupportTicketRequest,
        PlatformSupportTicket
      >(
        config,
        `/admin/support-tickets/${encodeURIComponent(
          normalizeSupportTicketId(ticketId),
        )}/resolve`,
        normalizeUpdateSupportTicketRequest(request),
      );
    },
    runAdminSupportTicketOverdueEscalationSweep() {
      return platformPost<
        Record<string, never>,
        PlatformSupportTicketOverdueEscalationSweepResult
      >(config, '/admin/support-tickets/overdue-escalations/sweep', {});
    },
  };
}

function normalizeCreateSupportTicketRequest(
  request: PlatformCreateSupportTicketRequest,
) {
  assertPlainObject(request, 'Support ticket request must be an object');

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

function normalizeAdminSupportTicketListQuery(
  query: PlatformListAdminSupportTicketsQuery,
) {
  assertPlainObject(query, 'Support ticket query must be an object');
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  if (!Number.isInteger(page) || page < 1) {
    throwInvalidSupportTicketRequest('Support ticket page is invalid');
  }

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throwInvalidSupportTicketRequest('Support ticket pageSize is invalid');
  }

  const normalizedQuery: Record<string, string> = {
    page: String(page),
    pageSize: String(pageSize),
  };

  if (query.status !== undefined) {
    if (!['pending', 'processing', 'resolved'].includes(query.status)) {
      throwInvalidSupportTicketRequest('Support ticket status is invalid');
    }

    normalizedQuery.status = query.status;
  }

  if (query.slaStatus !== undefined) {
    if (
      ![
        'within_target',
        'overdue',
        'resolved_within_target',
        'resolved_overdue',
      ].includes(query.slaStatus)
    ) {
      throwInvalidSupportTicketRequest('Support ticket slaStatus is invalid');
    }

    normalizedQuery.slaStatus = query.slaStatus;
  }

  if (query.claimStatus !== undefined) {
    if (!['claimed', 'unclaimed'].includes(query.claimStatus)) {
      throwInvalidSupportTicketRequest(
        'Support ticket claimStatus is invalid',
      );
    }

    normalizedQuery.claimStatus = query.claimStatus;
  }

  const claimedByAdminUserId = normalizeOptionalString(
    query.claimedByAdminUserId,
    120,
    'Support ticket claimedByAdminUserId is invalid',
  );

  if (claimedByAdminUserId) {
    normalizedQuery.claimedByAdminUserId = claimedByAdminUserId;
  }

  const keyword = normalizeOptionalString(
    query.keyword,
    80,
    'Support ticket keyword is invalid',
  );

  if (keyword) {
    normalizedQuery.keyword = keyword;
  }

  return normalizedQuery;
}

function normalizeUpdateSupportTicketRequest(
  request: PlatformUpdateSupportTicketRequest,
): PlatformUpdateSupportTicketRequest {
  assertPlainObject(
    request,
    'Support ticket update request must be an object',
  );

  const baseUpdatedAtIso = normalizeRequiredString(
    request.baseUpdatedAtIso,
    40,
    'Support ticket baseUpdatedAtIso is invalid',
  );

  if (Number.isNaN(Date.parse(baseUpdatedAtIso))) {
    throwInvalidSupportTicketRequest(
      'Support ticket baseUpdatedAtIso is invalid',
    );
  }

  return {
    baseUpdatedAtIso,
    content: normalizeRequiredString(
      request.content,
      500,
      'Support ticket content is invalid',
      6,
    ),
  };
}

function normalizeClaimSupportTicketRequest(
  request: PlatformClaimSupportTicketRequest,
): PlatformClaimSupportTicketRequest {
  assertPlainObject(
    request,
    'Support ticket claim request must be an object',
  );

  const baseUpdatedAtIso = normalizeRequiredString(
    request.baseUpdatedAtIso,
    40,
    'Support ticket baseUpdatedAtIso is invalid',
  );

  if (Number.isNaN(Date.parse(baseUpdatedAtIso))) {
    throwInvalidSupportTicketRequest(
      'Support ticket baseUpdatedAtIso is invalid',
    );
  }

  const content = normalizeOptionalString(
    request.content,
    200,
    'Support ticket claim content is invalid',
  );

  return {
    baseUpdatedAtIso,
    ...(content ? { content } : {}),
  };
}

function normalizeSupportTicketId(ticketId: string) {
  return normalizeRequiredString(
    ticketId,
    120,
    'Support ticket id is invalid',
  );
}

function normalizeRequiredString(
  value: unknown,
  maxLength: number,
  message: string,
  minLength = 1,
) {
  if (typeof value !== 'string') {
    throwInvalidSupportTicketRequest(message);
  }

  const normalizedValue = value.trim();

  if (
    normalizedValue.length < minLength ||
    normalizedValue.length > maxLength
  ) {
    throwInvalidSupportTicketRequest(message);
  }

  return normalizedValue;
}

function normalizeOptionalString(
  value: unknown,
  maxLength: number,
  message: string,
) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throwInvalidSupportTicketRequest(message);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    return undefined;
  }

  if (normalizedValue.length > maxLength) {
    throwInvalidSupportTicketRequest(message);
  }

  return normalizedValue;
}

function assertPlainObject(
  value: unknown,
  message: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throwInvalidSupportTicketRequest(message);
  }
}

function throwInvalidSupportTicketRequest(message: string): never {
  throw new PlatformApiError(
    message,
    SUPPORT_TICKET_REQUEST_INVALID,
    0,
  );
}
