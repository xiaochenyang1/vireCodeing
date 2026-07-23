import type {
  BatchReviewDriverCertificationRequest,
  BatchReviewDriverCertificationResult,
  DriverCertificationSnapshot,
  DriverIdentityCertificationRecord,
  DriverVehicleCertificationRecord,
  DriverCertificationListResult,
  DriverCertificationReviewEventRecord,
  DriverCertificationType,
  ListDriverCertificationQuery,
  ReviewDriverCertificationRequest,
  SubmitDriverIdentityCertificationRequest,
  SubmitDriverVehicleCertificationRequest,
} from './dto';
import { ApiErrorCode, BusinessError } from '../common/errors';

export interface DriverCertificationRepository {
  getCertification(driverId: string): Promise<DriverCertificationSnapshot>;
  listCertifications(
    query: ListDriverCertificationQuery,
  ): Promise<DriverCertificationListResult>;
  listReviewEvents(
    driverId: string,
  ): Promise<DriverCertificationReviewEventRecord[]>;
  saveIdentity(
    driverId: string,
    input: SubmitDriverIdentityCertificationRequest,
    driverPhone?: string,
  ): Promise<DriverCertificationSnapshot>;
  saveVehicle(
    driverId: string,
    input: SubmitDriverVehicleCertificationRequest,
    driverPhone?: string,
  ): Promise<DriverCertificationSnapshot>;
  reviewIdentity(
    driverId: string,
    reviewerAdminId: string,
    input: ReviewDriverCertificationRequest,
  ): Promise<DriverCertificationSnapshot>;
  reviewVehicle(
    driverId: string,
    reviewerAdminId: string,
    input: ReviewDriverCertificationRequest,
  ): Promise<DriverCertificationSnapshot>;
  batchReviewCertifications(
    reviewerAdminId: string,
    input: BatchReviewDriverCertificationRequest,
  ): Promise<BatchReviewDriverCertificationResult>;
}

