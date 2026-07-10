import { z } from 'zod';
import type {
  ConfirmFileUploadedRequest,
  ConfirmStorageCallbackRequest,
  CreateFileUploadIntentRequest,
} from './dto';

const allowedPurposes = [
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
