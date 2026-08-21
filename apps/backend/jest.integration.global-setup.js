// Jest `globalSetup` for the integration suite only (wired in
// jest.integration.config.js). Runs once, in its own process/module
// registry outside the normal Jest test environment — that's why it needs
// its own ts-node registration to load `src/db/client.ts` (ts-jest's
// transform only applies inside the test environment, not here).
//
// Why this exists: the integration suite shares one live (staging) Neon
// database that autosuspends when idle. A cold connection's first query
// commonly fails with PrismaClientKnownRequestError ETIMEDOUT — the `pg`
// driver's connect timeout expires before Neon finishes waking (observed
// ~22s to wake, but a loaded instance can take longer). Whichever suite
// happens to run first while the database is cold eats that failure inside
// cleanupTestData()'s first query in beforeAll, taking the whole suite down.
//
// `jest.setTimeout(60000)` in the suites does not fix this: it raises Jest's
// per-test budget, but the `pg` driver gives up long before that budget is
// spent. The real fix is to warm the connection — with retries, since a
// single long-timeout query still fails on the first attempt — before any
// suite starts.
require("ts-node").register({ transpileOnly: true });

const RETRY_DELAY_MS = 3000;
const OVERALL_DEADLINE_MS = 120000;

module.exports = async function globalSetup() {
  // Imported here (after ts-node registration) rather than at module scope,
  // so this file can be required by tools that never call the exported
  // function without paying the registration cost.
  const { db } = require("./src/db/client");

  const start = Date.now();
  let attempt = 0;
  let lastError;

  try {
    while (Date.now() - start < OVERALL_DEADLINE_MS) {
      attempt += 1;
      try {
        // Read-only, touches no application data: a literal SELECT, not a
        // table query.
        await db.$queryRaw`SELECT 1`;
        const elapsedMs = Date.now() - start;
        console.log(
          `[jest.integration.global-setup] database reachable after ${attempt} attempt(s), ${elapsedMs}ms`,
        );
        return;
      } catch (err) {
        lastError = err;
        const elapsedMs = Date.now() - start;
        if (elapsedMs >= OVERALL_DEADLINE_MS) {
          break;
        }
        const remainingMs = OVERALL_DEADLINE_MS - elapsedMs;
        const delayMs = Math.min(RETRY_DELAY_MS, remainingMs);
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    const elapsedMs = Date.now() - start;
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `[jest.integration.global-setup] could not reach the staging database after ${attempt} attempt(s) over ${elapsedMs}ms — integration suite cannot run. Last error: ${reason}`,
    );
  } finally {
    await db.$disconnect();
  }
};
