import { z } from 'zod';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type {
  AdminAuthAccountListQuery,
  AdminAuthAccountReportQuery,
  AdminAuthSessionGovernanceAuditListQuery,
  AdminAuthSessionListQuery,
  AdminPasswordLoginRequest,
  BatchRevokeAdminAuthAccountSessionsRequest,
  BatchUpdateAdminAuthAccountStatusRequest,
  ChangePasswordRequest,
  LoginRequest,
  LogoutRequest,
  PasswordLoginRequest,
  RefreshRequest,
  RegisterRequest,
  RevokeAdminAuthAccountSessionsRequest,
  RevokeOtherAdminSessionsRequest,
  RevokeOtherSelfAuthSessionsRequest,
  ResetPasswordRequest,
  SendCodeRequest,
  UpdateAdminAuthAccountStatusRequest,
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
const sessionRiskOnlySchema = z
  .union([z.boolean(), z.string(), z.undefined()])
  .transform(value => {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value === 'boolean') {
      return value;
    }

    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }

    return value;
  })
  .refine(
    value => value === undefined || typeof value === 'boolean',
    '风险筛选开关必须为 true 或 false',
  )
  .transform(value => value as boolean | undefined);
const adminAuthSessionIdSchema = z
  .string()
  .uuid('会话标识格式不正确');
export const adminAuthSessionListQuerySchema = z.object({
  scope: z
    .enum(['current_admin', 'all'], {
      message: '会话检索范围不支持',
    })
    .default('current_admin'),
  userType: z
    .enum(['shipper', 'driver', 'admin'], {
      message: '会话用户类型不支持',
    })
    .optional(),
  keyword: z
    .string()
    .trim()
    .max(60, '搜索关键字不能超过 60 个字符')
    .optional()
    .transform(value => value || undefined),
  riskOnly: sessionRiskOnlySchema.optional(),
  riskTag: z
    .enum(['shared_device', 'high_session_volume', 'admin_multi_device'], {
      message: '会话风险标签不支持',
    })
    .optional(),
  page: z.coerce.number().int('页码必须为整数').min(1, '页码必须至少为 1').default(1),
  pageSize: z.coerce
    .number()
    .int('每页数量必须为整数')
    .min(1, '每页数量必须在 1 到 50 之间')
    .max(50, '每页数量必须在 1 到 50 之间')
    .default(20),
});
export const adminAuthSessionGovernanceAuditListQuerySchema = z.object({
  action: z
    .enum(['revoke_session', 'revoke_other_sessions', 'revoke_account_sessions'], {
      message: '会话治理审计动作不支持',
    })
    .optional(),
  result: z
    .enum(['revoked', 'noop'], {
      message: '会话治理审计结果不支持',
    })
    .optional(),
  keyword: z
    .string()
    .trim()
    .max(60, '搜索关键字不能超过 60 个字符')
    .optional()
    .transform(value => value || undefined),
  page: z.coerce.number().int('页码必须为整数').min(1, '页码必须至少为 1').default(1),
  pageSize: z.coerce
    .number()
    .int('每页数量必须为整数')
    .min(1, '每页数量必须在 1 到 50 之间')
    .max(50, '每页数量必须在 1 到 50 之间')
    .default(20),
});
const adminAuthAccountIdSchema = z
  .string()
  .trim()
  .min(1, '账号标识不能为空')
  .max(120, '账号标识格式不正确');
const adminAuthAccountFilterShape = {
  userType: z
    .enum(['shipper', 'driver', 'admin'], {
      message: '账号用户类型不支持',
    })
    .optional(),
  status: z
    .enum(['active', 'disabled'], {
      message: '账号状态不支持',
    })
    .optional(),
  keyword: z
    .string()
    .trim()
    .max(60, '搜索关键字不能超过 60 个字符')
    .optional()
    .transform(value => value || undefined),
  riskOnly: sessionRiskOnlySchema.optional(),
  riskTag: z
    .enum(['shared_device', 'high_session_volume', 'admin_multi_device'], {
      message: '账号风险标签不支持',
    })
    .optional(),
  riskLevel: z
    .enum(['none', 'warning', 'high'], {
      message: '账号风险等级不支持',
    })
    .optional(),
} satisfies Record<string, z.ZodTypeAny>;
export const adminAuthAccountListQuerySchema = z.object({
  ...adminAuthAccountFilterShape,
  page: z.coerce.number().int('页码必须为整数').min(1, '页码必须至少为 1').default(1),
  pageSize: z.coerce
    .number()
    .int('每页数量必须为整数')
    .min(1, '每页数量必须在 1 到 50 之间')
    .max(50, '每页数量必须在 1 到 50 之间')
    .default(20),
});
export const adminAuthAccountReportQuerySchema = z.object({
  ...adminAuthAccountFilterShape,
  topAccountsLimit: z.coerce
    .number()
    .int('Top 风险账号数量必须为整数')
    .min(1, 'Top 风险账号数量必须在 1 到 20 之间')
    .max(20, 'Top 风险账号数量必须在 1 到 20 之间')
    .default(5),
  auditEventLimit: z.coerce
    .number()
    .int('审计事件数量必须为整数')
    .min(1, '审计事件数量必须在 1 到 20 之间')
    .max(20, '审计事件数量必须在 1 到 20 之间')
    .default(10),
});
export const revokeAdminAuthAccountSessionsSchema = z.object({
  keepSessionId: adminAuthSessionIdSchema.optional(),
});
export const updateAdminAuthAccountStatusSchema = z.object({
  status: z.enum(['active', 'disabled'], {
    message: '账号状态不支持',
  }),
});
export const batchUpdateAdminAuthAccountStatusSchema = z
  .object({
    items: z
      .array(
        z.object({
          userId: adminAuthAccountIdSchema,
        }),
      )
      .min(1, '至少选择 1 个账号')
      .max(50, '单次最多批量更新 50 个账号'),
    status: z.enum(['active', 'disabled'], {
      message: '账号状态不支持',
    }),
  })
  .superRefine((value, context) => {
    const userIds = value.items.map(item => item.userId);
    const uniqueUserIds = new Set(userIds);

    if (uniqueUserIds.size !== userIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: '批量更新账号 ID 不能重复',
      });
    }
  });
