import { fileURLToPath } from "node:url";

import { run } from "./ensure-pty-helper.js";

const nodeModules = fileURLToPath(new URL("../node_modules/", import.meta.url));
const fixed = run(nodeModules);

if (fixed.length > 0) {
  console.log(`ensure-pty-helper — restored the executable bit on ${fixed.length} file(s).`);
}
