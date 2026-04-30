import { buildServer } from "./app";
import { closeDb } from "./db/client";
import { env } from "./env";

const server = await buildServer();

try {
  await server.listen({ host: env.SERVER_HOST, port: env.SERVER_PORT });
} catch (error) {
  server.log.error(error);
  await closeDb();
  process.exit(1);
}

const shutdown = async () => {
  await server.close();
  await closeDb();
};

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
