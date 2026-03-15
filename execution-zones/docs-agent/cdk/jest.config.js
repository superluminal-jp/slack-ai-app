module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  moduleNameMapper: {
    '^@slack-ai-app/cdk-tooling$': '<rootDir>/../../../platform/tooling/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  }
};
