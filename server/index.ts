import { buildServer } from "./app";
import { closeDb } from "./db/client";
import { env } from "./env";
import { closeRealtimeConnections } from "./realtime/realtimeConnectionRegistry";

let server: Awaited<ReturnType<typeof buildServer>> | null = null;
let shutdownPromise: Promise<void> | null = null;

function runtimeContext(extra: Record<string, unknown> = {}) {
  return {
    pid: process.pid,
    uptimeMs: Math.round(process.uptime() * 1000),
    ...extra,
  };
}

function logInfo(message: string, extra: Record<string, unknown> = {}) {
  if (server) {
    server.log.info(runtimeContext(extra), message);
    return;
  }
  console.info(message, runtimeContext(extra));
}

function logError(message: string, error: unknown, extra: Record<string, unknown> = {}) {
  const payload = error instanceof Error ? { err: error, ...runtimeContext(extra) } : { error, ...runtimeContext(extra) };
  if (server) {
    server.log.error(payload, message);
    return;
  }
  console.error(message, payload);
}

try {
  server = await buildServer();
  await server.listen({ host: env.SERVER_HOST, port: env.SERVER_PORT });
  logInfo("ORF backend listening", { host: env.SERVER_HOST, port: env.SERVER_PORT });
} catch (error) {
  if (server) {
    logError("ORF backend failed to start", error, { host: env.SERVER_HOST, port: env.SERVER_PORT });
    await server.close();
  } else {
    logError("ORF backend failed before logger initialization", error);
  }
  await closeDb();
  process.exit(1);
}

const shutdown = (reason: string) => {
  if (!shutdownPromise) {
    shutdownPromise = (async () => {
      logInfo("ORF backend shutdown started", { reason });
      const realtimeConnectionsClosed = closeRealtimeConnections();
      logInfo("ORF realtime connections closed", { realtimeConnectionsClosed, reason });
      await server?.close();
      await closeDb();
      logInfo("ORF backend shutdown completed", { reason });
    })();
  }
  return shutdownPromise;
};

function requestShutdown(reason: string, exitCode: number) {
  void shutdown(reason)
    .then(() => process.exit(exitCode))
    .catch((error) => {
      logError("ORF backend shutdown failed", error, { reason });
      process.exit(1);
    });
}

process.on("SIGINT", () => {
  requestShutdown("SIGINT", 0);
});

process.on("SIGTERM", () => {
  requestShutdown("SIGTERM", 0);
});

process.on("uncaughtException", (error) => {
  logError("ORF backend uncaught exception", error);
  requestShutdown("uncaughtException", 1);
});

process.on("unhandledRejection", (reason) => {
  logError("ORF backend unhandled rejection", reason);
  requestShutdown("unhandledRejection", 1);
});
