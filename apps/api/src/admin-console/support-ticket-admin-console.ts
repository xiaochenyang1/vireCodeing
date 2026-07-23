import {
  renderAdminConsoleNav,
  renderAdminConsoleNavStyles,
} from './admin-console-nav-snippet';
import {
  renderAdminSessionControls,
  renderAdminSessionScript,
} from './admin-session-snippet';

export function renderSupportTicketAdminConsole() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>帮助中心工单台</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f4f6f8; color: #17202a; }
    .console-shell { display: grid; grid-template-columns: minmax(360px, 42%) 1fr; gap: 16px; padding: 16px; }
    .panel { background: #fff; border: 1px solid #d8dee4; border-radius: 12px; padding: 16px; }
    .filters { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    input, select, textarea, button { box-sizing: border-box; width: 100%; padding: 9px; margin: 4px 0; }
    textarea { min-height: 88px; resize: vertical; }
    button { cursor: pointer; background: #1769aa; color: #fff; border: 0; border-radius: 8px; }
    button:disabled { cursor: not-allowed; opacity: .55; }
    .session-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
    .session-link { color: #1769aa; font-size: 13px; font-weight: 600; text-decoration: none; }
    .secondary-button { width: auto; background: #fff; color: #1769aa; border: 1px solid #d8dee4; }
    .ticket-row { border-top: 1px solid #edf0f2; padding: 12px 0; cursor: pointer; }
    .ticket-row.active { background: #eff6ff; border-radius: 8px; padding: 12px; margin-top: 8px; }
    .muted { color: #667085; font-size: 13px; }
    .error { color: #b42318; white-space: pre-wrap; min-height: 20px; }
    .action { border-left: 3px solid #98a2b3; padding-left: 10px; margin: 10px 0; }
    .action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
    .badge { display: inline-flex; align-items: center; padding: 4px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .badge.pending { background: #fff4d6; color: #8f4b00; }
    .badge.processing { background: #e7f0fb; color: #145ea8; }
    .badge.resolved { background: #e8f7eb; color: #17663d; }
    ${renderAdminConsoleNavStyles()}
    @media (max-width: 820px) { .console-shell { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main class="console-shell">
    <section class="panel">
      <h1>帮助中心工单台</h1>
      <label>Admin access token<input id="adminToken" type="password" /></label>
      ${renderAdminSessionControls({
        currentRoute: '/api/admin/support-ticket-console',
      })}
      ${renderAdminConsoleNav({
        currentRoute: '/api/admin/support-ticket-console',
      })}
      <div class="filters">
        <label>状态<select id="supportTicketStatusInput"><option value="">全部</option><option value="pending">待受理</option><option value="processing">处理中</option><option value="resolved">已处理</option></select></label>
        <label>每页<input id="supportTicketPageSizeInput" type="number" value="20" min="1" max="50" /></label>
        <label style="grid-column: 1 / span 2;">工单号/货主/渠道/内容<input id="supportTicketKeywordInput" /></label>
      </div>
      <button id="loadSupportTicketsButton" onclick="loadSupportTickets(1)">查询工单</button>
      <div id="supportTicketListNotice" class="error"></div>
      <div id="supportTicketList"></div>
      <div class="filters"><button onclick="changeSupportTicketPage(-1)">上一页</button><button onclick="changeSupportTicketPage(1)">下一页</button></div>
    </section>
    <section class="panel">
      <h2>工单详情</h2>
      <div id="supportTicketDetail" class="muted">请选择工单</div>
      <label>处理说明<textarea id="supportTicketActionContent" placeholder="请输入 6-500 字处理说明"></textarea></label>
      <input id="supportTicketBaseUpdatedAtIso" type="hidden" />
      <div id="supportTicketActions"></div>
      <div id="supportTicketMutationNotice" class="error"></div>
    </section>
  </main>
  <script>
    const apiBase = '/api';
    let currentPage = 1;
    let total = 0;
    let selectedTicketId = '';
    let mutationPending = false;
    let latestSupportTicketRequestId = 0;
    let latestSupportTicketDetailRequestId = 0;
    ${renderAdminSessionScript({
      currentRoute: '/api/admin/support-ticket-console',
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

    function formatSupportTicketStatus(status) {
      if (status === 'pending') return '待受理';
      if (status === 'processing') return '处理中';
      if (status === 'resolved') return '已处理';
      return status || '-';
    }

    function formatSupportTicketStatusClass(status) {
      if (status === 'processing') return 'processing';
      if (status === 'resolved') return 'resolved';
      return 'pending';
    }

    function clearSupportTicketSelection() {
      selectedTicketId = '';
      document.getElementById('supportTicketBaseUpdatedAtIso').value = '';
      document.getElementById('supportTicketActions').innerHTML = '';
      document.getElementById('supportTicketDetail').textContent = '请选择工单';
      document.getElementById('supportTicketMutationNotice').textContent = '';
    }

    function readSupportTicketRouteState() {
      const query = new URLSearchParams(
        globalThis.location && typeof globalThis.location.search === 'string'
          ? location.search
          : '',
      );
      return {
        status: query.get('status') || '',
        keyword: query.get('keyword') || '',
        page: query.get('page') || '',
        pageSize: query.get('pageSize') || '',
      };
    }

    function applySupportTicketRouteState() {
      const routeState = readSupportTicketRouteState();
      document.getElementById('supportTicketStatusInput').value = routeState.status;
      document.getElementById('supportTicketKeywordInput').value = routeState.keyword;
      if (routeState.pageSize) {
        document.getElementById('supportTicketPageSizeInput').value = String(
          Math.min(50, Math.max(1, Number.parseInt(routeState.pageSize, 10) || 20)),
        );
      }
      if (routeState.page) {
        currentPage = Math.max(1, Number.parseInt(routeState.page, 10) || 1);
      }
      return routeState;
    }

    function syncSupportTicketRouteState(pageOverride) {
      if (!globalThis.history || !globalThis.location) {
        return;
      }

      const query = new URLSearchParams();
      const status = document.getElementById('supportTicketStatusInput').value;
      const keyword = document.getElementById('supportTicketKeywordInput').value.trim();
      const pageSize = Math.min(50, Math.max(1, Number.parseInt(document.getElementById('supportTicketPageSizeInput').value || '20', 10) || 20));
      const page = Math.max(1, Number.parseInt(pageOverride || currentPage || 1, 10) || 1);
      if (status) query.set('status', status);
      if (keyword) query.set('keyword', keyword);
      if (page > 1) query.set('page', String(page));
      if (pageSize !== 20) query.set('pageSize', String(pageSize));
      const nextQuery = query.toString();
      const nextPath = globalThis.location.pathname + (nextQuery ? '?' + nextQuery : '');
      globalThis.history.replaceState(null, '', nextPath);
    }

    function renderSupportTicketHistory(items) {
      if (!Array.isArray(items) || items.length === 0) {
        return '<p class="muted">暂无处理记录</p>';
      }

      return items.map(item => {
        const transitionText = item.fromStatus && item.toStatus
          ? ' · ' + escapeHtml(formatSupportTicketStatus(item.fromStatus)) + ' -> ' + escapeHtml(formatSupportTicketStatus(item.toStatus))
          : '';
        const operatorText = item.operatorUserId
          ? ' · 处理人：' + escapeHtml(item.operatorUserId)
          : '';
        const contentText = item.content
          ? '<div class="muted">' + escapeHtml(item.content) + '</div>'
          : '';

        return '<div class="action">' +
          '<strong>' + escapeHtml(item.actionText) + '</strong>' +
          '<div class="muted">' + escapeHtml(item.timestampIso) + transitionText + operatorText + '</div>' +
          contentText +
          '</div>';
      }).join('');
    }

    function renderSupportTicketActions(ticket) {
      const actions = [];
      if (ticket.status === 'pending') {
        actions.push('<button id="processSupportTicketButton" onclick="mutateSupportTicket(\\'process\\')"' + (mutationPending ? ' disabled' : '') + '>客服受理</button>');
      }
      if (ticket.status === 'processing') {
        actions.push('<button id="resolveSupportTicketButton" onclick="mutateSupportTicket(\\'resolve\\')"' + (mutationPending ? ' disabled' : '') + '>处理完成</button>');
      }
      if (actions.length === 0) {
        return '<p class="muted">当前工单已处理完成，无可执行动作。</p>';
      }
      return '<div class="action-grid">' + actions.join('') + '</div>';
    }

    function renderSupportTicketDetail(ticket) {
      selectedTicketId = ticket.id;
      document.getElementById('supportTicketBaseUpdatedAtIso').value = ticket.updatedAtIso || '';
      document.getElementById('supportTicketDetail').innerHTML = [
        '<div><span class="badge ' + escapeHtml(formatSupportTicketStatusClass(ticket.status)) + '">' + escapeHtml(formatSupportTicketStatus(ticket.status)) + '</span></div>',
        '<p>工单 ID：' + escapeHtml(ticket.id) + '</p>',
        '<p>货主 ID：' + escapeHtml(ticket.shipperId) + '</p>',
        '<p>服务渠道：' + escapeHtml(ticket.channelName) + '</p>',
        '<p>问题说明：' + escapeHtml(ticket.description) + '</p>',
        '<p>创建时间：' + escapeHtml(ticket.createdAtIso) + '</p>',
        '<p>更新时间：' + escapeHtml(ticket.updatedAtIso) + '</p>',
        '<h3>处理记录</h3>',
        renderSupportTicketHistory(ticket.statusHistory),
      ].join('');
      document.getElementById('supportTicketActions').innerHTML = renderSupportTicketActions(ticket);
    }

    function renderSupportTicketList(items) {
      const list = document.getElementById('supportTicketList');
      if (!Array.isArray(items) || items.length === 0) {
        list.innerHTML = '<p class="muted">暂无工单</p>';
        return;
      }

      list.innerHTML = items.map(ticket => {
        const activeClass = ticket.id === selectedTicketId ? ' active' : '';
        return '<div class="ticket-row' + activeClass + '" onclick="loadSupportTicketDetail(\\'' + encodeURIComponent(ticket.id) + '\\')">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">' +
            '<div>' +
              '<strong>' + escapeHtml(ticket.channelName) + '</strong>' +
              '<div class="muted">工单：' + escapeHtml(ticket.id) + '</div>' +
              '<div class="muted">货主：' + escapeHtml(ticket.shipperId) + '</div>' +
            '</div>' +
            '<span class="badge ' + escapeHtml(formatSupportTicketStatusClass(ticket.status)) + '">' + escapeHtml(formatSupportTicketStatus(ticket.status)) + '</span>' +
          '</div>' +
          '<div class="muted" style="margin-top:6px;">' + escapeHtml(ticket.description) + '</div>' +
          '<div class="muted" style="margin-top:6px;">更新时间：' + escapeHtml(ticket.updatedAtIso || ticket.createdAtIso || '-') + '</div>' +
        '</div>';
      }).join('');
    }

    async function loadSupportTickets(page) {
      currentPage = Math.max(1, Number.parseInt(page || 1, 10) || 1);
      syncSupportTicketRouteState(currentPage);
      const requestId = ++latestSupportTicketRequestId;
      document.getElementById('supportTicketListNotice').textContent = '加载中...';
      document.getElementById('supportTicketMutationNotice').textContent = '';

      const query = new URLSearchParams();
      const status = document.getElementById('supportTicketStatusInput').value;
      const keyword = document.getElementById('supportTicketKeywordInput').value.trim();
      const pageSize = Math.min(50, Math.max(1, Number.parseInt(document.getElementById('supportTicketPageSizeInput').value || '20', 10) || 20));
      query.set('page', String(currentPage));
      query.set('pageSize', String(pageSize));
      if (status) query.set('status', status);
      if (keyword) query.set('keyword', keyword);

      try {
        const data = await api('/admin/support-tickets?' + query.toString());
        if (requestId !== latestSupportTicketRequestId) return;
        total = Number.isInteger(data.total) ? data.total : 0;
        renderSupportTicketList(Array.isArray(data.items) ? data.items : []);
        const loadedCount = Array.isArray(data.items) ? data.items.length : 0;
        document.getElementById('supportTicketListNotice').textContent = '当前已加载 ' + loadedCount + ' 条，共 ' + total + ' 条';
      } catch (error) {
        if (requestId !== latestSupportTicketRequestId) return;
        document.getElementById('supportTicketList').innerHTML = '<p class="muted">暂无工单</p>';
        document.getElementById('supportTicketListNotice').textContent = error.message || '查询工单失败';
        clearSupportTicketSelection();
      }
    }

    async function loadSupportTicketDetail(encodedTicketId) {
      const ticketId = decodeURIComponent(encodedTicketId);
      selectedTicketId = ticketId;
      const requestId = ++latestSupportTicketDetailRequestId;
      document.getElementById('supportTicketDetail').textContent = '工单详情加载中...';
      document.getElementById('supportTicketMutationNotice').textContent = '';

      try {
        const ticket = await api('/admin/support-tickets/' + encodeURIComponent(ticketId));
        if (requestId !== latestSupportTicketDetailRequestId) return;
        renderSupportTicketDetail(ticket);
        renderSupportTicketListFromSelection();
      } catch (error) {
        if (requestId !== latestSupportTicketDetailRequestId) return;
        clearSupportTicketSelection();
        document.getElementById('supportTicketListNotice').textContent = error.message || '读取工单详情失败';
      }
    }

    function renderSupportTicketListFromSelection() {
      const list = document.getElementById('supportTicketList');
      if (!list.innerHTML) {
        return;
      }
      loadSupportTickets(currentPage);
    }

    async function mutateSupportTicket(action) {
      if (!selectedTicketId) {
        document.getElementById('supportTicketMutationNotice').textContent = '请选择工单';
        return;
      }
      if (mutationPending) {
        return;
      }
      const content = document.getElementById('supportTicketActionContent').value.trim();
      if (content.length < 6) {
        document.getElementById('supportTicketMutationNotice').textContent = '处理说明至少 6 个字';
        return;
      }
      const baseUpdatedAtIso = document.getElementById('supportTicketBaseUpdatedAtIso').value;
      if (!baseUpdatedAtIso) {
        document.getElementById('supportTicketMutationNotice').textContent = '当前工单缺少版本时间，请刷新后重试';
        return;
      }

      mutationPending = true;
      document.getElementById('supportTicketMutationNotice').textContent = '';
      document.getElementById('supportTicketActions').innerHTML = renderSupportTicketActions({
        id: selectedTicketId,
        status: action === 'process' ? 'pending' : 'processing',
      });

      const path = action === 'process' ? '/process' : '/resolve';

      try {
        const ticket = await api('/admin/support-tickets/' + encodeURIComponent(selectedTicketId) + path, {
          method: 'POST',
          body: JSON.stringify({
            baseUpdatedAtIso,
            content,
          }),
        });
        renderSupportTicketDetail(ticket);
        document.getElementById('supportTicketMutationNotice').textContent =
          action === 'process'
            ? '工单已更新为处理中'
            : '工单已更新为已处理';
        document.getElementById('supportTicketActionContent').value = '';
        loadSupportTickets(currentPage);
      } catch (error) {
        document.getElementById('supportTicketMutationNotice').textContent =
          error.message || '更新工单失败';
        if (selectedTicketId) {
          loadSupportTicketDetail(encodeURIComponent(selectedTicketId));
        }
      } finally {
        mutationPending = false;
      }
    }

    function changeSupportTicketPage(delta) {
      const pageSize = Math.min(50, Math.max(1, Number.parseInt(document.getElementById('supportTicketPageSizeInput').value || '20', 10) || 20));
      const maxPage = Math.max(1, Math.ceil(total / pageSize));
      const nextPage = Math.min(maxPage, Math.max(1, currentPage + delta));
      if (nextPage === currentPage) {
        return;
      }
      loadSupportTickets(nextPage);
    }

    applySupportTicketRouteState();
    loadSupportTickets(currentPage);
  </script>
</body>
</html>`;
}
