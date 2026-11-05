// Must stay the first import: Sentry has to initialise before Express loads.
import "./instrument";

import { createApp } from "./app";
import { db } from "./db/client";
import { config } from "./lib/config";

/** How long in-flight requests get to finish before the process exits anyway. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

const server = createApp().listen(config.port, () => {
  console.log(`space-v2 backend listening on :${config.port}`);
});

/**
 * Graceful shutdown for container hosts (Vercel never runs this file): stop
 * accepting connections, let in-flight requests finish, close the database
 * pool, then exit. A request that never finishes (or a keep-alive socket
 * that never goes idle) can't hold the process past the timeout.
 */
let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down`);

  setTimeout(() => {
    console.error("[server] shutdown timed out, exiting");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  server.close(() => {
    db.$disconnect()
      .catch((err: unknown) => console.error("[server] database disconnect failed:", err))
      .finally(() => process.exit(0));
  });
  // Idle keep-alive sockets would otherwise hold close() open until they time out.
  server.closeIdleConnections();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
