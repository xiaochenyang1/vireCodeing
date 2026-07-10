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
    .error { color: var(--danger); }
    .result {
      border-color: var(--ok-line);
      background: var(--ok-bg);
    }
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
        <button id="issueCouponButton" type="button" onclick="issueCoupon()">发放优惠券</button>
        <div id="couponConsoleStatus" class="meta"></div>
      </div>
      <div class="card form-grid">
        <label>
          货主 ID
          <input id="shipperIdInput" placeholder="user-profile-coupon" />
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
        <div class="meta">当前页面只做单张手工发放，不做批量活动、审批流、营销规则或退款返券。</div>
      </div>
      <div id="issuedCouponResult" class="card">
        <pre>暂无发放结果</pre>
      </div>
    </section>
  </main>
  <script>
    const apiBase = '/api';

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

    function buildIssueRequest() {
      const validFromIso = readTrimmed('validFromIsoInput');
      const validUntilIso = readTrimmed('validUntilIsoInput');

      if (Date.parse(validUntilIso) <= Date.parse(validFromIso)) {
        throw new Error('优惠券失效时间必须晚于生效时间');
      }

      const request = {
        shipperId: readTrimmed('shipperIdInput'),
        title: readTrimmed('couponTitleInput'),
        conditionText: readTrimmed('conditionTextInput'),
        discountCents: readAmount('discountCentsInput'),
        minOrderAmountCents: readAmount('minOrderAmountCentsInput'),
        validFromIso,
        validUntilIso,
      };
      const sourceText = readTrimmed('sourceTextInput');
      if (sourceText) request.sourceText = sourceText;
      return request;
    }

    function setStatus(message, isError) {
      const status = document.getElementById('couponConsoleStatus');
      status.textContent = message;
      status.className = isError ? 'meta error' : 'meta';
    }

    function renderResult(payload, isError) {
      const result = document.getElementById('issuedCouponResult');
      result.className = isError ? 'card error' : 'card result';
      result.innerHTML = '<pre>' + escapeHtml(JSON.stringify(payload, null, 2)) + '</pre>';
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    async function issueCoupon() {
      const token = readTrimmed('adminToken');
      if (!token) {
        setStatus('请先填写 admin access token', true);
        return;
      }

      let request;
      try {
        request = buildIssueRequest();
      } catch (error) {
        setStatus(error.message, true);
        return;
      }

      const button = document.getElementById('issueCouponButton');
      button.disabled = true;
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
        renderResult(payload.data, false);
        setStatus('优惠券已发放', false);
      } catch (error) {
        renderResult({ message: error.message }, true);
        setStatus(error.message, true);
      } finally {
        button.disabled = false;
      }
    }
  </script>
</body>
</html>`;
}
