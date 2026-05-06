/**
 * Dropbox Integration — Chooser API (import) + Saver API (export)
 *
 * Client-side only module. Loads the Dropbox Drop-ins v2 script which
 * bundles both the Chooser and Saver dialogs.
 *
 * Requires: DROPBOX_APP_KEY in environment
 *
 * Flow — Import (Chooser):
 *   1. Call loadDropboxScripts() to inject dropins.js (idempotent)
 *   2. Call pickFromDropbox() → opens native Dropbox file picker
 *   3. User selects one or more .pdf files
 *   4. We fetch each direct link, convert to File objects
 *   5. Return File[] to the caller
 *
 * Flow — Export (Saver):
 *   1. Ensure scripts are loaded (pickFromDropbox does this implicitly,
 *      or call loadDropboxScripts manually)
 *   2. Call saveToDropbox(blob, fileName) → opens native Dropbox save dialog
 *   3. User picks a destination folder
 *   4. Dropbox handles the upload server-side
 */

import { env } from "@/lib/env";

// ============================================================
// Types
// ============================================================

/** Shape of a file returned by Dropbox.choose() success callback */
interface DropboxChooserFile {
  /** File name as stored in Dropbox */
  name: string;
  /** File size in bytes */
  bytes: number;
  /** URL to a thumbnail image (may be empty string) */
  thumbnailUrl: string;
  /** URL to an icon representing the file type */
  icon: string;
  /** Direct download link (expires in ~4 hours) */
  link: string;
  /** Unique identifier for the file in Dropbox */
  id: string;
}

/** Options accepted by Dropbox.choose() */
interface DropboxChooserOptions {
  success: (files: DropboxChooserFile[]) => void;
  cancel: () => void;
  error: (errorMessage: string) => void;
  /** "direct" gives a temporary download link; "preview" gives a shareable preview link */
  linkType: "direct" | "preview";
  /** Allow selecting multiple files */
  multiselect: boolean;
  /** File extensions to show (including the dot) */
  extensions: string[];
}

/** Options accepted by Dropbox.save() */
interface DropboxSaverOptions {
  success: () => void;
  cancel: () => void;
  error: (errorMessage: string) => void;
  /** Array of files to save (currently only 1 supported) */
  files: DropboxSaverFile[];
}

/** A single file to save via the Saver API */
interface DropboxSaverFile {
  /** URL pointing to the file data (blob:, data:, or https:) */
  url: string;
  /** Name the file will be saved as */
  filename: string;
}

/** The global Dropbox dropins object */
interface DropboxDropinsGlobal {
  choose: (options: DropboxChooserOptions) => void;
  save: (options: DropboxSaverOptions) => void;
}

// ============================================================
// Exported Config
// ============================================================

/** Whether Dropbox integration is configured (app key present) */
export const isDropboxReady = env.dropbox.isConfigured;

/** The Dropbox App Key used for Chooser / Saver initialisation */
export const dropboxAppKey = env.dropbox.appKey;

// ============================================================
// Helpers
// ============================================================

const SCRIPT_ID = "dropboxjs";
const SCRIPT_SRC = "https://www.dropbox.com/static/api/2/dropins.js";

/**
 * Access the Dropbox global object from the window.
 * Returns `null` when not available (SSR, script not loaded yet).
 */
function getDropboxGlobal(): DropboxDropinsGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Dropbox?: DropboxDropinsGlobal }).Dropbox ?? null;
}

// ============================================================
// Script Loader
// ============================================================

/**
 * Dynamically load the Dropbox Drop-ins v2 script (`dropins.js`).
 *
 * This script bundles both the **Chooser** and **Saver** APIs.
 * The function is **idempotent** — calling it multiple times is safe.
 *
 * @returns A promise that resolves when the script is ready.
 * @throws If called outside the browser, if Dropbox is not configured,
 *         or if the script fails to load.
 */
export function loadDropboxScripts(): Promise<void> {
  return new Promise((resolve, reject) => {
    // --- SSR guard ---
    if (typeof window === "undefined") {
      return reject(new Error("Dropbox scripts can only be loaded in the browser."));
    }

    // --- Already loaded? ---
    if (getDropboxGlobal()) {
      return resolve();
    }

    // --- Config check ---
    if (!env.dropbox.isConfigured) {
      return reject(new Error("Dropbox is not configured. Set DROPBOX_APP_KEY in environment."));
    }

    // --- Avoid duplicate <script> tag ---
    if (document.getElementById(SCRIPT_ID)) {
      // Script tag exists but global not yet available — wait for it.
      const waitForGlobal = (): void => {
        if (getDropboxGlobal()) {
          resolve();
        } else {
          setTimeout(waitForGlobal, 50);
        }
      };
      waitForGlobal();
      return;
    }

    // --- Inject the script ---
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    // The Dropbox Chooser/Saver reads the app key from this data attribute.
    script.setAttribute("data-app-key", env.dropbox.appKey);

    script.addEventListener("load", () => {
      // Small delay to ensure the global is fully initialised.
      setTimeout(() => {
        if (getDropboxGlobal()) {
          resolve();
        } else {
          reject(new Error("Dropbox script loaded but global object not found."));
        }
      }, 100);
    });

    script.addEventListener("error", () => {
      reject(new Error("Failed to load the Dropbox Drop-ins script."));
    });

    document.head.appendChild(script);
  });
}

