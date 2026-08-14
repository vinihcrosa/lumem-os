import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { createShutdownHandler } from "./shutdown.js";

const config = loadConfig();
const app = await createServer({ config, logger: true });

const shutdown = createShutdownHandler({
  target: app,
  exit: (code) => process.exit(code),
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

await app.listen({ port: config.port, host: config.host });
app.log.info({ port: config.port, host: config.host }, "lumem daemon listening");
