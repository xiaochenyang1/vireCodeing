import {
  renderAdminConsoleNav,
  renderAdminConsoleNavStyles,
} from './admin-console-nav-snippet';
import {
  renderAdminSessionControls,
  renderAdminSessionScript,
} from './admin-session-snippet';

const defaultModules = [
  {
    key: 'driver-certification',
    title: '司机认证审核台',
    route: '/api/admin/driver-certification-console',
    summary: '查看实名/车辆认证队列、附件预览、审核事件，并执行单条或按当前筛选结果批量通过/驳回。',
  },
  {
    key: 'shipper-verification',
    title: '货主认证审核台',
    route: '/api/admin/shipper-verification-console',
    summary: '查看货主实名/企业认证队列，并执行单条通过或驳回。',
  },
  {
    key: 'shipper-invoice',
    title: '发票申请审核台',
    route: '/api/admin/shipper-invoice-console',
    summary: '查看货主发票申请队列，并执行单条通过或驳回。',
  },
  {
    key: 'order-management',
    title: '订单管理台',
    route: '/api/admin/order-management-console',
    summary: '按状态、时间和关键字查后台订单列表，打开单笔详情看路线、金额、事件和异常快照，也能原子批量取消 waiting 订单。',
  },
  {
    key: 'session-governance',
    title: '后台会话治理台',
    route: '/api/admin/session-governance-console',
    summary: '除了当前 admin 自查，还能按角色/关键字/风险标签筛全平台活跃会话、看设备风险摘要、按会话逐个强退，并查看细粒度审计第一片。',
  },
  {
    key: 'account-management',
    title: '账号管理台',
    route: '/api/admin/account-management-console',
    summary: '按账号筛平台用户目录、看活跃会话与治理审计，并执行冻结、解冻和按账号撤销会话。',
  },
  {
    key: 'permission-matrix',
    title: '权限矩阵台',
    route: '/api/admin/permission-matrix-console',
    summary: '把现有后台工具、高风险写操作和待补的角色拆分缺口拉成统一权限矩阵，先别再凭感觉猜谁能干啥。',
  },
  {
    key: 'order-attachment',
    title: '订单附件审计台',
    route: '/api/admin/order-attachment-console',
    summary: '分页筛选附件订单摘要，打开单笔详情查看文件元数据和本地预览。',
  },
  {
    key: 'file-maintenance',
    title: '文件维护台',
    route: '/api/admin/file-maintenance-console',
    summary: '查看文件总量、过期 pending 和 rejected 对象积压，并执行清理重试。',
  },
  {
    key: 'support-ticket',
    title: '帮助中心工单台',
    route: '/api/admin/support-ticket-console',
    summary: '分页查看货主帮助中心工单、打开详情并推进 pending -> processing -> resolved 状态流转。',
  },
  {
    key: 'order-exception-case',
    title: '异常客服工单台',
    route: '/api/admin/order-exception-case-console',
    summary: '处理货主/司机异常工单，推进 pending、processing、resolved、closed 状态。',
  },
  {
    key: 'shipper-coupon',
    title: '货主优惠券发放台',
    route: '/api/admin/shipper-coupon-console',
    summary: '给单个货主手工发券、按同模板批量补贴，也能顺手看核销报表第一片，适合临时运营验证。',
  },
  {
    key: 'evaluation-audit',
    title: '评价审计台',
    route: '/api/admin/evaluation-audit-console',
    summary: '只读筛货主评价司机和司机评价货主记录，追标签、评分、内容和图片文件。',
  },
  {
    key: 'finance',
    title: '财务操作台',
    route: '/api/admin/finance-console',
    summary: '查询 payments/refunds/settlements/withdrawals，查看财务报表和资金流水，并执行退款重试、单条或批量提现审核。',
  },
] as const;

const defaultGaps = [
  '多角色工作台 / 行级权限 / 报表 / 批量操作',
  '地图 / 定位 / 轨迹 / ETA',
  'IM / 推送 / 在线客服会话',
  '正式支付 / 打款 / 对账',
  '对象存储 / 短信 / 监控 / 发布体系',
] as const;

