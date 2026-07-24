import { z } from 'zod';
import type {
  AcceptShipperOrderQuoteRequest,
  AddShipperOrderBonusRequest,
  AdminBatchCancelOrderItem,
  AdminOrderFilters,
  AdminOrderReportQuery,
  AdvanceShipperOrderStatusRequest,
  AdminOrderAttachmentAuditListQuery,
  BatchCancelAdminOrdersRequest,
  CancelShipperOrderRequest,
  CompleteShipperOrderRequest,
  CreateShipperOrderRequest,
  ListAdminOrderChangeRequestsQuery,
  ListShipperOrdersQuery,
  ReportShipperOrderExceptionRequest,
  ReviewShipperOrderChangeRequest,
  SubmitShipperOrderChangeRequest,
  SubmitShipperOrderEvaluationRequest,
  UpdateShipperOrderRequest,
} from './dto';

const phoneSchema = z.string().trim().regex(/^1[3-9]\d{9}$/, '手机号不合法');
const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .transform(value => (value === '' ? undefined : value));
const optionalIsoDateString = optionalTrimmedString.refine(
  value => value === undefined || !Number.isNaN(Date.parse(value)),
  '时间范围不合法',
);
const optionalListKeywordString = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform(value => (value === '' ? undefined : value));
const optionalUserIdQueryString = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform(value => (value === '' ? undefined : value));
const optionalBooleanQuerySchema = z
  .preprocess(input => {
    if (input === undefined || input === '') {
      return undefined;
    }

    if (input === true || input === 'true') {
      return true;
    }

    if (input === false || input === 'false') {
      return false;
    }

    return input;
  }, z.boolean().optional());
const optionalPhotoFileIdsSchema = z
  .array(z.string().trim().min(1).max(120))
  .max(6)
  .optional()
  .transform(fileIds =>
    fileIds?.filter(
      (fileId, index, allFileIds) => allFileIds.indexOf(fileId) === index,
    ),
  );
const shipperOrderStatusSchema = z.enum([
  'waiting',
  'loading',
  'transporting',
  'confirming',
  'completed',
  'cancelled',
]);
const baseUpdatedAtIsoSchema = z.preprocess(
  value => (typeof value === 'string' ? value : ''),
  z.string().trim().datetime({ offset: true, message: '订单版本时间无效' }),
);
const optionalOrderStatusQuerySchema = z.preprocess(input => {
  if (input === undefined) {
    return undefined;
  }

  const status = String(input).trim();
  return status === '' ? undefined : status;
}, shipperOrderStatusSchema.optional());
const optionalStatusCollectionSchema = z
  .preprocess(input => {
    if (Array.isArray(input)) {
      return input.flatMap(parseStatusCollectionInput);
    }

    if (typeof input === 'string') {
      return parseStatusCollectionInput(input);
    }

    return input;
  }, z.array(shipperOrderStatusSchema).optional())
  .transform(value =>
    value?.filter((status, index, statuses) => statuses.indexOf(status) === index),
  );

function parseStatusCollectionInput(input: unknown) {
  return String(input)
    .split(',')
    .map(status => status.trim())
    .filter(Boolean);
}

const adminOrderFilterSchemaShape = {
  status: shipperOrderStatusSchema.optional(),
  statuses: optionalStatusCollectionSchema,
  keyword: optionalListKeywordString,
  createdFromIso: optionalIsoDateString,
  createdToIso: optionalIsoDateString,
} as const;

const optionalCoordinateSchema = z
  .number()
  .finite('坐标必须是有效数字')
  .optional();
const optionalLatitudeSchema = optionalCoordinateSchema.refine(
  value => value === undefined || Math.abs(value) <= 90,
  '纬度必须在 -90 到 90 之间',
);
const optionalLongitudeSchema = optionalCoordinateSchema.refine(
  value => value === undefined || Math.abs(value) <= 180,
  '经度必须在 -180 到 180 之间',
);

