import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AdminOnlyGuard } from '../auth/role.guard';
import { AdminConsoleController } from './admin-console.controller';
import { renderAdminConsoleHome } from './admin-console-home';
import { renderAdminLoginConsole } from './admin-login-console';
import type { AdminConsoleOverviewService } from './admin-console-overview.service';
import type { AdminPermissionMatrixService } from './admin-permission-matrix.service';
import { renderDriverCertificationAdminConsole } from './driver-certification-admin-console';
import { renderEvaluationAuditAdminConsole } from './evaluation-audit-admin-console';
import { renderFileMaintenanceAdminConsole } from './file-maintenance-admin-console';
import { renderFinanceAdminConsole } from './finance-admin-console';
import { renderOrderManagementAdminConsole } from './order-management-admin-console';
import { renderAccountManagementAdminConsole } from './account-management-admin-console';
import { renderAdminPermissionMatrixConsole } from './permission-matrix-admin-console';
import { renderSessionGovernanceAdminConsole } from './session-governance-admin-console';
import { renderSupportTicketAdminConsole } from './support-ticket-admin-console';

describe('driver certification admin console page', () => {
  it('renders the review console shell and API hooks', () => {
    const html = renderDriverCertificationAdminConsole();

    expect(html).toContain('司机认证审核台');
    expect(html).toContain('adminToken');
    expect(html).toContain('批量审核');
    expect(html).toContain('selectAllDriversInput');
    expect(html).toContain('runBatchReview');
    expect(html).toContain('batchSelectionStatus');
    expect(html).toContain('batchActionStatus');
    expect(html).toContain('/api/admin/driver-certifications');
    expect(html).toContain('/attachments');
    expect(html).toContain('/review-events');
    expect(html).toContain('/batch-review');
    expect(html).toContain('/identity/review');
    expect(html).toContain('/vehicle/review');
    expect(html).toContain('approveIdentity');
    expect(html).toContain('rejectVehicle');
    expect(html).toContain('/api/admin/finance-console');
    expect(html).toContain('/api/admin/order-attachment-console');
  });

  it('uses a dense operational layout instead of a marketing hero', () => {
    const html = renderDriverCertificationAdminConsole();

    expect(html).toContain('class="console-shell"');
    expect(html).toContain('class="queue-panel"');
    expect(html).toContain('class="detail-panel"');
    expect(html).not.toContain('hero');
  });

  it('renders token empty error attachment and event states', () => {
    const html = renderDriverCertificationAdminConsole();

    expect(html).toContain('请先填写 admin access token');
    expect(html).toContain('暂无认证记录');
    expect(html).toContain('暂无附件');
    expect(html).toContain('暂无审核事件');
    expect(html).toContain('原子写入');
    expect(html).toContain('请填写驳回原因');
    expect(html).toContain('先勾选司机再批量审核');
    expect(html).toContain('批量驳回必须填写原因');
  });

  it('keeps API calls under the existing global api prefix', () => {
    const html = renderDriverCertificationAdminConsole();

    expect(html).toContain("const apiBase = '/api'");
    expect(html).not.toContain('http://localhost');
  });
});

describe('evaluation audit admin console page', () => {
  it('renders the evaluation filters and API hook', () => {
    const html = renderEvaluationAuditAdminConsole();

    expect(html).toContain('评价审计台');
    expect(html).toContain('auditDirectionInput');
    expect(html).toContain('auditRatingInput');
    expect(html).toContain('auditKeywordInput');
    expect(html).toContain('/admin/evaluations?');
    expect(html).toContain('/api/admin/file-maintenance-console');
    expect(html).toContain('/api/admin/order-exception-case-console');
  });

  it('ignores stale query responses and clears stale records after errors', () => {
    const html = renderEvaluationAuditAdminConsole();

    expect(html).toContain('let latestAuditRequestId = 0');
    expect(html).toContain('const requestId = ++latestAuditRequestId');
    expect(html).toContain('if (requestId !== latestAuditRequestId) return');
    expect(html).toContain('clearAuditResults()');
  });
});

