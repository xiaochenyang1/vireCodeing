# Driver Certification Admin Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal Web console for admin users to review driver identity and vehicle certifications using existing admin APIs.

**Architecture:** Implement the first slice as a lightweight Nest-served HTML console instead of adding a separate web build stack. The page stores an admin access token in memory, calls existing `/admin/driver-certifications` endpoints, and supports queue viewing, attachment previews, approve/reject actions, and review event viewing.

**Tech Stack:** NestJS controller/module, plain HTML/CSS/JavaScript, existing admin certification API, Jest.

---

## File Structure

- Create `apps/api/src/admin-console/driver-certification-admin-console.ts`: render the HTML page as a string.
- Create `apps/api/src/admin-console/admin-console.controller.ts`: serve the page at `GET /admin/driver-certification-console`.
- Create `apps/api/src/admin-console/admin-console.module.ts`: expose the controller.
- Create `apps/api/src/admin-console/admin-console.controller.spec.ts`: assert route output and key UI/API hooks.
- Modify `apps/api/src/app.module.ts`: import `AdminConsoleModule`.
- Modify `docs/platform/README.md`: document the console route and limitation.
- Modify `docs/03-项目当前状态与补全路线.md`: update admin review status.

## Task 1: Render Static Admin Console HTML

**Files:**
- Create: `apps/api/src/admin-console/driver-certification-admin-console.ts`
- Create: `apps/api/src/admin-console/admin-console.controller.spec.ts`

- [ ] **Step 1: Write failing render tests**

Create `apps/api/src/admin-console/admin-console.controller.spec.ts`:

