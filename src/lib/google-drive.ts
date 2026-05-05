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

// ============================================================
// Google Drive OAuth Scopes
// These 5 scopes are required for full Google Drive integration:
//   1. userinfo.email     — Read user's email address
//   2. userinfo.profile   — Read user's basic profile info
//   3. openid             — OpenID Connect authentication
//   4. drive.file         — Per-file access (created/opened by this app)
//   5. drive.appdata      — Access app's hidden data folder
// ============================================================
export const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.appdata",
];

// Discovery doc URI for Google Identity Services (GIS)
const DISCOVERY_DOC = "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";

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
 * Load Google Identity Services (GIS) and Picker API scripts dynamically.
 * GIS provides the modern OAuth token flow required by the Picker.
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

    // Load the gapi client script first
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => {
      // Load picker and client libraries
      (window as Record<string, unknown>).gapi?.load("client:picker", {
        callback: () => resolve(),
        onerror: () => reject(new Error("Failed to load Google Picker")),
      });
    };
    script.onerror = () => reject(new Error("Failed to load Google API script"));
    document.head.appendChild(script);
  });
}

/**
 * Open Google Picker for PDF file selection.
 * Uses TokenClient (GIS) to obtain an OAuth token with all 5 Drive scopes.
 * Returns selected files with download tokens.
 */
export async function openGoogleDrivePicker(): Promise<GoogleDriveFile[]> {
  await loadGooglePickerAPI();

  return new Promise((resolve, reject) => {
    if (!env.googleDrive.isConfigured) {
      return reject(new Error("Google Drive not configured"));
    }

    // Obtain an OAuth access token via Google Identity Services (TokenClient)
    // This ensures all 5 Drive scopes are granted before the Picker opens.
    const tokenClient = (
      window as Record<string, Record<string, new (opts: Record<string, unknown>) => {
        callback: (resp: Record<string, unknown>) => void;
        requestAccessToken: (opts?: Record<string, unknown>) => void;
      }>>
    ).google?.accounts?.oauth2;

    if (!tokenClient) {
      return reject(new Error("Google Identity Services not available. Please reload the page."));
    }

    const client = new tokenClient.TokenClient({
      client_id: env.googleDrive.clientId,
      scope: GOOGLE_DRIVE_SCOPES.join(" "),
      callback: (tokenResponse: Record<string, unknown>) => {
        const accessToken = tokenResponse.access_token as string | undefined;
        if (!accessToken) {
          // If there's an error or no token, Picker can still work via developer key
          // for files that the user shares directly.
          buildPicker("");
          return;
        }
        buildPicker(accessToken);
      },
    });

    client.requestAccessToken({ prompt: "" });

    function buildPicker(oauthToken: string) {
      const picker = new (
        window as Record<string, Record<string, new (...args: unknown[]) => unknown>>
      ).google.picker.PickerBuilder()
        .setAppId(env.googleDrive.appId)
        .setOAuthToken(oauthToken)
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
    }
  });
}

/**
 * Download a file from Google Drive using access token.
 * Works both client-side and server-side.
 * Prefers `fields=name,size,mimeType` on the download URL to avoid a second request.
 */
export async function downloadGoogleDriveFile(
  fileId: string,
  accessToken: string
): Promise<ImportedFile> {
  // Use alt=media with fields to get both metadata + content in one call
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&fields=name,size,mimeType`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }

  // Google returns metadata in JSON content-type for fields param;
  // fallback: try to extract name from Content-Disposition header.
  const disposition = response.headers.get("Content-Disposition") || "";
  const nameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";\n]+)"?/i);
  const fallbackName = nameMatch ? decodeURIComponent(nameMatch[1]) : `drive_${fileId}.pdf`;

  const data = await response.arrayBuffer();

  return {
    name: fallbackName,
    data,
    mimeType: "application/pdf",
    size: data.byteLength,
  };
}

/**
 * Upload a processed file to Google Drive using resumable upload.
 * Requires OAuth access token (obtained via TokenClient).
 * Uses drive.file scope — file is only visible to the app and user.
 */
export async function uploadToGoogleDrive(
  fileData: ArrayBuffer | Uint8Array,
  fileName: string,
): Promise<void> {
  await loadGooglePickerAPI();

  return new Promise((resolve, reject) => {
    const tokenClient = (
      window as Record<string, Record<string, new (opts: Record<string, unknown>) => {
        callback: (resp: Record<string, unknown>) => void;
        requestAccessToken: (opts?: Record<string, unknown>) => void;
      }>>
    ).google?.accounts?.oauth2;

    if (!tokenClient) {
      return reject(new Error("Google Identity Services not available. Please reload the page."));
    }

    const client = new tokenClient.TokenClient({
      client_id: env.googleDrive.clientId,
      scope: GOOGLE_DRIVE_SCOPES.join(" "),
      callback: async (tokenResponse: Record<string, unknown>) => {
        const accessToken = tokenResponse.access_token as string | undefined;
        if (!accessToken) {
          return reject(new Error("Google Drive access denied. Please allow access and try again."));
        }

        try {
          // Step 1: Initiate resumable upload session
          const initResponse = await fetch(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                name: fileName,
                mimeType: "application/pdf",
              }),
            }
          );

          if (!initResponse.ok) {
            throw new Error(`Failed to initiate upload: ${initResponse.statusText}`);
          }

          const location = initResponse.headers.get("Location");
          if (!location) {
            throw new Error("Upload session failed — no location header");
          }

          // Step 2: Upload the actual file data
          const uploadResponse = await fetch(location, {
            method: "PUT",
            headers: {
              "Content-Type": "application/pdf",
            },
            body: fileData instanceof ArrayBuffer ? fileData : (fileData.buffer as ArrayBuffer),
          });

          if (!uploadResponse.ok) {
            throw new Error(`Upload failed: ${uploadResponse.statusText}`);
          }

          resolve();
        } catch (err) {
          reject(err);
        }
      },
    });

    // prompt: "" uses cached token if available, avoids re-consent
    client.requestAccessToken({ prompt: "" });
  });
}

export const isGoogleDriveReady = env.googleDrive.isConfigured;
