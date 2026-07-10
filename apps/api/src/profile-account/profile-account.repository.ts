import type {
  SaveShipperProfileAccountRequest,
  ShipperProfileAccountRecord,
} from './dto';

export interface ProfileAccountRepository {
  findAccountByShipperId(
    shipperId: string,
    phone: string,
  ): Promise<ShipperProfileAccountRecord | undefined>;
  saveAccount(
    shipperId: string,
    phone: string,
    input: SaveShipperProfileAccountRequest,
  ): Promise<ShipperProfileAccountRecord>;
}

export class InMemoryProfileAccountRepository implements ProfileAccountRepository {
  private readonly accounts = new Map<string, ShipperProfileAccountRecord>();

  async findAccountByShipperId(shipperId: string, phone: string) {
    const account = this.accounts.get(shipperId);

    if (!account) {
      return undefined;
    }

    return {
      ...account,
      phone,
    };
  }

  async saveAccount(
    shipperId: string,
    phone: string,
    input: SaveShipperProfileAccountRequest,
  ): Promise<ShipperProfileAccountRecord> {
    const account: ShipperProfileAccountRecord = {
      shipperId,
      displayName: input.displayName,
      phone,
    };

    this.accounts.set(shipperId, account);

    return account;
  }
}

export type PrismaProfileAccountRecord = {
  userId: string;
  displayName: string;
};

export type PrismaProfileAccountClient = {
  shipperProfile: {
    findUnique(args: {
      where: { userId: string };
    }): Promise<PrismaProfileAccountRecord | null>;
    upsert(args: {
      where: { userId: string };
      create: {
        userId: string;
        displayName: string;
        identityStatus: string;
        enterpriseStatus: string;
      };
      update: {
        displayName: string;
      };
    }): Promise<PrismaProfileAccountRecord>;
  };
};

export class PrismaProfileAccountRepository implements ProfileAccountRepository {
  constructor(private readonly prisma: PrismaProfileAccountClient) {}

  async findAccountByShipperId(shipperId: string, phone: string) {
    const account = await this.prisma.shipperProfile.findUnique({
      where: { userId: shipperId },
    });

    return account ? mapPrismaProfileAccount(account, phone) : undefined;
  }

  async saveAccount(
    shipperId: string,
    phone: string,
    input: SaveShipperProfileAccountRequest,
  ): Promise<ShipperProfileAccountRecord> {
    const account = await this.prisma.shipperProfile.upsert({
      where: { userId: shipperId },
      create: {
        userId: shipperId,
        displayName: input.displayName,
        identityStatus: 'unverified',
        enterpriseStatus: 'unverified',
      },
      update: {
        displayName: input.displayName,
      },
    });

    return mapPrismaProfileAccount(account, phone);
  }
}

function mapPrismaProfileAccount(
  account: PrismaProfileAccountRecord,
  phone: string,
): ShipperProfileAccountRecord {
  return {
    shipperId: account.userId,
    displayName: account.displayName,
    phone,
  };
}
