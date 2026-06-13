import axios, { AxiosError } from "axios";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { extractCollection } from "./utils";
import type {
  ERPConnector,
  ERPCredentials,
  RawSchemaData,
  QueryResult,
  EntityLists,
  TestConnectionResult,
} from "../types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (tagName) => ["LEDGER", "GROUP", "VOUCHERTYPE", "COSTCENTRE", "GODOWN"].includes(tagName),
});

const builder = new XMLBuilder({ format: false });

// ─── XML helpers ──────────────────────────────────────────────────────────────

function buildExportRequest(reportName: string, extras?: Record<string, string>): string {
  const requestDesc: Record<string, unknown> = {
    REPORTNAME: reportName,
    ...extras,
  };
  const envelope = {
    ENVELOPE: {
      HEADER: { TALLYREQUEST: "Export Data" },
      BODY: {
        EXPORTDATA: {
          REQUESTDESC: requestDesc,
        },
      },
    },
  };
  return `<?xml version="1.0" encoding="utf-8"?>\n${builder.build(envelope)}`;
}

function parseResponse(xml: string): Record<string, unknown> {
  return parser.parse(xml) as Record<string, unknown>;
}

function ensureArray<T>(val: T | T[] | undefined): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

// ─── TallyConnector ───────────────────────────────────────────────────────────

export class TallyConnector implements ERPConnector {
  readonly erpType = "TALLY" as const;

  private readonly host: string;
  private readonly port: number;
  private readonly companyName: string;

  constructor(credentials: ERPCredentials) {
    this.host = credentials.host ?? "localhost";
    this.port = credentials.port ?? 9000;
    this.companyName = credentials.companyName ?? "";
  }

  private get baseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  private async post(xml: string): Promise<string> {
    const res = await axios.post<string>(this.baseUrl, xml, {
      headers: { "Content-Type": "text/xml;charset=utf-8" },
      timeout: 15_000,
    });
    return res.data;
  }

  // ── testConnection() ───────────────────────────────────────────────────────

  async testConnection(): Promise<TestConnectionResult> {
    const xml = buildExportRequest("List of Ledgers", { SVEXPORTFORMAT: "$$SysName:XML" });
    const t0 = Date.now();
    try {
      const responseXml = await this.post(xml);
      const parsed = parseResponse(responseXml);

      // A valid Tally response has an ENVELOPE root
      const envelope = (parsed as { ENVELOPE?: unknown }).ENVELOPE;
      if (!envelope) {
        return { success: false, message: "Unexpected response format from Tally" };
      }

      return {
        success: true,
        message: "Connected to Tally successfully",
        latencyMs: Date.now() - t0,
      };
    } catch (err) {
      const axErr = err as AxiosError;
      if (axErr.code === "ECONNREFUSED") {
        return {
          success: false,
          message: `Cannot reach Tally at ${this.baseUrl}. Ensure Tally Prime is running and port ${this.port} is open.`,
        };
      }
      if (axErr.code === "ETIMEDOUT" || axErr.code === "ECONNABORTED") {
        return { success: false, message: `Connection to Tally timed out at ${this.baseUrl}` };
      }
      return { success: false, message: `Connection error: ${(err as Error).message}` };
    }
  }

  // ── introspectSchema() — implemented in schema.ts ─────────────────────────
  async introspectSchema(): Promise<RawSchemaData> {
    const { introspectTallySchema } = await import("./schema");
    return introspectTallySchema(this);
  }

  // ── executeQuery() ────────────────────────────────────────────────────────
  async executeQuery(query: string): Promise<QueryResult> {
    const { executeTallyQuery } = await import("./executor");
    return executeTallyQuery(this, query);
  }

  // ── getEntityLists() ──────────────────────────────────────────────────────
  async getEntityLists(): Promise<EntityLists> {
    const { getTallyEntityLists } = await import("./dictionary");
    return getTallyEntityLists(this);
  }

  // ── Internal helpers used by schema.ts / dictionary.ts ───────────────────

  /** Send an XML export request and return the parsed response object. */
  async sendRequest(reportName: string, extras?: Record<string, string>): Promise<Record<string, unknown>> {
    const xml = buildExportRequest(reportName, extras);
    const responseXml = await this.post(xml);
    return parseResponse(responseXml);
  }

  /** Send raw TDL XML directly to Tally (used by executor for custom queries). */
  async sendRawRequest(xml: string): Promise<Record<string, unknown>> {
    const responseXml = await this.post(xml);
    return parseResponse(responseXml);
  }

  /** Delegate to shared util — kept for backwards compat. */
  static extractCollection<T>(parsed: Record<string, unknown>, collectionKey: string): T[] {
    return extractCollection<T>(parsed, collectionKey);
  }
}
