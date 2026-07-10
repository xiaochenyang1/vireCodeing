import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  AdminDriverCertificationController,
  DriverCertificationController,
} from '../driver-certification/driver-certification.controller';
import { DriverOrdersController } from '../driver-orders/driver-orders.controller';
import { OrderDraftsController } from '../order-drafts/order-drafts.controller';
import { OrdersController } from '../orders/orders.controller';
import { ProfileAddressBookController } from '../profile-address-book/profile-address-book.controller';
import { ProfileFrequentRoutesController } from '../profile-frequent-routes/profile-frequent-routes.controller';
import { ApiErrorCode } from '../common/errors';
import {
  AdminOnlyGuard,
  DriverOnlyGuard,
  ShipperOnlyGuard,
} from './role.guard';
import type { AuthenticatedRequest } from './access-token.guard';

describe('role guards', () => {
  it.each([
    [DriverOrdersController, 'DriverOnlyGuard'],
    [DriverCertificationController, 'DriverOnlyGuard'],
    [AdminDriverCertificationController, 'AdminOnlyGuard'],
    [OrdersController, 'ShipperOnlyGuard'],
    [OrderDraftsController, 'ShipperOnlyGuard'],
    [ProfileAddressBookController, 'ShipperOnlyGuard'],
    [ProfileFrequentRoutesController, 'ShipperOnlyGuard'],
  ])('protects %p with %s before request pipes run', (target, guardName) => {
    expect(getGuardNames(target)).toEqual(
      expect.arrayContaining(['AccessTokenGuard', guardName]),
    );
  });

  it.each([
    [new ShipperOnlyGuard(), 'shipper'],
    [new DriverOnlyGuard(), 'driver'],
    [new AdminOnlyGuard(), 'admin'],
  ] as const)('allows %s for matching role %s', (guard, userType) => {
    expect(
      guard.canActivate(createExecutionContext({ currentUser: createUser(userType) })),
    ).toBe(true);
  });

  it('rejects requests before AccessTokenGuard has attached the current user', () => {
    expect(() =>
      new ShipperOnlyGuard().canActivate(createExecutionContext({})),
    ).toThrow(expect.objectContaining({
      code: ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
      message: '访问令牌无效',
    }));
  });

  it.each([
    [new ShipperOnlyGuard(), 'driver', '当前账号不是货主'],
    [new DriverOnlyGuard(), 'shipper', '当前账号不是司机'],
    [new AdminOnlyGuard(), 'driver', '当前账号不是管理员'],
  ] as const)('rejects %s for mismatched role %s', (guard, userType, message) => {
    expect(() =>
      guard.canActivate(
        createExecutionContext({ currentUser: createUser(userType) }),
      ),
    ).toThrow(expect.objectContaining({
      code: ApiErrorCode.AUTH_FORBIDDEN,
      message,
    }));
  });
});

function getGuardNames(target: Function) {
  const guards = Reflect.getMetadata(GUARDS_METADATA, target) ?? [];

  return guards.map((guard: Function) => guard.name);
}

function createExecutionContext(request: AuthenticatedRequest) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as never;
}

function createUser(userType: 'shipper' | 'driver' | 'admin') {
  return {
    id: `${userType}-1`,
    phone: '13900139000',
    userType,
  };
}
