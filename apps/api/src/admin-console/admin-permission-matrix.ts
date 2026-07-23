export type AdminPermissionAction = 'read' | 'write';

export type AdminPermissionRiskLevel = 'normal' | 'sensitive' | 'high';

export type AdminPermissionMatrixModule = {
  key: string;
  title: string;
  route: string;
  summary: string;
  capabilityCount: number;
  writeCapabilityCount: number;
  highRiskCapabilityCount: number;
  capabilityKeys: string[];
};

export type AdminPermissionCapability = {
  key: string;
  title: string;
  moduleKey: string;
  moduleTitle: string;
  consoleRoute: string;
  summary: string;
  actions: AdminPermissionAction[];
  riskLevel: AdminPermissionRiskLevel;
  apiPaths: string[];
};

export type AdminPermissionMatrixProfile = {
  key: string;
  title: string;
  userType: 'admin';
  summary: string;
  moduleKeys: string[];
  capabilityKeys: string[];
  pendingGaps: string[];
};

export type AdminPermissionMatrix = {
  generatedAtIso: string;
  defaultProfileKey: string;
  profileCount: number;
  moduleCount: number;
  capabilityCount: number;
  writeCapabilityCount: number;
  highRiskCapabilityCount: number;
  profiles: AdminPermissionMatrixProfile[];
  modules: AdminPermissionMatrixModule[];
  capabilities: AdminPermissionCapability[];
  remainingGaps: string[];
};

export type AdminPermissionMatrixSummary = Pick<
  AdminPermissionMatrix,
  | 'profileCount'
  | 'moduleCount'
  | 'capabilityCount'
  | 'writeCapabilityCount'
  | 'highRiskCapabilityCount'
>;

type AdminPermissionModuleCatalogItem = Pick<
  AdminPermissionMatrixModule,
  'key' | 'title' | 'route' | 'summary'
>;

type AdminPermissionCapabilityCatalogItem = Pick<
  AdminPermissionCapability,
  'key' | 'title' | 'moduleKey' | 'summary' | 'actions' | 'riskLevel' | 'apiPaths'
>;

type AdminPermissionProfileCatalogItem = Pick<
  AdminPermissionMatrixProfile,
  'key' | 'title' | 'userType' | 'summary' | 'moduleKeys' | 'capabilityKeys' | 'pendingGaps'
>;

const adminPermissionModules: AdminPermissionModuleCatalogItem[] = [
  {
    key: 'permission-matrix',
    title: '权限矩阵台',
    route: '/api/admin/permission-matrix-console',
    summary:
      '把现有后台工具和高风险写操作拉成统一权限清单，方便后面拆角色和做审批流。',
  },
  {
    key: 'driver-certification',
    title: '司机认证审核台',
    route: '/api/admin/driver-certification-console',
    summary:
      '读取司机认证队列、附件和审核事件，并可单条或按当前筛选结果批量通过 / 驳回实名、车辆认证。',
  },
  {
    key: 'order-management',
    title: '订单管理台',
    route: '/api/admin/order-management-console',
    summary:
      '按状态、时间和关键字检索后台订单列表/详情、读取筛选报表和导出 CSV，并可原子批量取消当前筛选结果里的 waiting 订单。',
  },
  {
    key: 'session-governance',
    title: '后台会话治理台',
    route: '/api/admin/session-governance-console',
    summary: '查看活跃会话、设备风险摘要和治理审计，并可按会话执行强退。',
  },
  {
    key: 'account-management',
    title: '账号管理台',
    route: '/api/admin/account-management-console',
    summary:
      '查看平台账号目录、活跃会话、治理审计、筛选报表，并可导出 CSV、单账号治理和后端原子批量冻结解冻/撤销会话。',
  },
  {
    key: 'order-attachment',
    title: '订单附件审计台',
    route: '/api/admin/order-attachment-console',
    summary: '筛附件订单、查看文件元数据、missingFileIds 和本地预览。',
  },
  {
    key: 'file-maintenance',
    title: '文件维护台',
    route: '/api/admin/file-maintenance-console',
    summary: '查看文件积压、用途报表并执行 expired pending / rejected 对象治理。',
  },
  {
    key: 'support-ticket',
    title: '帮助中心工单台',
    route: '/api/admin/support-ticket-console',
    summary: '查看帮助中心工单列表/详情，并推进 pending / processing / resolved 流程。',
  },
  {
    key: 'order-exception-case',
    title: '异常客服工单台',
    route: '/api/admin/order-exception-case-console',
    summary: '读取异常工单、查看详情并推进 processing / resolved / closed 流程。',
  },
  {
    key: 'shipper-coupon',
    title: '货主优惠券发放台',
    route: '/api/admin/shipper-coupon-console',
    summary: '手工发券、批量发券并读取核销报表。',
  },
  {
    key: 'evaluation-audit',
    title: '评价审计台',
    route: '/api/admin/evaluation-audit-console',
    summary: '只读审计货主/司机评价记录、标签和图片引用。',
  },
  {
    key: 'finance',
    title: '财务操作台',
    route: '/api/admin/finance-console',
    summary: '读取支付/退款/结算/提现、财务报表和资金流水，并执行退款重试、单条或原子批量提现审核。',
  },
];

