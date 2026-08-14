import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    name: "web",
    environment: "jsdom",
    // No `globals` — every test imports from "vitest" explicitly, and enabling
    // it without the matching tsconfig types is config that does nothing.
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.tsx", "src/**/*.test.ts"],
  },
});
