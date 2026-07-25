import { createPlatformAdminConsoleApi } from '../src/services/platformAdminConsoleApi';

describe('platform admin console api', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('reads admin console overview with bearer token', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(createJsonResponse(createAdminConsoleOverview()));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createApi();

    await expect(api.getAdminConsoleOverview()).resolves.toEqual(
      expect.objectContaining({
        implementedConsoleCount: 2,
        modules: expect.arrayContaining([
          expect.objectContaining({
            key: 'order-management',
            metrics: expect.arrayContaining([
              expect.objectContaining({
                label: '订单总数',
                value: 18,
              }),
            ]),
          }),
        ]),
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/console/overview',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('reads admin permission matrix with bearer token', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(createJsonResponse(createAdminPermissionMatrix()));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createApi();

    await expect(api.getAdminPermissionMatrix()).resolves.toEqual(
      expect.objectContaining({
        defaultProfileKey: 'super_admin',
        profiles: expect.arrayContaining([
          expect.objectContaining({
            key: 'super_admin',
            moduleKeys: ['permission-matrix', 'order-management'],
          }),
        ]),
        capabilities: expect.arrayContaining([
          expect.objectContaining({
            key: 'order_management_manage',
            actions: ['read', 'write'],
            apiPaths: expect.arrayContaining(['/admin/orders']),
          }),
        ]),
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/permissions/matrix',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });
});

function createApi() {
  return createPlatformAdminConsoleApi({
    baseUrl: 'http://localhost:3000/api',
    getAccessToken: () => 'access-token',
  });
}

function createJsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      code: 'OK',
      message: 'success',
      data,
      requestId: 'req-admin-console',
      timestamp: '2026-07-25T08:00:00.000Z',
    }),
  };
}

function createAdminConsoleOverview() {
  return {
    generatedAtIso: '2026-07-25T08:00:00.000Z',
    implementedConsoleCount: 2,
    liveMetricModuleCount: 2,
    remainingCapabilityCount: 3,
    modules: [
      {
        key: 'order-management',
        title: '订单管理台',
        route: '/api/admin/order-management-console',
        stage: 'first_slice',
        summary: '后台订单列表、详情、筛选报表和取消第一片已接上。',
        metrics: [
          {
            label: '订单总数',
            value: 18,
            tone: 'neutral',
          },
        ],
        pendingGaps: ['真实赔付执行 / 退款联动'],
      },
      {
        key: 'permission-matrix',
        title: '权限矩阵台',
        route: '/api/admin/permission-matrix-console',
        stage: 'first_slice',
        summary: '后台模块和高风险能力已经拉成统一矩阵。',
        metrics: [
          {
            label: '能力项',
            value: 12,
            tone: 'positive',
          },
        ],
        pendingGaps: ['多角色审批流'],
      },
    ],
    remainingPlatformGaps: ['地图 / 定位 / 轨迹 / ETA'],
  };
}

function createAdminPermissionMatrix() {
  return {
    generatedAtIso: '2026-07-25T08:05:00.000Z',
    defaultProfileKey: 'super_admin',
    profileCount: 1,
    moduleCount: 2,
    capabilityCount: 2,
    writeCapabilityCount: 1,
    highRiskCapabilityCount: 1,
    profiles: [
      {
        key: 'super_admin',
        title: '超管',
        userType: 'admin',
        summary: '当前后台默认 admin 档位。',
        moduleKeys: ['permission-matrix', 'order-management'],
        capabilityKeys: ['permission_matrix_read', 'order_management_manage'],
        pendingGaps: ['多角色拆分'],
      },
    ],
    modules: [
      {
        key: 'permission-matrix',
        title: '权限矩阵台',
        route: '/api/admin/permission-matrix-console',
        summary: '后台模块和高风险能力统一清单。',
        capabilityCount: 1,
        writeCapabilityCount: 0,
        highRiskCapabilityCount: 0,
        capabilityKeys: ['permission_matrix_read'],
      },
      {
        key: 'order-management',
        title: '订单管理台',
        route: '/api/admin/order-management-console',
        summary: '后台订单读写能力。',
        capabilityCount: 1,
        writeCapabilityCount: 1,
        highRiskCapabilityCount: 1,
        capabilityKeys: ['order_management_manage'],
      },
    ],
    capabilities: [
      {
        key: 'permission_matrix_read',
        title: '查看后台权限矩阵',
        moduleKey: 'permission-matrix',
        moduleTitle: '权限矩阵台',
        consoleRoute: '/api/admin/permission-matrix-console',
        summary: '读取权限矩阵。',
        actions: ['read'],
        riskLevel: 'normal',
        apiPaths: ['/admin/permissions/matrix'],
      },
      {
        key: 'order_management_manage',
        title: '查看并取消待接单后台订单',
        moduleKey: 'order-management',
        moduleTitle: '订单管理台',
        consoleRoute: '/api/admin/order-management-console',
        summary: '读取订单并执行取消。',
        actions: ['read', 'write'],
        riskLevel: 'high',
        apiPaths: ['/admin/orders', '/admin/orders/{orderId}/cancel'],
      },
    ],
    remainingGaps: ['行级权限'],
  };
}
