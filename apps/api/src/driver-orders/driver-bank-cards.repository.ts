import type {
  CreateDriverBankCardRequest,
  DriverBankCardListResult,
  DriverBankCardRecord,
  UpdateDriverBankCardRequest,
} from './dto';

export interface DriverBankCardsRepository {
  listBankCards(driverId: string): Promise<DriverBankCardListResult>;
  getDefaultBankCard(
    driverId: string,
  ): Promise<DriverBankCardRecord | undefined>;
  createBankCard(
    driverId: string,
    input: CreateDriverBankCardRequest,
  ): Promise<DriverBankCardRecord>;
  updateBankCard(
    driverId: string,
    cardId: string,
    input: UpdateDriverBankCardRequest,
  ): Promise<DriverBankCardRecord>;
  deleteBankCard(driverId: string, cardId: string): Promise<void>;
  markBankCardUsed(driverId: string, cardId: string): Promise<void>;
}

type StoredDriverBankCardRecord = DriverBankCardRecord & {
  driverId: string;
  bankAccountNo: string;
};

function maskBankAccountNo(bankAccountNo: string): string {
  const normalizedAccountNo = bankAccountNo.replace(/\s+/g, '');
  const suffix = normalizedAccountNo.slice(-4);

  return `**** **** **** ${suffix}`;
}

