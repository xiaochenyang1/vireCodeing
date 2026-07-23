import { ApiErrorCode, BusinessError } from '../common/errors';
import type {
  AdminAuthAccountFilters,
  AdminAuthAccountDetail,
  AdminAuthAccountListQuery,
  AdminAuthAccountListResult,
  AdminAuthAccountRecord,
  AdminAuthAccountReport,
  AdminAuthAccountSummary,
  AdminAuthSessionGovernanceAuditAction,
  AdminAuthSessionGovernanceAuditListQuery,
  AdminAuthSessionGovernanceAuditListResult,
  AdminAuthSessionGovernanceAuditRecord,
  AdminAuthSessionGovernanceAuditSubject,
  AdminAuthSessionRecord,
  AdminAuthSessionRiskTag,
  AdminAuthSessionListQuery,
  AdminAuthSessionListResult,
  AdminAuthSessionRevokeResult,
  AdminAuthAccountReportQuery,
  AdminPasswordLoginRequest,
  AdminPasswordLoginResult,
  AuthenticatedUser,
  AuthenticatedUserRecord,
  BatchRevokeAdminAuthAccountSessionsRequest,
  BatchRevokeAdminAuthAccountSessionsResult,
  BatchUpdateAdminAuthAccountStatusRequest,
  BatchUpdateAdminAuthAccountStatusResult,
  ChangePasswordRequest,
  ChangePasswordResult,
  LoginRequest,
  LoginResult,
  LogoutRequest,
  LogoutResult,
  MobileUserStatus,
  PasswordLoginRequest,
  PasswordLoginResult,
  PlatformUserType,
  RefreshRequest,
  RevokeAdminAuthAccountSessionsResult,
  RevokeOtherAdminSessionsResult,
  RevokeOtherSelfAuthSessionsResult,
  RegisterRequest,
  RegisterResult,
  ResetPasswordRequest,
  ResetPasswordResult,
  SendCodeRequest,
  SendCodeResult,
  SelfAuthSessionListResult,
  TokenPair,
  UpdateAdminAuthAccountStatusResult,
  VerificationPurpose,
} from './dto';
import {
  buildAdminAuthSessionRiskProfile,
  summarizeAdminAuthSessionRiskRecords,
} from './admin-auth-session-risk';
import {
  type AuthRepository,
  InMemoryAuthRepository,
  type PlatformUserDirectoryRecord,
  type RefreshSessionRecord,
  type SaveAdminAuthSessionGovernanceAuditEventInput,
} from './auth.repository';
import { TokenService } from './token.service';
import {
  DevelopmentVerificationCodeSender,
  type VerificationCodeSender,
} from './verification-code.sender';
import {
  type VerificationCodeStore,
  verificationCodeMatches,
} from './verification-code.store';
import { hashPassword, verifyPassword } from './password-hasher';

export type VerificationCodeConfig = {
  exposeDevCode: boolean;
  generateCode: () => string;
  ttlSeconds: number;
};

const developmentVerificationCodeConfig: VerificationCodeConfig = {
  exposeDevCode: true,
  generateCode: () => '123456',
  ttlSeconds: 300,
};

const verificationCodeCooldownSeconds = 60;
const verificationCodeHourlyLimit = 5;
const defaultAdminAuthSessionListQuery: AdminAuthSessionListQuery = {
  scope: 'current_admin',
  page: 1,
  pageSize: 20,
};
const defaultAdminAuthSessionGovernanceAuditListQuery: AdminAuthSessionGovernanceAuditListQuery =
  {
    page: 1,
    pageSize: 20,
  };
const defaultAdminAuthAccountListQuery: AdminAuthAccountListQuery = {
  page: 1,
  pageSize: 20,
};
const defaultAdminAuthAccountReportQuery: AdminAuthAccountReportQuery = {
  topAccountsLimit: 5,
  auditEventLimit: 10,
};
const adminAuthAccountUserTypes: PlatformUserType[] = [
  'shipper',
  'driver',
  'admin',
];
const adminAuthAccountRiskTags: AdminAuthSessionRiskTag[] = [
  'shared_device',
  'high_session_volume',
  'admin_multi_device',
];
const adminAuthSessionGovernanceActions: AdminAuthSessionGovernanceAuditAction[] =
  ['revoke_session', 'revoke_other_sessions', 'revoke_account_sessions'];

type AdminAuthSessionBaseRecord = Omit<
  AdminAuthSessionRecord,
  'riskLevel' | 'riskTags' | 'riskContext'
>;

type AdminAuthAccountDirectory = {
  filteredRecords: AdminAuthAccountRecord[];
  deviceIdsByUserId: Map<string, string[]>;
};

export class AuthService {
  constructor(
    private readonly codeStore: VerificationCodeStore,
    private readonly tokenService: TokenService,
    private readonly now: () => Date = () => new Date(),
    private readonly authRepository: AuthRepository = new InMemoryAuthRepository(
      now,
    ),
    private readonly verificationCodeConfig: VerificationCodeConfig = developmentVerificationCodeConfig,
    private readonly codeSender: VerificationCodeSender = new DevelopmentVerificationCodeSender(),
  ) {}

  async sendCode(request: SendCodeRequest): Promise<SendCodeResult> {
    await this.assertVerificationCodeSendAllowed(request);

    const expiresAt = new Date(
      this.now().getTime() + this.verificationCodeConfig.ttlSeconds * 1000,
    );
    const code = this.verificationCodeConfig.generateCode();

    await this.codeStore.saveCode({
      phone: request.phone,
      purpose: request.purpose,
      code,
      expiresAt,
    });
    try {
      await this.codeSender.sendCode({
        phone: request.phone,
        purpose: request.purpose,
        code,
        expiresAt,
      });
    } catch {
      await this.revokeUndeliveredCode(request, code);

      throw new BusinessError(
        ApiErrorCode.AUTH_CODE_DELIVERY_FAILED,
        '验证码发送失败',
      );
    }

    const result: SendCodeResult = {
      expireSeconds: this.verificationCodeConfig.ttlSeconds,
    };

    if (this.verificationCodeConfig.exposeDevCode) {
      result.devCode = code;
    }

    return result;
  }

  private async revokeUndeliveredCode(
    request: SendCodeRequest,
    code: string,
  ): Promise<void> {
    const latestCode = await this.codeStore.findLatestUnconsumedCode(
      request.phone,
      request.purpose,
    );

    if (latestCode && verificationCodeMatches(latestCode, code)) {
      await this.codeStore.consumeCode(latestCode);
    }
  }

