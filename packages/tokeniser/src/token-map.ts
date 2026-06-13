import type { TokenCategory } from "./types";

export const VALID_CATEGORIES: TokenCategory[] = [
  "VENDOR",
  "CUSTOMER",
  "EMPLOYEE",
  "AMOUNT",
  "ACCT",
  "PROJECT",
  "ENTITY",
];

export class TokenMap {
  private tokenToOriginal = new Map<string, string>();
  private originalToToken = new Map<string, string>();
  private counters = new Map<string, number>();

  /**
   * Add a value and return its token. Returns the existing token if the value
   * was already added (idempotent — same entity in a query reuses its token).
   */
  addToken(category: string, originalValue: string): string {
    const existing = this.originalToToken.get(originalValue);
    if (existing) return existing;

    const count = (this.counters.get(category) ?? 0) + 1;
    this.counters.set(category, count);
    const token = `${category}_T${String(count).padStart(3, "0")}`;

    this.tokenToOriginal.set(token, originalValue);
    this.originalToToken.set(originalValue, token);

    return token;
  }

  /** Retrieve original value from a token */
  getOriginal(token: string): string | undefined {
    return this.tokenToOriginal.get(token);
  }

  /** Retrieve the token assigned to an original value */
  getToken(originalValue: string): string | undefined {
    return this.originalToToken.get(originalValue);
  }

  /** token → original (used by detokeniser) */
  getMap(): Map<string, string> {
    return new Map(this.tokenToOriginal);
  }

  /** original → token (used during tokenisation) */
  getReverseMap(): Map<string, string> {
    return new Map(this.originalToToken);
  }

  get size(): number {
    return this.tokenToOriginal.size;
  }

  /** Must be called after the full query pipeline completes — no originals in memory */
  destroy(): void {
    this.tokenToOriginal.clear();
    this.originalToToken.clear();
    this.counters.clear();
  }
}
