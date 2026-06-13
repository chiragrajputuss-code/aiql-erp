import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    name: "web",
    environment: "node",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@aiql/db": path.resolve(__dirname, "../../packages/db/src"),
    },
  },
});
