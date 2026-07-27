import { runInNewContext } from 'node:vm';
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
import { renderOrderChangeRequestAdminConsole } from './order-change-request-admin-console';
import { renderAccountManagementAdminConsole } from './account-management-admin-console';
import { renderOrderExceptionCaseAdminConsole } from './order-exception-case-admin-console';
import { renderAdminPermissionMatrixConsole } from './permission-matrix-admin-console';
import { renderSessionGovernanceAdminConsole } from './session-governance-admin-console';
import { renderShipperInvoiceAdminConsole } from './shipper-invoice-admin-console';
import { renderShipperVerificationAdminConsole } from './shipper-verification-admin-console';
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

  it('syncs queue filters and selected driver detail into route state', () => {
    const html = renderDriverCertificationAdminConsole();

    expect(html).toContain('applyDriverCertificationRouteState');
    expect(html).toContain('syncDriverCertificationRouteState');
    expect(html).toContain("query.get('status') || 'reviewing'");
    expect(html).toContain("query.get('driverId')");
    expect(html).toContain("query.set('driverId', driverId)");
    expect(html).toContain('history.replaceState');
    expect(html).toContain('loadQueue()');
  });

  it('ignores stale driver queue and detail responses while preserving the latest selection', () => {
    const html = renderDriverCertificationAdminConsole();

    expect(html).toContain('let latestQueueRequestId = 0');
    expect(html).toContain('let latestDriverDetailRequestId = 0');
    expect(html).toContain('const requestId = ++latestQueueRequestId');
    expect(html).toContain('if (requestId !== latestQueueRequestId) return');
    expect(html).toContain('const requestId = ++latestDriverDetailRequestId');
    expect(html).toContain('requestId !== latestDriverDetailRequestId ||');
    expect(html).toContain('selectedDriverId !== targetDriverId');
  });

  it('loads routed driver details independently from the current queue page', () => {
    const html = renderDriverCertificationAdminConsole();
    const queueStart = html.indexOf('async function loadQueue()');
    const queueEnd = html.indexOf(
      'async function refreshWorkspace()',
      queueStart,
    );
    const queueBody = html.slice(queueStart, queueEnd);
    const refreshStart = queueEnd;
    const refreshEnd = html.indexOf(
      'function getDriverId(item)',
      refreshStart,
    );
    const refreshBody = html.slice(refreshStart, refreshEnd);
    const syncStart = html.indexOf(
      'function syncSelectedDriversToCurrentQueue()',
    );
    const syncEnd = html.indexOf('function updateBulkSelectionUi()', syncStart);
    const syncBody = html.slice(syncStart, syncEnd);
    const detailStart = html.indexOf('async function selectDriver(driverId)');
    const detailEnd = html.indexOf('function renderDetail()', detailStart);
    const detailBody = html.slice(detailStart, detailEnd);
    const detailGuardIndex = detailBody.indexOf(
      'requestId !== latestDriverDetailRequestId',
    );
    const detailCommitIndex = detailBody.indexOf(
      'state.selected = detail',
      detailGuardIndex,
    );
    const batchStart = html.indexOf('async function runBatchReview()');
    const batchEnd = html.indexOf(
      "document.getElementById('loadQueue')",
      batchStart,
    );
    const batchBody = html.slice(batchStart, batchEnd);

    expect(queueBody).not.toContain('latestDriverDetailRequestId');
    expect(refreshBody).toContain('loadQueue()');
    expect(refreshBody).toContain('selectDriver(targetDriverId)');
    expect(syncBody).not.toContain("selectedDriverId = ''");
    expect(syncBody).not.toContain("syncDriverCertificationRouteState('')");
    expect(detailBody).toContain('const [detail, attachments, events]');
    expect(detailBody).toContain(
      "request(apiPaths.list + '/' + encodeURIComponent(targetDriverId))",
    );
    expect(detailBody).toContain(
      "encodeURIComponent(targetDriverId) + apiPaths.attachments",
    );
    expect(detailBody).toContain(
      "encodeURIComponent(targetDriverId) + apiPaths.reviewEvents",
    );
    expect(detailCommitIndex).toBeGreaterThan(detailGuardIndex);
    expect(batchBody).not.toContain('selectedDriverIdBeforeBatch');
    expect(batchBody).toContain('await refreshWorkspace()');
  });

  it('atomically commits only the latest routed driver detail', async () => {
    const html = renderDriverCertificationAdminConsole();
    const detailStart = html.indexOf('async function selectDriver(driverId)');
    const detailEnd = html.indexOf('function renderDetail()', detailStart);
    const detailSource = html.slice(detailStart, detailEnd);
    const createDeferred = () => {
      let resolve: ((value: unknown) => void) | undefined;
      let reject: ((reason?: unknown) => void) | undefined;
      const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      return { promise, reject, resolve };
    };
    const pending = new Map<string, ReturnType<typeof createDeferred>>();
    const createDriverRequests = (driverId: string) => {
      const detail = createDeferred();
      const attachments = createDeferred();
      const events = createDeferred();
      pending.set('/admin/driver-certifications/' + driverId, detail);
      pending.set(
        '/admin/driver-certifications/' + driverId + '/attachments',
        attachments,
      );
      pending.set(
        '/admin/driver-certifications/' + driverId + '/review-events',
        events,
      );
      return { attachments, detail, events };
    };
    const request = jest.fn((path: string) => {
      const deferred = pending.get(path);
      if (!deferred) {
        return Promise.reject(new Error('unexpected request: ' + path));
      }
      return deferred.promise;
    });
    const context = {
      latestDriverDetailRequestId: 0,
      selectedDriverId: '',
      state: {
        items: [],
        selected: null as unknown,
        attachments: null as unknown,
        events: [] as unknown[],
      },
      syncDriverCertificationRouteState: jest.fn(),
      renderQueue: jest.fn(),
      renderEmptyDetail: jest.fn(),
      setNotice: jest.fn(),
      request,
      apiPaths: {
        list: '/admin/driver-certifications',
        attachments: '/attachments',
        reviewEvents: '/review-events',
      },
      encodeURIComponent,
      renderDetail: jest.fn(),
      invokeSelectDriver: undefined as
        | undefined
        | ((driverId: string) => Promise<void>),
    };
    runInNewContext(
      `${detailSource}\ninvokeSelectDriver = selectDriver;`,
      context,
    );
    if (!context.invokeSelectDriver) {
      throw new Error('selectDriver function was not initialized');
    }

    const driverA = createDriverRequests('driver-a');
    const driverB = createDriverRequests('driver-b');
    const slowDriverA = context.invokeSelectDriver('driver-a');
    const fastDriverB = context.invokeSelectDriver('driver-b');
    const driverBDetail = {
      driver: { id: 'driver-b' },
      identity: { driverId: 'driver-b', status: 'reviewing' },
      vehicle: { driverId: 'driver-b', status: 'approved' },
    };
    driverB.detail.resolve?.(driverBDetail);
    driverB.attachments.resolve?.({ driverId: 'driver-b' });
    driverB.events.resolve?.([{ id: 'event-b' }]);
    await fastDriverB;

    expect(context.state.selected).toEqual(driverBDetail);
    expect(context.state.attachments).toEqual({ driverId: 'driver-b' });
    expect(context.state.events).toEqual([{ id: 'event-b' }]);

    driverA.detail.resolve?.({
      driver: { id: 'driver-a' },
      identity: { driverId: 'driver-a', status: 'reviewing' },
      vehicle: { driverId: 'driver-a', status: 'unsubmitted' },
    });
    driverA.attachments.resolve?.({ driverId: 'driver-a' });
    driverA.events.resolve?.([{ id: 'event-a' }]);
    await slowDriverA;
    expect(context.state.selected).toEqual(driverBDetail);

    const driverC = createDriverRequests('driver-c');
    const failedDriverC = context.invokeSelectDriver('driver-c');
    driverC.detail.resolve?.({ driver: { id: 'driver-c' } });
    driverC.events.resolve?.([{ id: 'event-c' }]);
    driverC.attachments.reject?.(new Error('附件加载失败'));
    await failedDriverC;

    expect(context.selectedDriverId).toBe('driver-c');
    expect(context.state.selected).toBeNull();
    expect(context.state.attachments).toBeNull();
    expect(context.state.events).toEqual([]);
  });

  it('prevents duplicate driver reviews from restoring an older selection', async () => {
    const html = renderDriverCertificationAdminConsole();
    const reviewStart = html.indexOf(
      'async function submitReview(driverId, type, payload)',
    );
    const reviewEnd = html.indexOf('async function runBatchReview()', reviewStart);
    const reviewSource = html.slice(reviewStart, reviewEnd);
    let resolveReview: ((value: unknown) => void) | undefined;
    const reviewResponse = new Promise<unknown>(resolve => {
      resolveReview = resolve;
    });
    const request = jest.fn(() => reviewResponse);
    const loadQueue = jest.fn(() => Promise.resolve());
    const selectDriver = jest.fn(() => Promise.resolve());
    const context = {
      reviewMutationPending: false,
      latestReviewMutationRequestId: 0,
      selectedDriverId: 'driver-a',
      state: {
        selected: {
          driver: { id: 'driver-a' },
          identity: { driverId: 'driver-a', status: 'reviewing' },
          vehicle: { driverId: 'driver-a', status: 'unsubmitted' },
        },
      },
      setNotice: jest.fn(),
      renderDetail: jest.fn(),
      request,
      apiPaths: {
        list: '/admin/driver-certifications',
        identityReview: '/identity/review',
        vehicleReview: '/vehicle/review',
      },
      encodeURIComponent,
      getDriverId: (item: { driver: { id: string } }) => item.driver.id,
      loadQueue,
      selectDriver,
      invokeReview: undefined as
        | undefined
        | ((
            driverId: string,
            type: 'identity' | 'vehicle',
            payload: { status: 'approved' | 'rejected'; rejectionReason?: string },
          ) => Promise<void>),
    };
    runInNewContext(`${reviewSource}\ninvokeReview = submitReview;`, context);
    if (!context.invokeReview) {
      throw new Error('submitReview function was not initialized');
    }

    const firstReview = context.invokeReview('driver-a', 'identity', {
      status: 'approved',
    });
    await context.invokeReview('driver-a', 'identity', { status: 'approved' });
    expect(request).toHaveBeenCalledTimes(1);

    context.selectedDriverId = 'driver-b';
    context.state.selected = {
      driver: { id: 'driver-b' },
      identity: { driverId: 'driver-b', status: 'reviewing' },
      vehicle: { driverId: 'driver-b', status: 'unsubmitted' },
    };
    resolveReview?.({
      driver: { id: 'driver-a' },
      identity: { driverId: 'driver-a', status: 'approved' },
      vehicle: { driverId: 'driver-a', status: 'unsubmitted' },
    });
    await firstReview;

    expect(context.selectedDriverId).toBe('driver-b');
    expect(context.state.selected).toMatchObject({
      driver: { id: 'driver-b' },
    });
    expect(loadQueue).toHaveBeenCalledTimes(1);
    expect(selectDriver).not.toHaveBeenCalled();
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
    expect(html).toContain(
      "api('/admin/evaluations/' + encodeURIComponent(targetAuditId))",
    );
    expect(html).toContain(
      "encodeURIComponent(targetAuditId) + '/attachments'",
    );
    expect(html).toContain('auditPhotoNotice');
    expect(html).toContain('打开预览');
    expect(html).toContain('/api/admin/file-maintenance-console');
    expect(html).toContain('/api/admin/order-exception-case-console');
  });

  it('keeps queue and routed detail request generations independent', () => {
    const html = renderEvaluationAuditAdminConsole();
    const queueStart = html.indexOf('async function loadAudits(page)');
    const queueEnd = html.indexOf(
      'async function refreshAuditWorkspace(page)',
      queueStart,
    );
    const queueBody = html.slice(queueStart, queueEnd);
    const refreshEnd = html.indexOf(
      'function clearAuditQueueResults()',
      queueEnd,
    );
    const refreshBody = html.slice(queueEnd, refreshEnd);
    const clearEnd = html.indexOf(
      'function renderAuditPagination(pageSizeValue)',
      refreshEnd,
    );
    const clearBody = html.slice(refreshEnd, clearEnd);
    const requestedPageIndex = queueBody.indexOf(
      'const requestedPage = Math.max(1, page)',
    );
    const currentPageIndex = queueBody.indexOf(
      'currentPage = requestedPage',
      requestedPageIndex,
    );
    const queueApiIndex = queueBody.indexOf(
      "api('/admin/evaluations?'",
      currentPageIndex,
    );

    expect(html).toContain('let latestAuditRequestId = 0');
    expect(html).toContain('let latestAuditDetailRequestId = 0');
    expect(html).toContain('const requestId = ++latestAuditRequestId');
    expect(html).toContain('if (requestId !== latestAuditRequestId) return');
    expect(currentPageIndex).toBeGreaterThan(requestedPageIndex);
    expect(queueApiIndex).toBeGreaterThan(currentPageIndex);
    expect(queueBody).toContain(
      'if (requestedPage > maxPage) return loadAudits(maxPage)',
    );
    expect(queueBody).not.toContain('latestAuditDetailRequestId');
    expect(queueBody).not.toContain("selectedAuditId = ''");
    expect(refreshBody).toContain('loadAudits(page)');
    expect(refreshBody).toContain('selectAudit(targetAuditId)');
    expect(clearBody).not.toContain('selectedAuditId');
    expect(clearBody).not.toContain('auditDetail');
  });

  it('commits only the latest routed evaluation detail and attachment state', async () => {
    const html = renderEvaluationAuditAdminConsole();
    const detailStart = html.indexOf('async function selectAudit(auditId)');
    const detailEnd = html.indexOf(
      'function renderAuditDetail(item)',
      detailStart,
    );
    const detailSource = html.slice(detailStart, detailEnd);
    const createDeferred = () => {
      let resolve: ((value: unknown) => void) | undefined;
      let reject: ((reason?: unknown) => void) | undefined;
      const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      return { promise, reject, resolve };
    };
    const pending = new Map<string, ReturnType<typeof createDeferred>>();
    const createAuditRequests = (auditId: string) => {
      const detail = createDeferred();
      const attachments = createDeferred();
      pending.set('/admin/evaluations/' + auditId, detail);
      pending.set('/admin/evaluations/' + auditId + '/attachments', attachments);
      return { attachments, detail };
    };
    const api = jest.fn((path: string) => {
      const deferred = pending.get(path);
      return deferred
        ? deferred.promise
        : Promise.reject(new Error('unexpected request: ' + path));
    });
    const renderAuditDetail = jest.fn();
    const renderAuditAttachments = jest.fn();
    const renderAuditAttachmentError = jest.fn();
    const renderAuditDetailMessage = jest.fn();
    const context = {
      latestAuditDetailRequestId: 0,
      selectedAuditId: '',
      currentPage: 1,
      document: {
        getElementById: jest.fn(() => ({ value: '20' })),
      },
      syncEvaluationAuditRouteState: jest.fn(),
      renderAuditList: jest.fn(),
      renderAuditDetailMessage,
      api,
      encodeURIComponent,
      renderAuditDetail,
      renderAuditAttachments,
      renderAuditAttachmentError,
      invokeSelectAudit: undefined as
        | undefined
        | ((auditId: string) => Promise<void>),
    };
    runInNewContext(
      `${detailSource}\ninvokeSelectAudit = selectAudit;`,
      context,
    );
    if (!context.invokeSelectAudit) {
      throw new Error('selectAudit function was not initialized');
    }

    const auditA = createAuditRequests('audit-a');
    const auditB = createAuditRequests('audit-b');
    const slowAuditA = context.invokeSelectAudit('audit-a');
    const fastAuditB = context.invokeSelectAudit('audit-b');
    const auditBDetail = { id: 'audit-b', orderId: 'order-b' };
    const auditBAttachments = { evaluationId: 'audit-b', items: [] };
    auditB.detail.resolve?.(auditBDetail);
    auditB.attachments.resolve?.(auditBAttachments);
    await fastAuditB;

    expect(renderAuditDetail).toHaveBeenCalledTimes(1);
    expect(renderAuditDetail).toHaveBeenLastCalledWith(auditBDetail);
    expect(renderAuditAttachments).toHaveBeenCalledTimes(1);
    expect(renderAuditAttachments).toHaveBeenLastCalledWith(auditBAttachments);

    auditA.detail.resolve?.({ id: 'audit-a', orderId: 'order-a' });
    auditA.attachments.resolve?.({ evaluationId: 'audit-a', items: [] });
    await slowAuditA;
    expect(renderAuditDetail).toHaveBeenCalledTimes(1);
    expect(renderAuditAttachments).toHaveBeenCalledTimes(1);

    const auditC = createAuditRequests('audit-c');
    const failedAuditC = context.invokeSelectAudit('audit-c');
    const auditCDetail = {
      id: 'audit-c',
      orderId: 'order-c',
      photoCount: 1,
      photoFileIds: ['file-c'],
    };
    auditC.detail.resolve?.(auditCDetail);
    auditC.attachments.reject?.(new Error('附件加载失败'));
    await failedAuditC;

    expect(context.selectedAuditId).toBe('audit-c');
    expect(renderAuditDetail).toHaveBeenCalledTimes(2);
    expect(renderAuditDetail).toHaveBeenLastCalledWith(auditCDetail);
    expect(renderAuditAttachments).toHaveBeenCalledTimes(1);
    expect(renderAuditAttachmentError).toHaveBeenCalledWith(
      auditCDetail,
      expect.objectContaining({ message: '附件加载失败' }),
    );

    const auditD = createAuditRequests('audit-d');
    const failedAuditD = context.invokeSelectAudit('audit-d');
    auditD.detail.reject?.(new Error('评价记录不存在'));
    auditD.attachments.resolve?.({ evaluationId: 'audit-d', items: [] });
    await failedAuditD;

    expect(context.selectedAuditId).toBe('audit-d');
    expect(renderAuditDetail).toHaveBeenCalledTimes(2);
    expect(renderAuditAttachments).toHaveBeenCalledTimes(1);
    expect(renderAuditAttachmentError).toHaveBeenCalledTimes(1);
    expect(renderAuditDetailMessage).toHaveBeenLastCalledWith(
      '评价记录不存在',
    );
  });

  it('syncs evaluation filters and selected audit detail into route state', () => {
    const html = renderEvaluationAuditAdminConsole();

    expect(html).toContain('applyEvaluationAuditRouteState');
    expect(html).toContain('syncEvaluationAuditRouteState');
    expect(html).toContain("query.get('auditId')");
    expect(html).toContain("query.set('auditId', auditId)");
    expect(html).toContain("query.set('direction', direction)");
    expect(html).toContain("query.set('rating', rating)");
    expect(html).toContain('refreshAuditWorkspace(currentPage)');
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
    expect(html).toContain("query.get('recordId')");
    expect(html).toContain("query.set('recordId', recordId)");
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

  it('renders withdrawal list helpers for bank snapshots and status-specific finance facts', () => {
    const html = renderFinanceAdminConsole();

    expect(html).toContain('formatFinanceTimestamp');
    expect(html).toContain('formatWithdrawalListDetail');
    expect(html).toContain('item.bankName || \'-\'');
    expect(html).toContain('item.bankAccountMasked || \'-\'');
    expect(html).toContain('item.rejectionReason');
    expect(html).toContain('item.payoutChannel');
    expect(html).toContain('item.providerPayoutNo');
    expect(html).toContain('item.payoutExecutedAtIso');
    expect(html).toContain('withdrawal.version=');
  });

  it('keeps stale responses from overriding newer finance queries', () => {
    const html = renderFinanceAdminConsole();

    expect(html).toContain('let latestFinanceRequestId = 0');
    expect(html).toContain('let latestFinanceReportRequestId = 0');
    expect(html).toContain('let latestFinanceReconciliationRequestId = 0');
    expect(html).toContain('const requestId = ++latestFinanceRequestId');
    expect(html).toContain('const requestId = ++latestFinanceReportRequestId');
    expect(html).toContain(
      'const requestId = ++latestFinanceReconciliationRequestId',
    );
    expect(html).toContain('requestId !== latestFinanceRequestId ||');
    expect(html).toContain('if (requestId !== latestFinanceReportRequestId) return');
    expect(html).toContain(
      'if (requestId !== latestFinanceReconciliationRequestId) return',
    );
    expect(html).toContain('resetFinanceReport');
    expect(html).toContain('clearFinanceSelection()');
    expect(html).toContain('clearLedgerDetail()');
  });

  it('keeps finance pagination and routed details as independent request generations', () => {
    const html = renderFinanceAdminConsole();
    const listStart = html.indexOf('async function loadFinanceList(page)');
    const refreshStart = html.indexOf(
      'async function refreshFinanceWorkspace(page)',
      listStart,
    );
    const listSource = html.slice(listStart, refreshStart);
    const refreshEnd = html.indexOf(
      'function renderFinancePagination(pageSize)',
      refreshStart,
    );
    const refreshSource = html.slice(refreshStart, refreshEnd);
    const detailStart = html.indexOf('async function loadFinanceDetail(');
    const detailEnd = html.indexOf(
      'function renderSelectedFinanceDetail(',
      detailStart,
    );
    const detailSource = html.slice(detailStart, detailEnd);

    expect(html).toContain('let latestFinanceDetailRequestId = 0');
    expect(html).toContain("payments: '/admin/finance/payments/'");
    expect(html).toContain("refunds: '/admin/finance/refunds/'");
    expect(html).toContain("settlements: '/admin/finance/settlements/'");
    expect(html).toContain("withdrawals: '/admin/finance/withdrawals/'");
    expect(listSource).not.toContain('latestFinanceDetailRequestId');
    expect(listSource).not.toContain('loadFinanceDetail');
    expect(listSource).not.toContain('clearFinanceSelection');
    expect(listSource).not.toContain('selectedFinanceRecordId =');
    expect(refreshSource).toContain('const targetTab = currentFinanceTab');
    expect(refreshSource).toContain(
      'const targetRecordId = selectedFinanceRecordId',
    );
    expect(refreshSource).toContain(
      'loadFinanceDetail(targetTab, targetRecordId, false)',
    );
    expect(detailSource).toContain(
      'const requestId = ++latestFinanceDetailRequestId',
    );
    expect(detailSource).toContain('currentFinanceTab !== targetTab');
    expect(detailSource).toContain(
      'selectedFinanceRecordId !== targetRecordId',
    );
  });

  it('loads routed finance details outside the current page even when the list fails', async () => {
    const html = renderFinanceAdminConsole();
    const listStart = html.indexOf('async function loadFinanceList(page)');
    const listEnd = html.indexOf(
      'async function refreshFinanceWorkspace(page)',
      listStart,
    );
    const listSource = html.slice(listStart, listEnd);
    const detailStart = html.indexOf('async function loadFinanceDetail(');
    const detailEnd = html.indexOf(
      'function renderSelectedFinanceDetail(',
      detailStart,
    );
    const detailSource = html.slice(detailStart, detailEnd);
    const createDeferred = () => {
      let resolve: ((value: unknown) => void) | undefined;
      let reject: ((reason?: unknown) => void) | undefined;
      const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      return { promise, reject, resolve };
    };
    const listPage = createDeferred();
    const routedDetail = createDeferred();
    const failedListPage = createDeferred();
    const retriedDetail = createDeferred();
    const listRequests = [listPage, failedListPage];
    const detailRequests = [routedDetail, retriedDetail];
    const nodes = new Map<
      string,
      {
        disabled: boolean;
        innerHTML: string;
        textContent: string;
        value: string;
      }
    >();
    const getNode = (id: string) => {
      const existing = nodes.get(id);
      if (existing) return existing;
      const created = {
        disabled: false,
        innerHTML: '',
        textContent: '',
        value:
          id === 'financePageSizeInput'
            ? '20'
            : id === 'financePageInput'
            ? '3'
            : '',
      };
      nodes.set(id, created);
      return created;
    };
    const api = jest.fn((path: string) => {
      const request = path.includes('?')
        ? listRequests.shift()
        : detailRequests.shift();
      return request
        ? request.promise
        : Promise.reject(new Error('unexpected request: ' + path));
    });
    const renderSelectedFinanceDetail = jest.fn();
    const context = {
      latestFinanceRequestId: 0,
      latestFinanceDetailRequestId: 0,
      currentFinanceTab: 'refunds',
      currentFinanceItems: [] as unknown[],
      currentFinancePage: 3,
      currentFinanceTotal: 0,
      selectedFinanceRecordId: 'refund-routed',
      currentFinanceDetail: null as unknown,
      currentFinanceDetailTab: '',
      selectedWithdrawalIds: new Set<string>(),
      tabRoutes: {
        payments: '/admin/finance/payments?',
        refunds: '/admin/finance/refunds?',
        settlements: '/admin/finance/settlements?',
        withdrawals: '/admin/finance/withdrawals?',
      },
      financeDetailRoutes: {
        payments: '/admin/finance/payments/',
        refunds: '/admin/finance/refunds/',
        settlements: '/admin/finance/settlements/',
        withdrawals: '/admin/finance/withdrawals/',
      },
      document: { getElementById: getNode },
      syncFinanceRouteState: jest.fn(),
      syncSelectedWithdrawalsToCurrentList: jest.fn(),
      renderFinancePagination: jest.fn(),
      renderFinanceList: jest.fn(),
      updateFinanceActionControls: jest.fn(),
      clearLedgerDetail: jest.fn(),
      renderSelectedFinanceDetail,
      escapeHtml: (value: unknown) => String(value),
      api,
      encodeURIComponent,
      URLSearchParams,
      invokeList: undefined as undefined | ((page: number) => Promise<void>),
      invokeDetail: undefined as
        | undefined
        | ((
            tab: string,
            recordId: string,
            clearLedger?: boolean,
          ) => Promise<void>),
    };
    runInNewContext(
      `${listSource}\n${detailSource}\ninvokeList = loadFinanceList; invokeDetail = loadFinanceDetail;`,
      context,
    );

    const pageRequest = context.invokeList!(3);
    const detailRequest = context.invokeDetail!(
      'refunds',
      'refund-routed',
      false,
    );
    const firstDetail = {
      id: 'refund-routed',
      refundNo: 'RF-ROUTED',
    };
    listPage.resolve!({
      items: [{ id: 'refund-on-page', refundNo: 'RF-PAGE' }],
      total: 1,
    });
    routedDetail.resolve!(firstDetail);
    await Promise.all([pageRequest, detailRequest]);

    expect(context.selectedFinanceRecordId).toBe('refund-routed');
    expect(context.currentFinanceItems).toEqual([
      expect.objectContaining({ id: 'refund-on-page' }),
    ]);
    expect(context.currentFinanceDetail).toBe(firstDetail);
    expect(context.currentFinanceDetailTab).toBe('refunds');
    expect(renderSelectedFinanceDetail).toHaveBeenLastCalledWith(
      firstDetail,
      'refunds',
    );

    const failedListRequest = context.invokeList!(3);
    const retriedDetailRequest = context.invokeDetail!(
      'refunds',
      'refund-routed',
      false,
    );
    const refreshedDetail = {
      id: 'refund-routed',
      refundNo: 'RF-ROUTED-REFRESHED',
    };
    failedListPage.reject!(new Error('财务列表暂不可用'));
    retriedDetail.resolve!(refreshedDetail);
    await Promise.all([failedListRequest, retriedDetailRequest]);

    expect(context.selectedFinanceRecordId).toBe('refund-routed');
    expect(context.currentFinanceDetail).toBe(refreshedDetail);
    expect(context.currentFinanceDetailTab).toBe('refunds');
    expect(getNode('financeListNotice').textContent).toBe('财务列表暂不可用');
    expect(context.syncFinanceRouteState.mock.calls).not.toContainEqual([
      3,
      20,
      '',
    ]);
  });

  it('commits only the latest finance detail and retains failed targets for retry', async () => {
    const html = renderFinanceAdminConsole();
    const detailStart = html.indexOf('async function loadFinanceDetail(');
    const detailEnd = html.indexOf(
      'function renderSelectedFinanceDetail(',
      detailStart,
    );
    const detailSource = html.slice(detailStart, detailEnd);
    const createDeferred = () => {
      let resolve: ((value: unknown) => void) | undefined;
      let reject: ((reason?: unknown) => void) | undefined;
      const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      return { promise, reject, resolve };
    };
    const pending = new Map<string, Array<ReturnType<typeof createDeferred>>>();
    const enqueue = (path: string) => {
      const request = createDeferred();
      pending.set(path, [...(pending.get(path) || []), request]);
      return request;
    };
    const nodes = new Map<
      string,
      {
        disabled: boolean;
        innerHTML: string;
        textContent: string;
        value: string;
      }
    >();
    const getNode = (id: string) => {
      const existing = nodes.get(id);
      if (existing) return existing;
      const created = {
        disabled: false,
        innerHTML: '',
        textContent: '',
        value: id === 'financePageSizeInput' ? '20' : '',
      };
      nodes.set(id, created);
      return created;
    };
    const api = jest.fn((path: string) => {
      const queued = pending.get(path) || [];
      const request = queued.shift();
      pending.set(path, queued);
      return request
        ? request.promise
        : Promise.reject(new Error('unexpected request: ' + path));
    });
    const renderSelectedFinanceDetail = jest.fn();
    const context = {
      latestFinanceDetailRequestId: 0,
      currentFinanceTab: 'refunds',
      currentFinancePage: 1,
      selectedFinanceRecordId: '',
      currentFinanceDetail: null as unknown,
      currentFinanceDetailTab: '',
      financeDetailRoutes: {
        payments: '/admin/finance/payments/',
        refunds: '/admin/finance/refunds/',
        settlements: '/admin/finance/settlements/',
        withdrawals: '/admin/finance/withdrawals/',
      },
      document: { getElementById: getNode },
      syncFinanceRouteState: jest.fn(),
      renderFinanceList: jest.fn(),
      updateFinanceActionControls: jest.fn(),
      clearLedgerDetail: jest.fn(),
      renderSelectedFinanceDetail,
      escapeHtml: (value: unknown) => String(value),
      api,
      encodeURIComponent,
      invokeDetail: undefined as
        | undefined
        | ((
            tab: string,
            recordId: string,
            clearLedger?: boolean,
          ) => Promise<void>),
    };
    runInNewContext(
      `${detailSource}\ninvokeDetail = loadFinanceDetail;`,
      context,
    );

    const refundA = enqueue('/admin/finance/refunds/refund-a');
    const withdrawalB = enqueue('/admin/finance/withdrawals/withdrawal-b');
    const slowRefundA = context.invokeDetail!('refunds', 'refund-a');
    context.currentFinanceTab = 'withdrawals';
    const fastWithdrawalB = context.invokeDetail!(
      'withdrawals',
      'withdrawal-b',
    );
    const withdrawalBDetail = {
      id: 'withdrawal-b',
      version: 4,
    };
    withdrawalB.resolve!(withdrawalBDetail);
    await fastWithdrawalB;
    refundA.resolve!({ id: 'refund-a' });
    await slowRefundA;

    expect(renderSelectedFinanceDetail).toHaveBeenCalledTimes(1);
    expect(renderSelectedFinanceDetail).toHaveBeenLastCalledWith(
      withdrawalBDetail,
      'withdrawals',
    );
    expect(context.currentFinanceDetail).toBe(withdrawalBDetail);
    expect(context.currentFinanceDetailTab).toBe('withdrawals');
    expect(context.selectedFinanceRecordId).toBe('withdrawal-b');

    context.currentFinanceTab = 'payments';
    const missingPayment = enqueue('/admin/finance/payments/payment-missing');
    const failedPayment = context.invokeDetail!('payments', 'payment-missing');
    missingPayment.reject!(new Error('财务记录不存在'));
    await failedPayment;

    expect(context.selectedFinanceRecordId).toBe('payment-missing');
    expect(context.currentFinanceDetail).toBeNull();
    expect(context.currentFinanceDetailTab).toBe('payments');
    expect(getNode('financeDetail').innerHTML).toContain('财务记录不存在');
    expect(context.syncFinanceRouteState.mock.calls.at(-1)).toEqual([
      1,
      20,
      'payment-missing',
    ]);

    const paymentRetry = enqueue('/admin/finance/payments/payment-missing');
    const retriedPayment = context.invokeDetail!('payments', 'payment-missing');
    const paymentDetail = { id: 'payment-missing', paymentNo: 'PAY-1' };
    paymentRetry.resolve!(paymentDetail);
    await retriedPayment;

    context.currentFinanceTab = 'settlements';
    const settlementRequest = enqueue(
      '/admin/finance/settlements/settlement-c',
    );
    const settlementDetailRequest = context.invokeDetail!(
      'settlements',
      'settlement-c',
    );
    const settlementDetail = { id: 'settlement-c' };
    settlementRequest.resolve!(settlementDetail);
    await settlementDetailRequest;

    expect(renderSelectedFinanceDetail).toHaveBeenCalledWith(
      paymentDetail,
      'payments',
    );
    expect(renderSelectedFinanceDetail).toHaveBeenLastCalledWith(
      settlementDetail,
      'settlements',
    );
    expect(api.mock.calls.map(call => call[0])).toEqual(
      expect.arrayContaining([
        '/admin/finance/payments/payment-missing',
        '/admin/finance/refunds/refund-a',
        '/admin/finance/settlements/settlement-c',
        '/admin/finance/withdrawals/withdrawal-b',
      ]),
    );
  });

  it('locks single-record finance mutations to their starting targets', async () => {
    const html = renderFinanceAdminConsole();
    const helperStart = html.indexOf('function isCurrentFinanceTarget(');
    const retryStart = html.indexOf(
      'async function retryRefund()',
      helperStart,
    );
    const helperSource = html.slice(helperStart, retryStart);
    const retryEnd = html.indexOf(
      'async function runBatchWithdrawalReview(',
      retryStart,
    );
    const retrySource = html.slice(retryStart, retryEnd);
    const withdrawalStart = html.indexOf(
      'async function reviewWithdrawal(action)',
      retryEnd,
    );
    const withdrawalEnd = html.indexOf(
      'function approveWithdrawal()',
      withdrawalStart,
    );
    const withdrawalSource = html.slice(withdrawalStart, withdrawalEnd);

    const runMutationScenario = async (options: {
      expectedPath: string;
      invokeExpression: string;
      item: { id: string };
      response: unknown;
      source: string;
      startingTab: 'refunds' | 'withdrawals';
    }) => {
      let resolveMutation: ((value: unknown) => void) | undefined;
      const mutation = new Promise<unknown>(resolve => {
        resolveMutation = resolve;
      });
      const nodes = new Map<
        string,
        {
          disabled: boolean;
          innerHTML: string;
          textContent: string;
          value: string;
        }
      >();
      const getNode = (id: string) => {
        const existing = nodes.get(id);
        if (existing) return existing;
        const created = {
          disabled: false,
          innerHTML: '',
          textContent: '',
          value:
            id === 'expectedVersionInput'
              ? '7'
              : id === 'reasonInput'
              ? '起始记录操作原因'
              : '',
        };
        nodes.set(id, created);
        return created;
      };
      const api = jest.fn(() => mutation);
      const ensureSelectedRecord = jest.fn(() => options.item);
      const loadFinanceReport = jest.fn().mockResolvedValue(undefined);
      const loadFinanceList = jest.fn().mockResolvedValue(undefined);
      const loadFinanceDetail = jest.fn().mockResolvedValue(undefined);
      const context = {
        financeMutationPending: false,
        currentFinanceTab: options.startingTab as string,
        currentFinancePage: 2,
        selectedFinanceRecordId: options.item.id,
        document: { getElementById: getNode },
        ensureSelectedRecord,
        createIdempotencyKey: jest.fn(() => 'finance-idempotency-key'),
        api,
        encodeURIComponent,
        updateFinanceActionControls: jest.fn(),
        updateWithdrawalBatchSelectionUi: jest.fn(),
        loadFinanceReport,
        loadFinanceList,
        loadFinanceDetail,
        withdrawalReviewPaths: {
          approve: '/admin/finance/withdrawals/{withdrawalId}/approve',
          reject: '/admin/finance/withdrawals/{withdrawalId}/reject',
        },
        invokeMutation: undefined as undefined | (() => Promise<void>),
      };
      runInNewContext(
        `${helperSource}\n${options.source}\ninvokeMutation = ${options.invokeExpression};`,
        context,
      );
      if (!context.invokeMutation) {
        throw new Error('finance mutation function was not initialized');
      }

      const firstMutation = context.invokeMutation();
      await context.invokeMutation();

      expect(api).toHaveBeenCalledTimes(1);
      expect(ensureSelectedRecord).toHaveBeenCalledWith(options.startingTab);
      expect(api).toHaveBeenCalledWith(
        options.expectedPath,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Idempotency-Key': 'finance-idempotency-key' },
          body: JSON.stringify({
            expectedVersion: 7,
            reason: '起始记录操作原因',
          }),
        }),
      );

      context.currentFinanceTab = 'payments';
      context.selectedFinanceRecordId = 'payment-b';
      getNode('financeMutationNotice').textContent = '正在查看支付 B';
      getNode('reasonInput').value = '支付 B 的输入';
      resolveMutation!(options.response);
      await firstMutation;

      expect(api).toHaveBeenCalledTimes(1);
      expect(loadFinanceReport).toHaveBeenCalledTimes(1);
      expect(loadFinanceList).not.toHaveBeenCalled();
      expect(loadFinanceDetail).not.toHaveBeenCalled();
      expect(getNode('financeMutationNotice').textContent).toBe(
        '正在查看支付 B',
      );
      expect(getNode('reasonInput').value).toBe('支付 B 的输入');
      expect(context.currentFinanceTab).toBe('payments');
      expect(context.selectedFinanceRecordId).toBe('payment-b');
      expect(context.financeMutationPending).toBe(false);
      expect(context.updateFinanceActionControls).toHaveBeenCalledTimes(2);
      expect(context.updateWithdrawalBatchSelectionUi).toHaveBeenCalledTimes(2);
    };

    await runMutationScenario({
      startingTab: 'refunds',
      item: { id: 'refund-a' },
      expectedPath: '/admin/finance/refunds/refund-a/retry',
      response: { refund: { id: 'refund-a' } },
      source: retrySource,
      invokeExpression: 'retryRefund',
    });
    await runMutationScenario({
      startingTab: 'withdrawals',
      item: { id: 'withdrawal-a' },
      expectedPath: '/admin/finance/withdrawals/withdrawal-a/approve',
      response: { withdrawal: { id: 'withdrawal-a' } },
      source: withdrawalSource,
      invokeExpression: "() => reviewWithdrawal('approve')",
    });
  });

  it('invalidates pending ledger requests whenever the ledger detail clears', () => {
    const html = renderFinanceAdminConsole();
    const clearStart = html.indexOf('function clearLedgerDetail()');
    const invalidationIndex = html.indexOf(
      'latestLedgerRequestId += 1',
      clearStart,
    );
    const emptyLedgerIndex = html.indexOf(
      "document.getElementById('ledgerDetail').innerHTML",
      clearStart,
    );

    expect(invalidationIndex).toBeGreaterThan(clearStart);
    expect(invalidationIndex).toBeLessThan(emptyLedgerIndex);
  });
});

