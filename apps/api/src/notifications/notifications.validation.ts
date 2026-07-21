import { z } from 'zod';
import type { InboxMessageCategory, InboxMessageListQuery } from './dto';

const categorySchema = z.enum(['order', 'system', 'service', 'finance']);

export const listInboxMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform(value => {
      if (value === undefined) {
        return undefined;
      }
      if (typeof value === 'boolean') {
        return value;
      }
      return value === 'true' || value === '1';
    }),
  category: categorySchema.optional(),
});

export function parseListInboxMessagesQuery(
  input: unknown,
): InboxMessageListQuery {
  const parsed = listInboxMessagesQuerySchema.parse(input ?? {});
  return {
    page: parsed.page,
    pageSize: parsed.pageSize,
    ...(parsed.unreadOnly === undefined
      ? {}
      : { unreadOnly: parsed.unreadOnly }),
    ...(parsed.category
      ? { category: parsed.category as InboxMessageCategory }
      : {}),
  };
}

export function parseMessageId(input: unknown) {
  return z.string().trim().min(1, '消息 ID 不能为空').max(120).parse(input);
}
