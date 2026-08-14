import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Read rather than imported: this config is loaded by node, which cannot
// resolve the TypeScript source of a workspace package.
const ports = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../ports.json", import.meta.url)), "utf8"),
) as Record<string, number>;

function port(name: string, fallback: number | undefined): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    if (fallback === undefined) throw new Error(`${name} is unset and ports.json has no default`);
    return fallback;
  }
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer, got: ${raw}`);
  return Number.parseInt(raw, 10);
}

const serverOrigin = `http://127.0.0.1:${port("LUMEM_PORT", ports["server"])}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: port("LUMEM_WEB_PORT", ports["web"]),
    // Without this, an occupied port silently moves the dev server elsewhere
    // and the e2e harness ends up driving whatever else is listening.
    strictPort: true,
    proxy: {
      "/trpc": { target: serverOrigin, changeOrigin: true },
      "/pty": { target: serverOrigin, ws: true, changeOrigin: true },
    },
  },
});
