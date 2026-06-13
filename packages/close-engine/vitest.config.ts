import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name:        "close-engine",
    environment: "node",
    globals:     true,
    coverage: {
      reporter:    ["text", "lcov"],
      include:     ["src/**/*.ts"],
      exclude:     ["src/**/*.test.ts", "src/index.ts"],
    },
  },
});
