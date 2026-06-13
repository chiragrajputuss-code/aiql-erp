import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "db",
    environment: "node",
    globals: true,
    testTimeout: 15000,
  },
});
