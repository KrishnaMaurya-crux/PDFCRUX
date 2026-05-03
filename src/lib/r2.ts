import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

// Cloudflare R2 is S3-compatible — we use AWS SDK to interact with it.
// All credentials are read from environment variables.
// NEVER hardcode credentials in source code.

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || "pdfcrux";
const PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN || "";

export interface UploadResult {
  key: string;
  url: string;
  size: number;
  etag?: string;
}

export interface ListResult {
  objects: { key: string; size: number; lastModified?: Date }[];
  isTruncated: boolean;
}

/**
 * Upload a file (Buffer or Uint8Array) to R2 bucket
 */
export async function uploadToR2(
  file: Buffer | Uint8Array,
  key: string,
  contentType: string = "application/octet-stream"
): Promise<UploadResult> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file,
    ContentType: contentType,
  });

  const response = await r2Client.send(command);

  // Build public URL if domain is configured
  const url = PUBLIC_DOMAIN ? `${PUBLIC_DOMAIN}/${key}` : `r2://${BUCKET_NAME}/${key}`;

  return {
    key,
    url,
    size: file.byteLength,
    etag: response.ETag,
  };
}

/**
 * Upload from a File (browser) object to R2
 */
export async function uploadFileToR2(
  file: File,
  folder: string = "uploads"
): Promise<UploadResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() || "bin";
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).slice(2, 10);
  const key = `${folder}/${timestamp}_${randomId}.${ext}`;

  return uploadToR2(buffer, key, file.type || "application/octet-stream");
}

/**
 * Download a file from R2 bucket
 */
export async function downloadFromR2(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const response = await r2Client.send(command);

  if (!response.Body) {
    throw new Error(`Empty response body for key: ${key}`);
  }

  // Convert stream to buffer
  const bytes = await response.Body.transformToByteArray();
  return Buffer.from(bytes);
}

/**
 * Delete a file from R2 bucket
 */
export async function deleteFromR2(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await r2Client.send(command);
}

/**
 * List objects in R2 bucket (with optional prefix/folder)
 */
export async function listFromR2(
  prefix?: string,
  maxKeys: number = 100
): Promise<ListResult> {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
    MaxKeys: maxKeys,
  });

  const response = await r2Client.send(command);

  return {
    objects: (response.Contents || []).map((obj) => ({
      key: obj.Key || "",
      size: obj.Size || 0,
      lastModified: obj.LastModified,
    })),
    isTruncated: response.IsTruncated || false,
  };
}

/**
 * Generate a unique file key with folder structure
 * Format: {folder}/{YYYY-MM}/{timestamp}_{random}.{ext}
 */
export function generateFileKey(
  folder: string,
  fileName: string
): string {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const ext = fileName.split(".").pop() || "bin";
  const timestamp = now.getTime();
  const randomId = Math.random().toString(36).slice(2, 10);
  return `${folder}/${yearMonth}/${timestamp}_${randomId}.${ext}`;
}

export { r2Client, BUCKET_NAME };
