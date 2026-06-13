export type {
  DocumentType,
  UploadDataIntent,
  DetectionCandidate,
  DetectionResult,
  SheetDetection,
  ExtractedPeriod,
  DocumentTypeDefinition,
} from "./types";

export {
  getDefinition,
  getAllDefinitions,
  getDisplayName,
  getIcon,
  isChatEnabled,
  REGISTRY,
} from "./registry";

export { detectDocumentType } from "./detect";
export { extractPeriod }      from "./extract-period";
