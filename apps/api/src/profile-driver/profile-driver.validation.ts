import { z } from 'zod';
import type { SaveDriverProfileRequest } from './dto';

export const saveDriverProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, '昵称不能为空')
    .max(30, '昵称最多 30 个字符'),
  avatarFileId: z
    .string()
    .trim()
    .min(1, '头像文件 ID 不能为空')
    .max(120, '头像文件 ID 过长')
    .nullable()
    .optional(),
  phone: z
    .string()
    .trim()
    .regex(/^1[3-9]\d{9}$/, '手机号格式不正确')
    .optional(),
  phoneProtectionEnabled: z.boolean().optional(),
  loginProtectionEnabled: z.boolean().optional(),
  orderNotificationEnabled: z.boolean().optional(),
  promotionNotificationEnabled: z.boolean().optional(),
  privacyConfirmedAtIso: z
    .string()
    .trim()
    .datetime({ offset: true, message: '隐私确认时间无效' })
    .optional(),
  privacyPolicyVersion: z
    .string()
    .trim()
    .min(1, '隐私政策版本不能为空')
    .max(80, '隐私政策版本过长')
    .optional(),
  privacyPolicyVersionTitle: z
    .string()
    .trim()
    .min(1, '隐私政策版本标题不能为空')
    .max(120, '隐私政策版本标题过长')
    .optional(),
}).superRefine((value, context) => {
  const hasPrivacyPolicyVersion = value.privacyPolicyVersion !== undefined;
  const hasPrivacyPolicyVersionTitle =
    value.privacyPolicyVersionTitle !== undefined;

  if (hasPrivacyPolicyVersion !== hasPrivacyPolicyVersionTitle) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: hasPrivacyPolicyVersion
        ? ['privacyPolicyVersionTitle']
        : ['privacyPolicyVersion'],
      message: '隐私政策版本留痕不完整',
    });
  }

  if (
    (hasPrivacyPolicyVersion || hasPrivacyPolicyVersionTitle) &&
    value.privacyConfirmedAtIso === undefined
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['privacyConfirmedAtIso'],
      message: '隐私政策版本留痕必须和隐私确认时间一起提交',
    });
  }
});

export function parseSaveDriverProfileRequest(
  input: unknown,
): SaveDriverProfileRequest {
  return saveDriverProfileSchema.parse(input);
}
