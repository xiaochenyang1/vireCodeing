import {
  PlatformApiError,
  platformGet,
  platformPost,
  type PlatformApiConfig,
} from './platformApiClient';

export type PlatformMobileUserType = 'shipper' | 'driver';
export type PlatformUserType = PlatformMobileUserType | 'admin';
export type PlatformVerificationPurpose = 'login' | 'register' | 'reset';

export type PlatformSendCodeRequest = {
  phone: string;
  purpose: PlatformVerificationPurpose;
};

export type PlatformSendCodeResult = {
  expireSeconds: number;
  devCode?: string;
};

export type PlatformAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type PlatformAuthenticatedUser = {
  id: string;
  phone: string;
  userType: PlatformMobileUserType;
};

export type PlatformLoginRequest = {
  phone: string;
  code: string;
  userType: PlatformMobileUserType;
  deviceId: string;
};

export type PlatformLoginResult = {
  user: PlatformAuthenticatedUser;
  tokens: PlatformAuthTokens;
};

export type PlatformPasswordLoginRequest = {
  phone: string;
  password: string;
  userType: PlatformMobileUserType;
  deviceId: string;
};

export type PlatformPasswordLoginResult = PlatformLoginResult;

export type PlatformRegisterRequest = PlatformLoginRequest & {
  password: string;
};

export type PlatformRegisterResult = PlatformLoginResult;

export type PlatformResetPasswordRequest = {
  phone: string;
  code: string;
  password: string;
};

export type PlatformResetPasswordResult = {
  reset: true;
};

export type PlatformChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};

export type PlatformChangePasswordResult = {
  changed: true;
};

export type PlatformAuthSessionRecord = {
  id: string;
  deviceId: string;
  createdAtIso: string;
  expiresAtIso: string;
};

export type PlatformAuthSessionListResult = {
  sessions: PlatformAuthSessionRecord[];
  total: number;
};

export type PlatformAdminAuthSessionListScope = 'current_admin' | 'all';

export type PlatformAdminAuthSessionRiskTag =
  | 'shared_device'
  | 'high_session_volume'
  | 'admin_multi_device';

export type PlatformAdminAuthSessionRiskLevel =
  | 'none'
  | 'warning'
  | 'high';

export type PlatformAdminAuthSessionRiskContext = {
  deviceSessionCount: number;
  deviceUserCount: number;
  userSessionCount: number;
};

export type PlatformAdminAuthSessionRiskSummary = {
  riskySessionCount: number;
  highRiskSessionCount: number;
  sharedDeviceCount: number;
  highSessionVolumeUserCount: number;
  adminMultiDeviceUserCount: number;
};

export type PlatformListAdminAuthSessionsQuery = {
  scope?: PlatformAdminAuthSessionListScope;
  userType?: PlatformUserType;
  keyword?: string;
  riskOnly?: boolean;
  riskTag?: PlatformAdminAuthSessionRiskTag;
  page?: number;
  pageSize?: number;
};

export type PlatformAdminAuthSessionRecord = {
  id: string;
  userId: string;
  userPhone: string;
  userType: PlatformUserType;
  deviceId: string;
  createdAtIso: string;
  expiresAtIso: string;
  isCurrentUser: boolean;
  riskLevel: PlatformAdminAuthSessionRiskLevel;
  riskTags: PlatformAdminAuthSessionRiskTag[];
  riskContext: PlatformAdminAuthSessionRiskContext;
};

export type PlatformAdminAuthSessionListResult = {
  sessions: PlatformAdminAuthSessionRecord[];
  total: number;
  page: number;
  pageSize: number;
  riskSummary: PlatformAdminAuthSessionRiskSummary;
};

export type PlatformAdminAuthSessionRevokeResult = {
  sessionId: string;
  revoked: boolean;
};

export type PlatformAdminAuthSessionGovernanceAuditAction =
  | 'revoke_session'
  | 'revoke_other_sessions'
  | 'revoke_account_sessions';