export function renderAdminConsoleHome() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>运营后台工具台</title>
  <style>
    :root {
      color-scheme: light;
      --bg-top: #eef3f7;
      --bg-bottom: #dbe5ee;
      --panel: rgba(255, 255, 255, 0.88);
      --border: #d0d9e3;
      --text: #132238;
      --muted: #607084;
      --primary: #145ea8;
      --warning-bg: #fff0d6;
      --warning-text: #8f4b00;
      --positive-bg: #e8f7eb;
      --positive-text: #17663d;
      --neutral-bg: #edf2f7;
      --neutral-text: #344054;
      --shadow: 0 16px 40px rgba(19, 34, 56, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "PingFang SC", sans-serif;
      background:
        radial-gradient(circle at top right, rgba(20, 94, 168, 0.12), transparent 28%),
        linear-gradient(180deg, var(--bg-top) 0%, var(--bg-bottom) 100%);
      color: var(--text);
    }
    .shell { max-width: 1240px; margin: 0 auto; padding: 28px 16px 40px; }
    .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 20px;
      backdrop-filter: blur(10px);
      box-shadow: var(--shadow);
    }
    .panel + .panel { margin-top: 18px; }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(20, 94, 168, 0.08);
      color: var(--primary);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    h1 { margin: 12px 0 10px; font-size: 30px; line-height: 1.15; }
    h2 { margin: 0 0 12px; font-size: 20px; }
    p { margin: 0; }
    .muted { color: var(--muted); line-height: 1.7; }
    .toolbar {
      display: grid;
      grid-template-columns: minmax(260px, 340px) auto;
      gap: 12px;
      align-items: end;
      margin-top: 18px;
    }
    .session-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin-top: 12px;
    }
    .session-link {
      color: var(--primary);
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
    }
    .secondary-button {
      width: auto;
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.96);
      color: var(--text);
      border: 1px solid var(--border);
      box-shadow: none;
    }
    label {
      display: block;
      font-size: 13px;
      color: var(--muted);
    }
    input, button {
      width: 100%;
      margin-top: 6px;
      padding: 11px 12px;
      border-radius: 12px;
      border: 1px solid var(--border);
      font: inherit;
    }
    input { background: rgba(255, 255, 255, 0.96); }
    button {
      background: var(--primary);
      color: #fff;
      font-weight: 700;
      cursor: pointer;
      border: 0;
      box-shadow: 0 12px 24px rgba(20, 94, 168, 0.2);
    }
    .error { margin-top: 12px; color: #b42318; white-space: pre-wrap; min-height: 20px; }
    .summary-strip {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }
    .summary-card {
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 18px;
      background: rgba(255, 255, 255, 0.92);
    }
    .summary-card strong {
      display: block;
      margin-top: 8px;
      font-size: 28px;
      line-height: 1;
    }
    .summary-card span { color: var(--muted); font-size: 13px; }
    .timestamp { margin-top: 10px; font-size: 13px; color: var(--muted); min-height: 18px; }
    .module-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .module-card {
      display: block;
      text-decoration: none;
      color: inherit;
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 18px;
      background: rgba(255, 255, 255, 0.95);
      box-shadow: 0 14px 36px rgba(19, 34, 56, 0.05);
      transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease;
    }
    .module-card:hover {
      transform: translateY(-2px);
      border-color: rgba(20, 94, 168, 0.5);
      box-shadow: 0 18px 42px rgba(19, 34, 56, 0.08);
    }
    .module-top {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }
    .stage-chip {
      flex: 0 0 auto;
      padding: 5px 10px;
      border-radius: 999px;
      background: rgba(20, 94, 168, 0.08);
      color: var(--primary);
      font-size: 12px;
      font-weight: 700;
    }
    .module-card h3 { margin: 10px 0 8px; font-size: 18px; }
    .metric-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 14px;
    }
    .metric-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 600;
    }
    .metric-tone-warning { background: var(--warning-bg); color: var(--warning-text); }
    .metric-tone-positive { background: var(--positive-bg); color: var(--positive-text); }
    .metric-tone-neutral { background: var(--neutral-bg); color: var(--neutral-text); }
    .gap-row {
      margin-top: 14px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .gap-chip {
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(19, 34, 56, 0.06);
      color: var(--muted);
      font-size: 12px;
    }
    .gap-list {
      margin: 0;
      padding-left: 18px;
      color: var(--text);
      line-height: 1.8;
    }
    ${renderAdminConsoleNavStyles()}
    .footer {
      margin-top: 18px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.7;
    }
    @media (max-width: 960px) {
      .toolbar,
      .summary-strip,
      .module-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="panel">
      <span class="eyebrow">统一入口 + 实时概览</span>
      <h1>运营后台工具台</h1>
      <p class="muted">这页不再只是把路径堆成收藏夹。现在它能在 admin token 兜底下拉实时概览，直接看审核队列、文件清理积压、异常工单、财务死信和优惠券存量。权限矩阵第一片也已经接进来了，但它依然不是完整多角色工作台、行级权限和报表系统，别自己骗自己。</p>
      <div class="toolbar">
        <label>Admin access token<input id="adminToken" type="password" placeholder="填 token 后再拉实时概览" /></label>
        <button id="loadOverviewButton" onclick="loadAdminConsoleOverview()">刷新后台概览</button>
      </div>
      ${renderAdminSessionControls({
        currentRoute: '/api/admin/console',
      })}
      ${renderAdminConsoleNav({
        currentRoute: '/api/admin/console',
      })}
      <div id="overviewNotice" class="error"></div>
      <div id="overviewTimestamp" class="timestamp">默认先展示已落地台子，填 token 后可拉实时摘要。</div>
    </section>

    <section class="panel">
      <h2>首页摘要</h2>
      <div id="overviewSummaryGrid" class="summary-strip"></div>
    </section>

    <section class="panel">
      <h2>当前已落地后台台子</h2>
      <div id="overviewModuleGrid" class="module-grid"></div>
    </section>

    <section class="panel">
      <span class="eyebrow">未完成大坑</span>
      <h2>现在还差的硬骨头</h2>
      <ul id="remainingGapList" class="gap-list"></ul>
      <p class="footer">下一步应该继续把后台往“统一概览 + 更完整只读查询 + 再逐步补操作闭环”推进，别突然脑抽跳去做地图、IM 或正式支付接入，那坑深得很。</p>
    </section>
  </main>

  <script>
    const apiBase = '/api';
    const defaultModules = ${JSON.stringify(defaultModules)};
    const defaultGaps = ${JSON.stringify(defaultGaps)};
    let latestOverviewRequestId = 0;
    ${renderAdminSessionScript({
      currentRoute: '/api/admin/console',
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
      return String(value ?? '').replace(/[&<>"']/g, function(character) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
      });
    }

    function formatCount(value) {
      return Number(value || 0).toLocaleString('zh-CN');
    }

    function formatStage(stage) {
      return stage === 'first_slice' ? '第一片' : String(stage || '');
    }

    function renderSummaryCards(overview) {
      const summaryGrid = document.getElementById('overviewSummaryGrid');
      const implementedCount = overview ? Number(overview.implementedConsoleCount || 0) : defaultModules.length;
      const liveMetricModuleCount = overview ? Number(overview.liveMetricModuleCount || 0) : 0;
      const remainingCapabilityCount = overview ? Number(overview.remainingCapabilityCount || 0) : defaultGaps.length;
      summaryGrid.innerHTML = [
        {
          label: '已落地工具台',
          value: implementedCount,
          detail: '当前仓库里能直接打开的后台入口数',
        },
        {
          label: '实时模块',
          value: liveMetricModuleCount,
          detail: '填 token 后能看到实时摘要的模块数',
        },
        {
          label: '未完成大项',
          value: remainingCapabilityCount,
          detail: '还没补齐的大块能力，不是装看不见就算完事',
        },
      ].map(function(item) {
        return '<div class="summary-card">' +
          '<span>' + escapeHtml(item.label) + '</span>' +
          '<strong>' + escapeHtml(formatCount(item.value)) + '</strong>' +
          '<span>' + escapeHtml(item.detail) + '</span>' +
        '</div>';
      }).join('');
    }

    function renderModuleGrid(modules) {
      const moduleGrid = document.getElementById('overviewModuleGrid');
      moduleGrid.innerHTML = (Array.isArray(modules) ? modules : defaultModules).map(function(module) {
        const metrics = Array.isArray(module.metrics) ? module.metrics : [];
        const pendingGaps = Array.isArray(module.pendingGaps) ? module.pendingGaps : [];
        return '<a class="module-card" href="' + escapeHtml(module.route) + '">' +
          '<div class="module-top">' +
            '<div>' +
              '<span class="eyebrow">' + escapeHtml(module.key || 'console') + '</span>' +
              '<h3>' + escapeHtml(module.title) + '</h3>' +
            '</div>' +
            '<span class="stage-chip">' + escapeHtml(formatStage(module.stage || 'first_slice')) + '</span>' +
          '</div>' +
          '<p class="muted">' + escapeHtml(module.summary || '') + '</p>' +
          (metrics.length
            ? '<div class="metric-row">' + metrics.map(function(metric) {
                const tone = ['warning', 'positive', 'neutral'].indexOf(metric.tone) >= 0 ? metric.tone : 'neutral';
                return '<span class="metric-pill metric-tone-' + escapeHtml(tone) + '">' +
                  '<span>' + escapeHtml(metric.label) + '</span>' +
                  '<strong>' + escapeHtml(formatCount(metric.value)) + '</strong>' +
                '</span>';
              }).join('') + '</div>'
            : '<div class="metric-row"><span class="metric-pill metric-tone-neutral">默认导航卡，暂无实时指标</span></div>') +
          (pendingGaps.length
            ? '<div class="gap-row">' + pendingGaps.map(function(gap) {
                return '<span class="gap-chip">' + escapeHtml(gap) + '</span>';
              }).join('') + '</div>'
            : '') +
        '</a>';
      }).join('');
    }

    function renderRemainingGaps(gaps) {
      const gapList = document.getElementById('remainingGapList');
      const items = Array.isArray(gaps) && gaps.length ? gaps : defaultGaps;
      gapList.innerHTML = items.map(function(gap) {
        return '<li>' + escapeHtml(gap) + '</li>';
      }).join('');
    }

    function resetOverviewToDefaults(message) {
      document.getElementById('overviewTimestamp').textContent = message;
      renderSummaryCards();
      renderModuleGrid(defaultModules);
      renderRemainingGaps(defaultGaps);
    }

    async function loadAdminConsoleOverview() {
      const requestId = ++latestOverviewRequestId;
      document.getElementById('overviewNotice').textContent = '';
      try {
        const overview = await api('/admin/console/overview');
        if (requestId !== latestOverviewRequestId) return;
        renderSummaryCards(overview);
        renderModuleGrid(overview.modules);
        renderRemainingGaps(overview.remainingPlatformGaps);
        document.getElementById('overviewTimestamp').textContent =
          '概览时间：' + escapeHtml(overview.generatedAtIso || '');
      } catch (error) {
        if (requestId !== latestOverviewRequestId) return;
        document.getElementById('overviewNotice').textContent = error.message;
        resetOverviewToDefaults('实时概览拉取失败，先退回默认导航和已知缺口。');
      }
    }

    renderSummaryCards();
    renderModuleGrid(defaultModules);
    renderRemainingGaps(defaultGaps);
    const currentAdminSession = initializeAdminSession();
    if (currentAdminSession && currentAdminSession.accessToken) {
      loadAdminConsoleOverview();
    }
  </script>
</body>
</html>`;
}
