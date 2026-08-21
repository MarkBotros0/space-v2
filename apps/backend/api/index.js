/**
 * Vercel serverless entrypoint.
 *
 * Deliberately JavaScript, not TypeScript. Vercel type-checks `.ts` functions
 * with its own compiler settings rather than this project's
 * `tsconfig.build.json`, and it does so with `strictNullChecks` off. Zod
 * decides field optionality via `undefined extends T`, which is true for every
 * type once `strictNullChecks` is off — so every field of every schema in the
 * codebase infers as optional and the build fails on type errors that do not
 * exist under the project's real settings. Zod documents strict mode as a
 * requirement.
 *
 * Requiring the compiled output sidesteps that entirely: the type checking
 * already happened during `turbo build`, with the correct tsconfig. There is
 * no TypeScript here for Vercel to re-check with the wrong one.
 *
 * `src/server.ts` remains the entrypoint for container hosts and local dev —
 * it calls app.listen(), which a serverless runtime never invokes. Both share
 * `createApp()`, so there is one app definition, not two.
 */

// Two things can throw before a single request is served, and a serverless
// platform reports both as an opaque FUNCTION_INVOCATION_FAILED:
//
//   1. the require() below, if `dist/` was not bundled into the function;
//   2. createApp() -> src/lib/config.ts, which throws at module load when
//      DATABASE_URL or AUTH_SECRET is missing from the runtime environment.
//
// Catching them turns "this function has crashed" into a message that names
// the cause, which is otherwise only visible in the platform's own logs.
let app = null;
let bootError = null;

try {
  const { createApp } = require("../dist/apps/backend/src/app");
  app = createApp();
} catch (err) {
  bootError = err;
  // Full detail (including the stack) goes to the platform log only.
  console.error("[api] boot failed:", err);
}

module.exports = (req, res) => {
  if (bootError) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    // Message only, never the stack: a stack would leak absolute build paths.
    // config.ts's message names the missing environment keys, not their
    // values, so it is safe to surface and is the whole point of this branch.
    res.end(
      JSON.stringify({
        error: { code: "boot_failed", message: String(bootError && bootError.message) },
      }),
    );
    return;
  }
  return app(req, res);
};
