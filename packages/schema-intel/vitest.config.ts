import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    name: "schema-intel",
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@aiql/erp-connectors": path.resolve(__dirname, "../erp-connectors/src"),
      "@aiql/tokeniser":      path.resolve(__dirname, "../tokeniser/src"),
    },
  },
});
