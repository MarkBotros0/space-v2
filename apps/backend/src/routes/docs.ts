import { Router, type RequestHandler } from "express";
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

docsRouter.use(
  "/docs",
  allowSwaggerAssets,
  swaggerUi.serve,
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
