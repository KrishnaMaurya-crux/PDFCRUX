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

/** Mask a string for debug output: first 6 + "..." + last 4 */
function mask(value: string | undefined): string {
  if (!value || value.length < 10) return value ? "****" : "NOT SET";
  return value.slice(0, 6) + "..." + value.slice(-4);
}

/** Track which keys have already warned (browser-side only) */
const _warnedKeys = new Set<string>();

function warnOnce(key: string, label: string) {
  if (typeof window !== "undefined" && !_warnedKeys.has(key)) {
    _warnedKeys.add(key);
    console.warn(
      `[PdfCrux Env] "${label}" is not configured. ${key} is missing or empty.`
    );
  }
}

// ============================================================
// 1. SUPABASE (Auth + PostgreSQL)
// ============================================================
export const supabase = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  get isConfigured() {
    const ok = isSet(this.url) && isSet(this.anonKey);
    if (!ok) {
      if (!isSet(this.url)) warnOnce("NEXT_PUBLIC_SUPABASE_URL", "Supabase URL");
      if (!isSet(this.anonKey)) warnOnce("NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase Anon Key");
    }
    return ok;
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
    const ok =
      isSet(this.accountId) &&
      isSet(this.accessKeyId) &&
      isSet(this.secretAccessKey);
    if (!ok) {
      if (!isSet(this.accountId)) warnOnce("R2_ACCOUNT_ID", "R2 Account ID");
      if (!isSet(this.accessKeyId)) warnOnce("R2_ACCESS_KEY_ID", "R2 Access Key ID");
      if (!isSet(this.secretAccessKey)) warnOnce("R2_SECRET_ACCESS_KEY", "R2 Secret Access Key");
    }
    return ok;
  },
};

// ============================================================
// 3. GOOGLE DRIVE (Cloud Import / Save)
// ============================================================
export const googleDrive = {
  clientId: process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || "",
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY || "",
  appId: process.env.NEXT_PUBLIC_GOOGLE_DRIVE_APP_ID || "",
  clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET || "",
  scopes:
    "email profile openid https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata",
  get isConfigured() {
    const ok = isSet(this.clientId) && isSet(this.apiKey);
    if (!ok) {
      if (!isSet(this.clientId)) warnOnce("NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID", "Google Drive Client ID");
      if (!isSet(this.apiKey)) warnOnce("NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY", "Google Drive API Key");
    }
    return ok;
  },
};

// ============================================================
// 4. DROPBOX (Cloud Import / Save)
// ============================================================
export const dropbox = {
  appKey: process.env.NEXT_PUBLIC_DROPBOX_APP_KEY || "",
  appSecret: process.env.DROPBOX_APP_SECRET || "",
  get isConfigured() {
    const ok = isSet(this.appKey);
    if (!ok) {
      warnOnce("NEXT_PUBLIC_DROPBOX_APP_KEY", "Dropbox App Key");
    }
    return ok;
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
      configured:
        isSet(process.env.DATABASE_URL) &&
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
        : "Missing NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID or API_KEY",
    },
    {
      name: "Dropbox Import",
      configured: dropbox.isConfigured,
      details: dropbox.isConfigured
        ? "App key ready (Chooser API)"
        : "Missing NEXT_PUBLIC_DROPBOX_APP_KEY",
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

/** Masked NEXT_PUBLIC_ env vars for debug display */
export function getEnvDebug() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: mask(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: mask(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID: mask(process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID),
    NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY: mask(process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY),
    NEXT_PUBLIC_GOOGLE_DRIVE_APP_ID: mask(process.env.NEXT_PUBLIC_GOOGLE_DRIVE_APP_ID),
    NEXT_PUBLIC_DROPBOX_APP_KEY: mask(process.env.NEXT_PUBLIC_DROPBOX_APP_KEY),
    R2_ACCOUNT_ID: mask(process.env.R2_ACCOUNT_ID),
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || "NOT SET",
    DATABASE_URL: process.env.DATABASE_URL
      ? (process.env.DATABASE_URL.startsWith("file:") ? "file:... (SQLite)" : mask(process.env.DATABASE_URL))
      : "NOT SET",
  };
}

/** Convenience export */
export const env = {
  supabase,
  r2,
  googleDrive,
  dropbox,
  dodoPayments,
  getEnvHealth,
  getEnvDebug,
} as const;