  private async assertVerificationCodeSendAllowed(
    request: SendCodeRequest,
  ): Promise<void> {
    const now = this.now();
    const recentCodes = await this.codeStore.findCodesCreatedSince(
      request.phone,
      request.purpose,
      new Date(now.getTime() - 60 * 60 * 1000),
    );
    const latestCode = recentCodes.at(-1);

    if (
      latestCode?.createdAt &&
      now.getTime() - latestCode.createdAt.getTime() <
        verificationCodeCooldownSeconds * 1000
    ) {
      throw new BusinessError(
        ApiErrorCode.AUTH_CODE_RATE_LIMITED,
        '验证码发送过于频繁',
      );
    }

    if (recentCodes.length >= verificationCodeHourlyLimit) {
      throw new BusinessError(
        ApiErrorCode.AUTH_CODE_RATE_LIMITED,
        '验证码发送过于频繁',
      );
    }
  }

  async login(request: LoginRequest): Promise<LoginResult> {
    return this.authenticateWithCode(request, 'login');
  }

  async register(request: RegisterRequest): Promise<RegisterResult> {
    return this.authenticateWithCode(request, 'register');
  }

  async passwordLogin(
    request: PasswordLoginRequest,
  ): Promise<PasswordLoginResult> {
    const existingUser = await this.authRepository.findPlatformUserByPhone(
      request.phone,
    );

    if (!existingUser?.passwordHash) {
      throw new BusinessError(
        ApiErrorCode.AUTH_PASSWORD_INVALID,
        '手机号或密码错误',
      );
    }

    const passwordMatches = await verifyPassword(
      request.password,
      existingUser.passwordHash,
    );

    if (!passwordMatches) {
      throw new BusinessError(
        ApiErrorCode.AUTH_PASSWORD_INVALID,
        '手机号或密码错误',
      );
    }

    this.assertUserActive(existingUser);
    assertMobileUserType(existingUser);

    const user = await this.authRepository.upsertMobileUser({
      phone: request.phone,
      userType: request.userType,
    });

    return this.issueLoginResult(user, request.deviceId);
  }

  async adminPasswordLogin(
    request: AdminPasswordLoginRequest,
  ): Promise<AdminPasswordLoginResult> {
    const existingUser = await this.authRepository.findPlatformUserByPhone(
      request.phone,
    );

    if (!existingUser?.passwordHash) {
      throw new BusinessError(
        ApiErrorCode.AUTH_PASSWORD_INVALID,
        '手机号或密码错误',
      );
    }

    const passwordMatches = await verifyPassword(
      request.password,
      existingUser.passwordHash,
    );

    if (!passwordMatches || existingUser.userType !== 'admin') {
      throw new BusinessError(
        ApiErrorCode.AUTH_PASSWORD_INVALID,
        '手机号或密码错误',
      );
    }

    this.assertUserActive(existingUser);

    return this.issueLoginResult(existingUser, request.deviceId);
  }

  async resetPassword(
    request: ResetPasswordRequest,
  ): Promise<ResetPasswordResult> {
    await this.consumeValidVerificationCode(
      request.phone,
      'reset',
      request.code,
    );

    const existingUser = await this.authRepository.findPlatformUserByPhone(
      request.phone,
    );

    if (!existingUser) {
      throw new BusinessError(
        ApiErrorCode.AUTH_PASSWORD_RESET_INVALID,
        '手机号或验证码错误',
      );
    }

    this.assertUserActive(existingUser);

    await this.authRepository.upsertMobileUser({
      phone: existingUser.phone,
      userType: assertMobileUserType(existingUser),
      passwordHash: await hashPassword(request.password),
    });
    await this.authRepository.revokeUserRefreshSessions(
      existingUser.id,
      this.now(),
    );

    return {
      reset: true,
    };
  }

  async changePassword(
    userId: string,
    request: ChangePasswordRequest,
  ): Promise<ChangePasswordResult> {
    const existingUser = await this.authRepository.findUserById(userId);

    if (!existingUser) {
      throw new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      );
    }

    this.assertUserActive(existingUser);

    if (!existingUser.passwordHash) {
      throw new BusinessError(
        ApiErrorCode.AUTH_PASSWORD_INVALID,
        '当前密码错误',
      );
    }

    const passwordMatches = await verifyPassword(
      request.currentPassword,
      existingUser.passwordHash,
    );

    if (!passwordMatches) {
      throw new BusinessError(
        ApiErrorCode.AUTH_PASSWORD_INVALID,
        '当前密码错误',
      );
    }

    await this.authRepository.upsertMobileUser({
      phone: existingUser.phone,
      userType: assertMobileUserType(existingUser),
      passwordHash: await hashPassword(request.newPassword),
    });
    await this.authRepository.revokeUserRefreshSessions(
      existingUser.id,
      this.now(),
    );

