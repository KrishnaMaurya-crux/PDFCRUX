/**
 * Google Drive Integration — Import files from user's Google Drive
 *
 * Uses Google Picker API (client-side) + server-side download via Google Drive API v3
 * Requires: GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_API_KEY, GOOGLE_DRIVE_APP_ID
 *
 * Flow:
 * 1. Client opens Google Picker (gapi.picker)
 * 2. User selects file(s)
 * 3. Client gets file IDs + tokens
 * 4. Server downloads files using access token
 * 5. Files are processed locally
 */

import { env } from "@/lib/env";

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  token: string;
}

export interface ImportedFile {
  name: string;
  data: ArrayBuffer;
  mimeType: string;
  size: number;
}

/**
 * Load Google Picker API script dynamically
 */
export function loadGooglePickerAPI(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Not in browser"));

    // Check if already loaded
    if ((window as Record<string, unknown>).google?.picker) {
      return resolve();
    }

    if (!env.googleDrive.isConfigured) {
      return reject(new Error("Google Drive is not configured. Missing API keys."));
    }

    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => {
      // Load picker and client libraries
      (window as Record<string, unknown>).gapi?.load("picker", {
        callback: () => resolve(),
        onerror: () => reject(new Error("Failed to load Google Picker")),
      });
    };
    script.onerror = () => reject(new Error("Failed to load Google API script"));
    document.head.appendChild(script);
  });
}

/**
 * Open Google Picker for PDF file selection
 * Returns selected files with download tokens
 */
export async function openGoogleDrivePicker(): Promise<GoogleDriveFile[]> {
  await loadGooglePickerAPI();

  return new Promise((resolve, reject) => {
    if (!env.googleDrive.isConfigured) {
      return reject(new Error("Google Drive not configured"));
    }

    const picker = new (
      window as Record<string, Record<string, new (...args: unknown[]) => unknown>>
    ).google.picker.PickerBuilder()
      .setAppId(env.googleDrive.appId)
      .setOAuthToken("") // Will use user's existing Google session
      .setDeveloperKey(env.googleDrive.apiKey)
      .setCallback((data: Record<string, unknown>) => {
        const action = data.action as string;
        if (action === "google.picker.action.PICKED") {
          const docs = (data.docs as GoogleDriveFile[]) || [];
          if (docs.length > 0) {
            resolve(docs);
          } else {
            reject(new Error("No files selected"));
          }
        } else if (action === "google.picker.action.CANCEL") {
          reject(new Error("Picker cancelled"));
        }
      })
      .setTitle("Select PDF files from Google Drive")
      .setMimeTypes("application/pdf")
      .enableFeature(
        (window as Record<string, Record<string, string>>).google?.picker?.Feature
          ?.MULTISELECT_ENABLED || ""
      )
      .build();

    picker.setVisible(true);
  });
}

/**
 * Download a file from Google Drive using access token (server-side)
 */
export async function downloadGoogleDriveFile(
  fileId: string,
  accessToken: string
): Promise<ImportedFile> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }

  // Get file metadata
  const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,size,mimeType`;
  const metaResponse = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const metadata = await metaResponse.json();

  const data = await response.arrayBuffer();

  return {
    name: metadata.name || `drive_${fileId}.pdf`,
    data,
    mimeType: metadata.mimeType || "application/pdf",
    size: metadata.size || data.byteLength,
  };
}

export const isGoogleDriveReady = env.googleDrive.isConfigured;