describe('order change request admin console page', () => {
  it('renders the change-request queue, review actions and audit-event panel', () => {
    const html = renderOrderChangeRequestAdminConsole();

    expect(html).toContain('订单修改申请审核台');
    expect(html).toContain('/api/admin/orders/change-requests');
    expect(html).toContain('/change-request/review');
    expect(html).toContain('/change-request/review-events');
    expect(html).toContain('reviewResultText');
    expect(html).toContain('costImpactText');
    expect(html).toContain('refundText');
    expect(html).toContain('driverNoticeText');
    expect(html).toContain('reviewEventStatus');
    expect(html).toContain('reviewEventList');
    expect(html).toContain('loadReviewEvents');
    expect(html).toContain('buildReviewSnapshotBlocks');
    expect(html).toContain('fillReviewForm');
    expect(html).toContain('formatReviewEventStage');
    expect(html).toContain('latestReviewEventsRequestId');
    expect(html).toContain('暂无审核事件');
    expect(html).not.toContain('hero');
  });

  it('syncs queue filters and selected order change request into route state', () => {
    const html = renderOrderChangeRequestAdminConsole();

    expect(html).toContain('applyOrderChangeRequestRouteState');
    expect(html).toContain('syncOrderChangeRequestRouteState');
    expect(html).toContain("query.get('status') || 'pending'");
    expect(html).toContain("query.get('orderId')");
    expect(html).toContain("query.set('orderId', orderId)");
    expect(html).toContain('history.replaceState');
  });

  it('loads routed order change details outside the current queue without replacing the selection', () => {
    const html = renderOrderChangeRequestAdminConsole();
    const renderQueueStart = html.indexOf('function renderQueue(items)');
    const renderQueueEnd = html.indexOf(
      'function setReviewActionsEnabled(enabled)',
      renderQueueStart,
    );
    const renderQueueBody = html.slice(renderQueueStart, renderQueueEnd);
    const routedDetailStart = html.indexOf(
      'async function loadRoutedChangeRequestDetail(orderId)',
    );
    const routedDetailEnd = html.indexOf(
      'async function loadReviewEvents()',
      routedDetailStart,
    );
    const routedDetailBody = html.slice(routedDetailStart, routedDetailEnd);
    const loadQueueStart = html.indexOf('async function loadQueue()');
    const loadQueueEnd = html.indexOf(
      'async function review(decision)',
      loadQueueStart,
    );
    const loadQueueBody = html.slice(loadQueueStart, loadQueueEnd);
    const queuedSelectionStart = loadQueueBody.indexOf('if (queuedSelection)');
    const routedSelectionStart = loadQueueBody.indexOf(
      '} else if (selectedOrderId)',
      queuedSelectionStart,
    );
    const queuedSelectionBody = loadQueueBody.slice(
      queuedSelectionStart,
      routedSelectionStart,
    );
    const missingDetailStart = routedDetailBody.indexOf('if (!detail)');
    const missingDetailEnd = routedDetailBody.indexOf(
      'selectedChangeRequest = detail',
      missingDetailStart,
    );
    const missingDetailBody = routedDetailBody.slice(
      missingDetailStart,
      missingDetailEnd,
    );
    const detailGuardIndex = routedDetailBody.indexOf(
      'requestId !== latestDetailRequestId',
    );
    const detailCommitIndex = routedDetailBody.indexOf(
      'selectedChangeRequest = detail',
      detailGuardIndex,
    );

    expect(renderQueueBody).toContain('if (!selectedOrderId)');
    expect(renderQueueBody).not.toContain(
      'if (!currentItems.some(item => item.orderId === selectedOrderId))',
    );
    expect(routedDetailBody).toContain(
      "apiGet(orderApiBase + '/' + encodeURIComponent(orderId))",
    );
    expect(routedDetailBody).toContain(
      "encodeURIComponent(orderId) + '/change-request/review-events'",
    );
    expect(routedDetailBody).toContain('const [order, events] = await Promise.all([');
    expect(routedDetailBody).toContain(
      'requestId !== latestDetailRequestId',
    );
    expect(routedDetailBody).toContain('selectedOrderId !== orderId');
    expect(detailCommitIndex).toBeGreaterThan(detailGuardIndex);
    expect(queuedSelectionStart).toBeGreaterThanOrEqual(0);
    expect(routedSelectionStart).toBeGreaterThan(queuedSelectionStart);
    expect(queuedSelectionBody).toContain('await loadReviewEvents()');
    expect(queuedSelectionBody).not.toContain('loadRoutedChangeRequestDetail');
    expect(loadQueueBody).toContain(
      'await loadRoutedChangeRequestDetail(selectedOrderId)',
    );
    expect(missingDetailBody).not.toContain("selectedOrderId = ''");
    expect(missingDetailBody).not.toContain('currentItems[0]');
    expect(html).toContain("targetChangeRequest.status !== 'pending'");
  });

  it('groups routed order change decisions by the latest request boundary', () => {
    const html = renderOrderChangeRequestAdminConsole();
    const helperStart = html.indexOf(
      'function findLatestChangeRequestCycle(events)',
    );
    const helperEnd = html.indexOf(
      'function resetReviewEvents(statusText)',
      helperStart,
    );
    const helperSource = html.slice(helperStart, helperEnd);
    const createDetail = (events: Array<Record<string, unknown>>) => {
      const context: {
        order: Record<string, unknown>;
        events: Array<Record<string, unknown>>;
        result?: unknown;
      } = {
        order: {
          id: 'order-1',
          orderNo: 'HY202607260001',
          shipperId: 'shipper-1',
          assignedDriverId: 'driver-1',
          status: 'transporting',
        },
        events,
      };

      runInNewContext(
        `${helperSource}\nresult = createRoutedChangeRequest(order, events);`,
        context,
      );
      return context.result
        ? JSON.parse(JSON.stringify(context.result))
        : context.result;
    };
    const previousCycle = [
      {
        eventId: 'review-1',
        stage: 'approved',
        noteText: '上一轮已通过',
        createdAtIso: '2026-07-26T08:02:00.000Z',
      },
      {
        eventId: 'request-1',
        stage: 'requested',
        noteText: '上一轮申请',
        createdAtIso: '2026-07-26T08:01:00.000Z',
      },
    ];

    expect(
      createDetail([
        {
          eventId: 'request-2',
          stage: 'requested',
          noteText: '本轮待审申请',
          createdAtIso: '2026-07-26T08:03:00.000Z',
        },
        ...previousCycle,
      ]),
    ).toMatchObject({
      orderId: 'order-1',
      status: 'pending',
      description: '本轮待审申请',
      requestedAtIso: '2026-07-26T08:03:00.000Z',
    });
    expect(
      createDetail([
        {
          eventId: 'review-2',
          stage: 'rejected',
          noteText: '本轮资料不足',
          costImpactText: '费用不变',
          createdAtIso: '2026-07-26T08:04:00.000Z',
        },
        {
          eventId: 'request-2',
          stage: 'requested',
          noteText: '本轮已审申请',
          createdAtIso: '2026-07-26T08:03:00.000Z',
        },
        ...previousCycle,
      ]),
    ).toMatchObject({
      status: 'rejected',
      description: '本轮已审申请',
      reviewResultText: '本轮资料不足',
      costImpactText: '费用不变',
      reviewedAtIso: '2026-07-26T08:04:00.000Z',
    });
    expect(createDetail(previousCycle.slice(0, 1))).toBeNull();
  });

  it('ignores stale order change queue responses and keeps the latest review context', () => {
    const html = renderOrderChangeRequestAdminConsole();

    expect(html).toContain('let latestQueueRequestId = 0');
    expect(html).toContain('let latestReviewEventsRequestId = 0');
    expect(html).toContain('const requestId = ++latestQueueRequestId');
    expect(html).toContain('if (requestId !== latestQueueRequestId) {');
    expect(html).toContain('const requestId = ++latestReviewEventsRequestId');
    expect(html).toContain('requestId !== latestReviewEventsRequestId ||');
    expect(html).toContain('selectedOrderId !== targetOrderId');
  });

  it('keeps order change review completions bound to their originating order', () => {
    const html = renderOrderChangeRequestAdminConsole();
    const reviewStart = html.indexOf('async function review(decision)');
    const reviewEnd = html.indexOf(
      "document.getElementById('refreshButton')",
      reviewStart,
    );
    const reviewBody = html.slice(reviewStart, reviewEnd);
    const apiPostStart = html.indexOf('async function apiPost(url, body)');
    const apiPostEnd = html.indexOf('function renderQueue(items)', apiPostStart);
    const apiPostBody = html.slice(apiPostStart, apiPostEnd);
    const postIndex = reviewBody.indexOf('await apiPost(');
    const successGuardIndex = reviewBody.indexOf(
      'selectedOrderId !== targetOrderId',
      postIndex,
    );
    const successStatusIndex = reviewBody.indexOf(
      "setText('reviewStatus', '审核成功：' + decision)",
      successGuardIndex,
    );
    const localTerminalIndex = reviewBody.indexOf(
      'selectedChangeRequest = {',
      successGuardIndex,
    );
    const pendingClearIndex = reviewBody.indexOf(
      'reviewMutationPending = false',
      successStatusIndex,
    );
    const refreshIndex = reviewBody.indexOf(
      'await loadQueue()',
      pendingClearIndex,
    );
    const pendingGuardIndex = reviewBody.indexOf(
      'if (reviewMutationPending)',
    );
    const reviewRequestIndex = reviewBody.indexOf(
      'const requestId = ++latestReviewRequestId',
    );

    expect(html).toContain('let reviewMutationPending = false');
    expect(html).toContain(
      "!reviewMutationPending && item.status === 'pending'",
    );
    expect(pendingGuardIndex).toBeGreaterThanOrEqual(0);
    expect(reviewRequestIndex).toBeGreaterThan(pendingGuardIndex);
    expect(reviewBody).toContain('const requestId = ++latestReviewRequestId');
    expect(reviewBody).toContain('const targetOrderId = selectedOrderId');
    expect(reviewBody).toContain(
      "encodeURIComponent(targetOrderId) + '/change-request/review'",
    );
    expect(successGuardIndex).toBeGreaterThan(postIndex);
    expect(localTerminalIndex).toBeGreaterThan(successGuardIndex);
    expect(successStatusIndex).toBeGreaterThan(localTerminalIndex);
    expect(successStatusIndex).toBeGreaterThan(successGuardIndex);
    expect(pendingClearIndex).toBeGreaterThan(successStatusIndex);
    expect(refreshIndex).toBeGreaterThan(pendingClearIndex);
    expect(reviewBody).toContain('status: decision');
    expect(reviewBody).toContain('let shouldRefresh = false');
    expect(reviewBody).toContain('shouldRefresh = true');
    expect(apiPostBody).toContain('error.code = payload.code');
    expect(reviewBody).toContain("error.code === 'ORDER_CONFLICT'");
    expect(reviewBody).toContain("error.code === 'ORDER_STATE_INVALID'");
    expect(reviewBody).toContain(
      '!shouldRefresh &&\n            selectedChangeRequest?.orderId === selectedOrderId',
    );
    expect(reviewBody.match(/selectedOrderId !== targetOrderId/g)).toHaveLength(
      2,
    );
    expect(reviewBody).not.toContain(
      "encodeURIComponent(selectedOrderId) + '/change-request/review'",
    );
    expect(reviewBody).toContain('reviewMutationPending = true');
    expect(reviewBody).toContain('finally {');
    expect(reviewBody).toContain('reviewMutationPending = false');
    expect(reviewBody).toContain(
      'selectedChangeRequest?.orderId === selectedOrderId',
    );
  });

  it('executes order change reviews without duplicate or cross-selection commits', async () => {
    const html = renderOrderChangeRequestAdminConsole();
    const reviewStart = html.indexOf('async function review(decision)');
    const reviewEnd = html.indexOf(
      "document.getElementById('refreshButton')",
      reviewStart,
    );
    const reviewSource = html.slice(reviewStart, reviewEnd);
    const createRuntime = (
      post: () => Promise<unknown>,
      refresh: () => Promise<unknown>,
    ) => {
      const apiPost = jest.fn(post);
      const loadQueue = jest.fn(refresh);
      const setText = jest.fn();
      const setReviewActionsEnabled = jest.fn();
      const context = {
        reviewMutationPending: false,
        latestReviewRequestId: 0,
        selectedOrderId: 'order-a',
        selectedChangeRequest: {
          orderId: 'order-a',
          status: 'pending',
        },
        document: {
          getElementById: () => ({ value: '' }),
        },
        apiPost,
        loadQueue,
        setText,
        setReviewActionsEnabled,
        renderDetail: jest.fn(),
        orderApiBase: '/api/admin/orders',
        encodeURIComponent,
        invokeReview: undefined as
          | undefined
          | ((decision: 'approved' | 'rejected') => Promise<void>),
      };

      runInNewContext(`${reviewSource}\ninvokeReview = review;`, context);
      if (!context.invokeReview) {
        throw new Error('review function was not initialized');
      }

      return {
        apiPost,
        context,
        invokeReview: context.invokeReview,
        loadQueue,
        setReviewActionsEnabled,
        setText,
      };
    };

    let resolvePost: (() => void) | undefined;
    let resolveRefresh: (() => void) | undefined;
    const post = new Promise<void>(resolve => {
      resolvePost = resolve;
    });
    const refresh = new Promise<void>(resolve => {
      resolveRefresh = resolve;
    });
    const successful = createRuntime(() => post, () => refresh);
    const firstReview = successful.invokeReview('approved');

    await successful.invokeReview('rejected');
    expect(successful.apiPost).toHaveBeenCalledTimes(1);

    resolvePost?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(successful.context.reviewMutationPending).toBe(false);
    expect(successful.context.selectedChangeRequest.status).toBe('approved');
    expect(successful.loadQueue).toHaveBeenCalledTimes(1);

    await successful.invokeReview('rejected');
    expect(successful.apiPost).toHaveBeenCalledTimes(1);
    resolveRefresh?.();
    await firstReview;

    let resolveSelectionPost: (() => void) | undefined;
    const selectionPost = new Promise<void>(resolve => {
      resolveSelectionPost = resolve;
    });
    const switched = createRuntime(
      () => selectionPost,
      () => Promise.resolve(),
    );
    const switchedReview = switched.invokeReview('approved');
    switched.context.selectedOrderId = 'order-b';
    switched.context.selectedChangeRequest = {
      orderId: 'order-b',
      status: 'pending',
    };
    resolveSelectionPost?.();
    await switchedReview;

    expect(switched.context.selectedChangeRequest).toEqual({
      orderId: 'order-b',
      status: 'pending',
    });
    expect(switched.loadQueue).not.toHaveBeenCalled();
    expect(switched.setText).not.toHaveBeenCalledWith(
      'reviewStatus',
      '审核成功：approved',
    );

    const conflict = Object.assign(new Error('订单已被其他操作更新'), {
      code: 'ORDER_CONFLICT',
    });
    const conflicted = createRuntime(
      () => Promise.reject(conflict),
      () => Promise.resolve(),
    );
    await conflicted.invokeReview('rejected');

    expect(conflicted.loadQueue).toHaveBeenCalledTimes(1);
    expect(conflicted.setReviewActionsEnabled).toHaveBeenLastCalledWith(false);
    expect(conflicted.setText).toHaveBeenCalledWith(
      'reviewStatus',
      '订单已被其他操作更新',
    );
  });

  it('executes the shared admin session bootstrap before auto-loading the order change queue', () => {
    const html = renderOrderChangeRequestAdminConsole();
    const applicationScriptStart = html.lastIndexOf('<script>');
    const applicationScriptEnd = html.indexOf('</script>', applicationScriptStart);
    const sessionBootstrapIndex = html.indexOf(
      "const adminSessionStorageKey = 'stage1AdminSession'",
    );

    expect(sessionBootstrapIndex).toBeGreaterThan(applicationScriptStart);
    expect(sessionBootstrapIndex).toBeLessThan(applicationScriptEnd);
    expect(html).toContain('const stored = readStoredAdminSession()');
    expect(html).toContain('stored.session?.accessToken');
    expect(html).toContain('const currentAdminSession = initializeAdminSession()');
    expect(html).toContain(
      'if (currentAdminSession && currentAdminSession.accessToken)',
    );
  });

  it('invalidates order change queue and audit requests before the missing-token return', () => {
    const html = renderOrderChangeRequestAdminConsole();
    const queueStart = html.indexOf('async function loadQueue()');
    const queueRequestIndex = html.indexOf(
      'const requestId = ++latestQueueRequestId',
      queueStart,
    );
    const auditInvalidationIndex = html.indexOf(
      'latestReviewEventsRequestId += 1',
      queueStart,
    );
    const missingTokenIndex = html.indexOf('if (!getToken())', queueStart);

    expect(queueRequestIndex).toBeGreaterThan(queueStart);
    expect(queueRequestIndex).toBeLessThan(missingTokenIndex);
    expect(auditInvalidationIndex).toBeGreaterThan(queueStart);
    expect(auditInvalidationIndex).toBeLessThan(missingTokenIndex);
  });
});

