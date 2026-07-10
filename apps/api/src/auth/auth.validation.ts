import { z } from 'zod';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type {
  ChangePasswordRequest,
  LoginRequest,
  LogoutRequest,
  PasswordLoginRequest,
  RefreshRequest,
  RegisterRequest,
  ResetPasswordRequest,
  SendCodeRequest,
} from './dto';

const phoneSchema = z
  .string()
  .regex(/^1[3-9]\d{9}$/, '手机号格式不正确');
const codeSchema = z.string().regex(/^\d{6}$/, '验证码必须是 6 位数字');
const passwordMessage = '密码需至少 6 位并包含字母和数字';
const currentPasswordSchema = z.string().min(1, '当前密码不能为空');
const passwordSchema = z
  .string()
  .min(6, passwordMessage)
  .refine(value => /[A-Za-z]/.test(value) && /\d/.test(value), passwordMessage);
const deviceIdSchema = z.string().trim().min(1, '设备标识不能为空');
const refreshTokenSchema = z
  .string()
  .trim()
  .min(1, '刷新令牌不能为空')
  .regex(
    /^refresh\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    '刷新令牌格式不正确',
  );

export const sendCodeSchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(['login', 'register', 'reset'], {
    message: '验证码用途不支持',
  }),
});

export const loginSchema = z.object({
  phone: phoneSchema,
  code: codeSchema,
  userType: z.enum(['shipper', 'driver'], {
    message: '用户类型不支持',
  }),
  deviceId: deviceIdSchema,
});

export const registerSchema = loginSchema.extend({
  password: passwordSchema,
});

export const passwordLoginSchema = loginSchema
  .omit({
    code: true,
  })
  .extend({
    password: passwordSchema,
  });

export const resetPasswordSchema = z.object({
  phone: phoneSchema,
  code: codeSchema,
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: currentPasswordSchema,
  newPassword: passwordSchema,
});

export const tokenSessionSchema = z.object({
  refreshToken: refreshTokenSchema,
  deviceId: deviceIdSchema,
});

export function parseSendCodeRequest(input: unknown): SendCodeRequest {
  return parseAuthRequest(sendCodeSchema, input);
}

export function parseLoginRequest(input: unknown): LoginRequest {
  return parseAuthRequest(loginSchema, input);
}

export function parseRegisterRequest(input: unknown): RegisterRequest {
  return parseAuthRequest(registerSchema, input);
}

export function parsePasswordLoginRequest(input: unknown): PasswordLoginRequest {
  return parseAuthRequest(passwordLoginSchema, input);
}

export function parseResetPasswordRequest(input: unknown): ResetPasswordRequest {
  return parseAuthRequest(resetPasswordSchema, input);
}

export function parseChangePasswordRequest(
  input: unknown,
): ChangePasswordRequest {
  return parseAuthRequest(changePasswordSchema, input);
}

export function parseRefreshRequest(input: unknown): RefreshRequest {
  return parseAuthRequest(tokenSessionSchema, input);
}

export function parseLogoutRequest(input: unknown): LogoutRequest {
  return parseAuthRequest(tokenSessionSchema, input);
}

function parseAuthRequest<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);

  if (result.success) {
    return result.data;
  }

  throw new BusinessError(
    ApiErrorCode.VALIDATION_ERROR,
    result.error.issues[0]?.message ?? '请求参数不合法',
  );
}
