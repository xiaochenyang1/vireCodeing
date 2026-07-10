import { ApiErrorCode, BusinessError } from '../common/errors';
import type {
  AuthenticatedUser,
  AuthenticatedUserRecord,
  ChangePasswordRequest,
  ChangePasswordResult,
  LoginRequest,
  LoginResult,
  LogoutRequest,
  LogoutResult,
  PasswordLoginRequest,
  PasswordLoginResult,
  RefreshRequest,
  RegisterRequest,
  RegisterResult,
  ResetPasswordRequest,
  ResetPasswordResult,
  SendCodeRequest,
  SendCodeResult,
  TokenPair,
  VerificationPurpose,
} from './dto';
import {
  type AuthRepository,
  InMemoryAuthRepository,
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
    const existingUser = await this.authRepository.findUserByPhone(
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

    const user = await this.authRepository.upsertMobileUser({
      phone: request.phone,
      userType: request.userType,
    });

    return this.issueLoginResult(user, request.deviceId);
  }

  async resetPassword(
    request: ResetPasswordRequest,
  ): Promise<ResetPasswordResult> {
    await this.consumeValidVerificationCode(
      request.phone,
      'reset',
      request.code,
    );

    const existingUser = await this.authRepository.findUserByPhone(
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

  private assertUserActive(user: AuthenticatedUserRecord): void {
    if (user.status === 'disabled') {
      throw new BusinessError(ApiErrorCode.AUTH_USER_DISABLED, '账号已禁用');
    }
  }
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
