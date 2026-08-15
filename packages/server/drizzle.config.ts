import { defineConfig } from "drizzle-kit";

/**
 * Only `drizzle-kit generate` reads this. The daemon never does: it migrates
 * through `openDatabase`, against whatever file the config points at.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
