import { createHash } from 'crypto';
import type { VerificationPurpose } from './dto';

export type VerificationCodeRecord = {
  id?: string;
  phone: string;
  purpose: VerificationPurpose;
  codeHash: string;
  expiresAt: Date;
  createdAt?: Date;
  consumedAt?: Date;
};

export type VerificationCodeToSave = {
  phone: string;
  purpose: VerificationPurpose;
  code: string;
  expiresAt: Date;
  createdAt?: Date;
};

export interface VerificationCodeStore {
  saveCode(record: VerificationCodeToSave): Promise<void>;
  findActiveCode(
    phone: string,
    purpose: VerificationPurpose,
  ): Promise<VerificationCodeRecord | undefined>;
  findLatestUnconsumedCode(
    phone: string,
    purpose: VerificationPurpose,
  ): Promise<VerificationCodeRecord | undefined>;
  consumeCode(record: VerificationCodeRecord): Promise<void>;
  findCodesCreatedSince(
    phone: string,
    purpose: VerificationPurpose,
    since: Date,
  ): Promise<VerificationCodeRecord[]>;
}

type PrismaVerificationCode = {
  id: string;
  phone: string;
  purpose: VerificationPurpose;
  codeHash: string;
  expiresAt: Date;
  consumedAt?: Date | null;
  createdAt: Date;
};

export type PrismaVerificationCodeClient = {
  verificationCode: {
    create(args: {
      data: {
        phone: string;
        purpose: VerificationPurpose;
        codeHash: string;
        expiresAt: Date;
        createdAt?: Date;
      };
    }): Promise<unknown>;
    findFirst(args: {
      where: {
        phone: string;
        purpose: VerificationPurpose;
        consumedAt: null;
        expiresAt?: { gt: Date };
      };
      orderBy: { createdAt: 'desc' };
    }): Promise<PrismaVerificationCode | null>;
    findMany(args: {
      where: {
        phone: string;
        purpose: VerificationPurpose;
        createdAt: { gte: Date };
      };
      orderBy: { createdAt: 'asc' };
    }): Promise<PrismaVerificationCode[]>;
    update(args: {
      where: { id: string };
      data: { consumedAt: Date };
    }): Promise<unknown>;
  };
};

export class InMemoryVerificationCodeStore implements VerificationCodeStore {
  private readonly records: VerificationCodeRecord[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  async saveCode(record: VerificationCodeToSave): Promise<void> {
    this.records.push({
      phone: record.phone,
      purpose: record.purpose,
      codeHash: hashVerificationCode(record),
      expiresAt: record.expiresAt,
      createdAt: record.createdAt ?? this.now(),
    });
  }

  async findActiveCode(
    phone: string,
    purpose: VerificationPurpose,
  ): Promise<VerificationCodeRecord | undefined> {
    const now = this.now();

    return [...this.records]
      .reverse()
      .find(
        record =>
          record.phone === phone &&
          record.purpose === purpose &&
          !record.consumedAt &&
          record.expiresAt.getTime() > now.getTime(),
      );
  }

  async findLatestUnconsumedCode(
    phone: string,
    purpose: VerificationPurpose,
  ): Promise<VerificationCodeRecord | undefined> {
    return [...this.records]
      .reverse()
      .find(
        record =>
          record.phone === phone &&
          record.purpose === purpose &&
          !record.consumedAt,
      );
  }

  async consumeCode(record: VerificationCodeRecord): Promise<void> {
    record.consumedAt = this.now();
  }

  async findCodesCreatedSince(
    phone: string,
    purpose: VerificationPurpose,
    since: Date,
  ): Promise<VerificationCodeRecord[]> {
    return this.records.filter(
      record =>
        record.phone === phone &&
        record.purpose === purpose &&
        (record.createdAt ?? record.expiresAt).getTime() >= since.getTime(),
    );
  }
}

export class PrismaVerificationCodeStore implements VerificationCodeStore {
  constructor(
    private readonly prisma: PrismaVerificationCodeClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async saveCode(record: VerificationCodeToSave): Promise<void> {
    await this.prisma.verificationCode.create({
      data: {
        phone: record.phone,
        purpose: record.purpose,
        codeHash: hashVerificationCode(record),
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
      },
    });
  }

  async findActiveCode(
    phone: string,
    purpose: VerificationPurpose,
  ): Promise<VerificationCodeRecord | undefined> {
    const code = await this.prisma.verificationCode.findFirst({
      where: {
        phone,
        purpose,
        consumedAt: null,
        expiresAt: {
          gt: this.now(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return code ? mapPrismaVerificationCode(code) : undefined;
  }

  async findLatestUnconsumedCode(
    phone: string,
    purpose: VerificationPurpose,
  ): Promise<VerificationCodeRecord | undefined> {
    const code = await this.prisma.verificationCode.findFirst({
      where: {
        phone,
        purpose,
        consumedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return code ? mapPrismaVerificationCode(code) : undefined;
  }

  async consumeCode(record: VerificationCodeRecord): Promise<void> {
    if (!record.id) {
      throw new Error('Verification code id is required for Prisma updates');
    }

    await this.prisma.verificationCode.update({
      where: {
        id: record.id,
      },
      data: {
        consumedAt: this.now(),
      },
    });
  }

  async findCodesCreatedSince(
    phone: string,
    purpose: VerificationPurpose,
    since: Date,
  ): Promise<VerificationCodeRecord[]> {
    const codes = await this.prisma.verificationCode.findMany({
      where: {
        phone,
        purpose,
        createdAt: {
          gte: since,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return codes.map(mapPrismaVerificationCode);
  }
}

export function verificationCodeMatches(
  record: VerificationCodeRecord,
  code: string,
): boolean {
  return (
    record.codeHash ===
    hashVerificationCode({
      phone: record.phone,
      purpose: record.purpose,
      code,
    })
  );
}

function mapPrismaVerificationCode(
  code: PrismaVerificationCode,
): VerificationCodeRecord {
  return {
    id: code.id,
    phone: code.phone,
    purpose: code.purpose,
    codeHash: code.codeHash,
    expiresAt: code.expiresAt,
    consumedAt: code.consumedAt ?? undefined,
    createdAt: code.createdAt,
  };
}

function hashVerificationCode(record: {
  phone: string;
  purpose: VerificationPurpose;
  code: string;
}): string {
  return createHash('sha256')
    .update(`${record.purpose}:${record.phone}:${record.code}`)
    .digest('hex');
}
