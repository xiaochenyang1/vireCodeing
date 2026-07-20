import { adminSessionStorageKey } from './admin-session-snippet';

export function renderAdminLoginConsole() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>后台登录</title>
  <style>
    :root {
      color-scheme: light;
      --bg-top: #eef3f7;
      --bg-bottom: #dbe5ee;
      --panel: rgba(255, 255, 255, 0.94);
      --line: #d0d9e3;
      --text: #132238;
      --muted: #607084;
      --primary: #145ea8;
      --danger: #b42318;
      --ok-bg: #e8f7eb;
      --ok-text: #17663d;
      --shadow: 0 18px 42px rgba(19, 34, 56, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", "PingFang SC", sans-serif;
      background:
        radial-gradient(circle at top right, rgba(20, 94, 168, 0.12), transparent 28%),
        linear-gradient(180deg, var(--bg-top) 0%, var(--bg-bottom) 100%);
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .login-shell {
      width: min(760px, 100%);
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr);
      gap: 18px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 20px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
    }
    h1 { margin: 12px 0 10px; font-size: 30px; line-height: 1.1; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    p { margin: 0; }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(20, 94, 168, 0.08);
      color: var(--primary);
      font-size: 12px;
      font-weight: 700;
    }
    .muted { color: var(--muted); line-height: 1.7; }
    .form-grid {
      display: grid;
      gap: 12px;
      margin-top: 18px;
    }
    label {
      display: grid;
      gap: 6px;
      font-size: 13px;
      color: var(--muted);
    }
    input, button {
      width: 100%;
      padding: 11px 12px;
      border-radius: 12px;
      border: 1px solid var(--line);
      font: inherit;
    }
    input { background: rgba(255, 255, 255, 0.96); }
    button {
      cursor: pointer;
      background: var(--primary);
      color: #fff;
      border: 0;
      font-weight: 700;
      box-shadow: 0 12px 24px rgba(20, 94, 168, 0.2);
    }
    button.secondary {
      background: #fff;
      color: var(--primary);
      border: 1px solid var(--line);
      box-shadow: none;
    }
    button:disabled { opacity: .6; cursor: not-allowed; }
    .checkbox-row {
      display: flex;
      gap: 8px;
      align-items: center;
      color: var(--muted);
      font-size: 13px;
    }
    .checkbox-row input {
      width: auto;
      padding: 0;
      margin: 0;
    }
    .action-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .notice {
      margin-top: 12px;
      min-height: 20px;
      color: var(--danger);
      white-space: pre-wrap;
    }
    .session-card {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px;
      background: rgba(255, 255, 255, 0.92);
    }
    .session-card + .session-card { margin-top: 12px; }
    .session-ok {
      background: var(--ok-bg);
      color: var(--ok-text);
      border-color: rgba(23, 102, 61, 0.15);
    }
    a { color: var(--primary); }
    code {
      font-family: Consolas, "SFMono-Regular", monospace;
      font-size: 12px;
      background: rgba(19, 34, 56, 0.06);
      padding: 2px 6px;
      border-radius: 999px;
    }
    @media (max-width: 820px) {
      .login-shell { grid-template-columns: 1fr; }
      .action-row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="login-shell">
    <section class="panel">
      <span class="eyebrow">后台登录第一片</span>
      <h1>后台登录</h1>
      <p class="muted">这回总算不是手抄 token 了。用专门的 admin 密码登录接口拿会话，静态后台页会从浏览器存储里自动带上 access token。可它依然只是第一片，不是完整权限矩阵、SSO、多角色导航和生产会话治理，别给自己整出幻觉。</p>
      <div class="form-grid">
        <label>管理员手机号<input id="adminPhoneInput" value="13900139000" autocomplete="username" /></label>
        <label>密码<input id="adminPasswordInput" type="password" autocomplete="current-password" placeholder="请输入后台密码" /></label>
        <label>deviceId<input id="adminDeviceIdInput" placeholder="admin-console-device" /></label>
      </div>
      <div class="checkbox-row">
        <input id="rememberSessionInput" type="checkbox" checked />
        <label for="rememberSessionInput">记住本浏览器后台会话</label>
      </div>
      <div class="action-row">
        <button id="loginButton" type="button" onclick="loginAdmin()">登录后台</button>
        <button class="secondary" type="button" onclick="clearStoredAdminSession()">清空本地会话</button>
      </div>
      <div id="loginNotice" class="notice"></div>
    </section>

    <section class="panel">
      <div class="session-card">
        <h2>演示账号</h2>
        <p class="muted"><code>seed</code> 命令现在会补一个固定演示后台账号：<code>13900139000</code> / <code>Admin123</code>。数据库没跑 <code>node scripts/seed-stage-1.js seed</code> 的话，登不上别甩锅给页面。</p>
      </div>
      <div id="storedSessionCard" class="session-card">
        <h2>当前会话</h2>
        <p id="storedSessionStatus" class="muted">未发现已保存后台会话。</p>
      </div>
      <div class="session-card">
        <h2>快捷入口</h2>
        <p class="muted"><a id="consoleLink" href="/api/admin/console">运营后台工具台</a></p>
        <p class="muted"><a id="fileMaintenanceLink" href="/api/admin/file-maintenance-console">文件维护台</a></p>
        <p class="muted"><a id="financeLink" href="/api/admin/finance-console">财务操作台</a></p>
      </div>
    </section>
  </main>

  <script>
    const apiBase = '/api';
    const adminSessionStorageKey = '${adminSessionStorageKey}';

    function getAdminSessionStorages() {
      return [globalThis.localStorage, globalThis.sessionStorage].filter(storage =>
        storage && typeof storage.getItem === 'function',
      );
    }

    function readStoredAdminSession() {
      for (const storage of getAdminSessionStorages()) {
        try {
          const raw = storage.getItem(adminSessionStorageKey);
          if (!raw) {
            continue;
          }
          const session = JSON.parse(raw);
          if (session && typeof session === 'object') {
            return { session, storage };
          }
        } catch {
          // ignore malformed local cache and continue checking the next storage
        }
      }
      return { session: null, storage: null };
    }

    function createDefaultDeviceId() {
      if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        return 'admin-console-' + globalThis.crypto.randomUUID();
      }
      return 'admin-console-' + Date.now();
    }

    function normalizeRedirect(candidate) {
      if (!candidate || typeof candidate !== 'string') {
        return '/api/admin/console';
      }
      if (!candidate.startsWith('/api/admin/')) {
        return '/api/admin/console';
      }
      return candidate;
    }

    function currentRedirect() {
      return normalizeRedirect(new URLSearchParams(location.search).get('redirect'));
    }

    function setNotice(message) {
      document.getElementById('loginNotice').textContent = message || '';
    }

    function updateStoredSessionCard(session) {
      const card = document.getElementById('storedSessionCard');
      const status = document.getElementById('storedSessionStatus');
      if (session && session.user && session.user.phone) {
        card.className = 'session-card session-ok';
        status.textContent =
          '已保存后台会话：' +
          session.user.phone +
          ' · ' +
          (session.user.userType || 'admin') +
          ' · deviceId ' +
          (session.deviceId || '-');
        return;
      }
      card.className = 'session-card';
      status.textContent = '未发现已保存后台会话。';
    }

    function clearStoredAdminSession() {
      getAdminSessionStorages().forEach(storage => {
        try {
          storage.removeItem(adminSessionStorageKey);
        } catch {
          // ignore browser storage failures in static admin login
        }
      });
      updateStoredSessionCard(null);
      setNotice('本地后台会话已清空。');
    }

    function writeStoredAdminSession(session, rememberSession) {
      const storages = getAdminSessionStorages();
      storages.forEach(storage => {
        try {
          storage.removeItem(adminSessionStorageKey);
        } catch {
          // ignore browser storage failures in static admin login
        }
      });
      const targetStorage = rememberSession
        ? globalThis.localStorage
        : globalThis.sessionStorage;
      if (!targetStorage) {
        return;
      }
      targetStorage.setItem(adminSessionStorageKey, JSON.stringify(session));
    }

    async function loginAdmin() {
      const phone = document.getElementById('adminPhoneInput').value.trim();
      const password = document.getElementById('adminPasswordInput').value;
      const deviceId = document.getElementById('adminDeviceIdInput').value.trim();
      if (!phone || !password || !deviceId) {
        setNotice('请完整填写手机号、密码和 deviceId。');
        return;
      }

      const button = document.getElementById('loginButton');
      button.disabled = true;
      setNotice('正在登录后台...');
      try {
        const response = await fetch(apiBase + '/auth/admin/password-login', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'req_admin_login_' + Date.now(),
          },
          body: JSON.stringify({
            phone,
            password,
            deviceId,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.code !== 'OK' || !payload.data) {
          throw new Error(payload.message || payload.code || '后台登录失败');
        }
        const nextSession = {
          accessToken: payload.data.tokens.accessToken,
          refreshToken: payload.data.tokens.refreshToken,
          deviceId,
          user: payload.data.user,
          storedAtIso: new Date().toISOString(),
        };
        writeStoredAdminSession(
          nextSession,
          document.getElementById('rememberSessionInput').checked,
        );
        updateStoredSessionCard(nextSession);
        setNotice('登录成功，正在跳转后台...');
        location.href = currentRedirect();
      } catch (error) {
        setNotice(error.message || '后台登录失败');
      } finally {
        button.disabled = false;
      }
    }

    (function initializePage() {
      const stored = readStoredAdminSession().session;
      const redirect = currentRedirect();
      document.getElementById('consoleLink').href = redirect;
      document.getElementById('fileMaintenanceLink').href =
        '/api/admin/file-maintenance-console';
      document.getElementById('financeLink').href =
        '/api/admin/finance-console';
      document.getElementById('adminDeviceIdInput').value =
        stored && stored.deviceId ? stored.deviceId : createDefaultDeviceId();
      if (stored && stored.user && stored.user.phone) {
        document.getElementById('adminPhoneInput').value = stored.user.phone;
      }
      updateStoredSessionCard(stored);
    })();
  </script>
</body>
</html>`;
}
