import { bootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";

await bootstrap({ config: loadConfig() });
