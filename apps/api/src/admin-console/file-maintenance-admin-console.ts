import {
  renderAdminConsoleNav,
  renderAdminConsoleNavStyles,
} from './admin-console-nav-snippet';
import {
  renderAdminSessionControls,
  renderAdminSessionScript,
} from './admin-session-snippet';

export function renderFileMaintenanceAdminConsole() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>文件维护台</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f4f6f8; color: #17202a; }
    .console-shell { display: grid; grid-template-columns: minmax(360px, 420px) 1fr; gap: 16px; padding: 16px; }
    .panel { background: #fff; border: 1px solid #d8dee4; border-radius: 12px; padding: 16px; }
    .panel + .panel { margin-top: 16px; }
    .toolbar { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
    .summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
    .summary-card, .result-card, .file-card { border: 1px solid #edf0f2; border-radius: 10px; padding: 12px; background: #fff; }
    .summary-card strong { display: block; margin-top: 6px; font-size: 24px; }
    .muted { color: #667085; font-size: 13px; line-height: 1.7; }
    .error { color: #b42318; white-space: pre-wrap; min-height: 20px; }
    .session-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 10px; }
    .session-link { color: #1769aa; font-size: 13px; font-weight: 600; text-decoration: none; }
    .secondary-button { width: auto; background: #fff; color: #1769aa; border: 1px solid #d8dee4; }
    .status-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
    .status-chip { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 4px 8px; background: #eef2f6; font-size: 12px; font-weight: 600; }
    .status-chip.warning { background: #fff0d6; color: #8f4b00; }
    .status-chip.positive { background: #e8f7eb; color: #17663d; }
    .status-chip.neutral { background: #eef2f6; color: #344054; }
    label { display: block; color: #667085; font-size: 13px; }
    input, select, button { box-sizing: border-box; width: 100%; padding: 9px; margin: 4px 0; font: inherit; }
    select, input { border: 1px solid #d8dee4; border-radius: 8px; background: #fff; }
    button { cursor: pointer; background: #1769aa; color: #fff; border: 0; border-radius: 8px; }
    button:disabled { cursor: not-allowed; opacity: .55; }
    .ghost-button { background: #fff; color: #1769aa; border: 1px solid #d8dee4; }
    .list { margin: 12px 0 0; padding-left: 18px; }
    .list li + li { margin-top: 8px; }
    .nav-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
    .nav-link { color: #1769aa; font-size: 13px; font-weight: 600; text-decoration: none; }
    .filter-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
    .page-grid { display: grid; grid-template-columns: minmax(90px, 1fr) minmax(120px, 1fr); gap: 8px; margin-top: 8px; }
    .selection-grid { display: grid; grid-template-columns: minmax(160px, 1fr) 1fr; gap: 8px; margin-top: 12px; align-items: end; }
    .selection-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
    .selection-summary { min-height: 20px; }
    .report-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
    .report-list { display: grid; gap: 10px; margin-top: 12px; }
    .report-metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
    .file-list { display: grid; gap: 10px; margin-top: 12px; }
    .file-card { background: #fbfcfd; }
    .file-card-top { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .file-card-top-left { display: grid; gap: 8px; }
    .badge-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .file-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
    .mono { font-family: Consolas, "SFMono-Regular", monospace; word-break: break-all; }
    .pagination-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
    .pagination-status { margin-top: 10px; min-height: 20px; }
    .checkbox-chip { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; border: 1px solid #d8dee4; padding: 6px 10px; background: #fff; color: #344054; font-size: 12px; font-weight: 600; }
    .checkbox-chip input { width: auto; margin: 0; padding: 0; }
    ${renderAdminConsoleNavStyles()}
    @media (max-width: 980px) {
      .console-shell,
      .toolbar,
      .summary-grid,
      .status-grid,
      .filter-grid,
      .page-grid,
      .selection-grid,
      .selection-actions,
      .report-grid,
      .report-metric-grid,
      .file-meta,
      .pagination-row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="console-shell">
    <section>
      <div class="panel">
        <h1>文件维护台</h1>
        <p class="muted">这页专门盯文件积压和清理动作，不跟你玩花里胡哨。现在既能看摘要和审计报表，也能按状态、用途、owner 和关键字筛分页文件列表，还能勾选结果直接做批量治理；真实对象存储联调、病毒扫描和深度对账还没补完，别把扫帚当保洁公司。</p>
        <label>Admin access token<input id="adminToken" type="password" /></label>
        ${renderAdminSessionControls({
          currentRoute: '/api/admin/file-maintenance-console',
        })}
        ${renderAdminConsoleNav({
          currentRoute: '/api/admin/file-maintenance-console',
        })}
        <div class="toolbar">
          <button id="loadSummaryButton" onclick="loadFileMaintenanceSummary()">刷新摘要</button>
          <button id="rejectExpiredPendingButton" onclick="rejectExpiredPendingFiles()">驳回过期 pending</button>
          <button id="deleteRejectedObjectsButton" onclick="deleteRejectedObjects()">重试删除 rejected 对象</button>
        </div>
        <div id="fileMaintenanceNotice" class="error"></div>
        <div id="summaryTimestamp" class="muted">尚未加载文件维护摘要。</div>
        <div id="summaryCards" class="summary-grid"></div>
        <div class="nav-row">
          <a class="nav-link" href="/api/admin/console">返回运营后台工具台</a>
          <a class="nav-link" href="/api/admin/order-attachment-console">订单附件审计台</a>
        </div>
      </div>

      <div class="panel">
        <h2>维护判断</h2>
        <ul class="list muted">
          <li>先看 <code>expiredPendingCount</code> 和 <code>rejectedCount</code>，别一上来就瞎点删除。</li>
          <li><code>reject-expired-pending</code> 会把过期 pending 改成 rejected，并顺手 best-effort 删 provider 对象。</li>
          <li><code>delete-rejected-objects</code> 只重试删 rejected 对象，不会把业务记录抹掉，别自己脑补成核弹按钮。</li>
          <li><code>batch-governance</code> 能对选中的记录做批量驳回或批量对象删除，第一片先给运营一个真能下手的扫把。</li>
          <li>审计报表这片现在先给用途分布和 owner 热点，真要做更深一层的对象存储对账、病毒扫描和全链路审计，后面还有大坑，别急着吹成全自动治理中心。</li>
        </ul>
      </div>
    </section>

    <section>
      <div class="panel">
        <h2>动作结果</h2>
        <div class="status-grid">
          <div class="result-card">
            <strong>过期 pending 驳回结果</strong>
            <div id="rejectExpiredPendingResult" class="muted">尚未执行。</div>
          </div>
          <div class="result-card">
            <strong>rejected 对象删除结果</strong>
            <div id="deleteRejectedObjectsResult" class="muted">尚未执行。</div>
          </div>
          <div class="result-card">
            <strong>批量治理结果</strong>
            <div id="maintenanceBatchGovernanceResult" class="muted">尚未执行。</div>
          </div>
        </div>
      </div>

      <div class="panel">
        <h2>审计报表</h2>
        <p class="muted">先看报表摸清垃圾堆在哪，再缩小范围处理，不然一屏全是 objectKey，眼睛都得抽筋。</p>
        <div class="page-grid">
          <label>Owner 热点条数<input id="maintenanceTopOwnersLimitInput" type="number" min="1" max="20" value="5" /></label>
          <div>
            <button id="loadMaintenanceReportButton" type="button" onclick="loadMaintenanceReport()">刷新审计报表</button>
          </div>
        </div>
        <div id="maintenanceReportTimestamp" class="muted">尚未加载文件维护审计报表。</div>
        <div>
          <strong>用途分布</strong>
          <div id="maintenancePurposeReport" class="report-grid">
            <div class="result-card muted">先加载审计报表，再看用途分布。</div>
          </div>
        </div>
        <div style="margin-top: 12px;">
          <strong>Owner 热点</strong>
          <div id="maintenanceOwnerReport" class="report-list">
            <div class="result-card muted">先加载审计报表，再看 owner 热点。</div>
          </div>
        </div>
      </div>

      <div class="panel">
        <h2>文件检索</h2>
        <p class="muted">先缩小范围再处理，不然一屏全是 objectKey，眼睛都得抽筋。</p>
        <div class="filter-grid">
          <label>状态
            <select id="maintenanceStatusInput">
              <option value="">全部状态</option>
              <option value="pending">pending</option>
              <option value="uploaded">uploaded</option>
              <option value="rejected">rejected</option>
            </select>
          </label>
          <label>用途
            <select id="maintenancePurposeInput">
              <option value="">全部用途</option>
              <option value="identity">identity</option>
              <option value="cargo">cargo</option>
              <option value="exception">exception</option>
              <option value="evaluation">evaluation</option>
              <option value="receipt">receipt</option>
              <option value="invoice">invoice</option>
            </select>
          </label>
          <label>Owner User ID<input id="maintenanceOwnerUserIdInput" type="text" placeholder="user-1 / driver-1" /></label>
          <label>关键字<input id="maintenanceKeywordInput" type="text" placeholder="fileId / objectKey / publicUrl" /></label>
        </div>
        <div class="page-grid">
          <label>页码<input id="maintenancePageInput" type="number" min="1" value="1" /></label>
          <label>每页数量
            <select id="maintenancePageSizeInput">
              <option value="10">每页 10 条</option>
              <option value="20" selected>每页 20 条</option>
              <option value="50">每页 50 条</option>
            </select>
          </label>
        </div>
        <div class="selection-grid">
          <label>批量动作
            <select id="maintenanceBatchActionInput">
              <option value="reject_pending">reject_pending</option>
              <option value="delete_rejected_objects">delete_rejected_objects</option>
            </select>
          </label>
          <div>
            <div id="maintenanceSelectionStatus" class="muted selection-summary">尚未选中文件记录。</div>
            <div class="selection-actions">
              <button id="selectCurrentMaintenancePageButton" class="ghost-button" type="button" onclick="selectCurrentMaintenancePage()">全选当前页</button>
              <button id="clearMaintenanceSelectionButton" class="ghost-button" type="button" onclick="clearMaintenanceSelection()">清空选择</button>
              <button id="runMaintenanceBatchGovernanceButton" type="button" onclick="runMaintenanceBatchGovernance()">执行批量治理</button>
            </div>
          </div>
        </div>
        <div class="toolbar">
          <button id="loadMaintenanceFilesButton" onclick="loadMaintenanceFiles()">检索文件记录</button>
          <button id="maintenancePreviousPage" class="ghost-button" type="button" onclick="loadAdjacentMaintenancePage(-1)" disabled>上一页</button>
          <button id="maintenanceNextPage" class="ghost-button" type="button" onclick="loadAdjacentMaintenancePage(1)" disabled>下一页</button>
        </div>
        <div id="maintenancePaginationStatus" class="muted pagination-status">尚未检索</div>
        <div id="maintenanceFileList" class="file-list"><div class="result-card muted">填 token 后可按状态、用途、owner 和关键字筛文件记录。</div></div>
      </div>
    </section>
  </main>

  <script>
    const apiBase = '/api';
    let latestSummaryRequestId = 0;
    let latestReportRequestId = 0;
    let latestFilesRequestId = 0;
    let maintenanceMutationPending = false;
    const selectedMaintenanceFileIds = new Set();
    let maintenanceCurrentPageFileIds = [];
    ${renderAdminSessionScript({
      currentRoute: '/api/admin/file-maintenance-console',
    })}

    function token() {
      const value = document.getElementById('adminToken').value.trim();
      if (!value) {
        throw new Error('请先填写 admin access token');
      }
      persistAdminAccessToken();
      return value;
    }

    async function api(path, options = {}) {
      const response = await fetch(apiBase + path, {
        ...options,
        headers: {
          Authorization: 'Bearer ' + token(),
          ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...(options.headers || {}),
        },
      });
      const text = await response.text();
      const body = text ? JSON.parse(text) : {};
      if (!response.ok) {
        const error = new Error(body.message || '请求失败');
        error.code = body.code;
        throw error;
      }
      if (!body || body.code !== 'OK' || !Object.prototype.hasOwnProperty.call(body, 'data')) {
        throw new Error('接口成功响应格式不对');
      }
      return body.data;
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    }

    function formatCount(value) {
      return Number(value || 0).toLocaleString('zh-CN');
    }

    function formatByteSize(value) {
      const numericValue = Number(value || 0);
      if (numericValue < 1024) {
        return numericValue + ' B';
      }
      if (numericValue < 1024 * 1024) {
        return (numericValue / 1024).toFixed(1) + ' KB';
      }
      return (numericValue / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function setNotice(message) {
      document.getElementById('fileMaintenanceNotice').textContent = message || '';
    }

    function setActionDisabled(disabled) {
      document.getElementById('rejectExpiredPendingButton').disabled = disabled;
      document.getElementById('deleteRejectedObjectsButton').disabled = disabled;
      document.getElementById('maintenanceBatchActionInput').disabled = disabled;
      updateMaintenanceSelectionStatus();
    }

    function updateMaintenanceSelectionStatus() {
      const selectedCount = selectedMaintenanceFileIds.size;
      const currentPageCount = maintenanceCurrentPageFileIds.length;
      const message = selectedCount > 0
        ? '已选中 ' + selectedCount + ' 条文件记录。当前页 ' + currentPageCount + ' 条，可直接做批量治理。'
        : (currentPageCount > 0
          ? '当前页 ' + currentPageCount + ' 条，先勾上要处理的文件。'
          : '尚未选中文件记录。');

      document.getElementById('maintenanceSelectionStatus').textContent = message;
      document.getElementById('runMaintenanceBatchGovernanceButton').disabled =
        maintenanceMutationPending || selectedCount === 0;
      document.getElementById('clearMaintenanceSelectionButton').disabled =
        maintenanceMutationPending || selectedCount === 0;
      document.getElementById('selectCurrentMaintenancePageButton').disabled =
        maintenanceMutationPending || currentPageCount === 0;
    }

    function syncMaintenanceSelectionCheckboxes() {
      document.querySelectorAll('[data-maintenance-file-id]').forEach(input => {
        const fileId = input.getAttribute('data-maintenance-file-id');
        input.checked = Boolean(fileId && selectedMaintenanceFileIds.has(fileId));
      });
    }

    function toggleMaintenanceFileSelection(fileId, checked) {
      if (checked) {
        selectedMaintenanceFileIds.add(fileId);
      } else {
        selectedMaintenanceFileIds.delete(fileId);
      }
      updateMaintenanceSelectionStatus();
    }

    function selectCurrentMaintenancePage() {
      maintenanceCurrentPageFileIds.forEach(fileId => selectedMaintenanceFileIds.add(fileId));
      syncMaintenanceSelectionCheckboxes();
      updateMaintenanceSelectionStatus();
    }

    function clearMaintenanceSelection() {
      selectedMaintenanceFileIds.clear();
      syncMaintenanceSelectionCheckboxes();
      updateMaintenanceSelectionStatus();
    }

    function toneClass(value) {
      return Number(value || 0) > 0 ? 'warning' : 'positive';
    }

    function renderSummary(summary) {
      const cards = [
        {
          label: '文件总数',
          value: summary.totalCount,
          detail: '当前库里的 file records 总量',
          tone: 'status-chip neutral',
        },
        {
          label: 'pending',
          value: summary.pendingCount,
          detail: '还没完成上传或还没被清理的文件',
          tone: 'status-chip neutral',
        },
        {
          label: 'uploaded',
          value: summary.uploadedCount,
          detail: '已确认上传完成的文件',
          tone: 'status-chip positive',
        },
        {
          label: 'rejected',
          value: summary.rejectedCount,
          detail: '已驳回、等待对象删除重试的文件',
          tone: 'status-chip ' + toneClass(summary.rejectedCount),
        },
        {
          label: '过期 pending',
          value: summary.expiredPendingCount,
          detail: '早该扫掉的挂起上传',
          tone: 'status-chip ' + toneClass(summary.expiredPendingCount),
        },
      ];
      document.getElementById('summaryCards').innerHTML = cards.map(card =>
        '<div class="summary-card">' +
          '<span class="' + escapeHtml(card.tone) + '">' + escapeHtml(card.label) + '</span>' +
          '<strong>' + escapeHtml(formatCount(card.value)) + '</strong>' +
          '<div class="muted">' + escapeHtml(card.detail) + '</div>' +
        '</div>'
      ).join('');
      document.getElementById('summaryTimestamp').textContent =
        '上传过期判定 cutoff：' + escapeHtml(summary.cutoffIso || '-');
    }

    function renderRejectExpiredPendingResult(result) {
      document.getElementById('rejectExpiredPendingResult').innerHTML =
        '<div class="muted">cutoffIso：' + escapeHtml(result.cutoffIso || '-') + '</div>' +
        '<div class="muted">rejectedCount：' + escapeHtml(formatCount(result.rejectedCount)) + '</div>' +
        '<div class="muted">deletedObjectCount：' + escapeHtml(formatCount(result.deletedObjectCount)) + '</div>' +
        '<div class="muted">failedObjectDeletionCount：' + escapeHtml(formatCount(result.failedObjectDeletionCount)) + '</div>';
    }

    function renderDeleteRejectedObjectsResult(result) {
      document.getElementById('deleteRejectedObjectsResult').innerHTML =
        '<div class="muted">attemptedObjectCount：' + escapeHtml(formatCount(result.attemptedObjectCount)) + '</div>' +
        '<div class="muted">deletedObjectCount：' + escapeHtml(formatCount(result.deletedObjectCount)) + '</div>' +
        '<div class="muted">failedObjectDeletionCount：' + escapeHtml(formatCount(result.failedObjectDeletionCount)) + '</div>';
    }

    function renderMaintenanceBatchGovernanceResult(result) {
      const skippedFileIds = Array.isArray(result.skippedFileIds) ? result.skippedFileIds : [];
      const missingCount = Math.max(
        0,
        Number(result.requestedCount || 0) - Number(result.matchedCount || 0),
      );

      document.getElementById('maintenanceBatchGovernanceResult').innerHTML =
        '<div class="muted">action：' + escapeHtml(result.action || '-') + '</div>' +
        '<div class="muted">requestedCount：' + escapeHtml(formatCount(result.requestedCount)) + '</div>' +
        '<div class="muted">matchedCount：' + escapeHtml(formatCount(result.matchedCount)) + '</div>' +
        '<div class="muted">processedCount：' + escapeHtml(formatCount(result.processedCount)) + '</div>' +
        '<div class="muted">missingCount：' + escapeHtml(formatCount(missingCount)) + '</div>' +
        '<div class="muted">deletedObjectCount：' + escapeHtml(formatCount(result.deletedObjectCount)) + '</div>' +
        '<div class="muted">failedObjectDeletionCount：' + escapeHtml(formatCount(result.failedObjectDeletionCount)) + '</div>' +
        '<div class="muted">skippedFileIds：' + escapeHtml(skippedFileIds.join(', ') || '-') + '</div>';
    }

    function readMaintenanceTopOwnersLimit() {
      const input = document.getElementById('maintenanceTopOwnersLimitInput');
      const parsedValue = Number.parseInt(input.value, 10);
      const normalizedValue = Number.isFinite(parsedValue)
        ? Math.max(1, Math.min(20, parsedValue))
        : 5;
      input.value = String(normalizedValue);
      return normalizedValue;
    }

    function renderMaintenanceReport(report) {
      const purposeBreakdown = Array.isArray(report.purposeBreakdown)
        ? report.purposeBreakdown
        : [];
      const topOwners = Array.isArray(report.topOwners) ? report.topOwners : [];

      document.getElementById('maintenanceReportTimestamp').textContent =
        '报表生成时间：' + escapeHtml(report.generatedAtIso || '-') +
        '；上传过期判定 cutoff：' + escapeHtml(report.cutoffIso || '-');

      document.getElementById('maintenancePurposeReport').innerHTML =
        purposeBreakdown.length === 0
          ? '<div class="result-card muted">暂无用途维度统计。</div>'
          : purposeBreakdown.map(item =>
              '<article class="result-card">' +
                '<div class="file-card-top">' +
                  '<strong>' + escapeHtml(item.purpose || '-') + '</strong>' +
                  '<span class="status-chip ' + escapeHtml(toneClass(item.expiredPendingCount)) + '">' +
                    '过期 pending ' + escapeHtml(formatCount(item.expiredPendingCount)) +
                  '</span>' +
                '</div>' +
                '<div class="report-metric-grid">' +
                  '<div><div class="muted">total</div><div>' + escapeHtml(formatCount(item.totalCount)) + '</div></div>' +
                  '<div><div class="muted">pending</div><div>' + escapeHtml(formatCount(item.pendingCount)) + '</div></div>' +
                  '<div><div class="muted">uploaded</div><div>' + escapeHtml(formatCount(item.uploadedCount)) + '</div></div>' +
                  '<div><div class="muted">rejected</div><div>' + escapeHtml(formatCount(item.rejectedCount)) + '</div></div>' +
                  '<div><div class="muted">expiredPending</div><div>' + escapeHtml(formatCount(item.expiredPendingCount)) + '</div></div>' +
                  '<div><div class="muted">健康度</div><div>' +
                    escapeHtml(Number(item.totalCount || 0) > 0 && Number(item.expiredPendingCount || 0) === 0 && Number(item.rejectedCount || 0) === 0 ? '平稳' : '需关注') +
                  '</div></div>' +
                '</div>' +
              '</article>'
            ).join('');

      document.getElementById('maintenanceOwnerReport').innerHTML =
        topOwners.length === 0
          ? '<div class="result-card muted">暂无 owner 热点。</div>'
          : topOwners.map(item =>
              '<article class="result-card">' +
                '<div class="file-card-top">' +
                  '<div>' +
                    '<strong class="mono">' + escapeHtml(item.ownerUserId || '-') + '</strong>' +
                    '<div class="muted mono">latestCreatedAtIso：' + escapeHtml(item.latestCreatedAtIso || '-') + '</div>' +
                  '</div>' +
                  '<span class="status-chip ' + escapeHtml(toneClass(Number(item.expiredPendingCount || 0) + Number(item.rejectedCount || 0))) + '">' +
                    '风险记录 ' + escapeHtml(formatCount(Number(item.expiredPendingCount || 0) + Number(item.rejectedCount || 0))) +
                  '</span>' +
                '</div>' +
                '<div class="report-metric-grid">' +
                  '<div><div class="muted">total</div><div>' + escapeHtml(formatCount(item.totalCount)) + '</div></div>' +
                  '<div><div class="muted">pending</div><div>' + escapeHtml(formatCount(item.pendingCount)) + '</div></div>' +
                  '<div><div class="muted">uploaded</div><div>' + escapeHtml(formatCount(item.uploadedCount)) + '</div></div>' +
                  '<div><div class="muted">rejected</div><div>' + escapeHtml(formatCount(item.rejectedCount)) + '</div></div>' +
                  '<div><div class="muted">expiredPending</div><div>' + escapeHtml(formatCount(item.expiredPendingCount)) + '</div></div>' +
                  '<div><div class="muted">建议</div><div>' +
                    escapeHtml(Number(item.expiredPendingCount || 0) > 0 ? '先扫 pending' : (Number(item.rejectedCount || 0) > 0 ? '补删对象' : '维持观察')) +
                  '</div></div>' +
                '</div>' +
              '</article>'
            ).join('');
    }

    function renderMaintenanceFiles(items) {
      const normalizedItems = Array.isArray(items) ? items : [];
      const target = document.getElementById('maintenanceFileList');

      maintenanceCurrentPageFileIds = normalizedItems.map(item => String(item.id));
      updateMaintenanceSelectionStatus();

      if (normalizedItems.length === 0) {
        target.innerHTML = '<div class="result-card muted">没有匹配的文件记录。</div>';
        return;
      }

      target.innerHTML = normalizedItems.map(item => {
        const statusTone = item.status === 'uploaded'
          ? 'positive'
          : (item.status === 'rejected' || item.isExpiredPending ? 'warning' : 'neutral');
        const publicUrlHtml = item.publicUrl
          ? '<a class="nav-link mono" target="_blank" rel="noreferrer" href="' + escapeHtml(item.publicUrl) + '">' + escapeHtml(item.publicUrl) + '</a>'
          : '<span class="muted">-</span>';
        const fileIdLiteral = JSON.stringify(String(item.id || ''));

        return '<article class="file-card">' +
          '<div class="file-card-top">' +
            '<div class="file-card-top-left">' +
              '<label class="checkbox-chip">' +
                '<input data-maintenance-file-id="' + escapeHtml(item.id) + '" type="checkbox" onchange="toggleMaintenanceFileSelection(' + fileIdLiteral + ', this.checked)" ' +
                  (selectedMaintenanceFileIds.has(item.id) ? 'checked ' : '') +
                '/>' +
                '<span>选中</span>' +
              '</label>' +
              '<div>' +
                '<strong class="mono">' + escapeHtml(item.id) + '</strong>' +
                '<div class="muted mono">' + escapeHtml(item.objectKey) + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="badge-row">' +
              '<span class="status-chip ' + escapeHtml(statusTone) + '">' + escapeHtml(item.status) + '</span>' +
              '<span class="status-chip neutral">' + escapeHtml(item.purpose) + '</span>' +
              (item.isExpiredPending
                ? '<span class="status-chip warning">过期 pending</span>'
                : '') +
            '</div>' +
          '</div>' +
          '<div class="file-meta">' +
            '<div><div class="muted">ownerUserId</div><div class="mono">' + escapeHtml(item.ownerUserId) + '</div></div>' +
            '<div><div class="muted">contentType</div><div class="mono">' + escapeHtml(item.contentType) + '</div></div>' +
            '<div><div class="muted">byteSize</div><div>' + escapeHtml(formatByteSize(item.byteSize)) + '</div></div>' +
            '<div><div class="muted">createdAtIso</div><div class="mono">' + escapeHtml(item.createdAtIso) + '</div></div>' +
            '<div><div class="muted">etag</div><div class="mono">' + escapeHtml(item.etag || '-') + '</div></div>' +
            '<div><div class="muted">versionId</div><div class="mono">' + escapeHtml(item.versionId || '-') + '</div></div>' +
          '</div>' +
          '<div style="margin-top: 10px;"><div class="muted">publicUrl</div>' + publicUrlHtml + '</div>' +
        '</article>';
      }).join('');
    }

    function renderMaintenanceFilePagination(result) {
      const page = Number(result.page || 1);
      const pageSize = Number(result.pageSize || 20);
      const total = Number(result.total || 0);
      const items = Array.isArray(result.items) ? result.items : [];
      document.getElementById('maintenancePageInput').value = String(page);
      document.getElementById('maintenancePageSizeInput').value = String(pageSize);
      document.getElementById('maintenancePaginationStatus').textContent =
        '第 ' + page + ' 页，每页 ' + pageSize + ' 条，本页 ' + items.length + ' 条，共 ' + total + ' 条';
      document.getElementById('maintenancePreviousPage').disabled = page <= 1;
      document.getElementById('maintenanceNextPage').disabled = page * pageSize >= total;
      updateMaintenanceSelectionStatus();
    }

    function readMaintenancePaging(pageOverride) {
      const pageInput = document.getElementById('maintenancePageInput');
      const pageSizeInput = document.getElementById('maintenancePageSizeInput');
      const page = Math.max(1, Number.parseInt(pageOverride ?? pageInput.value, 10) || 1);
      const rawPageSize = Number.parseInt(pageSizeInput.value, 10) || 20;
      const pageSize = [10, 20, 50].indexOf(rawPageSize) >= 0 ? rawPageSize : 20;
      pageInput.value = String(page);
      pageSizeInput.value = String(pageSize);
      return { page, pageSize };
    }

    function resetMaintenanceFiles(message) {
      maintenanceCurrentPageFileIds = [];
      document.getElementById('maintenanceFileList').innerHTML =
        '<div class="result-card muted">' + escapeHtml(message) + '</div>';
      document.getElementById('maintenancePaginationStatus').textContent = message;
      document.getElementById('maintenancePreviousPage').disabled = true;
      document.getElementById('maintenanceNextPage').disabled = true;
      updateMaintenanceSelectionStatus();
    }

    function resetMaintenanceReport(message) {
      document.getElementById('maintenanceReportTimestamp').textContent = message;
      document.getElementById('maintenancePurposeReport').innerHTML =
        '<div class="result-card muted">' + escapeHtml(message) + '</div>';
      document.getElementById('maintenanceOwnerReport').innerHTML =
        '<div class="result-card muted">' + escapeHtml(message) + '</div>';
    }

    async function loadFileMaintenanceSummary() {
      const requestId = ++latestSummaryRequestId;
      setNotice('');
      try {
        const summary = await api('/files/maintenance/summary');
        if (requestId !== latestSummaryRequestId) return;
        renderSummary(summary);
      } catch (error) {
        if (requestId !== latestSummaryRequestId) return;
        document.getElementById('summaryCards').innerHTML =
          '<p class="muted">摘要拉取失败，先别乱点清理按钮。</p>';
        document.getElementById('summaryTimestamp').textContent =
          '文件维护摘要拉取失败。';
        setNotice(error.message);
      }
    }

    async function loadMaintenanceReport() {
      const requestId = ++latestReportRequestId;
      setNotice('');
      try {
        const query = new URLSearchParams();
        query.set('topOwnersLimit', String(readMaintenanceTopOwnersLimit()));
        const report = await api('/files/maintenance/report?' + query.toString());
        if (requestId !== latestReportRequestId) return;
        renderMaintenanceReport(report);
      } catch (error) {
        if (requestId !== latestReportRequestId) return;
        resetMaintenanceReport('文件维护审计报表拉取失败。');
        setNotice(error.message);
      }
    }

    async function loadMaintenanceFiles(pageOverride) {
      const requestId = ++latestFilesRequestId;
      setNotice('');
      try {
        const status = document.getElementById('maintenanceStatusInput').value;
        const purpose = document.getElementById('maintenancePurposeInput').value;
        const ownerUserId = document.getElementById('maintenanceOwnerUserIdInput').value.trim();
        const keyword = document.getElementById('maintenanceKeywordInput').value.trim();
        const { page, pageSize } = readMaintenancePaging(pageOverride);
        const query = new URLSearchParams();
        query.set('page', String(page));
        query.set('pageSize', String(pageSize));
        if (status) query.set('status', status);
        if (purpose) query.set('purpose', purpose);
        if (ownerUserId) query.set('ownerUserId', ownerUserId);
        if (keyword) query.set('keyword', keyword);
        const result = await api('/files/maintenance/files?' + query.toString());
        if (requestId !== latestFilesRequestId) return;
        renderMaintenanceFiles(result.items);
        renderMaintenanceFilePagination(result);
      } catch (error) {
        if (requestId !== latestFilesRequestId) return;
        resetMaintenanceFiles('文件记录拉取失败。');
        setNotice(error.message);
      }
    }

    function loadAdjacentMaintenancePage(delta) {
      const currentPage =
        Number.parseInt(document.getElementById('maintenancePageInput').value, 10) || 1;
      loadMaintenanceFiles(Math.max(1, currentPage + delta));
    }

    async function rejectExpiredPendingFiles() {
      if (maintenanceMutationPending) return;
      maintenanceMutationPending = true;
      setActionDisabled(true);
      setNotice('正在驳回过期 pending 文件...');
      try {
        const result = await api('/files/maintenance/reject-expired-pending', {
          method: 'POST',
        });
        renderRejectExpiredPendingResult(result);
        setNotice('过期 pending 文件清理完成。');
        await Promise.all([
          loadFileMaintenanceSummary(),
          loadMaintenanceReport(),
          loadMaintenanceFiles(),
        ]);
      } catch (error) {
        setNotice(error.message);
      } finally {
        maintenanceMutationPending = false;
        setActionDisabled(false);
      }
    }

    async function deleteRejectedObjects() {
      if (maintenanceMutationPending) return;
      maintenanceMutationPending = true;
      setActionDisabled(true);
      setNotice('正在重试删除 rejected 对象...');
      try {
        const result = await api('/files/maintenance/delete-rejected-objects', {
          method: 'POST',
        });
        renderDeleteRejectedObjectsResult(result);
        setNotice('rejected 对象删除重试完成。');
        await Promise.all([
          loadFileMaintenanceSummary(),
          loadMaintenanceReport(),
          loadMaintenanceFiles(),
        ]);
      } catch (error) {
        setNotice(error.message);
      } finally {
        maintenanceMutationPending = false;
        setActionDisabled(false);
      }
    }

    async function runMaintenanceBatchGovernance() {
      if (maintenanceMutationPending) return;

      const fileIds = Array.from(selectedMaintenanceFileIds);
      if (fileIds.length === 0) {
        setNotice('先选中文件记录再执行批量治理。');
        return;
      }

      maintenanceMutationPending = true;
      setActionDisabled(true);
      setNotice('正在执行文件批量治理...');
      try {
        const result = await api('/files/maintenance/batch-governance', {
          method: 'POST',
          body: JSON.stringify({
            action: document.getElementById('maintenanceBatchActionInput').value,
            fileIds,
          }),
        });
        renderMaintenanceBatchGovernanceResult(result);
        clearMaintenanceSelection();
        setNotice('文件批量治理执行完成。');
        await Promise.all([
          loadFileMaintenanceSummary(),
          loadMaintenanceReport(),
          loadMaintenanceFiles(),
        ]);
      } catch (error) {
        setNotice(error.message);
      } finally {
        maintenanceMutationPending = false;
        setActionDisabled(false);
      }
    }

    updateMaintenanceSelectionStatus();
    const currentAdminSession = initializeAdminSession();
    if (currentAdminSession && currentAdminSession.accessToken) {
      loadFileMaintenanceSummary();
      loadMaintenanceReport();
      loadMaintenanceFiles();
    }
  </script>
</body>
</html>`;
}
