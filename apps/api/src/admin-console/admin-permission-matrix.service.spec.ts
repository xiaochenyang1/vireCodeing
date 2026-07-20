import { AdminPermissionMatrixService } from './admin-permission-matrix.service';

const NOW = new Date('2026-07-18T04:00:00.000Z');

describe('AdminPermissionMatrixService', () => {
  it('builds the first-slice admin permission matrix for current admin tools', async () => {
    const service = new AdminPermissionMatrixService(() => NOW);

    const matrix = await service.getMatrix();

    expect(matrix).toEqual(
      expect.objectContaining({
        generatedAtIso: NOW.toISOString(),
        defaultProfileKey: 'platform_admin',
        profileCount: 1,
        moduleCount: 11,
        capabilityCount: 11,
        writeCapabilityCount: 8,
        highRiskCapabilityCount: 8,
        remainingGaps: ['多角色拆分', '行级 / 数据域权限', '审批流 / 双人复核'],
        profiles: [
          expect.objectContaining({
            key: 'platform_admin',
            userType: 'admin',
            moduleKeys: expect.arrayContaining([
              'permission-matrix',
              'account-management',
              'driver-certification',
              'session-governance',
              'finance',
            ]),
            capabilityKeys: expect.arrayContaining([
              'permission_matrix_read',
              'order_management_manage',
              'account_management_manage',
              'session_governance_manage',
              'finance_manage',
            ]),
          }),
        ],
        modules: expect.arrayContaining([
          expect.objectContaining({
            key: 'permission-matrix',
            route: '/api/admin/permission-matrix-console',
            capabilityCount: 1,
            writeCapabilityCount: 0,
            highRiskCapabilityCount: 0,
          }),
          expect.objectContaining({
            key: 'session-governance',
            route: '/api/admin/session-governance-console',
            capabilityCount: 1,
            writeCapabilityCount: 1,
            highRiskCapabilityCount: 1,
          }),
          expect.objectContaining({
            key: 'order-management',
            route: '/api/admin/order-management-console',
            capabilityCount: 1,
            writeCapabilityCount: 1,
            highRiskCapabilityCount: 1,
          }),
          expect.objectContaining({
            key: 'account-management',
            route: '/api/admin/account-management-console',
            capabilityCount: 1,
            writeCapabilityCount: 1,
            highRiskCapabilityCount: 1,
          }),
          expect.objectContaining({
            key: 'finance',
            route: '/api/admin/finance-console',
            capabilityCount: 1,
            writeCapabilityCount: 1,
            highRiskCapabilityCount: 1,
          }),
        ]),
        capabilities: expect.arrayContaining([
          expect.objectContaining({
            key: 'permission_matrix_read',
            moduleKey: 'permission-matrix',
            moduleTitle: '权限矩阵台',
            consoleRoute: '/api/admin/permission-matrix-console',
            actions: ['read'],
            riskLevel: 'normal',
            apiPaths: ['/admin/permissions/matrix'],
          }),
          expect.objectContaining({
            key: 'session_governance_manage',
            moduleKey: 'session-governance',
            actions: ['read', 'write'],
            riskLevel: 'high',
            apiPaths: expect.arrayContaining([
              '/admin/auth/sessions',
              '/admin/auth/sessions/{sessionId}/revoke',
            ]),
          }),
          expect.objectContaining({
            key: 'order_management_manage',
            moduleKey: 'order-management',
            moduleTitle: '订单管理台',
            consoleRoute: '/api/admin/order-management-console',
            actions: ['read', 'write'],
            riskLevel: 'high',
            apiPaths: expect.arrayContaining([
              '/admin/orders',
              '/admin/orders/report',
              '/admin/orders/export',
              '/admin/orders/{orderId}',
              '/admin/orders/{orderId}/cancel',
            ]),
          }),
          expect.objectContaining({
            key: 'account_management_manage',
            moduleKey: 'account-management',
            moduleTitle: '账号管理台',
            consoleRoute: '/api/admin/account-management-console',
            actions: ['read', 'write'],
            riskLevel: 'high',
            apiPaths: expect.arrayContaining([
              '/admin/auth/accounts',
              '/admin/auth/accounts/report',
              '/admin/auth/accounts/export',
              '/admin/auth/accounts/{userId}',
              '/admin/auth/accounts/{userId}/status',
              '/admin/auth/accounts/{userId}/revoke-sessions',
            ]),
          }),
          expect.objectContaining({
            key: 'evaluation_audit_read',
            moduleKey: 'evaluation-audit',
            actions: ['read'],
            riskLevel: 'sensitive',
          }),
          expect.objectContaining({
            key: 'finance_manage',
            moduleKey: 'finance',
            moduleTitle: '财务操作台',
            consoleRoute: '/api/admin/finance-console',
            actions: ['read', 'write'],
            riskLevel: 'high',
            apiPaths: expect.arrayContaining([
              '/admin/finance/report',
              '/admin/finance/payments',
              '/admin/finance/refunds/{refundId}/retry',
            ]),
          }),
        ]),
      }),
    );
  });
});
