import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ProfileAddressBookController } from './profile-address-book.controller';
import type { ProfileAddressBookService } from './profile-address-book.service';

describe('ProfileAddressBookController', () => {
  it('gets the current shipper profile address book', async () => {
    const service = {
      getAddressBook: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        addresses: [{ id: 'address-1', name: '宝安仓' }],
        contacts: [],
      }),
    } as unknown as ProfileAddressBookService;
    const controller = new ProfileAddressBookController(service);

    await expect(
      controller.getAddressBook(createRequest('shipper-1')),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        shipperId: 'shipper-1',
        addresses: [{ id: 'address-1', name: '宝安仓' }],
        contacts: [],
      },
      requestId: 'req_profile_address_book_test',
    });
    expect(service.getAddressBook).toHaveBeenCalledWith('shipper-1');
  });

  it('returns null data when the current shipper has no address book', async () => {
    const service = {
      getAddressBook: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProfileAddressBookService;
    const controller = new ProfileAddressBookController(service);

    await expect(
      controller.getAddressBook(createRequest('shipper-1')),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: null,
        requestId: 'req_profile_address_book_test',
      }),
    );
    expect(service.getAddressBook).toHaveBeenCalledWith('shipper-1');
  });

  it('saves the current shipper profile address book', async () => {
    const service = {
      saveAddressBook: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        addresses: [{ id: 'address-1', name: '宝安仓' }],
        contacts: [],
      }),
    } as unknown as ProfileAddressBookService;
    const controller = new ProfileAddressBookController(service);
    const body = {
      addresses: [
        {
          id: 'address-1',
          name: '宝安仓',
          address: '宝安区临时仓',
          contactText: '赵经理 13800138001',
        },
      ],
      contacts: [],
    };

    await expect(
      controller.saveAddressBook(createRequest('shipper-1'), body),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        shipperId: 'shipper-1',
        addresses: [{ id: 'address-1', name: '宝安仓' }],
        contacts: [],
      },
      requestId: 'req_profile_address_book_test',
    });
    expect(service.saveAddressBook).toHaveBeenCalledWith('shipper-1', body);
  });

  it('rejects non-shipper users before reading address book data', async () => {
    const service = {
      getAddressBook: jest.fn(),
    } as unknown as ProfileAddressBookService;
    const controller = new ProfileAddressBookController(service);

    await expect(
      controller.getAddressBook(createRequest('driver-1', 'driver')),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是货主'),
    );
    expect(service.getAddressBook).not.toHaveBeenCalled();
  });
});

function createRequest(
  userId: string,
  userType: 'shipper' | 'driver' | 'admin' = 'shipper',
): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'req_profile_address_book_test' },
    currentUser: { id: userId, phone: '13900139001', userType },
  };
}
