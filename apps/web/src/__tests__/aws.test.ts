import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, unlinkSync, readFileSync } from "fs";
import { join } from "path";
import { encrypt, decrypt } from "../lib/crypto";
import { storeSecret, getSecret, deleteSecret } from "../lib/ssm";
import { uploadFile, getPresignedUrl } from "../lib/s3";

// Uses local dev fallbacks — no real AWS needed in test environment

const TEST_SECRETS_FILE = join(process.cwd(), ".secrets.local.json");

afterEach(() => {
  // Clean up local secrets file after each test
  if (existsSync(TEST_SECRETS_FILE)) unlinkSync(TEST_SECRETS_FILE);
});

// ── Encryption (AES-256-GCM) ──────────────────────────────────────────────────

describe("encrypt / decrypt", () => {
  it("encrypts a string and returns base64", () => {
    const result = encrypt("hello world");
    expect(result).toBeTruthy();
    expect(() => Buffer.from(result, "base64")).not.toThrow();
    expect(result).not.toBe("hello world");
  });

  it("round-trips plaintext correctly", () => {
    const plaintext = "super-secret-api-key-12345";
    const ciphertext = encrypt(plaintext);
    const recovered = decrypt(ciphertext);
    expect(recovered).toBe(plaintext);
  });

  it("produces different ciphertexts for same input (random IV)", () => {
    const c1 = encrypt("same text");
    const c2 = encrypt("same text");
    expect(c1).not.toBe(c2);
    // But both decrypt to same value
    expect(decrypt(c1)).toBe("same text");
    expect(decrypt(c2)).toBe("same text");
  });

  it("round-trips multiline / unicode text", () => {
    const text = "भारत\nAcme Corp\n₹5,00,000";
    expect(decrypt(encrypt(text))).toBe(text);
  });

  it("round-trips JSON credentials", () => {
    const creds = JSON.stringify({ host: "db.example.com", port: 5432, password: "secret" });
    expect(decrypt(encrypt(creds))).toBe(creds);
  });

  it("throws if CREDENTIAL_ENCRYPTION_KEY is wrong length", () => {
    const original = process.env.CREDENTIAL_ENCRYPTION_KEY;
    process.env.CREDENTIAL_ENCRYPTION_KEY = "tooshort";
    expect(() => encrypt("test")).toThrow("CREDENTIAL_ENCRYPTION_KEY");
    process.env.CREDENTIAL_ENCRYPTION_KEY = original;
  });
});

// ── SSM / Local secrets ───────────────────────────────────────────────────────

describe("storeSecret / getSecret / deleteSecret (local fallback)", () => {
  it("stores and retrieves a secret", async () => {
    await storeSecret("/aiql/test/db-creds", "my-password");
    const val = await getSecret("/aiql/test/db-creds");
    expect(val).toBe("my-password");
  });

  it("overwrites an existing secret", async () => {
    await storeSecret("/aiql/test/key", "v1");
    await storeSecret("/aiql/test/key", "v2");
    expect(await getSecret("/aiql/test/key")).toBe("v2");
  });

  it("deletes a secret", async () => {
    await storeSecret("/aiql/test/to-delete", "value");
    await deleteSecret("/aiql/test/to-delete");
    await expect(getSecret("/aiql/test/to-delete")).rejects.toThrow("not found");
  });

  it("throws when getting a non-existent secret", async () => {
    await expect(getSecret("/aiql/test/does-not-exist")).rejects.toThrow();
  });

  it("persists secrets to .secrets.local.json", async () => {
    await storeSecret("/aiql/test/persist", "abc");
    const raw = JSON.parse(readFileSync(TEST_SECRETS_FILE, "utf-8"));
    expect(raw["/aiql/test/persist"]).toBe("abc");
  });

  it("stores encrypted credentials (encrypt → store → retrieve → decrypt)", async () => {
    const creds = JSON.stringify({ apiKey: "sk-12345", region: "ap-south-1" });
    await storeSecret("/aiql/test/erp-creds", encrypt(creds));
    const retrieved = await getSecret("/aiql/test/erp-creds");
    expect(decrypt(retrieved)).toBe(creds);
  });
});

// ── S3 / Local file fallback ──────────────────────────────────────────────────

describe("uploadFile / getPresignedUrl (local fallback)", () => {
  it("uploads a file and returns a local file:// URL", async () => {
    const buf = Buffer.from("test file content");
    const url = await uploadFile("test/upload.txt", buf, "text/plain");
    expect(url).toMatch(/^file:\/\//);
  });

  it("returns a presigned-style URL for local files", async () => {
    const url = await getPresignedUrl("test/upload.txt");
    expect(url).toMatch(/^file:\/\//);
  });

  it("handles nested key paths by flattening them", async () => {
    const buf = Buffer.from("nested");
    const url = await uploadFile("org/123/schema.json", buf, "application/json");
    expect(url).toBeTruthy();
    expect(url).not.toContain("//org"); // slashes replaced with dashes locally
  });
});
