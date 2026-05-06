"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  pickFromGoogleDrive,
  isGoogleDriveReady,
} from "@/lib/google-drive";
import {
  pickFromDropbox,
  isDropboxReady,
} from "@/lib/dropbox";
import { useToast } from "@/hooks/use-toast";

interface CloudStorageButtonsProps {
  mode: "upload" | "download";
  onFilesSelected?: (files: File[]) => void;
  onCloudSave?: (provider: "google-drive" | "dropbox") => void;
  acceptTypes?: string;
  className?: string;
}

// ── Official Google Drive SVG logo (multi-color triangle) ──────────
function GoogleDriveLogo() {
  return (
    <svg
      viewBox="0 0 87.3 78"
      xmlns="http://www.w3.org/2000/svg"
      className="w-6 h-6"
    >
      <path
        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
        fill="#0066da"
      />
      <path
        d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-20.4 35.3c-.8 1.4-1.2 2.95-1.2 4.5h27.5z"
        fill="#00ac47"
      />
      <path
        d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.4 13.15z"
        fill="#ea4335"
      />
      <path
        d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
        fill="#00832d"
      />
      <path
        d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
        fill="#2684fc"
      />
      <path
        d="m73.4 26.5-10.2-17.7c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 23.8h27.45c0-1.55-.4-3.1-1.2-4.5z"
        fill="#ffba00"
      />
    </svg>
  );
}

// ── Official Dropbox SVG logo (open box) ────────────────────────────
function DropboxLogo() {
  return (
    <svg
      viewBox="0 0 94 78"
      xmlns="http://www.w3.org/2000/svg"
      className="w-6 h-6"
    >
      <path
        d="m47 24.5-23.5-13.5-23.5 13.5 23.5 13.5z"
        fill="#0061FF"
      />
      <path d="m0 28.5v26l23.5 13.5v-26z" fill="#0061FF" />
      <path d="m47 57.5v26l23.5-13.5v-26z" fill="#0061FF" />
      <path
        d="m94 28.5-23.5-13.5-23.5 13.5v26l23.5-13.5 23.5-13.5z"
        fill="#0061FF"
        opacity=".6"
      />
      <path
        d="m47 51.5 23.5 13.5v-26l-23.5 13.5z"
        fill="#0061FF"
        opacity=".8"
      />
    </svg>
  );
}

// ── Validate a file from cloud picker (prevent 0-byte bug) ──────────
function isValidFile(file: unknown): file is File {
  return (
    file instanceof File &&
    file.name.trim().length > 0 &&
    file.size > 0
  );
}

export default function CloudStorageButtons({
  mode,
  onFilesSelected,
  onCloudSave,
  className,
}: CloudStorageButtonsProps) {
  const { toast } = useToast();
  const [loadingProvider, setLoadingProvider] = useState<
    "google-drive" | "dropbox" | null
  >(null);

  // ── Upload: pick files from Google Drive ──────────────────────────
  const handleGoogleDrive = async () => {
    if (mode === "download") {
      onCloudSave?.("google-drive");
      return;
    }

    if (!isGoogleDriveReady) return;

    setLoadingProvider("google-drive");
    try {
      const files = await pickFromGoogleDrive();

      // Validate each file
      const valid: File[] = [];
      const invalidCount = files.length - files.filter(isValidFile).length;

      for (const f of files) {
        if (isValidFile(f)) {
          valid.push(f);
        }
      }

      if (invalidCount > 0) {
        toast({
          title: "Some files skipped",
          description: `${invalidCount} file(s) were invalid or empty and were not imported.`,
          variant: "destructive",
        });
      }

      if (valid.length > 0) {
        onFilesSelected?.(valid);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to pick files from Google Drive";
      toast({
        title: "Google Drive error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoadingProvider(null);
    }
  };

  // ── Upload: pick files from Dropbox ───────────────────────────────
  const handleDropbox = async () => {
    if (mode === "download") {
      onCloudSave?.("dropbox");
      return;
    }

    if (!isDropboxReady) return;

    setLoadingProvider("dropbox");
    try {
      const files = await pickFromDropbox();

      const valid: File[] = [];
      const invalidCount = files.length - files.filter(isValidFile).length;

      for (const f of files) {
        if (isValidFile(f)) {
          valid.push(f);
        }
      }

      if (invalidCount > 0) {
        toast({
          title: "Some files skipped",
          description: `${invalidCount} file(s) were invalid or empty and were not imported.`,
          variant: "destructive",
        });
      }

      if (valid.length > 0) {
        onFilesSelected?.(valid);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to pick files from Dropbox";
      toast({
        title: "Dropbox error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoadingProvider(null);
    }
  };

  const gdDisabled = !isGoogleDriveReady;
  const dbDisabled = !isDropboxReady;

  const gdTooltip = mode === "upload"
    ? (gdDisabled ? "Not configured" : "Import from Google Drive")
    : (gdDisabled ? "Not configured" : "Save to Google Drive");

  const dbTooltip = mode === "upload"
    ? (dbDisabled ? "Not configured" : "Import from Dropbox")
    : (dbDisabled ? "Not configured" : "Save to Dropbox");

  const gdLoading = loadingProvider === "google-drive";
  const dbLoading = loadingProvider === "dropbox";

  return (
    <div className={`flex items-center gap-3 justify-center ${className ?? ""}`}>
      {/* Google Drive Button */}
      <div className="flex flex-col items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={gdDisabled || gdLoading}
              onClick={handleGoogleDrive}
              className="w-12 h-12 rounded-full bg-white dark:bg-card border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all duration-200 hover:scale-105 hover:border-gray-300 dark:hover:border-gray-500 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-sm"
            >
              {gdLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : (
                <GoogleDriveLogo />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            {gdTooltip}
          </TooltipContent>
        </Tooltip>
        <span className="text-[10px] text-muted-foreground">Google Drive</span>
      </div>

      {/* Dropbox Button */}
      <div className="flex flex-col items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={dbDisabled || dbLoading}
              onClick={handleDropbox}
              className="w-12 h-12 rounded-full bg-white dark:bg-card border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all duration-200 hover:scale-105 hover:border-gray-300 dark:hover:border-gray-500 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-sm"
            >
              {dbLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : (
                <DropboxLogo />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            {dbTooltip}
          </TooltipContent>
        </Tooltip>
        <span className="text-[10px] text-muted-foreground">Dropbox</span>
      </div>
    </div>
  );
}
