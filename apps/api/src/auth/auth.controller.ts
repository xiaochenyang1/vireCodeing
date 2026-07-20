import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { AuthService } from './auth.service';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from './access-token.guard';
import { AdminOnlyGuard } from './role.guard';
import type {
  AdminAuthAccountListQuery,
  AdminAuthAccountReportQuery,
  AdminAuthSessionGovernanceAuditListQuery,
  AdminAuthSessionListQuery,
  AdminPasswordLoginRequest,
  ChangePasswordRequest,
  LoginRequest,
  LogoutRequest,
  PasswordLoginRequest,
  RefreshRequest,
  RevokeAdminAuthAccountSessionsRequest,
  RevokeOtherAdminSessionsRequest,
  RegisterRequest,
  ResetPasswordRequest,
  SendCodeRequest,
  UpdateAdminAuthAccountStatusRequest,
} from './dto';
import {
  adminAuthAccountListQuerySchema,
  adminAuthAccountReportQuerySchema,
  adminPasswordLoginSchema,
  adminAuthSessionGovernanceAuditListQuerySchema,
  adminAuthSessionListQuerySchema,
  parseChangePasswordRequest,
  parseAdminAuthAccountId,
  parseAdminAuthAccountListQuery,
  parseAdminAuthAccountReportQuery,
  parseAdminAuthSessionGovernanceAuditListQuery,
  parseAdminAuthSessionListQuery,
  parseAdminPasswordLoginRequest,
  parseAdminAuthSessionId,
  parseLoginRequest,
  parseLogoutRequest,
  parsePasswordLoginRequest,
  parseRefreshRequest,
  parseRevokeAdminAuthAccountSessionsRequest,
  parseRevokeOtherAdminSessionsRequest,
  parseRegisterRequest,
  parseResetPasswordRequest,
  parseSendCodeRequest,
  parseUpdateAdminAuthAccountStatusRequest,
  changePasswordSchema,
  loginSchema,
  passwordLoginSchema,
  registerSchema,
  revokeAdminAuthAccountSessionsSchema,
  revokeOtherAdminSessionsSchema,
  resetPasswordSchema,
  sendCodeSchema,
  tokenSessionSchema,
  updateAdminAuthAccountStatusSchema,
} from './auth.validation';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/send-code')
  async sendCode(
    @Body(new ZodValidationPipe(sendCodeSchema)) body: SendCodeRequest,
    @Req() request?: AuthenticatedRequest,
  ) {
    return ok(
      await this.authService.sendCode(parseSendCodeRequest(body)),
      getRequestId(request),
    );
  }

  @Post('auth/login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginRequest,
    @Req() request?: AuthenticatedRequest,
  ) {
    return ok(
      await this.authService.login(parseLoginRequest(body)),
      getRequestId(request),
    );
  }

  @Post('auth/password-login')
  async passwordLogin(
    @Body(new ZodValidationPipe(passwordLoginSchema)) body: PasswordLoginRequest,
    @Req() request?: AuthenticatedRequest,
  ) {
    return ok(
      await this.authService.passwordLogin(parsePasswordLoginRequest(body)),
      getRequestId(request),
    );
  }

  @Post('auth/admin/password-login')
  async adminPasswordLogin(
    @Body(new ZodValidationPipe(adminPasswordLoginSchema))
    body: AdminPasswordLoginRequest,
    @Req() request?: AuthenticatedRequest,
  ) {
    return ok(
      await this.authService.adminPasswordLogin(
        parseAdminPasswordLoginRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post('auth/register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterRequest,
    @Req() request?: AuthenticatedRequest,
  ) {
    return ok(
      await this.authService.register(parseRegisterRequest(body)),
      getRequestId(request),
    );
  }

  @Post('auth/reset-password')
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema))
    body: ResetPasswordRequest,
    @Req() request?: AuthenticatedRequest,
  ) {
    return ok(
      await this.authService.resetPassword(parseResetPasswordRequest(body)),
      getRequestId(request),
    );
  }

  @Post('auth/change-password')
  @UseGuards(AccessTokenGuard)
  async changePassword(
    @Body(new ZodValidationPipe(changePasswordSchema))
    body: ChangePasswordRequest,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!request.currentUser) {
      throw new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      );
    }

    return ok(
      await this.authService.changePassword(
        request.currentUser.id,
        parseChangePasswordRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post('auth/refresh')
  async refresh(
    @Body(new ZodValidationPipe(tokenSessionSchema)) body: RefreshRequest,
    @Req() request?: AuthenticatedRequest,
  ) {
    return ok(
      await this.authService.refresh(parseRefreshRequest(body)),
      getRequestId(request),
    );
  }

  @Post('auth/logout')
  async logout(
    @Body(new ZodValidationPipe(tokenSessionSchema)) body: LogoutRequest,
    @Req() request?: AuthenticatedRequest,
  ) {
    return ok(
      await this.authService.logout(parseLogoutRequest(body)),
      getRequestId(request),
    );
  }

  @Get('admin/auth/sessions')
  @UseGuards(AccessTokenGuard, AdminOnlyGuard)
  async getAdminAuthSessions(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(adminAuthSessionListQuerySchema))
    query: AdminAuthSessionListQuery = parseAdminAuthSessionListQuery({}),
  ) {
    if (!request.currentUser) {
      throw new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      );
    }

    return ok(
      await this.authService.listUserSessions(
        request.currentUser.id,
        parseAdminAuthSessionListQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Get('admin/auth/sessions/audit-events')
  @UseGuards(AccessTokenGuard, AdminOnlyGuard)
  async getAdminAuthSessionGovernanceAuditEvents(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(adminAuthSessionGovernanceAuditListQuerySchema))
    query: AdminAuthSessionGovernanceAuditListQuery = parseAdminAuthSessionGovernanceAuditListQuery(
      {},
    ),
  ) {
    if (!request.currentUser) {
      throw new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      );
    }

    return ok(
      await this.authService.listSessionGovernanceAuditEvents(
        parseAdminAuthSessionGovernanceAuditListQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Get('admin/auth/accounts')
  @UseGuards(AccessTokenGuard, AdminOnlyGuard)
  async getAdminAuthAccounts(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(adminAuthAccountListQuerySchema))
    query: AdminAuthAccountListQuery = parseAdminAuthAccountListQuery({}),
  ) {
    if (!request.currentUser) {
      throw new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      );
    }

    return ok(
      await this.authService.listAdminAuthAccounts(
        parseAdminAuthAccountListQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Get('admin/auth/accounts/report')
  @UseGuards(AccessTokenGuard, AdminOnlyGuard)
  async getAdminAuthAccountReport(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(adminAuthAccountReportQuerySchema))
    query: AdminAuthAccountReportQuery = parseAdminAuthAccountReportQuery({}),
  ) {
    if (!request.currentUser) {
      throw new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      );
    }

    return ok(
      await this.authService.getAdminAuthAccountReport(
        parseAdminAuthAccountReportQuery(query),
      ),
      getRequestId(request),
    );
  }

  @Get('admin/auth/accounts/export')
  @UseGuards(AccessTokenGuard, AdminOnlyGuard)
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header(
    'content-disposition',
    'attachment; filename="admin-auth-accounts.csv"',
  )
  async exportAdminAuthAccounts(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(adminAuthAccountListQuerySchema))
    query: AdminAuthAccountListQuery = parseAdminAuthAccountListQuery({}),
  ) {
    if (!request.currentUser) {
      throw new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      );
    }

    return this.authService.exportAdminAuthAccountsCsv(
      parseAdminAuthAccountListQuery(query),
    );
  }

  @Get('admin/auth/accounts/:userId')
  @UseGuards(AccessTokenGuard, AdminOnlyGuard)
  async getAdminAuthAccountDetail(
    @Param('userId') userId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!request.currentUser) {
      throw new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      );
    }

    return ok(
      await this.authService.getAdminAuthAccountDetail(
        request.currentUser.id,
        parseAdminAuthAccountId(userId),
      ),
      getRequestId(request),
    );
  }

  @Post('admin/auth/accounts/:userId/status')
  @UseGuards(AccessTokenGuard, AdminOnlyGuard)
  async updateAdminAuthAccountStatus(
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(updateAdminAuthAccountStatusSchema))
    body: UpdateAdminAuthAccountStatusRequest,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!request.currentUser) {
      throw new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      );
    }

    return ok(
      await this.authService.updateAdminAuthAccountStatus(
        request.currentUser.id,
        parseAdminAuthAccountId(userId),
        parseUpdateAdminAuthAccountStatusRequest(body).status,
      ),
      getRequestId(request),
    );
  }

  @Post('admin/auth/accounts/:userId/revoke-sessions')
  @UseGuards(AccessTokenGuard, AdminOnlyGuard)
  async revokeAdminAuthAccountSessions(
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(revokeAdminAuthAccountSessionsSchema))
    body: RevokeAdminAuthAccountSessionsRequest,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!request.currentUser) {
      throw new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      );
    }

    return ok(
      await this.authService.revokeAdminAuthAccountSessions(
        request.currentUser.id,
        parseAdminAuthAccountId(userId),
        parseRevokeAdminAuthAccountSessionsRequest(body).keepSessionId,
      ),
      getRequestId(request),
    );
  }

  @Post('admin/auth/sessions/:sessionId/revoke')
  @UseGuards(AccessTokenGuard, AdminOnlyGuard)
  async revokeAdminAuthSession(
    @Param('sessionId') sessionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!request.currentUser) {
      throw new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      );
    }

    return ok(
      await this.authService.revokeUserSession(
        request.currentUser.id,
        parseAdminAuthSessionId(sessionId),
      ),
      getRequestId(request),
    );
  }

  @Post('admin/auth/sessions/revoke-other-sessions')
  @UseGuards(AccessTokenGuard, AdminOnlyGuard)
  async revokeOtherAdminAuthSessions(
    @Body(new ZodValidationPipe(revokeOtherAdminSessionsSchema))
    body: RevokeOtherAdminSessionsRequest,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!request.currentUser) {
      throw new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      );
    }

    return ok(
      await this.authService.revokeOtherUserSessions(
        request.currentUser.id,
        parseRevokeOtherAdminSessionsRequest(body).currentDeviceId,
      ),
      getRequestId(request),
    );
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  async getMe(@Req() request: AuthenticatedRequest) {
    return ok(request.currentUser, getRequestId(request));
  }
}

function getRequestId(request?: AuthenticatedRequest) {
  const requestIdHeader = request?.headers?.['x-request-id'];

  return Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
}