export type PlatformAdminAuthSessionGovernanceAuditResult =
  | 'revoked'
  | 'noop';

export type PlatformAdminAuthSessionGovernanceAuditSubject = {
  sessionId: string;
  userId: string;
  userPhone: string;
  userType: PlatformUserType;
  deviceId: string;
};

export type PlatformListAdminAuthSessionGovernanceAuditEventsQuery = {
  action?: PlatformAdminAuthSessionGovernanceAuditAction;
  result?: PlatformAdminAuthSessionGovernanceAuditResult;
  keyword?: string;
  page?: number;
  pageSize?: number;
};

export type PlatformAdminAuthSessionGovernanceAuditRecord = {
  id: string;
  actorAdminId: string;
  actorAdminPhone: string;
  action: PlatformAdminAuthSessionGovernanceAuditAction;
  result: PlatformAdminAuthSessionGovernanceAuditResult;
  requestedSessionId?: string;
  currentDeviceId?: string;
  revokedCount: number;
  subjects: PlatformAdminAuthSessionGovernanceAuditSubject[];
  createdAtIso: string;
};

export type PlatformAdminAuthSessionGovernanceAuditListResult = {
  events: PlatformAdminAuthSessionGovernanceAuditRecord[];
  total: number;
  page: number;
  pageSize: number;
};

export type PlatformRefreshRequest = {
  refreshToken: string;
  deviceId: string;
};

export type PlatformRevokeOtherSessionsRequest = {
  currentDeviceId: string;
};

export type PlatformRevokeOtherSessionsResult = {
  currentDeviceId: string;
  revokedCount: number;
};

export type PlatformRevokeOtherAdminSessionsRequest = {
  currentDeviceId: string;
};

export type PlatformRevokeOtherAdminSessionsResult = {
  currentDeviceId: string;
  revokedCount: number;
};

export type PlatformLogoutRequest = {
  refreshToken: string;
  deviceId: string;
};

export type PlatformLogoutResult = {
  loggedOut: true;
};

