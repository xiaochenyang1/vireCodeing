import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import { ApiErrorCode, BusinessError } from '../common/errors';
import {
  NotificationDeviceTokensController,
  NotificationsController,
} from './notifications.controller';
import { NotificationsService } from './notifications.service';

type NotificationsServiceMock = Pick<
  NotificationsService,
  | 'listMessages'
  | 'markAllMessagesRead'
  | 'markMessageRead'
  | 'registerDeviceToken'
  | 'listDevicePushTokens'
  | 'deactivateDevicePushToken'
>;

describe('Notifications controllers', () => {
  function createService(): jest.Mocked<NotificationsServiceMock> {
    return {
      listMessages: jest.fn(),
      markAllMessagesRead: jest.fn(),
      markMessageRead: jest.fn(),
      registerDeviceToken: jest.fn(),
      listDevicePushTokens: jest.fn(),
      deactivateDevicePushToken: jest.fn(),
    };
  }

  it('mounts inbox and device-token routes under separate /me paths', () => {
    expect(Reflect.getMetadata(PATH_METADATA, NotificationsController)).toBe(
      'me/messages',
    );
    expect(
      Reflect.getMetadata(PATH_METADATA, NotificationDeviceTokensController),
    ).toBe('me');
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        NotificationDeviceTokensController.prototype.registerDeviceToken,
      ),
    ).toBe('device-token');
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        NotificationDeviceTokensController.prototype.listDeviceTokens,
      ),
    ).toBe('device-tokens');
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        NotificationDeviceTokensController.prototype.deactivateDeviceToken,
      ),
    ).toBe('device-tokens/deactivate');
  });

  it('protects both notification controllers with the access token guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, NotificationsController)).toEqual(
      [AccessTokenGuard],
    );
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        NotificationDeviceTokensController,
      ),
    ).toEqual([AccessTokenGuard]);
  });

  it('registers a device token for the current user', async () => {
    const service = createService();
    const controller = new NotificationDeviceTokensController(
      service as unknown as NotificationsService,
    );
    service.registerDeviceToken.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      token: 'expo-token-1',
      platform: 'ios',
      deviceId: 'device-1',
      isActive: true,
      lastUsedAtIso: '2026-07-24T12:00:00.000Z',
      createdAtIso: '2026-07-24T12:00:00.000Z',
      updatedAtIso: '2026-07-24T12:00:00.000Z',
    });

    const response = await controller.registerDeviceToken(createRequest(), {
      pushToken: '  expo-token-1  ',
      platform: 'ios',
      deviceId: '  device-1  ',
    });

    expect(service.registerDeviceToken).toHaveBeenCalledWith('user-1', {
      pushToken: 'expo-token-1',
      platform: 'ios',
      deviceId: 'device-1',
    });
    expect(response).toMatchObject({
      code: 'OK',
      requestId: 'req_notifications_test',
      data: {
        id: 'token-1',
        token: 'expo-token-1',
      },
    });
  });

  it('lists device tokens for the current user', async () => {
    const service = createService();
    const controller = new NotificationDeviceTokensController(
      service as unknown as NotificationsService,
    );
    service.listDevicePushTokens.mockResolvedValue([
      {
        id: 'token-1',
        userId: 'user-1',
        token: 'expo-token-1',
        platform: 'ios',
        deviceId: 'device-1',
        isActive: true,
        lastUsedAtIso: '2026-07-24T12:00:00.000Z',
        createdAtIso: '2026-07-24T12:00:00.000Z',
        updatedAtIso: '2026-07-24T12:00:00.000Z',
      },
    ]);

    const response = await controller.listDeviceTokens(createRequest());

    expect(service.listDevicePushTokens).toHaveBeenCalledWith('user-1');
    expect(response).toMatchObject({
      code: 'OK',
      requestId: 'req_notifications_test',
      data: {
        items: [
          {
            id: 'token-1',
            token: 'expo-token-1',
          },
        ],
      },
    });
  });

  it('deactivates a device token for the current user', async () => {
    const service = createService();
    const controller = new NotificationDeviceTokensController(
      service as unknown as NotificationsService,
    );
    service.deactivateDevicePushToken.mockResolvedValue(true);

    const response = await controller.deactivateDeviceToken(createRequest(), {
      token: '  expo-token-1  ',
    });

    expect(service.deactivateDevicePushToken).toHaveBeenCalledWith(
      'user-1',
      'expo-token-1',
    );
    expect(response).toMatchObject({
      code: 'OK',
      requestId: 'req_notifications_test',
      data: { deactivated: true },
    });
  });

  it('rejects device-token requests without an authenticated user', async () => {
    const service = createService();
    const controller = new NotificationDeviceTokensController(
      service as unknown as NotificationsService,
    );

    await expect(
      controller.listDeviceTokens({
        headers: { 'x-request-id': 'req_notifications_test' },
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
        '访问令牌无效',
      ),
    );
  });
});

function createRequest(userId = 'user-1'): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'req_notifications_test' },
    currentUser: {
      id: userId,
      phone: '13800138000',
      userType: 'shipper',
    },
  };
}
