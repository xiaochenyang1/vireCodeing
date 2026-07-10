import type { ExecutionContext } from '@nestjs/common';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { AccessTokenGuard } from './access-token.guard';
import type { AuthenticatedUser } from './dto';

type GuardRequest = {
  headers: Record<string, string | string[] | undefined>;
  currentUser?: AuthenticatedUser;
};

function createContext(request: GuardRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('AccessTokenGuard', () => {
  it('attaches the authenticated user from a bearer token', async () => {
    const user: AuthenticatedUser = {
      id: 'local-user-13800138000',
      phone: '13800138000',
      userType: 'shipper',
    };
    const authService = {
      getCurrentUser: jest.fn().mockResolvedValue(user),
    };
    const request: GuardRequest = {
      headers: {
        authorization: 'Bearer access.local-user-13800138000.900',
      },
    };
    const guard = new AccessTokenGuard(authService);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(authService.getCurrentUser).toHaveBeenCalledWith(
      'access.local-user-13800138000.900',
    );
    expect(request.currentUser).toEqual(user);
  });

  it('rejects a missing bearer token as an access token error', async () => {
    const guard = new AccessTokenGuard({
      getCurrentUser: jest.fn(),
    });

    await expect(
      guard.canActivate(createContext({ headers: {} })),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID, '访问令牌无效'),
    );
  });

  it('rejects malformed bearer token headers before service execution', async () => {
    const authService = {
      getCurrentUser: jest.fn(),
    };
    const guard = new AccessTokenGuard(authService);

    for (const authorization of [
      'Basic access.local-user-13800138000.900',
      'Bearer',
      'Bearer    ',
      'Bearer access.local-user-13800138000.900 extra',
      ['Bearer access.one', 'Bearer access.two'],
    ]) {
      await expect(
        guard.canActivate(
          createContext({
            headers: {
              authorization,
            },
          }),
        ),
      ).rejects.toEqual(
        new BusinessError(
          ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
          '访问令牌无效',
        ),
      );
    }

    expect(authService.getCurrentUser).not.toHaveBeenCalled();
  });
});
