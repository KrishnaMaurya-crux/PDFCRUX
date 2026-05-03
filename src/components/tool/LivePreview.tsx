"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Eye,
  RotateCw,
  FileText,
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  List,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ========================
// Enable List (Tool Specificity)
// ========================

const LIVE_PREVIEW_ENABLED = [
  "merge-pdf",
  "split-pdf",
  "rotate-pdf",
  "page-numbers",
  "organize-pdf",
  "sign-pdf",
  "watermark-pdf",
];

// ========================
// Types
// ========================

interface PreviewPage {
  pageNum: number;
  dataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

interface LivePreviewProps {
  toolId: string;
  files: File[];
  optionValues: Record<string, string | number | boolean>;
  compareFileA?: File | null;
  compareFileB?: File | null;
}

// ========================
// Helpers
// ========================

function formatSize(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// ========================
// PDF Page Renderer
// ========================

let pdfJsModule: typeof import("pdfjs-dist") | null = null;

async function getPdfjs() {
  if (pdfJsModule) return pdfJsModule;
  pdfJsModule = await import("pdfjs-dist");
  pdfJsModule.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfJsModule;
}

function parsePageRange(input: string, totalPages: number): number[] {
  if (!input || input.trim() === "") {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const indices = new Set<number>();
  const parts = input.split(",").map((s) => s.trim());
  for (const part of parts) {
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-").map((s) => s.trim());
      const start = Math.max(1, parseInt(startStr) || 1);
      const end = Math.min(totalPages, parseInt(endStr) || totalPages);
      for (let i = start; i <= end; i++) {
        indices.add(i - 1);
      }
    } else {
      const num = parseInt(part);
      if (num >= 1 && num <= totalPages) {
        indices.add(num - 1);
      }
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}

// Render a single file's pages to thumbnails
async function renderPdfPages(
  file: File,
  maxPages = 50,
  scale = 0.4
): Promise<PreviewPage[]> {
  const pdfjs = await getPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  // BUG FIX: pdfjs-dist uses .numPages (property), NOT .getPageCount() (method)
  const pageCount = Math.min(pdf.numPages, maxPages);
  const pages: PreviewPage[] = [];

  for (let i = 0; i < pageCount; i++) {
    const page = await pdf.getPage(i + 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push({
      pageNum: i + 1,
      dataUrl: canvas.toDataURL("image/jpeg", 0.7),
      width: viewport.width,
      height: viewport.height,
      originalWidth: page.getViewport({ scale: 1 }).width,
      originalHeight: page.getViewport({ scale: 1 }).height,
    });
  }
  return pages;
}

// Render image file to thumbnail
async function renderImageThumbnail(
  file: File,
  scale = 0.4
): Promise<PreviewPage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve({
        pageNum: 1,
        dataUrl: canvas.toDataURL("image/jpeg", 0.7),
        width: canvas.width,
        height: canvas.height,
        originalWidth: img.width,
        originalHeight: img.height,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

// ========================
// Split Preview Groups
// ========================

interface SplitGroup {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  pages: number[];
}

const SPLIT_COLORS = [
  { color: "text-rose-500", bgColor: "bg-rose-50 dark:bg-rose-950/20", borderColor: "border-rose-300 dark:border-rose-700" },
  { color: "text-sky-500", bgColor: "bg-sky-50 dark:bg-sky-950/20", borderColor: "border-sky-300 dark:border-sky-700" },
  { color: "text-emerald-500", bgColor: "bg-emerald-50 dark:bg-emerald-950/20", borderColor: "border-emerald-300 dark:border-emerald-700" },
  { color: "text-amber-500", bgColor: "bg-amber-50 dark:bg-amber-950/20", borderColor: "border-amber-300 dark:border-amber-700" },
  { color: "text-violet-500", bgColor: "bg-violet-50 dark:bg-violet-950/20", borderColor: "border-violet-300 dark:border-violet-700" },
  { color: "text-teal-500", bgColor: "bg-teal-50 dark:bg-teal-950/20", borderColor: "border-teal-300 dark:border-teal-700" },
  { color: "text-pink-500", bgColor: "bg-pink-50 dark:bg-pink-950/20", borderColor: "border-pink-300 dark:border-pink-700" },
  { color: "text-orange-500", bgColor: "bg-orange-50 dark:bg-orange-950/20", borderColor: "border-orange-300 dark:border-orange-700" },
];

function getSplitGroups(
  totalPages: number,
  options: Record<string, string | number | boolean>
): SplitGroup[] {
  const mode = String(options["split-mode"] || "all");
  const groups: SplitGroup[] = [];

  if (mode === "all") {
    for (let i = 0; i < totalPages; i++) {
      const ci = i % SPLIT_COLORS.length;
      groups.push({
        label: `Page ${i + 1}`,
        ...SPLIT_COLORS[ci],
        pages: [i + 1],
      });
    }
  } else if (mode === "ranges") {
    const rangeInput = String(options["page-ranges"] || "");
    const ranges = rangeInput.split(",").map((s) => s.trim()).filter(Boolean);
    ranges.forEach((range, idx) => {
      const indices = parsePageRange(range, totalPages);
      const ci = idx % SPLIT_COLORS.length;
      groups.push({
        label: `Part ${idx + 1}: ${range}`,
        ...SPLIT_COLORS[ci],
        pages: indices.map((i) => i + 1),
      });
    });
  } else if (mode === "extract") {
    const rangeInput = String(options["page-ranges"] || "1");
    const indices = parsePageRange(rangeInput, totalPages);
    groups.push({
      label: `Extracted: ${rangeInput}`,
      ...SPLIT_COLORS[0],
      pages: indices.map((i) => i + 1),
    });
  } else if (mode === "interval") {
    const interval = Number(options["interval"] || 5);
    for (let start = 0; start < totalPages; start += interval) {
      const end = Math.min(start + interval, totalPages);
      const ci = groups.length % SPLIT_COLORS.length;
      groups.push({
        label: `Pages ${start + 1}-${end}`,
        ...SPLIT_COLORS[ci],
        pages: Array.from({ length: end - start }, (_, i) => start + i + 1),
      });
    }
  }
  return groups;
}

// ========================
// Page Number Text Preview
// ========================

function getPageNumberText(
  pageNum: number,
  totalPages: number,
  options: Record<string, string | number | boolean>
): string {
  const format = String(options["format"] || "numeric");
  const startNumber = Number(options["start-number"] || 1);
  const num = startNumber + (pageNum - 1);

  switch (format) {
    case "page-prefix":
      return `Page ${num}`;
    case "dashed":
      return `- ${num} -`;
    case "of-total":
      return `Page ${num} of ${totalPages}`;
    case "roman-lower":
      return toRoman(num).toLowerCase();
    case "roman-upper":
      return toRoman(num);
    case "alpha-lower":
      return toAlpha(num).toLowerCase();
    case "alpha-upper":
      return toAlpha(num);
    default:
      return String(num);
  }
}

function toRoman(num: number): string {
  const roman: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let result = "";
  for (const [value, symbol] of roman) {
    while (num >= value) {
      result += symbol;
      num -= value;
    }
  }
  return result;
}

function toAlpha(num: number): string {
  let result = "";
  num -= 1;
  while (num >= 0) {
    result = String.fromCharCode(65 + (num % 26)) + result;
    num = Math.floor(num / 26) - 1;
  }
  return result;
}

// ========================
// Main Component
// ========================

export default function LivePreview({
  toolId,
  files,
  optionValues,
  // Kept for backward compatibility with callers that still pass these props
  compareFileA: _compareFileA,
  compareFileB: _compareFileB,
}: LivePreviewProps) {
  // === ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURN ===

  const [pages, setPages] = useState<PreviewPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [currentPage, setCurrentPage] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const isPdf = files.length > 0 && files[0]?.type === "application/pdf";
  const isImage =
    files.length > 0 &&
    (files[0]?.type?.startsWith("image/") ||
      files[0]?.name?.match(/\.(jpe?g|png|gif|webp|bmp)$/i));

  // Render pages when files change
  useEffect(() => {
    let cancelled = false;

    async function render() {
      setLoading(true);
      setError(null);
      setPages([]);
      setCurrentPage(0);

      try {
        if (files.length === 0) {
          setLoading(false);
          return;
        }

        if (isPdf && files[0]) {
          const rendered = await renderPdfPages(files[0], 50, 0.5);
          if (!cancelled) {
            setPages(rendered);
            setLoading(false);
          }
        } else if (isImage) {
          const allPages: PreviewPage[] = [];
          for (const file of files.slice(0, 20)) {
            try {
              const thumb = await renderImageThumbnail(file, 0.4);
              allPages.push(thumb);
            } catch {
              // skip failed
            }
          }
          if (!cancelled) {
            setPages(allPages);
            setLoading(false);
          }
        } else {
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render preview");
          setLoading(false);
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [files, isPdf, isImage]);

  const totalPages = pages.length;

  // Get rotation for a page
  const getRotation = useCallback(
    (pageNum: number) => {
      if (toolId !== "rotate-pdf") return 0;
      const angle = Number(optionValues["rotation"] || 90);
      const applyTo = String(optionValues["apply-to"] || "all");
      const pageRange = String(optionValues["page-range"] || "");
      const indices = pageRange ? parsePageRange(pageRange, totalPages) : [];

      switch (applyTo) {
        case "all":
          return angle;
        case "even":
          return pageNum % 2 === 0 ? angle : 0;
        case "odd":
          return pageNum % 2 === 1 ? angle : 0;
        case "specific":
          return indices.includes(pageNum - 1) ? angle : 0;
        default:
          return 0;
      }
    },
    [toolId, optionValues, totalPages]
  );

  // Get page number style for a page
  const getPageNumberStyle = useCallback(
    (pageNum: number) => {
      if (toolId !== "page-numbers") return null;
      const position = String(optionValues["position"] || "bottom-center");
      const text = getPageNumberText(pageNum, totalPages, optionValues);
      const fontSize = Number(optionValues["font-size"] || 12);
      return { position, text, fontSize };
    },
    [toolId, optionValues, totalPages]
  );

  // Split groups for split-pdf
  const splitGroups = useMemo(() => {
    if (toolId !== "split-pdf") return [];
    return getSplitGroups(totalPages, optionValues);
  }, [toolId, totalPages, optionValues]);

  // Watermark overlay style
  const watermarkStyle = useMemo(() => {
    if (toolId !== "watermark-pdf") return null;
    const text = String(optionValues["text"] || "");
    const opacity = Number(optionValues["opacity"] || 30) / 100;
    const rotation = Number(optionValues["rotation"] || -45);
    const fontSize = Math.min(Number(optionValues["font-size"] || 48), 36);
    const color = String(optionValues["color"] || "gray");
    const colorMap: Record<string, string> = {
      gray: "rgba(128,128,128,",
      red: "rgba(200,50,50,",
      blue: "rgba(50,80,200,",
      green: "rgba(50,150,50,",
      black: "rgba(0,0,0,",
      custom: "rgba(50,50,50,",
    };
    return { text, opacity, rotation, fontSize, rgba: colorMap[color] || colorMap.gray };
  }, [toolId, optionValues]);

  // Sign style — supports type, draw, and upload modes
  const signStyle = useMemo(() => {
    if (toolId !== "sign-pdf") return null;
    const signType = String(optionValues["sign-type"] || "type");
    const name = String(optionValues["signer-name"] || "");
    const position = String(optionValues["position"] || "bottom-right");
    const page = Number(optionValues["page"] || 1);
    const signColor = String(optionValues["sign-color"] || "#00008B");
    const signFontSize = Number(optionValues["sign-font-size"] || 36);
    const signFont = String(optionValues["sign-font"] || "georgia");
    const signatureData = String(optionValues["signature-data"] || "");
    const sigImageSize = Number(optionValues["sig-image-size"] || 200);
    return { signType, name, position, page, signColor, signFontSize, signFont, signatureData, sigImageSize };
  }, [toolId, optionValues]);

  // Organize mode
  const organizeMode = useMemo(() => {
    if (toolId !== "organize-pdf") return null;
    const mode = String(optionValues["mode"] || "reorder");
    const pageRange = String(optionValues["page-range"] || "");
    const blankPos = Number(optionValues["blank-position"] || 0);
    return { mode, selectedPages: parsePageRange(pageRange, totalPages), blankPos };
  }, [toolId, optionValues, totalPages]);

  // === EARLY RETURN: Only show Live Preview for enabled tools ===
  if (!LIVE_PREVIEW_ENABLED.includes(toolId)) return null;

  // Don't render if no files
  if (files.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="mt-8"
    >
      {/* Preview Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Live Preview</h3>
          {totalPages > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalPages} {totalPages === 1 ? "page" : "pages"}
            </Badge>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              aria-label="Grid view"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              aria-label="List view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Preview Container */}
      <div
        ref={containerRef}
        className="rounded-xl border bg-card overflow-hidden"
      >
        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              className="w-8 h-8 rounded-full border-2 border-muted border-t-primary mb-3"
            />
            <p className="text-sm text-muted-foreground">Rendering preview...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Preview unavailable — your file will still process correctly
            </p>
          </div>
        )}

        {/* PDF Page Thumbnails */}
        {!loading && !error && pages.length > 0 && (
          <>
            {/* Tool-specific info bar: merge-pdf */}
            {toolId === "merge-pdf" && (
              <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-4">
                <span className="text-xs font-medium">{files.length} file(s) to merge</span>
                <span className="text-xs text-muted-foreground">
                  Total pages: <strong>{totalPages}</strong>
                </span>
                <span className="text-xs text-muted-foreground">
                  Mode: <strong>{String(optionValues["merge-mode"] || "sequential")}</strong>
                </span>
              </div>
            )}

            {/* Tool-specific info bar: watermark-pdf */}
            {toolId === "watermark-pdf" && watermarkStyle && (
              <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-4">
                <span className="text-xs font-medium">Watermark Preview</span>
                {watermarkStyle.text && (
                  <Badge variant="outline" className="text-xs">
                    &quot;{watermarkStyle.text}&quot;
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  Opacity: <strong>{Math.round(watermarkStyle.opacity * 100)}%</strong>
                </span>
                <span className="text-xs text-muted-foreground">
                  Angle: <strong>{watermarkStyle.rotation}&deg;</strong>
                </span>
              </div>
            )}

            {/* Tool-specific info bar: rotate-pdf */}
            {toolId === "rotate-pdf" && (
              <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-4">
                <span className="text-xs font-medium">Rotation Preview</span>
                <span className="text-xs text-muted-foreground">
                  Angle: <strong>{Number(optionValues["rotation"] || 90)}&deg;</strong>
                </span>
                <span className="text-xs text-muted-foreground">
                  Apply to: <strong>{String(optionValues["apply-to"] || "all")}</strong>
                </span>
              </div>
            )}

            {/* Tool-specific info bar: sign-pdf */}
            {toolId === "sign-pdf" && signStyle && (
              <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-4 flex-wrap">
                <span className="text-xs font-medium">Signature Preview</span>
                <Badge variant="outline" className="text-xs capitalize">
                  {signStyle.signType === "type" ? "Typed" : signStyle.signType === "draw" ? "Drawn" : "Uploaded"}
                </Badge>
                {signStyle.signType === "type" && signStyle.name && (
                  <Badge variant="outline" className="text-xs">
                    {signStyle.name}
                  </Badge>
                )}
                {signStyle.signType !== "type" && signStyle.signatureData && (
                  <Badge variant="outline" className="text-xs text-emerald-600">
                    ✓ Signature ready
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  Position: <strong>{signStyle.position}</strong>
                </span>
                <span className="text-xs text-muted-foreground">
                  On page: <strong>{signStyle.page || "Last"}</strong>
                </span>
              </div>
            )}

            {/* Tool-specific info bar: page-numbers */}
            {toolId === "page-numbers" && (
              <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-4">
                <span className="text-xs font-medium">Page Numbers Preview</span>
                <span className="text-xs text-muted-foreground">
                  Position: <strong>{String(optionValues["position"] || "bottom-center")}</strong>
                </span>
                <span className="text-xs text-muted-foreground">
                  Format: <strong>{String(optionValues["format"] || "numeric")}</strong>
                </span>
              </div>
            )}

            {/* Tool-specific info bar: organize-pdf */}
            {toolId === "organize-pdf" && organizeMode && (
              <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-4">
                <span className="text-xs font-medium">Organize Preview</span>
                <span className="text-xs text-muted-foreground">
                  Mode: <strong>{organizeMode.mode}</strong>
                </span>
                {organizeMode.selectedPages.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Selected: <strong>{organizeMode.selectedPages.length} page(s)</strong>
                  </span>
                )}
              </div>
            )}

            {/* Split groups header */}
            {toolId === "split-pdf" && splitGroups.length > 0 && (
              <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium">Split into {splitGroups.length} file(s):</span>
                {splitGroups.map((g, i) => (
                  <Badge key={i} variant="outline" className={`text-xs ${g.color}`}>
                    {g.label}
                  </Badge>
                ))}
              </div>
            )}

            {/* Page Grid / List */}
            <div
              className={`p-4 ${
                viewMode === "grid"
                  ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[500px] overflow-y-auto"
                  : "flex flex-col gap-3 max-h-[400px] overflow-y-auto"
              }`}
            >
              {pages.map((page, idx) => {
                const rotation = getRotation(page.pageNum);
                const pageNumStyle = getPageNumberStyle(page.pageNum);
                const isSplitHighlighted = toolId === "split-pdf";
                const splitGroup = isSplitHighlighted
                  ? splitGroups.find((g) => g.pages.includes(page.pageNum))
                  : null;

                const isOrganizeSelected =
                  toolId === "organize-pdf" &&
                  organizeMode?.mode !== "reorder" &&
                  organizeMode.selectedPages.includes(idx);

                return (
                  <motion.div
                    key={page.pageNum}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.02 }}
                    className={`relative group rounded-lg overflow-hidden border bg-white dark:bg-zinc-900 transition-all hover:shadow-md ${
                      splitGroup
                        ? `${splitGroup.borderColor} ${splitGroup.bgColor} border-2`
                        : "border-border"
                    } ${isOrganizeSelected ? "border-2 border-amber-400 bg-amber-50/50 dark:bg-amber-950/20" : ""}`}
                    style={{
                      ...(viewMode === "list" && {
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                      }),
                    }}
                  >
                    {/* Page thumbnail wrapper */}
                    <div
                      className={`relative overflow-hidden ${
                        viewMode === "grid" ? "aspect-[3/4]" : "w-24 h-32 flex-shrink-0"
                      }`}
                    >
                      {/* PDF page image with rotation */}
                      <img
                        src={page.dataUrl}
                        alt={`Page ${page.pageNum}`}
                        className="w-full h-full object-contain"
                        style={{
                          transform: rotation ? `rotate(${rotation}deg)` : undefined,
                          transition: "transform 0.3s ease",
                        }}
                      />

                      {/* Watermark overlay */}
                      {watermarkStyle && watermarkStyle.text && (
                        <div
                          className="absolute inset-0 flex items-center justify-center pointer-events-none"
                          style={{ opacity: watermarkStyle.opacity }}
                        >
                          <span
                            className="font-bold whitespace-nowrap select-none"
                            style={{
                              fontSize: `${watermarkStyle.fontSize}px`,
                              color: `${watermarkStyle.rgba}${watermarkStyle.opacity})`,
                              transform: `rotate(${watermarkStyle.rotation}deg)`,
                              textShadow: "1px 1px 2px rgba(255,255,255,0.5)",
                            }}
                          >
                            {watermarkStyle.text}
                          </span>
                        </div>
                      )}

                      {/* Signature overlay — type, draw, and upload modes */}
                      {signStyle && (() => {
                        const isOnThisPage = !signStyle.page || signStyle.page === page.pageNum;
                        if (!isOnThisPage) return null;

                        const hasTypedName = signStyle.signType === "type" && signStyle.name;
                        const hasSignatureImage = (signStyle.signType === "draw" || signStyle.signType === "upload") && signStyle.signatureData;
                        if (!hasTypedName && !hasSignatureImage) return null;

                        // Position mapping
                        const posMap: Record<string, string> = {
                          "bottom-right": "bottom-3 right-3 items-end justify-end",
                          "bottom-left": "bottom-3 left-3 items-end justify-start",
                          "bottom-center": "bottom-3 left-1/2 -translate-x-1/2 items-end justify-center",
                          "top-right": "top-3 right-3 items-start justify-end",
                          "top-left": "top-3 left-3 items-start justify-start",
                          "top-center": "top-3 left-1/2 -translate-x-1/2 items-start justify-center",
                        };
                        const posClass = posMap[signStyle.position] || posMap["bottom-right"];

                        // Font map for typed signatures (using next/font CSS variables)
                        const fontMap: Record<string, string> = {
                          georgia: "Georgia, serif",
                          palatino: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
                          dancing: "var(--font-dancing), cursive",
                          greatvibes: "var(--font-greatvibes), cursive",
                          kalam: "var(--font-kalam), cursive",
                          parisienne: "var(--font-parisienne), cursive",
                          caveat: "var(--font-caveat), cursive",
                        };

                        return (
                          <div className={`absolute inset-0 flex ${posClass} pointer-events-none p-2`}>
                            {hasTypedName ? (
                              <div className="flex flex-col items-center">
                                <span
                                  style={{
                                    fontFamily: fontMap[signStyle.signFont] || "Georgia, serif",
                                    fontSize: `${Math.max(signStyle.signFontSize * 0.4, 14)}px`,
                                    color: signStyle.signColor,
                                    fontStyle: "italic",
                                    textShadow: "0 1px 2px rgba(255,255,255,0.8)",
                                  }}
                                >
                                  {signStyle.name}
                                </span>
                                <div
                                  className="mt-0.5"
                                  style={{
                                    width: `${Math.max(signStyle.signFontSize * 0.9, 50)}px`,
                                    height: "1px",
                                    backgroundColor: signStyle.signColor + "88",
                                  }}
                                />
                              </div>
                            ) : hasSignatureImage ? (
                              <img
                                src={signStyle.signatureData}
                                alt="Signature preview"
                                className="object-contain"
                                style={{
                                  maxWidth: `${Math.max(signStyle.sigImageSize * 0.4, 60)}px`,
                                  maxHeight: `${Math.max(signStyle.sigImageSize * 0.4, 60)}px`,
                                  opacity: 0.95,
                                  filter: "drop-shadow(0 1px 2px rgba(255,255,255,0.8))",
                                }}
                              />
                            ) : null}
                          </div>
                        );
                      })()}

                      {/* Page number overlay */}
                      {pageNumStyle && (
                        <div
                          className="absolute inset-0 flex pointer-events-none select-none"
                          style={{
                            alignItems:
                              pageNumStyle.position.includes("bottom")
                                ? "flex-end"
                                : "flex-start",
                            justifyContent: pageNumStyle.position.includes("center")
                              ? "center"
                              : pageNumStyle.position.includes("right")
                              ? "flex-end"
                              : "flex-start",
                            padding: "8px 12px",
                          }}
                        >
                          <span
                            className="text-gray-500 dark:text-gray-400 font-medium bg-white/80 dark:bg-zinc-800/80 px-1.5 py-0.5 rounded text-center"
                            style={{ fontSize: `${Math.min(pageNumStyle.fontSize, 14)}px` }}
                          >
                            {pageNumStyle.text}
                          </span>
                        </div>
                      )}

                      {/* Organize: blank page indicator */}
                      {toolId === "organize-pdf" &&
                        organizeMode?.mode === "insert" &&
                        organizeMode.blankPos === page.pageNum && (
                          <div className="absolute inset-0 border-2 border-dashed border-violet-400 bg-violet-50/40 dark:bg-violet-950/30 flex items-center justify-center">
                            <span className="text-xs text-violet-500 font-medium bg-white/90 dark:bg-zinc-900/90 px-2 py-1 rounded">
                              + Blank
                            </span>
                          </div>
                        )}

                      {/* Page number badge */}
                      <div className="absolute top-1.5 left-1.5">
                        <span className="text-[10px] font-bold bg-black/60 text-white px-1.5 py-0.5 rounded">
                          {page.pageNum}
                        </span>
                      </div>

                      {/* Rotate indicator */}
                      {rotation > 0 && (
                        <div className="absolute top-1.5 right-1.5">
                          <span className="text-[10px] font-bold bg-primary/80 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <RotateCw className="w-2.5 h-2.5" />
                            {rotation}&deg;
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Page info (list mode) */}
                    {viewMode === "list" && (
                      <div className="flex-1 p-3 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">Page {page.pageNum}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {Math.round(page.originalWidth)} &times; {Math.round(page.originalHeight)} pt
                          </span>
                        </div>
                        {splitGroup && (
                          <Badge variant="secondary" className={`text-[10px] mt-1 ${splitGroup.color}`}>
                            {splitGroup.label}
                          </Badge>
                        )}
                        {isOrganizeSelected && (
                          <Badge variant="secondary" className="text-[10px] mt-1 text-amber-600">
                            {organizeMode?.mode === "delete"
                              ? "Will be deleted"
                              : organizeMode?.mode === "extract"
                              ? "Will be extracted"
                              : "Selected"}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Grid mode info */}
                    {viewMode === "grid" && (
                      <div className="px-2 py-1.5 border-t border-border/50">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium text-muted-foreground">
                            Page {page.pageNum}
                          </span>
                          {splitGroup && (
                            <span className={`text-[9px] ${splitGroup.color}`}>
                              {splitGroup.label}
                            </span>
                          )}
                          {isOrganizeSelected && (
                            <span className="text-[9px] text-amber-600 font-medium">Selected</span>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Page navigation for sign-pdf */}
            {totalPages > 1 && toolId === "sign-pdf" && (
              <div className="px-4 py-3 border-t flex items-center justify-center gap-4">
                <button
                  onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                  disabled={currentPage === 0}
                  className="p-1.5 rounded-md border hover:bg-accent disabled:opacity-30 transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-medium">
                  Page {currentPage + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                  disabled={currentPage >= totalPages - 1}
                  className="p-1.5 rounded-md border hover:bg-accent disabled:opacity-30 transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}

        {/* No pages rendered placeholder */}
        {!loading && !error && pages.length === 0 && (
          <div className="p-6 text-center">
            <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {isImage
                ? `${files.length} image(s) ready for conversion`
                : "File preview not available for this file type"}
            </p>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <p className="text-[11px] text-muted-foreground mt-2 text-center">
        Preview updates in real-time as you change settings above
      </p>
    </motion.div>
  );
}
