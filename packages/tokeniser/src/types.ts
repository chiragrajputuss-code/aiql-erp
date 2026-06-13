// ─── Token Categories ─────────────────────────────────────────────────────────

export type TokenCategory =
  | "VENDOR"
  | "CUSTOMER"
  | "EMPLOYEE"
  | "AMOUNT"
  | "ACCT"
  | "PROJECT"
  | "ENTITY"; // catch-all for NLP-detected proper nouns

export type DetectionMethod = "dictionary" | "nlp" | "context" | "regex" | "custom";

export type SensitivityLevel = "STANDARD" | "HIGH" | "MAXIMUM";

// ─── Detection Results ────────────────────────────────────────────────────────

export interface DetectedEntity {
  value: string;
  category: TokenCategory;
  confidence: number; // 0–1
  method: DetectionMethod;
  position: { start: number; end: number };
}

export interface DetectedAmount {
  originalText: string;
  numericValue: number;
  currency: string; // 'INR' | 'USD' | 'EUR' | 'GBP'
  format: string;   // 'indian-lakh' | 'indian-crore' | 'us' | 'european' etc.
  position: { start: number; end: number };
}

export interface StrippedPII {
  type: "SSN" | "EIN" | "PAN" | "AADHAAR" | "GSTIN" | "BANK_ACCOUNT" | "PHONE" | "EMAIL";
  position: { start: number; end: number };
}

// ─── Tokenisation Config ──────────────────────────────────────────────────────

export type TokenisableDocumentType =
  | "GL"
  | "TDS_RETURN_26Q"
  | "GSTR_1"
  | "GSTR_3B"
  | "ITR"
  | "OTHER";

export interface TokenisationConfig {
  tokeniseVendors: boolean;
  tokeniseCustomers: boolean;
  tokeniseEmployees: boolean;
  tokeniseAmounts: boolean;
  tokeniseAccounts: boolean;
  tokeniseProjects: boolean;
  sensitivityLevel: SensitivityLevel;
  accountPattern?: string; // custom regex for GL account codes
  customEntities?: string[];
  customStripList?: string[];
  /**
   * Document type — applied when the tokeniser needs type-specific rules.
   * GL (default): full entity tokenisation.
   * Form 26Q / GST returns: deductee PAN, GSTIN always masked (PII stripper handles this).
   * Defaults to "GL" when not provided.
   */
  documentType?: TokenisableDocumentType;
}

export const DEFAULT_CONFIG: TokenisationConfig = {
  tokeniseVendors: true,
  tokeniseCustomers: true,
  tokeniseEmployees: true,
  tokeniseAmounts: true,
  tokeniseAccounts: true,
  tokeniseProjects: true,
  sensitivityLevel: "STANDARD",
};

// ─── Entity Dictionary ────────────────────────────────────────────────────────

export interface EntityDictionary {
  vendors: string[];
  customers: string[];
  employees: string[];
  projects?: string[];
}

// ─── Audit & Results ──────────────────────────────────────────────────────────

export interface AuditEntry {
  original: string;
  token: string;
  category: TokenCategory | "PII";
  confidence?: number;
  method?: DetectionMethod;
}

export interface TokenisationStats {
  entitiesFound: number;
  amountsFound: number;
  accountsFound: number;
  piiStripped: number;
  totalTokens: number;
  processingTimeMs: number;
}

export interface TokeniseResult {
  original: string;
  tokenised: string;
  /** token → original value (use for detokenisation) */
  tokenMap: Map<string, string>;
  auditLog: AuditEntry[];
  stats: TokenisationStats;
}

// ─── Preview (UI display) ─────────────────────────────────────────────────────

export interface PreviewToken {
  original: string;
  token: string;
  category: TokenCategory;
  startIndex: number;
  endIndex: number;
}

export interface PreviewResult {
  original: string;
  tokenised: string;
  tokens: PreviewToken[];
  stats: TokenisationStats;
}