describe('finance admin console page', () => {
  it('renders finance tabs, filters and admin finance api hooks', () => {
    const html = renderFinanceAdminConsole();

    expect(html).toContain('财务操作台');
    expect(html).toContain('financeTab');
    expect(html).toContain('financeOrderIdInput');
    expect(html).toContain('/admin/finance/report');
    expect(html).toContain('loadFinanceReport');
    expect(html).toContain('financeReportStatus');
    expect(html).toContain('financeReportSummary');
    expect(html).toContain('financeSettlementSummary');
    expect(html).toContain('financeStatusInput');
    expect(html).toContain('financePageInput');
    expect(html).toContain('financePageSizeInput');
    expect(html).toContain('/admin/finance/payments?');
    expect(html).toContain('/admin/finance/refunds?');
    expect(html).toContain('/admin/finance/settlements?');
    expect(html).toContain('/admin/finance/withdrawals?');
    expect(html).toContain('/admin/finance/withdrawals/batch-review');
    expect(html).toContain('/admin/finance/ledger-transactions/');
    expect(html).toContain('stage1AdminSession');
    expect(html).toContain('后台登录页');
    expect(html).toContain('/api/admin/order-attachment-console');
    expect(html).toContain('/api/admin/evaluation-audit-console');
  });

  it('hydrates order-linked finance filters from route state and only applies them on order tabs', () => {
    const html = renderFinanceAdminConsole();

    expect(html).toContain('URLSearchParams');
    expect(html).toContain('location.search');
    expect(html).toContain("query.set('orderId', orderId)");
    expect(html).toContain("currentFinanceTab !== 'withdrawals'");
    expect(html).toContain('applyFinanceRouteState');
  });

  it('renders a finance-to-order drill-down action for linked records', () => {
    const html = renderFinanceAdminConsole();

    expect(html).toContain('viewLinkedOrderButton');
    expect(html).toContain('openSelectedFinanceOrderConsole');
    expect(html).toContain('/api/admin/order-management-console');
    expect(html).toContain("query.set('orderId', orderId)");
    expect(html).toContain('updateViewOrderButton');
  });

  it('renders refund retry and withdrawal review actions without a marketing layout', () => {
    const html = renderFinanceAdminConsole();

    expect(html).toContain('retryRefundAction');
    expect(html).toContain('approveWithdrawalAction');
    expect(html).toContain('rejectWithdrawalAction');
    expect(html).toContain('approveBatchWithdrawalsButton');
    expect(html).toContain('rejectBatchWithdrawalsButton');
    expect(html).toContain('selectAllReviewingWithdrawalsInput');
    expect(html).toContain('withdrawalBatchSelectionStatus');
    expect(html).toContain('runBatchWithdrawalReview');
    expect(html).toContain('toggleSelectAllReviewingWithdrawals');
    expect(html).toContain('toggleWithdrawalBatchSelection');
    expect(html).toContain('expectedVersionInput');
    expect(html).toContain('reasonInput');
    expect(html).toContain('请先填写 admin access token');
    expect(html).toContain('请选择一条财务记录');
    expect(html).toContain('先勾选提现再批量审核');
    expect(html).toContain('class="console-shell"');
    expect(html).not.toContain('hero');
  });

  it('keeps stale responses from overriding newer finance queries', () => {
    const html = renderFinanceAdminConsole();

    expect(html).toContain('let latestFinanceRequestId = 0');
    expect(html).toContain('let latestFinanceReportRequestId = 0');
    expect(html).toContain('const requestId = ++latestFinanceRequestId');
    expect(html).toContain('const requestId = ++latestFinanceReportRequestId');
    expect(html).toContain('if (requestId !== latestFinanceRequestId) return');
    expect(html).toContain('if (requestId !== latestFinanceReportRequestId) return');
    expect(html).toContain('resetFinanceReport');
    expect(html).toContain('clearFinanceSelection()');
    expect(html).toContain('clearLedgerDetail()');
  });
});

describe('support ticket admin console page', () => {
  it('renders help-center support ticket filters and admin workflow hooks', () => {
    const html = renderSupportTicketAdminConsole();

    expect(html).toContain('帮助中心工单台');
    expect(html).toContain('/admin/support-tickets?');
    expect(html).toContain('/admin/support-tickets/');
    expect(html).toContain('/process');
    expect(html).toContain('/resolve');
    expect(html).toContain('loadSupportTickets');
    expect(html).toContain('loadSupportTicketDetail');
    expect(html).toContain('mutateSupportTicket');
    expect(html).toContain('supportTicketStatusInput');
    expect(html).toContain('supportTicketKeywordInput');
    expect(html).toContain('supportTicketPageSizeInput');
    expect(html).toContain('supportTicketActionContent');
    expect(html).toContain('supportTicketBaseUpdatedAtIso');
    expect(html).toContain('/api/admin/order-exception-case-console');
    expect(html).toContain('/api/admin/finance-console');
    expect(html).not.toContain('hero');
  });

  it('ignores stale support ticket requests and syncs route state', () => {
    const html = renderSupportTicketAdminConsole();

    expect(html).toContain('let latestSupportTicketRequestId = 0');
    expect(html).toContain('let latestSupportTicketDetailRequestId = 0');
    expect(html).toContain('const requestId = ++latestSupportTicketRequestId');
    expect(html).toContain('const requestId = ++latestSupportTicketDetailRequestId');
    expect(html).toContain('if (requestId !== latestSupportTicketRequestId) return');
    expect(html).toContain('if (requestId !== latestSupportTicketDetailRequestId) return');
    expect(html).toContain('applySupportTicketRouteState');
    expect(html).toContain('syncSupportTicketRouteState');
    expect(html).toContain('clearSupportTicketSelection()');
  });
});

describe('session governance admin console page', () => {
  it('renders active session list and revoke api hooks', () => {
    const html = renderSessionGovernanceAdminConsole();

    expect(html).toContain('后台会话治理台');
    expect(html).toContain('/admin/auth/sessions');
    expect(html).toContain('/admin/auth/sessions/audit-events');
    expect(html).toContain('/revoke-other-sessions');
    expect(html).toContain('/revoke');
    expect(html).toContain('loadAdminSessions');
    expect(html).toContain('loadSessionAuditEvents');
    expect(html).toContain('revokeAdminSession');
    expect(html).toContain('revokeOtherAdminSessions');
    expect(html).toContain('sessionList');
    expect(html).toContain('currentDeviceId');
    expect(html).toContain('sessionScopeInput');
    expect(html).toContain('sessionUserTypeInput');
    expect(html).toContain('sessionKeywordInput');
    expect(html).toContain('sessionRiskOnlyInput');
    expect(html).toContain('sessionRiskTagInput');
    expect(html).toContain('sessionAuditActionInput');
    expect(html).toContain('sessionAuditResultInput');
    expect(html).toContain('sessionAuditKeywordInput');
    expect(html).toContain('sessionRiskSummary');
    expect(html).toContain('sessionAuditList');
    expect(html).toContain('changeSessionPage');
    expect(html).toContain('changeSessionAuditPage');
    expect(html).toContain('stage1AdminSession');
    expect(html).toContain('/api/admin/console');
    expect(html).toContain('/api/admin/finance-console');
    expect(html).not.toContain('hero');
  });

  it('ignores stale session list responses and highlights current device context', () => {
    const html = renderSessionGovernanceAdminConsole();

    expect(html).toContain('let latestSessionRequestId = 0');
    expect(html).toContain('const requestId = ++latestSessionRequestId');
    expect(html).toContain('if (requestId !== latestSessionRequestId) return');
    expect(html).toContain('let latestSessionAuditRequestId = 0');
    expect(html).toContain('const requestId = ++latestSessionAuditRequestId');
    expect(html).toContain('if (requestId !== latestSessionAuditRequestId) return');
    expect(html).toContain('当前设备');
    expect(html).toContain('function maskDeviceId(value)');
    expect(html).toContain('session.deviceId === maskDeviceId(currentDeviceId)');
    expect(html).toContain('data.currentDeviceId || maskDeviceId(currentDeviceId)');
    expect(html).toContain('renderSessionRiskSummary');
    expect(html).toContain('formatSessionRiskTag');
    expect(html).toContain('renderSessionAuditPagination');
    expect(html).toContain('renderSessionAuditList');
    expect(html).toContain('refresh 失效后需要重新登录');
  });
});

