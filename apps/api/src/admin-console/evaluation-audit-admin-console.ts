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
    .filters-wide { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; }
    input, select, button { box-sizing: border-box; width: 100%; padding: 9px; margin: 4px 0; }
    button { cursor: pointer; background: #1769aa; color: #fff; border: 0; border-radius: 8px; }
    button:disabled { cursor: not-allowed; opacity: .55; }
    .session-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
    .session-link { color: #1769aa; font-size: 13px; font-weight: 600; text-decoration: none; }
    .secondary-button { width: auto; background: #fff; color: #1769aa; border: 1px solid #d8dee4; }
    .audit-row { border-top: 1px solid #edf0f2; padding: 12px 0; cursor: pointer; }
    .audit-row.selected { background: #eef6ff; }
    .muted { color: #667085; font-size: 13px; }
    .error { color: #b42318; white-space: pre-wrap; }
    .tag-list { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
    .tag { background: #eef2f6; border-radius: 999px; padding: 4px 10px; font-size: 12px; }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .detail-card { border: 1px solid #edf0f2; border-radius: 10px; padding: 12px; margin-top: 12px; }
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
      <p class="muted">只读查看评价审计记录第一片。现在能筛评价方向、评分和关键字，还不支持评价审核、申诉处理或信用分处置。</p>
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
      </div>
      <div class="filters">
        <label>每页<input id="auditPageSizeInput" type="number" min="1" max="50" value="20" /></label>
        <label>&nbsp;<button id="loadAuditButton" onclick="loadAudits(1)">查询评价</button></label>
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
      <div id="auditPhotoPanel" class="detail-card" hidden>
        <strong>图片文件</strong>
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
    let latestAuditRequestId = 0;
    ${renderAdminSessionScript({
      currentRoute: '/api/admin/evaluation-audit-console',
    })}

    function token() {
      const value = document.getElementById('adminToken').value.trim();
      if (!value) throw new Error('请先填写 admin access token');
      persistAdminAccessToken();
      return value;
    }

    async function api(path) {
      const response = await fetch(apiBase + path, {
        headers: {
          Authorization: 'Bearer ' + token(),
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

    async function loadAudits(page) {
      const requestId = ++latestAuditRequestId;
      const requestedPage = Math.max(1, page);
      try {
        const pageSize = document.getElementById('auditPageSizeInput').value || '20';
        const query = new URLSearchParams({
          page: String(requestedPage),
          pageSize: String(pageSize),
        });
        const direction = document.getElementById('auditDirectionInput').value;
        const rating = document.getElementById('auditRatingInput').value;
        const keyword = document.getElementById('auditKeywordInput').value.trim();
        if (direction) query.set('direction', direction);
        if (rating) query.set('rating', rating);
        if (keyword) query.set('keyword', keyword);
        const result = await api('/admin/evaluations?' + query.toString());
        if (requestId !== latestAuditRequestId) return;
        currentPage = requestedPage;
        total = result.total;
        currentItems = result.items || [];
        document.getElementById('auditListNotice').textContent = '';
        renderAuditPagination(pageSize);
        renderAuditList();
        const nextSelectedId = currentItems.some(item => item.id === selectedAuditId)
          ? selectedAuditId
          : currentItems[0]?.id;
        if (nextSelectedId) {
          selectAudit(nextSelectedId);
        } else {
          selectedAuditId = '';
          document.getElementById('auditDetail').innerHTML = '<p class="muted">当前筛选条件下暂无评价记录</p>';
          document.getElementById('auditTags').innerHTML = '';
          document.getElementById('auditPhotoList').innerHTML = '';
          document.getElementById('auditPhotoPanel').hidden = true;
        }
      } catch (error) {
        if (requestId !== latestAuditRequestId) return;
        currentPage = requestedPage;
        clearAuditResults();
        document.getElementById('auditListNotice').textContent = error.message;
      }
    }

    function clearAuditResults() {
      total = 0;
      currentItems = [];
      selectedAuditId = '';
      document.getElementById('auditPaginationStatus').textContent = '评价记录加载失败';
      document.getElementById('auditList').innerHTML = '';
      document.getElementById('auditPreviousPage').disabled = true;
      document.getElementById('auditNextPage').disabled = true;
      document.getElementById('auditDetail').innerHTML = '<p class="muted">暂无可展示的评价详情</p>';
      document.getElementById('auditTags').innerHTML = '';
      document.getElementById('auditPhotoList').innerHTML = '';
      document.getElementById('auditPhotoPanel').hidden = true;
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
        ? currentItems.map(item => '<div class="audit-row' + (item.id === selectedAuditId ? ' selected' : '') + '" data-audit-id="' + escapeHtml(item.id) + '" onclick="selectAudit(this.dataset.auditId)"><strong>' + escapeHtml(item.orderNo) + '</strong> · ' + escapeHtml(formatDirection(item.direction)) + '<div>' + escapeHtml(item.reviewerName) + ' → ' + escapeHtml(item.revieweeName) + '</div><div class="muted">' + escapeHtml(formatRating(item.rating)) + ' · ' + escapeHtml(item.submittedAtIso) + '</div></div>').join('')
        : '<p class="muted">暂无评价记录</p>';
    }

    function changeAuditPage(offset) {
      const pageSize = Number(document.getElementById('auditPageSizeInput').value || 20);
      const maxPage = Math.max(1, Math.ceil(total / pageSize));
      loadAudits(Math.min(maxPage, Math.max(1, currentPage + offset)));
    }

    function selectAudit(auditId) {
      selectedAuditId = auditId;
      renderAuditList();
      const item = currentItems.find(candidate => candidate.id === auditId);
      if (!item) return;
      document.getElementById('auditDetail').innerHTML =
        '<div class="detail-grid">' +
          '<div class="detail-card"><strong>订单</strong><div>' + escapeHtml(item.orderNo) + '</div><div class="muted">' + escapeHtml(item.orderId) + '</div></div>' +
          '<div class="detail-card"><strong>方向</strong><div>' + escapeHtml(formatDirection(item.direction)) + '</div><div class="muted">' + escapeHtml(formatRating(item.rating)) + ' · ' + escapeHtml(item.anonymous ? '匿名评价' : '实名评价') + '</div></div>' +
          '<div class="detail-card"><strong>评价人</strong><div>' + escapeHtml(item.reviewerName) + '</div><div class="muted">' + escapeHtml(item.reviewerUserId) + '</div></div>' +
          '<div class="detail-card"><strong>被评价人</strong><div>' + escapeHtml(item.revieweeName) + '</div><div class="muted">' + escapeHtml(item.revieweeUserId) + '</div></div>' +
        '</div>' +
        '<div class="detail-card"><strong>评价内容</strong><p>' + escapeHtml(item.content) + '</p><div class="muted">提交时间：' + escapeHtml(item.submittedAtIso) + '</div></div>';
      document.getElementById('auditTags').innerHTML = (item.tags || []).map(tag => '<span class="tag">' + escapeHtml(tag) + '</span>').join('');
      const photoFileIds = Array.isArray(item.photoFileIds) ? item.photoFileIds : [];
      document.getElementById('auditPhotoList').innerHTML = photoFileIds.length
        ? photoFileIds.map(fileId => '<li>' + escapeHtml(fileId) + '</li>').join('')
        : '<li>无图片文件</li>';
      document.getElementById('auditPhotoPanel').hidden = item.photoCount === 0 && photoFileIds.length === 0;
    }

    initializeAdminSession();
  </script>
</body>
</html>`;
}