export function createPlatformAuthApi(config: PlatformApiConfig) {
  return {
    sendCode(request: PlatformSendCodeRequest) {
      return platformPost<PlatformSendCodeRequest, PlatformSendCodeResult>(
        config,
        '/auth/send-code',
        request,
        { includeAuth: false },
      );
    },
    login(request: PlatformLoginRequest) {
      return platformPost<PlatformLoginRequest, PlatformLoginResult>(
        config,
        '/auth/login',
        request,
        { includeAuth: false },
      );
    },
    passwordLogin(request: PlatformPasswordLoginRequest) {
      return platformPost<
        PlatformPasswordLoginRequest,
        PlatformPasswordLoginResult
      >(config, '/auth/password-login', request, { includeAuth: false });
    },
    register(request: PlatformRegisterRequest) {
      return platformPost<PlatformRegisterRequest, PlatformRegisterResult>(
        config,
        '/auth/register',
        request,
        { includeAuth: false },
      );
    },
    resetPassword(request: PlatformResetPasswordRequest) {
      return platformPost<
        PlatformResetPasswordRequest,
        PlatformResetPasswordResult
      >(config, '/auth/reset-password', request, { includeAuth: false });
    },
    changePassword(request: PlatformChangePasswordRequest) {
      return platformPost<
        PlatformChangePasswordRequest,
        PlatformChangePasswordResult
      >(config, '/auth/change-password', request);
    },
    listSessions() {
      return platformGet<PlatformAuthSessionListResult>(config, '/auth/sessions');
    },
    async listAdminAuthSessions(
      query: PlatformListAdminAuthSessionsQuery = {},
    ) {
      return platformGet<PlatformAdminAuthSessionListResult>(
        config,
        createAdminAuthSessionsPath(normalizeAdminAuthSessionListQuery(query)),
      );
    },
    async listAdminAuthSessionAuditEvents(
      query: PlatformListAdminAuthSessionGovernanceAuditEventsQuery = {},
    ) {
      return platformGet<PlatformAdminAuthSessionGovernanceAuditListResult>(
        config,
        createAdminAuthSessionAuditEventsPath(
          normalizeAdminAuthSessionGovernanceAuditListQuery(query),
        ),
      );
    },
    async revokeAdminAuthSession(sessionId: string) {
      return platformPost<undefined, PlatformAdminAuthSessionRevokeResult>(
        config,
        `/admin/auth/sessions/${normalizeAdminAuthSessionId(
          sessionId,
        )}/revoke`,
        undefined,
      );
    },
    async revokeOtherSessions(request: PlatformRevokeOtherSessionsRequest) {
      const normalizedRequest = normalizeRevokeOtherSessionsRequest(request);

      return platformPost<
        PlatformRevokeOtherSessionsRequest,
        PlatformRevokeOtherSessionsResult
      >(config, '/auth/sessions/revoke-other-sessions', normalizedRequest);
    },
    async revokeOtherAdminAuthSessions(
      request: PlatformRevokeOtherAdminSessionsRequest,
    ) {
      return platformPost<
        PlatformRevokeOtherAdminSessionsRequest,
        PlatformRevokeOtherAdminSessionsResult
      >(
        config,
        '/admin/auth/sessions/revoke-other-sessions',
        normalizeRevokeOtherAdminSessionsRequest(request),
      );
    },
    async refresh(request: PlatformRefreshRequest) {
      const normalizedRequest = normalizeTokenSessionRequest(request);

      return platformPost<PlatformRefreshRequest, PlatformAuthTokens>(
        config,
        '/auth/refresh',
        normalizedRequest,
        { includeAuth: false },
      );
    },
    async logout(request: PlatformLogoutRequest) {
      const normalizedRequest = normalizeTokenSessionRequest(request);

      return platformPost<PlatformLogoutRequest, PlatformLogoutResult>(
        config,
        '/auth/logout',
        normalizedRequest,
        { includeAuth: false },
      );
    },
    getMe() {
      return platformGet<PlatformAuthenticatedUser>(config, '/me');
    },
  };
}

function normalizeTokenSessionRequest(
  request: PlatformRefreshRequest | PlatformLogoutRequest,
): PlatformRefreshRequest | PlatformLogoutRequest {
  if (!isPlainObject(request)) {
    throwInvalidTokenSessionRequest('Auth token session request is invalid');
  }

  return {
    refreshToken: normalizeRefreshToken(request.refreshToken),
    deviceId: normalizeRequiredTrimmedString(
      request.deviceId,
      'Auth token session device id is invalid',
    ),
  };
}

function normalizeRevokeOtherSessionsRequest(
  request: PlatformRevokeOtherSessionsRequest,
): PlatformRevokeOtherSessionsRequest {
  if (!isPlainObject(request)) {
    throwInvalidTokenSessionRequest('Revoke other sessions request is invalid');
  }

  return {
    currentDeviceId: normalizeRequiredTrimmedString(
      request.currentDeviceId,
      'Current auth device id is invalid',
    ),
  };
}

function normalizeRevokeOtherAdminSessionsRequest(
  request: PlatformRevokeOtherAdminSessionsRequest,
): PlatformRevokeOtherAdminSessionsRequest {
  if (!isPlainObject(request)) {
    throwInvalidAdminAuthSessionRequest(
      'Revoke other admin auth sessions request is invalid',
    );
  }

  return {
    currentDeviceId: normalizeAdminRequiredTrimmedString(
      request.currentDeviceId,
      'Current admin auth device id is invalid',
    ),
  };
}