    return {
      changed: true,
    };
  }

  private async authenticateWithCode(
    request: LoginRequest | RegisterRequest,
    purpose: Extract<VerificationPurpose, 'login' | 'register'>,
  ): Promise<LoginResult> {
    await this.consumeValidVerificationCode(
      request.phone,
      purpose,
      request.code,
    );

    const existingUser = await this.authRepository.findPlatformUserByPhone(
      request.phone,
    );

    if (existingUser) {
      this.assertUserActive(existingUser);
      assertMobileUserType(existingUser);
    }

    const passwordHash =
      purpose === 'register'
        ? await hashPassword((request as RegisterRequest).password)
        : undefined;
    const user = await this.authRepository.upsertMobileUser({
      phone: request.phone,
      userType: request.userType,
      passwordHash,
    });

    return this.issueLoginResult(user, request.deviceId);
  }

  private async consumeValidVerificationCode(
    phone: string,
    purpose: Extract<VerificationPurpose, 'login' | 'register' | 'reset'>,
    code: string,
  ): Promise<void> {
    const activeCode = await this.codeStore.findActiveCode(phone, purpose);

    if (!activeCode || !verificationCodeMatches(activeCode, code)) {
      const latestCode = await this.codeStore.findLatestUnconsumedCode(
        phone,
        purpose,
      );

      if (
        latestCode &&
        verificationCodeMatches(latestCode, code) &&
        latestCode.expiresAt.getTime() <= this.now().getTime()
      ) {
        throw new BusinessError(
          ApiErrorCode.AUTH_CODE_EXPIRED,
          '验证码已过期',
        );
      }

      throw new BusinessError(ApiErrorCode.AUTH_CODE_INVALID, '验证码错误');
    }

    await this.codeStore.consumeCode(activeCode);
  }

  private async issueLoginResult(
    user: AuthenticatedUserRecord,
    deviceId: string,
  ): Promise<LoginResult> {
    this.assertUserActive(user);

    const tokens = this.tokenService.issueTokenPair(user.id);
    await this.authRepository.revokeUserDeviceRefreshSessions(
      user.id,
      deviceId,
      this.now(),
    );
    await this.authRepository.saveRefreshSession({
      userId: user.id,
      refreshToken: tokens.refreshToken,
      deviceId,
      expiresAt: this.tokenService.getRefreshTokenExpiresAt(
        tokens.refreshToken,
        this.now(),
      ),
    });

    return {
      user: toAuthenticatedUser(user),
      tokens,
    };
  }

  async refresh(request: RefreshRequest): Promise<TokenPair> {
    try {
      const activeSession =
        await this.authRepository.findActiveRefreshSession(
          request.refreshToken,
          request.deviceId,
        );

      if (!activeSession) {
        throw new Error('Refresh session not active');
      }

      const user = await this.authRepository.findUserById(
        activeSession.userId,
      );

      if (!user) {
        await this.authRepository.revokeRefreshSession(
          request.refreshToken,
          request.deviceId,
          this.now(),
        );

        throw new Error('Refresh session user not found');
      }

      if (user.status === 'disabled') {
        await this.authRepository.revokeRefreshSession(
          request.refreshToken,
          request.deviceId,
          this.now(),
        );

        throw new BusinessError(
          ApiErrorCode.AUTH_USER_DISABLED,
          '账号已禁用',
        );
      }

      const tokens = this.tokenService.issueTokenPair(activeSession.userId);

      await this.authRepository.revokeRefreshSession(
        request.refreshToken,
        request.deviceId,
        this.now(),
      );
      await this.authRepository.saveRefreshSession({
        userId: activeSession.userId,
        refreshToken: tokens.refreshToken,
        deviceId: request.deviceId,
        expiresAt: this.tokenService.getRefreshTokenExpiresAt(
          tokens.refreshToken,
          this.now(),
        ),
      });

      return tokens;
    } catch (error) {
      if (error instanceof BusinessError) {
        throw error;
      }

      throw new BusinessError(
        ApiErrorCode.AUTH_REFRESH_TOKEN_INVALID,
        '刷新令牌无效',
      );
    }
  }

  async listUserSessions(
    userId: string,
    query: AdminAuthSessionListQuery = defaultAdminAuthSessionListQuery,
  ): Promise<AdminAuthSessionListResult> {
    const effectiveQuery = {
      ...defaultAdminAuthSessionListQuery,
      ...query,
    };
    const sessions =
      effectiveQuery.scope === 'all' &&
      this.authRepository.listAllActiveRefreshSessions
        ? await this.authRepository.listAllActiveRefreshSessions()
        : await this.authRepository.listActiveUserRefreshSessions(userId);
    const enrichedRecords = await this.buildAdminAuthSessionRecords(
      userId,
      sessions,
    );
    const filtered = enrichedRecords.filter(session =>
      matchesAdminAuthSessionQuery(session, effectiveQuery),
    );
    const start = (effectiveQuery.page - 1) * effectiveQuery.pageSize;
    const paged = filtered
      .slice(start, start + effectiveQuery.pageSize)
      .map(maskAdminAuthSessionRecord);

    return {
      sessions: paged,
      total: filtered.length,
      page: effectiveQuery.page,
      pageSize: effectiveQuery.pageSize,
      riskSummary: summarizeAdminAuthSessionRiskRecords(filtered),
    };
  }

  async listSelfAuthSessions(userId: string): Promise<SelfAuthSessionListResult> {
    const sessions = await this.authRepository.listActiveUserRefreshSessions(
      userId,
    );

    return {
      sessions: sessions.map(session => ({
        id: session.id,
        deviceId: session.deviceId,
        createdAtIso: session.createdAt.toISOString(),
        expiresAtIso: session.expiresAt.toISOString(),
      })),
      total: sessions.length,
    };
  }

  async listSessionGovernanceAuditEvents(
    query: AdminAuthSessionGovernanceAuditListQuery = defaultAdminAuthSessionGovernanceAuditListQuery,
  ): Promise<AdminAuthSessionGovernanceAuditListResult> {
    const effectiveQuery = {
      ...defaultAdminAuthSessionGovernanceAuditListQuery,
      ...query,
    };
    const records = await this.listAllSessionGovernanceAuditRecords();
    const filtered = records.filter(event =>
      matchesAdminAuthSessionGovernanceAuditQuery(event, effectiveQuery),
    );
    const start = (effectiveQuery.page - 1) * effectiveQuery.pageSize;
    const paged = filtered
      .slice(start, start + effectiveQuery.pageSize)
      .map(maskAdminAuthSessionGovernanceAuditRecord);

    return {
      events: paged,
      total: filtered.length,
      page: effectiveQuery.page,
      pageSize: effectiveQuery.pageSize,
    };
  }

  async listAdminAuthAccounts(
    query: AdminAuthAccountListQuery = defaultAdminAuthAccountListQuery,
  ): Promise<AdminAuthAccountListResult> {
    const effectiveQuery = {
      ...defaultAdminAuthAccountListQuery,
      ...query,
    };
    const { filteredRecords } = await this.buildAdminAuthAccountDirectory(
      effectiveQuery,
    );
    const start = (effectiveQuery.page - 1) * effectiveQuery.pageSize;
    const paged = filteredRecords
      .slice(start, start + effectiveQuery.pageSize)
      .map(maskAdminAuthAccountRecord);

    return {
      items: paged,
      total: filteredRecords.length,
      page: effectiveQuery.page,
      pageSize: effectiveQuery.pageSize,
      summary: summarizeAdminAuthAccounts(filteredRecords),
    };
  }

  async getAdminAuthAccountReport(
    query: AdminAuthAccountReportQuery = defaultAdminAuthAccountReportQuery,
  ): Promise<AdminAuthAccountReport> {
    const effectiveQuery = {
      ...defaultAdminAuthAccountReportQuery,
      ...query,
    };
    const { filteredRecords } = await this.buildAdminAuthAccountDirectory(
      effectiveQuery,
    );
    const filteredUserIds = new Set(filteredRecords.map(record => record.userId));
    const auditRecords = (await this.listAllSessionGovernanceAuditRecords())
      .filter(event =>
        event.subjects.some(subject => filteredUserIds.has(subject.userId)),
      );

    return {
      generatedAtIso: this.now().toISOString(),
      filters: pickAdminAuthAccountFilters(effectiveQuery),
      summary: summarizeAdminAuthAccounts(filteredRecords),
      statusBreakdown: summarizeAdminAuthAccountStatuses(filteredRecords),
      userTypeBreakdown: summarizeAdminAuthAccountUserTypes(filteredRecords),
      riskTagBreakdown: summarizeAdminAuthAccountRiskTags(filteredRecords),
      topRiskAccounts: [...filteredRecords]
        .sort(compareAdminAuthAccountsForReport)
        .slice(0, effectiveQuery.topAccountsLimit)
        .map(maskAdminAuthAccountRecord),
      governanceAuditSummary:
        summarizeAdminAuthAccountGovernanceAudits(auditRecords),
      recentAuditEvents: auditRecords
        .slice(0, effectiveQuery.auditEventLimit)
        .map(maskAdminAuthSessionGovernanceAuditRecord),
    };
  }

  async exportAdminAuthAccountsCsv(
    query: AdminAuthAccountFilters = {},
  ): Promise<string> {
    const { filteredRecords, deviceIdsByUserId } =
      await this.buildAdminAuthAccountDirectory(query);
    const rows = [
      [
        'userId',
        'userPhone',
        'userType',
        'status',
        'riskLevel',
        'riskTags',
        'activeSessionCount',
        'activeDeviceCount',
        'activeDeviceIds',
        'latestSessionCreatedAtIso',
        'createdAtIso',
        'updatedAtIso',
      ],
      ...[...filteredRecords].sort(compareAdminAuthAccountsForReport).map(
        record => [
          record.userId,
          maskPhone(record.userPhone),
          record.userType,
          record.status,
          record.riskLevel,
          record.riskTags.join('|'),
          String(record.activeSessionCount),
          String(record.activeDeviceCount),
          (deviceIdsByUserId.get(record.userId) ?? [])
            .map(maskDeviceId)
            .join('|'),
          record.latestSessionCreatedAtIso ?? '',
          record.createdAtIso,
          record.updatedAtIso,
        ],
      ),
    ];

    return `\uFEFF${rows.map(formatCsvRow).join('\r\n')}`;
  }

  private async buildAdminAuthAccountDirectory(
    query: AdminAuthAccountFilters = {},
  ): Promise<AdminAuthAccountDirectory> {
    const users = await this.requirePlatformUsers();
    const sessions = await this.listAllPlatformActiveRefreshSessions(users);
    const platformUserById = new Map(users.map(user => [user.id, user] as const));
    const sessionRecords = await this.buildAdminAuthSessionRecords(
      '',
      sessions,
      platformUserById,
    );
    const sessionsByUserId = new Map<string, AdminAuthSessionRecord[]>();

    for (const session of sessionRecords) {
      const records = sessionsByUserId.get(session.userId);
      if (records) {
        records.push(session);
        continue;
      }

      sessionsByUserId.set(session.userId, [session]);
    }

    const deviceIdsByUserId = new Map<string, string[]>();
    const records = users.map(user => {
      const accountSessions = sessionsByUserId.get(user.id) ?? [];
      deviceIdsByUserId.set(
        user.id,
        accountSessions.map(session => session.deviceId),
      );

      return buildAdminAuthAccountRecord(user, accountSessions);
    });
    const filteredRecords = records.filter(record =>
      matchesAdminAuthAccountQuery(
        record,
        query,
        deviceIdsByUserId.get(record.userId) ?? [],
      ),
    );

    return {
      filteredRecords,
      deviceIdsByUserId,
    };
  }

  async getAdminAuthAccountDetail(
    actorAdminId: string,
    targetUserId: string,
  ): Promise<AdminAuthAccountDetail> {
    const users = await this.requirePlatformUsers();
    const targetUser = users.find(user => user.id === targetUserId);

    if (!targetUser) {
      throw new BusinessError(ApiErrorCode.AUTH_ACCOUNT_NOT_FOUND, '账号不存在');
    }

    const allSessions = await this.listAllPlatformActiveRefreshSessions(users);
    const activeSessions = (
      await this.buildAdminAuthSessionRecords(
        actorAdminId,
        allSessions,
        new Map(users.map(user => [user.id, user] as const)),
      )
    ).filter(
      session => session.userId === targetUserId,
    );
    const recentAuditEvents = (await this.listAllSessionGovernanceAuditRecords())
      .filter(event =>
        event.subjects.some(subject => subject.userId === targetUserId),
      )
      .slice(0, 20);

    return {
      account: maskAdminAuthAccountRecord(
        buildAdminAuthAccountRecord(targetUser, activeSessions),
      ),
      activeSessions: activeSessions.map(maskAdminAuthSessionRecord),
      recentAuditEvents: recentAuditEvents.map(
        maskAdminAuthSessionGovernanceAuditRecord,
      ),
    };
  }

  async updateAdminAuthAccountStatus(
    actorAdminId: string,
    targetUserId: string,
    status: MobileUserStatus,
  ): Promise<UpdateAdminAuthAccountStatusResult> {
    const targetUser = await this.authRepository.findUserById(targetUserId);

    if (!targetUser) {
      throw new BusinessError(ApiErrorCode.AUTH_ACCOUNT_NOT_FOUND, '账号不存在');
    }

    if (status === 'disabled' && actorAdminId === targetUserId) {
      throw new BusinessError(
        ApiErrorCode.AUTH_FORBIDDEN,
        '不能禁用当前管理员账号',
      );
    }

    if (!this.authRepository.updateUserStatus) {
      throw new Error('AuthRepository.updateUserStatus not configured');
    }

    const activeSessions =
      status === 'disabled'
        ? await this.authRepository.listActiveUserRefreshSessions(targetUserId)
        : [];
    const updatedUser = await this.authRepository.updateUserStatus(
      targetUserId,
      status,
    );

    if (!updatedUser) {
      throw new BusinessError(ApiErrorCode.AUTH_ACCOUNT_NOT_FOUND, '账号不存在');
    }

    if (status === 'disabled') {
      await this.authRepository.revokeUserRefreshSessions(targetUserId, this.now());
      await this.recordSessionGovernanceAuditEvent(actorAdminId, {
        action: 'revoke_account_sessions',
        result: activeSessions.length > 0 ? 'revoked' : 'noop',
        revokedCount: activeSessions.length,
        subjects: await this.buildSessionGovernanceAuditSubjects(activeSessions),
      });
    }

    return {
      userId: updatedUser.id,
      status: updatedUser.status,
      revokedSessionCount: activeSessions.length,
    };
  }

  async batchUpdateAdminAuthAccountStatus(
    actorAdminId: string,
    input: BatchUpdateAdminAuthAccountStatusRequest,
  ): Promise<BatchUpdateAdminAuthAccountStatusResult> {
    assertAdminAuthAccountBatchNotEmpty(input.items);
    assertUniqueAdminAuthAccountBatchUserIds(
      input.items,
      '批量更新账号 ID 不能重复',
    );

    if (
      input.status === 'disabled' &&
      input.items.some(item => item.userId === actorAdminId)
    ) {
      throw new BusinessError(
        ApiErrorCode.AUTH_FORBIDDEN,
        '不能禁用当前管理员账号',
      );
    }

    if (!this.authRepository.batchUpdateUserStatuses) {
      throw new Error('AuthRepository.batchUpdateUserStatuses not configured');
    }

    const result = await this.authRepository.batchUpdateUserStatuses(
      input,
      this.now(),
    );

    if (input.status === 'disabled') {
      for (const item of result.items) {
        await this.recordSessionGovernanceAuditEvent(actorAdminId, {
          action: 'revoke_account_sessions',
          result: item.revokedSessions.length > 0 ? 'revoked' : 'noop',
          revokedCount: item.revokedSessions.length,
          subjects: await this.buildSessionGovernanceAuditSubjects(
            item.revokedSessions,
          ),
        });
      }
    }

    return {
      status: input.status,
      userIds: result.items.map(item => item.user.id),
      updatedCount: result.items.length,
      revokedSessionCount: result.items.reduce(
        (total, item) => total + item.revokedSessions.length,
        0,
      ),
      items: result.items.map(item => ({
        userId: item.user.id,
        status: item.user.status,
        revokedSessionCount: item.revokedSessions.length,
      })),
    };
  }

  async revokeAdminAuthAccountSessions(
    actorAdminId: string,
    targetUserId: string,
    keepSessionId?: string,
  ): Promise<RevokeAdminAuthAccountSessionsResult> {
    const targetUser = await this.authRepository.findUserById(targetUserId);

    if (!targetUser) {
      throw new BusinessError(ApiErrorCode.AUTH_ACCOUNT_NOT_FOUND, '账号不存在');
    }

    const sessions = await this.authRepository.listActiveUserRefreshSessions(
      targetUserId,
    );

    if (
      keepSessionId &&
      !sessions.some(session => session.id === keepSessionId)
    ) {
      throw new BusinessError(
        ApiErrorCode.VALIDATION_ERROR,
        '保留会话不存在或不属于目标账号',
      );
    }

    const revokedSessions: RefreshSessionRecord[] = [];

    for (const session of sessions) {
      if (keepSessionId && session.id === keepSessionId) {
        continue;
      }

      const revoked = await this.authRepository.revokeUserRefreshSession(
        targetUserId,
        session.id,
        this.now(),
      );

      if (revoked) {
        revokedSessions.push(session);
      }
    }

    await this.recordSessionGovernanceAuditEvent(actorAdminId, {
      action: 'revoke_account_sessions',
      result: revokedSessions.length > 0 ? 'revoked' : 'noop',
      revokedCount: revokedSessions.length,
      subjects: await this.buildSessionGovernanceAuditSubjects(revokedSessions),
    });

    return {
      userId: targetUser.id,
      revokedCount: revokedSessions.length,
      ...(keepSessionId ? { keepSessionId } : {}),
    };
  }

  async batchRevokeAdminAuthAccountSessions(
    actorAdminId: string,
    input: BatchRevokeAdminAuthAccountSessionsRequest,
  ): Promise<BatchRevokeAdminAuthAccountSessionsResult> {
    assertAdminAuthAccountBatchNotEmpty(input.items);
    assertUniqueAdminAuthAccountBatchUserIds(
      input.items,
      '批量撤销会话账号 ID 不能重复',
    );

    if (!this.authRepository.batchRevokeUserRefreshSessions) {
      throw new Error(
        'AuthRepository.batchRevokeUserRefreshSessions not configured',
      );
    }

    const result = await this.authRepository.batchRevokeUserRefreshSessions(
      input,
      this.now(),
    );

    for (const item of result.items) {
      await this.recordSessionGovernanceAuditEvent(actorAdminId, {
        action: 'revoke_account_sessions',
        result: item.revokedSessions.length > 0 ? 'revoked' : 'noop',
        revokedCount: item.revokedSessions.length,
        subjects: await this.buildSessionGovernanceAuditSubjects(
          item.revokedSessions,
        ),
      });
    }

    return {
      userIds: result.items.map(item => item.user.id),
      updatedCount: result.items.length,
      revokedCount: result.items.reduce(
        (total, item) => total + item.revokedSessions.length,
        0,
      ),
      items: result.items.map(item => ({
        userId: item.user.id,
        revokedCount: item.revokedSessions.length,
        ...(item.keepSessionId ? { keepSessionId: item.keepSessionId } : {}),
      })),
    };
  }

  async revokeUserSession(
    userId: string,
    sessionId: string,
  ): Promise<AdminAuthSessionRevokeResult> {
    const targetSession = await this.findSessionGovernanceTargetSession(
      userId,
      sessionId,
    );
    const revoked = this.authRepository.revokeRefreshSessionById
      ? await this.authRepository.revokeRefreshSessionById(sessionId, this.now())
      : await this.authRepository.revokeUserRefreshSession(
          userId,
          sessionId,
          this.now(),
        );
    await this.recordSessionGovernanceAuditEvent(userId, {
      action: 'revoke_session',
      result: revoked ? 'revoked' : 'noop',
      requestedSessionId: sessionId,
      revokedCount: revoked ? 1 : 0,
      subjects: targetSession
        ? await this.buildSessionGovernanceAuditSubjects([targetSession])
        : [],
    });

    return {
      sessionId,
      revoked,
    };
  }

  async revokeOtherUserSessions(
    userId: string,
    currentDeviceId: string,
  ): Promise<RevokeOtherAdminSessionsResult> {
    const { revokedCount } = await this.revokeOtherUserSessionsInternal(
      userId,
      currentDeviceId,
    );

    return {
      currentDeviceId: maskDeviceId(currentDeviceId),
      revokedCount,
    };
  }

  async revokeOtherSelfAuthSessions(
    userId: string,
    currentDeviceId: string,
  ): Promise<RevokeOtherSelfAuthSessionsResult> {
    const { revokedCount } = await this.revokeOtherUserSessionsInternal(
      userId,
      currentDeviceId,
    );

    return {
      currentDeviceId,
      revokedCount,
    };
  }

  private async revokeOtherUserSessionsInternal(
    userId: string,
    currentDeviceId: string,
  ) {
    const sessions = await this.authRepository.listActiveUserRefreshSessions(
      userId,
    );
    const revokedSessions: RefreshSessionRecord[] = [];
    let revokedCount = 0;

    for (const session of sessions) {
      if (session.deviceId === currentDeviceId) {
        continue;
      }

      const revoked = await this.authRepository.revokeUserRefreshSession(
        userId,
        session.id,
        this.now(),
      );

      if (revoked) {
        revokedCount += 1;
        revokedSessions.push(session);
      }
    }

    await this.recordSessionGovernanceAuditEvent(userId, {
      action: 'revoke_other_sessions',
      result: revokedCount > 0 ? 'revoked' : 'noop',
      currentDeviceId,
      revokedCount,
      subjects: await this.buildSessionGovernanceAuditSubjects(revokedSessions),
    });

    return {
      revokedCount,
      revokedSessions,
    };
  }

  async logout(request: LogoutRequest): Promise<LogoutResult> {
    await this.authRepository.revokeRefreshSession(
      request.refreshToken,
      request.deviceId,
      this.now(),
    );

    return {
      loggedOut: true,
    };
  }

  async getCurrentUser(accessToken: string): Promise<AuthenticatedUser> {
    let userId: string;

    try {
      userId = this.tokenService.getUserIdFromAccessToken(accessToken);
    } catch {
      throw new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      );
    }

    const user = await this.authRepository.findUserById(userId);

    if (user) {
      this.assertUserActive(user);

      return toAuthenticatedUser(user);
    }

    throw new BusinessError(
      ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
      '访问令牌无效',
    );
  }

  private async buildAdminAuthSessionRecords(
    currentUserId: string,
    sessions: RefreshSessionRecord[],
    platformUserById?: Map<
      string,
      Pick<PlatformUserDirectoryRecord, 'id' | 'phone' | 'userType'>
    >,
  ): Promise<AdminAuthSessionRecord[]> {
    const records = (
      await Promise.all(
        sessions.map(async session => {
          const user =
            platformUserById?.get(session.userId) ??
            (await this.authRepository.findUserById(session.userId));

          if (!user) {
            return undefined;
          }

          return {
            id: session.id,
            userId: user.id,
            userPhone: user.phone,
            userType: user.userType,
            deviceId: session.deviceId,
            createdAtIso: session.createdAt.toISOString(),
            expiresAtIso: session.expiresAt.toISOString(),
            isCurrentUser: user.id === currentUserId,
          };
        }),
      )
    ).filter(
      (session): session is AdminAuthSessionBaseRecord => session !== undefined,
    );
    const riskProfile = buildAdminAuthSessionRiskProfile(records);

    return records.map(session => {
      const risk = riskProfile.bySessionId.get(session.id);

      return {
        ...session,
        riskLevel: risk?.riskLevel ?? 'none',
        riskTags: risk?.riskTags ?? [],
        riskContext: risk?.riskContext ?? {
          deviceSessionCount: 0,
          deviceUserCount: 0,
          userSessionCount: 0,
        },
      };
    });
  }

  private async listAllSessionGovernanceAuditRecords(): Promise<
    AdminAuthSessionGovernanceAuditRecord[]
  > {
    const events =
      await this.authRepository.listAdminAuthSessionGovernanceAuditEvents?.();

    return (events ?? []).map(event => ({
      id: event.id,
      actorAdminId: event.actorAdminId,
      actorAdminPhone: event.actorAdminPhone,
      action: event.action,
      result: event.result,
      ...(event.requestedSessionId
        ? { requestedSessionId: event.requestedSessionId }
        : {}),
      ...(event.currentDeviceId ? { currentDeviceId: event.currentDeviceId } : {}),
      revokedCount: event.revokedCount,
      subjects: event.subjects.map(subject => ({
        sessionId: subject.sessionId,
        userId: subject.userId,
        userPhone: subject.userPhone,
        userType: subject.userType,
        deviceId: subject.deviceId,
      })),
      createdAtIso: event.createdAt.toISOString(),
    }));
  }

  private async requirePlatformUsers(): Promise<PlatformUserDirectoryRecord[]> {
    if (!this.authRepository.listPlatformUsers) {
      throw new Error('AuthRepository.listPlatformUsers not configured');
    }

    return this.authRepository.listPlatformUsers();
  }
  private async listAllPlatformActiveRefreshSessions(
    users?: PlatformUserDirectoryRecord[],
  ): Promise<RefreshSessionRecord[]> {
    if (this.authRepository.listAllActiveRefreshSessions) {
      const sessions = await this.authRepository.listAllActiveRefreshSessions();

      if (Array.isArray(sessions)) {
        return sessions;
      }
    }

    const platformUsers = users ?? (await this.requirePlatformUsers());
    const sessions = await Promise.all(
      platformUsers.map(user =>
        this.authRepository.listActiveUserRefreshSessions(user.id),
      ),
    );

    return sessions
      .flat()
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  private async findSessionGovernanceTargetSession(
    currentAdminId: string,
    sessionId: string,
  ): Promise<RefreshSessionRecord | undefined> {
    const sessions =
      this.authRepository.listAllActiveRefreshSessions
        ? await this.authRepository.listAllActiveRefreshSessions()
        : await this.authRepository.listActiveUserRefreshSessions(
            currentAdminId,
          );

    return (sessions ?? []).find(session => session.id === sessionId);
  }

  private async buildSessionGovernanceAuditSubjects(
    sessions: RefreshSessionRecord[],
  ): Promise<AdminAuthSessionGovernanceAuditSubject[]> {
    const subjects = await Promise.all(
      sessions.map(async session => {
        const user = await this.authRepository.findUserById(session.userId);

        if (!user) {
          return undefined;
        }

        return {
          sessionId: session.id,
          userId: user.id,
          userPhone: user.phone,
          userType: user.userType,
          deviceId: session.deviceId,
        };
      }),
    );

    return subjects.filter(
      (
        subject,
      ): subject is AdminAuthSessionGovernanceAuditSubject => subject !== undefined,
    );
  }

  private async recordSessionGovernanceAuditEvent(
    actorAdminId: string,
    input: Omit<SaveAdminAuthSessionGovernanceAuditEventInput, 'actorAdminId' | 'actorAdminPhone'>,
  ): Promise<void> {
    if (!this.authRepository.saveAdminAuthSessionGovernanceAuditEvent) {
      return;
    }

    const actorAdmin = await this.authRepository.findUserById(actorAdminId);

    if (!actorAdmin || actorAdmin.userType !== 'admin') {
      return;
    }

    await this.authRepository.saveAdminAuthSessionGovernanceAuditEvent({
      actorAdminId: actorAdmin.id,
      actorAdminPhone: actorAdmin.phone,
      action: input.action,
      result: input.result,
      ...(input.requestedSessionId
        ? { requestedSessionId: input.requestedSessionId }
        : {}),
      ...(input.currentDeviceId ? { currentDeviceId: input.currentDeviceId } : {}),
      revokedCount: input.revokedCount,
      subjects: input.subjects,
    });
  }

  private assertUserActive(user: AuthenticatedUserRecord): void {
    if (user.status === 'disabled') {
      throw new BusinessError(ApiErrorCode.AUTH_USER_DISABLED, '账号已禁用');
    }
  }
}

