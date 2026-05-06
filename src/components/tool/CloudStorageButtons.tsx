"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { pickFromGoogleDrive, isGoogleDriveReady } from "@/lib/google-drive";
import { saveToGoogleDrive } from "@/lib/google-drive";
import { pickFromDropbox, isDropboxReady } from "@/lib/dropbox";
import { saveToDropbox } from "@/lib/dropbox";
import { useToast } from "@/hooks/use-toast";

// ============================================================
// Props
// ============================================================
interface CloudStorageButtonsProps {
  mode: "upload" | "download";
  onFilesSelected?: (files: File[]) => void;
  onCloudSave?: (provider: "google-drive" | "dropbox") => Promise<void>;
  acceptTypes?: string;
  className?: string;
}

// ============================================================
// Validation helper
// ============================================================
function isValidFile(file: unknown): file is File {
  return file instanceof File && file.name.length > 0 && file.size > 0;
}

// ============================================================
// Google Drive Logo (multi-color official)
// ============================================================
function GoogleDriveLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 87.3 78"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5l5.4 9.35z" fill="#0066da" />
      <path d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 000 52.9h27.5L43.65 25z" fill="#00ac47" />
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.85l5.4 9.35 8.3 14.45z" fill="#ea4335" />
      <path d="M43.65 25L57.4 1.2c-1.35-.8-2.9-1.2-4.5-1.2H34.4c-1.6 0-3.15.45-4.5 1.2L43.65 25z" fill="#00832d" />
      <path d="M59.85 52.9H27.5l13.15 22.9 13.75 23.8c1.35-.8 2.5-1.9 3.3-3.3l16.15-28.05-5.4-9.35z" fill="#2684fc" />
      <path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.85 52.9H86.3c0-1.55-.4-3.1-1.2-4.5L73.4 26.5z" fill="#ffba00" />
    </svg>
  );
}

// ============================================================
// Dropbox Logo (official open box, all paths #0061FF)
// ============================================================
function DropboxLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 94 78"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M23.5 0L0 15l23.5 15L47 15zm0 0" fill="#0061FF" />
      <path d="M47 39L23.5 24 0 39l23.5 15zm0 0" fill="#0061FF" />
      <path d="M70.5 0L47 15l23.5 15L94 15zm0 0" fill="#0061FF" />
      <path d="M47 39l23.5-15L94 39 70.5 54zm0 0" fill="#0061FF" />
      <path d="M23.5 54L47 39 23.5 24 0 39l23.5 15zm0 0" fill="#0061FF" />
      <path d="M23.5 54L47 69 70.5 54 94 69 70.5 78 47 63 23.5 78 0 63 23.5 54zm0 0" fill="#0061FF" />
    </svg>
  );
}

// ============================================================
// CloudStorageButtons Component
// ============================================================
export default function CloudStorageButtons({
  mode,
  onFilesSelected,
  onCloudSave,
  acceptTypes,
  className = "",
}: CloudStorageButtonsProps) {
  const [loading, setLoading] = useState<"google-drive" | "dropbox" | null>(null);
  const { toast } = useToast();

  // ----------------------------------------------------------
  // Google Drive handler
  // ----------------------------------------------------------
  const handleGoogleDrive = async () => {
    if (loading) return;

    if (mode === "download") {
      // Save mode
      if (!onCloudSave) {
        toast({
          title: "Save not available",
          description: "No save handler provided.",
          variant: "destructive",
        });
        return;
      }
      setLoading("google-drive");
      try {
        await onCloudSave("google-drive");
      } catch {
        toast({
          title: "Google Drive save failed",
          description: "Could not save file to Google Drive.",
          variant: "destructive",
        });
      } finally {
        setLoading(null);
      }
      return;
    }

    // Upload / import mode
    if (!isGoogleDriveReady) {
      toast({
        title: "Google Drive not configured",
        description: "Please set up Google Drive credentials to import files.",
        variant: "destructive",
      });
      return;
    }

    setLoading("google-drive");
    try {
      const files = await pickFromGoogleDrive(acceptTypes);
      const validFiles = files.filter(isValidFile);

      if (validFiles.length === 0) {
        toast({
          title: "No valid files",
          description: "No valid files were imported from Google Drive.",
          variant: "destructive",
        });
        return;
      }

      onFilesSelected?.(validFiles);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      // Don't show toast for user cancellation
      if (!msg.includes("cancel") && !msg.includes("Cancel")) {
        toast({
          title: "Google Drive import failed",
          description: msg,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(null);
    }
  };

  // ----------------------------------------------------------
  // Dropbox handler
  // ----------------------------------------------------------
  const handleDropbox = async () => {
    if (loading) return;

    if (mode === "download") {
      // Save mode
      if (!onCloudSave) {
        toast({
          title: "Save not available",
          description: "No save handler provided.",
          variant: "destructive",
        });
        return;
      }
      setLoading("dropbox");
      try {
        await onCloudSave("dropbox");
      } catch {
        toast({
          title: "Dropbox save failed",
          description: "Could not save file to Dropbox.",
          variant: "destructive",
        });
      } finally {
        setLoading(null);
      }
      return;
    }

    // Upload / import mode
    if (!isDropboxReady) {
      toast({
        title: "Dropbox not configured",
        description: "Please set up Dropbox credentials to import files.",
        variant: "destructive",
      });
      return;
    }

    setLoading("dropbox");
    try {
      const files = await pickFromDropbox(acceptTypes);
      const validFiles = files.filter(isValidFile);

      if (validFiles.length === 0) {
        toast({
          title: "No valid files",
          description: "No valid files were imported from Dropbox.",
          variant: "destructive",
        });
        return;
      }

      onFilesSelected?.(validFiles);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      // Don't show toast for user cancellation
      if (!msg.includes("cancel") && !msg.includes("Cancel")) {
        toast({
          title: "Dropbox import failed",
          description: msg,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(null);
    }
  };

  // ----------------------------------------------------------
  // Render — BOTH buttons ALWAYS rendered
  // ----------------------------------------------------------
  const googleDriveTooltip =
    mode === "download" ? "Save to Google Drive" : "Import from Google Drive";
  const dropboxTooltip =
    mode === "download" ? "Save to Dropbox" : "Import from Dropbox";

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Google Drive Button — ALWAYS rendered */}
      <button
        onClick={handleGoogleDrive}
        disabled={loading !== null}
        title={googleDriveTooltip}
        className="w-16 h-16 rounded-full bg-white dark:bg-card border-2 border-border shadow-md hover:shadow-xl hover:scale-110 hover:border-blue-300 transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-md"
      >
        {loading === "google-drive" ? (
          <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
        ) : (
          <GoogleDriveLogo className="w-9 h-9" />
        )}
        <span className="sr-only">{googleDriveTooltip}</span>
      </button>

      {/* Dropbox Button — ALWAYS rendered */}
      <button
        onClick={handleDropbox}
        disabled={loading !== null}
        title={dropboxTooltip}
        className="w-16 h-16 rounded-full bg-white dark:bg-card border-2 border-border shadow-md hover:shadow-xl hover:scale-110 hover:border-[#0061FF] transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-md"
      >
        {loading === "dropbox" ? (
          <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
        ) : (
          <DropboxLogo className="w-9 h-9" />
        )}
        <span className="sr-only">{dropboxTooltip}</span>
      </button>
    </div>
  );
}