function normalizeAdminAuthSessionListQuery(
  query: PlatformListAdminAuthSessionsQuery,
) {
  if (!isPlainObject(query)) {
    throwInvalidAdminAuthSessionRequest(
      'Admin auth session query must be an object',
    );
  }

  const scope =
    query.scope === undefined
      ? 'current_admin'
      : normalizeAdminRequiredTrimmedString(
          query.scope,
          'Admin auth session scope is invalid',
        );
  const userType = normalizeOptionalAdminUserType(
    query.userType,
    'Admin auth session userType is invalid',
  );
  const keyword = normalizeAdminOptionalTrimmedString(
    query.keyword,
    60,
    'Admin auth session keyword is invalid',
  );
  const riskTag = normalizeOptionalAdminRiskTag(
    query.riskTag,
    'Admin auth session riskTag is invalid',
  );
  const page = normalizeAdminPageValue(query.page);
  const pageSize = normalizeAdminPageSizeValue(query.pageSize);

  if (scope !== 'current_admin' && scope !== 'all') {
    throwInvalidAdminAuthSessionRequest(
      'Admin auth session scope is invalid',
    );
  }

  if (query.riskOnly !== undefined && typeof query.riskOnly !== 'boolean') {
    throwInvalidAdminAuthSessionRequest(
      'Admin auth session riskOnly is invalid',
    );
  }

  return {
    scope,
    ...(userType ? { userType } : {}),
    ...(keyword ? { keyword } : {}),
    ...(query.riskOnly !== undefined ? { riskOnly: String(query.riskOnly) } : {}),
    ...(riskTag ? { riskTag } : {}),
    page: String(page),
    pageSize: String(pageSize),
  };
}

function normalizeAdminAuthSessionGovernanceAuditListQuery(
  query: PlatformListAdminAuthSessionGovernanceAuditEventsQuery,
) {
  if (!isPlainObject(query)) {
    throwInvalidAdminAuthSessionRequest(
      'Admin auth session governance audit query must be an object',
    );
  }

  const action = normalizeOptionalAdminAuthSessionGovernanceAuditAction(
    query.action,
    'Admin auth session governance audit action is invalid',
  );
  const result = normalizeOptionalAdminAuthSessionGovernanceAuditResult(
    query.result,
    'Admin auth session governance audit result is invalid',
  );
  const keyword = normalizeAdminOptionalTrimmedString(
    query.keyword,
    60,
    'Admin auth session governance audit keyword is invalid',
  );
  const page = normalizeAdminPageValue(query.page);
  const pageSize = normalizeAdminPageSizeValue(query.pageSize);

  return {
    ...(action ? { action } : {}),
    ...(result ? { result } : {}),
    ...(keyword ? { keyword } : {}),
    page: String(page),
    pageSize: String(pageSize),
  };
}

function normalizeAdminAuthSessionId(sessionId: unknown) {
  const normalizedSessionId = normalizeAdminRequiredTrimmedString(
    sessionId,
    'Admin auth session id is invalid',
  );

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalizedSessionId,
    )
  ) {
    throwInvalidAdminAuthSessionRequest('Admin auth session id is invalid');
  }

  return normalizedSessionId;
}

function normalizeRefreshToken(value: unknown) {
  const normalizedValue = normalizeRequiredTrimmedString(
    value,
    'Auth refresh token is invalid',
  );

  if (
    !/^refresh\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalizedValue,
    )
  ) {
    throwInvalidTokenSessionRequest('Auth refresh token is invalid');
  }

  return normalizedValue;
}

function normalizeRequiredTrimmedString(value: unknown, message: string) {
  if (typeof value !== 'string') {
    throwInvalidTokenSessionRequest(message);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throwInvalidTokenSessionRequest(message);
  }

  return normalizedValue;
}

function normalizeAdminRequiredTrimmedString(value: unknown, message: string) {
  if (typeof value !== 'string') {
    throwInvalidAdminAuthSessionRequest(message);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throwInvalidAdminAuthSessionRequest(message);
  }

  return normalizedValue;
}