function assertAdminAuthAccountBatchNotEmpty(items: { userId: string }[]) {
  if (items.length === 0) {
    throw new BusinessError(ApiErrorCode.VALIDATION_ERROR, '至少选择 1 个账号');
  }
}

function assertUniqueAdminAuthAccountBatchUserIds(
  items: { userId: string }[],
  message: string,
) {
  const userIds = items.map(item => item.userId);
  const uniqueUserIds = new Set(userIds);

  if (uniqueUserIds.size !== userIds.length) {
    throw new BusinessError(ApiErrorCode.VALIDATION_ERROR, message);
  }
}

function matchesAdminAuthSessionQuery(
  session: {
    userType: 'shipper' | 'driver' | 'admin';
    userId: string;
    userPhone: string;
    deviceId: string;
    riskLevel: 'none' | 'warning' | 'high';
    riskTags: ('shared_device' | 'high_session_volume' | 'admin_multi_device')[];
  },
  query: AdminAuthSessionListQuery,
) {
  if (query.userType && session.userType !== query.userType) {
    return false;
  }

  if (query.riskOnly && session.riskLevel === 'none') {
    return false;
  }

  if (query.riskTag && !session.riskTags.includes(query.riskTag)) {
    return false;
  }

  if (!query.keyword) {
    return true;
  }

  const normalizedKeyword = query.keyword.trim().toLowerCase();

  if (!normalizedKeyword) {
    return true;
  }

  return [session.userPhone, session.userId, session.deviceId]
    .map(value => value.toLowerCase())
    .some(value => value.includes(normalizedKeyword));
}

