"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  X,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Copy,
  Check,
  AlertCircle,
  Zap,
  FileSearch,
  ScanText,
  Clock,
  RotateCcw,
  UploadCloud,
  BrainCircuit,
  Download,
  Languages,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/lib/store";
import { saveHistory } from "@/lib/history";

// ── Types ──────────────────────────────────────────────────────────────────

interface OcrElement {
  type: "heading1" | "heading2" | "heading3" | "paragraph" | "bullet_list" | "numbered_list" | "table";
  text?: string;
  bold?: boolean;
  items?: string[];
  headers?: string[];
  rows?: string[][];
}

interface OcrPage {
  page: number;
  elements: OcrElement[];
}

interface OcrResponse {
  success: boolean;
  pages?: OcrPage[];
  batchIndex: number;
  totalBatches: number;
  error?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const BATCH_SIZE = 5;
const RENDER_DPI = 200;
const JPEG_QUALITY = 0.85;

const languageOptions = [
  { value: "English", label: "English" },
  { value: "Hindi", label: "Hindi" },
  { value: "Spanish", label: "Spanish" },
  { value: "French", label: "French" },
  { value: "German", label: "German" },
  { value: "Chinese (Simplified)", label: "Chinese (Simplified)" },
  { value: "Chinese (Traditional)", label: "Chinese (Traditional)" },
  { value: "Japanese", label: "Japanese" },
  { value: "Korean", label: "Korean" },
  { value: "Arabic", label: "Arabic" },
  { value: "Portuguese", label: "Portuguese" },
  { value: "Italian", label: "Italian" },
  { value: "Russian", label: "Russian" },
  { value: "Hindi and English mixed", label: "Hinglish (Hindi + English)" },
];

// ── Component ──────────────────────────────────────────────────────────────

export default function PdfOcrTool() {
  const { navigateHome } = useAppStore();

  // ── State ──
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocrPages, setOcrPages] = useState<OcrPage[]>([]);
  const [copied, setCopied] = useState(false);
  const [language, setLanguage] = useState("English");
  const [pageCount, setPageCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File handling ──
  const handleFileSelection = (selected: File) => {
    if (selected.type !== "application/pdf" && !selected.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a PDF file.");
      return;
    }
    if (selected.size > 20 * 1024 * 1024) {
      setError("File is too large. Maximum size is 20 MB.");
      return;
    }
    setError(null);
    setOcrPages([]);
    setFile(selected);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files[0]) handleFileSelection(e.dataTransfer.files[0]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = () => {
    setFile(null);
    setOcrPages([]);
    setError(null);
    setProgress(0);
    setCurrentStep("");
    setPageCount(0);
  };

  // ── Phase 1: PDF → Images ──
  const loadPdf = async (pdfFile: File) => {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const arrayBuffer = await pdfFile.arrayBuffer();
    return pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer), useWorkerFetch: false }).promise;
  };

  const renderPageToJpeg = async (
    pdfDoc: Awaited<ReturnType<typeof loadPdf>>,
    pageNum: number,
  ): Promise<Blob> => {
    const page = await pdfDoc.getPage(pageNum);
    const scale = RENDER_DPI / 72;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
  };

  // ── Phase 2: Send batch to OCR API ──
  const sendBatch = async (
    blobs: Blob[],
    batchIndex: number,
    totalBatches: number,
    docLanguage: string,
  ): Promise<OcrPage[]> => {
    const form = new FormData();
    blobs.forEach((b) => form.append("images", b, "page.jpg"));
    form.append("language", docLanguage);
    form.append("batchIndex", String(batchIndex));
    form.append("totalBatches", String(totalBatches));

    const response = await fetch("/api/gemini-ocr", {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      let errorMsg = `Server error (${response.status})`;
      try {
        const errBody = await response.json();
        if (errBody?.error) errorMsg = errBody.error;
      } catch { /* not JSON */ }
      throw new Error(errorMsg);
    }

    const data: OcrResponse = await response.json();
    if (!data.success || !data.pages) {
      throw new Error(data.error || "OCR analysis failed for this batch.");
    }

    return data.pages;
  };

  // ── Main Processing ──
  const handleProcess = async () => {
    if (!file) {
      setError("Please upload a PDF first.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setOcrPages([]);
    setProgress(0);
    setCopied(false);

    try {
      // ── Phase 1: Load PDF ──
      setCurrentStep("Loading PDF document...");
      const pdfDoc = await loadPdf(file);
      const numPages = pdfDoc.numPages;
      setPageCount(numPages);
      setProgress(5);

      // ── Phase 2: Render all pages to JPEG ──
      setCurrentStep("Rendering pages to images...");
      const allBlobs: Blob[] = [];
      for (let i = 1; i <= numPages; i++) {
        setCurrentStep(`Rendering page ${i} of ${numPages}...`);
        const blob = await renderPageToJpeg(pdfDoc, i);
        allBlobs.push(blob);
        setProgress(5 + Math.round((i / numPages) * 25)); // 5% → 30%
      }

      // ── Phase 3: Send in batches to OCR API ──
      const totalBatches = Math.ceil(numPages / BATCH_SIZE);
      const allPages: OcrPage[] = [];

      for (let b = 0; b < totalBatches; b++) {
        const startIdx = b * BATCH_SIZE;
        const endIdx = Math.min(startIdx + BATCH_SIZE, numPages);
        const batchBlobs = allBlobs.slice(startIdx, endIdx);

        setCurrentStep(
          `OCR processing batch ${b + 1} of ${totalBatches} (pages ${startIdx + 1}–${endIdx})...`,
        );

        const MAX_RETRIES = 2;
        let batchResult: OcrPage[] = [];

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            batchResult = await sendBatch(batchBlobs, b, totalBatches, language);
            break;
          } catch (err) {
            if (attempt === MAX_RETRIES) throw err;
            // Wait 3s before retry
            await new Promise((r) => setTimeout(r, 3000));
          }
        }

        allPages.push(...batchResult);
        setProgress(30 + Math.round(((b + 1) / totalBatches) * 60)); // 30% → 90%
      }

      // ── Done ──
      setProgress(100);
      setCurrentStep("Complete!");
      allPages.sort((a, b) => a.page - b.page);
      setOcrPages(allPages);

      // Auto-save to history
      saveHistory({
        toolId: "pdf-ocr",
        toolName: "PDF OCR (Gemini AI)",
        fileName: file.name,
        fileSize: file.size,
        resultSummary: `${numPages} pages extracted, ${allPages.reduce((sum, p) => sum + p.elements.length, 0)} elements found`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCR processing failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Copy all text ──
  const handleCopy = useCallback(() => {
    let text = "";

    ocrPages.forEach((page) => {
      text += `\n─── Page ${page.page} ───\n\n`;
      page.elements.forEach((el) => {
        switch (el.type) {
          case "heading1":
            text += `${el.text || ""}\n\n`;
            break;
          case "heading2":
            text += `${el.text || ""}\n\n`;
            break;
          case "heading3":
            text += `${el.text || ""}\n\n`;
            break;
          case "paragraph":
            text += `${el.text || ""}\n\n`;
            break;
          case "bullet_list":
            el.items?.forEach((item) => { text += `  • ${item}\n`; });
            text += "\n";
            break;
          case "numbered_list":
            el.items?.forEach((item, i) => { text += `  ${i + 1}. ${item}\n`; });
            text += "\n";
            break;
          case "table":
            if (el.headers) {
              text += `  | ${el.headers.join(" | ")} |\n`;
              text += `  ${el.headers.map(() => "---").join(" | ")}\n`;
            }
            el.rows?.forEach((row) => {
              text += `  | ${row.join(" | ")} |\n`;
            });
            text += "\n";
            break;
        }
      });
    });

    navigator.clipboard.writeText(text.trim()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }, [ocrPages]);

  // ── Download as TXT ──
  const handleDownloadTxt = useCallback(() => {
    let text = "";
    ocrPages.forEach((page) => {
      text += `\n━━━ Page ${page.page} ━━━\n\n`;
      page.elements.forEach((el) => {
        switch (el.type) {
          case "heading1":
            text += `${el.text || ""}\n\n`;
            break;
          case "heading2":
            text += `${el.text || ""}\n\n`;
            break;
          case "heading3":
            text += `${el.text || ""}\n\n`;
            break;
          case "paragraph":
            text += `${el.text || ""}\n\n`;
            break;
          case "bullet_list":
            el.items?.forEach((item) => { text += `  • ${item}\n`; });
            text += "\n";
            break;
          case "numbered_list":
            el.items?.forEach((item, i) => { text += `  ${i + 1}. ${item}\n`; });
            text += "\n";
            break;
          case "table":
            if (el.headers) {
              text += `  | ${el.headers.join(" | ")} |\n`;
              text += `  ${el.headers.map(() => "---").join(" | ")}\n`;
            }
            el.rows?.forEach((row) => {
              text += `  | ${row.join(" | ")} |\n`;
            });
            text += "\n";
            break;
        }
      });
    });

    const blob = new Blob([text.trim()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file ? file.name.replace(/\.pdf$/i, "-ocr.txt") : "ocr-result.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [ocrPages, file]);

  // ── Reset ──
  const handleReset = () => {
    setFile(null);
    setOcrPages([]);
    setError(null);
    setProgress(0);
    setCurrentStep("");
    setPageCount(0);
    setCopied(false);
  };

  // ── Render element ──
  const renderElement = (el: OcrElement, key: number) => {
    switch (el.type) {
      case "heading1":
        return (
          <h2 key={key} className="text-xl font-bold text-foreground mt-6 mb-2">
            {el.text}
          </h2>
        );
      case "heading2":
        return (
          <h3 key={key} className="text-lg font-bold text-foreground mt-5 mb-1.5">
            {el.text}
          </h3>
        );
      case "heading3":
        return (
          <h4 key={key} className="text-base font-semibold text-foreground mt-4 mb-1">
            {el.text}
          </h4>
        );
      case "paragraph":
        return (
          <p
            key={key}
            className={`text-sm leading-relaxed text-foreground/85 mb-2 ${el.bold ? "font-semibold" : ""}`}
          >
            {el.text}
          </p>
        );
      case "bullet_list":
        return (
          <ul key={key} className="list-disc list-inside space-y-1 mb-3 ml-2">
            {el.items?.map((item, i) => (
              <li key={i} className="text-sm leading-relaxed text-foreground/85">
                {item}
              </li>
            ))}
          </ul>
        );
      case "numbered_list":
        return (
          <ol key={key} className="list-decimal list-inside space-y-1 mb-3 ml-2">
            {el.items?.map((item, i) => (
              <li key={i} className="text-sm leading-relaxed text-foreground/85">
                {item}
              </li>
            ))}
          </ol>
        );
      case "table":
        return (
          <div key={key} className="mb-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              {el.headers && el.headers.length > 0 && (
                <thead>
                  <tr className="bg-muted/60">
                    {el.headers.map((h, i) => (
                      <th
                        key={i}
                        className="px-3 py-2 text-left font-semibold text-foreground border-b border-border"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {el.rows?.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                    {row.map((cell, j) => (
                      <td key={j} className="px-3 py-1.5 text-foreground/85">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      default:
        return null;
    }
  };

  // ── Total elements count ──
  const totalElements = ocrPages.reduce((sum, p) => sum + p.elements.length, 0);

  // ── Main Render ──
  return (
    <div className="min-h-screen pt-20 bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={navigateHome}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Tools
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-100 dark:border-orange-900/50 flex items-center justify-center">
              <ScanText className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold">
                  AI PDF <span className="text-orange-600">OCR</span>
                </h1>
                <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100 border-orange-200">
                  Gemini AI
                </Badge>
                <Badge variant="outline" className="text-xs font-mono">
                  gemini-3-flash-preview
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Extract text from scanned PDFs and images with AI-powered OCR
              </p>
            </div>
          </div>
        </div>

        {/* Upload Section */}
        {!file && !isProcessing && ocrPages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Language selector */}
            <div className="flex items-center gap-3">
              <Languages className="w-5 h-5 text-muted-foreground" />
              <label className="text-sm font-medium">Document Language</label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-12 sm:p-16 text-center transition-all duration-200 ${
                isDragOver
                  ? "border-orange-400 bg-orange-50/50 dark:bg-orange-950/20"
                  : "border-border hover:border-orange-300 hover:bg-muted/30"
              }`}
            >
              <UploadCloud className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-base font-semibold mb-1">
                Drop your PDF here or click to browse
              </p>
              <p className="text-sm text-muted-foreground">
                Maximum file size: 20 MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>

            {/* How it works */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
              {[
                {
                  title: "Upload PDF",
                  description: "Drag & drop or browse to select any PDF document.",
                  icon: UploadCloud,
                },
                {
                  title: "Gemini AI Extracts",
                  description: "AI reads each page image and extracts all text with structure.",
                  icon: BrainCircuit,
                },
                {
                  title: "Get Structured Text",
                  description: "Headings, paragraphs, lists, and tables — all properly formatted.",
                  icon: FileSearch,
                },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-xl border bg-card">
                  <div className="w-9 h-9 rounded-lg bg-orange-50 dark:bg-orange-950/40 flex items-center justify-center flex-shrink-0">
                    <item.icon className="w-4.5 h-4.5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* File Selected — Ready to Process */}
        {file && !isProcessing && ocrPages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Language selector */}
            <div className="flex items-center gap-3">
              <Languages className="w-5 h-5 text-muted-foreground" />
              <label className="text-sm font-medium">Document Language</label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* File card */}
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-950/40 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6 text-orange-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={removeFile}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <Button
                onClick={handleProcess}
                className="w-full mt-5 gap-2 bg-orange-600 hover:bg-orange-700 text-white"
                size="lg"
              >
                <Sparkles className="w-5 h-5" />
                Extract Text with AI
              </Button>
            </div>
          </motion.div>
        )}

        {/* Processing Animation */}
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border rounded-2xl p-8 shadow-sm"
          >
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="relative w-24 h-24">
                <div className="absolute inset-0 rounded-full border-[3px] border-muted animate-[spin_3s_linear_infinite]" />
                <div className="absolute inset-2 rounded-full border-[3px] border-orange-400/40 animate-[spin_2s_linear_infinite_reverse]" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <BrainCircuit className="w-10 h-10 text-orange-500 animate-pulse" />
                </div>
              </div>

              <div>
                <p className="text-lg font-bold text-foreground">Gemini AI is Extracting Text</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {currentStep || "Processing..."}
                </p>
              </div>

              <div className="w-full max-w-xs">
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">{progress}%</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-center">
                <Badge variant="outline" className="text-xs gap-1">
                  <Sparkles className="w-3 h-3 text-orange-500" />
                  Gemini AI
                </Badge>
                <Badge variant="outline" className="text-xs font-mono">
                  gemini-3-flash-preview
                </Badge>
                <Badge variant="outline" className="text-xs gap-1">
                  <Languages className="w-3 h-3" />
                  {language}
                </Badge>
              </div>
            </div>
          </motion.div>
        )}

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl p-4 flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">Error</p>
              <p className="text-sm text-red-700 dark:text-red-400 mt-0.5">{error}</p>
            </div>
          </motion.div>
        )}

        {/* OCR Results */}
        {ocrPages.length > 0 && !isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Header Card */}
            <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Text Extracted!</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {file?.name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/50 border border-border">
                    <FileText className="w-3.5 h-3.5" />
                    {pageCount} pages
                  </span>
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/50 border border-border">
                    <Zap className="w-3.5 h-3.5" />
                    {totalElements} elements
                  </span>
                  <Badge variant="outline" className="text-xs gap-1">
                    <Sparkles className="w-3 h-3 text-orange-500" />
                    Gemini AI
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copied ? "Copied!" : "Copy All Text"}
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownloadTxt}>
                  <Download className="w-3.5 h-3.5" />
                  Download TXT
                </Button>
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={handleReset}>
                  <RotateCcw className="w-3.5 h-3.5" />
                  Process Another
                </Button>
              </div>
            </div>

            {/* Pages — Scrollable */}
            <div className="max-h-[65vh] overflow-y-auto pr-1 space-y-4 custom-scrollbar">
              {ocrPages.map((page) => (
                <motion.div
                  key={page.page}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Page header */}
                  <div className="flex items-center gap-2.5 mb-3 pb-2.5 border-b border-border">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-orange-50 dark:bg-orange-950/40 text-orange-600 text-xs font-bold flex-shrink-0">
                      {page.page}
                    </span>
                    <h4 className="text-sm font-bold text-foreground">
                      Page {page.page}
                    </h4>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {page.elements.length} elements
                    </span>
                  </div>

                  {/* Page content */}
                  <div className="space-y-1">
                    {page.elements.map((el, i) => renderElement(el, i))}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
