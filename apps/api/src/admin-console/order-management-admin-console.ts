import {
  renderAdminConsoleNav,
  renderAdminConsoleNavStyles,
} from './admin-console-nav-snippet';
import {
  renderAdminSessionControls,
  renderAdminSessionScript,
} from './admin-session-snippet';

export function renderOrderManagementAdminConsole() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>订单管理台</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f3f5f7;
      --panel: #ffffff;
      --line: #d8dee4;
      --text: #18212a;
      --muted: #667085;
      --accent: #0f5f8c;
      --accent-soft: rgba(15, 95, 140, 0.08);
      --warning-bg: #fff4db;
      --warning-text: #8f4b00;
      --danger: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
      background:
        linear-gradient(180deg, rgba(15, 95, 140, 0.05), transparent 24%),
        var(--bg);
      color: var(--text);
    }
    button, input, select, textarea { font: inherit; }
    .console-shell {
      display: grid;
      grid-template-columns: minmax(360px, 430px) minmax(0, 1fr);
      min-height: 100vh;
    }
    .query-panel, .detail-panel { padding: 18px; }
    .query-panel {
      border-right: 1px solid var(--line);
      background: #eef3f6;
    }
    h1 { margin: 0 0 12px; font-size: 24px; }
    h2 { margin: 0 0 10px; font-size: 18px; }
    h3 { margin: 0 0 8px; font-size: 15px; }
    .muted { color: var(--muted); font-size: 13px; line-height: 1.7; }
    .notice { min-height: 20px; margin-top: 10px; color: var(--danger); white-space: pre-wrap; }
    .card {
      margin-top: 12px;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--panel);
      box-shadow: 0 10px 24px rgba(24, 33, 42, 0.04);
    }
    .toolbar,
    .range-toolbar,
    .pagination-toolbar,
    .pager-toolbar {
      display: grid;
      gap: 8px;
      margin-top: 10px;
    }
    .toolbar { grid-template-columns: minmax(0, 1fr); }
    .range-toolbar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .pagination-toolbar { grid-template-columns: minmax(90px, 1fr) minmax(120px, 1fr); }
    .pager-toolbar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    input, select, textarea, button {
      width: 100%;
      min-height: 40px;
      padding: 9px 10px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: #fff;
    }
    textarea { min-height: 78px; resize: vertical; }
    button {
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
      cursor: pointer;
      font-weight: 700;
    }
    button:disabled {
      border-color: var(--line);
      background: #d8dee4;
      color: var(--muted);
      cursor: not-allowed;
    }
    .secondary-button {
      background: #fff;
      color: var(--accent);
      border-color: var(--line);
      font-weight: 600;
    }
    .danger-button {
      background: var(--danger);
      border-color: var(--danger);
      color: #fff;
    }
    .session-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin-top: 10px;
    }
    .session-link {
      color: var(--accent);
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
    }
    .inline-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .checkbox-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 600;
    }
    .checkbox-label input {
      width: auto;
      min-height: 0;
      padding: 0;
      margin: 0;
    }
    .list {
      display: grid;
      gap: 8px;
      margin-top: 10px;
    }
    .order-row-shell {
      display: grid;
      gap: 8px;
    }
    .order-row {
      width: 100%;
      text-align: left;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      background: #fff;
      color: var(--text);
      min-height: 0;
    }
    .order-row:hover {
      border-color: var(--accent);
      box-shadow: 0 8px 18px rgba(15, 95, 140, 0.08);
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
    }
    .pill-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      border-radius: 999px;
      background: #f4f6f8;
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
    }
    .pill.warning {
      background: var(--warning-bg);
      color: var(--warning-text);
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .meta-card {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      background: #fbfcfd;
    }
    .meta-card strong {
      display: block;
      margin-bottom: 6px;
      font-size: 14px;
    }
    .report-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .report-span {
      grid-column: 1 / -1;
    }
    .status-line {
      margin-top: 8px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.7;
    }
    .selection-summary {
      min-height: 20px;
      margin-top: 10px;
    }
    .metric-list,
    .shipper-report-list {
      display: grid;
      gap: 8px;
      margin-top: 10px;
    }
    .metric-row,
    .shipper-report-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: #fff;
      align-items: center;
    }
    .metric-row strong,
    .shipper-report-row strong {
      margin: 0;
      font-size: 14px;
    }
    .metric-row span,
    .shipper-report-row span {
      color: var(--muted);
      font-size: 13px;
      text-align: right;
    }
    .summary-box {
      padding: 14px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #fff;
      min-height: 130px;
    }
    .summary-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 12px;
      align-items: center;
    }
    .summary-actions button {
      width: auto;
      min-width: 180px;
    }
    .mono {
      word-break: break-all;
      font-family: Consolas, "SFMono-Regular", monospace;
    }
    .event-list {
      display: grid;
      gap: 10px;
      margin-top: 12px;
    }
    .event-card {
      border-left: 3px solid var(--accent);
      padding: 10px 12px;
      border-radius: 0 10px 10px 0;
      background: #fbfdff;
    }
    .empty {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.7;
    }
    ${renderAdminConsoleNavStyles()}
    @media (max-width: 920px) {
      .console-shell { grid-template-columns: 1fr; }
      .query-panel { border-right: 0; border-bottom: 1px solid var(--line); }
      .range-toolbar,
      .pagination-toolbar,
      .pager-toolbar,
      .meta-grid,
      .report-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="console-shell">
    <section class="query-panel">
      <h1>订单管理台</h1>
      <p class="muted">这页把后台订单列表、详情、筛选报表、CSV 导出和按当前筛选结果批量取消 waiting 订单拢到一块了，方便运营先把查单和明显脏单清理闭环。现在批量取消会直接调后端 <span class="mono">POST /admin/orders/batch-cancel</span> 做整批校验和原子写入；订单详情里也会按当前 orderId 并行拉支付 / 退款 / 结算做按单资金视图，异常快照里还会挂最新赔付决议摘要并能跳异常工单台；但真实赔付执行 / 退款联动和更深的资金处置还没补齐，别拿静态台硬装成完整 OMS。</p>
      <div class="toolbar">
        <input id="adminToken" type="password" aria-label="admin access token" title="admin access token" placeholder="粘贴 admin access token" />
      </div>
      ${renderAdminSessionControls({
        currentRoute: '/api/admin/order-management-console',
        hintClass: 'muted',
      })}
      ${renderAdminConsoleNav({
        currentRoute: '/api/admin/order-management-console',
      })}
      <div id="orderManagementNotice" class="notice"></div>

      <section class="card">
        <h2>订单检索</h2>
        <div class="toolbar">
          <input id="orderListKeywordInput" type="text" aria-label="订单关键字" title="订单号 / 地址 / 联系人 / 货物关键字" placeholder="订单号 / 地址 / 联系人 / 货物" />
          <select id="orderListStatusInput" aria-label="单状态筛选" title="status">
            <option value="">status: 全部</option>
            <option value="waiting">waiting</option>
            <option value="loading">loading</option>
            <option value="transporting">transporting</option>
            <option value="confirming">confirming</option>
            <option value="completed">completed</option>
            <option value="cancelled">cancelled</option>
          </select>
          <input id="orderListStatusesInput" type="text" aria-label="多状态筛选" title="statuses" placeholder="statuses: loading,transporting" />
        </div>
        <div class="muted">status 和 statuses 只能二选一，别俩都塞，接口会直接把你怼回来。</div>
        <div class="range-toolbar">
          <input id="orderListCreatedFromInput" type="text" aria-label="创建时间起点" title="createdFromIso" placeholder="createdFromIso: 2026-07-01T00:00:00.000Z" />
          <input id="orderListCreatedToInput" type="text" aria-label="创建时间终点" title="createdToIso" placeholder="createdToIso: 2026-07-31T00:00:00.000Z" />
        </div>
        <div class="pagination-toolbar">
          <input id="orderListPageInput" type="number" min="1" value="1" aria-label="页码" title="page" />
          <select id="orderListPageSizeInput" aria-label="每页数量" title="pageSize">
            <option value="10">每页 10 条</option>
            <option value="20" selected>每页 20 条</option>
            <option value="50">每页 50 条</option>
          </select>
        </div>
        <div class="pager-toolbar">
          <button id="loadOrderListButton" type="button">刷新订单列表</button>
          <button id="loadSelectedOrderButton" type="button" class="secondary-button">刷新已选订单详情</button>
        </div>
        <div class="pager-toolbar">
          <button id="orderListPreviousPageButton" type="button" class="secondary-button" disabled>上一页</button>
          <button id="orderListNextPageButton" type="button" class="secondary-button" disabled>下一页</button>
        </div>
        <div id="orderListPaginationStatus" class="muted">尚未检索</div>
        <div id="orderListResults" class="list">
          <div class="empty">填 token 后可按条件拉后台订单列表，点某条就能看详情。</div>
        </div>
      </section>

      <section class="card">
        <h2>批量取消 waiting 单</h2>
        <p class="muted">当前批量动作会把勾选的 waiting 订单按列表顺序一次提交给后端批量取消接口；后端会先整批校验状态和版本，再原子写入。只要有一单不满足条件，整批都会失败，不会给你留半拉子结果。</p>
        <div class="inline-actions">
          <label class="checkbox-label"><input id="orderSelectAllWaitingInput" type="checkbox" onclick="toggleSelectAllWaitingOrders(this.checked)" />全选当前 waiting 结果</label>
          <button id="clearOrderSelectionButton" type="button" class="secondary-button">清空勾选</button>
        </div>
        <div class="toolbar">
          <input id="orderBatchCancelReasonInput" type="text" aria-label="批量取消原因" title="批量取消原因" value="后台取消" placeholder="批量取消原因" />
          <textarea id="orderBatchCancelDescriptionInput" aria-label="批量取消补充说明" title="批量取消补充说明" placeholder="可选补充说明，例如：运营按筛选结果批量清理 waiting 单"></textarea>
        </div>
        <div class="pager-toolbar">
          <button id="runBatchCancelWaitingOrdersButton" type="button" class="danger-button">执行批量取消</button>
        </div>
        <div id="orderBatchSelectionStatus" class="muted selection-summary">当前筛选结果里没有可批量取消的 waiting 订单。</div>
        <div id="orderBatchActionStatus" class="status-line"></div>
      </section>
    </section>

    <section class="detail-panel">
      <section class="card">
        <h2>已选订单摘要</h2>
        <div id="selectedOrderSummary" class="summary-box">
          <div class="empty">先从左侧列表选一条订单。</div>
        </div>
      </section>

      <section class="card">
        <h2>按单资金视图</h2>
        <p class="muted">会按当前 orderId 并行拉支付 / 退款 / 结算，不把提现乱掺进来。钱和单要是对不上，这里至少先给你个像样的落脚点。</p>
        <div id="selectedOrderFinanceStatus" class="status-line">选中订单后会自动展示支付 / 退款 / 结算摘要。</div>
        <div id="selectedOrderFinanceSummary" class="meta-grid">
          <div class="meta-card"><strong>支付单</strong><div class="empty">暂无订单</div></div>
          <div class="meta-card"><strong>退款单</strong><div class="empty">暂无订单</div></div>
          <div class="meta-card"><strong>结算</strong><div class="empty">暂无订单</div></div>
        </div>
        <div id="selectedOrderFinanceRecords" class="event-list">
          <div class="empty">选中订单后会展示关联支付、退款和结算。</div>
        </div>
      </section>

      <section class="card">
        <h2>筛选报表与导出</h2>
        <p class="muted">报表和 CSV 都吃左侧同一套筛选条件，别一边看 waiting，一边把全量订单导出去装统计专家。当前先给状态、支付、定价分布和 Top 货主，深度经营报表后面再说。</p>
        <div class="pagination-toolbar">
          <input id="orderReportTopShippersLimitInput" type="number" min="1" max="20" value="5" aria-label="Top 货主数量" title="topShippersLimit" />
          <button id="loadOrderReportButton" type="button">刷新筛选报表</button>
        </div>
        <div class="pager-toolbar">
          <button id="exportOrderCsvButton" type="button" class="secondary-button">导出当前筛选 CSV</button>
        </div>
        <div id="orderReportStatus" class="status-line">当前还没拉订单报表，先别闭着眼睛编走势。</div>
        <div id="orderExportStatus" class="status-line"></div>
        <div id="orderReportTimestamp" class="status-line">报表时间：-</div>
        <div id="orderReportSummary" class="meta-grid">
          <div class="meta-card"><strong>筛选总订单</strong><div class="empty">暂无报表</div></div>
          <div class="meta-card"><strong>执行中</strong><div class="empty">暂无报表</div></div>
          <div class="meta-card"><strong>已完成</strong><div class="empty">暂无报表</div></div>
          <div class="meta-card"><strong>异常命中</strong><div class="empty">暂无报表</div></div>
        </div>
        <div class="report-grid">
          <div id="orderStatusReport" class="meta-card"></div>
          <div id="orderPaymentStatusReport" class="meta-card"></div>
          <div id="orderPricingModeReport" class="meta-card"></div>
          <div id="orderPaymentMethodReport" class="meta-card"></div>
          <div id="orderTopShippersReport" class="meta-card report-span"></div>
        </div>
      </section>

      <section class="card">
        <h2>路线 / 金额 / 附件摘要</h2>
        <div id="selectedOrderMeta" class="meta-grid">
          <div class="meta-card"><strong>路线</strong><div class="empty">暂无订单</div></div>
          <div class="meta-card"><strong>支付</strong><div class="empty">暂无订单</div></div>
          <div class="meta-card"><strong>货物</strong><div class="empty">暂无订单</div></div>
          <div class="meta-card"><strong>异常快照</strong><div class="empty">暂无订单</div></div>
        </div>
      </section>

      <section class="card">
        <h2>订单事件时间线</h2>
        <div id="selectedOrderEvents" class="event-list">
          <div class="empty">选中订单后会展示事件留痕。</div>
        </div>
      </section>
    </section>
  </main>

  <script>
    const apiBase = '/api';

    function createEmptyOrderFinancePage() {
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: 100,
      };
    }

    function createEmptyOrderFinanceState(orderId) {
      return {
        orderId: orderId || '',
        loading: false,
        error: '',
        payments: createEmptyOrderFinancePage(),
        refunds: createEmptyOrderFinancePage(),
        settlements: createEmptyOrderFinancePage(),
      };
    }

    const state = {
      list: null,
      report: null,
      selectedOrder: null,
      selectedOrderId: '',
      orderFinance: createEmptyOrderFinanceState(),
    };
    const selectedWaitingOrderIds = new Set();
    let batchCancelPending = false;
    let latestReportRequestId = 0;
    let latestOrderFinanceRequestId = 0;
    ${renderAdminSessionScript({
      currentRoute: '/api/admin/order-management-console',
    })}

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, function(character) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[character];
      });
    }

    function setNotice(message) {
      document.getElementById('orderManagementNotice').textContent = message || '';
    }

    function formatCount(value) {
      return Number(value || 0).toLocaleString('zh-CN');
    }

    function formatTime(value) {
      return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-';
    }

    function formatOrderStatus(status) {
      if (status === 'waiting') return '待接单';
      if (status === 'loading') return '装货中';
      if (status === 'transporting') return '运输中';
      if (status === 'confirming') return '待确认';
      if (status === 'completed') return '已完成';
      if (status === 'cancelled') return '已取消';
      return status || '未知状态';
    }

    function formatPaymentStatus(status) {
      if (status === 'not_required') return '无需支付';
      if (status === 'pending') return '待支付';
      if (status === 'escrowed') return '已担保';
      if (status === 'settled') return '已结算';
      if (status === 'failed') return '支付失败';
      if (status === 'cancelled') return '已取消';
      if (status === 'refund_pending') return '退款处理中';
      if (status === 'refunded') return '已退款';
      if (status === 'refund_failed') return '退款失败';
      if (status === 'legacy_unverified') return '历史待核验';
      return status || '未知资金状态';
    }

    function formatPricingMode(mode) {
      if (mode === 'fixed') return '一口价';
      if (mode === 'negotiable') return '议价';
      return mode || '未知定价';
    }

    function formatPaymentMethod(method) {
      if (method === 'cod') return '货到付款';
      if (method === 'online') return '在线支付';
      return method || '未知支付方式';
    }

    function formatRefundStatus(status) {
      if (status === 'pending') return '待退款';
      if (status === 'processing') return '退款处理中';
      if (status === 'succeeded') return '退款成功';
      if (status === 'failed') return '退款失败';
      return status || '未知退款状态';
    }

    function formatExceptionCaseStatus(status) {
      if (status === 'pending') return '待受理';
      if (status === 'processing') return '处理中';
      if (status === 'resolved') return '已解决';
      if (status === 'closed') return '已关闭';
      return status || '未知工单状态';
    }

    function formatCompensationStatus(status) {
      if (status === 'not_required') return '无需赔付';
      if (status === 'pending') return '待赔付跟进';
      if (status === 'offline_completed') return '线下已赔付';
      return '未记录赔付决议';
    }

    function formatCompensationTargetRole(role) {
      if (role === 'shipper') return '货主';
      if (role === 'driver') return '司机';
      return '-';
    }

    function formatCompensationSummary(latestExceptionCase) {
      if (!latestExceptionCase || !latestExceptionCase.compensationStatus) {
        return '赔付决议：未记录';
      }
      if (latestExceptionCase.compensationStatus === 'not_required') {
        return '赔付决议：无需赔付';
      }
      return '赔付决议：' +
        formatCompensationStatus(latestExceptionCase.compensationStatus) +
        ' · 对象：' +
        formatCompensationTargetRole(latestExceptionCase.compensationTargetRole) +
        ' · 金额：' +
        formatPrice(latestExceptionCase.compensationAmountCents);
    }

    function authHeaders() {
      const token = document.getElementById('adminToken').value.trim();
      if (!token) {
        throw new Error('请先填写 admin access token');
      }
      persistAdminAccessToken();
      return {
        Authorization: 'Bearer ' + token,
      };
    }

    function readOrderReportTopShippersLimit() {
      const input = document.getElementById('orderReportTopShippersLimitInput');
      const value = Math.max(1, Number.parseInt(input.value, 10) || 5);
      input.value = String(Math.min(20, value));
      return Number.parseInt(input.value, 10);
    }

    function readOrderListPaging(pageOverride) {
      const pageInput = document.getElementById('orderListPageInput');
      const pageSizeInput = document.getElementById('orderListPageSizeInput');
      const page = Math.max(1, Number.parseInt(pageOverride ?? pageInput.value, 10) || 1);
      const pageSize = Math.max(1, Number.parseInt(pageSizeInput.value, 10) || 20);
      pageInput.value = String(page);
      pageSizeInput.value = String(pageSize);
      return { page, pageSize };
    }

    function readOrderManagementRouteState() {
      const query = new URLSearchParams(
        globalThis.location && typeof globalThis.location.search === 'string'
          ? location.search
          : '',
      );
      return {
        orderId: query.get('orderId') || '',
        keyword: query.get('keyword') || '',
        status: query.get('status') || '',
        statuses: query.get('statuses') || '',
        createdFromIso: query.get('createdFromIso') || '',
        createdToIso: query.get('createdToIso') || '',
        page: query.get('page') || '',
        pageSize: query.get('pageSize') || '',
      };
    }

    function applyOrderManagementRouteState() {
      const routeState = readOrderManagementRouteState();
      const keyword =
        routeState.keyword || routeState.orderId;

      document.getElementById('orderListKeywordInput').value = keyword;
      document.getElementById('orderListStatusInput').value = routeState.status;
      document.getElementById('orderListStatusesInput').value = routeState.statuses;
      document.getElementById('orderListCreatedFromInput').value =
        routeState.createdFromIso;
      document.getElementById('orderListCreatedToInput').value =
        routeState.createdToIso;

      if (routeState.page) {
        document.getElementById('orderListPageInput').value = String(
          Math.max(1, Number.parseInt(routeState.page, 10) || 1),
        );
      }
      if (routeState.pageSize) {
        document.getElementById('orderListPageSizeInput').value = String(
          Math.max(1, Number.parseInt(routeState.pageSize, 10) || 20),
        );
      }

      state.selectedOrderId = routeState.orderId.trim();
      return routeState;
    }

    function syncOrderManagementRouteState(pageOverride) {
      if (!globalThis.history || !globalThis.location) {
        return;
      }

      try {
        const query = buildOrderFilterQuery();
        const paging = readOrderListPaging(pageOverride);
        if (paging.page > 1) {
          query.set('page', String(paging.page));
        }
        if (paging.pageSize !== 20) {
          query.set('pageSize', String(paging.pageSize));
        }
        if (state.selectedOrderId) {
          query.set('orderId', state.selectedOrderId);
        }
        const nextQuery = query.toString();
        const nextPath =
          globalThis.location.pathname +
          (nextQuery ? '?' + nextQuery : '');
        globalThis.history.replaceState(null, '', nextPath);
      } catch {
        // ignore invalid in-progress filters and keep the previous route state
      }
    }

    function buildOrderFilterQuery() {
      const keyword = document.getElementById('orderListKeywordInput').value.trim();
      const status = document.getElementById('orderListStatusInput').value;
      const statuses = document.getElementById('orderListStatusesInput').value.trim();
      const createdFromIso = document.getElementById('orderListCreatedFromInput').value.trim();
      const createdToIso = document.getElementById('orderListCreatedToInput').value.trim();

      if (status && statuses) {
        throw new Error('status 和 statuses 只能二选一');
      }

      const query = new URLSearchParams();
      if (keyword) query.set('keyword', keyword);
      if (status) query.set('status', status);
      if (statuses) query.set('statuses', statuses);
      if (createdFromIso) query.set('createdFromIso', createdFromIso);
      if (createdToIso) query.set('createdToIso', createdToIso);

      return query;
    }

    function buildOrderListQuery(pageOverride) {
      const query = buildOrderFilterQuery();
      const { page, pageSize } = readOrderListPaging(pageOverride);

      query.set('page', String(page));
      query.set('pageSize', String(pageSize));

      return query;
    }

    function buildOrderReportQuery() {
      const query = buildOrderFilterQuery();

      query.set('topShippersLimit', String(readOrderReportTopShippersLimit()));

      return query;
    }

    function buildOrderExportQuery() {
      return buildOrderFilterQuery();
    }

    function getCurrentOrderItems() {
      return state.list && Array.isArray(state.list.items) ? state.list.items : [];
    }

    function getCurrentWaitingOrders() {
      return getCurrentOrderItems().filter(function(item) {
        return item && item.status === 'waiting';
      });
    }

    function syncSelectedWaitingOrdersToCurrentList() {
      const currentWaitingIds = new Set(
        getCurrentWaitingOrders().map(function(item) {
          return String(item.id || '');
        }),
      );

      Array.from(selectedWaitingOrderIds).forEach(function(orderId) {
        if (!currentWaitingIds.has(orderId)) {
          selectedWaitingOrderIds.delete(orderId);
        }
      });
    }

    function syncOrderSelectionCheckboxes() {
      document.querySelectorAll('[data-order-select-id]').forEach(function(input) {
        const orderId = input.getAttribute('data-order-select-id');
        input.checked = Boolean(orderId && selectedWaitingOrderIds.has(orderId));
      });
    }

    function updateOrderBatchSelectionUi() {
      const currentWaitingIds = getCurrentWaitingOrders().map(function(item) {
        return String(item.id || '');
      });
      const currentSelectedCount = currentWaitingIds.filter(function(orderId) {
        return selectedWaitingOrderIds.has(orderId);
      }).length;
      const selectAllInput = document.getElementById('orderSelectAllWaitingInput');

      if (selectAllInput) {
        selectAllInput.disabled = batchCancelPending || currentWaitingIds.length === 0;
        selectAllInput.checked =
          currentWaitingIds.length > 0 &&
          currentSelectedCount === currentWaitingIds.length;
        selectAllInput.indeterminate =
          currentSelectedCount > 0 &&
          currentSelectedCount < currentWaitingIds.length;
      }

      document.getElementById('orderBatchSelectionStatus').textContent =
        currentWaitingIds.length === 0
          ? '当前筛选结果里没有可批量取消的 waiting 订单。'
          : currentSelectedCount === 0
            ? '当前筛选结果里有 ' + currentWaitingIds.length + ' 个 waiting 订单，先勾上要取消的单。'
            : '已勾选 ' + currentSelectedCount + ' 个 waiting 订单，会按当前列表顺序整批提交，后端整批校验并原子取消。';

      ['clearOrderSelectionButton', 'runBatchCancelWaitingOrdersButton'].forEach(function(id) {
        const node = document.getElementById(id);
        if (node) {
          node.disabled = batchCancelPending || currentSelectedCount === 0;
        }
      });
    }

    function toggleOrderSelection(orderId, checked) {
      if (batchCancelPending) {
        return;
      }

      if (checked) {
        selectedWaitingOrderIds.add(orderId);
      } else {
        selectedWaitingOrderIds.delete(orderId);
      }

      syncOrderSelectionCheckboxes();
      updateOrderBatchSelectionUi();
    }

    function toggleSelectAllWaitingOrders(checked) {
      if (batchCancelPending) {
        return;
      }

      getCurrentWaitingOrders().forEach(function(item) {
        if (checked) {
          selectedWaitingOrderIds.add(String(item.id || ''));
        } else {
          selectedWaitingOrderIds.delete(String(item.id || ''));
        }
      });

      syncOrderSelectionCheckboxes();
      updateOrderBatchSelectionUi();
    }

    function clearSelectedWaitingOrders() {
      if (batchCancelPending) {
        return;
      }

      selectedWaitingOrderIds.clear();
      syncOrderSelectionCheckboxes();
      updateOrderBatchSelectionUi();
      document.getElementById('orderBatchActionStatus').textContent =
        '已清空 waiting 订单勾选。';
    }

    function readBatchCancelInput() {
      const reasonText = document.getElementById('orderBatchCancelReasonInput').value.trim();
      const description = document.getElementById('orderBatchCancelDescriptionInput').value.trim();

      return description
        ? { reasonText, description }
        : { reasonText };
    }

    function createBatchCancelIdempotencyKey() {
      function randomHex(length) {
        let output = '';

        while (output.length < length) {
          output += Math.floor(Math.random() * 0x100000000)
            .toString(16)
            .padStart(8, '0');
        }

        return output.slice(0, length);
      }

      return [
        randomHex(8),
        randomHex(4),
        '4' + randomHex(3),
        ['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)] + randomHex(3),
        randomHex(12),
      ].join('-');
    }

    function setReportControlsDisabled(disabled) {
      document.getElementById('orderReportTopShippersLimitInput').disabled = disabled;
      document.getElementById('loadOrderReportButton').disabled = disabled;
      document.getElementById('exportOrderCsvButton').disabled = disabled;
    }

    function extractDownloadFilename(contentDisposition) {
      const matched = /filename="?([^";]+)"?/i.exec(contentDisposition || '');
      return matched ? matched[1] : 'admin-orders.csv';
    }

    async function loadOrderList(pageOverride) {
      try {
        setNotice('');
        const query = buildOrderListQuery(pageOverride);
        const response = await fetch(apiBase + '/admin/orders?' + query.toString(), {
          headers: authHeaders(),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.code !== 'OK') {
          throw new Error(body.message || body.code || '请求失败');
        }
        state.list = body.data;
        syncOrderManagementRouteState(pageOverride);
        syncSelectedWaitingOrdersToCurrentList();
        renderOrderList(body.data);
        renderOrderListPagination(body.data);
        updateOrderBatchSelectionUi();
      } catch (error) {
        state.list = null;
        selectedWaitingOrderIds.clear();
        document.getElementById('orderListResults').innerHTML =
          '<div class="empty">列表拉取失败，先修筛选条件或 token。</div>';
        document.getElementById('orderListPaginationStatus').textContent = '列表拉取失败';
        updateOrderBatchSelectionUi();
        setNotice(error.message);
      }
    }

    async function loadOrderReport() {
      const requestId = ++latestReportRequestId;
      document.getElementById('orderReportStatus').textContent = '正在拉订单筛选报表...';
      document.getElementById('orderExportStatus').textContent = '';
      setReportControlsDisabled(true);

      try {
        setNotice('');
        const query = buildOrderReportQuery();
        const response = await fetch(apiBase + '/admin/orders/report?' + query.toString(), {
          headers: authHeaders(),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.code !== 'OK') {
          throw new Error(body.message || body.code || '请求失败');
        }
        if (requestId !== latestReportRequestId) return;

        state.report = body.data;
        renderOrderReport(body.data);
        document.getElementById('orderReportStatus').textContent =
          '报表已刷新：筛选订单 ' +
          formatCount(body.data && body.data.summary && body.data.summary.totalOrderCount) +
          ' 条，Top 货主展示 ' +
          formatCount(Array.isArray(body.data && body.data.topShippers) ? body.data.topShippers.length : 0) +
          ' 个。';
      } catch (error) {
        if (requestId !== latestReportRequestId) return;
        state.report = null;
        document.getElementById('orderReportStatus').textContent =
          '订单报表拉取失败，先别拿空白卡片冒充洞察。';
        renderOrderReportError(error.message);
        setNotice(error.message);
      } finally {
        if (requestId !== latestReportRequestId) return;
        setReportControlsDisabled(false);
      }
    }

    async function exportAdminOrdersCsv() {
      document.getElementById('orderExportStatus').textContent = '';
      setReportControlsDisabled(true);

      try {
        setNotice('');
        const query = buildOrderExportQuery();
        const response = await fetch(apiBase + '/admin/orders/export?' + query.toString(), {
          headers: authHeaders(),
        });
        const responseText = await response.text();
        if (!response.ok) {
          let errorMessage = '订单 CSV 导出失败';
          if (responseText) {
            try {
              const payload = JSON.parse(responseText);
              errorMessage = payload.message || errorMessage;
            } catch {
              errorMessage = responseText;
            }
          }
          throw new Error(errorMessage);
        }

        const downloadUrl = URL.createObjectURL(
          new Blob([responseText], {
            type: response.headers.get('content-type') || 'text/csv; charset=utf-8',
          }),
        );
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = extractDownloadFilename(
          response.headers.get('content-disposition'),
        );
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function() {
          URL.revokeObjectURL(downloadUrl);
        }, 0);

        document.getElementById('orderExportStatus').textContent =
          'CSV 导出已触发，按当前筛选条件输出订单 ' +
          formatCount(
            state.report && state.report.summary
              ? state.report.summary.totalOrderCount
              : state.list && state.list.total,
          ) +
          ' 条。';
      } catch (error) {
        document.getElementById('orderExportStatus').textContent =
          'CSV 导出失败：' + error.message;
        setNotice(error.message);
      } finally {
        setReportControlsDisabled(false);
      }
    }

    async function loadOrderDetail(orderIdOverride) {
      try {
        setNotice('');
        const orderId = String(orderIdOverride || state.selectedOrderId || '').trim();
        if (!orderId) {
          throw new Error('请先从列表选择订单');
        }
        const response = await fetch(apiBase + '/admin/orders/' + encodeURIComponent(orderId), {
          headers: authHeaders(),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.code !== 'OK') {
          throw new Error(body.message || body.code || '请求失败');
        }
        state.selectedOrderId = orderId;
        state.selectedOrder = body.data;
        syncOrderManagementRouteState();
        renderSelectedOrder();
        loadSelectedOrderFinance(orderId);
      } catch (error) {
        setNotice(error.message);
      }
    }

    async function batchCancelAdminOrders(idempotencyKey, payload) {
      const response = await fetch(
        apiBase + '/admin/orders/batch-cancel',
        {
          method: 'POST',
          headers: {
            ...authHeaders(),
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(payload),
        },
      );
      const body = await response.json().catch(() => ({}));

      if (!response.ok || body.code !== 'OK') {
        throw new Error(body.message || body.code || '请求失败');
      }

      return body.data;
    }

    async function runBatchCancelWaitingOrders() {
      if (batchCancelPending) {
        return;
      }

      const currentWaitingOrders = getCurrentWaitingOrders();
      const selectedOrders = currentWaitingOrders.filter(function(item) {
        return selectedWaitingOrderIds.has(String(item.id || ''));
      });
      const selectedOrderIds = selectedOrders.map(function(item) {
        return String(item.id || '');
      });

      const batchItems = selectedOrders.map(function(item) {
        return {
          orderId: String(item.id || ''),
          baseUpdatedAtIso: String(item.updatedAtIso || ''),
        };
      }).filter(function(item) {
        return item.orderId && item.baseUpdatedAtIso;
      });

      if (batchItems.length !== selectedOrders.length) {
        document.getElementById('orderBatchActionStatus').textContent =
          '当前勾选里有订单缺少版本信息，不能走原子批量取消。';
        return;
      }

      const currentPage =
        Number.parseInt(document.getElementById('orderListPageInput').value, 10) || 1;

      if (!selectedOrderIds.length) {
        document.getElementById('orderBatchActionStatus').textContent =
          '先勾选 waiting 订单再批量取消，别对着空列表瞎抡按钮。';
        return;
      }

      const payload = readBatchCancelInput();

      if (!payload.reasonText) {
        document.getElementById('orderBatchActionStatus').textContent =
          '批量取消必须填写原因，不然审计留痕就剩一团浆糊。';
        return;
      }

      batchCancelPending = true;
      updateOrderBatchSelectionUi();

      try {
        setNotice('');
        document.getElementById('orderBatchActionStatus').textContent =
          '批量取消执行中，共 ' +
          selectedOrderIds.length +
          ' 单，正在请求后端整批校验并原子写入。';

        const result = await batchCancelAdminOrders(
          createBatchCancelIdempotencyKey(),
          {
            ...payload,
            items: batchItems,
          },
        );
        const cancelledOrderById = new Map(
          (Array.isArray(result && result.items) ? result.items : []).map(function(item) {
            return [String(item.id || ''), item];
          }),
        );

        selectedOrderIds.forEach(function(orderId) {
          selectedWaitingOrderIds.delete(orderId);
        });
        if (state.list && Array.isArray(state.list.items)) {
          state.list.items = state.list.items.map(function(item) {
            return cancelledOrderById.get(String(item.id || '')) || item;
          });
        }

        if (state.selectedOrderId) {
          const selectedOrder = cancelledOrderById.get(state.selectedOrderId);
          if (selectedOrder) {
            state.selectedOrder = selectedOrder;
            renderSelectedOrder();
            loadSelectedOrderFinance(selectedOrder.id);
          }
        }

        syncSelectedWaitingOrdersToCurrentList();
        await loadOrderList(currentPage);
        updateOrderBatchSelectionUi();
        document.getElementById('orderBatchActionStatus').textContent =
          '批量取消完成：成功 ' +
          formatCount(result && result.updatedCount) +
          ' 单，后端已整批校验并原子写入。';
      } catch (error) {
        document.getElementById('orderBatchActionStatus').textContent =
          '批量取消失败：' + error.message;
        setNotice(error.message);
      } finally {
        batchCancelPending = false;
        updateOrderBatchSelectionUi();
      }
    }

    function loadAdjacentOrderListPage(delta) {
      const currentPage = Number.parseInt(document.getElementById('orderListPageInput').value, 10) || 1;
      loadOrderList(Math.max(1, currentPage + delta));
    }

    function renderOrderList(result) {
      const items = Array.isArray(result.items) ? result.items : [];
      const target = document.getElementById('orderListResults');

      if (!items.length) {
        target.innerHTML = '<div class="empty">没有匹配的订单</div>';
        return;
      }

      target.innerHTML = items.map(function(item) {
        const activeClass = state.selectedOrderId === item.id ? ' warning' : '';
        const priceText =
          item.pricingMode === 'fixed'
            ? '一口价 ' + formatPrice(item.priceCents)
            : '议价单';
        const isWaiting = item.status === 'waiting';
        const selected = selectedWaitingOrderIds.has(String(item.id || ''));

        return '<article class="order-row-shell">' +
          '<div class="inline-actions">' +
            (isWaiting
              ? '<label class="checkbox-label"><input data-order-select-id="' + escapeHtml(item.id) + '" type="checkbox" ' + (selected ? 'checked ' : '') + '/>纳入批量取消</label>'
              : '<span class="pill warning">只支持取消 waiting 订单</span>') +
            '<span class="eyebrow">订单 ' + escapeHtml(item.status) + '</span>' +
          '</div>' +
          '<button class="order-row" type="button" data-order-id="' + escapeHtml(item.id) + '">' +
            '<h3>' + escapeHtml(item.orderNo) + '</h3>' +
            '<div class="muted">货主：<span class="mono">' + escapeHtml(item.shipperId) + '</span></div>' +
            '<div class="muted">' + escapeHtml(item.pickupAddress) + ' → ' + escapeHtml(item.deliveryAddress) + '</div>' +
            '<div class="pill-row">' +
              '<span class="pill' + activeClass + '">' + escapeHtml(priceText) + '</span>' +
              '<span class="pill">附件 ' + escapeHtml(item.cargoPhotoCount || 0) + ' 张</span>' +
              '<span class="pill">事件 ' + escapeHtml(item.events.length) + ' 条</span>' +
            '</div>' +
            '<div class="muted">创建：' + escapeHtml(item.createdAtIso) + '</div>' +
          '</button>' +
        '</article>';
      }).join('');

      target.querySelectorAll('[data-order-id]').forEach(function(button) {
        button.addEventListener('click', function() {
          const orderId = button.getAttribute('data-order-id') || '';
          state.selectedOrderId = orderId;
          loadOrderDetail(orderId);
        });
      });
      target.querySelectorAll('[data-order-select-id]').forEach(function(input) {
        input.addEventListener('change', function(event) {
          toggleOrderSelection(
            input.getAttribute('data-order-select-id') || '',
            event.target.checked,
          );
        });
      });
    }

    function renderOrderListPagination(result) {
      const page = Number(result.page || 1);
      const pageSize = Number(result.pageSize || 20);
      const total = Number(result.total || 0);
      const loaded = Array.isArray(result.items) ? result.items.length : 0;
      document.getElementById('orderListPageInput').value = String(page);
      document.getElementById('orderListPageSizeInput').value = String(pageSize);
      document.getElementById('orderListPaginationStatus').textContent =
        '第 ' + page + ' 页，每页 ' + pageSize + ' 条，本页 ' + loaded + ' 条，共 ' + total + ' 条';
      document.getElementById('orderListPreviousPageButton').disabled = page <= 1;
      document.getElementById('orderListNextPageButton').disabled = page * pageSize >= total;
    }

    function renderOrderReportSummary(summary) {
      document.getElementById('orderReportSummary').innerHTML =
        '<div class="meta-card"><strong>筛选总订单</strong><div class="muted">' +
          escapeHtml(formatCount(summary && summary.totalOrderCount)) +
        '</div></div>' +
        '<div class="meta-card"><strong>执行中</strong><div class="muted">' +
          escapeHtml(formatCount(summary && summary.activeOrderCount)) +
        '</div></div>' +
        '<div class="meta-card"><strong>已完成</strong><div class="muted">' +
          escapeHtml(formatCount(summary && summary.completedOrderCount)) +
        '</div></div>' +
        '<div class="meta-card"><strong>异常命中</strong><div class="muted">' +
          escapeHtml(formatCount(summary && summary.exceptionOrderCount)) +
        '</div></div>';
    }

    function renderOrderBreakdownCard(title, items, formatter, emptyMessage) {
      const rows = Array.isArray(items) && items.length
        ? items.map(function(item) {
            return '<div class="metric-row">' +
              '<strong>' + escapeHtml(formatter(item)) + '</strong>' +
              '<span>订单 ' + escapeHtml(formatCount(item.orderCount)) +
                ' / 金额 ' + escapeHtml(formatPrice(item.payablePriceTotalCents)) +
              '</span>' +
            '</div>';
          }).join('')
        : '<div class="empty">' + escapeHtml(emptyMessage) + '</div>';

      return '<strong>' + escapeHtml(title) + '</strong>' +
        '<div class="metric-list">' + rows + '</div>';
    }

    function renderTopShippersCard(items) {
      if (!Array.isArray(items) || !items.length) {
        return '<strong>Top 货主</strong><div class="empty">当前筛选下没有可展示的货主汇总。</div>';
      }

      return '<strong>Top 货主</strong>' +
        '<div class="shipper-report-list">' +
          items.map(function(item) {
            return '<div class="shipper-report-row">' +
              '<strong><span class="mono">' + escapeHtml(item.shipperId) + '</span></strong>' +
              '<span>订单 ' + escapeHtml(formatCount(item.orderCount)) +
                ' / 待接 ' + escapeHtml(formatCount(item.waitingOrderCount)) +
                ' / 执行中 ' + escapeHtml(formatCount(item.activeOrderCount)) +
                ' / 完成 ' + escapeHtml(formatCount(item.completedOrderCount)) +
                ' / 取消 ' + escapeHtml(formatCount(item.cancelledOrderCount)) +
                ' / 金额 ' + escapeHtml(formatPrice(item.payablePriceTotalCents)) +
                ' / 最近下单 ' + escapeHtml(formatTime(item.latestOrderCreatedAtIso)) +
              '</span>' +
            '</div>';
          }).join('') +
        '</div>';
    }

    function renderOrderReport(report) {
      state.report = report;
      document.getElementById('orderReportTimestamp').textContent =
        '报表时间：' + formatTime(report && report.generatedAtIso);
      renderOrderReportSummary(report && report.summary ? report.summary : {});
      document.getElementById('orderStatusReport').innerHTML =
        renderOrderBreakdownCard(
          '状态分布',
          report && report.statusBreakdown,
          function(item) { return formatOrderStatus(item.status); },
          '当前筛选下没有状态分布数据。',
        );
      document.getElementById('orderPaymentStatusReport').innerHTML =
        renderOrderBreakdownCard(
          '资金状态分布',
          report && report.paymentStatusBreakdown,
          function(item) { return formatPaymentStatus(item.paymentStatus); },
          '当前筛选下没有资金状态数据。',
        );
      document.getElementById('orderPricingModeReport').innerHTML =
        renderOrderBreakdownCard(
          '定价方式分布',
          report && report.pricingModeBreakdown,
          function(item) { return formatPricingMode(item.pricingMode); },
          '当前筛选下没有定价方式数据。',
        );
      document.getElementById('orderPaymentMethodReport').innerHTML =
        renderOrderBreakdownCard(
          '支付方式分布',
          report && report.paymentMethodBreakdown,
          function(item) { return formatPaymentMethod(item.paymentMethod); },
          '当前筛选下没有支付方式数据。',
        );
      document.getElementById('orderTopShippersReport').innerHTML =
        renderTopShippersCard(report && report.topShippers);
    }

    function resetOrderReport(message) {
      state.report = null;
      document.getElementById('orderReportTimestamp').textContent = '报表时间：-';
      document.getElementById('orderReportSummary').innerHTML =
        '<div class="meta-card"><strong>筛选总订单</strong><div class="empty">' + escapeHtml(message) + '</div></div>' +
        '<div class="meta-card"><strong>执行中</strong><div class="empty">' + escapeHtml(message) + '</div></div>' +
        '<div class="meta-card"><strong>已完成</strong><div class="empty">' + escapeHtml(message) + '</div></div>' +
        '<div class="meta-card"><strong>异常命中</strong><div class="empty">' + escapeHtml(message) + '</div></div>';
      document.getElementById('orderStatusReport').innerHTML =
        renderOrderBreakdownCard('状态分布', [], function() { return ''; }, message);
      document.getElementById('orderPaymentStatusReport').innerHTML =
        renderOrderBreakdownCard('资金状态分布', [], function() { return ''; }, message);
      document.getElementById('orderPricingModeReport').innerHTML =
        renderOrderBreakdownCard('定价方式分布', [], function() { return ''; }, message);
      document.getElementById('orderPaymentMethodReport').innerHTML =
        renderOrderBreakdownCard('支付方式分布', [], function() { return ''; }, message);
      document.getElementById('orderTopShippersReport').innerHTML =
        '<strong>Top 货主</strong><div class="empty">' + escapeHtml(message) + '</div>';
    }

    function renderOrderReportError(message) {
      resetOrderReport(message);
    }

    function buildFinanceConsoleHref(tab, orderId) {
      const query = new URLSearchParams();
      query.set('tab', tab);
      query.set('orderId', orderId);
      return '/api/admin/finance-console?' + query.toString();
    }

    function buildOrderExceptionCaseConsoleHref(caseNo) {
      const query = new URLSearchParams();
      query.set('keyword', caseNo);
      return '/api/admin/order-exception-case-console?' + query.toString();
    }

    function openOrderFinanceConsole(tab, orderId) {
      const nextTab = String(tab || 'payments').trim() || 'payments';
      const nextOrderId = String(orderId || '').trim();
      if (!nextOrderId) {
        setNotice('先选中订单再看资金记录，别对着空气跳台子。');
        return;
      }

      const href = buildFinanceConsoleHref(nextTab, nextOrderId);
      if (globalThis.location && typeof globalThis.location.assign === 'function') {
        globalThis.location.assign(href);
        return;
      }
      if (globalThis.location) {
        globalThis.location.href = href;
      }
    }

    function openSelectedOrderFinanceConsole(tab = 'payments') {
      const orderId = String(
        state.selectedOrder && state.selectedOrder.id
          ? state.selectedOrder.id
          : state.selectedOrderId || '',
      ).trim();

      openOrderFinanceConsole(tab, orderId);
    }

    function openOrderExceptionCaseConsole(caseNo) {
      const nextCaseNo = String(caseNo || '').trim();
      if (!nextCaseNo) {
        setNotice('当前订单还没有异常工单，别硬往客服台跳。');
        return;
      }

      const href = buildOrderExceptionCaseConsoleHref(nextCaseNo);
      if (globalThis.location && typeof globalThis.location.assign === 'function') {
        globalThis.location.assign(href);
        return;
      }
      if (globalThis.location) {
        globalThis.location.href = href;
      }
    }

    function openSelectedOrderExceptionCaseConsole() {
      const latestExceptionCase =
        state.selectedOrder && state.selectedOrder.latestExceptionCase
          ? state.selectedOrder.latestExceptionCase
          : null;
      const caseNo = latestExceptionCase ? latestExceptionCase.caseNo : '';

      openOrderExceptionCaseConsole(caseNo);
    }

    function buildOrderFinanceQuery(orderId) {
      const query = new URLSearchParams();
      query.set('page', '1');
      query.set('pageSize', '100');
      query.set('orderId', orderId);
      return query;
    }

    function normalizeOrderFinancePage(data) {
      return {
        items:
          data && Array.isArray(data.items) ? data.items : [],
        total:
          data && Number.isFinite(Number(data.total))
            ? Number(data.total)
            : 0,
        page:
          data && Number.isFinite(Number(data.page))
            ? Number(data.page)
            : 1,
        pageSize:
          data && Number.isFinite(Number(data.pageSize))
            ? Number(data.pageSize)
            : 100,
      };
    }

    async function fetchOrderFinancePage(path, label, orderId) {
      const response = await fetch(
        apiBase + path + buildOrderFinanceQuery(orderId).toString(),
        {
          headers: authHeaders(),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.code !== 'OK') {
        throw new Error(
          label + '加载失败：' + (body.message || body.code || '请求失败'),
        );
      }
      return normalizeOrderFinancePage(body.data);
    }

    function sumOrderFinanceAmounts(items, key) {
      if (!Array.isArray(items) || !items.length) {
        return 0;
      }

      return items.reduce(function(total, item) {
        return total + Number(item && item[key] ? item[key] : 0);
      }, 0);
    }

    function summarizeFinanceStatuses(items, formatter) {
      if (!Array.isArray(items) || !items.length) {
        return '暂无记录';
      }

      const counts = {};
      items.forEach(function(item) {
        const label = formatter(item && item.status);
        counts[label] = (counts[label] || 0) + 1;
      });

      return Object.keys(counts).map(function(label) {
        return label + ' ' + formatCount(counts[label]) + ' 笔';
      }).join(' / ');
    }

    function findLatestOrderFinanceTime(items, keys) {
      if (!Array.isArray(items) || !items.length) {
        return '';
      }

      let latest = '';
      items.forEach(function(item) {
        keys.forEach(function(key) {
          const value = item && item[key] ? String(item[key]) : '';
          if (value && (!latest || value > latest)) {
            latest = value;
          }
        });
      });

      return latest;
    }

    function buildOrderFinanceActionButton(tab, orderId, label) {
      return '<button type="button" class="secondary-button" data-finance-tab="' +
        escapeHtml(tab) +
        '" data-order-id="' +
        escapeHtml(orderId) +
        '" onclick="openOrderFinanceConsole(this.dataset.financeTab, this.dataset.orderId)">' +
        escapeHtml(label) +
      '</button>';
    }

    function renderSelectedOrderFinancePlaceholders(message) {
      return '<div class="meta-card"><strong>支付单</strong><div class="empty">' +
        escapeHtml(message) +
      '</div></div>' +
      '<div class="meta-card"><strong>退款单</strong><div class="empty">' +
        escapeHtml(message) +
      '</div></div>' +
      '<div class="meta-card"><strong>结算</strong><div class="empty">' +
        escapeHtml(message) +
      '</div></div>';
    }

    function buildOrderFinanceSummaryCards(orderId, finance) {
      return '<div class="meta-card"><strong>支付单</strong>' +
        '<div class="muted">数量：' + escapeHtml(formatCount(finance.payments.total)) + '</div>' +
        '<div class="muted">状态：' + escapeHtml(summarizeFinanceStatuses(finance.payments.items, formatPaymentStatus)) + '</div>' +
        '<div class="muted">金额：' + escapeHtml(formatPrice(sumOrderFinanceAmounts(finance.payments.items, 'amountCents'))) + '</div>' +
        '<div class="muted">最近支付 / 结算：' + escapeHtml(formatTime(findLatestOrderFinanceTime(finance.payments.items, ['settledAtIso', 'paidAtIso', 'updatedAtIso', 'createdAtIso']))) + '</div>' +
        '<div class="summary-actions">' +
          buildOrderFinanceActionButton('payments', orderId, '去财务台看支付单') +
        '</div>' +
      '</div>' +
      '<div class="meta-card"><strong>退款单</strong>' +
        '<div class="muted">数量：' + escapeHtml(formatCount(finance.refunds.total)) + '</div>' +
        '<div class="muted">状态：' + escapeHtml(summarizeFinanceStatuses(finance.refunds.items, formatRefundStatus)) + '</div>' +
        '<div class="muted">金额：' + escapeHtml(formatPrice(sumOrderFinanceAmounts(finance.refunds.items, 'amountCents'))) + '</div>' +
        '<div class="muted">最近处理：' + escapeHtml(formatTime(findLatestOrderFinanceTime(finance.refunds.items, ['succeededAtIso', 'failedAtIso', 'processingStartedAtIso', 'updatedAtIso', 'createdAtIso']))) + '</div>' +
        '<div class="summary-actions">' +
          buildOrderFinanceActionButton('refunds', orderId, '去财务台看退款单') +
        '</div>' +
      '</div>' +
      '<div class="meta-card"><strong>结算</strong>' +
        '<div class="muted">数量：' + escapeHtml(formatCount(finance.settlements.total)) + '</div>' +
        '<div class="muted">结算总额：' + escapeHtml(formatPrice(sumOrderFinanceAmounts(finance.settlements.items, 'grossAmountCents'))) + '</div>' +
        '<div class="muted">平台费 / 司机净收入：' + escapeHtml(formatPrice(sumOrderFinanceAmounts(finance.settlements.items, 'platformFeeCents'))) + ' / ' + escapeHtml(formatPrice(sumOrderFinanceAmounts(finance.settlements.items, 'driverNetAmountCents'))) + '</div>' +
        '<div class="muted">最近结算：' + escapeHtml(formatTime(findLatestOrderFinanceTime(finance.settlements.items, ['settledAtIso', 'createdAtIso']))) + '</div>' +
        '<div class="summary-actions">' +
          buildOrderFinanceActionButton('settlements', orderId, '去财务台看结算') +
        '</div>' +
      '</div>';
    }

    function buildPaymentFinanceRecord(item) {
      return '<article class="event-card">' +
        '<div class="inline-actions"><strong>' + escapeHtml(item.paymentNo || item.id) + '</strong><span class="pill">' + escapeHtml(formatPaymentStatus(item.status)) + '</span></div>' +
        '<div class="muted">金额：' + escapeHtml(formatPrice(item.amountCents)) + ' · 渠道：' + escapeHtml(item.channel || '-') + '</div>' +
        '<div class="muted">创建：' + escapeHtml(formatTime(item.createdAtIso)) + ' · 支付：' + escapeHtml(formatTime(item.paidAtIso)) + '</div>' +
        '<div class="muted">结算：' + escapeHtml(formatTime(item.settledAtIso)) + ' · 更新时间：' + escapeHtml(formatTime(item.updatedAtIso)) + '</div>' +
        (item.providerTradeNo
          ? '<div class="muted">providerTradeNo：<span class="mono">' + escapeHtml(item.providerTradeNo) + '</span></div>'
          : '') +
        '<div class="summary-actions">' +
          buildOrderFinanceActionButton(
            'payments',
            item.orderId || state.selectedOrderId,
            '去财务台查看',
          ) +
        '</div>' +
      '</article>';
    }

    function buildRefundFinanceRecord(item) {
      return '<article class="event-card">' +
        '<div class="inline-actions"><strong>' + escapeHtml(item.refundNo || item.id) + '</strong><span class="pill">' + escapeHtml(formatRefundStatus(item.status)) + '</span></div>' +
        '<div class="muted">金额：' + escapeHtml(formatPrice(item.amountCents)) + ' · 原因：' + escapeHtml(item.reason || '-') + '</div>' +
        '<div class="muted">创建：' + escapeHtml(formatTime(item.createdAtIso)) + ' · 开始处理：' + escapeHtml(formatTime(item.processingStartedAtIso)) + '</div>' +
        '<div class="muted">成功：' + escapeHtml(formatTime(item.succeededAtIso)) + ' · 失败：' + escapeHtml(formatTime(item.failedAtIso)) + '</div>' +
        (item.outboxEvent
          ? '<div class="muted">outbox：' + escapeHtml(item.outboxEvent.status || '-') + ' / attemptCount ' + escapeHtml(item.outboxEvent.attemptCount || 0) + '</div>'
          : '') +
        '<div class="summary-actions">' +
          buildOrderFinanceActionButton(
            'refunds',
            item.orderId || state.selectedOrderId,
            '去财务台查看',
          ) +
        '</div>' +
      '</article>';
    }

    function buildSettlementFinanceRecord(item) {
      return '<article class="event-card">' +
        '<div class="inline-actions"><strong>结算 ' + escapeHtml(item.id) + '</strong><span class="pill">已结算</span></div>' +
        '<div class="muted">司机：<span class="mono">' + escapeHtml(item.driverId || '-') + '</span></div>' +
        '<div class="muted">毛额：' + escapeHtml(formatPrice(item.grossAmountCents)) + ' · 平台费：' + escapeHtml(formatPrice(item.platformFeeCents)) + '</div>' +
        '<div class="muted">司机净收入：' + escapeHtml(formatPrice(item.driverNetAmountCents)) + ' · 费率：' + escapeHtml((Number(item.platformFeeRateBps || 0) / 100).toFixed(2)) + '%</div>' +
        '<div class="muted">结算：' + escapeHtml(formatTime(item.settledAtIso)) + ' · 创建：' + escapeHtml(formatTime(item.createdAtIso)) + '</div>' +
        '<div class="muted">资金流水：<span class="mono">' + escapeHtml(item.financialTransactionId || '-') + '</span></div>' +
        '<div class="summary-actions">' +
          buildOrderFinanceActionButton(
            'settlements',
            item.orderId || state.selectedOrderId,
            '去财务台查看',
          ) +
        '</div>' +
      '</article>';
    }

    function buildOrderFinanceRecordSection(title, tab, orderId, page, recordBuilder, emptyMessage) {
      const items = Array.isArray(page && page.items) ? page.items : [];
      const total = Number(page && page.total ? page.total : 0);
      const loadedHint =
        total > items.length
          ? ' 当前先展示最近 ' + formatCount(items.length) + ' 条。'
          : total > 0
            ? ' 当前已展示全部记录。'
            : '';

      return '<section class="meta-card">' +
        '<strong>' + escapeHtml(title) + '</strong>' +
        '<div class="muted">命中 ' + escapeHtml(formatCount(total)) + ' 条。提现不会混进来。' + escapeHtml(loadedHint) + '</div>' +
        '<div class="summary-actions">' +
          buildOrderFinanceActionButton(tab, orderId, '去财务台看全部') +
        '</div>' +
        '<div class="event-list">' +
          (items.length
            ? items.map(function(item) {
                return recordBuilder(item);
              }).join('')
            : '<div class="empty">' + escapeHtml(emptyMessage) + '</div>') +
        '</div>' +
      '</section>';
    }

    function renderSelectedOrderFinance() {
      const order = state.selectedOrder;
      const finance = state.orderFinance;
      const targetStatus = document.getElementById('selectedOrderFinanceStatus');
      const targetSummary = document.getElementById('selectedOrderFinanceSummary');
      const targetRecords = document.getElementById('selectedOrderFinanceRecords');

      if (!order) {
        targetStatus.textContent = '选中订单后会自动展示支付 / 退款 / 结算摘要。';
        targetSummary.innerHTML = renderSelectedOrderFinancePlaceholders('暂无订单');
        targetRecords.innerHTML =
          '<div class="empty">选中订单后会展示关联支付、退款和结算。</div>';
        return;
      }

      const orderId = String(order.id || '').trim();
      if (!orderId || finance.orderId !== orderId) {
        targetStatus.textContent =
          '订单详情已切到当前单，按单资金视图正在准备。';
        targetSummary.innerHTML =
          renderSelectedOrderFinancePlaceholders('等待拉取当前订单资金记录');
        targetRecords.innerHTML =
          '<div class="empty">当前订单的支付、退款和结算会在详情加载后自动补上。</div>';
        return;
      }

      if (finance.loading) {
        targetStatus.textContent =
          '按当前 orderId 并行拉支付 / 退款 / 结算中，提现不会混进来。';
        targetSummary.innerHTML =
          renderSelectedOrderFinancePlaceholders('资金记录加载中');
        targetRecords.innerHTML =
          '<div class="empty">资金记录加载中，先别急着骂接口。</div>';
        return;
      }

      if (finance.error) {
        targetStatus.textContent = '按单资金视图加载失败：' + finance.error;
        targetSummary.innerHTML =
          renderSelectedOrderFinancePlaceholders(finance.error);
        targetRecords.innerHTML =
          '<div class="empty">可以先点上面的资金按钮跳财务台继续查，这里没必要硬装成功。</div>';
        return;
      }

      targetStatus.textContent =
        '当前 orderId=' +
        orderId +
        ' 命中支付 ' +
        formatCount(finance.payments.total) +
        ' 条、退款 ' +
        formatCount(finance.refunds.total) +
        ' 条、结算 ' +
        formatCount(finance.settlements.total) +
        ' 条。提现不会混进来。';
      targetSummary.innerHTML = buildOrderFinanceSummaryCards(orderId, finance);
      targetRecords.innerHTML =
        buildOrderFinanceRecordSection(
          '支付单',
          'payments',
          orderId,
          finance.payments,
          buildPaymentFinanceRecord,
          '当前订单暂无支付单。',
        ) +
        buildOrderFinanceRecordSection(
          '退款单',
          'refunds',
          orderId,
          finance.refunds,
          buildRefundFinanceRecord,
          '当前订单暂无退款单。',
        ) +
        buildOrderFinanceRecordSection(
          '结算',
          'settlements',
          orderId,
          finance.settlements,
          buildSettlementFinanceRecord,
          '当前订单暂无结算记录。',
        );
    }

    async function loadSelectedOrderFinance(orderIdOverride) {
      const orderId = String(
        orderIdOverride ||
          (state.selectedOrder && state.selectedOrder.id
            ? state.selectedOrder.id
            : state.selectedOrderId || ''),
      ).trim();

      if (!orderId) {
        state.orderFinance = createEmptyOrderFinanceState();
        renderSelectedOrderFinance();
        return;
      }

      const requestId = ++latestOrderFinanceRequestId;
      state.orderFinance = {
        ...createEmptyOrderFinanceState(orderId),
        loading: true,
      };
      renderSelectedOrderFinance();

      try {
        const [payments, refunds, settlements] = await Promise.all([
          fetchOrderFinancePage('/admin/finance/payments?', '支付单', orderId),
          fetchOrderFinancePage('/admin/finance/refunds?', '退款单', orderId),
          fetchOrderFinancePage('/admin/finance/settlements?', '结算', orderId),
        ]);

        if (requestId !== latestOrderFinanceRequestId) {
          return;
        }

        state.orderFinance = {
          orderId,
          loading: false,
          error: '',
          payments,
          refunds,
          settlements,
        };
        renderSelectedOrderFinance();
      } catch (error) {
        if (requestId !== latestOrderFinanceRequestId) {
          return;
        }

        state.orderFinance = {
          ...createEmptyOrderFinanceState(orderId),
          error: error.message,
        };
        renderSelectedOrderFinance();
      }
    }

    function renderSelectedOrder() {
      const order = state.selectedOrder;
      if (!order) {
        document.getElementById('selectedOrderSummary').innerHTML =
          '<div class="empty">先从左侧列表选一条订单。</div>';
        document.getElementById('selectedOrderMeta').innerHTML =
          '<div class="meta-card"><strong>路线</strong><div class="empty">暂无订单</div></div>' +
          '<div class="meta-card"><strong>支付</strong><div class="empty">暂无订单</div></div>' +
          '<div class="meta-card"><strong>货物</strong><div class="empty">暂无订单</div></div>' +
          '<div class="meta-card"><strong>异常快照</strong><div class="empty">暂无订单</div></div>';
        state.orderFinance = createEmptyOrderFinanceState();
        renderSelectedOrderFinance();
        document.getElementById('selectedOrderEvents').innerHTML =
          '<div class="empty">选中订单后会展示事件留痕。</div>';
        return;
      }

      const latestExceptionCase = order.latestExceptionCase;
      const hasLatestExceptionCase = Boolean(
        latestExceptionCase && latestExceptionCase.caseNo,
      );
      const compensationSummary =
        latestExceptionCase && latestExceptionCase.compensationStatus
          ? formatCompensationSummary(latestExceptionCase)
          : '赔付决议：未记录';
      const latestExceptionUpdatedAt = hasLatestExceptionCase
        ? latestExceptionCase.compensationUpdatedAtIso ||
          latestExceptionCase.resolvedAtIso ||
          latestExceptionCase.updatedAtIso ||
          latestExceptionCase.createdAtIso ||
          ''
        : '';

      document.getElementById('selectedOrderSummary').innerHTML =
        '<span class="eyebrow">订单详情</span>' +
        '<h3 style="margin-top:10px;">' + escapeHtml(order.orderNo) + '</h3>' +
        '<div class="muted">订单ID：<span class="mono">' + escapeHtml(order.id) + '</span></div>' +
        '<div class="muted">货主ID：<span class="mono">' + escapeHtml(order.shipperId) + '</span></div>' +
        '<div class="pill-row">' +
          '<span class="pill">' + escapeHtml(formatOrderStatus(order.status)) + '</span>' +
          '<span class="pill">' + escapeHtml(formatPricingMode(order.pricingMode)) + '</span>' +
          '<span class="pill">' + escapeHtml(formatPaymentMethod(order.paymentMethod)) + '</span>' +
          '<span class="pill">' + escapeHtml(formatPaymentStatus(order.paymentStatus || '-')) + '</span>' +
        '</div>' +
        '<div class="muted">创建：' + escapeHtml(order.createdAtIso) + '</div>' +
        '<div class="muted">更新：' + escapeHtml(order.updatedAtIso) + '</div>' +
        '<div class="summary-actions">' +
          '<button id="viewSelectedOrderFinanceButton" type="button" class="secondary-button" onclick="openSelectedOrderFinanceConsole()">查看资金记录</button>' +
          '<button id="viewSelectedOrderExceptionCaseButton" type="button" class="secondary-button"' +
            (hasLatestExceptionCase
              ? ' onclick="openSelectedOrderExceptionCaseConsole()"'
              : ' disabled') +
          '>查看异常工单</button>' +
        '</div>' +
        '<div class="muted">会跳到财务台并自动带上当前 orderId，下面这块按单资金视图也会同步拉支付 / 退款 / 结算。</div>' +
        '<div class="muted">' +
          (hasLatestExceptionCase
            ? '最新异常工单：' +
              escapeHtml(latestExceptionCase.caseNo) +
              ' · ' +
              escapeHtml(compensationSummary)
            : '当前订单暂无异常工单，下面快照里也不会给你凭空变出赔付结论。') +
        '</div>';

      document.getElementById('selectedOrderMeta').innerHTML =
        '<div class="meta-card"><strong>路线</strong><div class="muted">' +
          escapeHtml(order.pickupAddress) + '<br>' +
          escapeHtml(order.pickupContact) + ' / ' + escapeHtml(order.pickupPhone) + '<br><br>' +
          escapeHtml(order.deliveryAddress) + '<br>' +
          escapeHtml(order.deliveryContact) + ' / ' + escapeHtml(order.deliveryPhone) +
        '</div></div>' +
        '<div class="meta-card"><strong>支付</strong><div class="muted">' +
          '支付方式：' + escapeHtml(formatPaymentMethod(order.paymentMethod)) + '<br>' +
          '支付状态：' + escapeHtml(formatPaymentStatus(order.paymentStatus || '-')) + '<br>' +
          '原价：' + escapeHtml(formatPrice(order.priceCents)) + '<br>' +
          '实付：' + escapeHtml(formatPrice(order.payablePriceCents)) +
        '</div></div>' +
        '<div class="meta-card"><strong>货物</strong><div class="muted">' +
          escapeHtml(order.cargoType) + ' / ' + escapeHtml(order.weightText) + ' / ' + escapeHtml(order.quantityText) + '<br>' +
          '车型：' + escapeHtml(order.vehicleRequirement) + '<br>' +
          '货物附件：' + escapeHtml(order.cargoPhotoCount || 0) + ' 张' +
          (order.cargoDescription ? '<br>说明：' + escapeHtml(order.cargoDescription) : '') +
        '</div></div>' +
        '<div class="meta-card"><strong>异常快照</strong><div class="muted">' +
          (hasLatestExceptionCase
            ? 'caseNo：' +
              escapeHtml(latestExceptionCase.caseNo) +
              '<br>状态：' +
              escapeHtml(formatExceptionCaseStatus(latestExceptionCase.status)) +
              '<br>' +
              escapeHtml(compensationSummary) +
              '<br>赔付快照更新时间：' +
              escapeHtml(formatTime(latestExceptionUpdatedAt))
            : '暂无异常工单快照') +
        '</div>' +
        (hasLatestExceptionCase
          ? '<div class="summary-actions"><button type="button" class="secondary-button" onclick="openSelectedOrderExceptionCaseConsole()">跳异常工单台</button></div>'
          : '') +
        '</div></div>';

      renderSelectedOrderFinance();
      renderSelectedOrderEvents(order.events || []);
    }

    function renderSelectedOrderEvents(events) {
      const target = document.getElementById('selectedOrderEvents');
      if (!Array.isArray(events) || !events.length) {
        target.innerHTML = '<div class="empty">当前订单暂无事件留痕。</div>';
        return;
      }

      target.innerHTML = events.map(function(event) {
        const attachmentCount = Array.isArray(event.attachmentFileIds)
          ? event.attachmentFileIds.length
          : 0;
        return '<article class="event-card">' +
          '<strong>' + escapeHtml(event.eventType) + '</strong>' +
          '<div class="muted">事件ID：<span class="mono">' + escapeHtml(event.id) + '</span></div>' +
          '<div class="muted">时间：' + escapeHtml(event.createdAtIso) + '</div>' +
          (event.actorUserId ? '<div class="muted">操作者：<span class="mono">' + escapeHtml(event.actorUserId) + '</span></div>' : '') +
          (event.noteText ? '<div class="muted">备注：' + escapeHtml(event.noteText) + '</div>' : '') +
          '<div class="pill-row"><span class="pill">附件引用 ' + escapeHtml(attachmentCount) + '</span></div>' +
        '</article>';
      }).join('');
    }

    function formatPrice(value) {
      if (typeof value !== 'number') {
        return '-';
      }
      return '¥' + (value / 100).toFixed(2);
    }

    resetOrderReport('当前还没拉订单报表。');

    document.getElementById('loadOrderListButton').addEventListener('click', function() {
      loadOrderList();
    });
    document.getElementById('loadOrderReportButton').addEventListener('click', function() {
      loadOrderReport();
    });
    document.getElementById('exportOrderCsvButton').addEventListener('click', function() {
      exportAdminOrdersCsv();
    });
    document.getElementById('loadSelectedOrderButton').addEventListener('click', function() {
      loadOrderDetail();
    });
    document.getElementById('orderListPreviousPageButton').addEventListener('click', function() {
      loadAdjacentOrderListPage(-1);
    });
    document.getElementById('orderListNextPageButton').addEventListener('click', function() {
      loadAdjacentOrderListPage(1);
    });
    document.getElementById('clearOrderSelectionButton').addEventListener('click', function() {
      clearSelectedWaitingOrders();
    });
    document.getElementById('runBatchCancelWaitingOrdersButton').addEventListener('click', function() {
      runBatchCancelWaitingOrders();
    });

    const orderRouteState = applyOrderManagementRouteState();
    const currentAdminSession = initializeAdminSession();
    updateOrderBatchSelectionUi();
    if (currentAdminSession && currentAdminSession.accessToken) {
      loadOrderList();
      loadOrderReport();
      if (orderRouteState.orderId) {
        loadOrderDetail(orderRouteState.orderId);
      }
    }
  </script>
</body>
</html>`;
}