function matchesAdminAuthSessionGovernanceAuditQuery(
  event: AdminAuthSessionGovernanceAuditRecord,
  query: AdminAuthSessionGovernanceAuditListQuery,
) {
  if (query.action && event.action !== query.action) {
    return false;
  }

  if (query.result && event.result !== query.result) {
    return false;
  }

  if (!query.keyword) {
    return true;
  }

  const normalizedKeyword = query.keyword.trim().toLowerCase();

  if (!normalizedKeyword) {
    return true;
  }

  return [
    event.actorAdminId,
    event.actorAdminPhone,
    event.requestedSessionId ?? '',
    event.currentDeviceId ?? '',
    event.action,
    event.result,
    ...event.subjects.flatMap(subject => [
      subject.sessionId,
      subject.userId,
      subject.userPhone,
      subject.userType,
      subject.deviceId,
    ]),
  ]
    .map(value => value.toLowerCase())
    .some(value => value.includes(normalizedKeyword));
}

function matchesAdminAuthAccountQuery(
  account: AdminAuthAccountRecord,
  query: AdminAuthAccountFilters,
  deviceIds: string[],
) {
  if (query.userType && account.userType !== query.userType) {
    return false;
  }

  if (query.status && account.status !== query.status) {
    return false;
  }

  if (query.riskOnly && account.riskLevel === 'none') {
    return false;
  }

  if (query.riskTag && !account.riskTags.includes(query.riskTag)) {
    return false;
  }

  if (query.riskLevel && account.riskLevel !== query.riskLevel) {
    return false;
  }

  if (!query.keyword) {
    return true;
  }

  const normalizedKeyword = query.keyword.trim().toLowerCase();

  if (!normalizedKeyword) {
    return true;
  }

  return [account.userId, account.userPhone, ...deviceIds]
    .map(value => value.toLowerCase())
    .some(value => value.includes(normalizedKeyword));
}