describe('account management admin console page', () => {
  it('renders account filters, detail drill-down and account governance api hooks', () => {
    const html = renderAccountManagementAdminConsole();

    expect(html).toContain('账号管理台');
    expect(html).toContain('/admin/auth/accounts?');
    expect(html).toContain('/admin/auth/accounts/report?');
    expect(html).toContain('/admin/auth/accounts/export?');
    expect(html).toContain('/admin/auth/accounts/');
    expect(html).toContain('/admin/auth/accounts/batch-status');
    expect(html).toContain('/admin/auth/accounts/batch-revoke-sessions');
    expect(html).toContain('/status');
    expect(html).toContain('/revoke-sessions');
    expect(html).toContain('loadAdminAuthAccounts');
    expect(html).toContain('loadAccountReport');
    expect(html).toContain('exportAdminAuthAccountsCsv');
    expect(html).toContain('loadAdminAuthAccountDetail');
    expect(html).toContain('updateAdminAuthAccountStatus');
    expect(html).toContain('revokeAdminAuthAccountSessions');
    expect(html).toContain('toggleAccountSelection');
    expect(html).toContain('toggleSelectAllCurrentPage');
    expect(html).toContain('runBatchStatusUpdate');
    expect(html).toContain('runBatchRevokeSessions');
    expect(html).toContain('accountSummaryGrid');
    expect(html).toContain('accountList');
    expect(html).toContain('accountSessionList');
    expect(html).toContain('accountAuditList');
    expect(html).toContain('accountBulkSelectionStatus');
    expect(html).toContain('accountBulkActionStatus');
    expect(html).toContain('accountSelectAllInput');
    expect(html).toContain('accountUserTypeInput');
    expect(html).toContain('accountStatusInput');
    expect(html).toContain('accountRiskOnlyInput');
    expect(html).toContain('accountRiskTagInput');
    expect(html).toContain('accountRiskLevelInput');
    expect(html).toContain('accountReportTopAccountsLimitInput');
    expect(html).toContain('accountReportAuditEventLimitInput');
    expect(html).toContain('accountKeepSessionIdInput');
    expect(html).toContain('accountGovernanceReport');
    expect(html).toContain('accountTopRiskReport');
    expect(html).toContain('stage1AdminSession');
    expect(html).toContain('/api/admin/session-governance-console');
    expect(html).toContain('/api/admin/permission-matrix-console');
    expect(html).toContain('整批校验和原子写入');
    expect(html).not.toContain('顺序调用单账号治理接口');
    expect(html).not.toContain('hero');
  });

  it('ignores stale account list/detail/report responses and resets detail state on failures', () => {
    const html = renderAccountManagementAdminConsole();

    expect(html).toContain('let latestAccountRequestId = 0');
    expect(html).toContain('const requestId = ++latestAccountRequestId');
    expect(html).toContain('if (requestId !== latestAccountRequestId) return');
    expect(html).toContain('let latestAccountDetailRequestId = 0');
    expect(html).toContain('const requestId = ++latestAccountDetailRequestId');
    expect(html).toContain(
      'if (requestId !== latestAccountDetailRequestId) return',
    );
    expect(html).toContain('let latestAccountReportRequestId = 0');
    expect(html).toContain('const requestId = ++latestAccountReportRequestId');
    expect(html).toContain(
      'if (requestId !== latestAccountReportRequestId) return',
    );
    expect(html).toContain('selectedAccountIds');
    expect(html).toContain('currentAccountItems');
    expect(html).toContain('refreshAccountWorkspace()');
    expect(html).toContain('refreshAccountWorkspaceAfterMutation');
    expect(html).toContain('resetAccountReport(');
    expect(html).toContain('renderAccountReportError');
    expect(html).toContain('resetAccountDetail()');
    expect(html).toContain('风险账号');
    expect(html).toContain('不能禁用当前管理员账号');
  });
});