// ============================================================
// Chooser — Import Files FROM Dropbox
// ============================================================

/**
 * Open the Dropbox Chooser so the user can select PDF files.
 *
 * The Chooser runs entirely in the user's browser via a popup/iframe.
 * Selected files' **direct** download links are fetched immediately
 * (they expire in ~4 hours) and converted to standard `File` objects.
 *
 * @returns An array of `File` objects (may be empty if the user cancels).
 * @throws If Dropbox is not configured, scripts fail to load, or a
 *         download error occurs for a selected file.
 */
export async function pickFromDropbox(): Promise<File[]> {
  // Ensure the script is loaded first.
  await loadDropboxScripts();

  const dropbox = getDropboxGlobal();
  if (!dropbox) {
    throw new Error("Dropbox is not available. Ensure the Drop-ins script has loaded.");
  }

  return new Promise<File[]>((resolve, reject) => {
    const options: DropboxChooserOptions = {
      // --- User picked files ---
      success: async (files: DropboxChooserFile[]) => {
        try {
          const pdfFiles = files.filter(
            (f) => f.name.toLowerCase().endsWith(".pdf")
          );

          if (pdfFiles.length === 0) {
            return resolve([]);
          }

          // Download all selected files in parallel.
          const downloaded = await Promise.all(
            pdfFiles.map((f) => downloadChooserFile(f))
          );

          resolve(downloaded);
        } catch (err) {
          reject(
            err instanceof Error ? err : new Error("Failed to download selected files.")
          );
        }
      },

      // --- User closed the chooser without selecting ---
      cancel: () => {
        // Resolve with empty array — cancellation is not an error.
        resolve([]);
      },

      // --- Dropbox reported an error ---
      error: (errorMessage: string) => {
        reject(new Error(`Dropbox Chooser error: ${errorMessage}`));
      },

      linkType: "direct",
      multiselect: true,
      extensions: [".pdf"],
    };

    dropbox.choose(options);
  });
}

/**
 * Download a single file from its Dropbox direct link and return a File object.
 *
 * @internal Exported only for testing purposes.
 */
async function downloadChooserFile(file: DropboxChooserFile): Promise<File> {
  // Dropbox direct links may need ?dl=1 to force download behaviour.
  const url = file.link.includes("?") ? `${file.link}&dl=1` : `${file.link}?dl=1`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to download "${file.name}" from Dropbox (HTTP ${response.status}).`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: "application/pdf" });

  return new File([blob], file.name, {
    type: "application/pdf",
    lastModified: Date.now(),
  });
}

// ============================================================
// Saver — Export Processed PDFs TO Dropbox
// ============================================================

/**
 * Open the Dropbox Saver dialog so the user can save a processed PDF.
 *
 * The file data is provided as a `Blob`. A temporary `blob:` URL is
 * created for the Dropbox Saver to read from. The URL is revoked
 * once the save operation completes (success or failure).
 *
 * @param fileData - The processed PDF as a Blob.
 * @param fileName - The name the file will be saved as (e.g. "compressed.pdf").
 * @returns A promise that resolves when the file is saved successfully.
 * @throws If Dropbox is not configured, scripts fail to load, the blob URL
 *         cannot be created, or the user encounters an error.
 */
export async function saveToDropbox(fileData: Blob, fileName: string): Promise<void> {
  // Ensure the script is loaded first.
  await loadDropboxScripts();

  const dropbox = getDropboxGlobal();
  if (!dropbox) {
    throw new Error("Dropbox is not available. Ensure the Drop-ins script has loaded.");
  }

  // Create a blob URL that the Saver can read.
  const blobUrl = URL.createObjectURL(fileData);

  try {
    await new Promise<void>((resolve, reject) => {
      const options: DropboxSaverOptions = {
        success: () => {
          resolve();
        },
        cancel: () => {
          // User closed the dialog — resolve gracefully (not an error).
          resolve();
        },
        error: (errorMessage: string) => {
          reject(new Error(`Dropbox Saver error: ${errorMessage}`));
        },
        files: [
          {
            url: blobUrl,
            filename: fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`,
          },
        ],
      };

      dropbox.save(options);
    });
  } finally {
    // Always revoke the blob URL to free memory, regardless of outcome.
    URL.revokeObjectURL(blobUrl);
  }
}
