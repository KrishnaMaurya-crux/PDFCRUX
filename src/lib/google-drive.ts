/**
 * Google Drive Integration — Import / Export PDFs via Google Identity Services
 *
 * Uses the modern GIS (Google Identity Services) TokenClient for OAuth2,
 * plus Google Picker API for file selection.  Entirely client-side —
 * all API calls run in the browser.
 *
 * Required env vars (see @/lib/env):
 *   - GOOGLE_DRIVE_CLIENT_ID   — GIS OAuth2 Client ID
 *   - GOOGLE_DRIVE_API_KEY     — Picker Developer Key
 *   - GOOGLE_DRIVE_APP_ID      — Picker Application ID
 *   - GOOGLE_DRIVE_CLIENT_SECRET (server-side only, not used here)
 *
 * Scopes requested:
 *   email, profile, openid,
 *   https://www.googleapis.com/auth/drive.file,
 *   https://www.googleapis.com/auth/drive.appdata
 */

import { env } from "@/lib/env";

// ============================================================
// Constants
// ============================================================

/**
 * The 5 OAuth scopes requested via GIS TokenClient.
 */
export const GOOGLE_DRIVE_SCOPES =
  "email profile openid https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata";

/** Whether the integration is usable (env keys present). */
export const isGoogleDriveReady = env.googleDrive.isConfigured;

// ============================================================
// Internal state
// ============================================================

/** True once both GIS + Picker scripts have finished loading. */
let scriptsReady = false;

/** Cached GIS TokenClient reference (created once, reused). */
let tokenClient: google.accounts.oauth2.TokenClient | null = null;

/** Most recently granted access token (may expire). */
let currentAccessToken: string | null = null;

// ============================================================
// TypeScript augmentations for Google global objects
// ============================================================

/* eslint-disable @typescript-eslint/no-namespace */
declare namespace google {
  namespace accounts {
    namespace oauth2 {
      interface TokenClient {
        /**
         * Request an access token.  Calls `callback` with a
         * `TokenResponse` or `TokenError`.
         */
        requestAccessToken(config?: {
          hint?: string;
          prompt?: string;
          scope?: string;
        }): void;
      }

      interface TokenResponse {
        access_token: string;
        token_type: string;
        expires_in: number;
        scope: string;
        authuser: string;
      }

      interface TokenError {
        type: string;
        error: string;
        error_description: string;
        error_uri: string;
      }

      /** Create a TokenClient bound to the given config. */
      function initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (
          response: TokenResponse | TokenError
        ) => void;
      }): TokenClient;
    }
  }

  namespace picker {
    namespace Feature {
      const MULTISELECT_ENABLED: string;
    }

    class PickerBuilder {
      setAppId(appId: string): PickerBuilder;
      setOAuthToken(token: string): PickerBuilder;
      setDeveloperKey(key: string): PickerBuilder;
      setCallback(
        cb: (data: PickerCallbackData) => void
      ): PickerBuilder;
      setTitle(title: string): PickerBuilder;
      setMimeTypes(mimeTypes: string): PickerBuilder;
      addView(view: google.picker.View): PickerBuilder;
      enableFeature(feature: string): PickerBuilder;
      build(): Picker;
    }

    class DocsView extends View {}

    class View {
      constructor(viewId: string);
    }

    class Picker {
      setVisible(visible: boolean): void;
    }

    interface PickerCallbackData {
      action: string;
      docs?: PickerDocument[];
    }

    interface PickerDocument {
      id: string;
      name: string;
      mimeType: string;
      size?: number;
      token?: string;
    }
  }

}
/* eslint-enable @typescript-eslint/no-namespace */

