import { z } from 'zod';
import type {
  SaveShipperEnterpriseVerificationRequest,
  SaveShipperIdentityVerificationRequest,
} from './dto';

export const saveShipperIdentityVerificationSchema = z.object({
  realName: z
    .string()
    .trim()
    .min(1, '真实姓名不能为空')
    .max(30, '真实姓名最多 30 个字符'),
  idNumber: z
    .string()
    .trim()
    .transform(value => value.toUpperCase())
    .refine(value => /^\d{17}[\dX]$/.test(value), '身份证号格式不正确'),
  identityFrontFileId: z
    .string()
    .trim()
    .min(1, '身份证正面文件不能为空')
    .max(120, '身份证正面文件标识过长'),
  identityBackFileId: z
    .string()
    .trim()
    .min(1, '身份证反面文件不能为空')
    .max(120, '身份证反面文件标识过长'),
  faceVerified: z
    .boolean()
    .refine(value => value, '请先完成人脸核验')
    .transform(() => true as const),
});

export const saveShipperEnterpriseVerificationSchema = z.object({
  enterpriseName: z
    .string()
    .trim()
    .min(1, '企业名称不能为空')
    .max(60, '企业名称最多 60 个字符'),
  creditCode: z
    .string()
    .trim()
    .transform(value => value.toUpperCase())
    .refine(
      value => /^[0-9A-Z]{15,20}$/.test(value),
      '统一社会信用代码格式不正确',
    ),
  legalName: z
    .string()
    .trim()
    .min(1, '法人姓名不能为空')
    .max(30, '法人姓名最多 30 个字符'),
  legalId: z
    .string()
    .trim()
    .transform(value => value.toUpperCase())
    .refine(value => /^\d{17}[\dX]$/.test(value), '法人身份证号格式不正确'),
  enterprisePhone: z
    .string()
    .trim()
    .refine(value => /^1[3-9]\d{9}$/.test(value), '企业联系电话格式不正确'),
  licenseFileId: z
    .string()
    .trim()
    .min(1, '营业执照文件不能为空')
    .max(120, '营业执照文件标识过长'),
});

export function parseSaveShipperIdentityVerificationRequest(
  input: unknown,
): SaveShipperIdentityVerificationRequest {
  return saveShipperIdentityVerificationSchema.parse(input);
}

export function parseSaveShipperEnterpriseVerificationRequest(
  input: unknown,
): SaveShipperEnterpriseVerificationRequest {
  return saveShipperEnterpriseVerificationSchema.parse(input);
}
