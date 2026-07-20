import { readFileSync } from 'fs';
import { join } from 'path';

describe('stage 1 OpenAPI contract', () => {
  const openApiPath = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'docs',
    'platform',
    'openapi-stage-1.yaml',
  );

  it('documents verification code rate limits as HTTP 429 business errors', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain("'429':");
    expect(source).toContain('AUTH_CODE_RATE_LIMITED');
    expect(source).toContain('验证码发送过于频繁');
  });

  it('documents verification code delivery failures as HTTP 502 business errors', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain("'502':");
    expect(source).toContain('AUTH_CODE_DELIVERY_FAILED');
    expect(source).toContain('验证码发送失败');
  });

  it('documents disabled users as HTTP 403 business errors', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain("'403':");
    expect(source).toContain('AUTH_USER_DISABLED');
    expect(source).toContain('账号已禁用');
  });

  it('documents the API server with the Nest global api prefix', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('url: http://localhost:3000/api');
  });

  it('documents opaque refresh token UUID format', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('^refresh\\.');
    expect(source).toContain('550e8400-e29b-41d4-a716-446655440000');
    expect(source).not.toContain('refresh.local-user-13800138000.604800');
  });

  it('documents the current user route as bearer protected', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/me:');
    expect(source).toContain('bearerAuth: []');
    expect(source).toContain('bearerFormat: JWT');
  });

  it('documents success response envelopes for stage 1 auth routes', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('#/components/schemas/SendCodeResponse');
    expect(source).toContain('#/components/schemas/LoginResponse');
    expect(source).toContain('#/components/schemas/PasswordLoginResponse');
    expect(source).toContain('#/components/schemas/RegisterResponse');
    expect(source).toContain('#/components/schemas/RefreshResponse');
    expect(source).toContain('#/components/schemas/LogoutResponse');
    expect(source).toContain('#/components/schemas/ResetPasswordResponse');
    expect(source).toContain('#/components/schemas/ChangePasswordResponse');
    expect(source).toContain('#/components/schemas/MeResponse');
    expect(source).toContain('ApiSuccessEnvelope:');
    expect(source).toContain('TokenPair:');
    expect(source).toContain('AuthenticatedUser:');
  });

  it('documents platform register as a stage 1 auth route', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/auth/register:');
    expect(source).toContain('Register with phone and verification code');
    expect(source).toContain('#/components/schemas/RegisterRequest');
    expect(source).toContain('#/components/schemas/RegisterResponse');
    expect(source).toContain('required: [phone, code, userType, deviceId, password]');
    expect(source).toContain('密码需至少 6 位并包含字母和数字');
  });

  it('documents platform password login as a stage 1 auth route', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/auth/password-login:');
    expect(source).toContain('Login with phone and password');
    expect(source).toContain('#/components/schemas/PasswordLoginRequest');
    expect(source).toContain('#/components/schemas/PasswordLoginResponse');
    expect(source).toContain('required: [phone, password, userType, deviceId]');
    expect(source).toContain('AUTH_PASSWORD_INVALID');
    expect(source).toContain('手机号或密码错误');
  });

  it('documents admin password login as a dedicated back-office auth route', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/auth/admin/password-login:');
    expect(source).toContain('Login admin with phone and password');
    expect(source).toContain('#/components/schemas/AdminPasswordLoginRequest');
    expect(source).toContain('#/components/schemas/PasswordLoginResponse');
    expect(source).toContain('required: [phone, password, deviceId]');
    expect(source).toContain('AUTH_PASSWORD_INVALID');
    expect(source).toContain('手机号或密码错误');
  });

  it('documents admin session governance endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/admin/auth/sessions:');
    expectPathBlockToContain(
      source,
      '/admin/auth/sessions',
      'List admin-managed active sessions',
    );
    expectPathBlockToContain(source, '/admin/auth/sessions', 'bearerAuth: []');
    expectPathBlockToContain(source, '/admin/auth/sessions', 'name: scope');
    expectPathBlockToContain(source, '/admin/auth/sessions', 'name: userType');
    expectPathBlockToContain(source, '/admin/auth/sessions', 'name: keyword');
    expectPathBlockToContain(source, '/admin/auth/sessions', 'name: riskOnly');
    expectPathBlockToContain(source, '/admin/auth/sessions', 'name: riskTag');
    expectPathBlockToContain(source, '/admin/auth/sessions', 'name: page');
    expectPathBlockToContain(source, '/admin/auth/sessions', 'name: pageSize');
    expectPathBlockToContain(
      source,
      '/admin/auth/sessions',
      "$ref: '#/components/schemas/AdminAuthSessionListResponse'",
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/sessions',
      "$ref: '#/components/responses/AdminOnlyError'",
    );

    expect(source).toContain('/admin/auth/sessions/{sessionId}/revoke:');
    expectPathBlockToContain(
      source,
      '/admin/auth/sessions/{sessionId}/revoke',
      'Revoke admin-managed session by id',
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/sessions/{sessionId}/revoke',
      'name: sessionId',
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/sessions/{sessionId}/revoke',
      "$ref: '#/components/schemas/AdminAuthSessionRevokeResponse'",
    );

    expect(source).toContain('/admin/auth/sessions/revoke-other-sessions:');
    expectPathBlockToContain(
      source,
      '/admin/auth/sessions/revoke-other-sessions',
      "$ref: '#/components/schemas/RevokeOtherAdminAuthSessionsRequest'",
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/sessions/revoke-other-sessions',
      "$ref: '#/components/schemas/RevokeOtherAdminAuthSessionsResponse'",
    );

    expect(source).toContain('AdminAuthSessionRecord:');
    expect(source).toContain('AdminAuthSessionListResponse:');
    expect(source).toContain('AdminAuthSessionRevokeResponse:');
    expect(source).toContain('userPhone');
    expect(source).toContain('userType');
    expect(source).toContain('isCurrentUser');
    expect(source).toContain('riskTags');
    expect(source).toContain('riskSummary');
    expect(source).toContain('total');
    expect(source).toContain('AdminAuthSessionRiskTag:');
    expect(source).toContain('AdminAuthSessionRiskLevel:');
    expect(source).toContain('AdminAuthSessionRiskContext:');
    expect(source).toContain('AdminAuthSessionRiskSummary:');
    expectSchemaBlockToContain(source, 'AdminAuthSessionRecord', "example: '139****9000'");
    expectSchemaBlockToContain(source, 'AdminAuthSessionRecord', 'adm**************ice');
    expect(source).toContain('shared_device');
    expect(source).toContain('high_session_volume');
    expect(source).toContain('admin_multi_device');

    expect(source).toContain('/admin/auth/sessions/audit-events:');
    expectPathBlockToContain(
      source,
      '/admin/auth/sessions/audit-events',
      'List admin session governance audit events',
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/sessions/audit-events',
      'name: action',
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/sessions/audit-events',
      'name: result',
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/sessions/audit-events',
      "$ref: '#/components/schemas/AdminAuthSessionGovernanceAuditListResponse'",
    );
    expect(source).toContain('AdminAuthSessionGovernanceAuditRecord:');
    expect(source).toContain('AdminAuthSessionGovernanceAuditSubject:');
    expect(source).toContain('AdminAuthSessionGovernanceAuditAction:');
    expect(source).toContain('AdminAuthSessionGovernanceAuditResult:');
    expectSchemaBlockToContain(
      source,
      'AdminAuthSessionGovernanceAuditSubject',
      "example: '138****8001'",
    );
    expectSchemaBlockToContain(
      source,
      'AdminAuthSessionGovernanceAuditRecord',
      "example: '139****9000'",
    );
    expectSchemaBlockToContain(
      source,
      'AdminAuthSessionGovernanceAuditRecord',
      'adm**************ice',
    );
    expectSchemaBlockToContain(
      source,
      'RevokeOtherAdminAuthSessionsData',
      'adm**************ice',
    );
  });

  it('documents admin auth account management endpoints and schemas', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/admin/auth/accounts:');
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts',
      'List admin-managed platform auth accounts',
    );
    expectPathBlockToContain(source, '/admin/auth/accounts', 'bearerAuth: []');
    expectPathBlockToContain(source, '/admin/auth/accounts', 'name: userType');
    expectPathBlockToContain(source, '/admin/auth/accounts', 'name: status');
    expectPathBlockToContain(source, '/admin/auth/accounts', 'name: keyword');
    expectPathBlockToContain(source, '/admin/auth/accounts', 'name: riskOnly');
    expectPathBlockToContain(source, '/admin/auth/accounts', 'name: riskTag');
    expectPathBlockToContain(source, '/admin/auth/accounts', 'name: riskLevel');
    expectPathBlockToContain(source, '/admin/auth/accounts', 'name: page');
    expectPathBlockToContain(source, '/admin/auth/accounts', 'name: pageSize');
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts',
      "$ref: '#/components/schemas/AdminAuthAccountListResponse'",
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts',
      "$ref: '#/components/responses/AdminOnlyError'",
    );

    expect(source).toContain('/admin/auth/accounts/report:');
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/report',
      'Get admin auth account report',
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/report',
      'name: topAccountsLimit',
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/report',
      'name: auditEventLimit',
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/report',
      "$ref: '#/components/schemas/AdminAuthAccountReportResponse'",
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/report',
      "$ref: '#/components/responses/AdminOnlyError'",
    );

    expect(source).toContain('/admin/auth/accounts/export:');
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/export',
      'Export admin auth accounts as csv',
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/export',
      'text/csv',
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/export',
      'Content-Disposition',
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/export',
      'admin-auth-accounts.csv',
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/export',
      '138****8001',
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/export',
      'sha*******ice|dri**********d-2|dri******b-1',
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/export',
      "$ref: '#/components/responses/AdminOnlyError'",
    );

    expect(source).toContain('/admin/auth/accounts/{userId}:');
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/{userId}',
      'Get admin-managed auth account detail',
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/{userId}',
      'name: userId',
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/{userId}',
      "$ref: '#/components/schemas/AdminAuthAccountDetailResponse'",
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/{userId}',
      'AUTH_ACCOUNT_NOT_FOUND',
    );

    expect(source).toContain('/admin/auth/accounts/{userId}/status:');
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/{userId}/status',
      'Update admin-managed auth account status',
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/{userId}/status',
      "$ref: '#/components/schemas/UpdateAdminAuthAccountStatusRequest'",
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/{userId}/status',
      "$ref: '#/components/schemas/UpdateAdminAuthAccountStatusResponse'",
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/{userId}/status',
      'AUTH_ACCOUNT_NOT_FOUND',
    );

    expect(source).toContain('/admin/auth/accounts/{userId}/revoke-sessions:');
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/{userId}/revoke-sessions',
      'Revoke admin-managed account sessions',
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/{userId}/revoke-sessions',
      "$ref: '#/components/schemas/RevokeAdminAuthAccountSessionsRequest'",
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/{userId}/revoke-sessions',
      "$ref: '#/components/schemas/RevokeAdminAuthAccountSessionsResponse'",
    );
    expectPathBlockToContain(
      source,
      '/admin/auth/accounts/{userId}/revoke-sessions',
      'AUTH_ACCOUNT_NOT_FOUND',
    );

    expect(source).toContain('AdminAuthAccountRecord:');
    expect(source).toContain('AdminAuthAccountFilters:');
    expect(source).toContain('AdminAuthAccountSummary:');
    expect(source).toContain('AdminAuthAccountListResponse:');
    expect(source).toContain('AdminAuthAccountReportStatusBreakdownItem:');
    expect(source).toContain('AdminAuthAccountReportUserTypeBreakdownItem:');
    expect(source).toContain('AdminAuthAccountReportRiskTagBreakdownItem:');
    expect(source).toContain('AdminAuthAccountReportAuditActionBreakdownItem:');
    expect(source).toContain('AdminAuthAccountReportGovernanceAuditSummary:');
    expect(source).toContain('AdminAuthAccountReport:');
    expect(source).toContain('AdminAuthAccountReportResponse:');
    expect(source).toContain('AdminAuthAccountDetail:');
    expect(source).toContain('AdminAuthAccountDetailResponse:');
    expect(source).toContain('UpdateAdminAuthAccountStatusRequest:');
    expect(source).toContain('UpdateAdminAuthAccountStatusResponse:');
    expect(source).toContain('RevokeAdminAuthAccountSessionsRequest:');
    expect(source).toContain('RevokeAdminAuthAccountSessionsResponse:');
    expect(source).toContain('activeSessionCount');
    expect(source).toContain('activeDeviceCount');
    expect(source).toContain('latestSessionCreatedAtIso');
    expectSchemaBlockToContain(source, 'AdminAuthAccountRecord', "example: '138****8001'");
    expect(source).toContain('disabledUserCount');
    expect(source).toContain('highRiskUserCount');
    expect(source).toContain('statusBreakdown');
    expect(source).toContain('userTypeBreakdown');
    expect(source).toContain('riskTagBreakdown');
    expect(source).toContain('topRiskAccounts');
    expect(source).toContain('governanceAuditSummary');
    expect(source).toContain('recentAuditEvents');
    expect(source).toContain('AUTH_ACCOUNT_NOT_FOUND');
    expect(source).toContain('账号不存在');
    expect(source).toContain('revoke_account_sessions');
  });

  it('documents file maintenance batch governance endpoint and schemas', () => {
    const source = readFileSync(openApiPath, 'utf8');
    const path = '/files/maintenance/batch-governance';

    expect(source).toContain(`${path}:`);
    expectPathBlockToContain(source, path, 'Run file maintenance batch governance');
    expectPathBlockToContain(source, path, 'bearerAuth: []');
    expectPathBlockToContain(
      source,
      path,
      "$ref: '#/components/schemas/FileMaintenanceBatchGovernanceRequest'",
    );
    expectPathBlockToContain(
      source,
      path,
      "$ref: '#/components/schemas/FileMaintenanceBatchGovernanceResponse'",
    );
    expectPathBlockToContain(
      source,
      path,
      "$ref: '#/components/responses/AdminOnlyError'",
    );
    expect(source).toContain('FileMaintenanceBatchGovernanceRequest:');
    expect(source).toContain('FileMaintenanceBatchGovernanceResponse:');
    expect(source).toContain('FileMaintenanceBatchGovernanceAction:');
    expect(source).toContain('reject_pending');
    expect(source).toContain('delete_rejected_objects');
    expect(source).toContain('skippedFileIds');
  });

  it('documents file maintenance report endpoint and schemas', () => {
    const source = readFileSync(openApiPath, 'utf8');
    const path = '/files/maintenance/report';

    expect(source).toContain(`${path}:`);
    expectPathBlockToContain(source, path, 'Get file maintenance audit report');
    expectPathBlockToContain(source, path, 'bearerAuth: []');
    expectPathBlockToContain(source, path, 'name: topOwnersLimit');
    expectPathBlockToContain(
      source,
      path,
      "$ref: '#/components/schemas/FileMaintenanceReportResponse'",
    );
    expectPathBlockToContain(
      source,
      path,
      "$ref: '#/components/responses/AdminOnlyError'",
    );
    expect(source).toContain('FileMaintenanceReportResponse:');
    expect(source).toContain('FileMaintenanceReportResult:');
    expect(source).toContain('FileMaintenancePurposeBreakdownItem:');
    expect(source).toContain('FileMaintenanceTopOwnerItem:');
    expect(source).toContain('topOwners');
    expect(source).toContain('purposeBreakdown');
  });

  it('documents platform password reset as a stage 1 auth route', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/auth/reset-password:');
    expect(source).toContain('Reset password with phone and verification code');
    expect(source).toContain('#/components/schemas/ResetPasswordRequest');
    expect(source).toContain('#/components/schemas/ResetPasswordResponse');
    expect(source).toContain('required: [phone, code, password]');
    expect(source).toContain('AUTH_PASSWORD_RESET_INVALID');
    expect(source).toContain('手机号或验证码错误');
  });

  it('documents platform change password as a bearer-protected stage 1 auth route', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/auth/change-password:');
    expect(source).toContain('Change current authenticated user password');
    expect(source).toContain('security:');
    expect(source).toContain('bearerAuth: []');
    expect(source).toContain('#/components/schemas/ChangePasswordRequest');
    expect(source).toContain('#/components/schemas/ChangePasswordResponse');
    expect(source).toContain('required: [currentPassword, newPassword]');
    expect(source).toContain('AUTH_PASSWORD_INVALID');
    expect(source).toContain('当前密码错误');
  });

  it('documents request id headers for stage 1 auth routes', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('RequestIdHeader:');
    expect(source).toContain('name: x-request-id');
    expect(source).toContain(
      "$ref: '#/components/parameters/RequestIdHeader'",
    );
  });

  it('documents shipper order endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/orders:');
    expect(source).toContain('/shipper/orders/{orderId}:');
    expect(source).toContain('/shipper/orders/{orderId}/cancel:');
    expect(source).toContain('/shipper/orders/{orderId}/complete:');
    expect(source).toContain('/shipper/orders/{orderId}/exception:');
    expect(source).toContain('/shipper/orders/{orderId}/change-request:');
    expect(source).toContain('/shipper/orders/{orderId}/evaluation:');
    expect(source).toContain('/admin/orders/attachments:');
    expect(source).toContain('List admin order attachment audit summaries');
    expect(source).toContain('/admin/orders:');
    expect(source).toContain('List admin orders');
    expectPathBlockToContain(source, '/admin/orders', 'name: status');
    expectPathBlockToContain(source, '/admin/orders', 'name: statuses');
    expectPathBlockToContain(source, '/admin/orders', 'name: keyword');
    expectPathBlockToContain(source, '/admin/orders', 'name: createdFromIso');
    expectPathBlockToContain(source, '/admin/orders', 'name: createdToIso');
    expectPathBlockToContain(
      source,
      '/admin/orders',
      "$ref: '#/components/schemas/ShipperOrderListResponse'",
    );
    expectPathBlockToContain(
      source,
      '/admin/orders',
      "$ref: '#/components/responses/AdminOnlyError'",
    );
    expect(source).toContain('/admin/orders/report:');
    expectPathBlockToContain(
      source,
      '/admin/orders/report',
      'Get admin order report',
    );
    expectPathBlockToContain(
      source,
      '/admin/orders/report',
      'name: topShippersLimit',
    );
    expectPathBlockToContain(
      source,
      '/admin/orders/report',
      "$ref: '#/components/schemas/AdminOrderReportResponse'",
    );
    expectPathBlockToContain(
      source,
      '/admin/orders/report',
      "$ref: '#/components/responses/AdminOnlyError'",
    );
    expect(source).toContain('/admin/orders/export:');
    expectPathBlockToContain(
      source,
      '/admin/orders/export',
      'Export admin orders as csv',
    );
    expectPathBlockToContain(
      source,
      '/admin/orders/export',
      'text/csv',
    );
    expectPathBlockToContain(
      source,
      '/admin/orders/export',
      'Content-Disposition',
    );
    expectPathBlockToContain(
      source,
      '/admin/orders/export',
      'admin-orders.csv',
    );
    expect(source).toContain('/admin/orders/{orderId}:');
    expect(source).toContain('Get admin order detail');
    expectPathBlockToContain(
      source,
      '/admin/orders/{orderId}',
      "$ref: '#/components/schemas/ShipperOrderResponse'",
    );
    expectPathBlockToContain(
      source,
      '/admin/orders/{orderId}',
      "$ref: '#/components/responses/AdminOnlyError'",
    );
    expect(source).toContain('/admin/orders/{orderId}/cancel:');
    expectPathBlockToContain(
      source,
      '/admin/orders/{orderId}/cancel',
      'Cancel waiting admin order',
    );
    expectPathBlockToContain(
      source,
      '/admin/orders/{orderId}/cancel',
      "$ref: '#/components/parameters/IdempotencyKeyHeader'",
    );
    expectPathBlockToContain(
      source,
      '/admin/orders/{orderId}/cancel',
      "$ref: '#/components/schemas/CancelShipperOrderRequest'",
    );
    expectPathBlockToContain(
      source,
      '/admin/orders/{orderId}/cancel',
      'Only waiting orders can be cancelled from admin.',
    );
    expectPathBlockToContain(
      source,
      '/admin/orders/{orderId}/cancel',
      'ORDER_STATE_INVALID',
    );
    expectPathBlockToContain(
      source,
      '/admin/orders/{orderId}/cancel',
      "$ref: '#/components/responses/AdminOnlyError'",
    );
    expectPathBlockToContain(source, '/admin/orders/attachments', 'name: status');
    expectPathBlockToContain(
      source,
      '/admin/orders/attachments',
      'name: shipperId',
    );
    expect(source).toContain('hasMissingFiles');
    expect(source).toContain(
      'Only return orders whose attachment audit matches the missing-file state.',
    );
    expect(source).toContain('/admin/orders/{orderId}/attachments:');
    expect(source).toContain('Get admin order attachment audit');
    expect(source).toContain('AdminOrderAttachmentAuditListResponse');
    expect(source).toContain('AdminOrderAttachmentAuditSummary');
    expect(source).toContain('AdminOrderAttachmentAuditResponse');
    expect(source).toContain('AdminOrderAttachmentFileRecord');
    expect(source).toContain('AdminOrderAttachmentAuditEvent');
    expect(source).toContain('AdminOrderReport');
    expect(source).toContain('AdminOrderSummary');
    expect(source).toContain('AdminOrderReportTopShipperItem');
    expect(source).toContain('missingFileIds');
    expect(source).toContain(
      'Signed short-lived preview URL for admin order attachment audit.',
    );
    expect(source).toContain('CreateShipperOrderRequest');
    expect(source).toContain('UpdateShipperOrderRequest');
    expect(source).toContain('Update current shipper order');
    expect(source).toContain('CancelShipperOrderRequest');
    expect(source).toContain('CompleteShipperOrderRequest');
    expect(source).toContain('Complete shipper order after delivery');
    expect(source).toContain('ReportShipperOrderExceptionRequest');
    expect(source).toContain('photoFileIds');
    expect(source).toContain('Order event attachment file ids');
    expect(source).toContain(
      'Created and updated order events include cargo photo file ids',
    );
    expect(source).toContain('cargoPhotoFileIds');
    expect(source).toContain('Order cargo photo file ids');
    expect(source).toContain('use cargo purpose');
    expect(source).toContain(
      'When present, cargoPhotoCount is derived from this array length.',
    );
    expect(source).toContain('exception_reported');
    expect(source).toContain('SubmitShipperOrderChangeRequest');
    expect(source).toContain('change_requested');
    expect(source).toContain('SubmitShipperOrderEvaluationRequest');
    expect(source).toContain('evaluation_submitted');
    expect(source).toContain('ShipperOrder');
    expect(source).toContain('ShipperOrderListResponse');
    expect(source).toContain('ORDER_STATE_INVALID');
    expect(source).toContain('name: statuses');
    expect(source).toContain('loading,transporting');
    expect(source).toContain('name: keyword');
    expect(source).toContain('name: createdFromIso');
    expect(source).toContain('name: createdToIso');
    expectPathBlockToContain(
      source,
      '/shipper/orders',
      "$ref: '#/components/responses/ShipperOnlyError'",
    );
    expectPathBlockToContain(
      source,
      '/shipper/orders/{orderId}',
      "$ref: '#/components/responses/ShipperOnlyError'",
    );
  });

  it('documents the current shipper order draft endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/order-draft:');
    expect(source).toContain('Get current shipper order draft');
    expect(source).toContain('Save current shipper order draft');
    expect(source).toContain('SaveShipperOrderDraftRequest');
    expect(source).toContain('ShipperOrderDraftResponse');
    expect(source).toContain('draftSnapshot');
    expect(source).toContain('clientUpdatedAtIso');
    expect(source).toContain('baseUpdatedAtIso');
    expect(source).toContain("'409':");
    expect(source).toContain('ORDER_DRAFT_CONFLICT');
    expect(source).toContain(
      'Drafts older than 24 hours are treated as missing and return null data.',
    );
    expectPathBlockToContain(
      source,
      '/shipper/order-draft',
      "$ref: '#/components/responses/ShipperOnlyError'",
    );
  });

  it('documents driver order hall and first-slice order actions', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/driver/order-hall:');
    expect(source).toContain('/driver/settings/acceptance:');
    expect(source).toContain('/driver/income:');
    expect(source).toContain('/driver/withdrawals:');
    expect(source).toContain('/driver/orders:');
    expect(source).toContain('/driver/orders/{orderId}:');
    expect(source).toContain('/driver/orders/{orderId}/quote:');
    expect(source).toContain('/driver/orders/{orderId}/accept:');
    expect(source).toContain('/driver/orders/{orderId}/status:');
    expect(source).toContain('/driver/orders/{orderId}/evaluation-reply:');
    expect(source).toContain('/driver/orders/{orderId}/shipper-evaluation:');
    expect(source).toContain('/driver/orders/{orderId}/exception:');
    expect(source).toContain('DriverOrderHallResponse');
    expect(source).toContain('DriverMyOrdersResponse');
    expect(source).toContain('DriverAcceptanceSettingsResponse');
    expect(source).toContain('DriverIncomeResponse');
    expect(source).toContain('DriverIncomeOverview');
    expect(source).toContain('DriverIncomeSummary');
    expect(source).toContain('DriverIncomeRecord');
    expect(source).toContain('DriverWithdrawalListResponse');
    expect(source).toContain('DriverWithdrawalResponse');
    expect(source).toContain('DriverWithdrawalStatus');
    expect(source).toContain('DriverQuoteOrderRequest');
    expect(source).toContain('DriverAcceptOrderRequest');
    expect(source).toContain('DriverAdvanceOrderStatusRequest');
    expect(source).toContain('DriverReplyEvaluationRequest');
    expect(source).toContain('DriverEvaluateShipperRequest');
    expect(source).toContain('DriverReportOrderExceptionRequest');
    expect(source).toContain('driver_exception_reported');
    expect(source).toContain('Driver exception files may return FILE_NOT_FOUND, FILE_STATE_INVALID or FILE_PURPOSE_INVALID.');
    expect(source).toContain('SaveDriverAcceptanceSettingsRequest');
    expect(source).toContain('CreateDriverWithdrawalRequest');
    expect(source).toContain('availableWithdrawalCents');
    expect(source).toContain('reviewingWithdrawalCents');
    expect(source).toContain('bankAccountMasked');
    expect(source).toContain('DRIVER_WITHDRAWAL_BALANCE_INSUFFICIENT');
    expect(source).toContain('receiptPhotoFileIds');
    expect(source).toContain('Driver execution receipt proof file ids');
    expect(source).toContain('use receipt purpose');
    expect(source).toContain('maxDistanceKm');
    expect(source).toContain('vehicleTypePreferences');
    expect(source).toContain('This first slice stores online/offline status');
    expect(source).toContain('driver_quote_submitted');
    expect(source).toContain('driver_accepted');
    expect(source).toContain('driver_status_changed');
    expect(source).toContain('evaluation_replied');
    expect(source).toContain('shipper_evaluation_submitted');
    expect(source).toContain('AUTH_FORBIDDEN');
  });

  it('documents order mutation idempotency and optimistic concurrency', () => {
    const source = readFileSync(openApiPath, 'utf8');
    const protectedOrderMutationPaths = [
      '/shipper/orders/{orderId}',
      '/shipper/orders/{orderId}/cancel',
      '/shipper/orders/{orderId}/status',
      '/shipper/orders/{orderId}/complete',
      '/driver/orders/{orderId}/accept',
      '/driver/orders/{orderId}/status',
    ];

    expect(source).toContain('IdempotencyKeyHeader:');
    expect(source).toContain('name: Idempotency-Key');
    expect(source).toContain('format: uuid');
    expect(source).toContain(
      'Reusing the same Idempotency-Key with the same normalized request replays the first successful order snapshot.',
    );

    for (const path of protectedOrderMutationPaths) {
      expectPathBlockToContain(
        source,
        path,
        "$ref: '#/components/parameters/IdempotencyKeyHeader'",
      );
      expectPathBlockToContain(source, path, 'IDEMPOTENCY_KEY_INVALID');
      expectPathBlockToContain(source, path, 'IDEMPOTENCY_KEY_REUSED');
      expectPathBlockToContain(source, path, 'IDEMPOTENCY_KEY_EXPIRED');
      expectPathBlockToContain(source, path, 'ORDER_CONFLICT');
    }

    expectPathBlockToContain(
      source,
      '/shipper/orders/{orderId}',
      'UpdateShipperOrderRequest',
    );
    expectPathBlockToContain(
      source,
      '/shipper/orders/{orderId}/complete',
      'CompleteShipperOrderRequest',
    );

    expectSchemaBlockToContain(
      source,
      'UpdateShipperOrderRequest',
      'required: [baseUpdatedAtIso]',
    );
    expectSchemaBlockToContain(
      source,
      'CancelShipperOrderRequest',
      'required: [baseUpdatedAtIso, reasonText]',
    );
    expectSchemaBlockToContain(
      source,
      'AdvanceShipperOrderStatusRequest',
      'required: [baseUpdatedAtIso, nextStatus]',
    );
    expectSchemaBlockToContain(
      source,
      'CompleteShipperOrderRequest',
      'required: [baseUpdatedAtIso]',
    );
    expectSchemaBlockToContain(
      source,
      'DriverAcceptOrderRequest',
      'required: [baseUpdatedAtIso]',
    );
    expectSchemaBlockToContain(
      source,
      'DriverAdvanceOrderStatusRequest',
      'required: [baseUpdatedAtIso, nextStatus]',
    );
    expect(source).toContain(
      'Use this value as the baseUpdatedAtIso for the next protected order mutation.',
    );
  });

  it('documents idempotent shipper order creation without a mutation baseline', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expectPathBlockToContain(
      source,
      '/shipper/orders',
      "$ref: '#/components/parameters/IdempotencyKeyHeader'",
    );
    expectPathBlockToContain(
      source,
      '/shipper/orders',
      'The create request body does not contain baseUpdatedAtIso.',
    );
    expectPathBlockToContain(source, '/shipper/orders', "'400':");
    expectPathBlockToContain(source, '/shipper/orders', "'409':");
    expectPathBlockToContain(
      source,
      '/shipper/orders',
      'IDEMPOTENCY_KEY_INVALID',
    );
    expectPathBlockToContain(
      source,
      '/shipper/orders',
      'IDEMPOTENCY_KEY_REUSED',
    );
    expectPathBlockToContain(
      source,
      '/shipper/orders',
      'IDEMPOTENCY_KEY_EXPIRED',
    );
    expectPathBlockToContain(
      source,
      '/shipper/orders',
      'PROFILE_COUPON_NOT_AVAILABLE',
    );
    expectPathBlockToContain(
      source,
      '/shipper/orders',
      'PROFILE_COUPON_PRICE_MISMATCH',
    );
    expectPathBlockToContain(
      source,
      '/shipper/orders',
      'does not create another order or another created event',
    );
    expectPathBlockToContain(
      source,
      '/shipper/orders',
      'commit in one database transaction',
    );
    expectSchemaBlockNotToContain(
      source,
      'CreateShipperOrderRequest',
      'baseUpdatedAtIso',
    );
  });

  it('documents order exception customer service case workflows', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/orders/{orderId}/exception-cases:');
    expect(source).toContain('/driver/orders/{orderId}/exception-cases:');
    expect(source).toContain('/admin/order-exception-cases:');
    expect(source).toContain('/admin/order-exception-cases/{caseId}:');
    expect(source).toContain('/admin/order-exception-cases/{caseId}/process:');
    expect(source).toContain('/admin/order-exception-cases/{caseId}/resolve:');
    expect(source).toContain('/admin/order-exception-cases/{caseId}/close:');
    expect(source).toContain('OrderExceptionCaseRecord');
    expect(source).toContain('OrderExceptionCaseActionRecord');
    expect(source).toContain('OrderExceptionCaseStatus');
    expect(source).toContain('OrderExceptionCaseCompensationStatus');
    expect(source).toContain('OrderExceptionCaseSourceRole');
    expect(source).toContain('ResolveOrderExceptionCaseRequest');
    expect(source).toContain('compensationStatus');
    expect(source).toContain('compensationTargetRole');
    expect(source).toContain('compensationAmountCents');
    expect(source).toContain('baseUpdatedAtIso');
    expect(source).toContain('EXCEPTION_CASE_NOT_FOUND');
    expect(source).toContain('EXCEPTION_CASE_STATE_INVALID');
    expect(source).toContain('EXCEPTION_CASE_CONFLICT');
  });

  it('documents driver identity and vehicle certification endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/driver/certification:');
    expect(source).toContain('/driver/certification/identity:');
    expect(source).toContain('/driver/certification/vehicle:');
    expect(source).toContain('DriverCertificationResponse');
    expect(source).toContain('DriverCertificationSnapshot');
    expect(source).toContain('DriverCertificationDriver');
    expect(source).toContain('DriverIdentityCertification');
    expect(source).toContain('DriverVehicleCertification');
    expect(source).toContain('DriverCertificationStatus');
    expect(source).toContain('SubmitDriverIdentityCertificationRequest');
    expect(source).toContain('SubmitDriverVehicleCertificationRequest');
    expect(source).toContain('unsubmitted, reviewing, approved, rejected');
    expect(source).toContain('Certification file ids must belong to the current driver, be uploaded, and use identity purpose.');
    expect(source).toContain('FILE_PURPOSE_INVALID');
    expect(source).toContain('认证附件用途不匹配');
    expect(source).toContain('required: [realName, identityNumber, identityFrontFileId, identityBackFileId]');
    expect(source).toContain('required: [plateNumber, vehicleType, vehicleLengthText, loadCapacityText, hasTailboard, drivingLicenseFileId, driverLicenseFileId, transportQualificationFileId, operationPermitFileId, vehiclePhotoFileId]');
    expect(source).toContain('driverLicenseFileId');
    expect(source).toContain('transportQualificationFileId');
    expect(source).toContain('operationPermitFileId');
  });

  it('documents driver order action certification gates', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('DRIVER_ACCEPTANCE_OFFLINE');
    expect(source).toContain('司机当前处于离线接单状态');
    expect(source).toContain('DRIVER_CERTIFICATION_REQUIRED');
    expect(source).toContain('司机实名和车辆认证通过后才能接单');
    expect(source).toContain('Driver identity or vehicle certification is not approved');
  });

  it('documents admin driver certification review endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/admin/driver-certifications:');
    expect(source).toContain('/admin/driver-certifications/{driverId}/identity/review:');
    expect(source).toContain('/admin/driver-certifications/{driverId}/vehicle/review:');
    expect(source).toContain('/admin/driver-certifications/{driverId}/attachments:');
    expect(source).toContain('/admin/driver-certifications/{driverId}/review-events:');
    expect(source).toContain('List driver certifications for admin review');
    expect(source).toContain('Get driver certification attachment previews');
    expect(source).toContain('List driver certification review audit events');
    expect(source).toContain('DriverCertificationListResponse');
    expect(source).toContain('DriverCertificationAttachmentPreviewResponse');
    expect(source).toContain('DriverCertificationReviewEventResponse');
    expect(source).toContain('name: status');
    expect(source).toContain('reviewing');
    expect(source).toContain('Review driver identity certification');
    expect(source).toContain('Review driver vehicle certification');
    expect(source).toContain('ReviewDriverCertificationRequest');
    expect(source).toContain('DriverCertificationReviewEvent');
    expect(source).toContain('DriverCertificationAttachmentPreview');
    expect(source).toContain('identityFront');
    expect(source).toContain('driverLicense');
    expect(source).toContain('transportQualification');
    expect(source).toContain('operationPermit');
    expect(source).toContain('vehiclePhoto');
    expect(source).toContain('previewUrl');
    expect(source).toContain('previewExpiresAtIso');
    expect(source).toContain('Signed short-lived preview URL');
    expect(source).toContain('reviewerAdminId');
    expect(source).toContain('fromStatus');
    expect(source).toContain('toStatus');
    expect(source).toContain('enum: [approved, rejected]');
    expect(source).toContain('DRIVER_CERTIFICATION_NOT_FOUND');
    expect(source).toContain('司机认证记录不存在');
    expect(source).toContain('Current authenticated user is not an admin');
    expect(source).toContain('driver phone');
  });

  it('documents file upload intent and confirmation endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/files/upload-intents:');
    expect(source).toContain('/files/{fileId}:');
    expect(source).toContain('Get current user file metadata');
    expect(source).toContain('/files/{fileId}/uploaded:');
    expect(source).toContain('/files/uploads/{fileId}:');
    expect(source).toContain('Confirm local upload target');
    expect(source).toContain('application/octet-stream');
    expect(source).toContain('format: binary');
    expect(source).toContain('CreateFileUploadIntentRequest');
    expect(source).toContain('ConfirmFileUploadedRequest');
    expect(source).toContain('FileUploadIntentResponse');
    expect(source).toContain('FileUploadRecordResponse');
    expect(source).toContain('FILE_NOT_FOUND');
    expect(source).toContain('FILE_STATE_INVALID');
    expect(source).toContain('identity');
    expect(source).toContain('cargo');
    expect(source).toContain('exception');
    expect(source).toContain('evaluation');
  });

  it('documents S3 compatible storage callback confirmation', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/files/storage-callbacks/s3-compatible:');
    expect(source).toContain('Confirm S3 compatible storage callback');
    expect(source).toContain(
      'Valid repeated callbacks with matching metadata are idempotent.',
    );
    expect(source).toContain('ConfirmStorageCallbackRequest');
    expect(source).toContain('required: [fileId, objectKey, byteSize, contentType, signature]');
    expect(source).toContain('FILE_STORAGE_CALLBACK_INVALID');
    expect(source).toContain('对象存储回调签名无效');
    expect(source).toContain('etag');
    expect(source).toContain('versionId');
    expectPathBlockToContain(
      source,
      '/files/storage-callbacks/s3-compatible',
      "$ref: '#/components/schemas/ConfirmStorageCallbackRequest'",
    );
    expectPathBlockToContain(
      source,
      '/files/storage-callbacks/s3-compatible',
      "$ref: '#/components/schemas/FileUploadRecordResponse'",
    );
  });

  it('documents admin maintenance cleanup for expired pending files', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/files/maintenance/reject-expired-pending:');
    expect(source).toContain('/files/maintenance/files:');
    expect(source).toContain('/files/maintenance/summary:');
    expect(source).toContain('/files/maintenance/delete-rejected-objects:');
    expect(source).toContain('Reject expired pending file upload intents');
    expect(source).toContain('List file maintenance records');
    expect(source).toContain('Get file maintenance summary');
    expect(source).toContain('Retry rejected file object deletion');
    expect(source).toContain('RejectExpiredPendingFilesResponse');
    expect(source).toContain('RejectExpiredPendingFilesResult');
    expect(source).toContain('DeleteRejectedFileObjectsResponse');
    expect(source).toContain('DeleteRejectedFileObjectsResult');
    expect(source).toContain('ListFileMaintenanceFilesResponse');
    expect(source).toContain('ListFileMaintenanceFilesResult');
    expect(source).toContain('FileMaintenanceListItem');
    expect(source).toContain('FileMaintenanceSummaryResponse');
    expect(source).toContain('FileMaintenanceSummaryResult');
    expect(source).toContain('attemptedObjectCount');
    expect(source).toContain('rejectedCount');
    expect(source).toContain('deletedObjectCount');
    expect(source).toContain('failedObjectDeletionCount');
    expect(source).toContain('expiredPendingCount');
    expect(source).toContain('isExpiredPending');
    expect(source).toContain('cutoffIso');
    expectPathBlockToContain(
      source,
      '/files/maintenance/files',
      'bearerAuth: []',
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/files',
      'name: status',
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/files',
      'name: purpose',
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/files',
      'name: ownerUserId',
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/files',
      'name: keyword',
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/files',
      'name: page',
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/files',
      'name: pageSize',
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/files',
      "$ref: '#/components/schemas/ListFileMaintenanceFilesResponse'",
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/summary',
      'bearerAuth: []',
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/summary',
      "$ref: '#/components/schemas/FileMaintenanceSummaryResponse'",
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/reject-expired-pending',
      'bearerAuth: []',
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/reject-expired-pending',
      'AUTH_FORBIDDEN',
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/reject-expired-pending',
      'Current authenticated user is not an admin',
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/delete-rejected-objects',
      'bearerAuth: []',
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/delete-rejected-objects',
      "$ref: '#/components/schemas/DeleteRejectedFileObjectsResponse'",
    );
  });

  it('documents signed file preview metadata endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/files/previews/{objectKey}:');
    expect(source).toContain('/files/preview-contents/{objectKey}:');
    expect(source).toContain('Get signed file preview metadata');
    expect(source).toContain('Get signed file preview content');
    expect(source).toContain(
      'Returns uploaded file metadata after validating the short-lived preview signature.',
    );
    expect(source).toContain(
      'Returns the local binary file content after validating the short-lived preview signature.',
    );
    expect(source).toContain(
      'The objectKey path value is the wildcard suffix after /files/previews/ and may contain slashes.',
    );
    expect(source).toContain('application/octet-stream');
    expect(source).toContain('image/png');
    expect(source).toContain('name: expiresAtIso');
    expect(source).toContain('name: signature');
    expect(source).toContain('FilePreviewMetadataResponse');
    expect(source).toContain('FILE_PREVIEW_SIGNATURE_INVALID');
    expect(source).toContain('预览链接无效或已过期');
  });

  it('documents the current shipper profile address book endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/profile/address-book:');
    expect(source).toContain('Get current shipper profile address book');
    expect(source).toContain('Save current shipper profile address book');
    expect(source).toContain('SaveShipperProfileAddressBookRequest');
    expect(source).toContain('ShipperProfileAddressBookResponse');
    expect(source).toContain('ShipperProfileAddressBookAddress');
    expect(source).toContain('ShipperProfileAddressBookContact');
    expect(source).toContain('maxItems: 20');
    expect(source).toContain('maxItems: 50');
    expect(source).toContain('baseUpdatedAtIso');
    expect(source).toContain('PROFILE_ADDRESS_BOOK_CONFLICT');
    expect(source).toContain(
      'The address book has been updated by another device after the client',
    );
    expect(source).toContain(
      'It does not sync identity verification, coupons, invoices or account security settings.',
    );
    expect(source).toContain('Current authenticated user is not a shipper');
  });

  it('documents the current shipper profile account endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/profile/account:');
    expect(source).toContain('Get current shipper profile account');
    expect(source).toContain('Save current shipper profile account');
    expect(source).toContain('SaveShipperProfileAccountRequest');
    expect(source).toContain('ShipperProfileAccountResponse');
    expect(source).toContain(
      'It does not sync bound phone rebind, avatar files or account security settings.',
    );
    expect(source).toContain('Current authenticated user is not a shipper');
  });

  it('documents the current shipper profile identity verification endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/profile/identity-verification:');
    expect(source).toContain('Get current shipper identity verification');
    expect(source).toContain('Save current shipper identity verification');
    expect(source).toContain('SaveShipperIdentityVerificationRequest');
    expect(source).toContain('ShipperIdentityVerificationResponse');
    expect(source).toContain('identityFrontFileId');
    expect(source).toContain('faceVerified');
    expect(source).toContain('ShipperProfileVerificationStatus');
    expect(source).toContain(
      'It does not include third-party face recognition SDK callbacks, admin review, or approval result push.',
    );
    expect(source).toContain('Current authenticated user is not a shipper');
  });

  it('documents the current shipper profile enterprise verification endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/profile/enterprise-verification:');
    expect(source).toContain('Get current shipper enterprise verification');
    expect(source).toContain('Save current shipper enterprise verification');
    expect(source).toContain('SaveShipperEnterpriseVerificationRequest');
    expect(source).toContain('ShipperEnterpriseVerificationResponse');
    expect(source).toContain('licenseFileId');
    expect(source).toContain('creditCode');
    expect(source).toContain(
      'It does not include admin review, invoice issuance, or tax status callbacks.',
    );
    expect(source).toContain('Current authenticated user is not a shipper');
  });

  it('documents the current shipper profile invoice application endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/profile/invoices:');
    expect(source).toContain('List current shipper invoice applications');
    expect(source).toContain('Create current shipper invoice application');
    expect(source).toContain('CreateShipperInvoiceApplicationRequest');
    expect(source).toContain('ShipperInvoiceApplicationListResponse');
    expect(source).toContain('ShipperInvoiceApplicationResponse');
    expect(source).toContain('ShipperInvoiceType');
    expect(source).toContain('ShipperInvoiceTitleType');
    expect(source).toContain('ShipperInvoiceApplicationStatus');
    expect(source).toContain('uniqueItems: true');
    expect(source).toContain(
      'payablePriceCents when present, otherwise falls back to priceCents',
    );
    expect(source).toContain('增值税专用发票需先提交企业认证资料');
    expect(source).toContain('订单已存在开票申请');
    expectPathBlockToContain(
      source,
      '/shipper/profile/invoices',
      "$ref: '#/components/responses/ShipperOnlyError'",
    );
    expect(source).toContain('Current authenticated user is not a shipper');
  });

  it('documents the current shipper spending record endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/profile/spending-records:');
    expect(source).toContain('List current shipper spending records');
    expect(source).toContain('ShipperSpendingRecordsResponse');
    expect(source).toContain('ShipperSpendingSnapshot');
    expect(source).toContain('ShipperSpendingSummary');
    expect(source).toContain('ShipperSpendingRecord');
    expect(source).toContain('completedTotalCents');
    expect(source).toContain('activeTotalCents');
    expect(source).toContain('refundTotalCents');
    expect(source).toContain('routeText');
    expect(source).toContain(
      'Financial fields come from payment, settlement and refund records; cancelled unpaid orders and legacy_unverified orders are omitted.',
    );
    expect(source).not.toContain(
      'It is a spending snapshot derived from order payment fields and does not represent real payment, escrow, or refund ledger entries.',
    );
    expectPathBlockToContain(
      source,
      '/shipper/profile/spending-records',
      "$ref: '#/components/responses/ShipperOnlyError'",
    );
    expect(source).toContain('Current authenticated user is not a shipper');
  });

  it('documents the current shipper profile evaluation endpoint', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/profile/evaluations:');
    expect(source).toContain('/shipper/profile/evaluations/received:');
    expect(source).toContain('List current shipper profile evaluations');
    expect(source).toContain('List current shipper received evaluations');
    expect(source).toContain('ShipperProfileEvaluationSnapshotResponse');
    expect(source).toContain('ShipperProfileEvaluationSnapshot');
    expect(source).toContain('ShipperProfileEvaluationRecord');
    expect(source).toContain('ShipperReceivedEvaluationSnapshotResponse');
    expect(source).toContain('ShipperReceivedEvaluationSnapshot');
    expect(source).toContain('ShipperReceivedEvaluationRecord');
    expect(source).toContain('photoFileIds');
    expect(source).toContain('driverReplyText');
    expect(source).toContain(
      'It is derived from order evaluation_submitted events and merges driver evaluation_replied events when present.',
    );
    expect(source).toContain(
      'It is derived from order shipper_evaluation_submitted events.',
    );
    expectPathBlockToContain(
      source,
      '/shipper/profile/evaluations',
      "$ref: '#/components/responses/ShipperOnlyError'",
    );
    expectPathBlockToContain(
      source,
      '/shipper/profile/evaluations/received',
      "$ref: '#/components/responses/ShipperOnlyError'",
    );
    expect(source).toContain('Current authenticated user is not a shipper');
  });

  it('documents the admin evaluation audit endpoint', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/admin/evaluations:');
    expect(source).toContain('List admin evaluation audit records');
    expectPathBlockToContain(source, '/admin/evaluations', 'name: direction');
    expectPathBlockToContain(source, '/admin/evaluations', 'name: rating');
    expectPathBlockToContain(source, '/admin/evaluations', 'name: keyword');
    expect(source).toContain('AdminEvaluationAuditListResponse');
    expect(source).toContain('AdminEvaluationAuditRecord');
    expect(source).toContain('AdminEvaluationDirection');
    expect(source).toContain('shipper_to_driver');
    expect(source).toContain('driver_to_shipper');
    expect(source).toContain(
      'It is derived from order evaluation_submitted and shipper_evaluation_submitted events.',
    );
    expectPathBlockToContain(
      source,
      '/admin/evaluations',
      "$ref: '#/components/responses/AdminOnlyError'",
    );
    expect(source).toContain('Current authenticated user is not an admin');
  });

  it('documents the current shipper coupon wallet endpoint', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/profile/coupons:');
    expect(source).toContain('List current shipper coupon wallet');
    expect(source).toContain('ShipperCouponWalletResponse');
    expect(source).toContain('ShipperCouponWallet');
    expect(source).toContain('ShipperCouponSummary');
    expect(source).toContain('ShipperCouponRecord');
    expect(source).toContain('enum: [usable, locked, used, expired]');
    expect(source).toContain('usableCount');
    expect(source).toContain('lockedCount');
    expect(source).toContain('usedCount');
    expect(source).toContain('expiredCount');
    expect(source).toContain('lockedOrderNo');
    expect(source).toContain('lockedAtIso');
    expect(source).toContain('usedOrderNo');
    expect(source).toContain(
      'order creation/update/cancel/complete can lock, release and redeem existing coupons',
    );
    expect(source).toContain(
      'a verified refund success callback can return a fresh usable coupon when the original coupon was already redeemed by that order.',
    );
    expectPathBlockToContain(
      source,
      '/shipper/profile/coupons',
      "$ref: '#/components/responses/ShipperOnlyError'",
    );
    expect(source).toContain('Current authenticated user is not a shipper');
  });

  it('documents the admin manual shipper coupon issue endpoint', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/admin/shipper-coupons:');
    expect(source).toContain('Issue a shipper coupon manually');
    expect(source).toContain('IssueShipperCouponRequest');
    expect(source).toContain('ShipperCouponRecordResponse');
    expect(source).toContain('discountCents');
    expect(source).toContain('minOrderAmountCents');
    expectPathBlockToContain(
      source,
      '/admin/shipper-coupons',
      "$ref: '#/components/responses/AdminOnlyError'",
    );
    expect(source).toContain('Current authenticated user is not an admin');
  });

  it('documents the admin batch shipper coupon issue endpoint', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/admin/shipper-coupons/batch-issue:');
    expect(source).toContain('Issue shipper coupons in batch');
    expect(source).toContain('BatchIssueShipperCouponsRequest');
    expect(source).toContain('BatchIssueShipperCouponsResponse');
    expect(source).toContain('requestedCount');
    expect(source).toContain('shipperIds');
    expectPathBlockToContain(
      source,
      '/admin/shipper-coupons/batch-issue',
      "$ref: '#/components/responses/AdminOnlyError'",
    );
  });

  it('documents the admin shipper coupon report endpoint and schemas', () => {
    const source = readFileSync(openApiPath, 'utf8');
    const path = '/admin/shipper-coupons/report';

    expect(source).toContain(`${path}:`);
    expectPathBlockToContain(source, path, 'Get admin shipper coupon report');
    expectPathBlockToContain(source, path, 'name: topShippersLimit');
    expectPathBlockToContain(
      source,
      path,
      "$ref: '#/components/schemas/AdminShipperCouponReportResponse'",
    );
    expectPathBlockToContain(
      source,
      path,
      "$ref: '#/components/responses/AdminOnlyError'",
    );
    expect(source).toContain('AdminShipperCouponReportResponse:');
    expect(source).toContain('AdminShipperCouponReportResult:');
    expect(source).toContain('AdminShipperCouponReportSummary:');
    expect(source).toContain('AdminShipperCouponReportSourceBreakdownItem:');
    expect(source).toContain('AdminShipperCouponReportTopShipperItem:');
  });

  it('documents the current shipper profile frequent routes endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/profile/frequent-routes:');
    expect(source).toContain('Get current shipper profile frequent routes');
    expect(source).toContain('Save current shipper profile frequent routes');
    expect(source).toContain('SaveShipperProfileFrequentRoutesRequest');
    expect(source).toContain('ShipperProfileFrequentRoutesResponse');
    expect(source).toContain('ShipperFrequentRoute');
    expect(source).toContain('maxItems: 20');
    expect(source).toContain('PROFILE_FREQUENT_ROUTES_CONFLICT');
    expect(source).toContain(
      'The frequent routes snapshot has been updated by another device after the client',
    );
    expect(source).toContain(
      'It does not sync completed order route mining, dispatch recommendations or driver route preferences.',
    );
    expect(source).toContain('Current authenticated user is not a shipper');
  });

  it('documents shipper payment creation and latest server payment state', () => {
    const source = readFileSync(openApiPath, 'utf8');
    const path = '/shipper/orders/{orderId}/payments';

    expect(source).toContain(`${path}:`);
    expectPathBlockToContain(source, path, 'Create an online payment order');
    expectPathBlockToContain(source, path, 'Get latest online payment order');
    expectPathBlockToContain(
      source,
      path,
      "$ref: '#/components/parameters/IdempotencyKeyHeader'",
    );
    expectPathBlockToContain(source, path, 'bearerAuth: []');
    expectPathBlockToContain(
      source,
      path,
      "$ref: '#/components/schemas/CreatePaymentRequest'",
    );
    expectPathBlockToContain(
      source,
      path,
      "$ref: '#/components/schemas/CreatePaymentResponse'",
    );
    expectPathBlockToContain(
      source,
      path,
      "$ref: '#/components/schemas/PaymentOrderResponse'",
    );
    for (const errorCode of [
      'PAYMENT_AMOUNT_INVALID',
      'PAYMENT_ALREADY_ESCROWED',
      'PAYMENT_ORDER_NOT_AVAILABLE',
      'PAYMENT_CHANNEL_UNAVAILABLE',
      'IDEMPOTENCY_KEY_INVALID',
      'IDEMPOTENCY_KEY_REUSED',
    ]) {
      expectPathBlockToContain(source, path, errorCode);
    }
    expectSchemaBlockToContain(
      source,
      'CreatePaymentRequest',
      'enum: [wechat, alipay]',
    );
    expectSchemaBlockToContain(
      source,
      'PaymentOrderRecord',
      'clientPayload:',
    );
    expectSchemaBlockToContain(
      source,
      'PaymentOrderRecord',
      'providerTradeNo:',
    );
    expect(source).toContain('opaque provider payload');
  });

  it('documents six unauthenticated signed callback routes with provider-native acknowledgements', () => {
    const source = readFileSync(openApiPath, 'utf8');
    const callbackPaths = [
      '/callbacks/payment/wechat',
      '/callbacks/payment/alipay',
      '/callbacks/payment/sandbox',
      '/callbacks/refund/wechat',
      '/callbacks/refund/alipay',
      '/callbacks/refund/sandbox',
    ];

    for (const path of callbackPaths) {
      expect(source).toContain(`${path}:`);
      expectPathBlockToContain(source, path, 'security: []');
      expectPathBlockToContain(source, path, 'raw request body');
      expectPathBlockNotToContain(source, path, 'ApiSuccessEnvelope');
      expectPathBlockToContain(source, path, "'200':");
      expectPathBlockToContain(source, path, "'400':");
    }
    expectPathBlockToContain(
      source,
      '/callbacks/payment/wechat',
      "$ref: '#/components/schemas/WechatCallbackSuccessAck'",
    );
    expectPathBlockToContain(
      source,
      '/callbacks/payment/alipay',
      'text/plain',
    );
    expectPathBlockToContain(
      source,
      '/callbacks/payment/sandbox',
      "$ref: '#/components/schemas/SandboxCallbackSuccessAck'",
    );
    expectSchemaBlockToContain(
      source,
      'WechatCallbackSuccessAck',
      'enum: [SUCCESS]',
    );
    expectSchemaBlockToContain(
      source,
      'WechatCallbackFailureAck',
      'enum: [FAIL]',
    );
    expect(source).toContain('example: success');
    expect(source).toContain('example: failure');
  });

  it('documents admin finance pages, ledger detail and audited write operations', () => {
    const source = readFileSync(openApiPath, 'utf8');
    const readPaths = [
      '/admin/finance/report',
      '/admin/finance/payments',
      '/admin/finance/refunds',
      '/admin/finance/settlements',
      '/admin/finance/ledger-transactions/{transactionId}',
      '/admin/finance/withdrawals',
    ];
    const writePaths = [
      '/admin/finance/refunds/{refundId}/retry',
      '/admin/finance/withdrawals/{withdrawalId}/approve',
      '/admin/finance/withdrawals/{withdrawalId}/reject',
    ];

    for (const path of [...readPaths, ...writePaths]) {
      expect(source).toContain(`${path}:`);
      expectPathBlockToContain(source, path, 'bearerAuth: []');
      expectPathBlockToContain(
        source,
        path,
        "$ref: '#/components/responses/AdminOnlyError'",
      );
    }
    for (const path of writePaths) {
      expectPathBlockToContain(
        source,
        path,
        "$ref: '#/components/parameters/IdempotencyKeyHeader'",
      );
      expectPathBlockToContain(
        source,
        path,
        "$ref: '#/components/schemas/AdminFinanceWriteRequest'",
      );
      expectPathBlockToContain(source, path, 'expectedVersion');
      expectPathBlockToContain(source, path, 'reason');
      expectPathBlockToContain(source, path, 'IDEMPOTENCY_KEY_REUSED');
    }
    expect(source).toContain('AdminPaymentPageResponse');
    expect(source).toContain('AdminFinanceReportResponse');
    expect(source).toContain('AdminRefundPageResponse');
    expect(source).toContain('AdminSettlementPageResponse');
    expect(source).toContain('AdminWithdrawalPageResponse');
    expect(source).toContain('FinancialTransactionResponse');
    expect(source).toContain('AdminRefundRetryResponse');
    expect(source).toContain('AdminWithdrawalReviewResponse');
    expect(source).toContain('FinancialLedgerEntryRecord');
    expect(source).toContain('FinancialAuditLogRecord');
    for (const path of [
      '/admin/finance/payments',
      '/admin/finance/refunds',
      '/admin/finance/settlements',
    ]) {
      expectPathBlockToContain(source, path, 'name: orderId');
    }
    expectPathBlockNotToContain(
      source,
      '/admin/finance/withdrawals',
      'name: orderId',
    );
  });

  it('documents the admin console overview endpoint and live module schemas', () => {
    const source = readFileSync(openApiPath, 'utf8');
    const path = '/admin/console/overview';

    expect(source).toContain(`${path}:`);
    expectPathBlockToContain(source, path, 'Get admin console overview');
    expectPathBlockToContain(source, path, 'bearerAuth: []');
    expectPathBlockToContain(
      source,
      path,
      "$ref: '#/components/responses/AdminOnlyError'",
    );
    expectPathBlockToContain(
      source,
      path,
      "$ref: '#/components/schemas/AdminConsoleOverviewResponse'",
    );
    expect(source).toContain('AdminConsoleOverview:');
    expect(source).toContain('AdminConsoleOverviewModule:');
    expect(source).toContain('AdminConsoleOverviewMetric:');
    expectSchemaBlockToContain(
      source,
      'AdminConsoleOverview',
      'remainingPlatformGaps:',
    );
    expectSchemaBlockToContain(
      source,
      'AdminConsoleOverviewModule',
      'pendingGaps:',
    );
    expectSchemaBlockToContain(
      source,
      'AdminConsoleOverviewModule',
      'permission-matrix',
    );
    expectSchemaBlockToContain(
      source,
      'AdminConsoleOverview',
      '多角色工作台 / 行级权限 / 报表 / 批量操作',
    );
    expectSchemaBlockToContain(
      source,
      'AdminConsoleOverviewMetric',
      'enum: [neutral, warning, positive]',
    );
  });

  it('documents the admin permission matrix endpoint and schemas', () => {
    const source = readFileSync(openApiPath, 'utf8');
    const path = '/admin/permissions/matrix';

    expect(source).toContain(`${path}:`);
    expectPathBlockToContain(source, path, 'Get admin permission matrix');
    expectPathBlockToContain(source, path, 'bearerAuth: []');
    expectPathBlockToContain(
      source,
      path,
      "$ref: '#/components/schemas/AdminPermissionMatrixResponse'",
    );
    expectPathBlockToContain(
      source,
      path,
      "$ref: '#/components/responses/AdminOnlyError'",
    );
    expect(source).toContain('AdminPermissionMatrix:');
    expect(source).toContain('AdminPermissionMatrixProfile:');
    expect(source).toContain('AdminPermissionMatrixModule:');
    expect(source).toContain('AdminPermissionCapability:');
    expect(source).toContain('AdminPermissionRiskLevel:');
    expectSchemaBlockToContain(
      source,
      'AdminPermissionMatrix',
      'remainingGaps:',
    );
    expectSchemaBlockToContain(
      source,
      'AdminPermissionMatrixProfile',
      'platform_admin',
    );
    expectSchemaBlockToContain(
      source,
      'AdminPermissionCapability',
      'apiPaths:',
    );
    expectSchemaBlockToContain(
      source,
      'AdminPermissionCapability',
      'session_governance_manage',
    );
    expectSchemaBlockToContain(
      source,
      'AdminPermissionCapability',
      'order_management_manage',
    );
    expectSchemaBlockToContain(
      source,
      'AdminPermissionCapability',
      '/admin/orders/{orderId}/cancel',
    );
  });

  it('documents withdrawal idempotency and wallet facts', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expectPathBlockToContain(
      source,
      '/driver/withdrawals',
      "$ref: '#/components/parameters/IdempotencyKeyHeader'",
    );
    expectPathBlockToContain(
      source,
      '/driver/withdrawals',
      'IDEMPOTENCY_KEY_INVALID',
    );
    expectPathBlockToContain(
      source,
      '/driver/withdrawals',
      'IDEMPOTENCY_KEY_REUSED',
    );
    expectPathBlockToContain(
      source,
      '/driver/withdrawals',
      'Same key and same normalized body replay the original withdrawal.',
    );
    expectSchemaBlockToContain(
      source,
      'DriverIncomeSummary',
      'withdrawnCents',
    );
    expectSchemaBlockToContain(source, 'AdminRefundRecord', 'outboxEvent:');
    expectSchemaBlockToContain(
      source,
      'AdminRefundRecord',
      "$ref: '#/components/schemas/FinancialOutboxEventRecord'",
    );
    expectSchemaBlockToContain(source, 'AdminWithdrawalRecord', 'version:');
    expectSchemaBlockToContain(
      source,
      'DriverWithdrawalStatus',
      'enum: [reviewing, paid, rejected]',
    );
  });

  it('documents order and spending financial facts instead of derived placeholders', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expectSchemaBlockToContain(source, 'ShipperOrder', 'paymentStatus:');
    expectSchemaBlockToContain(source, 'ShipperOrder', 'assignedDriverId:');
    expectSchemaBlockToContain(source, 'ShipperOrder', 'paymentSettledAtIso:');
    expectSchemaBlockToContain(source, 'ShipperOrder', 'refundedAtIso:');
    expectSchemaBlockToContain(
      source,
      'ShipperSpendingRecord',
      'paymentChannel:',
    );
    expectSchemaBlockToContain(
      source,
      'ShipperSpendingRecord',
      'paymentOrderStatus:',
    );
    expectSchemaBlockToContain(
      source,
      'ShipperSpendingRecord',
      'refundStatus:',
    );
    expectSchemaBlockToContain(
      source,
      'ShipperSpendingRecord',
      'settledAtIso:',
    );
    expect(source).toContain(
      'Financial fields come from payment, settlement and refund records; cancelled unpaid orders and legacy_unverified orders are omitted.',
    );
    expect(source).not.toContain(
      'It is a spending snapshot derived from order payment fields and does not represent real payment, escrow, or refund ledger entries.',
    );
    expect(source).toContain(
      'online payment requires fixed pricing with a final non-zero amount',
    );
  });
});

