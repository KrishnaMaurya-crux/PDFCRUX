import { NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────
// GET /api/r2/setup-cors
//
// ONE-TIME SETUP: Sets CORS on the R2 bucket using S3 PutBucketCors API.
// Call this ONCE after deployment to enable presigned URL uploads.
//
// WHY? Cloudflare Dashboard CORS settings may not work properly.
// The S3 PutBucketCors API is the RELIABLE way to set CORS on R2.
//
// After calling this, presigned PUT uploads will work without CORS errors.
// ─────────────────────────────────────────────────────────────────────────

async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  console.log("[R2:SetupCORS] ═══ CORS SETUP STARTED ═══");

  // Auth check (optional but prevents abuse)
  const user = await getUserFromRequest(req);
  if (!user?.email) {
    // Allow without auth for convenience (it only sets CORS, nothing secret)
    console.log("[R2:SetupCORS] Running without auth (convenience mode)");
  }

  // Check required env vars
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return NextResponse.json({
      error: "R2 env vars missing",
      required: ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"],
      found: {
        R2_ACCOUNT_ID: accountId ? "✅" : "❌",
        R2_ACCESS_KEY_ID: accessKeyId ? "✅" : "❌",
        R2_SECRET_ACCESS_KEY: secretAccessKey ? "✅ (length: " + secretAccessKey.length + ")" : "❌",
        R2_BUCKET_NAME: bucketName ? `✅ (${bucketName})` : "❌",
      },
    }, { status: 500 });
  }

  try {
    // Dynamically import S3 client (avoid crashing if @aws-sdk not installed)
    const { S3Client, PutBucketCorsCommand } = await import("@aws-sdk/client-s3");

    const s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      // forcePathStyle not needed for management operations
    });

    console.log("[R2:SetupCORS] Setting CORS on bucket:", bucketName);
    console.log("[R2:SetupCORS] Endpoint:", `https://${accountId}.r2.cloudflarestorage.com`);

    // Set CORS using S3 PutBucketCors API
    const result = await s3Client.send(new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ["*"],
            AllowedMethods: ["GET", "PUT", "DELETE", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag", "x-amz-request-id", "x-amz-id-2"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }));

    console.log("[R2:SetupCORS] ✅ CORS set successfully! $HTTPStatusCode:", result.$metadata?.httpStatusCode);

    return NextResponse.json({
      success: true,
      message: "CORS configured on R2 bucket",
      bucket: bucketName,
      corsRules: [
        {
          allowedOrigins: ["*"],
          allowedMethods: ["GET", "PUT", "DELETE", "HEAD"],
          allowedHeaders: ["*"],
          exposeHeaders: ["ETag"],
          maxAgeSeconds: 3600,
        },
      ],
      nextStep: "Presigned URL uploads should now work. Try uploading a file.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[R2:SetupCORS] ❌ Failed:", msg);

    return NextResponse.json({
      success: false,
      error: "Failed to set CORS",
      debug: msg,
      hint: "Make sure your R2 API token has 'Object Read & Write' and 'Admin Read & Write' permissions.",
    }, { status: 500 });
  }
}
