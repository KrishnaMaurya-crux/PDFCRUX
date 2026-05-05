"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  Download,
  RotateCcw,
  AlertCircle,
  ArrowLeft,
  Plus,
  Lock,
  Unlock,
  PenTool,
  GitCompare,
  Layers,
  Trash2,
  ChevronUp,
  ChevronDown,
  Image as ImageIcon,
  FileSpreadsheet,
  FileUp,
  Package,
  TriangleAlert,
  FolderOpen,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAppStore } from "@/lib/store";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getToolById, getCategoryForTool } from "@/lib/tools";
import { getToolConfig } from "@/lib/tool-configs";
import ToolOptions from "./ToolOptions";
import LivePreview from "./LivePreview";
import { useToast } from "@/hooks/use-toast";
import {
  processTool,
  downloadBlob,
  downloadMultipleAsZip,
  type ProcessResult,
} from "@/lib/pdf-processor";
import {
  openGoogleDrivePicker,
  downloadGoogleDriveFile,
  uploadToGoogleDrive,
  isGoogleDriveReady,
} from "@/lib/google-drive";
import {
  openDropboxChooser,
  downloadDropboxFile,
  saveToDropbox,
  isDropboxReady,
} from "@/lib/dropbox";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Merge-specific: reorderable file list
function MergeFileList({
  files,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  files: File[];
  onRemove: (i: number) => void;
  onMoveUp: (i: number) => void;
  onMoveDown: (i: number) => void;
}) {
  return (
    <div className="space-y-2 mt-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          Files to Merge ({files.length})
        </span>
        <span className="text-xs text-muted-foreground">
          Use arrows to reorder
        </span>
      </div>
      {files.map((file, index) => (
        <motion.div
          key={`${file.name}-${index}`}
          layout
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.03 }}
          className="flex items-center gap-2 p-3 rounded-lg border bg-card group"
        >
          <span className="text-xs font-bold text-muted-foreground w-6 text-center flex-shrink-0">
            {index + 1}
          </span>
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <button
              onClick={() => onMoveUp(index)}
              disabled={index === 0}
              className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => onMoveDown(index)}
              disabled={index === files.length - 1}
              className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
          <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(file.size)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onRemove(index)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </motion.div>
      ))}
    </div>
  );
}

// Compare-specific: dual file upload areas
function DualUploadArea({
  labels,
  fileA,
  fileB,
  fileInputARef,
  fileInputBRef,
  onFileAInput,
  onFileBInput,
  onDropFileA,
  onDropFileB,
  onRemoveA,
  onRemoveB,
  acceptTypes,
  isDragOver,
  setIsDragOver,
}: {
  labels: [string, string];
  fileA: File | null;
  fileB: File | null;
  fileInputARef: React.RefObject<HTMLInputElement | null>;
  fileInputBRef: React.RefObject<HTMLInputElement | null>;
  onFileAInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileBInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDropFileA?: (file: File) => void;
  onDropFileB?: (file: File) => void;
  onRemoveA: () => void;
  onRemoveB: () => void;
  acceptTypes?: string;
  isDragOver: [boolean, boolean];
  setIsDragOver: (v: [boolean, boolean]) => void;
}) {
  const handleDropA = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver([false, isDragOver[1]]);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const check = validateFile(droppedFile);
      if (check.valid) {
        // Directly invoke the parent's callback — avoids synthetic event issues on mobile
        if (onDropFileA) {
          onDropFileA(droppedFile);
        } else {
          // Fallback: use input ref (original behavior)
          const dt = new DataTransfer();
          dt.items.add(droppedFile);
          if (fileInputARef.current) {
            fileInputARef.current.files = dt.files;
            fileInputARef.current.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      } else {
        console.warn(`Dropped file for slot A skipped: ${check.reason}`);
      }
    }
  };
  const handleDropB = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver([isDragOver[0], false]);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const check = validateFile(droppedFile);
      if (check.valid) {
        if (onDropFileB) {
          onDropFileB(droppedFile);
        } else {
          const dt = new DataTransfer();
          dt.items.add(droppedFile);
          if (fileInputBRef.current) {
            fileInputBRef.current.files = dt.files;
            fileInputBRef.current.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      } else {
        console.warn(`Dropped file for slot B skipped: ${check.reason}`);
      }
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* File A */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver([true, false]); }}
        onDragLeave={() => setIsDragOver([false, false])}
        onDrop={handleDropA}
      >
        <input
          ref={fileInputARef}
          type="file"
          onChange={onFileAInput}
          accept={acceptTypes}
          className="hidden"
        />
        {fileA ? (
          <div className="p-4 rounded-xl border bg-card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{labels[0]}</p>
                <p className="text-sm font-medium truncate">{fileA.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(fileA.size)}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRemoveA}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInputARef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
              isDragOver[0] ? "drop-zone-active bg-primary/5 border-primary/40" : "border-border hover:border-primary/20 hover:bg-accent/30"
            }`}
          >
            <GitCompare className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">{labels[0]}</p>
            <p className="text-xs text-muted-foreground mt-1">Click or drop file</p>
          </div>
        )}
      </div>

      {/* File B */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver([false, true]); }}
        onDragLeave={() => setIsDragOver([false, false])}
        onDrop={handleDropB}
      >
        <input
          ref={fileInputBRef}
          type="file"
          onChange={onFileBInput}
          accept={acceptTypes}
          className="hidden"
        />
        {fileB ? (
          <div className="p-4 rounded-xl border bg-card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{labels[1]}</p>
                <p className="text-sm font-medium truncate">{fileB.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(fileB.size)}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRemoveB}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInputBRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
              isDragOver[1] ? "drop-zone-active bg-primary/5 border-primary/40" : "border-border hover:border-primary/20 hover:bg-accent/30"
            }`}
          >
            <GitCompare className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">{labels[1]}</p>
            <p className="text-xs text-muted-foreground mt-1">Click or drop file</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Defensive validation for File objects before they enter upload state.
 * Catches empty (0-byte), unnamed, or non-File entries that some mobile
 * browsers can produce when the picker is cancelled or returns a stale ref.
 */
