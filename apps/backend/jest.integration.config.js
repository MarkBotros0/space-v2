const base = require("./jest.config.js");

// Integration suites share one live (staging) database and self-clean by a
// TEST_PREFIX convention: every suite's beforeAll/afterAll wipes *all*
// "space-v2-test-" rows via cleanupTestData() in
// src/__tests__/integration/fixtures.ts, not just the rows it created
// itself. That is only safe when suites run one at a time — if two suites'
// beforeAll/afterAll interleave, one can delete another's in-flight
// fixtures.
//
// The `test:integration` script has always passed `--runInBand` to enforce
// this, but a CLI flag is easy to drop (a copy-paste of the script, a
// one-off `jest --testPathPattern integration` invocation, a CI config that
// "simplifies" the command). `maxWorkers: 1` here bakes the same guarantee
// into the config itself, so serial execution survives even if
// `--runInBand` is ever removed from the script.
module.exports = {
  ...base,
  maxWorkers: 1,
};
