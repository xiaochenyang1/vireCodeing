import { ApiErrorCode, BusinessError } from '../common/errors';
import {
  parseAdminAuthAccountId,
  parseAdminAuthAccountListQuery,
  parseAdminAuthAccountReportQuery,
  parseAdminAuthSessionId,
  parseAdminAuthSessionGovernanceAuditListQuery,
  parseAdminAuthSessionListQuery,
  parseAdminPasswordLoginRequest,
  parseChangePasswordRequest,
  parseLoginRequest,
  parseLogoutRequest,
  parsePasswordLoginRequest,
  parseRefreshRequest,
  parseRevokeAdminAuthAccountSessionsRequest,
  parseRegisterRequest,
  parseRevokeOtherAdminSessionsRequest,
  parseResetPasswordRequest,
  parseSendCodeRequest,
  parseUpdateAdminAuthAccountStatusRequest,
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

  it('parses a valid admin password login request', () => {
    expect(
      parseAdminPasswordLoginRequest({
        phone: '13900139000',
        password: 'Admin123',
        deviceId: 'admin-console-device',
      }),
    ).toEqual({
      phone: '13900139000',
      password: 'Admin123',
      deviceId: 'admin-console-device',
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

  it('parses a valid admin auth session id param', () => {
    expect(
      parseAdminAuthSessionId('550e8400-e29b-41d4-a716-446655440000'),
    ).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rejects malformed admin auth session ids', () => {
    expect(() => parseAdminAuthSessionId('bad-session-id')).toThrow(
      new BusinessError(
        ApiErrorCode.VALIDATION_ERROR,
        '会话标识格式不正确',
      ),
    );
  });

  it('parses a valid revoke-other-admin-sessions request', () => {
    expect(
      parseRevokeOtherAdminSessionsRequest({
        currentDeviceId: 'admin-console-device',
      }),
    ).toEqual({
      currentDeviceId: 'admin-console-device',
    });
  });

  it('parses a valid admin auth session list query', () => {
    expect(
      parseAdminAuthSessionListQuery({
        scope: 'all',
        userType: 'driver',
        keyword: '1390',
        riskOnly: 'true',
        riskTag: 'shared_device',
        page: '2',
        pageSize: '10',
      }),
    ).toEqual({
      scope: 'all',
      userType: 'driver',
      keyword: '1390',
      riskOnly: true,
      riskTag: 'shared_device',
      page: 2,
      pageSize: 10,
    });
  });

  it('defaults admin auth session list query to current admin scope', () => {
    expect(parseAdminAuthSessionListQuery({})).toEqual({
      scope: 'current_admin',
      page: 1,
      pageSize: 20,
    });
  });

  it('rejects invalid admin auth session list query values', () => {
    expect(() =>
      parseAdminAuthSessionListQuery({
        scope: 'all',
        page: '0',
      }),
    ).toThrow(
      new BusinessError(ApiErrorCode.VALIDATION_ERROR, '页码必须至少为 1'),
    );
    expect(() =>
      parseAdminAuthSessionListQuery({
        pageSize: '51',
      }),
    ).toThrow(
      new BusinessError(
        ApiErrorCode.VALIDATION_ERROR,
        '每页数量必须在 1 到 50 之间',
      ),
    );
    expect(() =>
      parseAdminAuthSessionListQuery({
        riskOnly: 'maybe',
      }),
    ).toThrow(
      new BusinessError(
        ApiErrorCode.VALIDATION_ERROR,
        '风险筛选开关必须为 true 或 false',
      ),
    );
    expect(() =>
      parseAdminAuthSessionListQuery({
        riskTag: 'bad-tag',
      }),
    ).toThrow(
      new BusinessError(
        ApiErrorCode.VALIDATION_ERROR,
        '会话风险标签不支持',
      ),
    );
  });

  it('parses a valid admin auth session governance audit list query', () => {
    expect(
      parseAdminAuthSessionGovernanceAuditListQuery({
        action: 'revoke_other_sessions',
        result: 'revoked',
        keyword: 'admin-console-device',
        page: '2',
        pageSize: '10',
      }),
    ).toEqual({
      action: 'revoke_other_sessions',
      result: 'revoked',
      keyword: 'admin-console-device',
      page: 2,
      pageSize: 10,
    });
  });

  it('defaults admin auth session governance audit list query', () => {
    expect(parseAdminAuthSessionGovernanceAuditListQuery({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it('rejects invalid admin auth session governance audit list query values', () => {
    expect(() =>
      parseAdminAuthSessionGovernanceAuditListQuery({
        action: 'bad-action',
      }),
    ).toThrow(
      new BusinessError(
        ApiErrorCode.VALIDATION_ERROR,
        '会话治理审计动作不支持',
      ),
    );
    expect(() =>
      parseAdminAuthSessionGovernanceAuditListQuery({
        result: 'bad-result',
      }),
    ).toThrow(
      new BusinessError(
        ApiErrorCode.VALIDATION_ERROR,
        '会话治理审计结果不支持',
      ),
    );
  });

  it('parses a valid admin auth account id param', () => {
    expect(parseAdminAuthAccountId('driver-1')).toBe('driver-1');
  });

  it('parses a valid admin auth account list query', () => {
    expect(
      parseAdminAuthAccountListQuery({
        userType: 'driver',
        status: 'active',
        keyword: 'shared-device',
        riskOnly: 'true',
        riskTag: 'shared_device',
        riskLevel: 'high',
        page: '2',
        pageSize: '10',
      }),
    ).toEqual({
      userType: 'driver',
      status: 'active',
      keyword: 'shared-device',
      riskOnly: true,
      riskTag: 'shared_device',
      riskLevel: 'high',
      page: 2,
      pageSize: 10,
    });
  });

  it('defaults admin auth account list query', () => {
    expect(parseAdminAuthAccountListQuery({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it('parses a valid admin auth account report query', () => {
    expect(
      parseAdminAuthAccountReportQuery({
        userType: 'driver',
        riskOnly: 'true',
        riskTag: 'shared_device',
        topAccountsLimit: '3',
        auditEventLimit: '5',
      }),
    ).toEqual({
      userType: 'driver',
      riskOnly: true,
      riskTag: 'shared_device',
      topAccountsLimit: 3,
      auditEventLimit: 5,
    });
  });

  it('defaults admin auth account report query', () => {
    expect(parseAdminAuthAccountReportQuery({})).toEqual({
      topAccountsLimit: 5,
      auditEventLimit: 10,
    });
  });

  it('rejects invalid admin auth account list query values', () => {
    expect(() =>
      parseAdminAuthAccountListQuery({
        status: 'locked',
      }),
    ).toThrow(
      new BusinessError(ApiErrorCode.VALIDATION_ERROR, '账号状态不支持'),
    );
    expect(() =>
      parseAdminAuthAccountListQuery({
        riskLevel: 'critical',
      }),
    ).toThrow(
      new BusinessError(ApiErrorCode.VALIDATION_ERROR, '账号风险等级不支持'),
    );
  });

  it('rejects invalid admin auth account report query values', () => {
    expect(() =>
      parseAdminAuthAccountReportQuery({
        topAccountsLimit: '0',
      }),
    ).toThrow(
      new BusinessError(
        ApiErrorCode.VALIDATION_ERROR,
        'Top 风险账号数量必须在 1 到 20 之间',
      ),
    );
    expect(() =>
      parseAdminAuthAccountReportQuery({
        auditEventLimit: '21',
      }),
    ).toThrow(
      new BusinessError(
        ApiErrorCode.VALIDATION_ERROR,
        '审计事件数量必须在 1 到 20 之间',
      ),
    );
  });

  it('parses a valid admin auth account status update request', () => {
    expect(
      parseUpdateAdminAuthAccountStatusRequest({
        status: 'disabled',
      }),
    ).toEqual({
      status: 'disabled',
    });
  });

  it('parses a valid revoke-admin-auth-account-sessions request', () => {
    expect(
      parseRevokeAdminAuthAccountSessionsRequest({
        keepSessionId: validRefreshToken.replace('refresh.', ''),
      }),
    ).toEqual({
      keepSessionId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('rejects invalid admin auth account status update requests', () => {
    expect(() =>
      parseUpdateAdminAuthAccountStatusRequest({
        status: 'locked',
      }),
    ).toThrow(
      new BusinessError(ApiErrorCode.VALIDATION_ERROR, '账号状态不支持'),
    );
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
