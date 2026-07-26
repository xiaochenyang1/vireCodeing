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
    .filters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .full-span { grid-column: 1 / span 4; }
    input, select, textarea, button { box-sizing: border-box; width: 100%; padding: 9px; margin: 4px 0; }
    textarea { min-height: 88px; resize: vertical; }
    button { cursor: pointer; background: #1769aa; color: #fff; border: 0; border-radius: 8px; }
    button:disabled { cursor: not-allowed; opacity: .55; }
    .session-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
    .session-link { color: #1769aa; font-size: 13px; font-weight: 600; text-decoration: none; }
    .inline-button { width: auto; }
    .secondary-button { width: auto; background: #fff; color: #1769aa; border: 1px solid #d8dee4; }
    .case-row { border-top: 1px solid #edf0f2; padding: 12px 0; cursor: pointer; }
    .muted { color: #667085; font-size: 13px; }
    .error { color: #b42318; white-space: pre-wrap; }
    .action { border-left: 3px solid #98a2b3; padding-left: 10px; margin: 10px 0; }
    ${renderAdminConsoleNavStyles()}
    @media (max-width: 820px) { .console-shell { grid-template-columns: 1fr; } .filters { grid-template-columns: 1fr; } .full-span { grid-column: auto; } }
  </style>
</head>
<body>
  <main class="console-shell">
    <section class="panel">
      <h1>异常客服工单</h1>
      <p class="muted">这页现在除了看异常工单流转、认领、赔付执行和申诉裁定，也会直接给出受理 / 解决 SLA 提醒，并支持按赔付状态、申诉状态、SLA 状态、认领状态和认领客服筛队列，以及对未认领 open 工单认领 / 指派、对自己名下工单转派 / 释放认领、对他人已认领工单执行强制接管；自动超时升级第一片也已经补到“可手动扫描 + 可选定时扫”，自动派单、会话联动和退款联动还没补上。</p>
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
        <label>赔付<select id="caseListCompensationStatusInput"><option value="">全部</option><option value="not_required">无需赔付</option><option value="pending">待赔付跟进</option><option value="offline_completed">线下已赔付</option><option value="executed">平台已赔付到账</option></select></label>
        <label>申诉<select id="caseListAppealStatusInput"><option value="">全部</option><option value="none">未申诉</option><option value="requested">申诉处理中</option><option value="rejected">申诉已驳回</option><option value="accepted">申诉已受理</option></select></label>
        <label>SLA 状态<select id="caseListSlaStatusInput"><option value="">全部</option><option value="within_target">时限内</option><option value="overdue">已超时</option><option value="resolved_within_target">按时解决</option><option value="resolved_overdue">超时解决</option></select></label>
        <label>认领状态<select id="caseClaimStatusInput"><option value="">全部</option><option value="claimed">已认领</option><option value="unclaimed">未认领</option></select></label>
        <label>每页<input id="casePageSizeInput" type="number" value="20" min="1" max="50" /></label>
        <label>认领客服 ID<input id="caseClaimedByAdminUserIdInput" placeholder="例如 admin-1" /></label>
        <label class="full-span">订单号/工单号<input id="caseKeywordInput" /></label>
      </div>
      <div class="session-row">
        <button id="loadCasesButton" class="inline-button" onclick="loadCases(1)">查询工单</button>
        <button id="loadMyCasesButton" class="secondary-button" onclick="loadMyCases()">我的认领单</button>
        <button id="sweepExceptionCaseOverdueButton" class="secondary-button" onclick="sweepOverdueExceptionCases()">执行超时升级扫描</button>
      </div>
      <div id="caseSweepNotice" class="error"></div>
      <div id="caseListNotice" class="error"></div>
      <div id="caseList"></div>
      <div class="filters"><button onclick="changePage(-1)">上一页</button><button onclick="changePage(1)">下一页</button></div>
    </section>
    <section class="panel">
      <h2>工单详情</h2>
      <div id="caseDetail" class="muted">请选择工单</div>
      <label>指派 / 转派给客服 ID<input id="caseAssignTargetAdminUserIdInput" placeholder="例如 admin-2" /></label>
      <label>处理说明 / 认领 / 指派 / 接管备注<textarea id="caseActionContent" placeholder="处理动作请输入 6-500 字；认领、释放认领、指派、转派或强制接管备注可留空或填写最多 200 字"></textarea></label>
      <div id="caseCompensationControls" class="filters">
        <label>赔付状态<select id="caseCompensationStatusInput"><option value="not_required">无需赔付</option><option value="pending">待赔付跟进</option><option value="offline_completed">线下已赔付</option></select></label>
        <label id="caseAppealDecisionField" style="display:none">申诉裁定<select id="caseAppealDecisionInput"><option value="">请选择</option><option value="accepted">受理申诉</option><option value="rejected">驳回申诉</option></select></label>
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
    let selectedCaseClaimedByAdminUserId = '';
    let selectedCaseAppealStatus = 'none';
    let currentAdminUserId = '';
    let mutationPending = false;
    let caseSweepPending = false;
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
      if (status === 'executed') return '平台已赔付到账';
      return '未记录赔付决议';
    }

    function formatAppealStatus(status) {
      if (status === 'requested') return '申诉处理中';
      if (status === 'rejected') return '申诉已驳回';
      if (status === 'accepted') return '申诉已受理';
      return '未申诉';
    }

    function createIdempotencyKey() {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
      return 'idem-' + Date.now() + '-' + Math.random().toString(16).slice(2);
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

    function formatCaseRecentActivity(item) {
      return item.updatedAtIso || item.createdAtIso || '-';
    }

    function formatCaseSlaStage(stage) {
      if (stage === 'acceptance') return '受理 SLA';
      if (stage === 'resolution') return '解决 SLA';
      return 'SLA';
    }

    function formatCaseSlaStatus(status) {
      if (status === 'within_target') return '时限内';
      if (status === 'overdue') return '已超时';
      if (status === 'resolved_within_target') return '按时解决';
      if (status === 'resolved_overdue') return '超时解决';
      return 'SLA';
    }

    function formatCaseSlaMeta(sla) {
      if (!sla || !sla.stage) return 'SLA 暂无数据';
      if (typeof sla.overdueMinutes === 'number') {
        return formatCaseSlaStage(sla.stage) + ' · 已超时 ' + String(sla.overdueMinutes) + ' 分钟';
      }
      if (typeof sla.remainingMinutes === 'number') {
        if (sla.status === 'resolved_within_target') {
          return formatCaseSlaStage(sla.stage) + ' · 提前 ' + String(sla.remainingMinutes) + ' 分钟完成';
        }
        return formatCaseSlaStage(sla.stage) + ' · 剩余 ' + String(sla.remainingMinutes) + ' 分钟';
      }
      return formatCaseSlaStage(sla.stage) + ' · ' + formatCaseSlaStatus(sla.status);
    }

    function formatCaseClaim(item) {
      if (!item || !item.claimedByAdminUserId) {
        return '未认领';
      }
      return item.claimedByAdminUserId + (item.claimedAtIso ? ' · ' + item.claimedAtIso : '');
    }

    function canDetermineCurrentCaseAdmin() {
      return currentAdminUserId.length > 0;
    }

    function isCaseClaimedByCurrentAdmin(item) {
      return Boolean(
        item &&
        item.claimedByAdminUserId &&
        canDetermineCurrentCaseAdmin() &&
        item.claimedByAdminUserId === currentAdminUserId,
      );
    }

    function isCaseClaimedByOtherAdmin(item) {
      return Boolean(
        item &&
        item.claimedByAdminUserId &&
        (!canDetermineCurrentCaseAdmin() ||
          item.claimedByAdminUserId !== currentAdminUserId),
      );
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
        compensationStatus: query.get('compensationStatus') || '',
        appealStatus: query.get('appealStatus') || '',
        slaStatus: query.get('slaStatus') || '',
        claimStatus: query.get('claimStatus') || '',
        claimedByAdminUserId: query.get('claimedByAdminUserId') || '',
        keyword: query.get('keyword') || '',
        page: query.get('page') || '',
        pageSize: query.get('pageSize') || '',
      };
    }

    function applyOrderExceptionCaseRouteState() {
      const routeState = readOrderExceptionCaseRouteState();
      document.getElementById('caseStatusInput').value = routeState.status;
      document.getElementById('caseSourceRoleInput').value = routeState.sourceRole;
      document.getElementById('caseListCompensationStatusInput').value = routeState.compensationStatus;
      document.getElementById('caseListAppealStatusInput').value = routeState.appealStatus;
      document.getElementById('caseListSlaStatusInput').value = routeState.slaStatus;
      document.getElementById('caseClaimStatusInput').value = routeState.claimStatus;
      document.getElementById('caseClaimedByAdminUserIdInput').value = routeState.claimedByAdminUserId;
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
      const compensationStatus = document.getElementById('caseListCompensationStatusInput').value;
      const appealStatus = document.getElementById('caseListAppealStatusInput').value;
      const slaStatus = document.getElementById('caseListSlaStatusInput').value;
      const claimStatus = document.getElementById('caseClaimStatusInput').value;
      const claimedByAdminUserId = document.getElementById('caseClaimedByAdminUserIdInput').value.trim();
      const keyword = document.getElementById('caseKeywordInput').value.trim();
      const pageSize = Math.min(50, Math.max(1, Number.parseInt(document.getElementById('casePageSizeInput').value || '20', 10) || 20));
      const page = Math.max(1, Number.parseInt(pageOverride || currentPage || 1, 10) || 1);
      if (status) query.set('status', status);
      if (sourceRole) query.set('sourceRole', sourceRole);
      if (compensationStatus) query.set('compensationStatus', compensationStatus);
      if (appealStatus) query.set('appealStatus', appealStatus);
      if (slaStatus) query.set('slaStatus', slaStatus);
      if (claimStatus) query.set('claimStatus', claimStatus);
      if (claimedByAdminUserId) query.set('claimedByAdminUserId', claimedByAdminUserId);
      if (keyword) query.set('keyword', keyword);
      if (page > 1) query.set('page', String(page));
      if (pageSize !== 20) query.set('pageSize', String(pageSize));
      const nextQuery = query.toString();
      const nextPath = globalThis.location.pathname + (nextQuery ? '?' + nextQuery : '');
      globalThis.history.replaceState(null, '', nextPath);
    }

    function resetCompensationInputs() {
      document.getElementById('caseCompensationStatusInput').value = 'not_required';
      document.getElementById('caseAppealDecisionInput').value = '';
      document.getElementById('caseCompensationTargetRoleInput').value = '';
      document.getElementById('caseCompensationAmountInput').value = '';
      selectedCaseAppealStatus = 'none';
      toggleAppealDecisionInput(false);
    }

    function toggleCompensationInputs(enabled) {
      const statusInput = document.getElementById('caseCompensationStatusInput');
      const targetInput = document.getElementById('caseCompensationTargetRoleInput');
      const amountInput = document.getElementById('caseCompensationAmountInput');
      statusInput.disabled = !enabled || mutationPending;
      targetInput.disabled = !enabled || mutationPending || statusInput.value === 'not_required';
      amountInput.disabled = !enabled || mutationPending || statusInput.value === 'not_required';
    }

    function toggleAppealDecisionInput(enabled) {
      const field = document.getElementById('caseAppealDecisionField');
      const input = document.getElementById('caseAppealDecisionInput');
      field.style.display = enabled ? 'block' : 'none';
      input.disabled = !enabled || mutationPending;
      input.dataset.required = enabled ? 'true' : 'false';
      if (!enabled) {
        input.value = '';
      }
    }

    function getCaseMutationButton() {
      return document.getElementById('caseMutationButton');
    }

    function getCaseClaimButton() {
      return document.getElementById('caseClaimButton');
    }

    function getCaseAssignButton() {
      return document.getElementById('caseAssignButton');
    }

    function getCaseReleaseClaimButton() {
      return document.getElementById('caseReleaseClaimButton');
    }

    function getCaseTakeoverButton() {
      return document.getElementById('caseTakeoverButton');
    }

    function setCaseActionButtonsDisabled(disabled) {
      const button = getCaseMutationButton();
      if (button) button.disabled = disabled;
      const claimButton = getCaseClaimButton();
      if (claimButton) claimButton.disabled = disabled;
      const assignButton = getCaseAssignButton();
      if (assignButton) assignButton.disabled = disabled;
      const releaseClaimButton = getCaseReleaseClaimButton();
      if (releaseClaimButton) releaseClaimButton.disabled = disabled;
      const takeoverButton = getCaseTakeoverButton();
      if (takeoverButton) takeoverButton.disabled = disabled;
      const executeButton = document.getElementById('caseExecuteCompensationButton');
      if (executeButton) executeButton.disabled = disabled;
    }

    function syncCompensationInputsFromStatus() {
      const button = getCaseMutationButton();
      const isResolveAction = Boolean(button && button.dataset.action === 'resolve');
      toggleCompensationInputs(isResolveAction);
      toggleAppealDecisionInput(isResolveAction && selectedCaseAppealStatus === 'requested');
    }

    function renderCompensationSnapshot(item) {
      if (!item || !item.compensationStatus) {
        return '<p>赔付决议：未记录</p>';
      }
      return '<p>赔付决议：' + escapeHtml(formatCompensationStatus(item.compensationStatus)) + '</p>' +
        (item.compensationStatus === 'not_required'
          ? ''
          : '<p>赔付对象：' + escapeHtml(formatCompensationTargetRole(item.compensationTargetRole)) + ' · 金额：' + escapeHtml(formatMoney(item.compensationAmountCents)) + '</p>') +
        '<p>赔付更新时间：' + escapeHtml(item.compensationUpdatedAtIso || item.resolvedAtIso || item.updatedAtIso || '-') + '</p>' +
        (item.compensationExecutedAtIso
          ? '<p>赔付执行时间：' + escapeHtml(item.compensationExecutedAtIso) + '</p>'
          : '') +
        (item.compensationTransactionId
          ? '<p>赔付流水：' + escapeHtml(item.compensationTransactionId) + '</p>'
          : '') +
        '<p>申诉状态：' + escapeHtml(formatAppealStatus(item.appealStatus)) + '</p>' +
        (item.appealReason
          ? '<p>申诉理由：' + escapeHtml(item.appealReason) + '</p>'
          : '');
    }

    function readResolveCompensationInput() {
      const compensationStatus = document.getElementById('caseCompensationStatusInput').value;
      const appealDecisionInput = document.getElementById('caseAppealDecisionInput');
      const appealDecision = appealDecisionInput.value;
      if (appealDecisionInput.dataset.required === 'true' && !appealDecision) {
        throw new Error('申诉中的工单解决时必须选择申诉裁定');
      }
      if (!compensationStatus) {
        throw new Error('请选择赔付状态');
      }
      if (compensationStatus === 'not_required') {
        return {
          compensationStatus,
          ...(appealDecision ? { appealDecision } : {}),
        };
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
        ...(appealDecision ? { appealDecision } : {}),
        compensationTargetRole,
        compensationAmountCents,
      };
    }

    function renderCaseListItem(item) {
      return '<div class="case-row" data-case-id="' + escapeHtml(item.id) + '" onclick="loadCase(this.dataset.caseId)">' +
        '<strong>' + escapeHtml(item.caseNo) + '</strong> · ' + escapeHtml(item.status) +
        '<div>' + escapeHtml(item.orderNo) + ' · ' + escapeHtml(item.typeLabel) + '</div>' +
        '<div class="muted">' + escapeHtml(item.sourceRole) + ' · 创建：' + escapeHtml(item.createdAtIso || '-') + '</div>' +
        '<div class="muted">最近更新：' + escapeHtml(formatCaseRecentActivity(item)) + '</div>' +
        '<div class="muted">认领：' + escapeHtml(formatCaseClaim(item)) + '</div>' +
        '<div class="muted">赔付：' + escapeHtml(formatCompensationStatus(item.compensationStatus)) + '</div>' +
        '<div class="muted">申诉：' + escapeHtml(formatAppealStatus(item.appealStatus)) + '</div>' +
        '<div class="muted">SLA：' + escapeHtml(formatCaseSlaMeta(item.sla)) + '</div>' +
      '</div>';
    }

    function renderCaseDetail(item) {
      return '<strong>' + escapeHtml(item.caseNo) + '</strong>' +
        '<p>' + escapeHtml(item.orderNo) + ' · ' + escapeHtml(item.sourceRole) + ' · ' + escapeHtml(item.status) + '</p>' +
        '<p>' + escapeHtml(item.typeLabel) + '：' + escapeHtml(item.description) + '</p>' +
        '<p>创建时间：' + escapeHtml(item.createdAtIso || '-') + '</p>' +
        '<p>更新时间：' + escapeHtml(formatCaseRecentActivity(item)) + '</p>' +
        '<p>当前认领：' + escapeHtml(formatCaseClaim(item)) + '</p>' +
        (item.claimNote ? '<p>认领备注：' + escapeHtml(item.claimNote) + '</p>' : '') +
        '<p>SLA：' + escapeHtml(formatCaseSlaMeta(item.sla)) + '</p>' +
        '<p>SLA 目标时间：' + escapeHtml((item.sla && item.sla.targetAtIso) || '-') + '</p>' +
        '<p>附件：' + escapeHtml((item.attachmentFileIds || []).join(', ') || '无') + '</p>' +
        '<p>处理结论：' + escapeHtml(item.resolutionText || '暂无') + '</p>' +
        renderCompensationSnapshot(item);
    }

    async function loadCases(page) {
      try {
        currentPage = Math.max(1, page);
        const query = new URLSearchParams({ page: String(currentPage), pageSize: document.getElementById('casePageSizeInput').value || '20' });
        const status = document.getElementById('caseStatusInput').value;
        const sourceRole = document.getElementById('caseSourceRoleInput').value;
        const compensationStatus = document.getElementById('caseListCompensationStatusInput').value;
        const appealStatus = document.getElementById('caseListAppealStatusInput').value;
        const slaStatus = document.getElementById('caseListSlaStatusInput').value;
        const claimStatus = document.getElementById('caseClaimStatusInput').value;
        const claimedByAdminUserId = document.getElementById('caseClaimedByAdminUserIdInput').value.trim();
        const keyword = document.getElementById('caseKeywordInput').value.trim();
        if (status) query.set('status', status);
        if (sourceRole) query.set('sourceRole', sourceRole);
        if (compensationStatus) query.set('compensationStatus', compensationStatus);
        if (appealStatus) query.set('appealStatus', appealStatus);
        if (slaStatus) query.set('slaStatus', slaStatus);
        if (claimStatus) query.set('claimStatus', claimStatus);
        if (claimedByAdminUserId) query.set('claimedByAdminUserId', claimedByAdminUserId);
        if (keyword) query.set('keyword', keyword);
        syncOrderExceptionCaseRouteState(currentPage);
        const result = await api('/admin/order-exception-cases?' + query.toString());
        total = result.total;
        document.getElementById('caseListNotice').textContent = '第 ' + currentPage + ' 页，共 ' + total + ' 条';
        document.getElementById('caseList').innerHTML = result.items.length
          ? result.items.map(renderCaseListItem).join('')
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
        selectedCaseClaimedByAdminUserId = item.claimedByAdminUserId || '';
        selectedCaseAppealStatus = item.appealStatus || 'none';
        document.getElementById('baseUpdatedAtIso').value = item.updatedAtIso;
        document.getElementById('caseAssignTargetAdminUserIdInput').value = '';
        document.getElementById('caseDetail').innerHTML = renderCaseDetail(item);
        document.getElementById('caseActions').innerHTML = (item.actions || []).length
          ? (item.actions || []).map(action => '<div class="action">' + escapeHtml(action.fromStatus) + ' → ' + escapeHtml(action.toStatus) + '<br>' + escapeHtml(action.content) + '<div class="muted">' + escapeHtml(action.createdAtIso) + '</div></div>').join('')
          : '<p class="muted">暂无处理留痕</p>';
        document.getElementById('caseCompensationStatusInput').value = item.compensationStatus || 'not_required';
        document.getElementById('caseAppealDecisionInput').value = item.appealStatus === 'accepted' || item.appealStatus === 'rejected' ? item.appealStatus : '';
        document.getElementById('caseCompensationTargetRoleInput').value = item.compensationTargetRole || '';
        document.getElementById('caseCompensationAmountInput').value = item.compensationAmountCents ? String(item.compensationAmountCents) : '';
        renderMutationButtons(item);
      } catch (error) {
        document.getElementById('caseMutationNotice').textContent = error.message;
      }
    }

    function loadMyCases() {
      if (!currentAdminUserId) {
        document.getElementById('caseListNotice').textContent = '当前后台会话缺少 admin user id，请重新登录后台。';
        return;
      }
      document.getElementById('caseClaimStatusInput').value = 'claimed';
      document.getElementById('caseClaimedByAdminUserIdInput').value = currentAdminUserId;
      loadCases(1);
    }

    async function recoverCaseFromConflict() {
      const refreshTasks = [loadCases(currentPage)];

      if (selectedCaseId) {
        refreshTasks.push(loadCase(selectedCaseId));
      }

      await Promise.all(refreshTasks);
      document.getElementById('caseMutationNotice').textContent =
        '工单已被其他管理员更新，正在刷新最新状态。';
    }

    async function sweepOverdueExceptionCases() {
      if (caseSweepPending) return;

      caseSweepPending = true;
      document.getElementById('caseSweepNotice').textContent = '超时升级扫描执行中...';
      document.getElementById('sweepExceptionCaseOverdueButton').disabled = true;

      try {
        const data = await api('/admin/order-exception-cases/overdue-escalations/sweep', {
          method: 'POST',
        });
        document.getElementById('caseSweepNotice').textContent =
          '本次扫描检查 ' + String(data.scannedCount || 0) +
          ' 条 open 工单，发现超时 ' + String(data.overdueCount || 0) +
          ' 条，新增升级 ' + String(data.escalatedCount || 0) +
          ' 条，跳过 ' + String(data.skippedCount || 0) +
          ' 条，冲突 ' + String(data.conflictCount || 0) + ' 条';

        if (selectedCaseId) {
          await loadCase(selectedCaseId);
        }
        await loadCases(currentPage);
      } catch (error) {
        document.getElementById('caseSweepNotice').textContent =
          error.message || '执行超时升级扫描失败';
      } finally {
        caseSweepPending = false;
        document.getElementById('sweepExceptionCaseOverdueButton').disabled = false;
      }
    }

    function renderMutationButtons(item) {
      const target = document.getElementById('caseActions');
      const status = item.status;
      const actionByStatus = { pending: 'process', processing: 'resolve', resolved: 'close' };
      const labelByStatus = { pending: '受理工单', processing: '解决工单', resolved: '关闭工单' };
      const action = actionByStatus[status];
      let buttons = '';
      if (status === 'pending' || status === 'processing') {
        const canAssignOrTransfer =
          !item.claimedByAdminUserId ||
          isCaseClaimedByCurrentAdmin(item) ||
          !canDetermineCurrentCaseAdmin();
        const canReleaseClaim =
          item.claimedByAdminUserId &&
          (isCaseClaimedByCurrentAdmin(item) || !canDetermineCurrentCaseAdmin());

        if (!item.claimedByAdminUserId) {
          buttons += '<button id="caseClaimButton" class="secondary-button" onclick="claimCase()">认领到我</button>';
        }
        if (canAssignOrTransfer) {
          buttons += '<button id="caseAssignButton" class="secondary-button" onclick="assignCase()">' + (item.claimedByAdminUserId ? '转派给客服' : '指派给客服') + '</button>';
        }
        if (canReleaseClaim) {
          buttons += '<button id="caseReleaseClaimButton" class="secondary-button" onclick="releaseCaseClaim()">释放认领</button>';
        }
        if (isCaseClaimedByOtherAdmin(item)) {
          buttons += '<button id="caseTakeoverButton" class="secondary-button" onclick="takeoverCase()">强制接管</button>';
        }
      }
      if (action) {
        buttons += '<button id="caseMutationButton" data-action="' + action + '" onclick="mutateCase(this.dataset.action)">' + labelByStatus[status] + '</button>';
      } else {
        buttons += '<p class="muted">工单已关闭</p>';
      }
      if (status === 'resolved' && item.compensationStatus === 'pending') {
        buttons += '<button id="caseExecuteCompensationButton" class="secondary-button" onclick="executeCompensation()">执行平台赔付</button>';
      }
      target.innerHTML += buttons;
      syncCompensationInputsFromStatus();
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
      setCaseActionButtonsDisabled(true);
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
          await recoverCaseFromConflict();
        } else {
          document.getElementById('caseMutationNotice').textContent = error.message;
        }
      } finally {
        mutationPending = false;
        setCaseActionButtonsDisabled(false);
        syncCompensationInputsFromStatus();
      }
    }

    async function claimCase() {
      if (!selectedCaseId || mutationPending) return;
      const content = document.getElementById('caseActionContent').value.trim();
      if (content.length > 200) {
        document.getElementById('caseMutationNotice').textContent = '认领备注最多 200 字';
        return;
      }
      mutationPending = true;
      document.getElementById('caseMutationNotice').textContent = '';
      setCaseActionButtonsDisabled(true);
      try {
        const payload = {
          baseUpdatedAtIso: document.getElementById('baseUpdatedAtIso').value,
          ...(content ? { content } : {}),
        };
        await api('/admin/order-exception-cases/' + encodeURIComponent(selectedCaseId) + '/claim', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        document.getElementById('caseActionContent').value = '';
        document.getElementById('caseMutationNotice').textContent = '工单已认领，当前客服可继续跟进。';
        await loadCase(selectedCaseId);
        await loadCases(currentPage);
      } catch (error) {
        if (error.code === 'EXCEPTION_CASE_CONFLICT') {
          await recoverCaseFromConflict();
        } else {
          document.getElementById('caseMutationNotice').textContent = error.message;
        }
      } finally {
        mutationPending = false;
        setCaseActionButtonsDisabled(false);
        syncCompensationInputsFromStatus();
      }
    }

    async function takeoverCase() {
      if (!selectedCaseId || mutationPending) return;
      const content = document.getElementById('caseActionContent').value.trim();
      if (content.length > 200) {
        document.getElementById('caseMutationNotice').textContent = '强制接管备注最多 200 字';
        return;
      }
      mutationPending = true;
      document.getElementById('caseMutationNotice').textContent = '';
      setCaseActionButtonsDisabled(true);
      try {
        const payload = {
          baseUpdatedAtIso: document.getElementById('baseUpdatedAtIso').value,
          ...(content ? { content } : {}),
        };
        await api('/admin/order-exception-cases/' + encodeURIComponent(selectedCaseId) + '/takeover', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        document.getElementById('caseActionContent').value = '';
        document.getElementById('caseMutationNotice').textContent = '工单已强制接管，当前客服可继续跟进。';
        await loadCase(selectedCaseId);
        await loadCases(currentPage);
      } catch (error) {
        if (error.code === 'EXCEPTION_CASE_CONFLICT') {
          await recoverCaseFromConflict();
        } else {
          document.getElementById('caseMutationNotice').textContent = error.message;
        }
      } finally {
        mutationPending = false;
        setCaseActionButtonsDisabled(false);
        syncCompensationInputsFromStatus();
      }
    }

    async function releaseCaseClaim() {
      if (!selectedCaseId || mutationPending) return;
      const content = document.getElementById('caseActionContent').value.trim();
      if (content.length > 200) {
        document.getElementById('caseMutationNotice').textContent = '释放认领备注最多 200 字';
        return;
      }
      mutationPending = true;
      document.getElementById('caseMutationNotice').textContent = '';
      setCaseActionButtonsDisabled(true);
      try {
        const payload = {
          baseUpdatedAtIso: document.getElementById('baseUpdatedAtIso').value,
          ...(content ? { content } : {}),
        };
        await api('/admin/order-exception-cases/' + encodeURIComponent(selectedCaseId) + '/unclaim', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        document.getElementById('caseActionContent').value = '';
        document.getElementById('caseMutationNotice').textContent = '工单认领已释放，已回到未认领队列。';
        await loadCase(selectedCaseId);
        await loadCases(currentPage);
      } catch (error) {
        if (error.code === 'EXCEPTION_CASE_CONFLICT') {
          await recoverCaseFromConflict();
        } else {
          document.getElementById('caseMutationNotice').textContent = error.message;
        }
      } finally {
        mutationPending = false;
        setCaseActionButtonsDisabled(false);
        syncCompensationInputsFromStatus();
      }
    }

    async function assignCase() {
      if (!selectedCaseId || mutationPending) return;
      const targetAdminUserId = document.getElementById('caseAssignTargetAdminUserIdInput').value.trim();
      if (!targetAdminUserId) {
        document.getElementById('caseMutationNotice').textContent = '请输入目标客服 ID';
        return;
      }
      if (targetAdminUserId.length > 120) {
        document.getElementById('caseMutationNotice').textContent = '目标客服 ID 最多 120 字';
        return;
      }
      const content = document.getElementById('caseActionContent').value.trim();
      if (content.length > 200) {
        document.getElementById('caseMutationNotice').textContent = '指派备注最多 200 字';
        return;
      }
      const isTransfer = Boolean(selectedCaseClaimedByAdminUserId);
      mutationPending = true;
      document.getElementById('caseMutationNotice').textContent = '';
      setCaseActionButtonsDisabled(true);
      try {
        const payload = {
          baseUpdatedAtIso: document.getElementById('baseUpdatedAtIso').value,
          targetAdminUserId,
          ...(content ? { content } : {}),
        };
        await api('/admin/order-exception-cases/' + encodeURIComponent(selectedCaseId) + '/assign', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        document.getElementById('caseActionContent').value = '';
        document.getElementById('caseAssignTargetAdminUserIdInput').value = '';
        document.getElementById('caseMutationNotice').textContent = isTransfer
          ? '工单已转派给指定客服。'
          : '工单已指派给指定客服。';
        await loadCase(selectedCaseId);
        await loadCases(currentPage);
      } catch (error) {
        if (error.code === 'EXCEPTION_CASE_CONFLICT') {
          await recoverCaseFromConflict();
        } else {
          document.getElementById('caseMutationNotice').textContent = error.message;
        }
      } finally {
        mutationPending = false;
        setCaseActionButtonsDisabled(false);
        syncCompensationInputsFromStatus();
      }
    }

    async function executeCompensation() {
      if (!selectedCaseId || mutationPending) return;
      const content = document.getElementById('caseActionContent').value.trim() || '平台确认执行异常工单赔付入账。';
      if (content.length < 6 || content.length > 500) {
        document.getElementById('caseMutationNotice').textContent = '请输入 6-500 字赔付执行说明';
        return;
      }
      mutationPending = true;
      document.getElementById('caseMutationNotice').textContent = '';
      setCaseActionButtonsDisabled(true);
      try {
        await api('/admin/order-exception-cases/' + encodeURIComponent(selectedCaseId) + '/compensation/execute', {
          method: 'POST',
          body: JSON.stringify({
            baseUpdatedAtIso: document.getElementById('baseUpdatedAtIso').value,
            idempotencyKey: createIdempotencyKey(),
            content,
          }),
        });
        document.getElementById('caseActionContent').value = '';
        document.getElementById('caseMutationNotice').textContent = '平台赔付已执行并写入账本。';
        await loadCase(selectedCaseId);
        await loadCases(currentPage);
      } catch (error) {
        if (error.code === 'EXCEPTION_CASE_CONFLICT') {
          await recoverCaseFromConflict();
        } else if (error.code === 'EXCEPTION_CASE_COMPENSATION_ALREADY_EXECUTED') {
          document.getElementById('caseMutationNotice').textContent = '该工单赔付已执行，不能重复赔付。';
          await loadCase(selectedCaseId);
        } else {
          document.getElementById('caseMutationNotice').textContent = error.message;
        }
      } finally {
        mutationPending = false;
        setCaseActionButtonsDisabled(false);
        syncCompensationInputsFromStatus();
      }
    }

    document.getElementById('caseCompensationStatusInput').addEventListener('change', function() {
      syncCompensationInputsFromStatus();
    });

    resetCompensationInputs();
    const caseRouteState = applyOrderExceptionCaseRouteState();
    const currentAdminSession = initializeAdminSession();
    currentAdminUserId =
      currentAdminSession &&
      currentAdminSession.user &&
      typeof currentAdminSession.user.id === 'string'
        ? currentAdminSession.user.id.trim()
        : '';
    if (currentAdminSession && currentAdminSession.accessToken) {
      loadCases(currentPage || (caseRouteState.page ? Number.parseInt(caseRouteState.page, 10) || 1 : 1));
    }
  </script>
</body>
</html>`;
}