export class InMemoryDriverCertificationRepository
  implements DriverCertificationRepository
{
  private readonly identities = new Map<
    string,
    DriverIdentityCertificationRecord
  >();
  private readonly vehicles = new Map<string, DriverVehicleCertificationRecord>();
  private readonly reviewEvents: DriverCertificationReviewEventRecord[] = [];
  private readonly driverPhones = new Map<string, string>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async getCertification(driverId: string): Promise<DriverCertificationSnapshot> {
    return this.createSnapshot(driverId);
  }

  async listCertifications(
    query: ListDriverCertificationQuery,
  ): Promise<DriverCertificationListResult> {
    const driverIds = new Set<string>();

    for (const [driverId, identity] of this.identities.entries()) {
      if (identity.status === query.status) {
        driverIds.add(driverId);
      }
    }

    for (const [driverId, vehicle] of this.vehicles.entries()) {
      if (vehicle.status === query.status) {
        driverIds.add(driverId);
      }
    }

    const orderedDriverIds = [...driverIds].sort();
    const start = (query.page - 1) * query.pageSize;
    const pageDriverIds = orderedDriverIds.slice(start, start + query.pageSize);

    return {
      items: pageDriverIds.map(driverId => this.createSnapshot(driverId)),
      page: query.page,
      pageSize: query.pageSize,
      total: orderedDriverIds.length,
    };
  }

  async listReviewEvents(
    driverId: string,
  ): Promise<DriverCertificationReviewEventRecord[]> {
    return this.reviewEvents
      .filter(event => event.driverId === driverId)
      .sort((left, right) =>
        right.createdAtIso.localeCompare(left.createdAtIso),
      );
  }

  async saveIdentity(
    driverId: string,
    input: SubmitDriverIdentityCertificationRequest,
    driverPhone?: string,
  ): Promise<DriverCertificationSnapshot> {
    const nowIso = this.now().toISOString();
    const previousIdentity = this.identities.get(driverId);
    this.rememberDriverPhone(driverId, driverPhone);
    this.identities.set(driverId, {
      driverId,
      ...input,
      status: 'reviewing',
      createdAtIso: previousIdentity?.createdAtIso ?? nowIso,
      updatedAtIso: nowIso,
    });

    return this.createSnapshot(driverId);
  }

  async saveVehicle(
    driverId: string,
    input: SubmitDriverVehicleCertificationRequest,
    driverPhone?: string,
  ): Promise<DriverCertificationSnapshot> {
    const nowIso = this.now().toISOString();
    const previousVehicle = this.vehicles.get(driverId);
    this.rememberDriverPhone(driverId, driverPhone);
    this.vehicles.set(driverId, {
      driverId,
      ...input,
      status: 'reviewing',
      createdAtIso: previousVehicle?.createdAtIso ?? nowIso,
      updatedAtIso: nowIso,
    });

    return this.createSnapshot(driverId);
  }

  async reviewIdentity(
    driverId: string,
    reviewerAdminId: string,
    input: ReviewDriverCertificationRequest,
  ): Promise<DriverCertificationSnapshot> {
    const identity = this.identities.get(driverId);

    if (!identity) {
      throw new BusinessError(
        ApiErrorCode.DRIVER_CERTIFICATION_NOT_FOUND,
        '司机认证记录不存在',
      );
    }

    this.identities.set(driverId, {
      ...identity,
      status: input.status,
      rejectionReason: getInMemoryReviewRejectionReason(input),
      updatedAtIso: this.now().toISOString(),
    });
    this.recordReviewEvent(
      driverId,
      reviewerAdminId,
      'identity',
      identity.status,
      input,
    );

    return this.createSnapshot(driverId);
  }

  async reviewVehicle(
    driverId: string,
    reviewerAdminId: string,
    input: ReviewDriverCertificationRequest,
  ): Promise<DriverCertificationSnapshot> {
    const vehicle = this.vehicles.get(driverId);

    if (!vehicle) {
      throw new BusinessError(
        ApiErrorCode.DRIVER_CERTIFICATION_NOT_FOUND,
        '司机认证记录不存在',
      );
    }

    this.vehicles.set(driverId, {
      ...vehicle,
      status: input.status,
      rejectionReason: getInMemoryReviewRejectionReason(input),
      updatedAtIso: this.now().toISOString(),
    });
    this.recordReviewEvent(
      driverId,
      reviewerAdminId,
      'vehicle',
      vehicle.status,
      input,
    );

    return this.createSnapshot(driverId);
  }

  async batchReviewCertifications(
    reviewerAdminId: string,
    input: BatchReviewDriverCertificationRequest,
  ): Promise<BatchReviewDriverCertificationResult> {
    const reviewTargets = this.getBatchReviewTargets(input);

    for (const { driverId, record } of reviewTargets) {
      const nextRecord = {
        ...record,
        status: input.status,
        rejectionReason: getInMemoryReviewRejectionReason(input),
        updatedAtIso: this.now().toISOString(),
      };

      if (input.certificationType === 'identity') {
        this.identities.set(
          driverId,
          nextRecord as DriverIdentityCertificationRecord,
        );
      } else {
        this.vehicles.set(
          driverId,
          nextRecord as DriverVehicleCertificationRecord,
        );
      }

      this.recordReviewEvent(
        driverId,
        reviewerAdminId,
        input.certificationType,
        record.status,
        input,
      );
    }

    return {
      certificationType: input.certificationType,
      status: input.status,
      driverIds: [...input.driverIds],
      updatedCount: input.driverIds.length,
      items: input.driverIds.map(driverId => this.createSnapshot(driverId)),
    };
  }

  private recordReviewEvent(
    driverId: string,
    reviewerAdminId: string,
    certificationType: DriverCertificationType,
    fromStatus: DriverCertificationReviewEventRecord['fromStatus'],
    input: ReviewDriverCertificationRequest,
  ) {
    this.reviewEvents.push({
      id: `driver-certification-review-event-${this.reviewEvents.length + 1}`,
      driverId,
      reviewerAdminId,
      certificationType,
      fromStatus,
      toStatus: input.status,
      rejectionReason: getInMemoryReviewRejectionReason(input),
      createdAtIso: this.now().toISOString(),
    });
  }

  private getBatchReviewTargets(
    input: BatchReviewDriverCertificationRequest,
  ): Array<{
    driverId: string;
    record: DriverIdentityCertificationRecord | DriverVehicleCertificationRecord;
  }> {
    const reviewTargets = input.driverIds.map(driverId => ({
      driverId,
      record:
        input.certificationType === 'identity'
          ? this.identities.get(driverId)
          : this.vehicles.get(driverId),
    }));

    for (const { driverId, record } of reviewTargets) {
      if (!record) {
        throw new BusinessError(
          ApiErrorCode.DRIVER_CERTIFICATION_NOT_FOUND,
          `司机认证记录不存在：${driverId}`,
        );
      }
    }

    return reviewTargets as Array<{
      driverId: string;
      record:
        | DriverIdentityCertificationRecord
        | DriverVehicleCertificationRecord;
    }>;
  }

  private createSnapshot(driverId: string): DriverCertificationSnapshot {
    return {
      driver: {
        id: driverId,
        ...(this.driverPhones.has(driverId)
          ? { phone: this.driverPhones.get(driverId) }
          : {}),
      },
      identity: this.identities.get(driverId) ?? {
        driverId,
        status: 'unsubmitted',
      },
      vehicle: this.vehicles.get(driverId) ?? {
        driverId,
        status: 'unsubmitted',
      },
    };
  }

  private rememberDriverPhone(driverId: string, driverPhone: string | undefined) {
    if (driverPhone) {
      this.driverPhones.set(driverId, driverPhone);
    }
  }
}

