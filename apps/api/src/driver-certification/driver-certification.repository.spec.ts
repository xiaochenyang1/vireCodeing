import { ApiErrorCode, BusinessError } from '../common/errors';
import {
  PrismaDriverCertificationRepository,
  type PrismaDriverIdentityCertificationRecord,
  type PrismaDriverVehicleCertificationRecord,
} from './driver-certification.repository';

describe('PrismaDriverCertificationRepository review concurrency', () => {
  const createdAt = new Date('2026-07-26T10:00:00.000Z');
  const reviewedAt = new Date('2026-07-26T10:01:00.000Z');

  it('allows only one concurrent identity re-review and records one event', async () => {
    let current: PrismaDriverIdentityCertificationRecord = {
      driverId: 'driver-1',
      realName: '张三',
      identityNumber: '110101199003071234',
      identityFrontFileId: 'file-front',
      identityBackFileId: 'file-back',
      status: 'rejected',
      rejectionReason: '证件模糊',
      createdAt,
      updatedAt: createdAt,
    };
    const identity = {
      findUnique: jest.fn(async () => ({ ...current })),
      findMany: jest.fn(),
      upsert: jest.fn(),
      updateManyAndReturn: jest.fn(async ({ where, data }) => {
        if (
          'OR' in where ||
          current.driverId !== where.driverId ||
          current.status !== where.status ||
          current.updatedAt.getTime() !== where.updatedAt.getTime()
        ) {
          return [];
        }
        current = { ...current, ...data, updatedAt: reviewedAt };
        return [{ ...current }];
      }),
    };
    const reviewEvent = {
      findMany: jest.fn(),
      create: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'driver-1', phone: '13900139009' }]),
      },
      driverIdentityCertification: identity,
      driverVehicleCertification: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        upsert: jest.fn(),
        updateManyAndReturn: jest.fn(),
      },
      driverCertificationReviewEvent: reviewEvent,
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async callback => callback(prisma));
    const repository = createRepository(prisma);

    const results = await Promise.allSettled([
      repository.reviewIdentity('driver-1', 'admin-1', {
        status: 'approved',
      }),
      repository.reviewIdentity('driver-1', 'admin-2', {
        status: 'rejected',
        rejectionReason: '身份信息不一致',
      }),
    ]);

    expectSingleWinner(results, 'identity', 'approved');
    expect(identity.updateManyAndReturn).toHaveBeenCalledWith({
      where: {
        driverId: 'driver-1',
        status: 'rejected',
        updatedAt: createdAt,
      },
      data: { status: 'approved', rejectionReason: null },
    });
    expect(reviewEvent.create).toHaveBeenCalledTimes(1);
    expect(reviewEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        driverId: 'driver-1',
        reviewerAdminId: 'admin-1',
        certificationType: 'identity',
        fromStatus: 'rejected',
        toStatus: 'approved',
      }),
    });
  });

  it('allows only one concurrent vehicle review and records one event', async () => {
    let current: PrismaDriverVehicleCertificationRecord = {
      driverId: 'driver-2',
      plateNumber: '粤B12345',
      vehicleType: 'medium',
      vehicleLengthText: '6.8 米',
      loadCapacityText: '8 吨',
      hasTailboard: true,
      drivingLicenseFileId: 'file-driving-license',
      driverLicenseFileId: 'file-driver-license',
      transportQualificationFileId: 'file-transport',
      operationPermitFileId: 'file-operation',
      vehiclePhotoFileId: 'file-vehicle',
      status: 'reviewing',
      rejectionReason: null,
      createdAt,
      updatedAt: createdAt,
    };
    const vehicle = {
      findUnique: jest.fn(async () => ({ ...current })),
      findMany: jest.fn(),
      upsert: jest.fn(),
      updateManyAndReturn: jest.fn(async ({ where, data }) => {
        if (
          'OR' in where ||
          current.driverId !== where.driverId ||
          current.status !== where.status ||
          current.updatedAt.getTime() !== where.updatedAt.getTime()
        ) {
          return [];
        }
        current = { ...current, ...data, updatedAt: reviewedAt };
        return [{ ...current }];
      }),
    };
    const reviewEvent = {
      findMany: jest.fn(),
      create: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'driver-2', phone: '13900139010' }]),
      },
      driverIdentityCertification: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        upsert: jest.fn(),
        updateManyAndReturn: jest.fn(),
      },
      driverVehicleCertification: vehicle,
      driverCertificationReviewEvent: reviewEvent,
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async callback => callback(prisma));
    const repository = createRepository(prisma);

    const results = await Promise.allSettled([
      repository.reviewVehicle('driver-2', 'admin-1', { status: 'approved' }),
      repository.reviewVehicle('driver-2', 'admin-2', {
        status: 'rejected',
        rejectionReason: '车辆照片不清晰',
      }),
    ]);

    expectSingleWinner(results, 'vehicle', 'approved');
    expect(vehicle.updateManyAndReturn).toHaveBeenCalledWith({
      where: {
        driverId: 'driver-2',
        status: 'reviewing',
        updatedAt: createdAt,
      },
      data: { status: 'approved', rejectionReason: null },
    });
    expect(reviewEvent.create).toHaveBeenCalledTimes(1);
    expect(reviewEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        driverId: 'driver-2',
        reviewerAdminId: 'admin-1',
        certificationType: 'vehicle',
        fromStatus: 'reviewing',
        toStatus: 'approved',
      }),
    });
  });

  it('rejects a partially matched batch before writing review events', async () => {
    const identities: PrismaDriverIdentityCertificationRecord[] = [
      {
        driverId: 'driver-1',
        realName: '张三',
        identityNumber: '110101199003071234',
        identityFrontFileId: 'file-front-1',
        identityBackFileId: 'file-back-1',
        status: 'reviewing',
        rejectionReason: null,
        createdAt,
        updatedAt: createdAt,
      },
      {
        driverId: 'driver-2',
        realName: '李四',
        identityNumber: '110101199003071235',
        identityFrontFileId: 'file-front-2',
        identityBackFileId: 'file-back-2',
        status: 'approved',
        rejectionReason: null,
        createdAt,
        updatedAt: createdAt,
      },
    ];
    const updateManyAndReturn = jest.fn().mockResolvedValue([
      { ...identities[0], status: 'approved', updatedAt: reviewedAt },
    ]);
    const reviewEvent = {
      findMany: jest.fn(),
      create: jest.fn(),
    };
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      driverIdentityCertification: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue(identities),
        upsert: jest.fn(),
        updateManyAndReturn,
      },
      driverVehicleCertification: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        updateManyAndReturn: jest.fn(),
      },
      driverCertificationReviewEvent: reviewEvent,
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async callback => callback(prisma));
    const repository = createRepository(prisma);

    await expect(
      repository.batchReviewCertifications('admin-1', {
        driverIds: ['driver-1', 'driver-2'],
        certificationType: 'identity',
        status: 'approved',
      }),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.DRIVER_CERTIFICATION_CONFLICT,
        '司机认证记录已被其他管理员更新',
      ),
    );
    expect(updateManyAndReturn).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            driverId: 'driver-1',
            status: 'reviewing',
            updatedAt: createdAt,
          },
          {
            driverId: 'driver-2',
            status: 'approved',
            updatedAt: createdAt,
          },
        ],
      },
      data: { status: 'approved', rejectionReason: null },
    });
    expect(reviewEvent.create).not.toHaveBeenCalled();
  });
});

