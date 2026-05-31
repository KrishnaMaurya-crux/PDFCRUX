import crypto from "crypto";
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
  forcePathStyle: true,
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

// ─────────────────────────────────────────────────────────────────────────
// MANUAL PRESIGNED URL GENERATOR
// ─────────────────────────────────────────────────────────────────────────
//
// WHY MANUAL instead of @aws-sdk/s3-request-presigner?
//
// AWS SDK v3's presigner adds EXTRA query params that break R2 CORS:
//   - x-id=PutObject       ← AWS internal routing param, R2 doesn't need it
//   - x-amz-checksum-crc32 ← auto-checksum, R2 rejects if browser doesn't send header
//
// These extra params cause R2's CORS preflight (OPTIONS) to fail because
// R2's CORS matching gets confused by non-standard query params.
//
// Our manual URL has ONLY standard AWS4 signing params — clean, minimal.
// Combined with sending PUT without Content-Type (no preflight needed),
// this guarantees CORS-safe direct browser-to-R2 uploads.
//
// URL format:
//   https://ACCOUNT_ID.r2.cloudflarestorage.com/BUCKET/KEY
//     ?X-Amz-Algorithm=AWS4-HMAC-SHA256
//     &X-Amz-Credential=ACCESS_KEY/DATE/auto/s3/aws4_request
//     &X-Amz-Date=20260529T145022Z
//     &X-Amz-Expires=600
//     &X-Amz-SignedHeaders=host
//     &X-Amz-Signature=...
//     &X-Amz-Content-Sha256=UNSIGNED-PAYLOAD
//
// NO x-id, NO checksums, NO garbage. Just pure AWS4 signing.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Generate a presigned PUT URL MANUALLY using AWS Signature V4.
 * No AWS SDK middleware — no x-id, no checksums, no extra params.
 * Clean URL that R2 CORS handles correctly.
 */
export function generatePresignedPutUrl(
  key: string,
  expiresIn: number = 600 // 10 minutes
): string {
  const accountId = process.env.R2_ACCOUNT_ID!;
  const bucketName = process.env.R2_BUCKET_NAME!;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;

  const region = "auto";
  const service = "s3";

  // Build timestamp in AWS format: YYYYMMDDTHHMMSSZ
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hour = String(now.getUTCHours()).padStart(2, "0");
  const minute = String(now.getUTCMinutes()).padStart(2, "0");
  const second = String(now.getUTCSeconds()).padStart(2, "0");
  const amzDate = `${year}${month}${day}T${hour}${minute}${second}Z`;
  const dateStamp = `${year}${month}${day}`;

  // Endpoint and path (path-style: /BUCKET/key)
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${bucketName}/${key}`;

  // Build credential scope
  const credential = `${accessKeyId}/${dateStamp}/${region}/${service}/aws4_request`;

  // Query params — ONLY standard AWS4 signing params, NO x-id
  const queryParams: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Content-Sha256", "UNSIGNED-PAYLOAD"],
    ["X-Amz-Credential", credential],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresIn)],
    ["X-Amz-SignedHeaders", "host"],
  ];

  // Sort by key (AWS Sig V4 requirement)
  queryParams.sort((a, b) => a[0].localeCompare(b[0]));
  const canonicalQueryString = queryParams
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  // Canonical headers — only host
  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = "host";

  // Build canonical request
  const canonicalRequest = [
    "PUT",                      // HTTP method
    canonicalUri,               // Path
    canonicalQueryString,       // Query string (sorted)
    canonicalHeaders,           // Headers (must end with \n)
    signedHeaders,              // Which headers are signed
    "UNSIGNED-PAYLOAD",         // Content hash
  ].join("\n");

  // Build string to sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  // Derive signing key: HMAC chain
  const kDate = crypto.createHmac("sha256", `AWS4${secretAccessKey}`).update(dateStamp).digest();
  const kRegion = crypto.createHmac("sha256", kDate).update(region).digest();
  const kService = crypto.createHmac("sha256", kRegion).update(service).digest();
  const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();

  // Final signature
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  // Build final URL
  const url = `${canonicalQueryString}&X-Amz-Signature=${signature}`;
  return `https://${host}${canonicalUri}?${url}`;
}

// Named exports
export { r2Client, BUCKET_NAME };

// Alias for profile/photo route compatibility
export { BUCKET_NAME as R2_BUCKET };

// Default export for `import r2Client from "@/lib/r2"` syntax
export default r2Client;
