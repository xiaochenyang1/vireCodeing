import { z } from 'zod';
import type {
  DeactivateDeviceTokenInput,
  InboxMessageCategory,
  InboxMessageListQuery,
  RegisterDeviceTokenInput,
} from './dto';

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

const devicePlatformSchema = z.enum(['ios', 'android']);
const pushTokenSchema = z
  .string()
  .trim()
  .max(512, '推送令牌长度不能超过 512 个字符');
const deviceIdSchema = z
  .string()
  .trim()
  .max(120, '设备 ID 长度不能超过 120 个字符');

export const registerDeviceTokenBodySchema = z.object({
  pushToken: pushTokenSchema,
  platform: devicePlatformSchema,
  deviceId: deviceIdSchema,
});

export function parseRegisterDeviceTokenBody(
  input: unknown,
): RegisterDeviceTokenInput {
  const parsed = registerDeviceTokenBodySchema.parse(input);
  return {
    pushToken: parsed.pushToken,
    platform: parsed.platform,
    deviceId: parsed.deviceId,
  };
}

export const deactivateDeviceTokenBodySchema = z.object({
  token: pushTokenSchema,
});

export function parseDeactivateDeviceTokenBody(
  input: unknown,
): DeactivateDeviceTokenInput {
  const parsed = deactivateDeviceTokenBodySchema.parse(input);
  return {
    token: parsed.token,
  };
}
