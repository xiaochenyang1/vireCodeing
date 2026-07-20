import { z } from 'zod';
import type {
  CreateDriverWithdrawalRequest,
  DriverAcceptOrderRequest,
  DriverAdvanceOrderStatusRequest,
  DriverEvaluateShipperRequest,
  DriverMyOrdersQuery,
  DriverOrderHallQuery,
  DriverQuoteOrderRequest,
  DriverReplyEvaluationRequest,
  DriverReportExceptionRequest,
  DriverWithdrawalsQuery,
  SaveDriverAcceptanceSettingsRequest,
} from './dto';

const driverExecutingOrderStatuses = [
  'loading',
  'transporting',
  'confirming',
] as const;

const driverStatusAdvanceTargets = ['transporting', 'confirming'] as const;

const optionalTrimmedString = (maxLength: number, message: string) =>
  z
    .string()
    .trim()
    .max(maxLength, message)
    .optional()
    .transform(value => (value === '' ? undefined : value));
const baseUpdatedAtIsoSchema = z.preprocess(
  value => (typeof value === 'string' ? value : ''),
  z.string().trim().datetime({ offset: true, message: '订单版本时间无效' }),
);

const optionalReceiptPhotoFileIdsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, '司机执行凭证文件 ID 无效')
      .max(120, '司机执行凭证文件 ID 无效'),
  )
  .max(6, '司机执行凭证最多 6 张')
  .optional()
  .transform(value =>
    value === undefined
      ? undefined
      : Array.from(new Set(value.map(fileId => fileId.trim()))),
  );

const optionalExceptionPhotoFileIdsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, '异常图片文件 ID 无效')
      .max(120, '异常图片文件 ID 无效'),
  )
  .max(6, '异常图片最多 6 张')
  .optional()
  .transform(value =>
    value === undefined
      ? undefined
      : Array.from(new Set(value.map(fileId => fileId.trim()))),
  );

const driverAcceptanceVehicleTypePreferencesSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, '接单车型不能为空')
      .max(40, '接单车型最多 40 个字符'),
  )
  .max(10, '接单车型最多 10 个')
  .transform(value => Array.from(new Set(value.map(item => item.trim()))));

const normalizedBankAccountNoSchema = z
  .string()
  .trim()
  .transform(value => value.replace(/\s+/g, ''))
  .pipe(
    z
      .string()
      .regex(/^\d{10,30}$/, '银行卡号无效'),
  );

export const driverOrderHallQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const driverMyOrdersQuerySchema = z.object({
  statuses: z
    .preprocess(value => {
      if (value === undefined) {
        return [...driverExecutingOrderStatuses];
      }

      if (typeof value === 'string') {
        return value
          .split(',')
          .map(status => status.trim())
          .filter(Boolean);
      }

      return value;
    }, z.array(z.enum(driverExecutingOrderStatuses, {
      message: '司机执行订单状态无效',
    })).min(1, '司机执行订单状态无效'))
    .default([...driverExecutingOrderStatuses]),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const driverWithdrawalsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const driverQuoteOrderSchema = z.object({
  quoteCents: z.number().int().positive('司机报价必须大于 0'),
  arrivalText: z
    .string()
    .trim()
    .min(1, '预计到达时间不能为空')
    .max(50, '预计到达时间最多 50 字'),
  noteText: optionalTrimmedString(200, '报价备注最多 200 字'),
});

export const driverAcceptOrderSchema = z.object({
  baseUpdatedAtIso: baseUpdatedAtIsoSchema,
  noteText: optionalTrimmedString(200, '接单备注最多 200 字'),
});

export const driverAdvanceOrderStatusSchema = z.object({
  baseUpdatedAtIso: baseUpdatedAtIsoSchema,
  nextStatus: z.enum(driverStatusAdvanceTargets, {
    message: '司机订单目标状态无效',
  }),
  receiptPhotoFileIds: optionalReceiptPhotoFileIdsSchema,
});

export const driverReplyEvaluationSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, '评价回复不能为空')
    .max(200, '评价回复最多 200 字'),
});