describe('PrismaDriverCertificationRepository review queue', () => {
  it('hydrates both certification records after selecting drivers by status', async () => {
    const identityUpdatedAt = new Date('2026-07-26T10:01:00.000Z');
    const vehicleUpdatedAt = new Date('2026-07-26T10:00:00.000Z');
    const identity: PrismaDriverIdentityCertificationRecord = {
      driverId: 'driver-1',
      realName: '张三',
      identityNumber: '110101199003071234',
      identityFrontFileId: 'file-front',
      identityBackFileId: 'file-back',
      status: 'reviewing',
      rejectionReason: null,
      createdAt: identityUpdatedAt,
      updatedAt: identityUpdatedAt,
    };
    const vehicle: PrismaDriverVehicleCertificationRecord = {
      driverId: 'driver-1',
      plateNumber: '粤B12345',
      vehicleType: 'medium',
      vehicleLengthText: '6.8 米',
      loadCapacityText: '8 吨',
      hasTailboard: true,
      drivingLicenseFileId: 'file-driving-license',
      driverLicenseFileId: 'file-driver-license',
      transportQualificationFileId: 'file-qualification',
      operationPermitFileId: 'file-operation-permit',
      vehiclePhotoFileId: 'file-vehicle-photo',
      status: 'approved',
      rejectionReason: null,
      createdAt: vehicleUpdatedAt,
      updatedAt: vehicleUpdatedAt,
    };
    const identityFindMany = jest
      .fn()
      .mockResolvedValueOnce([identity])
      .mockResolvedValueOnce([identity]);
    const vehicleFindMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([vehicle]);
    const repository = createRepository({
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'driver-1', phone: '13900139009' }]),
      },
      driverIdentityCertification: {
        findUnique: jest.fn(),
        findMany: identityFindMany,
        upsert: jest.fn(),
        updateManyAndReturn: jest.fn(),
      },
      driverVehicleCertification: {
        findUnique: jest.fn(),
        findMany: vehicleFindMany,
        upsert: jest.fn(),
        updateManyAndReturn: jest.fn(),
      },
      driverCertificationReviewEvent: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    });

    await expect(
      repository.listCertifications({
        status: 'reviewing',
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({
      items: [
        {
          driver: { id: 'driver-1', phone: '13900139009' },
          identity: { driverId: 'driver-1', status: 'reviewing' },
          vehicle: { driverId: 'driver-1', status: 'approved' },
        },
      ],
      total: 1,
    });
    expect(identityFindMany).toHaveBeenNthCalledWith(1, {
      where: { status: 'reviewing' },
      orderBy: { updatedAt: 'desc' },
    });
    expect(vehicleFindMany).toHaveBeenNthCalledWith(1, {
      where: { status: 'reviewing' },
      orderBy: { updatedAt: 'desc' },
    });
    expect(identityFindMany).toHaveBeenNthCalledWith(2, {
      where: { driverId: { in: ['driver-1'] } },
    });
    expect(vehicleFindMany).toHaveBeenNthCalledWith(2, {
      where: { driverId: { in: ['driver-1'] } },
    });
  });
});

function createRepository(prisma: unknown) {
  return new PrismaDriverCertificationRepository(
    prisma as ConstructorParameters<typeof PrismaDriverCertificationRepository>[0],
  );
}

function expectSingleWinner(
  results: PromiseSettledResult<unknown>[],
  certificationType: 'identity' | 'vehicle',
  winningStatus: string,
) {
  expect(results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        status: 'fulfilled',
        value: expect.objectContaining({
          [certificationType]: expect.objectContaining({ status: winningStatus }),
        }),
      }),
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({
          code: ApiErrorCode.DRIVER_CERTIFICATION_CONFLICT,
        }),
      }),
    ]),
  );
}