function buildAdminAuthAccountRecord(
  user: PlatformUserDirectoryRecord,
  sessions: AdminAuthSessionRecord[],
): AdminAuthAccountRecord {
  const activeDeviceCount = new Set(sessions.map(session => session.deviceId)).size;
  const riskTags = [...new Set(sessions.flatMap(session => session.riskTags))];
  const latestSessionCreatedAtIso = sessions
    .map(session => session.createdAtIso)
    .sort((left, right) => right.localeCompare(left))[0];

  return {
    userId: user.id,
    userPhone: user.phone,
    userType: user.userType,
    status: user.status,
    createdAtIso: user.createdAt.toISOString(),
    updatedAtIso: user.updatedAt.toISOString(),
    activeSessionCount: sessions.length,
    activeDeviceCount,
    ...(latestSessionCreatedAtIso ? { latestSessionCreatedAtIso } : {}),
    riskLevel: sessions.reduce<AdminAuthAccountRecord['riskLevel']>(
      (currentLevel, session) =>
        compareRiskLevel(session.riskLevel, currentLevel) > 0
          ? session.riskLevel
          : currentLevel,
      'none',
    ),
    riskTags,
  };
}

function maskAdminAuthSessionRecord(
  session: AdminAuthSessionRecord,
): AdminAuthSessionRecord {
  return {
    ...session,
    userPhone: maskPhone(session.userPhone),
    deviceId: maskDeviceId(session.deviceId),
  };
}

