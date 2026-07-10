import type {
  SaveShipperProfileAddressBookRequest,
  ShipperProfileAddressBookAddress,
  ShipperProfileAddressBookContact,
  ShipperProfileAddressBookRecord,
} from './dto';

export interface ProfileAddressBookRepository {
  findAddressBookByShipperId(
    shipperId: string,
  ): Promise<ShipperProfileAddressBookRecord | undefined>;
  saveAddressBook(
    shipperId: string,
    input: SaveShipperProfileAddressBookRequest,
  ): Promise<ShipperProfileAddressBookRecord>;
}

export class InMemoryProfileAddressBookRepository
  implements ProfileAddressBookRepository
{
  private readonly addressBooks = new Map<
    string,
    ShipperProfileAddressBookRecord
  >();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async findAddressBookByShipperId(shipperId: string) {
    return this.addressBooks.get(shipperId);
  }

  async saveAddressBook(
    shipperId: string,
    input: SaveShipperProfileAddressBookRequest,
  ): Promise<ShipperProfileAddressBookRecord> {
    const addressBook: ShipperProfileAddressBookRecord = {
      shipperId,
      addresses: input.addresses,
      contacts: input.contacts,
      clientUpdatedAtIso: input.clientUpdatedAtIso,
      updatedAtIso: this.now().toISOString(),
    };

    this.addressBooks.set(shipperId, addressBook);

    return addressBook;
  }
}

export type PrismaProfileAddressBookRecord = {
  shipperId: string;
  addresses: unknown;
  contacts: unknown;
  clientUpdatedAt: Date | null;
  updatedAt: Date;
};

export type PrismaProfileAddressBookClient = {
  shipperAddressBook: {
    findUnique(args: {
      where: { shipperId: string };
    }): Promise<PrismaProfileAddressBookRecord | null>;
    upsert(args: {
      where: { shipperId: string };
      create: {
        shipperId: string;
        addresses: ShipperProfileAddressBookAddress[];
        contacts: ShipperProfileAddressBookContact[];
        clientUpdatedAt?: Date;
      };
      update: {
        addresses: ShipperProfileAddressBookAddress[];
        contacts: ShipperProfileAddressBookContact[];
        clientUpdatedAt: Date | null;
      };
    }): Promise<PrismaProfileAddressBookRecord>;
  };
};

export class PrismaProfileAddressBookRepository
  implements ProfileAddressBookRepository
{
  constructor(private readonly prisma: PrismaProfileAddressBookClient) {}

  async findAddressBookByShipperId(shipperId: string) {
    const addressBook = await this.prisma.shipperAddressBook.findUnique({
      where: { shipperId },
    });

    return addressBook ? mapPrismaProfileAddressBook(addressBook) : undefined;
  }

  async saveAddressBook(
    shipperId: string,
    input: SaveShipperProfileAddressBookRequest,
  ): Promise<ShipperProfileAddressBookRecord> {
    const clientUpdatedAt = input.clientUpdatedAtIso
      ? new Date(input.clientUpdatedAtIso)
      : undefined;
    const addressBook = await this.prisma.shipperAddressBook.upsert({
      where: { shipperId },
      create: {
        shipperId,
        addresses: input.addresses,
        contacts: input.contacts,
        clientUpdatedAt,
      },
      update: {
        addresses: input.addresses,
        contacts: input.contacts,
        clientUpdatedAt: clientUpdatedAt ?? null,
      },
    });

    return mapPrismaProfileAddressBook(addressBook);
  }
}

function mapPrismaProfileAddressBook(
  addressBook: PrismaProfileAddressBookRecord,
): ShipperProfileAddressBookRecord {
  return {
    shipperId: addressBook.shipperId,
    addresses: toAddressBookAddresses(addressBook.addresses),
    contacts: toAddressBookContacts(addressBook.contacts),
    clientUpdatedAtIso: addressBook.clientUpdatedAt?.toISOString(),
    updatedAtIso: addressBook.updatedAt.toISOString(),
  };
}

function toAddressBookAddresses(
  value: unknown,
): ShipperProfileAddressBookAddress[] {
  return Array.isArray(value)
    ? (value as ShipperProfileAddressBookAddress[])
    : [];
}

function toAddressBookContacts(
  value: unknown,
): ShipperProfileAddressBookContact[] {
  return Array.isArray(value)
    ? (value as ShipperProfileAddressBookContact[])
    : [];
}
