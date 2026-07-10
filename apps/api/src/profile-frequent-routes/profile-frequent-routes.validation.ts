import { z } from 'zod';
import type { SaveShipperProfileFrequentRoutesRequest } from './dto';

const optionalIsoSchema = (message: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform(value => (value === '' ? undefined : value))
    .refine(
      value => value === undefined || !Number.isNaN(Date.parse(value)),
      message,
    );

const routeSchema = z.object({
  id: z.string().trim().min(1, '路线 ID 不能为空').max(80),
  name: z.string().trim().min(1, '路线名称不能为空').max(40),
  from: z.string().trim().min(1, '装货地不能为空').max(80),
  to: z.string().trim().min(1, '卸货地不能为空').max(80),
  lastUsedText: z.string().trim().min(1, '最近使用时间不能为空').max(30),
  lastUsedIso: optionalIsoSchema('常用路线最近使用时间不合法'),
});

export const saveShipperProfileFrequentRoutesSchema = z.object({
  routes: z.array(routeSchema).max(20, '最多保存 20 条常用路线'),
  clientUpdatedAtIso: optionalIsoSchema('常用路线更新时间不合法'),
  baseUpdatedAtIso: optionalIsoSchema('常用路线基线版本不合法'),
});

export function parseSaveShipperProfileFrequentRoutesRequest(
  input: unknown,
): SaveShipperProfileFrequentRoutesRequest {
  return saveShipperProfileFrequentRoutesSchema.parse(input);
}
