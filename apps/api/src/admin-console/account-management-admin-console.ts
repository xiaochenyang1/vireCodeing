import {
  renderAdminConsoleNav,
  renderAdminConsoleNavStyles,
} from './admin-console-nav-snippet';
import {
  renderAdminSessionControls,
  renderAdminSessionScript,
} from './admin-session-snippet';

export function renderAccountManagementAdminConsole() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>账号管理台</title>
  <style>
    :root {
      color-scheme: light;
      --bg-top: #eff4f8;
      --bg-bottom: #dbe6ee;
      --panel: rgba(255, 255, 255, 0.92);
      --border: #d1dbe4;
      --text: #162535;
      --muted: #627387;
      --accent: #1769aa;
      --accent-soft: rgba(23, 105, 170, 0.08);
      --danger: #b42318;
      --warning-bg: #fff0d6;
      --warning-text: #8f4b00;
      --positive-bg: #e8f7eb;
      --positive-text: #17663d;
      --neutral-bg: #edf2f7;
      --neutral-text: #344054;
      --shadow: 0 18px 42px rgba(22, 37, 53, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "PingFang SC", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(23, 105, 170, 0.12), transparent 30%),
        linear-gradient(180deg, var(--bg-top) 0%, var(--bg-bottom) 100%);
    }
    .console-shell {
      max-width: 1240px;
      margin: 0 auto;
      padding: 28px 16px 40px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 20px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
    }
    .panel + .panel { margin-top: 18px; }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      padding: 5px 10px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    h1 { margin: 12px 0 10px; font-size: 30px; line-height: 1.15; }
    h2 { margin: 0 0 12px; font-size: 20px; }
    h3 { margin: 0; font-size: 18px; }
    p { margin: 0; }
    .muted { color: var(--muted); line-height: 1.7; }
    .controls-grid {
      display: grid;
      grid-template-columns: minmax(260px, 320px) auto;
      gap: 12px;
      align-items: end;
      margin-top: 18px;
    }
    .filters-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      align-items: end;
      margin-top: 12px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-top: 14px;
    }
    .summary-card {
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 14px 16px;
      background: rgba(255, 255, 255, 0.96);
    }
    .summary-card span {
      display: block;
      color: var(--muted);
      font-size: 12px;
    }
    .summary-card strong {
      display: block;
      margin-top: 8px;
      font-size: 24px;
      line-height: 1;
    }
    .workspace-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
      gap: 18px;
    }
    label {
      display: block;
      font-size: 13px;
      color: var(--muted);
    }
    input, select, button, textarea {
      width: 100%;
      margin-top: 6px;
      padding: 11px 12px;
      border-radius: 12px;
      border: 1px solid var(--border);
      font: inherit;
    }
    input, select, textarea {
      background: rgba(255, 255, 255, 0.97);
    }
    textarea {
      min-height: 80px;
      resize: vertical;
    }
    button {
      border: 0;
      cursor: pointer;
      font-weight: 700;
      background: var(--accent);
      color: #fff;
      box-shadow: 0 12px 24px rgba(23, 105, 170, 0.2);
    }
    .secondary-button {
      width: auto;
      background: rgba(255, 255, 255, 0.96);
      color: var(--text);
      border: 1px solid var(--border);
      box-shadow: none;
    }
    .danger-button {
      background: #b42318;
      box-shadow: 0 12px 24px rgba(180, 35, 24, 0.18);
    }
    .session-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin-top: 12px;
    }
    .notice {
      min-height: 20px;
      margin-top: 12px;
      color: var(--danger);
      white-space: pre-wrap;
    }
    .status-line {
      min-height: 20px;
      margin-top: 12px;
      color: var(--muted);
      font-size: 13px;
    }
    .bulk-panel {
      margin-top: 18px;
      padding: 16px;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.94);
    }
    .bulk-panel h2 {
      margin: 0;
      font-size: 18px;
    }
    .bulk-actions-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin-top: 12px;
    }
    .bulk-actions-row button {
      width: auto;
      min-width: 148px;
    }
    .checkbox-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 13px;
    }
    .checkbox-label input {
      width: 16px;
      height: 16px;
      margin: 0;
    }
    .account-list {
      display: grid;
      gap: 14px;
    }
    .account-card,
    .detail-card,
    .empty-card,
    .session-card,
    .audit-card {
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 18px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 12px 28px rgba(22, 37, 53, 0.05);
    }
    .account-card.active {
      border-color: rgba(23, 105, 170, 0.45);
      box-shadow: 0 16px 34px rgba(23, 105, 170, 0.12);
    }
    .account-card-top,
    .detail-card-top,
    .audit-card-top {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 14px;
    }
    .meta-item {
      border-radius: 14px;
      padding: 10px 12px;
      background: rgba(22, 37, 53, 0.04);
    }
    .meta-item span {
      display: block;
      font-size: 12px;
      color: var(--muted);
    }
    .meta-item strong {
      display: block;
      margin-top: 6px;
      font-size: 14px;
      line-height: 1.5;
      word-break: break-word;
    }
    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .account-card-actions {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
    }
    .risk-chip,
    .status-chip,
    .audit-chip {
      display: inline-flex;
      align-items: center;
      padding: 5px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }
    .status-chip.active,
    .risk-chip.none,
    .audit-chip.noop {
      background: var(--positive-bg);
      color: var(--positive-text);
    }
    .status-chip.disabled,
    .risk-chip.warning {
      background: var(--warning-bg);
      color: var(--warning-text);
    }
    .risk-chip.high,
    .audit-chip.revoked {
      background: rgba(180, 35, 24, 0.12);
      color: var(--danger);
    }
    .action-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 14px;
    }
    .detail-section + .detail-section { margin-top: 18px; }
    .stack-list {
      display: grid;
      gap: 12px;
      margin-top: 12px;
    }
    .pagination-row {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 16px;
    }
    .footnote {
      margin-top: 14px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.7;
    }
    ${renderAdminConsoleNavStyles()}
    @media (max-width: 960px) {
      .controls-grid,
      .filters-grid,
      .summary-grid,
      .workspace-grid,
      .meta-grid,
      .action-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main class="console-shell">
    <section class="panel">
      <span class="eyebrow">账号状态 / 会话 / 风险</span>
      <h1>账号管理台</h1>
      <p class="muted">这页把平台账号目录、活跃会话详情、单账号与批量冻结解冻、按账号撤销会话、筛选报表和 CSV 导出接到一块了。风险标签仍然按全平台活跃会话算，免得共享设备画像失真。注意：不能禁用当前管理员账号，别手一抖把自己干下线了还怪电脑。</p>
      <div class="controls-grid">
        <label>Admin access token<input id="adminToken" type="password" placeholder="填 token 后再查账号" /></label>
        <button type="button" onclick="refreshAccountWorkspace()">刷新账号工作台</button>
      </div>
      <div class="filters-grid">
        <label>用户类型<select id="accountUserTypeInput"><option value="">全部类型</option><option value="shipper">货主</option><option value="driver">司机</option><option value="admin">管理员</option></select></label>
        <label>账号状态<select id="accountStatusInput"><option value="">全部状态</option><option value="active">正常</option><option value="disabled">已禁用</option></select></label>
        <label>关键字<input id="accountKeywordInput" placeholder="手机号、用户 ID、设备标识" /></label>
        <label>风险范围<select id="accountRiskOnlyInput"><option value="false">全部账号</option><option value="true">只看风险账号</option></select></label>
        <label>风险标签<select id="accountRiskTagInput"><option value="">全部标签</option><option value="shared_device">共享设备</option><option value="high_session_volume">高会话量</option><option value="admin_multi_device">多设备 admin</option></select></label>
        <label>风险等级<select id="accountRiskLevelInput"><option value="">全部等级</option><option value="none">无风险</option><option value="warning">提示</option><option value="high">高风险</option></select></label>
        <label>每页<input id="accountPageSizeInput" type="number" min="1" max="50" value="20" /></label>
      </div>
      ${renderAdminSessionControls({
        currentRoute: '/api/admin/account-management-console',
      })}
      ${renderAdminConsoleNav({
        currentRoute: '/api/admin/account-management-console',
      })}
      <div id="accountNotice" class="notice"></div>
      <div id="accountPaginationStatus" class="status-line">默认等你填 token，别拿静态页面当神谕。</div>
      <div class="bulk-panel">
        <h2>批量治理</h2>
        <p class="muted">当前批量动作会顺序调用单账号治理接口，先把一批明显异常账号成片处理掉，再回头看单账号细节，别高峰期一条条手戳到怀疑人生。</p>
        <div class="bulk-actions-row">
          <label class="checkbox-label"><input id="accountSelectAllInput" type="checkbox" onclick="toggleSelectAllCurrentPage(this.checked)" />全选当前页</label>
          <button type="button" class="secondary-button" onclick="clearSelectedAccounts()">清空勾选</button>
          <button id="accountBulkDisableButton" type="button" class="danger-button" onclick="runBatchStatusUpdate('disabled')">批量禁用</button>
          <button id="accountBulkEnableButton" type="button" class="secondary-button" onclick="runBatchStatusUpdate('active')">批量恢复</button>
          <button id="accountBulkRevokeButton" type="button" class="secondary-button" onclick="runBatchRevokeSessions()">批量撤销会话</button>
        </div>
        <div id="accountBulkSelectionStatus" class="status-line">当前未勾选账号。</div>
        <div id="accountBulkActionStatus" class="status-line"></div>
      </div>
    </section>

    <section class="panel">
      <h2>筛选摘要</h2>
      <div id="accountSummaryGrid" class="summary-grid"></div>
    </section>

    <section class="panel">
      <h2>筛选报表与导出</h2>
      <p class="muted">报表和导出走的是同一套筛选条件，别一边看风险账号，一边把全部账号 CSV 拖去甩锅。当前这片先给你筛选摘要、治理审计汇总和当前筛选结果导出，详情、报表和 CSV 里的手机号 / 设备标识也已经做了第一片脱敏；定时报表和更细的脱敏策略还得后面继续补。</p>
      <div class="filters-grid">
        <label>Top 风险账号<input id="accountReportTopAccountsLimitInput" type="number" min="1" max="20" value="5" /></label>
        <label>近期审计事件<input id="accountReportAuditEventLimitInput" type="number" min="1" max="20" value="10" /></label>
        <div class="session-row" style="margin-top:0;">
          <button id="loadAccountReportButton" type="button" style="width:auto;" onclick="loadAccountReport()">刷新报表</button>
          <button id="exportAccountCsvButton" type="button" class="secondary-button" onclick="exportAdminAuthAccountsCsv()">导出 CSV</button>
        </div>
      </div>
      <div id="accountReportStatus" class="status-line">当前还没拉账号报表，先别在脑子里编趋势图。</div>
      <div id="accountExportStatus" class="status-line"></div>
      <div id="accountReportTimestamp" class="status-line">报表时间：-</div>
      <section class="workspace-grid" style="margin-top:18px;">
        <div class="stack-list">
          <div id="accountStatusReport"></div>
          <div id="accountUserTypeReport"></div>
          <div id="accountRiskTagReport"></div>
        </div>
        <div class="stack-list">
          <div id="accountGovernanceReport"></div>
          <div id="accountTopRiskReport"></div>
        </div>
      </section>
    </section>

    <section class="workspace-grid">
      <section class="panel">
        <h2>账号列表</h2>
        <div id="accountList" class="account-list"></div>
        <div class="pagination-row">
          <button id="accountPreviousPageButton" type="button" class="secondary-button" onclick="changeAccountPage(-1)">上一页</button>
          <button id="accountNextPageButton" type="button" class="secondary-button" onclick="changeAccountPage(1)">下一页</button>
        </div>
      </section>

      <section class="panel">
        <h2>账号详情与处置</h2>
        <div id="accountDetailNotice" class="notice"></div>
        <div id="accountDetailStatus" class="status-line">点左边一条账号再看详情，不然这块儿只能空着。</div>
        <div id="accountDetailShell"></div>
      </section>
    </section>
  </main>

  <script>
    const apiBase = '/api';
    let latestAccountRequestId = 0;
    let latestAccountDetailRequestId = 0;
    let latestAccountReportRequestId = 0;
    let currentAccountPage = 1;
    let currentAccountTotal = 0;
    let currentAccountItems = [];
    let currentAccountDetail = null;
    let currentAccountReport = null;
    const selectedAccountIds = new Set();
    ${renderAdminSessionScript({
      currentRoute: '/api/admin/account-management-console',
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
      return String(value ?? '').replace(/[&<>"']/g, function(character) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
      });
    }

    function formatTime(value) {
      return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-';
    }

    function formatCount(value) {
      return Number(value || 0).toLocaleString('zh-CN');
    }

    function formatUserType(userType) {
      if (userType === 'shipper') {
        return '货主';
      }
      if (userType === 'driver') {
        return '司机';
      }
      if (userType === 'admin') {
        return '管理员';
      }
      return userType || '未知';
    }

    function formatAccountStatus(status) {
      return status === 'disabled' ? '已禁用' : '正常';
    }

    function formatRiskLevel(level) {
      if (level === 'high') {
        return '高风险';
      }
      if (level === 'warning') {
        return '提示';
      }
      return '无风险';
    }

    function formatRiskTag(tag) {
      if (tag === 'shared_device') {
        return '共享设备';
      }
      if (tag === 'high_session_volume') {
        return '高会话量';
      }
      if (tag === 'admin_multi_device') {
        return '多设备 admin';
      }
      return tag || '未知风险';
    }

    function formatAuditAction(action) {
      if (action === 'revoke_session') {
        return '单会话强退';
      }
      if (action === 'revoke_other_sessions') {
        return '撤销当前账号其它设备';
      }
      if (action === 'revoke_account_sessions') {
        return '按账号撤销全部会话';
      }
      return action || '未知动作';
    }

    function formatAuditResult(result) {
      return result === 'revoked' ? '已撤销' : '无变更';
    }

    function accountPageSizeValue() {
      const value = Number(document.getElementById('accountPageSizeInput').value || 20);
      if (!Number.isInteger(value) || value < 1 || value > 50) {
        throw new Error('每页数量必须在 1 到 50 之间');
      }
      return value;
    }

    function accountRiskOnlyValue() {
      return document.getElementById('accountRiskOnlyInput').value === 'true';
    }

    function buildAccountFilterQuery() {
      const query = new URLSearchParams();
      const userType = document.getElementById('accountUserTypeInput').value;
      const status = document.getElementById('accountStatusInput').value;
      const keyword = document.getElementById('accountKeywordInput').value.trim();
      const riskTag = document.getElementById('accountRiskTagInput').value;
      const riskLevel = document.getElementById('accountRiskLevelInput').value;
      if (userType) {
        query.set('userType', userType);
      }
      if (status) {
        query.set('status', status);
      }
      if (keyword) {
        query.set('keyword', keyword);
      }
      if (accountRiskOnlyValue()) {
        query.set('riskOnly', 'true');
      }
      if (riskTag) {
        query.set('riskTag', riskTag);
      }
      if (riskLevel) {
        query.set('riskLevel', riskLevel);
      }
      return query;
    }

    function buildAccountQuery(page) {
      const query = buildAccountFilterQuery();
      query.set('page', String(Math.max(1, page)));
      query.set('pageSize', String(accountPageSizeValue()));
      return query;
    }

    function accountReportTopAccountsLimitValue() {
      const value = Number(document.getElementById('accountReportTopAccountsLimitInput').value || 5);
      if (!Number.isInteger(value) || value < 1 || value > 20) {
        throw new Error('Top 风险账号数量必须在 1 到 20 之间');
      }
      return value;
    }

    function accountReportAuditEventLimitValue() {
      const value = Number(document.getElementById('accountReportAuditEventLimitInput').value || 10);
      if (!Number.isInteger(value) || value < 1 || value > 20) {
        throw new Error('审计事件数量必须在 1 到 20 之间');
      }
      return value;
    }

    function buildAccountReportQuery() {
      const query = buildAccountFilterQuery();
      query.set('topAccountsLimit', String(accountReportTopAccountsLimitValue()));
      query.set('auditEventLimit', String(accountReportAuditEventLimitValue()));
      return query;
    }

    function buildAccountExportQuery() {
      return buildAccountFilterQuery();
    }

    function selectedAccountUserIds() {
      return Array.from(selectedAccountIds);
    }

    function setAccountReportControlsDisabled(disabled) {
      document.getElementById('accountReportTopAccountsLimitInput').disabled = disabled;
      document.getElementById('accountReportAuditEventLimitInput').disabled = disabled;
      document.getElementById('loadAccountReportButton').disabled = disabled;
      document.getElementById('exportAccountCsvButton').disabled = disabled;
    }

    function extractDownloadFilename(contentDisposition) {
      const matched = /filename="?([^";]+)"?/i.exec(contentDisposition || '');
      return matched ? matched[1] : 'admin-auth-accounts.csv';
    }

    async function refreshAccountWorkspace(page) {
      const targetPage = Math.max(1, page || currentAccountPage || 1);
      await Promise.all([
        loadAdminAuthAccounts(targetPage),
        loadAccountReport(),
      ]);
    }

    async function loadAccountReport() {
      const requestId = ++latestAccountReportRequestId;
      document.getElementById('accountReportStatus').textContent = '正在拉账号报表...';
      setAccountReportControlsDisabled(true);
      try {
        const query = buildAccountReportQuery();
        const report = await api('/admin/auth/accounts/report?' + query.toString());
        if (requestId !== latestAccountReportRequestId) return;
        renderAccountReport(report);
        document.getElementById('accountReportStatus').textContent =
          '报表已刷新：筛选账号 ' +
          formatCount(report && report.summary && report.summary.totalUserCount) +
          ' 个，近期审计 ' +
          formatCount(Array.isArray(report && report.recentAuditEvents) ? report.recentAuditEvents.length : 0) +
          ' 条。';
      } catch (error) {
        if (requestId !== latestAccountReportRequestId) return;
        document.getElementById('accountReportStatus').textContent =
          '账号报表拉取失败，先别拿空白当趋势。';
        renderAccountReportError(error.message);
      } finally {
        if (requestId !== latestAccountReportRequestId) return;
        setAccountReportControlsDisabled(false);
      }
    }

    async function exportAdminAuthAccountsCsv() {
      let accessToken;
      let query;
      document.getElementById('accountExportStatus').textContent = '';
      setAccountReportControlsDisabled(true);
      try {
        accessToken = token();
        query = buildAccountExportQuery();
      } catch (error) {
        document.getElementById('accountExportStatus').textContent = error.message;
        return;
      }

      document.getElementById('accountExportStatus').textContent = '正在导出当前筛选账号 CSV...';
      try {
        const response = await fetch(
          apiBase + '/admin/auth/accounts/export?' + query.toString(),
          {
            headers: {
              Authorization: 'Bearer ' + accessToken,
            },
          },
        );
        const responseText = await response.text();
        if (!response.ok) {
          let errorMessage = '账号 CSV 导出失败';
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

        document.getElementById('accountExportStatus').textContent =
          'CSV 导出已触发，按当前筛选条件输出账号 ' +
          formatCount(
            currentAccountReport && currentAccountReport.summary
              ? currentAccountReport.summary.totalUserCount
              : currentAccountTotal,
          ) +
          ' 个。';
      } catch (error) {
        document.getElementById('accountExportStatus').textContent =
          'CSV 导出失败：' + error.message;
      } finally {
        setAccountReportControlsDisabled(false);
      }
    }

    function updateAccountBulkSelectionUi() {
      const currentPageUserIds = currentAccountItems.map(function(account) {
        return account.userId;
      });
      const currentPageSelectedCount = currentPageUserIds.filter(function(userId) {
        return selectedAccountIds.has(userId);
      }).length;
      const selectedCount = selectedAccountIds.size;
      const selectAllInput = document.getElementById('accountSelectAllInput');
      if (selectAllInput) {
        selectAllInput.disabled = currentPageUserIds.length === 0;
        selectAllInput.checked =
          currentPageUserIds.length > 0 &&
          currentPageSelectedCount === currentPageUserIds.length;
        selectAllInput.indeterminate =
          currentPageSelectedCount > 0 &&
          currentPageSelectedCount < currentPageUserIds.length;
      }
      document.getElementById('accountBulkSelectionStatus').textContent =
        selectedCount === 0
          ? '当前未勾选账号。'
          : '已勾选 ' + selectedCount + ' 个账号，其中当前页 ' +
            currentPageSelectedCount + ' 个。';
      [
        'accountBulkDisableButton',
        'accountBulkEnableButton',
        'accountBulkRevokeButton',
      ].forEach(function(id) {
        const button = document.getElementById(id);
        if (button) {
          button.disabled = selectedCount === 0;
        }
      });
    }

    function toggleAccountSelection(userId, checked) {
      if (checked) {
        selectedAccountIds.add(userId);
      } else {
        selectedAccountIds.delete(userId);
      }
      updateAccountBulkSelectionUi();
    }

    function toggleSelectAllCurrentPage(checked) {
      currentAccountItems.forEach(function(account) {
        if (checked) {
          selectedAccountIds.add(account.userId);
        } else {
          selectedAccountIds.delete(account.userId);
        }
      });
      renderAccountList(currentAccountItems);
      updateAccountBulkSelectionUi();
    }

    function clearSelectedAccounts() {
      selectedAccountIds.clear();
      renderAccountList(currentAccountItems);
      updateAccountBulkSelectionUi();
      document.getElementById('accountBulkActionStatus').textContent = '已清空批量勾选。';
    }

    async function refreshAccountWorkspaceAfterMutation() {
      const detailUserId = currentAccountDetail && currentAccountDetail.account
        ? currentAccountDetail.account.userId
        : '';
      await Promise.all([
        loadAdminAuthAccounts(currentAccountPage),
        loadAccountReport(),
      ]);
      if (detailUserId) {
        await loadAdminAuthAccountDetail(detailUserId);
      }
    }

    async function runBatchStatusUpdate(status) {
      const userIds = selectedAccountUserIds();
      const actionLabel = status === 'disabled' ? '批量禁用' : '批量恢复';
      if (!userIds.length) {
        document.getElementById('accountBulkActionStatus').textContent =
          '先勾选账号再' + actionLabel + '，别对着空气下命令。';
        return;
      }
      let successCount = 0;
      let revokedSessionCount = 0;
      const failures = [];
      document.getElementById('accountBulkActionStatus').textContent =
        actionLabel + '执行中，共 ' + userIds.length + ' 个账号。';
      for (const userId of userIds) {
        try {
          const data = await api('/admin/auth/accounts/' + encodeURIComponent(userId) + '/status', {
            method: 'POST',
            body: JSON.stringify({ status }),
          });
          successCount += 1;
          revokedSessionCount += Number(data.revokedSessionCount || 0);
          selectedAccountIds.delete(userId);
        } catch (error) {
          failures.push(userId + '（' + error.message + '）');
        }
      }
      document.getElementById('accountBulkActionStatus').textContent =
        actionLabel + '完成：成功 ' + successCount + ' 个，失败 ' + failures.length + ' 个' +
        (status === 'disabled' ? '，累计撤销会话 ' + revokedSessionCount + ' 条。' : '。') +
        (failures.length ? ' 失败详情：' + failures.join('；') : '');
      await refreshAccountWorkspaceAfterMutation();
      updateAccountBulkSelectionUi();
    }

    async function runBatchRevokeSessions() {
      const userIds = selectedAccountUserIds();
      if (!userIds.length) {
        document.getElementById('accountBulkActionStatus').textContent =
          '先勾选账号再批量撤销会话，别拿控制台当许愿池。';
        return;
      }
      let successCount = 0;
      let totalRevokedCount = 0;
      const failures = [];
      document.getElementById('accountBulkActionStatus').textContent =
        '批量撤销会话执行中，共 ' + userIds.length + ' 个账号。';
      for (const userId of userIds) {
        try {
          const data = await api(
            '/admin/auth/accounts/' + encodeURIComponent(userId) + '/revoke-sessions',
            {
              method: 'POST',
              body: JSON.stringify({}),
            },
          );
          successCount += 1;
          totalRevokedCount += Number(data.revokedCount || 0);
          selectedAccountIds.delete(userId);
        } catch (error) {
          failures.push(userId + '（' + error.message + '）');
        }
      }
      document.getElementById('accountBulkActionStatus').textContent =
        '批量撤销会话完成：成功 ' + successCount + ' 个，失败 ' + failures.length +
        ' 个，累计撤销 ' + totalRevokedCount + ' 条会话。' +
        (failures.length ? ' 失败详情：' + failures.join('；') : '');
      await refreshAccountWorkspaceAfterMutation();
      updateAccountBulkSelectionUi();
    }

    function renderAccountSummary(summary) {
      const safeSummary = summary && typeof summary === 'object' ? summary : {};
      const items = [
        { label: '筛选后账号', value: Number(safeSummary.totalUserCount || 0), tone: 'neutral' },
        { label: '正常账号', value: Number(safeSummary.activeUserCount || 0), tone: 'positive' },
        { label: '已禁用', value: Number(safeSummary.disabledUserCount || 0), tone: 'warning' },
        { label: '风险账号', value: Number(safeSummary.riskyUserCount || 0), tone: 'warning' },
        { label: '高风险账号', value: Number(safeSummary.highRiskUserCount || 0), tone: 'warning' },
        { label: '有会话账号', value: Number(safeSummary.activeSessionUserCount || 0), tone: 'neutral' },
      ];
      document.getElementById('accountSummaryGrid').innerHTML = items.map(function(item) {
        return '<div class="summary-card">' +
          '<span>' + escapeHtml(item.label) + '</span>' +
          '<strong>' + escapeHtml(formatCount(item.value)) + '</strong>' +
        '</div>';
      }).join('');
    }

    function renderAccountReportMetaCard(title, items, footnote) {
      return '<div class="detail-card">' +
        '<h3>' + escapeHtml(title) + '</h3>' +
        '<div class="meta-grid">' +
          items.map(function(item) {
            return '<div class="meta-item">' +
              '<span>' + escapeHtml(item.label) + '</span>' +
              '<strong>' + escapeHtml(item.value) + '</strong>' +
            '</div>';
          }).join('') +
        '</div>' +
        (footnote
          ? '<p class="footnote">' + escapeHtml(footnote) + '</p>'
          : '') +
      '</div>';
    }

    function renderAccountGovernanceReport(summary, recentAuditEvents) {
      const actionBreakdown = Array.isArray(summary && summary.actionBreakdown)
        ? summary.actionBreakdown
        : [];
      const recentEvents = Array.isArray(recentAuditEvents) ? recentAuditEvents : [];
      return '<div class="detail-card">' +
        '<h3>治理审计汇总</h3>' +
        '<div class="meta-grid">' +
          '<div class="meta-item"><span>审计事件</span><strong>' + escapeHtml(formatCount(summary && summary.totalEventCount)) + '</strong></div>' +
          '<div class="meta-item"><span>累计撤销会话</span><strong>' + escapeHtml(formatCount(summary && summary.totalRevokedSessionCount)) + '</strong></div>' +
          '<div class="meta-item"><span>最近审计</span><strong>' + escapeHtml(formatTime(summary && summary.latestEventCreatedAtIso)) + '</strong></div>' +
          '<div class="meta-item"><span>动作分布</span><strong>' + escapeHtml(String(actionBreakdown.length)) + ' 类</strong></div>' +
        '</div>' +
        '<div class="chip-row">' +
          actionBreakdown.map(function(item) {
            return '<span class="risk-chip none">' +
              escapeHtml(formatAuditAction(item.action) + '：' + formatCount(item.eventCount) + ' 次 / ' + formatCount(item.revokedSessionCount) + ' 条') +
            '</span>';
          }).join('') +
        '</div>' +
        '<div class="detail-section">' +
          '<h3 style="font-size:16px;">近期审计事件</h3>' +
          '<div class="stack-list">' +
            (recentEvents.length
              ? recentEvents.map(function(event) {
                  return '<div class="audit-card">' +
                    '<div class="audit-card-top">' +
                      '<div>' +
                        '<span class="eyebrow">' + escapeHtml(formatAuditAction(event.action)) + '</span>' +
                        '<h3 style="margin-top:10px;">' + escapeHtml(event.actorAdminPhone) + '</h3>' +
                        '<p class="muted">审计时间：' + escapeHtml(formatTime(event.createdAtIso)) + '</p>' +
                      '</div>' +
                      '<span class="audit-chip ' + escapeHtml(event.result || 'noop') + '">' +
                        escapeHtml(formatAuditResult(event.result)) +
                      '</span>' +
                    '</div>' +
                    '<div class="chip-row">' +
                      (Array.isArray(event.subjects) && event.subjects.length
                        ? event.subjects.map(function(subject) {
                            return '<span class="risk-chip none">' +
                              escapeHtml(subject.userPhone + ' · ' + subject.deviceId) +
                            '</span>';
                          }).join('')
                        : '<span class="risk-chip none">无命中 subject</span>') +
                    '</div>' +
                  '</div>';
                }).join('')
              : '<div class="empty-card"><h3>暂无近期审计</h3><p class="muted">当前筛选结果还没命中治理审计事件，说明这坨账号暂时没被后台动过。</p></div>') +
          '</div>' +
        '</div>' +
      '</div>';
    }

    function renderAccountTopRiskReport(accounts) {
      const items = Array.isArray(accounts) ? accounts : [];
      return '<div class="detail-card">' +
        '<h3>Top 风险账号</h3>' +
        '<div class="stack-list">' +
          (items.length
            ? items.map(function(account) {
                const riskTags = Array.isArray(account.riskTags) ? account.riskTags : [];
                return '<div class="session-card">' +
                  '<div class="account-card-top">' +
                    '<div>' +
                      '<span class="eyebrow">' + escapeHtml(formatUserType(account.userType)) + '</span>' +
                      '<h3 style="margin-top:10px;">' + escapeHtml(account.userPhone) + '</h3>' +
                      '<p class="muted">用户 ID：' + escapeHtml(account.userId) + '</p>' +
                    '</div>' +
                    '<span class="risk-chip ' + escapeHtml(account.riskLevel || 'none') + '">' +
                      escapeHtml(formatRiskLevel(account.riskLevel)) +
                    '</span>' +
                  '</div>' +
                  '<div class="chip-row">' +
                    (riskTags.length
                      ? riskTags.map(function(tag) {
                          return '<span class="risk-chip ' + escapeHtml(account.riskLevel || 'none') + '">' +
                            escapeHtml(formatRiskTag(tag)) +
                          '</span>';
                        }).join('')
                      : '<span class="risk-chip none">暂无明显风险</span>') +
                  '</div>' +
                  '<div class="meta-grid">' +
                    '<div class="meta-item"><span>活跃会话</span><strong>' + escapeHtml(formatCount(account.activeSessionCount)) + '</strong></div>' +
                    '<div class="meta-item"><span>活跃设备</span><strong>' + escapeHtml(formatCount(account.activeDeviceCount)) + '</strong></div>' +
                    '<div class="meta-item"><span>账号状态</span><strong>' + escapeHtml(formatAccountStatus(account.status)) + '</strong></div>' +
                    '<div class="meta-item"><span>最近会话</span><strong>' + escapeHtml(formatTime(account.latestSessionCreatedAtIso)) + '</strong></div>' +
                  '</div>' +
                '</div>';
              }).join('')
            : '<div class="empty-card"><h3>暂无风险账号</h3><p class="muted">当前筛选命中的账号没有明显风险标签，这回总算不是一锅粥。</p></div>') +
        '</div>' +
      '</div>';
    }

    function renderAccountReportPlaceholder(title, message) {
      return '<div class="empty-card"><h3>' + escapeHtml(title) + '</h3><p class="muted">' +
        escapeHtml(message) +
      '</p></div>';
    }

    function renderAccountReport(report) {
      currentAccountReport = report && typeof report === 'object' ? report : null;
      document.getElementById('accountReportTimestamp').textContent =
        '报表时间：' + escapeHtml(formatTime(report && report.generatedAtIso));
      document.getElementById('accountStatusReport').innerHTML =
        renderAccountReportMetaCard(
          '账号状态分布',
          (Array.isArray(report && report.statusBreakdown) ? report.statusBreakdown : []).map(function(item) {
            return {
              label: formatAccountStatus(item.status),
              value: formatCount(item.userCount),
            };
          }),
          '这里看的是当前筛选命中的状态分布，不是全平台总账。',
        );
      document.getElementById('accountUserTypeReport').innerHTML =
        renderAccountReportMetaCard(
          '角色分布',
          (Array.isArray(report && report.userTypeBreakdown) ? report.userTypeBreakdown : []).map(function(item) {
            return {
              label: formatUserType(item.userType),
              value:
                '账号 ' + formatCount(item.userCount) +
                ' / 风险 ' + formatCount(item.riskyUserCount) +
                ' / 禁用 ' + formatCount(item.disabledUserCount),
            };
          }),
          '同一角色里顺手把风险和禁用量一起带出来，省得你来回切筛选。',
        );
      document.getElementById('accountRiskTagReport').innerHTML =
        renderAccountReportMetaCard(
          '风险标签分布',
          (Array.isArray(report && report.riskTagBreakdown) ? report.riskTagBreakdown : []).map(function(item) {
            return {
              label: formatRiskTag(item.riskTag),
              value: formatCount(item.userCount),
            };
          }),
          '风险标签按账号聚合，不是按会话条数胡乱累加。',
        );
      document.getElementById('accountGovernanceReport').innerHTML =
        renderAccountGovernanceReport(
          report && report.governanceAuditSummary ? report.governanceAuditSummary : {},
          report && report.recentAuditEvents,
        );
      document.getElementById('accountTopRiskReport').innerHTML =
        renderAccountTopRiskReport(report && report.topRiskAccounts);
    }

    function resetAccountReport(message) {
      currentAccountReport = null;
      document.getElementById('accountReportTimestamp').textContent = '报表时间：-';
      [
        ['accountStatusReport', '账号状态分布'],
        ['accountUserTypeReport', '角色分布'],
        ['accountRiskTagReport', '风险标签分布'],
        ['accountGovernanceReport', '治理审计汇总'],
        ['accountTopRiskReport', 'Top 风险账号'],
      ].forEach(function(entry) {
        document.getElementById(entry[0]).innerHTML =
          renderAccountReportPlaceholder(entry[1], message);
      });
    }

    function renderAccountReportError(message) {
      resetAccountReport(message);
    }

    function renderAccountList(items) {
      const list = document.getElementById('accountList');
      if (!Array.isArray(items) || !items.length) {
        list.innerHTML = '<div class="empty-card"><h3>暂无账号记录</h3><p class="muted">当前筛选条件下没有命中的平台账号，这回总算不是你眼神不好。</p></div>';
        return;
      }
      const selectedUserId = currentAccountDetail && currentAccountDetail.account
        ? currentAccountDetail.account.userId
        : '';
      list.innerHTML = items.map(function(account) {
        const isActive = selectedUserId === account.userId;
        const isSelected = selectedAccountIds.has(account.userId);
        const riskTags = Array.isArray(account.riskTags) ? account.riskTags : [];
        return '<article class="account-card' + (isActive ? ' active' : '') + '">' +
          '<div class="account-card-top">' +
            '<div>' +
              '<span class="eyebrow">' + escapeHtml(formatUserType(account.userType)) + '</span>' +
              '<h3 style="margin-top:10px;">' + escapeHtml(account.userPhone) + '</h3>' +
              '<p class="muted">用户 ID：' + escapeHtml(account.userId) + '</p>' +
            '</div>' +
            '<div class="account-card-actions">' +
              '<label class="checkbox-label"><input type="checkbox" ' +
                (isSelected ? 'checked ' : '') +
                'onchange="toggleAccountSelection(\\'' + escapeHtml(account.userId) + '\\', this.checked)" />纳入批量</label>' +
              '<span class="status-chip ' + escapeHtml(account.status || 'active') + '">' +
                escapeHtml(formatAccountStatus(account.status)) +
              '</span>' +
            '</div>' +
          '</div>' +
          '<div class="chip-row">' +
            '<span class="risk-chip ' + escapeHtml(account.riskLevel || 'none') + '">' +
              escapeHtml(formatRiskLevel(account.riskLevel)) +
            '</span>' +
            (riskTags.length
              ? riskTags.map(function(tag) {
                  return '<span class="risk-chip ' + escapeHtml(account.riskLevel || 'none') + '">' +
                    escapeHtml(formatRiskTag(tag)) +
                  '</span>';
                }).join('')
              : '<span class="risk-chip none">暂无明显风险</span>') +
          '</div>' +
          '<div class="meta-grid">' +
            '<div class="meta-item"><span>活跃会话</span><strong>' + escapeHtml(formatCount(account.activeSessionCount)) + '</strong></div>' +
            '<div class="meta-item"><span>活跃设备</span><strong>' + escapeHtml(formatCount(account.activeDeviceCount)) + '</strong></div>' +
            '<div class="meta-item"><span>创建时间</span><strong>' + escapeHtml(formatTime(account.createdAtIso)) + '</strong></div>' +
            '<div class="meta-item"><span>最后活跃会话</span><strong>' + escapeHtml(formatTime(account.latestSessionCreatedAtIso)) + '</strong></div>' +
          '</div>' +
          '<div class="session-row">' +
            '<button type="button" class="secondary-button" onclick="loadAdminAuthAccountDetail(\\'' + escapeHtml(account.userId) + '\\')">查看详情</button>' +
          '</div>' +
        '</article>';
      }).join('');
    }

    function renderAccountPagination(page, pageSize, total) {
      const maxPage = Math.max(1, Math.ceil(total / pageSize));
      document.getElementById('accountPaginationStatus').textContent =
        '账号第 ' + page + ' 页 / 共 ' + maxPage + ' 页，当前页 ' +
        Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize)) +
        ' 条，命中 ' + total + ' 条账号。';
      document.getElementById('accountPreviousPageButton').disabled = page <= 1;
      document.getElementById('accountNextPageButton').disabled = page >= maxPage;
    }

    function renderAccountSessionList(sessions) {
      if (!Array.isArray(sessions) || !sessions.length) {
        return '<div class="empty-card"><h3>暂无活跃会话</h3><p class="muted">这个账号当前没有活跃 refresh 会话，说明至少不用急着踢人。</p></div>';
      }
      return sessions.map(function(session) {
        const riskTags = Array.isArray(session.riskTags) ? session.riskTags : [];
        return '<div class="session-card">' +
          '<div class="account-card-top">' +
            '<div>' +
              '<span class="eyebrow">' + escapeHtml(formatUserType(session.userType)) + '</span>' +
              '<h3 style="margin-top:10px;">' + escapeHtml(session.deviceId) + '</h3>' +
              '<p class="muted">session：' + escapeHtml(session.id) + '</p>' +
            '</div>' +
            '<span class="risk-chip ' + escapeHtml(session.riskLevel || 'none') + '">' +
              escapeHtml(formatRiskLevel(session.riskLevel)) +
            '</span>' +
          '</div>' +
          '<div class="chip-row">' +
            (riskTags.length
              ? riskTags.map(function(tag) {
                  return '<span class="risk-chip ' + escapeHtml(session.riskLevel || 'none') + '">' +
                    escapeHtml(formatRiskTag(tag)) +
                  '</span>';
                }).join('')
              : '<span class="risk-chip none">暂无明显风险</span>') +
          '</div>' +
          '<div class="meta-grid">' +
            '<div class="meta-item"><span>创建时间</span><strong>' + escapeHtml(formatTime(session.createdAtIso)) + '</strong></div>' +
            '<div class="meta-item"><span>过期时间</span><strong>' + escapeHtml(formatTime(session.expiresAtIso)) + '</strong></div>' +
            '<div class="meta-item"><span>同设备会话</span><strong>' + escapeHtml(formatCount(session.riskContext && session.riskContext.deviceSessionCount)) + '</strong></div>' +
            '<div class="meta-item"><span>当前账号会话</span><strong>' + escapeHtml(formatCount(session.riskContext && session.riskContext.userSessionCount)) + '</strong></div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function renderAccountAuditList(events) {
      if (!Array.isArray(events) || !events.length) {
        return '<div class="empty-card"><h3>暂无治理审计</h3><p class="muted">这个账号最近没留下会话治理审计记录，至少这块现在还算干净。</p></div>';
      }
      return events.map(function(event) {
        const subjects = Array.isArray(event.subjects) ? event.subjects : [];
        return '<div class="audit-card">' +
          '<div class="audit-card-top">' +
            '<div>' +
              '<span class="eyebrow">' + escapeHtml(formatAuditAction(event.action)) + '</span>' +
              '<h3 style="margin-top:10px;">' + escapeHtml(event.actorAdminPhone) + '</h3>' +
              '<p class="muted">adminId：' + escapeHtml(event.actorAdminId) + '</p>' +
            '</div>' +
            '<span class="audit-chip ' + escapeHtml(event.result || 'noop') + '">' +
              escapeHtml(formatAuditResult(event.result)) +
            '</span>' +
          '</div>' +
          '<div class="meta-grid">' +
            '<div class="meta-item"><span>撤销条数</span><strong>' + escapeHtml(formatCount(event.revokedCount)) + '</strong></div>' +
            '<div class="meta-item"><span>审计时间</span><strong>' + escapeHtml(formatTime(event.createdAtIso)) + '</strong></div>' +
            '<div class="meta-item"><span>请求会话</span><strong>' + escapeHtml(event.requestedSessionId || '-') + '</strong></div>' +
            '<div class="meta-item"><span>保留设备</span><strong>' + escapeHtml(event.currentDeviceId || '-') + '</strong></div>' +
          '</div>' +
          '<div class="chip-row">' +
            (subjects.length
              ? subjects.map(function(subject) {
                  return '<span class="risk-chip none">' +
                    escapeHtml(subject.userPhone + ' · ' + subject.deviceId) +
                  '</span>';
                }).join('')
              : '<span class="risk-chip none">无命中 subject</span>') +
          '</div>' +
        '</div>';
      }).join('');
    }

    function resetAccountDetail() {
      currentAccountDetail = null;
      document.getElementById('accountDetailStatus').textContent = '点左边一条账号再看详情，不然这块儿只能空着。';
      document.getElementById('accountDetailShell').innerHTML =
        '<div class="empty-card"><h3>未选择账号</h3><p class="muted">先从左边选一条账号，再决定是冻结、解冻还是按账号撤销会话。别闭眼乱点。</p></div>';
    }

    function renderAccountDetail(detail) {
      currentAccountDetail = detail;
      const account = detail && detail.account ? detail.account : null;
      if (!account) {
        resetAccountDetail();
        return;
      }
      const riskTags = Array.isArray(account.riskTags) ? account.riskTags : [];
      document.getElementById('accountDetailStatus').textContent =
        '已选中账号：' + account.userPhone + '（' + account.userId + '）';
      document.getElementById('accountDetailShell').innerHTML =
        '<div class="detail-card">' +
          '<div class="detail-card-top">' +
            '<div>' +
              '<span class="eyebrow">' + escapeHtml(formatUserType(account.userType)) + '</span>' +
              '<h3 style="margin-top:10px;">' + escapeHtml(account.userPhone) + '</h3>' +
              '<p class="muted">用户 ID：' + escapeHtml(account.userId) + '</p>' +
            '</div>' +
            '<span class="status-chip ' + escapeHtml(account.status || 'active') + '">' +
              escapeHtml(formatAccountStatus(account.status)) +
            '</span>' +
          '</div>' +
          '<div class="chip-row">' +
            '<span class="risk-chip ' + escapeHtml(account.riskLevel || 'none') + '">' +
              escapeHtml(formatRiskLevel(account.riskLevel)) +
            '</span>' +
            (riskTags.length
              ? riskTags.map(function(tag) {
                  return '<span class="risk-chip ' + escapeHtml(account.riskLevel || 'none') + '">' +
                    escapeHtml(formatRiskTag(tag)) +
                  '</span>';
                }).join('')
              : '<span class="risk-chip none">暂无明显风险</span>') +
          '</div>' +
          '<div class="meta-grid">' +
            '<div class="meta-item"><span>活跃会话</span><strong>' + escapeHtml(formatCount(account.activeSessionCount)) + '</strong></div>' +
            '<div class="meta-item"><span>活跃设备</span><strong>' + escapeHtml(formatCount(account.activeDeviceCount)) + '</strong></div>' +
            '<div class="meta-item"><span>创建时间</span><strong>' + escapeHtml(formatTime(account.createdAtIso)) + '</strong></div>' +
            '<div class="meta-item"><span>更新时间</span><strong>' + escapeHtml(formatTime(account.updatedAtIso)) + '</strong></div>' +
          '</div>' +
          '<div class="detail-section">' +
            '<div class="action-grid">' +
              '<button id="accountStatusActionButton" type="button" class="' + (account.status === 'disabled' ? 'secondary-button' : 'danger-button') + '" onclick="toggleSelectedAccountStatus()">' +
                escapeHtml(account.status === 'disabled' ? '恢复账号' : '禁用账号') +
              '</button>' +
              '<button type="button" class="secondary-button" onclick="revokeAdminAuthAccountSessions()">按账号撤销会话</button>' +
            '</div>' +
            '<label style="margin-top:12px;">保留一个 sessionId（可选）<input id="accountKeepSessionIdInput" placeholder="550e8400-e29b-41d4-a716-446655440112" /></label>' +
            '<p class="footnote">禁用账号会立即撤销该账号所有活跃 refresh 会话；解冻只允许后续重新登录，不会把旧会话诈尸回来。</p>' +
          '</div>' +
        '</div>' +
        '<div class="detail-section">' +
          '<h3>活跃会话</h3>' +
          '<div id="accountSessionList" class="stack-list">' + renderAccountSessionList(detail.activeSessions) + '</div>' +
        '</div>' +
        '<div class="detail-section">' +
          '<h3>近期治理审计</h3>' +
          '<div id="accountAuditList" class="stack-list">' + renderAccountAuditList(detail.recentAuditEvents) + '</div>' +
        '</div>';
    }

    async function loadAdminAuthAccounts(page) {
      const requestId = ++latestAccountRequestId;
      document.getElementById('accountNotice').textContent = '';
      const requestedPage = Math.max(1, page || 1);
      document.getElementById('accountPaginationStatus').textContent = '正在拉账号目录...';
      try {
        const query = buildAccountQuery(requestedPage);
        const data = await api('/admin/auth/accounts?' + query.toString());
        if (requestId !== latestAccountRequestId) return;
        currentAccountPage = data.page || requestedPage;
        currentAccountTotal = data.total || 0;
        currentAccountItems = Array.isArray(data.items) ? data.items : [];
        renderAccountSummary(data.summary);
        renderAccountList(currentAccountItems);
        renderAccountPagination(
          currentAccountPage,
          data.pageSize || accountPageSizeValue(),
          currentAccountTotal,
        );
        updateAccountBulkSelectionUi();
      } catch (error) {
        if (requestId !== latestAccountRequestId) return;
        document.getElementById('accountNotice').textContent = error.message;
        document.getElementById('accountPaginationStatus').textContent = '账号目录拉取失败，先别拿猜的当事实。';
        currentAccountItems = [];
        renderAccountSummary();
        document.getElementById('accountList').innerHTML = '';
        document.getElementById('accountPreviousPageButton').disabled = true;
        document.getElementById('accountNextPageButton').disabled = true;
        updateAccountBulkSelectionUi();
        resetAccountDetail();
      }
    }

    async function loadAdminAuthAccountDetail(userId) {
      const requestId = ++latestAccountDetailRequestId;
      document.getElementById('accountDetailNotice').textContent = '';
      document.getElementById('accountDetailStatus').textContent = '正在拉账号详情...';
      try {
        const detail = await api('/admin/auth/accounts/' + encodeURIComponent(userId));
        if (requestId !== latestAccountDetailRequestId) return;
        renderAccountDetail(detail);
        renderAccountListFromCurrentPage();
      } catch (error) {
        if (requestId !== latestAccountDetailRequestId) return;
        document.getElementById('accountDetailNotice').textContent = error.message;
        resetAccountDetail();
      }
    }

    function renderAccountListFromCurrentPage() {
      const cards = document.querySelectorAll('#accountList .account-card');
      const selectedUserId = currentAccountDetail && currentAccountDetail.account
        ? currentAccountDetail.account.userId
        : '';
      cards.forEach(function(card) {
        const button = card.querySelector('button');
        const onclick = button ? button.getAttribute('onclick') || '' : '';
        if (selectedUserId && onclick.indexOf(selectedUserId) >= 0) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });
    }

    function selectedAccountUserId() {
      if (!currentAccountDetail || !currentAccountDetail.account) {
        throw new Error('请先选择一个账号');
      }
      return currentAccountDetail.account.userId;
    }

    function selectedAccountNextStatus() {
      const account = currentAccountDetail && currentAccountDetail.account;
      if (!account) {
        throw new Error('请先选择一个账号');
      }
      return account.status === 'disabled' ? 'active' : 'disabled';
    }

    async function updateAdminAuthAccountStatus(userId, status) {
      document.getElementById('accountDetailNotice').textContent = '';
      try {
        const data = await api('/admin/auth/accounts/' + encodeURIComponent(userId) + '/status', {
          method: 'POST',
          body: JSON.stringify({
            status,
          }),
        });
        document.getElementById('accountDetailStatus').textContent =
          '账号状态已更新为 ' + formatAccountStatus(data.status) + '，顺手撤销会话 ' +
          String(data.revokedSessionCount || 0) + ' 条。';
        await refreshAccountWorkspaceAfterMutation();
      } catch (error) {
        document.getElementById('accountDetailNotice').textContent = error.message;
      }
    }

    async function toggleSelectedAccountStatus() {
      await updateAdminAuthAccountStatus(
        selectedAccountUserId(),
        selectedAccountNextStatus(),
      );
    }

    async function revokeAdminAuthAccountSessions() {
      document.getElementById('accountDetailNotice').textContent = '';
      try {
        const keepSessionIdInput = document.getElementById('accountKeepSessionIdInput');
        const keepSessionId = keepSessionIdInput ? keepSessionIdInput.value.trim() : '';
        const data = await api(
          '/admin/auth/accounts/' + encodeURIComponent(selectedAccountUserId()) + '/revoke-sessions',
          {
            method: 'POST',
            body: JSON.stringify(keepSessionId ? { keepSessionId } : {}),
          },
        );
        document.getElementById('accountDetailStatus').textContent =
          '已按账号撤销会话 ' + String(data.revokedCount || 0) + ' 条。' +
          (data.keepSessionId ? ' 保留 sessionId：' + data.keepSessionId : '');
        await refreshAccountWorkspaceAfterMutation();
      } catch (error) {
        document.getElementById('accountDetailNotice').textContent = error.message;
      }
    }

    function changeAccountPage(offset) {
      const pageSize = Number(document.getElementById('accountPageSizeInput').value || 20);
      const maxPage = Math.max(1, Math.ceil(currentAccountTotal / pageSize));
      loadAdminAuthAccounts(Math.min(maxPage, Math.max(1, currentAccountPage + offset)));
    }

    renderAccountSummary();
    resetAccountReport('当前还没拉账号报表，先别在脑子里编趋势图。');
    resetAccountDetail();
    updateAccountBulkSelectionUi();
    const storedSession = initializeAdminSession();
    if (storedSession && storedSession.accessToken) {
      refreshAccountWorkspace();
    }
  </script>
</body>
</html>`;
}
