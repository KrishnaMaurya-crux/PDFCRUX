"use client";

import { useCallback, useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// ── Google Drive credentials (from environment variables) ──────────────────
const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY || "";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || "";
const GOOGLE_APP_ID = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_APP_ID || "";
const DROPBOX_APP_KEY = process.env.NEXT_PUBLIC_DROPBOX_APP_KEY || "";

// ── Brand SVG Icons ─────────────────────────────────────────────────────────

function GoogleDriveIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5l5.4 9.35z" fill="#0066DA" />
      <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.2c-.4.7-.7 1.45-.9 2.25-.2.8-.3 1.6-.3 2.45h27.5L43.65 25z" fill="#00AC47" />
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.85l6.75 11.7 6.95 11.1z" fill="#EA4335" />
      <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.4-4.5 1.2L43.65 25z" fill="#00832D" />
      <path d="M59.85 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h22.4c1.6 0 3.15-.45 4.5-1.2L59.85 53z" fill="#2684FC" />
      <path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.85 53h27.45c0-1.55-.4-3.1-1.2-4.5L73.4 26.5z" fill="#FFBA00" />
    </svg>
  );
}

function DropboxIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 86" xmlns="http://www.w3.org/2000/svg">
      <path d="M25 0L0 14.35l25 14.35L50 14.35 25 0z" fill="#0061FF" />
      <path d="M0 43.05l25 14.35L50 43.05 25 28.7 0 43.05z" fill="#0061FF" />
      <path d="M75 0L50 14.35l25 14.35L100 14.35 75 0z" fill="#0061FF" />
      <path d="M50 43.05l25 14.35L100 43.05 75 28.7 50 43.05z" fill="#0061FF" />
      <path d="M25 57.4L50 71.75 25 86 0 71.75 25 57.4z" fill="#0061FF" />
      <path d="M75 57.4L100 71.75 75 86 50 71.75 75 57.4z" fill="#0061FF" />
    </svg>
  );
}

// ── Cloud Scripts Loader ────────────────────────────────────────────────────

let gapiLoaded = false;
let dropboxLoaded = false;
let gapiLoading = false;
let dropboxLoading = false;

function loadGooglePickerScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (gapiLoaded) return resolve();
    if (gapiLoading) {
      const check = setInterval(() => {
        if (gapiLoaded) { clearInterval(check); resolve(); }
      }, 200);
      setTimeout(() => { clearInterval(check); reject(new Error("Timeout loading Google API")); }, 15000);
      return;
    }
    gapiLoading = true;

    // Load Google Identity Services + Picker
    const script1 = document.createElement("script");
    script1.src = "https://accounts.google.com/gsi/client";
    script1.async = true;
    script1.onload = () => {
      const script2 = document.createElement("script");
      script2.src = "https://apis.google.com/js/api.js";
      script2.async = true;
      script2.onload = () => {
        gapi.load("picker", () => {
          gapiLoaded = true;
          gapiLoading = false;
          resolve();
        });
      };
      script2.onerror = () => { gapiLoading = false; reject(new Error("Failed to load Google API")); };
      document.head.appendChild(script2);
    };
    script1.onerror = () => { gapiLoading = false; reject(new Error("Failed to load Google Identity")); };
    document.head.appendChild(script1);
  });
}

function loadDropboxChooser(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (dropboxLoaded) return resolve();
    if (dropboxLoading) {
      const check = setInterval(() => {
        if (dropboxLoaded) { clearInterval(check); resolve(); }
      }, 200);
      setTimeout(() => { clearInterval(check); reject(new Error("Timeout loading Dropbox")); }, 15000);
      return;
    }
    dropboxLoading = true;

    const script = document.createElement("script");
    script.src = "https://www.dropbox.com/static/api/2/dropins.js";
    script.id = "dropboxjs";
    script.async = true;
    script.setAttribute("data-app-key", DROPBOX_APP_KEY);
    script.onload = () => { dropboxLoaded = true; dropboxLoading = false; resolve(); };
    script.onerror = () => { dropboxLoading = false; reject(new Error("Failed to load Dropbox Chooser")); };
    document.head.appendChild(script);
  });
}

// ── Download helpers ────────────────────────────────────────────────────────

async function fetchFileAsBlob(url: string, headers?: Record<string, string>): Promise<Blob> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("Download failed");
  return res.blob();
}

// ── Component ───────────────────────────────────────────────────────────────

interface CloudUploadButtonsProps {
  onFilesSelected: (files: File[]) => void;
  acceptTypes?: string; // e.g., ".pdf" — used as extension filter
  compact?: boolean;
}