function normalizeAdminOptionalTrimmedString(
  value: unknown,
  maxLength: number,
  message: string,
) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throwInvalidAdminAuthSessionRequest(message);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    return undefined;
  }

  if (normalizedValue.length > maxLength) {
    throwInvalidAdminAuthSessionRequest(message);
  }

  return normalizedValue;
}

function normalizeOptionalAdminUserType(value: unknown, message: string) {
  const normalizedValue = normalizeAdminOptionalTrimmedString(
    value,
    20,
    message,
  );

  if (
    normalizedValue !== undefined &&
    normalizedValue !== 'shipper' &&
    normalizedValue !== 'driver' &&
    normalizedValue !== 'admin'
  ) {
    throwInvalidAdminAuthSessionRequest(message);
  }

  return normalizedValue as PlatformUserType | undefined;
}

function normalizeOptionalAdminRiskTag(value: unknown, message: string) {
  const normalizedValue = normalizeAdminOptionalTrimmedString(
    value,
    30,
    message,
  );

  if (
    normalizedValue !== undefined &&
    normalizedValue !== 'shared_device' &&
    normalizedValue !== 'high_session_volume' &&
    normalizedValue !== 'admin_multi_device'
  ) {
    throwInvalidAdminAuthSessionRequest(message);
  }

  return normalizedValue as PlatformAdminAuthSessionRiskTag | undefined;
}

function normalizeOptionalAdminAuthSessionGovernanceAuditAction(
  value: unknown,
  message: string,
) {
  const normalizedValue = normalizeAdminOptionalTrimmedString(
    value,
    30,
    message,
  );

  if (
    normalizedValue !== undefined &&
    normalizedValue !== 'revoke_session' &&
    normalizedValue !== 'revoke_other_sessions' &&
    normalizedValue !== 'revoke_account_sessions'
  ) {
    throwInvalidAdminAuthSessionRequest(message);
  }

  return normalizedValue as
    | PlatformAdminAuthSessionGovernanceAuditAction
    | undefined;
}

function normalizeOptionalAdminAuthSessionGovernanceAuditResult(
  value: unknown,
  message: string,
) {
  const normalizedValue = normalizeAdminOptionalTrimmedString(
    value,
    20,
    message,
  );

  if (
    normalizedValue !== undefined &&
    normalizedValue !== 'revoked' &&
    normalizedValue !== 'noop'
  ) {
    throwInvalidAdminAuthSessionRequest(message);
  }

  return normalizedValue as
    | PlatformAdminAuthSessionGovernanceAuditResult
    | undefined;
}

function normalizeAdminPageValue(value: unknown) {
  if (value === undefined) {
    return 1;
  }

  if (!Number.isInteger(value) || Number(value) < 1) {
    throwInvalidAdminAuthSessionRequest('Admin auth session page is invalid');
  }

  return Number(value);
}

function normalizeAdminPageSizeValue(value: unknown) {
  if (value === undefined) {
    return 20;
  }

  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 50) {
    throwInvalidAdminAuthSessionRequest(
      'Admin auth session pageSize is invalid',
    );
  }

  return Number(value);
}

function createAdminAuthSessionsPath(
  query: ReturnType<typeof normalizeAdminAuthSessionListQuery>,
) {
  return `/admin/auth/sessions?${new URLSearchParams(query).toString()}`;
}

function createAdminAuthSessionAuditEventsPath(
  query: ReturnType<typeof normalizeAdminAuthSessionGovernanceAuditListQuery>,
) {
  return `/admin/auth/sessions/audit-events?${new URLSearchParams(query).toString()}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwInvalidTokenSessionRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_AUTH_TOKEN_SESSION_REQUEST_INVALID',
    0,
  );
}

function throwInvalidAdminAuthSessionRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_ADMIN_AUTH_SESSION_REQUEST_INVALID',
    0,
  );
}
