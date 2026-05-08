/**
 * Google Drive Integration — Import / Save
 *
 * Uses Google Identity Services (GIS) + Picker API + Drive REST API v3 (via fetch)
 * Requires: NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID, NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY,
 *           NEXT_PUBLIC_GOOGLE_DRIVE_APP_ID
 *
 * Architecture:
 *   - GIS script → OAuth2 token (popup consent)
 *   - gapi script → Picker UI only (gapi.load("picker"))
 *   - File download → Direct REST fetch (NO gapi.client / discovery docs — those can hang)
 *   - File upload  → Direct REST fetch (multipart)
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
    };
  }
}

// ============================================================
// Internal state
// ============================================================
let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let currentAccessToken: string | null = null;
let scriptsLoaded = false;

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

/** Runtime check — always fresh */
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
      resolve();
    };
    script.onerror = () => {
      reject(new Error(`Failed to load script: ${src}`));
    };
    document.head.appendChild(script);
  });
}

// ============================================================
// Load scripts: GIS (token) + gapi (picker UI only)
// NO discovery docs, NO gapi.client.init — those can silently hang
// ============================================================
export async function loadGoogleDriveScripts(): Promise<void> {
  if (scriptsLoaded && tokenClient) return;

  const clientId = getGDClientId();
  const apiKey = getGDApiKey();
  const appId = getGDAppId();

  if (!clientId || !apiKey) {
    console.error(
      "[GoogleDrive] Missing keys.",
      "CLIENT_ID:", clientId ? "SET" : "EMPTY",
      "API_KEY:", apiKey ? "SET" : "EMPTY"
    );
    throw new Error("Google Drive is not configured. Missing CLIENT_ID or API_KEY.");
  }

  // Step 1: GIS script (OAuth2 token client)
  await loadScript("https://accounts.google.com/gsi/client", "google-gsi");

  // Step 2: Init GIS token client
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GD_SCOPES,
    callback: handleTokenResponse,
  });

  // Step 3: gapi script (for Picker UI ONLY — no client.init, no discovery)
  await loadScript("https://apis.google.com/js/api.js", "google-gapi");

  // Step 4: Load Picker module only
  await new Promise<void>((resolve, reject) => {
    if (!window.gapi) {
      reject(new Error("gapi is not available"));
      return;
    }
    window.gapi.load("picker", {
      callback: () => resolve(),
      onerror: () => reject(new Error("Failed to load Google Picker module")),
    });
  });

  scriptsLoaded = true;
  console.log("[GoogleDrive] Scripts loaded successfully.");
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
      reject(new Error("Token client not initialized."));
      return;
    }

    // 90s timeout — prevents hang if user closes popup
    const timeoutId = setTimeout(() => {
      tokenResolve = null;
      tokenReject = null;
      reject(new Error("Google Drive sign-in timed out."));
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
// Download files from Drive — REST fetch only (no gapi.client)
// ============================================================
async function downloadOneFile(fileId: string, fileName: string, accessToken: string): Promise<File> {
  // Get metadata for MIME type
  let mimeType = "application/octet-stream";
  try {
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,size,mimeType`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (metaRes.ok) {
      const meta = await metaRes.json();
      mimeType = meta.mimeType || mimeType;
    }
  } catch {
    // Ignore — proceed with default
  }

  // Download file content via alt=media
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (res.status === 401) throw new TokenExpiredError();
  if (!res.ok) throw new Error(`Failed to download "${fileName}": ${res.status}`);

  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    throw new Error(`Downloaded file "${fileName}" is empty (0 bytes)`);
  }

  return new File([arrayBuffer], fileName, { type: mimeType });
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
    // 120s timeout — prevents hang if picker gets stuck
    const timeoutId = setTimeout(() => resolve([]), 120_000);

    try {
      const googleAny = window.google as any;
      const PickerBuilder = googleAny?.picker?.PickerBuilder;
      if (!PickerBuilder) {
        clearTimeout(timeoutId);
        reject(new Error("Google Picker not available."));
        return;
      }

      const DocsView = googleAny.picker.DocsView;
      const Feature = googleAny.picker.Feature;

      const view = new DocsView();
      if (acceptTypes) {
        const mimeTypes = acceptTypes.split(",").map((t) => t.trim()).filter(Boolean);
        if (mimeTypes.length > 0) view.setMimeTypes(mimeTypes.join(","));
      }

      new PickerBuilder()
        .setAppId(getGDAppId())
        .setOAuthToken(accessToken)
        .setDeveloperKey(getGDApiKey())
        .setCallback((data: any) => {
          clearTimeout(timeoutId);
          const action: string = data.action || "";

          if (action === "google.picker.action.PICK" || action === "google.picker.action.PICKED") {
            const docs = data.docs || [];
            if (docs.length === 0) { resolve([]); return; }

            downloadFiles(
              docs.map((d: any) => ({ id: d.id, name: d.name })),
              accessToken
            )
              .then((files) => {
                const valid = files.filter((f) => f instanceof File && f.size > 0);
                resolve(valid.length > 0 ? valid : []);
              })
              .catch(reject);
          } else if (action === "google.picker.action.CANCEL") {
            resolve([]);
          } else {
            resolve([]); // Unknown action — don't hang
          }
        })
        .setTitle("Select files from Google Drive")
        .addView(view)
        .enableFeature(Feature.MULTISELECT_ENABLED)
        .build()
        .setVisible(true);
    } catch (err) {
      clearTimeout(timeoutId);
      reject(err);
    }
  });
}

// ============================================================
// Save file to Google Drive — REST fetch (multipart upload)
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
  if (!token) throw new Error("No access token available");

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
