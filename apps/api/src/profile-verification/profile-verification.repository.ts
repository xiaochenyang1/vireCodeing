import type {
  SaveShipperEnterpriseVerificationRequest,
  SaveShipperIdentityVerificationRequest,
  ShipperEnterpriseVerificationRecord,
  ShipperIdentityVerificationRecord,
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
  };
  shipperEnterpriseVerification: {
    findUnique(args: {
      where: { shipperId: string };
    }): Promise<PrismaShipperEnterpriseVerificationRecord | null>;
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
