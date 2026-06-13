import { describe, it, expect } from "vitest";
import { preprocessHinglish, HINDI_KEYWORD_MAP } from "../hindi-keywords";

describe("HINDI_KEYWORD_MAP", () => {
  it("maps dikhao → show", () => expect(HINDI_KEYWORD_MAP.dikhao).toBe("show"));
  it("maps baaki → outstanding", () => expect(HINDI_KEYWORD_MAP.baaki).toBe("outstanding"));
  it("maps mahine → month", () => expect(HINDI_KEYWORD_MAP.mahine).toBe("month"));
  it("maps karod → crore", () => expect(HINDI_KEYWORD_MAP.karod).toBe("crore"));
  it("maps se → from", () => expect(HINDI_KEYWORD_MAP.se).toBe("from"));
});

describe("preprocessHinglish — single keyword replacement", () => {
  it("replaces 'dikhao' with 'show'", () => {
    expect(preprocessHinglish("dikhao all vendors")).toBe("show all vendors");
  });

  it("replaces 'baaki' with 'outstanding'", () => {
    expect(preprocessHinglish("baaki amount for this month")).toBe(
      "outstanding amount for this month"
    );
  });

  it("replaces 'pichle' and 'mahine' independently", () => {
    const result = preprocessHinglish("pichle mahine ka revenue");
    expect(result).toContain("last");
    expect(result).toContain("month");
    // 'ka' is not in the keyword map — preserved as-is
    expect(result).toContain("ka");
  });

  it("replaces 'kitna' with 'how much'", () => {
    expect(preprocessHinglish("kitna baaki hai")).toBe("how much outstanding hai");
  });
});

describe("preprocessHinglish — full Hinglish queries", () => {
  it("preprocesses a typical AP aging query", () => {
    const result = preprocessHinglish(
      "vendor wise baaki amount dikhao jo 5 lakh se upar hai"
    );
    expect(result).toContain("outstanding");
    expect(result).toContain("show");
    expect(result).toContain("from");
    expect(result).toContain("above");
  });

  it("preprocesses a revenue query with time reference", () => {
    const result = preprocessHinglish("pichle mahine ka bikri batao");
    expect(result).toContain("last");
    expect(result).toContain("month");
    expect(result).toContain("sales");
    expect(result).toContain("tell");
  });

  it("preserves capitalized entity names (not translated)", () => {
    // 'Sharma' starts with capital — should NOT be translated even if it matches a keyword
    const result = preprocessHinglish("Sharma Enterprises ka baaki dikhao");
    expect(result).toContain("Sharma Enterprises");
    expect(result).toContain("outstanding");
    expect(result).toContain("show");
  });

  it("handles mixed English + Hindi query", () => {
    const result = preprocessHinglish(
      "show me sabhi vendors with baaki greater than 10 lakh"
    );
    expect(result).toContain("all");
    expect(result).toContain("outstanding");
  });

  it("returns unchanged text when no Hindi keywords present", () => {
    const text = "show all vendors with outstanding balance";
    expect(preprocessHinglish(text)).toBe(text);
  });
});

describe("preprocessHinglish — credit/debit terms", () => {
  it("replaces 'jama' with 'credit'", () => {
    expect(preprocessHinglish("jama entries for this month")).toBe(
      "credit entries for this month"
    );
  });

  it("replaces 'udhar' with 'debit'", () => {
    expect(preprocessHinglish("udhar amount total karo")).toContain("debit");
  });
});
