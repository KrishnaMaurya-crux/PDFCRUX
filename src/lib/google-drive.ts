/**
 * Google Drive Integration — Full Import / Save
 *
 * Uses Google Identity Services (GIS) + Picker API + Drive API v3
 * Requires: NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID, NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY,
 *           NEXT_PUBLIC_GOOGLE_DRIVE_APP_ID
 */

import { env } from "@/lib/env";

// ============================================================
// Scopes
// ============================================================
export const GOOGLE_DRIVE_SCOPES =
  "email profile openid https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata";

/** Computed at module level */
export const isGoogleDriveReady = env.googleDrive.isConfigured;

// ============================================================
// TypeScript declarations for Google APIs
// ============================================================

/* eslint-disable @typescript-eslint/no-namespace */
declare namespace google {
  namespace accounts {
    namespace oauth2 {
      interface TokenResponse {
        access_token: string;
        token_type: string;
        expires_in: number;
        scope: string;
        error?: string;
        error_description?: string;
      }

      interface TokenClient {
        requestAccessToken: (config?: { scope?: string; prompt?: string }) => void;
      }

      function initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: google.accounts.oauth2.TokenResponse) => void;
      }): google.accounts.oauth2.TokenClient;
    }
  }

  namespace picker {
    interface PickerCallbackData {
      action: string;
      docs?: PickerDocument[];
      [key: string]: unknown;
    }

    interface PickerDocument {
      id: string;
      name: string;
      mimeType: string;
      size?: string;
      url?: string;
      token?: string;
      [key: string]: unknown;
    }

    interface DocsView {
      setMimeTypes: (types: string) => DocsView;
    }

    interface View {
      [key: string]: string;
    }

    interface Picker {
      setVisible: (visible: boolean) => void;
    }

    interface PickerBuilder {
      setAppId: (appId: string) => PickerBuilder;
      setOAuthToken: (token: string) => PickerBuilder;
      setDeveloperKey: (key: string) => PickerBuilder;
      setCallback: (callback: (data: PickerCallbackData) => void) => PickerBuilder;
      setTitle: (title: string) => PickerBuilder;
      addView: (view: DocsView) => PickerBuilder;
      enableFeature: (feature: string) => PickerBuilder;
      build: () => Picker;
    }

    namespace Feature {
      const MULTISELECT_ENABLED: string;
    }
  }
}

