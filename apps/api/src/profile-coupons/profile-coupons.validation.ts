import { z } from 'zod';
import type { IssueShipperCouponRequest } from './dto';

export const issueShipperCouponSchema = z
  .object({
    shipperId: z
      .string()
      .trim()
      .min(1, '货主标识不能为空')
      .max(120, '货主标识过长'),
    title: z
      .string()
      .trim()
      .min(1, '优惠券名称不能为空')
      .max(60, '优惠券名称最多 60 个字符'),
    conditionText: z
      .string()
      .trim()
      .min(1, '优惠券使用条件不能为空')
      .max(120, '优惠券使用条件最多 120 个字符'),
    discountCents: z
      .number()
      .int('优惠金额必须是整数分')
      .positive('优惠金额必须大于 0'),
    minOrderAmountCents: z
      .number()
      .int('最低订单金额必须是整数分')
      .min(0, '最低订单金额不能小于 0'),
    validFromIso: z
      .string()
      .trim()
      .refine(value => !Number.isNaN(Date.parse(value)), '生效时间格式不正确'),
    validUntilIso: z
      .string()
      .trim()
      .refine(value => !Number.isNaN(Date.parse(value)), '失效时间格式不正确'),
    sourceText: z
      .string()
      .trim()
      .min(1, '优惠券来源不能为空')
      .max(80, '优惠券来源最多 80 个字符')
      .optional(),
  })
  .superRefine((value, context) => {
    const validFrom = Date.parse(value.validFromIso);
    const validUntil = Date.parse(value.validUntilIso);

    if (!Number.isNaN(validFrom) && !Number.isNaN(validUntil) && validUntil <= validFrom) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: '优惠券失效时间必须晚于生效时间',
        path: ['validUntilIso'],
      });
    }
  });

export function parseIssueShipperCouponRequest(
  input: unknown,
): IssueShipperCouponRequest {
  return issueShipperCouponSchema.parse(input);
}
