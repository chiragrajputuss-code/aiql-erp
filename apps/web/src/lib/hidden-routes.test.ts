import { describe, it, expect } from "vitest";
import { isHiddenRoute } from "./hidden-routes";

// The product is Practice, Investigations, Connections and Settings. Everything
// else is hidden. This guards against a hidden screen leaking back, and against
// the hide list swallowing a screen customers need.
describe("hidden routes", () => {
  it.each([
    "/dashboard", "/onboarding", "/query", "/history", "/close", "/close/abc/dashboard",
    "/knowledge", "/usage", "/api-keys", "/settings/llm", "/settings/api-keys",
    "/tokenisation/config", "/tokenisation/preview", "/llm-privacy-demo",
    "/connections/c1/chat", "/connections/c1/schema", "/connections/c1/flux",
    "/connections/c1/pulse/settings", "/connections/c1/reconcile", "/connections/c1/scan",
    "/connections/c1/doc-scan", "/connections/c1/account-mapping", "/connections/c1/vendor-compliance",
  ])("%s is hidden", (p) => expect(isHiddenRoute(p)).toBe(true));

  it.each([
    "/practice", "/investigations", "/connections", "/connections/new", "/connections/c1",
    "/connections/c1/data", "/billing", "/settings/general", "/settings/team", "/settings/billing",
    "/sample-report", "/login", "/closeout", "/querying",
  ])("%s stays reachable", (p) => expect(isHiddenRoute(p)).toBe(false));
});
