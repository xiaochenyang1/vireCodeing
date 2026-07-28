import {
  renderAdminConsoleNav,
  renderAdminConsoleNavStyles,
} from './admin-console-nav-snippet';
import {
  renderAdminSessionControls,
  renderAdminSessionScript,
} from './admin-session-snippet';

export function renderOrderChangeRequestAdminConsole() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="admin-order-change-request-api" content="/api/admin/orders/change-requests" />
  <meta name="admin-order-api" content="/api/admin/orders" />
  <title>订单修改申请审核台</title>
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
    button:disabled { cursor: not-allowed; opacity: .55; }
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
    .review-fields { display: grid; gap: 10px; margin-top: 10px; }
    textarea { width: 100%; min-height: 80px; resize: vertical; }
    ${renderAdminConsoleNavStyles()}
  </style>
</head>
<body>
  <div class="console-shell">
    <section class="queue-panel">
      <div class="topbar">
        <div>
          <h1>订单修改申请审核台</h1>
          <p class="muted">第一片：列表筛选、审核事件，以及费用/退款/司机通知快照录入；留空时系统会自动补全。</p>
        </div>
        ${renderAdminSessionControls({
          currentRoute: '/api/admin/order-change-request-console',
        })}
      </div>
      ${renderAdminConsoleNav({
        currentRoute: '/api/admin/order-change-request-console',
      })}
      <div class="toolbar">
        <label>
          状态
          <select id="statusFilter">
            <option value="pending" selected>待审核</option>
            <option value="approved">已通过</option>
            <option value="rejected">已驳回</option>
          </select>
        </label>
        <button type="button" id="refreshButton" class="secondary">刷新队列</button>
      </div>
      <div id="queueStatus" class="status-line">等待登录 token 后加载队列。</div>
      <div id="queueList"></div>
    </section>
    <section class="detail-panel">
      <h2>申请详情</h2>
      <div id="detailStatus" class="status-line">请选择左侧修改申请。</div>
      <div id="detailBody" class="detail-grid"></div>
      <div class="card">
        <h2>审核操作</h2>
        <label>
          审核说明
          <textarea id="reviewResultText" placeholder="可选，通过/驳回都可填写"></textarea>
        </label>
        <p class="muted">费用/退款/司机通知留空时，系统会按订单金额、支付状态和司机分配状态自动补全。</p>
        <div class="review-fields">
          <label>
            费用影响快照
            <textarea id="costImpactText" placeholder="可选，例如：改址后运费上调 30 元，待补收差额"></textarea>
          </label>
          <label>
            退款状态快照
            <textarea id="refundText" placeholder="可选，例如：无需退款 / 退款 20 元，已进入人工处理"></textarea>
          </label>
          <label>
            司机通知快照
            <textarea id="driverNoticeText" placeholder="可选，例如：已电话通知司机按新地址执行"></textarea>
          </label>
          <label>
            调整后应付金额（元，可选）
            <input id="adjustedPayablePriceYuan" type="number" min="1" max="100000" step="0.01" placeholder="例如 790，留空表示只记审核不改价" />
          </label>
        </div>
        <p class="muted">填写调整后应付金额并通过审核时，会把订单 price/payable 同步改成该金额；在线托管补差/退款本片仍不自动执行。</p>
        <div class="review-row" style="margin-top:10px;">
          <button type="button" id="approveButton" disabled>通过申请</button>
          <button type="button" id="rejectButton" class="danger" disabled>驳回申请</button>
        </div>
        <div id="reviewStatus" class="status-line"></div>
      </div>
      <div class="card">
        <h2>审核事件</h2>
        <div id="reviewEventStatus" class="status-line">请选择左侧修改申请。</div>
        <div id="reviewEventList" class="event-list">
          <div class="muted">暂无审核事件。</div>
        </div>
      </div>
    </section>
  </div>
  <script>
    const listApiBase = document.querySelector('meta[name="admin-order-change-request-api"]').content;
    const orderApiBase = document.querySelector('meta[name="admin-order-api"]').content;
    let selectedOrderId = '';
    let selectedChangeRequest = null;
    let currentItems = [];
    let latestQueueRequestId = 0;
    let latestDetailRequestId = 0;
    let latestReviewEventsRequestId = 0;
    let latestReviewRequestId = 0;
    let reviewMutationPending = false;
    ${renderAdminSessionScript({
      currentRoute: '/api/admin/order-change-request-console',
    })}

    function getToken() {
      const stored = readStoredAdminSession();
      return stored.session?.accessToken || localStorage.getItem('adminAccessToken') || '';
    }

    function setText(id, text) {
      document.getElementById(id).textContent = text;
    }

    function setInputValue(id, value) {
      document.getElementById(id).value = value || '';
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    }

    function readOrderChangeRequestRouteState() {
      const query = new URLSearchParams(
        globalThis.location && typeof globalThis.location.search === 'string'
          ? location.search
          : '',
      );
      return {
        status: query.get('status') || 'pending',
        orderId: query.get('orderId') || '',
      };
    }

    function applyOrderChangeRequestRouteState() {
      const routeState = readOrderChangeRequestRouteState();
      document.getElementById('statusFilter').value = routeState.status;
      selectedOrderId = routeState.orderId;
      return routeState;
    }

    function syncOrderChangeRequestRouteState(orderIdOverride) {
      if (!globalThis.history || !globalThis.location) {
        return;
      }

      const query = new URLSearchParams();
      const status = document.getElementById('statusFilter').value;
      const orderId = String(
        typeof orderIdOverride === 'string'
          ? orderIdOverride
          : selectedOrderId || '',
      ).trim();
      if (status && status !== 'pending') {
        query.set('status', status);
      }
      if (orderId) {
        query.set('orderId', orderId);
      }
      const nextQuery = query.toString();
      const nextPath = location.pathname + (nextQuery ? '?' + nextQuery : '');
      history.replaceState(null, '', nextPath);
    }

    function buildReviewSnapshotBlocks(item) {
      return [
        item.currentPayablePriceCents !== undefined
          ? '<div><strong>当前应付</strong><div class="muted">' +
            escapeHtml(formatYuanFromCents(item.currentPayablePriceCents)) +
            '</div></div>'
          : '',
        item.costImpactText
          ? '<div><strong>费用影响</strong><div class="muted">' + escapeHtml(item.costImpactText) + '</div></div>'
          : '',
        item.refundText
          ? '<div><strong>退款状态</strong><div class="muted">' + escapeHtml(item.refundText) + '</div></div>'
          : '',
        item.driverNoticeText
          ? '<div><strong>司机通知</strong><div class="muted">' + escapeHtml(item.driverNoticeText) + '</div></div>'
          : '',
        item.adjustedPayablePriceCents !== undefined
          ? '<div><strong>审核改价</strong><div class="muted">' +
            escapeHtml(
              (item.previousPayablePriceCents !== undefined
                ? formatYuanFromCents(item.previousPayablePriceCents) + ' → '
                : '') + formatYuanFromCents(item.adjustedPayablePriceCents),
            ) +
            '</div></div>'
          : '',
        item.fundDisposition && item.fundDisposition.summaryText
          ? '<div><strong>资金处置</strong><div class="muted">' +
            escapeHtml(item.fundDisposition.summaryText) +
            (item.fundDisposition.requiresManualFollowUp
              ? '（需人工跟进）'
              : '') +
            '</div></div>'
          : '',
      ].join('');
    }

    function formatYuanFromCents(cents) {
      const amount = Number(cents || 0) / 100;
      return '￥' + amount.toFixed(2);
    }

    function parseAdjustedPayablePriceCents() {
      const raw = document.getElementById('adjustedPayablePriceYuan').value.trim();
      if (!raw) {
        return undefined;
      }
      const yuan = Number(raw);
      if (!Number.isFinite(yuan)) {
        throw new Error('调整后应付金额格式不正确');
      }
      const cents = Math.round(yuan * 100);
      if (!Number.isInteger(cents) || cents < 100 || cents > 10_000_000) {
        throw new Error('调整后应付金额需在 1 到 100000 元之间');
      }
      return cents;
    }

    function fillReviewForm(item) {
      setInputValue('reviewResultText', item?.reviewResultText || '');
      setInputValue('costImpactText', item?.costImpactText || '');
      setInputValue('refundText', item?.refundText || '');
      setInputValue('driverNoticeText', item?.driverNoticeText || '');
      setInputValue(
        'adjustedPayablePriceYuan',
        item?.adjustedPayablePriceCents !== undefined
          ? String(Number(item.adjustedPayablePriceCents) / 100)
          : '',
      );
    }

    async function apiGet(url) {
      const response = await fetch(url, {
        headers: { Authorization: 'Bearer ' + getToken() },
      });
      const payload = await response.json();
      if (!response.ok || payload.code !== 'OK') {
        const error = new Error(payload.message || '请求失败');
        error.code = payload.code;
        throw error;
      }
      return payload.data;
    }

    async function apiPost(url, body) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + getToken(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok || payload.code !== 'OK') {
        const error = new Error(payload.message || '请求失败');
        error.code = payload.code;
        throw error;
      }
      return payload.data;
    }

    function renderQueue(items) {
      currentItems = items || [];
      const root = document.getElementById('queueList');
      if (!currentItems.length) {
        syncOrderChangeRequestRouteState(selectedOrderId);
        root.innerHTML = '<div class="muted">当前筛选下没有修改申请。</div>';
        return;
      }
      if (!selectedOrderId) {
        selectedOrderId = currentItems[0].orderId;
      }
      const queuedSelection = currentItems.find(
        item => item.orderId === selectedOrderId,
      );
      if (queuedSelection) {
        selectedChangeRequest = queuedSelection;
      }
      syncOrderChangeRequestRouteState(selectedOrderId);
      root.innerHTML = currentItems.map(item => {
        const selected = item.orderId === selectedOrderId ? ' selected' : '';
        return '<div class="card queue-item' + selected + '" data-order-id="' + escapeHtml(item.orderId) + '">' +
          '<strong>' + escapeHtml(item.orderNo) + '</strong>' +
          '<div class="muted">' + escapeHtml(item.shipperId) + ' · ' + escapeHtml(item.status) + ' · ' + escapeHtml(item.orderStatus) + '</div>' +
          '<div class="muted">' + escapeHtml(item.description) + '</div>' +
        '</div>';
      }).join('');
      root.querySelectorAll('.queue-item').forEach(node => {
        node.addEventListener('click', () => {
          latestDetailRequestId += 1;
          selectedOrderId = node.getAttribute('data-order-id') || '';
          selectedChangeRequest =
            currentItems.find(item => item.orderId === selectedOrderId) || null;
          syncOrderChangeRequestRouteState(selectedOrderId);
          setText('reviewStatus', '');
          renderQueue(currentItems);
          renderDetail();
          loadReviewEvents();
        });
      });
    }

    function setReviewActionsEnabled(enabled) {
      document.getElementById('approveButton').disabled = !enabled;
      document.getElementById('rejectButton').disabled = !enabled;
    }

    function renderDetail(emptyStatusText) {
      const item = selectedChangeRequest;
      if (!item) {
        setText(
          'detailStatus',
          emptyStatusText ||
            (selectedOrderId
              ? '指定修改申请详情尚未加载。'
              : '请选择左侧修改申请。'),
        );
        document.getElementById('detailBody').innerHTML = '';
        fillReviewForm();
        setReviewActionsEnabled(false);
        return;
      }
      setText('detailStatus', '当前订单：' + item.orderNo);
      fillReviewForm(item);
      setReviewActionsEnabled(
        !reviewMutationPending && item.status === 'pending',
      );
      document.getElementById('detailBody').innerHTML = [
        '<div><strong>货主</strong><div class="muted">' + escapeHtml(item.shipperId) + '</div></div>',
        '<div><strong>订单状态</strong><div class="muted">' + escapeHtml(item.orderStatus) + '</div></div>',
        '<div><strong>申请内容</strong><div class="muted">' + escapeHtml(item.description) + '</div></div>',
        item.reviewResultText
          ? '<div><strong>审核说明</strong><div class="muted">' + escapeHtml(item.reviewResultText) + '</div></div>'
          : '',
        buildReviewSnapshotBlocks(item),
        '<div><strong>申请时间</strong><div class="muted">' + escapeHtml(item.requestedAtIso) + '</div></div>',
      ].join('');
    }

    function findLatestChangeRequestCycle(events) {
      let reviewEvent = null;
      for (const event of Array.isArray(events) ? events : []) {
        if (event.stage === 'requested') {
          return { requestEvent: event, reviewEvent };
        }
        if (
          !reviewEvent &&
          (event.stage === 'approved' || event.stage === 'rejected')
        ) {
          reviewEvent = event;
        }
      }
      return null;
    }

    function createRoutedChangeRequest(order, events) {
      const cycle = findLatestChangeRequestCycle(events);
      if (!order || !cycle) {
        return null;
      }
      const { requestEvent, reviewEvent } = cycle;

      return {
        orderId: order.id,
        orderNo: order.orderNo,
        shipperId: order.shipperId,
        status: reviewEvent ? reviewEvent.stage : 'pending',
        description: requestEvent.noteText || '',
        ...(reviewEvent && reviewEvent.noteText
          ? { reviewResultText: reviewEvent.noteText }
          : {}),
        ...(reviewEvent && reviewEvent.costImpactText
          ? { costImpactText: reviewEvent.costImpactText }
          : {}),
        ...(reviewEvent && reviewEvent.refundText
          ? { refundText: reviewEvent.refundText }
          : {}),
        ...(reviewEvent && reviewEvent.driverNoticeText
          ? { driverNoticeText: reviewEvent.driverNoticeText }
          : {}),
        requestedAtIso: requestEvent.createdAtIso,
        ...(reviewEvent
          ? { reviewedAtIso: reviewEvent.createdAtIso }
          : {}),
        ...(order.assignedDriverId
          ? { assignedDriverId: order.assignedDriverId }
          : {}),
        orderStatus: order.status,
      };
    }

    function resetReviewEvents(statusText) {
      setText('reviewEventStatus', statusText);
      document.getElementById('reviewEventList').innerHTML = '<div class="muted">暂无审核事件。</div>';
    }

    function formatReviewEventStage(stage) {
      if (stage === 'requested') return '货主提交申请';
      if (stage === 'approved') return '后台通过申请';
      if (stage === 'rejected') return '后台驳回申请';
      return '未知事件';
    }

    function renderReviewEvents(events) {
      const root = document.getElementById('reviewEventList');
      if (!events.length) {
        root.innerHTML = '<div class="muted">暂无审核事件。</div>';
        return;
      }
      root.innerHTML = events.map(event => {
        return '<div class="event-item">' +
          '<strong>' + escapeHtml(formatReviewEventStage(event.stage)) + '</strong>' +
          '<div class="muted">操作者：' + escapeHtml(event.actorUserId || '系统') + ' · 时间：' + escapeHtml(event.createdAtIso || '-') + '</div>' +
          '<div class="muted">' + escapeHtml(event.noteText || '无附加说明') + '</div>' +
          buildReviewSnapshotBlocks(event) +
        '</div>';
      }).join('');
    }

    async function loadRoutedChangeRequestDetail(orderId) {
      const requestId = ++latestDetailRequestId;
      const reviewEventsRequestId = ++latestReviewEventsRequestId;
      selectedChangeRequest = null;
      renderDetail('加载指定修改申请详情中...');
      resetReviewEvents('加载指定修改申请审核事件中...');

      try {
        const [order, events] = await Promise.all([
          apiGet(orderApiBase + '/' + encodeURIComponent(orderId)),
          apiGet(
            orderApiBase + '/' + encodeURIComponent(orderId) + '/change-request/review-events',
          ),
        ]);
        if (
          requestId !== latestDetailRequestId ||
          reviewEventsRequestId !== latestReviewEventsRequestId ||
          selectedOrderId !== orderId
        ) {
          return;
        }
        const detail = createRoutedChangeRequest(order, events);
        if (!detail) {
          renderDetail('指定订单没有可展示的修改申请。');
          resetReviewEvents('指定订单没有修改申请审核事件。');
          return;
        }
        selectedChangeRequest = detail;
        renderDetail();
        renderReviewEvents(Array.isArray(events) ? events : []);
        setText(
          'reviewEventStatus',
          '共 ' + (Array.isArray(events) ? events.length : 0) + ' 条审核事件',
        );
      } catch (error) {
        if (
          requestId !== latestDetailRequestId ||
          reviewEventsRequestId !== latestReviewEventsRequestId ||
          selectedOrderId !== orderId
        ) {
          return;
        }
        selectedChangeRequest = null;
        renderDetail(error.message || '指定修改申请详情加载失败');
        resetReviewEvents('指定修改申请审核事件加载失败');
      }
    }

    async function loadReviewEvents() {
      const requestId = ++latestReviewEventsRequestId;
      const targetOrderId = selectedOrderId;
      if (!targetOrderId) {
        resetReviewEvents('请选择左侧修改申请。');
        return;
      }
      if (!getToken()) {
        resetReviewEvents('请先填写 admin token。');
        return;
      }
      setText('reviewEventStatus', '加载审核事件中...');
      try {
        const events = await apiGet(
          orderApiBase + '/' + encodeURIComponent(targetOrderId) + '/change-request/review-events',
        );
        if (
          requestId !== latestReviewEventsRequestId ||
          selectedOrderId !== targetOrderId
        ) {
          return;
        }
        renderReviewEvents(Array.isArray(events) ? events : []);
        setText(
          'reviewEventStatus',
          '共 ' + (Array.isArray(events) ? events.length : 0) + ' 条审核事件',
        );
      } catch (error) {
        if (
          requestId !== latestReviewEventsRequestId ||
          selectedOrderId !== targetOrderId
        ) {
          return;
        }
        resetReviewEvents(error.message || '审核事件加载失败');
      }
    }

    async function loadQueue() {
      const requestId = ++latestQueueRequestId;
      latestDetailRequestId += 1;
      latestReviewEventsRequestId += 1;
      if (!getToken()) {
        setText('queueStatus', '请先填写 admin token。');
        selectedChangeRequest = null;
        renderDetail('请先填写 admin token。');
        resetReviewEvents('请先填写 admin token。');
        return;
      }
      setText('queueStatus', '加载中...');
      syncOrderChangeRequestRouteState(selectedOrderId);
      try {
        const status = document.getElementById('statusFilter').value;
        const query = new URLSearchParams({ status, page: '1', pageSize: '50' });
        const data = await apiGet(listApiBase + '?' + query.toString());
        if (requestId !== latestQueueRequestId) {
          return;
        }
        renderQueue(data.items || []);
        setText('queueStatus', '共 ' + (data.total || 0) + ' 条');
        const queuedSelection = currentItems.find(
          item => item.orderId === selectedOrderId,
        );
        if (queuedSelection) {
          selectedChangeRequest = queuedSelection;
          renderDetail();
          await loadReviewEvents();
        } else if (selectedOrderId) {
          await loadRoutedChangeRequestDetail(selectedOrderId);
        } else {
          selectedChangeRequest = null;
          renderDetail();
          resetReviewEvents('请选择左侧修改申请。');
        }
      } catch (error) {
        if (requestId !== latestQueueRequestId) {
          return;
        }
        setText('queueStatus', error.message || '加载失败');
        if (selectedOrderId) {
          await loadRoutedChangeRequestDetail(selectedOrderId);
        } else {
          selectedChangeRequest = null;
          renderDetail('修改申请队列加载失败。');
          resetReviewEvents('审核事件尚未加载');
        }
      }
    }

    async function review(decision) {
      if (reviewMutationPending) {
        return;
      }
      const requestId = ++latestReviewRequestId;
      const targetOrderId = selectedOrderId;
      const targetChangeRequest = selectedChangeRequest;
      if (
        !targetOrderId ||
        !targetChangeRequest ||
        targetChangeRequest.orderId !== targetOrderId ||
        targetChangeRequest.status !== 'pending'
      ) {
        setText('reviewStatus', '当前没有可审核的待处理修改申请。');
        return;
      }
      const reviewResultText = document.getElementById('reviewResultText').value.trim();
      const costImpactText = document.getElementById('costImpactText').value.trim();
      const refundText = document.getElementById('refundText').value.trim();
      const driverNoticeText = document.getElementById('driverNoticeText').value.trim();
      const adjustedPayablePriceYuanInput = document.getElementById(
        'adjustedPayablePriceYuan',
      );
      const adjustedPayablePriceYuan = (
        adjustedPayablePriceYuanInput && adjustedPayablePriceYuanInput.value
          ? String(adjustedPayablePriceYuanInput.value)
          : ''
      ).trim();
      let adjustedPayablePriceCents;
      if (adjustedPayablePriceYuan) {
        const yuan = Number(adjustedPayablePriceYuan);
        if (!Number.isFinite(yuan)) {
          setText('reviewStatus', '调整后应付金额格式不正确');
          return;
        }
        const cents = Math.round(yuan * 100);
        if (!Number.isInteger(cents) || cents < 100 || cents > 10_000_000) {
          setText('reviewStatus', '调整后应付金额需在 1 到 100000 元之间');
          return;
        }
        adjustedPayablePriceCents = cents;
      }
      if (decision === 'rejected' && adjustedPayablePriceCents !== undefined) {
        setText('reviewStatus', '驳回修改申请时不能调整订单金额');
        return;
      }
      const body = {
        decision,
        ...(reviewResultText ? { reviewResultText } : {}),
        ...(costImpactText ? { costImpactText } : {}),
        ...(refundText ? { refundText } : {}),
        ...(driverNoticeText ? { driverNoticeText } : {}),
        ...(adjustedPayablePriceCents !== undefined
          ? { adjustedPayablePriceCents }
          : {}),
      };
      let shouldRefresh = false;
      reviewMutationPending = true;
      setText('reviewStatus', '提交审核中...');
      setReviewActionsEnabled(false);
      try {
        await apiPost(
          orderApiBase + '/' + encodeURIComponent(targetOrderId) + '/change-request/review',
          body,
        );
        if (
          requestId !== latestReviewRequestId ||
          selectedOrderId !== targetOrderId
        ) {
          return;
        }
        selectedChangeRequest = {
          ...targetChangeRequest,
          status: decision,
          ...(reviewResultText ? { reviewResultText } : {}),
          ...(costImpactText ? { costImpactText } : {}),
          ...(refundText ? { refundText } : {}),
          ...(driverNoticeText ? { driverNoticeText } : {}),
          ...(adjustedPayablePriceCents !== undefined
            ? {
                adjustedPayablePriceCents,
                currentPayablePriceCents: adjustedPayablePriceCents,
              }
            : {}),
        };
        renderDetail();
        setText('reviewStatus', '审核成功：' + decision);
        if (adjustedPayablePriceCents !== undefined) {
          setText(
            'reviewStatus',
            '审核成功：' + decision + '，已同步订单应付金额',
          );
        }
        shouldRefresh = true;
      } catch (error) {
        if (
          requestId !== latestReviewRequestId ||
          selectedOrderId !== targetOrderId
        ) {
          return;
        }
        setText('reviewStatus', error.message || '审核失败');
        if (
          error.code === 'ORDER_CONFLICT' ||
          error.code === 'ORDER_STATE_INVALID'
        ) {
          shouldRefresh = true;
        }
      } finally {
        reviewMutationPending = false;
        setReviewActionsEnabled(
          !shouldRefresh &&
            selectedChangeRequest?.orderId === selectedOrderId &&
            selectedChangeRequest.status === 'pending',
        );
      }
      if (shouldRefresh) {
        try {
          await loadQueue();
        } catch (error) {
          if (selectedOrderId === targetOrderId) {
            setText('queueStatus', error.message || '审核后刷新失败');
          }
        }
      }
    }

    document.getElementById('refreshButton').addEventListener('click', loadQueue);
    document.getElementById('statusFilter').addEventListener('change', loadQueue);
    document.getElementById('approveButton').addEventListener('click', () => review('approved'));
    document.getElementById('rejectButton').addEventListener('click', () => review('rejected'));
    applyOrderChangeRequestRouteState();
    const currentAdminSession = initializeAdminSession();
    if (currentAdminSession && currentAdminSession.accessToken) {
      loadQueue();
    }
  </script>
</body>
</html>`;
}
