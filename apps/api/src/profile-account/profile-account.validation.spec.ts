import { ZodError } from 'zod';
import { parseSaveShipperProfileAccountRequest } from './profile-account.validation';

describe('profile account validation', () => {
  it('parses a shipper account request', () => {
    expect(
      parseSaveShipperProfileAccountRequest({
        displayName: ' 晨星货主 ',
        avatarFileId: ' file-avatar-1 ',
        phone: ' 13900139999 ',
        phoneProtectionEnabled: true,
        loginProtectionEnabled: false,
        orderNotificationEnabled: true,
        promotionNotificationEnabled: false,
        privacyConfirmedAtIso: ' 2026-07-22T08:30:00.000Z ',
        privacyPolicyVersion: ' privacy-policy-v2026-07-22 ',
        privacyPolicyVersionTitle: ' 隐私政策 v2026.07.22 ',
      }),
    ).toEqual({
      displayName: '晨星货主',
      avatarFileId: 'file-avatar-1',
      phone: '13900139999',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: false,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
      privacyConfirmedAtIso: '2026-07-22T08:30:00.000Z',
      privacyPolicyVersion: 'privacy-policy-v2026-07-22',
      privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
    });
  });

  it('rejects an empty shipper display name', () => {
    expect(() =>
      parseSaveShipperProfileAccountRequest({
        displayName: '   ',
      }),
    ).toThrow('昵称不能为空');
  });

  it('rejects a too long shipper display name', () => {
    expect(() =>
      parseSaveShipperProfileAccountRequest({
        displayName: '晨'.repeat(31),
      }),
    ).toThrow(ZodError);
  });

  it('rejects an invalid avatar file id', () => {
    expect(() =>
      parseSaveShipperProfileAccountRequest({
        displayName: '晨星货主',
        avatarFileId: ' ',
      }),
    ).toThrow(ZodError);
  });

  it('accepts null avatar file id when clearing the current avatar snapshot', () => {
    expect(
      parseSaveShipperProfileAccountRequest({
        displayName: '晨星货主',
        avatarFileId: null,
      }),
    ).toEqual({
      displayName: '晨星货主',
      avatarFileId: null,
    });
  });

  it('rejects invalid settings snapshot fields', () => {
    expect(() =>
      parseSaveShipperProfileAccountRequest({
        displayName: '晨星货主',
        phone: '12345',
      }),
    ).toThrow(ZodError);
    expect(() =>
      parseSaveShipperProfileAccountRequest({
        displayName: '晨星货主',
        phoneProtectionEnabled: 'true',
      }),
    ).toThrow(ZodError);
    expect(() =>
      parseSaveShipperProfileAccountRequest({
        displayName: '晨星货主',
        privacyConfirmedAtIso: 'not-a-date',
      }),
    ).toThrow(ZodError);
    expect(() =>
      parseSaveShipperProfileAccountRequest({
        displayName: '晨星货主',
        privacyPolicyVersion: 'privacy-policy-v2026-07-22',
      }),
    ).toThrow(ZodError);
    expect(() =>
      parseSaveShipperProfileAccountRequest({
        displayName: '晨星货主',
        privacyPolicyVersion: 'privacy-policy-v2026-07-22',
        privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
      }),
    ).toThrow(ZodError);
  });
});
