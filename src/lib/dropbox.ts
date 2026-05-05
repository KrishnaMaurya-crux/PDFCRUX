/**
 * Dropbox Integration — Import files from user's Dropbox
 *
 * Uses Dropbox Chooser API v2 (client-side JS SDK)
 * Requires: DROPBOX_APP_KEY (from Dropbox App Console → Chooser integration)
 *
 * Flow:
 * 1. Client opens Dropbox Chooser (dropins.js loaded dynamically)
 * 2. User selects file(s)
 * 3. Client gets direct download links
 * 4. Files are fetched and processed client-side (no server round-trip)
 */

import { env } from "@/lib/env";

export interface DropboxFile {
  name: string;
  size: number;
  link: string;
  isDir: boolean;
}

export interface ImportedFile {
  name: string;
  data: ArrayBuffer;
  mimeType: string;
  size: number;
}

/**
 * Load Dropbox Chooser API script dynamically
 */
export function loadDropboxChooser(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Not in browser"));

    // Check if already loaded
    if ((window as Record<string, unknown>).Dropbox) {
      return resolve();
    }

    if (!env.dropbox.isConfigured) {
      return reject(new Error("Dropbox is not configured. Missing app key."));
    }

    const script = document.createElement("script");
    script.src = "https://www.dropbox.com/static/api/2/dropins.js";
    script.id = "dropboxjs";
    script.setAttribute("data-app-key", env.dropbox.appKey);
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Dropbox Chooser"));
    document.head.appendChild(script);
  });
}

/**
 * Open Dropbox Chooser for PDF file selection
 * Returns selected files with download links
 */
export async function openDropboxChooser(): Promise<DropboxFile[]> {
  return new Promise((resolve, reject) => {
    if (!env.dropbox.isConfigured) {
      return reject(new Error("Dropbox is not configured"));
    }

    // Set up the Dropbox Chooser options
    const options = {
      success: (files: DropboxFile[]) => {
        const pdfFiles = files.filter(
          (f) =>
            f.name.toLowerCase().endsWith(".pdf") && !f.isDir
        );
        if (pdfFiles.length > 0) {
          resolve(pdfFiles);
        } else {
          reject(new Error("No PDF files selected"));
        }
      },
      cancel: () => {
        reject(new Error("Dropbox selection cancelled"));
      },
      error: () => {
        reject(new Error("Dropbox chooser error"));
      },
      linkType: "direct", // Direct download links
      multiselect: true, // Allow multiple file selection
      extensions: [".pdf"], // Only PDF files
    };

    // Create a temporary button to trigger the chooser
    // Dropbox Chooser attaches to a DOM element
    const button = document.createElement("button");
    button.style.display = "none";
    document.body.appendChild(button);

    (window as Record<string, Record<string, (btn: HTMLElement, opts: Record<string, unknown>) => void>>)
      .Dropbox?.choose(button, options);
  });
}

/**
 * Download a file from Dropbox using direct link.
 * Uses ?dl=1 for forced download (bypasses Dropbox preview page).
 */
export async function downloadDropboxFile(link: string, fileName: string): Promise<ImportedFile> {
  // Dropbox direct links can be used with ?dl=1 for download
  const downloadUrl = link.includes("?dl=1") ? link : `${link}?dl=1`;

  // Use no-cors mode as Dropbox CDN may block CORS for some files.
  // If that fails, fall back to regular fetch.
  let response: Response;
  try {
    response = await fetch(downloadUrl);
  } catch {
    throw new Error(
      "Failed to download from Dropbox. The file link may have expired — please try selecting the file again."
    );
  }

  if (!response.ok) {
    throw new Error(`Failed to download from Dropbox: ${response.statusText}`);
  }

  const data = await response.arrayBuffer();

  return {
    name: fileName || "dropbox_file.pdf",
    data,
    mimeType: "application/pdf",
    size: data.byteLength,
  };
}

/**
 * Authenticate with Dropbox via popup-based implicit grant flow.
 * Returns an access token that can be used for API calls.
 */
async function getDropboxAccessToken(): Promise<string> {
  if (!env.dropbox.isConfigured) {
    throw new Error("Dropbox is not configured");
  }

  const REDIRECT_URI = `${window.location.origin}`;
  const AUTH_URL = `https://www.dropbox.com/oauth2/authorize?client_id=${env.dropbox.appKey}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  return new Promise((resolve, reject) => {
    const popup = window.open(
      AUTH_URL,
      "dropbox_auth",
      "width=500,height=600,scrollbars=yes"
    );

    if (!popup) {
      return reject(new Error("Please allow popups to connect with Dropbox"));
    }

    const timer = setInterval(() => {
      try {
        // Try to read the URL from the popup after redirect
        const url = new URL(popup.location.href);

        // Check for access_token in URL fragment (#access_token=...)
        const hash = popup.location.hash;
        if (hash && hash.includes("access_token=")) {
          clearInterval(timer);
          popup.close();
          const match = hash.match(/access_token=([^&]*)/);
          if (match && match[1]) {
            resolve(decodeURIComponent(match[1]));
          } else {
            reject(new Error("No access token in response"));
          }
        }

        // Check for error
        if (hash && hash.includes("error=")) {
          clearInterval(timer);
          popup.close();
          reject(new Error("Dropbox authorization denied"));
        }
      } catch {
        // Cross-origin error — popup is still on Dropbox's auth page, keep polling
      }

      // Popup was closed by user
      if (popup.closed) {
        clearInterval(timer);
        reject(new Error("Authorization window was closed"));
      }
    }, 400);

    // Timeout after 3 minutes
    setTimeout(() => {
      clearInterval(timer);
      if (!popup.closed) popup.close();
      reject(new Error("Authorization timed out"));
    }, 180000);
  });
}

/**
 * Save a processed file to Dropbox using the Files API.
 * Opens a popup for OAuth if needed, then uploads the file to /PdfCrux/.
 */
export async function saveToDropbox(
  fileData: ArrayBuffer | Uint8Array,
  fileName: string,
): Promise<void> {
  const accessToken = await getDropboxAccessToken();
  const buffer = fileData instanceof ArrayBuffer ? new Uint8Array(fileData) : fileData;

  // Dropbox API: /2/files/upload (simple upload for files < 150MB)
  const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path: `/PdfCrux/${fileName}`,
        mode: "add",
        autorename: true,
        mute: false,
      }),
    },
    body: buffer.buffer as ArrayBuffer,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as Record<string, Record<string, string>>)?.error_summary?.toString() ||
      `Dropbox upload failed: ${response.statusText}`
    );
  }
}

export const isDropboxReady = env.dropbox.isConfigured;

/** Dropbox app key for Chooser initialization */
export const dropboxAppKey = env.dropbox.appKey;
