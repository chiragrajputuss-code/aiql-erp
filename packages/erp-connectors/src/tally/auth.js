import axios from "axios";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { extractCollection } from "./utils";
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (tagName) => ["LEDGER", "GROUP", "VOUCHERTYPE", "COSTCENTRE", "GODOWN"].includes(tagName),
});
const builder = new XMLBuilder({ format: false });
// ─── XML helpers ──────────────────────────────────────────────────────────────
function buildExportRequest(reportName, extras) {
    const requestDesc = {
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
function parseResponse(xml) {
    return parser.parse(xml);
}
function ensureArray(val) {
    if (!val)
        return [];
    return Array.isArray(val) ? val : [val];
}
// ─── TallyConnector ───────────────────────────────────────────────────────────
export class TallyConnector {
    constructor(credentials) {
        this.erpType = "TALLY";
        this.host = credentials.host ?? "localhost";
        this.port = credentials.port ?? 9000;
        this.companyName = credentials.companyName ?? "";
    }
    get baseUrl() {
        return `http://${this.host}:${this.port}`;
    }
    async post(xml) {
        const res = await axios.post(this.baseUrl, xml, {
            headers: { "Content-Type": "text/xml;charset=utf-8" },
            timeout: 15000,
        });
        return res.data;
    }
    // ── testConnection() ───────────────────────────────────────────────────────
    async testConnection() {
        const xml = buildExportRequest("List of Ledgers", { SVEXPORTFORMAT: "$$SysName:XML" });
        const t0 = Date.now();
        try {
            const responseXml = await this.post(xml);
            const parsed = parseResponse(responseXml);
            // A valid Tally response has an ENVELOPE root
            const envelope = parsed.ENVELOPE;
            if (!envelope) {
                return { success: false, message: "Unexpected response format from Tally" };
            }
            return {
                success: true,
                message: "Connected to Tally successfully",
                latencyMs: Date.now() - t0,
            };
        }
        catch (err) {
            const axErr = err;
            if (axErr.code === "ECONNREFUSED") {
                return {
                    success: false,
                    message: `Cannot reach Tally at ${this.baseUrl}. Ensure Tally Prime is running and port ${this.port} is open.`,
                };
            }
            if (axErr.code === "ETIMEDOUT" || axErr.code === "ECONNABORTED") {
                return { success: false, message: `Connection to Tally timed out at ${this.baseUrl}` };
            }
            return { success: false, message: `Connection error: ${err.message}` };
        }
    }
    // ── introspectSchema() — implemented in schema.ts ─────────────────────────
    async introspectSchema() {
        const { introspectTallySchema } = await import("./schema");
        return introspectTallySchema(this);
    }
    // ── executeQuery() ────────────────────────────────────────────────────────
    async executeQuery(query) {
        const { executeTallyQuery } = await import("./executor");
        return executeTallyQuery(this, query);
    }
    // ── getEntityLists() ──────────────────────────────────────────────────────
    async getEntityLists() {
        const { getTallyEntityLists } = await import("./dictionary");
        return getTallyEntityLists(this);
    }
    // ── Internal helpers used by schema.ts / dictionary.ts ───────────────────
    /** Send an XML export request and return the parsed response object. */
    async sendRequest(reportName, extras) {
        const xml = buildExportRequest(reportName, extras);
        const responseXml = await this.post(xml);
        return parseResponse(responseXml);
    }
    /** Send raw TDL XML directly to Tally (used by executor for custom queries). */
    async sendRawRequest(xml) {
        const responseXml = await this.post(xml);
        return parseResponse(responseXml);
    }
    /** Delegate to shared util — kept for backwards compat. */
    static extractCollection(parsed, collectionKey) {
        return extractCollection(parsed, collectionKey);
    }
}
