import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const IS_PROD = process.env.NODE_ENV === "production";
const BUCKET = process.env.AWS_S3_BUCKET ?? "";
const REGION = process.env.AWS_REGION ?? "ap-south-1";
const LOCAL_DIR = "/tmp/aiql-uploads";

async function getClient() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({ region: REGION });
}

export async function uploadFile(key: string, buffer: Buffer, contentType: string): Promise<string> {
  if (!IS_PROD) {
    await mkdir(LOCAL_DIR, { recursive: true });
    const safeName = key.replace(/\//g, "-");
    await writeFile(join(LOCAL_DIR, safeName), buffer);
    return `file://${join(LOCAL_DIR, safeName)}`;
  }
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getClient();
  await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType }));
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  if (!IS_PROD) {
    return `file://${join(LOCAL_DIR, key.replace(/\//g, "-"))}`;
  }
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = await getClient();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}