describe('shipper invoice admin console page', () => {
  it('renders independent invoice details, pagination, review actions and audit events', () => {
    const html = renderShipperInvoiceAdminConsole();

    expect(html).toContain('发票申请审核台');
    expect(html).toContain('/api/admin/shipper-invoices');
    expect(html).toContain('/download');
    expect(html).toContain('/review-events');
    expect(html).toContain('/review');
    expect(html).toContain('downloadButton');
    expect(html).toContain('downloadStatus');
    expect(html).toContain('downloadSelectedInvoice');
    expect(html).toContain('extractDownloadFilename');
    expect(html).toContain('reviewEventStatus');
    expect(html).toContain('reviewEventList');
    expect(html).toContain('selectApplication');
    expect(html).toContain('formatReviewEventStage');
    expect(html).toContain('let currentDetail = null');
    expect(html).toContain('let latestDetailRequestId = 0');
    expect(html).toContain('let latestReviewMutationRequestId = 0');
    expect(html).toContain('let reviewMutationPending = false');
    expect(html).toContain('let latestDownloadRequestId = 0');
    expect(html).toContain('let downloadPending = false');
    expect(html).toContain('previousPageButton');
    expect(html).toContain('nextPageButton');
    expect(html).toContain('pageSizeFilter');
    expect(html).toContain(
      "event.reviewerAdminId || event.actorUserId || '系统'",
    );
    expect(html).toContain('暂无审核事件');
    expect(html).not.toContain('hero');
  });

  it('syncs queue filters and selected invoice application into route state', () => {
    const html = renderShipperInvoiceAdminConsole();

    expect(html).toContain('applyShipperInvoiceRouteState');
    expect(html).toContain('syncShipperInvoiceRouteState');
    expect(html).toContain("query.get('status') || 'reviewing'");
    expect(html).toContain("status !== 'reviewing'");
    expect(html).not.toContain("query.get('status') || 'pending'");
    expect(html).toContain("query.get('applicationId')");
    expect(html).toContain("query.get('page')");
    expect(html).toContain("query.get('pageSize')");
    expect(html).toContain("query.set('applicationId', applicationId)");
    expect(html).toContain("query.set('page', String(page))");
    expect(html).toContain("query.set('pageSize', String(pageSize))");
    expect(html).toContain('history.replaceState');
  });

  it('keeps invoice queue pagination and routed details as independent request generations', () => {
    const html = renderShipperInvoiceAdminConsole();
    const queueStart = html.indexOf('async function loadQueue(page)');
    const queueEnd = html.indexOf(
      'async function refreshWorkspace(page)',
      queueStart,
    );
    const queueBody = html.slice(queueStart, queueEnd);
    const queueRenderStart = html.indexOf('function renderQueue(items)');
    const queueRenderEnd = html.indexOf(
      'function renderDetail()',
      queueRenderStart,
    );
    const queueRenderBody = html.slice(queueRenderStart, queueRenderEnd);

    expect(html).toContain('let latestQueueRequestId = 0');
    expect(html).toContain('let latestDetailRequestId = 0');
    expect(html).toContain('const requestId = ++latestQueueRequestId');
    expect(html).toContain('if (requestId !== latestQueueRequestId) {');
    expect(html).toContain('const requestId = ++latestDetailRequestId');
    expect(html).toContain('requestId !== latestDetailRequestId ||');
    expect(html).toContain(
      'selectedApplicationId !== targetApplicationId',
    );
    expect(queueBody).not.toContain('latestDetailRequestId');
    expect(queueBody).not.toContain('resetDetail(');
    expect(queueBody).not.toContain('resetReviewEvents(');
    expect(queueRenderBody).not.toContain("selectedApplicationId = ''");
    expect(queueRenderBody).not.toContain(
      "syncShipperInvoiceRouteState('')",
    );
  });

  it('commits only the latest invoice workspace and degrades audit events independently', async () => {
    const html = renderShipperInvoiceAdminConsole();
    const selectStart = html.indexOf(
      'async function selectApplication(applicationId)',
    );
    const selectEnd = html.indexOf(
      'async function loadQueue(page)',
      selectStart,
    );
    const selectSource = html.slice(selectStart, selectEnd);
    const createDeferred = () => {
      let resolve: ((value: unknown) => void) | undefined;
      let reject: ((reason?: unknown) => void) | undefined;
      const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      return { promise, reject, resolve };
    };
    const flushPromises = () =>
      new Promise<void>(resolve => setImmediate(resolve));
    const pending = new Map<string, ReturnType<typeof createDeferred>>();
    const createApplicationRequests = (applicationId: string) => {
      const detail = createDeferred();
      const events = createDeferred();
      pending.set('/' + applicationId, detail);
      pending.set('/' + applicationId + '/review-events', events);
      return { detail, events };
    };
    const apiGet = jest.fn((path: string) => {
      const deferred = pending.get(path);
      if (!deferred) {
        return Promise.reject(new Error('unexpected request: ' + path));
      }
      return deferred.promise;
    });
    let activeContext:
      | {
          currentDetail: unknown;
          currentReviewEvents: unknown[];
        }
      | undefined;
    const resetDetail = jest.fn(() => {
      if (activeContext) activeContext.currentDetail = null;
    });
    const resetReviewEvents = jest.fn(() => {
      if (activeContext) activeContext.currentReviewEvents = [];
    });
    const context = {
      latestDetailRequestId: 0,
      latestDownloadRequestId: 0,
      downloadPending: false,
      selectedApplicationId: '',
      currentItems: [] as unknown[],
      currentDetail: null as unknown,
      currentReviewEvents: [] as unknown[],
      syncShipperInvoiceRouteState: jest.fn(),
      renderQueue: jest.fn(),
      setText: jest.fn(),
      resetDetail,
      resetReviewEvents,
      getToken: jest.fn(() => 'admin-token'),
      apiGet,
      encodeURIComponent,
      renderDetail: jest.fn(),
      renderReviewEvents: jest.fn(),
      invokeSelectApplication: undefined as
        | undefined
        | ((applicationId: string) => Promise<void>),
    };
    activeContext = context;
    runInNewContext(
      `${selectSource}\ninvokeSelectApplication = selectApplication;`,
      context,
    );
    if (!context.invokeSelectApplication) {
      throw new Error('selectApplication function was not initialized');
    }

    const applicationA = createApplicationRequests('invoice-a');
    const applicationB = createApplicationRequests('invoice-b');
    const slowApplicationA = context.invokeSelectApplication('invoice-a');
    const fastApplicationB = context.invokeSelectApplication('invoice-b');
    applicationB.events.resolve?.([{ eventId: 'event-b' }]);
    await flushPromises();

    expect(context.currentDetail).toBeNull();
    expect(context.currentReviewEvents).toEqual([]);

    const applicationBDetail = {
      id: 'invoice-b',
      status: 'approved',
    };
    applicationB.detail.resolve?.(applicationBDetail);
    await fastApplicationB;
    await flushPromises();
    expect(context.currentDetail).toEqual(applicationBDetail);
    expect(context.currentReviewEvents).toEqual([{ eventId: 'event-b' }]);

    applicationA.detail.resolve?.({ id: 'invoice-a', status: 'reviewing' });
    applicationA.events.resolve?.([{ eventId: 'event-a' }]);
    await slowApplicationA;
    await flushPromises();
    expect(context.currentDetail).toEqual(applicationBDetail);
    expect(context.currentReviewEvents).toEqual([{ eventId: 'event-b' }]);

    const applicationC = createApplicationRequests('invoice-c');
    const degradedApplicationC = context.invokeSelectApplication('invoice-c');
    const applicationCDetail = {
      id: 'invoice-c',
      status: 'approved',
    };
    applicationC.detail.resolve?.(applicationCDetail);
    applicationC.events.reject?.(new Error('审核事件暂不可用'));
    await degradedApplicationC;
    await flushPromises();

    expect(context.currentDetail).toEqual(applicationCDetail);
    expect(context.currentReviewEvents).toEqual([]);
    expect(resetReviewEvents).toHaveBeenLastCalledWith('审核事件暂不可用');

    const applicationD = createApplicationRequests('invoice-d');
    const failedApplicationD = context.invokeSelectApplication('invoice-d');
    applicationD.events.resolve?.([{ eventId: 'event-d' }]);
    await flushPromises();
    expect(context.currentReviewEvents).toEqual([]);
    applicationD.detail.reject?.(new Error('发票申请不存在'));
    await failedApplicationD;

    expect(context.selectedApplicationId).toBe('invoice-d');
    expect(context.currentDetail).toBeNull();
    expect(context.currentReviewEvents).toEqual([]);
    expect(context.syncShipperInvoiceRouteState).toHaveBeenLastCalledWith(
      'invoice-d',
    );

    const applicationE = createApplicationRequests('invoice-e');
    let applicationESelectionSettled = false;
    const independentlyLoadedApplicationE = context
      .invokeSelectApplication('invoice-e')
      .then(() => {
        applicationESelectionSettled = true;
      });
    const applicationEDetail = { id: 'invoice-e', status: 'reviewing' };
    applicationE.detail.resolve?.(applicationEDetail);
    await flushPromises();

    expect(applicationESelectionSettled).toBe(true);
    expect(context.currentDetail).toEqual(applicationEDetail);
    expect(context.currentReviewEvents).toEqual([]);
    await independentlyLoadedApplicationE;

    applicationE.events.resolve?.([{ eventId: 'event-e' }]);
    await flushPromises();
    expect(context.currentReviewEvents).toEqual([{ eventId: 'event-e' }]);
  });

  it('retains routed invoice ids across empty, out-of-page and failed queue results', async () => {
    const html = renderShipperInvoiceAdminConsole();
    const renderQueueStart = html.indexOf('function renderQueue(items)');
    const renderQueueEnd = html.indexOf(
      'function renderDetail()',
      renderQueueStart,
    );
    const renderQueueSource = html.slice(renderQueueStart, renderQueueEnd);
    const queueRoot = {
      innerHTML: '',
      querySelectorAll: jest.fn(() => []),
    };
    type InvoiceQueueItem = {
      amountCents: number;
      id: string;
      invoiceTitle: string;
      shipperId: string;
      status: string;
    };
    const renderContext: {
      currentItems: InvoiceQueueItem[];
      document: { getElementById: jest.Mock };
      escapeHtml: (value: unknown) => string;
      formatAmount: (value: unknown) => string;
      invokeRenderQueue?: (items: InvoiceQueueItem[]) => void;
      selectApplication: jest.Mock;
      selectedApplicationId: string;
    } = {
      selectedApplicationId: 'routed-invoice',
      currentItems: [],
      document: {
        getElementById: jest.fn(() => queueRoot),
      },
      escapeHtml: (value: unknown) => String(value),
      formatAmount: (value: unknown) => String(value),
      selectApplication: jest.fn(),
      invokeRenderQueue: undefined,
    };
    runInNewContext(
      `${renderQueueSource}\ninvokeRenderQueue = renderQueue;`,
      renderContext,
    );
    if (!renderContext.invokeRenderQueue) {
      throw new Error('renderQueue function was not initialized');
    }

    renderContext.invokeRenderQueue([]);
    expect(renderContext.selectedApplicationId).toBe('routed-invoice');
    renderContext.invokeRenderQueue([
      {
        amountCents: 100,
        id: 'another-invoice',
        invoiceTitle: '其他申请',
        shipperId: 'shipper-2',
        status: 'reviewing',
      },
    ]);
    expect(renderContext.selectedApplicationId).toBe('routed-invoice');

    const loadQueueStart = html.indexOf('async function loadQueue(page)');
    const loadQueueEnd = html.indexOf(
      'async function refreshWorkspace(page)',
      loadQueueStart,
    );
    const loadQueueSource = html.slice(loadQueueStart, loadQueueEnd);
    const detailBeforeFailure = {
      id: 'routed-invoice',
      status: 'reviewing',
    };
    const loadContext = {
      latestQueueRequestId: 0,
      currentPage: 1,
      currentTotal: 1,
      currentItems: [{ id: 'another-invoice' }],
      currentDetail: detailBeforeFailure,
      selectedApplicationId: 'routed-invoice',
      syncShipperInvoiceRouteState: jest.fn(),
      getQueuePageSize: jest.fn(() => 20),
      getToken: jest.fn(() => 'admin-token'),
      clearQueueResults: jest.fn(),
      setText: jest.fn(),
      document: {
        getElementById: jest.fn(() => ({ value: 'reviewing' })),
      },
      URLSearchParams,
      apiGet: jest.fn(() => Promise.reject(new Error('队列加载失败'))),
      renderQueue: jest.fn(),
      renderPagination: jest.fn(),
      selectApplication: jest.fn(),
      invokeLoadQueue: undefined as
        | undefined
        | ((page: number) => Promise<void>),
    };
    runInNewContext(
      `${loadQueueSource}\ninvokeLoadQueue = loadQueue;`,
      loadContext,
    );
    if (!loadContext.invokeLoadQueue) {
      throw new Error('loadQueue function was not initialized');
    }
    await loadContext.invokeLoadQueue(1);

    expect(loadContext.selectedApplicationId).toBe('routed-invoice');
    expect(loadContext.currentDetail).toBe(detailBeforeFailure);
    expect(loadContext.clearQueueResults).toHaveBeenCalledWith('队列加载失败');
  });

  it('prevents duplicate and terminal reviews without restoring a previous selection', async () => {
    const html = renderShipperInvoiceAdminConsole();
    const reviewStart = html.indexOf('async function review(status)');
    const reviewEnd = html.indexOf(
      "document.getElementById('refreshButton')",
      reviewStart,
    );
    const reviewSource = html.slice(reviewStart, reviewEnd);
    let resolveReview: ((value: unknown) => void) | undefined;
    const reviewResponse = new Promise<unknown>(resolve => {
      resolveReview = resolve;
    });
    const apiPost = jest.fn().mockReturnValueOnce(reviewResponse);
    const loadQueue = jest.fn(() => Promise.resolve());
    const selectApplication = jest.fn(() => Promise.resolve());
    const context = {
      reviewMutationPending: false,
      latestReviewMutationRequestId: 0,
      selectedApplicationId: 'invoice-a',
      currentDetail: {
        id: 'invoice-a',
        status: 'reviewing',
      },
      currentPage: 1,
      document: {
        getElementById: jest.fn(() => ({ value: '' })),
      },
      setText: jest.fn(),
      updateReviewControls: jest.fn(),
      apiPost,
      encodeURIComponent,
      loadQueue,
      selectApplication,
      invokeReview: undefined as
        | undefined
        | ((status: 'approved' | 'rejected') => Promise<void>),
    };
    runInNewContext(`${reviewSource}\ninvokeReview = review;`, context);
    if (!context.invokeReview) {
      throw new Error('review function was not initialized');
    }

    const firstReview = context.invokeReview('approved');
    await context.invokeReview('approved');
    expect(apiPost).toHaveBeenCalledTimes(1);

    const invoiceBDetail = { id: 'invoice-b', status: 'reviewing' };
    context.selectedApplicationId = 'invoice-b';
    context.currentDetail = invoiceBDetail;
    resolveReview?.({ status: 'approved' });
    await firstReview;

    expect(context.selectedApplicationId).toBe('invoice-b');
    expect(context.currentDetail).toBe(invoiceBDetail);
    expect(loadQueue).toHaveBeenCalledTimes(1);
    expect(selectApplication).not.toHaveBeenCalled();
    expect(context.setText).not.toHaveBeenCalledWith(
      'reviewStatus',
      '审核成功：approved',
    );
    expect(context.reviewMutationPending).toBe(false);

    context.currentDetail = { id: 'invoice-b', status: 'approved' };
    await context.invokeReview('approved');
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(context.setText).toHaveBeenLastCalledWith(
      'reviewStatus',
      '当前发票申请不处于待审核状态。',
    );

    loadQueue.mockClear();
    selectApplication.mockClear();
    context.selectedApplicationId = 'invoice-c';
    context.currentDetail = { id: 'invoice-c', status: 'reviewing' };
    apiPost.mockRejectedValueOnce(
      Object.assign(new Error('发票状态已变化'), {
        code: 'INVOICE_APPLICATION_STATE_INVALID',
      }),
    );
    await context.invokeReview('approved');

    expect(loadQueue).toHaveBeenCalledTimes(1);
    expect(selectApplication).toHaveBeenCalledWith('invoice-c');
    expect(context.setText).toHaveBeenCalledWith(
      'reviewStatus',
      '发票状态已变化',
    );
    expect(html).toContain('error.code = payload.code');
    expect(html).toContain("error.code === 'INVOICE_APPLICATION_NOT_FOUND'");
  });

  it('executes the shared admin session bootstrap before refreshing the invoice workspace', () => {
    const html = renderShipperInvoiceAdminConsole();
    const applicationScriptStart = html.lastIndexOf('<script>');
    const applicationScriptEnd = html.indexOf('</script>', applicationScriptStart);
    const sessionBootstrapIndex = html.indexOf(
      "const adminSessionStorageKey = 'stage1AdminSession'",
    );

    expect(sessionBootstrapIndex).toBeGreaterThan(applicationScriptStart);
    expect(sessionBootstrapIndex).toBeLessThan(applicationScriptEnd);
    expect(html).toContain('const stored = readStoredAdminSession()');
    expect(html).toContain('stored.session?.accessToken');
    expect(html).toContain('const currentAdminSession = initializeAdminSession()');
    expect(html).toContain(
      'if (currentAdminSession && currentAdminSession.accessToken)',
    );
    expect(html).toContain('refreshWorkspace(currentPage)');
  });

  it('keeps invoice downloads bound to the application selected at request time', () => {
    const html = renderShipperInvoiceAdminConsole();
    const downloadStart = html.indexOf(
      'async function downloadSelectedInvoice()',
    );
    const downloadEnd = html.indexOf(
      'async function review(status)',
      downloadStart,
    );
    const downloadSource = html.slice(downloadStart, downloadEnd);

    expect(downloadSource).toContain('const targetDetail = currentDetail');
    expect(downloadSource).toContain(
      "encodeURIComponent(targetApplicationId) + '/download'",
    );
    expect(downloadSource).toContain(
      "'invoice-' + targetApplicationId + '.txt'",
    );
    expect(downloadSource).toContain(
      'const requestId = ++latestDownloadRequestId',
    );
    expect(downloadSource).toContain('if (downloadPending) {');
    expect(downloadSource).toContain(
      'requestId === latestDownloadRequestId &&',
    );
    expect(downloadSource).toContain(
      'selectedApplicationId === targetApplicationId &&',
    );
    expect(downloadSource).toContain(
      "error.code === 'INVOICE_APPLICATION_STATE_INVALID'",
    );
    expect(downloadSource).toContain(
      '[selectApplication(targetApplicationId)]',
    );
    expect(downloadSource).not.toContain('currentItems.find(entry =>');
  });

  it('blocks duplicate invoice downloads and suppresses stale browser side effects', async () => {
    const html = renderShipperInvoiceAdminConsole();
    const selectStart = html.indexOf(
      'async function selectApplication(applicationId)',
    );
    const selectEnd = html.indexOf(
      'async function loadQueue(page)',
      selectStart,
    );
    const selectSource = html.slice(selectStart, selectEnd);
    const downloadStart = html.indexOf(
      'async function downloadSelectedInvoice()',
    );
    const downloadEnd = html.indexOf(
      'async function review(status)',
      downloadStart,
    );
    const downloadSource = html.slice(downloadStart, downloadEnd);
    let resolveFetch: ((value: unknown) => void) | undefined;
    const fetchResponse = new Promise<unknown>(resolve => {
      resolveFetch = resolve;
    });
    const fetchMock = jest.fn(() => fetchResponse);
    const createObjectURL = jest.fn(() => 'blob:invoice-a');
    const link = {
      click: jest.fn(),
      download: '',
      href: '',
    };
    let activeContext:
      | {
          currentDetail: unknown;
          currentReviewEvents: unknown[];
        }
      | undefined;
    const resetDetail = jest.fn(() => {
      if (activeContext) activeContext.currentDetail = null;
    });
    const resetReviewEvents = jest.fn(() => {
      if (activeContext) activeContext.currentReviewEvents = [];
    });
    const neverSettles = new Promise<unknown>(() => undefined);
    const context = {
      selectedApplicationId: 'invoice-a',
      currentItems: [] as unknown[],
      currentDetail: { id: 'invoice-a', status: 'approved' } as unknown,
      currentReviewEvents: [] as unknown[],
      currentPage: 1,
      latestDetailRequestId: 0,
      latestDownloadRequestId: 0,
      downloadPending: false,
      syncShipperInvoiceRouteState: jest.fn(),
      renderQueue: jest.fn(),
      setText: jest.fn(),
      resetDetail,
      resetReviewEvents,
      getToken: jest.fn(() => 'admin-token'),
      apiGet: jest.fn(() => neverSettles),
      encodeURIComponent,
      renderDetail: jest.fn(),
      renderReviewEvents: jest.fn(),
      setDownloadState: jest.fn(),
      updateDownloadControls: jest.fn(),
      fetch: fetchMock,
      apiBase: '/api/admin/shipper-invoices',
      extractDownloadFilename: jest.fn(() => 'invoice-invoice-a.txt'),
      URL: {
        createObjectURL,
        revokeObjectURL: jest.fn(),
      },
      Blob: jest.fn(),
      document: {
        createElement: jest.fn(() => link),
        body: {
          appendChild: jest.fn(),
          removeChild: jest.fn(),
        },
      },
      setTimeout: jest.fn(),
      loadQueue: jest.fn(() => Promise.resolve()),
      invokeSelectApplication: undefined as
        | undefined
        | ((applicationId: string) => Promise<void>),
      invokeDownload: undefined as undefined | (() => Promise<void>),
    };
    activeContext = context;
    runInNewContext(
      `${selectSource}\n${downloadSource}\n` +
        'invokeSelectApplication = selectApplication;\n' +
        'invokeDownload = downloadSelectedInvoice;',
      context,
    );
    if (!context.invokeSelectApplication || !context.invokeDownload) {
      throw new Error('invoice download functions were not initialized');
    }

    const firstDownload = context.invokeDownload();
    await context.invokeDownload();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(context.downloadPending).toBe(true);

    context.invokeSelectApplication('invoice-b').catch(() => undefined);
    expect(context.selectedApplicationId).toBe('invoice-b');
    expect(context.downloadPending).toBe(true);

    resolveFetch?.({
      ok: true,
      text: () => Promise.resolve('invoice-a-content'),
      headers: {
        get: jest.fn(() => null),
      },
    });
    await firstDownload;

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(link.click).not.toHaveBeenCalled();
    expect(context.downloadPending).toBe(false);
    expect(context.updateDownloadControls).toHaveBeenCalled();
  });
});