// Declare the global google namespace on `window` so TypeScript
// understands `window.google` references.
declare global {
  interface Window {
    google: typeof google;
    gapi?: {
      load(name: string, config: { callback: () => void; onerror?: () => void }): void;
    };
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Dynamically load the GIS script and Google Picker API.
 *
 * - Loads `https://accounts.google.com/gsi/client` (GIS)
 * - Loads `https://apis.google.com/js/api.js` → `gapi.load('picker')`
 * - Creates a cached `TokenClient` instance
 *
 * Idempotent — calling again after the first success is a no-op.
 */
export async function loadGoogleDriveScripts(): Promise<void> {
  if (scriptsReady) return;

  if (typeof window === "undefined") {
    throw new Error("Google Drive scripts can only be loaded in the browser.");
  }

  if (!env.googleDrive.isConfigured) {
    throw new Error(
      "Google Drive is not configured. Missing GOOGLE_DRIVE_CLIENT_ID or GOOGLE_DRIVE_API_KEY."
    );
  }

  // --- Step 1: Load GIS script -----------------------------------
  await loadScript(
    "google-gsi",
    "https://accounts.google.com/gsi/client",
    "Failed to load Google Identity Services script"
  );

  // --- Step 2: Load gapi script ----------------------------------
  await loadScript(
    "google-gapi",
    "https://apis.google.com/js/api.js",
    "Failed to load Google API (gapi) script"
  );

  // --- Step 3: Load Picker module from gapi ----------------------
  await new Promise<void>((resolve, reject) => {
    window.gapi?.load("picker", {
      callback: () => resolve(),
      onerror: () => reject(new Error("Failed to load Google Picker module")),
    });
  });

  // --- Step 4: Initialize GIS TokenClient ------------------------
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: env.googleDrive.clientId,
    scope: GOOGLE_DRIVE_SCOPES,
    callback: handleTokenResponse,
  });

  scriptsReady = true;
}

/**
 * Main entry point — pick PDF files from the user's Google Drive.
 *
 * 1. Ensures scripts are loaded
 * 2. Requests an OAuth token via GIS TokenClient
 * 3. Opens the Google Picker filtered to `application/pdf`
 * 4. Downloads every selected file using the Drive v3 API
 * 5. Returns an array of native `File` objects
 *
 * If the user cancels the picker, resolves with an empty array.
 */
export async function pickFromGoogleDrive(): Promise<File[]> {
  await loadGoogleDriveScripts();

  // Request OAuth token
  const accessToken = await requestAccessToken();

  // Open picker and collect selected documents
  const docs = await openPicker(accessToken);

  // User cancelled → return empty (don't reject)
  if (docs.length === 0) return [];

  // Download each file concurrently (max 5 parallel)
  const files = await downloadFiles(docs, accessToken);

  return files;
}

/**
 * Save a processed PDF back to the user's Google Drive.
 *
 * Uses the Drive v3 `files.create` endpoint (multipart upload)
 * with `application/pdf` MIME type.
 *
 * @param fileData   - The PDF blob to upload
 * @param fileName   - Desired file name on Drive (should end in `.pdf`)
 * @param accessToken - A valid OAuth access token
 * @returns The created file's metadata (id, name, webContentLink)
 */
