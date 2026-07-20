import {
  renderAdminConsoleNav,
  renderAdminConsoleNavStyles,
} from './admin-console-nav-snippet';
import {
  renderAdminSessionControls,
  renderAdminSessionScript,
} from './admin-session-snippet';

export function renderSessionGovernanceAdminConsole() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>后台会话治理台</title>
  <style>
    :root {
      color-scheme: light;
      --bg-top: #edf4f8;
      --bg-bottom: #dce7ef;
      --panel: rgba(255, 255, 255, 0.92);
      --border: #d0dae4;
      --text: #162535;
      --muted: #627387;
      --accent: #1769aa;
      --accent-soft: rgba(23, 105, 170, 0.08);
      --danger: #b42318;
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
      max-width: 1160px;
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
    p { margin: 0; }
    .muted { color: var(--muted); line-height: 1.7; }
    .controls-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
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
    label {
      display: block;
      font-size: 13px;
      color: var(--muted);
    }
    input, select, button {
      width: 100%;
      margin-top: 6px;
      padding: 11px 12px;
      border-radius: 12px;
      border: 1px solid var(--border);
      font: inherit;
    }
    input, select { background: rgba(255, 255, 255, 0.97); }
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
    .session-link {
      color: var(--accent);
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
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
    .session-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .risk-summary-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
      margin-top: 14px;
    }
    .risk-summary-card {
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 14px 16px;
      background: rgba(255, 255, 255, 0.96);
    }
    .risk-summary-card span {
      display: block;
      color: var(--muted);
      font-size: 12px;
    }
    .risk-summary-card strong {
      display: block;
      margin-top: 8px;
      font-size: 24px;
      line-height: 1;
    }
    .session-card {
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 18px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 12px 28px rgba(22, 37, 53, 0.05);
    }
    .session-card.current-device {
      border-color: rgba(23, 105, 170, 0.45);
      box-shadow: 0 16px 34px rgba(23, 105, 170, 0.12);
    }
    .session-card-top {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }
    .device-chip {
      padding: 5px 10px;
      border-radius: 999px;
      background: rgba(22, 37, 53, 0.06);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }
    .device-chip.current-device {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .risk-chip {
      display: inline-flex;
      align-items: center;
      padding: 5px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }
    .risk-chip.none {
      background: rgba(22, 37, 53, 0.06);
      color: var(--muted);
    }
    .risk-chip.warning {
      background: rgba(245, 158, 11, 0.14);
      color: #9a5b00;
    }
    .risk-chip.high {
      background: rgba(180, 35, 24, 0.12);
      color: var(--danger);
    }
    .session-card h3 {
      margin: 10px 0 8px;
      font-size: 18px;
      line-height: 1.3;
      word-break: break-all;
    }
    .session-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 14px;
    }
    .session-meta-item {
      border-radius: 14px;
      padding: 10px 12px;
      background: rgba(22, 37, 53, 0.04);
    }
    .session-meta-item span {
      display: block;
      font-size: 12px;
      color: var(--muted);
    }
    .session-meta-item strong {
      display: block;
      margin-top: 6px;
      font-size: 14px;
      line-height: 1.5;
      word-break: break-word;
    }
    .session-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 16px;
    }
    .session-pagination {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 16px;
    }
    .audit-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .audit-card {
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 18px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 12px 28px rgba(22, 37, 53, 0.05);
    }
    .audit-card-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }
    .audit-chip {
      display: inline-flex;
      align-items: center;
      padding: 5px 10px;
      border-radius: 999px;
      background: rgba(22, 37, 53, 0.06);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }
    .audit-chip.revoked {
      background: rgba(23, 105, 170, 0.08);
      color: var(--accent);
    }
    .audit-chip.noop {
      background: rgba(180, 35, 24, 0.08);
      color: var(--danger);
    }
    .audit-subjects {
      margin: 14px 0 0;
      padding-left: 18px;
      color: var(--muted);
      line-height: 1.6;
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
      .risk-summary-grid,
      .session-list,
      .audit-list,
      .session-meta {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main class="console-shell">
    <section class="panel">
      <span class="eyebrow">后台账号会话治理</span>
      <h1>后台会话治理台</h1>
      <p class="muted">这页已经能在保留当前管理员自查能力的同时，按范围、角色、关键字和风险标签筛活跃 refresh 会话，直接看共享设备/多开账号摘要，按会话 ID 跨账号强退，并查看细粒度审计第一片。权限矩阵第一片已经接上了，但数据域权限落地和更完整的账号治理中心还没补完，别急着给自己封 CTO。</p>
      <div class="controls-grid">
        <label>Admin access token<input id="adminToken" type="password" placeholder="填 token 后再查会话" /></label>
        <label>当前设备标识<input id="currentDeviceId" placeholder="admin-console-device" /></label>
        <div style="display:flex; gap:12px; align-items:flex-end;">
          <button type="button" onclick="loadAdminSessions()">刷新会话列表</button>
          <button type="button" class="danger-button" onclick="revokeOtherAdminSessions()">撤销当前账号其它设备</button>
        </div>
      </div>
      <div class="filters-grid">
        <label>检索范围<select id="sessionScopeInput"><option value="current_admin">当前 admin</option><option value="all">全平台活跃会话</option></select></label>
        <label>用户类型<select id="sessionUserTypeInput"><option value="">全部类型</option><option value="shipper">货主</option><option value="driver">司机</option><option value="admin">管理员</option></select></label>
        <label>关键字<input id="sessionKeywordInput" placeholder="手机号、用户 ID、设备标识" /></label>
        <label>风险范围<select id="sessionRiskOnlyInput"><option value="false">全部会话</option><option value="true">只看风险会话</option></select></label>
        <label>风险标签<select id="sessionRiskTagInput"><option value="">全部标签</option><option value="shared_device">共享设备</option><option value="high_session_volume">高会话量</option><option value="admin_multi_device">多设备 admin</option></select></label>
        <label>每页<input id="sessionPageSizeInput" type="number" min="1" max="50" value="20" /></label>
      </div>
      ${renderAdminSessionControls({
        currentRoute: '/api/admin/session-governance-console',
      })}
      ${renderAdminConsoleNav({
        currentRoute: '/api/admin/session-governance-console',
      })}
      <div id="sessionNotice" class="notice"></div>
      <div id="sessionStatus" class="status-line">默认等你填 token。当前设备只对当前 admin 本人会话做高亮，不是啥读心术。</div>
    </section>

    <section class="panel">
      <h2>活跃 refresh 会话</h2>
      <div id="sessionRiskSummary" class="risk-summary-grid"></div>
      <div id="sessionList" class="session-list"></div>
      <div class="session-pagination">
        <button id="sessionPreviousPageButton" type="button" class="secondary-button" onclick="changeSessionPage(-1)">上一页</button>
        <button id="sessionNextPageButton" type="button" class="secondary-button" onclick="changeSessionPage(1)">下一页</button>
      </div>
      <p class="footnote">注意：这里撤销的是 refresh 会话，不会瞬间抹掉当前 access token。当前设备如果被你自己撤了，refresh 失效后需要重新登录。</p>
    </section>

    <section class="panel">
      <h2>治理审计记录</h2>
      <div class="filters-grid">
        <label>审计动作<select id="sessionAuditActionInput"><option value="">全部动作</option><option value="revoke_session">单会话强退</option><option value="revoke_other_sessions">撤销当前账号其它设备</option><option value="revoke_account_sessions">按账号撤销全部会话</option></select></label>
        <label>审计结果<select id="sessionAuditResultInput"><option value="">全部结果</option><option value="revoked">已撤销</option><option value="noop">无变更</option></select></label>
        <label>关键字<input id="sessionAuditKeywordInput" placeholder="admin、用户、会话、设备标识" /></label>
        <label>每页<input id="sessionAuditPageSizeInput" type="number" min="1" max="50" value="20" /></label>
      </div>
      <div class="session-row">
        <button type="button" class="secondary-button" onclick="loadSessionAuditEvents()">刷新审计</button>
      </div>
      <div id="sessionAuditNotice" class="notice"></div>
      <div id="sessionAuditStatus" class="status-line">默认等你填 token。这里留的是后台会话治理操作痕迹，不是灵异档案。</div>
      <div id="sessionAuditList" class="audit-list"></div>
      <div class="session-pagination">
        <button id="sessionAuditPreviousPageButton" type="button" class="secondary-button" onclick="changeSessionAuditPage(-1)">上一页</button>
        <button id="sessionAuditNextPageButton" type="button" class="secondary-button" onclick="changeSessionAuditPage(1)">下一页</button>
      </div>
    </section>
  </main>

  <script>
    const apiBase = '/api';
    let latestSessionRequestId = 0;
    let currentSessionPage = 1;
    let currentSessionTotal = 0;
    let latestSessionAuditRequestId = 0;
    let currentSessionAuditPage = 1;
    let currentSessionAuditTotal = 0;
    ${renderAdminSessionScript({
      currentRoute: '/api/admin/session-governance-console',
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

    function currentDeviceValue() {
      const value = document.getElementById('currentDeviceId').value.trim();
      if (!value) {
        throw new Error('请先填写当前设备标识');
      }
      return value;
    }

    function formatTime(value) {
      return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-';
    }

    function maskDeviceId(value) {
      const normalized = String(value || '');
      if (!normalized) {
        return '';
      }
      const prefixLength = Math.min(3, normalized.length);
      const suffixLength = Math.min(3, Math.max(0, normalized.length - prefixLength));
      if (normalized.length <= prefixLength + suffixLength) {
        return '*'.repeat(normalized.length);
      }
      return normalized.slice(0, prefixLength) +
        '*'.repeat(normalized.length - prefixLength - suffixLength) +
        normalized.slice(normalized.length - suffixLength);
    }

    function sessionPageSizeValue() {
      const value = Number(document.getElementById('sessionPageSizeInput').value || 20);
      if (!Number.isInteger(value) || value < 1 || value > 50) {
        throw new Error('每页数量必须在 1 到 50 之间');
      }
      return value;
    }

    function sessionAuditPageSizeValue() {
      const value = Number(document.getElementById('sessionAuditPageSizeInput').value || 20);
      if (!Number.isInteger(value) || value < 1 || value > 50) {
        throw new Error('审计每页数量必须在 1 到 50 之间');
      }
      return value;
    }

    function sessionRiskOnlyValue() {
      return document.getElementById('sessionRiskOnlyInput').value === 'true';
    }

    function buildSessionQuery(page) {
      const query = new URLSearchParams({
        scope: document.getElementById('sessionScopeInput').value || 'current_admin',
        page: String(Math.max(1, page)),
        pageSize: String(sessionPageSizeValue()),
      });
      const userType = document.getElementById('sessionUserTypeInput').value;
      const keyword = document.getElementById('sessionKeywordInput').value.trim();
      const riskTag = document.getElementById('sessionRiskTagInput').value;
      if (userType) {
        query.set('userType', userType);
      }
      if (keyword) {
        query.set('keyword', keyword);
      }
      if (sessionRiskOnlyValue()) {
        query.set('riskOnly', 'true');
      }
      if (riskTag) {
        query.set('riskTag', riskTag);
      }
      return query;
    }

    function buildSessionAuditQuery(page) {
      const query = new URLSearchParams({
        page: String(Math.max(1, page)),
        pageSize: String(sessionAuditPageSizeValue()),
      });
      const action = document.getElementById('sessionAuditActionInput').value;
      const result = document.getElementById('sessionAuditResultInput').value;
      const keyword = document.getElementById('sessionAuditKeywordInput').value.trim();
      if (action) {
        query.set('action', action);
      }
      if (result) {
        query.set('result', result);
      }
      if (keyword) {
        query.set('keyword', keyword);
      }
      return query;
    }

    function sessionScopeLabel(scope) {
      return scope === 'all' ? '全平台' : '当前 admin';
    }

    function formatSessionAuditAction(action) {
      if (action === 'revoke_other_sessions') {
        return '撤销当前账号其它设备';
      }
      if (action === 'revoke_account_sessions') {
        return '按账号撤销全部会话';
      }
      return '单会话强退';
    }

    function formatSessionAuditResult(result) {
      return result === 'revoked' ? '已撤销' : '无变更';
    }

    function formatSessionRiskTag(tag) {
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

    function formatSessionRiskLevel(level) {
      if (level === 'high') {
        return '高风险';
      }
      if (level === 'warning') {
        return '风险';
      }
      return '暂无明显风险';
    }

    function renderSessionRiskSummary(summary) {
      const container = document.getElementById('sessionRiskSummary');
      const safeSummary = summary && typeof summary === 'object' ? summary : {};
      const items = [
        { label: '风险会话', value: Number(safeSummary.riskySessionCount || 0) },
        { label: '高风险', value: Number(safeSummary.highRiskSessionCount || 0) },
        { label: '共享设备', value: Number(safeSummary.sharedDeviceCount || 0) },
        { label: '高会话用户', value: Number(safeSummary.highSessionVolumeUserCount || 0) },
        { label: '多设备 admin', value: Number(safeSummary.adminMultiDeviceUserCount || 0) },
      ];
      container.innerHTML = items.map(function(item) {
        return '<div class="risk-summary-card">' +
          '<span>' + escapeHtml(item.label) + '</span>' +
          '<strong>' + escapeHtml(String(item.value)) + '</strong>' +
        '</div>';
      }).join('');
    }

    function renderSessionList(sessions) {
      const list = document.getElementById('sessionList');
      const currentDeviceId = document.getElementById('currentDeviceId').value.trim();
      if (!Array.isArray(sessions) || !sessions.length) {
        list.innerHTML = '<div class="session-card"><h3>暂无活跃会话</h3><p class="muted">当前筛选条件下没有命中的活跃 refresh 会话，说明这页至少没给你胡乱编数据。</p></div>';
        return;
      }
      list.innerHTML = sessions.map(function(session) {
        const isCurrentDevice = currentDeviceId && session.isCurrentUser && (
          session.deviceId === currentDeviceId ||
          session.deviceId === maskDeviceId(currentDeviceId)
        );
        const deviceLabel = isCurrentDevice
          ? '当前设备'
          : session.isCurrentUser
            ? '当前账号其它设备'
            : '跨账号会话';
        const riskTags = Array.isArray(session.riskTags) ? session.riskTags : [];
        const riskLevel = session.riskLevel || 'none';
        const riskContext = session.riskContext && typeof session.riskContext === 'object'
          ? session.riskContext
          : {};
        const riskHtml = riskTags.length
          ? '<div class="session-row">' + riskTags.map(function(tag) {
              return '<span class="risk-chip ' + escapeHtml(riskLevel) + '">' +
                escapeHtml(formatSessionRiskTag(tag)) +
              '</span>';
            }).join('') + '</div>'
          : '<div class="session-row"><span class="risk-chip none">暂无明显风险</span></div>';
        return '<article class="session-card' + (isCurrentDevice ? ' current-device' : '') + '">' +
          '<div class="session-card-top">' +
            '<span class="eyebrow">' + escapeHtml(session.userType) + '</span>' +
            '<span class="device-chip' + (isCurrentDevice ? ' current-device' : '') + '">' +
              escapeHtml(deviceLabel) +
            '</span>' +
          '</div>' +
          '<h3>' + escapeHtml(session.userPhone) + '</h3>' +
          '<p class="muted">用户 ID：' + escapeHtml(session.userId) + '</p>' +
          riskHtml +
          '<div class="session-meta">' +
            '<div class="session-meta-item">' +
              '<span>设备标识</span>' +
              '<strong>' + escapeHtml(session.deviceId) + '</strong>' +
            '</div>' +
            '<div class="session-meta-item">' +
              '<span>创建时间</span>' +
              '<strong>' + escapeHtml(formatTime(session.createdAtIso)) + '</strong>' +
            '</div>' +
            '<div class="session-meta-item">' +
              '<span>过期时间</span>' +
              '<strong>' + escapeHtml(formatTime(session.expiresAtIso)) + '</strong>' +
            '</div>' +
            '<div class="session-meta-item">' +
              '<span>所属范围</span>' +
              '<strong>' + escapeHtml(session.isCurrentUser ? '当前 admin' : '其它平台账号') + '</strong>' +
            '</div>' +
            '<div class="session-meta-item">' +
              '<span>风险等级</span>' +
              '<strong>' + escapeHtml(formatSessionRiskLevel(riskLevel)) + '</strong>' +
            '</div>' +
            '<div class="session-meta-item">' +
              '<span>风险上下文</span>' +
              '<strong>同设备 ' + escapeHtml(String(riskContext.deviceSessionCount || 0)) +
              ' 会话 / ' + escapeHtml(String(riskContext.deviceUserCount || 0)) +
              ' 账号，当前账号 ' + escapeHtml(String(riskContext.userSessionCount || 0)) + ' 会话</strong>' +
            '</div>' +
          '</div>' +
          '<div class="session-actions">' +
            '<button type="button" class="danger-button" onclick="revokeAdminSession(\\'' + escapeHtml(session.id) + '\\')">撤销该会话</button>' +
          '</div>' +
        '</article>';
      }).join('');
    }

    function renderSessionPagination(scope, page, pageSize, total) {
      const maxPage = Math.max(1, Math.ceil(total / pageSize));
      document.getElementById('sessionStatus').textContent =
        sessionScopeLabel(scope) + ' 第 ' + page + ' 页 / 共 ' + maxPage + ' 页，当前页 ' +
        Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize)) +
        ' 条，命中 ' + total + ' 条活跃 refresh 会话。';
      document.getElementById('sessionPreviousPageButton').disabled = page <= 1;
      document.getElementById('sessionNextPageButton').disabled = page >= maxPage;
    }

    function renderSessionAuditList(events) {
      const list = document.getElementById('sessionAuditList');
      if (!Array.isArray(events) || !events.length) {
        list.innerHTML = '<div class="audit-card"><h3>暂无审计记录</h3><p class="muted">当前筛选条件下没有命中的会话治理审计记录，至少说明后端没在这糊假流水。</p></div>';
        return;
      }
      list.innerHTML = events.map(function(event) {
        const subjectItems = Array.isArray(event.subjects) ? event.subjects : [];
        const subjectHtml = subjectItems.length
          ? '<ul class="audit-subjects">' + subjectItems.map(function(subject) {
              return '<li>' +
                '<strong>' + escapeHtml(subject.userPhone) + '</strong>' +
                ' · ' + escapeHtml(subject.userType) +
                ' · session ' + escapeHtml(subject.sessionId) +
                ' · device ' + escapeHtml(subject.deviceId) +
              '</li>';
            }).join('') + '</ul>'
          : '<p class="muted" style="margin-top:14px;">本次没有命中可撤销会话，或者目标会话在落审计前就已经找不着了。</p>';
        return '<article class="audit-card">' +
          '<div class="audit-card-header">' +
            '<div>' +
              '<span class="eyebrow">' + escapeHtml(formatSessionAuditAction(event.action)) + '</span>' +
              '<h3 style="margin:10px 0 8px;">' + escapeHtml(event.actorAdminPhone) + '</h3>' +
              '<p class="muted">adminId：' + escapeHtml(event.actorAdminId) + '</p>' +
            '</div>' +
            '<span class="audit-chip ' + escapeHtml(event.result) + '">' + escapeHtml(formatSessionAuditResult(event.result)) + '</span>' +
          '</div>' +
          '<div class="session-meta" style="margin-top:14px;">' +
            '<div class="session-meta-item">' +
              '<span>撤销条数</span>' +
              '<strong>' + escapeHtml(String(event.revokedCount || 0)) + '</strong>' +
            '</div>' +
            '<div class="session-meta-item">' +
              '<span>审计时间</span>' +
              '<strong>' + escapeHtml(formatTime(event.createdAtIso)) + '</strong>' +
            '</div>' +
            '<div class="session-meta-item">' +
              '<span>请求会话 ID</span>' +
              '<strong>' + escapeHtml(event.requestedSessionId || '-') + '</strong>' +
            '</div>' +
            '<div class="session-meta-item">' +
              '<span>保留设备</span>' +
              '<strong>' + escapeHtml(event.currentDeviceId || '-') + '</strong>' +
            '</div>' +
          '</div>' +
          subjectHtml +
        '</article>';
      }).join('');
    }

    function renderSessionAuditPagination(page, pageSize, total) {
      const maxPage = Math.max(1, Math.ceil(total / pageSize));
      document.getElementById('sessionAuditStatus').textContent =
        '审计第 ' + page + ' 页 / 共 ' + maxPage + ' 页，当前页 ' +
        Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize)) +
        ' 条，命中 ' + total + ' 条会话治理审计记录。';
      document.getElementById('sessionAuditPreviousPageButton').disabled = page <= 1;
      document.getElementById('sessionAuditNextPageButton').disabled = page >= maxPage;
    }

    async function loadAdminSessions(page) {
      const requestId = ++latestSessionRequestId;
      document.getElementById('sessionNotice').textContent = '';
      const requestedPage = Math.max(1, page || 1);
      document.getElementById('sessionStatus').textContent = '正在拉活跃会话...';
      try {
        const query = buildSessionQuery(requestedPage);
        const data = await api('/admin/auth/sessions?' + query.toString());
        if (requestId !== latestSessionRequestId) return;
        currentSessionPage = data.page || requestedPage;
        currentSessionTotal = data.total || 0;
        renderSessionRiskSummary(data.riskSummary);
        renderSessionList(data.sessions);
        renderSessionPagination(
          query.get('scope') || 'current_admin',
          currentSessionPage,
          data.pageSize || sessionPageSizeValue(),
          currentSessionTotal,
        );
      } catch (error) {
        if (requestId !== latestSessionRequestId) return;
        document.getElementById('sessionNotice').textContent = error.message;
        document.getElementById('sessionStatus').textContent = '会话列表拉取失败，先别瞎点。';
        renderSessionRiskSummary();
        document.getElementById('sessionList').innerHTML = '';
        document.getElementById('sessionPreviousPageButton').disabled = true;
        document.getElementById('sessionNextPageButton').disabled = true;
      }
    }

    async function loadSessionAuditEvents(page) {
      const requestId = ++latestSessionAuditRequestId;
      document.getElementById('sessionAuditNotice').textContent = '';
      const requestedPage = Math.max(1, page || 1);
      document.getElementById('sessionAuditStatus').textContent = '正在拉会话治理审计...';
      try {
        const query = buildSessionAuditQuery(requestedPage);
        const data = await api('/admin/auth/sessions/audit-events?' + query.toString());
        if (requestId !== latestSessionAuditRequestId) return;
        currentSessionAuditPage = data.page || requestedPage;
        currentSessionAuditTotal = data.total || 0;
        renderSessionAuditList(data.events);
        renderSessionAuditPagination(
          currentSessionAuditPage,
          data.pageSize || sessionAuditPageSizeValue(),
          currentSessionAuditTotal,
        );
      } catch (error) {
        if (requestId !== latestSessionAuditRequestId) return;
        document.getElementById('sessionAuditNotice').textContent = error.message;
        document.getElementById('sessionAuditStatus').textContent = '会话治理审计拉取失败，先别瞎下结论。';
        document.getElementById('sessionAuditList').innerHTML = '';
        document.getElementById('sessionAuditPreviousPageButton').disabled = true;
        document.getElementById('sessionAuditNextPageButton').disabled = true;
      }
    }

    function changeSessionPage(offset) {
      const pageSize = Number(document.getElementById('sessionPageSizeInput').value || 20);
      const maxPage = Math.max(1, Math.ceil(currentSessionTotal / pageSize));
      loadAdminSessions(Math.min(maxPage, Math.max(1, currentSessionPage + offset)));
    }

    function changeSessionAuditPage(offset) {
      const pageSize = Number(document.getElementById('sessionAuditPageSizeInput').value || 20);
      const maxPage = Math.max(1, Math.ceil(currentSessionAuditTotal / pageSize));
      loadSessionAuditEvents(Math.min(maxPage, Math.max(1, currentSessionAuditPage + offset)));
    }

    async function revokeAdminSession(sessionId) {
      document.getElementById('sessionNotice').textContent = '';
      try {
        const data = await api('/admin/auth/sessions/' + encodeURIComponent(sessionId) + '/revoke', {
          method: 'POST',
        });
        document.getElementById('sessionStatus').textContent =
          data.revoked ? '会话已撤销：' + sessionId : '会话不存在或已经失效。';
        await loadAdminSessions(currentSessionPage);
        await loadSessionAuditEvents(currentSessionAuditPage);
      } catch (error) {
        document.getElementById('sessionNotice').textContent = error.message;
      }
    }

    async function revokeOtherAdminSessions() {
      document.getElementById('sessionNotice').textContent = '';
      try {
        const currentDeviceId = currentDeviceValue();
        const data = await api('/admin/auth/sessions/revoke-other-sessions', {
          method: 'POST',
          body: JSON.stringify({
            currentDeviceId,
          }),
        });
        const currentDeviceLabel = data.currentDeviceId || maskDeviceId(currentDeviceId);
        document.getElementById('sessionStatus').textContent =
          '已按当前设备 ' + currentDeviceLabel + ' 保留本机，撤销其它会话 ' + String(data.revokedCount) + ' 条。';
        await loadAdminSessions(currentSessionPage);
        await loadSessionAuditEvents(currentSessionAuditPage);
      } catch (error) {
        document.getElementById('sessionNotice').textContent = error.message;
      }
    }

    const storedSession = initializeAdminSession();
    renderSessionRiskSummary();
    if (storedSession && storedSession.deviceId) {
      document.getElementById('currentDeviceId').value = storedSession.deviceId;
    }
    if (storedSession && storedSession.accessToken) {
      loadAdminSessions();
      loadSessionAuditEvents();
    }
  </script>
</body>
</html>`;
}
