import { z } from 'zod';
import type {
  BatchReviewDriverCertificationRequest,
  ListDriverCertificationQuery,
  ReviewDriverCertificationRequest,
  SubmitDriverIdentityCertificationRequest,
  SubmitDriverVehicleCertificationRequest,
} from './dto';

const requiredTrimmedString = (
  minMessage: string,
  maxLength: number,
  maxMessage: string,
) => z.string().trim().min(1, minMessage).max(maxLength, maxMessage);

const fileIdSchema = (message: string) =>
  z.string().trim().min(1, message).max(120, message);

export const submitDriverIdentityCertificationSchema = z.object({
  realName: requiredTrimmedString(
    '司机姓名不能为空',
    30,
    '司机姓名最多 30 字',
  ),
  identityNumber: z
    .string()
    .trim()
    .regex(/^\d{17}[\dXx]$/, '身份证号不合法')
    .transform(value => value.toUpperCase()),
  identityFrontFileId: fileIdSchema('身份证人像面文件不能为空'),
  identityBackFileId: fileIdSchema('身份证国徽面文件不能为空'),
});

export const submitDriverVehicleCertificationSchema = z.object({
  plateNumber: requiredTrimmedString(
    '车牌号不能为空',
    20,
    '车牌号最多 20 字',
  ),
  vehicleType: requiredTrimmedString(
    '车辆类型不能为空',
    40,
    '车辆类型最多 40 字',
  ),
  vehicleLengthText: requiredTrimmedString(
    '车长不能为空',
    30,
    '车长最多 30 字',
  ),
  loadCapacityText: requiredTrimmedString(
    '载重不能为空',
    30,
    '载重最多 30 字',
  ),
  hasTailboard: z.boolean(),
  drivingLicenseFileId: fileIdSchema('行驶证文件不能为空'),
  driverLicenseFileId: fileIdSchema('驾驶证文件不能为空'),
  transportQualificationFileId: fileIdSchema(
    '道路运输从业资格证文件不能为空',
  ),
  operationPermitFileId: fileIdSchema('营运证文件不能为空'),
  vehiclePhotoFileId: fileIdSchema('车辆照片文件不能为空'),
});

export const reviewDriverCertificationSchema = z
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

export const batchReviewDriverCertificationSchema = z
  .object({
    driverIds: z
      .array(
        z.string().trim().min(1, '司机 ID 不能为空').max(120, '司机 ID 最多 120 字'),
      )
      .min(1, '至少选择 1 个司机')
      .max(50, '单次最多批量审核 50 个司机'),
    certificationType: z.enum(['identity', 'vehicle'], {
      error: '批量审核类型只能是 identity 或 vehicle',
    }),
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
    const normalizedIds = value.driverIds.map(driverId => driverId.trim());
    const uniqueDriverIds = new Set(normalizedIds);

    if (uniqueDriverIds.size !== normalizedIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['driverIds'],
        message: '批量审核司机 ID 不能重复',
      });
    }

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
      ? {
          driverIds: value.driverIds.map(driverId => driverId.trim()),
          certificationType: value.certificationType,
          status: 'approved' as const,
        }
      : {
          driverIds: value.driverIds.map(driverId => driverId.trim()),
          certificationType: value.certificationType,
          status: 'rejected' as const,
          rejectionReason: value.rejectionReason as string,
        },
  );

const listDriverCertificationQuerySchema = z.object({
  status: z
    .string()
    .trim()
    .optional()
    .default('reviewing')
    .pipe(
      z.enum(['reviewing', 'approved', 'rejected'], {
        error: '认证状态筛选只能是 reviewing、approved 或 rejected',
      }),
    ),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export function parseSubmitDriverIdentityCertificationRequest(
  input: unknown,
): SubmitDriverIdentityCertificationRequest {
  return submitDriverIdentityCertificationSchema.parse(input);
}

export function parseSubmitDriverVehicleCertificationRequest(
  input: unknown,
): SubmitDriverVehicleCertificationRequest {
  return submitDriverVehicleCertificationSchema.parse(input);
}

export function parseReviewDriverCertificationRequest(
  input: unknown,
): ReviewDriverCertificationRequest {
  return reviewDriverCertificationSchema.parse(input);
}

export function parseBatchReviewDriverCertificationRequest(
  input: unknown,
): BatchReviewDriverCertificationRequest {
  return batchReviewDriverCertificationSchema.parse(input);
}

export function parseListDriverCertificationQuery(
  input: unknown,
): ListDriverCertificationQuery {
  return listDriverCertificationQuerySchema.parse(input);
}
