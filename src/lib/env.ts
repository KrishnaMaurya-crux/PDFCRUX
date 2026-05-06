/**
 * PdfCrux — Centralized Environment Configuration
 *
 * Every external integration reads its keys from HERE.
 * Missing keys are handled gracefully — no crashes on deploy.
 *
 * Usage:
 *   import { env } from "@/lib/env";
 *   if (env.r2.isConfigured) { await uploadToR2(...); }
 */

// ============================================================
// Helper
// ============================================================
function isSet(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

// ============================================================
// 1. SUPABASE (Auth + PostgreSQL)
// ============================================================
export const supabase = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  get isConfigured() {
    return isSet(this.url) && isSet(this.anonKey);
  },
};

// ============================================================
// 2. CLOUDFLARE R2 (Cloud Storage)
// ============================================================
export const r2 = {
  accountId: process.env.R2_ACCOUNT_ID || "",
  accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  bucketName: process.env.R2_BUCKET_NAME || "pdfcrux",
  publicDomain: process.env.R2_PUBLIC_DOMAIN || "",
  get isConfigured() {
    return (
      isSet(this.accountId) &&
      isSet(this.accessKeyId) &&
      isSet(this.secretAccessKey)
    );
  },
};

// ============================================================
// 3. GOOGLE DRIVE (Cloud Import)
// ============================================================
export const googleDrive = {
  clientId: process.env.GOOGLE_DRIVE_CLIENT_ID || "",
  apiKey: process.env.GOOGLE_DRIVE_API_KEY || "",
  appId: process.env.GOOGLE_DRIVE_APP_ID || "",
  clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET || "",
  scopes:
    "email profile openid https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata",
  get isConfigured() {
    return isSet(this.clientId) && isSet(this.apiKey);
  },
};

// ============================================================
// 4. DROPBOX (Cloud Import)
// ============================================================
export const dropbox = {
  appKey: process.env.DROPBOX_APP_KEY || "",
  appSecret: process.env.DROPBOX_APP_SECRET || "",
  get isConfigured() {
    return isSet(this.appKey);
  },
};

// ============================================================
// 5. DODO PAYMENTS (Universal Gateway — India + Global)
// ============================================================
export const dodoPayments = {
  apiKey: process.env.DODO_API_KEY || "",
  businessId: process.env.DODO_BUSINESS_ID || "",
  webhookSecret: process.env.DODO_WEBHOOK_SECRET || "",
  get isConfigured() {
    return isSet(this.apiKey) && isSet(this.businessId);
  },
};

// ============================================================
// HEALTH CHECK — Returns status of every integration
// ============================================================
export interface HealthStatus {
  name: string;
  configured: boolean;
  details: string;
}

export function getEnvHealth(): HealthStatus[] {
  return [
    {
      name: "Supabase Auth",
      configured: supabase.isConfigured,
      details: supabase.isConfigured
        ? "Connected"
        : "Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY",
    },
    {
      name: "Database (PostgreSQL)",
      configured: isSet(process.env.DATABASE_URL) &&
        !process.env.DATABASE_URL?.startsWith("file:"),
      details: process.env.DATABASE_URL?.startsWith("file:")
        ? "Using local SQLite — must migrate to PostgreSQL for Vercel"
        : isSet(process.env.DATABASE_URL)
          ? "PostgreSQL URL set"
          : "Missing DATABASE_URL",
    },
    {
      name: "Cloudflare R2",
      configured: r2.isConfigured,
      details: r2.isConfigured
        ? `Bucket: ${r2.bucketName}`
        : "Missing R2_ACCOUNT_ID or ACCESS_KEY",
    },
    {
      name: "Google Drive Import",
      configured: googleDrive.isConfigured,
      details: googleDrive.isConfigured
        ? "Client ID + API Key ready"
        : "Missing GOOGLE_DRIVE_CLIENT_ID or API_KEY",
    },
    {
      name: "Dropbox Import",
      configured: dropbox.isConfigured,
      details: dropbox.isConfigured
        ? "App key ready (Chooser API)"
        : "Missing DROPBOX_APP_KEY",
    },
    {
      name: "Dodo Payments",
      configured: dodoPayments.isConfigured,
      details: dodoPayments.isConfigured
        ? `Business: ${dodoPayments.businessId}`
        : "Missing DODO_API_KEY or BUSINESS_ID",
    },
  ];
}

/** Convenience export */
export const env = {
  supabase,
  r2,
  googleDrive,
  dropbox,
  dodoPayments,
  getEnvHealth,
} as const;
