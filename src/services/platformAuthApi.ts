import {
  PlatformApiError,
  platformGet,
  platformPost,
  type PlatformApiConfig,
} from './platformApiClient';

const PLATFORM_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PlatformMobileUserType = 'shipper' | 'driver';
export type PlatformUserType = PlatformMobileUserType | 'admin';
export type PlatformMobileUserStatus = 'active' | 'disabled';
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

export type PlatformAdminAuthAccountFilters = {
  userType?: PlatformUserType;
  status?: PlatformMobileUserStatus;
  keyword?: string;
  riskOnly?: boolean;
  riskTag?: PlatformAdminAuthSessionRiskTag;
  riskLevel?: PlatformAdminAuthSessionRiskLevel;
};

export type PlatformListAdminAuthAccountsQuery =
  PlatformAdminAuthAccountFilters & {
    page?: number;
    pageSize?: number;
  };

export type PlatformAdminAuthAccountRecord = {
  userId: string;
  userPhone: string;
  userType: PlatformUserType;
  status: PlatformMobileUserStatus;
  createdAtIso: string;
  updatedAtIso: string;
  activeSessionCount: number;
  activeDeviceCount: number;
  latestSessionCreatedAtIso?: string;
  riskLevel: PlatformAdminAuthSessionRiskLevel;
  riskTags: PlatformAdminAuthSessionRiskTag[];
};

export type PlatformAdminAuthAccountSummary = {
  totalUserCount: number;
  activeUserCount: number;
  disabledUserCount: number;
  riskyUserCount: number;
  highRiskUserCount: number;
  activeSessionUserCount: number;
};

export type PlatformAdminAuthAccountListResult = {
  items: PlatformAdminAuthAccountRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: PlatformAdminAuthAccountSummary;
};

export type PlatformAdminAuthAccountDetail = {
  account: PlatformAdminAuthAccountRecord;
  activeSessions: PlatformAdminAuthSessionRecord[];
  recentAuditEvents: PlatformAdminAuthSessionGovernanceAuditRecord[];
};

export type PlatformAdminAuthAccountReportQuery =
  PlatformAdminAuthAccountFilters & {
    topAccountsLimit?: number;
    auditEventLimit?: number;
  };

export type PlatformAdminAuthAccountReportStatusBreakdownItem = {
  status: PlatformMobileUserStatus;
  userCount: number;
};

export type PlatformAdminAuthAccountReportUserTypeBreakdownItem = {
  userType: PlatformUserType;
  userCount: number;
  riskyUserCount: number;
  disabledUserCount: number;
  activeSessionUserCount: number;
};

export type PlatformAdminAuthAccountReportRiskTagBreakdownItem = {
  riskTag: PlatformAdminAuthSessionRiskTag;
  userCount: number;
};

export type PlatformAdminAuthAccountReportAuditActionBreakdownItem = {
  action: PlatformAdminAuthSessionGovernanceAuditAction;
  eventCount: number;
  revokedSessionCount: number;
};

export type PlatformAdminAuthAccountReportGovernanceAuditSummary = {
  totalEventCount: number;
  totalRevokedSessionCount: number;
  latestEventCreatedAtIso?: string;
  actionBreakdown: PlatformAdminAuthAccountReportAuditActionBreakdownItem[];
};

export type PlatformAdminAuthAccountReport = {
  generatedAtIso: string;
  filters: PlatformAdminAuthAccountFilters;
  summary: PlatformAdminAuthAccountSummary;
  statusBreakdown: PlatformAdminAuthAccountReportStatusBreakdownItem[];
  userTypeBreakdown: PlatformAdminAuthAccountReportUserTypeBreakdownItem[];
  riskTagBreakdown: PlatformAdminAuthAccountReportRiskTagBreakdownItem[];
  topRiskAccounts: PlatformAdminAuthAccountRecord[];
  governanceAuditSummary: PlatformAdminAuthAccountReportGovernanceAuditSummary;
  recentAuditEvents: PlatformAdminAuthSessionGovernanceAuditRecord[];
};

export type PlatformAdminAuthAccountsCsvExport = {
  filename: string;
  contentType: string;
  content: string;
};

export type PlatformBatchUpdateAdminAuthAccountStatusItem = {
  userId: string;
};

export type PlatformBatchUpdateAdminAuthAccountStatusRequest = {
  items: PlatformBatchUpdateAdminAuthAccountStatusItem[];
  status: PlatformMobileUserStatus;
};

