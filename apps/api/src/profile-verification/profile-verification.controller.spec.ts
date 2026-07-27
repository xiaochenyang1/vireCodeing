import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { ApiErrorCode, BusinessError } from '../common/errors';
import {
  AdminShipperVerificationController,
  ProfileVerificationController,
} from './profile-verification.controller';
import type { ProfileVerificationService } from './profile-verification.service';

describe('ProfileVerificationController', () => {
  it('gets the current shipper identity verification snapshot', async () => {
    const service = {
      getIdentity: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        realName: '张先生',
        idNumber: '44030019900101123X',
        identityFrontFileId: 'file-front',
        identityBackFileId: 'file-back',
        faceVerified: true,
        status: 'reviewing',
        createdAtIso: '2026-07-09T08:00:00.000Z',
        updatedAtIso: '2026-07-09T08:05:00.000Z',
      }),
    } as unknown as ProfileVerificationService;
    const controller = new ProfileVerificationController(service);

    await expect(controller.getIdentity(createRequest('shipper-1'))).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: expect.objectContaining({
          shipperId: 'shipper-1',
          realName: '张先生',
          status: 'reviewing',
        }),
        requestId: 'req_profile_verification_test',
      }),
    );
    expect(service.getIdentity).toHaveBeenCalledWith('shipper-1');
  });

  it('returns null data when the current shipper has no saved enterprise verification snapshot', async () => {
    const service = {
      getEnterprise: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProfileVerificationService;
    const controller = new ProfileVerificationController(service);

    await expect(
      controller.getEnterprise(createRequest('shipper-1')),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: null,
        requestId: 'req_profile_verification_test',
      }),
    );
    expect(service.getEnterprise).toHaveBeenCalledWith('shipper-1');
  });

  it('saves the current shipper identity verification snapshot', async () => {
    const service = {
      saveIdentity: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        realName: '张先生',
        idNumber: '44030019900101123X',
        identityFrontFileId: 'file-front',
        identityBackFileId: 'file-back',
        faceVerified: true,
        status: 'reviewing',
        createdAtIso: '2026-07-09T08:00:00.000Z',
        updatedAtIso: '2026-07-09T08:05:00.000Z',
      }),
    } as unknown as ProfileVerificationService;
    const controller = new ProfileVerificationController(service);
    const body = {
      realName: '张先生',
      idNumber: '44030019900101123X',
      identityFrontFileId: 'file-front',
      identityBackFileId: 'file-back',
      faceVerified: true as const,
    };

    await expect(
      controller.saveIdentity(createRequest('shipper-1'), body),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: expect.objectContaining({
          shipperId: 'shipper-1',
          realName: '张先生',
          identityFrontFileId: 'file-front',
        }),
        requestId: 'req_profile_verification_test',
      }),
    );
    expect(service.saveIdentity).toHaveBeenCalledWith('shipper-1', body);
  });

  it('saves the current shipper enterprise verification snapshot', async () => {
    const service = {
      saveEnterprise: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        enterpriseName: '深圳晨星贸易有限公司',
        creditCode: '91440300MA5TEST001',
        legalName: '张先生',
        legalId: '44030019900101123X',
        enterprisePhone: '13900139088',
        licenseFileId: 'file-license',
        status: 'reviewing',
        createdAtIso: '2026-07-09T08:00:00.000Z',
        updatedAtIso: '2026-07-09T08:05:00.000Z',
      }),
    } as unknown as ProfileVerificationService;
    const controller = new ProfileVerificationController(service);
    const body = {
      enterpriseName: '深圳晨星贸易有限公司',
      creditCode: '91440300MA5TEST001',
      legalName: '张先生',
      legalId: '44030019900101123X',
      enterprisePhone: '13900139088',
      licenseFileId: 'file-license',
    };

    await expect(
      controller.saveEnterprise(createRequest('shipper-1'), body),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: expect.objectContaining({
          shipperId: 'shipper-1',
          enterpriseName: '深圳晨星贸易有限公司',
          licenseFileId: 'file-license',
        }),
        requestId: 'req_profile_verification_test',
      }),
    );
    expect(service.saveEnterprise).toHaveBeenCalledWith('shipper-1', body);
  });

  it('rejects non-shipper users before reading verification data', async () => {
    const service = {
      getIdentity: jest.fn(),
    } as unknown as ProfileVerificationService;
    const controller = new ProfileVerificationController(service);

    await expect(
      controller.getIdentity(createRequest('driver-1', 'driver')),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是货主'),
    );
    expect(service.getIdentity).not.toHaveBeenCalled();
  });
});

