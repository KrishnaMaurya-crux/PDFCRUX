/**
 * History Module — Client-side functions for history management.
 *
 * Uses the API routes for server-side persistence.
 * Falls back gracefully if the user is not authenticated.
 *
 * Key insight: The backend returns { history: [...] } wrapped in an object.
 * getHistory() returns { entries, authenticated } so the UI can distinguish
 * between "user not logged in" and "user has no history".
 */

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
    const res = await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
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
    const res = await fetch("/api/history", {
      credentials: "include",
    });

    // 401 = user is not logged in
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
    const res = await fetch(`/api/history?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
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
    const res = await fetch("/api/history", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, downloaded: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

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
