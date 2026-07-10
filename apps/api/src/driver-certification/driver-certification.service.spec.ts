import { ApiErrorCode, BusinessError } from '../common/errors';
import { InMemoryFilesRepository } from '../files/files.repository';
import {
  InMemoryDriverCertificationRepository,
  PrismaDriverCertificationRepository,
} from './driver-certification.repository';
import { DriverCertificationService } from './driver-certification.service';

describe('DriverCertificationService', () => {
  const now = new Date('2026-07-06T08:00:00.000Z');

  function createService() {
    const repository = new InMemoryDriverCertificationRepository(() => now);
    const filesRepository = new InMemoryFilesRepository(() => now);
    const previewUrlSigner = {
      signPreviewUrl: jest.fn(file => ({
        previewUrl: `https://preview.example.com/${file.id}`,
        previewExpiresAtIso: '2026-07-06T08:10:00.000Z',
      })),
    };

    return {
      repository,
      filesRepository,
      previewUrlSigner,
      service: new DriverCertificationService(
        repository,
        filesRepository,
        previewUrlSigner,
      ),
    };
  }

  it('returns unsubmitted snapshots for drivers without certification records', async () => {
    const { service } = createService();

    await expect(
      service.getCertification({
        id: 'driver-1',
        phone: '13900139009',
        userType: 'driver',
      }),
    ).resolves.toEqual({
      driver: {
        id: 'driver-1',
        phone: '13900139009',
      },
      identity: {
        driverId: 'driver-1',
        status: 'unsubmitted',
      },
      vehicle: {
        driverId: 'driver-1',
        status: 'unsubmitted',
      },
    });
  });

  it('rejects non-driver users', async () => {
    const { service } = createService();

    await expect(
      service.getCertification({
        id: 'shipper-1',
        phone: '13900139001',
        userType: 'shipper',
      }),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是司机'),
    );
  });

  it('submits identity certification as reviewing', async () => {
    const { filesRepository, service } = createService();
    const frontFile = await createUploadedFile(filesRepository, 'driver-1');
    const backFile = await createUploadedFile(filesRepository, 'driver-1');

    await expect(
      service.submitIdentity(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        {
          realName: '张三',
          identityNumber: '110101199003071234',
          identityFrontFileId: frontFile.id,
          identityBackFileId: backFile.id,
        },
      ),
    ).resolves.toMatchObject({
      driver: {
        id: 'driver-1',
        phone: '13900139009',
      },
      identity: {
        driverId: 'driver-1',
        realName: '张三',
        status: 'reviewing',
        updatedAtIso: now.toISOString(),
      },
      vehicle: {
        driverId: 'driver-1',
        status: 'unsubmitted',
      },
    });
  });

  it('submits vehicle certification as reviewing', async () => {
    const { filesRepository, service } = createService();
    const vehicleLicenseFile = await createUploadedFile(
      filesRepository,
      'driver-1',
    );
    const driverLicenseFile = await createUploadedFile(
      filesRepository,
      'driver-1',
    );
    const transportQualificationFile = await createUploadedFile(
      filesRepository,
      'driver-1',
    );
    const operationPermitFile = await createUploadedFile(
      filesRepository,
      'driver-1',
    );
    const vehiclePhotoFile = await createUploadedFile(filesRepository, 'driver-1');

    await expect(
      service.submitVehicle(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        {
          plateNumber: '粤B12345',
          vehicleType: 'medium',
          vehicleLengthText: '6.8 米',
          loadCapacityText: '8 吨',
          hasTailboard: true,
          drivingLicenseFileId: vehicleLicenseFile.id,
          driverLicenseFileId: driverLicenseFile.id,
          transportQualificationFileId: transportQualificationFile.id,
          operationPermitFileId: operationPermitFile.id,
          vehiclePhotoFileId: vehiclePhotoFile.id,
        },
      ),
    ).resolves.toMatchObject({
      driver: {
        id: 'driver-1',
        phone: '13900139009',
      },
      identity: {
        driverId: 'driver-1',
        status: 'unsubmitted',
      },
      vehicle: {
        driverId: 'driver-1',
        plateNumber: '粤B12345',
        drivingLicenseFileId: vehicleLicenseFile.id,
        driverLicenseFileId: driverLicenseFile.id,
        transportQualificationFileId: transportQualificationFile.id,
        operationPermitFileId: operationPermitFile.id,
        status: 'reviewing',
        updatedAtIso: now.toISOString(),
      },
    });
  });

  it('allows admins to approve identity certification', async () => {
    const { filesRepository, service } = createService();
    const frontFile = await createUploadedFile(filesRepository, 'driver-1');
    const backFile = await createUploadedFile(filesRepository, 'driver-1');
    await service.submitIdentity(
      { id: 'driver-1', phone: '13900139009', userType: 'driver' },
      {
        realName: '张三',
        identityNumber: '110101199003071234',
        identityFrontFileId: frontFile.id,
        identityBackFileId: backFile.id,
      },
    );

    await expect(
      service.reviewIdentity(
        { id: 'admin-1', phone: '13900139000', userType: 'admin' },
        'driver-1',
        { status: 'approved' },
      ),
    ).resolves.toMatchObject({
      identity: {
        driverId: 'driver-1',
        status: 'approved',
        rejectionReason: undefined,
      },
    });
  });

  it('records identity certification review events with reviewer and status change', async () => {
    const { filesRepository, service } = createService();
    const frontFile = await createUploadedFile(filesRepository, 'driver-1');
    const backFile = await createUploadedFile(filesRepository, 'driver-1');
    await service.submitIdentity(
      { id: 'driver-1', phone: '13900139009', userType: 'driver' },
      {
        realName: '张三',
        identityNumber: '110101199003071234',
        identityFrontFileId: frontFile.id,
        identityBackFileId: backFile.id,
      },
    );

    await service.reviewIdentity(
      { id: 'admin-1', phone: '13900139000', userType: 'admin' },
      'driver-1',
      { status: 'approved' },
    );

    await expect(
      service.listReviewEvents(
        { id: 'admin-2', phone: '13900139001', userType: 'admin' },
        'driver-1',
      ),
    ).resolves.toEqual([
      {
        id: 'driver-certification-review-event-1',
        driverId: 'driver-1',
        reviewerAdminId: 'admin-1',
        certificationType: 'identity',
        fromStatus: 'reviewing',
        toStatus: 'approved',
        createdAtIso: now.toISOString(),
      },
    ]);
  });

  it('allows admins to reject vehicle certification with a reason', async () => {
    const { filesRepository, service } = createService();
    const vehicleLicenseFile = await createUploadedFile(
      filesRepository,
      'driver-1',
    );
    const driverLicenseFile = await createUploadedFile(
      filesRepository,
      'driver-1',
    );
    const transportQualificationFile = await createUploadedFile(
      filesRepository,
      'driver-1',
    );
    const operationPermitFile = await createUploadedFile(
      filesRepository,
      'driver-1',
    );
    const vehiclePhotoFile = await createUploadedFile(filesRepository, 'driver-1');
    await service.submitVehicle(
      { id: 'driver-1', phone: '13900139009', userType: 'driver' },
      {
        plateNumber: '粤B12345',
        vehicleType: 'medium',
        vehicleLengthText: '6.8 米',
        loadCapacityText: '8 吨',
        hasTailboard: true,
        drivingLicenseFileId: vehicleLicenseFile.id,
        driverLicenseFileId: driverLicenseFile.id,
        transportQualificationFileId: transportQualificationFile.id,
        operationPermitFileId: operationPermitFile.id,
        vehiclePhotoFileId: vehiclePhotoFile.id,
      },
    );

    await expect(
      service.reviewVehicle(
        { id: 'admin-1', phone: '13900139000', userType: 'admin' },
        'driver-1',
        { status: 'rejected', rejectionReason: '行驶证照片不清晰' },
      ),
    ).resolves.toMatchObject({
      vehicle: {
        driverId: 'driver-1',
        status: 'rejected',
        rejectionReason: '行驶证照片不清晰',
      },
    });
  });

  it('records vehicle certification rejection events with rejection reason', async () => {
    const { filesRepository, service } = createService();
    const vehicleLicenseFile = await createUploadedFile(
      filesRepository,
      'driver-1',
    );
    const driverLicenseFile = await createUploadedFile(
      filesRepository,
      'driver-1',
    );
    const transportQualificationFile = await createUploadedFile(
      filesRepository,
      'driver-1',
    );
    const operationPermitFile = await createUploadedFile(
      filesRepository,
      'driver-1',
    );
    const vehiclePhotoFile = await createUploadedFile(filesRepository, 'driver-1');
    await service.submitVehicle(
      { id: 'driver-1', phone: '13900139009', userType: 'driver' },
      {
        plateNumber: '粤B12345',
        vehicleType: 'medium',
        vehicleLengthText: '6.8 米',
        loadCapacityText: '8 吨',
        hasTailboard: true,
        drivingLicenseFileId: vehicleLicenseFile.id,
        driverLicenseFileId: driverLicenseFile.id,
        transportQualificationFileId: transportQualificationFile.id,
        operationPermitFileId: operationPermitFile.id,
        vehiclePhotoFileId: vehiclePhotoFile.id,
      },
    );

    await service.reviewVehicle(
      { id: 'admin-1', phone: '13900139000', userType: 'admin' },
      'driver-1',
      { status: 'rejected', rejectionReason: '行驶证照片不清晰' },
    );

    await expect(
      service.listReviewEvents(
        { id: 'admin-2', phone: '13900139001', userType: 'admin' },
        'driver-1',
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        driverId: 'driver-1',
        reviewerAdminId: 'admin-1',
        certificationType: 'vehicle',
        fromStatus: 'reviewing',
        toStatus: 'rejected',
        rejectionReason: '行驶证照片不清晰',
      }),
    ]);
  });

  it('rejects non-admin certification reviews', async () => {
    const { service } = createService();

    await expect(
      service.reviewIdentity(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        'driver-1',
        { status: 'approved' },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
  });

  it('rejects reviewing missing certification records', async () => {
    const { service } = createService();

    await expect(
      service.reviewVehicle(
        { id: 'admin-1', phone: '13900139000', userType: 'admin' },
        'driver-missing',
        { status: 'approved' },
      ),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.DRIVER_CERTIFICATION_NOT_FOUND,
        '司机认证记录不存在',
      ),
    );
  });

  it('lists certification snapshots for admins by status', async () => {
    const { filesRepository, service } = createService();
    const driver1FrontFile = await createUploadedFile(filesRepository, 'driver-1');
    const driver1BackFile = await createUploadedFile(filesRepository, 'driver-1');
    const driver2VehicleLicenseFile = await createUploadedFile(
      filesRepository,
      'driver-2',
    );
    const driver2DriverLicenseFile = await createUploadedFile(
      filesRepository,
      'driver-2',
    );
    const driver2TransportQualificationFile = await createUploadedFile(
      filesRepository,
      'driver-2',
    );
    const driver2OperationPermitFile = await createUploadedFile(
      filesRepository,
      'driver-2',
    );
    const driver2PhotoFile = await createUploadedFile(filesRepository, 'driver-2');

    await service.submitIdentity(
      { id: 'driver-1', phone: '13900139009', userType: 'driver' },
      {
        realName: '张三',
        identityNumber: '110101199003071234',
        identityFrontFileId: driver1FrontFile.id,
        identityBackFileId: driver1BackFile.id,
      },
    );
    await service.submitVehicle(
      { id: 'driver-2', phone: '13900139010', userType: 'driver' },
      {
        plateNumber: '粤B12345',
        vehicleType: 'medium',
        vehicleLengthText: '6.8 米',
        loadCapacityText: '8 吨',
        hasTailboard: true,
        drivingLicenseFileId: driver2VehicleLicenseFile.id,
        driverLicenseFileId: driver2DriverLicenseFile.id,
        transportQualificationFileId: driver2TransportQualificationFile.id,
        operationPermitFileId: driver2OperationPermitFile.id,
        vehiclePhotoFileId: driver2PhotoFile.id,
      },
    );

    await expect(
      service.listCertifications(
        { id: 'admin-1', phone: '13900139000', userType: 'admin' },
        { status: 'reviewing', page: 1, pageSize: 20 },
      ),
    ).resolves.toEqual({
      items: [
        {
          driver: {
            id: 'driver-1',
            phone: '13900139009',
          },
          identity: expect.objectContaining({
            driverId: 'driver-1',
            status: 'reviewing',
          }),
          vehicle: { driverId: 'driver-1', status: 'unsubmitted' },
        },
        {
          driver: {
            id: 'driver-2',
            phone: '13900139010',
          },
          identity: { driverId: 'driver-2', status: 'unsubmitted' },
          vehicle: expect.objectContaining({
            driverId: 'driver-2',
            status: 'reviewing',
          }),
        },
      ],
      page: 1,
      pageSize: 20,
      total: 2,
    });
  });

  it('rejects non-admin certification list access', async () => {
    const { service } = createService();

    await expect(
      service.listCertifications(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        { status: 'reviewing', page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
  });

  it('rejects non-admin certification review event access', async () => {
    const { service } = createService();

    await expect(
      service.listReviewEvents(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        'driver-1',
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
  });

  it('lists certification attachment preview metadata for admins', async () => {
    const { filesRepository, service } = createService();
    const frontFile = await createUploadedFile(
      filesRepository,
      'driver-1',
      'identity',
      'https://cdn.example.com/driver-1/front.png',
    );
    const backFile = await createUploadedFile(
      filesRepository,
      'driver-1',
      'identity',
      'https://cdn.example.com/driver-1/back.png',
    );
    const vehicleLicenseFile = await createUploadedFile(
      filesRepository,
      'driver-1',
      'identity',
      'https://cdn.example.com/driver-1/vehicle-license.png',
    );
    const driverLicenseFile = await createUploadedFile(
      filesRepository,
      'driver-1',
      'identity',
      'https://cdn.example.com/driver-1/driver-license.png',
    );
    const transportQualificationFile = await createUploadedFile(
      filesRepository,
      'driver-1',
      'identity',
      'https://cdn.example.com/driver-1/transport-qualification.png',
    );
    const operationPermitFile = await createUploadedFile(
      filesRepository,
      'driver-1',
      'identity',
      'https://cdn.example.com/driver-1/operation-permit.png',
    );
    const vehiclePhotoFile = await createUploadedFile(
      filesRepository,
      'driver-1',
      'identity',
      'https://cdn.example.com/driver-1/vehicle.png',
    );
    await service.submitIdentity(
      { id: 'driver-1', phone: '13900139009', userType: 'driver' },
      {
        realName: '张三',
        identityNumber: '110101199003071234',
        identityFrontFileId: frontFile.id,
        identityBackFileId: backFile.id,
      },
    );
    await service.submitVehicle(
      { id: 'driver-1', phone: '13900139009', userType: 'driver' },
      {
        plateNumber: '粤B12345',
        vehicleType: 'medium',
        vehicleLengthText: '6.8 米',
        loadCapacityText: '8 吨',
        hasTailboard: true,
        drivingLicenseFileId: vehicleLicenseFile.id,
        driverLicenseFileId: driverLicenseFile.id,
        transportQualificationFileId: transportQualificationFile.id,
        operationPermitFileId: operationPermitFile.id,
        vehiclePhotoFileId: vehiclePhotoFile.id,
      },
    );

    await expect(
      service.getAttachmentPreviews(
        { id: 'admin-1', phone: '13900139000', userType: 'admin' },
        'driver-1',
      ),
    ).resolves.toEqual({
      driverId: 'driver-1',
      identity: {
        identityFront: expect.objectContaining({
          id: frontFile.id,
          attachmentType: 'identityFront',
          publicUrl: 'https://cdn.example.com/driver-1/front.png',
          status: 'uploaded',
        }),
        identityBack: expect.objectContaining({
          id: backFile.id,
          attachmentType: 'identityBack',
          publicUrl: 'https://cdn.example.com/driver-1/back.png',
          status: 'uploaded',
        }),
      },
      vehicle: {
        drivingLicense: expect.objectContaining({
          id: vehicleLicenseFile.id,
          attachmentType: 'drivingLicense',
          publicUrl: 'https://cdn.example.com/driver-1/vehicle-license.png',
          status: 'uploaded',
        }),
        driverLicense: expect.objectContaining({
          id: driverLicenseFile.id,
          attachmentType: 'driverLicense',
          publicUrl: 'https://cdn.example.com/driver-1/driver-license.png',
          status: 'uploaded',
        }),
        transportQualification: expect.objectContaining({
          id: transportQualificationFile.id,
          attachmentType: 'transportQualification',
          publicUrl:
            'https://cdn.example.com/driver-1/transport-qualification.png',
          status: 'uploaded',
        }),
        operationPermit: expect.objectContaining({
          id: operationPermitFile.id,
          attachmentType: 'operationPermit',
          publicUrl: 'https://cdn.example.com/driver-1/operation-permit.png',
          status: 'uploaded',
        }),
        vehiclePhoto: expect.objectContaining({
          id: vehiclePhotoFile.id,
          attachmentType: 'vehiclePhoto',
          publicUrl: 'https://cdn.example.com/driver-1/vehicle.png',
          status: 'uploaded',
        }),
      },
    });
  });

  it('adds signed preview urls to certification attachment previews', async () => {
    const { filesRepository, previewUrlSigner, service } = createService();
    const frontFile = await createUploadedFile(
      filesRepository,
      'driver-1',
      'identity',
      'https://cdn.example.com/driver-1/front.png',
    );
    const backFile = await createUploadedFile(filesRepository, 'driver-1');
    await service.submitIdentity(
      { id: 'driver-1', phone: '13900139009', userType: 'driver' },
      {
        realName: '张三',
        identityNumber: '110101199003071234',
        identityFrontFileId: frontFile.id,
        identityBackFileId: backFile.id,
      },
    );

    await expect(
      service.getAttachmentPreviews(
        { id: 'admin-1', phone: '13900139000', userType: 'admin' },
        'driver-1',
      ),
    ).resolves.toMatchObject({
      identity: {
        identityFront: {
          id: frontFile.id,
          previewUrl: `https://preview.example.com/${frontFile.id}`,
          previewExpiresAtIso: '2026-07-06T08:10:00.000Z',
        },
        identityBack: {
          id: backFile.id,
          previewUrl: `https://preview.example.com/${backFile.id}`,
          previewExpiresAtIso: '2026-07-06T08:10:00.000Z',
        },
      },
    });
    expect(previewUrlSigner.signPreviewUrl).toHaveBeenCalledWith(frontFile);
    expect(previewUrlSigner.signPreviewUrl).toHaveBeenCalledWith(backFile);
  });

  it('rejects non-admin certification attachment preview access', async () => {
    const { service } = createService();

    await expect(
      service.getAttachmentPreviews(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        'driver-1',
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
  });

  it('rejects identity certification files owned by another user', async () => {
    const { filesRepository, service } = createService();
    const frontFile = await createUploadedFile(filesRepository, 'driver-2');
    const backFile = await createUploadedFile(filesRepository, 'driver-1');

    await expect(
      service.submitIdentity(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        {
          realName: '张三',
          identityNumber: '110101199003071234',
          identityFrontFileId: frontFile.id,
          identityBackFileId: backFile.id,
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '认证附件不存在'),
    );
  });

  it('rejects vehicle certification files that are not uploaded', async () => {
    const { filesRepository, service } = createService();
    const pendingFile = await filesRepository.createPendingFile('driver-1', {
      purpose: 'identity',
      fileName: '行驶证.png',
      contentType: 'image/png',
      byteSize: 2048,
      objectKey: 'driver-1/identity/pending-license.png',
    });
    const driverLicenseFile = await createUploadedFile(filesRepository, 'driver-1');
    const transportQualificationFile = await createUploadedFile(
      filesRepository,
      'driver-1',
    );
    const operationPermitFile = await createUploadedFile(
      filesRepository,
      'driver-1',
    );
    const vehiclePhotoFile = await createUploadedFile(filesRepository, 'driver-1');

    await expect(
      service.submitVehicle(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        {
          plateNumber: '粤B12345',
          vehicleType: 'medium',
          vehicleLengthText: '6.8 米',
          loadCapacityText: '8 吨',
          hasTailboard: true,
          drivingLicenseFileId: pendingFile.id,
          driverLicenseFileId: driverLicenseFile.id,
          transportQualificationFileId: transportQualificationFile.id,
          operationPermitFileId: operationPermitFile.id,
          vehiclePhotoFileId: vehiclePhotoFile.id,
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.FILE_STATE_INVALID, '认证附件尚未上传完成'),
    );
  });

  it('rejects certification files with a wrong purpose', async () => {
    const { filesRepository, service } = createService();
    const cargoFile = await createUploadedFile(
      filesRepository,
      'driver-1',
      'cargo',
    );
    const backFile = await createUploadedFile(filesRepository, 'driver-1');

    await expect(
      service.submitIdentity(
        { id: 'driver-1', phone: '13900139009', userType: 'driver' },
        {
          realName: '张三',
          identityNumber: '110101199003071234',
          identityFrontFileId: cargoFile.id,
          identityBackFileId: backFile.id,
        },
      ),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.FILE_PURPOSE_INVALID,
        '认证附件用途不匹配',
      ),
    );
  });
});

describe('PrismaDriverCertificationRepository', () => {
  it('includes driver account phone in certification snapshots', async () => {
    const now = new Date('2026-07-06T08:00:00.000Z');
    const repository = new PrismaDriverCertificationRepository({
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'driver-1',
            phone: '13900139009',
          },
        ]),
      },
      driverIdentityCertification: {
        findUnique: jest.fn().mockResolvedValue({
          driverId: 'driver-1',
          realName: '张三',
          identityNumber: '110101199003071234',
          identityFrontFileId: 'file-front',
          identityBackFileId: 'file-back',
          status: 'reviewing',
          rejectionReason: null,
          createdAt: now,
          updatedAt: now,
        }),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      driverVehicleCertification: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      driverCertificationReviewEvent: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    });

    await expect(repository.getCertification('driver-1')).resolves.toMatchObject({
      driver: {
        id: 'driver-1',
        phone: '13900139009',
      },
      identity: {
        driverId: 'driver-1',
        status: 'reviewing',
      },
    });
  });
});

async function createUploadedFile(
  repository: InMemoryFilesRepository,
  ownerUserId: string,
  purpose: 'identity' | 'cargo' = 'identity',
  publicUrl?: string,
) {
  const file = await repository.createPendingFile(ownerUserId, {
    purpose,
    fileName: `${purpose}.png`,
    contentType: 'image/png',
    byteSize: 2048,
    objectKey: `${ownerUserId}/${purpose}/file.png`,
  });

  return repository.markFileUploaded(file.id, ownerUserId, { publicUrl });
}
