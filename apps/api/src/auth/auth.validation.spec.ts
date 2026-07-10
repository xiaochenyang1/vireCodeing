import { ApiErrorCode, BusinessError } from '../common/errors';
import {
  parseChangePasswordRequest,
  parseLoginRequest,
  parseLogoutRequest,
  parsePasswordLoginRequest,
  parseRefreshRequest,
  parseRegisterRequest,
  parseResetPasswordRequest,
  parseSendCodeRequest,
} from './auth.validation';

describe('auth request validation', () => {
  const validRefreshToken = 'refresh.550e8400-e29b-41d4-a716-446655440000';

  it('parses a valid send code request', () => {
    expect(
      parseSendCodeRequest({
        phone: '13800138000',
        purpose: 'login',
      }),
    ).toEqual({
      phone: '13800138000',
      purpose: 'login',
    });
  });

  it('rejects invalid send code phone numbers', () => {
    expect(() =>
      parseSendCodeRequest({
        phone: '123',
        purpose: 'login',
      }),
    ).toThrow(
      new BusinessError(ApiErrorCode.VALIDATION_ERROR, '手机号格式不正确'),
    );
  });

  it('parses a valid login request', () => {
    expect(
      parseLoginRequest({
        phone: '13800138000',
        code: '123456',
        userType: 'shipper',
        deviceId: 'device-1',
      }),
    ).toEqual({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-1',
    });
  });

  it('parses a valid register request', () => {
    expect(
      parseRegisterRequest({
        phone: '13800138000',
        code: '123456',
        userType: 'shipper',
        deviceId: 'device-1',
        password: 'abc123',
      }),
    ).toEqual({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-1',
      password: 'abc123',
    });
  });

  it('parses a valid password login request', () => {
    expect(
      parsePasswordLoginRequest({
        phone: '13800138000',
        password: 'abc123',
        userType: 'shipper',
        deviceId: 'device-1',
      }),
    ).toEqual({
      phone: '13800138000',
      password: 'abc123',
      userType: 'shipper',
      deviceId: 'device-1',
    });
  });

  it('rejects weak password login passwords', () => {
    expect(() =>
      parsePasswordLoginRequest({
        phone: '13800138000',
        password: '123456',
        userType: 'shipper',
        deviceId: 'device-1',
      }),
    ).toThrow(
      new BusinessError(
        ApiErrorCode.VALIDATION_ERROR,
        '密码需至少 6 位并包含字母和数字',
      ),
    );
  });

  it('rejects weak register passwords', () => {
    expect(() =>
      parseRegisterRequest({
        phone: '13800138000',
        code: '123456',
        userType: 'shipper',
        deviceId: 'device-1',
        password: '123456',
      }),
    ).toThrow(
      new BusinessError(
        ApiErrorCode.VALIDATION_ERROR,
        '密码需至少 6 位并包含字母和数字',
      ),
    );
  });

  it('parses a valid reset password request', () => {
    expect(
      parseResetPasswordRequest({
        phone: '13800138000',
        code: '123456',
        password: 'newabc123',
      }),
    ).toEqual({
      phone: '13800138000',
      code: '123456',
      password: 'newabc123',
    });
  });

  it('rejects weak reset passwords', () => {
    expect(() =>
      parseResetPasswordRequest({
        phone: '13800138000',
        code: '123456',
        password: '123456',
      }),
    ).toThrow(
      new BusinessError(
        ApiErrorCode.VALIDATION_ERROR,
        '密码需至少 6 位并包含字母和数字',
      ),
    );
  });

  it('parses a valid change password request', () => {
    expect(
      parseChangePasswordRequest({
        currentPassword: 'abc123',
        newPassword: 'newabc123',
      }),
    ).toEqual({
      currentPassword: 'abc123',
      newPassword: 'newabc123',
    });
  });

  it('rejects weak new passwords when changing password', () => {
    expect(() =>
      parseChangePasswordRequest({
        currentPassword: 'abc123',
        newPassword: '123456',
      }),
    ).toThrow(
      new BusinessError(
        ApiErrorCode.VALIDATION_ERROR,
        '密码需至少 6 位并包含字母和数字',
      ),
    );
  });

  it('rejects invalid login codes', () => {
    expect(() =>
      parseLoginRequest({
        phone: '13800138000',
        code: '12',
        userType: 'shipper',
        deviceId: 'device-1',
      }),
    ).toThrow(
      new BusinessError(ApiErrorCode.VALIDATION_ERROR, '验证码必须是 6 位数字'),
    );
  });

  it('rejects invalid mobile user types', () => {
    expect(() =>
      parseLoginRequest({
        phone: '13800138000',
        code: '123456',
        userType: 'admin',
        deviceId: 'device-1',
      }),
    ).toThrow(
      new BusinessError(ApiErrorCode.VALIDATION_ERROR, '用户类型不支持'),
    );
  });

  it('rejects missing device ids', () => {
    expect(() =>
      parseRefreshRequest({
        refreshToken: validRefreshToken,
        deviceId: '',
      }),
    ).toThrow(
      new BusinessError(ApiErrorCode.VALIDATION_ERROR, '设备标识不能为空'),
    );
  });

  it('parses refresh and logout requests', () => {
    const request = {
      refreshToken: validRefreshToken,
      deviceId: 'device-1',
    };

    expect(parseRefreshRequest(request)).toEqual(request);
    expect(parseLogoutRequest(request)).toEqual(request);
  });

  it('rejects legacy refresh tokens that expose user and ttl details', () => {
    expect(() =>
      parseRefreshRequest({
        refreshToken: 'refresh.local-user-13800138000.604800',
        deviceId: 'device-1',
      }),
    ).toThrow(
      new BusinessError(ApiErrorCode.VALIDATION_ERROR, '刷新令牌格式不正确'),
    );
  });

  it('rejects malformed refresh tokens', () => {
    for (const refreshToken of [
      'access.550e8400-e29b-41d4-a716-446655440000',
      'refresh.',
      'refresh.local-user-13800138000',
    ]) {
      expect(() =>
        parseRefreshRequest({
          refreshToken,
          deviceId: 'device-1',
        }),
      ).toThrow(
        new BusinessError(ApiErrorCode.VALIDATION_ERROR, '刷新令牌格式不正确'),
      );
    }
  });
});