export async function saveToGoogleDrive(
  fileData: Blob,
  fileName: string,
  accessToken: string
): Promise<{ id: string; name: string; webContentLink: string }> {
  const metadata = {
    name: fileName,
    mimeType: "application/pdf",
  };

  const boundary = "pdfcrux_upload_boundary";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataPart =
    `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  const mediaPart =
    `${delimiter}Content-Type: application/pdf\r\n\r\n`;

  // We need to concatenate string + binary, so build manually
  const encoder = new TextEncoder();
  const metaBytes = encoder.encode(metadataPart + mediaPart);
  const closeBytes = encoder.encode(closeDelimiter);

  const body = new Uint8Array(
    metaBytes.byteLength + fileData.byteLength + closeBytes.byteLength
  );
  body.set(metaBytes, 0);
  body.set(new Uint8Array(await fileData.arrayBuffer()), metaBytes.byteLength);
  body.set(closeBytes, metaBytes.byteLength + fileData.byteLength);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `Failed to save file to Google Drive (${res.status}): ${errBody}`
    );
  }

  const json = await res.json();
  return {
    id: json.id,
    name: json.name || fileName,
    webContentLink: json.webContentLink || "",
  };
}

// ============================================================
// Internal helpers
// ============================================================

/**
 * Load an external `<script>` tag by ID.  If already present, resolve
 * immediately (idempotent).
 */
function loadScript(
  id: string,
  src: string,
  errorMsg: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      return resolve();
    }

    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;

    script.onload = () => resolve();
    script.onerror = () => reject(new Error(errorMsg));
    document.head.appendChild(script);
  });
}

/**
 * GIS TokenClient callback — caches the token when granted.
 */
function handleTokenResponse(
  response: google.accounts.oauth2.TokenResponse | google.accounts.oauth2.TokenError
): void {
  if ("access_token" in response && response.access_token) {
    currentAccessToken = response.access_token;
  }
}

/**
 * Request an OAuth access token via the cached TokenClient.
 *
 * Returns the token string, or throws if the user denies consent
 * or an error occurs.
 */
function requestAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      return reject(new Error("GIS TokenClient not initialized. Call loadGoogleDriveScripts() first."));
    }

    // If we already have a token, try to reuse it.
    // If it's expired, the Picker / download will 401 and we'll retry.
    if (currentAccessToken) {
      return resolve(currentAccessToken);
    }

    // Override the callback temporarily for this one-shot request.
    // The global callback (handleTokenResponse) also fires, keeping
    // the cache in sync.
    const originalCallback = tokenClient.callback;
    tokenClient.callback = (
      response: google.accounts.oauth2.TokenResponse | google.accounts.oauth2.TokenError
    ) => {
      // Restore original callback
      tokenClient.callback = originalCallback;

      if ("access_token" in response && response.access_token) {
        currentAccessToken = response.access_token;
        return resolve(response.access_token);
      }

      // User denied or error
      if ("error" in response) {
        const desc =
          (response as google.accounts.oauth2.TokenError).error_description ||
          response.error;
        return reject(new Error(`Google OAuth error: ${desc}`));
      }

      return reject(new Error("Google OAuth: no access token received"));
    };

    tokenClient.requestAccessToken({
      prompt: "",
    });
  });
}

/** Shape of a document returned by the Picker callback. */
interface PickerDoc {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
}

/**
 * Open the Google Picker modal filtered to PDF files.
 *
 * Resolves with the list of selected documents, or an empty
 * array if the user cancels.
 */
function openPicker(accessToken: string): Promise<PickerDoc[]> {
  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.View["DOCS"]);
    view.setMimeTypes("application/pdf");

    const builder = new google.picker.PickerBuilder()
      .setAppId(env.googleDrive.appId)
      .setOAuthToken(accessToken)
      .setDeveloperKey(env.googleDrive.apiKey)
      .addView(view)
      .setTitle("Select PDF files from Google Drive")
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setCallback((data: google.picker.PickerCallbackData) => {
        if (
          data.action === google.picker.Action?.PICKED ||
          data.action === "google.picker.action.PICKED"
        ) {
          const docs: PickerDoc[] = (data.docs || []).map((d) => ({
            id: d.id,
            name: d.name,
            mimeType: d.mimeType,
            size: d.size,
          }));
          return resolve(docs);
        }

        // Cancel or close → empty array (not an error)
        if (
          data.action === google.picker.Action?.CANCEL ||
          data.action === "google.picker.action.CANCEL"
        ) {
          return resolve([]);
        }
      })
      .build();

    builder.setVisible(true);
  });
}

/**
 * Download one file from Drive v3 as a native `File` object.
 */
async function downloadOneFile(
  doc: PickerDoc,
  accessToken: string
): Promise<File> {
  // Download file content
  const contentUrl = `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`;
  const contentRes = await fetch(contentUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!contentRes.ok) {
    if (contentRes.status === 401) {
      throw new TokenExpiredError("Access token expired while downloading files");
    }
    throw new Error(
      `Failed to download "${doc.name}" from Google Drive (${contentRes.status} ${contentRes.statusText})`
    );
  }

  const arrayBuffer = await contentRes.arrayBuffer();
  const mimeType = doc.mimeType || "application/pdf";
  const blob = new Blob([arrayBuffer], { type: mimeType });

  return new File([blob], doc.name || `drive_${doc.id}.pdf`, {
    type: mimeType,
    lastModified: Date.now(),
  });
}

/**
 * Download multiple files with a concurrency cap of 5.
 *
 * If a `TokenExpiredError` is encountered, the token is cleared
 * and the batch is retried once after requesting a fresh token.
 */
async function downloadFiles(
  docs: PickerDoc[],
  accessToken: string
): Promise<File[]> {
  const CONCURRENCY = 5;
  const results: File[] = [];

  try {
    // Process in batches of CONCURRENCY
    for (let i = 0; i < docs.length; i += CONCURRENCY) {
      const batch = docs.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((doc) => downloadOneFile(doc, accessToken))
      );
      results.push(...batchResults);
    }
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      // Token expired mid-download — get a new one and retry all
      currentAccessToken = null;
      const newToken = await requestAccessToken();
      const retryResults = await Promise.all(
        docs.map((doc) => downloadOneFile(doc, newToken))
      );
      return retryResults;
    }
    throw err;
  }

  return results;
}

// ============================================================
// Custom error types
// ============================================================

/** Thrown when the Drive API returns 401 during a download. */
class TokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenExpiredError";
  }
}
