import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "tokeniser",
    environment: "node",
    globals: true,
  },
});
