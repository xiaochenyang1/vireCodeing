import {
  renderAdminConsoleNav,
  renderAdminConsoleNavStyles,
} from './admin-console-nav-snippet';
import {
  renderAdminSessionControls,
  renderAdminSessionScript,
} from './admin-session-snippet';

export function renderShipperCouponAdminConsole() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="admin-shipper-coupon-api" content="/api/admin/shipper-coupons" />
  <title>货主优惠券发放台</title>
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
      --ok-bg: #ecfdf3;
      --ok-line: #a7f3d0;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    button, input, textarea { font: inherit; }
    .console-shell {
      display: grid;
      grid-template-columns: minmax(340px, 440px) minmax(0, 1fr);
      min-height: 100vh;
    }
    .form-panel, .result-panel { padding: 20px; }
    .form-panel {
      border-right: 1px solid var(--line);
      background: #eef2f4;
    }
    h1 { margin: 0 0 16px; font-size: 22px; letter-spacing: 0; }
    h2 { margin: 0 0 10px; font-size: 17px; letter-spacing: 0; }
    label {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-size: 13px;
    }
    input, textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 9px 10px;
      background: #fff;
      color: var(--text);
      min-height: 40px;
    }
    textarea { min-height: 74px; resize: vertical; }
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
    .toolbar, .form-grid {
      display: grid;
      gap: 10px;
    }
    .session-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .session-link { color: var(--accent); font-size: 13px; font-weight: 600; text-decoration: none; }
    .secondary-button { width: auto; background: #fff; color: var(--accent); border: 1px solid var(--line); }
    .amount-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .meta {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.55;
    }
    .report-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: end;
    }
    .error { color: var(--danger); }
    .result {
      border-color: var(--ok-line);
      background: var(--ok-bg);
    }
    ${renderAdminConsoleNavStyles()}
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 13px;
      line-height: 1.5;
    }
    @media (max-width: 860px) {
      .console-shell { grid-template-columns: 1fr; }
      .form-panel { border-right: 0; border-bottom: 1px solid var(--line); }
      .amount-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="console-shell">
    <section class="form-panel">
      <h1>货主优惠券发放台</h1>
      <div class="card toolbar">
        <label>
          admin access token
          <input id="adminToken" type="password" autocomplete="off" title="粘贴 admin access token" />
        </label>
        <button id="issueCouponButton" type="button" onclick="issueCoupon()">单个发放</button>
        <button id="batchIssueCouponButton" type="button" onclick="batchIssueCoupon()">批量发放</button>
        <div id="couponConsoleStatus" class="meta"></div>
        ${renderAdminSessionControls({
          currentRoute: '/api/admin/shipper-coupon-console',
          hintClass: 'meta',
        })}
        ${renderAdminConsoleNav({
          currentRoute: '/api/admin/shipper-coupon-console',
        })}
      </div>
      <div class="card form-grid">
        <label>
          货主 ID
          <input id="shipperIdInput" placeholder="user-profile-coupon" />
        </label>
        <label>
          批量货主 ID
          <textarea id="batchShipperIdsInput" placeholder="shipper-1&#10;shipper-2&#10;shipper-3"></textarea>
        </label>
        <label>
          优惠券名称
          <input id="couponTitleInput" placeholder="后台满 500 减 50" />
        </label>
        <label>
          使用条件
          <textarea id="conditionTextInput" placeholder="平台订单满 500 元可用"></textarea>
        </label>
        <div class="amount-grid">
          <label>
            优惠金额（分）
            <input id="discountCentsInput" type="number" min="1" step="1" placeholder="5000" />
          </label>
          <label>
            最低订单金额（分）
            <input id="minOrderAmountCentsInput" type="number" min="0" step="1" placeholder="50000" />
          </label>
        </div>
        <label>
          生效时间 ISO
          <input id="validFromIsoInput" placeholder="2026-07-09T00:00:00.000Z" />
        </label>
        <label>
          失效时间 ISO
          <input id="validUntilIsoInput" placeholder="2026-08-09T00:00:00.000Z" />
        </label>
        <label>
          来源文案
          <input id="sourceTextInput" placeholder="运营补偿" />
        </label>
      </div>
    </section>
    <section class="result-panel">
      <div class="card">
        <h2>发放结果</h2>
        <div class="meta">当前页面已补单张手工发放、同模板批量发放和核销报表第一片；支付退款成功回调命中已核销原券时会自动补一张返券，但这里还不是活动编排、审批流、营销规则或退款返券策略后台。</div>
      </div>
      <div id="issuedCouponResult" class="card">
        <pre>暂无发放结果</pre>
      </div>
      <div id="batchIssuedCouponResult" class="card">
        <pre>暂无批量发放结果</pre>
      </div>
      <div class="card">
        <h2>核销报表</h2>
        <div class="report-actions">
          <label>
            Top 货主数量
            <input
              id="couponReportTopShippersLimitInput"
              type="number"
              min="1"
              max="20"
              step="1"
              value="5"
            />
          </label>
          <button id="loadCouponReportButton" type="button" onclick="loadCouponReport()">刷新报表</button>
        </div>
        <div id="couponReportTimestamp" class="meta">暂无核销报表</div>
      </div>
      <div id="couponReportSummary" class="card">
        <pre>暂无报表汇总</pre>
      </div>
      <div id="couponSourceReport" class="card">
        <pre>暂无来源分布</pre>
      </div>
      <div id="couponTopShippersReport" class="card">
        <pre>暂无货主排行</pre>
      </div>
    </section>
  </main>
  <script>
    const apiBase = '/api';
    let latestCouponReportRequestId = 0;
    ${renderAdminSessionScript({
      currentRoute: '/api/admin/shipper-coupon-console',
    })}

    function readTrimmed(id) {
      return document.getElementById(id).value.trim();
    }

    function readAmount(id) {
      const value = Number(readTrimmed(id));
      if (!Number.isInteger(value)) {
        throw new Error('金额字段必须填写整数分');
      }
      return value;
    }

    function buildCouponTemplate() {
      const validFromIso = readTrimmed('validFromIsoInput');
      const validUntilIso = readTrimmed('validUntilIsoInput');

      if (Date.parse(validUntilIso) <= Date.parse(validFromIso)) {
        throw new Error('优惠券失效时间必须晚于生效时间');
      }

      const template = {
        title: readTrimmed('couponTitleInput'),
        conditionText: readTrimmed('conditionTextInput'),
        discountCents: readAmount('discountCentsInput'),
        minOrderAmountCents: readAmount('minOrderAmountCentsInput'),
        validFromIso,
        validUntilIso,
      };
      const sourceText = readTrimmed('sourceTextInput');
      if (sourceText) template.sourceText = sourceText;
      return template;
    }

    function buildIssueRequest() {
      return {
        shipperId: readTrimmed('shipperIdInput'),
        ...buildCouponTemplate(),
      };
    }

    function readBatchShipperIds() {
      const shipperIds = [...new Set(
        readTrimmed('batchShipperIdsInput')
          .split(/[\\s,，]+/)
          .map(value => value.trim())
          .filter(Boolean),
      )];

      if (shipperIds.length === 0) {
        throw new Error('至少要填写一个批量货主 ID');
      }

      return shipperIds;
    }

    function buildBatchIssueRequest() {
      return {
        shipperIds: readBatchShipperIds(),
        ...buildCouponTemplate(),
      };
    }

    function readCouponReportTopShippersLimit() {
      const raw = readTrimmed('couponReportTopShippersLimitInput');
      const value = raw ? Number(raw) : 5;
      if (!Number.isInteger(value) || value < 1 || value > 20) {
        throw new Error('Top 货主数量必须是 1 到 20 的整数');
      }
      return value;
    }

    function setStatus(message, isError) {
      const status = document.getElementById('couponConsoleStatus');
      status.textContent = message;
      status.className = isError ? 'meta error' : 'meta';
    }

    function renderResult(targetId, payload, isError) {
      const result = document.getElementById(targetId);
      result.className = isError ? 'card error' : 'card result';
      result.innerHTML = '<pre>' + escapeHtml(JSON.stringify(payload, null, 2)) + '</pre>';
    }

    function renderReportCard(targetId, title, payload, isError) {
      const result = document.getElementById(targetId);
      result.className = isError ? 'card error' : 'card result';
      result.innerHTML =
        '<h2>' +
        escapeHtml(title) +
        '</h2><pre>' +
        escapeHtml(JSON.stringify(payload, null, 2)) +
        '</pre>';
    }

    function renderCouponReport(report) {
      document.getElementById('couponReportTimestamp').textContent =
        '报表时间：' + escapeHtml(report.generatedAtIso || '');
      renderReportCard('couponReportSummary', '报表汇总', report.summary, false);
      renderReportCard('couponSourceReport', '来源分布', report.sourceBreakdown, false);
      renderReportCard('couponTopShippersReport', '货主排行', report.topShippers, false);
    }

    function renderCouponReportError(message) {
      document.getElementById('couponReportTimestamp').textContent = message;
      renderReportCard('couponReportSummary', '报表汇总', { message }, true);
      renderReportCard('couponSourceReport', '来源分布', { message }, true);
      renderReportCard('couponTopShippersReport', '货主排行', { message }, true);
    }

    function setButtonsDisabled(disabled) {
      document.getElementById('issueCouponButton').disabled = disabled;
      document.getElementById('batchIssueCouponButton').disabled = disabled;
    }

    function setCouponReportControlsDisabled(disabled) {
      document.getElementById('couponReportTopShippersLimitInput').disabled = disabled;
      document.getElementById('loadCouponReportButton').disabled = disabled;
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    async function loadCouponReport() {
      const token = readTrimmed('adminToken');
      if (!token) {
        renderCouponReportError('请先填写 admin access token，再拉优惠券报表');
        return;
      }
      persistAdminAccessToken();

      let topShippersLimit;
      try {
        topShippersLimit = readCouponReportTopShippersLimit();
      } catch (error) {
        renderCouponReportError(error.message);
        return;
      }

      const requestId = ++latestCouponReportRequestId;
      setCouponReportControlsDisabled(true);
      document.getElementById('couponReportTimestamp').textContent = '正在拉取优惠券报表...';

      try {
        const response = await fetch(
          apiBase +
            '/admin/shipper-coupons/report?topShippersLimit=' +
            encodeURIComponent(String(topShippersLimit)),
          {
            method: 'GET',
            headers: {
              'authorization': 'Bearer ' + token,
              'x-request-id': 'req_coupon_report_console_' + Date.now(),
            },
          },
        );
        const payload = await response.json();
        if (requestId !== latestCouponReportRequestId) return;
        if (!response.ok) {
          throw new Error(payload.message || '优惠券报表拉取失败');
        }
        renderCouponReport(payload.data);
      } catch (error) {
        if (requestId !== latestCouponReportRequestId) return;
        renderCouponReportError(error.message);
      } finally {
        if (requestId !== latestCouponReportRequestId) return;
        setCouponReportControlsDisabled(false);
      }
    }

    async function issueCoupon() {
      const token = readTrimmed('adminToken');
      if (!token) {
        setStatus('请先填写 admin access token', true);
        return;
      }
      persistAdminAccessToken();

      let request;
      try {
        request = buildIssueRequest();
      } catch (error) {
        setStatus(error.message, true);
          return;
      }

      setButtonsDisabled(true);
      setStatus('正在发放优惠券...', false);

      try {
        const response = await fetch(apiBase + '/admin/shipper-coupons', {
          method: 'POST',
          headers: {
            'authorization': 'Bearer ' + token,
            'content-type': 'application/json',
            'x-request-id': 'req_coupon_console_' + Date.now(),
          },
          body: JSON.stringify(request),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.message || '优惠券发放失败');
        }
        renderResult('issuedCouponResult', payload.data, false);
        const refreshTasks = [
          loadCouponReport(),
        ];
        await Promise.all(
          refreshTasks.map(task =>
            Promise.resolve(task).catch(() => undefined),
          ),
        );
        setStatus('优惠券已发放', false);
      } catch (error) {
        renderResult('issuedCouponResult', { message: error.message }, true);
        setStatus(error.message, true);
      } finally {
        setButtonsDisabled(false);
      }
    }

    async function batchIssueCoupon() {
      const token = readTrimmed('adminToken');
      if (!token) {
        setStatus('请先填写 admin access token', true);
        return;
      }
      persistAdminAccessToken();

      let request;
      try {
        request = buildBatchIssueRequest();
      } catch (error) {
        setStatus(error.message, true);
        return;
      }

      setButtonsDisabled(true);
      setStatus('正在批量发放优惠券...', false);

      try {
        const response = await fetch(apiBase + '/admin/shipper-coupons/batch-issue', {
          method: 'POST',
          headers: {
            'authorization': 'Bearer ' + token,
            'content-type': 'application/json',
            'x-request-id': 'req_coupon_batch_console_' + Date.now(),
          },
          body: JSON.stringify(request),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.message || '优惠券批量发放失败');
        }
        renderResult('batchIssuedCouponResult', payload.data, false);
        const refreshTasks = [
          loadCouponReport(),
        ];
        await Promise.all(
          refreshTasks.map(task =>
            Promise.resolve(task).catch(() => undefined),
          ),
        );
        setStatus('优惠券批量发放完成', false);
      } catch (error) {
        renderResult('batchIssuedCouponResult', { message: error.message }, true);
        setStatus(error.message, true);
      } finally {
        setButtonsDisabled(false);
      }
    }

    const currentAdminSession = initializeAdminSession();
    if (currentAdminSession && currentAdminSession.accessToken) {
      loadCouponReport();
    }
  </script>
</body>
</html>`;
}
