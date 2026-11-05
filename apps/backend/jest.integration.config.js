const base = require("./jest.config.js");

// Integration suites share one live (staging) database and self-clean by a
// TEST_PREFIX convention: every suite's beforeAll/afterAll wipes *all*
// "space-v2-test-" rows via cleanupTestData() in
// src/__tests__/integration/fixtures.ts, not just the rows it created
// itself. That is only safe when suites run one at a time — if two suites'
// beforeAll/afterAll interleave, one can delete another's in-flight
// fixtures.
//
// `maxWorkers: 1` enforces that in the config itself rather than through a
// CLI flag that is easy to drop (a copy-paste of the script, a one-off
// `jest --testPathPattern integration` invocation, a CI config that
// "simplifies" the command). The `test:integration` script used to pass
// `--runInBand` as well; it no longer does (see workerIdleMemoryLimit below),
// and one worker still runs suites strictly one at a time.
module.exports = {
  ...base,
  maxWorkers: 1,
  // Each suite builds its own app and Prisma client, and the heap they leave
  // behind is not reclaimed between suites when everything runs in one
  // process: by the end of the run it sits near Node's default limit, and a
  // few more suites crash the run with "JavaScript heap out of memory".
  // Setting a limit makes Jest use one child worker (still one at a time,
  // because of maxWorkers above) and restart it whenever it ends a suite
  // above this size. That is also why the test:integration script no longer
  // passes --runInBand: run-in-band ignores this limit.
  workerIdleMemoryLimit: "1GB",
  // Warms the shared Neon staging connection before any suite runs. Neon
  // autosuspends when idle; a cold first query commonly ETIMEDOUTs before
  // Neon finishes waking, which otherwise takes down whichever suite happens
  // to run first. See jest.integration.global-setup.js for the retry logic.
  // Not wired into jest.config.js (unit tests) — those must keep running
  // with no database.
  globalSetup: "<rootDir>/jest.integration.global-setup.js",
};
