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

const { createApp } = require("../dist/apps/backend/src/app");

module.exports = createApp();