const adminPermissionCapabilities: AdminPermissionCapabilityCatalogItem[] = [
  {
    key: 'permission_matrix_read',
    title: '查看后台权限矩阵',
    moduleKey: 'permission-matrix',
    summary: '读取当前后台档位、已覆盖模块和后续待补的权限缺口。',
    actions: ['read'],
    riskLevel: 'normal',
    apiPaths: ['/admin/permissions/matrix'],
  },
  {
    key: 'driver_certification_manage',
    title: '审核司机实名认证与车辆认证',
    moduleKey: 'driver-certification',
    summary:
      '读取待审队列、认证附件和审核事件，并能执行实名/车辆单条或批量通过、驳回。',
    actions: ['read', 'write'],
    riskLevel: 'high',
    apiPaths: [
      '/admin/driver-certifications',
      '/admin/driver-certifications/{driverId}/attachments',
      '/admin/driver-certifications/{driverId}/review-events',
      '/admin/driver-certifications/batch-review',
      '/admin/driver-certifications/{driverId}/identity/review',
      '/admin/driver-certifications/{driverId}/vehicle/review',
    ],
  },
  {
    key: 'order_management_manage',
    title: '查看并取消待接单后台订单',
    moduleKey: 'order-management',
    summary:
      '按状态、时间和关键字检索订单列表，查看单笔详情、筛选报表、导出当前筛选 CSV，并可单条取消或原子批量取消 waiting 订单。',
    actions: ['read', 'write'],
    riskLevel: 'high',
    apiPaths: [
      '/admin/orders',
      '/admin/orders/report',
      '/admin/orders/export',
      '/admin/orders/{orderId}',
      '/admin/orders/batch-cancel',
      '/admin/orders/{orderId}/cancel',
    ],
  },
  {
    key: 'session_governance_manage',
    title: '查看并治理后台活跃会话',
    moduleKey: 'session-governance',
    summary:
      '读取活跃 refresh 会话、设备风险摘要和治理审计，并可按会话执行强退。',
    actions: ['read', 'write'],
    riskLevel: 'high',
    apiPaths: [
      '/admin/auth/sessions',
      '/admin/auth/sessions/audit-events',
      '/admin/auth/sessions/{sessionId}/revoke',
      '/admin/auth/sessions/revoke-other-sessions',
    ],
  },
  {
    key: 'account_management_manage',
    title: '查看并治理平台账号',
    moduleKey: 'account-management',
    summary:
      '读取平台账号目录、账号详情、筛选报表和治理审计，并能导出 CSV、执行冻结、解冻，以及后端原子批量冻结解冻/按账号撤销会话。',
    actions: ['read', 'write'],
    riskLevel: 'high',
    apiPaths: [
      '/admin/auth/accounts',
      '/admin/auth/accounts/report',
      '/admin/auth/accounts/export',
      '/admin/auth/accounts/batch-status',
      '/admin/auth/accounts/batch-revoke-sessions',
      '/admin/auth/accounts/{userId}',
      '/admin/auth/accounts/{userId}/status',
      '/admin/auth/accounts/{userId}/revoke-sessions',
    ],
  },
  {
    key: 'order_attachment_audit_read',
    title: '只读审计订单附件',
    moduleKey: 'order-attachment',
    summary: '读取附件订单摘要、单笔附件详情、文件元数据和 missing 文件引用。',
    actions: ['read'],
    riskLevel: 'sensitive',
    apiPaths: ['/admin/orders/attachments', '/admin/orders/{orderId}/attachments'],
  },
  {
    key: 'file_maintenance_manage',
    title: '治理文件积压与脏对象',
    moduleKey: 'file-maintenance',
    summary:
      '读取文件维护摘要/报表/列表，并可执行 reject expired pending、删除 rejected 对象和批量治理。',
    actions: ['read', 'write'],
    riskLevel: 'high',
    apiPaths: [
      '/files/maintenance/summary',
      '/files/maintenance/report',
      '/files/maintenance/files',
      '/files/maintenance/reject-expired-pending',
      '/files/maintenance/delete-rejected-objects',
      '/files/maintenance/batch-governance',
    ],
  },
  {
    key: 'support_ticket_manage',
    title: '处理帮助中心工单',
    moduleKey: 'support-ticket',
    summary: '读取帮助中心工单列表/详情，并能执行 process、resolve 状态流转。',
    actions: ['read', 'write'],
    riskLevel: 'high',
    apiPaths: [
      '/admin/support-tickets',
      '/admin/support-tickets/{ticketId}',
      '/admin/support-tickets/{ticketId}/process',
      '/admin/support-tickets/{ticketId}/resolve',
    ],
  },
  {
    key: 'order_exception_case_manage',
    title: '处理异常客服工单',
    moduleKey: 'order-exception-case',
    summary:
      '读取异常工单列表/详情，并能执行 process、resolve、close 状态流转。',
    actions: ['read', 'write'],
    riskLevel: 'high',
    apiPaths: [
      '/admin/order-exception-cases',
      '/admin/order-exception-cases/{caseId}',
      '/admin/order-exception-cases/{caseId}/process',
      '/admin/order-exception-cases/{caseId}/resolve',
      '/admin/order-exception-cases/{caseId}/close',
    ],
  },
  {
    key: 'shipper_coupon_manage',
    title: '发放并审计货主优惠券',
    moduleKey: 'shipper-coupon',
    summary: '单发、批量发放优惠券，并读取核销报表和货主排行。',
    actions: ['read', 'write'],
    riskLevel: 'high',
    apiPaths: [
      '/admin/shipper-coupons',
      '/admin/shipper-coupons/batch-issue',
      '/admin/shipper-coupons/report',
    ],
  },
  {
    key: 'evaluation_audit_read',
    title: '只读审计评价记录',
    moduleKey: 'evaluation-audit',
    summary: '读取货主/司机评价方向、评分、内容、标签和图片文件引用。',
    actions: ['read'],
    riskLevel: 'sensitive',
    apiPaths: ['/admin/evaluations'],
  },
  {
    key: 'finance_manage',
    title: '读取并操作财务流水',
    moduleKey: 'finance',
    summary:
      '读取支付/退款/结算/提现、财务报表和资金流水，并能执行退款重试、提现单条通过/驳回和原子批量审核。',
    actions: ['read', 'write'],
    riskLevel: 'high',
    apiPaths: [
      '/admin/finance/report',
      '/admin/finance/payments',
      '/admin/finance/refunds',
      '/admin/finance/refunds/{refundId}/retry',
      '/admin/finance/settlements',
      '/admin/finance/withdrawals',
      '/admin/finance/withdrawals/batch-review',
      '/admin/finance/withdrawals/{withdrawalId}/approve',
      '/admin/finance/withdrawals/{withdrawalId}/reject',
      '/admin/finance/ledger-transactions/{transactionId}',
    ],
  },
];