const createShipperOrderSchemaShape = {
  cargoType: z.string().trim().min(1, '货物类型不能为空'),
  weightText: z.string().trim().min(1, '货物重量不能为空'),
  volumeText: optionalTrimmedString,
  quantityText: z.string().trim().min(1, '货物数量不能为空'),
  cargoDescription: z.string().trim().max(200).optional(),
  cargoPhotoCount: z.number().int().min(0).max(6).optional(),
  cargoPhotoFileIds: optionalPhotoFileIdsSchema,
  pickupAddress: z.string().trim().min(1, '装货地址不能为空'),
  pickupNoteText: z.string().trim().max(50).optional(),
  pickupContact: z.string().trim().min(1, '装货联系人不能为空'),
  pickupPhone: phoneSchema,
  pickupLatitude: optionalLatitudeSchema,
  pickupLongitude: optionalLongitudeSchema,
  deliveryAddress: z.string().trim().min(1, '卸货地址不能为空'),
  deliveryNoteText: z.string().trim().max(50).optional(),
  deliveryContact: z.string().trim().min(1, '卸货联系人不能为空'),
  deliveryPhone: phoneSchema,
  deliveryLatitude: optionalLatitudeSchema,
  deliveryLongitude: optionalLongitudeSchema,
  vehicleRequirement: z.string().trim().min(1, '车型要求不能为空'),
  vehicleLengthText: optionalTrimmedString,
  needTailboard: z.boolean(),
  needTarp: z.boolean(),
  pickupTimeIso: z
    .string()
    .trim()
    .refine(value => !Number.isNaN(Date.parse(value)), '装货时间不合法'),
  expectedDeliveryTimeText: optionalTrimmedString,
  valueAddedServicesText: optionalTrimmedString,
  pricingMode: z.enum(['fixed', 'negotiable']),
  priceCents: z.number().int().positive().optional(),
  paymentMethod: z.enum(['cod', 'online']),
  couponId: optionalTrimmedString,
  couponTitle: optionalTrimmedString,
  couponDiscountCents: z.number().int().nonnegative().optional(),
  payablePriceCents: z.number().int().nonnegative().optional(),
} as const;

function refineCreateShipperOrder(
  value: z.infer<z.ZodObject<typeof createShipperOrderSchemaShape>>,
  context: z.RefinementCtx,
) {
    if (value.pickupAddress === value.deliveryAddress) {
      context.addIssue({
        code: 'custom',
        message: '装货地址和卸货地址不能相同',
        path: ['deliveryAddress'],
      });
    }

    refineCoordinatePair(
      value.pickupLatitude,
      value.pickupLongitude,
      'pickupLatitude',
      'pickupLongitude',
      context,
    );
    refineCoordinatePair(
      value.deliveryLatitude,
      value.deliveryLongitude,
      'deliveryLatitude',
      'deliveryLongitude',
      context,
    );

    if (value.cargoPhotoFileIds?.length) {
      value.cargoPhotoCount = value.cargoPhotoFileIds.length;
    }

    const couponFields = [
      value.couponId,
      value.couponTitle,
      value.couponDiscountCents,
      value.payablePriceCents,
    ];

    if (value.pricingMode === 'fixed' && !value.priceCents) {
      context.addIssue({
        code: 'custom',
        message: '一口价订单必须传入价格',
        path: ['priceCents'],
      });
    }

    if (
      value.pricingMode === 'negotiable' &&
      (value.priceCents !== undefined ||
        value.couponId !== undefined ||
        value.couponTitle !== undefined ||
        value.couponDiscountCents !== undefined ||
        value.payablePriceCents !== undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: '司机报价订单不能传入一口价或优惠金额',
        path: ['pricingMode'],
      });
    }

    if (
      value.pricingMode === 'negotiable' &&
      value.paymentMethod === 'online'
    ) {
      context.addIssue({
        code: 'custom',
        message: '在线支付订单必须先确定最终金额',
        path: ['paymentMethod'],
      });
    }

    if (
      value.pricingMode === 'fixed' &&
      couponFields.some(couponField => couponField !== undefined) &&
      couponFields.some(couponField => couponField === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: '优惠券金额字段必须同时传入',
        path: ['couponId'],
      });
    }

    if (
      value.pricingMode === 'fixed' &&
      value.priceCents !== undefined &&
      value.couponDiscountCents !== undefined &&
      value.payablePriceCents !== undefined &&
      value.payablePriceCents !== value.priceCents - value.couponDiscountCents
    ) {
      context.addIssue({
        code: 'custom',
        message: '实付金额必须等于原价减优惠金额',
        path: ['payablePriceCents'],
      });
    }
}

export const createShipperOrderSchema = z
  .object(createShipperOrderSchemaShape)
  .superRefine(refineCreateShipperOrder);

function refineAdminOrderFilters(
  value: z.infer<z.ZodObject<typeof adminOrderFilterSchemaShape>>,
  context: z.RefinementCtx,
) {
  if (value.status && value.statuses?.length) {
    context.addIssue({
      code: 'custom',
      message: '状态筛选只能传入 status 或 statuses 之一',
      path: ['status'],
    });
  }

  if (
    value.createdFromIso &&
    value.createdToIso &&
    Date.parse(value.createdFromIso) >= Date.parse(value.createdToIso)
  ) {
    context.addIssue({
      code: 'custom',
      message: '开始时间必须早于结束时间',
      path: ['createdFromIso'],
    });
  }
}

export const adminOrderFiltersSchema = z
  .object(adminOrderFilterSchemaShape)
  .superRefine(refineAdminOrderFilters);

