/**
 * Copy Swagger UI's static assets into the build output.
 *
 * swagger-ui-express serves these with an express.static pointed at
 * swagger-ui-dist's own location inside node_modules. Under pnpm that resolves
 * to the workspace root (node_modules/.pnpm/...), which is outside
 * apps/backend — and a serverless bundle only carries files from the project
 * root, so on Vercel every asset 404s and the docs page renders blank with no
 * error beyond four failed requests.
 *
 * Copying them next to the compiled route file makes the docs self-contained:
 * routes/docs.ts serves this directory as a fallback after swagger-ui-express's
 * own static middleware misses. No CDN, so the docs keep working offline and on
 * a locked-down network.
 */

const { cpSync, existsSync, mkdirSync } = require("node:fs");
const path = require("node:path");

const DEST = path.resolve(__dirname, "../dist/apps/backend/src/routes/swagger-ui-assets");

function main() {
  let sourceDir;
  try {
    sourceDir = path.dirname(require.resolve("swagger-ui-dist/swagger-ui.css"));
  } catch {
    console.error(
      "[copy-swagger-assets] Could not resolve swagger-ui-dist. Is it installed? " +
        "The docs page will 404 its assets without these files.",
    );
    process.exit(1);
  }

  if (!existsSync(path.dirname(DEST))) {
    console.error(
      `[copy-swagger-assets] ${path.dirname(DEST)} does not exist — run tsc first; ` +
        "this script copies into the compiled output.",
    );
    process.exit(1);
  }

  mkdirSync(DEST, { recursive: true });

  // Only what the browser actually requests. Copying the whole package would
  // drag ~10MB of source maps and ESM variants into every function bundle.
  const assets = [
    "swagger-ui.css",
    "swagger-ui-bundle.js",
    "swagger-ui-standalone-preset.js",
    "favicon-32x32.png",
    "favicon-16x16.png",
  ];

  for (const asset of assets) {
    const from = path.join(sourceDir, asset);
    if (!existsSync(from)) {
      console.error(`[copy-swagger-assets] missing expected asset: ${asset}`);
      process.exit(1);
    }
    cpSync(from, path.join(DEST, asset));
  }

  console.log(`[copy-swagger-assets] copied ${assets.length} files -> ${path.relative(process.cwd(), DEST)}`);
}

main();