export type PlatformUpdateAdminAuthAccountStatusRequest = {
  status: PlatformMobileUserStatus;
};

export type PlatformUpdateAdminAuthAccountStatusResult = {
  userId: string;
  status: PlatformMobileUserStatus;
  revokedSessionCount: number;
};

export type PlatformBatchUpdateAdminAuthAccountStatusResult = {
  status: PlatformMobileUserStatus;
  userIds: string[];
  updatedCount: number;
  revokedSessionCount: number;
  items: PlatformUpdateAdminAuthAccountStatusResult[];
};

export type PlatformBatchRevokeAdminAuthAccountSessionsItem = {
  userId: string;
  keepSessionId?: string;
};

export type PlatformBatchRevokeAdminAuthAccountSessionsRequest = {
  items: PlatformBatchRevokeAdminAuthAccountSessionsItem[];
};

export type PlatformRevokeAdminAuthAccountSessionsRequest = {
  keepSessionId?: string;
};

export type PlatformRevokeAdminAuthAccountSessionsResult = {
  userId: string;
  revokedCount: number;
  keepSessionId?: string;
};

export type PlatformBatchRevokeAdminAuthAccountSessionsResult = {
  userIds: string[];
  updatedCount: number;
  revokedCount: number;
  items: PlatformRevokeAdminAuthAccountSessionsResult[];
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
    async listAdminAuthAccounts(query: PlatformListAdminAuthAccountsQuery = {}) {
      return platformGet<PlatformAdminAuthAccountListResult>(
        config,
        createAdminAuthAccountsPath(normalizeAdminAuthAccountListQuery(query)),
      );
    },
    async getAdminAuthAccountReport(
      query: PlatformAdminAuthAccountReportQuery = {},
    ) {
      return platformGet<PlatformAdminAuthAccountReport>(
        config,
        createAdminAuthAccountReportPath(
          normalizeAdminAuthAccountReportQuery(query),
        ),
      );
    },
    async exportAdminAuthAccountsCsv(
      query: PlatformListAdminAuthAccountsQuery = {},
    ) {
      return platformGetText(
        config,
        createAdminAuthAccountsExportPath(
          normalizeAdminAuthAccountListQuery(query),
        ),
      );
    },
    async getAdminAuthAccountDetail(userId: string) {
      return platformGet<PlatformAdminAuthAccountDetail>(
        config,
        `/admin/auth/accounts/${encodeURIComponent(
          normalizeAdminAuthAccountId(userId),
        )}`,
      );
    },
    async updateAdminAuthAccountStatus(
      userId: string,
      request: PlatformUpdateAdminAuthAccountStatusRequest,
    ) {
      return platformPost<
        PlatformUpdateAdminAuthAccountStatusRequest,
        PlatformUpdateAdminAuthAccountStatusResult
      >(
        config,
        `/admin/auth/accounts/${encodeURIComponent(
          normalizeAdminAuthAccountId(userId),
        )}/status`,
        normalizeUpdateAdminAuthAccountStatusRequest(request),
      );
    },
    async batchUpdateAdminAuthAccountStatus(
      request: PlatformBatchUpdateAdminAuthAccountStatusRequest,
    ) {
      return platformPost<
        PlatformBatchUpdateAdminAuthAccountStatusRequest,
        PlatformBatchUpdateAdminAuthAccountStatusResult
      >(
        config,
        '/admin/auth/accounts/batch-status',
        normalizeBatchUpdateAdminAuthAccountStatusRequest(request),
      );
    },
    async revokeAdminAuthAccountSessions(
      userId: string,
      request: PlatformRevokeAdminAuthAccountSessionsRequest = {},
    ) {
      return platformPost<
        PlatformRevokeAdminAuthAccountSessionsRequest,
        PlatformRevokeAdminAuthAccountSessionsResult
      >(
        config,
        `/admin/auth/accounts/${encodeURIComponent(
          normalizeAdminAuthAccountId(userId),
        )}/revoke-sessions`,
        normalizeRevokeAdminAuthAccountSessionsRequest(request),
      );
    },
    async batchRevokeAdminAuthAccountSessions(
      request: PlatformBatchRevokeAdminAuthAccountSessionsRequest,
    ) {
      return platformPost<
        PlatformBatchRevokeAdminAuthAccountSessionsRequest,
        PlatformBatchRevokeAdminAuthAccountSessionsResult
      >(
        config,
        '/admin/auth/accounts/batch-revoke-sessions',
        normalizeBatchRevokeAdminAuthAccountSessionsRequest(request),
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

  if (!PLATFORM_UUID_PATTERN.test(normalizedSessionId)) {
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

function normalizeAdminAuthAccountListQuery(
  query: PlatformListAdminAuthAccountsQuery,
) {
  if (!isPlainObject(query)) {
    throwInvalidAdminAuthAccountRequest(
      'Admin auth account query must be an object',
    );
  }

  const filters = normalizeAdminAuthAccountFilters(query);
  const page = normalizeAdminAuthAccountPageValue(query.page);
  const pageSize = normalizeAdminAuthAccountPageSizeValue(query.pageSize);

  return {
    ...filters,
    page: String(page),
    pageSize: String(pageSize),
  };
}

function normalizeAdminAuthAccountReportQuery(
  query: PlatformAdminAuthAccountReportQuery,
) {
  if (!isPlainObject(query)) {
    throwInvalidAdminAuthAccountRequest(
      'Admin auth account report query must be an object',
    );
  }

  const filters = normalizeAdminAuthAccountFilters(query);
  const topAccountsLimit = normalizeAdminAuthAccountLimitValue(
    query.topAccountsLimit,
    5,
    'Admin auth account topAccountsLimit is invalid',
  );
  const auditEventLimit = normalizeAdminAuthAccountLimitValue(
    query.auditEventLimit,
    10,
    'Admin auth account auditEventLimit is invalid',
  );

  return {
    ...filters,
    topAccountsLimit: String(topAccountsLimit),
    auditEventLimit: String(auditEventLimit),
  };
}

function normalizeAdminAuthAccountFilters(
  query: PlatformAdminAuthAccountFilters,
) {
  const userType = normalizeOptionalAdminAuthAccountUserType(
    query.userType,
    'Admin auth account userType is invalid',
  );
  const status = normalizeOptionalAdminAuthAccountStatus(
    query.status,
    'Admin auth account status is invalid',
  );
  const keyword = normalizeAdminAuthAccountOptionalTrimmedString(
    query.keyword,
    60,
    'Admin auth account keyword is invalid',
  );
  const riskTag = normalizeOptionalAdminAuthAccountRiskTag(
    query.riskTag,
    'Admin auth account riskTag is invalid',
  );
  const riskLevel = normalizeOptionalAdminAuthAccountRiskLevel(
    query.riskLevel,
    'Admin auth account riskLevel is invalid',
  );

  if (query.riskOnly !== undefined && typeof query.riskOnly !== 'boolean') {
    throwInvalidAdminAuthAccountRequest(
      'Admin auth account riskOnly is invalid',
    );
  }

  return {
    ...(userType ? { userType } : {}),
    ...(status ? { status } : {}),
    ...(keyword ? { keyword } : {}),
    ...(query.riskOnly !== undefined ? { riskOnly: String(query.riskOnly) } : {}),
    ...(riskTag ? { riskTag } : {}),
    ...(riskLevel ? { riskLevel } : {}),
  };
}

function normalizeAdminAuthAccountId(userId: unknown) {
  const normalizedUserId = normalizeAdminAuthAccountRequiredTrimmedString(
    userId,
    'Admin auth account user id is invalid',
  );

  if (normalizedUserId.length > 120) {
    throwInvalidAdminAuthAccountRequest(
      'Admin auth account user id is invalid',
    );
  }

  return normalizedUserId;
}

function normalizeUpdateAdminAuthAccountStatusRequest(
  request: PlatformUpdateAdminAuthAccountStatusRequest,
): PlatformUpdateAdminAuthAccountStatusRequest {
  if (!isPlainObject(request)) {
    throwInvalidAdminAuthAccountRequest(
      'Admin auth account status update request must be an object',
    );
  }

  return {
    status: normalizeAdminAuthAccountStatus(
      request.status,
      'Admin auth account status is invalid',
    ),
  };
}

function normalizeBatchUpdateAdminAuthAccountStatusRequest(
  request: PlatformBatchUpdateAdminAuthAccountStatusRequest,
): PlatformBatchUpdateAdminAuthAccountStatusRequest {
  if (!isPlainObject(request)) {
    throwInvalidAdminAuthAccountRequest(
      'Admin auth account batch status update request must be an object',
    );
  }

  if (!Array.isArray(request.items) || !request.items.length || request.items.length > 50) {
    throwInvalidAdminAuthAccountRequest(
      'Admin auth account batch status update items are invalid',
    );
  }

  const items = request.items.map(item => {
    if (!isPlainObject(item)) {
      throwInvalidAdminAuthAccountRequest(
        'Admin auth account batch status update items are invalid',
      );
    }

    return {
      userId: normalizeAdminAuthAccountId(item.userId),
    };
  });
  const userIds = items.map(item => item.userId);

  if (new Set(userIds).size !== userIds.length) {
    throwInvalidAdminAuthAccountRequest(
      'Admin auth account batch status update user ids are duplicated',
    );
  }

  return {
    items,
    status: normalizeAdminAuthAccountStatus(
      request.status,
      'Admin auth account status is invalid',
    ),
  };
}

function normalizeRevokeAdminAuthAccountSessionsRequest(
  request: PlatformRevokeAdminAuthAccountSessionsRequest,
): PlatformRevokeAdminAuthAccountSessionsRequest {
  if (!isPlainObject(request)) {
    throwInvalidAdminAuthAccountRequest(
      'Admin auth account revoke sessions request must be an object',
    );
  }

  const keepSessionId = normalizeOptionalAdminAuthAccountSessionId(
    request.keepSessionId,
    'Admin auth account keepSessionId is invalid',
  );

  return keepSessionId ? { keepSessionId } : {};
}

function normalizeBatchRevokeAdminAuthAccountSessionsRequest(
  request: PlatformBatchRevokeAdminAuthAccountSessionsRequest,
): PlatformBatchRevokeAdminAuthAccountSessionsRequest {
  if (!isPlainObject(request)) {
    throwInvalidAdminAuthAccountRequest(
      'Admin auth account batch revoke sessions request must be an object',
    );
  }

  if (!Array.isArray(request.items) || !request.items.length || request.items.length > 50) {
    throwInvalidAdminAuthAccountRequest(
      'Admin auth account batch revoke sessions items are invalid',
    );
  }

  const items = request.items.map(item => {
    if (!isPlainObject(item)) {
      throwInvalidAdminAuthAccountRequest(
        'Admin auth account batch revoke sessions items are invalid',
      );
    }

    const keepSessionId = normalizeOptionalAdminAuthAccountSessionId(
      item.keepSessionId,
      'Admin auth account keepSessionId is invalid',
    );

    return {
      userId: normalizeAdminAuthAccountId(item.userId),
      ...(keepSessionId ? { keepSessionId } : {}),
    };
  });
  const userIds = items.map(item => item.userId);

  if (new Set(userIds).size !== userIds.length) {
    throwInvalidAdminAuthAccountRequest(
      'Admin auth account batch revoke sessions user ids are duplicated',
    );
  }

  return { items };
}

function normalizeAdminAuthAccountRequiredTrimmedString(
  value: unknown,
  message: string,
) {
  if (typeof value !== 'string') {
    throwInvalidAdminAuthAccountRequest(message);
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throwInvalidAdminAuthAccountRequest(message);
  }

  return normalizedValue;
}

function normalizeAdminAuthAccountOptionalTrimmedString(
  value: unknown,
  maxLength: number,
  message: string,
) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throwInvalidAdminAuthAccountRequest(message);
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return undefined;
  }

  if (normalizedValue.length > maxLength) {
    throwInvalidAdminAuthAccountRequest(message);
  }

  return normalizedValue;
}

function normalizeOptionalAdminAuthAccountUserType(
  value: unknown,
  message: string,
) {
  const normalizedValue = normalizeAdminAuthAccountOptionalTrimmedString(
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
    throwInvalidAdminAuthAccountRequest(message);
  }

  return normalizedValue as PlatformUserType | undefined;
}

function normalizeAdminAuthAccountStatus(value: unknown, message: string) {
  const normalizedValue = normalizeAdminAuthAccountRequiredTrimmedString(
    value,
    message,
  );

  if (normalizedValue !== 'active' && normalizedValue !== 'disabled') {
    throwInvalidAdminAuthAccountRequest(message);
  }

  return normalizedValue as PlatformMobileUserStatus;
}

function normalizeOptionalAdminAuthAccountStatus(
  value: unknown,
  message: string,
) {
  const normalizedValue = normalizeAdminAuthAccountOptionalTrimmedString(
    value,
    20,
    message,
  );

  if (
    normalizedValue !== undefined &&
    normalizedValue !== 'active' &&
    normalizedValue !== 'disabled'
  ) {
    throwInvalidAdminAuthAccountRequest(message);
  }

  return normalizedValue as PlatformMobileUserStatus | undefined;
}

function normalizeOptionalAdminAuthAccountRiskTag(
  value: unknown,
  message: string,
) {
  const normalizedValue = normalizeAdminAuthAccountOptionalTrimmedString(
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
    throwInvalidAdminAuthAccountRequest(message);
  }

  return normalizedValue as PlatformAdminAuthSessionRiskTag | undefined;
}

function normalizeOptionalAdminAuthAccountRiskLevel(
  value: unknown,
  message: string,
) {
  const normalizedValue = normalizeAdminAuthAccountOptionalTrimmedString(
    value,
    20,
    message,
  );

  if (
    normalizedValue !== undefined &&
    normalizedValue !== 'none' &&
    normalizedValue !== 'warning' &&
    normalizedValue !== 'high'
  ) {
    throwInvalidAdminAuthAccountRequest(message);
  }

  return normalizedValue as PlatformAdminAuthSessionRiskLevel | undefined;
}

function normalizeAdminAuthAccountPageValue(value: unknown) {
  if (value === undefined) {
    return 1;
  }

  if (!Number.isInteger(value) || Number(value) < 1) {
    throwInvalidAdminAuthAccountRequest('Admin auth account page is invalid');
  }

  return Number(value);
}

function normalizeAdminAuthAccountPageSizeValue(value: unknown) {
  if (value === undefined) {
    return 20;
  }

  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 50) {
    throwInvalidAdminAuthAccountRequest(
      'Admin auth account pageSize is invalid',
    );
  }

  return Number(value);
}

function normalizeAdminAuthAccountLimitValue(
  value: unknown,
  defaultValue: number,
  message: string,
) {
  if (value === undefined) {
    return defaultValue;
  }

  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 20) {
    throwInvalidAdminAuthAccountRequest(message);
  }

  return Number(value);
}

