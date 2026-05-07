/**
 * Google Drive Integration — Full Import / Save
 *
 * Uses Google Identity Services (GIS) + Picker API + Drive API v3
 * Requires: NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID, NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY,
 *           NEXT_PUBLIC_GOOGLE_DRIVE_APP_ID
 *
 * SECURITY: clientSecret is server-only. GIS + Picker + Drive v3 all work
 * client-side with just clientId + apiKey.
 */

// ── Read keys DIRECTLY from process.env (inlined by Next.js at build time) ──
const GD_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || "";
const GD_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY || "";
const GD_APP_ID = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_APP_ID || "";
const GD_SCOPES =
  "email profile openid https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata";

/** Runtime check — always fresh */
export function getIsGoogleDriveReady(): boolean {
  return Boolean(GD_CLIENT_ID && GD_API_KEY && GD_CLIENT_ID.trim() && GD_API_KEY.trim());
}

/**
 * @deprecated Use getIsGoogleDriveReady() instead.
 */
export const isGoogleDriveReady = getIsGoogleDriveReady();

export const GOOGLE_DRIVE_SCOPES = GD_SCOPES;

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

  if (!GD_CLIENT_ID || !GD_API_KEY) {
    console.error(
      "[GoogleDrive] CRITICAL: Missing keys.",
      "CLIENT_ID:", GD_CLIENT_ID ? "SET" : "EMPTY",
      "API_KEY:", GD_API_KEY ? "SET" : "EMPTY"
    );
    throw new Error("Google Drive is not configured. Missing CLIENT_ID or API_KEY.");
  }

  console.log("[GoogleDrive] Loading scripts...");
  console.log("[GoogleDrive] CLIENT_ID:", GD_CLIENT_ID.slice(0, 8) + "...");
  console.log("[GoogleDrive] APP_ID:", GD_APP_ID || "EMPTY (may cause picker issues)");

  // Step 1: GIS script
  await loadScript("https://accounts.google.com/gsi/client", "google-gsi");

  // Step 2: Init token client
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GD_CLIENT_ID,
    scope: GD_SCOPES,
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
  console.log("[GoogleDrive] All scripts loaded successfully.");
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
// Download files from Drive
// ============================================================
async function downloadOneFile(fileId: string, fileName: string, accessToken: string): Promise<File> {
  console.log(`[GoogleDrive] Downloading file: ${fileName} (id: ${fileId})`);

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
  const file = new File([arrayBuffer], fileName, {
    type: metadata.mimeType || "application/octet-stream",
  });
  console.log(`[GoogleDrive] Downloaded: ${fileName} (${arrayBuffer.byteLength} bytes, type: ${file.type})`);
  return file;
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
  console.log("[GoogleDrive] Starting pickFromGoogleDrive...");

  await loadGoogleDriveScripts();
  const accessToken = await requestAccessToken();
  if (!accessToken) throw new Error("Failed to obtain access token");

  console.log("[GoogleDrive] Access token obtained. Opening picker...");

  // Wrap in a timeout so the promise can't hang forever
  // (e.g., user navigates away, picker gets stuck)
  const PICKER_TIMEOUT = 120_000; // 2 minutes max

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      console.warn("[GoogleDrive] Picker timed out after 120s");
      resolve([]); // Resolve silently — don't show error for timeout
    }, PICKER_TIMEOUT);

    try {
      const PickerBuilder = (window as any).google?.picker?.PickerBuilder;
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

      picker
        .setAppId(GD_APP_ID)
        .setOAuthToken(accessToken)
        .setDeveloperKey(GD_API_KEY)
        .setCallback((data: any) => {
          clearTimeout(timeoutId);
          const action: string = data.action || "";

          console.log("[GoogleDrive] Picker callback — action:", action);

          // Handle BOTH documented action values
          if (action === "google.picker.action.PICK" || action === "google.picker.action.PICKED") {
            const docs = data.docs || [];
            console.log("[GoogleDrive] Files selected:", docs.length);
            console.log("[GoogleDrive] Docs:", docs.map((d: any) => `id=${d.id} name="${d.name}" type=${d.mimeType}`));

            if (docs.length === 0) {
              resolve([]);
              return;
            }

            downloadFiles(
              docs.map((d: any) => ({ id: d.id, name: d.name })),
              accessToken
            )
              .then((files) => {
                console.log(`[GoogleDrive] Successfully downloaded ${files.length} file(s)`);
                resolve(files);
              })
              .catch((err) => {
                console.error("[GoogleDrive] Download failed:", err);
                reject(err);
              });
          } else if (action === "google.picker.action.CANCEL") {
            console.log("[GoogleDrive] Picker cancelled by user");
            // RESOLVE with empty array — no error toast
            resolve([]);
          } else {
            // Unknown action — log but don't hang
            console.warn("[GoogleDrive] Unknown picker action:", action);
            resolve([]);
          }
        })
        .setTitle("Select files from Google Drive")
        .addView(new (window as any).google.picker.DocsView())
        .enableFeature((window as any).google.picker.Feature.MULTISELECT_ENABLED)
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
