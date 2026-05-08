"use client";

import { useState } from "react";
import { Loader2, Cloud } from "lucide-react";
import { pickFromGoogleDrive } from "@/lib/google-drive";
import { getIsGoogleDriveReady } from "@/lib/google-drive";
import { useToast } from "@/hooks/use-toast";

interface CloudStorageButtonsProps {
  mode: "upload" | "download";
  onFilesSelected?: (files: File[]) => void;
  onCloudSave?: (provider: "google-drive") => void;
  acceptTypes?: string;
  className?: string;
}

// ── Official Google Drive SVG logo (multi-color triangle) ──────────
function GoogleDriveLogo() {
  return (
    <svg viewBox="0 0 87.3 78" className="w-9 h-9" xmlns="http://www.w3.org/2000/svg">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-20.4 35.3c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.4 13.15z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-10.2-17.7c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 23.8h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

function isValidFile(file: unknown): file is File {
  return file instanceof File && file.name.trim().length > 0 && file.size > 0;
}

export default function CloudStorageButtons({
  mode,
  onFilesSelected,
  onCloudSave,
}: CloudStorageButtonsProps) {
  const [loading, setLoading] = useState<"google-drive" | null>(null);
  const { toast } = useToast();

  // ── Google Drive handler ──
  const handleGoogleDrive = async () => {
    if (loading) return;

    // Download mode: delegate to parent
    if (mode === "download") {
      onCloudSave?.("google-drive");
      return;
    }

    // Runtime config check
    if (!getIsGoogleDriveReady()) {
      toast({
        title: "Google Drive not configured",
        description: "Set NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID and API_KEY in env vars.",
        variant: "destructive",
      });
      return;
    }

    setLoading("google-drive");
    try {
      console.log("[CloudButtons] Calling pickFromGoogleDrive...");
      const files = await pickFromGoogleDrive();
      console.log("[CloudButtons] pickFromGoogleDrive returned:", files.length, "files");

      if (files.length === 0) {
        console.log("[CloudButtons] No files returned (user cancelled or no selection).");
        return;
      }

      const valid = files.filter(isValidFile);
      console.log("[CloudButtons] Valid files:", valid.length);

      if (valid.length > 0) {
        console.log("[CloudButtons] Calling onFilesSelected with:", valid.map((f) => f.name));
        onFilesSelected?.(valid);
      } else {
        toast({
          title: "No valid files",
          description: "Selected files were empty or invalid.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("[CloudButtons] Google Drive error:", err);
      const msg = err instanceof Error ? err.message : "Failed to import from Google Drive";
      if (
        !msg.toLowerCase().includes("cancel") &&
        !msg.toLowerCase().includes("timed out")
      ) {
        toast({ title: "Google Drive error", description: msg, variant: "destructive" });
      }
    } finally {
      console.log("[CloudButtons] Resetting loading state.");
      setLoading(null);
    }
  };

  const btnBase =
    "flex-shrink-0 w-14 h-14 rounded-full bg-white dark:bg-card border-2 border-border shadow-md hover:shadow-xl hover:scale-110 transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100";

  return (
    <div className="flex items-center gap-4">
      {/* Google Drive */}
      <button
        type="button"
        onClick={handleGoogleDrive}
        disabled={loading !== null}
        title={mode === "download" ? "Save to Google Drive" : "Import from Google Drive"}
        className={`${btnBase} hover:border-blue-300 hover:shadow-blue-200/50`}
      >
        {loading === "google-drive" ? (
          <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
        ) : (
          <GoogleDriveLogo />
        )}
      </button>
    </div>
  );
}
