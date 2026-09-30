import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "desktop",
    environment: "node",
    // `e2e/` is Playwright's, and `vitest run` must never load a spec that needs a real Electron.
    include: ["src/**/*.test.ts"],
  },
});
