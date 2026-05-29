/**
 * History Module — Client-side functions for history management.
 *
 * Uses the API routes for server-side persistence.
 * Falls back gracefully if the user is not authenticated.
 *
 * FILE UPLOAD STRATEGY:
 * ─────────────────────
 * Presigned URL — browser uploads DIRECTLY to R2.
 *
 * Flow:
 *   1. POST /api/storage/presign → get presigned PUT URL + r2Key
 *   2. PUT file directly to R2 (bypasses Vercel's 4.5MB limit entirely!)
 *   3. POST /api/storage/confirm → update history with r2Key
 *
 * Requirements:
 *   - R2 bucket must have CORS enabled (AllowedOrigins: ["*"], AllowedMethods: ["PUT"])
 *   - @aws-sdk/s3-request-presigner package installed
 *
 * Why this approach?
 *   - Vercel serverless has 4.5MB body limit → can't send files through API
 *   - Presigned URLs bypass Vercel entirely — file goes straight from browser to R2
 *   - Works for files of ANY size (1MB, 10MB, 100MB — doesn't matter)
 *   - No chunking, no base64, no FormData — just a simple PUT request
 */

import { supabase } from "./supabase";

export interface HistoryEntry {
  id: string;
  userId: string;
  toolId: string;
  toolName: string;
  fileName: string;
  fileSize: number;
  fileUrl?: string | null;
  r2Key?: string | null;
  resultSummary: string;
  downloaded: boolean;
  createdAt: string;
}

export interface StorageUsage {
  plan: string;
  planLabel: string;
  planPrice: string;
  storageUsed: number;
  storageUsedFormatted: string;
  storageLimit: number;
  storageLimitFormatted: string;
  storagePercent: number;
  downloadCount: number;
  downloadLimit: number;
  historyCount: number;
  historyLimit: number;
  features: string[];
  isDevMode: boolean;
}

const TOOL_META: Record<string, { color: string; bgColor: string; icon: string }> = {
  "pdf-summary": { color: "text-amber-600", bgColor: "bg-amber-50", icon: "✨" },
  "pdf-notes": { color: "text-emerald-600", bgColor: "bg-emerald-50", icon: "📝" },
  "pdf-ocr": { color: "text-violet-600", bgColor: "bg-violet-50", icon: "🔍" },
  "resume-checker": { color: "text-blue-600", bgColor: "bg-blue-50", icon: "📋" },
};

// ─────────────────────────────────────────────────────────────────
// Get Bearer token from Supabase session (stored in localStorage)
// ─────────────────────────────────────────────────────────────────

export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      console.log("[History:Client] ✅ Token found, length:", session.access_token.length);
      return { Authorization: `Bearer ${session.access_token}` };
    }
    console.log("[History:Client] ⚠️ No active session — no auth header");
  } catch (err) {
    console.warn("[History:Client] getAuthHeaders() error:", err);
  }
  return {};
}

// ─────────────────────────────────────────────────────────────────
// Save history entry (metadata only — no file)
// ─────────────────────────────────────────────────────────────────

