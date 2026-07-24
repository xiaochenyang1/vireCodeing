import { ApiErrorCode, BusinessError } from '../common/errors';
import type {
  ListShipperVerificationQuery,
  ReviewShipperVerificationRequest,
  SaveShipperEnterpriseVerificationRequest,
  SaveShipperIdentityVerificationRequest,
  ShipperEnterpriseVerificationRecord,
  ShipperIdentityVerificationRecord,
  ShipperVerificationListResult,
  ShipperVerificationSnapshot,
} from './dto';

export interface ProfileVerificationRepository {
  findIdentityByShipperId(
    shipperId: string,
  ): Promise<ShipperIdentityVerificationRecord | undefined>;
  saveIdentity(
    shipperId: string,
    input: SaveShipperIdentityVerificationRequest,
  ): Promise<ShipperIdentityVerificationRecord>;
  findEnterpriseByShipperId(
    shipperId: string,
  ): Promise<ShipperEnterpriseVerificationRecord | undefined>;
  saveEnterprise(
    shipperId: string,
    input: SaveShipperEnterpriseVerificationRequest,
  ): Promise<ShipperEnterpriseVerificationRecord>;
  listVerifications(
    query: ListShipperVerificationQuery,
  ): Promise<ShipperVerificationListResult>;
  reviewIdentity(
    shipperId: string,
    input: ReviewShipperVerificationRequest,
  ): Promise<ShipperIdentityVerificationRecord>;
  reviewEnterprise(
    shipperId: string,
    input: ReviewShipperVerificationRequest,
  ): Promise<ShipperEnterpriseVerificationRecord>;
}

