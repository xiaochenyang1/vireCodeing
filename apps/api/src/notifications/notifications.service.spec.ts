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
});
