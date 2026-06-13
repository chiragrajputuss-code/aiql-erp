import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    name: "erp-connectors",
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@aiql/schema-intel": path.resolve(__dirname, "../schema-intel/src"),
    },
  },
});
