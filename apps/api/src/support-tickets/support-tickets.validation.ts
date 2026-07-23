import { z } from 'zod';
import type {
  AdminSupportTicketListQuery,
  CreateShipperSupportTicketRequest,
  UpdateShipperSupportTicketRequest,
} from './dto';

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .transform(value => (value === '' ? undefined : value));

export const createShipperSupportTicketSchema = z.object({
  channelName: z.string().trim().min(1, '服务渠道不能为空').max(30),
  description: z.string().trim().min(1, '问题说明不能为空').max(200),
});

export const adminSupportTicketListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['pending', 'processing', 'resolved']).optional(),
  keyword: optionalTrimmedString.pipe(z.string().max(80).optional()),
});

export const updateShipperSupportTicketSchema = z.object({
  baseUpdatedAtIso: z
    .string()
    .trim()
    .refine(value => !Number.isNaN(Date.parse(value)), '工单版本时间不合法'),
  content: z
    .string()
    .trim()
    .min(6, '处理说明至少 6 个字')
    .max(500, '处理说明最多 500 字'),
});

const supportTicketIdSchema = z
  .string()
  .trim()
  .min(1, '工单 ID 不能为空')
  .max(120);

export function parseCreateShipperSupportTicketRequest(
  input: unknown,
): CreateShipperSupportTicketRequest {
  return createShipperSupportTicketSchema.parse(input);
}

export function parseAdminSupportTicketListQuery(
  input: unknown,
): AdminSupportTicketListQuery {
  return adminSupportTicketListQuerySchema.parse(input);
}

export function parseUpdateShipperSupportTicketRequest(
  input: unknown,
): UpdateShipperSupportTicketRequest {
  return updateShipperSupportTicketSchema.parse(input);
}

export function parseSupportTicketId(input: unknown) {
  return supportTicketIdSchema.parse(input);
}
