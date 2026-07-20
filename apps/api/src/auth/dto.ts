export type VerificationPurpose = 'login' | 'register' | 'reset';
export type MobileUserType = 'shipper' | 'driver';
export type PlatformUserType = MobileUserType | 'admin';
export type MobileUserStatus = 'active' | 'disabled';

export type SendCodeRequest = {
  phone: string;
  purpose: VerificationPurpose;
};

export type SendCodeResult = {
  expireSeconds: number;
  devCode?: string;
};

export type LoginRequest = {
  phone: string;
  code: string;
  userType: MobileUserType;
  deviceId: string;
};

export type PasswordLoginRequest = {
  phone: string;
  password: string;
  userType: MobileUserType;
  deviceId: string;
};

export type AdminPasswordLoginRequest = {
  phone: string;
  password: string;
  deviceId: string;
};

export type RegisterRequest = {
  phone: string;
  code: string;
  userType: MobileUserType;
  deviceId: string;
  password: string;
};

export type ResetPasswordRequest = {
  phone: string;
  code: string;
  password: string;
};

export type ResetPasswordResult = {
  reset: true;
};

export type ChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};

export type ChangePasswordResult = {
  changed: true;
};

export type RefreshRequest = {
  refreshToken: string;
  deviceId: string;
};

export type LogoutRequest = {
  refreshToken: string;
  deviceId: string;
};

export type LogoutResult = {
  loggedOut: true;
};

export type AuthenticatedUser = {
  id: string;
  phone: string;
  userType: PlatformUserType;
};

