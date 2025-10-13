/** @type {import('jest').Config} */
const config = {
  displayName: 'backend-api',
  testEnvironment: 'node',
  rootDir: __dirname,
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        swcrc: false,
        jsc: {
          target: 'es2021',
          parser: {
            syntax: 'typescript',
            decorators: true,
          },
          transform: {
            legacyDecorator: true,
          },
        },
        module: {
          type: 'commonjs',
        },
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: [
    '<rootDir>/**/*.test.ts',
    '<rootDir>/**/*.test.tsx',
    '<rootDir>/**/*.spec.ts',
    '<rootDir>/**/*.spec.tsx',
  ],
  moduleDirectories: ['node_modules', '<rootDir>/src', '<rootDir>'],
  coverageDirectory: '<rootDir>/../coverage/backend-api',
  collectCoverageFrom: ['<rootDir>/src/**/*.{ts,tsx}', '!<rootDir>/src/**/*.d.ts'],
};

module.exports = config;
