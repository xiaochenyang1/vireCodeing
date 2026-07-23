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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
  BatchRevokeAdminAuthAccountSessionsRequest,
  BatchUpdateAdminAuthAccountStatusRequest,
  ChangePasswordRequest,
  LoginRequest,
  LogoutRequest,
  PasswordLoginRequest,
  RefreshRequest,
  RevokeAdminAuthAccountSessionsRequest,
  RevokeOtherAdminSessionsRequest,
  RevokeOtherSelfAuthSessionsRequest,
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
  batchRevokeAdminAuthAccountSessionsSchema,
  batchUpdateAdminAuthAccountStatusSchema,
  parseChangePasswordRequest,
  parseAdminAuthAccountId,
  parseAdminAuthAccountListQuery,
  parseAdminAuthAccountReportQuery,
  parseAdminAuthSessionGovernanceAuditListQuery,
  parseAdminAuthSessionListQuery,
  parseBatchRevokeAdminAuthAccountSessionsRequest,
  parseBatchUpdateAdminAuthAccountStatusRequest,
  parseAdminPasswordLoginRequest,
  parseAdminAuthSessionId,
  parseLoginRequest,
  parseLogoutRequest,
  parsePasswordLoginRequest,
  parseRefreshRequest,
  parseRevokeAdminAuthAccountSessionsRequest,
  parseRevokeOtherAdminSessionsRequest,
  parseRevokeOtherSelfAuthSessionsRequest,
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
  revokeOtherSelfAuthSessionsSchema,
  resetPasswordSchema,
  sendCodeSchema,
  tokenSessionSchema,
  updateAdminAuthAccountStatusSchema,
} from './auth.validation';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller()
@ApiTags('认证 (Auth)')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/send-code')
  @ApiOperation({ summary: '发送短信验证码', description: '向指定手机号发送6位数字验证码，60秒内不可重复发送，每小时最多5次' })
  @ApiResponse({ status: 200, description: '验证码发送成功，开发环境会返回验证码明文' })
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
  @ApiOperation({ summary: '验证码登录', description: '使用短信验证码登录，支持货主和司机两种角色' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: '登录成功，返回 access/refresh token 对' })
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
  @ApiOperation({ summary: '密码登录', description: '使用手机号和密码登录，支持货主和司机两种角色' })
  @ApiBearerAuth('access-token')
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
  @ApiOperation({ summary: '用户注册', description: '使用手机号和验证码注册新账号，需指定用户类型（货主/司机）' })
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
  @ApiOperation({ summary: '重置密码', description: '通过验证码重置登录密码' })
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
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '修改密码', description: '登录状态下修改密码，需要当前密码' })
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
  @ApiOperation({ summary: '刷新令牌', description: '使用 refresh token 获取新的 access token' })
  @ApiBearerAuth('access-token')
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
  @ApiOperation({ summary: '退出登录', description: '撤销当前 refresh token，结束会话' })
  @ApiBearerAuth('access-token')
  async logout(
    @Body(new ZodValidationPipe(tokenSessionSchema)) body: LogoutRequest,
    @Req() request?: AuthenticatedRequest,
  ) {
    return ok(
      await this.authService.logout(parseLogoutRequest(body)),
      getRequestId(request),
    );
  }

  @Get('auth/sessions')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '获取当前会话列表' })
  async getCurrentUserAuthSessions(@Req() request: AuthenticatedRequest) {
    if (!request.currentUser) {
      throw new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      );
    }

    return ok(
      await this.authService.listSelfAuthSessions(request.currentUser.id),
      getRequestId(request),
    );
  }

  @Post('auth/sessions/revoke-other-sessions')
  @UseGuards(AccessTokenGuard)
  async revokeOtherCurrentUserAuthSessions(
    @Body(new ZodValidationPipe(revokeOtherSelfAuthSessionsSchema))
    body: RevokeOtherSelfAuthSessionsRequest,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!request.currentUser) {
      throw new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      );
    }

    return ok(
      await this.authService.revokeOtherSelfAuthSessions(
        request.currentUser.id,
        parseRevokeOtherSelfAuthSessionsRequest(body).currentDeviceId,
      ),
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

  @Post('admin/auth/accounts/batch-status')
  @UseGuards(AccessTokenGuard, AdminOnlyGuard)
  async batchUpdateAdminAuthAccountStatus(
    @Body(new ZodValidationPipe(batchUpdateAdminAuthAccountStatusSchema))
    body: BatchUpdateAdminAuthAccountStatusRequest,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!request.currentUser) {
      throw new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      );
    }

    return ok(
      await this.authService.batchUpdateAdminAuthAccountStatus(
        request.currentUser.id,
        parseBatchUpdateAdminAuthAccountStatusRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post('admin/auth/accounts/batch-revoke-sessions')
  @UseGuards(AccessTokenGuard, AdminOnlyGuard)
  async batchRevokeAdminAuthAccountSessions(
    @Body(new ZodValidationPipe(batchRevokeAdminAuthAccountSessionsSchema))
    body: BatchRevokeAdminAuthAccountSessionsRequest,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!request.currentUser) {
      throw new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      );
    }

    return ok(
      await this.authService.batchRevokeAdminAuthAccountSessions(
        request.currentUser.id,
        parseBatchRevokeAdminAuthAccountSessionsRequest(body),
      ),
      getRequestId(request),
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
