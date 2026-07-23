import { ApiErrorCode } from '../common/errors';
import { InMemoryNotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import type { PushProvider, PushSendResult } from './push-provider';

class FakePushProvider implements PushProvider {
  readonly channel = 'sandbox' as const;
  readonly sends: Array<{ userId: string; title: string; body: string }> = [];

  async send(input: {
    userId: string;
    title: string;
    body: string;
  }): Promise<PushSendResult> {
    this.sends.push(input);
    return {
      channel: 'sandbox',
      status: 'succeeded',
      providerMessageId: `push-${input.userId}`,
    };
  }
}

describe('NotificationsService', () => {
  it('lists, marks one message read, and marks all messages read', async () => {
    const repository = new InMemoryNotificationsRepository({
      now: () => new Date('2026-07-21T10:00:00.000Z'),
      createId: (() => {
        let index = 0;
        return () => `msg-${++index}`;
      })(),
    });
    const pushProvider = new FakePushProvider();
    const service = new NotificationsService(repository, pushProvider);

    await service.createAndPush({
      userId: 'shipper-1',
      audience: 'shipper',
      category: 'order',
      title: '订单发布成功',
      content: '订单 HY20260721001 已发布，等待司机接单。',
      orderId: 'order-1',
      orderNo: 'HY20260721001',
    });
    await service.createAndPush({
      userId: 'shipper-1',
      audience: 'shipper',
      category: 'system',
      title: '系统通知',
      content: '欢迎使用平台消息中心。',
    });

    const listed = await service.listMessages('shipper-1', {
      page: 1,
      pageSize: 20,
    });
    expect(listed.total).toBe(2);
    expect(listed.unreadCount).toBe(2);
    expect(pushProvider.sends).toHaveLength(2);

    const readOne = await service.markMessageRead('shipper-1', listed.items[1].id);
    expect(readOne.unread).toBe(false);

    const afterOne = await service.listMessages('shipper-1', {
      page: 1,
      pageSize: 20,
    });
    expect(afterOne.unreadCount).toBe(1);

    const markAll = await service.markAllMessagesRead('shipper-1');
    expect(markAll.updatedCount).toBe(1);

    const afterAll = await service.listMessages('shipper-1', {
      page: 1,
      pageSize: 20,
    });
    expect(afterAll.unreadCount).toBe(0);
  });

  it('notifies shipper and driver when a driver accepts an order', async () => {
    const repository = new InMemoryNotificationsRepository({
      now: () => new Date('2026-07-21T10:00:00.000Z'),
      createId: (() => {
        let index = 0;
        return () => `msg-${++index}`;
      })(),
    });
    const service = new NotificationsService(repository, new FakePushProvider());

    await service.notifyOrderEvent({
      event: 'driver_accepted',
      orderId: 'order-1',
      orderNo: 'HY20260721001',
      shipperId: 'shipper-1',
      driverId: 'driver-1',
      nextStatus: 'loading',
    });

    const shipperMessages = await service.listMessages('shipper-1', {
      page: 1,
      pageSize: 20,
    });
    const driverMessages = await service.listMessages('driver-1', {
      page: 1,
      pageSize: 20,
    });

    expect(shipperMessages.items[0]).toMatchObject({
      title: '司机已接单',
      category: 'order',
      orderNo: 'HY20260721001',
    });
    expect(driverMessages.items[0]).toMatchObject({
      title: '接单成功',
      category: 'order',
    });
  });

  it('returns not found when marking a foreign message', async () => {
    const repository = new InMemoryNotificationsRepository();
    const service = new NotificationsService(repository, new FakePushProvider());

    await expect(
      service.markMessageRead('shipper-1', 'missing'),
    ).rejects.toMatchObject({
      code: ApiErrorCode.MESSAGE_NOT_FOUND,
    });
  });

  describe('registerDeviceToken', () => {
    it('registers a new device push token', async () => {
      const repository = new InMemoryNotificationsRepository();
      const service = new NotificationsService(repository, new FakePushProvider());

      const result = await service.registerDeviceToken('user-1', {
        pushToken: 'expo-token-abc',
        platform: 'ios',
        deviceId: 'device-1',
      });

      expect(result).toMatchObject({
        userId: 'user-1',
        token: 'expo-token-abc',
        platform: 'ios',
        deviceId: 'device-1',
        isActive: true,
      });
      expect(result.id).toBeDefined();
      expect(result.createdAtIso).toBeDefined();
    });

    it('reactivates an existing token', async () => {
      const repository = new InMemoryNotificationsRepository();
      const service = new NotificationsService(repository, new FakePushProvider());

      await service.registerDeviceToken('user-1', {
        pushToken: 'expo-token-abc',
        platform: 'ios',
        deviceId: 'device-1',
      });
      const reactivated = await service.registerDeviceToken('user-1', {
        pushToken: 'expo-token-abc',
        platform: 'android',
        deviceId: 'device-1',
      });

      expect(reactivated.deviceId).toBe('device-1');
      expect(reactivated.isActive).toBe(true);
      expect(reactivated.lastUsedAtIso).toBeDefined();
    });

    it('deactivates previous tokens on the same device when registering a new one', async () => {
      const repository = new InMemoryNotificationsRepository();
      const service = new NotificationsService(repository, new FakePushProvider());

      await service.registerDeviceToken('user-1', {
        pushToken: 'old-token',
        platform: 'ios',
        deviceId: 'device-1',
      });
      await service.registerDeviceToken('user-1', {
        pushToken: 'new-token',
        platform: 'ios',
        deviceId: 'device-1',
      });

      const tokens = await service.listDevicePushTokens('user-1');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].token).toBe('new-token');
      expect(tokens[0].isActive).toBe(true);
    });

    it('rejects empty push token', async () => {
      const repository = new InMemoryNotificationsRepository();
      const service = new NotificationsService(repository, new FakePushProvider());

      await expect(
        service.registerDeviceToken('user-1', {
          pushToken: '   ',
          platform: 'ios',
          deviceId: 'device-1',
        }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.PUSH_TOKEN_INVALID,
      });
    });

    it('lists active tokens for a user', async () => {
      const repository = new InMemoryNotificationsRepository();
      const service = new NotificationsService(repository, new FakePushProvider());

      await service.registerDeviceToken('user-1', {
        pushToken: 'token-1',
        platform: 'ios',
        deviceId: 'device-1',
      });
      await service.registerDeviceToken('user-1', {
        pushToken: 'token-2',
        platform: 'android',
        deviceId: 'device-2',
      });

      const tokens = await service.listDevicePushTokens('user-1');
      expect(tokens).toHaveLength(2);
    });

    it('deactivates a token', async () => {
      const repository = new InMemoryNotificationsRepository();
      const service = new NotificationsService(repository, new FakePushProvider());

      await service.registerDeviceToken('user-1', {
        pushToken: 'token-1',
        platform: 'ios',
        deviceId: 'device-1',
      });

      const deactivated = await service.deactivateDevicePushToken(
        'user-1',
        'token-1',
      );
      expect(deactivated).toBe(true);

      const tokens = await service.listDevicePushTokens('user-1');
      expect(tokens).toHaveLength(0);
    });

    it('returns false when deactivating a non-existent token', async () => {
      const repository = new InMemoryNotificationsRepository();
      const service = new NotificationsService(repository, new FakePushProvider());

      const result = await service.deactivateDevicePushToken(
        'user-1',
        'nonexistent',
      );
      expect(result).toBe(false);
    });
  });
});
