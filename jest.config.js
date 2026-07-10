module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/apps/api/'],
  modulePathIgnorePatterns: ['<rootDir>/.worktrees/'],
  watchPathIgnorePatterns: ['<rootDir>/.worktrees/'],
};
