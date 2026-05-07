/**
 * Google Drive Integration — Full Import / Save
 *
 * Uses Google Identity Services (GIS) + Picker API + Drive API v3
 * Requires: NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID, NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY,
 *           NEXT_PUBLIC_GOOGLE_DRIVE_APP_ID
 *
 * SECURITY: clientSecret is server-only. GIS + Picker + Drive v3 all work
 * client-side with just clientId + apiKey.
 *
 * IMPORTANT: NO top-level constants. All process.env reads are DIRECT
 * to prevent variable shadowing / stale values at build time.
 */

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
}
/* eslint-enable @typescript-eslint/no-namespace */

declare global {
  interface Window {
    google: typeof google;
    gapi?: {
      load: (module: string, config?: { callback: () => void; onerror?: () => void }) => void;
      client: {
        init: (config: { apiKey: string; discoveryDocs: string[] }) => Promise<void>;
        drive: {
          files: {
            get: (params: { fileId: string; alt: string; fields?: string }) => {
              execute: (callback: (response: any) => void) => void;
            };
          };
        };
      };
    };
  }
}

// ============================================================
// Internal state
// ============================================================
let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let currentAccessToken: string | null = null;
let scriptsLoaded = false;
let driveClientInitialized = false;

// ============================================================
// Direct env accessors (no intermediate variables)
// ============================================================
function getGDClientId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || "";
}
function getGDApiKey(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY || "";
}
function getGDAppId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_DRIVE_APP_ID || "";
}
const GD_SCOPES =
  "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file";

/** Runtime check — always fresh, reads directly from process.env */
export function getIsGoogleDriveReady(): boolean {
  const clientId = getGDClientId();
  const apiKey = getGDApiKey();
  return Boolean(clientId && apiKey && clientId.trim() && apiKey.trim());
}

/**
 * @deprecated Use getIsGoogleDriveReady() instead.
 */
export const isGoogleDriveReady = getIsGoogleDriveReady();

export const GOOGLE_DRIVE_SCOPES = GD_SCOPES;

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
// Script Loading (idempotent)
// ============================================================
const loadedScripts = new Set<string>();

function loadScript(src: string, id: string): Promise<void> {
  if (loadedScripts.has(src) || document.getElementById(id)) {
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
      console.log(`[GoogleDrive] Script loaded: ${src}`);
      resolve();
    };
    script.onerror = () => {
      console.error(`[GoogleDrive] Failed to load script: ${src}`);
      reject(new Error(`Failed to load script: ${src}`));
    };
    document.head.appendChild(script);
  });
}

// ============================================================
// Initialize gapi.client with Drive API v3
// ============================================================
async function initDriveClient(): Promise<void> {
  if (driveClientInitialized) return;

  const apiKey = getGDApiKey();
  if (!apiKey) {
    throw new Error("Cannot init Drive client — missing API_KEY");
  }

  console.log("[GoogleDrive] Initializing gapi.client for Drive API v3...");

  // Use the global gapi.client.init
  await new Promise<void>((resolve, reject) => {
    const gapiAny = window.gapi as any;
    if (!gapiAny || !gapiAny.client) {
      reject(new Error("gapi.client not available — script not loaded"));
      return;
    }
    gapiAny.client.init({
      apiKey: apiKey,
      discoveryDocs: [
        "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
      ],
    }).then(() => {
      driveClientInitialized = true;
      console.log("[GoogleDrive] Drive API v3 client initialized.");
      resolve();
    }).catch((err: any) => {
      console.error("[GoogleDrive] gapi.client.init failed:", err);
      reject(new Error(`Drive client init failed: ${err?.message || err}`));
    });
  });
}

// ============================================================
// Load all Google Drive scripts (idempotent)
// ============================================================
export async function loadGoogleDriveScripts(): Promise<void> {
  if (scriptsLoaded && tokenClient) return;

  const clientId = getGDClientId();
  const apiKey = getGDApiKey();
  const appId = getGDAppId();

  if (!clientId || !apiKey) {
    console.error(
      "[GoogleDrive] CRITICAL: Missing keys.",
      "CLIENT_ID:", clientId ? "SET" : "EMPTY",
      "API_KEY:", apiKey ? "SET" : "EMPTY"
    );
    throw new Error("Google Drive is not configured. Missing CLIENT_ID or API_KEY.");
  }

  console.log("[GoogleDrive] Loading scripts...");
  console.log("[GoogleDrive] CLIENT_ID:", clientId.slice(0, 8) + "...");
  console.log("[GoogleDrive] APP_ID:", appId || "EMPTY (may cause picker issues)");

  // Step 1: GIS script (accounts.google.com/gsi/client)
  await loadScript("https://accounts.google.com/gsi/client", "google-gsi");

  // Step 2: Init GIS token client
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GD_SCOPES,
    callback: handleTokenResponse,
  });
  console.log("[GoogleDrive] GIS token client initialized.");

  // Step 3: gapi script (apis.google.com/js/api.js)
  await loadScript("https://apis.google.com/js/api.js", "google-gapi");

  // Step 4: Initialize gapi.client with Drive API discovery doc
  await initDriveClient();

  // Step 5: Load Picker module
  await new Promise<void>((resolve, reject) => {
    if (!window.gapi) {
      reject(new Error("gapi is not available — script failed to load"));
      return;
    }
    window.gapi.load("picker", {
      callback: () => {
        console.log("[GoogleDrive] Picker module loaded.");
        resolve();
      },
      onerror: () => {
        console.error("[GoogleDrive] Failed to load Google Picker module");
        reject(new Error("Failed to load Google Picker module"));
      },
    });
  });

  scriptsLoaded = true;
  console.log("[GoogleDrive] ✅ All scripts loaded and initialized successfully.");
}

