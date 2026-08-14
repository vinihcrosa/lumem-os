import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

const config = loadConfig();
const app = await createServer({ config, logger: true });

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  // A second Ctrl-C while the first close is still draining must not start
  // a second close — fastify throws on re-entrant close.
  if (shuttingDown) return;
  shuttingDown = true;

  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, "shutdown failed");
    process.exit(1);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

await app.listen({ port: config.port, host: config.host });
app.log.info({ port: config.port, host: config.host }, "lumem daemon listening");
