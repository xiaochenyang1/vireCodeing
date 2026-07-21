import {
  PlatformApiError,
  type PlatformApiConfig,
  platformGet,
  platformPost,
} from './platformApiClient';

export type PlatformInboxMessageCategory =
  | 'order'
  | 'system'
  | 'service'
  | 'finance';

export type PlatformInboxMessage = {
  id: string;
  userId: string;
  audience: 'shipper' | 'driver' | 'admin';
  category: PlatformInboxMessageCategory;
  title: string;
  content: string;
  orderId?: string;
  orderNo?: string;
  referenceType?: string;
  referenceId?: string;
  unread: boolean;
  readAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type PlatformInboxMessageListQuery = {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
  category?: PlatformInboxMessageCategory;
};

export type PlatformInboxMessageListResult = {
  items: PlatformInboxMessage[];
  page: number;
  pageSize: number;
  total: number;
  unreadCount: number;
};

export function createPlatformMessagesApi(config: PlatformApiConfig) {
  return {
    async listMessages(query: PlatformInboxMessageListQuery = {}) {
      const normalizedQuery = normalizeListQuery(query);
      const search = new URLSearchParams();
      search.set('page', String(normalizedQuery.page));
      search.set('pageSize', String(normalizedQuery.pageSize));
      if (normalizedQuery.unreadOnly !== undefined) {
        search.set('unreadOnly', String(normalizedQuery.unreadOnly));
      }
      if (normalizedQuery.category) {
        search.set('category', normalizedQuery.category);
      }

      return platformGet<PlatformInboxMessageListResult>(
        config,
        `/me/messages?${search.toString()}`,
      );
    },

    async markMessageRead(messageId: string) {
      const normalizedMessageId = normalizeMessageId(messageId);
      return platformPost<Record<string, never>, PlatformInboxMessage>(
        config,
        `/me/messages/${encodeURIComponent(normalizedMessageId)}/read`,
        {},
      );
    },

    async markAllMessagesRead() {
      return platformPost<Record<string, never>, { updatedCount: number }>(
        config,
        '/me/messages/read-all',
        {},
      );
    },
  };
}

function normalizeListQuery(query: PlatformInboxMessageListQuery) {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw new PlatformApiError(
      'Platform message list query is invalid',
      'PLATFORM_MESSAGE_LIST_QUERY_INVALID',
      0,
    );
  }

  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  if (!Number.isInteger(page) || page < 1) {
    throw new PlatformApiError(
      'Platform message list page is invalid',
      'PLATFORM_MESSAGE_LIST_QUERY_INVALID',
      0,
    );
  }

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new PlatformApiError(
      'Platform message list pageSize is invalid',
      'PLATFORM_MESSAGE_LIST_QUERY_INVALID',
      0,
    );
  }

  if (
    query.category !== undefined &&
    !['order', 'system', 'service', 'finance'].includes(query.category)
  ) {
    throw new PlatformApiError(
      'Platform message list category is invalid',
      'PLATFORM_MESSAGE_LIST_QUERY_INVALID',
      0,
    );
  }

  return {
    page,
    pageSize,
    ...(query.unreadOnly === undefined
      ? {}
      : { unreadOnly: Boolean(query.unreadOnly) }),
    ...(query.category ? { category: query.category } : {}),
  };
}

function normalizeMessageId(messageId: string) {
  if (typeof messageId !== 'string' || !messageId.trim()) {
    throw new PlatformApiError(
      'Platform message id is invalid',
      'PLATFORM_MESSAGE_ID_INVALID',
      0,
    );
  }
  return messageId.trim();
}