// ============================================================
// Token handling
// ============================================================
let tokenResolve: ((token: string) => void) | null = null;
let tokenReject: ((err: Error) => void) | null = null;

function handleTokenResponse(response: google.accounts.oauth2.TokenResponse): void {
  console.log("[GoogleDrive] Token response:", response.error ? `ERROR: ${response.error}` : "SUCCESS");
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

    // Safety timeout: if GIS popup is closed without response
    const timeoutId = setTimeout(() => {
      console.warn("[GoogleDrive] Token request timed out after 90s");
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
// Download files from Drive using gapi.client.drive.files.get
// ============================================================
function downloadOneFileViaGapi(fileId: string, fileName: string, accessToken: string): Promise<File> {
  return new Promise((resolve, reject) => {
    console.log(`[GoogleDrive] Downloading via gapi: ${fileName} (id: ${fileId})`);

    const gapiAny = window.gapi as any;
    if (!gapiAny?.client?.drive?.files?.get) {
      // Fallback to fetch if gapi.client.drive is not available
      console.warn("[GoogleDrive] gapi.client.drive not available, falling back to fetch");
      downloadOneFileViaFetch(fileId, fileName, accessToken)
        .then(resolve)
        .catch(reject);
      return;
    }

    try {
      gapiAny.client.drive.files
        .get({
          fileId: fileId,
          alt: "media",
        })
        .execute((response: any) => {
          // gapi.client.drive.files.get with alt=media returns the raw content
          // The response body is in response.body as a string, or it could be a blob
          if (response instanceof ArrayBuffer || response instanceof Blob) {
            const file = new File([response], fileName, {
              type: "application/octet-stream",
            });
            console.log(`[GoogleDrive] Downloaded via gapi: ${fileName} (${file.size} bytes)`);
            resolve(file);
            return;
          }

          // If response is an object with body (JSON string), convert to blob
          if (response && typeof response === "object") {
            // Check for error
            if (response.code || response.error) {
              reject(new Error(`Drive API error: ${response.error?.message || response.code || "Unknown"}`));
              return;
            }

            // Try to get the raw body
            if (response.body) {
              const blob = new Blob([response.body], { type: response.headers?.["content-type"] || "application/octet-stream" });
              const file = new File([blob], fileName, {
                type: response.headers?.["content-type"] || "application/octet-stream",
              });
              console.log(`[GoogleDrive] Downloaded via gapi (body): ${fileName} (${file.size} bytes)`);
              resolve(file);
              return;
            }
          }

          // If gapi returned something unexpected, fall back to fetch
          console.warn("[GoogleDrive] gapi returned unexpected format, falling back to fetch");
          downloadOneFileViaFetch(fileId, fileName, accessToken)
            .then(resolve)
            .catch(reject);
        });
    } catch (err) {
      console.warn("[GoogleDrive] gapi.client.drive.files.get threw error, falling back to fetch:", err);
      downloadOneFileViaFetch(fileId, fileName, accessToken)
        .then(resolve)
        .catch(reject);
    }
  });
}

/**
 * Fallback: Download via raw fetch with Bearer token.
 * Uses gapi.client.drive.files.get with alt=media equivalent REST endpoint.
 */
async function downloadOneFileViaFetch(fileId: string, fileName: string, accessToken: string): Promise<File> {
  console.log(`[GoogleDrive] Downloading via fetch: ${fileName} (id: ${fileId})`);

  // Get metadata first for correct MIME type
  let mimeType = "application/octet-stream";
  try {
    const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,size,mimeType`;
    const metaResponse = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (metaResponse.ok) {
      const metadata = await metaResponse.json();
      mimeType = metadata.mimeType || mimeType;
    }
  } catch {
    // Ignore metadata errors, proceed with default MIME type
  }

  // Download the actual file content using alt=media
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) throw new TokenExpiredError();
  if (!response.ok) {
    throw new Error(`Failed to download file "${fileName}": ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();

  // Validate: prevent 0-byte files
  if (arrayBuffer.byteLength === 0) {
    throw new Error(`Downloaded file "${fileName}" is empty (0 bytes)`);
  }

  const file = new File([arrayBuffer], fileName, { type: mimeType });
  console.log(`[GoogleDrive] Downloaded via fetch: ${fileName} (${arrayBuffer.byteLength} bytes, type: ${mimeType})`);
  return file;
}

/**
 * Download multiple files with batching (5 at a time).
 * Tries gapi.client.drive.files.get first, falls back to fetch.
 */
async function downloadFiles(files: { id: string; name: string }[], accessToken: string): Promise<File[]> {
  const results: File[] = [];

  for (let i = 0; i < files.length; i += 5) {
    const batch = files.slice(i, i + 5);
    try {
      const batchResults = await Promise.all(
        batch.map((f) => downloadOneFileViaGapi(f.id, f.name, accessToken))
      );
      results.push(...batchResults);
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        // Token expired mid-download — re-auth and retry this batch
        currentAccessToken = null;
        const newToken = await requestAccessToken();
        const batchResults = await Promise.all(
          batch.map((f) => downloadOneFileViaGapi(f.id, f.name, newToken))
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
  console.log("[GoogleDrive] Starting pickFromGoogleDrive...");

  // Step 1: Load all scripts + init Drive client
  await loadGoogleDriveScripts();

  // Step 2: Get access token
  const accessToken = await requestAccessToken();
  if (!accessToken) throw new Error("Failed to obtain access token");

  console.log("[GoogleDrive] Access token obtained. Opening picker...");

  // Step 3: Open the Picker with a safety timeout
  const PICKER_TIMEOUT = 120_000; // 2 minutes max

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      console.warn("[GoogleDrive] Picker timed out after 120s");
      resolve([]); // Resolve silently — don't show error for timeout
    }, PICKER_TIMEOUT);

    try {
      const googleAny = window.google as any;
      const PickerBuilder = googleAny?.picker?.PickerBuilder;
      if (!PickerBuilder) {
        clearTimeout(timeoutId);
        reject(new Error("Google Picker not available. Make sure scripts are loaded."));
        return;
      }

      const picker = new PickerBuilder();

      if (!picker.setAppId || !picker.setOAuthToken) {
        clearTimeout(timeoutId);
        reject(new Error("Google PickerBuilder is missing required methods."));
        return;
      }

      // Build views
      const DocsView = googleAny.picker.DocsView;
      const Feature = googleAny.picker.Feature;

      const view = new DocsView();
      // Filter by MIME types if acceptTypes provided
      if (acceptTypes) {
        const mimeTypes = acceptTypes
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        if (mimeTypes.length > 0) {
          view.setMimeTypes(mimeTypes.join(","));
        }
      }

      picker
        .setAppId(getGDAppId())
        .setOAuthToken(accessToken)
        .setDeveloperKey(getGDApiKey())
        .setCallback((data: any) => {
          clearTimeout(timeoutId);
          const action: string = data.action || "";

          console.log("[GoogleDrive] Picker callback — action:", action);

          if (action === "google.picker.action.PICK" || action === "google.picker.action.PICKED") {
            const docs = data.docs || [];
            console.log("[GoogleDrive] Files selected:", docs.length);
            console.log(
              "[GoogleDrive] Docs:",
              docs.map((d: any) => `id=${d.id} name="${d.name}" type=${d.mimeType}`)
            );

            if (docs.length === 0) {
              resolve([]);
              return;
            }

            // Download selected files and return as File objects
            downloadFiles(
              docs.map((d: any) => ({ id: d.id, name: d.name })),
              accessToken
            )
              .then((files) => {
                // Validate files
                const valid = files.filter(
                  (f) => f instanceof File && f.name.length > 0 && f.size > 0
                );
                console.log(
                  `[GoogleDrive] Successfully downloaded ${valid.length}/${files.length} file(s)`
                );
                if (valid.length > 0) {
                  resolve(valid);
                } else {
                  reject(new Error("All downloaded files were empty or invalid"));
                }
              })
              .catch((err) => {
                console.error("[GoogleDrive] Download failed:", err);
                reject(err);
              });
          } else if (action === "google.picker.action.CANCEL") {
            console.log("[GoogleDrive] Picker cancelled by user");
            // RESOLVE with empty — no error toast needed
            resolve([]);
          } else {
            // Unknown action — don't hang, resolve silently
            console.warn("[GoogleDrive] Unknown picker action:", action);
            resolve([]);
          }
        })
        .setTitle("Select files from Google Drive")
        .addView(view)
        .enableFeature(Feature.MULTISELECT_ENABLED)
        .build()
        .setVisible(true);

      console.log("[GoogleDrive] Picker opened successfully.");
    } catch (err) {
      clearTimeout(timeoutId);
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
