export function renderOrderAttachmentAdminConsole() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="admin-order-attachment-api" content="/api/admin/orders/{orderId}/attachments" />
  <title>订单附件审计台</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f6f7;
      --panel: #ffffff;
      --line: #d7dde2;
      --text: #172026;
      --muted: #65717b;
      --accent: #0f766e;
      --danger: #b42318;
      --warn-bg: #fff7ed;
      --warn-line: #fed7aa;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    button, input, select { font: inherit; }
    .console-shell {
      display: grid;
      grid-template-columns: minmax(340px, 430px) minmax(0, 1fr);
      min-height: 100vh;
    }
    .query-panel, .audit-panel { padding: 20px; }
    .query-panel {
      border-right: 1px solid var(--line);
      background: #eef2f4;
    }
    h1 { margin: 0 0 16px; font-size: 22px; letter-spacing: 0; }
    h2 { margin: 0 0 10px; font-size: 17px; letter-spacing: 0; }
    h3 { margin: 0 0 8px; font-size: 14px; letter-spacing: 0; }
    .toolbar {
      display: grid;
      gap: 10px;
    }
    input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 9px 10px;
      background: #fff;
      min-height: 40px;
    }
    select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 9px 10px;
      background: #fff;
      min-height: 40px;
    }
    button {
      border: 1px solid var(--accent);
      border-radius: 6px;
      padding: 9px 12px;
      background: var(--accent);
      color: #fff;
      cursor: pointer;
      min-height: 40px;
    }
    button:disabled {
      border-color: var(--line);
      background: #d7dde2;
      color: var(--muted);
      cursor: not-allowed;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .metric strong { display: block; font-size: 18px; }
    .meta, .empty { color: var(--muted); font-size: 13px; line-height: 1.5; }
    .notice { color: var(--danger); min-height: 20px; margin-top: 10px; }
    .list-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      margin-top: 12px;
    }
    .range-toolbar {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-top: 8px;
    }
    .pagination-toolbar {
      display: grid;
      grid-template-columns: minmax(80px, 1fr) minmax(100px, 1fr);
      gap: 8px;
      margin-top: 8px;
    }
    .pager-buttons {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-top: 8px;
    }
    .pager-buttons button {
      background: #fff;
      color: var(--accent);
    }
    .summary-list {
      display: grid;
      gap: 8px;
      margin-top: 10px;
    }
    .summary-row {
      width: 100%;
      text-align: left;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--text);
      display: grid;
      gap: 4px;
      min-height: 0;
    }
    .summary-row:hover { border-color: var(--accent); }
    .summary-row strong { font-size: 13px; }
    .pill {
      display: inline-block;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 1px 7px;
      margin-right: 4px;
      color: var(--muted);
      background: #f8fafb;
      font-size: 12px;
    }
    .filter-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
      margin-top: 8px;
      color: var(--muted);
      font-size: 13px;
    }
    .attachment-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 10px;
    }
    .file-card {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      background: #fbfcfd;
      min-width: 0;
    }
    .file-card strong, .mono {
      word-break: break-all;
      font-family: Consolas, "SFMono-Regular", monospace;
    }
    .missing {
      border: 1px solid var(--warn-line);
      background: var(--warn-bg);
      color: #9a3412;
    }
    .event-row {
      border-left: 3px solid var(--accent);
      padding-left: 10px;
      margin-bottom: 12px;
    }
    @media (max-width: 860px) {
      .console-shell { grid-template-columns: 1fr; }
      .query-panel { border-right: 0; border-bottom: 1px solid var(--line); }
      .summary { grid-template-columns: 1fr; }
      .range-toolbar { grid-template-columns: 1fr; }
      .pagination-toolbar { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="console-shell">
    <section class="query-panel">
      <h1>订单附件审计台</h1>
      <div class="toolbar">
        <input id="adminToken" type="password" aria-label="admin access token" title="粘贴 admin access token" />
        <input id="orderIdInput" type="text" aria-label="订单 ID" title="订单 ID" placeholder="order_..." />
        <button id="loadAudit">加载附件审计</button>
      </div>
      <div id="notice" class="notice"></div>
      <section class="card">
        <h2>附件审计检索</h2>
        <div class="list-toolbar">
          <input id="auditKeywordInput" type="text" aria-label="审计关键字" title="订单号、货物、地址、联系人关键字" placeholder="订单号 / 地址 / 货物" />
          <button id="loadAuditList">检索</button>
        </div>
        <div class="filter-toolbar">
          <select id="auditStatusInput" aria-label="订单状态" title="订单状态筛选">
            <option value="">全部订单状态</option>
            <option value="waiting">waiting</option>
            <option value="loading">loading</option>
            <option value="transporting">transporting</option>
            <option value="confirming">confirming</option>
            <option value="completed">completed</option>
            <option value="cancelled">cancelled</option>
          </select>
          <input id="auditShipperIdInput" type="text" aria-label="货主 ID" title="货主 ID 精确筛选" placeholder="shipperId 精确筛选" />
        </div>
        <div class="range-toolbar">
          <input id="auditCreatedFromInput" type="text" aria-label="创建时间起点" title="createdFromIso" placeholder="createdFromIso: 2026-07-01T00:00:00.000Z" />
          <input id="auditCreatedToInput" type="text" aria-label="创建时间终点" title="createdToIso" placeholder="createdToIso: 2026-07-07T23:59:59.999Z" />
        </div>
        <div class="filter-toolbar">
          <select id="auditMissingStateInput" aria-label="缺失引用状态" title="missingFileIds 筛选">
            <option value="">全部附件订单</option>
            <option value="true">只看 missingFileIds</option>
            <option value="false">只看无缺失引用</option>
          </select>
        </div>
        <div class="pagination-toolbar">
          <input id="auditPageInput" type="number" min="1" value="1" aria-label="审计列表页码" title="page" />
          <select id="auditPageSizeInput" aria-label="每页数量" title="pageSize">
            <option value="10">每页 10 条</option>
            <option value="20" selected>每页 20 条</option>
            <option value="50">每页 50 条</option>
          </select>
        </div>
        <div class="pager-buttons">
          <button id="auditPreviousPage" type="button" disabled>上一页</button>
          <button id="auditNextPage" type="button" disabled>下一页</button>
        </div>
        <div id="auditPaginationStatus" class="meta">尚未检索</div>
        <div id="auditSummaryList" class="summary-list"><div class="empty">可按订单号、货物、地址或联系人检索带附件订单。</div></div>
      </section>
      <section class="card">
        <h2>审计范围</h2>
        <div class="meta">读取订单主体货物图片、订单事件附件、文件元数据和 missingFileIds。当前页面只做第一片人工审计检索，不包含批量处理或完整权限矩阵。</div>
      </section>
    </section>
    <section class="audit-panel">
      <section id="summary" class="card">
        <h2>等待加载</h2>
        <div class="empty">请输入 admin token 和订单 ID。</div>
      </section>
      <section class="card">
        <h2>订单主体货物图片</h2>
        <div id="cargoAttachmentList" class="attachment-grid"><div class="empty">暂无货物图片附件</div></div>
      </section>
      <section class="card">
        <h2>订单事件附件</h2>
        <div id="eventAttachmentList"><div class="empty">暂无订单事件附件</div></div>
      </section>
    </section>
  </main>
  <script>
    const apiBase = '/api';
    const state = { audit: null, summaries: [] };

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

    function authHeaders() {
      const token = document.getElementById('adminToken').value.trim();
      if (!token) throw new Error('请先填写 admin access token');
      return { Authorization: 'Bearer ' + token };
    }

    function readAuditListPaging(pageOverride) {
      const pageInput = document.getElementById('auditPageInput');
      const pageSizeInput = document.getElementById('auditPageSizeInput');
      const page = Math.max(1, Number.parseInt(pageOverride ?? pageInput.value, 10) || 1);
      const rawPageSize = Number.parseInt(pageSizeInput.value, 10) || 20;
      const pageSize = [10, 20, 50].includes(rawPageSize) ? rawPageSize : 20;
      pageInput.value = String(page);
      pageSizeInput.value = String(pageSize);
      return { page, pageSize };
    }

    async function loadAudit() {
      try {
        setNotice('');
        const orderId = document.getElementById('orderIdInput').value.trim();
        if (!orderId) throw new Error('请填写订单 ID');
        const response = await fetch(apiBase + '/admin/orders/' + encodeURIComponent(orderId) + '/attachments', {
          headers: authHeaders()
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.code !== 'OK') throw new Error(body.message || body.code || '请求失败');
        state.audit = body.data;
        renderAudit();
      } catch (error) {
        setNotice(error.message);
      }
    }

    async function loadAuditList(pageOverride) {
      try {
        setNotice('');
        const keyword = document.getElementById('auditKeywordInput').value.trim();
        const status = document.getElementById('auditStatusInput').value;
        const shipperId = document.getElementById('auditShipperIdInput').value.trim();
        const createdFromIso = document.getElementById('auditCreatedFromInput').value.trim();
        const createdToIso = document.getElementById('auditCreatedToInput').value.trim();
        const missingState = document.getElementById('auditMissingStateInput').value;
        const { page, pageSize } = readAuditListPaging(pageOverride);
        const query = new URLSearchParams();
        query.set('page', String(page));
        query.set('pageSize', String(pageSize));
        if (keyword) query.set('keyword', keyword);
        if (status) query.set('status', status);
        if (shipperId) query.set('shipperId', shipperId);
        if (createdFromIso) query.set('createdFromIso', createdFromIso);
        if (createdToIso) query.set('createdToIso', createdToIso);
        if (missingState) query.set('hasMissingFiles', missingState);
        const response = await fetch(apiBase + '/admin/orders/attachments?' + query.toString(), {
          headers: authHeaders()
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.code !== 'OK') throw new Error(body.message || body.code || '请求失败');
        state.summaries = body.data.items || [];
        renderAuditSummaries(body.data);
        renderAuditPagination(body.data);
      } catch (error) {
        setNotice(error.message);
      }
    }

    function loadAdjacentAuditPage(delta) {
      const currentPage = Number.parseInt(document.getElementById('auditPageInput').value, 10) || 1;
      loadAuditList(Math.max(1, currentPage + delta));
    }

    function renderAudit() {
      renderSummary();
      renderFileGroup(document.getElementById('cargoAttachmentList'), state.audit.cargo);
      renderEvents();
    }

    function renderAuditSummaries(result) {
      const target = document.getElementById('auditSummaryList');
      if (!result.items.length) {
        target.innerHTML = '<div class="empty">没有匹配的带附件订单</div>';
        return;
      }
      target.innerHTML = result.items.map(item =>
        '<button class="summary-row" type="button" data-order-id="' + escapeHtml(item.orderId) + '">' +
          '<strong>' + escapeHtml(item.orderNo) + '</strong>' +
          '<span class="meta">状态：' + escapeHtml(item.status) + ' · 创建：' + escapeHtml(item.createdAtIso) + '</span>' +
          '<span class="meta">货主ID：<span class="mono">' + escapeHtml(item.shipperId) + '</span></span>' +
          '<span class="meta mono">' + escapeHtml(item.orderId) + '</span>' +
          '<span>' +
            '<span class="pill">主体 ' + escapeHtml(item.cargoFileCount) + '</span>' +
            '<span class="pill">事件 ' + escapeHtml(item.eventAttachmentFileCount) + '</span>' +
            '<span class="pill">已解析 ' + escapeHtml(item.resolvedFileCount) + '</span>' +
            '<span class="pill">缺失 ' + escapeHtml(item.missingFileIds.length) + '</span>' +
            '<span class="pill">' + (item.hasMissingFiles ? '有缺失引用' : '无缺失引用') + '</span>' +
          '</span>' +
        '</button>'
      ).join('');
      target.querySelectorAll('[data-order-id]').forEach(button => {
        button.addEventListener('click', () => {
          document.getElementById('orderIdInput').value = button.getAttribute('data-order-id');
          loadAudit();
        });
      });
    }

    function renderAuditPagination(result) {
      const page = result.page || 1;
      const pageSize = result.pageSize || 20;
      const total = result.total || 0;
      const loaded = result.items.length;
      document.getElementById('auditPageInput').value = String(page);
      document.getElementById('auditPageSizeInput').value = String(pageSize);
      document.getElementById('auditPaginationStatus').textContent =
        '第 ' + page + ' 页，每页 ' + pageSize + ' 条，本页 ' + loaded + ' 条，共 ' + total + ' 条';
      document.getElementById('auditPreviousPage').disabled = page <= 1;
      document.getElementById('auditNextPage').disabled = page * pageSize >= total;
    }

    function renderSummary() {
      const audit = state.audit;
      const cargoMissing = audit.cargo.missingFileIds.length;
      const eventMissing = audit.events.reduce((total, event) => total + event.missingFileIds.length, 0);
      document.getElementById('summary').innerHTML =
        '<h2>' + escapeHtml(audit.orderNo) + '</h2>' +
        '<div class="meta">订单ID：<span class="mono">' + escapeHtml(audit.orderId) + '</span><br>货主ID：<span class="mono">' + escapeHtml(audit.shipperId) + '</span></div>' +
        '<div class="summary">' +
          '<div class="card metric"><strong>' + audit.cargo.fileIds.length + '</strong><span class="meta">主体附件 ID</span></div>' +
          '<div class="card metric"><strong>' + audit.events.length + '</strong><span class="meta">带附件事件</span></div>' +
          '<div class="card metric missing"><strong>' + (cargoMissing + eventMissing) + '</strong><span>missingFileIds</span></div>' +
        '</div>';
    }

    function renderFileGroup(target, group) {
      const found = group.files.map(renderFileCard).join('');
      const missing = renderMissing(group.missingFileIds);
      target.innerHTML = found + missing || '<div class="empty">暂无附件</div>';
    }

    function renderFileCard(file) {
      return '<article class="file-card">' +
        '<strong>' + escapeHtml(file.id) + '</strong>' +
        '<div class="meta">owner：' + escapeHtml(file.ownerUserId) + '<br>purpose：' + escapeHtml(file.purpose) + '<br>status：' + escapeHtml(file.status) + '<br>objectKey：' + escapeHtml(file.objectKey) + '</div>' +
        (file.previewUrl ? '<a target="_blank" rel="noreferrer" href="' + escapeHtml(file.previewUrl) + '">打开预览</a>' : '<div class="meta">暂无预览链接</div>') +
        (file.previewExpiresAtIso ? '<div class="meta">previewExpiresAtIso：' + escapeHtml(file.previewExpiresAtIso) + '</div>' : '') +
      '</article>';
    }

    function renderMissing(missingFileIds) {
      if (!missingFileIds.length) return '';
      return missingFileIds.map(fileId =>
        '<article class="file-card missing"><strong>missingFileIds</strong><div class="mono">' + escapeHtml(fileId) + '</div></article>'
      ).join('');
    }

    function renderEvents() {
      const target = document.getElementById('eventAttachmentList');
      if (!state.audit.events.length) {
        target.innerHTML = '<div class="empty">暂无订单事件附件</div>';
        return;
      }
      target.innerHTML = state.audit.events.map(event =>
        '<section class="event-row">' +
          '<h3>' + escapeHtml(event.eventType) + ' · ' + escapeHtml(event.createdAtIso) + '</h3>' +
          '<div class="meta">事件ID：<span class="mono">' + escapeHtml(event.eventId) + '</span>' +
          (event.noteText ? '<br>备注：' + escapeHtml(event.noteText) : '') + '</div>' +
          '<div class="attachment-grid">' +
            event.files.map(renderFileCard).join('') +
            renderMissing(event.missingFileIds) +
          '</div>' +
        '</section>'
      ).join('');
    }

    document.getElementById('loadAudit').addEventListener('click', loadAudit);
    document.getElementById('loadAuditList').addEventListener('click', () => loadAuditList());
    document.getElementById('auditPreviousPage').addEventListener('click', () => loadAdjacentAuditPage(-1));
    document.getElementById('auditNextPage').addEventListener('click', () => loadAdjacentAuditPage(1));
  </script>
</body>
</html>`;
}