export const batchRevokeAdminAuthAccountSessionsSchema = z
  .object({
    items: z
      .array(
        z.object({
          userId: adminAuthAccountIdSchema,
          keepSessionId: adminAuthSessionIdSchema.optional(),
        }),
      )
      .min(1, '至少选择 1 个账号')
      .max(50, '单次最多批量撤销 50 个账号'),
  })
  .superRefine((value, context) => {
    const userIds = value.items.map(item => item.userId);
    const uniqueUserIds = new Set(userIds);

    if (uniqueUserIds.size !== userIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: '批量撤销会话账号 ID 不能重复',
      });
    }
  });
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

export const adminPasswordLoginSchema = passwordLoginSchema.omit({
  userType: true,
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

export const revokeOtherAdminSessionsSchema = z.object({
  currentDeviceId: deviceIdSchema,
});

export const revokeOtherSelfAuthSessionsSchema = revokeOtherAdminSessionsSchema;

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

export function parseAdminPasswordLoginRequest(
  input: unknown,
): AdminPasswordLoginRequest {
  return parseAuthRequest(adminPasswordLoginSchema, input);
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

export function parseAdminAuthSessionId(input: unknown): string {
  return parseAuthRequest(adminAuthSessionIdSchema, input);
}

export function parseAdminAuthSessionListQuery(
  input: unknown,
): AdminAuthSessionListQuery {
  return parseAuthRequest(adminAuthSessionListQuerySchema, input);
}

export function parseAdminAuthSessionGovernanceAuditListQuery(
  input: unknown,
): AdminAuthSessionGovernanceAuditListQuery {
  return parseAuthRequest(adminAuthSessionGovernanceAuditListQuerySchema, input);
}

export function parseAdminAuthAccountId(input: unknown): string {
  return parseAuthRequest(adminAuthAccountIdSchema, input);
}

export function parseAdminAuthAccountListQuery(
  input: unknown,
): AdminAuthAccountListQuery {
  return parseAuthRequest(adminAuthAccountListQuerySchema, input);
}

export function parseAdminAuthAccountReportQuery(
  input: unknown,
): AdminAuthAccountReportQuery {
  return parseAuthRequest(adminAuthAccountReportQuerySchema, input);
}

export function parseRevokeOtherAdminSessionsRequest(
  input: unknown,
): RevokeOtherAdminSessionsRequest {
  return parseAuthRequest(revokeOtherAdminSessionsSchema, input);
}

export function parseRevokeOtherSelfAuthSessionsRequest(
  input: unknown,
): RevokeOtherSelfAuthSessionsRequest {
  return parseAuthRequest(revokeOtherSelfAuthSessionsSchema, input);
}

export function parseRevokeAdminAuthAccountSessionsRequest(
  input: unknown,
): RevokeAdminAuthAccountSessionsRequest {
  return parseAuthRequest(revokeAdminAuthAccountSessionsSchema, input);
}

export function parseBatchRevokeAdminAuthAccountSessionsRequest(
  input: unknown,
): BatchRevokeAdminAuthAccountSessionsRequest {
  return parseAuthRequest(batchRevokeAdminAuthAccountSessionsSchema, input);
}

export function parseUpdateAdminAuthAccountStatusRequest(
  input: unknown,
): UpdateAdminAuthAccountStatusRequest {
  return parseAuthRequest(updateAdminAuthAccountStatusSchema, input);
}

export function parseBatchUpdateAdminAuthAccountStatusRequest(
  input: unknown,
): BatchUpdateAdminAuthAccountStatusRequest {
  return parseAuthRequest(batchUpdateAdminAuthAccountStatusSchema, input);
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