describe('AdminShipperVerificationController', () => {
  it('gets one shipper verification snapshot for the current admin', async () => {
    const service = {
      getAdminVerification: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        identity: {
          shipperId: 'shipper-1',
          realName: '张先生',
          status: 'reviewing',
        },
        enterprise: {
          shipperId: 'shipper-1',
          enterpriseName: '深圳晨星贸易有限公司',
          status: 'approved',
        },
      }),
    } as unknown as ProfileVerificationService;
    const controller = new AdminShipperVerificationController(service);

    await expect(
      controller.getVerification(
        createRequest('admin-1', 'admin'),
        'shipper-1',
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        shipperId: 'shipper-1',
        identity: { status: 'reviewing' },
        enterprise: { status: 'approved' },
      },
    });
    expect(service.getAdminVerification).toHaveBeenCalledWith(
      { id: 'admin-1', phone: '13900139001', userType: 'admin' },
      'shipper-1',
    );
  });

  it('rejects non-admin shipper verification detail access before service calls', async () => {
    const service = {
      getAdminVerification: jest.fn(),
    } as unknown as ProfileVerificationService;
    const controller = new AdminShipperVerificationController(service);

    await expect(
      controller.getVerification(
        createRequest('shipper-1', 'shipper'),
        'shipper-1',
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
    expect(service.getAdminVerification).not.toHaveBeenCalled();
  });

  it('gets verification attachment previews for the current admin', async () => {
    const service = {
      getAttachmentPreviews: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        identity: {
          identityFront: {
            id: 'file-front',
            attachmentType: 'identityFront',
            status: 'uploaded',
            previewUrl: 'https://preview.example.com/file-front',
          },
        },
        enterprise: {},
      }),
    } as unknown as ProfileVerificationService;
    const controller = new AdminShipperVerificationController(service);

    await expect(
      controller.getAttachmentPreviews(
        createRequest('admin-1', 'admin'),
        'shipper-1',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: expect.objectContaining({
          shipperId: 'shipper-1',
          identity: expect.objectContaining({
            identityFront: expect.objectContaining({
              id: 'file-front',
              attachmentType: 'identityFront',
              status: 'uploaded',
            }),
          }),
        }),
        requestId: 'req_profile_verification_test',
      }),
    );
    expect(service.getAttachmentPreviews).toHaveBeenCalledWith(
      { id: 'admin-1', phone: '13900139001', userType: 'admin' },
      'shipper-1',
    );
  });

  it('lists verification review events for the current admin', async () => {
    const service = {
      listReviewEvents: jest.fn().mockResolvedValue([
        {
          eventId: 'shipper-1:enterprise:approved',
          verificationType: 'enterprise',
          eventType: 'shipper_enterprise_verification_approved',
          stage: 'approved',
          noteText: '企业认证已通过',
          createdAtIso: '2026-07-24T08:30:00.000Z',
        },
        {
          eventId: 'shipper-1:enterprise:submitted',
          verificationType: 'enterprise',
          actorUserId: 'shipper-1',
          eventType: 'shipper_enterprise_verification_submitted',
          stage: 'submitted',
          noteText: '提交企业认证：深圳晨星贸易有限公司 · 91440300MA5TEST001',
          createdAtIso: '2026-07-24T08:00:00.000Z',
        },
      ]),
    } as unknown as ProfileVerificationService;
    const controller = new AdminShipperVerificationController(service);

    await expect(
      controller.listReviewEvents(createRequest('admin-1', 'admin'), 'shipper-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: expect.arrayContaining([
          expect.objectContaining({
            verificationType: 'enterprise',
            stage: 'approved',
          }),
        ]),
        requestId: 'req_profile_verification_test',
      }),
    );
    expect(service.listReviewEvents).toHaveBeenCalledWith(
      { id: 'admin-1', phone: '13900139001', userType: 'admin' },
      'shipper-1',
    );
  });
});

function createRequest(
  userId: string,
  userType: 'shipper' | 'driver' | 'admin' = 'shipper',
): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'req_profile_verification_test' },
    currentUser: { id: userId, phone: '13900139001', userType },
  };
}