export async function saveHistory(params: {
  toolId: string;
  toolName: string;
  fileName: string;
  fileSize: number;
  resultSummary: string;
}): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();
    if (!headers["Authorization"]) {
      console.log("[History:Client] saveHistory() skipped — not authenticated");
      return false;
    }

    console.log("[History:Client] saveHistory() POST →", params.toolId);
    const res = await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.warn("[History:Client] saveHistory() failed:", res.status, errData);
      return false;
    }

    console.log("[History:Client] saveHistory() ✅ success");
    return true;
  } catch (err) {
    console.warn("[History:Client] saveHistory() network error:", err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// Save history WITH file upload to R2 — Presigned URL approach
//
// STEP 1: POST /api/storage/presign → get presigned PUT URL + r2Key
// STEP 2: PUT file DIRECTLY to R2 via presigned URL (browser → R2, no Vercel!)
// STEP 3: POST /api/storage/confirm → update history entry with r2Key
// ─────────────────────────────────────────────────────────────────

export async function saveHistoryWithFile(params: {
  fileData: Uint8Array | Blob;
  toolId: string;
  toolName: string;
  fileName: string;
  fileSize: number;
  resultSummary: string;
}): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();
    if (!headers["Authorization"]) {
      console.log("[History:Client] saveHistoryWithFile() skipped — not authenticated");
      return false;
    }

    console.log("[History:Client] 🚀 Uploading to R2:", params.fileName, `(${params.fileSize} bytes)`);

    // ── STEP 1: Get presigned URL from server ──
    console.log("[History:Client] Step 1: Getting presigned URL...");
    const presignRes = await fetch("/api/storage/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        fileName: params.fileName,
        contentType: "application/pdf",
      }),
    });

    if (!presignRes.ok) {
      const errData = await presignRes.json().catch(() => ({}));
      console.error("[History:Client] ❌ Presign failed:", presignRes.status, errData);
      return false;
    }

    const { uploadUrl, r2Key } = await presignRes.json();
    if (!uploadUrl || !r2Key) {
      console.error("[History:Client] ❌ Invalid presign response");
      return false;
    }

    console.log("[History:Client] ✅ Got presigned URL, r2Key:", r2Key);

    // ── STEP 2: Upload file DIRECTLY to R2 ──
    console.log("[History:Client] Step 2: Uploading to R2 directly...");

    let fileBody: Blob | Uint8Array;
    if (params.fileData instanceof Blob) {
      fileBody = params.fileData;
    } else {
      fileBody = new Blob([params.fileData], { type: "application/pdf" });
    }

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: fileBody,
      // Do NOT set Content-Type header here — presigned URL already has it signed
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "");
      console.error("[History:Client] ❌ R2 PUT failed:", uploadRes.status, uploadRes.type, errText);
      return false;
    }

    console.log("[History:Client] ✅ File uploaded to R2!");

    // ── STEP 3: Confirm upload — update history with r2Key ──
    console.log("[History:Client] Step 3: Confirming upload...");
    const confirmRes = await fetch("/api/storage/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        r2Key,
        toolId: params.toolId,
        fileName: params.fileName,
        fileSize: params.fileSize,
      }),
    });

    if (!confirmRes.ok) {
      const errData = await confirmRes.json().catch(() => ({}));
      console.warn("[History:Client] ⚠️ Confirm failed:", confirmRes.status, errData);
      // File IS on R2, just history not updated — still success
    } else {
      console.log("[History:Client] ✅ Upload confirmed!");
    }

    console.log("[History:Client] 🎉 Upload complete:", r2Key);
    return true;
  } catch (err) {
    console.error("[History:Client] saveHistoryWithFile() error:", err instanceof Error ? err.message : err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// Get history entries — returns { history, authenticated }
// ─────────────────────────────────────────────────────────────────

export async function getHistory(): Promise<{
  history: HistoryEntry[];
  authenticated: boolean;
  debug?: string;
}> {
  try {
    const headers = await getAuthHeaders();
    const hasAuth = !!headers["Authorization"];

    console.log("[History:Client] getHistory() GET, hasAuth:", hasAuth);

    const res = await fetch("/api/history", {
      headers,
    });

    console.log("[History:Client] getHistory() response status:", res.status);

    if (res.status === 401) {
      console.log("[History:Client] → 401 Not authenticated");
      return { history: [], authenticated: false };
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const debugMsg = (errData as Record<string, string>).debug || (errData as Record<string, string>).error || `HTTP ${res.status}`;
      console.warn("[History:Client] →", res.status, "error:", errData);
      return { history: [], authenticated: hasAuth, debug: debugMsg };
    }

    const data = await res.json();
    console.log("[History:Client] ✅ Received", (data.history || []).length, "entries");
    return { history: data.history || [], authenticated: true };
  } catch (err) {
    console.warn("[History:Client] getHistory() network error:", err);
    return { history: [], authenticated: true };
  }
}

// ─────────────────────────────────────────────────────────────────
// Delete history entry
// ─────────────────────────────────────────────────────────────────

export async function deleteHistoryItem(id: string): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();
    if (!headers["Authorization"]) return false;

    const res = await fetch(`/api/history?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// Mark entry as downloaded
// ─────────────────────────────────────────────────────────────────

export async function markDownloaded(id: string): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();
    if (!headers["Authorization"]) return false;

    const res = await fetch("/api/history", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ id, downloaded: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// Display helpers
// ─────────────────────────────────────────────────────────────────

export function getToolMeta(toolId: string) {
  return (
    TOOL_META[toolId] || { color: "text-gray-600", bgColor: "bg-gray-50", icon: "📄" }
  );
}

export function formatHistoryDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// ─────────────────────────────────────────────────────────────────
// Get storage usage info
// ─────────────────────────────────────────────────────────────────

export async function getStorageUsage(): Promise<StorageUsage | null> {
  try {
    const headers = await getAuthHeaders();
    if (!headers["Authorization"]) return null;

    const res = await fetch("/api/storage/usage", { headers });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// Get download URL for a history entry
// ─────────────────────────────────────────────────────────────────

export function getDownloadUrl(historyId: string): string {
  return `/api/storage/download?id=${encodeURIComponent(historyId)}`;
}
