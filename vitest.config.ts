import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "scripts"],
    // A run that matched no test files is not a pass. `--changed` in
    // particular will happily exit 0 having executed nothing.
    passWithNoTests: false,
  },
});
