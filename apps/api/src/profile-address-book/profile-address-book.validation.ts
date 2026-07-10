import { z } from 'zod';
import type { SaveShipperProfileAddressBookRequest } from './dto';

const phoneSchema = z.string().trim().regex(/^1[3-9]\d{9}$/, '手机号不合法');
const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .transform(value => (value === '' ? undefined : value));
const optionalClientUpdatedAtIsoSchema = z
  .string()
  .trim()
  .optional()
  .transform(value => (value === '' ? undefined : value))
  .refine(
    value => value === undefined || !Number.isNaN(Date.parse(value)),
    '地址簿更新时间不合法',
  );
const optionalBaseUpdatedAtIsoSchema = z
  .string()
  .trim()
  .optional()
  .transform(value => (value === '' ? undefined : value))
  .refine(
    value => value === undefined || !Number.isNaN(Date.parse(value)),
    '地址簿基线版本不合法',
  );

const addressSchema = z.object({
  id: z.string().trim().min(1, '地址 ID 不能为空').max(80),
  name: z.string().trim().min(1, '地址名称不能为空').max(30),
  address: z.string().trim().min(1, '详细地址不能为空').max(120),
  contactText: z.string().trim().min(1, '地址联系人不能为空').max(80),
  tagText: optionalTrimmedString,
});

const contactSchema = z.object({
  id: z.string().trim().min(1, '联系人 ID 不能为空').max(80),
  name: z.string().trim().min(1, '联系人姓名不能为空').max(30),
  roleText: z.string().trim().min(1, '联系人角色不能为空').max(30),
  phoneText: phoneSchema,
  noteText: optionalTrimmedString,
});

export const saveShipperProfileAddressBookSchema = z.object({
  addresses: z.array(addressSchema).max(20, '最多保存 20 个常用地址'),
  contacts: z.array(contactSchema).max(50, '最多保存 50 个常用联系人'),
  clientUpdatedAtIso: optionalClientUpdatedAtIsoSchema,
  baseUpdatedAtIso: optionalBaseUpdatedAtIsoSchema,
});

export function parseSaveShipperProfileAddressBookRequest(
  input: unknown,
): SaveShipperProfileAddressBookRequest {
  return saveShipperProfileAddressBookSchema.parse(input);
}
