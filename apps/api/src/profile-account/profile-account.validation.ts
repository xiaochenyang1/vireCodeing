import { z } from 'zod';
import type { SaveShipperProfileAccountRequest } from './dto';

export const saveShipperProfileAccountSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, '昵称不能为空')
    .max(30, '昵称最多 30 个字符'),
});

export function parseSaveShipperProfileAccountRequest(
  input: unknown,
): SaveShipperProfileAccountRequest {
  return saveShipperProfileAccountSchema.parse(input);
}