export class InMemoryDriverBankCardsRepository
  implements DriverBankCardsRepository
{
  private readonly cards: StoredDriverBankCardRecord[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  async listBankCards(driverId: string): Promise<DriverBankCardListResult> {
    const items = this.cards
      .filter(card => card.driverId === driverId)
      .sort((left, right) => {
        if (left.isDefault !== right.isDefault) {
          return left.isDefault ? -1 : 1;
        }

        return right.createdAtIso.localeCompare(left.createdAtIso);
      })
      .map(card => ({
        id: card.id,
        bankAccountName: card.bankAccountName,
        bankName: card.bankName,
        bankAccountMasked: card.bankAccountMasked,
        isDefault: card.isDefault,
        lastUsedAtIso: card.lastUsedAtIso,
        createdAtIso: card.createdAtIso,
        updatedAtIso: card.updatedAtIso,
      }));

    return { items, total: items.length };
  }

  async getDefaultBankCard(
    driverId: string,
  ): Promise<DriverBankCardRecord | undefined> {
    const defaultCard = this.cards.find(
      card => card.driverId === driverId && card.isDefault,
    );

    if (defaultCard) {
      return {
        id: defaultCard.id,
        bankAccountName: defaultCard.bankAccountName,
        bankName: defaultCard.bankName,
        bankAccountMasked: defaultCard.bankAccountMasked,
        isDefault: defaultCard.isDefault,
        lastUsedAtIso: defaultCard.lastUsedAtIso,
        createdAtIso: defaultCard.createdAtIso,
        updatedAtIso: defaultCard.updatedAtIso,
      };
    }

    return undefined;
  }

  async createBankCard(
    driverId: string,
    input: CreateDriverBankCardRequest,
  ): Promise<DriverBankCardRecord> {
    const nowIso = this.now().toISOString();
    const normalizedAccountNo = input.bankAccountNo.replace(/\s+/g, '');

    if (input.isDefault) {
      for (const existingCard of this.cards) {
        if (existingCard.driverId === driverId && existingCard.isDefault) {
          existingCard.isDefault = false;
          existingCard.updatedAtIso = nowIso;
        }
      }
    }

    const card: StoredDriverBankCardRecord = {
      id: `driver-bank-card-${this.cards.length + 1}`,
      driverId,
      bankAccountName: input.bankAccountName,
      bankName: input.bankName,
      bankAccountNo: normalizedAccountNo,
      bankAccountMasked: maskBankAccountNo(normalizedAccountNo),
      isDefault: input.isDefault ?? false,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    this.cards.push(card);

    return {
      id: card.id,
      bankAccountName: card.bankAccountName,
      bankName: card.bankName,
      bankAccountMasked: card.bankAccountMasked,
      isDefault: card.isDefault,
      createdAtIso: card.createdAtIso,
      updatedAtIso: card.updatedAtIso,
    };
  }

  async updateBankCard(
    driverId: string,
    cardId: string,
    input: UpdateDriverBankCardRequest,
  ): Promise<DriverBankCardRecord> {
    const existingCard = this.cards.find(
      card => card.id === cardId && card.driverId === driverId,
    );

    if (!existingCard) {
      throw new Error('Bank card not found');
    }

    const nowIso = this.now().toISOString();

    if (input.isDefault && !existingCard.isDefault) {
      for (const card of this.cards) {
        if (card.driverId === driverId && card.isDefault) {
          card.isDefault = false;
          card.updatedAtIso = nowIso;
        }
      }
    }

    if (input.bankAccountNo) {
      const normalizedAccountNo = input.bankAccountNo.replace(/\s+/g, '');
      existingCard.bankAccountNo = normalizedAccountNo;
      existingCard.bankAccountMasked = maskBankAccountNo(normalizedAccountNo);
    }

    if (input.bankAccountName) {
      existingCard.bankAccountName = input.bankAccountName;
    }

    if (input.bankName) {
      existingCard.bankName = input.bankName;
    }

    if (input.isDefault !== undefined) {
      existingCard.isDefault = input.isDefault;
    }

    existingCard.updatedAtIso = nowIso;

    return {
      id: existingCard.id,
      bankAccountName: existingCard.bankAccountName,
      bankName: existingCard.bankName,
      bankAccountMasked: existingCard.bankAccountMasked,
      isDefault: existingCard.isDefault,
      lastUsedAtIso: existingCard.lastUsedAtIso,
      createdAtIso: existingCard.createdAtIso,
      updatedAtIso: existingCard.updatedAtIso,
    };
  }

  async deleteBankCard(driverId: string, cardId: string): Promise<void> {
    const index = this.cards.findIndex(
      card => card.id === cardId && card.driverId === driverId,
    );

    if (index >= 0) {
      this.cards.splice(index, 1);
    }
  }

  async markBankCardUsed(driverId: string, cardId: string): Promise<void> {
    const matchedCard = this.cards.find(
      card => card.id === cardId && card.driverId === driverId,
    );

    if (matchedCard) {
      matchedCard.lastUsedAtIso = this.now().toISOString();
      matchedCard.updatedAtIso = this.now().toISOString();
    }
  }
}

export type PrismaDriverBankCardsClient = {
  driverBankCard: {
    findMany(args: {
      where: { driverId: string };
      orderBy?: { createdAt: 'asc' | 'desc' };
    }): Promise<
      Array<{
        id: string;
        driverId: string;
        bankAccountName: string;
        bankName: string;
        bankAccountNo: string;
        isDefault: boolean;
        lastUsedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }>
    >;
    findFirst(args: {
      where: { driverId: string; isDefault: boolean };
    }): Promise<{
      id: string;
      driverId: string;
      bankAccountName: string;
      bankName: string;
      bankAccountNo: string;
      isDefault: boolean;
      lastUsedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    } | null>;
    findUnique(args: {
      where: { id: string };
    }): Promise<{
      id: string;
      driverId: string;
      bankAccountName: string;
      bankName: string;
      bankAccountNo: string;
      isDefault: boolean;
      lastUsedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    } | null>;
    create(args: {
      data: {
        driverId: string;
        bankAccountName: string;
        bankName: string;
        bankAccountNo: string;
        isDefault: boolean;
      };
    }): Promise<{
      id: string;
      driverId: string;
      bankAccountName: string;
      bankName: string;
      bankAccountNo: string;
      isDefault: boolean;
      lastUsedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
    update(args: {
      where: { id: string };
      data: {
        bankAccountName?: string;
        bankName?: string;
        bankAccountNo?: string;
        isDefault?: boolean;
        updatedAt?: Date;
      };
    }): Promise<{
      id: string;
      driverId: string;
      bankAccountName: string;
      bankName: string;
      bankAccountNo: string;
      isDefault: boolean;
      lastUsedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
    delete(args: {
      where: { id: string };
    }): Promise<{
      id: string;
      driverId: string;
      bankAccountName: string;
      bankName: string;
      bankAccountNo: string;
      isDefault: boolean;
      lastUsedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
    updateMany(args: {
      where: { driverId: string; isDefault: boolean };
      data: { isDefault: boolean; updatedAt: Date };
    }): Promise<{ count: number }>;
    updateMany(args: {
      where: { id: string; driverId: string };
      data: { lastUsedAt: Date; updatedAt: Date };
    }): Promise<{ count: number }>;
  };
};

function mapPrismaBankCard(record: {
  id: string;
  driverId: string;
  bankAccountName: string;
  bankName: string;
  bankAccountNo: string;
  isDefault: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): DriverBankCardRecord {
  const normalizedAccountNo = record.bankAccountNo.replace(/\s+/g, '');
  const suffix = normalizedAccountNo.slice(-4);

  return {
    id: record.id,
    bankAccountName: record.bankAccountName,
    bankName: record.bankName,
    bankAccountMasked: `**** **** **** ${suffix}`,
    isDefault: record.isDefault,
    lastUsedAtIso: record.lastUsedAt?.toISOString(),
    createdAtIso: record.createdAt.toISOString(),
    updatedAtIso: record.updatedAt.toISOString(),
  };
}

export class PrismaDriverBankCardsRepository
  implements DriverBankCardsRepository
{
  constructor(private readonly prisma: PrismaDriverBankCardsClient) {}

  async listBankCards(driverId: string): Promise<DriverBankCardListResult> {
    const items = await this.prisma.driverBankCard.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      items: items.map(mapPrismaBankCard),
      total: items.length,
    };
  }

  async getDefaultBankCard(
    driverId: string,
  ): Promise<DriverBankCardRecord | undefined> {
    const card = await this.prisma.driverBankCard.findFirst({
      where: { driverId, isDefault: true },
    });

    if (card) {
      return mapPrismaBankCard(card);
    }

    return undefined;
  }

  async createBankCard(
    driverId: string,
    input: CreateDriverBankCardRequest,
  ): Promise<DriverBankCardRecord> {
    const normalizedAccountNo = input.bankAccountNo.replace(/\s+/g, '');

    if (input.isDefault) {
      await this.prisma.driverBankCard.updateMany({
        where: { driverId, isDefault: true },
        data: { isDefault: false, updatedAt: new Date() },
      });
    }

    const card = await this.prisma.driverBankCard.create({
      data: {
        driverId,
        bankAccountName: input.bankAccountName,
        bankName: input.bankName,
        bankAccountNo: normalizedAccountNo,
        isDefault: input.isDefault ?? false,
      },
    });

    return mapPrismaBankCard(card);
  }

  async updateBankCard(
    driverId: string,
    cardId: string,
    input: UpdateDriverBankCardRequest,
  ): Promise<DriverBankCardRecord> {
    const existingCard = await this.prisma.driverBankCard.findUnique({
      where: { id: cardId },
    });

    if (!existingCard || existingCard.driverId !== driverId) {
      throw new Error('Bank card not found');
    }

    const now = new Date();

    if (input.isDefault && !existingCard.isDefault) {
      await this.prisma.driverBankCard.updateMany({
        where: { driverId, isDefault: true },
        data: { isDefault: false, updatedAt: now },
      });
    }

    const updateData: Record<string, unknown> = { updatedAt: now };

    if (input.bankAccountName) {
      updateData.bankAccountName = input.bankAccountName;
    }

    if (input.bankName) {
      updateData.bankName = input.bankName;
    }

    if (input.bankAccountNo) {
      updateData.bankAccountNo = input.bankAccountNo.replace(/\s+/g, '');
    }

    if (input.isDefault !== undefined) {
      updateData.isDefault = input.isDefault;
    }

    const updatedCard = await this.prisma.driverBankCard.update({
      where: { id: cardId },
      data: updateData,
    });

    return mapPrismaBankCard(updatedCard);
  }

  async deleteBankCard(driverId: string, cardId: string): Promise<void> {
    const existingCard = await this.prisma.driverBankCard.findUnique({
      where: { id: cardId },
    });

    if (!existingCard || existingCard.driverId !== driverId) {
      return;
    }

    await this.prisma.driverBankCard.delete({ where: { id: cardId } });
  }

  async markBankCardUsed(driverId: string, cardId: string): Promise<void> {
    await this.prisma.driverBankCard.updateMany({
      where: { id: cardId, driverId },
      data: { lastUsedAt: new Date(), updatedAt: new Date() },
    });
  }
}
