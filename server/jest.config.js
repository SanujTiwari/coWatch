module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 60000,
  forceExit: true,
  detectOpenHandles: true,
  // Set test env to disable rate limiting
  setupFiles: ['<rootDir>/tests/set-env.js'],
};
