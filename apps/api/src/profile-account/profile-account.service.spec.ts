import { InMemoryProfileAccountRepository } from './profile-account.repository';
import { ProfileAccountService } from './profile-account.service';

describe('ProfileAccountService', () => {
  function createService() {
    const repository = new InMemoryProfileAccountRepository();

    return {
      repository,
      service: new ProfileAccountService(repository),
    };
  }

  it('returns undefined when the current shipper has no saved account snapshot', async () => {
    const { service } = createService();

    await expect(
      service.getAccount('shipper-1', '13900139001'),
    ).resolves.toBeUndefined();
  });

  it('saves and reads the current shipper account snapshot', async () => {
    const { service } = createService();

    await expect(
      service.saveAccount('shipper-1', '13900139001', {
        displayName: '晨星货主',
      }),
    ).resolves.toEqual({
      shipperId: 'shipper-1',
      displayName: '晨星货主',
      phone: '13900139001',
    });

    await expect(
      service.getAccount('shipper-1', '13900139001'),
    ).resolves.toEqual({
      shipperId: 'shipper-1',
      displayName: '晨星货主',
      phone: '13900139001',
    });
  });

  it('keeps account snapshots isolated by shipper id', async () => {
    const { service } = createService();

    await service.saveAccount('shipper-1', '13900139001', {
      displayName: '晨星货主',
    });
    await service.saveAccount('shipper-2', '13800138000', {
      displayName: '龙华货主',
    });

    await expect(
      service.getAccount('shipper-1', '13900139001'),
    ).resolves.toEqual({
      shipperId: 'shipper-1',
      displayName: '晨星货主',
      phone: '13900139001',
    });
    await expect(
      service.getAccount('shipper-2', '13800138000'),
    ).resolves.toEqual({
      shipperId: 'shipper-2',
      displayName: '龙华货主',
      phone: '13800138000',
    });
  });
});
