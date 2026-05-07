/**
 * Dropbox Integration — Full Import / Save
 *
 * Uses Dropbox Chooser API (client-side) + Saver API (client-side)
 * Requires: NEXT_PUBLIC_DROPBOX_APP_KEY
 *
 * SECURITY: Chooser/Saver APIs are CLIENT-SIDE ONLY.
 * App Secret is NEVER needed — do not expose it to the browser.
 */

// ── NO top-level constant. Use process.env.NEXT_PUBLIC_DROPBOX_APP_KEY directly.
//    Module-level constants can go stale due to variable shadowing.
//    Next.js inlines process.env.NEXT_PUBLIC_* at build time — so direct access
//    is the most reliable approach.

/** Runtime check — always fresh, reads directly from process.env */
export function getIsDropboxReady(): boolean {
  const key = process.env.NEXT_PUBLIC_DROPBOX_APP_KEY;
  return Boolean(key && key.trim().length > 0);
}

/**
 * @deprecated Use getIsDropboxReady() instead — this is a stale module-level constant.
 * Kept for backward compatibility with existing imports.
 */
export const isDropboxReady = getIsDropboxReady();

// ── NOTE: dropboxAppKey export REMOVED — do not leak secrets to client bundle ──

// ============================================================
// TypeScript interfaces for Dropbox Drop-ins
// ============================================================

interface DropboxChooserFile {
  name: string;
  size: number;
  link: string;
  isDir: boolean;
  icon: string;
  bytes: number;
  thumbnailLink: string;
}

interface DropboxChooserOptions {
  success: (files: DropboxChooserFile[]) => void;
  cancel: () => void;
  error: (error?: string) => void;
  linkType: "direct" | "preview";
  multiselect: boolean;
  extensions?: string[];
}

interface DropboxSaverOptions {
  files: DropboxSaverFile[];
  success: () => void;
  cancel: () => void;
  error: (error?: string) => void;
}

interface DropboxSaverFile {
  url: string;
  filename: string;
}

interface DropboxDropinsGlobal {
  choose: (options: DropboxChooserOptions) => void;
  save: (options: DropboxSaverOptions) => void;
}

// ============================================================
// Global type augmentation
// ============================================================
declare global {
  interface Window {
    Dropbox: DropboxDropinsGlobal;
  }
}

// ============================================================
// Script Loading (idempotent)
// ============================================================
// Track the key that was last injected — if key changes, force reload
let lastInjectedKey: string | null = null;

export async function loadDropboxScripts(): Promise<void> {
  // ── DIRECT process.env access with HARD-CODED FALLBACK ──
  // If process.env returns undefined (Vercel sync issue), use fallback key.
  // TODO: Remove fallback after Vercel deployment confirms key is injected.
  const FALLBACK_KEY = "uwt8kpifw2nwe13";
  const dropboxKey = process.env.NEXT_PUBLIC_DROPBOX_APP_KEY || FALLBACK_KEY;

  // ── DEBUG ALERT: Shows detected key source on button click ──
  const source = process.env.NEXT_PUBLIC_DROPBOX_APP_KEY ? "process.env" : "FALLBACK";
  window.alert("Detected Key: " + dropboxKey + "\nSource: " + source);
  console.log("INJECTING KEY:", dropboxKey, "(source:", source, ")");

  if (!dropboxKey) {
    console.error(
      "[Dropbox] CRITICAL: No key available (not even fallback)."
    );
    throw new Error("Dropbox is not configured. Missing NEXT_PUBLIC_DROPBOX_APP_KEY.");
  }

  // Already loaded with the SAME key? Skip.
  if (lastInjectedKey === dropboxKey && window.Dropbox) {
    console.log("[Dropbox] Scripts already loaded with same key, skipping.");
    return;
  }

  // KEY CHANGED or never loaded — force reload
  if (lastInjectedKey && lastInjectedKey !== dropboxKey) {
    console.log("[Dropbox] ⚠️ Key changed! Old:", lastInjectedKey.slice(0, 4) + "..., New:", dropboxKey.slice(0, 4) + "... — Force reloading script.");
  }

  // Remove any existing script (old key or stale)
  const existing = document.getElementById("dropbox-dropins-js");
  if (existing) {
    existing.remove();
    console.log("[Dropbox] Removed existing dropins.js script from DOM.");
  }
  // Reset the global so we don't use stale Dropbox object
  delete (window as any).Dropbox;

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "dropbox-dropins-js";
    script.src = "https://www.dropbox.com/static/api/2/dropins.js";
    // ── FORCE setAttribute — direct process.env access ──
    script.setAttribute("data-app-key", dropboxKey);
    script.async = true;

    // Verify BEFORE injecting
    const injectedKey = script.getAttribute("data-app-key");
    console.log("[Dropbox] Injecting script with data-app-key:", injectedKey || "EMPTY");

    script.onload = () => {
      console.log("[Dropbox] ✅ dropins.js loaded. Dropbox global available:", Boolean(window.Dropbox));
      lastInjectedKey = dropboxKey;
      resolve();
    };

    script.onerror = () => {
      console.error("[Dropbox] Failed to load dropins.js");
      reject(new Error("Failed to load Dropbox Chooser script"));
    };

    document.head.appendChild(script);
  });
}