declare global {
  interface Window {
    google: typeof google;
    gapi?: {
      load: (module: string, config?: { callback: () => void; onerror?: () => void }) => void;
    };
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

// ============================================================
// Internal state
// ============================================================
let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let currentAccessToken: string | null = null;
let scriptsLoaded = false;

// ============================================================
// TokenExpiredError
// ============================================================
export class TokenExpiredError extends Error {
  constructor(message = "Google Drive access token expired") {
    super(message);
    this.name = "TokenExpiredError";
  }
}

// ============================================================
// Script Loading
// ============================================================
const loadedScripts = new Set<string>();

function loadScript(src: string, id: string): Promise<void> {
  if (loadedScripts.has(src)) return Promise.resolve();
  if (document.getElementById(id)) {
    loadedScripts.add(src);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.id = id;
    script.async = true;
    script.onload = () => {
      loadedScripts.add(src);
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

// ============================================================
// Load all Google Drive scripts (idempotent)
// ============================================================
export async function loadGoogleDriveScripts(): Promise<void> {
  if (scriptsLoaded && tokenClient) return;

  if (!env.googleDrive.isConfigured) {
    throw new Error("Google Drive is not configured. Missing API keys.");
  }

  // Step 1: GIS script
  await loadScript("https://accounts.google.com/gsi/client", "google-gsi");

  // Step 2: Init token client
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: env.googleDrive.clientId,
    scope: env.googleDrive.scopes,
    callback: handleTokenResponse,
  });

  // Step 3: gapi script
  await loadScript("https://apis.google.com/js/api.js", "google-gapi");

  // Step 4: Picker module
  await new Promise<void>((resolve, reject) => {
    window.gapi?.load("picker", {
      callback: () => resolve(),
      onerror: () => reject(new Error("Failed to load Google Picker module")),
    });
  });

  scriptsLoaded = true;
}

// ============================================================
// Token handling
// ============================================================
let tokenResolve: ((token: string) => void) | null = null;
let tokenReject: ((err: Error) => void) | null = null;

function handleTokenResponse(response: google.accounts.oauth2.TokenResponse): void {
  if (response.error) {
    if (tokenReject) {
      tokenReject(new Error(`Token error: ${response.error} — ${response.error_description || "Unknown"}`));
      tokenReject = null;
      tokenResolve = null;
    }
    return;
  }
  if (response.access_token) {
    currentAccessToken = response.access_token;
    if (tokenResolve) {
      tokenResolve(response.access_token);
      tokenResolve = null;
      tokenReject = null;
    }
  }
}

function requestAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (currentAccessToken) {
      resolve(currentAccessToken);
      return;
    }
    if (!tokenClient) {
      reject(new Error("Token client not initialized. Call loadGoogleDriveScripts() first."));
      return;
    }

    // Safety timeout: if GIS popup is closed without response, reject after 90s
    const timeoutId = setTimeout(() => {
      console.warn("[GoogleDrive] Token request timed out after 90s — likely popup closed by user.");
      tokenResolve = null;
      tokenReject = null;
      reject(new Error("Google Drive sign-in timed out. Please try again."));
    }, 90_000);

    tokenResolve = (token: string) => {
      clearTimeout(timeoutId);
      resolve(token);
    };
    tokenReject = (err: Error) => {
      clearTimeout(timeoutId);
      reject(err);
    };
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

// ============================================================
// Download files from Drive
// ============================================================
async function downloadOneFile(fileId: string, fileName: string, accessToken: string): Promise<File> {
  const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,size,mimeType`;
  const metaResponse = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (metaResponse.status === 401) throw new TokenExpiredError();
  if (!metaResponse.ok) throw new Error(`Failed to get file metadata: ${metaResponse.statusText}`);
  const metadata = await metaResponse.json();

  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401) throw new TokenExpiredError();
  if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);

  const arrayBuffer = await response.arrayBuffer();
  return new File([arrayBuffer], fileName, {
    type: metadata.mimeType || "application/octet-stream",
  });
}

async function downloadFiles(files: { id: string; name: string }[], accessToken: string): Promise<File[]> {
  const results: File[] = [];
  for (let i = 0; i < files.length; i += 5) {
    const batch = files.slice(i, i + 5);
    try {
      const batchResults = await Promise.all(
        batch.map((f) => downloadOneFile(f.id, f.name, accessToken))
      );
      results.push(...batchResults);
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        currentAccessToken = null;
        const newToken = await requestAccessToken();
        const batchResults = await Promise.all(
          batch.map((f) => downloadOneFile(f.id, f.name, newToken))
        );
        results.push(...batchResults);
      } else {
        throw err;
      }
    }
  }
  return results;
}

// ============================================================
// Pick files from Google Drive (main entry point)
// ============================================================
export async function pickFromGoogleDrive(acceptTypes?: string): Promise<File[]> {
  await loadGoogleDriveScripts();
  const accessToken = await requestAccessToken();
  if (!accessToken) throw new Error("Failed to obtain access token");

  return new Promise((resolve, reject) => {
    try {
      const picker = (window as any).google.picker.PickerBuilder
        ? new (window as any).google.picker.PickerBuilder()
        : null;

      if (!picker) {
        reject(new Error("Google Picker not available. Make sure scripts are loaded."));
        return;
      }

      picker
        .setAppId(env.googleDrive.appId)
        .setOAuthToken(accessToken)
        .setDeveloperKey(env.googleDrive.apiKey)
        .setCallback((data: google.picker.PickerCallbackData) => {
          console.log("[GoogleDrive] Picker callback action:", data.action);
          if (data.action === "google.picker.action.PICKED") {
            const docs = data.docs || [];
            if (docs.length === 0) { reject(new Error("No files selected")); return; }
            downloadFiles(docs.map((d) => ({ id: d.id, name: d.name })), accessToken)
              .then(resolve)
              .catch(reject);
          } else if (data.action === "google.picker.action.CANCEL") {
            console.log("[GoogleDrive] Picker cancelled by user");
            reject(new Error("Picker cancelled"));
          }
        })
        .setTitle("Select files from Google Drive")
        .addView(new (window as any).google.picker.DocsView())
        .enableFeature((window as any).google.picker.Feature.MULTISELECT_ENABLED)
        .build()
        .setVisible(true);
    } catch (err) {
      reject(err);
    }
  });
}

// ============================================================
// Save file to Google Drive
// ============================================================
export async function saveToGoogleDrive(
  fileData: ArrayBuffer | Blob,
  fileName: string,
  accessToken?: string
): Promise<string> {
  let token = accessToken;
  if (!token) {
    if (!currentAccessToken) await loadGoogleDriveScripts();
    token = await requestAccessToken();
  }
  if (!token) throw new Error("No access token available for saving to Google Drive");

  const blob = fileData instanceof ArrayBuffer ? new Blob([fileData]) : fileData;
  const mimeType = blob.type || "application/octet-stream";

  const boundary = "pdfcrux_" + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({ name: fileName, mimeType });

  const metadataPrefix = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const endBytes = new TextEncoder().encode(`\r\n--${boundary}--`);
  const combined = new Uint8Array(metadataPrefix.byteLength + blob.size + endBytes.byteLength);
  combined.set(metadataPrefix, 0);
  combined.set(new Uint8Array(await blob.arrayBuffer()), metadataPrefix.byteLength);
  combined.set(endBytes, metadataPrefix.byteLength + blob.size);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: combined,
    }
  );

  if (response.status === 401) throw new TokenExpiredError();
  if (!response.ok) throw new Error(`Failed to save to Google Drive: ${response.statusText}`);

  const result = await response.json();
  return result.id;
}
