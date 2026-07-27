import {
  renderAdminConsoleNav,
  renderAdminConsoleNavStyles,
} from './admin-console-nav-snippet';
import {
  renderAdminSessionControls,
  renderAdminSessionScript,
} from './admin-session-snippet';

export function renderShipperInvoiceAdminConsole() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="admin-shipper-invoice-api" content="/api/admin/shipper-invoices" />
  <title>发票申请审核台</title>
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
      grid-template-columns: minmax(320px, 440px) minmax(0, 1fr);
      min-height: 100vh;
    }
    .queue-panel, .detail-panel { padding: 20px; }
    .queue-panel {
      border-right: 1px solid var(--line);
      background: #eef2f4;
    }
    .topbar, .toolbar, .review-row, .pagination-row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .topbar { justify-content: space-between; margin-bottom: 16px; }
    .pagination-row { margin: 12px 0; }
    h1 { margin: 0; font-size: 22px; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .card.selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
    .muted { color: var(--muted); font-size: 13px; }
    .status-line { margin: 8px 0 12px; color: var(--muted); font-size: 13px; }
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
    .queue-item { cursor: pointer; }
    .queue-item strong { display: block; margin-bottom: 4px; }
    .detail-grid { display: grid; gap: 8px; }
    .detail-grid div {
      background: #f8fafb;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
    }
    .event-list { display: grid; gap: 8px; }
    .event-item {
      background: #f8fafb;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
    }
    textarea { width: 100%; min-height: 80px; resize: vertical; }
    ${renderAdminConsoleNavStyles()}
  </style>
</head>
<body>
  <div class="console-shell">
    <section class="queue-panel">
      <div class="topbar">
        <div>
          <h1>发票申请审核台</h1>
          <p class="muted">第一片：列表筛选、单条通过/驳回、审核事件审计，以及已开票申请的文本发票下载。</p>
        </div>
        ${renderAdminSessionControls({
          currentRoute: '/api/admin/shipper-invoice-console',
        })}
      </div>
      ${renderAdminConsoleNav({
        currentRoute: '/api/admin/shipper-invoice-console',
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
      <h2>申请详情</h2>
      <div id="detailStatus" class="status-line">请选择左侧发票申请。</div>
      <div id="detailBody" class="detail-grid"></div>
      <div class="card">
        <h2>发票文件</h2>
        <div class="review-row">
          <button type="button" id="downloadButton" class="secondary" disabled>下载发票文件</button>
        </div>
        <div id="downloadStatus" class="status-line">请选择左侧发票申请。</div>
      </div>
      <div class="card">
        <h2>审核操作</h2>
        <label>
          驳回原因
          <textarea id="rejectionReason" placeholder="驳回时必填"></textarea>
        </label>
        <div class="review-row" style="margin-top:10px;">
          <button type="button" id="approveButton" disabled>通过申请</button>
          <button type="button" id="rejectButton" class="danger" disabled>驳回申请</button>
        </div>
        <div id="reviewStatus" class="status-line"></div>
      </div>
      <div class="card">
        <h2>审核事件</h2>
        <div id="reviewEventStatus" class="status-line">请选择左侧发票申请。</div>
        <div id="reviewEventList" class="event-list">
          <div class="muted">暂无审核事件。</div>
        </div>
      </div>
    </section>
  </div>
  <script>
    const apiBase = document.querySelector('meta[name="admin-shipper-invoice-api"]').content;
    let selectedApplicationId = '';
    let currentItems = [];
    let currentDetail = null;
    let currentReviewEvents = [];
    let currentPage = 1;
    let currentTotal = 0;
    let latestQueueRequestId = 0;
    let latestDetailRequestId = 0;
    let latestReviewMutationRequestId = 0;
    let latestDownloadRequestId = 0;
    let reviewMutationPending = false;
    let downloadPending = false;
    ${renderAdminSessionScript({
      currentRoute: '/api/admin/shipper-invoice-console',
    })}

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
        .replaceAll('"', '&quot;');
    }

    function readShipperInvoiceRouteState() {
      const query = new URLSearchParams(
        globalThis.location && typeof globalThis.location.search === 'string'
          ? location.search
          : '',
      );
      return {
        status: query.get('status') || 'reviewing',
        applicationId: query.get('applicationId') || '',
        page: query.get('page') || '',
        pageSize: query.get('pageSize') || '',
      };
    }

    function applyShipperInvoiceRouteState() {
      const routeState = readShipperInvoiceRouteState();
      document.getElementById('statusFilter').value = routeState.status;
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
      selectedApplicationId = routeState.applicationId;
      return routeState;
    }

    function getQueuePageSize() {
      const value = Number.parseInt(
        document.getElementById('pageSizeFilter').value || '20',
        10,
      );
      return [20, 50].includes(value) ? value : 20;
    }

    function syncShipperInvoiceRouteState(
      applicationIdOverride,
      pageOverride,
      pageSizeOverride,
    ) {
      if (!globalThis.history || !globalThis.location) {
        return;
      }

      const query = new URLSearchParams();
      const status = document.getElementById('statusFilter').value;
      const page = Math.max(
        1,
        Number.parseInt(String(pageOverride || currentPage || 1), 10) || 1,
      );
      const pageSize = [20, 50].includes(Number(pageSizeOverride))
        ? Number(pageSizeOverride)
        : getQueuePageSize();
      const applicationId = String(
        typeof applicationIdOverride === 'string'
          ? applicationIdOverride
          : selectedApplicationId || '',
      ).trim();
      if (status && status !== 'reviewing') {
        query.set('status', status);
      }
      if (applicationId) {
        query.set('applicationId', applicationId);
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

    function formatAmount(cents) {
      return '¥' + (Number(cents || 0) / 100).toFixed(2);
    }

    function setDownloadState(statusText) {
      setText('downloadStatus', statusText);
    }

    function resetDetail(statusText) {
      currentDetail = null;
      setText('detailStatus', statusText);
      document.getElementById('detailBody').innerHTML = '';
      setDownloadState(statusText);
      updateDownloadControls();
      updateReviewControls();
    }

    function resetReviewEvents(statusText) {
      currentReviewEvents = [];
      setText('reviewEventStatus', statusText);
      document.getElementById('reviewEventList').innerHTML = '<div class="muted">暂无审核事件。</div>';
    }

    function formatReviewEventStage(stage) {
      if (stage === 'submitted') return '货主提交申请';
      if (stage === 'approved') return '后台通过申请';
      if (stage === 'rejected') return '后台驳回申请';
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
        root.innerHTML = '<div class="muted">当前筛选下没有发票申请。</div>';
        return;
      }
      root.innerHTML = currentItems.map(item => {
        const selected = item.id === selectedApplicationId ? ' selected' : '';
        return '<div class="card queue-item' + selected + '" data-application-id="' + escapeHtml(item.id) + '">' +
          '<strong>' + escapeHtml(item.invoiceTitle) + '</strong>' +
          '<div class="muted">' + escapeHtml(item.shipperId) + ' · ' + formatAmount(item.amountCents) + ' · ' + escapeHtml(item.status) + '</div>' +
        '</div>';
      }).join('');
      root.querySelectorAll('.queue-item').forEach(node => {
        node.addEventListener('click', () => {
          selectApplication(node.getAttribute('data-application-id') || '');
        });
      });
    }

    function renderDetail() {
      const item = currentDetail;
      if (!item) {
        resetDetail('请选择左侧发票申请。');
        return;
      }
      setText('detailStatus', '当前申请：' + item.id);
      document.getElementById('detailBody').innerHTML = [
        '<div><strong>抬头</strong><div class="muted">' + escapeHtml(item.invoiceTitle) + ' · ' + escapeHtml(item.invoiceTitleType) + '</div></div>',
        '<div><strong>类型/金额</strong><div class="muted">' + escapeHtml(item.invoiceType) + ' · ' + formatAmount(item.amountCents) + '</div></div>',
        '<div><strong>邮箱</strong><div class="muted">' + escapeHtml(item.receiverEmail) + '</div></div>',
        '<div><strong>订单</strong><div class="muted">' + escapeHtml((item.orderNos || []).join(', ') || '无') + '</div></div>',
        item.rejectionReason
          ? '<div><strong>驳回原因</strong><div class="muted">' + escapeHtml(item.rejectionReason) + '</div></div>'
          : '',
      ].join('');
      if (item.status === 'approved') {
        setDownloadState('当前申请已开票，可下载文本发票凭证。');
      } else {
        setDownloadState('仅已通过申请支持下载发票文件。');
      }
      updateDownloadControls();
      updateReviewControls();
    }

    function renderReviewEvents() {
      const root = document.getElementById('reviewEventList');
      if (!currentReviewEvents.length) {
        root.innerHTML = '<div class="muted">暂无审核事件。</div>';
        setText('reviewEventStatus', '当前申请暂无审核事件。');
        return;
      }
      root.innerHTML = currentReviewEvents.map(event => {
        return '<div class="event-item">' +
          '<strong>' + escapeHtml(formatReviewEventStage(event.stage)) + '</strong>' +
          '<div class="muted">操作者：' + escapeHtml(event.reviewerAdminId || event.actorUserId || '系统') + ' · 时间：' + escapeHtml(event.createdAtIso || '-') + '</div>' +
          '<div class="muted">' + escapeHtml(event.noteText || '无附加说明') + '</div>' +
        '</div>';
      }).join('');
      setText('reviewEventStatus', '共 ' + currentReviewEvents.length + ' 条审核事件');
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

    function updateReviewControls() {
      const canReview = Boolean(
        currentDetail &&
        currentDetail.id === selectedApplicationId &&
        currentDetail.status === 'reviewing',
      );
      ['approveButton', 'rejectButton'].forEach(id => {
        document.getElementById(id).disabled = reviewMutationPending || !canReview;
      });
    }

    function updateDownloadControls() {
      const canDownload = Boolean(
        currentDetail &&
        currentDetail.id === selectedApplicationId &&
        currentDetail.status === 'approved',
      );
      document.getElementById('downloadButton').disabled =
        downloadPending || !canDownload;
    }

    async function selectApplication(applicationId) {
      const requestId = ++latestDetailRequestId;
      const targetApplicationId = String(applicationId || '').trim();
      latestDownloadRequestId += 1;
      selectedApplicationId = targetApplicationId;
      syncShipperInvoiceRouteState(selectedApplicationId);
      renderQueue(currentItems);
      setText('reviewStatus', '');
      resetDetail(
        targetApplicationId ? '发票详情加载中...' : '请选择左侧发票申请。',
      );
      resetReviewEvents(
        targetApplicationId ? '审核事件加载中...' : '请选择左侧发票申请。',
      );
      if (!targetApplicationId) {
        return;
      }
      if (!getToken()) {
        resetDetail('请先填写 admin token。');
        resetReviewEvents('请先填写 admin token。');
        return;
      }

      const detailRequest = apiGet('/' + encodeURIComponent(targetApplicationId));
      const reviewEventRequest = apiGet(
        '/' + encodeURIComponent(targetApplicationId) + '/review-events',
      ).then(
        value => ({ status: 'fulfilled', value }),
        reason => ({ status: 'rejected', reason }),
      );
      try {
        const detail = await detailRequest;
        if (
          requestId !== latestDetailRequestId ||
          selectedApplicationId !== targetApplicationId
        ) {
          return;
        }
        currentDetail = detail;
        renderDetail();
      } catch (error) {
        if (
          requestId !== latestDetailRequestId ||
          selectedApplicationId !== targetApplicationId
        ) {
          return;
        }
        resetDetail(error.message || '发票详情加载失败');
        resetReviewEvents('发票详情未加载，审核事件工作区已清空。');
        return;
      }

      void reviewEventRequest.then(result => {
        if (
          requestId !== latestDetailRequestId ||
          selectedApplicationId !== targetApplicationId
        ) {
          return;
        }
        if (result.status === 'fulfilled') {
          currentReviewEvents = Array.isArray(result.value) ? result.value : [];
          renderReviewEvents();
          return;
        }
        const reviewEventError = result.reason;
        resetReviewEvents(
          reviewEventError && reviewEventError.message
            ? reviewEventError.message
            : '审核事件加载失败',
        );
      });
    }

    async function loadQueue(page) {
      const requestId = ++latestQueueRequestId;
      const requestedPage = Math.max(
        1,
        Number.parseInt(String(page || currentPage || 1), 10) || 1,
      );
      currentPage = requestedPage;
      syncShipperInvoiceRouteState(
        selectedApplicationId,
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
        const pageSize = getQueuePageSize();
        const query = new URLSearchParams({
          status,
          page: String(requestedPage),
          pageSize: String(pageSize),
        });
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
        syncShipperInvoiceRouteState(
          selectedApplicationId,
          currentPage,
          pageSize,
        );
        if (!selectedApplicationId && currentItems.length) {
          await selectApplication(currentItems[0].id);
        }
      } catch (error) {
        if (requestId !== latestQueueRequestId) {
          return;
        }
        clearQueueResults(error.message || '加载失败');
      }
    }

    async function refreshWorkspace(page) {
      const targetApplicationId = selectedApplicationId;
      await Promise.all([
        loadQueue(page || currentPage),
        ...(targetApplicationId ? [selectApplication(targetApplicationId)] : []),
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

    function extractDownloadFilename(contentDisposition, fallbackFileName) {
      const matched = /filename="?([^";]+)"?/i.exec(contentDisposition || '');

      return matched ? matched[1] : fallbackFileName;
    }

    async function downloadSelectedInvoice() {
      if (downloadPending) {
        return;
      }
      const targetDetail = currentDetail;
      const targetApplicationId = selectedApplicationId;
      if (
        !targetDetail ||
        !targetApplicationId ||
        targetDetail.id !== targetApplicationId
      ) {
        setDownloadState('请先选择发票申请。');
        updateDownloadControls();
        return;
      }
      if (!getToken()) {
        setDownloadState('请先填写 admin token。');
        updateDownloadControls();
        return;
      }
      if (targetDetail.status !== 'approved') {
        setDownloadState('仅已通过申请支持下载发票文件。');
        updateDownloadControls();
        return;
      }
      const requestId = ++latestDownloadRequestId;
      downloadPending = true;

      setDownloadState('下载发票文件中...');
      updateDownloadControls();
      try {
        const response = await fetch(
          apiBase + '/' + encodeURIComponent(targetApplicationId) + '/download',
          {
            headers: { Authorization: 'Bearer ' + getToken() },
          },
        );
        const responseText = await response.text();
        if (!response.ok) {
          let errorMessage = '发票文件下载失败';
          let errorCode = '';
          if (responseText) {
            try {
              const payload = JSON.parse(responseText);
              errorMessage = payload.message || errorMessage;
              errorCode = payload.code || '';
            } catch {
              errorMessage = responseText;
            }
          }
          const error = new Error(errorMessage);
          error.code = errorCode;
          throw error;
        }

        const fileName = extractDownloadFilename(
          response.headers.get('content-disposition'),
          'invoice-' + targetApplicationId + '.txt',
        );
        if (
          requestId !== latestDownloadRequestId ||
          selectedApplicationId !== targetApplicationId ||
          !currentDetail ||
          currentDetail.id !== targetApplicationId
        ) {
          return;
        }
        const downloadUrl = URL.createObjectURL(
          new Blob([responseText], {
            type: response.headers.get('content-type') || 'text/plain; charset=utf-8',
          }),
        );
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function() {
          URL.revokeObjectURL(downloadUrl);
        }, 0);

        setDownloadState('发票文件下载已触发：' + fileName);
      } catch (error) {
        if (
          requestId === latestDownloadRequestId &&
          selectedApplicationId === targetApplicationId &&
          currentDetail &&
          currentDetail.id === targetApplicationId
        ) {
          setDownloadState(error.message || '发票文件下载失败');
          if (
            error.code === 'INVOICE_APPLICATION_STATE_INVALID' ||
            error.code === 'INVOICE_APPLICATION_NOT_FOUND'
          ) {
            await Promise.all([
              loadQueue(currentPage),
              ...(selectedApplicationId === targetApplicationId
                ? [selectApplication(targetApplicationId)]
                : []),
            ]);
          }
        }
      } finally {
        downloadPending = false;
        updateDownloadControls();
      }
    }

    async function review(status) {
      if (reviewMutationPending) {
        return;
      }
      const targetApplicationId = selectedApplicationId;
      const targetDetail = currentDetail;
      if (
        !targetApplicationId ||
        !targetDetail ||
        targetDetail.id !== targetApplicationId
      ) {
        setText('reviewStatus', '请先选择发票申请。');
        return;
      }
      if (targetDetail.status !== 'reviewing') {
        setText('reviewStatus', '当前发票申请不处于待审核状态。');
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
            '/' + encodeURIComponent(targetApplicationId) + '/review',
            body,
          );
          if (requestId !== latestReviewMutationRequestId) {
            return;
          }
          refreshQueueAfterReview = true;
          refreshTargetAfterReview =
            selectedApplicationId === targetApplicationId;
          reviewMessage = '审核成功：' + status;
        } catch (error) {
          if (requestId !== latestReviewMutationRequestId) {
            return;
          }
          if (
            error.code === 'INVOICE_APPLICATION_STATE_INVALID' ||
            error.code === 'INVOICE_APPLICATION_NOT_FOUND'
          ) {
            refreshQueueAfterReview = true;
            refreshTargetAfterReview =
              selectedApplicationId === targetApplicationId;
          }
          reviewMessage = error.message || error.code || '审核失败';
        }

        if (refreshQueueAfterReview) {
          await Promise.all([
            loadQueue(currentPage),
            ...(refreshTargetAfterReview &&
            selectedApplicationId === targetApplicationId
              ? [selectApplication(targetApplicationId)]
              : []),
          ]);
        }
        if (
          requestId === latestReviewMutationRequestId &&
          selectedApplicationId === targetApplicationId
        ) {
          setText('reviewStatus', reviewMessage);
        }
      } catch (error) {
        if (
          requestId === latestReviewMutationRequestId &&
          selectedApplicationId === targetApplicationId
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
    document.getElementById('pageSizeFilter').addEventListener('change', resetQueuePage);
    document.getElementById('previousPageButton').addEventListener('click', () => changeQueuePage(-1));
    document.getElementById('nextPageButton').addEventListener('click', () => changeQueuePage(1));
    document.getElementById('downloadButton').addEventListener('click', downloadSelectedInvoice);
    document.getElementById('approveButton').addEventListener('click', () => review('approved'));
    document.getElementById('rejectButton').addEventListener('click', () => review('rejected'));
    applyShipperInvoiceRouteState();
    updateReviewControls();
    updateDownloadControls();
    renderPagination();
    const currentAdminSession = initializeAdminSession();
    if (currentAdminSession && currentAdminSession.accessToken) {
      refreshWorkspace(currentPage);
    }
  </script>
</body>
</html>`;
}
