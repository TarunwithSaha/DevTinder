module.exports = {
  testEnvironment: "node",
  testTimeout: 60000, // the first run downloads a MongoDB binary
  collectCoverageFrom: ["src/**/*.js", "!src/server.js"],
  coverageDirectory: "coverage",
};