import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { ApiErrorCode } from '../common/errors';
import {
  AdminDriverCertificationController,
  DriverCertificationController,
} from './driver-certification.controller';
import type { DriverCertificationService } from './driver-certification.service';

describe('DriverCertificationController', () => {
  it('gets current driver certification snapshot', async () => {
    const service = {
      getCertification: jest.fn().mockResolvedValue({
        driver: { id: 'driver-1', phone: '13900139009' },
        identity: { driverId: 'driver-1', status: 'unsubmitted' },
        vehicle: { driverId: 'driver-1', status: 'unsubmitted' },
      }),
    } as unknown as DriverCertificationService;
    const controller = new DriverCertificationController(service);

    await expect(
      controller.getCertification(createRequest('driver-1')),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        driver: { id: 'driver-1', phone: '13900139009' },
        identity: { driverId: 'driver-1', status: 'unsubmitted' },
      },
    });
    expect(service.getCertification).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
    );
  });

  it('submits current driver identity certification', async () => {
    const service = {
      submitIdentity: jest.fn().mockResolvedValue({
        driver: { id: 'driver-1', phone: '13900139009' },
        identity: { driverId: 'driver-1', status: 'reviewing' },
        vehicle: { driverId: 'driver-1', status: 'unsubmitted' },
      }),
    } as unknown as DriverCertificationService;
    const controller = new DriverCertificationController(service);

    await expect(
      controller.submitIdentity(createRequest('driver-1'), {
        realName: '张三',
        identityNumber: '110101199003071234',
        identityFrontFileId: 'file-front',
        identityBackFileId: 'file-back',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        identity: { driverId: 'driver-1', status: 'reviewing' },
      },
    });
    expect(service.submitIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
      {
        realName: '张三',
        identityNumber: '110101199003071234',
        identityFrontFileId: 'file-front',
        identityBackFileId: 'file-back',
      },
    );
  });

  it('submits current driver vehicle certification', async () => {
    const service = {
      submitVehicle: jest.fn().mockResolvedValue({
        driver: { id: 'driver-1', phone: '13900139009' },
        identity: { driverId: 'driver-1', status: 'unsubmitted' },
        vehicle: { driverId: 'driver-1', status: 'reviewing' },
      }),
    } as unknown as DriverCertificationService;
    const controller = new DriverCertificationController(service);

    await expect(
      controller.submitVehicle(createRequest('driver-1'), {
        plateNumber: '粤B12345',
        vehicleType: 'medium',
        vehicleLengthText: '6.8 米',
        loadCapacityText: '8 吨',
        hasTailboard: true,
        drivingLicenseFileId: 'file-vehicle-license',
        driverLicenseFileId: 'file-driver-license',
        transportQualificationFileId: 'file-transport-qualification',
        operationPermitFileId: 'file-operation-permit',
        vehiclePhotoFileId: 'file-vehicle-photo',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        vehicle: { driverId: 'driver-1', status: 'reviewing' },
      },
    });
    expect(service.submitVehicle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'driver-1', userType: 'driver' }),
      {
        plateNumber: '粤B12345',
        vehicleType: 'medium',
        vehicleLengthText: '6.8 米',
        loadCapacityText: '8 吨',
        hasTailboard: true,
        drivingLicenseFileId: 'file-vehicle-license',
        driverLicenseFileId: 'file-driver-license',
        transportQualificationFileId: 'file-transport-qualification',
        operationPermitFileId: 'file-operation-permit',
        vehiclePhotoFileId: 'file-vehicle-photo',
      },
    );
  });

  it('rejects non-driver identity submissions before parsing certification data', async () => {
    const service = {
      submitIdentity: jest.fn(),
    } as unknown as DriverCertificationService;
    const controller = new DriverCertificationController(service);

    await expect(
      controller.submitIdentity(
        createRequest('shipper-1', 'shipper'),
        {} as never,
      ),
    ).rejects.toMatchObject({
      code: ApiErrorCode.AUTH_FORBIDDEN,
      message: '当前账号不是司机',
    });
    expect(service.submitIdentity).not.toHaveBeenCalled();
  });

  it('reviews driver identity certification as admin', async () => {
    const service = {
      reviewIdentity: jest.fn().mockResolvedValue({
        driver: { id: 'driver-1', phone: '13900139009' },
        identity: { driverId: 'driver-1', status: 'approved' },
        vehicle: { driverId: 'driver-1', status: 'reviewing' },
      }),
    } as unknown as DriverCertificationService;
    const controller = new AdminDriverCertificationController(service);

    await expect(
      controller.reviewIdentity(createRequest('admin-1', 'admin'), 'driver-1', {
        status: 'approved',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        identity: { driverId: 'driver-1', status: 'approved' },
      },
    });
    expect(service.reviewIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin-1', userType: 'admin' }),
      'driver-1',
      { status: 'approved' },
    );
  });

  it('reviews driver certifications in batch as admin', async () => {
    const service = {
      batchReviewCertifications: jest.fn().mockResolvedValue({
        certificationType: 'identity',
        status: 'approved',
        driverIds: ['driver-2', 'driver-1'],
        updatedCount: 2,
        items: [
          {
            driver: { id: 'driver-2', phone: '13900139010' },
            identity: { driverId: 'driver-2', status: 'approved' },
            vehicle: { driverId: 'driver-2', status: 'unsubmitted' },
          },
          {
            driver: { id: 'driver-1', phone: '13900139009' },
            identity: { driverId: 'driver-1', status: 'approved' },
            vehicle: { driverId: 'driver-1', status: 'reviewing' },
          },
        ],
      }),
    } as unknown as DriverCertificationService;
    const controller = new AdminDriverCertificationController(service);

    await expect(
      controller.batchReviewCertifications(createRequest('admin-1', 'admin'), {
        driverIds: [' driver-2 ', 'driver-1'],
        certificationType: 'identity',
        status: 'approved',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        certificationType: 'identity',
        updatedCount: 2,
        driverIds: ['driver-2', 'driver-1'],
      },
    });
    expect(service.batchReviewCertifications).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin-1', userType: 'admin' }),
      {
        driverIds: ['driver-2', 'driver-1'],
        certificationType: 'identity',
        status: 'approved',
      },
    );
  });

  it('rejects non-admin certification list access before parsing query data', async () => {
    const service = {
      listCertifications: jest.fn(),
    } as unknown as DriverCertificationService;
    const controller = new AdminDriverCertificationController(service);

    await expect(
      controller.listCertifications(createRequest('driver-1'), {
        status: 'broken',
      }),
    ).rejects.toMatchObject({
      code: ApiErrorCode.AUTH_FORBIDDEN,
      message: '当前账号不是管理员',
    });
    expect(service.listCertifications).not.toHaveBeenCalled();
  });

  it('lists driver certifications as admin', async () => {
    const service = {
      listCertifications: jest.fn().mockResolvedValue({
        items: [
          {
            driver: { id: 'driver-1', phone: '13900139009' },
            identity: { driverId: 'driver-1', status: 'reviewing' },
            vehicle: { driverId: 'driver-1', status: 'unsubmitted' },
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    } as unknown as DriverCertificationService;
    const controller = new AdminDriverCertificationController(service);

    await expect(
      controller.listCertifications(createRequest('admin-1', 'admin'), {
        status: 'reviewing',
        page: '1',
        pageSize: '20',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        items: [
          {
            driver: { id: 'driver-1', phone: '13900139009' },
            identity: { driverId: 'driver-1', status: 'reviewing' },
          },
        ],
        total: 1,
      },
    });
    expect(service.listCertifications).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin-1', userType: 'admin' }),
      { status: 'reviewing', page: 1, pageSize: 20 },
    );
  });

  it('reviews driver vehicle certification as admin', async () => {
    const service = {
      reviewVehicle: jest.fn().mockResolvedValue({
        driver: { id: 'driver-1', phone: '13900139009' },
        identity: { driverId: 'driver-1', status: 'approved' },
        vehicle: {
          driverId: 'driver-1',
          status: 'rejected',
          rejectionReason: '车辆照片不清晰',
        },
      }),
    } as unknown as DriverCertificationService;
    const controller = new AdminDriverCertificationController(service);

    await expect(
      controller.reviewVehicle(createRequest('admin-1', 'admin'), 'driver-1', {
        status: 'rejected',
        rejectionReason: '车辆照片不清晰',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        vehicle: {
          driverId: 'driver-1',
          status: 'rejected',
          rejectionReason: '车辆照片不清晰',
        },
      },
    });
    expect(service.reviewVehicle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin-1', userType: 'admin' }),
      'driver-1',
      { status: 'rejected', rejectionReason: '车辆照片不清晰' },
    );
  });

  it('lists driver certification review events as admin', async () => {
    const service = {
      listReviewEvents: jest.fn().mockResolvedValue([
        {
          id: 'event-1',
          driverId: 'driver-1',
          reviewerAdminId: 'admin-1',
          certificationType: 'identity',
          fromStatus: 'reviewing',
          toStatus: 'approved',
          createdAtIso: '2026-07-06T08:00:00.000Z',
        },
      ]),
    } as unknown as DriverCertificationService;
    const controller = new AdminDriverCertificationController(service);

    await expect(
      controller.listReviewEvents(
        createRequest('admin-1', 'admin'),
        'driver-1',
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: [
        {
          driverId: 'driver-1',
          certificationType: 'identity',
          toStatus: 'approved',
        },
      ],
    });
    expect(service.listReviewEvents).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin-1', userType: 'admin' }),
      'driver-1',
    );
  });

  it('gets driver certification attachment previews as admin', async () => {
    const service = {
      getAttachmentPreviews: jest.fn().mockResolvedValue({
        driverId: 'driver-1',
        identity: {
          identityFront: {
            id: 'file-front',
            attachmentType: 'identityFront',
            publicUrl: 'https://cdn.example.com/front.png',
            status: 'uploaded',
          },
        },
        vehicle: {},
      }),
    } as unknown as DriverCertificationService;
    const controller = new AdminDriverCertificationController(service);

    await expect(
      controller.getAttachmentPreviews(
        createRequest('admin-1', 'admin'),
        'driver-1',
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        driverId: 'driver-1',
        identity: {
          identityFront: {
            id: 'file-front',
            attachmentType: 'identityFront',
            status: 'uploaded',
          },
        },
      },
    });
    expect(service.getAttachmentPreviews).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin-1', userType: 'admin' }),
      'driver-1',
    );
  });
});

function createRequest(
  userId: string,
  userType: 'shipper' | 'driver' | 'admin' = 'driver',
): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'req_driver_certification_test' },
    currentUser: { id: userId, phone: '13900139009', userType },
  };
}
