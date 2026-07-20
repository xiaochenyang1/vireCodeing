import {
  renderAdminConsoleNav,
  renderAdminConsoleNavStyles,
} from './admin-console-nav-snippet';
import {
  renderAdminSessionControls,
  renderAdminSessionScript,
} from './admin-session-snippet';

export function renderOrderExceptionCaseAdminConsole() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>异常客服工单</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f4f6f8; color: #17202a; }
    .console-shell { display: grid; grid-template-columns: minmax(360px, 42%) 1fr; gap: 16px; padding: 16px; }
    .panel { background: #fff; border: 1px solid #d8dee4; border-radius: 12px; padding: 16px; }
    .filters { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    input, select, textarea, button { box-sizing: border-box; width: 100%; padding: 9px; margin: 4px 0; }
    textarea { min-height: 88px; resize: vertical; }
    button { cursor: pointer; background: #1769aa; color: #fff; border: 0; border-radius: 8px; }
    button:disabled { cursor: not-allowed; opacity: .55; }
    .session-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
    .session-link { color: #1769aa; font-size: 13px; font-weight: 600; text-decoration: none; }
    .secondary-button { width: auto; background: #fff; color: #1769aa; border: 1px solid #d8dee4; }
    .case-row { border-top: 1px solid #edf0f2; padding: 12px 0; cursor: pointer; }
    .muted { color: #667085; font-size: 13px; }
    .error { color: #b42318; white-space: pre-wrap; }
    .action { border-left: 3px solid #98a2b3; padding-left: 10px; margin: 10px 0; }
    ${renderAdminConsoleNavStyles()}
    @media (max-width: 820px) { .console-shell { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main class="console-shell">
    <section class="panel">
      <h1>异常客服工单</h1>
      <label>Admin access token<input id="adminToken" type="password" /></label>
      ${renderAdminSessionControls({
        currentRoute: '/api/admin/order-exception-case-console',
      })}
      ${renderAdminConsoleNav({
        currentRoute: '/api/admin/order-exception-case-console',
      })}
      <div class="filters">
        <label>状态<select id="caseStatusInput"><option value="">全部</option><option value="pending">待受理</option><option value="processing">处理中</option><option value="resolved">已解决</option><option value="closed">已关闭</option></select></label>
        <label>来源<select id="caseSourceRoleInput"><option value="">全部</option><option value="shipper">货主</option><option value="driver">司机</option></select></label>
        <label>订单号/工单号<input id="caseKeywordInput" /></label>
        <label>每页<input id="casePageSizeInput" type="number" value="20" min="1" max="50" /></label>
      </div>
      <button id="loadCasesButton" onclick="loadCases(1)">查询工单</button>
      <div id="caseListNotice" class="error"></div>
      <div id="caseList"></div>
      <div class="filters"><button onclick="changePage(-1)">上一页</button><button onclick="changePage(1)">下一页</button></div>
    </section>
    <section class="panel">
      <h2>工单详情</h2>
      <div id="caseDetail" class="muted">请选择工单</div>
      <label>处理说明<textarea id="caseActionContent" placeholder="请输入 6-500 字处理说明"></textarea></label>
      <div id="caseCompensationControls" class="filters">
        <label>赔付状态<select id="caseCompensationStatusInput"><option value="not_required">无需赔付</option><option value="pending">待赔付跟进</option><option value="offline_completed">线下已赔付</option></select></label>
        <label>赔付对象<select id="caseCompensationTargetRoleInput"><option value="">请选择</option><option value="shipper">货主</option><option value="driver">司机</option></select></label>
        <label>赔付金额（分）<input id="caseCompensationAmountInput" type="number" min="1" step="1" placeholder="例如 3600" /></label>
      </div>
      <input id="baseUpdatedAtIso" type="hidden" />
      <div id="caseActions"></div>
      <div id="caseMutationNotice" class="error"></div>
    </section>
  </main>
  <script>
    const apiBase = '/api';
    let currentPage = 1;
    let total = 0;
    let selectedCaseId = '';
    let mutationPending = false;
    const mutationPaths = ['/process', '/resolve', '/close'];
    ${renderAdminSessionScript({
      currentRoute: '/api/admin/order-exception-case-console',
    })}

    function token() {
      const value = document.getElementById('adminToken').value.trim();
      if (!value) throw new Error('请先填写 admin access token');
      persistAdminAccessToken();
      return value;
    }

    async function api(path, options = {}) {
      const response = await fetch(apiBase + path, {
        ...options,
        headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + token(), ...(options.headers || {}) },
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

    function formatMoney(amountCents) {
      if (typeof amountCents !== 'number') {
        return '-';
      }
      return '¥' + (amountCents / 100).toFixed(2);
    }

    function readOrderExceptionCaseRouteState() {
      const query = new URLSearchParams(
        globalThis.location && typeof globalThis.location.search === 'string'
          ? location.search
          : '',
      );
      return {
        status: query.get('status') || '',
        sourceRole: query.get('sourceRole') || '',
        keyword: query.get('keyword') || '',
        page: query.get('page') || '',
        pageSize: query.get('pageSize') || '',
      };
    }

    function applyOrderExceptionCaseRouteState() {
      const routeState = readOrderExceptionCaseRouteState();
      document.getElementById('caseStatusInput').value = routeState.status;
      document.getElementById('caseSourceRoleInput').value = routeState.sourceRole;
      document.getElementById('caseKeywordInput').value = routeState.keyword;
      if (routeState.pageSize) {
        document.getElementById('casePageSizeInput').value = String(
          Math.min(50, Math.max(1, Number.parseInt(routeState.pageSize, 10) || 20)),
        );
      }
      if (routeState.page) {
        currentPage = Math.max(1, Number.parseInt(routeState.page, 10) || 1);
      }
      return routeState;
    }

    function syncOrderExceptionCaseRouteState(pageOverride) {
      if (!globalThis.history || !globalThis.location) {
        return;
      }

      const query = new URLSearchParams();
      const status = document.getElementById('caseStatusInput').value;
      const sourceRole = document.getElementById('caseSourceRoleInput').value;
      const keyword = document.getElementById('caseKeywordInput').value.trim();
      const pageSize = Math.min(50, Math.max(1, Number.parseInt(document.getElementById('casePageSizeInput').value || '20', 10) || 20));
      const page = Math.max(1, Number.parseInt(pageOverride || currentPage || 1, 10) || 1);
      if (status) query.set('status', status);
      if (sourceRole) query.set('sourceRole', sourceRole);
      if (keyword) query.set('keyword', keyword);
      if (page > 1) query.set('page', String(page));
      if (pageSize !== 20) query.set('pageSize', String(pageSize));
      const nextQuery = query.toString();
      const nextPath = globalThis.location.pathname + (nextQuery ? '?' + nextQuery : '');
      globalThis.history.replaceState(null, '', nextPath);
    }

    function resetCompensationInputs() {
      document.getElementById('caseCompensationStatusInput').value = 'not_required';
      document.getElementById('caseCompensationTargetRoleInput').value = '';
      document.getElementById('caseCompensationAmountInput').value = '';
    }

    function toggleCompensationInputs(enabled) {
      const statusInput = document.getElementById('caseCompensationStatusInput');
      const targetInput = document.getElementById('caseCompensationTargetRoleInput');
      const amountInput = document.getElementById('caseCompensationAmountInput');
      statusInput.disabled = !enabled || mutationPending;
      targetInput.disabled = !enabled || mutationPending || statusInput.value === 'not_required';
      amountInput.disabled = !enabled || mutationPending || statusInput.value === 'not_required';
    }

    function getCaseMutationButton() {
      return document.getElementById('caseMutationButton');
    }

    function syncCompensationInputsFromStatus() {
      const button = getCaseMutationButton();
      toggleCompensationInputs(Boolean(button && button.dataset.action === 'resolve'));
    }

    function renderCompensationSnapshot(item) {
      if (!item || !item.compensationStatus) {
        return '<p>赔付决议：未记录</p>';
      }
      return '<p>赔付决议：' + escapeHtml(formatCompensationStatus(item.compensationStatus)) + '</p>' +
        (item.compensationStatus === 'not_required'
          ? ''
          : '<p>赔付对象：' + escapeHtml(formatCompensationTargetRole(item.compensationTargetRole)) + ' · 金额：' + escapeHtml(formatMoney(item.compensationAmountCents)) + '</p>') +
        '<p>赔付更新时间：' + escapeHtml(item.compensationUpdatedAtIso || item.resolvedAtIso || item.updatedAtIso || '-') + '</p>';
    }

    function readResolveCompensationInput() {
      const compensationStatus = document.getElementById('caseCompensationStatusInput').value;
      if (!compensationStatus) {
        throw new Error('请选择赔付状态');
      }
      if (compensationStatus === 'not_required') {
        return { compensationStatus };
      }
      const compensationTargetRole = document.getElementById('caseCompensationTargetRoleInput').value;
      if (!compensationTargetRole) {
        throw new Error('待赔付或线下已赔付必须指定赔付对象');
      }
      const compensationAmountCents = Number.parseInt(
        document.getElementById('caseCompensationAmountInput').value || '',
        10,
      );
      if (!Number.isInteger(compensationAmountCents) || compensationAmountCents <= 0) {
        throw new Error('赔付金额必须是大于 0 的整数分');
      }
      return {
        compensationStatus,
        compensationTargetRole,
        compensationAmountCents,
      };
    }

    async function loadCases(page) {
      try {
        currentPage = Math.max(1, page);
        const query = new URLSearchParams({ page: String(currentPage), pageSize: document.getElementById('casePageSizeInput').value || '20' });
        const status = document.getElementById('caseStatusInput').value;
        const sourceRole = document.getElementById('caseSourceRoleInput').value;
        const keyword = document.getElementById('caseKeywordInput').value.trim();
        if (status) query.set('status', status);
        if (sourceRole) query.set('sourceRole', sourceRole);
        if (keyword) query.set('keyword', keyword);
        syncOrderExceptionCaseRouteState(currentPage);
        const result = await api('/admin/order-exception-cases?' + query.toString());
        total = result.total;
        document.getElementById('caseListNotice').textContent = '第 ' + currentPage + ' 页，共 ' + total + ' 条';
        document.getElementById('caseList').innerHTML = result.items.length
          ? result.items.map(item => '<div class="case-row" data-case-id="' + escapeHtml(item.id) + '" onclick="loadCase(this.dataset.caseId)"><strong>' + escapeHtml(item.caseNo) + '</strong> · ' + escapeHtml(item.status) + '<div>' + escapeHtml(item.orderNo) + ' · ' + escapeHtml(item.typeLabel) + '</div><div class="muted">' + escapeHtml(item.sourceRole) + ' · ' + escapeHtml(item.createdAtIso) + '</div><div class="muted">赔付：' + escapeHtml(formatCompensationStatus(item.compensationStatus)) + '</div></div>').join('')
          : '<p class="muted">暂无异常工单</p>';
      } catch (error) {
        document.getElementById('caseListNotice').textContent = error.message;
      }
    }

    function changePage(offset) {
      const pageSize = Number(document.getElementById('casePageSizeInput').value || 20);
      const maxPage = Math.max(1, Math.ceil(total / pageSize));
      loadCases(Math.min(maxPage, Math.max(1, currentPage + offset)));
    }

    async function loadCase(caseId) {
      try {
        selectedCaseId = caseId;
        document.getElementById('caseMutationNotice').textContent = '';
        const item = await api('/admin/order-exception-cases/' + encodeURIComponent(caseId));
        document.getElementById('baseUpdatedAtIso').value = item.updatedAtIso;
        document.getElementById('caseDetail').innerHTML = '<strong>' + escapeHtml(item.caseNo) + '</strong><p>' + escapeHtml(item.orderNo) + ' · ' + escapeHtml(item.sourceRole) + ' · ' + escapeHtml(item.status) + '</p><p>' + escapeHtml(item.typeLabel) + '：' + escapeHtml(item.description) + '</p><p>附件：' + escapeHtml((item.attachmentFileIds || []).join(', ') || '无') + '</p><p>处理结论：' + escapeHtml(item.resolutionText || '暂无') + '</p>' + renderCompensationSnapshot(item);
        document.getElementById('caseActions').innerHTML = (item.actions || []).length
          ? (item.actions || []).map(action => '<div class="action">' + escapeHtml(action.fromStatus) + ' → ' + escapeHtml(action.toStatus) + '<br>' + escapeHtml(action.content) + '<div class="muted">' + escapeHtml(action.createdAtIso) + '</div></div>').join('')
          : '<p class="muted">暂无处理留痕</p>';
        document.getElementById('caseCompensationStatusInput').value = item.compensationStatus || 'not_required';
        document.getElementById('caseCompensationTargetRoleInput').value = item.compensationTargetRole || '';
        document.getElementById('caseCompensationAmountInput').value = item.compensationAmountCents ? String(item.compensationAmountCents) : '';
        renderMutationButtons(item.status);
      } catch (error) {
        document.getElementById('caseMutationNotice').textContent = error.message;
      }
    }

    function renderMutationButtons(status) {
      const target = document.getElementById('caseActions');
      const actionByStatus = { pending: 'process', processing: 'resolve', resolved: 'close' };
      const labelByStatus = { pending: '受理工单', processing: '解决工单', resolved: '关闭工单' };
      const action = actionByStatus[status];
      target.innerHTML += action
        ? '<button id="caseMutationButton" data-action="' + action + '" onclick="mutateCase(this.dataset.action)">' + labelByStatus[status] + '</button>'
        : '<p class="muted">工单已关闭</p>';
      toggleCompensationInputs(action === 'resolve');
    }

    async function mutateCase(action) {
      if (!selectedCaseId || mutationPending) return;
      if (!mutationPaths.includes('/' + action)) return;
      const content = document.getElementById('caseActionContent').value.trim();
      if (content.length < 6 || content.length > 500) {
        document.getElementById('caseMutationNotice').textContent = '请输入 6-500 字处理说明';
        return;
      }
      mutationPending = true;
      document.getElementById('caseMutationNotice').textContent = '';
      const button = getCaseMutationButton();
      if (button) button.disabled = true;
      try {
        const payload = { baseUpdatedAtIso: document.getElementById('baseUpdatedAtIso').value, content };
        if (action === 'resolve') {
          Object.assign(payload, readResolveCompensationInput());
        }
        await api('/admin/order-exception-cases/' + encodeURIComponent(selectedCaseId) + '/' + action, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        document.getElementById('caseActionContent').value = '';
        await loadCase(selectedCaseId);
        await loadCases(currentPage);
      } catch (error) {
        if (error.code === 'EXCEPTION_CASE_CONFLICT') {
          document.getElementById('caseMutationNotice').textContent = '工单已被其他管理员更新，正在刷新最新状态。';
          await loadCase(selectedCaseId);
        } else {
          document.getElementById('caseMutationNotice').textContent = error.message;
        }
      } finally {
        mutationPending = false;
        const nextButton = getCaseMutationButton();
        if (nextButton) nextButton.disabled = false;
        syncCompensationInputsFromStatus();
      }
    }

    document.getElementById('caseCompensationStatusInput').addEventListener('change', function() {
      syncCompensationInputsFromStatus();
    });

    resetCompensationInputs();
    const caseRouteState = applyOrderExceptionCaseRouteState();
    const currentAdminSession = initializeAdminSession();
    if (currentAdminSession && currentAdminSession.accessToken) {
      loadCases(currentPage || (caseRouteState.page ? Number.parseInt(caseRouteState.page, 10) || 1 : 1));
    }
  </script>
</body>
</html>`;
}