export type PrismaDriverIdentityCertificationRecord = {
  driverId: string;
  realName: string;
  identityNumber: string;
  identityFrontFileId: string;
  identityBackFileId: string;
  status: DriverIdentityCertificationRecord['status'];
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PrismaDriverVehicleCertificationRecord = {
  driverId: string;
  plateNumber: string;
  vehicleType: string;
  vehicleLengthText: string;
  loadCapacityText: string;
  hasTailboard: boolean;
  drivingLicenseFileId: string;
  driverLicenseFileId: string | null;
  transportQualificationFileId: string | null;
  operationPermitFileId: string | null;
  vehiclePhotoFileId: string;
  status: DriverVehicleCertificationRecord['status'];
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PrismaDriverCertificationReviewEventRecord = {
  id: string;
  driverId: string;
  reviewerAdminId: string;
  certificationType: DriverCertificationType;
  fromStatus: DriverCertificationReviewEventRecord['fromStatus'];
  toStatus: DriverCertificationReviewEventRecord['toStatus'];
  rejectionReason: string | null;
  createdAt: Date;
};

export type PrismaDriverCertificationUserRecord = {
  id: string;
  phone: string;
};

export type PrismaDriverCertificationClient = {
  $transaction<T>(
    callback: (prisma: PrismaDriverCertificationClient) => Promise<T>,
  ): Promise<T>;
  user: {
    findMany(args: {
      where: { id: { in: string[] } };
      select: { id: true; phone: true };
    }): Promise<PrismaDriverCertificationUserRecord[]>;
  };
  driverIdentityCertification: {
    findUnique(args: {
      where: { driverId: string };
    }): Promise<PrismaDriverIdentityCertificationRecord | null>;
    findMany(args: {
      where?: {
        status?: 'reviewing' | 'approved' | 'rejected';
        driverId?: { in: string[] };
      };
      orderBy?: { updatedAt: 'desc' };
    }): Promise<PrismaDriverIdentityCertificationRecord[]>;
    upsert(args: {
      where: { driverId: string };
      create: {
        driverId: string;
        realName: string;
        identityNumber: string;
        identityFrontFileId: string;
        identityBackFileId: string;
        status: 'reviewing';
        rejectionReason: null;
      };
      update: {
        realName: string;
        identityNumber: string;
        identityFrontFileId: string;
        identityBackFileId: string;
        status: 'reviewing';
        rejectionReason: null;
      };
    }): Promise<PrismaDriverIdentityCertificationRecord>;
    update(args: {
      where: { driverId: string };
      data: {
        status: 'approved' | 'rejected';
        rejectionReason: string | null;
      };
    }): Promise<PrismaDriverIdentityCertificationRecord>;
  };
  driverVehicleCertification: {
    findUnique(args: {
      where: { driverId: string };
    }): Promise<PrismaDriverVehicleCertificationRecord | null>;
    findMany(args: {
      where?: {
        status?: 'reviewing' | 'approved' | 'rejected';
        driverId?: { in: string[] };
      };
      orderBy?: { updatedAt: 'desc' };
    }): Promise<PrismaDriverVehicleCertificationRecord[]>;
    upsert(args: {
      where: { driverId: string };
      create: {
        driverId: string;
        plateNumber: string;
        vehicleType: string;
        vehicleLengthText: string;
        loadCapacityText: string;
        hasTailboard: boolean;
        drivingLicenseFileId: string;
        driverLicenseFileId: string;
        transportQualificationFileId: string;
        operationPermitFileId: string;
        vehiclePhotoFileId: string;
        status: 'reviewing';
        rejectionReason: null;
      };
      update: {
        plateNumber: string;
        vehicleType: string;
        vehicleLengthText: string;
        loadCapacityText: string;
        hasTailboard: boolean;
        drivingLicenseFileId: string;
        driverLicenseFileId: string;
        transportQualificationFileId: string;
        operationPermitFileId: string;
        vehiclePhotoFileId: string;
        status: 'reviewing';
        rejectionReason: null;
      };
    }): Promise<PrismaDriverVehicleCertificationRecord>;
    update(args: {
      where: { driverId: string };
      data: {
        status: 'approved' | 'rejected';
        rejectionReason: string | null;
      };
    }): Promise<PrismaDriverVehicleCertificationRecord>;
  };
  driverCertificationReviewEvent: {
    findMany(args: {
      where: { driverId: string };
      orderBy?: { createdAt: 'desc' };
    }): Promise<PrismaDriverCertificationReviewEventRecord[]>;
    create(args: {
      data: {
        driverId: string;
        reviewerAdminId: string;
        certificationType: DriverCertificationType;
        fromStatus: DriverCertificationReviewEventRecord['fromStatus'];
        toStatus: DriverCertificationReviewEventRecord['toStatus'];
        rejectionReason: string | null;
      };
    }): Promise<PrismaDriverCertificationReviewEventRecord>;
  };
};

export class PrismaDriverCertificationRepository
  implements DriverCertificationRepository
{
  constructor(private readonly prisma: PrismaDriverCertificationClient) {}

  async getCertification(driverId: string): Promise<DriverCertificationSnapshot> {
    const [identity, vehicle, drivers] = await Promise.all([
      this.prisma.driverIdentityCertification.findUnique({
        where: { driverId },
      }),
      this.prisma.driverVehicleCertification.findUnique({
        where: { driverId },
      }),
      this.findDrivers([driverId]),
    ]);

    return createSnapshot(driverId, identity, vehicle, drivers.get(driverId));
  }

  async listCertifications(
    query: ListDriverCertificationQuery,
  ): Promise<DriverCertificationListResult> {
    const [identities, vehicles] = await Promise.all([
      this.prisma.driverIdentityCertification.findMany({
        where: { status: query.status },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.driverVehicleCertification.findMany({
        where: { status: query.status },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const latestUpdatedAtByDriverId = new Map<string, number>();

    for (const identity of identities) {
      latestUpdatedAtByDriverId.set(
        identity.driverId,
        Math.max(
          latestUpdatedAtByDriverId.get(identity.driverId) ?? 0,
          identity.updatedAt.getTime(),
        ),
      );
    }

    for (const vehicle of vehicles) {
      latestUpdatedAtByDriverId.set(
        vehicle.driverId,
        Math.max(
          latestUpdatedAtByDriverId.get(vehicle.driverId) ?? 0,
          vehicle.updatedAt.getTime(),
        ),
      );
    }

    const identityByDriverId = new Map(
      identities.map(identity => [identity.driverId, identity] as const),
    );
    const vehicleByDriverId = new Map(
      vehicles.map(vehicle => [vehicle.driverId, vehicle] as const),
    );
    const orderedDriverIds = [...latestUpdatedAtByDriverId.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([driverId]) => driverId);
    const start = (query.page - 1) * query.pageSize;
    const pageDriverIds = orderedDriverIds.slice(start, start + query.pageSize);
    const drivers = await this.findDrivers(pageDriverIds);

    return {
      items: pageDriverIds.map(driverId =>
        createSnapshot(
          driverId,
          identityByDriverId.get(driverId) ?? null,
          vehicleByDriverId.get(driverId) ?? null,
          drivers.get(driverId),
        ),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total: orderedDriverIds.length,
    };
  }

  async listReviewEvents(
    driverId: string,
  ): Promise<DriverCertificationReviewEventRecord[]> {
    const events = await this.prisma.driverCertificationReviewEvent.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
    });

    return events.map(mapPrismaReviewEvent);
  }

  async saveIdentity(
    driverId: string,
    input: SubmitDriverIdentityCertificationRequest,
  ): Promise<DriverCertificationSnapshot> {
    await this.prisma.driverIdentityCertification.upsert({
      where: { driverId },
      create: {
        driverId,
        realName: input.realName,
        identityNumber: input.identityNumber,
        identityFrontFileId: input.identityFrontFileId,
        identityBackFileId: input.identityBackFileId,
        status: 'reviewing',
        rejectionReason: null,
      },
      update: {
        realName: input.realName,
        identityNumber: input.identityNumber,
        identityFrontFileId: input.identityFrontFileId,
        identityBackFileId: input.identityBackFileId,
        status: 'reviewing',
        rejectionReason: null,
      },
    });

    return this.getCertification(driverId);
  }

  async saveVehicle(
    driverId: string,
    input: SubmitDriverVehicleCertificationRequest,
  ): Promise<DriverCertificationSnapshot> {
    await this.prisma.driverVehicleCertification.upsert({
      where: { driverId },
      create: {
        driverId,
        plateNumber: input.plateNumber,
        vehicleType: input.vehicleType,
        vehicleLengthText: input.vehicleLengthText,
        loadCapacityText: input.loadCapacityText,
        hasTailboard: input.hasTailboard,
        drivingLicenseFileId: input.drivingLicenseFileId,
        driverLicenseFileId: input.driverLicenseFileId,
        transportQualificationFileId: input.transportQualificationFileId,
        operationPermitFileId: input.operationPermitFileId,
        vehiclePhotoFileId: input.vehiclePhotoFileId,
        status: 'reviewing',
        rejectionReason: null,
      },
      update: {
        plateNumber: input.plateNumber,
        vehicleType: input.vehicleType,
        vehicleLengthText: input.vehicleLengthText,
        loadCapacityText: input.loadCapacityText,
        hasTailboard: input.hasTailboard,
        drivingLicenseFileId: input.drivingLicenseFileId,
        driverLicenseFileId: input.driverLicenseFileId,
        transportQualificationFileId: input.transportQualificationFileId,
        operationPermitFileId: input.operationPermitFileId,
        vehiclePhotoFileId: input.vehiclePhotoFileId,
        status: 'reviewing',
        rejectionReason: null,
      },
    });

    return this.getCertification(driverId);
  }

  async reviewIdentity(
    driverId: string,
    reviewerAdminId: string,
    input: ReviewDriverCertificationRequest,
  ): Promise<DriverCertificationSnapshot> {
    return this.prisma.$transaction(async prisma => {
      const identity = await prisma.driverIdentityCertification.findUnique({
        where: { driverId },
      });

      if (!identity) {
        throw new BusinessError(
          ApiErrorCode.DRIVER_CERTIFICATION_NOT_FOUND,
          '司机认证记录不存在',
        );
      }

      const updatedIdentity = await prisma.driverIdentityCertification.update({
        where: { driverId },
        data: createPrismaReviewData(input),
      });
      await prisma.driverCertificationReviewEvent.create({
        data: {
          driverId,
          reviewerAdminId,
          certificationType: 'identity',
          fromStatus: identity.status,
          toStatus: input.status,
          rejectionReason: getPrismaReviewRejectionReason(input),
        },
      });
      const vehicle = await prisma.driverVehicleCertification.findUnique({
        where: { driverId },
      });
      const drivers = await prisma.user.findMany({
        where: { id: { in: [driverId] } },
        select: { id: true, phone: true },
      });

      return createSnapshot(
        driverId,
        updatedIdentity,
        vehicle,
        drivers[0],
      );
    });
  }

  async reviewVehicle(
    driverId: string,
    reviewerAdminId: string,
    input: ReviewDriverCertificationRequest,
  ): Promise<DriverCertificationSnapshot> {
    return this.prisma.$transaction(async prisma => {
      const vehicle = await prisma.driverVehicleCertification.findUnique({
        where: { driverId },
      });

      if (!vehicle) {
        throw new BusinessError(
          ApiErrorCode.DRIVER_CERTIFICATION_NOT_FOUND,
          '司机认证记录不存在',
        );
      }

      const updatedVehicle = await prisma.driverVehicleCertification.update({
        where: { driverId },
        data: createPrismaReviewData(input),
      });
      await prisma.driverCertificationReviewEvent.create({
        data: {
          driverId,
          reviewerAdminId,
          certificationType: 'vehicle',
          fromStatus: vehicle.status,
          toStatus: input.status,
          rejectionReason: getPrismaReviewRejectionReason(input),
        },
      });
      const identity = await prisma.driverIdentityCertification.findUnique({
        where: { driverId },
      });
      const drivers = await prisma.user.findMany({
        where: { id: { in: [driverId] } },
        select: { id: true, phone: true },
      });

      return createSnapshot(
        driverId,
        identity,
        updatedVehicle,
        drivers[0],
      );
    });
  }

  async batchReviewCertifications(
    reviewerAdminId: string,
    input: BatchReviewDriverCertificationRequest,
  ): Promise<BatchReviewDriverCertificationResult> {
    return this.prisma.$transaction(async prisma => {
      const driverIds = [...input.driverIds];
      const reviewData = createPrismaReviewData(input);
      const reviewRejectionReason = getPrismaReviewRejectionReason(input);
      const drivers = await prisma.user.findMany({
        where: { id: { in: driverIds } },
        select: { id: true, phone: true },
      });
      const driversById = new Map(
        drivers.map(driver => [driver.id, driver] as const),
      );

      if (input.certificationType === 'identity') {
        const identities = await prisma.driverIdentityCertification.findMany({
          where: {
            driverId: {
              in: driverIds,
            },
          },
        });
        const identityByDriverId = new Map(
          identities.map(identity => [identity.driverId, identity] as const),
        );

        this.assertBatchReviewRecordsExist(driverIds, identityByDriverId);

        const updatedIdentityByDriverId = new Map<
          string,
          PrismaDriverIdentityCertificationRecord
        >();

        for (const driverId of driverIds) {
          const identity = identityByDriverId.get(driverId)!;
          const updatedIdentity = await prisma.driverIdentityCertification.update({
            where: { driverId },
            data: reviewData,
          });

          updatedIdentityByDriverId.set(driverId, updatedIdentity);
          await prisma.driverCertificationReviewEvent.create({
            data: {
              driverId,
              reviewerAdminId,
              certificationType: 'identity',
              fromStatus: identity.status,
              toStatus: input.status,
              rejectionReason: reviewRejectionReason,
            },
          });
        }

        const vehicles = await prisma.driverVehicleCertification.findMany({
          where: {
            driverId: {
              in: driverIds,
            },
          },
        });
        const vehicleByDriverId = new Map(
          vehicles.map(vehicle => [vehicle.driverId, vehicle] as const),
        );

        return {
          certificationType: 'identity',
          status: input.status,
          driverIds,
          updatedCount: driverIds.length,
          items: driverIds.map(driverId =>
            createSnapshot(
              driverId,
              updatedIdentityByDriverId.get(driverId)!,
              vehicleByDriverId.get(driverId) ?? null,
              driversById.get(driverId),
            ),
          ),
        };
      }

      const vehicles = await prisma.driverVehicleCertification.findMany({
        where: {
          driverId: {
            in: driverIds,
          },
        },
      });
      const vehicleByDriverId = new Map(
        vehicles.map(vehicle => [vehicle.driverId, vehicle] as const),
      );

      this.assertBatchReviewRecordsExist(driverIds, vehicleByDriverId);

      const updatedVehicleByDriverId = new Map<
        string,
        PrismaDriverVehicleCertificationRecord
      >();

      for (const driverId of driverIds) {
        const vehicle = vehicleByDriverId.get(driverId)!;
        const updatedVehicle = await prisma.driverVehicleCertification.update({
          where: { driverId },
          data: reviewData,
        });

        updatedVehicleByDriverId.set(driverId, updatedVehicle);
        await prisma.driverCertificationReviewEvent.create({
          data: {
            driverId,
            reviewerAdminId,
            certificationType: 'vehicle',
            fromStatus: vehicle.status,
            toStatus: input.status,
            rejectionReason: reviewRejectionReason,
          },
        });
      }

      const identities = await prisma.driverIdentityCertification.findMany({
        where: {
          driverId: {
            in: driverIds,
          },
        },
      });
      const identityByDriverId = new Map(
        identities.map(identity => [identity.driverId, identity] as const),
      );

      return {
        certificationType: 'vehicle',
        status: input.status,
        driverIds,
        updatedCount: driverIds.length,
        items: driverIds.map(driverId =>
          createSnapshot(
            driverId,
            identityByDriverId.get(driverId) ?? null,
            updatedVehicleByDriverId.get(driverId)!,
            driversById.get(driverId),
          ),
        ),
      };
    });
  }

  private async findDrivers(driverIds: string[]) {
    if (driverIds.length === 0) {
      return new Map<string, PrismaDriverCertificationUserRecord>();
    }

    const drivers = await this.prisma.user.findMany({
      where: {
        id: {
          in: driverIds,
        },
      },
      select: {
        id: true,
        phone: true,
      },
    });

    return new Map(drivers.map(driver => [driver.id, driver] as const));
  }

  private assertBatchReviewRecordsExist<
    T extends { driverId: string; status: DriverIdentityCertificationRecord['status'] },
  >(driverIds: string[], recordsByDriverId: Map<string, T>) {
    for (const driverId of driverIds) {
      if (!recordsByDriverId.has(driverId)) {
        throw new BusinessError(
          ApiErrorCode.DRIVER_CERTIFICATION_NOT_FOUND,
          `司机认证记录不存在：${driverId}`,
        );
      }
    }
  }
}

function createSnapshot(
  driverId: string,
  identity: PrismaDriverIdentityCertificationRecord | null,
  vehicle: PrismaDriverVehicleCertificationRecord | null,
  driver?: PrismaDriverCertificationUserRecord,
): DriverCertificationSnapshot {
  return {
    driver: {
      id: driverId,
      ...(driver ? { phone: driver.phone } : {}),
    },
    identity: identity
      ? mapPrismaIdentity(identity)
      : { driverId, status: 'unsubmitted' },
    vehicle: vehicle
      ? mapPrismaVehicle(vehicle)
      : { driverId, status: 'unsubmitted' },
  };
}

function mapPrismaIdentity(
  identity: PrismaDriverIdentityCertificationRecord,
): DriverIdentityCertificationRecord {
  return {
    driverId: identity.driverId,
    realName: identity.realName,
    identityNumber: identity.identityNumber,
    identityFrontFileId: identity.identityFrontFileId,
    identityBackFileId: identity.identityBackFileId,
    status: identity.status,
    rejectionReason: identity.rejectionReason ?? undefined,
    createdAtIso: identity.createdAt.toISOString(),
    updatedAtIso: identity.updatedAt.toISOString(),
  };
}

function mapPrismaVehicle(
  vehicle: PrismaDriverVehicleCertificationRecord,
): DriverVehicleCertificationRecord {
  return {
    driverId: vehicle.driverId,
    plateNumber: vehicle.plateNumber,
    vehicleType: vehicle.vehicleType,
    vehicleLengthText: vehicle.vehicleLengthText,
    loadCapacityText: vehicle.loadCapacityText,
    hasTailboard: vehicle.hasTailboard,
    drivingLicenseFileId: vehicle.drivingLicenseFileId,
    ...(vehicle.driverLicenseFileId
      ? { driverLicenseFileId: vehicle.driverLicenseFileId }
      : {}),
    ...(vehicle.transportQualificationFileId
      ? { transportQualificationFileId: vehicle.transportQualificationFileId }
      : {}),
    ...(vehicle.operationPermitFileId
      ? { operationPermitFileId: vehicle.operationPermitFileId }
      : {}),
    vehiclePhotoFileId: vehicle.vehiclePhotoFileId,
    status: vehicle.status,
    rejectionReason: vehicle.rejectionReason ?? undefined,
    createdAtIso: vehicle.createdAt.toISOString(),
    updatedAtIso: vehicle.updatedAt.toISOString(),
  };
}

function mapPrismaReviewEvent(
  event: PrismaDriverCertificationReviewEventRecord,
): DriverCertificationReviewEventRecord {
  return {
    id: event.id,
    driverId: event.driverId,
    reviewerAdminId: event.reviewerAdminId,
    certificationType: event.certificationType,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    rejectionReason: event.rejectionReason ?? undefined,
    createdAtIso: event.createdAt.toISOString(),
  };
}

function getInMemoryReviewRejectionReason(
  input: ReviewDriverCertificationRequest,
) {
  return input.status === 'rejected' ? input.rejectionReason : undefined;
}

function getPrismaReviewRejectionReason(input: ReviewDriverCertificationRequest) {
  return input.status === 'rejected' ? input.rejectionReason : null;
}

function createPrismaReviewData(input: ReviewDriverCertificationRequest) {
  return {
    status: input.status,
    rejectionReason: getPrismaReviewRejectionReason(input),
  };
}
