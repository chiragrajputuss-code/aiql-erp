import { defineWorkspace } from "vitest/config";

export default defineWorkspace(["packages/db", "packages/tokeniser", "packages/erp-connectors", "packages/schema-intel", "packages/query-engine", "apps/web"]);
