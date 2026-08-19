import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Relative import, not "@lumem/shared": vite loads this config through node,
// which cannot resolve the TypeScript source of a workspace package. A relative
// path is bundled by esbuild instead, so it works — and it keeps a single
// reader of ports.json for the whole repo.
import { SERVER_PORT, WEB_PORT } from "../../ports.js";

function port(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer, got: ${raw}`);
  return Number.parseInt(raw, 10);
}

const serverOrigin = `http://127.0.0.1:${port("LUMEM_PORT", SERVER_PORT)}`;

export default defineConfig({
  plugins: [react()],
  server: {
    // Explícito, e não o default `localhost`: num runner com IPv6 o vite
    // escuta em `::1` e um GET em `127.0.0.1` é recusado. O daemon já publica
    // em 127.0.0.1, e o e2e fala com os dois pelo mesmo endereço.
    host: "127.0.0.1",
    port: port("LUMEM_WEB_PORT", WEB_PORT),
    // Without this, an occupied port silently moves the dev server elsewhere
    // and the e2e harness ends up driving whatever else is listening.
    strictPort: true,
    proxy: {
      "/trpc": { target: serverOrigin, changeOrigin: true },
      "/pty": { target: serverOrigin, ws: true, changeOrigin: true },
      // The conversation's own endpoint. Listed separately because the daemon
      // serves the two protocols on two paths (D2), and a proxy that only knows
      // about one leaves the other's socket connecting forever — which on screen
      // is a conversation stuck on "conectando…" with nothing to explain it.
      "/acp": { target: serverOrigin, ws: true, changeOrigin: true },
    },
  },
});
