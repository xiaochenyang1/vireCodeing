import {
  renderAdminConsoleNav,
  renderAdminConsoleNavStyles,
} from './admin-console-nav-snippet';
import {
  renderAdminSessionControls,
  renderAdminSessionScript,
} from './admin-session-snippet';

export function renderShipperVerificationAdminConsole() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="admin-shipper-verification-api" content="/api/admin/shipper-verifications" />
  <title>货主认证审核台</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7f8;
      --panel: #ffffff;
      --line: #d8dee3;
      --text: #182026;
      --muted: #66727d;
      --accent: #0f766e;
      --danger: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    button, input, select, textarea { font: inherit; }
    .console-shell {
      display: grid;
      grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
      min-height: 100vh;
    }
    .queue-panel, .detail-panel { padding: 20px; }
    .queue-panel {
      border-right: 1px solid var(--line);
      background: #eef2f4;
    }
    .topbar, .toolbar, .review-row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .topbar { justify-content: space-between; margin-bottom: 16px; }
    h1 { margin: 0; font-size: 22px; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .card.selected {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent) inset;
    }
    .muted { color: var(--muted); font-size: 13px; }
    .status-line {
      margin: 8px 0 12px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
      min-height: 20px;
      white-space: pre-wrap;
    }
    input, select, textarea {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 8px 10px;
      background: #fff;
    }
    button {
      border: 0;
      border-radius: 8px;
      padding: 8px 12px;
      background: var(--accent);
      color: #fff;
      cursor: pointer;
    }
    button.secondary { background: #44515b; }
    button.danger { background: var(--danger); }
    button:disabled { cursor: not-allowed; opacity: 0.5; }
    .pagination-row {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      margin: 10px 0;
    }
    .queue-item { cursor: pointer; }
    .queue-item strong { display: block; margin-bottom: 4px; }
    .detail-grid { display: grid; gap: 8px; }
    .detail-grid div,
    .attachment-card,
    .event-item {
      background: #f8fafb;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
    }
    .attachments,
    .event-list { display: grid; gap: 8px; }
    .attachment-link {
      color: var(--accent);
      word-break: break-all;
    }
    textarea {
      width: 100%;
      min-height: 80px;
      resize: vertical;
    }
    ${renderAdminConsoleNavStyles()}
    @media (max-width: 860px) {
      .console-shell { grid-template-columns: 1fr; }
      .queue-panel {
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }
    }
  </style>
</head>
<body>
  <div class="console-shell">
    <section class="queue-panel">
      <div class="topbar">
        <div>
          <h1>货主认证审核台</h1>
          <p class="muted">第一片：列表筛选、附件预览、单条通过/驳回，以及实名/企业认证审核事件审计。</p>
        </div>
        ${renderAdminSessionControls({
          currentRoute: '/api/admin/shipper-verification-console',
        })}
      </div>
      ${renderAdminConsoleNav({
        currentRoute: '/api/admin/shipper-verification-console',
      })}
      <div class="toolbar">
        <label>
          状态
          <select id="statusFilter">
            <option value="reviewing" selected>待审核</option>
            <option value="approved">已通过</option>
            <option value="rejected">已驳回</option>
          </select>
        </label>
        <label>
          类型
          <select id="typeFilter">
            <option value="" selected>全部</option>
            <option value="identity">实名</option>
            <option value="enterprise">企业</option>
          </select>
        </label>
        <label>
          每页
          <select id="pageSizeFilter">
            <option value="20" selected>20</option>
            <option value="50">50</option>
          </select>
        </label>
        <button type="button" id="refreshButton" class="secondary">刷新队列</button>
      </div>
      <div id="queueStatus" class="status-line">等待登录 token 后加载队列。</div>
      <div class="pagination-row">
        <button type="button" id="previousPageButton" class="secondary" disabled>上一页</button>
        <span id="paginationStatus" class="muted">第 1 页</span>
        <button type="button" id="nextPageButton" class="secondary" disabled>下一页</button>
      </div>
      <div id="queueList"></div>
    </section>
    <section class="detail-panel">
      <h2>认证详情</h2>
      <div id="detailStatus" class="status-line">请选择左侧货主。</div>
      <div id="detailBody" class="detail-grid"></div>
      <div class="card">
        <h2>附件预览</h2>
        <div id="attachmentStatus" class="status-line">请选择左侧货主。</div>
        <div id="attachmentList" class="attachments">
          <div class="muted">暂无附件</div>
        </div>
      </div>
      <div class="card">
        <h2>审核操作</h2>
        <label>
          驳回原因
          <textarea id="rejectionReason" placeholder="驳回时必填"></textarea>
        </label>
        <div class="review-row" style="margin-top:10px;">
          <button type="button" id="approveIdentityButton">通过实名</button>
          <button type="button" id="rejectIdentityButton" class="danger">驳回实名</button>
          <button type="button" id="approveEnterpriseButton">通过企业</button>
          <button type="button" id="rejectEnterpriseButton" class="danger">驳回企业</button>
        </div>
        <div id="reviewStatus" class="status-line"></div>
      </div>
      <div class="card">
        <h2>审核事件</h2>
        <div id="reviewEventStatus" class="status-line">请选择左侧货主。</div>
        <div id="reviewEventList" class="event-list">
          <div class="muted">暂无审核事件。</div>
        </div>
      </div>
    </section>
  </div>
  <script>
    const apiBase = document.querySelector('meta[name="admin-shipper-verification-api"]').content;
    let selectedShipperId = '';
    let currentItems = [];
    let currentDetail = null;
    let currentAttachments = null;
    let currentReviewEvents = [];
    let currentPage = 1;
    let currentTotal = 0;
    let latestQueueRequestId = 0;
    let latestDetailRequestId = 0;
    let latestReviewMutationRequestId = 0;
    let reviewMutationPending = false;
    ${renderAdminSessionScript({
      currentRoute: '/api/admin/shipper-verification-console',
    })}
    const attachmentText = {
      identityFront: '身份证正面',
      identityBack: '身份证反面',
      license: '营业执照',
    };

    function getToken() {
      const stored = readStoredAdminSession();
      return stored.session?.accessToken || localStorage.getItem('adminAccessToken') || '';
    }

    function setText(id, text) {
      document.getElementById(id).textContent = text;
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function readShipperVerificationRouteState() {
      const query = new URLSearchParams(
        globalThis.location && typeof globalThis.location.search === 'string'
          ? location.search
          : '',
      );
      return {
        status: query.get('status') || 'reviewing',
        type: query.get('type') || '',
        shipperId: query.get('shipperId') || '',
        page: query.get('page') || '',
        pageSize: query.get('pageSize') || '',
      };
    }

    function applyShipperVerificationRouteState() {
      const routeState = readShipperVerificationRouteState();
      document.getElementById('statusFilter').value = routeState.status;
      document.getElementById('typeFilter').value = routeState.type;
      if (routeState.page) {
        currentPage = Math.max(1, Number.parseInt(routeState.page, 10) || 1);
      }
      if (routeState.pageSize) {
        document.getElementById('pageSizeFilter').value = String(
          [20, 50].includes(Number(routeState.pageSize))
            ? Number(routeState.pageSize)
            : 20,
        );
      }
      selectedShipperId = routeState.shipperId;
      return routeState;
    }

    function getQueuePageSize() {
      const value = Number.parseInt(
        document.getElementById('pageSizeFilter').value || '20',
        10,
      );
      return [20, 50].includes(value) ? value : 20;
    }

    function syncShipperVerificationRouteState(
      shipperIdOverride,
      pageOverride,
      pageSizeOverride,
    ) {
      if (!globalThis.history || !globalThis.location) {
        return;
      }

      const query = new URLSearchParams();
      const status = document.getElementById('statusFilter').value;
      const type = document.getElementById('typeFilter').value;
      const page = Math.max(
        1,
        Number.parseInt(String(pageOverride || currentPage || 1), 10) || 1,
      );
      const pageSize = [20, 50].includes(Number(pageSizeOverride))
        ? Number(pageSizeOverride)
        : getQueuePageSize();
      const shipperId = String(
        typeof shipperIdOverride === 'string'
          ? shipperIdOverride
          : selectedShipperId || '',
      ).trim();
      if (status && status !== 'reviewing') {
        query.set('status', status);
      }
      if (type) {
        query.set('type', type);
      }
      if (shipperId) {
        query.set('shipperId', shipperId);
      }
      if (page > 1) {
        query.set('page', String(page));
      }
      if (pageSize !== 20) {
        query.set('pageSize', String(pageSize));
      }
      const nextQuery = query.toString();
      const nextPath = location.pathname + (nextQuery ? '?' + nextQuery : '');
      history.replaceState(null, '', nextPath);
    }

    function resetDetail(statusText) {
      currentDetail = null;
      setText('detailStatus', statusText);
      document.getElementById('detailBody').innerHTML = '';
      updateReviewControls();
    }

    function resetAttachments(statusText) {
      currentAttachments = null;
      setText('attachmentStatus', statusText);
      document.getElementById('attachmentList').innerHTML = '<div class="muted">暂无附件</div>';
    }

    function resetReviewEvents(statusText) {
      currentReviewEvents = [];
      setText('reviewEventStatus', statusText);
      document.getElementById('reviewEventList').innerHTML = '<div class="muted">暂无审核事件。</div>';
    }

    function formatReviewEventStage(event) {
      const typeText = event.verificationType === 'enterprise' ? '企业认证' : '实名认证';
      if (event.stage === 'submitted') return '货主提交' + typeText;
      if (event.stage === 'approved') return '后台通过' + typeText;
      if (event.stage === 'rejected') return '后台驳回' + typeText;
      return '未知事件';
    }

    async function apiGet(path) {
      const response = await fetch(apiBase + path, {
        headers: { Authorization: 'Bearer ' + getToken() },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.code !== 'OK') {
        const error = new Error(payload.message || payload.code || '请求失败');
        error.code = payload.code;
        throw error;
      }
      return payload.data;
    }

    async function apiPost(path, body) {
      const response = await fetch(apiBase + path, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + getToken(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.code !== 'OK') {
        const error = new Error(payload.message || payload.code || '请求失败');
        error.code = payload.code;
        throw error;
      }
      return payload.data;
    }

    function renderQueue(items) {
      currentItems = items || [];
      const root = document.getElementById('queueList');
      if (!currentItems.length) {
        root.innerHTML = '<div class="muted">当前筛选下没有认证记录。</div>';
        return;
      }
      root.innerHTML = currentItems.map(item => {
        const identity = item.identity ? item.identity.status : '无';
        const enterprise = item.enterprise ? item.enterprise.status : '无';
        const selected = item.shipperId === selectedShipperId ? ' selected' : '';
        return '<div class="card queue-item' + selected + '" data-shipper-id="' + escapeHtml(item.shipperId) + '">' +
          '<strong>' + escapeHtml(item.shipperId) + '</strong>' +
          '<div class="muted">实名：' + escapeHtml(identity) + ' · 企业：' + escapeHtml(enterprise) + '</div>' +
        '</div>';
      }).join('');
      root.querySelectorAll('.queue-item').forEach(node => {
        node.addEventListener('click', () => {
          selectShipper(node.getAttribute('data-shipper-id') || '');
        });
      });
    }

    function renderDetail() {
      const item = currentDetail;
      if (!item) {
        resetDetail('请选择左侧货主。');
        return;
      }
      setText('detailStatus', '当前货主：' + item.shipperId);
      const identity = item.identity;
      const enterprise = item.enterprise;
      document.getElementById('detailBody').innerHTML = [
        identity
          ? '<div><strong>实名认证</strong><div class="muted">' +
            escapeHtml(identity.realName) + ' · ' + escapeHtml(identity.idNumber) +
            ' · ' + escapeHtml(identity.status) +
            (identity.rejectionReason ? ' · 驳回：' + escapeHtml(identity.rejectionReason) : '') +
            '<br>正面 fileId：' + escapeHtml(identity.identityFrontFileId) +
            '<br>反面 fileId：' + escapeHtml(identity.identityBackFileId) +
            '</div></div>'
          : '<div><strong>实名认证</strong><div class="muted">未提交</div></div>',
        enterprise
          ? '<div><strong>企业认证</strong><div class="muted">' +
            escapeHtml(enterprise.enterpriseName) + ' · ' + escapeHtml(enterprise.creditCode) +
            ' · ' + escapeHtml(enterprise.status) +
            (enterprise.rejectionReason ? ' · 驳回：' + escapeHtml(enterprise.rejectionReason) : '') +
            '<br>营业执照 fileId：' + escapeHtml(enterprise.licenseFileId) +
            '</div></div>'
          : '<div><strong>企业认证</strong><div class="muted">未提交</div></div>',
      ].join('');
      updateReviewControls();
    }

    function renderPagination() {
      const pageSize = getQueuePageSize();
      const maxPage = Math.max(1, Math.ceil(currentTotal / pageSize));
      setText(
        'paginationStatus',
        '第 ' + currentPage + ' 页 / 共 ' + maxPage + ' 页',
      );
      document.getElementById('previousPageButton').disabled = currentPage <= 1;
      document.getElementById('nextPageButton').disabled = currentPage >= maxPage;
    }

    function clearQueueResults(statusText) {
      currentItems = [];
      currentTotal = 0;
      renderQueue([]);
      renderPagination();
      setText('queueStatus', statusText);
    }

    function renderAttachments() {
      const root = document.getElementById('attachmentList');
      const groups = currentAttachments || { identity: {}, enterprise: {} };
      const attachments = [
        ...Object.values(groups.identity || {}),
        ...Object.values(groups.enterprise || {}),
      ].filter(Boolean);
      if (!attachments.length) {
        root.innerHTML = '<div class="muted">暂无附件</div>';
        setText('attachmentStatus', '当前货主没有可预览附件。');
        return;
      }
      root.innerHTML = attachments.map(file => {
        return '<div class="attachment-card">' +
          '<strong>' + escapeHtml(attachmentText[file.attachmentType] || file.attachmentType) + '</strong>' +
          '<div class="muted">fileId：' + escapeHtml(file.id) + '</div>' +
          '<div class="muted">对象：' + escapeHtml(file.objectKey || '-') + '</div>' +
          '<div class="muted">类型：' + escapeHtml(file.contentType || '-') + '</div>' +
          '<div class="muted">公开地址：' + escapeHtml(file.publicUrl || '-') + '</div>' +
          '<div class="muted">预览过期：' + escapeHtml(file.previewExpiresAtIso || '-') + '</div>' +
          (file.previewUrl
            ? '<a class="attachment-link" target="_blank" rel="noreferrer" href="' + escapeHtml(file.previewUrl) + '">打开预览</a>'
            : '<div class="muted">暂无预览链接</div>') +
        '</div>';
      }).join('');
      setText('attachmentStatus', '共 ' + attachments.length + ' 个附件');
    }

    function renderReviewEvents() {
      const root = document.getElementById('reviewEventList');
      if (!currentReviewEvents.length) {
        root.innerHTML = '<div class="muted">暂无审核事件。</div>';
        setText('reviewEventStatus', '当前货主暂无审核事件。');
        return;
      }
      root.innerHTML = currentReviewEvents.map(event => {
        return '<div class="event-item">' +
          '<strong>' + escapeHtml(formatReviewEventStage(event)) + '</strong>' +
          '<div class="muted">操作者：' + escapeHtml(event.reviewerAdminId || event.actorUserId || '系统') + ' · 时间：' + escapeHtml(event.createdAtIso || '-') + '</div>' +
          '<div class="muted">' + escapeHtml(event.noteText || '无附加说明') + '</div>' +
        '</div>';
      }).join('');
      setText('reviewEventStatus', '共 ' + currentReviewEvents.length + ' 条审核事件');
    }

    function updateReviewControls() {
      const identityReviewing = Boolean(
        currentDetail &&
        currentDetail.identity &&
        currentDetail.identity.status === 'reviewing',
      );
      const enterpriseReviewing = Boolean(
        currentDetail &&
        currentDetail.enterprise &&
        currentDetail.enterprise.status === 'reviewing',
      );
      [
        'approveIdentityButton',
        'rejectIdentityButton',
      ].forEach(id => {
        document.getElementById(id).disabled =
          reviewMutationPending || !identityReviewing;
      });
      [
        'approveEnterpriseButton',
        'rejectEnterpriseButton',
      ].forEach(id => {
        document.getElementById(id).disabled =
          reviewMutationPending || !enterpriseReviewing;
      });
    }

    async function selectShipper(shipperId) {
      const requestId = ++latestDetailRequestId;
      const targetShipperId = String(shipperId || '').trim();
      selectedShipperId = targetShipperId;
      syncShipperVerificationRouteState(selectedShipperId);
      renderQueue(currentItems);
      setText('reviewStatus', '');
      resetDetail(
        targetShipperId ? '认证详情加载中...' : '请选择左侧货主。',
      );
      resetAttachments(
        targetShipperId ? '附件加载中...' : '请选择左侧货主。',
      );
      resetReviewEvents(
        targetShipperId ? '审核事件加载中...' : '请选择左侧货主。',
      );
      if (!targetShipperId) {
        return;
      }
      if (!getToken()) {
        resetDetail('请先填写 admin token。');
        resetAttachments('请先填写 admin token。');
        resetReviewEvents('请先填写 admin token。');
        return;
      }

      const detailRequest = apiGet('/' + encodeURIComponent(targetShipperId));
      const attachmentRequest = apiGet(
        '/' + encodeURIComponent(targetShipperId) + '/attachments',
      ).then(
        value => ({ status: 'fulfilled', value }),
        reason => ({ status: 'rejected', reason }),
      );
      const reviewEventRequest = apiGet(
        '/' + encodeURIComponent(targetShipperId) + '/review-events',
      ).then(
        value => ({ status: 'fulfilled', value }),
        reason => ({ status: 'rejected', reason }),
      );

      try {
        const detail = await detailRequest;
        if (
          requestId !== latestDetailRequestId ||
          selectedShipperId !== targetShipperId
        ) {
          return;
        }
        currentDetail = detail;
        renderDetail();
      } catch (error) {
        if (
          requestId !== latestDetailRequestId ||
          selectedShipperId !== targetShipperId
        ) {
          return;
        }
        resetDetail(error.message || '认证详情加载失败');
        resetAttachments('认证详情未加载，附件工作区已清空。');
        resetReviewEvents('认证详情未加载，审核事件工作区已清空。');
        return;
      }

      void attachmentRequest.then(attachmentResult => {
        if (
          requestId !== latestDetailRequestId ||
          selectedShipperId !== targetShipperId
        ) {
          return;
        }
        if (attachmentResult.status === 'fulfilled') {
          currentAttachments = attachmentResult.value;
          renderAttachments();
        } else {
          const attachmentError = attachmentResult.reason;
          resetAttachments(
            attachmentError && attachmentError.message
              ? attachmentError.message
              : '附件加载失败',
          );
        }
      });
      void reviewEventRequest.then(reviewEventResult => {
        if (
          requestId !== latestDetailRequestId ||
          selectedShipperId !== targetShipperId
        ) {
          return;
        }
        if (reviewEventResult.status === 'fulfilled') {
          currentReviewEvents = Array.isArray(reviewEventResult.value)
            ? reviewEventResult.value
            : [];
          renderReviewEvents();
        } else {
          const reviewEventError = reviewEventResult.reason;
          resetReviewEvents(
            reviewEventError && reviewEventError.message
              ? reviewEventError.message
              : '审核事件加载失败',
          );
        }
      });
    }

    async function loadQueue(page) {
      const requestId = ++latestQueueRequestId;
      const requestedPage = Math.max(
        1,
        Number.parseInt(String(page || currentPage || 1), 10) || 1,
      );
      currentPage = requestedPage;
      syncShipperVerificationRouteState(
        selectedShipperId,
        currentPage,
        getQueuePageSize(),
      );
      if (!getToken()) {
        clearQueueResults('请先填写 admin token。');
        return;
      }
      setText('queueStatus', '加载中...');
      try {
        const status = document.getElementById('statusFilter').value;
        const type = document.getElementById('typeFilter').value;
        const pageSize = getQueuePageSize();
        const query = new URLSearchParams({
          status,
          page: String(requestedPage),
          pageSize: String(pageSize),
        });
        if (type) query.set('type', type);
        const data = await apiGet('?' + query.toString());
        if (requestId !== latestQueueRequestId) {
          return;
        }
        currentTotal = Number(data.total || 0);
        const maxPage = Math.max(1, Math.ceil(currentTotal / pageSize));
        if (requestedPage > maxPage) {
          return loadQueue(maxPage);
        }
        currentPage = Math.max(1, Number(data.page || requestedPage));
        renderQueue(data.items || []);
        renderPagination();
        setText('queueStatus', '共 ' + currentTotal + ' 条');
        syncShipperVerificationRouteState(
          selectedShipperId,
          currentPage,
          pageSize,
        );
        if (!selectedShipperId && currentItems.length) {
          await selectShipper(currentItems[0].shipperId);
        }
      } catch (error) {
        if (requestId !== latestQueueRequestId) {
          return;
        }
        clearQueueResults(error.message || '加载失败');
      }
    }

    async function refreshWorkspace(page) {
      const targetShipperId = selectedShipperId;
      await Promise.all([
        loadQueue(page || currentPage),
        ...(targetShipperId ? [selectShipper(targetShipperId)] : []),
      ]);
    }

    function changeQueuePage(offset) {
      const maxPage = Math.max(
        1,
        Math.ceil(currentTotal / getQueuePageSize()),
      );
      loadQueue(Math.min(maxPage, Math.max(1, currentPage + offset)));
    }

    function resetQueuePage() {
      currentPage = 1;
      loadQueue(currentPage);
    }

    async function review(kind, status) {
      if (reviewMutationPending) {
        return;
      }
      const targetShipperId = selectedShipperId;
      const targetDetail = currentDetail;
      if (
        !targetShipperId ||
        !targetDetail ||
        targetDetail.shipperId !== targetShipperId
      ) {
        setText('reviewStatus', '请先选择货主。');
        return;
      }
      const targetRecord = targetDetail[kind];
      if (!targetRecord || targetRecord.status !== 'reviewing') {
        setText('reviewStatus', '当前认证记录不处于待审核状态。');
        return;
      }
      const rejectionReason = document.getElementById('rejectionReason').value.trim();
      const body = status === 'approved'
        ? { status: 'approved' }
        : { status: 'rejected', rejectionReason };
      if (status === 'rejected' && !rejectionReason) {
        setText('reviewStatus', '驳回时必须填写原因。');
        return;
      }
      const requestId = ++latestReviewMutationRequestId;
      let refreshQueueAfterReview = false;
      let refreshTargetAfterReview = false;
      let reviewMessage = '';
      reviewMutationPending = true;
      updateReviewControls();
      setText('reviewStatus', '提交审核中...');
      try {
        try {
          await apiPost(
            '/' + encodeURIComponent(targetShipperId) + '/' + kind + '/review',
            body,
          );
          if (requestId !== latestReviewMutationRequestId) {
            return;
          }
          refreshQueueAfterReview = true;
          refreshTargetAfterReview = selectedShipperId === targetShipperId;
          reviewMessage = kind + ' 审核成功：' + status;
        } catch (error) {
          if (requestId !== latestReviewMutationRequestId) {
            return;
          }
          if (
            error.code === 'SHIPPER_VERIFICATION_STATE_INVALID' ||
            error.code === 'SHIPPER_VERIFICATION_NOT_FOUND'
          ) {
            refreshQueueAfterReview = true;
            refreshTargetAfterReview = selectedShipperId === targetShipperId;
          }
          reviewMessage = error.message || error.code || '审核失败';
        }

        if (refreshQueueAfterReview) {
          await Promise.all([
            loadQueue(currentPage),
            ...(refreshTargetAfterReview && selectedShipperId === targetShipperId
              ? [selectShipper(targetShipperId)]
              : []),
          ]);
        }
        if (
          requestId === latestReviewMutationRequestId &&
          selectedShipperId === targetShipperId
        ) {
          setText('reviewStatus', reviewMessage);
        }
      } catch (error) {
        if (
          requestId === latestReviewMutationRequestId &&
          selectedShipperId === targetShipperId
        ) {
          setText('reviewStatus', error.message || '审核刷新失败');
        }
      } finally {
        if (requestId === latestReviewMutationRequestId) {
          reviewMutationPending = false;
          updateReviewControls();
        }
      }
    }

    document.getElementById('refreshButton').addEventListener('click', () => refreshWorkspace(currentPage));
    document.getElementById('statusFilter').addEventListener('change', resetQueuePage);
    document.getElementById('typeFilter').addEventListener('change', resetQueuePage);
    document.getElementById('pageSizeFilter').addEventListener('change', resetQueuePage);
    document.getElementById('previousPageButton').addEventListener('click', () => changeQueuePage(-1));
    document.getElementById('nextPageButton').addEventListener('click', () => changeQueuePage(1));
    document.getElementById('approveIdentityButton').addEventListener('click', () => review('identity', 'approved'));
    document.getElementById('rejectIdentityButton').addEventListener('click', () => review('identity', 'rejected'));
    document.getElementById('approveEnterpriseButton').addEventListener('click', () => review('enterprise', 'approved'));
    document.getElementById('rejectEnterpriseButton').addEventListener('click', () => review('enterprise', 'rejected'));
    applyShipperVerificationRouteState();
    updateReviewControls();
    renderPagination();
    const currentAdminSession = initializeAdminSession();
    if (currentAdminSession && currentAdminSession.accessToken) {
      refreshWorkspace(currentPage);
    }
  </script>
</body>
</html>`;
}
