import AsyncStorage from '@react-native-async-storage/async-storage';

export async function readJsonStorage<T>(key: string) {
  const value = await AsyncStorage.getItem(key);

  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    await AsyncStorage.removeItem(key);
    return undefined;
  }
}

export function writeJsonStorage(key: string, value: unknown) {
  return AsyncStorage.setItem(key, JSON.stringify(value));
}

export function removeStorageItem(key: string) {
  return AsyncStorage.removeItem(key);
}

export function fireAndForget(task: Promise<unknown> | void) {
  if (task && typeof (task as Promise<unknown>).catch === 'function') {
    (task as Promise<unknown>).catch(() => undefined);
  }
}
