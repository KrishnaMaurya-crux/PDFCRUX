/**
 * Dropbox Integration — Full Import / Save
 *
 * Uses Dropbox Chooser API (client-side) + Saver API (client-side)
 * Requires: NEXT_PUBLIC_DROPBOX_APP_KEY
 *
 * Flow (Import / pickFromDropbox):
 * 1. Load dropins.js script with data-app-key
 * 2. Open Chooser
 * 3. User selects file(s)
 * 4. Download selected files via direct links (?dl=1)
 * 5. Return File[] to caller
 *
 * Flow (Save / saveToDropbox):
 * 1. Create blob URL from file data
 * 2. Open Saver with blob URL
 * 3. Revoke blob URL in finally
 */

import { env } from "@/lib/env";

// ============================================================
// Exports computed at module level
// ============================================================
export const isDropboxReady = env.dropbox.isConfigured;
export const dropboxAppKey = env.dropbox.appKey;

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
let dropinsLoaded = false;

export async function loadDropboxScripts(): Promise<void> {
  if (dropinsLoaded && window.Dropbox) {
    console.log("[Dropbox] Scripts already loaded, skipping.");
    return;
  }

  if (!env.dropbox.isConfigured) {
    console.warn(
      `[Dropbox] Not configured — missing app key. (Key present: ${Boolean(env.dropbox.appKey)})`
    );
    throw new Error("Dropbox is not configured. Missing app key.");
  }

  console.log("[Dropbox] Loading dropins.js with app key:", env.dropbox.appKey ? `SET (${env.dropbox.appKey.slice(0, 4)}...)` : "NOT SET");

  return new Promise((resolve, reject) => {
    // Check if already in DOM
    const existing = document.getElementById("dropbox-dropins-js");
    if (existing && window.Dropbox) {
      console.log("[Dropbox] Script already in DOM and Dropbox global available.");
      dropinsLoaded = true;
      resolve();
      return;
    }
    if (existing) {
      existing.remove();
    }

    const script = document.createElement("script");
    script.id = "dropbox-dropins-js";
    script.src = "https://www.dropbox.com/static/api/2/dropins.js";
    script.dataset.appKey = env.dropbox.appKey;
    script.async = true;

    script.onload = () => {
      console.log("[Dropbox] dropins.js loaded. Dropbox global available:", Boolean(window.Dropbox));
      dropinsLoaded = true;
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
          reject(new Error("No files selected from Dropbox"));
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

          console.log(`[Dropbox] Successfully imported ${validFiles.length} file(s)`);
          resolve(validFiles);
        } catch (err) {
          console.error("[Dropbox] Download failed:", err);
          reject(err);
        }
      },
      cancel: () => {
        console.log("[Dropbox] Chooser cancelled by user");
        reject(new Error("Dropbox selection cancelled"));
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
          reject(new Error("Dropbox save cancelled"));
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
