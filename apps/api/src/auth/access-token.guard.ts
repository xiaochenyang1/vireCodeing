import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './dto';

export type AuthenticatedRequest = {
  headers?: Record<string, string | string[] | undefined>;
  currentUser?: AuthenticatedUser;
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    @Inject(AuthService)
    private readonly authService: Pick<AuthService, 'getCurrentUser'>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accessToken = this.getBearerToken(request);
    request.currentUser = await this.authService.getCurrentUser(accessToken);

    return true;
  }

  private getBearerToken(request: AuthenticatedRequest): string {
    const authorization = request.headers?.authorization;
    const match =
      typeof authorization === 'string'
        ? authorization.match(/^Bearer ([^\s]+)$/i)
        : undefined;

    if (!match?.[1]) {
      throw new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      );
    }

    return match[1];
  }
}
