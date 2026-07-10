import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from './access-token.guard';
import type { AuthenticatedUser } from './dto';
import { ApiErrorCode, BusinessError } from '../common/errors';

@Injectable()
export class ShipperOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    assertRole(context, 'shipper', '当前账号不是货主');

    return true;
  }
}

@Injectable()
export class DriverOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    assertRole(context, 'driver', '当前账号不是司机');

    return true;
  }
}

@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    assertRole(context, 'admin', '当前账号不是管理员');

    return true;
  }
}

function assertRole(
  context: ExecutionContext,
  expectedRole: AuthenticatedUser['userType'],
  message: string,
) {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  const currentUser = request.currentUser;

  if (!currentUser) {
    throw new BusinessError(
      ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
      '访问令牌无效',
    );
  }

  if (currentUser.userType !== expectedRole) {
    throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, message);
  }
}
