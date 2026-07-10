import { z } from 'zod';
import type { SaveShipperOrderDraftRequest } from './dto';

const draftSnapshotSchema = z.custom<Record<string, unknown>>(
  value => typeof value === 'object' && value !== null && !Array.isArray(value),
  '草稿快照必须是对象',
);

const optionalClientUpdatedAtIsoSchema = z
  .string()
  .trim()
  .optional()
  .transform(value => (value === '' ? undefined : value))
  .refine(
    value => value === undefined || !Number.isNaN(Date.parse(value)),
    '草稿更新时间不合法',
  );

const optionalBaseUpdatedAtIsoSchema = z
  .string()
  .trim()
  .optional()
  .transform(value => (value === '' ? undefined : value))
  .refine(
    value => value === undefined || !Number.isNaN(Date.parse(value)),
    '草稿基线版本不合法',
  );

export const saveShipperOrderDraftSchema = z.object({
  draftSnapshot: draftSnapshotSchema,
  clientUpdatedAtIso: optionalClientUpdatedAtIsoSchema,
  baseUpdatedAtIso: optionalBaseUpdatedAtIsoSchema,
});

export function parseSaveShipperOrderDraftRequest(
  input: unknown,
): SaveShipperOrderDraftRequest {
  return saveShipperOrderDraftSchema.parse(input);
}
