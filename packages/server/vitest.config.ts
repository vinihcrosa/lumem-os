import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "server",
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration tests spawn real processes and real git repos; give them room.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
