import { readJsonStorage, removeStorageItem, writeJsonStorage } from './storage';

const DEVICE_ID_STORAGE_KEY = '@vireCodeing/device-id';
export const LEGACY_DEFAULT_DEVICE_ID = 'local-device';
const DEVICE_ID_PREFIX = 'mobile-device';

let activeDeviceId: string | undefined;

function normalizeDeviceId(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function createGeneratedDeviceId() {
  const cryptoApi = globalThis as typeof globalThis & {
    crypto?: { randomUUID?: () => string };
  };
  const randomSegment =
    cryptoApi.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  return `${DEVICE_ID_PREFIX}-${randomSegment}`;
}

export async function hydrateDeviceId(fallbackDeviceId?: string) {
  const storedDeviceId = normalizeDeviceId(
    await readJsonStorage<string>(DEVICE_ID_STORAGE_KEY),
  );
  const nextDeviceId =
    storedDeviceId ??
    normalizeDeviceId(fallbackDeviceId) ??
    createGeneratedDeviceId();

  activeDeviceId = nextDeviceId;

  if (storedDeviceId !== nextDeviceId) {
    await writeJsonStorage(DEVICE_ID_STORAGE_KEY, nextDeviceId);
  }

  return nextDeviceId;
}

export function getDeviceId() {
  return activeDeviceId ?? LEGACY_DEFAULT_DEVICE_ID;
}

export function clearDeviceId() {
  activeDeviceId = undefined;
  return removeStorageItem(DEVICE_ID_STORAGE_KEY);
}