describe('permission matrix admin console page', () => {
  it('renders the permission matrix filters and protected api hook', () => {
    const html = renderAdminPermissionMatrixConsole();

    expect(html).toContain('权限矩阵台');
    expect(html).toContain('/admin/permissions/matrix');
    expect(html).toContain('permissionActionInput');
    expect(html).toContain('permissionRiskInput');
    expect(html).toContain('loadPermissionMatrix');
    expect(html).toContain('permissionProfileList');
    expect(html).toContain('permissionModuleList');
    expect(html).toContain('permissionCapabilityList');
    expect(html).toContain('formatPermissionRiskLevel');
    expect(html).toContain('renderPermissionProfiles');
    expect(html).toContain('renderPermissionModules');
    expect(html).toContain('renderPermissionCapabilities');
    expect(html).toContain('stage1AdminSession');
    expect(html).toContain('/api/admin/session-governance-console');
    expect(html).toContain('/api/admin/account-management-console');
    expect(html).toContain('/api/admin/finance-console');
    expect(html).not.toContain('hero');
  });

  it('ignores stale permission matrix responses and resets the page on failures', () => {
    const html = renderAdminPermissionMatrixConsole();

    expect(html).toContain('let latestPermissionMatrixRequestId = 0');
    expect(html).toContain(
      'const requestId = ++latestPermissionMatrixRequestId',
    );
    expect(html).toContain(
      'if (requestId !== latestPermissionMatrixRequestId) return',
    );
    expect(html).toContain('currentPermissionMatrix = null');
    expect(html).toContain('后台权限矩阵拉取失败，别拿猜的当权限系统。');
  });
});

describe('file maintenance admin console page', () => {
  it('renders maintenance summary, query filters and cleanup action hooks', () => {
    const html = renderFileMaintenanceAdminConsole();

    expect(html).toContain('文件维护台');
    expect(html).toContain('adminToken');
    expect(html).toContain('/files/maintenance/files?');
    expect(html).toContain('/files/maintenance/summary');
    expect(html).toContain('/files/maintenance/reject-expired-pending');
    expect(html).toContain('/files/maintenance/delete-rejected-objects');
    expect(html).toContain('/files/maintenance/batch-governance');
    expect(html).toContain('/files/maintenance/report?');
    expect(html).toContain('maintenanceStatusInput');
    expect(html).toContain('maintenancePurposeInput');
    expect(html).toContain('maintenanceOwnerUserIdInput');
    expect(html).toContain('maintenanceKeywordInput');
    expect(html).toContain('maintenancePageInput');
    expect(html).toContain('maintenancePageSizeInput');
    expect(html).toContain('maintenanceBatchActionInput');
    expect(html).toContain('maintenanceSelectionStatus');
    expect(html).toContain('maintenanceTopOwnersLimitInput');
    expect(html).toContain('loadFileMaintenanceSummary');
    expect(html).toContain('loadMaintenanceReport');
    expect(html).toContain('loadMaintenanceFiles');
    expect(html).toContain('rejectExpiredPendingFiles');
    expect(html).toContain('deleteRejectedObjects');
    expect(html).toContain('runMaintenanceBatchGovernance');
    expect(html).toContain('summaryCards');
    expect(html).toContain('maintenanceReportTimestamp');
    expect(html).toContain('maintenancePurposeReport');
    expect(html).toContain('maintenanceOwnerReport');
    expect(html).toContain('maintenanceFileList');
    expect(html).toContain('maintenancePaginationStatus');
    expect(html).toContain('stage1AdminSession');
    expect(html).toContain('后台登录页');
    expect(html).toContain('/api/admin/driver-certification-console');
    expect(html).toContain('/api/admin/finance-console');
  });

  it('ignores stale maintenance summary/list responses and keeps an operational layout', () => {
    const html = renderFileMaintenanceAdminConsole();

    expect(html).toContain('let latestSummaryRequestId = 0');
    expect(html).toContain('const requestId = ++latestSummaryRequestId');
    expect(html).toContain('if (requestId !== latestSummaryRequestId) return');
    expect(html).toContain('let latestReportRequestId = 0');
    expect(html).toContain('const requestId = ++latestReportRequestId');
    expect(html).toContain('if (requestId !== latestReportRequestId) return');
    expect(html).toContain('let latestFilesRequestId = 0');
    expect(html).toContain('const requestId = ++latestFilesRequestId');
    expect(html).toContain('if (requestId !== latestFilesRequestId) return');
    expect(html).toContain('rejectExpiredPendingResult');
    expect(html).toContain('deleteRejectedObjectsResult');
    expect(html).toContain('maintenanceBatchGovernanceResult');
    expect(html).toContain('toggleMaintenanceFileSelection');
    expect(html).toContain('selectCurrentMaintenancePage');
    expect(html).toContain('clearMaintenanceSelection');
    expect(html).toContain('renderMaintenanceReport');
    expect(html).toContain('renderMaintenanceFiles');
    expect(html).toContain('renderMaintenanceFilePagination');
    expect(html).toContain('class="console-shell"');
    expect(html).not.toContain('hero');
  });
});

