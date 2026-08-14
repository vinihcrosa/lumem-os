import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { createShutdownHandler } from "./shutdown.js";
import { installSignalHandlers } from "./signals.js";

const config = loadConfig();
const app = await createServer({ config, logger: true });

installSignalHandlers(
  process,
  createShutdownHandler({ target: app, exit: (code) => process.exit(code) }),
);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  // EADDRINUSE is the single most common way starting the daemon fails, and a
  // raw node stack trace buries the one thing worth saying about it.
  const reason = error instanceof Error ? error.message : String(error);
  app.log.error({ err: error, port: config.port }, `cannot listen on ${config.port}: ${reason}`);
  process.exit(1);
}

app.log.info({ port: config.port, host: config.host }, "lumem daemon listening");