// ============================================================
// Download a single chooser file
// ============================================================
async function downloadChooserFile(
  file: DropboxChooserFile
): Promise<File> {
  console.log(`[Dropbox] Downloading: ${file.name} (${file.size} bytes)`);
  
  // Append ?dl=1 for direct download
  const downloadUrl = file.link.includes("?dl=1") ? file.link : `${file.link}?dl=1`;

  const response = await fetch(downloadUrl);

  if (!response.ok) {
    throw new Error(`Failed to download from Dropbox: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  
  // Validate: prevent 0-byte files
  if (arrayBuffer.byteLength === 0) {
    throw new Error(`Downloaded file "${file.name}" is empty (0 bytes)`);
  }

  console.log(`[Dropbox] Downloaded ${file.name}: ${arrayBuffer.byteLength} bytes`);
  
  return new File([arrayBuffer], file.name, {
    type: response.headers.get("content-type") || "application/octet-stream",
  });
}

// ============================================================
// Pick files from Dropbox (main entry point)
// ============================================================
export async function pickFromDropbox(
  acceptTypes?: string
): Promise<File[]> {
  console.log("[Dropbox] Starting pickFromDropbox...");

  // Load scripts
  await loadDropboxScripts();

  if (!window.Dropbox) {
    throw new Error("Dropbox API not loaded");
  }

  return new Promise((resolve, reject) => {
    // Build extensions list from acceptTypes (e.g. ".pdf,.doc,.docx" → [".pdf", ".doc", ".docx"])
    let extensions: string[] | undefined;
    if (acceptTypes) {
      extensions = acceptTypes
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }

    const options: DropboxChooserOptions = {
      success: async (files: DropboxChooserFile[]) => {
        console.log(`[Dropbox] Chooser returned ${files.length} file(s)`);

        if (files.length === 0) {
          // User opened chooser but selected nothing — treat as cancel
          resolve([]);
          return;
        }

        try {
          // Download all selected files
          const downloadedFiles = await Promise.all(
            files.map((f) => downloadChooserFile(f))
          );

          // Validate: filter out any empty files that somehow got through
          const validFiles = downloadedFiles.filter(
            (f) => f instanceof File && f.name.length > 0 && f.size > 0
          );

          if (validFiles.length === 0) {
            reject(new Error("All downloaded files were invalid or empty"));
            return;
          }

          console.log(`[Dropbox] Successfully imported ${validFiles.length} file(s):`,
            validFiles.map((f) => `${f.name} (${f.size}B)`));
          resolve(validFiles);
        } catch (err) {
          console.error("[Dropbox] Download failed:", err);
          reject(err);
        }
      },
      cancel: () => {
        console.log("[Dropbox] Chooser cancelled by user");
        // RESOLVE with empty array — not reject. No error toast needed.
        resolve([]);
      },
      error: (error?: string) => {
        console.error("[Dropbox] Chooser error:", error);
        reject(new Error(`Dropbox chooser error: ${error || "Unknown"}`));
      },
      linkType: "direct",
      multiselect: true,
      extensions,
    };

    console.log("[Dropbox] Opening Chooser...");
    window.Dropbox.choose(options);
  });
}

// ============================================================
// Save file to Dropbox
// ============================================================
export async function saveToDropbox(
  fileData: ArrayBuffer | Blob,
  fileName: string
): Promise<void> {
  console.log(`[Dropbox] Saving ${fileName} to Dropbox...`);

  // Load scripts if not loaded
  await loadDropboxScripts();

  if (!window.Dropbox) {
    throw new Error("Dropbox API not loaded");
  }

  const blob = fileData instanceof ArrayBuffer ? new Blob([fileData]) : fileData;
  const blobUrl = URL.createObjectURL(blob);

  try {
    await new Promise<void>((resolve, reject) => {
      const options: DropboxSaverOptions = {
        files: [
          {
            url: blobUrl,
            filename: fileName,
          },
        ],
        success: () => {
          console.log(`[Dropbox] File saved: ${fileName}`);
          resolve();
        },
        cancel: () => {
          console.log("[Dropbox] Saver cancelled by user");
          // Resolve silently — user chose not to save, not an error
          resolve();
        },
        error: (error?: string) => {
          console.error("[Dropbox] Saver error:", error);
          reject(new Error(`Dropbox saver error: ${error || "Unknown"}`));
        },
      };

      console.log("[Dropbox] Opening Saver...");
      window.Dropbox.save(options);
    });
  } finally {
    // Always revoke the blob URL to free memory
    URL.revokeObjectURL(blobUrl);
    console.log("[Dropbox] Blob URL revoked.");
  }
}