describe('shipper verification admin console page', () => {
  it('renders the verification queue, attachment preview, review actions and audit-event panel', () => {
    const html = renderShipperVerificationAdminConsole();

    expect(html).toContain('货主认证审核台');
    expect(html).toContain('/api/admin/shipper-verifications');
    expect(html).toContain('/attachments');
    expect(html).toContain('/review-events');
    expect(html).toContain('approveIdentityButton');
    expect(html).toContain('approveEnterpriseButton');
    expect(html).toContain("review('identity', 'approved')");
    expect(html).toContain("review('enterprise', 'approved')");
    expect(html).toContain('attachmentStatus');
    expect(html).toContain('attachmentList');
    expect(html).toContain('selectShipper');
    expect(html).toContain('reviewEventStatus');
    expect(html).toContain('reviewEventList');
    expect(html).toContain('const detailRequest = apiGet(');
    expect(html).toContain('void attachmentRequest.then(');
    expect(html).toContain('void reviewEventRequest.then(');
    expect(html).not.toContain('Promise.allSettled([');
    expect(html).toContain('formatReviewEventStage');
    expect(html).toContain('let currentDetail = null');
    expect(html).toContain('let latestDetailRequestId = 0');
    expect(html).toContain('let latestReviewMutationRequestId = 0');
    expect(html).toContain('let reviewMutationPending = false');
    expect(html).toContain("currentDetail.identity.status === 'reviewing'");
    expect(html).toContain("currentDetail.enterprise.status === 'reviewing'");
    expect(html).toContain('reviewMutationPending || !identityReviewing');
    expect(html).toContain('reviewMutationPending || !enterpriseReviewing');
    expect(html).toContain('previousPageButton');
    expect(html).toContain('nextPageButton');
    expect(html).toContain('pageSizeFilter');
    expect(html).toContain(
      "event.reviewerAdminId || event.actorUserId || '系统'",
    );
    expect(html).toContain('暂无附件');
    expect(html).toContain('暂无审核事件');
    expect(html).not.toContain('hero');
  });

  it('syncs verification filters and selected shipper into route state', () => {
    const html = renderShipperVerificationAdminConsole();

    expect(html).toContain('applyShipperVerificationRouteState');
    expect(html).toContain('syncShipperVerificationRouteState');
    expect(html).toContain("query.get('status') || 'reviewing'");
    expect(html).toContain("status !== 'reviewing'");
    expect(html).not.toContain("query.get('status') || 'pending'");
    expect(html).toContain("query.get('type')");
    expect(html).toContain("query.get('shipperId')");
    expect(html).toContain("query.get('page')");
    expect(html).toContain("query.get('pageSize')");
    expect(html).toContain("query.set('shipperId', shipperId)");
    expect(html).toContain("query.set('page', String(page))");
    expect(html).toContain("query.set('pageSize', String(pageSize))");
    expect(html).toContain('history.replaceState');
  });

  it('keeps queue pagination and routed details as independent request generations', () => {
    const html = renderShipperVerificationAdminConsole();
    const queueStart = html.indexOf('async function loadQueue(page)');
    const queueEnd = html.indexOf(
      'async function refreshWorkspace(page)',
      queueStart,
    );
    const queueBody = html.slice(queueStart, queueEnd);
    const refreshEnd = html.indexOf(
      'function changeQueuePage(offset)',
      queueEnd,
    );
    const refreshBody = html.slice(queueEnd, refreshEnd);
    const queueRenderStart = html.indexOf('function renderQueue(items)');
    const queueRenderEnd = html.indexOf(
      'function renderDetail()',
      queueRenderStart,
    );
    const queueRenderBody = html.slice(queueRenderStart, queueRenderEnd);

    expect(html).toContain('let latestQueueRequestId = 0');
    expect(html).toContain('let latestDetailRequestId = 0');
    expect(html).toContain('const requestId = ++latestQueueRequestId');
    expect(html).toContain('if (requestId !== latestQueueRequestId) {');
    expect(html).toContain('const requestId = ++latestDetailRequestId');
    expect(html).toContain('requestId !== latestDetailRequestId ||');
    expect(html).toContain('selectedShipperId !== targetShipperId');
    expect(queueBody).not.toContain('latestDetailRequestId');
    expect(queueBody).not.toContain('resetDetail(');
    expect(queueRenderBody).not.toContain("selectedShipperId = ''");
    expect(queueRenderBody).not.toContain(
      "syncShipperVerificationRouteState('')",
    );
    expect(refreshBody).toContain('loadQueue(page || currentPage)');
    expect(refreshBody).toContain('selectShipper(targetShipperId)');
  });

  it('commits only the latest routed shipper detail and degrades secondary panels independently', async () => {
    const html = renderShipperVerificationAdminConsole();
    const selectStart = html.indexOf('async function selectShipper(shipperId)');
    const selectEnd = html.indexOf(
      'async function loadQueue(page)',
      selectStart,
    );
    const selectSource = html.slice(selectStart, selectEnd);
    const createDeferred = () => {
      let resolve: ((value: unknown) => void) | undefined;
      let reject: ((reason?: unknown) => void) | undefined;
      const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      return { promise, reject, resolve };
    };
    const flushPromises = () =>
      new Promise<void>(resolve => setImmediate(resolve));
    const pending = new Map<string, ReturnType<typeof createDeferred>>();
    const createShipperRequests = (shipperId: string) => {
      const detail = createDeferred();
      const attachments = createDeferred();
      const events = createDeferred();
      pending.set('/' + shipperId, detail);
      pending.set('/' + shipperId + '/attachments', attachments);
      pending.set('/' + shipperId + '/review-events', events);
      return { attachments, detail, events };
    };
    const apiGet = jest.fn((path: string) => {
      const deferred = pending.get(path);
      if (!deferred) {
        return Promise.reject(new Error('unexpected request: ' + path));
      }
      return deferred.promise;
    });
    let activeContext:
      | {
          currentAttachments: unknown;
          currentDetail: unknown;
          currentReviewEvents: unknown[];
        }
      | undefined;
    const resetDetail = jest.fn(() => {
      if (activeContext) activeContext.currentDetail = null;
    });
    const resetAttachments = jest.fn(() => {
      if (activeContext) activeContext.currentAttachments = null;
    });
    const resetReviewEvents = jest.fn(() => {
      if (activeContext) activeContext.currentReviewEvents = [];
    });
    const context = {
      latestDetailRequestId: 0,
      selectedShipperId: '',
      currentItems: [] as unknown[],
      currentDetail: null as unknown,
      currentAttachments: null as unknown,
      currentReviewEvents: [] as unknown[],
      syncShipperVerificationRouteState: jest.fn(),
      renderQueue: jest.fn(),
      setText: jest.fn(),
      resetDetail,
      resetAttachments,
      resetReviewEvents,
      getToken: jest.fn(() => 'admin-token'),
      apiGet,
      encodeURIComponent,
      renderDetail: jest.fn(),
      renderAttachments: jest.fn(),
      renderReviewEvents: jest.fn(),
      invokeSelectShipper: undefined as
        | undefined
        | ((shipperId: string) => Promise<void>),
    };
    activeContext = context;
    runInNewContext(
      `${selectSource}\ninvokeSelectShipper = selectShipper;`,
      context,
    );
    if (!context.invokeSelectShipper) {
      throw new Error('selectShipper function was not initialized');
    }

    const shipperA = createShipperRequests('shipper-a');
    const shipperB = createShipperRequests('shipper-b');
    const slowShipperA = context.invokeSelectShipper('shipper-a');
    const fastShipperB = context.invokeSelectShipper('shipper-b');
    const shipperBDetail = {
      shipperId: 'shipper-b',
      identity: { status: 'reviewing' },
      enterprise: { status: 'approved' },
    };
    shipperB.detail.resolve?.(shipperBDetail);
    shipperB.attachments.resolve?.({ shipperId: 'shipper-b' });
    shipperB.events.resolve?.([{ eventId: 'event-b' }]);
    await fastShipperB;
    await flushPromises();

    expect(context.currentDetail).toEqual(shipperBDetail);
    expect(context.currentAttachments).toEqual({ shipperId: 'shipper-b' });
    expect(context.currentReviewEvents).toEqual([{ eventId: 'event-b' }]);

    shipperA.detail.resolve?.({ shipperId: 'shipper-a' });
    shipperA.attachments.resolve?.({ shipperId: 'shipper-a' });
    shipperA.events.resolve?.([{ eventId: 'event-a' }]);
    await slowShipperA;
    expect(context.currentDetail).toEqual(shipperBDetail);

    const shipperC = createShipperRequests('shipper-c');
    const degradedShipperC = context.invokeSelectShipper('shipper-c');
    const shipperCDetail = {
      shipperId: 'shipper-c',
      identity: { status: 'reviewing' },
    };
    shipperC.detail.resolve?.(shipperCDetail);
    shipperC.attachments.reject?.(new Error('附件暂不可用'));
    shipperC.events.resolve?.([{ eventId: 'event-c' }]);
    await degradedShipperC;
    await flushPromises();

    expect(context.currentDetail).toEqual(shipperCDetail);
    expect(context.currentAttachments).toBeNull();
    expect(context.currentReviewEvents).toEqual([{ eventId: 'event-c' }]);
    expect(resetAttachments).toHaveBeenLastCalledWith('附件暂不可用');

    const shipperD = createShipperRequests('shipper-d');
    const degradedShipperD = context.invokeSelectShipper('shipper-d');
    const shipperDDetail = {
      shipperId: 'shipper-d',
      enterprise: { status: 'reviewing' },
    };
    shipperD.detail.resolve?.(shipperDDetail);
    shipperD.attachments.resolve?.({ shipperId: 'shipper-d' });
    shipperD.events.reject?.(new Error('审核事件暂不可用'));
    await degradedShipperD;
    await flushPromises();

    expect(context.currentDetail).toEqual(shipperDDetail);
    expect(context.currentAttachments).toEqual({ shipperId: 'shipper-d' });
    expect(context.currentReviewEvents).toEqual([]);
    expect(resetReviewEvents).toHaveBeenLastCalledWith('审核事件暂不可用');

    const shipperE = createShipperRequests('shipper-e');
    const independentlyLoadedShipperE = context.invokeSelectShipper('shipper-e');
    const shipperEDetail = {
      shipperId: 'shipper-e',
      identity: { status: 'reviewing' },
    };
    shipperE.detail.resolve?.(shipperEDetail);
    await independentlyLoadedShipperE;

    expect(context.currentDetail).toEqual(shipperEDetail);
    expect(context.currentAttachments).toBeNull();
    expect(context.currentReviewEvents).toEqual([]);

    shipperE.attachments.resolve?.({ shipperId: 'shipper-e' });
    await flushPromises();
    expect(context.currentAttachments).toEqual({ shipperId: 'shipper-e' });
    expect(context.currentReviewEvents).toEqual([]);

    shipperE.events.resolve?.([{ eventId: 'event-e' }]);
    await flushPromises();
    expect(context.currentReviewEvents).toEqual([{ eventId: 'event-e' }]);

    const shipperF = createShipperRequests('shipper-f');
    const failedShipperF = context.invokeSelectShipper('shipper-f');
    shipperF.detail.reject?.(new Error('认证记录不存在'));
    shipperF.attachments.resolve?.({ shipperId: 'shipper-f' });
    shipperF.events.resolve?.([{ eventId: 'event-f' }]);
    await failedShipperF;

    expect(context.selectedShipperId).toBe('shipper-f');
    expect(context.currentDetail).toBeNull();
    expect(context.currentAttachments).toBeNull();
    expect(context.currentReviewEvents).toEqual([]);
    expect(context.syncShipperVerificationRouteState).toHaveBeenLastCalledWith(
      'shipper-f',
    );
  });

  it('retains routed shipper ids across empty, out-of-page and failed queue results', async () => {
    const html = renderShipperVerificationAdminConsole();
    const renderQueueStart = html.indexOf('function renderQueue(items)');
    const renderQueueEnd = html.indexOf(
      'function renderDetail()',
      renderQueueStart,
    );
    const renderQueueSource = html.slice(renderQueueStart, renderQueueEnd);
    const queueRoot = {
      innerHTML: '',
      querySelectorAll: jest.fn(() => []),
    };
    const renderContext = {
      selectedShipperId: 'routed-shipper',
      currentItems: [] as Array<{ shipperId: string }>,
      document: {
        getElementById: jest.fn(() => queueRoot),
      },
      escapeHtml: (value: unknown) => String(value),
      selectShipper: jest.fn(),
      invokeRenderQueue: undefined as
        | undefined
        | ((items: Array<{ shipperId: string }>) => void),
    };
    runInNewContext(
      `${renderQueueSource}\ninvokeRenderQueue = renderQueue;`,
      renderContext,
    );
    if (!renderContext.invokeRenderQueue) {
      throw new Error('renderQueue function was not initialized');
    }

    renderContext.invokeRenderQueue([]);
    expect(renderContext.selectedShipperId).toBe('routed-shipper');
    renderContext.invokeRenderQueue([{ shipperId: 'another-shipper' }]);
    expect(renderContext.selectedShipperId).toBe('routed-shipper');

    const loadQueueStart = html.indexOf('async function loadQueue(page)');
    const loadQueueEnd = html.indexOf(
      'async function refreshWorkspace(page)',
      loadQueueStart,
    );
    const loadQueueSource = html.slice(loadQueueStart, loadQueueEnd);
    const detailBeforeFailure = { shipperId: 'routed-shipper' };
    const loadContext = {
      latestQueueRequestId: 0,
      currentPage: 1,
      currentTotal: 1,
      currentItems: [{ shipperId: 'another-shipper' }],
      currentDetail: detailBeforeFailure,
      selectedShipperId: 'routed-shipper',
      syncShipperVerificationRouteState: jest.fn(),
      getQueuePageSize: jest.fn(() => 20),
      getToken: jest.fn(() => 'admin-token'),
      clearQueueResults: jest.fn(),
      setText: jest.fn(),
      document: {
        getElementById: jest.fn((id: string) => ({
          value: id === 'statusFilter' ? 'reviewing' : '',
        })),
      },
      URLSearchParams,
      apiGet: jest.fn(() => Promise.reject(new Error('队列加载失败'))),
      renderQueue: jest.fn(),
      renderPagination: jest.fn(),
      selectShipper: jest.fn(),
      invokeLoadQueue: undefined as
        | undefined
        | ((page: number) => Promise<void>),
    };
    runInNewContext(
      `${loadQueueSource}\ninvokeLoadQueue = loadQueue;`,
      loadContext,
    );
    if (!loadContext.invokeLoadQueue) {
      throw new Error('loadQueue function was not initialized');
    }
    await loadContext.invokeLoadQueue(1);

    expect(loadContext.selectedShipperId).toBe('routed-shipper');
    expect(loadContext.currentDetail).toBe(detailBeforeFailure);
    expect(loadContext.clearQueueResults).toHaveBeenCalledWith('队列加载失败');
  });

  it('prevents duplicate reviews and never restores a reviewed shipper after selection changes', async () => {
    const html = renderShipperVerificationAdminConsole();
    const reviewStart = html.indexOf('async function review(kind, status)');
    const reviewEnd = html.indexOf(
      "document.getElementById('refreshButton')",
      reviewStart,
    );
    const reviewSource = html.slice(reviewStart, reviewEnd);
    let resolveReview: ((value: unknown) => void) | undefined;
    const reviewResponse = new Promise<unknown>(resolve => {
      resolveReview = resolve;
    });
    const apiPost = jest.fn().mockReturnValueOnce(reviewResponse);
    const loadQueue = jest.fn(() => Promise.resolve());
    const selectShipper = jest.fn(() => Promise.resolve());
    const context = {
      reviewMutationPending: false,
      latestReviewMutationRequestId: 0,
      selectedShipperId: 'shipper-a',
      currentDetail: {
        shipperId: 'shipper-a',
        identity: { status: 'reviewing' },
        enterprise: { status: 'approved' },
      },
      currentPage: 1,
      document: {
        getElementById: jest.fn(() => ({ value: '' })),
      },
      setText: jest.fn(),
      updateReviewControls: jest.fn(),
      apiPost,
      encodeURIComponent,
      loadQueue,
      selectShipper,
      invokeReview: undefined as
        | undefined
        | ((kind: 'identity' | 'enterprise', status: 'approved' | 'rejected') => Promise<void>),
    };
    runInNewContext(`${reviewSource}\ninvokeReview = review;`, context);
    if (!context.invokeReview) {
      throw new Error('review function was not initialized');
    }

    const firstReview = context.invokeReview('identity', 'approved');
    await context.invokeReview('identity', 'approved');
    expect(apiPost).toHaveBeenCalledTimes(1);

    const shipperBDetail = {
      shipperId: 'shipper-b',
      identity: { status: 'reviewing' },
      enterprise: { status: 'reviewing' },
    };
    context.selectedShipperId = 'shipper-b';
    context.currentDetail = shipperBDetail;
    resolveReview?.({ status: 'approved' });
    await firstReview;

    expect(context.selectedShipperId).toBe('shipper-b');
    expect(context.currentDetail).toBe(shipperBDetail);
    expect(loadQueue).toHaveBeenCalledTimes(1);
    expect(selectShipper).not.toHaveBeenCalled();
    expect(context.reviewMutationPending).toBe(false);

    context.currentDetail = {
      shipperId: 'shipper-b',
      identity: { status: 'approved' },
      enterprise: { status: 'reviewing' },
    };
    await context.invokeReview('identity', 'approved');
    expect(apiPost).toHaveBeenCalledTimes(1);

    loadQueue.mockClear();
    selectShipper.mockClear();
    context.selectedShipperId = 'shipper-c';
    context.currentDetail = {
      shipperId: 'shipper-c',
      identity: { status: 'reviewing' },
      enterprise: { status: 'approved' },
    };
    apiPost.mockRejectedValueOnce(
      Object.assign(new Error('认证状态已变化'), {
        code: 'SHIPPER_VERIFICATION_STATE_INVALID',
      }),
    );
    await context.invokeReview('identity', 'approved');

    expect(loadQueue).toHaveBeenCalledTimes(1);
    expect(selectShipper).toHaveBeenCalledWith('shipper-c');
    expect(context.setText).toHaveBeenCalledWith(
      'reviewStatus',
      '认证状态已变化',
    );
    expect(html).toContain('error.code = payload.code');
    expect(html).toContain("error.code === 'SHIPPER_VERIFICATION_NOT_FOUND'");
  });

  it('executes the shared admin session bootstrap before auto-loading the verification queue', () => {
    const html = renderShipperVerificationAdminConsole();
    const applicationScriptStart = html.lastIndexOf('<script>');
    const applicationScriptEnd = html.indexOf('</script>', applicationScriptStart);
    const sessionBootstrapIndex = html.indexOf(
      "const adminSessionStorageKey = 'stage1AdminSession'",
    );

    expect(sessionBootstrapIndex).toBeGreaterThan(applicationScriptStart);
    expect(sessionBootstrapIndex).toBeLessThan(applicationScriptEnd);
    expect(html).toContain('const stored = readStoredAdminSession()');
    expect(html).toContain('stored.session?.accessToken');
    expect(html).toContain('const currentAdminSession = initializeAdminSession()');
    expect(html).toContain(
      'if (currentAdminSession && currentAdminSession.accessToken)',
    );
    expect(html).toContain('refreshWorkspace(currentPage)');
  });
});

