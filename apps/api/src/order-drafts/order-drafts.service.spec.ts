import { InMemoryOrderDraftsRepository } from './order-drafts.repository';
import { OrderDraftsService } from './order-drafts.service';

describe('OrderDraftsService', () => {
  const now = new Date('2026-07-02T09:00:00.000Z');

  function createService() {
    const repository = new InMemoryOrderDraftsRepository(() => now);

    return {
      repository,
      service: new OrderDraftsService(repository, () => now),
    };
  }

  it('returns undefined when the current shipper has no saved draft', async () => {
    const { service } = createService();

    await expect(service.getDraft('shipper-1')).resolves.toBeUndefined();
  });

  it('saves and reads the current shipper draft snapshot', async () => {
    const { service } = createService();

    await expect(
      service.saveDraft('shipper-1', {
        draftSnapshot: {
          cargoType: 'digital',
          pickupAddress: '宝安临时仓',
        },
        clientUpdatedAtIso: '2026-07-02T08:30:00.000Z',
      }),
    ).resolves.toEqual({
      shipperId: 'shipper-1',
      draftSnapshot: {
        cargoType: 'digital',
        pickupAddress: '宝安临时仓',
      },
      clientUpdatedAtIso: '2026-07-02T08:30:00.000Z',
      updatedAtIso: now.toISOString(),
    });

    await expect(service.getDraft('shipper-1')).resolves.toMatchObject({
      shipperId: 'shipper-1',
      draftSnapshot: {
        pickupAddress: '宝安临时仓',
      },
    });
  });

  it('keeps draft snapshots isolated by shipper id', async () => {
    const { service } = createService();

    await service.saveDraft('shipper-1', {
      draftSnapshot: { pickupAddress: '宝安临时仓' },
    });
    await service.saveDraft('shipper-2', {
      draftSnapshot: { pickupAddress: '龙华备用仓' },
    });

    await expect(service.getDraft('shipper-1')).resolves.toMatchObject({
      draftSnapshot: { pickupAddress: '宝安临时仓' },
    });
    await expect(service.getDraft('shipper-2')).resolves.toMatchObject({
      draftSnapshot: { pickupAddress: '龙华备用仓' },
    });
  });

  it('overwrites the current shipper draft with the latest snapshot', async () => {
    const { service } = createService();

    await service.saveDraft('shipper-1', {
      draftSnapshot: { pickupAddress: '宝安临时仓' },
    });
    await service.saveDraft('shipper-1', {
      draftSnapshot: { pickupAddress: '南山新仓' },
    });

    await expect(service.getDraft('shipper-1')).resolves.toMatchObject({
      draftSnapshot: { pickupAddress: '南山新仓' },
    });
  });

  it('rejects stale base versions without overwriting the current draft', async () => {
    let currentTime = new Date('2026-07-02T09:00:00.000Z');
    const repository = new InMemoryOrderDraftsRepository(() => currentTime);
    const service = new OrderDraftsService(repository, () => currentTime);

    await service.saveDraft('shipper-1', {
      draftSnapshot: { pickupAddress: '宝安临时仓' },
    });

    currentTime = new Date('2026-07-02T09:05:00.000Z');

    await expect(
      service.saveDraft('shipper-1', {
        draftSnapshot: { pickupAddress: '南山新仓' },
        baseUpdatedAtIso: '2026-07-02T08:30:00.000Z',
      } as never),
    ).rejects.toMatchObject({
      code: 'ORDER_DRAFT_CONFLICT',
      message: '发单草稿已被其他设备更新，请先拉取最新草稿后再保存。',
    });

    await expect(service.getDraft('shipper-1')).resolves.toMatchObject({
      draftSnapshot: { pickupAddress: '宝安临时仓' },
      updatedAtIso: '2026-07-02T09:00:00.000Z',
    });
  });

  it('does not return drafts older than twenty-four hours', async () => {
    let currentTime = new Date('2026-07-01T09:00:00.000Z');
    const repository = new InMemoryOrderDraftsRepository(() => currentTime);
    const service = new OrderDraftsService(repository, () => currentTime);

    await service.saveDraft('shipper-1', {
      draftSnapshot: { pickupAddress: '宝安临时仓' },
    });

    currentTime = new Date('2026-07-02T09:00:01.000Z');

    await expect(service.getDraft('shipper-1')).resolves.toBeUndefined();
  });
});