function validateFile(file: File): { valid: boolean; reason?: string } {
  if (!file || !(file instanceof File))
    return { valid: false, reason: "Invalid file object" };
  if (!file.name || file.name.trim() === "")
    return { valid: false, reason: "File has no name" };
  if (typeof file.size !== "number" || isNaN(file.size))
    return { valid: false, reason: "File size is invalid" };
  if (file.size === 0) return { valid: false, reason: "File is empty (0 bytes)" };
  return { valid: true };
}

// Main ToolPage component
export default function ToolPage() {
  const {
    selectedToolId,
    uploadedFiles,
    isProcessing,
    isComplete,
    processingProgress,
    navigateHome,
    addFiles,
    removeFile,
    clearFiles,
    startProcessing,
    setProcessingProgress,
    completeProcessing,
    resetTool,
    selectTool,
    openAuthDialog,
  } = useAppStore();

  const { toast } = useToast();
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tool = selectedToolId ? getToolById(selectedToolId) : null;
  const category = selectedToolId ? getCategoryForTool(selectedToolId) : null;
  const config = selectedToolId ? getToolConfig(selectedToolId) : null;

  // Store processed result for download (use state so it triggers re-render)
  const [processResult, setProcessResult] = useState<ProcessResult | null>(null);

  // Compute initial option defaults
  const initialDefaults: Record<string, string | number | boolean> = {};
  if (config) {
    config.options.forEach((opt) => {
      initialDefaults[opt.id] = opt.defaultValue;
    });
  }

  const [optionValues, setOptionValues] = useState<
    Record<string, string | number | boolean>
  >(initialDefaults);
  const [currentStep, setCurrentStep] = useState(0);

  // ALWAYS have file inputs available (not inside conditional renders)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputARef = useRef<HTMLInputElement>(null);
  const fileInputBRef = useRef<HTMLInputElement>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  // Task A: Large file dialog state
  const [showLargeFileDialog, setShowLargeFileDialog] = useState(false);
  const [largeFileName, setLargeFileName] = useState("");

  // Cloud import/save loading state
  const [cloudLoading, setCloudLoading] = useState(false);

  // For dual upload (compare)
  const [compareFileA, setCompareFileA] = useState<File | null>(null);
  const [compareFileB, setCompareFileB] = useState<File | null>(null);
  const [dualDragOver, setDualDragOver] = useState<[boolean, boolean]>([
    false,
    false,
  ]);

  // Task B: Auth gate — check if user is signed in before processing/downloading
  const requireAuth = useCallback(async (): Promise<boolean> => {
    // If Supabase is not configured, allow all actions (graceful degradation)
    if (!isSupabaseConfigured) return true;

    try {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      if (currentSession) return true;

      // No session — show auth dialog
      openAuthDialog();
      return false;
    } catch {
      // If session check fails, allow processing (graceful degradation)
      return true;
    }
  }, [openAuthDialog]);

  // REAL processing with actual PDF manipulation
  const handleProcess = async () => {
    if (!config || !selectedToolId) return;

    // Task B: Auth gate before processing
    const isAuthed = await requireAuth();
    if (!isAuthed) return;

    // Validation
    for (const opt of config.options) {
      if (opt.required) {
        // For sign-pdf: signer-name is only required when sign-type is "type"
        if (
          selectedToolId === "sign-pdf" &&
          opt.id === "signer-name" &&
          String(optionValues["sign-type"] || "type") !== "type"
        ) {
          continue; // Skip signer-name validation for draw/upload modes
        }
        const val = optionValues[opt.id];
        if (val === undefined || val === null || val === "") {
          setError(`Please fill in "${opt.label}" to continue.`);
          return;
        }
      }
    }
    // Sign-pdf: validate signature-data exists for draw/upload modes
    if (selectedToolId === "sign-pdf") {
      const signType = String(optionValues["sign-type"] || "type");
      if (signType === "draw" && !optionValues["signature-data"]) {
        setError("Please draw your signature on the canvas before continuing.");
        return;
      }
      if (signType === "upload" && !optionValues["signature-data"]) {
        setError("Please upload a signature image before continuing.");
        return;
      }
    }
    // Password match check
    if (
      optionValues.password &&
      optionValues["confirm-password"] &&
      optionValues.password !== optionValues["confirm-password"]
    ) {
      setError("Passwords do not match. Please try again.");
      return;
    }

    setError(null);
    startProcessing();
    setCurrentStep(0);
    setProcessResult(null);

    const steps = config.processingSteps || ["Processing..."];
    const stepSize = 100 / steps.length;

    // Start progress animation
    let progress = 0;
    progressIntervalRef.current = setInterval(() => {
      progress += Math.random() * 5 + 1;
      if (progress > 90) progress = 90; // Cap at 90 until actual processing completes
      const stepIndex = Math.min(
        Math.floor(progress / stepSize),
        steps.length - 1
      );
      setCurrentStep(stepIndex);
      setProcessingProgress(Math.min(progress, 90));
    }, 300);

    try {
      // Do the actual processing
      const result = await processTool(
        selectedToolId,
        uploadedFiles,
        optionValues,
        compareFileA,
        compareFileB
      );

      setProcessResult(result);

      // Complete progress
      if (progressIntervalRef.current)
        clearInterval(progressIntervalRef.current);
      setCurrentStep(steps.length - 1);
      setProcessingProgress(100);
      completeProcessing();

      if (result.success) {
        toast({
          title: "Processing complete!",
          description: result.message,
        });
      } else {
        toast({
          title: "Processing failed",
          description: result.message,
          variant: "destructive",
        });
        setError(result.message);
      }
    } catch (err) {
      if (progressIntervalRef.current)
        clearInterval(progressIntervalRef.current);
      setProcessingProgress(100);
      completeProcessing();
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      toast({
        title: "Processing error",
        description: msg,
        variant: "destructive",
      });
    }
  };

  // Clear processResult when tool resets
  const handleResetTool = () => {
    setProcessResult(null);
    setError(null);
    resetTool();
  };

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current)
        clearInterval(progressIntervalRef.current);
    };
  }, []);

  if (!tool || !selectedToolId || !config) return null;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    const validDropped = droppedFiles.filter((f) => {
      const check = validateFile(f);
      if (!check.valid) {
        console.warn(`Dropped file "${f.name}" skipped: ${check.reason}`);
      }
      return check.valid;
    });
    if (validDropped.length === 0 && droppedFiles.length > 0) {
      setError(
        "The dropped file(s) are empty or invalid. Please try again."
      );
      return;
    }
    handleFileSelection(validDropped);
  };

  const handleFileSelection = (files: File[]) => {
    setError(null);
    // Determine the files that will actually be added
    let filesToAdd: File[];
    if (tool.acceptTypes) {
      const accepted = tool.acceptTypes.split(",");
      const valid = files.filter((f) => {
        const ext = "." + f.name.split(".").pop()?.toLowerCase();
        return accepted.includes(ext);
      });
      if (valid.length === 0) {
        setError(
          `Invalid file type. Please upload ${tool.acceptTypes} files only.`
        );
        return;
      }
      if (!tool.multipleFiles && valid.length > 1) {
        setError("This tool accepts only one file at a time.");
        return;
      }
      // After type check, also validate file size — reject 0-byte / invalid files
      const validAndSized = valid.filter((f) => {
        const check = validateFile(f);
        if (!check.valid) {
          console.warn(
            `File "${f.name}" passed type check but failed validation: ${check.reason}`
          );
        }
        return check.valid;
      });
      if (validAndSized.length === 0) {
        setError(
          "The selected file is empty (0 bytes). Please choose a valid file."
        );
        return;
      }
      filesToAdd = validAndSized;
    } else {
      // No acceptTypes restriction — still filter out 0-byte / invalid files
      filesToAdd = files.filter((f) => {
        const check = validateFile(f);
        if (!check.valid) {
          console.warn(`File "${f.name}" skipped: ${check.reason}`);
        }
        return check.valid;
      });
      if (filesToAdd.length === 0 && files.length > 0) {
        setError(
          "The selected file is empty (0 bytes). Please choose a valid file."
        );
        return;
      }
    }

    addFiles(filesToAdd);

    // Task A: Check for large files (>50MB) and suggest compressing first
    const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB
    const largeFile = filesToAdd.find((f) => f.size > LARGE_FILE_THRESHOLD);
    if (largeFile && selectedToolId !== "compress-pdf") {
      setLargeFileName(largeFile.name);
      setShowLargeFileDialog(true);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const rawFiles = Array.from(e.target.files);
      const validFiles = rawFiles.filter((f) => {
        const check = validateFile(f);
        if (!check.valid) {
          console.warn(
            `Input file "${f.name}" skipped: ${check.reason}`
          );
        }
        return check.valid;
      });
      const skippedCount = rawFiles.length - validFiles.length;
      if (skippedCount > 0) {
        toast({
          title: "Some files were skipped",
          description: `${skippedCount} file(s) were empty or invalid and could not be uploaded.`,
          variant: "destructive",
        });
      }
      if (validFiles.length > 0) {
        handleFileSelection(validFiles);
      } else if (skippedCount > 0) {
        setError(
          "The selected file is empty (0 bytes). Please choose a valid file."
        );
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCompareFileA = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const check = validateFile(file);
      if (!check.valid) {
        console.warn(`Compare File A skipped: ${check.reason}`);
        setError(
        "The selected file is empty (0 bytes). Please choose a valid file."
      );
      return;
      }
      setCompareFileA(file);
      setError(null);
      // Task A: Large file check for compare uploads
      const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024;
      if (file.size > LARGE_FILE_THRESHOLD && selectedToolId !== "compress-pdf") {
        setLargeFileName(file.name);
        setShowLargeFileDialog(true);
      }
    }
  };

  const handleCompareFileB = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const check = validateFile(file);
      if (!check.valid) {
        console.warn(`Compare File B skipped: ${check.reason}`);
        setError(
        "The selected file is empty (0 bytes). Please choose a valid file."
      );
      return;
      }
      setCompareFileB(file);
      setError(null);
      // Task A: Large file check for compare uploads
      const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024;
      if (file.size > LARGE_FILE_THRESHOLD && selectedToolId !== "compress-pdf") {
        setLargeFileName(file.name);
        setShowLargeFileDialog(true);
      }
    }
  };

  const moveFileUp = (index: number) => {
    if (index <= 0) return;
    const newFiles = [...uploadedFiles];
    [newFiles[index - 1], newFiles[index]] = [
      newFiles[index],
      newFiles[index - 1],
    ];
    useAppStore.setState({ uploadedFiles: newFiles });
  };

  const moveFileDown = (index: number) => {
    if (index >= uploadedFiles.length - 1) return;
    const newFiles = [...uploadedFiles];
    [newFiles[index], newFiles[index + 1]] = [
      newFiles[index + 1],
      newFiles[index],
    ];
    useAppStore.setState({ uploadedFiles: newFiles });
  };

  // Get upload icon based on config
  const getUploadIcon = () => {
    switch (config.uploadIcon) {
      case "merge":
        return <Layers className="w-8 h-8" />;
      case "split":
        return <FileText className="w-8 h-8" />;
      case "lock":
        return <Lock className="w-8 h-8" />;
      case "unlock":
        return <Unlock className="w-8 h-8" />;
      case "sign":
        return <PenTool className="w-8 h-8" />;
      case "compare":
        return <GitCompare className="w-8 h-8" />;
      default:
        return <Upload className="w-8 h-8" />;
    }
  };

  const getUploadIconColor = () => {
    if (isDragOver) return "text-primary";
    return "text-muted-foreground";
  };

  // Check if we have files ready for processing
  const hasFiles = config.dualUpload
    ? compareFileA && compareFileB
    : uploadedFiles.length > 0;

  // Get a file icon color based on tool type
  const getFileIconColor = () => {
    const accept = tool.acceptTypes || "";
    if (accept.includes(".doc")) return "text-blue-500 bg-blue-50 dark:bg-blue-950/30";
    if (accept.includes(".xls")) return "text-green-500 bg-green-50 dark:bg-green-950/30";
    if (accept.includes(".ppt")) return "text-orange-500 bg-orange-50 dark:bg-orange-950/30";
    if (accept.includes(".jpg") || accept.includes(".jpeg")) return "text-pink-500 bg-pink-50 dark:bg-pink-950/30";
    if (accept.includes(".png")) return "text-purple-500 bg-purple-50 dark:bg-purple-950/30";
    if (accept.includes(".html")) return "text-slate-500 bg-slate-50 dark:bg-slate-950/30";
    return "text-red-500 bg-red-50 dark:bg-red-950/30";
  };

  const getFileIconComponent = () => {
    const accept = tool.acceptTypes || "";
    if (accept.includes(".doc")) return <FileUp className="w-5 h-5" />;
    if (accept.includes(".xls")) return <FileSpreadsheet className="w-5 h-5" />;
    if (accept.includes(".jpg") || accept.includes(".jpeg")) return <ImageIcon className="w-5 h-5" />;
    if (accept.includes(".png")) return <ImageIcon className="w-5 h-5" />;
    return <FileText className="w-5 h-5" />;
  };

  // ── Cloud Import Handlers ──
  const handleGoogleDriveImport = async () => {
    if (cloudLoading) return;
    setCloudLoading(true);
    try {
      const driveFiles = await openGoogleDrivePicker();
      toast({
        title: `Importing ${driveFiles.length} file(s) from Google Drive...`,
      });

      const importedFiles: File[] = [];
      for (const driveFile of driveFiles) {
        const imported = await downloadGoogleDriveFile(driveFile.id, driveFile.token);
        const file = new File([imported.data], imported.name, {
          type: imported.mimeType,
        });
        importedFiles.push(file);
      }

      if (importedFiles.length > 0) {
        handleFileSelection(importedFiles);
        toast({
          title: `${importedFiles.length} file(s) imported from Google Drive!`,
          description: importedFiles.map((f) => f.name).join(", "),
        });
      }
    } catch (err) {
      if (
        err instanceof Error &&
        !err.message.includes("cancelled") &&
        !err.message.includes("Cancel") &&
        !err.message.includes("No files selected")
      ) {
        toast({
          title: "Google Drive import failed",
          description: err.message,
          variant: "destructive",
        });
      }
    } finally {
      setCloudLoading(false);
    }
  };

  const handleDropboxImport = async () => {
    if (cloudLoading) return;
    setCloudLoading(true);
    try {
      const dropboxFiles = await openDropboxChooser();
      toast({
        title: `Importing ${dropboxFiles.length} file(s) from Dropbox...`,
      });

      const importedFiles: File[] = [];
      for (const dbFile of dropboxFiles) {
        const imported = await downloadDropboxFile(dbFile.link, dbFile.name);
        const file = new File([imported.data], imported.name, {
          type: imported.mimeType,
        });
        importedFiles.push(file);
      }

      if (importedFiles.length > 0) {
        handleFileSelection(importedFiles);
        toast({
          title: `${importedFiles.length} file(s) imported from Dropbox!`,
          description: importedFiles.map((f) => f.name).join(", "),
        });
      }
    } catch (err) {
      if (
        err instanceof Error &&
        !err.message.includes("cancelled") &&
        !err.message.includes("Cancel") &&
        !err.message.includes("No PDF files")
      ) {
        toast({
          title: "Dropbox import failed",
          description: err.message,
          variant: "destructive",
        });
      }
    } finally {
      setCloudLoading(false);
    }
  };

  // ── Cloud Save Handlers ──
  const handleSaveToGoogleDrive = async () => {
    if (!processResult?.success || !processResult.outputFiles[0] || cloudLoading) return;
    setCloudLoading(true);
    const file = processResult.outputFiles[0];
    try {
      toast({ title: "Uploading to Google Drive..." });
      await uploadToGoogleDrive(file.data, file.name);
      toast({
        title: "Saved to Google Drive! ✅",
        description: file.name,
      });
    } catch (err) {
      toast({
        title: "Failed to save to Google Drive",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCloudLoading(false);
    }
  };

  const handleSaveToDropbox = async () => {
    if (!processResult?.success || !processResult.outputFiles[0] || cloudLoading) return;
    setCloudLoading(true);
    const file = processResult.outputFiles[0];
    try {
      toast({ title: "Connecting to Dropbox..." });
      await saveToDropbox(file.data, file.name);
      toast({
        title: "Saved to Dropbox! ✅",
        description: `/PdfCrux/${file.name}`,
      });
    } catch (err) {
      toast({
        title: "Failed to save to Dropbox",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCloudLoading(false);
    }
  };

  // Handle real file download
  const handleDownload = async () => {
    const result = processResult;
    if (!result || !result.success || result.outputFiles.length === 0) {
      toast({
        title: "No file to download",
        description: "Please process a file first.",
        variant: "destructive",
      });
      return;
    }

    // Task B: Auth gate before download
    const isAuthed = await requireAuth();
    if (!isAuthed) return;

    if (result.outputFiles.length === 1) {
      // Single file - download directly
      downloadBlob(result.outputFiles[0].data, result.outputFiles[0].name);
      toast({
        title: "Download started!",
        description: `${result.outputFiles[0].name} (${formatFileSize(result.outputFiles[0].size)})`,
      });
    } else {
      // Multiple files - download as ZIP
      downloadMultipleAsZip(result.outputFiles);
      toast({
        title: "Download started!",
        description: `ZIP with ${result.outputFiles.length} files`,
      });
    }
  };

  return (
    <div className="min-h-screen pt-20 page-transition">
      {/* Hidden file inputs - ALWAYS rendered so refs persist */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileInput}
        accept={tool.acceptTypes}
        multiple={tool.multipleFiles}
        className="hidden"
      />
      <input
        ref={fileInputARef}
        type="file"
        onChange={handleCompareFileA}
        accept={tool.acceptTypes}
        className="hidden"
      />
      <input
        ref={fileInputBRef}
        type="file"
        onChange={handleCompareFileB}
        accept={tool.acceptTypes}
        className="hidden"
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Breadcrumb */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <button
            onClick={navigateHome}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            All Tools
          </button>
        </motion.div>

        {/* Tool Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-3 mb-4">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center ${tool.bgColor} shadow-lg`}
            >
              <tool.icon className={`w-7 h-7 ${tool.color}`} />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">
            {tool.name}
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            {config.uploadSubtitle}
          </p>
          <div className="flex items-center justify-center gap-3 mt-3">
            {category && (
              <Badge variant="secondary" className="text-xs">
                {category.name}
              </Badge>
            )}
            {tool.maxFileSize && (
              <Badge variant="outline" className="text-xs">
                Max {tool.maxFileSize}
              </Badge>
            )}
            {config.multipleOutput && (
              <Badge variant="outline" className="text-xs">
                <Package className="w-3 h-3 mr-1" />
                Multiple outputs
              </Badge>
            )}
          </div>
        </motion.div>

        {/* Main Content */}
        <AnimatePresence mode="wait">
          {!isProcessing && !isComplete && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: 0.2 }}
            >
              {/* DUAL UPLOAD for Compare */}
              {config.dualUpload ? (
                <DualUploadArea
                  labels={
                    config.dualUploadLabels || ["File A", "File B"]
                  }
                  fileA={compareFileA}
                  fileB={compareFileB}
                  fileInputARef={fileInputARef}
                  fileInputBRef={fileInputBRef}
                  onFileAInput={handleCompareFileA}
                  onFileBInput={handleCompareFileB}
                  onDropFileA={(file) => {
                    const check = validateFile(file);
                    if (check.valid) { setCompareFileA(file); setError(null); }
                    else { console.warn(`Compare File A drop skipped: ${check.reason}`); setError("The dropped file is empty or invalid. Please try again."); }
                  }}
                  onDropFileB={(file) => {
                    const check = validateFile(file);
                    if (check.valid) { setCompareFileB(file); setError(null); }
                    else { console.warn(`Compare File B drop skipped: ${check.reason}`); setError("The dropped file is empty or invalid. Please try again."); }
                  }}
                  onRemoveA={() => setCompareFileA(null)}
                  onRemoveB={() => setCompareFileB(null)}
                  acceptTypes={tool.acceptTypes}
                  isDragOver={dualDragOver}
                  setIsDragOver={setDualDragOver}
                />
              ) : (
                <>
                  {/* Standard Drop Zone - shown when no files uploaded */}
                  {uploadedFiles.length === 0 && (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragOver(true);
                      }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`relative rounded-2xl border-2 border-dashed p-10 sm:p-16 text-center cursor-pointer transition-all ${
                        isDragOver
                          ? "drop-zone-active bg-primary/5 border-primary/40"
                          : "border-border hover:border-primary/20 hover:bg-accent/30"
                      }`}
                    >
                      <div className="flex flex-col items-center gap-4">
                        <div
                          className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${
                            isDragOver ? "bg-primary/10" : "bg-muted"
                          }`}
                        >
                          <span className={getUploadIconColor()}>
                            {getUploadIcon()}
                          </span>
                        </div>
                        <div>
                          <p className="text-base font-semibold mb-1">
                            {isDragOver
                              ? "Drop your files here"
                              : config.uploadTitle}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            or{" "}
                            <span className="text-primary font-medium underline underline-offset-2">
                              browse files
                            </span>{" "}
                            to upload
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Supported: {tool.acceptTypes || "All files"} • Max:{" "}
                          {tool.maxFileSize || "100MB"}
                          {tool.multipleFiles && " • Multiple files allowed"}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Cloud Import Buttons — below empty drop zone */}
                  {uploadedFiles.length === 0 && !config.dualUpload && (
                    <div className="mt-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-px bg-border flex-1" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          or import from cloud
                        </span>
                        <div className="h-px bg-border flex-1" />
                      </div>
                      <div className="flex items-center gap-3 justify-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGoogleDriveImport();
                          }}
                          disabled={cloudLoading}
                        >
                          <FolderOpen className="w-4 h-4 text-amber-600" />
                          Google Drive
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDropboxImport();
                          }}
                          disabled={cloudLoading}
                        >
                          <Archive className="w-4 h-4 text-sky-600" />
                          Dropbox
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* MERGE: reorderable file list */}
                  {selectedToolId === "merge-pdf" && uploadedFiles.length > 0 && (
                    <>
                      <MergeFileList
                        files={uploadedFiles}
                        onRemove={removeFile}
                        onMoveUp={moveFileUp}
                        onMoveDown={moveFileDown}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2 mt-3"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Plus className="w-4 h-4" />
                        Add More PDF Files
                      </Button>
                    </>
                  )}

                  {/* STANDARD file list (non-merge) */}
                  {selectedToolId !== "merge-pdf" &&
                    uploadedFiles.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4"
                      >
                        {uploadedFiles.map((file, index) => (
                          <div
                            key={`${file.name}-${index}`}
                            className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                          >
                            <div
                              className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getFileIconColor()}`}
                            >
                              {getFileIconComponent()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {file.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(file.size)}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeFile(index)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                        {tool.multipleFiles && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full gap-2 mt-3"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Plus className="w-4 h-4" />
                            Add More Files
                          </Button>
                        )}
                      </motion.div>
                    )}
                </>
              )}

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </motion.div>
              )}

              {/* Tool-specific Options */}
              {hasFiles && config.options.length > 0 && (
                <ToolOptions
                  options={config.options}
                  values={optionValues}
                  onChange={(key, value) =>
                    setOptionValues((prev) => ({ ...prev, [key]: value }))
                  }
                  toolId={selectedToolId}
                />
              )}

              {/* Live Preview */}
              {hasFiles && (
                <LivePreview
                  toolId={selectedToolId}
                  files={uploadedFiles}
                  optionValues={optionValues}
                  compareFileA={compareFileA}
                  compareFileB={compareFileB}
                  onPageOrderChange={(order) => {
                    // Store the reordered page numbers as a comma-separated string
                    // so the PDF processor can apply the new order
                    setOptionValues((prev) => ({
                      ...prev,
                      "page-order": order.join(","),
                    }));
                  }}
                />
              )}

              {/* Process Button */}
              {hasFiles && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6"
                >
                  <Button
                    size="lg"
                    className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20 gap-2"
                    onClick={handleProcess}
                  >
                    {config.processButtonText}
                  </Button>
                  {!config.dualUpload && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-2 text-muted-foreground"
                      onClick={() => {
                        clearFiles();
                        setError(null);
                      }}
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1" />
                      Reset & Upload Different File
                    </Button>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Processing State */}
          {isProcessing && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center py-16"
            >
              <div className="relative w-24 h-24 mx-auto mb-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  className="absolute inset-0 rounded-full border-4 border-muted border-t-primary"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <tool.icon className={`w-8 h-8 ${tool.color}`} />
                </div>
              </div>

              <h2 className="text-xl font-semibold mb-2">
                {config.processButtonText}...
              </h2>

              {/* Step-by-step progress */}
              <div className="max-w-md mx-auto mb-6">
                {config.processingSteps.map((step, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0.3 }}
                    animate={{ opacity: i <= currentStep ? 1 : 0.3 }}
                    className="flex items-center gap-3 py-1.5"
                  >
                    {i < currentStep ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : i === currentStep ? (
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent flex-shrink-0" />
                      </motion.div>
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-muted flex-shrink-0" />
                    )}
                    <span
                      className={`text-sm ${
                        i <= currentStep
                          ? "font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      {step}
                    </span>
                  </motion.div>
                ))}
              </div>

              <div className="max-w-md mx-auto">
                <Progress value={processingProgress} className="h-2 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {Math.round(processingProgress)}% complete
                </p>
              </div>
            </motion.div>
          )}

          {/* Complete State */}
          {isComplete && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="text-center py-12"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 15,
                  delay: 0.1,
                }}
                className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mx-auto mb-6"
              >
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </motion.div>
              <h2 className="text-xl font-semibold mb-2">
                {processResult?.success
                  ? `${config.processButtonText} Complete!`
                  : "Processing Failed"}
              </h2>
              <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto">
                {processResult?.message || config.outputDescription}
              </p>

              {/* Output format badge */}
              <div className="flex items-center justify-center gap-2 mb-6">
                <Badge variant="outline" className="text-xs gap-1">
                  <Download className="w-3 h-3" />
                  Output: {config.outputExtension}
                </Badge>
                {processResult?.outputFiles &&
                  processResult.outputFiles.length > 1 && (
                    <Badge variant="secondary" className="text-xs">
                      <Package className="w-3 h-3 mr-1" />
                      {processResult.outputFiles.length} files
                    </Badge>
                  )}
                {processResult?.stats?.reduction && (
                  <Badge variant="secondary" className="text-xs">
                    Size reduction: {processResult.stats.reduction}
                  </Badge>
                )}
              </div>

              {/* File size comparison */}
              {processResult?.stats && (
                <div className="flex items-center justify-center gap-6 mb-6">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Original</p>
                    <p className="text-sm font-semibold">
                      {formatFileSize(processResult.stats.originalSize)}
                    </p>
                  </div>
                  <div className="text-muted-foreground">→</div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Output</p>
                    <p className="text-sm font-semibold text-emerald-600">
                      {formatFileSize(processResult.stats.outputSize)}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                {processResult?.success && (
                  <>
                    <Button
                      size="lg"
                      className="h-12 px-8 text-base font-semibold gap-2 shadow-lg shadow-primary/20"
                      onClick={handleDownload}
                    >
                      <Download className="w-5 h-5" />
                      {config.outputLabel || "Download File"}
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      className="h-12 px-4 text-sm gap-2"
                      onClick={handleSaveToGoogleDrive}
                      disabled={cloudLoading}
                    >
                      <FolderOpen className="w-4 h-4 text-amber-600" />
                      Google Drive
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      className="h-12 px-4 text-sm gap-2"
                      onClick={handleSaveToDropbox}
                      disabled={cloudLoading}
                    >
                      <Archive className="w-4 h-4 text-sky-600" />
                      Dropbox
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 px-6 text-base gap-2"
                  onClick={handleResetTool}
                >
                  <RotateCcw className="w-4 h-4" />
                  Process Another
                </Button>
              </div>

              {/* Output files list for multiple files */}
              {processResult?.success &&
                processResult.outputFiles.length > 1 && (
                  <div className="mt-8 max-w-md mx-auto">
                    <h3 className="text-sm font-semibold mb-3 flex items-center justify-center gap-2">
                      <Package className="w-4 h-4" />
                      Output Files ({processResult.outputFiles.length})
                    </h3>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2">
                      {processResult.outputFiles.map(
                        (file, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 p-2.5 rounded-lg border bg-card text-left"
                          >
                            <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">
                                {file.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(file.size)}
                              </p>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

              {/* Summary */}
              <div className="mt-8 p-4 rounded-xl border bg-muted/30 max-w-md mx-auto">
                <h3 className="text-sm font-semibold mb-3">Processing Summary</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tool</span>
                    <span className="font-medium">{tool.name}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Input files</span>
                    <span className="font-medium">
                      {config.dualUpload ? "2 files" : uploadedFiles.length}
                    </span>
                  </div>
                  {processResult?.stats && (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Input size</span>
                        <span className="font-medium">
                          {formatFileSize(processResult.stats.originalSize)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Output size</span>
                        <span className="font-medium">
                          {formatFileSize(processResult.stats.outputSize)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Task A: Large File Compress Suggestion Dialog */}
      <Dialog open={showLargeFileDialog} onOpenChange={setShowLargeFileDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="w-5 h-5 text-amber-500" />
              Large File Detected
            </DialogTitle>
            <DialogDescription>
              <span className="font-medium">{largeFileName}</span> is over 50MB.
              Processing may be slow and could affect performance.
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              We recommend compressing large PDFs first to improve processing
              speed and reliability.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowLargeFileDialog(false)}
            >
              Continue Anyway
            </Button>
            <Button
              onClick={() => {
                setShowLargeFileDialog(false);
                selectTool("compress-pdf");
              }}
              className="gap-2"
            >
              <FileText className="w-4 h-4" />
              Compress First
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
