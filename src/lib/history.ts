/**
 * History Module — Client-side functions for history management.
 *
 * FILE UPLOAD STRATEGY:
 * ─────────────────────
 * Chunked upload through /api/storage/upload (server → R2).
 * Files split into 2MB chunks → base64 → JSON POST.
 * Server stores in R2 temp objects → reassembles on last chunk.
 * Works for ANY file size, NO CORS needed, NO presigned URLs.
 *
 * DOWNLOAD STRATEGY:
 * ──────────────────
 * If entry.fileUrl starts with https:// → direct download from public R2.
 * Otherwise → proxy download through /api/storage/download (auth required).
 *
 * VERCEL ENV VARS NEEDED (5 total):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET_NAME, R2_PUBLIC_DOMAIN
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
// Helper: Convert Uint8Array to base64
// ─────────────────────────────────────────────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, bytes.length))));
  }
  return btoa(chunks.join(""));
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
// Save history WITH file upload to R2 — Chunked upload approach
//
// 2MB chunks → base64 → POST /api/storage/upload
// Server reassembles → uploads final file to R2 → updates history
// ─────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk

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

    console.log("[History:Client] 🚀 Uploading:", params.fileName, `(${params.fileSize} bytes)`);

    // Convert to Uint8Array
    let bytes: Uint8Array;
    if (params.fileData instanceof Blob) {
      bytes = new Uint8Array(await params.fileData.arrayBuffer());
    } else {
      bytes = params.fileData;
    }

    const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE);
    const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    console.log(`[History:Client] 📦 ${totalChunks} chunk(s)`);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, bytes.length);
      const chunkBytes = bytes.slice(start, end);
      const chunkBase64 = uint8ToBase64(chunkBytes);

      console.log(`[History:Client] 📤 Chunk ${i + 1}/${totalChunks} (${chunkBytes.length}B)`);

      const res = await fetch("/api/storage/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          sessionId,
          chunkIndex: i,
          totalChunks,
          chunk: chunkBase64,
          fileName: params.fileName,
          toolId: params.toolId,
          toolName: params.toolName,
          resultSummary: params.resultSummary,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error(`[History:Client] ❌ Chunk ${i + 1}/${totalChunks} failed:`, res.status, errData);
        return false;
      }

      const result = await res.json();
      if (result.uploaded) {
        console.log(`[History:Client] ✅ Upload complete! r2Key: ${result.r2Key}`);
      }
    }

    console.log("[History:Client] ✅ All chunks sent!");
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
// Get download URL for a history entry
// ─────────────────────────────────────────────────────────────────

export function getDownloadUrl(historyId: string): string {
  return `/api/storage/download?id=${encodeURIComponent(historyId)}`;
}