const adminPermissionProfiles: AdminPermissionProfileCatalogItem[] = [
  {
    key: 'platform_admin',
    title: '平台管理员（第一片）',
    userType: 'admin',
    summary:
      '当前所有 userType=admin 的后台会话仍共享同一档位；这片先把现有后台工具和高风险写操作边界拉平，后面再拆多角色和审批流。',
    moduleKeys: adminPermissionModules.map(module => module.key),
    capabilityKeys: adminPermissionCapabilities.map(capability => capability.key),
    pendingGaps: ['多角色拆分', '行级 / 数据域权限', '审批流 / 双人复核'],
  },
];

export function getAdminPermissionMatrixSummary(): AdminPermissionMatrixSummary {
  const modules = buildModules();
  const capabilities = buildCapabilities();

  return {
    profileCount: adminPermissionProfiles.length,
    moduleCount: modules.length,
    capabilityCount: capabilities.length,
    writeCapabilityCount: capabilities.filter(capability =>
      capability.actions.includes('write'),
    ).length,
    highRiskCapabilityCount: capabilities.filter(
      capability => capability.riskLevel === 'high',
    ).length,
  };
}

export function buildAdminPermissionMatrix(
  generatedAtIso: string,
): AdminPermissionMatrix {
  const modules = buildModules();
  const capabilities = buildCapabilities();
  const summary = getAdminPermissionMatrixSummary();
  const profiles = adminPermissionProfiles.map(profile => ({
    ...profile,
    moduleKeys: [...profile.moduleKeys],
    capabilityKeys: [...profile.capabilityKeys],
    pendingGaps: [...profile.pendingGaps],
  }));

  return {
    generatedAtIso,
    defaultProfileKey: profiles[0]?.key ?? 'platform_admin',
    profileCount: summary.profileCount,
    moduleCount: summary.moduleCount,
    capabilityCount: summary.capabilityCount,
    writeCapabilityCount: summary.writeCapabilityCount,
    highRiskCapabilityCount: summary.highRiskCapabilityCount,
    profiles,
    modules,
    capabilities,
    remainingGaps: profiles[0] ? [...profiles[0].pendingGaps] : [],
  };
}

function buildModules(): AdminPermissionMatrixModule[] {
  return adminPermissionModules.map(module => {
    const moduleCapabilities = adminPermissionCapabilities.filter(
      capability => capability.moduleKey === module.key,
    );

    return {
      ...module,
      capabilityCount: moduleCapabilities.length,
      writeCapabilityCount: moduleCapabilities.filter(capability =>
        capability.actions.includes('write'),
      ).length,
      highRiskCapabilityCount: moduleCapabilities.filter(
        capability => capability.riskLevel === 'high',
      ).length,
      capabilityKeys: moduleCapabilities.map(capability => capability.key),
    };
  });
}

function buildCapabilities(): AdminPermissionCapability[] {
  return adminPermissionCapabilities.map(capability => {
    const module = adminPermissionModules.find(
      candidate => candidate.key === capability.moduleKey,
    );

    if (!module) {
      throw new Error(
        `Unknown admin permission module key: ${capability.moduleKey}`,
      );
    }

    return {
      ...capability,
      actions: [...capability.actions],
      apiPaths: [...capability.apiPaths],
      moduleTitle: module.title,
      consoleRoute: module.route,
    };
  });
}
