import type {
  CreateDriverWithdrawalRequest,
  DriverWithdrawalRecord,
  DriverWithdrawalsQuery,
} from './dto';

export interface DriverWithdrawalsRepository {
  listWithdrawals(
    driverId: string,
    query: DriverWithdrawalsQuery,
  ): Promise<{ items: DriverWithdrawalRecord[]; total: number }>;
  listAllWithdrawals(driverId: string): Promise<DriverWithdrawalRecord[]>;
}

type StoredDriverWithdrawalRecord = DriverWithdrawalRecord & {
  bankAccountNo: string;
};

export class InMemoryDriverWithdrawalsRepository
  implements DriverWithdrawalsRepository
{
  private readonly withdrawals: StoredDriverWithdrawalRecord[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  async listWithdrawals(driverId: string, query: DriverWithdrawalsQuery) {
    const matchedWithdrawals = this.withdrawals
      .filter(withdrawal => withdrawal.driverId === driverId)
      .sort((left, right) => right.createdAtIso.localeCompare(left.createdAtIso));
    const startIndex = (query.page - 1) * query.pageSize;

    return {
      items: matchedWithdrawals.slice(startIndex, startIndex + query.pageSize),
      total: matchedWithdrawals.length,
    };
  }

  async listAllWithdrawals(driverId: string) {
    return this.withdrawals
      .filter(withdrawal => withdrawal.driverId === driverId)
      .sort((left, right) => right.createdAtIso.localeCompare(left.createdAtIso));
  }

  async createWithdrawal(
    driverId: string,
    input: CreateDriverWithdrawalRequest,
  ) {
    const nowIso = this.now().toISOString();
    const withdrawal: StoredDriverWithdrawalRecord = {
      id: `driver-withdrawal-${this.withdrawals.length + 1}`,
      driverId,
      amountCents: input.amountCents,
      bankAccountName: input.bankAccountName,
      bankName: input.bankName,
      bankAccountNo: input.bankAccountNo,
      bankAccountMasked: maskBankAccountNo(input.bankAccountNo),
      status: 'reviewing',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    this.withdrawals.unshift(withdrawal);

    return withdrawal;
  }
}

export type PrismaDriverWithdrawalRecord = {
  id: string;
  driverId: string;
  amountCents: number;
  bankAccountName: string;
  bankName: string;
  bankAccountMasked: string;
  status: DriverWithdrawalRecord['status'];
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PrismaDriverWithdrawalsClient = {
  driverWithdrawal: {
    findMany(args: {
      where: { driverId: string };
      orderBy?: { createdAt: 'asc' | 'desc' };
      skip?: number;
      take?: number;
    }): Promise<PrismaDriverWithdrawalRecord[]>;
    count(args: { where: { driverId: string } }): Promise<number>;
  };
};

export class PrismaDriverWithdrawalsRepository
  implements DriverWithdrawalsRepository
{
  constructor(private readonly prisma: PrismaDriverWithdrawalsClient) {}

  async listWithdrawals(driverId: string, query: DriverWithdrawalsQuery) {
    const [items, total] = await Promise.all([
      this.prisma.driverWithdrawal.findMany({
        where: { driverId },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.driverWithdrawal.count({
        where: { driverId },
      }),
    ]);

    return {
      items: items.map(mapPrismaDriverWithdrawal),
      total,
    };
  }

  async listAllWithdrawals(driverId: string) {
    const items = await this.prisma.driverWithdrawal.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
    });

    return items.map(mapPrismaDriverWithdrawal);
  }

}

function mapPrismaDriverWithdrawal(
  record: PrismaDriverWithdrawalRecord,
): DriverWithdrawalRecord {
  return {
    id: record.id,
    driverId: record.driverId,
    amountCents: record.amountCents,
    bankAccountName: record.bankAccountName,
    bankName: record.bankName,
    bankAccountMasked: record.bankAccountMasked,
    status: record.status,
    rejectionReason: record.rejectionReason ?? undefined,
    createdAtIso: record.createdAt.toISOString(),
    updatedAtIso: record.updatedAt.toISOString(),
  };
}

function maskBankAccountNo(bankAccountNo: string) {
  const normalizedAccountNo = bankAccountNo.replace(/\s+/g, '');
  const suffix = normalizedAccountNo.slice(-4);

  return `**** **** **** ${suffix}`;
}
