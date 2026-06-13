import axios, { AxiosError } from "axios";
import type {
  ERPConnector,
  ERPCredentials,
  RawSchemaData,
  QueryResult,
  EntityLists,
  TestConnectionResult,
} from "../types";

// ─── Zoho region → base URLs ──────────────────────────────────────────────────

const ZOHO_REGIONS: Record<string, { api: string; accounts: string }> = {
  IN: { api: "https://www.zohoapis.in/books/v3",  accounts: "https://accounts.zoho.in" },
  US: { api: "https://www.zohoapis.com/books/v3", accounts: "https://accounts.zoho.com" },
  EU: { api: "https://www.zohoapis.eu/books/v3",  accounts: "https://accounts.zoho.eu" },
  AU: { api: "https://www.zohoapis.com.au/books/v3", accounts: "https://accounts.zoho.com.au" },
};

const DEFAULT_REGION = "IN"; // Most AIQL users are India-based

export type TokenRefreshCallback = (tokens: {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}) => Promise<void>;

// ─── ZohoBooksConnector ───────────────────────────────────────────────────────

export class ZohoBooksConnector implements ERPConnector {
  readonly erpType = "ZOHO_BOOKS" as const;

  private accessToken: string;
  private refreshToken: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly organisationId: string;
  private readonly apiBase: string;
  private readonly accountsBase: string;
  private tokenExpiresAt: Date;
  private readonly onTokenRefresh?: TokenRefreshCallback;

  constructor(credentials: ERPCredentials, onTokenRefresh?: TokenRefreshCallback) {
    this.accessToken    = credentials.accessToken   ?? "";
    this.refreshToken   = credentials.refreshToken  ?? "";
    this.clientId       = credentials.clientId      ?? "";
    this.clientSecret   = credentials.clientSecret  ?? "";
    this.organisationId = credentials.organisationId ?? "";
    this.tokenExpiresAt = credentials.tokenExpiresAt ?? new Date(0); // expired by default
    this.onTokenRefresh = onTokenRefresh;

    const region = ZOHO_REGIONS[DEFAULT_REGION];
    this.apiBase      = region.api;
    this.accountsBase = region.accounts;
  }

  // ── Token management ──────────────────────────────────────────────────────

  isTokenExpired(): boolean {
    // Refresh 5 minutes early to avoid edge-case expiry mid-request
    return new Date() >= new Date(this.tokenExpiresAt.getTime() - 5 * 60 * 1000);
  }

  async refreshAccessToken(): Promise<void> {
    const res = await axios.post<{
      access_token: string;
      expires_in: number;
      error?: string;
    }>(
      `${this.accountsBase}/oauth/v2/token`,
      new URLSearchParams({
        grant_type:    "refresh_token",
        refresh_token: this.refreshToken,
        client_id:     this.clientId,
        client_secret: this.clientSecret,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    if (res.data.error) {
      throw new Error(`Zoho token refresh failed: ${res.data.error}`);
    }

    this.accessToken    = res.data.access_token;
    this.tokenExpiresAt = new Date(Date.now() + res.data.expires_in * 1000);

    await this.onTokenRefresh?.({
      accessToken:  this.accessToken,
      refreshToken: this.refreshToken,
      expiresAt:    this.tokenExpiresAt,
    });
  }

  private async ensureToken(): Promise<void> {
    if (this.isTokenExpired()) await this.refreshAccessToken();
  }

  // ── HTTP helper ───────────────────────────────────────────────────────────

  async get<T = Record<string, unknown>>(
    path: string,
    params?: Record<string, string>
  ): Promise<T> {
    await this.ensureToken();
    const res = await axios.get<T>(`${this.apiBase}${path}`, {
      headers: { Authorization: `Zoho-oauthtoken ${this.accessToken}` },
      params:  { organization_id: this.organisationId, ...params },
      timeout: 15_000,
    });
    return res.data;
  }

  // ── testConnection() ──────────────────────────────────────────────────────

  async testConnection(): Promise<TestConnectionResult> {
    const t0 = Date.now();
    try {
      const data = await this.get<{ organization: { name: string } }>(
        "/organizations"
      );
      const name = data.organization?.name ?? "Unknown";
      return {
        success:   true,
        message:   `Connected to Zoho Books — ${name}`,
        latencyMs: Date.now() - t0,
      };
    } catch (err) {
      const axErr = err as AxiosError & { response?: { data?: { message?: string } } };
      if (axErr.response?.status === 401) {
        return { success: false, message: "Zoho authentication failed — check client credentials" };
      }
      return { success: false, message: `Zoho connection error: ${(err as Error).message}` };
    }
  }

  // ── Delegated methods ─────────────────────────────────────────────────────

  async introspectSchema(): Promise<RawSchemaData> {
    const { introspectZohoSchema } = await import("./schema");
    return introspectZohoSchema(this);
  }

  async executeQuery(query: string): Promise<QueryResult> {
    const { executeZohoQuery } = await import("./executor");
    return executeZohoQuery(this, query);
  }

  async getEntityLists(): Promise<EntityLists> {
    const { getZohoEntityLists } = await import("./dictionary");
    return getZohoEntityLists(this);
  }
}

// ─── OAuth helpers (called from the app layer, not the connector) ─────────────

export function buildAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  region: keyof typeof ZOHO_REGIONS = "IN"
): string {
  const base = ZOHO_REGIONS[region].accounts;
  const params = new URLSearchParams({
    response_type: "code",
    client_id:     clientId,
    scope:         "ZohoBooks.accountants.READ,ZohoBooks.contacts.READ,ZohoBooks.reports.READ",
    redirect_uri:  redirectUri,
    access_type:   "offline",
    state,
  });
  return `${base}/oauth/v2/auth?${params}`;
}

export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  region: keyof typeof ZOHO_REGIONS = "IN"
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  const base = ZOHO_REGIONS[region].accounts;
  const res = await axios.post<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    error?: string;
  }>(
    `${base}/oauth/v2/token`,
    new URLSearchParams({
      grant_type:    "authorization_code",
      code,
      redirect_uri:  redirectUri,
      client_id:     clientId,
      client_secret: clientSecret,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  if (res.data.error) throw new Error(`Zoho OAuth error: ${res.data.error}`);

  return {
    accessToken:  res.data.access_token,
    refreshToken: res.data.refresh_token,
    expiresAt:    new Date(Date.now() + res.data.expires_in * 1000),
  };
}
