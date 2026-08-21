import path from "node:path";

import express, { Router, type RequestHandler } from "express";
import swaggerUi from "swagger-ui-express";

import { openApiDocument } from "../docs/openapi";

export const docsRouter = Router();

// The raw document, for client generators and for diffing the contract in CI.
docsRouter.get("/docs.json", (_req, res) => {
  res.json(openApiDocument);
});

/**
 * Swagger UI.
 *
 * helmet's default Content-Security-Policy blocks the inline styles and
 * scripts swagger-ui injects, so the page renders blank with CSP violations in
 * the console. Rather than loosen the policy for the whole app, the CSP header
 * is dropped for this subtree only — it serves a static, self-contained
 * document viewer and handles no user input.
 */
const allowSwaggerAssets: RequestHandler = (_req, res, next) => {
  res.removeHeader("Content-Security-Policy");
  next();
};

/**
 * Fallback location for Swagger UI's static assets.
 *
 * swagger-ui-express serves them from swagger-ui-dist's own place in
 * node_modules, which under pnpm is the workspace root — outside apps/backend,
 * and therefore absent from a serverless bundle that only carries files from
 * the project root. There the package's static middleware misses every request
 * and the page renders blank.
 *
 * `scripts/copy-swagger-assets.js` copies them beside the compiled route file
 * at build time, so this directory exists in production and does not in dev
 * (where the package resolves normally and swaggerUi.serve answers first).
 * express.static calls next() on a miss, so mounting both is safe either way.
 */
const bundledAssets = path.join(__dirname, "swagger-ui-assets");

docsRouter.use(
  "/docs",
  allowSwaggerAssets,
  swaggerUi.serve,
  express.static(bundledAssets),
  swaggerUi.setup(openApiDocument, {
    customSiteTitle: "JPC Space API",
    swaggerOptions: {
      // Collapsed by default: 23 endpoints across 8 tags is unreadable expanded.
      docExpansion: "list",
      // Keep a pasted token across reloads while exploring the API.
      persistAuthorization: true,
    },
  }),
);
