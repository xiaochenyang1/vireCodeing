import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ProfileAccountController } from './profile-account.controller';
import type { ProfileAccountService } from './profile-account.service';

describe('ProfileAccountController', () => {
  it('gets the current shipper profile account snapshot', async () => {
    const service = {
      getAccount: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        displayName: '晨星货主',
        phone: '13900139001',
        phoneProtectionEnabled: true,
        loginProtectionEnabled: true,
        orderNotificationEnabled: true,
        promotionNotificationEnabled: false,
        privacyConfirmedAtIso: '2026-07-22T08:30:00.000Z',
        privacyPolicyVersion: 'privacy-policy-v2026-07-22',
        privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
        avatarFileId: 'file-avatar-1',
        avatarPublicUrl: 'https://cdn.example.com/avatar-1.png',
      }),
    } as unknown as ProfileAccountService;
    const controller = new ProfileAccountController(service);

    await expect(controller.getAccount(createRequest('shipper-1'))).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: {
          shipperId: 'shipper-1',
          displayName: '晨星货主',
          phone: '13900139001',
          phoneProtectionEnabled: true,
          loginProtectionEnabled: true,
          orderNotificationEnabled: true,
          promotionNotificationEnabled: false,
          privacyConfirmedAtIso: '2026-07-22T08:30:00.000Z',
          privacyPolicyVersion: 'privacy-policy-v2026-07-22',
          privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
          avatarFileId: 'file-avatar-1',
          avatarPublicUrl: 'https://cdn.example.com/avatar-1.png',
        },
        requestId: 'req_profile_account_test',
      }),
    );
    expect(service.getAccount).toHaveBeenCalledWith('shipper-1', '13900139001');
  });

  it('returns null data when the current shipper has no saved account snapshot', async () => {
    const service = {
      getAccount: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProfileAccountService;
    const controller = new ProfileAccountController(service);

    await expect(controller.getAccount(createRequest('shipper-1'))).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: null,
        requestId: 'req_profile_account_test',
      }),
    );
    expect(service.getAccount).toHaveBeenCalledWith('shipper-1', '13900139001');
  });

  it('saves the current shipper profile account snapshot', async () => {
    const service = {
      saveAccount: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        displayName: '晨星货主',
        phone: '13900139999',
        phoneProtectionEnabled: true,
        loginProtectionEnabled: false,
        orderNotificationEnabled: true,
        promotionNotificationEnabled: true,
        privacyConfirmedAtIso: '2026-07-22T08:30:00.000Z',
        privacyPolicyVersion: 'privacy-policy-v2026-07-22',
        privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
        avatarFileId: 'file-avatar-1',
        avatarPublicUrl: 'https://cdn.example.com/avatar-1.png',
      }),
    } as unknown as ProfileAccountService;
    const controller = new ProfileAccountController(service);
    const body = {
      displayName: '晨星货主',
      avatarFileId: 'file-avatar-1',
      phone: '13900139999',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: false,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: true,
      privacyConfirmedAtIso: '2026-07-22T08:30:00.000Z',
      privacyPolicyVersion: 'privacy-policy-v2026-07-22',
      privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
    };

    await expect(
      controller.saveAccount(createRequest('shipper-1'), body),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: {
          shipperId: 'shipper-1',
          displayName: '晨星货主',
          phone: '13900139999',
          phoneProtectionEnabled: true,
          loginProtectionEnabled: false,
          orderNotificationEnabled: true,
          promotionNotificationEnabled: true,
          privacyConfirmedAtIso: '2026-07-22T08:30:00.000Z',
          privacyPolicyVersion: 'privacy-policy-v2026-07-22',
          privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
          avatarFileId: 'file-avatar-1',
          avatarPublicUrl: 'https://cdn.example.com/avatar-1.png',
        },
        requestId: 'req_profile_account_test',
      }),
    );
    expect(service.saveAccount).toHaveBeenCalledWith(
      'shipper-1',
      '13900139001',
      body,
    );
  });

  it('rejects non-shipper users before reading account data', async () => {
    const service = {
      getAccount: jest.fn(),
    } as unknown as ProfileAccountService;
    const controller = new ProfileAccountController(service);

    await expect(
      controller.getAccount(createRequest('driver-1', 'driver')),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是货主'),
    );
    expect(service.getAccount).not.toHaveBeenCalled();
  });
});

function createRequest(
  userId: string,
  userType: 'shipper' | 'driver' | 'admin' = 'shipper',
): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'req_profile_account_test' },
    currentUser: { id: userId, phone: '13900139001', userType },
  };
}
