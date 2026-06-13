import { describe, it, expect, beforeEach } from "vitest";
import { TokenMap } from "../token-map";

let map: TokenMap;

beforeEach(() => {
  map = new TokenMap();
});

// ── Token format ──────────────────────────────────────────────────────────────

describe("token format", () => {
  it("generates VENDOR_T001 for the first vendor", () => {
    expect(map.addToken("VENDOR", "Acme Corp")).toBe("VENDOR_T001");
  });

  it("pads counter to 3 digits", () => {
    map.addToken("VENDOR", "A");
    map.addToken("VENDOR", "B");
    map.addToken("VENDOR", "C");
    map.addToken("VENDOR", "D");
    map.addToken("VENDOR", "E");
    map.addToken("VENDOR", "F");
    map.addToken("VENDOR", "G");
    map.addToken("VENDOR", "H");
    map.addToken("VENDOR", "I");
    expect(map.addToken("VENDOR", "J")).toBe("VENDOR_T010");
  });

  it("generates CUSTOMER_T001 for first customer", () => {
    expect(map.addToken("CUSTOMER", "Sharma Enterprises")).toBe("CUSTOMER_T001");
  });

  it("generates AMOUNT_T001 for first amount", () => {
    expect(map.addToken("AMOUNT", "500000")).toBe("AMOUNT_T001");
  });

  it("generates ACCT_T001 for first account code", () => {
    expect(map.addToken("ACCT", "4000")).toBe("ACCT_T001");
  });
});

// ── Counter independence ──────────────────────────────────────────────────────

describe("per-category counters", () => {
  it("each category has its own counter", () => {
    expect(map.addToken("VENDOR", "Vendor A")).toBe("VENDOR_T001");
    expect(map.addToken("CUSTOMER", "Customer A")).toBe("CUSTOMER_T001");
    expect(map.addToken("VENDOR", "Vendor B")).toBe("VENDOR_T002");
    expect(map.addToken("CUSTOMER", "Customer B")).toBe("CUSTOMER_T002");
    expect(map.addToken("AMOUNT", "100000")).toBe("AMOUNT_T001");
  });

  it("ENTITY counter is independent", () => {
    map.addToken("VENDOR", "Vendor A");
    map.addToken("VENDOR", "Vendor B");
    expect(map.addToken("ENTITY", "Some Entity")).toBe("ENTITY_T001");
  });
});

// ── Idempotency ───────────────────────────────────────────────────────────────

describe("idempotency — same value reuses token", () => {
  it("returns same token for duplicate value in same category", () => {
    const t1 = map.addToken("VENDOR", "Acme Corp");
    const t2 = map.addToken("VENDOR", "Acme Corp");
    expect(t1).toBe(t2);
    expect(t1).toBe("VENDOR_T001");
  });

  it("does not increment counter for duplicate value", () => {
    map.addToken("VENDOR", "Acme Corp");
    map.addToken("VENDOR", "Acme Corp");
    map.addToken("VENDOR", "Acme Corp");
    expect(map.addToken("VENDOR", "Beta Ltd")).toBe("VENDOR_T002");
  });

  it("case-sensitive — 'Acme' and 'acme' get different tokens", () => {
    const t1 = map.addToken("VENDOR", "Acme");
    const t2 = map.addToken("VENDOR", "acme");
    expect(t1).not.toBe(t2);
  });
});

// ── Lookups ───────────────────────────────────────────────────────────────────

describe("getOriginal / getToken", () => {
  it("getOriginal returns the original value for a token", () => {
    map.addToken("VENDOR", "Tata Consultancy");
    expect(map.getOriginal("VENDOR_T001")).toBe("Tata Consultancy");
  });

  it("getOriginal returns undefined for unknown token", () => {
    expect(map.getOriginal("VENDOR_T999")).toBeUndefined();
  });

  it("getToken returns the token for a known value", () => {
    map.addToken("CUSTOMER", "Infosys Ltd");
    expect(map.getToken("Infosys Ltd")).toBe("CUSTOMER_T001");
  });

  it("getToken returns undefined for unknown value", () => {
    expect(map.getToken("Unknown Corp")).toBeUndefined();
  });
});

// ── Map access ────────────────────────────────────────────────────────────────

describe("getMap / getReverseMap", () => {
  it("getMap returns token→original mapping", () => {
    map.addToken("VENDOR", "Alpha");
    map.addToken("VENDOR", "Beta");
    const m = map.getMap();
    expect(m.get("VENDOR_T001")).toBe("Alpha");
    expect(m.get("VENDOR_T002")).toBe("Beta");
  });

  it("getReverseMap returns original→token mapping", () => {
    map.addToken("CUSTOMER", "Gamma Corp");
    const rev = map.getReverseMap();
    expect(rev.get("Gamma Corp")).toBe("CUSTOMER_T001");
  });

  it("getMap returns a copy — mutations don't affect the TokenMap", () => {
    map.addToken("VENDOR", "Immutable");
    const m = map.getMap();
    m.set("VENDOR_T001", "tampered");
    expect(map.getOriginal("VENDOR_T001")).toBe("Immutable");
  });

  it("size reflects number of unique tokens", () => {
    expect(map.size).toBe(0);
    map.addToken("VENDOR", "A");
    map.addToken("VENDOR", "B");
    map.addToken("CUSTOMER", "C");
    expect(map.size).toBe(3);
  });
});

// ── Destroy ───────────────────────────────────────────────────────────────────

describe("destroy", () => {
  it("clears all mappings", () => {
    map.addToken("VENDOR", "Acme Corp");
    map.addToken("AMOUNT", "500000");
    map.destroy();
    expect(map.getOriginal("VENDOR_T001")).toBeUndefined();
    expect(map.getToken("Acme Corp")).toBeUndefined();
    expect(map.size).toBe(0);
  });

  it("resets counters after destroy", () => {
    map.addToken("VENDOR", "A");
    map.addToken("VENDOR", "B");
    map.destroy();
    // After destroy, counter resets — next token is T001 again
    expect(map.addToken("VENDOR", "C")).toBe("VENDOR_T001");
  });

  it("can be safely called on empty map", () => {
    expect(() => map.destroy()).not.toThrow();
  });
});