export type AuthenticatedUserRecord = AuthenticatedUser & {
  status: MobileUserStatus;
  passwordHash?: string;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type LoginResult = {
  user: AuthenticatedUser;
  tokens: TokenPair;
};

export type RegisterResult = LoginResult;
export type PasswordLoginResult = LoginResult;
export type AdminPasswordLoginResult = LoginResult;

export type AdminAuthSessionListScope = 'current_admin' | 'all';

export type AdminAuthSessionRiskTag =
  | 'shared_device'
  | 'high_session_volume'
  | 'admin_multi_device';

export type AdminAuthSessionRiskLevel = 'none' | 'warning' | 'high';

export type AdminAuthSessionRiskContext = {
  deviceSessionCount: number;
  deviceUserCount: number;
  userSessionCount: number;
};

export type AdminAuthSessionRiskSummary = {
  riskySessionCount: number;
  highRiskSessionCount: number;
  sharedDeviceCount: number;
  highSessionVolumeUserCount: number;
  adminMultiDeviceUserCount: number;
};

export type AdminAuthSessionListQuery = {
  scope: AdminAuthSessionListScope;
  userType?: PlatformUserType;
  keyword?: string;
  riskOnly?: boolean;
  riskTag?: AdminAuthSessionRiskTag;
  page: number;
  pageSize: number;
};

export type AdminAuthSessionRecord = {
  id: string;
  userId: string;
  userPhone: string;
  userType: PlatformUserType;
  deviceId: string;
  createdAtIso: string;
  expiresAtIso: string;
  isCurrentUser: boolean;
  riskLevel: AdminAuthSessionRiskLevel;
  riskTags: AdminAuthSessionRiskTag[];
  riskContext: AdminAuthSessionRiskContext;
};

export type AdminAuthSessionListResult = {
  sessions: AdminAuthSessionRecord[];
  total: number;
  page: number;
  pageSize: number;
  riskSummary: AdminAuthSessionRiskSummary;
};

export type AdminAuthSessionRevokeResult = {
  sessionId: string;
  revoked: boolean;
};

export type AdminAuthSessionGovernanceAuditAction =
  | 'revoke_session'
  | 'revoke_other_sessions'
  | 'revoke_account_sessions';

export type AdminAuthSessionGovernanceAuditResult = 'revoked' | 'noop';

export type AdminAuthSessionGovernanceAuditSubject = {
  sessionId: string;
  userId: string;
  userPhone: string;
  userType: PlatformUserType;
  deviceId: string;
};

export type AdminAuthSessionGovernanceAuditListQuery = {
  action?: AdminAuthSessionGovernanceAuditAction;
  result?: AdminAuthSessionGovernanceAuditResult;
  keyword?: string;
  page: number;
  pageSize: number;
};

export type AdminAuthSessionGovernanceAuditRecord = {
  id: string;
  actorAdminId: string;
  actorAdminPhone: string;
  action: AdminAuthSessionGovernanceAuditAction;
  result: AdminAuthSessionGovernanceAuditResult;
  requestedSessionId?: string;
  currentDeviceId?: string;
  revokedCount: number;
  subjects: AdminAuthSessionGovernanceAuditSubject[];
  createdAtIso: string;
};

export type AdminAuthSessionGovernanceAuditListResult = {
  events: AdminAuthSessionGovernanceAuditRecord[];
  total: number;
  page: number;
  pageSize: number;
};

export type RevokeOtherAdminSessionsRequest = {
  currentDeviceId: string;
};

export type RevokeOtherAdminSessionsResult = {
  currentDeviceId: string;
  revokedCount: number;
};

export type AdminAuthAccountFilters = {
  userType?: PlatformUserType;
  status?: MobileUserStatus;
  keyword?: string;
  riskOnly?: boolean;
  riskTag?: AdminAuthSessionRiskTag;
  riskLevel?: AdminAuthSessionRiskLevel;
};

export type AdminAuthAccountListQuery = AdminAuthAccountFilters & {
  page: number;
  pageSize: number;
};

export type AdminAuthAccountRecord = {
  userId: string;
  userPhone: string;
  userType: PlatformUserType;
  status: MobileUserStatus;
  createdAtIso: string;
  updatedAtIso: string;
  activeSessionCount: number;
  activeDeviceCount: number;
  latestSessionCreatedAtIso?: string;
  riskLevel: AdminAuthSessionRiskLevel;
  riskTags: AdminAuthSessionRiskTag[];
};

export type AdminAuthAccountSummary = {
  totalUserCount: number;
  activeUserCount: number;
  disabledUserCount: number;
  riskyUserCount: number;
  highRiskUserCount: number;
  activeSessionUserCount: number;
};

export type AdminAuthAccountListResult = {
  items: AdminAuthAccountRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: AdminAuthAccountSummary;
};

export type AdminAuthAccountDetail = {
  account: AdminAuthAccountRecord;
  activeSessions: AdminAuthSessionRecord[];
  recentAuditEvents: AdminAuthSessionGovernanceAuditRecord[];
};

export type AdminAuthAccountReportQuery = AdminAuthAccountFilters & {
  topAccountsLimit: number;
  auditEventLimit: number;
};

export type AdminAuthAccountReportStatusBreakdownItem = {
  status: MobileUserStatus;
  userCount: number;
};

export type AdminAuthAccountReportUserTypeBreakdownItem = {
  userType: PlatformUserType;
  userCount: number;
  riskyUserCount: number;
  disabledUserCount: number;
  activeSessionUserCount: number;
};

export type AdminAuthAccountReportRiskTagBreakdownItem = {
  riskTag: AdminAuthSessionRiskTag;
  userCount: number;
};

export type AdminAuthAccountReportAuditActionBreakdownItem = {
  action: AdminAuthSessionGovernanceAuditAction;
  eventCount: number;
  revokedSessionCount: number;
};

export type AdminAuthAccountReportGovernanceAuditSummary = {
  totalEventCount: number;
  totalRevokedSessionCount: number;
  latestEventCreatedAtIso?: string;
  actionBreakdown: AdminAuthAccountReportAuditActionBreakdownItem[];
};

export type AdminAuthAccountReport = {
  generatedAtIso: string;
  filters: AdminAuthAccountFilters;
  summary: AdminAuthAccountSummary;
  statusBreakdown: AdminAuthAccountReportStatusBreakdownItem[];
  userTypeBreakdown: AdminAuthAccountReportUserTypeBreakdownItem[];
  riskTagBreakdown: AdminAuthAccountReportRiskTagBreakdownItem[];
  topRiskAccounts: AdminAuthAccountRecord[];
  governanceAuditSummary: AdminAuthAccountReportGovernanceAuditSummary;
  recentAuditEvents: AdminAuthSessionGovernanceAuditRecord[];
};

export type UpdateAdminAuthAccountStatusRequest = {
  status: MobileUserStatus;
};

export type UpdateAdminAuthAccountStatusResult = {
  userId: string;
  status: MobileUserStatus;
  revokedSessionCount: number;
};

export type RevokeAdminAuthAccountSessionsRequest = {
  keepSessionId?: string;
};

export type RevokeAdminAuthAccountSessionsResult = {
  userId: string;
  revokedCount: number;
  keepSessionId?: string;
};
