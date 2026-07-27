import { ApiErrorCode, BusinessError } from '../common/errors';
import type {
  AdminShipperVerificationReviewEvent,
  ListShipperVerificationQuery,
  ReviewShipperVerificationRequest,
  SaveShipperEnterpriseVerificationRequest,
  SaveShipperIdentityVerificationRequest,
  ShipperEnterpriseVerificationRecord,
  ShipperIdentityVerificationRecord,
  ShipperVerificationListResult,
  ShipperVerificationReviewDecisionRecord,
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
  listReviewEvents(
    shipperId: string,
  ): Promise<AdminShipperVerificationReviewEvent[]>;
  reviewIdentity(
    shipperId: string,
    reviewerAdminId: string,
    input: ReviewShipperVerificationRequest,
  ): Promise<ShipperIdentityVerificationRecord>;
  reviewEnterprise(
    shipperId: string,
    reviewerAdminId: string,
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
  private readonly reviewEvents: ShipperVerificationReviewDecisionRecord[] = [];

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

  async listReviewEvents(
    shipperId: string,
  ): Promise<AdminShipperVerificationReviewEvent[]> {
    const identity = this.identities.get(shipperId);
    const enterprise = this.enterprises.get(shipperId);

    if (!identity && !enterprise) {
      throw new BusinessError(
        ApiErrorCode.SHIPPER_VERIFICATION_NOT_FOUND,
        '货主认证记录不存在',
      );
    }

    return listAdminShipperVerificationReviewEvents(
      shipperId,
      identity,
      enterprise,
      this.reviewEvents.filter(event => event.shipperId === shipperId),
    );
  }

  async reviewIdentity(
    shipperId: string,
    reviewerAdminId: string,
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

    const reviewedAtIso = this.now().toISOString();
    const record: ShipperIdentityVerificationRecord = {
      ...identity,
      status: input.status,
      ...(input.status === 'rejected'
        ? { rejectionReason: input.rejectionReason }
        : { rejectionReason: undefined }),
      updatedAtIso: reviewedAtIso,
    };
    this.identities.set(shipperId, record);
    this.recordReviewEvent(
      shipperId,
      reviewerAdminId,
      'identity',
      identity.status,
      input,
      reviewedAtIso,
    );
    return record;
  }

  async reviewEnterprise(
    shipperId: string,
    reviewerAdminId: string,
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

    const reviewedAtIso = this.now().toISOString();
    const record: ShipperEnterpriseVerificationRecord = {
      ...enterprise,
      status: input.status,
      ...(input.status === 'rejected'
        ? { rejectionReason: input.rejectionReason }
        : { rejectionReason: undefined }),
      updatedAtIso: reviewedAtIso,
    };
    this.enterprises.set(shipperId, record);
    this.recordReviewEvent(
      shipperId,
      reviewerAdminId,
      'enterprise',
      enterprise.status,
      input,
      reviewedAtIso,
    );
    return record;
  }

  private recordReviewEvent(
    shipperId: string,
    reviewerAdminId: string,
    verificationType: ShipperVerificationReviewDecisionRecord['verificationType'],
    fromStatus: ShipperVerificationReviewDecisionRecord['fromStatus'],
    input: ReviewShipperVerificationRequest,
    createdAtIso: string,
  ) {
    this.reviewEvents.push({
      id: `shipper-verification-review-event-${this.reviewEvents.length + 1}`,
      shipperId,
      reviewerAdminId,
      verificationType,
      fromStatus,
      toStatus: input.status,
      ...(input.status === 'rejected'
        ? { rejectionReason: input.rejectionReason }
        : {}),
      createdAtIso,
    });
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

export type PrismaShipperVerificationReviewEventRecord = {
  id: string;
  shipperId: string;
  reviewerAdminId: string;
  verificationType: ShipperVerificationReviewDecisionRecord['verificationType'];
  fromStatus: ShipperVerificationReviewDecisionRecord['fromStatus'];
  toStatus: ShipperVerificationReviewDecisionRecord['toStatus'];
  rejectionReason: string | null;
  createdAt: Date;
};

export type PrismaProfileVerificationClient = {
  $transaction<T>(
    callback: (prisma: PrismaProfileVerificationClient) => Promise<T>,
    options?: { isolationLevel: 'RepeatableRead' },
  ): Promise<T>;
  shipperIdentityVerification: {
    findUnique(args: {
      where: { shipperId: string };
    }): Promise<PrismaShipperIdentityVerificationRecord | null>;
    findMany(args: {
      where?: { status?: string; shipperId?: { in: string[] } };
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
    updateManyAndReturn(args: {
      where: { shipperId: string; status: 'reviewing'; updatedAt: Date };
      data: {
        status: 'approved' | 'rejected';
        rejectionReason: string | null;
      };
    }): Promise<PrismaShipperIdentityVerificationRecord[]>;
  };
  shipperEnterpriseVerification: {
    findUnique(args: {
      where: { shipperId: string };
    }): Promise<PrismaShipperEnterpriseVerificationRecord | null>;
    findMany(args: {
      where?: { status?: string; shipperId?: { in: string[] } };
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
    updateManyAndReturn(args: {
      where: { shipperId: string; status: 'reviewing'; updatedAt: Date };
      data: {
        status: 'approved' | 'rejected';
        rejectionReason: string | null;
      };
    }): Promise<PrismaShipperEnterpriseVerificationRecord[]>;
  };
  shipperVerificationReviewEvent: {
    findMany(args: {
      where: { shipperId: string };
      orderBy: { createdAt: 'desc' };
    }): Promise<PrismaShipperVerificationReviewEventRecord[]>;
    create(args: {
      data: {
        shipperId: string;
        reviewerAdminId: string;
        verificationType: ShipperVerificationReviewDecisionRecord['verificationType'];
        fromStatus: ShipperVerificationReviewDecisionRecord['fromStatus'];
        toStatus: ShipperVerificationReviewDecisionRecord['toStatus'];
        rejectionReason: string | null;
        createdAt: Date;
      };
    }): Promise<PrismaShipperVerificationReviewEventRecord>;
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
    const [pageIdentities, pageEnterprises] = await Promise.all([
      this.prisma.shipperIdentityVerification.findMany({
        where: { shipperId: { in: pageShipperIds } },
      }),
      this.prisma.shipperEnterpriseVerification.findMany({
        where: { shipperId: { in: pageShipperIds } },
      }),
    ]);
    const identityByShipperId = new Map(
      pageIdentities.map(record => [record.shipperId, record] as const),
    );
    const enterpriseByShipperId = new Map(
      pageEnterprises.map(record => [record.shipperId, record] as const),
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

  async listReviewEvents(
    shipperId: string,
  ): Promise<AdminShipperVerificationReviewEvent[]> {
    const [identity, enterprise, reviewEvents] = await this.prisma.$transaction(
      async prisma => {
        const [currentIdentity, currentEnterprise] = await Promise.all([
          prisma.shipperIdentityVerification.findUnique({
            where: { shipperId },
          }),
          prisma.shipperEnterpriseVerification.findUnique({
            where: { shipperId },
          }),
        ]);
        const persistedReviewEvents =
          await prisma.shipperVerificationReviewEvent.findMany({
            where: { shipperId },
            orderBy: { createdAt: 'desc' },
          });

        return [
          currentIdentity,
          currentEnterprise,
          persistedReviewEvents,
        ] as const;
      },
      { isolationLevel: 'RepeatableRead' },
    );

    if (!identity && !enterprise && reviewEvents.length === 0) {
      throw new BusinessError(
        ApiErrorCode.SHIPPER_VERIFICATION_NOT_FOUND,
        '货主认证记录不存在',
      );
    }

    return listAdminShipperVerificationReviewEvents(
      shipperId,
      identity ? mapPrismaIdentityVerification(identity) : undefined,
      enterprise ? mapPrismaEnterpriseVerification(enterprise) : undefined,
      reviewEvents.map(mapPrismaReviewDecision),
    );
  }

  async reviewIdentity(
    shipperId: string,
    reviewerAdminId: string,
    input: ReviewShipperVerificationRequest,
  ): Promise<ShipperIdentityVerificationRecord> {
    return this.prisma.$transaction(async prisma => {
      const identity = await prisma.shipperIdentityVerification.findUnique({
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

      const [updated] =
        await prisma.shipperIdentityVerification.updateManyAndReturn({
          where: {
            shipperId,
            status: 'reviewing',
            updatedAt: identity.updatedAt,
          },
          data: {
            status: input.status,
            rejectionReason:
              input.status === 'rejected' ? input.rejectionReason : null,
          },
        });
      if (!updated) {
        throw new BusinessError(
          ApiErrorCode.SHIPPER_VERIFICATION_STATE_INVALID,
          '当前实名认证状态不可审核',
        );
      }
      await prisma.shipperVerificationReviewEvent.create({
        data: {
          shipperId,
          reviewerAdminId,
          verificationType: 'identity',
          fromStatus: identity.status,
          toStatus: input.status,
          rejectionReason:
            input.status === 'rejected' ? input.rejectionReason : null,
          createdAt: updated.updatedAt,
        },
      });

      return mapPrismaIdentityVerification(updated);
    });
  }

  async reviewEnterprise(
    shipperId: string,
    reviewerAdminId: string,
    input: ReviewShipperVerificationRequest,
  ): Promise<ShipperEnterpriseVerificationRecord> {
    return this.prisma.$transaction(async prisma => {
      const enterprise =
        await prisma.shipperEnterpriseVerification.findUnique({
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

      const [updated] =
        await prisma.shipperEnterpriseVerification.updateManyAndReturn({
          where: {
            shipperId,
            status: 'reviewing',
            updatedAt: enterprise.updatedAt,
          },
          data: {
            status: input.status,
            rejectionReason:
              input.status === 'rejected' ? input.rejectionReason : null,
          },
        });
      if (!updated) {
        throw new BusinessError(
          ApiErrorCode.SHIPPER_VERIFICATION_STATE_INVALID,
          '当前企业认证状态不可审核',
        );
      }
      await prisma.shipperVerificationReviewEvent.create({
        data: {
          shipperId,
          reviewerAdminId,
          verificationType: 'enterprise',
          fromStatus: enterprise.status,
          toStatus: input.status,
          rejectionReason:
            input.status === 'rejected' ? input.rejectionReason : null,
          createdAt: updated.updatedAt,
        },
      });

      return mapPrismaEnterpriseVerification(updated);
    });
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

function listAdminShipperVerificationReviewEvents(
  shipperId: string,
  identity?: ShipperIdentityVerificationRecord,
  enterprise?: ShipperEnterpriseVerificationRecord,
  reviewDecisions: ShipperVerificationReviewDecisionRecord[] = [],
): AdminShipperVerificationReviewEvent[] {
  const events: AdminShipperVerificationReviewEvent[] = [];

  if (identity) {
    events.push({
      eventId: `${shipperId}:identity:submitted`,
      verificationType: 'identity',
      actorUserId: shipperId,
      eventType: 'shipper_identity_verification_submitted',
      stage: 'submitted',
      noteText: `提交实名认证：${identity.realName} · ${identity.idNumber}`,
      createdAtIso: identity.createdAtIso,
    });

    if (
      (identity.status === 'approved' || identity.status === 'rejected') &&
      !reviewDecisions.some(event => event.verificationType === 'identity')
    ) {
      events.push({
        eventId: `${shipperId}:identity:${identity.status}`,
        verificationType: 'identity',
        eventType:
          identity.status === 'approved'
            ? 'shipper_identity_verification_approved'
            : 'shipper_identity_verification_rejected',
        stage: identity.status,
        noteText:
          identity.status === 'approved'
            ? '实名认证已通过'
            : identity.rejectionReason || '实名认证已驳回',
        createdAtIso: identity.updatedAtIso,
      });
    }
  }

  if (enterprise) {
    events.push({
      eventId: `${shipperId}:enterprise:submitted`,
      verificationType: 'enterprise',
      actorUserId: shipperId,
      eventType: 'shipper_enterprise_verification_submitted',
      stage: 'submitted',
      noteText: `提交企业认证：${enterprise.enterpriseName} · ${enterprise.creditCode}`,
      createdAtIso: enterprise.createdAtIso,
    });

    if (
      (enterprise.status === 'approved' || enterprise.status === 'rejected') &&
      !reviewDecisions.some(event => event.verificationType === 'enterprise')
    ) {
      events.push({
        eventId: `${shipperId}:enterprise:${enterprise.status}`,
        verificationType: 'enterprise',
        eventType:
          enterprise.status === 'approved'
            ? 'shipper_enterprise_verification_approved'
            : 'shipper_enterprise_verification_rejected',
        stage: enterprise.status,
        noteText:
          enterprise.status === 'approved'
            ? '企业认证已通过'
            : enterprise.rejectionReason || '企业认证已驳回',
        createdAtIso: enterprise.updatedAtIso,
      });
    }
  }

  events.push(...reviewDecisions.map(mapReviewDecisionToAdminEvent));

  return events.sort((left, right) =>
    right.createdAtIso.localeCompare(left.createdAtIso),
  );
}

function mapReviewDecisionToAdminEvent(
  event: ShipperVerificationReviewDecisionRecord,
): AdminShipperVerificationReviewEvent {
  const isIdentity = event.verificationType === 'identity';
  const approved = event.toStatus === 'approved';

  return {
    eventId: event.id,
    verificationType: event.verificationType,
    actorUserId: event.reviewerAdminId,
    reviewerAdminId: event.reviewerAdminId,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    eventType: isIdentity
      ? approved
        ? 'shipper_identity_verification_approved'
        : 'shipper_identity_verification_rejected'
      : approved
        ? 'shipper_enterprise_verification_approved'
        : 'shipper_enterprise_verification_rejected',
    stage: event.toStatus,
    noteText: approved
      ? isIdentity
        ? '实名认证已通过'
        : '企业认证已通过'
      : event.rejectionReason || (isIdentity ? '实名认证已驳回' : '企业认证已驳回'),
    createdAtIso: event.createdAtIso,
  };
}

function mapPrismaReviewDecision(
  event: PrismaShipperVerificationReviewEventRecord,
): ShipperVerificationReviewDecisionRecord {
  return {
    id: event.id,
    shipperId: event.shipperId,
    reviewerAdminId: event.reviewerAdminId,
    verificationType: event.verificationType,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    ...(event.rejectionReason
      ? { rejectionReason: event.rejectionReason }
      : {}),
    createdAtIso: event.createdAt.toISOString(),
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
