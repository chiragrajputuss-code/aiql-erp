import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const IS_PROD = process.env.NODE_ENV === "production";
const LOCAL_FILE = join(process.cwd(), ".secrets.local.json");

// ── Local dev fallback (JSON file) ────────────────────────────────────────────

function readLocal(): Record<string, string> {
  if (!existsSync(LOCAL_FILE)) return {};
  try { return JSON.parse(readFileSync(LOCAL_FILE, "utf-8")); } catch { return {}; }
}

function writeLocal(data: Record<string, string>) {
  writeFileSync(LOCAL_FILE, JSON.stringify(data, null, 2));
}

// ── SSM client (lazy) ─────────────────────────────────────────────────────────

async function getClient() {
  const { SSMClient } = await import("@aws-sdk/client-ssm");
  return new SSMClient({ region: process.env.AWS_REGION ?? "ap-south-1" });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function storeSecret(name: string, value: string): Promise<string> {
  if (!IS_PROD) {
    const secrets = readLocal();
    secrets[name] = value;
    writeLocal(secrets);
    return name;
  }
  const { PutParameterCommand } = await import("@aws-sdk/client-ssm");
  const client = await getClient();
  await client.send(new PutParameterCommand({
    Name: name,
    Value: value,
    Type: "SecureString",
    Overwrite: true,
  }));
  return name;
}

export async function getSecret(name: string): Promise<string> {
  if (!IS_PROD) {
    const value = readLocal()[name];
    if (value === undefined) throw new Error(`Secret not found: ${name}`);
    return value;
  }
  const { GetParameterCommand } = await import("@aws-sdk/client-ssm");
  const client = await getClient();
  const res = await client.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  if (!res.Parameter?.Value) throw new Error(`Secret not found: ${name}`);
  return res.Parameter.Value;
}

export async function deleteSecret(name: string): Promise<void> {
  if (!IS_PROD) {
    const secrets = readLocal();
    delete secrets[name];
    writeLocal(secrets);
    return;
  }
  const { DeleteParameterCommand } = await import("@aws-sdk/client-ssm");
  const client = await getClient();
  await client.send(new DeleteParameterCommand({ Name: name }));
}
