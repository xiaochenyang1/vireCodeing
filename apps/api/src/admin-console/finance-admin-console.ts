import {
  renderAdminConsoleNav,
  renderAdminConsoleNavStyles,
} from './admin-console-nav-snippet';
import {
  renderAdminSessionControls,
  renderAdminSessionScript,
} from './admin-session-snippet';

export function renderFinanceAdminConsole() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>财务操作台</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f4f6f8; color: #17202a; }
    .console-shell { display: grid; grid-template-columns: minmax(360px, 44%) 1fr; gap: 16px; padding: 16px; }
    .panel { background: #fff; border: 1px solid #d8dee4; border-radius: 12px; padding: 16px; }
    .tab-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 12px 0; }
    .tab-row button { background: #e7edf4; color: #17202a; }
    .tab-row button.active { background: #1769aa; color: #fff; }
    .filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .toolbar { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
    .action-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
    .action-card, .detail-card { border: 1px solid #edf0f2; border-radius: 10px; padding: 12px; }
    .record-row { border-top: 1px solid #edf0f2; padding: 12px 0; cursor: pointer; }
    .record-row.selected { background: #eef6ff; }
    .record-row-header { display: flex; gap: 12px; justify-content: space-between; align-items: center; }
    .detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .kv { margin: 6px 0; }
    .kv strong { display: block; font-size: 12px; color: #667085; }
    .muted { color: #667085; font-size: 13px; }
    .error { color: #b42318; white-space: pre-wrap; }
    .inline-checkbox { display: inline-flex; align-items: center; gap: 6px; color: #667085; font-size: 12px; }
    .inline-checkbox input { width: auto; margin: 0; padding: 0; }
    .selection-summary { margin-top: 8px; }
    .session-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 10px; }
    .session-link { color: #1769aa; font-size: 13px; font-weight: 600; text-decoration: none; }
    .secondary-button { width: auto; background: #fff; color: #1769aa; border: 1px solid #d8dee4; }
    .status { display: inline-block; border-radius: 999px; padding: 3px 8px; background: #eef2f6; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border-top: 1px solid #edf0f2; padding: 8px; text-align: left; font-size: 13px; }
    input, textarea, button { box-sizing: border-box; width: 100%; padding: 9px; margin: 4px 0; }
    textarea { min-height: 84px; resize: vertical; }
    button { cursor: pointer; background: #1769aa; color: #fff; border: 0; border-radius: 8px; }
    button:disabled { cursor: not-allowed; opacity: .55; }
    ${renderAdminConsoleNavStyles()}
    @media (max-width: 980px) {
      .console-shell { grid-template-columns: 1fr; }
      .action-grid, .filters, .detail-grid, .tab-row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="console-shell">
    <section class="panel">
      <h1>财务操作台</h1>
      <p class="muted">第一片先把支付、退款、结算、提现查出来，也补了财务报表、订单联动和提现批量审核第一片。现在既能从这里自己筛，也能从订单管理台带着 orderId 深链跳进来查支付 / 退款 / 结算；提现页当前勾选结果也会一次请求打后端 batch-review，走整批校验和原子写入。正式支付 / 打款、生产对账和多角色权限还没到这一步，别硬往脸上贴金。</p>
      <label>Admin access token<input id="adminToken" type="password" /></label>
      ${renderAdminSessionControls({
        currentRoute: '/api/admin/finance-console',
      })}
      ${renderAdminConsoleNav({
        currentRoute: '/api/admin/finance-console',
      })}
      <section class="detail-card">
        <div class="toolbar">
          <div>
            <strong>财务报表</strong>
            <div class="muted">先看支付、退款、结算、提现和 refund outbox 的关键水位，再决定往哪补火。</div>
          </div>
          <button id="loadFinanceReportButton" type="button" class="secondary-button" onclick="loadFinanceReport()">刷新财务报表</button>
          <button id="loadFinanceReconciliationButton" type="button" class="secondary-button" onclick="loadFinanceReconciliation()">刷新一致性对账</button>
        </div>
        <div id="financeReconciliationStatus" class="muted">当前还没拉一致性对账</div>
        <div id="financeReconciliationSummary" class="detail-grid">
          <div class="detail-card muted">先刷新一致性对账，别拿汇总当核验。</div>
        </div>
        <div id="financeReconciliationFindings" class="detail-card muted">对账差异待加载</div>
        <div id="financeReportStatus" class="muted">当前还没拉财务报表</div>
        <div id="financeReportSummary" class="detail-grid">
          <div class="detail-card muted">先刷新财务报表，别看着空气脑补趋势。</div>
        </div>
        <div class="detail-grid" style="margin-top:10px;">
          <div id="financePaymentStatusReport" class="detail-card muted">支付状态分布待加载</div>
          <div id="financeRefundStatusReport" class="detail-card muted">退款状态分布待加载</div>
          <div id="financeWithdrawalStatusReport" class="detail-card muted">提现状态分布待加载</div>
          <div id="financeOutboxStatusReport" class="detail-card muted">refund outbox 状态待加载</div>
        </div>
        <div id="financeSettlementSummary" class="detail-card muted" style="margin-top:10px;">结算汇总待加载</div>
      </section>
      <div id="financeTab" class="tab-row">
        <button id="paymentsTabButton" data-tab="payments" class="active" onclick="switchFinanceTab(this.dataset.tab)">支付单</button>
        <button id="refundsTabButton" data-tab="refunds" onclick="switchFinanceTab(this.dataset.tab)">退款单</button>
        <button id="settlementsTabButton" data-tab="settlements" onclick="switchFinanceTab(this.dataset.tab)">结算</button>
        <button id="withdrawalsTabButton" data-tab="withdrawals" onclick="switchFinanceTab(this.dataset.tab)">提现</button>
      </div>
      <div class="filters">
        <label>状态筛选<input id="financeStatusInput" placeholder="留空表示全部状态" /></label>
        <label>订单 ID<input id="financeOrderIdInput" placeholder="仅支付 / 退款 / 结算标签生效" /></label>
        <label>页码<input id="financePageInput" type="number" min="1" value="1" /></label>
        <label>每页<input id="financePageSizeInput" type="number" min="1" max="100" value="20" /></label>
        <label>&nbsp;<button id="loadFinanceButton" onclick="loadFinanceListFromInputs()">查询当前标签</button></label>
      </div>
      <div class="toolbar">
        <button id="financePreviousPage" onclick="changeFinancePage(-1)">上一页</button>
        <button id="financeNextPage" onclick="changeFinancePage(1)">下一页</button>
      </div>
      <div id="financeListNotice" class="error"></div>
      <div id="financePaginationStatus" class="muted">当前还没查询财务记录</div>
      <div id="financeList"></div>
      <section class="detail-card" style="margin-top:12px;">
        <strong>提现批量审核</strong>
        <p class="muted">当前页勾选 reviewing 提现后会一次请求调后端 <code>POST /admin/finance/withdrawals/batch-review</code>；后端会整批校验并原子写入。批量动作直接拿列表里的每条 <code>withdrawal.version</code> 做 CAS，不吃右侧单条 <code>expectedVersion</code> 输入。</p>
        <div class="toolbar">
          <label class="inline-checkbox"><input id="selectAllReviewingWithdrawalsInput" type="checkbox" onclick="toggleSelectAllReviewingWithdrawals(this.checked)" />全选当前页待审提现</label>
          <button id="clearWithdrawalBatchSelectionButton" type="button" class="secondary-button" onclick="clearSelectedWithdrawalBatch()">清空勾选</button>
        </div>
        <div id="withdrawalBatchSelectionStatus" class="muted selection-summary">切到提现标签后，才能勾选当前页 reviewing 提现做批量审核。</div>
        <div class="toolbar">
          <button id="approveBatchWithdrawalsButton" type="button" onclick="runBatchWithdrawalReview('approve')">批量通过</button>
          <button id="rejectBatchWithdrawalsButton" type="button" onclick="runBatchWithdrawalReview('reject')">批量驳回</button>
        </div>
      </section>
    </section>

    <section class="panel">
      <h2>记录详情与动作</h2>
      <div id="financeDetail" class="muted">请选择一条财务记录</div>
      <div id="selectedRecordHints" class="muted">退款重试需要 dead outbox 的 attemptCount，提现审核需要当前 withdrawal.version。没有这些基线就别瞎点，不然冲突码会狠狠干你一巴掌。</div>
      <div class="filters">
        <label>expectedVersion<input id="expectedVersionInput" type="number" min="0" value="0" /></label>
        <label>资金流水 ID<input id="ledgerTransactionIdInput" placeholder="可手填或从选中记录自动回填" /></label>
      </div>
      <label>reason<textarea id="reasonInput" placeholder="请输入操作原因。退款重试或提现驳回都别只写两个字糊弄人。"></textarea></label>
      <div class="action-grid">
        <div class="action-card">
          <strong>退款重试</strong>
          <p class="muted">仅对 refund_failed 且 outbox 已 dead 的退款记录有效。</p>
          <button id="retryRefundAction" onclick="retryRefund()">重试退款</button>
        </div>
        <div class="action-card">
          <strong>提现通过</strong>
          <p class="muted">会按 selected withdrawal 的 version 做 CAS，并生成 driver_withdrawal 分录。</p>
          <button id="approveWithdrawalAction" onclick="approveWithdrawal()">通过提现</button>
        </div>
        <div class="action-card">
          <strong>提现驳回</strong>
          <p class="muted">会释放 reserved 余额回到可提现钱包，不会生成打款流水。</p>
          <button id="rejectWithdrawalAction" onclick="rejectWithdrawal()">驳回提现</button>
        </div>
      </div>
      <div class="toolbar">
        <button id="viewLinkedOrderButton" onclick="openSelectedFinanceOrderConsole()" disabled>查看订单详情</button>
        <button id="loadLedgerButton" onclick="loadLedgerFromSelection()">查看资金流水</button>
        <button id="clearSelectionButton" onclick="clearFinanceSelection(); clearLedgerDetail();">清空选中</button>
      </div>
      <div id="financeMutationNotice" class="error"></div>
      <div class="detail-card">
        <h3>资金流水明细</h3>
        <div id="ledgerDetail" class="muted">暂无资金流水</div>
      </div>
    </section>
  </main>
  <script>
    const apiBase = '/api';
    const tabRoutes = {
      payments: '/admin/finance/payments?',
      refunds: '/admin/finance/refunds?',
      settlements: '/admin/finance/settlements?',
      withdrawals: '/admin/finance/withdrawals?',
    };
    const withdrawalReviewPaths = {
      approve: '/admin/finance/withdrawals/{withdrawalId}/approve',
      reject: '/admin/finance/withdrawals/{withdrawalId}/reject',
    };
    const withdrawalBatchReviewPath = '/admin/finance/withdrawals/batch-review';
    const tabLabels = {
      payments: '支付单',
      refunds: '退款单',
      settlements: '结算',
      withdrawals: '提现',
    };
    let currentFinanceTab = 'payments';
    let currentFinanceItems = [];
    let currentFinancePage = 1;
    let currentFinanceTotal = 0;
    let selectedFinanceRecordId = '';
    let selectedWithdrawalIds = new Set();
    let latestFinanceRequestId = 0;
    let latestFinanceReportRequestId = 0;
    let latestLedgerRequestId = 0;
    let financeMutationPending = false;
    ${renderAdminSessionScript({
      currentRoute: '/api/admin/finance-console',
    })}

    function token() {
      const value = document.getElementById('adminToken').value.trim();
      if (!value) {
        throw new Error('请先填写 admin access token');
      }
      persistAdminAccessToken();
      return value;
    }

    async function api(path, options = {}) {
      const response = await fetch(apiBase + path, {
        ...options,
        headers: {
          Authorization: 'Bearer ' + token(),
          ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...(options.headers || {}),
        },
      });
      const text = await response.text();
      const body = text ? JSON.parse(text) : {};
      if (!response.ok) {
        const error = new Error(body.message || '请求失败');
        error.code = body.code;
        throw error;
      }
      if (!body || body.code !== 'OK' || !Object.prototype.hasOwnProperty.call(body, 'data')) {
        throw new Error('接口成功响应格式不对');
      }
      return body.data;
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    }

    function formatCount(value) {
      return String(Number(value || 0));
    }

    function formatMoney(amountCents) {
      const amount = Number(amountCents || 0);
      return (amount / 100).toFixed(2) + ' 元';
    }

    function resetFinanceReport(message = '当前还没拉财务报表') {
      document.getElementById('financeReportStatus').textContent = message;
      document.getElementById('financeReportSummary').innerHTML =
        '<div class="detail-card muted">先刷新财务报表，别看着空气脑补趋势。</div>';
      document.getElementById('financePaymentStatusReport').innerHTML = '支付状态分布待加载';
      document.getElementById('financeRefundStatusReport').innerHTML = '退款状态分布待加载';
      document.getElementById('financeWithdrawalStatusReport').innerHTML = '提现状态分布待加载';
      document.getElementById('financeOutboxStatusReport').innerHTML = 'refund outbox 状态待加载';
      document.getElementById('financeSettlementSummary').innerHTML = '结算汇总待加载';
    }

    function renderBreakdownCard(title, items, formatter) {
      if (!Array.isArray(items) || items.length === 0) {
        return '<strong>' + escapeHtml(title) + '</strong><div class="muted">暂无数据</div>';
      }
      return '<strong>' + escapeHtml(title) + '</strong>' +
        items.map(item =>
          '<div class="kv"><strong>' + escapeHtml(item.status || '-') + '</strong>' +
          escapeHtml(formatter(item)) +
          '</div>',
        ).join('');
    }

    function renderFinanceReport(report) {
      const summary = report && report.summary ? report.summary : {};
      document.getElementById('financeReportStatus').textContent =
        '报表时间：' + (report && report.generatedAtIso ? report.generatedAtIso : '-');
      document.getElementById('financeReportSummary').innerHTML = [
        {
          label: '支付总额',
          value: formatMoney(summary.paymentAmountCents),
          detail: '共 ' + formatCount(summary.paymentCount) + ' 笔',
        },
        {
          label: '退款总额',
          value: formatMoney(summary.refundAmountCents),
          detail: '共 ' + formatCount(summary.refundCount) + ' 笔',
        },
        {
          label: '待审提现',
          value: formatMoney(summary.pendingWithdrawalAmountCents),
          detail: formatCount(summary.pendingWithdrawalCount) + ' 笔',
        },
        {
          label: '死信退款 outbox',
          value: formatCount(summary.deadRefundOutboxCount),
          detail: '需要人工盯',
        },
      ].map(item =>
        '<div class="detail-card"><strong>' + escapeHtml(item.label) + '</strong><div style="margin-top:8px;font-size:24px;font-weight:700;">' + escapeHtml(item.value) + '</div><div class="muted" style="margin-top:6px;">' + escapeHtml(item.detail) + '</div></div>',
      ).join('');
      document.getElementById('financePaymentStatusReport').innerHTML = renderBreakdownCard(
        '支付状态分布',
        report && report.paymentStatusBreakdown,
        item => formatCount(item.count) + ' 笔 / ' + formatMoney(item.amountCents),
      );
      document.getElementById('financeRefundStatusReport').innerHTML = renderBreakdownCard(
        '退款状态分布',
        report && report.refundStatusBreakdown,
        item => formatCount(item.count) + ' 笔 / ' + formatMoney(item.amountCents),
      );
      document.getElementById('financeWithdrawalStatusReport').innerHTML = renderBreakdownCard(
        '提现状态分布',
        report && report.withdrawalStatusBreakdown,
        item => formatCount(item.count) + ' 笔 / ' + formatMoney(item.amountCents),
      );
      document.getElementById('financeOutboxStatusReport').innerHTML = renderBreakdownCard(
        'refund outbox 状态',
        report && report.refundOutboxStatusBreakdown,
        item => formatCount(item.count) + ' 条',
      );
      const settlement = report && report.settlementSummary ? report.settlementSummary : {};
      document.getElementById('financeSettlementSummary').innerHTML =
        '<strong>结算汇总</strong>' +
        '<div class="kv"><strong>已结算单</strong>' + escapeHtml(formatCount(settlement.count)) + '</div>' +
        '<div class="kv"><strong>结算总额</strong>' + escapeHtml(formatMoney(settlement.grossAmountCents)) + '</div>' +
        '<div class="kv"><strong>平台服务费</strong>' + escapeHtml(formatMoney(settlement.platformFeeCents)) + '</div>' +
        '<div class="kv"><strong>司机净收入</strong>' + escapeHtml(formatMoney(settlement.driverNetAmountCents)) + '</div>';
    }


    function resetFinanceReconciliation(message = '当前还没拉一致性对账') {
      document.getElementById('financeReconciliationStatus').textContent = message;
      document.getElementById('financeReconciliationSummary').innerHTML =
        '<div class="detail-card muted">先刷新一致性对账，别拿汇总当核验。</div>';
      document.getElementById('financeReconciliationFindings').innerHTML = '对账差异待加载';
    }

    function renderFinanceReconciliation(report) {
      const summary = report && report.summary ? report.summary : {};
      document.getElementById('financeReconciliationStatus').textContent =
        '对账时间：' + (report && report.generatedAtIso ? report.generatedAtIso : '-');
      document.getElementById('financeReconciliationSummary').innerHTML = [
        { label: '差异总数', value: formatCount(summary.findingCount) },
        { label: '错误', value: formatCount(summary.errorCount) },
        { label: '警告', value: formatCount(summary.warningCount) },
      ].map(item =>
        '<div class="detail-card"><strong>' + escapeHtml(item.label) + '</strong><div style="margin-top:8px;font-size:24px;font-weight:700;">' + escapeHtml(item.value) + '</div></div>'
      ).join('');
      const findings = Array.isArray(report && report.findings) ? report.findings : [];
      document.getElementById('financeReconciliationFindings').innerHTML = findings.length
        ? findings.map(item =>
            '<div class="kv"><strong>' + escapeHtml(item.severity || '-') + ' · ' + escapeHtml(item.code || '-') + '</strong>' +
            escapeHtml(item.entityType || '-') + ' / ' + escapeHtml(item.entityId || '-') +
            (item.amountCents === undefined ? '' : ' / ' + formatMoney(item.amountCents)) +
            '<div class="muted">' + escapeHtml(item.message || '') + '</div></div>'
          ).join('')
        : '<div class="muted">当前没有发现一致性差异。</div>';
    }

    async function loadFinanceReconciliation() {
      try {
        const report = await api('/admin/finance/reconciliation');
        renderFinanceReconciliation(report);
      } catch (error) {
        resetFinanceReconciliation('一致性对账加载失败：' + error.message);
      }
    }

    async function loadFinanceReport() {
      const requestId = ++latestFinanceReportRequestId;
      try {
        const report = await api('/admin/finance/report');
        if (requestId !== latestFinanceReportRequestId) return;
        renderFinanceReport(report);
      } catch (error) {
        if (requestId !== latestFinanceReportRequestId) return;
        resetFinanceReport('财务报表加载失败：' + error.message);
      }
    }

    function createIdempotencyKey() {
      if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
      }

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

    function readFinanceRouteState() {
      const query = new URLSearchParams(
        globalThis.location && typeof globalThis.location.search === 'string'
          ? location.search
          : '',
      );
      return {
        tab: query.get('tab') || '',
        status: query.get('status') || '',
        orderId: query.get('orderId') || '',
        page: query.get('page') || '',
        pageSize: query.get('pageSize') || '',
      };
    }

    function applyFinanceRouteState() {
      const routeState = readFinanceRouteState();
      if (Object.prototype.hasOwnProperty.call(tabRoutes, routeState.tab)) {
        currentFinanceTab = routeState.tab;
      }
      document.getElementById('financeStatusInput').value = routeState.status;
      document.getElementById('financeOrderIdInput').value = routeState.orderId;
      if (routeState.page) {
        const nextPage = Math.max(
          1,
          Number.parseInt(routeState.page, 10) || 1,
        );
        currentFinancePage = nextPage;
        document.getElementById('financePageInput').value = String(nextPage);
      }
      if (routeState.pageSize) {
        const nextPageSize = Math.min(
          100,
          Math.max(1, Number.parseInt(routeState.pageSize, 10) || 20),
        );
        document.getElementById('financePageSizeInput').value =
          String(nextPageSize);
      }
    }

    function syncFinanceRouteState(page, pageSize) {
      if (!globalThis.history || !globalThis.location) {
        return;
      }
      const query = new URLSearchParams();
      query.set('tab', currentFinanceTab);
      const status = document.getElementById('financeStatusInput').value.trim();
      const orderId = document.getElementById('financeOrderIdInput').value.trim();
      if (status) {
        query.set('status', status);
      }
      if (orderId) {
        query.set('orderId', orderId);
      }
      if (page > 1) {
        query.set('page', String(page));
      }
      if (pageSize !== 20) {
        query.set('pageSize', String(pageSize));
      }
      const nextQuery = query.toString();
      const nextPath =
        globalThis.location.pathname +
        (nextQuery ? '?' + nextQuery : '');
      globalThis.history.replaceState(null, '', nextPath);
    }

    function getSelectedFinanceRecord() {
      return selectedFinanceRecordId
        ? currentFinanceItems.find(candidate => candidate.id === selectedFinanceRecordId)
        : undefined;
    }

    function updateViewOrderButton() {
      const button = document.getElementById('viewLinkedOrderButton');
      if (!button) {
        return;
      }
      const item = getSelectedFinanceRecord();
      button.disabled = !(item && item.orderId);
    }

    function openSelectedFinanceOrderConsole() {
      const item = getSelectedFinanceRecord();
      const orderId = String(item && item.orderId ? item.orderId : '').trim();
      if (!orderId) {
        document.getElementById('financeMutationNotice').textContent =
          '当前记录没有关联 orderId，别硬往订单台上蹭。';
        updateViewOrderButton();
        return;
      }

      const query = new URLSearchParams();
      query.set('orderId', orderId);
      const href = '/api/admin/order-management-console?' + query.toString();
      if (globalThis.location && typeof globalThis.location.assign === 'function') {
        globalThis.location.assign(href);
        return;
      }
      if (globalThis.location) {
        globalThis.location.href = href;
      }
    }

    function switchFinanceTab(tab) {
      if (!Object.prototype.hasOwnProperty.call(tabRoutes, tab)) {
        return;
      }
      currentFinanceTab = tab;
      selectedWithdrawalIds.clear();
      currentFinancePage = 1;
      document.getElementById('financePageInput').value = '1';
      document.getElementById('financeListNotice').textContent = '';
      document.getElementById('financeMutationNotice').textContent = '';
      clearFinanceSelection();
      clearLedgerDetail();
      renderFinanceTabs();
      loadFinanceList(1);
    }

    function renderFinanceTabs() {
      ['payments', 'refunds', 'settlements', 'withdrawals'].forEach(tab => {
        const button = document.getElementById(tab + 'TabButton');
        if (!button) return;
        button.className = currentFinanceTab === tab ? 'active' : '';
      });
    }

    function getCurrentReviewingWithdrawals() {
      if (currentFinanceTab !== 'withdrawals') {
        return [];
      }

      return currentFinanceItems.filter(item => item && item.status === 'reviewing');
    }

    function syncSelectedWithdrawalsToCurrentList() {
      const currentIds = new Set(
        getCurrentReviewingWithdrawals().map(item => String(item.id || '')),
      );

      Array.from(selectedWithdrawalIds).forEach(withdrawalId => {
        if (!currentIds.has(withdrawalId)) {
          selectedWithdrawalIds.delete(withdrawalId);
        }
      });
    }

    function syncWithdrawalSelectionCheckboxes() {
      document.querySelectorAll('[data-withdrawal-select-id]').forEach(input => {
        const withdrawalId = input.getAttribute('data-withdrawal-select-id');
        input.checked = Boolean(
          withdrawalId && selectedWithdrawalIds.has(withdrawalId),
        );
      });
    }

    function updateWithdrawalBatchSelectionUi() {
      const currentReviewingIds = getCurrentReviewingWithdrawals().map(item =>
        String(item.id || ''),
      );
      const currentSelectedCount = currentReviewingIds.filter(withdrawalId =>
        selectedWithdrawalIds.has(withdrawalId),
      ).length;
      const selectAllInput = document.getElementById(
        'selectAllReviewingWithdrawalsInput',
      );

      syncWithdrawalSelectionCheckboxes();

      if (selectAllInput) {
        selectAllInput.disabled =
          financeMutationPending ||
          currentFinanceTab !== 'withdrawals' ||
          currentReviewingIds.length === 0;
        selectAllInput.checked =
          currentReviewingIds.length > 0 &&
          currentSelectedCount === currentReviewingIds.length;
        selectAllInput.indeterminate =
          currentSelectedCount > 0 &&
          currentSelectedCount < currentReviewingIds.length;
      }

      document.getElementById('withdrawalBatchSelectionStatus').textContent =
        currentFinanceTab !== 'withdrawals'
          ? '切到提现标签后，才能勾选当前页 reviewing 提现做批量审核。'
          : currentReviewingIds.length === 0
            ? '当前页没有可批量审核的 reviewing 提现。'
            : currentSelectedCount === 0
              ? '当前页有 ' + currentReviewingIds.length + ' 条待审提现，先勾上要整批处理的记录。'
              : '已勾选 ' + currentSelectedCount + ' 条待审提现，会直接拿列表里的 withdrawal.version 做整批校验并原子写入。';

      [
        'clearWithdrawalBatchSelectionButton',
        'approveBatchWithdrawalsButton',
        'rejectBatchWithdrawalsButton',
      ].forEach(id => {
        const node = document.getElementById(id);
        if (!node) {
          return;
        }
        node.disabled =
          financeMutationPending ||
          currentFinanceTab !== 'withdrawals' ||
          currentSelectedCount === 0;
      });
    }

    function toggleWithdrawalBatchSelection(withdrawalId, checked) {
      if (financeMutationPending || currentFinanceTab !== 'withdrawals') {
        return;
      }

      if (checked) {
        selectedWithdrawalIds.add(withdrawalId);
      } else {
        selectedWithdrawalIds.delete(withdrawalId);
      }

      updateWithdrawalBatchSelectionUi();
    }

    function toggleSelectAllReviewingWithdrawals(checked) {
      if (financeMutationPending || currentFinanceTab !== 'withdrawals') {
        return;
      }

      getCurrentReviewingWithdrawals().forEach(item => {
        const withdrawalId = String(item.id || '');
        if (checked) {
          selectedWithdrawalIds.add(withdrawalId);
        } else {
          selectedWithdrawalIds.delete(withdrawalId);
        }
      });

      updateWithdrawalBatchSelectionUi();
    }

    function clearSelectedWithdrawalBatch() {
      if (financeMutationPending) {
        return;
      }

      selectedWithdrawalIds.clear();
      updateWithdrawalBatchSelectionUi();
      document.getElementById('financeMutationNotice').textContent =
        '已清空提现批量勾选。';
    }

    function clearFinanceSelection() {
      selectedFinanceRecordId = '';
      document.getElementById('financeDetail').innerHTML = '<p class="muted">请选择一条财务记录</p>';
      document.getElementById('expectedVersionInput').value = '0';
      document.getElementById('ledgerTransactionIdInput').value = '';
      updateViewOrderButton();
      renderFinanceList();
      updateWithdrawalBatchSelectionUi();
    }

    function clearLedgerDetail() {
      document.getElementById('ledgerDetail').innerHTML = '<p class="muted">暂无资金流水</p>';
    }

    function loadFinanceListFromInputs() {
      const requestedPage = Number(document.getElementById('financePageInput').value || '1');
      loadFinanceList(requestedPage);
    }

    async function loadFinanceList(page) {
      const requestId = ++latestFinanceRequestId;
      const pageSize = Math.max(1, Number(document.getElementById('financePageSizeInput').value || '20'));
      const requestedPage = Math.max(1, Number(page || 1));
      currentFinancePage = requestedPage;
      document.getElementById('financePageInput').value = String(requestedPage);
      try {
        const query = new URLSearchParams({
          page: String(requestedPage),
          pageSize: String(pageSize),
        });
        const status = document.getElementById('financeStatusInput').value.trim();
        const orderId = document.getElementById('financeOrderIdInput').value.trim();
        if (status) {
          query.set('status', status);
        }
        if (orderId && currentFinanceTab !== 'withdrawals') {
          query.set('orderId', orderId);
        }
        syncFinanceRouteState(requestedPage, pageSize);
        const result = await api(tabRoutes[currentFinanceTab] + query.toString());
        if (requestId !== latestFinanceRequestId) return;
        currentFinanceItems = Array.isArray(result.items) ? result.items : [];
        currentFinanceTotal = Number(result.total || 0);
        if (currentFinanceTab === 'withdrawals') {
          syncSelectedWithdrawalsToCurrentList();
        } else {
          selectedWithdrawalIds.clear();
        }
        document.getElementById('financeListNotice').textContent = '';
        renderFinancePagination(pageSize);
        renderFinanceList();
        if (
          selectedFinanceRecordId &&
          currentFinanceItems.some(item => item.id === selectedFinanceRecordId)
        ) {
          selectFinanceRecord(selectedFinanceRecordId, false);
        } else {
          clearFinanceSelection();
          clearLedgerDetail();
        }
      } catch (error) {
        if (requestId !== latestFinanceRequestId) return;
        currentFinanceItems = [];
        currentFinanceTotal = 0;
        selectedWithdrawalIds.clear();
        renderFinancePagination(pageSize);
        document.getElementById('financeListNotice').textContent = error.message;
        clearFinanceSelection();
        clearLedgerDetail();
      }
    }

    function renderFinancePagination(pageSize) {
      const maxPage = Math.max(1, Math.ceil(currentFinanceTotal / Math.max(1, pageSize)));
      document.getElementById('financePaginationStatus').textContent =
        tabLabels[currentFinanceTab] + '：第 ' + currentFinancePage + ' 页 / 共 ' + maxPage + ' 页，命中 ' + currentFinanceTotal + ' 条';
      document.getElementById('financePreviousPage').disabled = currentFinancePage <= 1;
      document.getElementById('financeNextPage').disabled = currentFinancePage >= maxPage;
    }

    function changeFinancePage(offset) {
      const pageSize = Math.max(1, Number(document.getElementById('financePageSizeInput').value || '20'));
      const maxPage = Math.max(1, Math.ceil(currentFinanceTotal / pageSize));
      loadFinanceList(Math.min(maxPage, Math.max(1, currentFinancePage + offset)));
    }

    function renderFinanceList() {
      const list = document.getElementById('financeList');
      if (!currentFinanceItems.length) {
        list.innerHTML = '<p class="muted">当前标签下暂无财务记录</p>';
        updateWithdrawalBatchSelectionUi();
        return;
      }
      list.innerHTML = currentFinanceItems.map(item => {
        const reviewableOnPage =
          currentFinanceTab === 'withdrawals' && item.status === 'reviewing';
        const batchSelectionControl =
          currentFinanceTab !== 'withdrawals'
            ? ''
            : reviewableOnPage
              ? '<label class="inline-checkbox" onclick="event.stopPropagation()"><input type="checkbox" data-withdrawal-select-id="' + escapeHtml(item.id) + '" onchange="toggleWithdrawalBatchSelection(this.getAttribute(\'data-withdrawal-select-id\'), this.checked)"' + (selectedWithdrawalIds.has(String(item.id || '')) ? ' checked' : '') + ' />批量</label>'
              : '<span class="muted">已处理</span>';
        return '<div class="record-row' + (item.id === selectedFinanceRecordId ? ' selected' : '') + '" data-record-id="' + escapeHtml(item.id) + '" onclick="selectFinanceRecord(this.dataset.recordId)">' +
          '<div class="record-row-header"><div><strong>' + escapeHtml(formatPrimaryTitle(item)) + '</strong> <span class="status">' + escapeHtml(item.status || 'n/a') + '</span></div>' + batchSelectionControl + '</div>' +
          '<div>' + escapeHtml(formatSecondaryLine(item)) + '</div>' +
          '<div class="muted">' + escapeHtml(formatTertiaryLine(item)) + '</div>' +
        '</div>';
      }).join('');
      updateWithdrawalBatchSelectionUi();
    }

    function formatPrimaryTitle(item) {
      if (currentFinanceTab === 'payments') return item.paymentNo || item.id;
      if (currentFinanceTab === 'refunds') return item.refundNo || item.id;
      if (currentFinanceTab === 'settlements') return '结算 ' + (item.id || '');
      return '提现 ' + (item.id || '');
    }

    function formatSecondaryLine(item) {
      if (currentFinanceTab === 'payments') {
        return '订单 ' + (item.orderId || '-') + ' · ' + formatMoney(item.amountCents) + ' · ' + (item.channel || '-');
      }
      if (currentFinanceTab === 'refunds') {
        return '订单 ' + (item.orderId || '-') + ' · ' + formatMoney(item.amountCents) + ' · outbox ' + (item.outboxEvent ? item.outboxEvent.status + '#' + item.outboxEvent.attemptCount : '无');
      }
      if (currentFinanceTab === 'settlements') {
        return '订单 ' + (item.orderId || '-') + ' · 司机净收入 ' + formatMoney(item.driverNetAmountCents);
      }
      return '司机 ' + (item.driverId || '-') + ' · ' + formatMoney(item.amountCents) + ' · 版本 ' + (item.version ?? 0);
    }

    function formatTertiaryLine(item) {
      return item.updatedAtIso || item.createdAtIso || item.settledAtIso || '';
    }

    function selectFinanceRecord(recordId, shouldClearLedger = true) {
      selectedFinanceRecordId = recordId;
      renderFinanceList();
      const item = currentFinanceItems.find(candidate => candidate.id === recordId);
      if (!item) {
        clearFinanceSelection();
        if (shouldClearLedger) clearLedgerDetail();
        return;
      }
      const suggestedVersion =
        currentFinanceTab === 'withdrawals'
          ? Number(item.version || 0)
          : currentFinanceTab === 'refunds'
            ? Number(item.outboxEvent && item.outboxEvent.attemptCount ? item.outboxEvent.attemptCount : 0)
            : 0;
      document.getElementById('expectedVersionInput').value = String(suggestedVersion);
      document.getElementById('ledgerTransactionIdInput').value = String(item.financialTransactionId || '');
      document.getElementById('financeMutationNotice').textContent = '';
      document.getElementById('financeDetail').innerHTML = buildFinanceDetail(item);
      document.getElementById('selectedRecordHints').textContent = buildSelectionHint(item, suggestedVersion);
      updateViewOrderButton();
      if (shouldClearLedger) {
        clearLedgerDetail();
      }
    }

    function buildFinanceDetail(item) {
      const rows = [];
      Object.keys(item).forEach(key => {
        if (key === 'outboxEvent' && item.outboxEvent) {
          rows.push('<div class="detail-card"><strong>退款 outbox</strong><div class="kv"><strong>状态</strong>' + escapeHtml(item.outboxEvent.status) + '</div><div class="kv"><strong>attemptCount</strong>' + escapeHtml(item.outboxEvent.attemptCount) + '</div><div class="kv"><strong>maxAttempts</strong>' + escapeHtml(item.outboxEvent.maxAttempts) + '</div><div class="kv"><strong>availableAtIso</strong>' + escapeHtml(item.outboxEvent.availableAtIso) + '</div></div>');
          return;
        }
        if (item[key] === undefined || item[key] === null || typeof item[key] === 'object') {
          return;
        }
        rows.push('<div class="kv"><strong>' + escapeHtml(key) + '</strong>' + escapeHtml(item[key]) + '</div>');
      });
      return '<div class="detail-grid"><div class="detail-card">' + rows.join('') + '</div></div>';
    }

    function buildSelectionHint(item, suggestedVersion) {
      if (currentFinanceTab === 'refunds') {
        return '已选退款 ' + (item.refundNo || item.id) + '。如果要重试，expectedVersion 应该用当前 outbox attemptCount=' + suggestedVersion + '。';
      }
      if (currentFinanceTab === 'withdrawals') {
        return '已选提现 ' + item.id + '。审核通过或驳回都会拿 withdrawal.version=' + suggestedVersion + ' 做 CAS。';
      }
      if (item.financialTransactionId) {
        return '已选记录自带 financialTransactionId=' + item.financialTransactionId + '，直接点“查看资金流水”就行。';
      }
      return '已选记录暂时没有直接关联的 financialTransactionId。';
    }

    function ensureSelectedRecord(expectedTab) {
      if (!selectedFinanceRecordId) {
        throw new Error('请选择一条财务记录');
      }
      if (currentFinanceTab !== expectedTab) {
        throw new Error('请先切到' + tabLabels[expectedTab] + '标签再操作');
      }
      const item = currentFinanceItems.find(candidate => candidate.id === selectedFinanceRecordId);
      if (!item) {
        throw new Error('当前选中记录已失效，请重新查询');
      }
      return item;
    }

    function parseExpectedVersion() {
      const value = Number(document.getElementById('expectedVersionInput').value || '0');
      if (!Number.isInteger(value) || value < 0) {
        throw new Error('expectedVersion 必须是大于等于 0 的整数');
      }
      return value;
    }

    function parseReason() {
      const value = document.getElementById('reasonInput').value.trim();
      if (!value) {
        throw new Error('请填写操作原因');
      }
      return value;
    }

    async function retryRefund() {
      if (financeMutationPending) return;
      financeMutationPending = true;
      try {
        const item = ensureSelectedRecord('refunds');
        const result = await api('/admin/finance/refunds/' + encodeURIComponent(item.id) + '/retry', {
          method: 'POST',
          headers: { 'Idempotency-Key': createIdempotencyKey() },
          body: JSON.stringify({
            expectedVersion: parseExpectedVersion(),
            reason: parseReason(),
          }),
        });
        document.getElementById('financeMutationNotice').textContent =
          '退款重试已提交：' + (result.refund && result.refund.id ? result.refund.id : item.id);
        document.getElementById('reasonInput').value = '';
        await loadFinanceList(currentFinancePage);
        await loadFinanceReport();
      } catch (error) {
        document.getElementById('financeMutationNotice').textContent = error.message;
      } finally {
        financeMutationPending = false;
        updateWithdrawalBatchSelectionUi();
      }
    }

    async function runBatchWithdrawalReview(action) {
      if (financeMutationPending) return;
      financeMutationPending = true;
      updateWithdrawalBatchSelectionUi();
      try {
        if (currentFinanceTab !== 'withdrawals') {
          throw new Error('请先切到提现标签再批量审核');
        }
        const selectedItems = getCurrentReviewingWithdrawals().filter(item =>
          selectedWithdrawalIds.has(String(item.id || '')),
        );
        if (!selectedItems.length) {
          throw new Error('先勾选提现再批量审核');
        }

        const result = await api(withdrawalBatchReviewPath, {
          method: 'POST',
          headers: { 'Idempotency-Key': createIdempotencyKey() },
          body: JSON.stringify({
            items: selectedItems.map(item => ({
              withdrawalId: item.id,
              expectedVersion: Number(item.version || 0),
            })),
            action,
            reason: parseReason(),
          }),
        });
        document.getElementById('financeMutationNotice').textContent =
          (action === 'approve' ? '批量通过完成：' : '批量驳回完成：') +
          Number(result && result.updatedCount ? result.updatedCount : 0) +
          ' 条提现';
        document.getElementById('reasonInput').value = '';
        selectedWithdrawalIds.clear();
        await loadFinanceList(currentFinancePage);
        await loadFinanceReport();
      } catch (error) {
        document.getElementById('financeMutationNotice').textContent = error.message;
      } finally {
        financeMutationPending = false;
        updateWithdrawalBatchSelectionUi();
      }
    }

    async function reviewWithdrawal(action) {
      if (financeMutationPending) return;
      financeMutationPending = true;
      try {
        const item = ensureSelectedRecord('withdrawals');
        const pathTemplate = withdrawalReviewPaths[action];
        const result = await api(pathTemplate.replace('{withdrawalId}', encodeURIComponent(item.id)), {
          method: 'POST',
          headers: { 'Idempotency-Key': createIdempotencyKey() },
          body: JSON.stringify({
            expectedVersion: parseExpectedVersion(),
            reason: parseReason(),
          }),
        });
        document.getElementById('financeMutationNotice').textContent =
          (action === 'approve' ? '提现通过完成：' : '提现驳回完成：') +
          (result.withdrawal && result.withdrawal.id ? result.withdrawal.id : item.id);
        document.getElementById('reasonInput').value = '';
        await loadFinanceList(currentFinancePage);
        await loadFinanceReport();
      } catch (error) {
        document.getElementById('financeMutationNotice').textContent = error.message;
      } finally {
        financeMutationPending = false;
        updateWithdrawalBatchSelectionUi();
      }
    }

    function approveWithdrawal() {
      return reviewWithdrawal('approve');
    }

    function rejectWithdrawal() {
      return reviewWithdrawal('reject');
    }

    async function loadLedgerFromSelection() {
      const raw = document.getElementById('ledgerTransactionIdInput').value.trim();
      const item = selectedFinanceRecordId
        ? currentFinanceItems.find(candidate => candidate.id === selectedFinanceRecordId)
        : undefined;
      const transactionId = raw || String(item && item.financialTransactionId ? item.financialTransactionId : '');
      if (!transactionId) {
        document.getElementById('financeMutationNotice').textContent = '当前记录没有 financialTransactionId，请手动填写资金流水 ID';
        clearLedgerDetail();
        return;
      }
      const requestId = ++latestLedgerRequestId;
      try {
        const ledger = await api('/admin/finance/ledger-transactions/' + encodeURIComponent(transactionId));
        if (requestId !== latestLedgerRequestId) return;
        document.getElementById('financeMutationNotice').textContent = '';
        document.getElementById('ledgerDetail').innerHTML =
          '<div class="kv"><strong>transactionNo</strong>' + escapeHtml(ledger.transactionNo) + '</div>' +
          '<div class="kv"><strong>type</strong>' + escapeHtml(ledger.type) + '</div>' +
          '<div class="kv"><strong>referenceId</strong>' + escapeHtml(ledger.referenceId) + '</div>' +
          '<div class="kv"><strong>amountCents</strong>' + escapeHtml(ledger.amountCents) + '</div>' +
          '<div class="kv"><strong>occurredAtIso</strong>' + escapeHtml(ledger.occurredAtIso) + '</div>' +
          '<table><thead><tr><th>seq</th><th>accountType</th><th>accountUserId</th><th>direction</th><th>amountCents</th></tr></thead><tbody>' +
          (Array.isArray(ledger.entries) ? ledger.entries.map(entry =>
            '<tr><td>' + escapeHtml(entry.sequence) + '</td><td>' + escapeHtml(entry.accountType) + '</td><td>' + escapeHtml(entry.accountUserId || '-') + '</td><td>' + escapeHtml(entry.direction) + '</td><td>' + escapeHtml(entry.amountCents) + '</td></tr>',
          ).join('') : '') +
          '</tbody></table>';
      } catch (error) {
        if (requestId !== latestLedgerRequestId) return;
        document.getElementById('ledgerDetail').innerHTML = '<p class="error">' + escapeHtml(error.message) + '</p>';
      }
    }

    applyFinanceRouteState();
    renderFinanceTabs();
    updateWithdrawalBatchSelectionUi();
    resetFinanceReport();
    updateViewOrderButton();
    const currentAdminSession = initializeAdminSession();
    if (currentAdminSession && currentAdminSession.accessToken) {
      loadFinanceReport();
      loadFinanceReconciliation();
      loadFinanceList(currentFinancePage);
    }
  </script>
</body>
</html>`;
}
