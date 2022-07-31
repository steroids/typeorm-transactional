module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverageFrom: ['**/*.(t|j)s', '!**/node_modules/**', '!dist/**'],
  coverageDirectory: './coverage',
  coverageReporters: ['json', 'html'],
  testEnvironment: 'node',
};
