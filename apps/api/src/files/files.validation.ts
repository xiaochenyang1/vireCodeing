import { z } from 'zod';
import type {
  ConfirmFileUploadedRequest,
  ConfirmStorageCallbackRequest,
  CreateFileUploadIntentRequest,
  FileMaintenanceReportQuery,
  ListFileMaintenanceFilesQuery,
  RunFileMaintenanceBatchGovernanceRequest,
} from './dto';

const allowedPurposes = [
  'avatar',
  'identity',
  'cargo',
  'exception',
  'evaluation',
  'receipt',
  'invoice',
] as const;
const allowedContentTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
const allowedStatuses = ['pending', 'uploaded', 'rejected'] as const;
const allowedMaintenanceBatchGovernanceActions = [
  'reject_pending',
  'delete_rejected_objects',
] as const;
const maxUploadBytes = 10 * 1024 * 1024;

export const createFileUploadIntentSchema = z.object({
  purpose: z.enum(allowedPurposes),
  fileName: z.string().trim().min(1, '文件名不能为空').max(120),
  contentType: z
    .string()
    .trim()
    .transform(value => value.toLowerCase())
    .pipe(z.enum(allowedContentTypes)),
  byteSize: z
    .number()
    .int('文件大小必须是整数')
    .positive('文件大小必须大于 0')
    .max(maxUploadBytes, '文件不能超过 10MB'),
});

export const confirmFileUploadedSchema = z.object({
  publicUrl: z
    .string()
    .trim()
    .optional()
    .transform(value => (value === '' ? undefined : value))
    .refine(
      value => value === undefined || /^https?:\/\//.test(value),
      '文件访问地址不合法',
    ),
});

export const confirmStorageCallbackSchema = z.object({
  fileId: z.string().trim().min(1).max(120),
  objectKey: z.string().trim().min(1).max(512),
  byteSize: z.number().int().positive(),
  contentType: z
    .string()
    .trim()
    .transform(value => value.toLowerCase())
    .pipe(z.enum(allowedContentTypes)),
  etag: z
    .string()
    .trim()
    .max(256)
    .optional()
    .transform(value => (value === '' ? undefined : value)),
  versionId: z
    .string()
    .trim()
    .max(256)
    .optional()
    .transform(value => (value === '' ? undefined : value)),
  signature: z.string().trim().min(1).max(128),
});

export const listMaintenanceFilesQuerySchema = z.object({
  status: z.enum(allowedStatuses).optional(),
  purpose: z.enum(allowedPurposes).optional(),
  ownerUserId: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform(value => (value === '' ? undefined : value)),
  keyword: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform(value => (value === '' ? undefined : value)),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const fileMaintenanceReportQuerySchema = z.object({
  topOwnersLimit: z.coerce.number().int().min(1).max(20).default(5),
});

export const runMaintenanceBatchGovernanceRequestSchema = z.object({
  action: z.enum(allowedMaintenanceBatchGovernanceActions),
  fileIds: z
    .array(z.string().trim().min(1).max(120))
    .min(1)
    .max(50)
    .transform(fileIds => Array.from(new Set(fileIds))),
});

export function parseCreateFileUploadIntentRequest(
  input: unknown,
): CreateFileUploadIntentRequest {
  return createFileUploadIntentSchema.parse(input);
}

export function parseConfirmFileUploadedRequest(
  input: unknown,
): ConfirmFileUploadedRequest {
  return confirmFileUploadedSchema.parse(input);
}

export function parseConfirmStorageCallbackRequest(
  input: unknown,
): ConfirmStorageCallbackRequest {
  return confirmStorageCallbackSchema.parse(input);
}

export function parseListMaintenanceFilesQuery(
  input: unknown,
): ListFileMaintenanceFilesQuery {
  const parsed = listMaintenanceFilesQuerySchema.parse(input);

  return {
    status: parsed.status,
    purpose: parsed.purpose,
    ownerUserId: parsed.ownerUserId,
    keyword: parsed.keyword,
    page: parsed.page,
    pageSize: parsed.pageSize,
  };
}

export function parseFileMaintenanceReportQuery(
  input: unknown,
): FileMaintenanceReportQuery {
  const parsed = fileMaintenanceReportQuerySchema.parse(input);

  return {
    topOwnersLimit: parsed.topOwnersLimit,
  };
}

export function parseRunFileMaintenanceBatchGovernanceRequest(
  input: unknown,
): RunFileMaintenanceBatchGovernanceRequest {
  return runMaintenanceBatchGovernanceRequestSchema.parse(input);
}
