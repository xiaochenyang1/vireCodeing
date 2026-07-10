import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { AuthService } from './auth.service';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from './access-token.guard';
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
import {
  parseChangePasswordRequest,
  parseLoginRequest,
  parseLogoutRequest,
  parsePasswordLoginRequest,
  parseRefreshRequest,
  parseRegisterRequest,
  parseResetPasswordRequest,
  parseSendCodeRequest,
  changePasswordSchema,
  loginSchema,
  passwordLoginSchema,
  registerSchema,
  resetPasswordSchema,
  sendCodeSchema,
  tokenSessionSchema,
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