describe('order management admin console page', () => {
  it('renders read-only order list, filters and detail api hooks', () => {
    const html = renderOrderManagementAdminConsole();

    expect(html).toContain('订单管理台');
    expect(html).toContain('orderListKeywordInput');
    expect(html).toContain('orderListStatusInput');
    expect(html).toContain('orderListStatusesInput');
    expect(html).toContain('orderListCreatedFromInput');
    expect(html).toContain('orderListCreatedToInput');
    expect(html).toContain('orderListPageInput');
    expect(html).toContain('orderListPageSizeInput');
    expect(html).toContain('/admin/orders?');
    expect(html).toContain('/admin/orders/report?');
    expect(html).toContain('/admin/orders/export?');
    expect(html).toContain('/admin/orders/');
    expect(html).toContain('loadOrderList');
    expect(html).toContain('loadOrderReport');
    expect(html).toContain('loadOrderDetail');
    expect(html).toContain('exportAdminOrdersCsv');
    expect(html).toContain('orderSelectAllWaitingInput');
    expect(html).toContain('orderBatchCancelReasonInput');
    expect(html).toContain('orderBatchCancelDescriptionInput');
    expect(html).toContain('toggleOrderSelection');
    expect(html).toContain('toggleSelectAllWaitingOrders');
    expect(html).toContain('runBatchCancelWaitingOrders');
    expect(html).toContain('orderBatchSelectionStatus');
    expect(html).toContain('orderBatchActionStatus');
    expect(html).toContain('/admin/orders/batch-cancel');
    expect(html).toContain('orderReportTopShippersLimitInput');
    expect(html).toContain('orderReportSummary');
    expect(html).toContain('orderTopShippersReport');
    expect(html).toContain('viewSelectedOrderFinanceButton');
    expect(html).toContain('viewSelectedOrderExceptionCaseButton');
    expect(html).toContain('selectedOrderSummary');
    expect(html).toContain('selectedOrderFinanceStatus');
    expect(html).toContain('selectedOrderFinanceSummary');
    expect(html).toContain('selectedOrderFinanceRecords');
    expect(html).toContain('selectedOrderEvents');
    expect(html).toContain('stage1AdminSession');
    expect(html).toContain('/api/admin/order-attachment-console');
    expect(html).toContain('/api/admin/file-maintenance-console');
    expect(html).not.toContain('hero');
  });

  it('guards mutually exclusive status and statuses filters in the console', () => {
    const html = renderOrderManagementAdminConsole();

    expect(html).toContain('status 和 statuses 只能二选一');
    expect(html).toContain("query.set('status', status)");
    expect(html).toContain("query.set('statuses', statuses)");
    expect(html).toContain("query.set('createdFromIso', createdFromIso)");
    expect(html).toContain("query.set('createdToIso', createdToIso)");
    expect(html).toContain("query.set('page', String(page))");
    expect(html).toContain("query.set('pageSize', String(pageSize))");
    expect(html).toContain('buildOrderReportQuery');
    expect(html).toContain('buildOrderExportQuery');
    expect(html).toContain('let latestReportRequestId = 0');
    expect(html).toContain('const requestId = ++latestReportRequestId');
    expect(html).toContain('if (requestId !== latestReportRequestId) return');
    expect(html).toContain('renderOrderListPagination');
    expect(html).toContain('后端会先整批校验状态和版本，再原子写入');
    expect(html).toContain('只支持取消 waiting 订单');
    expect(html).toContain('先勾选 waiting 订单再批量取消');
    expect(html).toContain('createBatchCancelIdempotencyKey');
    expect(html).toContain('正在请求后端整批校验并原子写入');
    expect(html).toContain('后端已整批校验并原子写入');
  });

  it('renders a selected-order finance drill-down action', () => {
    const html = renderOrderManagementAdminConsole();

    expect(html).toContain('viewSelectedOrderFinanceButton');
    expect(html).toContain('openSelectedOrderFinanceConsole');
    expect(html).toContain('/api/admin/finance-console');
    expect(html).toContain("query.set('tab', tab)");
    expect(html).toContain("query.set('orderId', orderId)");
  });

  it('renders a selected-order exception-case drill-down and compensation snapshot hook', () => {
    const html = renderOrderManagementAdminConsole();

    expect(html).toContain('viewSelectedOrderExceptionCaseButton');
    expect(html).toContain('openSelectedOrderExceptionCaseConsole');
    expect(html).toContain('/api/admin/order-exception-case-console');
    expect(html).toContain("query.set('keyword', caseNo)");
    expect(html).toContain('formatCompensationSummary');
    expect(html).toContain('latestExceptionCase.compensationStatus');
  });

  it('renders an order-linked finance aggregation view with parallel admin finance lookups', () => {
    const html = renderOrderManagementAdminConsole();

    expect(html).toContain('按单资金视图');
    expect(html).toContain('selectedOrderFinanceStatus');
    expect(html).toContain('selectedOrderFinanceSummary');
    expect(html).toContain('selectedOrderFinanceRecords');
    expect(html).toContain('loadSelectedOrderFinance');
    expect(html).toContain('Promise.all([');
    expect(html).toContain('/admin/finance/payments?');
    expect(html).toContain('/admin/finance/refunds?');
    expect(html).toContain('/admin/finance/settlements?');
    expect(html).not.toContain('/admin/finance/withdrawals?');
  });

  it('hydrates selected order state from route query and can deep-link back from finance', () => {
    const html = renderOrderManagementAdminConsole();

    expect(html).toContain('applyOrderManagementRouteState');
    expect(html).toContain('readOrderManagementRouteState');
    expect(html).toContain('location.search');
    expect(html).toContain("query.set('orderId', state.selectedOrderId)");
    expect(html).toContain('loadOrderDetail(orderRouteState.orderId)');
    expect(html).toContain('loadSelectedOrderFinance(orderId);');
  });
});

