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
        <button type="button" id="refreshButton" class="secondary">刷新队列</button>
      </div>
      <div id="queueStatus" class="status-line">等待登录 token 后加载队列。</div>
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
  ${renderAdminSessionScript({
    currentRoute: '/api/admin/shipper-verification-console',
  })}
  <script>
    const apiBase = document.querySelector('meta[name="admin-shipper-verification-api"]').content;
    let selectedShipperId = '';
    let currentItems = [];
    let currentAttachments = null;
    let currentReviewEvents = [];
    let latestReviewEventsRequestId = 0;
    const attachmentText = {
      identityFront: '身份证正面',
      identityBack: '身份证反面',
      license: '营业执照',
    };

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
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function getSelectedItem() {
      return currentItems.find(item => item.shipperId === selectedShipperId);
    }

    function resetDetail(statusText) {
      setText('detailStatus', statusText);
      document.getElementById('detailBody').innerHTML = '';
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
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.code !== 'OK') {
        throw new Error(payload.message || '请求失败');
      }
      return payload.data;
    }

    function renderQueue(items) {
      currentItems = items || [];
      const root = document.getElementById('queueList');
      if (!currentItems.length) {
        selectedShipperId = '';
        root.innerHTML = '<div class="muted">当前筛选下没有认证记录。</div>';
        resetDetail('请选择左侧货主。');
        resetAttachments('请选择左侧货主。');
        resetReviewEvents('请选择左侧货主。');
        return;
      }
      if (!currentItems.some(item => item.shipperId === selectedShipperId)) {
        selectedShipperId = currentItems[0].shipperId;
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
      const item = getSelectedItem();
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
          '<div class="muted">操作者：' + escapeHtml(event.actorUserId || '系统') + ' · 时间：' + escapeHtml(event.createdAtIso || '-') + '</div>' +
          '<div class="muted">' + escapeHtml(event.noteText || '无附加说明') + '</div>' +
        '</div>';
      }).join('');
      setText('reviewEventStatus', '共 ' + currentReviewEvents.length + ' 条审核事件');
    }

    async function selectShipper(shipperId) {
      selectedShipperId = shipperId;
      renderQueue(currentItems);
      renderDetail();
      setText('reviewStatus', '');
      if (!shipperId) {
        resetAttachments('请选择左侧货主。');
        resetReviewEvents('请选择左侧货主。');
        return;
      }
      if (!getToken()) {
        resetAttachments('请先填写 admin token。');
        resetReviewEvents('请先填写 admin token。');
        return;
      }

      const requestId = ++latestReviewEventsRequestId;
      setText('attachmentStatus', '加载附件中...');
      setText('reviewEventStatus', '加载审核事件中...');

      try {
        const [attachments, events] = await Promise.all([
          apiGet('/' + encodeURIComponent(shipperId) + '/attachments'),
          apiGet('/' + encodeURIComponent(shipperId) + '/review-events'),
        ]);
        if (requestId !== latestReviewEventsRequestId) {
          return;
        }
        currentAttachments = attachments;
        currentReviewEvents = Array.isArray(events) ? events : [];
        renderAttachments();
        renderReviewEvents();
      } catch (error) {
        if (requestId !== latestReviewEventsRequestId) {
          return;
        }
        resetAttachments(error.message || '附件加载失败');
        resetReviewEvents(error.message || '审核事件加载失败');
      }
    }

    async function loadQueue() {
      if (!getToken()) {
        setText('queueStatus', '请先填写 admin token。');
        resetDetail('请先填写 admin token。');
        resetAttachments('请先填写 admin token。');
        resetReviewEvents('请先填写 admin token。');
        return;
      }
      setText('queueStatus', '加载中...');
      try {
        const status = document.getElementById('statusFilter').value;
        const type = document.getElementById('typeFilter').value;
        const query = new URLSearchParams({ status, page: '1', pageSize: '50' });
        if (type) query.set('type', type);
        const data = await apiGet('?' + query.toString());
        renderQueue(data.items || []);
        setText('queueStatus', '共 ' + (data.total || 0) + ' 条');
        renderDetail();
        if (selectedShipperId) {
          await selectShipper(selectedShipperId);
        }
      } catch (error) {
        setText('queueStatus', error.message || '加载失败');
        resetDetail('认证详情尚未加载');
        resetAttachments('附件尚未加载');
        resetReviewEvents('审核事件尚未加载');
      }
    }

    async function review(kind, status) {
      if (!selectedShipperId) {
        setText('reviewStatus', '请先选择货主。');
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
        await apiPost('/' + encodeURIComponent(selectedShipperId) + '/' + kind + '/review', body);
        setText('reviewStatus', kind + ' 审核成功：' + status);
        await loadQueue();
      } catch (error) {
        setText('reviewStatus', error.message || '审核失败');
      }
    }

    document.getElementById('refreshButton').addEventListener('click', loadQueue);
    document.getElementById('statusFilter').addEventListener('change', loadQueue);
    document.getElementById('typeFilter').addEventListener('change', loadQueue);
    document.getElementById('approveIdentityButton').addEventListener('click', () => review('identity', 'approved'));
    document.getElementById('rejectIdentityButton').addEventListener('click', () => review('identity', 'rejected'));
    document.getElementById('approveEnterpriseButton').addEventListener('click', () => review('enterprise', 'approved'));
    document.getElementById('rejectEnterpriseButton').addEventListener('click', () => review('enterprise', 'rejected'));
    loadQueue();
  </script>
</body>
</html>`;
}
