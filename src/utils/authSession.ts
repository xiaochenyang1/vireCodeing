import {
  fireAndForget,
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from './storage';

const LOCAL_AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AUTH_SESSION_STORAGE_KEY = '@vireCodeing/auth-session';

type AuthSessionSnapshot = {
  issuedAt: number;
  expiresAt: number;
  accessToken?: string;
  refreshToken?: string;
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
): AuthSessionSnapshot {
  if (tokenInput) {
    return {
      issuedAt: now,
      expiresAt: now + tokenInput.expiresIn * 1000,
      accessToken: tokenInput.accessToken,
      refreshToken: tokenInput.refreshToken,
    };
  }

  return {
    issuedAt: now,
    expiresAt: now + LOCAL_AUTH_SESSION_TTL_MS,
  };
}

function isValidSession(
  session: AuthSessionSnapshot | undefined,
): session is AuthSessionSnapshot {
  return (
    Boolean(session) &&
    typeof session?.issuedAt === 'number' &&
    typeof session?.expiresAt === 'number'
  );
}

export async function hydrateAuthSession(now = Date.now()) {
  const storedSession = await readJsonStorage<AuthSessionSnapshot>(
    AUTH_SESSION_STORAGE_KEY,
  );

  if (!isValidSession(storedSession) || storedSession.expiresAt <= now) {
    activeSession = undefined;
    await removeStorageItem(AUTH_SESSION_STORAGE_KEY);
    return;
  }

  activeSession = storedSession;
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
) {
  activeSession = createSession(now, tokenInput);
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
    activeSession = createSession(now);
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