describe('admin console home page', () => {
  it('renders a live overview hub for the existing operational consoles', () => {
    const html = renderAdminConsoleHome();

    expect(html).toContain('运营后台工具台');
    expect(html).toContain('adminToken');
    expect(html).toContain('/admin/console/overview');
    expect(html).toContain('loadAdminConsoleOverview');
    expect(html).toContain('overviewSummaryGrid');
    expect(html).toContain('remainingGapList');
    expect(html).toContain('/api/admin/driver-certification-console');
    expect(html).toContain('/api/admin/order-management-console');
    expect(html).toContain('/api/admin/order-attachment-console');
    expect(html).toContain('/api/admin/session-governance-console');
    expect(html).toContain('/api/admin/account-management-console');
    expect(html).toContain('/api/admin/permission-matrix-console');
    expect(html).toContain('/api/admin/file-maintenance-console');
    expect(html).toContain('/api/admin/support-ticket-console');
    expect(html).toContain('/api/admin/shipper-coupon-console');
    expect(html).toContain('/api/admin/order-exception-case-console');
    expect(html).toContain('/api/admin/evaluation-audit-console');
    expect(html).toContain('/api/admin/finance-console');
    expect(html).toContain('统一入口 + 实时概览');
    expect(html).toContain('stage1AdminSession');
    expect(html).toContain('clearStoredAdminSession');
    expect(html).not.toContain('hero');
  });

  it('ignores stale admin overview responses and falls back to default cards on errors', () => {
    const html = renderAdminConsoleHome();

    expect(html).toContain('let latestOverviewRequestId = 0');
    expect(html).toContain('const requestId = ++latestOverviewRequestId');
    expect(html).toContain('if (requestId !== latestOverviewRequestId) return');
    expect(html).toContain('resetOverviewToDefaults');
    expect(html).not.toContain('hero');
  });
});

describe('admin login console page', () => {
  it('renders the dedicated admin password login shell and session storage hooks', () => {
    const html = renderAdminLoginConsole();

    expect(html).toContain('后台登录');
    expect(html).toContain("/auth/admin/password-login");
    expect(html).toContain('rememberSessionInput');
    expect(html).toContain('stage1AdminSession');
    expect(html).toContain('13900139000');
    expect(html).toContain('Admin123');
    expect(html).toContain('/api/admin/console');
    expect(html).toContain('/api/admin/file-maintenance-console');
    expect(html).not.toContain('hero');
  });
});

