import { InMemoryProfileFrequentRoutesRepository } from './profile-frequent-routes.repository';
import { ProfileFrequentRoutesService } from './profile-frequent-routes.service';

describe('ProfileFrequentRoutesService', () => {
  const now = new Date('2026-07-04T08:30:00.000Z');

  function createService() {
    const repository = new InMemoryProfileFrequentRoutesRepository(() => now);

    return {
      repository,
      service: new ProfileFrequentRoutesService(repository),
    };
  }

  it('returns undefined when the current shipper has no saved frequent routes', async () => {
    const { service } = createService();

    await expect(service.getFrequentRoutes('shipper-1')).resolves.toBeUndefined();
  });

  it('saves and reads the current shipper frequent routes snapshot', async () => {
    const { service } = createService();

    await expect(
      service.saveFrequentRoutes('shipper-1', {
        routes: [
          {
            id: 'route-1',
            name: '宝安仓库 -> 南山门店',
            from: '宝安仓库',
            to: '南山门店',
            lastUsedText: '刚刚添加',
            lastUsedIso: '2026-07-04T08:00:00.000Z',
          },
        ],
        clientUpdatedAtIso: '2026-07-04T08:00:00.000Z',
      }),
    ).resolves.toEqual({
      shipperId: 'shipper-1',
      routes: [
        {
          id: 'route-1',
          name: '宝安仓库 -> 南山门店',
          from: '宝安仓库',
          to: '南山门店',
          lastUsedText: '刚刚添加',
          lastUsedIso: '2026-07-04T08:00:00.000Z',
        },
      ],
      clientUpdatedAtIso: '2026-07-04T08:00:00.000Z',
      updatedAtIso: now.toISOString(),
    });

    await expect(service.getFrequentRoutes('shipper-1')).resolves.toMatchObject({
      shipperId: 'shipper-1',
      routes: [{ name: '宝安仓库 -> 南山门店' }],
    });
  });

  it('keeps frequent routes isolated by shipper id', async () => {
    const { service } = createService();

    await service.saveFrequentRoutes('shipper-1', {
      routes: [
        {
          id: 'route-1',
          name: '宝安仓库 -> 南山门店',
          from: '宝安仓库',
          to: '南山门店',
          lastUsedText: '刚刚添加',
        },
      ],
    });
    await service.saveFrequentRoutes('shipper-2', {
      routes: [
        {
          id: 'route-2',
          name: '龙华仓 -> 福田展厅',
          from: '龙华仓',
          to: '福田展厅',
          lastUsedText: '刚刚添加',
        },
      ],
    });

    await expect(service.getFrequentRoutes('shipper-1')).resolves.toMatchObject({
      routes: [{ name: '宝安仓库 -> 南山门店' }],
    });
    await expect(service.getFrequentRoutes('shipper-2')).resolves.toMatchObject({
      routes: [{ name: '龙华仓 -> 福田展厅' }],
    });
  });

  it('rejects stale base versions without overwriting the current frequent routes', async () => {
    let currentTime = new Date('2026-07-04T08:30:00.000Z');
    const repository = new InMemoryProfileFrequentRoutesRepository(
      () => currentTime,
    );
    const service = new ProfileFrequentRoutesService(repository);

    await service.saveFrequentRoutes('shipper-1', {
      routes: [
        {
          id: 'route-1',
          name: '宝安仓库 -> 南山门店',
          from: '宝安仓库',
          to: '南山门店',
          lastUsedText: '刚刚添加',
        },
      ],
    });

    currentTime = new Date('2026-07-04T08:35:00.000Z');

    await expect(
      service.saveFrequentRoutes('shipper-1', {
        routes: [
          {
            id: 'route-1',
            name: '南山仓 -> 罗湖门店',
            from: '南山仓',
            to: '罗湖门店',
            lastUsedText: '刚刚添加',
          },
        ],
        baseUpdatedAtIso: '2026-07-04T08:00:00.000Z',
      } as never),
    ).rejects.toMatchObject({
      code: 'PROFILE_FREQUENT_ROUTES_CONFLICT',
      message: '常用路线已被其他设备更新，请先拉取最新路线后再保存。',
    });

    await expect(service.getFrequentRoutes('shipper-1')).resolves.toMatchObject({
      routes: [{ name: '宝安仓库 -> 南山门店' }],
      updatedAtIso: '2026-07-04T08:30:00.000Z',
    });
  });
});
