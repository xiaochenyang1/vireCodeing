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
          <p class="muted">第一片：列表筛选 + 单条通过/驳回发票申请。</p>
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
        <button type="button" id="refreshButton" class="secondary">刷新队列</button>
      </div>
      <div id="queueStatus" class="status-line">等待登录 token 后加载队列。</div>
      <div id="queueList"></div>
    </section>
    <section class="detail-panel">
      <h2>申请详情</h2>
      <div id="detailStatus" class="status-line">请选择左侧发票申请。</div>
      <div id="detailBody" class="detail-grid"></div>
      <div class="card">
        <h2>审核操作</h2>
        <label>
          驳回原因
          <textarea id="rejectionReason" placeholder="驳回时必填"></textarea>
        </label>
        <div class="review-row" style="margin-top:10px;">
          <button type="button" id="approveButton">通过申请</button>
          <button type="button" id="rejectButton" class="danger">驳回申请</button>
        </div>
        <div id="reviewStatus" class="status-line"></div>
      </div>
    </section>
  </div>
  ${renderAdminSessionScript({
    currentRoute: '/api/admin/shipper-invoice-console',
  })}
  <script>
    const apiBase = document.querySelector('meta[name="admin-shipper-invoice-api"]').content;
    let selectedApplicationId = '';
    let currentItems = [];

    function getToken() {
      return window.__adminSession?.getAccessToken?.() || localStorage.getItem('adminAccessToken') || '';
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

    function formatAmount(cents) {
      return '¥' + (Number(cents || 0) / 100).toFixed(2);
    }

    async function apiGet(path) {
      const response = await fetch(apiBase + path, {
        headers: { Authorization: 'Bearer ' + getToken() },
      });
      const payload = await response.json();
      if (!response.ok || payload.code !== 'OK') {
        throw new Error(payload.message || '请求失败');
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
      const payload = await response.json();
      if (!response.ok || payload.code !== 'OK') {
        throw new Error(payload.message || '请求失败');
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
          selectedApplicationId = node.getAttribute('data-application-id') || '';
          renderQueue(currentItems);
          renderDetail();
        });
      });
    }

    function renderDetail() {
      const item = currentItems.find(entry => entry.id === selectedApplicationId);
      if (!item) {
        setText('detailStatus', '请选择左侧发票申请。');
        document.getElementById('detailBody').innerHTML = '';
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
    }

    async function loadQueue() {
      if (!getToken()) {
        setText('queueStatus', '请先填写 admin token。');
        return;
      }
      setText('queueStatus', '加载中...');
      try {
        const status = document.getElementById('statusFilter').value;
        const query = new URLSearchParams({ status, page: '1', pageSize: '50' });
        const data = await apiGet('?' + query.toString());
        renderQueue(data.items || []);
        setText('queueStatus', '共 ' + (data.total || 0) + ' 条');
        renderDetail();
      } catch (error) {
        setText('queueStatus', error.message || '加载失败');
      }
    }

    async function review(status) {
      if (!selectedApplicationId) {
        setText('reviewStatus', '请先选择发票申请。');
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
      setText('reviewStatus', '提交审核中...');
      try {
        await apiPost('/' + encodeURIComponent(selectedApplicationId) + '/review', body);
        setText('reviewStatus', '审核成功：' + status);
        await loadQueue();
      } catch (error) {
        setText('reviewStatus', error.message || '审核失败');
      }
    }

    document.getElementById('refreshButton').addEventListener('click', loadQueue);
    document.getElementById('statusFilter').addEventListener('change', loadQueue);
    document.getElementById('approveButton').addEventListener('click', () => review('approved'));
    document.getElementById('rejectButton').addEventListener('click', () => review('rejected'));
    loadQueue();
  </script>
</body>
</html>`;
}