export class InMemoryProfileVerificationRepository
  implements ProfileVerificationRepository
{
  private readonly identities = new Map<
    string,
    ShipperIdentityVerificationRecord
  >();
  private readonly enterprises = new Map<
    string,
    ShipperEnterpriseVerificationRecord
  >();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async findIdentityByShipperId(shipperId: string) {
    return this.identities.get(shipperId);
  }

  async saveIdentity(
    shipperId: string,
    input: SaveShipperIdentityVerificationRequest,
  ): Promise<ShipperIdentityVerificationRecord> {
    const nowIso = this.now().toISOString();
    const previousIdentity = this.identities.get(shipperId);
    const record: ShipperIdentityVerificationRecord = {
      shipperId,
      ...input,
      status: 'reviewing',
      createdAtIso: previousIdentity?.createdAtIso ?? nowIso,
      updatedAtIso: nowIso,
    };

    this.identities.set(shipperId, record);

    return record;
  }

  async findEnterpriseByShipperId(shipperId: string) {
    return this.enterprises.get(shipperId);
  }

  async saveEnterprise(
    shipperId: string,
    input: SaveShipperEnterpriseVerificationRequest,
  ): Promise<ShipperEnterpriseVerificationRecord> {
    const nowIso = this.now().toISOString();
    const previousEnterprise = this.enterprises.get(shipperId);
    const record: ShipperEnterpriseVerificationRecord = {
      shipperId,
      ...input,
      status: 'reviewing',
      createdAtIso: previousEnterprise?.createdAtIso ?? nowIso,
      updatedAtIso: nowIso,
    };

    this.enterprises.set(shipperId, record);

    return record;
  }

  async listVerifications(
    query: ListShipperVerificationQuery,
  ): Promise<ShipperVerificationListResult> {
    const shipperIds = new Set<string>();

    if (!query.type || query.type === 'identity') {
      for (const [shipperId, identity] of this.identities.entries()) {
        if (identity.status === query.status) {
          shipperIds.add(shipperId);
        }
      }
    }

    if (!query.type || query.type === 'enterprise') {
      for (const [shipperId, enterprise] of this.enterprises.entries()) {
        if (enterprise.status === query.status) {
          shipperIds.add(shipperId);
        }
      }
    }

    const orderedShipperIds = [...shipperIds].sort();
    const start = (query.page - 1) * query.pageSize;
    const pageShipperIds = orderedShipperIds.slice(
      start,
      start + query.pageSize,
    );

    return {
      items: pageShipperIds.map(shipperId =>
        createShipperVerificationSnapshot(
          shipperId,
          this.identities.get(shipperId),
          this.enterprises.get(shipperId),
        ),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total: orderedShipperIds.length,
    };
  }

  async reviewIdentity(
    shipperId: string,
    input: ReviewShipperVerificationRequest,
  ): Promise<ShipperIdentityVerificationRecord> {
    const identity = this.identities.get(shipperId);
    if (!identity) {
      throw new BusinessError(
        ApiErrorCode.SHIPPER_VERIFICATION_NOT_FOUND,
        '货主实名认证记录不存在',
      );
    }
    if (identity.status !== 'reviewing') {
      throw new BusinessError(
        ApiErrorCode.SHIPPER_VERIFICATION_STATE_INVALID,
        '当前实名认证状态不可审核',
      );
    }

    const record: ShipperIdentityVerificationRecord = {
      ...identity,
      status: input.status,
      ...(input.status === 'rejected'
        ? { rejectionReason: input.rejectionReason }
        : { rejectionReason: undefined }),
      updatedAtIso: this.now().toISOString(),
    };
    this.identities.set(shipperId, record);
    return record;
  }

  async reviewEnterprise(
    shipperId: string,
    input: ReviewShipperVerificationRequest,
  ): Promise<ShipperEnterpriseVerificationRecord> {
    const enterprise = this.enterprises.get(shipperId);
    if (!enterprise) {
      throw new BusinessError(
        ApiErrorCode.SHIPPER_VERIFICATION_NOT_FOUND,
        '货主企业认证记录不存在',
      );
    }
    if (enterprise.status !== 'reviewing') {
      throw new BusinessError(
        ApiErrorCode.SHIPPER_VERIFICATION_STATE_INVALID,
        '当前企业认证状态不可审核',
      );
    }

    const record: ShipperEnterpriseVerificationRecord = {
      ...enterprise,
      status: input.status,
      ...(input.status === 'rejected'
        ? { rejectionReason: input.rejectionReason }
        : { rejectionReason: undefined }),
      updatedAtIso: this.now().toISOString(),
    };
    this.enterprises.set(shipperId, record);
    return record;
  }
}

export type PrismaShipperIdentityVerificationRecord = {
  shipperId: string;
  realName: string;
  idNumber: string;
  identityFrontFileId: string;
  identityBackFileId: string;
  faceVerified: boolean;
  status: ShipperIdentityVerificationRecord['status'];
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PrismaShipperEnterpriseVerificationRecord = {
  shipperId: string;
  enterpriseName: string;
  creditCode: string;
  legalName: string;
  legalId: string;
  enterprisePhone: string;
  licenseFileId: string;
  status: ShipperEnterpriseVerificationRecord['status'];
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PrismaProfileVerificationClient = {
  shipperIdentityVerification: {
    findUnique(args: {
      where: { shipperId: string };
    }): Promise<PrismaShipperIdentityVerificationRecord | null>;
    findMany(args: {
      where?: { status?: string };
      orderBy?: { updatedAt: 'asc' | 'desc' };
    }): Promise<PrismaShipperIdentityVerificationRecord[]>;
    upsert(args: {
      where: { shipperId: string };
      create: {
        shipperId: string;
        realName: string;
        idNumber: string;
        identityFrontFileId: string;
        identityBackFileId: string;
        faceVerified: true;
        status: 'reviewing';
        rejectionReason: null;
      };
      update: {
        realName: string;
        idNumber: string;
        identityFrontFileId: string;
        identityBackFileId: string;
        faceVerified: true;
        status: 'reviewing';
        rejectionReason: null;
      };
    }): Promise<PrismaShipperIdentityVerificationRecord>;
    update(args: {
      where: { shipperId: string };
      data: {
        status: 'approved' | 'rejected';
        rejectionReason: string | null;
      };
    }): Promise<PrismaShipperIdentityVerificationRecord>;
  };
  shipperEnterpriseVerification: {
    findUnique(args: {
      where: { shipperId: string };
    }): Promise<PrismaShipperEnterpriseVerificationRecord | null>;
    findMany(args: {
      where?: { status?: string };
      orderBy?: { updatedAt: 'asc' | 'desc' };
    }): Promise<PrismaShipperEnterpriseVerificationRecord[]>;
    upsert(args: {
      where: { shipperId: string };
      create: {
        shipperId: string;
        enterpriseName: string;
        creditCode: string;
        legalName: string;
        legalId: string;
        enterprisePhone: string;
        licenseFileId: string;
        status: 'reviewing';
        rejectionReason: null;
      };
      update: {
        enterpriseName: string;
        creditCode: string;
        legalName: string;
        legalId: string;
        enterprisePhone: string;
        licenseFileId: string;
        status: 'reviewing';
        rejectionReason: null;
      };
    }): Promise<PrismaShipperEnterpriseVerificationRecord>;
    update(args: {
      where: { shipperId: string };
      data: {
        status: 'approved' | 'rejected';
        rejectionReason: string | null;
      };
    }): Promise<PrismaShipperEnterpriseVerificationRecord>;
  };
};

export class PrismaProfileVerificationRepository
  implements ProfileVerificationRepository
{
  constructor(private readonly prisma: PrismaProfileVerificationClient) {}

  async findIdentityByShipperId(shipperId: string) {
    const identity = await this.prisma.shipperIdentityVerification.findUnique({
      where: { shipperId },
    });

    return identity ? mapPrismaIdentityVerification(identity) : undefined;
  }

  async saveIdentity(
    shipperId: string,
    input: SaveShipperIdentityVerificationRequest,
  ): Promise<ShipperIdentityVerificationRecord> {
    const identity = await this.prisma.shipperIdentityVerification.upsert({
      where: { shipperId },
      create: {
        shipperId,
        realName: input.realName,
        idNumber: input.idNumber,
        identityFrontFileId: input.identityFrontFileId,
        identityBackFileId: input.identityBackFileId,
        faceVerified: input.faceVerified,
        status: 'reviewing',
        rejectionReason: null,
      },
      update: {
        realName: input.realName,
        idNumber: input.idNumber,
        identityFrontFileId: input.identityFrontFileId,
        identityBackFileId: input.identityBackFileId,
        faceVerified: input.faceVerified,
        status: 'reviewing',
        rejectionReason: null,
      },
    });

    return mapPrismaIdentityVerification(identity);
  }

  async findEnterpriseByShipperId(shipperId: string) {
    const enterprise =
      await this.prisma.shipperEnterpriseVerification.findUnique({
        where: { shipperId },
      });

    return enterprise ? mapPrismaEnterpriseVerification(enterprise) : undefined;
  }

  async saveEnterprise(
    shipperId: string,
    input: SaveShipperEnterpriseVerificationRequest,
  ): Promise<ShipperEnterpriseVerificationRecord> {
    const enterprise =
      await this.prisma.shipperEnterpriseVerification.upsert({
        where: { shipperId },
        create: {
          shipperId,
          enterpriseName: input.enterpriseName,
          creditCode: input.creditCode,
          legalName: input.legalName,
          legalId: input.legalId,
          enterprisePhone: input.enterprisePhone,
          licenseFileId: input.licenseFileId,
          status: 'reviewing',
          rejectionReason: null,
        },
        update: {
          enterpriseName: input.enterpriseName,
          creditCode: input.creditCode,
          legalName: input.legalName,
          legalId: input.legalId,
          enterprisePhone: input.enterprisePhone,
          licenseFileId: input.licenseFileId,
          status: 'reviewing',
          rejectionReason: null,
        },
      });

    return mapPrismaEnterpriseVerification(enterprise);
  }

  async listVerifications(
    query: ListShipperVerificationQuery,
  ): Promise<ShipperVerificationListResult> {
    const [identities, enterprises] = await Promise.all([
      !query.type || query.type === 'identity'
        ? this.prisma.shipperIdentityVerification.findMany({
            where: { status: query.status },
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve([]),
      !query.type || query.type === 'enterprise'
        ? this.prisma.shipperEnterpriseVerification.findMany({
            where: { status: query.status },
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    const shipperIds = new Set<string>();
    const identityByShipperId = new Map(
      identities.map(record => [record.shipperId, record] as const),
    );
    const enterpriseByShipperId = new Map(
      enterprises.map(record => [record.shipperId, record] as const),
    );

    for (const identity of identities) {
      shipperIds.add(identity.shipperId);
    }
    for (const enterprise of enterprises) {
      shipperIds.add(enterprise.shipperId);
    }

    const orderedShipperIds = [...shipperIds].sort();
    const start = (query.page - 1) * query.pageSize;
    const pageShipperIds = orderedShipperIds.slice(
      start,
      start + query.pageSize,
    );

    return {
      items: pageShipperIds.map(shipperId =>
        createShipperVerificationSnapshot(
          shipperId,
          identityByShipperId.has(shipperId)
            ? mapPrismaIdentityVerification(
                identityByShipperId.get(shipperId)!,
              )
            : undefined,
          enterpriseByShipperId.has(shipperId)
            ? mapPrismaEnterpriseVerification(
                enterpriseByShipperId.get(shipperId)!,
              )
            : undefined,
        ),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total: orderedShipperIds.length,
    };
  }

  async reviewIdentity(
    shipperId: string,
    input: ReviewShipperVerificationRequest,
  ): Promise<ShipperIdentityVerificationRecord> {
    const identity = await this.prisma.shipperIdentityVerification.findUnique({
      where: { shipperId },
    });
    if (!identity) {
      throw new BusinessError(
        ApiErrorCode.SHIPPER_VERIFICATION_NOT_FOUND,
        '货主实名认证记录不存在',
      );
    }
    if (identity.status !== 'reviewing') {
      throw new BusinessError(
        ApiErrorCode.SHIPPER_VERIFICATION_STATE_INVALID,
        '当前实名认证状态不可审核',
      );
    }

    const updated = await this.prisma.shipperIdentityVerification.update({
      where: { shipperId },
      data: {
        status: input.status,
        rejectionReason:
          input.status === 'rejected' ? input.rejectionReason : null,
      },
    });
    return mapPrismaIdentityVerification(updated);
  }

  async reviewEnterprise(
    shipperId: string,
    input: ReviewShipperVerificationRequest,
  ): Promise<ShipperEnterpriseVerificationRecord> {
    const enterprise =
      await this.prisma.shipperEnterpriseVerification.findUnique({
        where: { shipperId },
      });
    if (!enterprise) {
      throw new BusinessError(
        ApiErrorCode.SHIPPER_VERIFICATION_NOT_FOUND,
        '货主企业认证记录不存在',
      );
    }
    if (enterprise.status !== 'reviewing') {
      throw new BusinessError(
        ApiErrorCode.SHIPPER_VERIFICATION_STATE_INVALID,
        '当前企业认证状态不可审核',
      );
    }

    const updated = await this.prisma.shipperEnterpriseVerification.update({
      where: { shipperId },
      data: {
        status: input.status,
        rejectionReason:
          input.status === 'rejected' ? input.rejectionReason : null,
      },
    });
    return mapPrismaEnterpriseVerification(updated);
  }
}

function createShipperVerificationSnapshot(
  shipperId: string,
  identity?: ShipperIdentityVerificationRecord,
  enterprise?: ShipperEnterpriseVerificationRecord,
): ShipperVerificationSnapshot {
  return {
    shipperId,
    ...(identity ? { identity } : {}),
    ...(enterprise ? { enterprise } : {}),
  };
}

function mapPrismaIdentityVerification(
  record: PrismaShipperIdentityVerificationRecord,
): ShipperIdentityVerificationRecord {
  return {
    shipperId: record.shipperId,
    realName: record.realName,
    idNumber: record.idNumber,
    identityFrontFileId: record.identityFrontFileId,
    identityBackFileId: record.identityBackFileId,
    faceVerified: record.faceVerified as true,
    status: record.status,
    ...(record.rejectionReason
      ? { rejectionReason: record.rejectionReason }
      : {}),
    createdAtIso: record.createdAt.toISOString(),
    updatedAtIso: record.updatedAt.toISOString(),
  };
}

function mapPrismaEnterpriseVerification(
  record: PrismaShipperEnterpriseVerificationRecord,
): ShipperEnterpriseVerificationRecord {
  return {
    shipperId: record.shipperId,
    enterpriseName: record.enterpriseName,
    creditCode: record.creditCode,
    legalName: record.legalName,
    legalId: record.legalId,
    enterprisePhone: record.enterprisePhone,
    licenseFileId: record.licenseFileId,
    status: record.status,
    ...(record.rejectionReason
      ? { rejectionReason: record.rejectionReason }
      : {}),
    createdAtIso: record.createdAt.toISOString(),
    updatedAtIso: record.updatedAt.toISOString(),
  };
}
