import {
  renderAdminConsoleNav,
  renderAdminConsoleNavStyles,
} from './admin-console-nav-snippet';
import {
  renderAdminSessionControls,
  renderAdminSessionScript,
} from './admin-session-snippet';

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
    .queue-item-shell.active {
      border-color: var(--accent);
      box-shadow: inset 3px 0 0 var(--accent);
    }
    .queue-item-top, .queue-item-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
    }
    .queue-item-actions {
      justify-content: flex-end;
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
    .session-row { margin-top: 8px; }
    .session-link { color: var(--accent); font-size: 13px; font-weight: 600; text-decoration: none; }
    .secondary-button { width: auto; background: #fff; color: var(--text); }
    .checkbox-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-size: 13px;
    }
    .status-line {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
      min-height: 20px;
      margin-top: 8px;
      white-space: pre-wrap;
    }
    ${renderAdminConsoleNavStyles()}
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
      ${renderAdminSessionControls({
        currentRoute: '/api/admin/driver-certification-console',
        hintClass: 'meta',
      })}
      ${renderAdminConsoleNav({
        currentRoute: '/api/admin/driver-certification-console',
      })}
      <div id="notice" class="notice"></div>
      <section class="card">
        <h2>批量审核</h2>
        <div class="meta">这片先按当前筛选结果勾选司机，再顺序调用单条实名/车辆审核接口做批量通过或驳回。它能真下手，但不是原子事务，别拿一页静态台要求它像银行总账。</div>
        <div class="toolbar" style="margin-top:10px;">
          <label class="checkbox-label"><input id="selectAllDriversInput" type="checkbox" onclick="toggleSelectAllCurrentDrivers(this.checked)" />全选当前结果</label>
          <button id="clearSelectedDriversButton" type="button" class="secondary-button" onclick="clearSelectedDrivers()">清空勾选</button>
        </div>
        <div class="toolbar" style="margin-top:10px;">
          <select id="batchCertificationTypeInput" aria-label="批量审核类型" title="批量审核类型">
            <option value="identity">实名审核</option>
            <option value="vehicle">车辆审核</option>
          </select>
          <select id="batchReviewStatusInput" aria-label="批量审核结果" title="批量审核结果">
            <option value="approved">批量通过</option>
            <option value="rejected">批量驳回</option>
          </select>
        </div>
        <textarea id="batchReviewReasonInput" aria-label="批量驳回原因" title="批量驳回原因" placeholder="批量驳回原因；批量通过时可留空"></textarea>
        <div class="toolbar" style="margin-top:10px;">
          <button id="runBatchReviewButton" class="primary" type="button" onclick="runBatchReview()">执行批量审核</button>
        </div>
        <div id="batchSelectionStatus" class="status-line">当前未勾选司机。</div>
        <div id="batchActionStatus" class="status-line"></div>
      </section>
      <div id="queue"></div>
    </section>
    <section class="detail-panel">
      <h2 id="detailTitle">选择一条认证记录</h2>
      <div id="detail"></div>
    </section>
  </main>
  <script>
    const state = { token: '', items: [], selected: null, attachments: null, events: [] };
    const selectedDriverIds = new Set();
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
    ${renderAdminSessionScript({
      currentRoute: '/api/admin/driver-certification-console',
    })}

    function authHeaders() {
      state.token = document.getElementById('adminToken').value.trim();
      if (!state.token) throw new Error('请先填写 admin access token');
      persistAdminAccessToken();
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

    function selectedQueueDriverIds() {
      return Array.from(selectedDriverIds);
    }

    function badge(status) {
      return '<span class="status ' + escapeHtml(status) + '">' + escapeHtml(statusText[status] || status) + '</span>';
    }

    function renderEmptyDetail() {
      document.getElementById('detailTitle').textContent = '选择一条认证记录';
      document.getElementById('detail').innerHTML = '';
    }

    function syncSelectedDriversToCurrentQueue() {
      const currentDriverIds = new Set(state.items.map(getDriverId));

      selectedQueueDriverIds().forEach(function(driverId) {
        if (!currentDriverIds.has(driverId)) {
          selectedDriverIds.delete(driverId);
        }
      });

      if (state.selected && !currentDriverIds.has(getDriverId(state.selected))) {
        state.selected = null;
        state.attachments = null;
        state.events = [];
        renderEmptyDetail();
      }
    }

    function updateBulkSelectionUi() {
      const currentDriverIds = state.items.map(getDriverId);
      const currentSelectedCount = currentDriverIds.filter(function(driverId) {
        return selectedDriverIds.has(driverId);
      }).length;
      const selectedCount = selectedDriverIds.size;
      const selectAllInput = document.getElementById('selectAllDriversInput');

      if (selectAllInput) {
        selectAllInput.disabled = currentDriverIds.length === 0;
        selectAllInput.checked =
          currentDriverIds.length > 0 &&
          currentSelectedCount === currentDriverIds.length;
        selectAllInput.indeterminate =
          currentSelectedCount > 0 &&
          currentSelectedCount < currentDriverIds.length;
      }

      document.getElementById('batchSelectionStatus').textContent =
        selectedCount === 0
          ? '当前未勾选司机。'
          : '已勾选 ' + selectedCount + ' 个司机，其中当前结果 ' + currentSelectedCount + ' 个。';
      [
        'clearSelectedDriversButton',
        'runBatchReviewButton',
      ].forEach(function(id) {
        const node = document.getElementById(id);
        if (node) {
          node.disabled = selectedCount === 0;
        }
      });
    }

    function toggleDriverSelection(driverId, checked) {
      if (checked) {
        selectedDriverIds.add(driverId);
      } else {
        selectedDriverIds.delete(driverId);
      }
      renderQueue();
      updateBulkSelectionUi();
    }

    function toggleSelectAllCurrentDrivers(checked) {
      state.items.forEach(function(item) {
        const driverId = getDriverId(item);
        if (checked) {
          selectedDriverIds.add(driverId);
        } else {
          selectedDriverIds.delete(driverId);
        }
      });
      renderQueue();
      updateBulkSelectionUi();
    }

    function clearSelectedDrivers() {
      selectedDriverIds.clear();
      renderQueue();
      updateBulkSelectionUi();
      document.getElementById('batchActionStatus').textContent = '已清空批量勾选。';
    }

    async function loadQueue() {
      try {
        setNotice('');
        const status = document.getElementById('statusFilter').value;
        const data = await request(apiPaths.list + '?status=' + encodeURIComponent(status) + '&page=1&pageSize=20');
        state.items = data.items || [];
        syncSelectedDriversToCurrentQueue();
        renderQueue();
        updateBulkSelectionUi();
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
        const selected = selectedDriverIds.has(driverId);
        return '<article class="card queue-item-shell' + active + '">' +
          '<div class="queue-item-top">' +
            '<div>' +
              '<strong>' + escapeHtml(phone) + '</strong><div class="meta">司机ID：' + escapeHtml(driverId) + '</div>' +
            '</div>' +
            '<div class="queue-item-actions">' +
              '<label class="checkbox-label"><input type="checkbox" data-toggle-driver-id="' + escapeHtml(driverId) + '" ' + (selected ? 'checked ' : '') + '/>纳入批量</label>' +
              '<button type="button" class="secondary-button" data-driver-id="' + escapeHtml(driverId) + '">查看详情</button>' +
            '</div>' +
          '</div>' +
          '<div class="meta">实名 ' + badge(item.identity.status) + ' 车辆 ' + badge(item.vehicle.status) + '</div>' +
        '</article>';
      }).join('');
      queue.querySelectorAll('[data-driver-id]').forEach(node => {
        node.addEventListener('click', function() {
          selectDriver(node.getAttribute('data-driver-id') || '');
        });
      });
      queue.querySelectorAll('[data-toggle-driver-id]').forEach(node => {
        node.addEventListener('change', function(event) {
          toggleDriverSelection(
            node.getAttribute('data-toggle-driver-id') || '',
            event.target.checked,
          );
        });
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
      if (!item) {
        renderEmptyDetail();
        return;
      }
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
        if (state.items.some(item => getDriverId(item) === driverId)) {
          await selectDriver(driverId);
        } else {
          renderEmptyDetail();
        }
      } catch (error) {
        setNotice(error.message);
      }
    }

    async function runBatchReview() {
      const driverIds = selectedQueueDriverIds();
      const certificationType = document.getElementById('batchCertificationTypeInput').value;
      const status = document.getElementById('batchReviewStatusInput').value;
      const rejectionReason = document.getElementById('batchReviewReasonInput').value.trim();

      if (!driverIds.length) {
        document.getElementById('batchActionStatus').textContent =
          '先勾选司机再批量审核，别对着空气点通过。';
        return;
      }

      if (status === 'rejected' && !rejectionReason) {
        document.getElementById('batchActionStatus').textContent =
          '批量驳回必须填写原因，不然你让司机猜谜呢。';
        return;
      }

      const reviewPath =
        certificationType === 'identity'
          ? apiPaths.identityReview
          : apiPaths.vehicleReview;
      const actionLabel =
        certificationType === 'identity'
          ? (status === 'approved' ? '实名批量通过' : '实名批量驳回')
          : (status === 'approved' ? '车辆批量通过' : '车辆批量驳回');
      let successCount = 0;
      const failures = [];
      const selectedDriverId = state.selected ? getDriverId(state.selected) : '';

      try {
        setNotice('');
        document.getElementById('batchActionStatus').textContent =
          actionLabel + '执行中，共 ' + driverIds.length + ' 个司机。';

        for (const driverId of driverIds) {
          try {
            await request(
              apiPaths.list + '/' + encodeURIComponent(driverId) + reviewPath,
              {
                method: 'POST',
                body: JSON.stringify(
                  status === 'approved'
                    ? { status: 'approved' }
                    : {
                        status: 'rejected',
                        rejectionReason,
                      },
                ),
              },
            );
            successCount += 1;
            selectedDriverIds.delete(driverId);
          } catch (error) {
            failures.push(driverId + '（' + error.message + '）');
          }
        }

        document.getElementById('batchActionStatus').textContent =
          actionLabel + '完成：成功 ' + successCount + ' 个，失败 ' + failures.length + ' 个。' +
          (failures.length ? ' 失败详情：' + failures.join('；') : '');
        await loadQueue();
        if (selectedDriverId && state.items.some(item => getDriverId(item) === selectedDriverId)) {
          await selectDriver(selectedDriverId);
        }
      } catch (error) {
        setNotice(error.message);
      }
    }

    document.getElementById('loadQueue').addEventListener('click', loadQueue);
    document.getElementById('statusFilter').addEventListener('change', loadQueue);
    updateBulkSelectionUi();
    renderEmptyDetail();
    initializeAdminSession();
  </script>
</body>
</html>`;
}
