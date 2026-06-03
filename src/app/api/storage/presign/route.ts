import { NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// Lazy R2 import — only loads when actually called
// ─────────────────────────────────────────────────────────────────

async function getR2Presign() {
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return null;
  }
  const r2 = await import("@/lib/r2");
  return {
    generatePresignedPutUrl: r2.generatePresignedPutUrl,
    generateFileKey: r2.generateFileKey,
    BUCKET_NAME: r2.BUCKET_NAME,
  };
}

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

// ─────────────────────────────────────────────────────────────────────────
// Auto-set CORS on R2 bucket using S3 PutBucketCors API.
// Runs ONCE (first presign call). If CORS is already set, S3 returns 200.
// This ensures presigned URL uploads work even if user forgot to set CORS.
// ─────────────────────────────────────────────────────────────────────────
let corsSetupDone = false;

async function ensureR2CORS() {
  if (corsSetupDone) return;

  try {
    const { S3Client, PutBucketCorsCommand } = await import("@aws-sdk/client-s3");

    const s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      },
    });

    await s3Client.send(new PutBucketCorsCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ["*"],
            AllowedMethods: ["GET", "PUT", "DELETE", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }));

    corsSetupDone = true;
    console.log("[Storage:Presign] ✅ CORS auto-configured on R2 bucket");
  } catch (err) {
    // Don't block presign if CORS setup fails — chunked fallback will handle it
    console.warn("[Storage:Presign] ⚠️ CORS auto-setup failed:", err instanceof Error ? err.message : err);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// POST /api/storage/presign
//
// Returns a MANUAL presigned PUT URL for direct client-to-R2 upload.
// Auto-sets CORS on first call using S3 PutBucketCors API.
//
// Request body (JSON):
//   { fileName: string, contentType?: string }
//
// Response:
//   { uploadUrl: string, r2Key: string }
// ─────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const user = await getUserFromRequest(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const r2 = await getR2Presign();
  if (!r2) {
    return NextResponse.json({ error: "R2 not configured" }, { status: 503 });
  }

  // Auto-set CORS on R2 bucket (runs once, silent if already set)
  await ensureR2CORS();

  try {
    const body = await req.json();
    const { fileName } = body;

    if (!fileName) {
      return NextResponse.json({ error: "Missing fileName" }, { status: 400 });
    }

    const r2Key = r2.generateFileKey("uploads", fileName);

    // Use MANUAL presigned URL — no AWS SDK, no x-id, no CORS issues
    const uploadUrl = r2.generatePresignedPutUrl(r2Key, 600);

    console.log("[Storage:Presign] Generated MANUAL presigned URL for:", r2Key);
    console.log("[Storage:Presign] URL preview:", uploadUrl.substring(0, 120) + "...");

    return NextResponse.json({ uploadUrl, r2Key });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Storage:Presign] 💥", msg);
    return NextResponse.json({ error: "Failed to generate presigned URL", debug: msg }, { status: 500 });
  }
}
