export function renderDriverCertificationAdminConsole() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="admin-certification-api" content="/api/admin/driver-certifications" />
  <title>司机认证审核台</title>
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
      --warn: #a15c07;
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
    .topbar {
      justify-content: space-between;
      margin-bottom: 16px;
    }
    h1 { margin: 0; font-size: 22px; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 18px; letter-spacing: 0; }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .queue-item { width: 100%; text-align: left; cursor: pointer; }
    .queue-item.active {
      border-color: var(--accent);
      box-shadow: inset 3px 0 0 var(--accent);
    }
    .meta { color: var(--muted); font-size: 13px; line-height: 1.5; }
    .status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: #f8fafb;
      font-size: 12px;
    }
    .status.reviewing { color: var(--warn); border-color: #e8c48b; }
    .status.approved { color: var(--accent); border-color: #93c5bd; }
    .status.rejected { color: var(--danger); border-color: #e3aaa5; }
    input, select, textarea {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px 10px;
      background: #fff;
      min-height: 38px;
    }
    input[type="password"] {
      min-width: min(100%, 360px);
      flex: 1;
    }
    textarea {
      min-width: min(100%, 420px);
      min-height: 72px;
      resize: vertical;
    }
    button {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px 12px;
      background: #fff;
      color: var(--text);
      cursor: pointer;
    }
    button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
    button.danger {
      background: var(--danger);
      border-color: var(--danger);
      color: #fff;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .attachments {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
    }
    .attachment-link { word-break: break-all; color: var(--accent); }
    .notice { margin: 10px 0; color: var(--danger); min-height: 20px; }
    @media (max-width: 860px) {
      .console-shell { grid-template-columns: 1fr; }
      .queue-panel { border-right: 0; border-bottom: 1px solid var(--line); }
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="console-shell">
    <section class="queue-panel">
      <div class="topbar">
        <h1>司机认证审核台</h1>
        <select id="statusFilter">
          <option value="reviewing">待审核</option>
          <option value="approved">已通过</option>
          <option value="rejected">已驳回</option>
        </select>
      </div>
      <div class="toolbar">
        <input id="adminToken" type="password" aria-label="admin access token" title="粘贴 admin access token" />
        <button class="primary" id="loadQueue">刷新</button>
      </div>
      <div id="notice" class="notice"></div>
      <div id="queue"></div>
    </section>
    <section class="detail-panel">
      <h2 id="detailTitle">选择一条认证记录</h2>
      <div id="detail"></div>
    </section>
  </main>
  <script>
    const state = { token: '', items: [], selected: null, attachments: null, events: [] };
    const apiBase = '/api';
    const apiPaths = {
      list: '/admin/driver-certifications',
      attachments: '/attachments',
      reviewEvents: '/review-events',
      identityReview: '/identity/review',
      vehicleReview: '/vehicle/review'
    };
    const statusText = { unsubmitted: '未提交', reviewing: '待审核', approved: '已通过', rejected: '已驳回' };
    const certificationText = { identity: '实名认证', vehicle: '车辆认证' };

    function authHeaders() {
      state.token = document.getElementById('adminToken').value.trim();
      if (!state.token) throw new Error('请先填写 admin access token');
      return { Authorization: 'Bearer ' + state.token, 'Content-Type': 'application/json' };
    }

    async function request(path, options = {}) {
      const response = await fetch(apiBase + path, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.code !== 'OK') {
        throw new Error(body.message || body.code || '请求失败');
      }
      return body.data;
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character]);
    }

    function setNotice(message) {
      document.getElementById('notice').textContent = message || '';
    }

    function badge(status) {
      return '<span class="status ' + escapeHtml(status) + '">' + escapeHtml(statusText[status] || status) + '</span>';
    }

    async function loadQueue() {
      try {
        setNotice('');
        const status = document.getElementById('statusFilter').value;
        const data = await request(apiPaths.list + '?status=' + encodeURIComponent(status) + '&page=1&pageSize=20');
        state.items = data.items || [];
        renderQueue();
      } catch (error) {
        setNotice(error.message);
      }
    }

    function getDriverId(item) {
      return item.driver && item.driver.id ? item.driver.id : item.identity.driverId;
    }

    function renderQueue() {
      const queue = document.getElementById('queue');
      if (state.items.length === 0) {
        queue.innerHTML = '<div class="card meta">暂无认证记录</div>';
        return;
      }
      queue.innerHTML = state.items.map(item => {
        const driverId = getDriverId(item);
        const phone = item.driver && item.driver.phone ? item.driver.phone : '手机号待补充';
        const active = state.selected && getDriverId(state.selected) === driverId ? ' active' : '';
        return '<button class="card queue-item' + active + '" data-driver-id="' + escapeHtml(driverId) + '">' +
          '<strong>' + escapeHtml(phone) + '</strong><div class="meta">司机ID：' + escapeHtml(driverId) + '</div>' +
          '<div class="meta">实名 ' + badge(item.identity.status) + ' 车辆 ' + badge(item.vehicle.status) + '</div>' +
          '</button>';
      }).join('');
      queue.querySelectorAll('[data-driver-id]').forEach(node => {
        node.addEventListener('click', () => selectDriver(node.getAttribute('data-driver-id')));
      });
    }

    async function selectDriver(driverId) {
      try {
        setNotice('');
        state.selected = state.items.find(item => getDriverId(item) === driverId);
        const [attachments, events] = await Promise.all([
          request(apiPaths.list + '/' + encodeURIComponent(driverId) + apiPaths.attachments),
          request(apiPaths.list + '/' + encodeURIComponent(driverId) + apiPaths.reviewEvents),
        ]);
        state.attachments = attachments;
        state.events = events;
        renderQueue();
        renderDetail();
      } catch (error) {
        setNotice(error.message);
      }
    }

    function renderDetail() {
      const item = state.selected;
      if (!item) return;
      const driverId = getDriverId(item);
      document.getElementById('detailTitle').textContent = '认证详情 · ' + (item.driver && item.driver.phone ? item.driver.phone : driverId);
      document.getElementById('detail').innerHTML =
        '<div class="grid">' +
          renderCertificationCard('identity', item.identity) +
          renderCertificationCard('vehicle', item.vehicle) +
        '</div>' +
        renderAttachments() +
        renderEvents();
      bindReviewButtons(driverId);
    }

    function renderCertificationCard(type, record) {
      const label = certificationText[type];
      const approveId = type === 'identity' ? 'approveIdentity' : 'approveVehicle';
      const rejectId = type === 'identity' ? 'rejectIdentity' : 'rejectVehicle';
      const reasonId = type + 'RejectReason';
      return '<section class="card">' +
        '<h2>' + label + ' ' + badge(record.status) + '</h2>' +
        '<div class="meta">' + Object.entries(record).map(([key, value]) => escapeHtml(key) + '：' + escapeHtml(value || '-')).join('<br>') + '</div>' +
        '<div class="review-row"><button class="primary" id="' + approveId + '">通过</button>' +
        '<button class="danger" id="' + rejectId + '">驳回</button></div>' +
        '<textarea id="' + reasonId + '" aria-label="驳回原因" title="驳回原因"></textarea>' +
        '</section>';
    }

    function renderAttachments() {
      const groups = state.attachments || { identity: {}, vehicle: {} };
      const attachments = [...Object.values(groups.identity || {}), ...Object.values(groups.vehicle || {})].filter(Boolean);
      if (attachments.length === 0) return '<section class="card"><h2>附件预览</h2><div class="meta">暂无附件</div></section>';
      return '<section class="card"><h2>附件预览</h2><div class="attachments">' + attachments.map(file =>
        '<div class="card"><strong>' + escapeHtml(file.attachmentType) + '</strong><div class="meta">' + escapeHtml(file.objectKey) + '</div>' +
        (file.previewUrl ? '<a class="attachment-link" target="_blank" rel="noreferrer" href="' + escapeHtml(file.previewUrl) + '">打开预览</a>' : '<span class="meta">暂无预览链接</span>') +
        '</div>').join('') + '</div></section>';
    }

    function renderEvents() {
      if (!state.events.length) return '<section class="card"><h2>审核事件</h2><div class="meta">暂无审核事件</div></section>';
      return '<section class="card"><h2>审核事件</h2>' + state.events.map(event =>
        '<div class="card meta">' + escapeHtml(event.createdAtIso) + ' · ' + escapeHtml(event.certificationType) + ' · ' + escapeHtml(event.fromStatus) + ' -> ' + escapeHtml(event.toStatus) +
        (event.rejectionReason ? '<br>原因：' + escapeHtml(event.rejectionReason) : '') + '</div>').join('') + '</section>';
    }

    function bindReviewButtons(driverId) {
      document.getElementById('approveIdentity').onclick = () => submitReview(driverId, 'identity', { status: 'approved' });
      document.getElementById('approveVehicle').onclick = () => submitReview(driverId, 'vehicle', { status: 'approved' });
      document.getElementById('rejectIdentity').onclick = () => submitReview(driverId, 'identity', {
        status: 'rejected',
        rejectionReason: document.getElementById('identityRejectReason').value
      });
      document.getElementById('rejectVehicle').onclick = () => submitReview(driverId, 'vehicle', {
        status: 'rejected',
        rejectionReason: document.getElementById('vehicleRejectReason').value
      });
    }

    async function submitReview(driverId, type, payload) {
      try {
        setNotice('');
        if (payload.status === 'rejected' && !payload.rejectionReason.trim()) throw new Error('请填写驳回原因');
        const reviewPath = type === 'identity' ? apiPaths.identityReview : apiPaths.vehicleReview;
        await request(apiPaths.list + '/' + encodeURIComponent(driverId) + reviewPath, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        await loadQueue();
        await selectDriver(driverId);
      } catch (error) {
        setNotice(error.message);
      }
    }

    document.getElementById('loadQueue').addEventListener('click', loadQueue);
    document.getElementById('statusFilter').addEventListener('change', loadQueue);
  </script>
</body>
</html>`;
}
