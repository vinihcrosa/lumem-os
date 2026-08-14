import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const SERVER_PORT = process.env["LUMEM_PORT"] ?? "4317";
const SERVER_ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4318,
    proxy: {
      "/trpc": { target: SERVER_ORIGIN, changeOrigin: true },
      "/pty": { target: SERVER_ORIGIN, ws: true, changeOrigin: true },
    },
  },
});
