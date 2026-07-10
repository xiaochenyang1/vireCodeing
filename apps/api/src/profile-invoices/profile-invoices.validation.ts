import { z } from 'zod';
import type { CreateShipperInvoiceApplicationRequest } from './dto';

const orderIdSchema = z
  .string()
  .trim()
  .min(1, '订单标识不能为空')
  .max(120, '订单标识过长');

export const createShipperInvoiceApplicationSchema = z
  .object({
    invoiceType: z.enum(['normal', 'vat-special'], {
      message: '发票类型不支持',
    }),
    invoiceTitleType: z.enum(['personal', 'enterprise'], {
      message: '发票抬头类型不支持',
    }),
    invoiceTitle: z
      .string()
      .trim()
      .min(1, '发票抬头不能为空')
      .max(60, '发票抬头最多 60 个字符'),
    receiverEmail: z
      .string()
      .trim()
      .refine(
        value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        '接收邮箱格式不正确',
      ),
    orderIds: z
      .array(orderIdSchema)
      .min(1, '至少选择一笔开票订单')
      .max(20, '最多选择 20 笔开票订单'),
  })
  .superRefine((value, context) => {
    const uniqueOrderIds = new Set(value.orderIds);

    if (uniqueOrderIds.size !== value.orderIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: '开票订单不能重复选择',
        path: ['orderIds'],
      });
    }
  });

export function parseCreateShipperInvoiceApplicationRequest(
  input: unknown,
): CreateShipperInvoiceApplicationRequest {
  return createShipperInvoiceApplicationSchema.parse(input);
}
