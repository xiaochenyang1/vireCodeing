/* global jest */

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();

  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async key => store.get(key) ?? null),
      setItem: jest.fn(async (key, value) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async key => {
        store.delete(key);
      }),
      getMany: jest.fn(async keys =>
        keys.reduce((result, key) => {
          result[key] = store.get(key) ?? null;
          return result;
        }, {}),
      ),
      setMany: jest.fn(async entries => {
        Object.entries(entries).forEach(([key, value]) => {
          store.set(key, value);
        });
      }),
      removeMany: jest.fn(async keys => {
        keys.forEach(key => {
          store.delete(key);
        });
      }),
      getAllKeys: jest.fn(async () => Array.from(store.keys())),
      clear: jest.fn(async () => {
        store.clear();
      }),
    },
  };
});

const originalConsoleError = console.error;

console.error = (...args) => {
  const [message] = args;

  if (
    typeof message === 'string' &&
    message.includes('An update to') &&
    message.includes('was not wrapped in act')
  ) {
    return;
  }

  originalConsoleError(...args);
};
