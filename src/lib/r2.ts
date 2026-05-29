import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 is S3-compatible — we use AWS SDK to interact with it.
// All credentials are read from environment variables.
// NEVER hardcode credentials in source code.

// ─────────────────────────────────────────────────────────────────
// IMPORTANT: Disable automatic checksums for R2 compatibility.
//
// AWS SDK v3 adds x-amz-checksum-crc32 headers by default.
// R2's presigned URL validation fails when the browser doesn't send
// these headers in the PUT request. Setting requestChecksumCalculation
// to "WHEN_REQUIRED" stops the SDK from adding checksum query params
// to presigned URLs. This is the KEY fix for CORS presigned uploads.
// ─────────────────────────────────────────────────────────────────

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
  // CRITICAL: Disable auto checksums — R2 presigned URLs break with them
  requestChecksumCalculation: "WHEN_REQUIRED",
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

/**
 * Generate a presigned PUT URL for direct client-to-R2 upload.
 * This bypasses Vercel's 4.5MB body limit!
 * The client uploads directly to R2 using this URL.
 *
 * IMPORTANT: No checksum headers are added (see S3Client config).
 * This means the browser's simple PUT request will work without
 * needing to send x-amz-checksum-* headers.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string = "application/octet-stream",
  expiresIn: number = 600 // 10 minutes
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(r2Client, command, { expiresIn });
  return url;
}

// Named exports
export { r2Client, BUCKET_NAME };

// Alias for profile/photo route compatibility
export { BUCKET_NAME as R2_BUCKET };

// Default export for `import r2Client from "@/lib/r2"` syntax
export default r2Client;