describe('AdminConsoleController', () => {
  it('protects admin console overview with access-token and admin guards', () => {
    const guards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        AdminConsoleController.prototype.getAdminConsoleOverview,
      ) ?? [];

    expect(guards).toEqual([AccessTokenGuard, AdminOnlyGuard]);
  });

  it('protects admin permission matrix with access-token and admin guards', () => {
    const guards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        AdminConsoleController.prototype.getAdminPermissionMatrix,
      ) ?? [];

    expect(guards).toEqual([AccessTokenGuard, AdminOnlyGuard]);
  });

  it('serves the driver certification console html', () => {
    const controller = new AdminConsoleController();

    expect(controller.getDriverCertificationConsole()).toContain(
      '司机认证审核台',
    );
  });

  it('serves the order attachment audit console html', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getOrderAttachmentAuditConsole: () => string;
      }
    ).getOrderAttachmentAuditConsole();

    expect(html).toContain('订单附件审计台');
    expect(html).toContain('adminToken');
    expect(html).toContain('orderIdInput');
    expect(html).toContain('auditKeywordInput');
    expect(html).toContain('auditStatusInput');
    expect(html).toContain('auditShipperIdInput');
    expect(html).toContain('auditCreatedFromInput');
    expect(html).toContain('auditCreatedToInput');
    expect(html).toContain('auditMissingStateInput');
    expect(html).toContain('只看 missingFileIds');
    expect(html).toContain('只看无缺失引用');
    expect(html).toContain('auditPageInput');
    expect(html).toContain('auditPageSizeInput');
    expect(html).toContain('auditPaginationStatus');
    expect(html).toContain('auditPreviousPage');
    expect(html).toContain('auditNextPage');
    expect(html).toContain('loadAuditList');
    expect(html).toContain("const apiBase = '/api'");
    expect(html).toContain("/admin/orders/attachments");
    expect(html).toContain('/admin/orders/');
    expect(html).toContain('/attachments');
    expect(html).toContain('auditSummaryList');
    expect(html).toContain("query.set('status', status)");
    expect(html).toContain("query.set('shipperId', shipperId)");
    expect(html).toContain("query.set('createdFromIso', createdFromIso)");
    expect(html).toContain("query.set('createdToIso', createdToIso)");
    expect(html).toContain("query.set('hasMissingFiles', missingState)");
    expect(html).toContain("query.set('page', String(page))");
    expect(html).toContain("query.set('pageSize', String(pageSize))");
    expect(html).toContain('renderAuditPagination');
    expect(html).toContain('item.status');
    expect(html).toContain('item.createdAtIso');
    expect(html).toContain('item.shipperId');
    expect(html).toContain('item.hasMissingFiles');
    expect(html).toContain('cargoAttachmentList');
    expect(html).toContain('eventAttachmentList');
    expect(html).toContain('missingFileIds');
    expect(html).toContain('打开预览');
    expect(html).toContain('previewExpiresAtIso');
    expect(html).toContain('请先填写 admin access token');
    expect(html).toContain('请填写订单 ID');
    expect(html).toContain('/api/admin/file-maintenance-console');
    expect(html).toContain('/api/admin/shipper-coupon-console');
    expect(html).not.toContain('hero');
  });

  it('serves the order management console html', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getOrderManagementConsole: () => string;
      }
    ).getOrderManagementConsole();

    expect(html).toContain('订单管理台');
    expect(html).toContain('orderListKeywordInput');
    expect(html).toContain('orderListStatusInput');
    expect(html).toContain('orderListStatusesInput');
    expect(html).toContain('orderListCreatedFromInput');
    expect(html).toContain('orderListCreatedToInput');
    expect(html).toContain('orderListPageInput');
    expect(html).toContain('orderListPageSizeInput');
    expect(html).toContain('/admin/orders?');
    expect(html).toContain('/admin/orders/');
    expect(html).toContain('viewSelectedOrderFinanceButton');
    expect(html).toContain('applyOrderManagementRouteState');
    expect(html).toContain('selectedOrderSummary');
    expect(html).toContain('selectedOrderFinanceStatus');
    expect(html).toContain('selectedOrderFinanceSummary');
    expect(html).toContain('selectedOrderFinanceRecords');
    expect(html).toContain('selectedOrderEvents');
    expect(html).toContain('stage1AdminSession');
    expect(html).not.toContain('hero');
  });

  it('serves the session governance console html', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getSessionGovernanceConsole: () => string;
      }
    ).getSessionGovernanceConsole();

    expect(html).toContain('后台会话治理台');
    expect(html).toContain('/admin/auth/sessions');
    expect(html).toContain('/admin/auth/sessions/audit-events');
    expect(html).toContain('/revoke-other-sessions');
    expect(html).toContain('sessionList');
    expect(html).toContain('sessionAuditList');
    expect(html).not.toContain('hero');
  });

  it('serves the account management console html', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getAccountManagementConsole: () => string;
      }
    ).getAccountManagementConsole();

    expect(html).toContain('账号管理台');
    expect(html).toContain('/admin/auth/accounts?');
    expect(html).toContain('/admin/auth/accounts/');
    expect(html).toContain('/status');
    expect(html).toContain('/revoke-sessions');
    expect(html).toContain('accountSummaryGrid');
    expect(html).toContain('accountList');
    expect(html).toContain('accountSessionList');
    expect(html).toContain('accountAuditList');
    expect(html).toContain('runBatchStatusUpdate');
    expect(html).toContain('runBatchRevokeSessions');
    expect(html).toContain('accountSelectAllInput');
    expect(html).toContain('stage1AdminSession');
    expect(html).not.toContain('hero');
  });

  it('serves the permission matrix console html', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getPermissionMatrixConsole: () => string;
      }
    ).getPermissionMatrixConsole();

    expect(html).toContain('权限矩阵台');
    expect(html).toContain('/admin/permissions/matrix');
    expect(html).toContain('permissionProfileList');
    expect(html).toContain('permissionCapabilityList');
    expect(html).not.toContain('hero');
  });

  it('serves the shipper coupon issue console html', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getShipperCouponConsole: () => string;
      }
    ).getShipperCouponConsole();

    expect(html).toContain('货主优惠券发放台');
    expect(html).toContain('adminToken');
    expect(html).toContain('shipperIdInput');
    expect(html).toContain('batchShipperIdsInput');
    expect(html).toContain('couponTitleInput');
    expect(html).toContain('conditionTextInput');
    expect(html).toContain('discountCentsInput');
    expect(html).toContain('minOrderAmountCentsInput');
    expect(html).toContain('validFromIsoInput');
    expect(html).toContain('validUntilIsoInput');
    expect(html).toContain('sourceTextInput');
    expect(html).toContain('issueCoupon');
    expect(html).toContain('batchIssueCoupon');
    expect(html).toContain('loadCouponReport');
    expect(html).toContain("const apiBase = '/api'");
    expect(html).toContain('/admin/shipper-coupons');
    expect(html).toContain('/admin/shipper-coupons/batch-issue');
    expect(html).toContain('/admin/shipper-coupons/report?');
    expect(html).toContain('请先填写 admin access token');
    expect(html).toContain('优惠券失效时间必须晚于生效时间');
    expect(html).toContain('issuedCouponResult');
    expect(html).toContain('batchIssuedCouponResult');
    expect(html).toContain('couponReportTopShippersLimitInput');
    expect(html).toContain('couponReportTimestamp');
    expect(html).toContain('couponReportSummary');
    expect(html).toContain('couponSourceReport');
    expect(html).toContain('couponTopShippersReport');
    expect(html).toContain('/api/admin/order-exception-case-console');
    expect(html).toContain('/api/admin/evaluation-audit-console');
    expect(html).not.toContain('hero');
  });

  it('ignores stale coupon report responses and keeps the coupon console operational', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getShipperCouponConsole: () => string;
      }
    ).getShipperCouponConsole();

    expect(html).toContain('let latestCouponReportRequestId = 0');
    expect(html).toContain('const requestId = ++latestCouponReportRequestId');
    expect(html).toContain('if (requestId !== latestCouponReportRequestId) return');
    expect(html).toContain('renderCouponReport');
    expect(html).toContain('loadCouponReport(),');
    expect(html).not.toContain('hero');
  });

  it('serves the file maintenance console html', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getFileMaintenanceConsole: () => string;
      }
    ).getFileMaintenanceConsole();

    expect(html).toContain('文件维护台');
    expect(html).toContain('/files/maintenance/summary');
    expect(html).toContain('/files/maintenance/reject-expired-pending');
    expect(html).toContain('/files/maintenance/delete-rejected-objects');
    expect(html).toContain('/files/maintenance/batch-governance');
    expect(html).toContain('/files/maintenance/report?');
    expect(html).toContain('summaryCards');
    expect(html).toContain('stage1AdminSession');
    expect(html).not.toContain('hero');
  });

  it('serves the order exception customer service console html', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getOrderExceptionCaseConsole: () => string;
      }
    ).getOrderExceptionCaseConsole();

    expect(html).toContain('异常客服工单');
    expect(html).toContain('adminToken');
    expect(html).toContain('/admin/order-exception-cases');
    expect(html).toContain('/process');
    expect(html).toContain('/resolve');
    expect(html).toContain('/close');
    expect(html).toContain('/compensation/execute');
    expect(html).toContain('executeCompensation()');
    expect(html).toContain('平台已赔付到账');
    expect(html).toContain('申诉处理中');
    expect(html).toContain('baseUpdatedAtIso');
    expect(html).toContain('EXCEPTION_CASE_CONFLICT');
    expect(html).toContain('EXCEPTION_CASE_COMPENSATION_ALREADY_EXECUTED');
    expect(html).toContain('caseStatusInput');
    expect(html).toContain('caseSourceRoleInput');
    expect(html).toContain('caseKeywordInput');
    expect(html).toContain('caseCompensationStatusInput');
    expect(html).toContain('caseCompensationTargetRoleInput');
    expect(html).toContain('caseCompensationAmountInput');
    expect(html).toContain('applyOrderExceptionCaseRouteState');
    expect(html).toContain('/api/admin/driver-certification-console');
    expect(html).toContain('/api/admin/finance-console');
    expect(html).not.toContain('hero');
  });

  it('serves the help-center support ticket console html', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getSupportTicketConsole: () => string;
      }
    ).getSupportTicketConsole();

    expect(html).toContain('帮助中心工单台');
    expect(html).toContain('adminToken');
    expect(html).toContain('/admin/support-tickets');
    expect(html).toContain('/process');
    expect(html).toContain('/resolve');
    expect(html).toContain('supportTicketStatusInput');
    expect(html).toContain('supportTicketKeywordInput');
    expect(html).toContain('supportTicketPageSizeInput');
    expect(html).toContain('supportTicketActionContent');
    expect(html).toContain('supportTicketBaseUpdatedAtIso');
    expect(html).toContain('applySupportTicketRouteState');
    expect(html).toContain('/api/admin/order-exception-case-console');
    expect(html).toContain('/api/admin/finance-console');
    expect(html).not.toContain('hero');
  });

  it('serves the evaluation audit console html', () => {
    const controller = new AdminConsoleController();

    expect(controller.getEvaluationAuditConsole()).toContain('评价审计台');
  });

  it('serves the finance console html', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getFinanceConsole: () => string;
      }
    ).getFinanceConsole();

    expect(html).toContain('财务操作台');
    expect(html).toContain('adminToken');
    expect(html).toContain('financeTab');
    expect(html).toContain('financeOrderIdInput');
    expect(html).toContain('viewLinkedOrderButton');
    expect(html).toContain('/admin/finance/refunds/');
    expect(html).toContain('/retry');
    expect(html).toContain('/admin/finance/withdrawals/');
    expect(html).toContain('/approve');
    expect(html).toContain('/reject');
    expect(html).toContain('/admin/finance/ledger-transactions/');
    expect(html).not.toContain('hero');
  });

  it('serves the admin console navigation hub html', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getAdminConsoleHome: () => string;
      }
    ).getAdminConsoleHome();

    expect(html).toContain('运营后台工具台');
    expect(html).toContain('/api/admin/finance-console');
    expect(html).toContain('/api/admin/file-maintenance-console');
    expect(html).toContain('/api/admin/session-governance-console');
    expect(html).toContain('/api/admin/account-management-console');
    expect(html).toContain('/api/admin/permission-matrix-console');
    expect(html).toContain('/api/admin/order-exception-case-console');
    expect(html).not.toContain('hero');
  });

  it('serves the admin login console html', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getAdminLoginConsole: () => string;
      }
    ).getAdminLoginConsole();

    expect(html).toContain('后台登录');
    expect(html).toContain("/auth/admin/password-login");
    expect(html).toContain('stage1AdminSession');
    expect(html).not.toContain('hero');
  });

  it('serves the authenticated admin console overview json envelope', async () => {
    const service = createOverviewServiceMock();
    service.getOverview.mockResolvedValue({
      generatedAtIso: '2026-07-18T03:00:00.000Z',
      implementedConsoleCount: 12,
      liveMetricModuleCount: 12,
      remainingCapabilityCount: 5,
      modules: [],
      remainingPlatformGaps: [],
    } as never);
    const controller = new AdminConsoleController(service);

    await expect(
      controller.getAdminConsoleOverview(createRequest()),
    ).resolves.toMatchObject({
      code: 'OK',
      requestId: 'request-admin-1',
      data: expect.objectContaining({
        implementedConsoleCount: 12,
        liveMetricModuleCount: 12,
      }),
    });
    expect(service.getOverview).toHaveBeenCalledTimes(1);
  });

  it('serves the authenticated admin permission matrix json envelope', async () => {
    const service = createPermissionMatrixServiceMock();
    service.getMatrix.mockResolvedValue({
      generatedAtIso: '2026-07-18T04:00:00.000Z',
      defaultProfileKey: 'platform_admin',
      profileCount: 1,
      moduleCount: 12,
      capabilityCount: 12,
      writeCapabilityCount: 9,
      highRiskCapabilityCount: 9,
      profiles: [],
      modules: [],
      capabilities: [],
      remainingGaps: [],
    } as never);
    const controller = new AdminConsoleController(
      createOverviewServiceMock(),
      service,
    );

    await expect(
      controller.getAdminPermissionMatrix(createRequest()),
    ).resolves.toMatchObject({
      code: 'OK',
      requestId: 'request-admin-1',
      data: expect.objectContaining({
        defaultProfileKey: 'platform_admin',
        moduleCount: 12,
        capabilityCount: 12,
      }),
    });
    expect(service.getMatrix).toHaveBeenCalledTimes(1);
  });
});

function createOverviewServiceMock() {
  return {
    getOverview: jest.fn(),
  } as unknown as jest.Mocked<AdminConsoleOverviewService>;
}

function createPermissionMatrixServiceMock() {
  return {
    getMatrix: jest.fn(),
  } as unknown as jest.Mocked<AdminPermissionMatrixService>;
}

function createRequest(): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'request-admin-1' },
    currentUser: {
      id: 'admin-1',
      phone: '13900139000',
      userType: 'admin',
    },
  } as AuthenticatedRequest;
}
