/**
 * History Module — Client-side functions for history management.
 *
 * Auth strategy: Supabase stores session in localStorage (browser).
 * The server cannot access localStorage, so we send the Supabase access_token
 * in the Authorization header with every request. The server uses this token
 * to verify the user via supabase.auth.getUser(token).
 */

import { supabase } from "@/lib/supabase";

export interface HistoryEntry {
  id: string;
  userId: string;
  toolId: string;
  toolName: string;
  fileName: string;
  fileSize: number;
  resultSummary: string;
  downloaded: boolean;
  createdAt: string;
}

/** Result type that distinguishes auth failure from empty history. */
export interface HistoryResult {
  entries: HistoryEntry[];
  authenticated: boolean;
}

/** Tool metadata for display purposes. */
const TOOL_META: Record<string, { color: string; bgColor: string; icon: string }> = {
  "pdf-summary": { color: "text-amber-600", bgColor: "bg-amber-50", icon: "✨" },
  "pdf-notes": { color: "text-emerald-600", bgColor: "bg-emerald-50", icon: "📝" },
  "resume-checker": { color: "text-blue-600", bgColor: "bg-blue-50", icon: "📋" },
  "pdf-ocr": { color: "text-purple-600", bgColor: "bg-purple-50", icon: "🔍" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Auth Header Helper
//
// Supabase stores session in localStorage → server never sees cookies.
// Solution: Read the access_token from the Supabase client session and send
// it as an Authorization: Bearer <token> header to every API call.
// ─────────────────────────────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }
  } catch {
    // Supabase not available — proceed without auth
  }

  return headers;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save a tool usage entry to history.
 * Silently fails if not authenticated — history is non-critical.
 */
export async function saveHistory(params: {
  toolId: string;
  toolName: string;
  fileName: string;
  fileSize: number;
  resultSummary: string;
}): Promise<boolean> {
  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify(params),
    });
    return res.ok;
  } catch {
    // Silently fail — history is non-critical
    return false;
  }
}

/**
 * Get all history entries for the current user.
 *
 * Returns { entries, authenticated } so the UI can:
 *  - Show a "Please log in" message when authenticated === false
 *  - Show an empty state when authenticated === true && entries.length === 0
 *  - Show the history list when entries.length > 0
 */
export async function getHistory(): Promise<HistoryResult> {
  try {
    const authHeaders = await getAuthHeaders();

    // If no auth header, user is definitely not logged in
    if (!authHeaders["Authorization"]) {
      return { entries: [], authenticated: false };
    }

    const res = await fetch("/api/history", {
      headers: authHeaders,
    });

    // 401 = token invalid or expired
    if (res.status === 401) {
      return { entries: [], authenticated: false };
    }

    // Other non-ok responses (503, 500, etc.)
    if (!res.ok) {
      return { entries: [], authenticated: true };
    }

    const data = await res.json();
    return {
      entries: data.history || [],
      authenticated: true,
    };
  } catch {
    // Network error — treat as authenticated but empty
    return { entries: [], authenticated: true };
  }
}

/**
 * Delete a history entry by ID.
 */
export async function deleteHistoryItem(id: string): Promise<boolean> {
  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`/api/history?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Mark a history entry as downloaded.
 */
export async function markDownloaded(id: string): Promise<boolean> {
  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/history", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({ id, downloaded: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Display Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get tool display metadata.
 */
export function getToolMeta(toolId: string) {
  return TOOL_META[toolId] || { color: "text-gray-600", bgColor: "bg-gray-50", icon: "📄" };
}

/**
 * Format a date string for display.
 */
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

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
