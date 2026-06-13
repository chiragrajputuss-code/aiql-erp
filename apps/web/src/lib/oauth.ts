import { Google, MicrosoftEntraId } from "arctic";
import { randomBytes } from "crypto";

export const google = new Google(
  process.env.GOOGLE_CLIENT_ID!,
  process.env.GOOGLE_CLIENT_SECRET!,
  process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/api/auth/google/callback"
);

// Microsoft — wired up but credentials filled in Sprint 10
export const microsoft = new MicrosoftEntraId(
  process.env.MICROSOFT_TENANT_ID ?? "common",
  process.env.MICROSOFT_CLIENT_ID!,
  process.env.MICROSOFT_CLIENT_SECRET!,
  process.env.MICROSOFT_REDIRECT_URI ?? "http://localhost:3000/api/auth/microsoft/callback"
);

export function generateState(): string {
  return randomBytes(24).toString("base64url");
}

export function generateCodeVerifier(): string {
  return randomBytes(48).toString("base64url");
}
