import {
  renderAdminConsoleNav,
  renderAdminConsoleNavStyles,
} from './admin-console-nav-snippet';
import {
  renderAdminSessionControls,
  renderAdminSessionScript,
} from './admin-session-snippet';

export function renderAdminPermissionMatrixConsole() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>权限矩阵台</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #eef2f5; color: #14212c; }
    .console-shell { display: grid; grid-template-columns: minmax(360px, 420px) 1fr; gap: 16px; padding: 16px; }
    .panel { background: #fff; border: 1px solid #d8dee4; border-radius: 12px; padding: 16px; }
    .muted { color: #667085; font-size: 13px; line-height: 1.6; }
    .error { color: #b42318; min-height: 20px; white-space: pre-wrap; }
    .filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
    .summary-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; background: #f8fafc; }
    .summary-card strong { display: block; margin-top: 6px; font-size: 22px; }
    .list { display: grid; gap: 10px; margin-top: 12px; }
    .profile-card, .module-card, .capability-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; background: #fff; }
    .card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
    .chip-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .chip { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 600; background: #eef2f6; color: #344054; }
    .chip.read { background: #edf2ff; color: #3538cd; }
    .chip.write { background: #fee4e2; color: #b42318; }
    .chip.risk-normal { background: #eef2f6; color: #344054; }
    .chip.risk-sensitive { background: #fff4e5; color: #b54708; }
    .chip.risk-high { background: #fee4e2; color: #b42318; }
    .chip.link { background: #e0f2fe; color: #0369a1; }
    .status { margin-top: 10px; min-height: 18px; }
    label { display: block; font-size: 13px; color: #667085; }
    input, select, button { box-sizing: border-box; width: 100%; margin-top: 4px; padding: 9px; border-radius: 8px; border: 1px solid #d8dee4; font: inherit; }
    button { cursor: pointer; background: #1769aa; color: #fff; border: 0; }
    button:disabled { cursor: not-allowed; opacity: .6; }
    .session-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
    .session-link { color: #1769aa; font-size: 13px; font-weight: 600; text-decoration: none; }
    .secondary-button { width: auto; background: #fff; color: #1769aa; border: 1px solid #d8dee4; }
    ul { margin: 8px 0 0; padding-left: 18px; }
    code { font-family: Consolas, monospace; font-size: 12px; }
    ${renderAdminConsoleNavStyles()}
    @media (max-width: 920px) {
      .console-shell { grid-template-columns: 1fr; }
      .filters, .summary-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="console-shell">
    <section class="panel">
      <h1>权限矩阵台</h1>
      <p class="muted">这片先别吹成“完整 RBAC 系统”。当前所有 admin 还在同一档位，但现有后台工具、读写边界和高风险操作已经被拉成一张能看的权限矩阵，后面才能继续拆多角色和审批流。</p>
      <label>Admin access token<input id="adminToken" type="password" /></label>
      ${renderAdminSessionControls({
        currentRoute: '/api/admin/permission-matrix-console',
      })}
      ${renderAdminConsoleNav({
        currentRoute: '/api/admin/permission-matrix-console',
      })}
      <div class="filters">
        <label>动作筛选<select id="permissionActionInput" onchange="renderPermissionCapabilities()"><option value="">全部动作</option><option value="read">只看 read</option><option value="write">只看 write</option></select></label>
        <label>风险筛选<select id="permissionRiskInput" onchange="renderPermissionCapabilities()"><option value="">全部风险</option><option value="normal">normal</option><option value="sensitive">sensitive</option><option value="high">high</option></select></label>
        <label>&nbsp;<button id="loadPermissionMatrixButton" onclick="loadPermissionMatrix()">刷新权限矩阵</button></label>
      </div>
      <div class="summary-grid" id="permissionSummaryGrid">
        <div class="summary-card"><span class="muted">角色档位</span><strong>0</strong></div>
        <div class="summary-card"><span class="muted">能力项</span><strong>0</strong></div>
        <div class="summary-card"><span class="muted">高风险能力</span><strong>0</strong></div>
      </div>
      <div id="permissionStatus" class="status muted">默认还没拉数据。先登录，再看后台权限边界。</div>
      <div id="permissionMatrixError" class="error"></div>
      <h2>角色档位</h2>
      <div id="permissionProfileList" class="list"><p class="muted">暂无角色档位数据</p></div>
      <h2>待补缺口</h2>
      <ul id="permissionGapList"><li class="muted">暂无权限缺口清单</li></ul>
    </section>
    <section class="panel">
      <h2>覆盖模块</h2>
      <div id="permissionModuleList" class="list"><p class="muted">暂无模块数据</p></div>
      <h2>能力明细</h2>
      <div id="permissionCapabilityStatus" class="muted">当前还没拉到权限能力列表</div>
      <div id="permissionCapabilityList" class="list"><p class="muted">暂无能力数据</p></div>
    </section>
  </main>
  <script>
    const apiBase = '/api';
    let latestPermissionMatrixRequestId = 0;
    let currentPermissionMatrix = null;
    ${renderAdminSessionScript({
      currentRoute: '/api/admin/permission-matrix-console',
    })}

    function token() {
      const value = document.getElementById('adminToken').value.trim();
      if (!value) throw new Error('请先填写 admin access token');
      persistAdminAccessToken();
      return value;
    }

    async function api(path) {
      const response = await fetch(apiBase + path, {
        headers: {
          Authorization: 'Bearer ' + token(),
        },
      });
      const body = await response.json();
      if (!response.ok) {
        const error = new Error(body.message || '请求失败');
        error.code = body.code;
        throw error;
      }
      return body.data;
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    }

    function formatPermissionActions(actions) {
      return Array.isArray(actions) && actions.length ? actions.join(' / ') : '-';
    }

    function formatPermissionRiskLevel(level) {
      return level === 'high' ? '高风险' : level === 'sensitive' ? '敏感只读' : '普通';
    }

    function renderPermissionSummary(matrix) {
      const grid = document.getElementById('permissionSummaryGrid');
      grid.innerHTML = [
        { label: '角色档位', value: Number(matrix.profileCount || 0) },
        { label: '能力项', value: Number(matrix.capabilityCount || 0) },
        { label: '高风险能力', value: Number(matrix.highRiskCapabilityCount || 0) },
      ].map(item => '<div class="summary-card"><span class="muted">' + escapeHtml(item.label) + '</span><strong>' + escapeHtml(item.value) + '</strong></div>').join('');
    }

    function renderPermissionProfiles() {
      const list = document.getElementById('permissionProfileList');
      const profiles = Array.isArray(currentPermissionMatrix?.profiles)
        ? currentPermissionMatrix.profiles
        : [];
      if (!profiles.length) {
        list.innerHTML = '<p class="muted">暂无角色档位数据</p>';
        return;
      }
      list.innerHTML = profiles.map(profile =>
        '<div class="profile-card">' +
          '<div class="card-top"><div><strong>' + escapeHtml(profile.title) + '</strong><div class="muted">' + escapeHtml(profile.summary) + '</div></div><span class="chip link">' + escapeHtml(profile.key) + '</span></div>' +
          '<div class="chip-row">' +
            '<span class="chip">' + escapeHtml('userType=' + profile.userType) + '</span>' +
            '<span class="chip">' + escapeHtml('模块 ' + (Array.isArray(profile.moduleKeys) ? profile.moduleKeys.length : 0)) + '</span>' +
            '<span class="chip">' + escapeHtml('能力 ' + (Array.isArray(profile.capabilityKeys) ? profile.capabilityKeys.length : 0)) + '</span>' +
          '</div>' +
        '</div>',
      ).join('');
    }

    function renderPermissionGaps() {
      const list = document.getElementById('permissionGapList');
      const gaps = Array.isArray(currentPermissionMatrix?.remainingGaps)
        ? currentPermissionMatrix.remainingGaps
        : [];
      list.innerHTML = gaps.length
        ? gaps.map(gap => '<li>' + escapeHtml(gap) + '</li>').join('')
        : '<li class="muted">暂无权限缺口清单</li>';
    }

    function renderPermissionModules() {
      const list = document.getElementById('permissionModuleList');
      const modules = Array.isArray(currentPermissionMatrix?.modules)
        ? currentPermissionMatrix.modules
        : [];
      if (!modules.length) {
        list.innerHTML = '<p class="muted">暂无模块数据</p>';
        return;
      }
      list.innerHTML = modules.map(module =>
        '<div class="module-card">' +
          '<div class="card-top"><div><strong>' + escapeHtml(module.title) + '</strong><div class="muted">' + escapeHtml(module.summary) + '</div></div><a class="chip link" href="' + escapeHtml(module.route) + '">打开台子</a></div>' +
          '<div class="chip-row">' +
            '<span class="chip">' + escapeHtml('能力 ' + module.capabilityCount) + '</span>' +
            '<span class="chip write">' + escapeHtml('可写 ' + module.writeCapabilityCount) + '</span>' +
            '<span class="chip risk-high">' + escapeHtml('高风险 ' + module.highRiskCapabilityCount) + '</span>' +
          '</div>' +
        '</div>',
      ).join('');
    }

    function renderPermissionCapabilities() {
      const list = document.getElementById('permissionCapabilityList');
      const status = document.getElementById('permissionCapabilityStatus');
      const capabilities = Array.isArray(currentPermissionMatrix?.capabilities)
        ? currentPermissionMatrix.capabilities
        : [];
      const actionFilter = document.getElementById('permissionActionInput').value;
      const riskFilter = document.getElementById('permissionRiskInput').value;
      const filtered = capabilities.filter(capability => {
        const actionMatches = !actionFilter || (Array.isArray(capability.actions) && capability.actions.includes(actionFilter));
        const riskMatches = !riskFilter || capability.riskLevel === riskFilter;
        return actionMatches && riskMatches;
      });
      status.textContent = '当前展示 ' + filtered.length + ' / ' + capabilities.length + ' 条权限能力';
      list.innerHTML = filtered.length
        ? filtered.map(capability =>
            '<div class="capability-card">' +
              '<div class="card-top"><div><strong>' + escapeHtml(capability.title) + '</strong><div class="muted">' + escapeHtml(capability.summary) + '</div></div><span class="chip risk-' + escapeHtml(capability.riskLevel) + '">' + escapeHtml(formatPermissionRiskLevel(capability.riskLevel)) + '</span></div>' +
              '<div class="chip-row">' +
                (Array.isArray(capability.actions) ? capability.actions.map(action => '<span class="chip ' + escapeHtml(action) + '">' + escapeHtml(action) + '</span>').join('') : '') +
                '<span class="chip link">' + escapeHtml(capability.moduleTitle) + '</span>' +
                '<a class="chip link" href="' + escapeHtml(capability.consoleRoute) + '">台子入口</a>' +
              '</div>' +
              '<div class="muted" style="margin-top:8px;">动作：' + escapeHtml(formatPermissionActions(capability.actions)) + '</div>' +
              '<ul>' +
                (Array.isArray(capability.apiPaths) ? capability.apiPaths.map(path => '<li><code>' + escapeHtml(path) + '</code></li>').join('') : '') +
              '</ul>' +
            '</div>',
          ).join('')
        : '<p class="muted">当前筛选条件下没有命中的权限能力</p>';
    }

    async function loadPermissionMatrix() {
      const requestId = ++latestPermissionMatrixRequestId;
      document.getElementById('permissionStatus').textContent = '正在拉后台权限矩阵...';
      document.getElementById('permissionMatrixError').textContent = '';
      try {
        const matrix = await api('/admin/permissions/matrix');
        if (requestId !== latestPermissionMatrixRequestId) return;
        currentPermissionMatrix = matrix;
        renderPermissionSummary(matrix);
        renderPermissionProfiles();
        renderPermissionGaps();
        renderPermissionModules();
        renderPermissionCapabilities();
        document.getElementById('permissionStatus').textContent =
          '已加载权限矩阵：' + escapeHtml(matrix.defaultProfileKey || 'platform_admin') + ' · 更新时间 ' + escapeHtml(matrix.generatedAtIso || '-');
      } catch (error) {
        if (requestId !== latestPermissionMatrixRequestId) return;
        currentPermissionMatrix = null;
        renderPermissionProfiles();
        renderPermissionGaps();
        renderPermissionModules();
        renderPermissionCapabilities();
        document.getElementById('permissionStatus').textContent = '后台权限矩阵拉取失败，别拿猜的当权限系统。';
        document.getElementById('permissionMatrixError').textContent = error.message;
      }
    }

    const currentAdminSession = initializeAdminSession();
    if (currentAdminSession && currentAdminSession.accessToken) {
      loadPermissionMatrix();
    }
  </script>
</body>
</html>`;
}
