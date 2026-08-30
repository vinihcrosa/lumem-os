import { fileURLToPath } from "node:url";

import { setVersion } from "./set-version.js";

const version = process.argv[2];
if (version === undefined) {
  console.error("uso: pnpm version:set <x.y.z>");
  process.exit(2);
}

const root = fileURLToPath(new URL("..", import.meta.url));
try {
  for (const path of setVersion(root, version)) console.log(path);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
