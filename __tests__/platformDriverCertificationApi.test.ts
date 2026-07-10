import { PlatformApiError } from '../src/services/platformApiClient';
import { createPlatformDriverCertificationApi } from '../src/services/platformDriverCertificationApi';

describe('platform driver certification api', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('gets driver certification snapshot with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        identity: { driverId: 'driver-1', status: 'unsubmitted' },
        vehicle: { driverId: 'driver-1', status: 'unsubmitted' },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverCertificationApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getCertification()).resolves.toMatchObject({
      identity: { status: 'unsubmitted' },
      vehicle: { status: 'unsubmitted' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/driver/certification',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('submits normalized identity certification request', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        identity: { driverId: 'driver-1', status: 'reviewing' },
        vehicle: { driverId: 'driver-1', status: 'unsubmitted' },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverCertificationApi({
      baseUrl: 'http://localhost:3000/api/',
      getAccessToken: () => 'access-token',
    });

    await api.submitIdentity({
      realName: ' 张三 ',
      identityNumber: ' 11010119900307123x ',
      identityFrontFileId: ' file-front ',
      identityBackFileId: ' file-back ',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/driver/certification/identity',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          realName: '张三',
          identityNumber: '11010119900307123X',
          identityFrontFileId: 'file-front',
          identityBackFileId: 'file-back',
        }),
      }),
    );
  });

  it('submits normalized vehicle certification request', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        identity: { driverId: 'driver-1', status: 'unsubmitted' },
        vehicle: { driverId: 'driver-1', status: 'reviewing' },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverCertificationApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.submitVehicle({
      plateNumber: ' 粤B12345 ',
      vehicleType: ' medium ',
      vehicleLengthText: ' 6.8 米 ',
      loadCapacityText: ' 8 吨 ',
      hasTailboard: true,
      drivingLicenseFileId: ' file-vehicle-license ',
      driverLicenseFileId: ' file-driver-license ',
      transportQualificationFileId: ' file-transport-qualification ',
      operationPermitFileId: ' file-operation-permit ',
      vehiclePhotoFileId: ' file-vehicle-photo ',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/driver/certification/vehicle',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
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
      }),
    );
  });

  it('lists admin driver certification review queue with normalized query', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        items: [
          {
            driver: { id: 'driver-1', phone: '13900139009' },
            identity: { driverId: 'driver-1', status: 'reviewing' },
            vehicle: { driverId: 'driver-1', status: 'approved' },
          },
        ],
        page: 2,
        pageSize: 10,
        total: 1,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverCertificationApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'admin-token',
    });

    await expect(
      api.listAdminCertifications({
        status: 'reviewing',
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toMatchObject({
      items: [
        {
          driver: { id: 'driver-1', phone: '13900139009' },
          identity: { status: 'reviewing' },
        },
      ],
      page: 2,
      pageSize: 10,
      total: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/driver-certifications?status=reviewing&page=2&pageSize=10',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer admin-token',
        }),
      }),
    );
  });

  it('reviews driver identity and vehicle certifications as admin', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          driver: { id: 'driver-1' },
          identity: { driverId: 'driver-1', status: 'approved' },
          vehicle: { driverId: 'driver-1', status: 'reviewing' },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          driver: { id: 'driver-1' },
          identity: { driverId: 'driver-1', status: 'approved' },
          vehicle: {
            driverId: 'driver-1',
            status: 'rejected',
            rejectionReason: '照片不清晰',
          },
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverCertificationApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'admin-token',
    });

    await api.reviewAdminIdentity(' driver-1 ', { status: 'approved' });
    await api.reviewAdminVehicle('driver-1', {
      status: 'rejected',
      rejectionReason: ' 照片不清晰 ',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/admin/driver-certifications/driver-1/identity/review',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ status: 'approved' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/admin/driver-certifications/driver-1/vehicle/review',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          status: 'rejected',
          rejectionReason: '照片不清晰',
        }),
      }),
    );
  });

  it('gets admin certification attachment previews and review events', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          driverId: 'driver-1',
          identity: {
            identityFront: {
              id: 'file-front',
              ownerUserId: 'driver-1',
              purpose: 'identity',
              objectKey: 'driver-1/identity/front.png',
              status: 'uploaded',
              attachmentType: 'identityFront',
              previewUrl:
                '/api/files/previews/driver-1/identity/front.png?expiresAtIso=2026-07-06T08%3A10%3A00.000Z&signature=valid',
              previewExpiresAtIso: '2026-07-06T08:10:00.000Z',
              createdAtIso: '2026-07-06T08:00:00.000Z',
            },
          },
          vehicle: {},
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse([
          {
            id: 'event-1',
            driverId: 'driver-1',
            reviewerAdminId: 'admin-1',
            certificationType: 'identity',
            fromStatus: 'reviewing',
            toStatus: 'approved',
            createdAtIso: '2026-07-06T08:05:00.000Z',
          },
        ]),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverCertificationApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'admin-token',
    });

    await expect(
      api.getAdminAttachmentPreviews(' driver-1 '),
    ).resolves.toMatchObject({
      driverId: 'driver-1',
      identity: {
        identityFront: {
          id: 'file-front',
          attachmentType: 'identityFront',
          previewExpiresAtIso: '2026-07-06T08:10:00.000Z',
        },
      },
    });
    await expect(
      api.listAdminReviewEvents('driver-1'),
    ).resolves.toMatchObject([
      {
        id: 'event-1',
        certificationType: 'identity',
        toStatus: 'approved',
      },
    ]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/admin/driver-certifications/driver-1/attachments',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/admin/driver-certifications/driver-1/review-events',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejects invalid certification requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverCertificationApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.submitIdentity({
        realName: '',
        identityNumber: '110101199003071234',
        identityFrontFileId: 'file-front',
        identityBackFileId: 'file-back',
      }),
    ).rejects.toMatchObject(
      new PlatformApiError(
        'Platform driver realName is invalid',
        'PLATFORM_DRIVER_CERTIFICATION_REQUEST_INVALID',
        0,
      ),
    );
    await expect(
      api.listAdminCertifications({
        status: 'unsubmitted' as never,
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_DRIVER_CERTIFICATION_REQUEST_INVALID',
      status: 0,
    });
    await expect(
      api.reviewAdminVehicle('driver-1', {
        status: 'rejected',
        rejectionReason: ' ',
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_DRIVER_CERTIFICATION_REQUEST_INVALID',
      status: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call protected certification endpoints without an access token', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverCertificationApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => undefined,
    });

    await expect(api.getCertification()).rejects.toMatchObject({
      code: 'AUTH_ACCESS_TOKEN_MISSING',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function createJsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      code: 'OK',
      message: 'success',
      data,
      requestId: 'req_driver_certification',
      timestamp: '2026-07-06T08:00:00.000Z',
    }),
  };
}