describe('support ticket admin console page', () => {
  it('renders help-center support ticket filters and admin workflow hooks', () => {
    const html = renderSupportTicketAdminConsole();

    expect(html).toContain('帮助中心工单台');
    expect(html).toContain('/admin/support-tickets?');
    expect(html).toContain('/admin/support-tickets/');
    expect(html).toContain('/admin/support-tickets/overdue-escalations/sweep');
    expect(html).toContain('/process');
    expect(html).toContain('/resolve');
    expect(html).toContain('/unclaim');
    expect(html).toContain('loadSupportTickets');
    expect(html).toContain('loadSupportTicketDetail');
    expect(html).toContain('mutateSupportTicket');
    expect(html).toContain('sweepSupportTicketOverdueEscalations');
    expect(html).toContain('releaseSupportTicketClaim');
    expect(html).toContain('releaseSupportTicketClaimButton');
    expect(html).toContain('释放认领');
    expect(html).toContain('formatSupportTicketSlaStage');
    expect(html).toContain('formatSupportTicketSlaStatus');
    expect(html).toContain('renderSupportTicketSla');
    expect(html).toContain('formatSupportTicketOperatorUserId');
    expect(html).toContain('supportTicketStatusInput');
    expect(html).toContain('supportTicketSlaStatusInput');
    expect(html).toContain('supportTicketKeywordInput');
    expect(html).toContain('supportTicketPageSizeInput');
    expect(html).toContain('supportTicketActionContent');
    expect(html).toContain('supportTicketBaseUpdatedAtIso');
    expect(html).toContain('supportTicketSweepNotice');
    expect(html).toContain('sweepSupportTicketOverdueButton');
    expect(html).toContain('首响 / 解决 SLA 提醒');
    expect(html).toContain('按 SLA 状态、认领状态和认领客服筛队列');
    expect(html).toContain('可手动扫描 + 可选定时扫');
    expect(html).toContain('SLA：');
    expect(html).toContain('/api/admin/order-exception-case-console');
    expect(html).toContain('/api/admin/finance-console');
    expect(html).not.toContain('hero');
  });

  it('ignores stale support ticket requests and syncs route state', () => {
    const html = renderSupportTicketAdminConsole();
    const clearSelectionStart = html.indexOf(
      'function clearSupportTicketSelection(options = {})',
    );
    const clearSelectionEnd = html.indexOf(
      'function readSupportTicketRouteState()',
      clearSelectionStart,
    );
    const clearSelectionBody = html.slice(
      clearSelectionStart,
      clearSelectionEnd,
    );

    expect(html).toContain('let latestSupportTicketRequestId = 0');
    expect(html).toContain('let latestSupportTicketDetailRequestId = 0');
    expect(html).toContain('const requestId = ++latestSupportTicketRequestId');
    expect(html).toContain('const requestId = ++latestSupportTicketDetailRequestId');
    expect(html).toContain('if (requestId !== latestSupportTicketRequestId) return');
    expect(html).toContain('if (requestId !== latestSupportTicketDetailRequestId) return');
    expect(html).toContain('applySupportTicketRouteState');
    expect(html).toContain('syncSupportTicketRouteState');
    expect(html).toContain("query.get('slaStatus')");
    expect(html).toContain("query.set('slaStatus', slaStatus)");
    expect(html).toContain("query.get('ticketId')");
    expect(html).toContain("query.set('ticketId', ticketId)");
    expect(html).toContain('pendingRouteTicketId');
    expect(html).toContain('pendingRouteTicketId = supportTicketRouteState.ticketId');
    expect(html).toContain('await loadSupportTicketDetail(');
    expect(clearSelectionStart).toBeGreaterThan(-1);
    expect(clearSelectionEnd).toBeGreaterThan(clearSelectionStart);
    expect(clearSelectionBody).toContain(
      'latestSupportTicketDetailRequestId += 1;',
    );
    expect(clearSelectionBody.indexOf('latestSupportTicketDetailRequestId += 1;'))
      .toBeLessThan(clearSelectionBody.indexOf("selectedTicketId = '';"));
  });

  it('keeps support ticket mutation responses bound to their starting selection', () => {
    const html = renderSupportTicketAdminConsole();

    expect(html.match(/const targetTicketId = selectedTicketId;/g)).toHaveLength(
      5,
    );
    expect(
      html.match(/if \(selectedTicketId !== targetTicketId\) return;/g),
    ).toHaveLength(11);
    expect(html).toContain(
      "encodeURIComponent(targetTicketId) + '/claim'",
    );
    expect(html).toContain(
      "encodeURIComponent(targetTicketId) + '/takeover'",
    );
    expect(html).toContain(
      "encodeURIComponent(targetTicketId) + '/assign'",
    );
    expect(html).toContain(
      "encodeURIComponent(targetTicketId) + '/unclaim'",
    );
    expect(html).toContain('recoverSupportTicketFromConflict(targetTicketId)');
    expect(html).toContain('renderSelectedSupportTicketActions()');
    expect(html).not.toContain(
      "encodeURIComponent(selectedTicketId) + '/claim'",
    );
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

  it('syncs session and audit filters into route state', () => {
    const html = renderSessionGovernanceAdminConsole();

    expect(html).toContain('applySessionGovernanceRouteState');
    expect(html).toContain('syncSessionGovernanceRouteState');
    expect(html).toContain("query.get('sessionScope') || 'current_admin'");
    expect(html).toContain("query.get('sessionRiskOnly')");
    expect(html).toContain("query.get('auditAction')");
    expect(html).toContain("query.set('sessionPage', String(sessionPage))");
    expect(html).toContain("query.set('auditPageSize', String(auditPageSize))");
    expect(html).toContain('loadAdminSessions(currentSessionPage)');
    expect(html).toContain('loadSessionAuditEvents(currentSessionAuditPage)');
    expect(html).toContain('history.replaceState');
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

  it('keeps account list, detail and report generations independent', () => {
    const html = renderAccountManagementAdminConsole();

    expect(html).toContain('let latestAccountRequestId = 0');
    expect(html).toContain('const requestId = ++latestAccountRequestId');
    expect(html).toContain('if (requestId !== latestAccountRequestId) return');
    expect(html).toContain('let latestAccountDetailRequestId = 0');
    expect(html).toContain('const requestId = ++latestAccountDetailRequestId');
    expect(html).toContain(
      'requestId !== latestAccountDetailRequestId ||',
    );
    expect(html).toContain('accountDetailTargetUserId !== targetUserId');
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
    expect(html).toContain('let accountDetailMutationPending = false');
    expect(html).toContain('if (accountDetailMutationPending) return');
    expect(html).toContain('updateAccountDetailMutationUi');
    expect(html).toContain('风险账号');
    expect(html).toContain('不能禁用当前管理员账号');
  });

  it('restores account report controls when csv export preflight fails', () => {
    const html = renderAccountManagementAdminConsole();
    const exportStart = html.indexOf(
      'async function exportAdminAuthAccountsCsv()',
    );
    const exportEnd = html.indexOf(
      'function updateAccountBulkSelectionUi()',
      exportStart,
    );
    const exportScript = html.slice(exportStart, exportEnd);

    expect(exportScript).toContain(
      "setAccountReportControlsDisabled(true);\n      try {\n        const accessToken = token();\n        const query = buildAccountExportQuery();",
    );
    expect(exportScript).toContain('finally {');
    expect(exportScript).toContain('setAccountReportControlsDisabled(false)');
    expect(exportScript).not.toContain('let accessToken;');
    expect(exportScript).not.toContain('let query;');
  });

  it('loads routed account details independently from the account page', () => {
    const html = renderAccountManagementAdminConsole();
    const resetStart = html.indexOf('function resetAccountDetail()');
    const resetEnd = html.indexOf('function renderAccountDetail(', resetStart);
    const resetScript = html.slice(resetStart, resetEnd);
    const listStart = html.indexOf('async function loadAdminAuthAccounts(');
    const listEnd = html.indexOf(
      'async function loadAdminAuthAccountDetail(',
      listStart,
    );
    const listScript = html.slice(listStart, listEnd);
    const detailStart = listEnd;
    const detailEnd = html.indexOf(
      'function renderAccountListFromCurrentPage()',
      detailStart,
    );
    const detailScript = html.slice(detailStart, detailEnd);
    const detailCatchScript = detailScript.slice(
      detailScript.indexOf('} catch (error) {'),
    );
    const refreshStart = html.indexOf(
      'async function refreshAccountWorkspace(page)',
    );
    const refreshEnd = html.indexOf(
      'async function loadAccountReport()',
      refreshStart,
    );
    const refreshScript = html.slice(refreshStart, refreshEnd);
    const bootstrapStart = html.indexOf('const storedSession = initializeAdminSession()');
    const bootstrapScript = html.slice(bootstrapStart);

    expect(resetScript).toContain(
      'function resetAccountDetail() {\n      latestAccountDetailRequestId += 1;',
    );
    expect(resetScript).toContain("accountDetailTargetUserId = ''");
    expect(listScript).not.toContain('loadAdminAuthAccountDetail');
    expect(listScript).not.toContain('resetAccountDetail');
    expect(listScript).not.toContain('latestAccountDetailRequestId');
    expect(detailScript).toContain('accountDetailTargetUserId = targetUserId');
    expect(detailScript).toContain(
      'accountDetailTargetUserId !== targetUserId',
    );
    expect(detailScript).toContain(
      'renderAccountDetailError(targetUserId, error.message)',
    );
    expect(detailCatchScript).not.toContain(
      "syncAccountManagementRouteState(currentAccountPage, '')",
    );
    expect(refreshScript).toContain(
      'const targetDetailUserId = accountDetailTargetUserId',
    );
    expect(refreshScript).toContain(
      'refreshTasks.push(loadAdminAuthAccountDetail(targetDetailUserId))',
    );
    expect(bootstrapScript).toContain('refreshAccountWorkspace(currentAccountPage)');
    expect(bootstrapScript).not.toContain(
      'loadAdminAuthAccountDetail(accountDetailTargetUserId)',
    );
  });

  it('keeps a routed account detail when the independent list request fails', async () => {
    const html = renderAccountManagementAdminConsole();
    const listStart = html.indexOf('async function loadAdminAuthAccounts(');
    const detailStart = html.indexOf(
      'async function loadAdminAuthAccountDetail(',
      listStart,
    );
    const detailEnd = html.indexOf(
      'function renderAccountListFromCurrentPage()',
      detailStart,
    );
    const listSource = html.slice(listStart, detailStart);
    const detailSource = html.slice(detailStart, detailEnd);
    const createDeferred = () => {
      let resolve: ((value: unknown) => void) | undefined;
      let reject: ((reason?: unknown) => void) | undefined;
      const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      return { promise, reject, resolve };
    };
    const list = createDeferred();
    const detail = createDeferred();
    const nodes = new Map<
      string,
      { disabled: boolean; innerHTML: string; textContent: string }
    >();
    const getNode = (id: string) => {
      const existing = nodes.get(id);
      if (existing) return existing;
      const created = { disabled: false, innerHTML: '', textContent: '' };
      nodes.set(id, created);
      return created;
    };
    const api = jest.fn((path: string) =>
      path.startsWith('/admin/auth/accounts?')
        ? list.promise
        : detail.promise,
    );
    const syncAccountManagementRouteState = jest.fn();
    const renderAccountDetail = jest.fn();
    const renderAccountDetailError = jest.fn();
    const context = {
      latestAccountRequestId: 0,
      latestAccountDetailRequestId: 0,
      currentAccountPage: 1,
      currentAccountTotal: 0,
      currentAccountItems: [] as unknown[],
      currentAccountDetail: null as unknown,
      accountDetailTargetUserId: 'account-routed',
      document: {
        getElementById: getNode,
      },
      syncAccountManagementRouteState,
      buildAccountQuery: jest.fn(() => ({ toString: () => 'page=1' })),
      api,
      renderAccountSummary: jest.fn(),
      renderAccountList: jest.fn(),
      renderAccountPagination: jest.fn(),
      accountPageSizeValue: jest.fn(() => 20),
      updateAccountBulkSelectionUi: jest.fn(),
      renderAccountListFromCurrentPage: jest.fn(),
      updateAccountDetailMutationUi: jest.fn(),
      resetAccountDetail: jest.fn(),
      renderAccountDetail,
      renderAccountDetailError,
      escapeHtml: (value: unknown) => String(value),
      encodeURIComponent,
      invokeList: undefined as undefined | ((page: number) => Promise<void>),
      invokeDetail: undefined as
        | undefined
        | ((userId: string) => Promise<void>),
    };

    runInNewContext(
      `${listSource}\n${detailSource}\ninvokeList = loadAdminAuthAccounts; invokeDetail = loadAdminAuthAccountDetail;`,
      context,
    );

    const listRequest = context.invokeList!(1);
    const detailRequest = context.invokeDetail!('account-routed');
    list.reject!(new Error('账号目录暂不可用'));
    detail.resolve!({
      account: { userId: 'account-routed' },
      activeSessions: [],
      recentAuditEvents: [],
    });
    await Promise.all([listRequest, detailRequest]);

    expect(renderAccountDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({ userId: 'account-routed' }),
      }),
    );
    expect(renderAccountDetailError).not.toHaveBeenCalled();
    expect(context.accountDetailTargetUserId).toBe('account-routed');
    expect(syncAccountManagementRouteState.mock.calls).not.toContainEqual([
      1,
      '',
    ]);
    expect(getNode('accountNotice').textContent).toBe('账号目录暂不可用');
  });

  it('commits only the latest routed account detail and retains failed targets', async () => {
    const html = renderAccountManagementAdminConsole();
    const detailStart = html.indexOf(
      'async function loadAdminAuthAccountDetail(',
    );
    const detailEnd = html.indexOf(
      'function renderAccountListFromCurrentPage()',
      detailStart,
    );
    const detailSource = html.slice(detailStart, detailEnd);
    const createDeferred = () => {
      let resolve: ((value: unknown) => void) | undefined;
      let reject: ((reason?: unknown) => void) | undefined;
      const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      return { promise, reject, resolve };
    };
    const pending = new Map<string, ReturnType<typeof createDeferred>>();
    const nodes = new Map<
      string,
      { disabled: boolean; innerHTML: string; textContent: string }
    >();
    const getNode = (id: string) => {
      const existing = nodes.get(id);
      if (existing) return existing;
      const created = { disabled: false, innerHTML: '', textContent: '' };
      nodes.set(id, created);
      return created;
    };
    const api = jest.fn((path: string) => {
      const request = pending.get(path);
      if (!request) {
        return Promise.reject(new Error('unexpected request: ' + path));
      }
      return request.promise;
    });
    const renderAccountDetail = jest.fn();
    const renderAccountDetailError = jest.fn();
    const syncAccountManagementRouteState = jest.fn();
    const context = {
      latestAccountDetailRequestId: 0,
      currentAccountPage: 1,
      currentAccountDetail: null as unknown,
      accountDetailTargetUserId: '',
      document: { getElementById: getNode },
      syncAccountManagementRouteState,
      renderAccountListFromCurrentPage: jest.fn(),
      updateAccountDetailMutationUi: jest.fn(),
      resetAccountDetail: jest.fn(),
      renderAccountDetail,
      renderAccountDetailError,
      escapeHtml: (value: unknown) => String(value),
      encodeURIComponent,
      api,
      invokeDetail: undefined as
        | undefined
        | ((userId: string) => Promise<void>),
    };
    runInNewContext(
      `${detailSource}\ninvokeDetail = loadAdminAuthAccountDetail;`,
      context,
    );

    const requestA = createDeferred();
    const requestB = createDeferred();
    pending.set('/admin/auth/accounts/account-a', requestA);
    pending.set('/admin/auth/accounts/account-b', requestB);
    const detailA = context.invokeDetail!('account-a');
    const detailB = context.invokeDetail!('account-b');
    requestB.resolve!({ account: { userId: 'account-b' } });
    await detailB;
    requestA.resolve!({ account: { userId: 'account-a' } });
    await detailA;

    expect(renderAccountDetail).toHaveBeenCalledTimes(1);
    expect(renderAccountDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({ userId: 'account-b' }),
      }),
    );
    expect(context.accountDetailTargetUserId).toBe('account-b');

    const failedRequest = createDeferred();
    pending.set('/admin/auth/accounts/account-missing', failedRequest);
    const missingDetail = context.invokeDetail!('account-missing');
    failedRequest.reject!(new Error('账号不存在'));
    await missingDetail;

    expect(renderAccountDetailError).toHaveBeenCalledWith(
      'account-missing',
      '账号不存在',
    );
    expect(context.accountDetailTargetUserId).toBe('account-missing');
    expect(syncAccountManagementRouteState.mock.calls.at(-1)).toEqual([
      1,
      'account-missing',
    ]);
  });

  it('locks duplicate account mutations and never writes an older target into the new selection', async () => {
    const html = renderAccountManagementAdminConsole();
    const refreshStart = html.indexOf(
      'async function refreshAccountWorkspaceAfterMutation(',
    );
    const refreshEnd = html.indexOf(
      'async function runBatchStatusUpdate(',
      refreshStart,
    );
    const refreshSource = html.slice(refreshStart, refreshEnd);
    const mutationStart = html.indexOf(
      'async function updateAdminAuthAccountStatus(',
    );
    const mutationEnd = html.indexOf(
      'async function toggleSelectedAccountStatus()',
      mutationStart,
    );
    const mutationSource = html.slice(mutationStart, mutationEnd);
    let resolveMutation: ((value: unknown) => void) | undefined;
    const mutation = new Promise<unknown>(resolve => {
      resolveMutation = resolve;
    });
    const nodes = new Map<string, { textContent: string }>();
    const getNode = (id: string) => {
      const existing = nodes.get(id);
      if (existing) return existing;
      const created = { textContent: id === 'accountDetailStatus' ? '账号 B' : '' };
      nodes.set(id, created);
      return created;
    };
    const api = jest.fn(() => mutation);
    const updateAccountDetailMutationUi = jest.fn();
    const loadAdminAuthAccounts = jest.fn().mockResolvedValue(undefined);
    const loadAccountReport = jest.fn().mockResolvedValue(undefined);
    const loadAdminAuthAccountDetail = jest.fn().mockResolvedValue(undefined);
    const context = {
      accountDetailMutationPending: false,
      accountDetailTargetUserId: 'account-a',
      currentAccountPage: 3,
      document: { getElementById: getNode },
      api,
      updateAccountDetailMutationUi,
      loadAdminAuthAccounts,
      loadAccountReport,
      loadAdminAuthAccountDetail,
      formatAccountStatus: (status: string) => status,
      encodeURIComponent,
      invokeMutation: undefined as
        | undefined
        | ((userId: string, status: string) => Promise<void>),
    };
    runInNewContext(
      `${refreshSource}\n${mutationSource}\ninvokeMutation = updateAdminAuthAccountStatus;`,
      context,
    );

    const firstMutation = context.invokeMutation!('account-a', 'disabled');
    const duplicateMutation = context.invokeMutation!('account-a', 'disabled');
    context.accountDetailTargetUserId = 'account-b';
    resolveMutation!({ status: 'disabled', revokedSessionCount: 2 });
    await Promise.all([firstMutation, duplicateMutation]);

    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith(
      '/admin/auth/accounts/account-a/status',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(loadAdminAuthAccounts).toHaveBeenCalledWith(3);
    expect(loadAccountReport).toHaveBeenCalledTimes(1);
    expect(loadAdminAuthAccountDetail).not.toHaveBeenCalled();
    expect(getNode('accountDetailStatus').textContent).toBe('账号 B');
    expect(getNode('accountDetailNotice').textContent).toBe('');
    expect(context.accountDetailMutationPending).toBe(false);
    expect(updateAccountDetailMutationUi).toHaveBeenCalledTimes(2);
  });

  it('binds session revocation failures to their starting account and releases the lock', async () => {
    const html = renderAccountManagementAdminConsole();
    const selectionStart = html.indexOf('function selectedAccountUserId()');
    const selectionEnd = html.indexOf(
      'function changeAccountPage(',
      selectionStart,
    );
    const selectionAndMutationSource = html.slice(
      selectionStart,
      selectionEnd,
    );
    let rejectMutation: ((reason?: unknown) => void) | undefined;
    const mutation = new Promise<unknown>((_resolve, reject) => {
      rejectMutation = reject;
    });
    const nodes = new Map<
      string,
      { textContent: string; value: string }
    >();
    const getNode = (id: string) => {
      const existing = nodes.get(id);
      if (existing) return existing;
      const created = {
        textContent: id === 'accountDetailStatus' ? '账号 B' : '',
        value:
          id === 'accountKeepSessionIdInput'
            ? ' 550e8400-e29b-41d4-a716-446655440112 '
            : '',
      };
      nodes.set(id, created);
      return created;
    };
    const api = jest.fn(() => mutation);
    const updateAccountDetailMutationUi = jest.fn();
    const refreshAccountWorkspaceAfterMutation = jest
      .fn()
      .mockResolvedValue(undefined);
    const context = {
      currentAccountDetail: {
        account: { userId: 'account-a', status: 'active' },
      },
      accountDetailTargetUserId: 'account-a',
      accountDetailMutationPending: false,
      document: { getElementById: getNode },
      api,
      updateAccountDetailMutationUi,
      refreshAccountWorkspaceAfterMutation,
      encodeURIComponent,
      invokeRevoke: undefined as undefined | (() => Promise<void>),
    };
    runInNewContext(
      `${selectionAndMutationSource}\ninvokeRevoke = revokeAdminAuthAccountSessions;`,
      context,
    );

    const firstMutation = context.invokeRevoke!();
    const duplicateMutation = context.invokeRevoke!();
    context.accountDetailTargetUserId = 'account-b';
    rejectMutation!(new Error('会话撤销失败'));
    await Promise.all([firstMutation, duplicateMutation]);

    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith(
      '/admin/auth/accounts/account-a/revoke-sessions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          keepSessionId: '550e8400-e29b-41d4-a716-446655440112',
        }),
      }),
    );
    expect(refreshAccountWorkspaceAfterMutation).not.toHaveBeenCalled();
    expect(getNode('accountDetailStatus').textContent).toBe('账号 B');
    expect(getNode('accountDetailNotice').textContent).toBe('');
    expect(context.accountDetailMutationPending).toBe(false);
    expect(updateAccountDetailMutationUi).toHaveBeenCalledTimes(2);
  });

  it('syncs account filters, pagination and selected account detail into route state', () => {
    const html = renderAccountManagementAdminConsole();
    const reportStart = html.indexOf('async function loadAccountReport()');
    const reportEnd = html.indexOf(
      'async function exportAdminAuthAccountsCsv()',
      reportStart,
    );
    const reportScript = html.slice(reportStart, reportEnd);

    expect(html).toContain('applyAccountManagementRouteState');
    expect(html).toContain('syncAccountManagementRouteState');
    expect(html).toContain("query.get('userType')");
    expect(html).toContain("query.get('riskOnly')");
    expect(html).toContain("query.get('userId')");
    expect(html).toContain("query.get('topAccountsLimit')");
    expect(html).toContain("query.get('auditEventLimit')");
    expect(html).toContain(
      'Number.parseInt(routeState.topAccountsLimit, 10) || 5',
    );
    expect(html).toContain(
      'Number.parseInt(routeState.auditEventLimit, 10) || 10',
    );
    expect(html).toContain("query.set('userId', userId)");
    expect(html).toContain("query.set('page', String(page))");
    expect(html).toContain("query.set('pageSize', String(pageSize))");
    expect(html).toContain(
      "query.set('topAccountsLimit', String(topAccountsLimit))",
    );
    expect(html).toContain(
      "query.set('auditEventLimit', String(auditEventLimit))",
    );
    expect(html).toContain('topAccountsLimit !== 5');
    expect(html).toContain('auditEventLimit !== 10');
    expect(reportScript).toContain(
      'const query = buildAccountReportQuery();\n        syncAccountManagementRouteState();',
    );
    expect(html).toContain('refreshAccountWorkspace(currentAccountPage)');
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

  it('syncs permission filters into route state', () => {
    const html = renderAdminPermissionMatrixConsole();

    expect(html).toContain('applyPermissionMatrixRouteState');
    expect(html).toContain('syncPermissionMatrixRouteState');
    expect(html).toContain("query.get('action')");
    expect(html).toContain("query.get('risk')");
    expect(html).toContain("query.set('action', action)");
    expect(html).toContain("query.set('risk', risk)");
    expect(html).toContain('history.replaceState');
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

  it('syncs maintenance filters, pagination and report limits into route state', () => {
    const html = renderFileMaintenanceAdminConsole();

    expect(html).toContain('applyFileMaintenanceRouteState');
    expect(html).toContain('syncFileMaintenanceRouteState');
    expect(html).toContain("query.get('ownerUserId')");
    expect(html).toContain("query.get('topOwnersLimit')");
    expect(html).toContain("query.set('page', String(paging.page))");
    expect(html).toContain("query.set('pageSize', String(paging.pageSize))");
    expect(html).toContain("query.set('topOwnersLimit', String(topOwnersLimit))");
    expect(html).toContain('loadMaintenanceFiles(');
    expect(html).toContain('history.replaceState');
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
    expect(html).toContain('平台已赔付到账');
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

  it('ignores stale order list and detail responses', () => {
    const html = renderOrderManagementAdminConsole();

    expect(html).toContain('let latestOrderListRequestId = 0');
    expect(html).toContain('const requestId = ++latestOrderListRequestId');
    expect(html).toContain('if (requestId !== latestOrderListRequestId) return');
    expect(html).toContain('let latestOrderDetailRequestId = 0');
    expect(html).toContain('const requestId = ++latestOrderDetailRequestId');
    expect(html).toContain('if (requestId !== latestOrderDetailRequestId) return');
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
    expect(html).toContain("query.set('caseId', nextCaseId)");
    expect(html).toContain("query.set('keyword', nextCaseNo)");
    expect(html).toContain('latestExceptionCase.id');
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

  it('persists the order report limit in route state', () => {
    const html = renderOrderManagementAdminConsole();

    expect(html).toContain("query.get('topShippersLimit')");
    expect(html).toContain(
      "document.getElementById('orderReportTopShippersLimitInput').value",
    );
    expect(html).toContain(
      "query.set('topShippersLimit', String(topShippersLimit))",
    );
    expect(html).toContain(
      'const query = buildOrderReportQuery();\n        syncOrderManagementRouteState();',
    );
  });
});

describe('order exception case admin console page', () => {
  type CaseConsoleNode = {
    dataset: Record<string, string>;
    disabled: boolean;
    innerHTML: string;
    style: Record<string, string>;
    textContent: string;
    value: string;
  };

  const createCaseDeferred = () => {
    let resolve: ((value?: unknown) => void) | undefined;
    let reject: ((reason?: unknown) => void) | undefined;
    const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, reject, resolve };
  };

  const flushCasePromises = () =>
    new Promise<void>(resolve => setImmediate(resolve));

  const createCaseConsoleNodes = () => {
    const nodes = new Map<string, CaseConsoleNode>();
    const getNode = (id: string) => {
      const existing = nodes.get(id);
      if (existing) return existing;
      const created: CaseConsoleNode = {
        dataset: id === 'caseMutationButton' ? { action: 'process' } : {},
        disabled: false,
        innerHTML: id === 'caseDetail' ? '<strong>case A</strong>' : '',
        style: {},
        textContent: '',
        value:
          id === 'baseUpdatedAtIso'
            ? '2026-07-27T08:00:00.000Z'
            : id === 'caseActionContent'
              ? 'case A operation draft'
              : id === 'caseAssignTargetAdminUserIdInput'
                ? 'admin-a'
                : id === 'caseCompensationStatusInput'
                  ? 'not_required'
                  : '',
      };
      nodes.set(id, created);
      return created;
    };
    return { getNode, nodes };
  };

  const caseMutationVmSources = () => {
    const html = renderOrderExceptionCaseAdminConsole();
    const uiStart = html.indexOf('function isSelectedCaseMutationPending()');
    const uiEnd = html.indexOf(
      'function renderCompensationSnapshot(item)',
      uiStart,
    );
    const mutationStart = html.indexOf(
      'async function refreshCaseAfterMutation(',
    );
    const mutationEnd = html.indexOf(
      "document.getElementById('caseCompensationStatusInput').addEventListener",
      mutationStart,
    );
    if ([uiStart, uiEnd, mutationStart, mutationEnd].some(index => index < 0)) {
      throw new Error('order exception case mutation source was not found');
    }
    return {
      mutationSource: html.slice(mutationStart, mutationEnd),
      uiSource: html.slice(uiStart, uiEnd),
    };
  };

  const createCaseMutationHarness = (
    overrides: {
      api?: jest.Mock;
      loadCase?: jest.Mock;
      loadCases?: jest.Mock;
    } = {},
  ) => {
    const { mutationSource, uiSource } = caseMutationVmSources();
    const { getNode, nodes } = createCaseConsoleNodes();
    const api = overrides.api ?? jest.fn().mockResolvedValue(undefined);
    const loadCase =
      overrides.loadCase ?? jest.fn().mockResolvedValue(undefined);
    const loadCases =
      overrides.loadCases ?? jest.fn().mockResolvedValue(undefined);
    const context = {
      selectedCaseId: 'case-a',
      loadedCaseId: 'case-a',
      caseSelectionEpoch: 1,
      selectedCaseClaimedByAdminUserId: '',
      selectedCaseAppealStatus: 'none',
      mutationPending: false,
      mutationTargetCaseId: '',
      mutationTargetSelectionEpoch: 0,
      mutationPaths: ['/process', '/resolve', '/close'],
      currentPage: 2,
      document: {
        getElementById: getNode,
        querySelectorAll: jest.fn(() => []),
      },
      api,
      loadCase,
      loadCases,
      readResolveCompensationInput: jest.fn(() => ({
        compensationStatus: 'not_required',
      })),
      createIdempotencyKey: jest.fn(() => 'case-a-idempotency-key'),
      encodeURIComponent,
      invokeClaim: undefined as undefined | (() => Promise<void>),
      invokeCompensation: undefined as undefined | (() => Promise<void>),
      invokeProcess: undefined as undefined | (() => Promise<void>),
    };
    runInNewContext(
      `${uiSource}\n${mutationSource}\n` +
        `invokeClaim = claimCase;\n` +
        `invokeCompensation = executeCompensation;\n` +
        `invokeProcess = () => mutateCase('process');`,
      context,
    );
    return { api, context, getNode, loadCase, loadCases, nodes };
  };

  const selectCaseBInHarness = (
    context: {
      caseSelectionEpoch: number;
      loadedCaseId: string;
      selectedCaseId: string;
    },
    getNode: (id: string) => CaseConsoleNode,
  ) => {
    context.caseSelectionEpoch += 1;
    context.selectedCaseId = 'case-b';
    context.loadedCaseId = 'case-b';
    getNode('baseUpdatedAtIso').value = '2026-07-27T09:00:00.000Z';
    getNode('caseActionContent').value = 'case B operation draft';
    getNode('caseAssignTargetAdminUserIdInput').value = 'admin-b';
    getNode('caseMutationNotice').textContent = 'case B notice';
    getNode('caseDetail').innerHTML = '<strong>case B</strong>';
    getNode('caseCompensationStatusInput').value = 'pending';
    getNode('caseCompensationTargetRoleInput').value = 'driver';
    getNode('caseCompensationAmountInput').value = '8800';
  };

  it('surfaces recent activity timestamps plus SLA and compensation filters in the list and detail view', () => {
    const html = renderOrderExceptionCaseAdminConsole();

    expect(html).toContain('/admin/order-exception-cases/overdue-escalations/sweep');
    expect(html).toContain('/claim');
    expect(html).toContain('/takeover');
    expect(html).toContain('/assign');
    expect(html).toContain('/unclaim');
    expect(html).toContain('sweepOverdueExceptionCases');
    expect(html).toContain('recoverCaseFromConflict');
    expect(html).toContain('claimCase');
    expect(html).toContain('caseClaimButton');
    expect(html).toContain('takeoverCase');
    expect(html).toContain('caseTakeoverButton');
    expect(html).toContain('assignCase');
    expect(html).toContain('caseAssignButton');
    expect(html).toContain('releaseCaseClaim');
    expect(html).toContain('caseReleaseClaimButton');
    expect(html).toContain('caseAssignTargetAdminUserIdInput');
    expect(html).toContain('认领到我');
    expect(html).toContain('指派给客服');
    expect(html).toContain('转派给客服');
    expect(html).toContain('强制接管');
    expect(html).toContain('释放认领');
    expect(html).toContain('当前认领：');
    expect(html).toContain('认领：');
    expect(html).toContain('认领备注：');
    expect(html).toContain('caseSweepNotice');
    expect(html).toContain('sweepExceptionCaseOverdueButton');
    expect(html).toContain('loadMyCasesButton');
    expect(html).toContain('loadMyCases()');
    expect(html).toContain('currentAdminUserId');
    expect(html).toContain('latestCaseListRequestId');
    expect(html).toContain('latestCaseDetailRequestId');
    expect(html).toContain('我的认领单');
    expect(html).toContain('工单已被其他管理员更新，正在刷新最新状态。');
    expect(html).toContain('最近更新：');
    expect(html).toContain("item.updatedAtIso || item.createdAtIso || '-'");
    expect(html).toContain('创建时间：');
    expect(html).toContain('更新时间：');
    expect(html).toContain('caseListCompensationStatusInput');
    expect(html).toContain('caseListAppealStatusInput');
    expect(html).toContain('caseListSlaStatusInput');
    expect(html).toContain('caseClaimStatusInput');
    expect(html).toContain('caseClaimedByAdminUserIdInput');
    expect(html).toContain('caseAppealDecisionInput');
    expect(html).toContain("query.get('compensationStatus')");
    expect(html).toContain("query.get('appealStatus')");
    expect(html).toContain("query.get('slaStatus')");
    expect(html).toContain("query.get('claimStatus')");
    expect(html).toContain("query.get('claimedByAdminUserId')");
    expect(html).toContain("query.set('compensationStatus', compensationStatus)");
    expect(html).toContain("query.set('appealStatus', appealStatus)");
    expect(html).toContain("query.set('slaStatus', slaStatus)");
    expect(html).toContain("query.set('claimStatus', claimStatus)");
    expect(html).toContain("query.set('claimedByAdminUserId', claimedByAdminUserId)");
    expect(html).toContain('平台已赔付到账');
    expect(html).toContain('申诉：');
    expect(html).toContain('申诉裁定');
    expect(html).toContain('SLA：');
    expect(html).toContain('受理 SLA');
    expect(html).toContain('解决 SLA');
    expect(html).toContain('认领状态和认领客服筛队列');
    expect(html).toContain('可手动扫描 + 可选定时扫');
  });

  it('persists selected case deep-links in route state and restores them after reload', () => {
    const html = renderOrderExceptionCaseAdminConsole();

    expect(html).toContain("query.get('caseId')");
    expect(html).toContain("query.set('caseId', caseId)");
    expect(html).toContain('pendingRouteCaseId');
    expect(html).toContain('pendingRouteCaseId = caseRouteState.caseId');
    expect(html).toContain('renderCaseListSelection');
    expect(html).toContain('clearCaseSelection(options = {})');
    expect(html).toContain('routeRestoreCaseId !== selectedCaseId');
    expect(html).toContain("await loadCase(routeRestoreCaseId, { fromRouteRestore: true })");
    expect(html).toContain('syncOrderExceptionCaseRouteState(currentPage, selectedCaseId)');
  });

  it('clears stale mutation state until the newly selected case detail is loaded', async () => {
    const html = renderOrderExceptionCaseAdminConsole();
    const { uiSource } = caseMutationVmSources();
    const loadStart = html.indexOf('async function loadCase(caseId, options = {})');
    const loadEnd = html.indexOf('function loadMyCases()', loadStart);
    const processStart = html.indexOf('async function mutateCase(action)');
    const processEnd = html.indexOf('async function claimCase()', processStart);
    const detailRequest = createCaseDeferred();
    const mutationRequest = createCaseDeferred();
    const { getNode } = createCaseConsoleNodes();
    getNode('caseActions').innerHTML = '<button>case A old action</button>';
    const api = jest.fn(
      (_path: string, options?: { method?: string }) =>
        options?.method === 'POST'
          ? mutationRequest.promise
          : detailRequest.promise,
    );
    const renderMutationButtons = jest.fn();
    const context = {
      latestCaseDetailRequestId: 0,
      caseSelectionEpoch: 4,
      pendingRouteCaseId: '',
      selectedCaseId: 'case-a',
      loadedCaseId: 'case-a',
      selectedCaseClaimedByAdminUserId: '',
      selectedCaseAppealStatus: 'none',
      mutationPending: false,
      mutationTargetCaseId: '',
      mutationTargetSelectionEpoch: 0,
      mutationPaths: ['/process', '/resolve', '/close'],
      currentPage: 1,
      document: {
        getElementById: getNode,
        querySelectorAll: jest.fn(() => []),
      },
      api,
      syncOrderExceptionCaseRouteState: jest.fn(),
      renderCaseDetail: jest.fn(() => '<strong>case B detail</strong>'),
      renderMutationButtons,
      clearCaseSelection: jest.fn(),
      escapeHtml: (value: unknown) => String(value),
      readResolveCompensationInput: jest.fn(() => ({
        compensationStatus: 'not_required',
      })),
      encodeURIComponent,
      invokeLoad: undefined as
        | undefined
        | ((caseId: string) => Promise<void>),
      invokeProcess: undefined as undefined | (() => Promise<void>),
      invokeReady: undefined as undefined | (() => boolean),
    };
    runInNewContext(
      `${uiSource}\n${html.slice(loadStart, loadEnd)}\n` +
        `${html.slice(processStart, processEnd)}\n` +
        `invokeLoad = loadCase;\n` +
        `invokeProcess = () => mutateCase('process');\n` +
        `invokeReady = isSelectedCaseReadyForMutation;`,
      context,
    );

    const loadingCaseB = context.invokeLoad!('case-b');

    expect(context.selectedCaseId).toBe('case-b');
    expect(context.loadedCaseId).toBe('');
    expect(context.caseSelectionEpoch).toBe(5);
    expect(context.invokeReady!()).toBe(false);
    expect(getNode('baseUpdatedAtIso').value).toBe('');
    expect(getNode('caseActionContent').value).toBe('');
    expect(getNode('caseAssignTargetAdminUserIdInput').value).toBe('');
    expect(getNode('caseActions').innerHTML).toBe('');
    expect(getNode('caseActionContent').disabled).toBe(true);

    await context.invokeProcess!();
    expect(api).toHaveBeenCalledTimes(1);

    detailRequest.resolve?.({
      updatedAtIso: '2026-07-27T09:00:00.000Z',
      claimedByAdminUserId: null,
      appealStatus: 'none',
      actions: [],
      compensationStatus: 'not_required',
      compensationTargetRole: null,
      compensationAmountCents: null,
    });
    await loadingCaseB;

    expect(context.loadedCaseId).toBe('case-b');
    expect(context.invokeReady!()).toBe(true);
    expect(getNode('baseUpdatedAtIso').value).toBe(
      '2026-07-27T09:00:00.000Z',
    );
    expect(renderMutationButtons).toHaveBeenCalledTimes(1);

    getNode('caseActionContent').value = 'case B process draft';
    const mutation = context.invokeProcess!();
    expect(api).toHaveBeenLastCalledWith(
      '/admin/order-exception-cases/case-b/process',
      expect.objectContaining({ method: 'POST' }),
    );
    mutationRequest.reject?.(new Error('case B failed'));
    await mutation;
    expect(context.mutationPending).toBe(false);
  });

  it('binds every case mutation result to its starting selection', async () => {
    const html = renderOrderExceptionCaseAdminConsole();
    const selectionStart = html.indexOf(
      'function isMutationTargetSelected(targetCaseId, targetSelectionEpoch)',
    );
    const selectionEnd = html.indexOf(
      'function renderCaseListSelection()',
      selectionStart,
    );
    const mutationStart = html.indexOf(
      'async function refreshCaseAfterMutation(',
    );
    const mutationEnd = html.indexOf(
      "document.getElementById('caseCompensationStatusInput').addEventListener",
      mutationStart,
    );
    const selectionSource = html.slice(selectionStart, selectionEnd);
    const mutationSource = html.slice(mutationStart, mutationEnd);
    const actionContent = 'case A operation draft';
    const baseUpdatedAtIso = '2026-07-27T08:00:00.000Z';
    const mutations = [
      {
        name: 'process',
        invocation: "() => mutateCase('process')",
        path: '/admin/order-exception-cases/case-a/process',
        body: { baseUpdatedAtIso, content: actionContent },
      },
      {
        name: 'claim',
        invocation: 'claimCase',
        path: '/admin/order-exception-cases/case-a/claim',
        body: { baseUpdatedAtIso, content: actionContent },
      },
      {
        name: 'takeover',
        invocation: 'takeoverCase',
        path: '/admin/order-exception-cases/case-a/takeover',
        body: { baseUpdatedAtIso, content: actionContent },
      },
      {
        name: 'unclaim',
        invocation: 'releaseCaseClaim',
        path: '/admin/order-exception-cases/case-a/unclaim',
        body: { baseUpdatedAtIso, content: actionContent },
      },
      {
        name: 'assign',
        invocation: 'assignCase',
        path: '/admin/order-exception-cases/case-a/assign',
        body: {
          baseUpdatedAtIso,
          targetAdminUserId: 'admin-a',
          content: actionContent,
        },
      },
      {
        name: 'compensation',
        invocation: 'executeCompensation',
        path: '/admin/order-exception-cases/case-a/compensation/execute',
        body: {
          baseUpdatedAtIso,
          idempotencyKey: 'case-a-idempotency-key',
          content: actionContent,
        },
      },
    ];
    const outcomes = ['success', 'error', 'conflict'] as const;
    for (const mutation of mutations) {
      for (const outcome of outcomes) {
        const request = createCaseDeferred();
        const conflictRefresh = createCaseDeferred();
        const { getNode } = createCaseConsoleNodes();
        const api = jest.fn((_path: string, _options: unknown) => request.promise);
        const loadCase = jest.fn((_caseId: string, _options?: unknown) =>
          outcome === 'conflict'
            ? conflictRefresh.promise
            : Promise.resolve(),
        );
        const loadCases = jest.fn((_page: number) => Promise.resolve());
        const setCaseActionButtonsDisabled = jest.fn((_disabled: boolean) => {});
        const syncCompensationInputsFromStatus = jest.fn(() => {});
        const context = {
          selectedCaseId: 'case-a',
          loadedCaseId: 'case-a',
          caseSelectionEpoch: 1,
          selectedCaseClaimedByAdminUserId: '',
          mutationPending: false,
          mutationTargetCaseId: '',
          mutationTargetSelectionEpoch: 0,
          mutationPaths: ['/process', '/resolve', '/close'],
          currentPage: 2,
          document: { getElementById: getNode },
          api,
          loadCase,
          loadCases,
          setCaseActionButtonsDisabled,
          syncCompensationInputsFromStatus,
          readResolveCompensationInput: jest.fn(() => ({
            compensationStatus: 'not_required',
          })),
          createIdempotencyKey: jest.fn(() => 'case-a-idempotency-key'),
          encodeURIComponent,
          invokeMutation: undefined as undefined | (() => Promise<void>),
        };
        runInNewContext(
          `${selectionSource}\n${mutationSource}\ninvokeMutation = ${mutation.invocation};`,
          context,
        );
        if (!context.invokeMutation) {
          throw new Error(`${mutation.name} mutation was not initialized`);
        }

        const firstMutation = context.invokeMutation();
        const duplicateMutation = context.invokeMutation();

        expect(api).toHaveBeenCalledTimes(1);
        expect(api).toHaveBeenCalledWith(
          mutation.path,
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(mutation.body),
          }),
        );

        if (outcome === 'conflict') {
          request.reject?.(
            Object.assign(new Error('case A conflict'), {
              code: 'EXCEPTION_CASE_CONFLICT',
            }),
          );
          await flushCasePromises();
          expect(loadCase).toHaveBeenCalledWith('case-a', {
            preserveSelectionEpoch: true,
          });
        }

        selectCaseBInHarness(context, getNode);

        if (outcome === 'success') {
          request.resolve?.({ id: 'case-a' });
        } else if (outcome === 'error') {
          request.reject?.(new Error('case A failed'));
        } else {
          conflictRefresh.resolve?.({ id: 'case-a' });
        }
        await Promise.all([firstMutation, duplicateMutation]);

        expect(context.selectedCaseId).toBe('case-b');
        expect(getNode('baseUpdatedAtIso').value).toBe(
          '2026-07-27T09:00:00.000Z',
        );
        expect(getNode('caseActionContent').value).toBe(
          'case B operation draft',
        );
        expect(getNode('caseAssignTargetAdminUserIdInput').value).toBe(
          'admin-b',
        );
        expect(getNode('caseMutationNotice').textContent).toBe('case B notice');
        expect(getNode('caseDetail').innerHTML).toBe('<strong>case B</strong>');
        expect(getNode('caseCompensationStatusInput').value).toBe('pending');
        expect(getNode('caseCompensationTargetRoleInput').value).toBe('driver');
        expect(getNode('caseCompensationAmountInput').value).toBe('8800');
        expect(loadCase).toHaveBeenCalledTimes(outcome === 'conflict' ? 1 : 0);
        expect(loadCases).not.toHaveBeenCalled();
        expect(context.mutationPending).toBe(false);
        expect(context.mutationTargetCaseId).toBe('');
        expect(context.mutationTargetSelectionEpoch).toBe(0);
        expect(setCaseActionButtonsDisabled.mock.calls).toEqual([
          [true],
          [false],
        ]);
        expect(syncCompensationInputsFromStatus).toHaveBeenCalledTimes(2);
      }
    }
  });

  it('rejects an A mutation completion after an A to B to A selection cycle', async () => {
    const request = createCaseDeferred();
    const api = jest.fn(() => request.promise);
    const { context, getNode, loadCase, loadCases } =
      createCaseMutationHarness({ api });

    const mutation = context.invokeClaim!();
    selectCaseBInHarness(context, getNode);
    context.caseSelectionEpoch += 1;
    context.selectedCaseId = 'case-a';
    context.loadedCaseId = 'case-a';
    getNode('baseUpdatedAtIso').value = '2026-07-27T10:00:00.000Z';
    getNode('caseActionContent').value = 'new case A draft';
    getNode('caseMutationNotice').textContent = 'new case A notice';
    getNode('caseDetail').innerHTML = '<strong>new case A detail</strong>';

    request.resolve?.({ id: 'case-a' });
    await mutation;

    expect(context.caseSelectionEpoch).toBe(3);
    expect(getNode('caseActionContent').value).toBe('new case A draft');
    expect(getNode('caseMutationNotice').textContent).toBe(
      'new case A notice',
    );
    expect(getNode('caseDetail').innerHTML).toBe(
      '<strong>new case A detail</strong>',
    );
    expect(loadCase).not.toHaveBeenCalled();
    expect(loadCases).not.toHaveBeenCalled();
    expect(context.mutationPending).toBe(false);
    expect(getNode('caseActionContent').disabled).toBe(false);
  });

  it.each(['detail', 'list'] as const)(
    'keeps B intact when a successful A mutation changes selection during the %s refresh',
    async refreshStage => {
      const request = createCaseDeferred();
      const detailRefresh = createCaseDeferred();
      const listRefresh = createCaseDeferred();
      const api = jest.fn(() => request.promise);
      const loadCase = jest.fn(() => detailRefresh.promise);
      const loadCases = jest.fn(() => listRefresh.promise);
      const { context, getNode } = createCaseMutationHarness({
        api,
        loadCase,
        loadCases,
      });

      const mutation = context.invokeClaim!();
      request.resolve?.({ id: 'case-a' });
      await flushCasePromises();
      expect(loadCase).toHaveBeenCalledWith('case-a', {
        preserveSelectionEpoch: true,
      });

      if (refreshStage === 'detail') {
        selectCaseBInHarness(context, getNode);
        detailRefresh.resolve?.({ id: 'case-a' });
      } else {
        detailRefresh.resolve?.({ id: 'case-a' });
        await flushCasePromises();
        expect(loadCases).toHaveBeenCalledWith(2);
        selectCaseBInHarness(context, getNode);
        listRefresh.resolve?.({ items: [] });
      }
      await mutation;

      expect(getNode('caseActionContent').value).toBe(
        'case B operation draft',
      );
      expect(getNode('caseMutationNotice').textContent).toBe('case B notice');
      expect(getNode('caseDetail').innerHTML).toBe('<strong>case B</strong>');
      expect(loadCases).toHaveBeenCalledTimes(refreshStage === 'list' ? 1 : 0);
      expect(context.mutationPending).toBe(false);
      expect(getNode('caseActionContent').disabled).toBe(false);
      expect(getNode('caseClaimButton').disabled).toBe(false);
    },
  );

  it('keeps B intact when compensation is already executed during the A detail refresh', async () => {
    const request = createCaseDeferred();
    const detailRefresh = createCaseDeferred();
    const api = jest.fn(() => request.promise);
    const loadCase = jest.fn(() => detailRefresh.promise);
    const loadCases = jest.fn().mockResolvedValue(undefined);
    const { context, getNode } = createCaseMutationHarness({
      api,
      loadCase,
      loadCases,
    });

    const mutation = context.invokeCompensation!();
    request.reject?.(
      Object.assign(new Error('already executed'), {
        code: 'EXCEPTION_CASE_COMPENSATION_ALREADY_EXECUTED',
      }),
    );
    await flushCasePromises();
    expect(loadCase).toHaveBeenCalledWith('case-a', {
      preserveSelectionEpoch: true,
    });

    selectCaseBInHarness(context, getNode);
    detailRefresh.resolve?.({ id: 'case-a' });
    await mutation;

    expect(loadCases).not.toHaveBeenCalled();
    expect(getNode('caseActionContent').value).toBe(
      'case B operation draft',
    );
    expect(getNode('caseMutationNotice').textContent).toBe('case B notice');
    expect(context.mutationPending).toBe(false);
    expect(getNode('caseExecuteCompensationButton').disabled).toBe(false);
  });

  it.each(['success', 'error', 'conflict'] as const)(
    'restores A controls after a %s mutation outcome',
    async outcome => {
      const request = createCaseDeferred();
      const api = jest.fn(() => request.promise);
      const loadCase = jest.fn().mockResolvedValue(undefined);
      const loadCases = jest.fn().mockResolvedValue(undefined);
      const { context, getNode } = createCaseMutationHarness({
        api,
        loadCase,
        loadCases,
      });

      const mutation = context.invokeClaim!();
      expect(context.mutationPending).toBe(true);
      expect(context.mutationTargetCaseId).toBe('case-a');
      expect(context.mutationTargetSelectionEpoch).toBe(1);
      expect(getNode('caseActionContent').disabled).toBe(true);
      expect(getNode('caseAssignTargetAdminUserIdInput').disabled).toBe(true);
      expect(getNode('caseClaimButton').disabled).toBe(true);

      if (outcome === 'success') {
        request.resolve?.({ id: 'case-a' });
      } else if (outcome === 'conflict') {
        request.reject?.(
          Object.assign(new Error('case A conflict'), {
            code: 'EXCEPTION_CASE_CONFLICT',
          }),
        );
      } else {
        request.reject?.(new Error('case A failed'));
      }
      await mutation;

      expect(context.mutationPending).toBe(false);
      expect(context.mutationTargetCaseId).toBe('');
      expect(context.mutationTargetSelectionEpoch).toBe(0);
      expect(getNode('caseActionContent').disabled).toBe(false);
      expect(getNode('caseAssignTargetAdminUserIdInput').disabled).toBe(false);
      expect(getNode('caseClaimButton').disabled).toBe(false);
      expect(getNode('caseMutationButton').disabled).toBe(false);
      expect(loadCase).toHaveBeenCalledTimes(outcome === 'error' ? 0 : 1);
      expect(loadCases).toHaveBeenCalledTimes(outcome === 'error' ? 0 : 1);
      expect(getNode('caseMutationNotice').textContent).toBe(
        outcome === 'success'
          ? '工单已认领，当前客服可继续跟进。'
          : outcome === 'conflict'
            ? '工单已被其他管理员更新，正在刷新最新状态。'
            : 'case A failed',
      );
    },
  );
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
    expect(html).toContain('对未认领 open 工单认领、对自己名下工单指派 / 转派或释放认领、对他人已认领工单强制接管');
    expect(html).toContain('认领未认领工单、转派或释放自己名下工单、强制接管他人已认领工单');
    expect(html).toContain('进入工具台');
    expect(html).toContain('我的认领单');
    expect(html).toContain('module-card-links');
    expect(html).toContain('handleOverviewModuleCardClick');
    expect(html).toContain('buildOverviewMyClaimRoute');
    expect(html).toContain('currentAdminUserId');
    expect(html).toContain('claimedByAdminUserId=');
    expect(html).toContain('metric.route');
    expect(html).toContain('metric-link');
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

  it('syncs order attachment filters, pagination and selected order into route state', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getOrderAttachmentAuditConsole: () => string;
      }
    ).getOrderAttachmentAuditConsole();

    expect(html).toContain('applyOrderAttachmentRouteState');
    expect(html).toContain('syncOrderAttachmentRouteState');
    expect(html).toContain("query.get('orderId')");
    expect(html).toContain("query.get('hasMissingFiles')");
    expect(html).toContain("query.set('orderId', orderId)");
    expect(html).toContain("query.set('page', String(paging.page))");
    expect(html).toContain("query.set('pageSize', String(paging.pageSize))");
    expect(html).toContain('syncAuditSummarySelection');
    expect(html).toContain('history.replaceState');
  });

  it('ignores stale order attachment detail and list responses', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getOrderAttachmentAuditConsole: () => string;
      }
    ).getOrderAttachmentAuditConsole();

    expect(html).toContain('let latestAuditDetailRequestId = 0');
    expect(html).toContain('const requestId = ++latestAuditDetailRequestId');
    expect(html).toContain('if (requestId !== latestAuditDetailRequestId) return');
    expect(html).toContain('let latestAuditListRequestId = 0');
    expect(html).toContain('const requestId = ++latestAuditListRequestId');
    expect(html).toContain('if (requestId !== latestAuditListRequestId) return');
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

  it('invalidates coupon reports before token and limit validation returns', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getShipperCouponConsole: () => string;
      }
    ).getShipperCouponConsole();
    const loadStart = html.indexOf('async function loadCouponReport()');
    const requestStart = html.indexOf(
      'const requestId = ++latestCouponReportRequestId',
      loadStart,
    );
    const tokenRead = html.indexOf("const token = readTrimmed('adminToken')", loadStart);
    const limitRead = html.indexOf(
      'topShippersLimit = readCouponReportTopShippersLimit()',
      loadStart,
    );

    expect(requestStart).toBeGreaterThan(loadStart);
    expect(requestStart).toBeLessThan(tokenRead);
    expect(requestStart).toBeLessThan(limitRead);
    expect(html.match(/setCouponReportControlsDisabled\(false\)/g)).toHaveLength(3);
  });

  it('syncs coupon form inputs and report filters into route state', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getShipperCouponConsole: () => string;
      }
    ).getShipperCouponConsole();

    expect(html).toContain('applyShipperCouponRouteState');
    expect(html).toContain('syncShipperCouponRouteState');
    expect(html).toContain("query.get('shipperId')");
    expect(html).toContain("query.get('batchShipperIds')");
    expect(html).toContain("query.get('topShippersLimit')");
    expect(html).toContain("query.set('couponTitle', couponTitle)");
    expect(html).toContain("query.set('discountCents', discountCents)");
    expect(html).toContain("query.set('topShippersLimit', topShippersLimit)");
    expect(html).toContain('history.replaceState');
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
    expect(html).toContain('/overdue-escalations/sweep');
    expect(html).toContain('/compensation/execute');
    expect(html).toContain('executeCompensation()');
    expect(html).toContain('sweepOverdueExceptionCases');
    expect(html).toContain('平台已赔付到账');
    expect(html).toContain('申诉处理中');
    expect(html).toContain('baseUpdatedAtIso');
    expect(html).toContain('EXCEPTION_CASE_CONFLICT');
    expect(html).toContain('EXCEPTION_CASE_COMPENSATION_ALREADY_EXECUTED');
    expect(html).toContain('caseStatusInput');
    expect(html).toContain('caseSourceRoleInput');
    expect(html).toContain('caseClaimStatusInput');
    expect(html).toContain('caseClaimedByAdminUserIdInput');
    expect(html).toContain('caseKeywordInput');
    expect(html).toContain('caseCompensationStatusInput');
    expect(html).toContain('caseCompensationTargetRoleInput');
    expect(html).toContain('caseCompensationAmountInput');
    expect(html).toContain('applyOrderExceptionCaseRouteState');
    expect(html).toContain("query.get('claimStatus')");
    expect(html).toContain("query.get('claimedByAdminUserId')");
    expect(html).toContain("query.set('claimStatus', claimStatus)");
    expect(html).toContain("query.set('claimedByAdminUserId', claimedByAdminUserId)");
    expect(html).toContain('最近更新：');
    expect(html).toContain('创建时间：');
    expect(html).toContain('更新时间：');
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
    expect(html).toContain('/admin/support-tickets/overdue-escalations/sweep');
    expect(html).toContain('/claim');
    expect(html).toContain('/takeover');
    expect(html).toContain('/assign');
    expect(html).toContain('/unclaim');
    expect(html).toContain('/process');
    expect(html).toContain('/resolve');
    expect(html).toContain('supportTicketStatusInput');
    expect(html).toContain('supportTicketClaimStatusInput');
    expect(html).toContain('supportTicketClaimedByAdminUserIdInput');
    expect(html).toContain('supportTicketKeywordInput');
    expect(html).toContain('supportTicketPageSizeInput');
    expect(html).toContain('supportTicketAssignTargetAdminUserIdInput');
    expect(html).toContain('supportTicketActionContent');
    expect(html).toContain('supportTicketBaseUpdatedAtIso');
    expect(html).toContain('claimSupportTicket');
    expect(html).toContain('recoverSupportTicketFromConflict');
    expect(html).toContain('claimSupportTicketButton');
    expect(html).toContain('takeoverSupportTicket');
    expect(html).toContain('takeoverSupportTicketButton');
    expect(html).toContain('assignSupportTicket');
    expect(html).toContain('assignSupportTicketButton');
    expect(html).toContain('releaseSupportTicketClaim');
    expect(html).toContain('releaseSupportTicketClaimButton');
    expect(html).toContain('loadMySupportTicketsButton');
    expect(html).toContain('loadMySupportTickets()');
    expect(html).toContain('currentAdminUserId');
    expect(html).toContain('initializeAdminSession');
    expect(html).toContain('释放认领');
    expect(html).toContain('认领到我');
    expect(html).toContain('指派给客服');
    expect(html).toContain('转派给客服');
    expect(html).toContain('强制接管');
    expect(html).toContain('我的认领单');
    expect(html).toContain('SUPPORT_TICKET_CONFLICT');
    expect(html).toContain('工单已被其他管理员更新，正在刷新最新状态。');
    expect(html).toContain('当前认领：');
    expect(html).toContain('认领：');
    expect(html).toContain("query.get('claimStatus')");
    expect(html).toContain("query.get('claimedByAdminUserId')");
    expect(html).toContain("query.set('claimStatus', claimStatus)");
    expect(html).toContain("query.set('claimedByAdminUserId', claimedByAdminUserId)");
    expect(html).toContain('sweepSupportTicketOverdueEscalations');
    expect(html).toContain('applySupportTicketRouteState');
    expect(html).toContain('/api/admin/order-exception-case-console');
    expect(html).toContain('/api/admin/finance-console');
    expect(html).not.toContain('hero');
  });

  it('serves the evaluation audit console html', () => {
    const controller = new AdminConsoleController();

    expect(controller.getEvaluationAuditConsole()).toContain('评价审计台');
    expect(controller.getEvaluationAuditConsole()).toContain('/attachments');
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
      moduleCount: 15,
      capabilityCount: 15,
      writeCapabilityCount: 12,
      highRiskCapabilityCount: 12,
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
        moduleCount: 15,
        capabilityCount: 15,
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
