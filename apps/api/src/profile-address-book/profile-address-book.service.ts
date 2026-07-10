import type { SaveShipperProfileAddressBookRequest } from './dto';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type { ProfileAddressBookRepository } from './profile-address-book.repository';

const PROFILE_ADDRESS_BOOK_CONFLICT_MESSAGE =
  '常用地址/联系人已被其他设备更新，请先拉取最新地址簿后再保存。';

export class ProfileAddressBookService {
  constructor(private readonly repository: ProfileAddressBookRepository) {}

  async getAddressBook(shipperId: string) {
    return this.repository.findAddressBookByShipperId(shipperId);
  }

  async saveAddressBook(
    shipperId: string,
    input: SaveShipperProfileAddressBookRequest,
  ) {
    const currentAddressBook =
      await this.repository.findAddressBookByShipperId(shipperId);

    if (
      currentAddressBook &&
      input.baseUpdatedAtIso &&
      !isSameInstant(currentAddressBook.updatedAtIso, input.baseUpdatedAtIso)
    ) {
      throw new BusinessError(
        ApiErrorCode.PROFILE_ADDRESS_BOOK_CONFLICT,
        PROFILE_ADDRESS_BOOK_CONFLICT_MESSAGE,
      );
    }

    return this.repository.saveAddressBook(shipperId, input);
  }
}

function isSameInstant(leftIso: string, rightIso: string) {
  return Date.parse(leftIso) === Date.parse(rightIso);
}
