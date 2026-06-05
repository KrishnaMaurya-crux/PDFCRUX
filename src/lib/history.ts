/**
 * History Module — Client-side functions for history management.
 *
 * FILE UPLOAD STRATEGY (SERVER PROXY):
 * ───────────────────────────────────────
 * POST /api/file?toolId=xxx&fileName=yyy
 * → Body = raw file bytes (Blob/Uint8Array)
 * → Server uploads to R2 + updates history + tracks storage
 * → No presigned URLs, no CORS issues, no chunks.
 *
 * DOWNLOAD STRATEGY (SERVER PROXY):
 * ─────────────────────────────────────
 * GET /api/file?key=uploads/2026-06/file.pdf&fileName=output.pdf
 *   or
 * GET /api/file?id=<historyId>
 * → Server fetches from R2 → streams to client
 * → No CORS issues for downloads.
 *
 * VERCEL ENV VARS NEEDED (4 total):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
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
// Get Bearer token from Supabase session
// ─────────────────────────────────────────────────────────────────

export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
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
    console.warn("[History:Client] saveHistory() error:", err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// Save history WITH file upload to R2 — SERVER PROXY APPROACH
//
// Single POST to /api/file with raw file bytes in the body.
// Server handles everything: R2 upload + history update + storage tracking.
//
// No presigned URLs. No CORS issues. No chunks. One API call.
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

    console.log("[History:Client] 🚀 Proxy Upload:", params.fileName, `(${params.fileSize} bytes)`);

    // Build URL with query params for metadata
    const queryParams = new URLSearchParams({
      fileName: params.fileName,
      toolId: params.toolId,
      toolName: params.toolName || "",
      resultSummary: params.resultSummary || "",
    });

    // Convert to Blob for fetch body
    const fileBlob = params.fileData instanceof Blob
      ? params.fileData
      : new Blob([params.fileData]);

    // POST raw file bytes to /api/file proxy
    // Server uploads to R2 server-side — no CORS, no presigned URLs
    const uploadRes = await fetch(`/api/file?${queryParams.toString()}`, {
      method: "POST",
      headers,
      body: fileBlob,
    });

    if (!uploadRes.ok) {
      const errData = await uploadRes.json().catch(() => ({}));
      console.error("[History:Client] ❌ Proxy upload failed:", uploadRes.status, errData);
      return false;
    }

    const result = await uploadRes.json();
    console.log("[History:Client] ✅ Proxy upload complete! r2Key:", result.r2Key);
    return true;
  } catch (err) {
    console.error("[History:Client] saveHistoryWithFile() error:", err instanceof Error ? err.message : err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// Get history entries
// ─────────────────────────────────────────────────────────────────

export async function getHistory(): Promise<{
  history: HistoryEntry[];
  authenticated: boolean;
  debug?: string;
}> {
  try {
    const headers = await getAuthHeaders();
    const hasAuth = !!headers["Authorization"];

    const res = await fetch("/api/history", { headers });

    if (res.status === 401) {
      return { history: [], authenticated: false };
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const debugMsg = (errData as Record<string, string>).debug || (errData as Record<string, string>).error || `HTTP ${res.status}`;
      return { history: [], authenticated: hasAuth, debug: debugMsg };
    }

    const data = await res.json();
    return { history: data.history || [], authenticated: true };
  } catch (err) {
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
  return TOOL_META[toolId] || { color: "text-gray-600", bgColor: "bg-gray-50", icon: "📄" };
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
// Get download URL for a file (server proxy — no CORS)
//
// Two modes:
//   By r2Key:    /api/file?key=uploads/.../file.pdf&fileName=output.pdf
//   By historyId: /api/file?id=<historyId>
// ─────────────────────────────────────────────────────────────────

export function getDownloadUrlByKey(r2Key: string, fileName: string): string {
  const params = new URLSearchParams({ key: r2Key, fileName });
  return `/api/file?${params.toString()}`;
}

export function getDownloadUrl(historyId: string): string {
  return `/api/file?id=${encodeURIComponent(historyId)}`;
}