export const driverReportExceptionSchema = z.object({
  typeLabel: z
    .string()
    .trim()
    .min(1, '异常类型不能为空')
    .max(30, '异常类型最多 30 字'),
  description: z
    .string()
    .trim()
    .min(6, '请至少填写 6 个字的异常说明')
    .max(200, '异常说明最多 200 字'),
  photoCount: z.number().int().min(0).max(6).optional(),
  photoFileIds: optionalExceptionPhotoFileIdsSchema,
});

export const driverEvaluateShipperSchema = z.object({
  rating: z.number().int().min(1).max(5),
  tags: z
    .array(z.string().trim().min(1))
    .min(1, '请选择至少一个评价标签')
    .max(6)
    .transform(tags =>
      tags.filter((tag, index, allTags) => allTags.indexOf(tag) === index),
    ),
  content: z
    .string()
    .trim()
    .min(6, '请至少填写 6 个字的评价内容')
    .max(200, '评价内容最多 200 字'),
  anonymous: z.boolean().optional(),
});

export const saveDriverAcceptanceSettingsSchema = z.object({
  isOnline: z.boolean({
    message: '接单开关无效',
  }),
  maxDistanceKm: z
    .number({
      message: '接单范围必须是整数',
    })
    .int('接单范围必须是整数')
    .min(1, '接单范围至少 1 公里')
    .max(500, '接单范围最多 500 公里'),
  vehicleTypePreferences: driverAcceptanceVehicleTypePreferencesSchema,
});

export const createDriverWithdrawalSchema = z.object({
  amountCents: z
    .number({
      message: '提现金额必须是整数',
    })
    .int('提现金额必须是整数')
    .min(100, '提现金额至少 1 元'),
  bankAccountName: z
    .string()
    .trim()
    .min(2, '收款人姓名不能为空')
    .max(30, '收款人姓名最多 30 个字符'),
  bankName: z
    .string()
    .trim()
    .min(2, '开户银行不能为空')
    .max(50, '开户银行最多 50 个字符'),
  bankAccountNo: normalizedBankAccountNoSchema,
});

export function parseDriverOrderHallQuery(
  input: unknown,
): DriverOrderHallQuery {
  return driverOrderHallQuerySchema.parse(input);
}

export function parseDriverMyOrdersQuery(input: unknown): DriverMyOrdersQuery {
  return driverMyOrdersQuerySchema.parse(input);
}

export function parseDriverWithdrawalsQuery(
  input: unknown,
): DriverWithdrawalsQuery {
  return driverWithdrawalsQuerySchema.parse(input);
}

export function parseDriverQuoteOrderRequest(
  input: unknown,
): DriverQuoteOrderRequest {
  return driverQuoteOrderSchema.parse(input);
}

export function parseDriverAcceptOrderRequest(
  input: unknown,
): DriverAcceptOrderRequest {
  return driverAcceptOrderSchema.parse(input);
}

export function parseDriverAdvanceOrderStatusRequest(
  input: unknown,
): DriverAdvanceOrderStatusRequest {
  return driverAdvanceOrderStatusSchema.parse(input);
}

export function parseDriverReplyEvaluationRequest(
  input: unknown,
): DriverReplyEvaluationRequest {
  return driverReplyEvaluationSchema.parse(input);
}

export function parseDriverReportExceptionRequest(
  input: unknown,
): DriverReportExceptionRequest {
  return driverReportExceptionSchema.parse(input);
}

export function parseDriverEvaluateShipperRequest(
  input: unknown,
): DriverEvaluateShipperRequest {
  return driverEvaluateShipperSchema.parse(input);
}

export function parseSaveDriverAcceptanceSettingsRequest(
  input: unknown,
): SaveDriverAcceptanceSettingsRequest {
  return saveDriverAcceptanceSettingsSchema.parse(input);
}

export function parseCreateDriverWithdrawalRequest(
  input: unknown,
): CreateDriverWithdrawalRequest {
  return createDriverWithdrawalSchema.parse(input);
}
