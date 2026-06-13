export * from "./types";
export { TallyConnector } from "./tally/auth";

// ── File upload pipeline exports ──────────────────────────────────────────────
export * from "./file-upload/canonical-schema";
export * from "./file-upload/column-mapper";
export * from "./file-upload/parser";
export * from "./file-upload/skip-rules";
export * from "./file-upload/redundancy-resolver";
export * from "./file-upload/validator";
export { createTempTable, dropTempTable, listOrgTables, buildTableName } from "./file-upload/table-creator";
export { buildUploadSchema } from "./file-upload/schema-gen";
export { executeUploadQuery } from "./file-upload/file-executor";
export { getUploadEntityLists } from "./file-upload/file-dictionary";
export { ZohoBooksConnector, buildAuthorizationUrl, exchangeCodeForTokens } from "./zoho-books/auth";
export type { TokenRefreshCallback } from "./zoho-books/auth";

import type { ERPConnector, ERPCredentials, ErpType } from "./types";
import { TallyConnector } from "./tally/auth";
import { ZohoBooksConnector } from "./zoho-books/auth";
import type { TokenRefreshCallback } from "./zoho-books/auth";

/**
 * Factory function — returns the correct connector for the given ERP type.
 * Credentials must already be resolved (SSM lookup happens at the app layer).
 * For Zoho Books, pass `onTokenRefresh` callback to persist refreshed tokens.
 */
export function createConnector(
  erpType: ErpType,
  credentials: ERPCredentials,
  options?: { onTokenRefresh?: TokenRefreshCallback }
): ERPConnector {
  switch (erpType) {
    case "TALLY":
      return new TallyConnector(credentials);

    case "ZOHO_BOOKS":
      return new ZohoBooksConnector(credentials, options?.onTokenRefresh);

    case "QUICKBOOKS":
    case "XERO":
      throw new Error(`${erpType} connector not yet implemented`);

    default:
      throw new Error(`Unsupported ERP type: ${erpType}`);
  }
}
