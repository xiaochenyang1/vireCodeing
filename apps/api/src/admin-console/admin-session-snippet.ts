export const adminSessionStorageKey = 'stage1AdminSession';

type AdminSessionControlsOptions = {
  currentRoute: string;
  wrapperClass?: string;
  linkClass?: string;
  buttonClass?: string;
  hintClass?: string;
  linkLabel?: string;
  linkId?: string;
  hintId?: string;
};

type AdminSessionScriptOptions = {
  currentRoute: string;
  tokenInputId?: string;
  linkId?: string;
  hintId?: string;
};

export function renderAdminSessionControls({
  currentRoute,
  wrapperClass = 'session-row',
  linkClass = 'session-link',
  buttonClass = 'secondary-button',
  hintClass = 'muted',
  linkLabel = '后台登录页',
  linkId = 'adminLoginLink',
  hintId = 'adminSessionHint',
}: AdminSessionControlsOptions) {
  return `<div class="${wrapperClass}"><a id="${linkId}" class="${linkClass}" href="/api/admin/login?redirect=${encodeURIComponent(
    currentRoute,
  )}">${linkLabel}</a><button type="button" class="${buttonClass}" onclick="clearStoredAdminSession()">清空登录</button><span id="${hintId}" class="${hintClass}">尝试读取已保存后台会话...</span></div>`;
}

export function renderAdminSessionScript({
  currentRoute,
  tokenInputId = 'adminToken',
  linkId = 'adminLoginLink',
  hintId = 'adminSessionHint',
}: AdminSessionScriptOptions) {
  return `
    const adminSessionStorageKey = '${adminSessionStorageKey}';

    function getAdminSessionStorages() {
      return [globalThis.localStorage, globalThis.sessionStorage].filter(storage =>
        storage && typeof storage.getItem === 'function',
      );
    }

    function readStoredAdminSession() {
      const storages = getAdminSessionStorages();
      for (const storage of storages) {
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
      return { session: null, storage: storages[0] };
    }

    function persistAdminAccessToken() {
      const input = document.getElementById('${tokenInputId}');
      const value =
        input && typeof input.value === 'string' ? input.value.trim() : '';
      if (!value) {
        return;
      }
      const stored = readStoredAdminSession();
      if (!stored.storage) {
        return;
      }
      try {
        stored.storage.setItem(
          adminSessionStorageKey,
          JSON.stringify({
            ...(stored.session || {}),
            accessToken: value,
          }),
        );
      } catch {
        // ignore browser storage failures in static admin tools
      }
    }

    function clearStoredAdminSession() {
      getAdminSessionStorages().forEach(storage => {
        try {
          storage.removeItem(adminSessionStorageKey);
        } catch {
          // ignore browser storage failures in static admin tools
        }
      });
      const input = document.getElementById('${tokenInputId}');
      if (input) {
        input.value = '';
      }
      const hint = document.getElementById('${hintId}');
      if (hint) {
        hint.textContent = '后台会话已清空，本页后续请求会要求重新登录。';
      }
    }

    function buildAdminLoginHref() {
      return '/api/admin/login?redirect=' + encodeURIComponent(${JSON.stringify(
        currentRoute,
      )});
    }

    function initializeAdminSession() {
      const stored = readStoredAdminSession();
      const input = document.getElementById('${tokenInputId}');
      if (
        input &&
        stored.session &&
        typeof stored.session.accessToken === 'string'
      ) {
        input.value = stored.session.accessToken;
      }
      const link = document.getElementById('${linkId}');
      if (link) {
        link.href = buildAdminLoginHref();
      }
      const hint = document.getElementById('${hintId}');
      if (hint) {
        if (stored.session?.user?.phone) {
          hint.textContent =
            '已载入后台会话：' +
            stored.session.user.phone +
            ' · deviceId ' +
            (stored.session.deviceId || '-');
        } else if (stored.session?.accessToken) {
          hint.textContent = '已载入本地保存的 admin token，可直接操作当前页面。';
        } else {
          hint.textContent = '未发现已保存后台会话，可先去后台登录页。';
        }
      }
      return stored.session;
    }
  `;
}
