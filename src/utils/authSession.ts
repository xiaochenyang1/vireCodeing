import {
  fireAndForget,
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from './storage';

const LOCAL_AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AUTH_SESSION_STORAGE_KEY = '@vireCodeing/auth-session';

export type AuthSessionSnapshot = {
  issuedAt: number;
  expiresAt: number;
  accessToken?: string;
  refreshToken?: string;
  deviceId?: string;
};

let activeSession: AuthSessionSnapshot | undefined;

export type AuthSessionTokenInput = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

function createSession(
  now: number,
  tokenInput?: AuthSessionTokenInput,
  deviceId?: string,
): AuthSessionSnapshot {
  const normalizedDeviceId = normalizeDeviceId(deviceId);

  if (tokenInput) {
    return {
      issuedAt: now,
      expiresAt: now + tokenInput.expiresIn * 1000,
      accessToken: tokenInput.accessToken,
      refreshToken: tokenInput.refreshToken,
      ...(normalizedDeviceId ? {deviceId: normalizedDeviceId} : {}),
    };
  }

  return {
    issuedAt: now,
    expiresAt: now + LOCAL_AUTH_SESSION_TTL_MS,
    ...(normalizedDeviceId ? {deviceId: normalizedDeviceId} : {}),
  };
}

function isValidSession(
  session: AuthSessionSnapshot | undefined,
): session is AuthSessionSnapshot {
  return (
    Boolean(session) &&
    typeof session?.issuedAt === 'number' &&
    typeof session?.expiresAt === 'number' &&
    (session?.deviceId === undefined ||
      (typeof session.deviceId === 'string' &&
        session.deviceId.trim().length > 0))
  );
}

function normalizeDeviceId(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

export async function hydrateAuthSession(
  now = Date.now(),
  legacyDeviceId?: string,
) {
  const storedSession = await readJsonStorage<AuthSessionSnapshot>(
    AUTH_SESSION_STORAGE_KEY,
  );

  if (!isValidSession(storedSession) || storedSession.expiresAt <= now) {
    activeSession = undefined;
    await removeStorageItem(AUTH_SESSION_STORAGE_KEY);
    return;
  }

  const nextDeviceId =
    normalizeDeviceId(storedSession.deviceId) ??
    (storedSession.refreshToken
      ? normalizeDeviceId(legacyDeviceId)
      : undefined);
  activeSession = {
    ...storedSession,
    deviceId: nextDeviceId,
  };

  if (!nextDeviceId) {
    delete activeSession.deviceId;
  }

  if (storedSession.deviceId !== nextDeviceId) {
    await writeJsonStorage(AUTH_SESSION_STORAGE_KEY, activeSession);
  }
}

export function hasSavedAuthSession(now = Date.now()) {
  if (!activeSession) {
    return false;
  }

  if (activeSession.expiresAt <= now) {
    activeSession = undefined;
    fireAndForget(removeStorageItem(AUTH_SESSION_STORAGE_KEY));
    return false;
  }

  return true;
}

export function saveAuthSession(
  now = Date.now(),
  tokenInput?: AuthSessionTokenInput,
  deviceId?: string,
) {
  activeSession = createSession(
    now,
    tokenInput,
    normalizeDeviceId(deviceId) ?? activeSession?.deviceId,
  );
  fireAndForget(writeJsonStorage(AUTH_SESSION_STORAGE_KEY, activeSession));
}

export function refreshAuthSession(now = Date.now()) {
  if (!hasSavedAuthSession(now)) {
    return false;
  }

  const currentSession = activeSession;

  if (!currentSession) {
    return false;
  }

  if (currentSession.accessToken && currentSession.refreshToken) {
    activeSession = currentSession;
  } else {
    activeSession = createSession(now, undefined, currentSession.deviceId);
  }

  fireAndForget(writeJsonStorage(AUTH_SESSION_STORAGE_KEY, activeSession));
  return true;
}

export function getAuthSessionSnapshot() {
  return activeSession ? { ...activeSession } : undefined;
}

export function clearAuthSession() {
  activeSession = undefined;
  fireAndForget(removeStorageItem(AUTH_SESSION_STORAGE_KEY));
}