export default function CloudUploadButtons({
  onFilesSelected,
  acceptTypes = ".pdf",
  compact = false,
}: CloudUploadButtonsProps) {
  const { toast } = useToast();
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingDropbox, setLoadingDropbox] = useState(false);

  // ── Google Drive Picker ────────────────────────────────────────────────
  const handleGoogleDrive = useCallback(async () => {
    setLoadingGoogle(true);
    try {
      await loadGooglePickerScript();

      // Get OAuth token using token client (implicit flow, no redirect)
      const tokenClient = (window as unknown as Record<string, unknown>).google
        ? undefined // already available
        : undefined;

      // Use the gapi.auth2-like approach via token client
      const token = await new Promise<string>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = window as any;

        // Initialize token client
        const tc = win.google?.accounts?.oauth2?.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: "https://www.googleapis.com/auth/drive.readonly",
          callback: (resp: { access_token?: string; error?: string }) => {
            if (resp.access_token) {
              resolve(resp.access_token);
            } else {
              reject(new Error(resp.error || "OAuth denied"));
            }
          },
          error_callback: (err: { type?: string; message?: string }) => {
            reject(new Error(err.message || "OAuth error"));
          },
        });

        if (tc) {
          tc.requestAccessToken();
        } else {
          reject(new Error("Google Identity Services not loaded"));
        }
      });

      // Create picker
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any;
      const picker = new win.google.picker.PickerBuilder()
        .setAppId(GOOGLE_APP_ID || GOOGLE_CLIENT_ID.split("-")[0])
        .setOAuthToken(token)
        .addPicker(
          acceptTypes === ".pdf"
            ? win.google.picker.ViewId.DOCS
            : win.google.picker.ViewId.ALL
        )
        .setCallback(
          async (data: { action: string; docs?: Array<{ id: string; name: string; sizeBytes?: string }> }) => {
            if (data.action === "picked" && data.docs && data.docs.length > 0) {
              try {
                const files: File[] = [];
                for (const doc of data.docs) {
                  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`;
                  const blob = await fetchFileAsBlob(downloadUrl, {
                    Authorization: `Bearer ${token}`,
                  });
                  const file = new File([blob], doc.name, { type: blob.type || "application/octet-stream" });
                  files.push(file);
                }
                onFilesSelected(files);
                toast({
                  title: `${files.length} file${files.length > 1 ? "s" : ""} imported from Google Drive`,
                  description: files.map((f) => f.name).join(", "),
                });
              } catch {
                toast({
                  title: "Download failed",
                  description: "Could not download the file from Google Drive. Try again.",
                  variant: "destructive",
                });
              }
            }
          }
        )
        .build();
      picker.setVisible(true);
    } catch (err) {
      // User cancelled OAuth or script load failed — not a critical error
      if (err instanceof Error && !err.message.includes("denied") && !err.message.includes("cancelled")) {
        toast({
          title: "Google Drive unavailable",
          description: "Could not connect to Google Drive. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setLoadingGoogle(false);
    }
  }, [onFilesSelected, acceptTypes, toast]);

  // ── Dropbox Chooser ────────────────────────────────────────────────────
  const handleDropbox = useCallback(async () => {
    setLoadingDropbox(true);
    try {
      await loadDropboxChooser();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any;
      win.Dropbox.choose({
        linkType: "direct",
        multiselect: true,
        extensions: acceptTypes === ".pdf" ? ["pdf"] : undefined,
        success: async (files: Array<{ name: string; link: string; bytes: number }>) => {
          try {
            const downloaded: File[] = [];
            for (const f of files) {
              const blob = await fetchFileAsBlob(f.link);
              const file = new File([blob], f.name, { type: blob.type || "application/octet-stream" });
              downloaded.push(file);
            }
            onFilesSelected(downloaded);
            toast({
              title: `${downloaded.length} file${downloaded.length > 1 ? "s" : ""} imported from Dropbox`,
              description: downloaded.map((fi) => fi.name).join(", "),
            });
          } catch {
            toast({
              title: "Download failed",
              description: "Could not download the file from Dropbox. Try again.",
              variant: "destructive",
            });
          }
        },
        cancel: () => {
          // User cancelled — no action
        },
        error: () => {
          toast({
            title: "Dropbox error",
            description: "Something went wrong with Dropbox. Please try again.",
            variant: "destructive",
          });
        },
      });
    } catch {
      toast({
        title: "Dropbox unavailable",
        description: "Could not connect to Dropbox. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingDropbox(false);
    }
  }, [onFilesSelected, acceptTypes, toast]);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 text-xs h-9"
          disabled={loadingGoogle || loadingDropbox}
          onClick={(e) => {
            e.stopPropagation();
            handleGoogleDrive();
          }}
        >
          {loadingGoogle ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <GoogleDriveIcon className="w-4 h-4" />
          )}
          Drive
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 text-xs h-9"
          disabled={loadingGoogle || loadingDropbox}
          onClick={(e) => {
            e.stopPropagation();
            handleDropbox();
          }}
        >
          {loadingDropbox ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <DropboxIcon className="w-4 h-4" />
          )}
          Dropbox
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 mt-4">
      <span className="text-xs text-muted-foreground">or import from</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 h-9 border-border/60 hover:bg-accent/50"
        disabled={loadingGoogle || loadingDropbox}
        onClick={handleGoogleDrive}
      >
        {loadingGoogle ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <GoogleDriveIcon className="w-4 h-4" />
        )}
        <span className="text-xs font-medium">Google Drive</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 h-9 border-border/60 hover:bg-accent/50"
        disabled={loadingGoogle || loadingDropbox}
        onClick={handleDropbox}
      >
        {loadingDropbox ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <DropboxIcon className="w-4 h-4" />
        )}
        <span className="text-xs font-medium">Dropbox</span>
      </Button>
    </div>
  );
}
