import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^uuid$': '<rootDir>/common/uuid.shim.ts',
  },

  // ── Flaky-test / shared-state mitigations (#451) ──────────────
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Ensure every test file gets its own module registry so that
  // module-level Maps / caches don't leak between suites.
  resetModules: true,

  // ── Migration test configuration (#398) ──────────────────
  // Exclude boilerplate from coverage to focus on business logic
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/test/',
    '\\.module\\.ts$',
    '\\.dto\\.ts$',
    '\\.entity\\.ts$',
    'main\\.ts$',
  ],

};

export default config;