function maskAdminAuthSessionGovernanceAuditSubject(
  subject: AdminAuthSessionGovernanceAuditSubject,
): AdminAuthSessionGovernanceAuditSubject {
  return {
    ...subject,
    userPhone: maskPhone(subject.userPhone),
    deviceId: maskDeviceId(subject.deviceId),
  };
}

function maskAdminAuthSessionGovernanceAuditRecord(
  event: AdminAuthSessionGovernanceAuditRecord,
): AdminAuthSessionGovernanceAuditRecord {
  return {
    ...event,
    actorAdminPhone: maskPhone(event.actorAdminPhone),
    ...(event.currentDeviceId
      ? { currentDeviceId: maskDeviceId(event.currentDeviceId) }
      : {}),
    subjects: event.subjects.map(maskAdminAuthSessionGovernanceAuditSubject),
  };
}

function maskAdminAuthAccountRecord(
  record: AdminAuthAccountRecord,
): AdminAuthAccountRecord {
  return {
    ...record,
    userPhone: maskPhone(record.userPhone),
  };
}

function maskPhone(phone: string): string {
  const normalized = String(phone ?? '');

  if (!normalized) {
    return '';
  }

  if (normalized.length <= 2) {
    return '*'.repeat(normalized.length);
  }

  if (normalized.length <= 7) {
    return `${normalized.slice(0, 1)}${'*'.repeat(
      normalized.length - 2,
    )}${normalized.slice(-1)}`;
  }

  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

function maskDeviceId(deviceId: string): string {
  const normalized = String(deviceId ?? '');

  if (!normalized) {
    return '';
  }

  const prefixLength = Math.min(3, normalized.length);
  const suffixLength = Math.min(
    3,
    Math.max(0, normalized.length - prefixLength),
  );

  if (normalized.length <= prefixLength + suffixLength) {
    return '*'.repeat(normalized.length);
  }

  return `${normalized.slice(0, prefixLength)}${'*'.repeat(
    normalized.length - prefixLength - suffixLength,
  )}${normalized.slice(-suffixLength)}`;
}

function summarizeAdminAuthAccounts(
  accounts: AdminAuthAccountRecord[],
): AdminAuthAccountSummary {
  return {
    totalUserCount: accounts.length,
    activeUserCount: accounts.filter(account => account.status === 'active')
      .length,
    disabledUserCount: accounts.filter(account => account.status === 'disabled')
      .length,
    riskyUserCount: accounts.filter(account => account.riskLevel !== 'none')
      .length,
    highRiskUserCount: accounts.filter(account => account.riskLevel === 'high')
      .length,
    activeSessionUserCount: accounts.filter(
      account => account.activeSessionCount > 0,
    ).length,
  };
}

function pickAdminAuthAccountFilters(
  query: AdminAuthAccountFilters,
): AdminAuthAccountFilters {
  return {
    ...(query.userType ? { userType: query.userType } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.keyword ? { keyword: query.keyword } : {}),
    ...(query.riskOnly !== undefined ? { riskOnly: query.riskOnly } : {}),
    ...(query.riskTag ? { riskTag: query.riskTag } : {}),
    ...(query.riskLevel ? { riskLevel: query.riskLevel } : {}),
  };
}

function summarizeAdminAuthAccountStatuses(accounts: AdminAuthAccountRecord[]) {
  return (['active', 'disabled'] as const).map(status => ({
    status,
    userCount: accounts.filter(account => account.status === status).length,
  }));
}

function summarizeAdminAuthAccountUserTypes(accounts: AdminAuthAccountRecord[]) {
  return adminAuthAccountUserTypes.map(userType => {
    const matchingAccounts = accounts.filter(account => account.userType === userType);

    return {
      userType,
      userCount: matchingAccounts.length,
      riskyUserCount: matchingAccounts.filter(
        account => account.riskLevel !== 'none',
      ).length,
      disabledUserCount: matchingAccounts.filter(
        account => account.status === 'disabled',
      ).length,
      activeSessionUserCount: matchingAccounts.filter(
        account => account.activeSessionCount > 0,
      ).length,
    };
  });
}

function summarizeAdminAuthAccountRiskTags(accounts: AdminAuthAccountRecord[]) {
  return adminAuthAccountRiskTags.map(riskTag => ({
    riskTag,
    userCount: accounts.filter(account => account.riskTags.includes(riskTag))
      .length,
  }));
}

function summarizeAdminAuthAccountGovernanceAudits(
  events: AdminAuthSessionGovernanceAuditRecord[],
) {
  return {
    totalEventCount: events.length,
    totalRevokedSessionCount: events.reduce(
      (count, event) => count + event.revokedCount,
      0,
    ),
    ...(events[0]?.createdAtIso
      ? { latestEventCreatedAtIso: events[0].createdAtIso }
      : {}),
    actionBreakdown: adminAuthSessionGovernanceActions.map(action => {
      const actionEvents = events.filter(event => event.action === action);

      return {
        action,
        eventCount: actionEvents.length,
        revokedSessionCount: actionEvents.reduce(
          (count, event) => count + event.revokedCount,
          0,
        ),
      };
    }),
  };
}

function compareAdminAuthAccountsForReport(
  left: AdminAuthAccountRecord,
  right: AdminAuthAccountRecord,
) {
  const riskDiff = compareRiskLevel(right.riskLevel, left.riskLevel);
  if (riskDiff !== 0) {
    return riskDiff;
  }

  if (right.activeSessionCount !== left.activeSessionCount) {
    return right.activeSessionCount - left.activeSessionCount;
  }

  if (right.activeDeviceCount !== left.activeDeviceCount) {
    return right.activeDeviceCount - left.activeDeviceCount;
  }

  return right.updatedAtIso.localeCompare(left.updatedAtIso);
}

function formatCsvRow(values: string[]) {
  return values.map(formatCsvCell).join(',');
}

function formatCsvCell(value: string) {
  const normalized = String(value ?? '');
  if (
    normalized.includes(',') ||
    normalized.includes('"') ||
    normalized.includes('\n') ||
    normalized.includes('\r')
  ) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

function compareRiskLevel(
  left: AdminAuthAccountRecord['riskLevel'],
  right: AdminAuthAccountRecord['riskLevel'],
) {
  const order = {
    none: 0,
    warning: 1,
    high: 2,
  } as const;

  return order[left] - order[right];
}

function toAuthenticatedUser(user: AuthenticatedUserRecord): AuthenticatedUser {
  return {
    id: user.id,
    phone: user.phone,
    userType: user.userType,
  };
}

function assertMobileUserType(
  user: AuthenticatedUserRecord,
): 'shipper' | 'driver' {
  if (user.userType === 'admin') {
    throw new BusinessError(
      ApiErrorCode.AUTH_FORBIDDEN,
      '后台账号不能使用移动端认证接口',
    );
  }

  return user.userType;
}