function expectPathBlockToContain(source: string, path: string, expected: string) {
  const pathStart = source.indexOf(`  ${path}:`);

  expect(pathStart).toBeGreaterThanOrEqual(0);

  const nextPathStart = source.indexOf('\n  /', pathStart + 1);
  const pathBlock =
    nextPathStart === -1
      ? source.slice(pathStart)
      : source.slice(pathStart, nextPathStart);

  expect(pathBlock).toContain(expected);
}

function expectPathBlockNotToContain(
  source: string,
  path: string,
  unexpected: string,
) {
  const pathStart = source.indexOf(`  ${path}:`);

  expect(pathStart).toBeGreaterThanOrEqual(0);

  const nextPathStart = source.indexOf('\n  /', pathStart + 1);
  const pathBlock =
    nextPathStart === -1
      ? source.slice(pathStart)
      : source.slice(pathStart, nextPathStart);

  expect(pathBlock).not.toContain(unexpected);
}

function expectSchemaBlockToContain(
  source: string,
  schema: string,
  expected: string,
) {
  const schemaStart = source.indexOf(`    ${schema}:`);

  expect(schemaStart).toBeGreaterThanOrEqual(0);

  const restSource = source.slice(schemaStart + 1);
  const nextSchemaMatch = /\n {4}[^ ]/.exec(restSource);
  const nextSchemaStart =
    nextSchemaMatch == null
      ? -1
      : schemaStart + 1 + nextSchemaMatch.index + 1;
  const schemaBlock =
    nextSchemaStart === -1
      ? source.slice(schemaStart)
      : source.slice(schemaStart, nextSchemaStart);

  expect(schemaBlock).toContain(expected);
}

function expectSchemaBlockNotToContain(
  source: string,
  schema: string,
  unexpected: string,
) {
  const schemaStart = source.indexOf(`    ${schema}:`);

  expect(schemaStart).toBeGreaterThanOrEqual(0);

  const restSource = source.slice(schemaStart + 1);
  const nextSchemaMatch = /\n {4}[^ ]/.exec(restSource);
  const nextSchemaStart =
    nextSchemaMatch == null
      ? -1
      : schemaStart + 1 + nextSchemaMatch.index + 1;
  const schemaBlock =
    nextSchemaStart === -1
      ? source.slice(schemaStart)
      : source.slice(schemaStart, nextSchemaStart);

  expect(schemaBlock).not.toContain(unexpected);
}
