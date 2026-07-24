import { z } from 'zod';
import type {
  CreateShipperInvoiceApplicationRequest,
  ListAdminShipperInvoiceQuery,
  ReviewShipperInvoiceApplicationRequest,
} from './dto';

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

export const reviewShipperInvoiceApplicationSchema = z
  .object({
    status: z.enum(['approved', 'rejected'], {
      error: '审核状态只能是 approved 或 rejected',
    }),
    rejectionReason: z
      .string()
      .trim()
      .max(200, '驳回原因最多 200 字')
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.status === 'rejected' && !value.rejectionReason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rejectionReason'],
        message: '驳回原因不能为空',
      });
    }
  })
  .transform(value =>
    value.status === 'approved'
      ? { status: 'approved' as const }
      : {
          status: 'rejected' as const,
          rejectionReason: value.rejectionReason as string,
        },
  );

const listAdminShipperInvoiceQuerySchema = z.object({
  status: z
    .string()
    .trim()
    .optional()
    .default('reviewing')
    .pipe(
      z.enum(['reviewing', 'approved', 'rejected'], {
        error: '发票状态筛选只能是 reviewing、approved 或 rejected',
      }),
    ),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export function parseReviewShipperInvoiceApplicationRequest(
  input: unknown,
): ReviewShipperInvoiceApplicationRequest {
  return reviewShipperInvoiceApplicationSchema.parse(input);
}

export function parseListAdminShipperInvoiceQuery(
  input: unknown,
): ListAdminShipperInvoiceQuery {
  return listAdminShipperInvoiceQuerySchema.parse(input);
}
