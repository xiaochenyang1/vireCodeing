import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ProfileVerificationController } from './profile-verification.controller';
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

function createRequest(
  userId: string,
  userType: 'shipper' | 'driver' | 'admin' = 'shipper',
): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'req_profile_verification_test' },
    currentUser: { id: userId, phone: '13900139001', userType },
  };
}