function normalizeOptionalAdminAuthAccountSessionId(
  value: unknown,
  message: string,
) {
  const normalizedValue = normalizeAdminAuthAccountOptionalTrimmedString(
    value,
    40,
    message,
  );

  if (normalizedValue !== undefined && !PLATFORM_UUID_PATTERN.test(normalizedValue)) {
    throwInvalidAdminAuthAccountRequest(message);
  }

  return normalizedValue;
}

function createAdminAuthAccountsPath(
  query: ReturnType<typeof normalizeAdminAuthAccountListQuery>,
) {
  return `/admin/auth/accounts?${new URLSearchParams(query).toString()}`;
}

function createAdminAuthAccountReportPath(
  query: ReturnType<typeof normalizeAdminAuthAccountReportQuery>,
) {
  return `/admin/auth/accounts/report?${new URLSearchParams(query).toString()}`;
}

function createAdminAuthAccountsExportPath(
  query: ReturnType<typeof normalizeAdminAuthAccountListQuery>,
) {
  return `/admin/auth/accounts/export?${new URLSearchParams(query).toString()}`;
}

async function platformGetText(
  config: PlatformApiConfig,
  path: string,
): Promise<PlatformAdminAuthAccountsCsvExport> {
  const accessToken = config.getAccessToken?.();
  const requestId = config.getRequestId?.();

  if (!accessToken) {
    throw new PlatformApiError(
      'Platform API access token is missing',
      'AUTH_ACCESS_TOKEN_MISSING',
      0,
    );
  }

  let response: Response;

  try {
    response = await fetch(createPlatformRequestUrl(config.baseUrl, path), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(requestId ? { 'x-request-id': requestId } : {}),
      },
    });
  } catch {
    throw new PlatformApiError(
      'Platform API network request failed',
      'NETWORK_ERROR',
      0,
    );
  }

  if (!response.ok) {
    throw new PlatformApiError(
      `Platform API request failed: ${response.status}`,
      'HTTP_ERROR',
      response.status,
    );
  }

  const content = await response.text();
  const contentType =
    response.headers.get('content-type') ?? 'text/plain; charset=utf-8';
  const contentDisposition = response.headers.get('content-disposition') ?? '';
  const filenameMatch = /filename="?([^";]+)"?/i.exec(contentDisposition);

  return {
    filename: filenameMatch?.[1] ?? 'admin-auth-accounts.csv',
    contentType,
    content,
  };
}

function createPlatformRequestUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
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

function throwInvalidAdminAuthAccountRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_ADMIN_AUTH_ACCOUNT_REQUEST_INVALID',
    0,
  );
}
