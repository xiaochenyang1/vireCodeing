import { InMemoryProfileAddressBookRepository } from './profile-address-book.repository';
import { ProfileAddressBookService } from './profile-address-book.service';

describe('ProfileAddressBookService', () => {
  const now = new Date('2026-07-03T08:30:00.000Z');

  function createService() {
    const repository = new InMemoryProfileAddressBookRepository(() => now);

    return {
      repository,
      service: new ProfileAddressBookService(repository),
    };
  }

  it('returns undefined when the current shipper has no saved address book', async () => {
    const { service } = createService();

    await expect(service.getAddressBook('shipper-1')).resolves.toBeUndefined();
  });

  it('saves and reads the current shipper address book snapshot', async () => {
    const { service } = createService();

    await expect(
      service.saveAddressBook('shipper-1', {
        addresses: [
          {
            id: 'address-1',
            name: '宝安仓',
            address: '宝安区临时仓',
            contactText: '赵经理 13800138001',
            tagText: '常用装货地',
          },
        ],
        contacts: [
          {
            id: 'contact-1',
            name: '钱店长',
            roleText: '卸货负责人',
            phoneText: '13800138002',
            noteText: '南山门店',
          },
        ],
        clientUpdatedAtIso: '2026-07-03T08:00:00.000Z',
      }),
    ).resolves.toEqual({
      shipperId: 'shipper-1',
      addresses: [
        {
          id: 'address-1',
          name: '宝安仓',
          address: '宝安区临时仓',
          contactText: '赵经理 13800138001',
          tagText: '常用装货地',
        },
      ],
      contacts: [
        {
          id: 'contact-1',
          name: '钱店长',
          roleText: '卸货负责人',
          phoneText: '13800138002',
          noteText: '南山门店',
        },
      ],
      clientUpdatedAtIso: '2026-07-03T08:00:00.000Z',
      updatedAtIso: now.toISOString(),
    });

    await expect(service.getAddressBook('shipper-1')).resolves.toMatchObject({
      shipperId: 'shipper-1',
      addresses: [{ name: '宝安仓' }],
      contacts: [{ name: '钱店长' }],
    });
  });

  it('keeps address books isolated by shipper id', async () => {
    const { service } = createService();

    await service.saveAddressBook('shipper-1', {
      addresses: [
        {
          id: 'address-1',
          name: '宝安仓',
          address: '宝安区临时仓',
          contactText: '赵经理 13800138001',
        },
      ],
      contacts: [],
    });
    await service.saveAddressBook('shipper-2', {
      addresses: [
        {
          id: 'address-2',
          name: '龙华仓',
          address: '龙华区临时仓',
          contactText: '吴主管 13800138003',
        },
      ],
      contacts: [],
    });

    await expect(service.getAddressBook('shipper-1')).resolves.toMatchObject({
      addresses: [{ name: '宝安仓' }],
    });
    await expect(service.getAddressBook('shipper-2')).resolves.toMatchObject({
      addresses: [{ name: '龙华仓' }],
    });
  });

  it('rejects stale base versions without overwriting the current address book', async () => {
    let currentTime = new Date('2026-07-03T08:30:00.000Z');
    const repository = new InMemoryProfileAddressBookRepository(
      () => currentTime,
    );
    const service = new ProfileAddressBookService(repository);

    await service.saveAddressBook('shipper-1', {
      addresses: [
        {
          id: 'address-1',
          name: '宝安仓',
          address: '宝安区临时仓',
          contactText: '赵经理 13800138001',
        },
      ],
      contacts: [],
    });

    currentTime = new Date('2026-07-03T08:35:00.000Z');

    await expect(
      service.saveAddressBook('shipper-1', {
        addresses: [
          {
            id: 'address-1',
            name: '南山新仓',
            address: '南山区新仓',
            contactText: '钱店长 13800138002',
          },
        ],
        contacts: [],
        baseUpdatedAtIso: '2026-07-03T08:00:00.000Z',
      } as never),
    ).rejects.toMatchObject({
      code: 'PROFILE_ADDRESS_BOOK_CONFLICT',
      message: '常用地址/联系人已被其他设备更新，请先拉取最新地址簿后再保存。',
    });

    await expect(service.getAddressBook('shipper-1')).resolves.toMatchObject({
      addresses: [{ name: '宝安仓' }],
      updatedAtIso: '2026-07-03T08:30:00.000Z',
    });
  });
});
