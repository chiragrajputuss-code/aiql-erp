import type { DocumentType, DocumentTypeDefinition } from "./types";
import { GL_DEFINITION }      from "./definitions/gl";
import { TDS_26Q_DEFINITION } from "./definitions/tds-26q";
import { GSTR_1_DEFINITION }  from "./definitions/gstr-1";
import { GSTR_3B_DEFINITION } from "./definitions/gstr-3b";
import { ITR_DEFINITION }     from "./definitions/itr";

// Ordered by detection priority — more specific types first so a Form 26Q
// is never shadowed by the broader GL definition.
const REGISTRY: DocumentTypeDefinition[] = [
  TDS_26Q_DEFINITION,
  GSTR_1_DEFINITION,
  GSTR_3B_DEFINITION,
  ITR_DEFINITION,
  GL_DEFINITION,      // Most general — evaluate last
];

const BY_ID = new Map<DocumentType, DocumentTypeDefinition>(
  REGISTRY.map((d) => [d.id, d])
);

export function getDefinition(type: DocumentType): DocumentTypeDefinition | undefined {
  return BY_ID.get(type);
}

export function getAllDefinitions(): DocumentTypeDefinition[] {
  return REGISTRY;
}

export function getDisplayName(type: DocumentType): string {
  return BY_ID.get(type)?.displayName ?? type;
}

export function getIcon(type: DocumentType): string {
  return BY_ID.get(type)?.icon ?? "📄";
}

export function isChatEnabled(type: DocumentType): boolean {
  return BY_ID.get(type)?.chatEnabled ?? false;
}

export { REGISTRY };
