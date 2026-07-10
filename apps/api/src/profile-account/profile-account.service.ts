import type { SaveShipperProfileAccountRequest } from './dto';
import type { ProfileAccountRepository } from './profile-account.repository';

export class ProfileAccountService {
  constructor(private readonly repository: ProfileAccountRepository) {}

  async getAccount(shipperId: string, phone: string) {
    return this.repository.findAccountByShipperId(shipperId, phone);
  }

  async saveAccount(
    shipperId: string,
    phone: string,
    input: SaveShipperProfileAccountRequest,
  ) {
    return this.repository.saveAccount(shipperId, phone, input);
  }
}
