import {
  renderAdminConsoleNav,
  renderAdminConsoleNavStyles,
} from './admin-console-nav-snippet';
import {
  renderAdminSessionControls,
  renderAdminSessionScript,
} from './admin-session-snippet';

export function renderEvaluationAuditAdminConsole() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>评价审计台</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f4f6f8; color: #17202a; }
    .console-shell { display: grid; grid-template-columns: minmax(360px, 42%) 1fr; gap: 16px; padding: 16px; }
    .panel { background: #fff; border: 1px solid #d8dee4; border-radius: 12px; padding: 16px; }
    .filters { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .filters-wide { display: grid; grid-template-columns: 2fr repeat(3, 1fr); gap: 8px; }
    input, select, textarea, button { box-sizing: border-box; width: 100%; padding: 9px; margin: 4px 0; }
    input, select, textarea { border: 1px solid #c9d1d9; border-radius: 6px; background: #fff; color: inherit; font: inherit; }
    textarea { min-height: 82px; resize: vertical; }
    button { cursor: pointer; background: #1769aa; color: #fff; border: 0; border-radius: 8px; }
    button:disabled { cursor: not-allowed; opacity: .55; }
    .danger-button { background: #b42318; }
    .restore-button { background: #087f5b; }
    .session-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
    .session-link { color: #1769aa; font-size: 13px; font-weight: 600; text-decoration: none; }
    .secondary-button { width: auto; background: #fff; color: #1769aa; border: 1px solid #d8dee4; }
    .audit-row { border-top: 1px solid #edf0f2; padding: 12px 0; cursor: pointer; }
    .audit-row.selected { background: #eef6ff; }
    .muted { color: #667085; font-size: 13px; }
    .error { color: #b42318; white-space: pre-wrap; }
    .tag-list { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
    .tag { background: #eef2f6; border-radius: 999px; padding: 4px 10px; font-size: 12px; }
    .status-badge { display: inline-block; border-radius: 999px; padding: 3px 8px; font-size: 12px; font-weight: 700; }
    .status-badge.visible { background: #dcfce7; color: #166534; }
    .status-badge.hidden { background: #fee2e2; color: #991b1b; }
    .status-badge.requested { background: #fef3c7; color: #92400e; }
    .status-badge.accepted { background: #dbeafe; color: #1d4ed8; }
    .status-badge.rejected { background: #f3f4f6; color: #4b5563; }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .detail-card { border: 1px solid #edf0f2; border-radius: 10px; padding: 12px; margin-top: 12px; }
    .moderation-heading { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .moderation-event { border-top: 1px solid #edf0f2; padding: 10px 0; }
    .moderation-event:first-child { border-top: 0; }
    ul { padding-left: 18px; }
    ${renderAdminConsoleNavStyles()}
    @media (max-width: 820px) {
      .console-shell { grid-template-columns: 1fr; }
      .filters-wide { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="console-shell">
    <section class="panel">
      <h1>评价审计台</h1>
      <label>Admin access token<input id="adminToken" type="password" /></label>
      ${renderAdminSessionControls({
        currentRoute: '/api/admin/evaluation-audit-console',
      })}
      ${renderAdminConsoleNav({
        currentRoute: '/api/admin/evaluation-audit-console',
      })}
      <div class="filters-wide">
        <label>关键字<input id="auditKeywordInput" placeholder="订单号、评价人、被评价人、内容、标签" /></label>
        <label>方向<select id="auditDirectionInput"><option value="">全部方向</option><option value="shipper_to_driver">货主评价司机</option><option value="driver_to_shipper">司机评价货主</option></select></label>
        <label>评分<select id="auditRatingInput"><option value="">全部评分</option><option value="5">5 星</option><option value="4">4 星</option><option value="3">3 星</option><option value="2">2 星</option><option value="1">1 星</option></select></label>
        <label>展示状态<select id="auditModerationStatusInput"><option value="">全部状态</option><option value="visible">展示中</option><option value="hidden">已隐藏</option></select></label>
      </div>
      <div class="filters">
        <label>申诉状态<select id="auditAppealStatusInput"><option value="">全部申诉</option><option value="none">未申诉</option><option value="requested">待处理</option><option value="accepted">已通过</option><option value="rejected">已驳回</option></select></label>
        <label>每页<input id="auditPageSizeInput" type="number" min="1" max="50" value="20" /></label>
      </div>
      <div class="filters">
        <label>&nbsp;<button id="loadAuditButton" onclick="refreshAuditWorkspace(1)">查询评价</button></label>
        <label>&nbsp;</label>
      </div>
      <div id="auditListNotice" class="error"></div>
      <div id="auditPaginationStatus" class="muted">暂无评价记录</div>
      <div id="auditList"></div>
      <div class="filters">
        <button id="auditPreviousPage" onclick="changeAuditPage(-1)">上一页</button>
        <button id="auditNextPage" onclick="changeAuditPage(1)">下一页</button>
      </div>
    </section>
    <section class="panel">
      <h2>评价详情</h2>
      <div id="auditDetail" class="muted">请选择左侧评价记录</div>
      <div id="auditTags" class="tag-list"></div>
      <div id="auditModerationPanel" class="detail-card" hidden>
        <div class="moderation-heading">
          <strong>展示处置</strong>
          <span id="auditModerationStatus" class="status-badge visible">展示中</span>
        </div>
        <p id="auditModerationSummary" class="muted"></p>
        <label>处置原因<textarea id="auditModerationReason" maxlength="200" placeholder="填写本次隐藏或恢复的依据"></textarea></label>
        <button id="auditModerationButton" type="button" onclick="submitEvaluationModeration()">隐藏评价</button>
        <div id="auditModerationNotice" class="error" aria-live="polite"></div>
      </div>
      <div id="auditModerationHistoryPanel" class="detail-card" hidden>
        <strong>处置历史</strong>
        <div id="auditModerationHistoryNotice" class="muted"></div>
        <div id="auditModerationHistory"></div>
      </div>
      <div id="auditAppealPanel" class="detail-card" hidden>
        <div class="moderation-heading">
          <strong>评价申诉</strong>
          <span id="auditAppealStatus" class="status-badge">未申诉</span>
        </div>
        <p id="auditAppealSummary" class="muted"></p>
        <div id="auditAppealDecisionForm">
          <label>裁定结果<select id="auditAppealDecisionInput"><option value="accepted">通过申诉并恢复展示</option><option value="rejected">驳回申诉并保持隐藏</option></select></label>
          <label>裁定原因<textarea id="auditAppealReason" maxlength="500" placeholder="填写本次申诉裁定依据（至少 2 个字符）"></textarea></label>
          <button id="auditAppealButton" type="button" onclick="submitEvaluationAppealDecision()">提交申诉裁定</button>
        </div>
        <div id="auditAppealNotice" class="error" aria-live="polite"></div>
      </div>
      <div id="auditAppealHistoryPanel" class="detail-card" hidden>
        <strong>申诉历史</strong>
        <div id="auditAppealHistoryNotice" class="muted"></div>
        <div id="auditAppealHistory"></div>
      </div>
      <div id="auditPhotoPanel" class="detail-card" hidden>
        <strong>图片文件</strong>
        <p id="auditPhotoNotice" class="muted"></p>
        <ul id="auditPhotoList"></ul>
      </div>
    </section>
  </main>
  <script>
    const apiBase = '/api';
    let currentPage = 1;
    let total = 0;
    let currentItems = [];
    let selectedAuditId = '';
    let selectedAuditDetail = null;
    let auditSelectionEpoch = 0;
    let latestAuditRequestId = 0;
    let latestAuditDetailRequestId = 0;
    let latestAuditModerationMutationRequestId = 0;
    let latestAuditAppealMutationRequestId = 0;
    let auditModerationMutationPending = false;
    let auditAppealMutationPending = false;
    ${renderAdminSessionScript({
      currentRoute: '/api/admin/evaluation-audit-console',
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
        headers: {
          Authorization: 'Bearer ' + token(),
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {}),
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

    function formatDirection(direction) {
      return direction === 'shipper_to_driver' ? '货主评价司机' : '司机评价货主';
    }

    function formatRating(rating) {
      return rating + ' 星';
    }

    function normalizeModerationStatus(status) {
      return status === 'hidden' ? 'hidden' : 'visible';
    }

    function formatModerationStatus(status) {
      return normalizeModerationStatus(status) === 'hidden' ? '已隐藏' : '展示中';
    }

    function normalizeAppealStatus(status) {
      if (status === 'requested' || status === 'accepted' || status === 'rejected') {
        return status;
      }
      return 'none';
    }

    function formatAppealStatus(status) {
      switch (normalizeAppealStatus(status)) {
        case 'requested':
          return '待处理';
        case 'accepted':
          return '已通过';
        case 'rejected':
          return '已驳回';
        default:
          return '未申诉';
      }
    }

    function isCurrentAuditSelection(targetAuditId, selectionEpoch) {
      return (
        selectedAuditId === targetAuditId &&
        auditSelectionEpoch === selectionEpoch
      );
    }

    function clearAuditAttachmentPanel() {
      document.getElementById('auditPhotoNotice').textContent = '';
      document.getElementById('auditPhotoList').innerHTML = '';
      document.getElementById('auditPhotoPanel').hidden = true;
    }

    function clearAuditModerationPanels() {
      selectedAuditDetail = null;
      document.getElementById('auditModerationPanel').hidden = true;
      document.getElementById('auditModerationReason').value = '';
      document.getElementById('auditModerationNotice').textContent = '';
      document.getElementById('auditModerationHistoryPanel').hidden = true;
      document.getElementById('auditModerationHistoryNotice').textContent = '';
      document.getElementById('auditModerationHistory').innerHTML = '';
      document.getElementById('auditAppealPanel').hidden = true;
      document.getElementById('auditAppealReason').value = '';
      document.getElementById('auditAppealNotice').textContent = '';
      document.getElementById('auditAppealHistoryPanel').hidden = true;
      document.getElementById('auditAppealHistoryNotice').textContent = '';
      document.getElementById('auditAppealHistory').innerHTML = '';
    }

    function renderAuditDetailMessage(message) {
      document.getElementById('auditDetail').innerHTML =
        '<p class="muted">' + escapeHtml(message || '请选择左侧评价记录') + '</p>';
      document.getElementById('auditTags').innerHTML = '';
      clearAuditAttachmentPanel();
      clearAuditModerationPanels();
    }

    function readEvaluationAuditRouteState() {
      const query = new URLSearchParams(
        globalThis.location && typeof globalThis.location.search === 'string'
          ? location.search
          : '',
      );
      return {
        direction: query.get('direction') || '',
        moderationStatus: query.get('moderationStatus') || '',
        appealStatus: query.get('appealStatus') || '',
        rating: query.get('rating') || '',
        keyword: query.get('keyword') || '',
        auditId: query.get('auditId') || '',
        page: query.get('page') || '',
        pageSize: query.get('pageSize') || '',
      };
    }

    function applyEvaluationAuditRouteState() {
      const routeState = readEvaluationAuditRouteState();
      document.getElementById('auditDirectionInput').value = routeState.direction;
      document.getElementById('auditModerationStatusInput').value =
        routeState.moderationStatus;
      document.getElementById('auditAppealStatusInput').value =
        routeState.appealStatus;
      document.getElementById('auditRatingInput').value = routeState.rating;
      document.getElementById('auditKeywordInput').value = routeState.keyword;
      if (routeState.page) {
        currentPage = Math.max(1, Number.parseInt(routeState.page, 10) || 1);
      }
      if (routeState.pageSize) {
        document.getElementById('auditPageSizeInput').value = String(
          Math.min(50, Math.max(1, Number.parseInt(routeState.pageSize, 10) || 20)),
        );
      }
      selectedAuditId = routeState.auditId;
      return routeState;
    }

    function syncEvaluationAuditRouteState(pageOverride, pageSizeOverride, auditIdOverride) {
      if (!globalThis.history || !globalThis.location) {
        return;
      }

      const query = new URLSearchParams();
      const direction = document.getElementById('auditDirectionInput').value;
      const moderationStatus = document.getElementById('auditModerationStatusInput').value;
      const appealStatus = document.getElementById('auditAppealStatusInput').value;
      const rating = document.getElementById('auditRatingInput').value;
      const keyword = document.getElementById('auditKeywordInput').value.trim();
      const pageSize = Math.min(
        50,
        Math.max(
          1,
          Number.parseInt(
            String(pageSizeOverride || document.getElementById('auditPageSizeInput').value || '20'),
            10,
          ) || 20,
        ),
      );
      const page = Math.max(1, Number.parseInt(String(pageOverride || currentPage || 1), 10) || 1);
      const auditId = String(
        typeof auditIdOverride === 'string'
          ? auditIdOverride
          : selectedAuditId || '',
      ).trim();
      if (direction) query.set('direction', direction);
      if (moderationStatus) query.set('moderationStatus', moderationStatus);
      if (appealStatus) query.set('appealStatus', appealStatus);
      if (rating) query.set('rating', rating);
      if (keyword) query.set('keyword', keyword);
      if (auditId) query.set('auditId', auditId);
      if (page > 1) query.set('page', String(page));
      if (pageSize !== 20) query.set('pageSize', String(pageSize));
      const nextQuery = query.toString();
      const nextPath = globalThis.location.pathname + (nextQuery ? '?' + nextQuery : '');
      globalThis.history.replaceState(null, '', nextPath);
    }

    async function loadAudits(page) {
      const requestId = ++latestAuditRequestId;
      const requestedPage = Math.max(1, page);
      currentPage = requestedPage;
      try {
        const pageSize = document.getElementById('auditPageSizeInput').value || '20';
        const query = new URLSearchParams({
          page: String(requestedPage),
          pageSize: String(pageSize),
        });
        const direction = document.getElementById('auditDirectionInput').value;
        const moderationStatus = document.getElementById('auditModerationStatusInput').value;
        const appealStatus = document.getElementById('auditAppealStatusInput').value;
        const rating = document.getElementById('auditRatingInput').value;
        const keyword = document.getElementById('auditKeywordInput').value.trim();
        if (direction) query.set('direction', direction);
        if (moderationStatus) query.set('moderationStatus', moderationStatus);
        if (appealStatus) query.set('appealStatus', appealStatus);
        if (rating) query.set('rating', rating);
        if (keyword) query.set('keyword', keyword);
        syncEvaluationAuditRouteState(requestedPage, pageSize);
        const result = await api('/admin/evaluations?' + query.toString());
        if (requestId !== latestAuditRequestId) return;
        const resultTotal = Number(result.total || 0);
        const maxPage = Math.max(1, Math.ceil(resultTotal / Number(pageSize)));
        if (requestedPage > maxPage) return loadAudits(maxPage);
        total = resultTotal;
        currentItems = result.items || [];
        document.getElementById('auditListNotice').textContent = '';
        renderAuditPagination(pageSize);
        renderAuditList();
        if (!selectedAuditId) {
          const firstAuditId = currentItems[0]?.id || '';
          if (firstAuditId) {
            await selectAudit(firstAuditId);
          } else {
            renderAuditDetailMessage('当前筛选条件下暂无评价记录');
          }
        }
      } catch (error) {
        if (requestId !== latestAuditRequestId) return;
        clearAuditQueueResults();
        document.getElementById('auditListNotice').textContent = error.message;
      }
    }

    async function refreshAuditWorkspace(page) {
      const targetAuditId = selectedAuditId;
      await Promise.all([
        loadAudits(page),
        ...(targetAuditId ? [selectAudit(targetAuditId)] : []),
      ]);
    }

    function clearAuditQueueResults() {
      total = 0;
      currentItems = [];
      document.getElementById('auditPaginationStatus').textContent = '评价记录加载失败';
      document.getElementById('auditList').innerHTML = '';
      document.getElementById('auditPreviousPage').disabled = true;
      document.getElementById('auditNextPage').disabled = true;
    }

    function renderAuditPagination(pageSizeValue) {
      const pageSize = Number(pageSizeValue || 20);
      const maxPage = Math.max(1, Math.ceil(total / pageSize));
      document.getElementById('auditPaginationStatus').textContent =
        '第 ' + currentPage + ' 页 / 共 ' + maxPage + ' 页，当前筛选命中 ' + total + ' 条记录';
      document.getElementById('auditPreviousPage').disabled = currentPage <= 1;
      document.getElementById('auditNextPage').disabled = currentPage >= maxPage;
    }

    function renderAuditList() {
      document.getElementById('auditList').innerHTML = currentItems.length
        ? currentItems.map(item => {
            const moderationStatus = normalizeModerationStatus(item.moderationStatus);
            const appealStatus = normalizeAppealStatus(item.appealStatus);
            const appealBadge =
              appealStatus === 'none'
                ? ''
                : ' <span class="status-badge ' +
                  appealStatus +
                  '">' +
                  escapeHtml(formatAppealStatus(appealStatus)) +
                  '</span>';
            return '<div class="audit-row' + (item.id === selectedAuditId ? ' selected' : '') + '" data-audit-id="' + escapeHtml(item.id) + '" onclick="selectAudit(this.dataset.auditId)"><strong>' + escapeHtml(item.orderNo) + '</strong> · ' + escapeHtml(formatDirection(item.direction)) + ' <span class="status-badge ' + moderationStatus + '">' + escapeHtml(formatModerationStatus(moderationStatus)) + '</span>' + appealBadge + '<div>' + escapeHtml(item.reviewerName) + ' → ' + escapeHtml(item.revieweeName) + '</div><div class="muted">' + escapeHtml(formatRating(item.rating)) + ' · ' + escapeHtml(item.submittedAtIso) + '</div></div>';
          }).join('')
        : '<p class="muted">暂无评价记录</p>';
    }

    function changeAuditPage(offset) {
      const pageSize = Number(document.getElementById('auditPageSizeInput').value || 20);
      const maxPage = Math.max(1, Math.ceil(total / pageSize));
      refreshAuditWorkspace(Math.min(maxPage, Math.max(1, currentPage + offset)));
    }

    async function selectAudit(auditId) {
      const requestId = ++latestAuditDetailRequestId;
      const selectionEpoch = ++auditSelectionEpoch;
      const targetAuditId = String(auditId || '').trim();
      selectedAuditId = targetAuditId;
      syncEvaluationAuditRouteState(
        currentPage,
        document.getElementById('auditPageSizeInput').value || '20',
        selectedAuditId,
      );
      renderAuditList();
      renderAuditDetailMessage(
        targetAuditId ? '评价详情加载中...' : '请选择左侧评价记录',
      );
      if (!targetAuditId) {
        return;
      }

      try {
        const [
          detailResult,
          attachmentResult,
          moderationEventsResult,
          appealEventsResult,
        ] = await Promise.allSettled([
          api('/admin/evaluations/' + encodeURIComponent(targetAuditId)),
          api('/admin/evaluations/' + encodeURIComponent(targetAuditId) + '/attachments'),
          api('/admin/evaluations/' + encodeURIComponent(targetAuditId) + '/moderation-events'),
          api('/admin/evaluations/' + encodeURIComponent(targetAuditId) + '/appeal-events'),
        ]);
        if (
          requestId !== latestAuditDetailRequestId ||
          !isCurrentAuditSelection(targetAuditId, selectionEpoch)
        ) return;
        if (detailResult.status !== 'fulfilled') {
          const detailError = detailResult.reason;
          renderAuditDetailMessage(
            detailError && detailError.message
              ? detailError.message
              : '评价详情加载失败',
          );
          return;
        }
        const item = detailResult.value;
        renderAuditDetail(item);
        if (attachmentResult.status === 'fulfilled') {
          renderAuditAttachments(attachmentResult.value);
        } else {
          renderAuditAttachmentError(item, attachmentResult.reason);
        }
        if (moderationEventsResult.status === 'fulfilled') {
          renderAuditModerationEvents(moderationEventsResult.value);
        } else {
          renderAuditModerationEventsError(moderationEventsResult.reason);
        }
        if (appealEventsResult.status === 'fulfilled') {
          renderAuditAppealEvents(appealEventsResult.value);
        } else {
          renderAuditAppealEventsError(appealEventsResult.reason);
        }
      } catch (error) {
        if (
          requestId !== latestAuditDetailRequestId ||
          !isCurrentAuditSelection(targetAuditId, selectionEpoch)
        ) return;
        renderAuditDetailMessage(error.message || '评价详情加载失败');
      }
    }

    function renderAuditDetail(item) {
      selectedAuditDetail = item;
      document.getElementById('auditDetail').innerHTML =
        '<div class="detail-grid">' +
          '<div class="detail-card"><strong>订单</strong><div>' + escapeHtml(item.orderNo) + '</div><div class="muted">' + escapeHtml(item.orderId) + '</div></div>' +
          '<div class="detail-card"><strong>方向</strong><div>' + escapeHtml(formatDirection(item.direction)) + '</div><div class="muted">' + escapeHtml(formatRating(item.rating)) + ' · ' + escapeHtml(item.anonymous ? '匿名评价' : '实名评价') + '</div></div>' +
          '<div class="detail-card"><strong>评价人</strong><div>' + escapeHtml(item.reviewerName) + '</div><div class="muted">' + escapeHtml(item.reviewerUserId) + '</div></div>' +
          '<div class="detail-card"><strong>被评价人</strong><div>' + escapeHtml(item.revieweeName) + '</div><div class="muted">' + escapeHtml(item.revieweeUserId) + '</div></div>' +
        '</div>' +
        '<div class="detail-card"><strong>评价内容</strong><p>' + escapeHtml(item.content) + '</p><div class="muted">提交时间：' + escapeHtml(item.submittedAtIso) + '</div></div>';
      document.getElementById('auditTags').innerHTML = (item.tags || []).map(tag => '<span class="tag">' + escapeHtml(tag) + '</span>').join('');
      renderAuditModeration(item);
      renderAuditAppeal(item);
    }

    function renderAuditModeration(item) {
      const status = normalizeModerationStatus(item.moderationStatus);
      const version = Math.max(0, Number(item.moderationVersion || 0));
      const targetStatus = status === 'hidden' ? 'visible' : 'hidden';
      const statusNode = document.getElementById('auditModerationStatus');
      statusNode.className = 'status-badge ' + status;
      statusNode.textContent = formatModerationStatus(status);
      document.getElementById('auditModerationSummary').textContent =
        version > 0
          ? '版本 ' + version + ' · 原因：' + (item.moderationReason || '-') +
            ' · 管理员：' + (item.moderatedByAdminId || '-') +
            ' · 时间：' + (item.moderatedAtIso || '-')
          : '尚无处置记录 · 版本 0';
      const button = document.getElementById('auditModerationButton');
      button.textContent = targetStatus === 'hidden' ? '隐藏评价' : '恢复展示';
      button.className = targetStatus === 'hidden' ? 'danger-button' : 'restore-button';
      const appealPending =
        normalizeAppealStatus(item.appealStatus) === 'requested';
      button.disabled = auditModerationMutationPending || appealPending;
      if (appealPending) {
        document.getElementById('auditModerationNotice').textContent =
          '存在待处理申诉时，请先裁定申诉，不能直接改展示状态';
      }
      document.getElementById('auditModerationPanel').hidden = false;
    }

    function renderAuditModerationEvents(events) {
      const items = Array.isArray(events) ? events : [];
      document.getElementById('auditModerationHistoryPanel').hidden = false;
      document.getElementById('auditModerationHistoryNotice').textContent =
        items.length ? '共 ' + items.length + ' 条处置记录' : '暂无处置记录';
      document.getElementById('auditModerationHistory').innerHTML = items
        .map(event =>
          '<div class="moderation-event"><strong>' +
            escapeHtml(formatModerationStatus(event.fromStatus)) + ' → ' +
            escapeHtml(formatModerationStatus(event.toStatus)) +
            '</strong><div>' + escapeHtml(event.reason) + '</div>' +
            '<div class="muted">版本 ' + escapeHtml(event.fromVersion) + ' → ' +
            escapeHtml(event.toVersion) + ' · 管理员：' +
            escapeHtml(event.adminUserId) + ' · ' +
            escapeHtml(event.createdAtIso) + '</div></div>',
        )
        .join('');
    }

    function renderAuditModerationEventsError(error) {
      document.getElementById('auditModerationHistoryPanel').hidden = false;
      document.getElementById('auditModerationHistoryNotice').textContent =
        error && error.message ? error.message : '处置历史加载失败';
      document.getElementById('auditModerationHistory').innerHTML = '';
    }

    function renderAuditAppeal(item) {
      const appealStatus = normalizeAppealStatus(item.appealStatus);
      const latestAppeal = item.latestAppeal || null;
      const statusNode = document.getElementById('auditAppealStatus');
      statusNode.className = 'status-badge ' + appealStatus;
      statusNode.textContent = formatAppealStatus(appealStatus);
      if (latestAppeal) {
        document.getElementById('auditAppealSummary').textContent =
          '申诉版本 ' +
          (latestAppeal.version || '-') +
          ' · 理由：' +
          (latestAppeal.reason || '-') +
          ' · 提交：' +
          (latestAppeal.submittedAtIso || '-') +
          (latestAppeal.resolutionReason
            ? ' · 裁定：' + latestAppeal.resolutionReason
            : '');
      } else {
        document.getElementById('auditAppealSummary').textContent =
          appealStatus === 'none' ? '当前没有申诉记录' : '暂无最新申诉快照';
      }
      const decisionForm = document.getElementById('auditAppealDecisionForm');
      const canDecide =
        appealStatus === 'requested' &&
        latestAppeal &&
        latestAppeal.id &&
        Number(latestAppeal.version || 0) >= 1;
      decisionForm.hidden = !canDecide;
      document.getElementById('auditAppealButton').disabled =
        auditAppealMutationPending || !canDecide;
      document.getElementById('auditAppealPanel').hidden = false;
    }

    function renderAuditAppealEvents(events) {
      const items = Array.isArray(events) ? events : [];
      document.getElementById('auditAppealHistoryPanel').hidden = false;
      document.getElementById('auditAppealHistoryNotice').textContent =
        items.length ? '共 ' + items.length + ' 条申诉记录' : '暂无申诉记录';
      document.getElementById('auditAppealHistory').innerHTML = items
        .map(event =>
          '<div class="moderation-event"><strong>' +
            escapeHtml(formatAppealStatus(event.fromStatus || 'none')) +
            ' → ' +
            escapeHtml(formatAppealStatus(event.toStatus)) +
            '</strong><div>' +
            escapeHtml(event.reason) +
            '</div>' +
            '<div class="muted">版本 ' +
            escapeHtml(event.fromVersion) +
            ' → ' +
            escapeHtml(event.toVersion) +
            ' · 操作人：' +
            escapeHtml(event.actorUserId) +
            ' · ' +
            escapeHtml(event.createdAtIso) +
            '</div></div>',
        )
        .join('');
    }

    function renderAuditAppealEventsError(error) {
      document.getElementById('auditAppealHistoryPanel').hidden = false;
      document.getElementById('auditAppealHistoryNotice').textContent =
        error && error.message ? error.message : '申诉历史加载失败';
      document.getElementById('auditAppealHistory').innerHTML = '';
    }

    async function submitEvaluationAppealDecision() {
      if (auditAppealMutationPending) return;
      if (!selectedAuditDetail || selectedAuditDetail.id !== selectedAuditId) {
        document.getElementById('auditAppealNotice').textContent = '请先选择评价记录';
        return;
      }

      const latestAppeal = selectedAuditDetail.latestAppeal;
      if (!latestAppeal || !latestAppeal.id) {
        document.getElementById('auditAppealNotice').textContent = '当前评价没有可裁定的申诉';
        return;
      }
      if (normalizeAppealStatus(selectedAuditDetail.appealStatus) !== 'requested') {
        document.getElementById('auditAppealNotice').textContent = '仅待处理申诉可裁定';
        return;
      }

      const targetAuditId = selectedAuditId;
      const selectionEpoch = auditSelectionEpoch;
      const requestId = ++latestAuditAppealMutationRequestId;
      const decision = document.getElementById('auditAppealDecisionInput').value;
      const reason = document.getElementById('auditAppealReason').value.trim();
      if (decision !== 'accepted' && decision !== 'rejected') {
        document.getElementById('auditAppealNotice').textContent = '请选择裁定结果';
        return;
      }
      if (reason.length < 2 || reason.length > 500) {
        document.getElementById('auditAppealNotice').textContent =
          '裁定原因需为 2-500 个字符';
        return;
      }

      auditAppealMutationPending = true;
      renderAuditAppeal(selectedAuditDetail);
      document.getElementById('auditAppealNotice').textContent = '提交申诉裁定中...';
      let refreshMessage = '';
      let shouldRefreshList = false;
      try {
        await api(
          '/admin/evaluations/' +
            encodeURIComponent(targetAuditId) +
            '/appeals/' +
            encodeURIComponent(latestAppeal.id),
          {
            method: 'PUT',
            body: JSON.stringify({
              decision: decision,
              reason: reason,
              baseAppealVersion: Math.max(1, Number(latestAppeal.version || 1)),
              baseModerationVersion: Math.max(
                1,
                Number(selectedAuditDetail.moderationVersion || 1),
              ),
            }),
          },
        );
        if (requestId !== latestAuditAppealMutationRequestId) return;
        shouldRefreshList = true;
        if (isCurrentAuditSelection(targetAuditId, selectionEpoch)) {
          refreshMessage =
            decision === 'accepted' ? '申诉已通过，评价已恢复展示' : '申诉已驳回';
        }
      } catch (error) {
        if (requestId !== latestAuditAppealMutationRequestId) return;
        if (
          error.code === 'EVALUATION_APPEAL_CONFLICT' ||
          error.code === 'EVALUATION_MODERATION_CONFLICT'
        ) {
          shouldRefreshList = true;
          if (isCurrentAuditSelection(targetAuditId, selectionEpoch)) {
            refreshMessage =
              (error.message || '评价申诉状态已更新') + '，已刷新最新状态';
          }
        } else if (isCurrentAuditSelection(targetAuditId, selectionEpoch)) {
          document.getElementById('auditAppealNotice').textContent =
            error.message || '申诉裁定失败';
        }
      } finally {
        auditAppealMutationPending = false;
        if (
          selectedAuditDetail &&
          selectedAuditDetail.id === selectedAuditId
        ) {
          renderAuditAppeal(selectedAuditDetail);
        }
      }

      if (!shouldRefreshList) {
        return;
      }
      if (!refreshMessage || !isCurrentAuditSelection(targetAuditId, selectionEpoch)) {
        await loadAudits(currentPage);
        return;
      }
      const detailRefresh = selectAudit(targetAuditId);
      const refreshSelectionEpoch = auditSelectionEpoch;
      await Promise.all([loadAudits(currentPage), detailRefresh]);
      if (isCurrentAuditSelection(targetAuditId, refreshSelectionEpoch)) {
        document.getElementById('auditAppealReason').value = '';
        document.getElementById('auditAppealNotice').textContent = refreshMessage;
      }
    }

    async function submitEvaluationModeration() {
      if (auditModerationMutationPending) return;
      if (!selectedAuditDetail || selectedAuditDetail.id !== selectedAuditId) {
        document.getElementById('auditModerationNotice').textContent = '请先选择评价记录';
        return;
      }

      const targetAuditId = selectedAuditId;
      const selectionEpoch = auditSelectionEpoch;
      const requestId = ++latestAuditModerationMutationRequestId;
      const currentStatus = normalizeModerationStatus(
        selectedAuditDetail.moderationStatus,
      );
      const targetStatus = currentStatus === 'hidden' ? 'visible' : 'hidden';
      const reason = document.getElementById('auditModerationReason').value.trim();
      if (reason.length < 2 || reason.length > 200) {
        document.getElementById('auditModerationNotice').textContent =
          '处置原因需为 2-200 个字符';
        return;
      }

      auditModerationMutationPending = true;
      renderAuditModeration(selectedAuditDetail);
      document.getElementById('auditModerationNotice').textContent = '提交处置中...';
      let refreshMessage = '';
      let shouldRefreshList = false;
      try {
        await api(
          '/admin/evaluations/' + encodeURIComponent(targetAuditId) + '/moderation',
          {
            method: 'PUT',
            body: JSON.stringify({
              status: targetStatus,
              reason,
              baseModerationVersion: Math.max(
                0,
                Number(selectedAuditDetail.moderationVersion || 0),
              ),
            }),
          },
        );
        if (requestId !== latestAuditModerationMutationRequestId) return;
        shouldRefreshList = true;
        if (isCurrentAuditSelection(targetAuditId, selectionEpoch)) {
          refreshMessage = targetStatus === 'hidden' ? '评价已隐藏' : '评价已恢复展示';
        }
      } catch (error) {
        if (requestId !== latestAuditModerationMutationRequestId) return;
        if (error.code === 'EVALUATION_MODERATION_CONFLICT') {
          shouldRefreshList = true;
          if (isCurrentAuditSelection(targetAuditId, selectionEpoch)) {
            refreshMessage = (error.message || '评价处置状态已更新') + '，已刷新最新状态';
          }
        } else if (isCurrentAuditSelection(targetAuditId, selectionEpoch)) {
          document.getElementById('auditModerationNotice').textContent =
            error.message || '评价处置失败';
        }
      } finally {
        auditModerationMutationPending = false;
        if (
          selectedAuditDetail &&
          selectedAuditDetail.id === selectedAuditId
        ) {
          renderAuditModeration(selectedAuditDetail);
        }
      }

      if (!shouldRefreshList) {
        return;
      }
      if (!refreshMessage || !isCurrentAuditSelection(targetAuditId, selectionEpoch)) {
        await loadAudits(currentPage);
        return;
      }
      const detailRefresh = selectAudit(targetAuditId);
      const refreshSelectionEpoch = auditSelectionEpoch;
      await Promise.all([loadAudits(currentPage), detailRefresh]);
      if (isCurrentAuditSelection(targetAuditId, refreshSelectionEpoch)) {
        document.getElementById('auditModerationReason').value = '';
        document.getElementById('auditModerationNotice').textContent = refreshMessage;
      }
    }

    function renderAuditAttachmentError(item, error) {
      const photoFileIds = Array.isArray(item.photoFileIds) ? item.photoFileIds : [];
      if (Number(item.photoCount || 0) === 0 && photoFileIds.length === 0) {
        clearAuditAttachmentPanel();
        return;
      }
      document.getElementById('auditPhotoPanel').hidden = false;
      document.getElementById('auditPhotoNotice').textContent =
        error && error.message ? error.message : '图片附件加载失败';
      document.getElementById('auditPhotoList').innerHTML = photoFileIds.length
        ? photoFileIds.map(fileId => '<li>文件 ID：' + escapeHtml(fileId) + '</li>').join('')
        : '<li>附件元数据暂不可用</li>';
    }

    function renderAuditAttachments(preview) {
      const items = Array.isArray(preview.items) ? preview.items : [];
      const missingFileIds = Array.isArray(preview.missingFileIds) ? preview.missingFileIds : [];
      const photoCount = Number(preview.photoCount || 0);

      document.getElementById('auditPhotoNotice').textContent = items.length
        ? '已加载 ' + items.length + ' 个可预览附件'
        : missingFileIds.length
          ? '当前评价图片存在缺失或不可预览文件'
          : photoCount > 0
            ? '历史评价标记了图片凭证，但当前没有可预览文件引用'
            : '';

      document.getElementById('auditPhotoList').innerHTML = [
        ...items.map(item =>
          '<li><strong>文件 ID：</strong>' + escapeHtml(item.id) +
            '<br><span class="muted">状态：' + escapeHtml(item.status) + ' · objectKey：' + escapeHtml(item.objectKey) + '</span>' +
            '<br><a href="' + escapeHtml(item.previewUrl || item.publicUrl || '#') + '" target="_blank" rel="noreferrer">打开预览</a>' +
            '<span class="muted"> · 过期：' + escapeHtml(item.previewExpiresAtIso || '-') + '</span></li>'
        ),
        ...(missingFileIds.length
          ? ['<li>缺失文件：' + escapeHtml(missingFileIds.join(', ')) + '</li>']
          : []),
        ...(!items.length && !missingFileIds.length
          ? ['<li>暂无可展示附件</li>']
          : []),
      ].join('');
      document.getElementById('auditPhotoPanel').hidden =
        items.length === 0 && missingFileIds.length === 0 && photoCount === 0;
    }

    applyEvaluationAuditRouteState();
    const currentAdminSession = initializeAdminSession();
    if (currentAdminSession && currentAdminSession.accessToken) {
      refreshAuditWorkspace(currentPage);
    }
  </script>
</body>
</html>`;
}