export const listShipperOrdersQuerySchema = z
  .object({
    ...adminOrderFilterSchemaShape,
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .superRefine(refineAdminOrderFilters);

export const adminOrderReportQuerySchema = z
  .object({
    ...adminOrderFilterSchemaShape,
    topShippersLimit: z.coerce.number().int().min(1).max(20).default(5),
  })
  .superRefine(refineAdminOrderFilters);

export const adminOrderAttachmentAuditListQuerySchema = z
  .object({
    status: optionalOrderStatusQuerySchema,
    shipperId: optionalUserIdQueryString,
    keyword: optionalListKeywordString,
    createdFromIso: optionalIsoDateString,
    createdToIso: optionalIsoDateString,
    hasMissingFiles: optionalBooleanQuerySchema,
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .superRefine((value, context) => {
    if (
      value.createdFromIso &&
      value.createdToIso &&
      Date.parse(value.createdFromIso) >= Date.parse(value.createdToIso)
    ) {
      context.addIssue({
        code: 'custom',
        message: '开始时间必须早于结束时间',
        path: ['createdFromIso'],
      });
    }
  });

export const updateShipperOrderSchema = z
  .object({
    ...createShipperOrderSchemaShape,
    baseUpdatedAtIso: baseUpdatedAtIsoSchema,
  })
  .superRefine(refineCreateShipperOrder);

export const cancelShipperOrderSchema = z.object({
  baseUpdatedAtIso: baseUpdatedAtIsoSchema,
  reasonText: z.string().trim().min(1, '取消原因不能为空').max(50),
  description: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform(value => (value === '' ? undefined : value)),
});

export const batchCancelAdminOrdersSchema = z
  .object({
    items: z
      .array(
        z.object({
          orderId: z.string().trim().min(1, '订单 ID 不能为空').max(120),
          baseUpdatedAtIso: baseUpdatedAtIsoSchema,
        }),
      )
      .min(1, '至少选择 1 笔订单')
      .max(50, '单次最多批量取消 50 笔订单'),
    reasonText: z.string().trim().min(1, '取消原因不能为空').max(50),
    description: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform(value => (value === '' ? undefined : value)),
  })
  .superRefine((value, context) => {
    const orderIds = value.items.map(item => item.orderId);
    const uniqueOrderIds = new Set(orderIds);

    if (uniqueOrderIds.size !== orderIds.length) {
      context.addIssue({
        code: 'custom',
        message: '批量取消订单 ID 不能重复',
        path: ['items'],
      });
    }
  });

export const completeShipperOrderSchema = z.object({
  baseUpdatedAtIso: baseUpdatedAtIsoSchema,
});

export const advanceShipperOrderStatusSchema = z.object({
  baseUpdatedAtIso: baseUpdatedAtIsoSchema,
  nextStatus: z.enum(['transporting', 'confirming']),
});

export const acceptShipperOrderQuoteSchema = z.object({
  baseUpdatedAtIso: baseUpdatedAtIsoSchema,
  driverId: z.string().trim().min(1, '司机 ID 不能为空').max(120),
});

export const addShipperOrderBonusSchema = z.object({
  baseUpdatedAtIso: baseUpdatedAtIsoSchema,
  bonusCents: z
    .number({ message: '赏金金额不合法' })
    .int('赏金金额必须是整数分')
    .min(100, '单次追加赏金至少 1 元')
    .max(500_000, '单次追加赏金最多 5000 元'),
});

export const reportShipperOrderExceptionSchema = z.object({
  typeLabel: z.string().trim().min(1, '异常类型不能为空').max(30),
  description: z
    .string()
    .trim()
    .min(6, '请至少填写 6 个字的异常说明')
    .max(200),
  photoCount: z.number().int().min(0).max(6).optional(),
  photoFileIds: optionalPhotoFileIdsSchema,
});

export const submitShipperOrderChangeRequestSchema = z.object({
  description: z.string().trim().min(1, '修改说明不能为空').max(200),
});

export const reviewShipperOrderChangeRequestSchema = z.object({
  decision: z.enum(['approved', 'rejected'], {
    error: '审核结论只能是 approved 或 rejected',
  }),
  reviewResultText: z
    .string()
    .trim()
    .max(200, '审核说明最多 200 字')
    .optional()
    .transform(value => (value === '' ? undefined : value)),
});

const listAdminOrderChangeRequestsQuerySchema = z.object({
  status: z
    .string()
    .trim()
    .optional()
    .default('pending')
    .pipe(
      z.enum(['pending', 'approved', 'rejected'], {
        error: '修改申请状态筛选只能是 pending、approved 或 rejected',
      }),
    ),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const submitShipperOrderEvaluationSchema = z.object({
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
  photoCount: z.number().int().min(0).max(6).optional(),
  photoFileIds: optionalPhotoFileIdsSchema,
});

export function parseCreateShipperOrderRequest(
  input: unknown,
): CreateShipperOrderRequest {
  return createShipperOrderSchema.parse(input);
}

export function parseUpdateShipperOrderRequest(
  input: unknown,
): UpdateShipperOrderRequest {
  return updateShipperOrderSchema.parse(input);
}

export function parseListShipperOrdersQuery(
  input: unknown,
): ListShipperOrdersQuery {
  const parsed = listShipperOrdersQuerySchema.parse(input);

  return {
    page: parsed.page,
    pageSize: parsed.pageSize,
    status: parsed.status,
    statuses: parsed.statuses,
    keyword: parsed.keyword,
    createdFromIso: parsed.createdFromIso,
    createdToIso: parsed.createdToIso,
  };
}

export function parseAdminOrderFilters(input: unknown): AdminOrderFilters {
  const parsed = adminOrderFiltersSchema.parse(input);

  return {
    status: parsed.status,
    statuses: parsed.statuses,
    keyword: parsed.keyword,
    createdFromIso: parsed.createdFromIso,
    createdToIso: parsed.createdToIso,
  };
}

export function parseAdminOrderReportQuery(
  input: unknown,
): AdminOrderReportQuery {
  const parsed = adminOrderReportQuerySchema.parse(input);

  return {
    status: parsed.status,
    statuses: parsed.statuses,
    keyword: parsed.keyword,
    createdFromIso: parsed.createdFromIso,
    createdToIso: parsed.createdToIso,
    topShippersLimit: parsed.topShippersLimit,
  };
}

export function parseAdminOrderAttachmentAuditListQuery(
  input: unknown,
): AdminOrderAttachmentAuditListQuery {
  const parsed = adminOrderAttachmentAuditListQuerySchema.parse(input);

  return {
    page: parsed.page,
    pageSize: parsed.pageSize,
    status: parsed.status,
    shipperId: parsed.shipperId,
    keyword: parsed.keyword,
    createdFromIso: parsed.createdFromIso,
    createdToIso: parsed.createdToIso,
    hasMissingFiles: parsed.hasMissingFiles,
  };
}

export function parseCancelShipperOrderRequest(
  input: unknown,
): CancelShipperOrderRequest {
  return cancelShipperOrderSchema.parse(input);
}

export function parseBatchCancelAdminOrdersRequest(
  input: unknown,
): BatchCancelAdminOrdersRequest {
  const parsed = batchCancelAdminOrdersSchema.parse(input);

  return {
    items: parsed.items.map(
      (item): AdminBatchCancelOrderItem => ({
        orderId: item.orderId,
        baseUpdatedAtIso: item.baseUpdatedAtIso,
      }),
    ),
    reasonText: parsed.reasonText,
    description: parsed.description,
  };
}

export function parseCompleteShipperOrderRequest(
  input: unknown,
): CompleteShipperOrderRequest {
  return completeShipperOrderSchema.parse(input);
}

export function parseAdvanceShipperOrderStatusRequest(
  input: unknown,
): AdvanceShipperOrderStatusRequest {
  return advanceShipperOrderStatusSchema.parse(input);
}

export function parseAcceptShipperOrderQuoteRequest(
  input: unknown,
): AcceptShipperOrderQuoteRequest {
  return acceptShipperOrderQuoteSchema.parse(input);
}

export function parseAddShipperOrderBonusRequest(
  input: unknown,
): AddShipperOrderBonusRequest {
  return addShipperOrderBonusSchema.parse(input);
}

export function parseReviewShipperOrderChangeRequest(
  input: unknown,
): ReviewShipperOrderChangeRequest {
  return reviewShipperOrderChangeRequestSchema.parse(input);
}

export function parseListAdminOrderChangeRequestsQuery(
  input: unknown,
): ListAdminOrderChangeRequestsQuery {
  return listAdminOrderChangeRequestsQuerySchema.parse(input);
}

export function parseReportShipperOrderExceptionRequest(
  input: unknown,
): ReportShipperOrderExceptionRequest {
  return reportShipperOrderExceptionSchema.parse(input);
}

export function parseSubmitShipperOrderChangeRequest(
  input: unknown,
): SubmitShipperOrderChangeRequest {
  return submitShipperOrderChangeRequestSchema.parse(input);
}

export function parseSubmitShipperOrderEvaluationRequest(
  input: unknown,
): SubmitShipperOrderEvaluationRequest {
  return submitShipperOrderEvaluationSchema.parse(input);
}

function refineCoordinatePair(
  latitude: number | undefined,
  longitude: number | undefined,
  latitudePath: string,
  longitudePath: string,
  context: z.RefinementCtx,
) {
  if (latitude === undefined && longitude === undefined) {
    return;
  }

  if (latitude === undefined || longitude === undefined) {
    context.addIssue({
      code: 'custom',
      message: '经纬度必须成对传入',
      path: [latitude === undefined ? latitudePath : longitudePath],
    });
  }
}