```ts
import { renderDriverCertificationAdminConsole } from './driver-certification-admin-console';

describe('driver certification admin console page', () => {
  it('renders the review console shell and API hooks', () => {
    const html = renderDriverCertificationAdminConsole();

    expect(html).toContain('司机认证审核台');
    expect(html).toContain('adminToken');
    expect(html).toContain('/api/admin/driver-certifications');
    expect(html).toContain('/attachments');
    expect(html).toContain('/review-events');
    expect(html).toContain('/identity/review');
    expect(html).toContain('/vehicle/review');
    expect(html).toContain('approveIdentity');
    expect(html).toContain('rejectVehicle');
  });

  it('uses a dense operational layout instead of a marketing hero', () => {
    const html = renderDriverCertificationAdminConsole();

    expect(html).toContain('class="console-shell"');
    expect(html).toContain('class="queue-panel"');
    expect(html).toContain('class="detail-panel"');
    expect(html).not.toContain('hero');
  });
});
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```powershell
npm --prefix apps/api test -- admin-console
```

Expected: fails because `driver-certification-admin-console.ts` does not exist.

- [ ] **Step 3: Implement HTML renderer**

Create `apps/api/src/admin-console/driver-certification-admin-console.ts` with:

```ts
export function renderDriverCertificationAdminConsole() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
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
    button, input, select, textarea {
      font: inherit;
    }
    .console-shell {
      display: grid;
      grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
      min-height: 100vh;
    }
    .queue-panel, .detail-panel {
      padding: 20px;
    }
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
    h1 {
      margin: 0;
      font-size: 22px;
      letter-spacing: 0;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 18px;
      letter-spacing: 0;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .queue-item {
      width: 100%;
      text-align: left;
      cursor: pointer;
    }
    .queue-item.active {
      border-color: var(--accent);
      box-shadow: inset 3px 0 0 var(--accent);
    }
    .meta {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }
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
    .attachment-link {
      word-break: break-all;
      color: var(--accent);
    }
    .notice {
      margin: 10px 0;
      color: var(--danger);
      min-height: 20px;
    }
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

    function setNotice(message) {
      document.getElementById('notice').textContent = message || '';
    }

    function badge(status) {
      return '<span class="status ' + status + '">' + (statusText[status] || status) + '</span>';
    }

    async function loadQueue() {
      try {
        setNotice('');
        const status = document.getElementById('statusFilter').value;
        const data = await request('/admin/driver-certifications?status=' + encodeURIComponent(status) + '&page=1&pageSize=20');
        state.items = data.items || [];
        renderQueue();
      } catch (error) {
        setNotice(error.message);
      }
    }

    function renderQueue() {
      const queue = document.getElementById('queue');
      if (state.items.length === 0) {
        queue.innerHTML = '<div class="card meta">暂无认证记录</div>';
        return;
      }
      queue.innerHTML = state.items.map(item => {
        const driverId = item.driver && item.driver.id ? item.driver.id : item.identity.driverId;
        const phone = item.driver && item.driver.phone ? item.driver.phone : '手机号待补充';
        const active = state.selected && state.selected.driver && state.selected.driver.id === driverId ? ' active' : '';
        return '<button class="card queue-item' + active + '" data-driver-id="' + driverId + '">' +
          '<strong>' + phone + '</strong><div class="meta">司机ID：' + driverId + '</div>' +
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
        state.selected = state.items.find(item => (item.driver && item.driver.id) === driverId || item.identity.driverId === driverId);
        const [attachments, events] = await Promise.all([
          request('/admin/driver-certifications/' + encodeURIComponent(driverId) + '/attachments'),
          request('/admin/driver-certifications/' + encodeURIComponent(driverId) + '/review-events'),
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
      const driverId = item.driver && item.driver.id ? item.driver.id : item.identity.driverId;
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
        '<div class="meta">' + Object.entries(record).map(([key, value]) => key + '：' + (value || '-')).join('<br>') + '</div>' +
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
        '<div class="card"><strong>' + file.attachmentType + '</strong><div class="meta">' + file.objectKey + '</div>' +
        (file.previewUrl ? '<a class="attachment-link" target="_blank" href="' + file.previewUrl + '">打开预览</a>' : '<span class="meta">暂无预览链接</span>') +
        '</div>').join('') + '</div></section>';
    }

    function renderEvents() {
      if (!state.events.length) return '<section class="card"><h2>审核事件</h2><div class="meta">暂无审核事件</div></section>';
      return '<section class="card"><h2>审核事件</h2>' + state.events.map(event =>
        '<div class="card meta">' + event.createdAtIso + ' · ' + event.certificationType + ' · ' + event.fromStatus + ' -> ' + event.toStatus +
        (event.rejectionReason ? '<br>原因：' + event.rejectionReason : '') + '</div>').join('') + '</section>';
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
        await request('/admin/driver-certifications/' + encodeURIComponent(driverId) + '/' + type + '/review', {
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
```

- [ ] **Step 4: Run focused render tests**

Run:

```powershell
npm --prefix apps/api test -- admin-console
```

Expected: pass.

- [ ] **Step 5: Commit renderer**

Run:

```powershell
git add apps/api/src/admin-console/driver-certification-admin-console.ts apps/api/src/admin-console/admin-console.controller.spec.ts
git commit -m "feat(api): add driver certification admin console page"
```

## Task 2: Serve Console From Nest

**Files:**
- Create: `apps/api/src/admin-console/admin-console.controller.ts`
- Create: `apps/api/src/admin-console/admin-console.module.ts`
- Modify: `apps/api/src/admin-console/admin-console.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Add failing controller test**

Append to `apps/api/src/admin-console/admin-console.controller.spec.ts`:

```ts
import { AdminConsoleController } from './admin-console.controller';

describe('AdminConsoleController', () => {
  it('serves the driver certification console html', () => {
    const controller = new AdminConsoleController();

    expect(controller.getDriverCertificationConsole()).toContain(
      '司机认证审核台',
    );
  });
});
```

- [ ] **Step 2: Run focused test and verify failure**

Run:

```powershell
npm --prefix apps/api test -- admin-console
```

Expected: fails because controller does not exist.

- [ ] **Step 3: Implement controller**

Create `apps/api/src/admin-console/admin-console.controller.ts`:

```ts
import { Controller, Get, Header } from '@nestjs/common';
import { renderDriverCertificationAdminConsole } from './driver-certification-admin-console';

@Controller('admin/driver-certification-console')
export class AdminConsoleController {
  @Get()
  @Header('content-type', 'text/html; charset=utf-8')
  getDriverCertificationConsole() {
    return renderDriverCertificationAdminConsole();
  }
}
```

- [ ] **Step 4: Implement module and app wiring**

Create `apps/api/src/admin-console/admin-console.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AdminConsoleController } from './admin-console.controller';

@Module({
  controllers: [AdminConsoleController],
})
export class AdminConsoleModule {}
```

Modify `apps/api/src/app.module.ts`:

```ts
import { AdminConsoleModule } from './admin-console/admin-console.module';
```

Add `AdminConsoleModule` to the `imports` array.

- [ ] **Step 5: Run API module tests and typecheck**

Run:

```powershell
npm --prefix apps/api test -- admin-console
npm --prefix apps/api test -- app.module
npm --prefix apps/api run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit Nest serving route**

Run:

```powershell
git add apps/api/src/admin-console/admin-console.controller.ts apps/api/src/admin-console/admin-console.module.ts apps/api/src/admin-console/admin-console.controller.spec.ts apps/api/src/app.module.ts
git commit -m "feat(api): serve driver certification admin console"
```

## Task 3: Improve Console Safety and Usability Tests

**Files:**
- Modify: `apps/api/src/admin-console/admin-console.controller.spec.ts`
- Modify: `apps/api/src/admin-console/driver-certification-admin-console.ts`

- [ ] **Step 1: Add failing tests for token and rejection safeguards**

Add tests:

```ts
it('renders token, empty, error, attachment, and review event states', () => {
  const html = renderDriverCertificationAdminConsole();

  expect(html).toContain('请先填写 admin access token');
  expect(html).toContain('暂无认证记录');
  expect(html).toContain('暂无附件');
  expect(html).toContain('暂无审核事件');
  expect(html).toContain('请填写驳回原因');
});

it('keeps API calls under the existing global api prefix', () => {
  const html = renderDriverCertificationAdminConsole();

  expect(html).toContain("const apiBase = '/api'");
  expect(html).not.toContain('http://localhost');
});
```

- [ ] **Step 2: Run focused tests**

Run:

```powershell
npm --prefix apps/api test -- admin-console
```

Expected: pass if Task 1 renderer already included those strings. If it fails, add the missing literal safeguards to `driver-certification-admin-console.ts`.

- [ ] **Step 3: Run lint and typecheck**

Run:

```powershell
npm --prefix apps/api run lint
npm --prefix apps/api run typecheck
```

Expected: pass.

- [ ] **Step 4: Commit safety checks**

Run if files changed:

```powershell
git add apps/api/src/admin-console/admin-console.controller.spec.ts apps/api/src/admin-console/driver-certification-admin-console.ts
git commit -m "test(api): cover admin console safety states"
```

If no files changed because Task 1 already satisfied the tests, skip this commit and record that the safeguards were already covered.

## Task 4: Docs and Status

**Files:**
- Modify: `docs/platform/README.md`
- Modify: `docs/03-项目当前状态与补全路线.md`

- [ ] **Step 1: Update platform README**

Add to `docs/platform/README.md` near the driver certification section:

```markdown
司机认证 Web 审核台第一片已提供 `GET /api/admin/driver-certification-console`。页面由 API 服务直接返回静态 HTML，admin 手动粘贴 access token 后可查看认证队列、附件预览、审核事件，并对实名/车辆认证执行通过或驳回。它仍不是完整运营后台，没有账号登录页、权限矩阵、报表、客服流转或多角色后台导航。
```

- [ ] **Step 2: Update project status**

In `docs/03-项目当前状态与补全路线.md`, update the driver certification half-built text:

```markdown
- 司机实名/车辆认证已有后端、移动端、admin API 和 Web 审核台第一片；审核台可查看队列、附件预览、审核事件并通过/驳回，但还不是完整运营后台。
```

- [ ] **Step 3: Verify docs**

Run:

```powershell
Select-String -Path 'docs\platform\README.md' -Pattern 'driver-certification-console|Web 审核台|完整运营后台'
Select-String -Path 'docs\03-项目当前状态与补全路线.md' -Pattern 'Web 审核台|完整运营后台'
```

Expected: both commands print matching lines.

- [ ] **Step 4: Commit docs**

Run:

```powershell
git add docs/platform/README.md docs/03-项目当前状态与补全路线.md
git commit -m "docs: record driver certification admin console"
```

## Task 5: Full Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm --prefix apps/api test -- admin-console
npm --prefix apps/api test -- driver-certification
```

Expected: both pass.

- [ ] **Step 2: Run API checks**

Run:

```powershell
npm --prefix apps/api test
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm run api:build
```

Expected: all pass.

- [ ] **Step 3: Run full workspace checks**

Run:

```powershell
npm test -- --runInBand
npx tsc --noEmit
npm run lint
npm --prefix apps/api run prisma:validate
```

Expected: all pass.

- [ ] **Step 4: Run database doctor honestly**

Run:

```powershell
npm --prefix apps/api run db:postgres:doctor
```

Expected with current machine: may still fail because Docker CLI and PostgreSQL are unavailable. Report the exact result.

## Self Review

- Spec coverage: covers the admin web console, queue, attachment previews, review actions, events, docs, and verification.
- 占位扫描: clear.
- Type consistency: `AdminConsoleController`, `AdminConsoleModule`, and `renderDriverCertificationAdminConsole` are named consistently across tests and implementation.
