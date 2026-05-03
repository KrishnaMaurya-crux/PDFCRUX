"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Upload,
  Download,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Type,
  Eraser,
  PenTool,
  Square,
  Highlighter,
  ImageIcon,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  Bold,
  Check,
  X,
  MousePointer2,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";

// ============================================================
// Types
// ============================================================

type AnnotationType =
  | "text"
  | "whiteout"
  | "highlight"
  | "draw"
  | "rectangle"
  | "image"
  | "textReplace";

type EditorTool =
  | "select"
  | "text"
  | "whiteout"
  | "highlight"
  | "draw"
  | "rectangle"
  | "image"
  | "eraser";

type Annotation = {
  id: string;
  type: AnnotationType;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
  color?: string;
  opacity?: number;
  borderWidth?: number;
  borderColor?: string;
  points?: { x: number; y: number }[];
  imageData?: string;
  imageWidth?: number;
  imageHeight?: number;
  // textReplace specific
  originalStr?: string;
  newStr?: string;
  originalX?: number;
  originalY?: number;
  originalWidth?: number;
  originalHeight?: number;
};

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  pageHeight: number;
}

interface ToolDef {
  id: EditorTool;
  label: string;
  icon: React.ReactNode;
  shortcut: string;
}

// ============================================================
// Constants
// ============================================================

const TOOLS: ToolDef[] = [
  { id: "select", label: "Select", icon: <MousePointer2 className="size-4" />, shortcut: "V" },
  { id: "text", label: "Text", icon: <Type className="size-4" />, shortcut: "T" },
  { id: "draw", label: "Draw", icon: <PenTool className="size-4" />, shortcut: "D" },
  { id: "highlight", label: "Highlight", icon: <Highlighter className="size-4" />, shortcut: "H" },
  { id: "whiteout", label: "Whiteout", icon: <Eraser className="size-4" />, shortcut: "W" },
  { id: "rectangle", label: "Rectangle", icon: <Square className="size-4" />, shortcut: "R" },
  { id: "image", label: "Image", icon: <ImageIcon className="size-4" />, shortcut: "I" },
  { id: "eraser", label: "Eraser", icon: <Trash2 className="size-4" />, shortcut: "E" },
];

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

const HIGHLIGHT_COLORS = [
  { label: "Yellow", value: "#FFEB3B" },
  { label: "Green", value: "#81C784" },
  { label: "Blue", value: "#64B5F6" },
  { label: "Pink", value: "#F48FB1" },
];

// ============================================================
// PDF.js helper (singleton)
// ============================================================

let pdfJsModule: any = null;

async function getPdfjs() {
  if (pdfJsModule) return pdfJsModule;
  pdfJsModule = await import("pdfjs-dist");
  pdfJsModule.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfJsModule;
}

// ============================================================
// Coordinate helpers
// ============================================================

function canvasToPdf(
  cx: number,
  cy: number,
  scale: number,
  pageHeight: number
): { x: number; y: number } {
  return {
    x: cx / scale,
    y: pageHeight - cy / scale,
  };
}

function pdfToCanvas(
  px: number,
  py: number,
  scale: number,
  pageHeight: number
): { x: number; y: number } {
  return {
    x: px * scale,
    y: (pageHeight - py) * scale,
  };
}

// ============================================================
// Hex color helpers
// ============================================================

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace("#", "");
  return {
    r: parseInt(cleaned.substring(0, 2), 16) / 255,
    g: parseInt(cleaned.substring(2, 4), 16) / 255,
    b: parseInt(cleaned.substring(4, 6), 16) / 255,
  };
}

// ============================================================
// Text Extraction
// ============================================================

async function extractTextFromPage(pdfDoc: any, pageIndex: number): Promise<TextItem[]> {
  const page = await pdfDoc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent();

  return textContent.items
    .filter((item: any) => "str" in item && item.str.trim().length > 0)
    .map((item: any) => {
      const tx = item.transform[4];
      const ty = item.transform[5];
      const fontSize = Math.sqrt(
        item.transform[0] * item.transform[0] +
        item.transform[1] * item.transform[1]
      );
      return {
        str: item.str,
        x: tx,
        y: ty,
        width: item.width || 0,
        height: item.height || fontSize * 1.2,
        fontSize,
        pageHeight: viewport.height,
      };
    });
}

// ============================================================
// TextEditingToolbar component
// ============================================================

function TextEditingToolbar({
  textItem,
  onEdit,
  onDelete,
  screenPosition,
}: {
  textItem: TextItem;
  onEdit: () => void;
  onDelete: () => void;
  screenPosition: { x: number; y: number; width: number };
}) {
  const previewStr = textItem.str.length > 30 ? textItem.str.slice(0, 30) + "..." : textItem.str;

  return (
    <div
      className="absolute z-50 flex items-center gap-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg shadow-lg px-2 py-1.5"
      style={{
        left: Math.max(0, screenPosition.x + screenPosition.width / 2 - 90),
        top: Math.max(0, screenPosition.y - 44),
      }}
    >
      <span className="text-[10px] text-muted-foreground truncate max-w-[100px]" title={textItem.str}>
        &ldquo;{previewStr}&rdquo;
      </span>
      <Separator orientation="vertical" className="h-4 mx-1" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="h-6 w-6 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            <Pencil className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Edit Text</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Trash2 className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete Text</TooltipContent>
      </Tooltip>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function EditPdfEditor() {
  const { navigateHome } = useAppStore();
  const { toast } = useToast();

  // ---- state ----
  const [step, setStep] = useState<"upload" | "editor">("upload");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // PDF document state
  const pdfDocRef = useRef<any>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  // Page dimensions (in PDF points, at scale=1)
  const pageDimensionsRef = useRef<{ width: number; height: number }>({
    width: 612,
    height: 792,
  });

  // Zoom
  const [zoomIndex, setZoomIndex] = useState(2); // 1x
  const zoom = ZOOM_LEVELS[zoomIndex];

  // Tool
  const [activeTool, setActiveTool] = useState<EditorTool>("select");

  // Tool properties
  const [textFontSize, setTextFontSize] = useState(16);
  const [textColor, setTextColor] = useState("#000000");
  const [textBold, setTextBold] = useState(false);
  const [, setWhiteoutSize] = useState(20);
  const [highlightColor, setHighlightColor] = useState("#FFEB3B");
  const [highlightOpacity, setHighlightOpacity] = useState(40);
  const [drawColor, setDrawColor] = useState("#000000");
  const [drawSize, setDrawSize] = useState(3);
  const [rectFillColor, setRectFillColor] = useState("#3B82F6");
  const [rectBorderColor, setRectBorderColor] = useState("#1E40AF");
  const [rectBorderWidth, setRectBorderWidth] = useState(2);
  const [rectOpacity, setRectOpacity] = useState(100);
  const [imageOpacity, setImageOpacity] = useState(100);

  // Annotations
  const annotationsRef = useRef<Record<number, Annotation[]>>({});
  const [, forceUpdate] = useState(0);

  // Undo/Redo history
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);

  // Image to place
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingImageDims, setPendingImageDims] = useState<{
    w: number;
    h: number;
  } | null>(null);

  // Text input overlay
  const [textInputPos, setTextInputPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [textInputValue, setTextInputValue] = useState("");
  const textInputRef = useRef<HTMLInputElement>(null);

  // Drawing state
  const isDrawingRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const drawPointsRef = useRef<{ x: number; y: number }[]>([]);
  const lastDrawEndRef = useRef<{ x: number; y: number } | null>(null);

  // Canvas refs
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Page thumbnails
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  // ---- Text selection state ----
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [selectedTextIndex, setSelectedTextIndex] = useState<number | null>(null);
  const [editingTextIndex, setEditingTextIndex] = useState<number | null>(null);
  const [editTextValue, setEditTextValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const textItemsCacheRef = useRef<Record<number, TextItem[]>>({});

  // ============================================================
  // Load PDF
  // ============================================================

  const loadPdf = useCallback(
    async (file: File) => {
      setIsLoading(true);
      try {
        const pdfjs = await getPdfjs();
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setCurrentPageIndex(0);

        // Reset annotations and history
        annotationsRef.current = {};
        historyRef.current = [];
        historyIndexRef.current = -1;
        textItemsCacheRef.current = {};

        // Generate thumbnails
        const thumbs: string[] = [];
        for (let i = 0; i < pdf.numPages; i++) {
          const page = await pdf.getPage(i + 1);
          const vp = page.getViewport({ scale: 0.3 });
          const c = document.createElement("canvas");
          c.width = vp.width;
          c.height = vp.height;
          const ctx = c.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          thumbs.push(c.toDataURL("image/jpeg", 0.6));
        }
        setThumbnails(thumbs);

        // Extract text for first page
        const items = await extractTextFromPage(pdf, 0);
        textItemsCacheRef.current[0] = items;
        setTextItems(items);

        setPdfFile(file);
        setStep("editor");
      } catch {
        toast({
          title: "Error",
          description: "Failed to load the PDF file.",
          variant: "destructive",
        });
      }
      setIsLoading(false);
    },
    [toast]
  );

  // ============================================================
  // Extract text for current page (when page changes)
  // ============================================================

  useEffect(() => {
    if (step !== "editor" || !pdfDocRef.current) return;
    const pgIdx = currentPageIndex;

    // Check cache
    if (textItemsCacheRef.current[pgIdx]) {
      setTextItems(textItemsCacheRef.current[pgIdx]);
      return;
    }

    let cancelled = false;
    extractTextFromPage(pdfDocRef.current, pgIdx).then((items) => {
      if (cancelled) return;
      textItemsCacheRef.current[pgIdx] = items;
      setTextItems(items);
    });

    return () => {
      cancelled = true;
    };
  }, [currentPageIndex, step]);

  // Clear text selection when tool changes away from select
  useEffect(() => {
    if (activeTool !== "select") {
      setSelectedTextIndex(null);
      setEditingTextIndex(null);
      setEditTextValue("");
    }
  }, [activeTool]);

  // ============================================================
  // Draw annotations overlay
  // ============================================================

  const drawAnnotations = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;

    const ctx = overlay.getContext("2d")!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const { height: pageH } = pageDimensionsRef.current;
    const scale = zoom;
    const pageAnnotations = annotationsRef.current[currentPageIndex] || [];

    for (const ann of pageAnnotations) {
      switch (ann.type) {
        case "text": {
          const { x: cx, y: cy } = pdfToCanvas(ann.x, ann.y, scale, pageH);
          const size = (ann.fontSize || 16) * scale;
          ctx.font = `${ann.bold ? "bold " : ""}${size}px sans-serif`;
          ctx.fillStyle = ann.fontColor || "#000000";
          ctx.textBaseline = "top";
          ctx.fillText(ann.text || "", cx, cy);
          break;
        }
        case "whiteout": {
          const { x: cx, y: cy } = pdfToCanvas(ann.x, ann.y, scale, pageH);
          const w = ann.width * scale;
          const h = ann.height * scale;
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(cx, cy - h, w, h);
          break;
        }
        case "textReplace": {
          // Render as whiteout + new text
          const origW = ann.originalWidth || ann.width;
          const origH = ann.originalHeight || ann.height;
          const { x: cx, y: cy } = pdfToCanvas(ann.x, ann.y, scale, pageH);
          const w = origW * scale;
          const h = origH * scale;
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(cx, cy - h, w, h);
          // Draw new text if present
          if (ann.newStr && ann.newStr.trim()) {
            const size = (ann.fontSize || 12) * scale;
            ctx.font = `${ann.bold ? "bold " : ""}${size}px sans-serif`;
            ctx.fillStyle = ann.fontColor || "#000000";
            ctx.textBaseline = "top";
            ctx.fillText(ann.newStr, cx, cy - h + (h - size) / 2);
          }
          break;
        }
        case "highlight": {
          const { x: cx, y: cy } = pdfToCanvas(ann.x, ann.y, scale, pageH);
          const w = ann.width * scale;
          const h = ann.height * scale;
          ctx.globalAlpha = (ann.opacity || 40) / 100;
          ctx.fillStyle = ann.color || "#FFEB3B";
          ctx.fillRect(cx, cy - h, w, h);
          ctx.globalAlpha = 1;
          break;
        }
        case "rectangle": {
          const { x: cx, y: cy } = pdfToCanvas(ann.x, ann.y, scale, pageH);
          const w = ann.width * scale;
          const h = ann.height * scale;
          ctx.globalAlpha = (ann.opacity || 100) / 100;
          if (ann.color && ann.color !== "transparent") {
            ctx.fillStyle = ann.color;
            ctx.fillRect(cx, cy - h, w, h);
          }
          if (ann.borderWidth && ann.borderWidth > 0) {
            ctx.strokeStyle = ann.borderColor || "#000000";
            ctx.lineWidth = ann.borderWidth * scale;
            ctx.strokeRect(cx, cy - h, w, h);
          }
          ctx.globalAlpha = 1;
          break;
        }
        case "draw": {
          if (!ann.points || ann.points.length < 2) break;
          const opacity = ann.opacity !== undefined ? ann.opacity / 100 : 1;
          ctx.globalAlpha = opacity;
          ctx.strokeStyle = ann.color || "#000000";
          ctx.lineWidth = (ann.borderWidth || 2) * scale;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          const first = pdfToCanvas(ann.points[0].x, ann.points[0].y, scale, pageH);
          ctx.moveTo(first.x, first.y);
          for (let i = 1; i < ann.points.length; i++) {
            const p = pdfToCanvas(ann.points[i].x, ann.points[i].y, scale, pageH);
            ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case "image": {
          if (!ann.imageData) break;
          const { x: cx, y: cy } = pdfToCanvas(ann.x, ann.y, scale, pageH);
          const w = ann.width * scale;
          const h = ann.height * scale;
          const img = new window.Image();
          img.onload = () => {
            ctx.globalAlpha = (ann.opacity || 100) / 100;
            ctx.drawImage(img, cx, cy - h, w, h);
            ctx.globalAlpha = 1;
          };
          img.src = ann.imageData;
          break;
        }
      }
    }
  }, [currentPageIndex, zoom]);

  // ============================================================
  // Render PDF page
  // ============================================================

  const renderPdfPage = useCallback(
    async (pageIndex: number, scale: number) => {
      const pdf = pdfDocRef.current;
      if (!pdf) return;

      const page = await pdf.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 1 });
      pageDimensionsRef.current = {
        width: viewport.width,
        height: viewport.height,
      };

      const scaledViewport = page.getViewport({ scale });
      const canvas = pdfCanvasRef.current;
      if (!canvas) return;

      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      const ctx = canvas.getContext("2d")!;
      await page.render({
        canvasContext: ctx,
        viewport: scaledViewport,
      }).promise;

      // Also size the overlay canvas
      const overlay = overlayCanvasRef.current;
      if (overlay) {
        overlay.width = scaledViewport.width;
        overlay.height = scaledViewport.height;
      }

      // Redraw annotations overlay
      drawAnnotations();
    },
    [zoom, drawAnnotations]
  );

  // ============================================================
  // Effect: render when page or zoom changes
  // ============================================================

  useEffect(() => {
    if (step === "editor" && pdfDocRef.current) {
      renderPdfPage(currentPageIndex, zoom);
    }
  }, [currentPageIndex, zoom, step, renderPdfPage]);

  // ============================================================
  // History helpers
  // ============================================================

  const saveHistory = useCallback(() => {
    const snapshot = JSON.stringify(annotationsRef.current);
    // Remove any redo states
    historyRef.current = historyRef.current.slice(
      0,
      historyIndexRef.current + 1
    );
    historyRef.current.push(snapshot);
    historyIndexRef.current = historyRef.current.length - 1;
    // Limit history
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
      historyIndexRef.current--;
    }
    forceUpdate((v) => v + 1);
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    annotationsRef.current = JSON.parse(
      historyRef.current[historyIndexRef.current]
    );
    drawAnnotations();
    forceUpdate((v) => v + 1);
  }, [drawAnnotations]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    annotationsRef.current = JSON.parse(
      historyRef.current[historyIndexRef.current]
    );
    drawAnnotations();
    forceUpdate((v) => v + 1);
  }, [drawAnnotations]);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  // ============================================================
  // Add annotation
  // ============================================================

  const addAnnotation = useCallback(
    (ann: Annotation) => {
      if (!annotationsRef.current[ann.pageIndex]) {
        annotationsRef.current[ann.pageIndex] = [];
      }
      annotationsRef.current[ann.pageIndex].push(ann);
      saveHistory();
      drawAnnotations();
    },
    [saveHistory, drawAnnotations]
  );

  // ============================================================
  // Text editing: start, confirm, cancel, delete
  // ============================================================

  const startTextEdit = useCallback(
    (index: number) => {
      setSelectedTextIndex(index);
      setEditingTextIndex(index);
      setEditTextValue(textItems[index].str);
      setTimeout(() => editInputRef.current?.focus(), 50);
    },
    [textItems]
  );

  const confirmTextEdit = useCallback(
    (index: number) => {
      const item = textItems[index];
      if (!item) {
        setEditingTextIndex(null);
        setSelectedTextIndex(null);
        return;
      }

      const newValue = editTextValue.trim();
      const originalValue = item.str.trim();

      if (newValue === originalValue) {
        // No change
        setEditingTextIndex(null);
        setSelectedTextIndex(null);
        return;
      }

      // Create textReplace annotation
      // In PDF coordinates: item.x, item.y are bottom-left origin
      addAnnotation({
        id: crypto.randomUUID(),
        type: "textReplace",
        pageIndex: currentPageIndex,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        originalStr: item.str,
        newStr: newValue,
        originalX: item.x,
        originalY: item.y,
        originalWidth: item.width,
        originalHeight: item.height,
        fontSize: item.fontSize,
        fontColor: "#000000",
        bold: false,
      });

      // Remove this text item from the overlay
      const updatedItems = [...textItems];
      updatedItems.splice(index, 1);
      textItemsCacheRef.current[currentPageIndex] = updatedItems;
      setTextItems(updatedItems);

      setEditingTextIndex(null);
      setSelectedTextIndex(null);
      setEditTextValue("");

      toast({
        title: "Text replaced",
        description: newValue ? `"${originalValue}" → "${newValue}"` : `Text deleted`,
      });
    },
    [textItems, editTextValue, currentPageIndex, addAnnotation, toast]
  );

  const cancelTextEdit = useCallback(() => {
    setEditingTextIndex(null);
    setSelectedTextIndex(null);
    setEditTextValue("");
  }, []);

  const deleteSelectedText = useCallback(() => {
    if (selectedTextIndex === null) return;
    const item = textItems[selectedTextIndex];
    if (!item) return;

    // Create whiteout annotation
    addAnnotation({
      id: crypto.randomUUID(),
      type: "whiteout",
      pageIndex: currentPageIndex,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    });

    // Remove from overlay
    const updatedItems = [...textItems];
    updatedItems.splice(selectedTextIndex, 1);
    textItemsCacheRef.current[currentPageIndex] = updatedItems;
    setTextItems(updatedItems);

    setSelectedTextIndex(null);
    toast({ title: "Text deleted" });
  }, [selectedTextIndex, textItems, currentPageIndex, addAnnotation, toast]);

  // ============================================================
  // Canvas pointer events
  // ============================================================

  const getCanvasPos = useCallback(
    (e: React.MouseEvent | React.PointerEvent): { x: number; y: number } => {
      const canvas = overlayCanvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!overlayCanvasRef.current) return;
      const pos = getCanvasPos(e);
      const { height: pageH } = pageDimensionsRef.current;
      const scale = zoom;

      if (activeTool === "select") {
        // Deselect if clicking on empty space (handled by text layer)
        return;
      }

      if (activeTool === "eraser") {
        // Hit test: find annotation at this position
        const pdfPos = canvasToPdf(pos.x, pos.y, scale, pageH);
        const anns = annotationsRef.current[currentPageIndex] || [];
        for (let i = anns.length - 1; i >= 0; i--) {
          const a = anns[i];
          const ax = a.x;
          const ay = a.y - a.height;
          if (
            pdfPos.x >= ax &&
            pdfPos.x <= ax + a.width &&
            pdfPos.y >= ay &&
            pdfPos.y <= ay + a.height
          ) {
            anns.splice(i, 1);
            saveHistory();
            drawAnnotations();
            toast({ title: "Annotation deleted" });
            return;
          }
        }
        // Also try for draw paths (bounding box)
        for (let i = anns.length - 1; i >= 0; i--) {
          const a = anns[i];
          if (a.type === "draw" && a.points && a.points.length > 0) {
            const xs = a.points.map((p) => p.x);
            const ys = a.points.map((p) => p.y);
            const minX = Math.min(...xs) - 5;
            const maxX = Math.max(...xs) + 5;
            const minY = Math.min(...ys) - 5;
            const maxY = Math.max(...ys) + 5;
            if (
              pdfPos.x >= minX &&
              pdfPos.x <= maxX &&
              pdfPos.y >= minY &&
              pdfPos.y <= maxY
            ) {
              anns.splice(i, 1);
              saveHistory();
              drawAnnotations();
              toast({ title: "Drawing deleted" });
              return;
            }
          }
        }
        return;
      }

      if (activeTool === "text") {
        const pdfPos = canvasToPdf(pos.x, pos.y, scale, pageH);
        setTextInputPos({ x: pdfPos.x, y: pdfPos.y });
        setTextInputValue("");
        setTimeout(() => textInputRef.current?.focus(), 50);
        return;
      }

      if (activeTool === "image") {
        if (!pendingImage) {
          // Trigger file input
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.onchange = (ev) => {
            const f = (ev.target as HTMLInputElement).files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              const img = new window.Image();
              img.onload = () => {
                setPendingImage(dataUrl);
                setPendingImageDims({ w: img.width, h: img.height });
                toast({
                  title: "Image loaded",
                  description: "Click on the PDF to place the image.",
                });
              };
              img.src = dataUrl;
            };
            reader.readAsDataURL(f);
          };
          input.click();
          return;
        }
        // Place the image
        const pdfPos = canvasToPdf(pos.x, pos.y, scale, pageH);
        // Scale image to max 200pt wide, preserving aspect ratio
        const maxW = 200;
        let imgW = pendingImageDims?.w || 100;
        let imgH = pendingImageDims?.h || 100;
        if (imgW > maxW) {
          const ratio = maxW / imgW;
          imgW = maxW;
          imgH *= ratio;
        }
        // Convert pixel dims to PDF points (assuming 96 DPI)
        const pdfW = imgW * 72 / 96;
        const pdfH = imgH * 72 / 96;

        addAnnotation({
          id: crypto.randomUUID(),
          type: "image",
          pageIndex: currentPageIndex,
          x: pdfPos.x,
          y: pdfPos.y,
          width: pdfW,
          height: pdfH,
          imageData: pendingImage,
          opacity: imageOpacity,
        });
        setPendingImage(null);
        setPendingImageDims(null);
        return;
      }

      // Start drawing for whiteout, highlight, rectangle, draw
      isDrawingRef.current = true;
      drawStartRef.current = { x: pos.x, y: pos.y };

      if (activeTool === "draw") {
        drawPointsRef.current = [];
        const pdfPos = canvasToPdf(pos.x, pos.y, scale, pageH);
        drawPointsRef.current.push(pdfPos);
      }
    },
    [
      activeTool,
      zoom,
      currentPageIndex,
      pendingImage,
      pendingImageDims,
      imageOpacity,
      getCanvasPos,
      saveHistory,
      drawAnnotations,
      addAnnotation,
      toast,
    ]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawingRef.current || !drawStartRef.current) return;
      const pos = getCanvasPos(e);
      const overlay = overlayCanvasRef.current;
      if (!overlay) return;
      const ctx = overlay.getContext("2d")!;
      const { height: pageH } = pageDimensionsRef.current;
      const scale = zoom;
      const start = drawStartRef.current;

      // Redraw base annotations first, then the current shape preview
      drawAnnotations();

      if (activeTool === "draw") {
        const pdfPos = canvasToPdf(pos.x, pos.y, scale, pageH);
        drawPointsRef.current.push(pdfPos);

        // Draw current path preview
        ctx.strokeStyle = drawColor;
        ctx.lineWidth = drawSize * scale;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        const first = pdfToCanvas(
          drawPointsRef.current[0].x,
          drawPointsRef.current[0].y,
          scale,
          pageH
        );
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < drawPointsRef.current.length; i++) {
          const p = pdfToCanvas(
            drawPointsRef.current[i].x,
            drawPointsRef.current[i].y,
            scale,
            pageH
          );
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        return;
      }

      // Shape drawing: whiteout, highlight, rectangle
      const x1 = Math.min(start.x, pos.x);
      const y1 = Math.min(start.y, pos.y);
      const w = Math.abs(pos.x - start.x);
      const h = Math.abs(pos.y - start.y);

      if (activeTool === "whiteout") {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(x1, y1, w, h);
      } else if (activeTool === "highlight") {
        ctx.globalAlpha = highlightOpacity / 100;
        ctx.fillStyle = highlightColor;
        ctx.fillRect(x1, y1, w, h);
        ctx.globalAlpha = 1;
      } else if (activeTool === "rectangle") {
        ctx.globalAlpha = rectOpacity / 100;
        ctx.fillStyle = rectFillColor;
        ctx.fillRect(x1, y1, w, h);
        if (rectBorderWidth > 0) {
          ctx.strokeStyle = rectBorderColor;
          ctx.lineWidth = rectBorderWidth;
          ctx.strokeRect(x1, y1, w, h);
        }
        ctx.globalAlpha = 1;
      }
    },
    [
      activeTool,
      zoom,
      drawColor,
      drawSize,
      highlightColor,
      highlightOpacity,
      rectFillColor,
      rectBorderColor,
      rectBorderWidth,
      rectOpacity,
      getCanvasPos,
      drawAnnotations,
    ]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawingRef.current || !drawStartRef.current) return;
    isDrawingRef.current = false;

    const overlay = overlayCanvasRef.current;
    if (!overlay) return;

    const { height: pageH } = pageDimensionsRef.current;
    const scale = zoom;
    const start = drawStartRef.current;

    if (activeTool === "draw") {
      if (drawPointsRef.current.length > 1) {
        addAnnotation({
          id: crypto.randomUUID(),
          type: "draw",
          pageIndex: currentPageIndex,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          points: [...drawPointsRef.current],
          color: drawColor,
          borderWidth: drawSize,
          opacity: 100,
        });
      }
      drawPointsRef.current = [];
      drawStartRef.current = null;
      drawAnnotations();
      return;
    }

    // Get the actual end position from the last drawn rectangle
    const endX = lastDrawEndRef.current?.x ?? start.x;
    const endY = lastDrawEndRef.current?.y ?? start.y;

    const x1 = Math.min(start.x, endX);
    const y1 = Math.min(start.y, endY);
    const w = Math.abs(endX - start.x);
    const h = Math.abs(endY - start.y);

    if (w < 3 && h < 3) {
      drawStartRef.current = null;
      drawAnnotations();
      return;
    }

    // Convert to PDF coordinates
    const topLeftPdf = canvasToPdf(x1, y1 + h, scale, pageH);
    const pdfW = w / scale;
    const pdfH = h / scale;

    if (activeTool === "whiteout") {
      addAnnotation({
        id: crypto.randomUUID(),
        type: "whiteout",
        pageIndex: currentPageIndex,
        x: topLeftPdf.x,
        y: topLeftPdf.y,
        width: pdfW,
        height: pdfH,
      });
    } else if (activeTool === "highlight") {
      addAnnotation({
        id: crypto.randomUUID(),
        type: "highlight",
        pageIndex: currentPageIndex,
        x: topLeftPdf.x,
        y: topLeftPdf.y,
        width: pdfW,
        height: pdfH,
        color: highlightColor,
        opacity: highlightOpacity,
      });
    } else if (activeTool === "rectangle") {
      addAnnotation({
        id: crypto.randomUUID(),
        type: "rectangle",
        pageIndex: currentPageIndex,
        x: topLeftPdf.x,
        y: topLeftPdf.y,
        width: pdfW,
        height: pdfH,
        color: rectFillColor,
        borderColor: rectBorderColor,
        borderWidth: rectBorderWidth,
        opacity: rectOpacity,
      });
    }

    drawStartRef.current = null;
    drawAnnotations();
  }, [
    activeTool,
    zoom,
    currentPageIndex,
    drawColor,
    drawSize,
    highlightColor,
    highlightOpacity,
    rectFillColor,
    rectBorderColor,
    rectBorderWidth,
    rectOpacity,
    addAnnotation,
    drawAnnotations,
  ]);

  // Override handlePointerMove to also track end position
  const handlePointerMoveFull = useCallback(
    (e: React.PointerEvent) => {
      const pos = getCanvasPos(e);
      lastDrawEndRef.current = pos;
      handlePointerMove(e);
    },
    [getCanvasPos, handlePointerMove]
  );

  // ============================================================
  // Submit text annotation
  // ============================================================

  const submitText = useCallback(() => {
    if (!textInputPos || !textInputValue.trim()) {
      setTextInputPos(null);
      return;
    }
    addAnnotation({
      id: crypto.randomUUID(),
      type: "text",
      pageIndex: currentPageIndex,
      x: textInputPos.x,
      y: textInputPos.y,
      width: 0,
      height: 0,
      text: textInputValue.trim(),
      fontSize: textFontSize,
      fontColor: textColor,
      bold: textBold,
    });
    setTextInputPos(null);
    setTextInputValue("");
  }, [
    textInputPos,
    textInputValue,
    currentPageIndex,
    textFontSize,
    textColor,
    textBold,
    addAnnotation,
  ]);

  // ============================================================
  // Apply Edits — generate final PDF with pdf-lib
  // ============================================================

  const applyEdits = useCallback(async () => {
    if (!pdfFile) return;
    try {
      const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(
        StandardFonts.HelveticaBold
      );

      // Helper to convert hex to pdf-lib rgb Color
      const toColor = (hex: string) => {
        const c = hexToRgb(hex);
        return rgb(c.r, c.g, c.b);
      };

      const allAnnotations = annotationsRef.current;
      const totalPagesCount = pdfDoc.getPageCount();

      for (let pgIdx = 0; pgIdx < totalPagesCount; pgIdx++) {
        const pageAnnotations = allAnnotations[pgIdx];
        if (!pageAnnotations || pageAnnotations.length === 0) continue;

        const page = pdfDoc.getPage(pgIdx);
        const { height: pageH } = page.getSize();

        for (const ann of pageAnnotations) {
          switch (ann.type) {
            case "text": {
              const font = ann.bold ? helveticaBold : helveticaFont;
              const fontSize = ann.fontSize || 16;
              page.drawText(ann.text || "", {
                x: ann.x,
                y: ann.y - fontSize,
                size: fontSize,
                font,
                color: toColor(ann.fontColor || "#000000"),
              });
              break;
            }
            case "whiteout": {
              page.drawRectangle({
                x: ann.x,
                y: ann.y - ann.height,
                width: ann.width,
                height: ann.height,
                color: rgb(1, 1, 1),
              });
              break;
            }
            case "textReplace": {
              // White out original text
              const rw = ann.originalWidth || ann.width;
              const rh = ann.originalHeight || ann.height;
              page.drawRectangle({
                x: ann.x,
                y: ann.y - rh,
                width: rw,
                height: rh,
                color: rgb(1, 1, 1),
              });
              // Draw new text if not empty
              if (ann.newStr && ann.newStr.trim()) {
                const font = ann.bold ? helveticaBold : helveticaFont;
                page.drawText(ann.newStr, {
                  x: ann.x,
                  y: ann.y - (ann.fontSize || 12),
                  size: ann.fontSize || 12,
                  font,
                  color: toColor(ann.fontColor || "#000000"),
                });
              }
              break;
            }
            case "highlight": {
              page.drawRectangle({
                x: ann.x,
                y: ann.y - ann.height,
                width: ann.width,
                height: ann.height,
                color: toColor(ann.color || "#FFEB3B"),
                opacity: (ann.opacity || 40) / 100,
              });
              break;
            }
            case "rectangle": {
              page.drawRectangle({
                x: ann.x,
                y: ann.y - ann.height,
                width: ann.width,
                height: ann.height,
                color: ann.color && ann.color !== "transparent"
                  ? toColor(ann.color)
                  : undefined,
                borderColor:
                  ann.borderWidth && ann.borderWidth > 0
                    ? toColor(ann.borderColor || "#000000")
                    : undefined,
                borderWidth: ann.borderWidth || 0,
                opacity: (ann.opacity || 100) / 100,
              });
              break;
            }
            case "draw": {
              if (!ann.points || ann.points.length < 2) break;
              const drawColorVal = toColor(ann.color || "#000000");
              const lw = ann.borderWidth || 2;
              const op =
                ann.opacity !== undefined ? ann.opacity / 100 : 1;
              for (let i = 0; i < ann.points.length - 1; i++) {
                page.drawLine({
                  start: { x: ann.points[i].x, y: ann.points[i].y },
                  end: {
                    x: ann.points[i + 1].x,
                    y: ann.points[i + 1].y,
                  },
                  color: drawColorVal,
                  thickness: lw,
                  opacity: op,
                });
              }
              break;
            }
            case "image": {
              if (!ann.imageData) break;
              try {
                const base64Data = ann.imageData.split(",")[1];
                const imageBytes = Uint8Array.from(atob(base64Data), (c) =>
                  c.charCodeAt(0)
                );
                let embeddedImage;
                if (ann.imageData.includes("image/png")) {
                  embeddedImage = await pdfDoc.embedPng(imageBytes);
                } else {
                  embeddedImage = await pdfDoc.embedJpg(imageBytes);
                }
                const imgOpacity = (ann.opacity || 100) / 100;
                page.drawImage(embeddedImage, {
                  x: ann.x,
                  y: ann.y - ann.height,
                  width: ann.width,
                  height: ann.height,
                  opacity: imgOpacity,
                });
              } catch {
                console.warn("Failed to embed image annotation");
              }
              break;
            }
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const originalName = pdfFile.name.replace(/\.pdf$/i, "");
      a.download = `${originalName}_edited.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "PDF Downloaded!",
        description: "Your edited PDF has been saved.",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to apply edits to the PDF.",
        variant: "destructive",
      });
      console.error(err);
    }
  }, [pdfFile, toast]);

  // ============================================================
  // Upload handlers
  // ============================================================

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type === "application/pdf") {
        if (file.size > 50 * 1024 * 1024) {
          toast({
            title: "File too large",
            description: "Maximum file size is 50MB",
            variant: "destructive",
          });
          return;
        }
        loadPdf(file);
      }
    },
    [loadPdf, toast]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) loadPdf(file);
    },
    [loadPdf]
  );

  // ============================================================
  // Keyboard shortcuts
  // ============================================================

  useEffect(() => {
    if (step !== "editor") return;

    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in text input or editing text
      if (textInputPos || editingTextIndex !== null) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
        return;
      }
      const toolMap: Record<string, EditorTool> = {
        v: "select",
        t: "text",
        d: "draw",
        h: "highlight",
        w: "whiteout",
        r: "rectangle",
        i: "image",
        e: "eraser",
      };
      const tool = toolMap[e.key.toLowerCase()];
      if (tool) setActiveTool(tool);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step, textInputPos, editingTextIndex, undo, redo]);

  // ============================================================
  // Compute annotation counts
  // ============================================================

  const totalAnnotations = useMemo(() => {
    void forceUpdate;
    return Object.values(annotationsRef.current).reduce(
      (sum, anns) => sum + anns.length,
      0
    );
  }, [forceUpdate]);

  // ============================================================
  // Cursor style based on tool
  // ============================================================

  const cursorStyle = useMemo(() => {
    switch (activeTool) {
      case "select":
        return "default";
      case "text":
        return "text";
      case "draw":
        return "crosshair";
      case "eraser":
        return "pointer";
      case "image":
        return pendingImage ? "copy" : "pointer";
      default:
        return "crosshair";
    }
  }, [activeTool, pendingImage]);

  // ============================================================
  // RENDER: Upload Step
  // ============================================================

  const renderUpload = () => (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-fuchsia-900 flex flex-col">
      {/* Back button */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="absolute top-4 left-4 sm:top-6 sm:left-6 z-10"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={navigateHome}
          className="text-white/70 hover:text-white hover:bg-white/10"
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">All Tools</span>
        </Button>
      </motion.div>

      <div className="flex-1 flex items-center justify-center px-4">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
          }}
          className="text-center max-w-lg w-full"
        >
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 30 },
              visible: { opacity: 1, y: 0, transition: { delay: 0.1 } },
            }}
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-fuchsia-500/20 mb-6">
              <FileText className="size-10 text-fuchsia-400" />
            </div>
          </motion.div>

          <motion.h1
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { delay: 0.2 } },
            }}
            className="text-3xl sm:text-4xl font-extrabold text-white mb-3"
          >
            Edit{" "}
            <span className="bg-gradient-to-r from-fuchsia-400 to-rose-400 bg-clip-text text-transparent">
              PDF
            </span>
          </motion.h1>

          <motion.p
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { delay: 0.3 } },
            }}
            className="text-slate-300 mb-8 text-sm sm:text-base"
          >
            Add text, images, draw, highlight, whiteout and more — visually on
            your PDF. Click on real PDF text to select and edit it inline.
          </motion.p>

          <motion.div
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { delay: 0.4 } },
            }}
          >
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                relative border-2 border-dashed rounded-2xl p-10 sm:p-14 transition-all cursor-pointer
                ${
                  isDragOver
                    ? "border-fuchsia-400 bg-fuchsia-500/10"
                    : "border-white/20 hover:border-fuchsia-400/50 hover:bg-white/5"
                }
              `}
            >
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileInput}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center gap-3">
                {isLoading ? (
                  <Loader2 className="size-10 text-fuchsia-400 animate-spin" />
                ) : (
                  <Upload className="size-10 text-white/50" />
                )}
                <div>
                  <p className="text-white font-semibold text-base">
                    {isLoading
                      ? "Loading PDF..."
                      : "Drop your PDF here or click to browse"}
                  </p>
                  <p className="text-white/40 text-sm mt-1">
                    PDF files only, max 50MB
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { delay: 0.5 } },
            }}
            className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400"
          >
            {[
              "Select & Edit Text",
              "Add Text & Images",
              "Draw & Highlight",
              "Whiteout Content",
              "100% Client-Side",
            ].map((f) => (
              <div key={f} className="flex items-center gap-1.5">
                <Check className="size-3 text-fuchsia-400" />
                {f}
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );

  // ============================================================
  // RENDER: Editor Step
  // ============================================================

  const renderEditor = () => (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-zinc-900 overflow-hidden">
      {/* ========== TOP TOOLBAR ========== */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-800 border-b shadow-sm z-20">
        {/* Back */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={navigateHome}
              className="h-8 w-8 p-0"
            >
              <ArrowLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>All Tools</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-5" />

        {/* Title */}
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-fuchsia-600 dark:text-fuchsia-400" />
          <span className="font-semibold text-sm hidden sm:inline">
            Edit PDF
          </span>
          <span className="text-xs text-muted-foreground hidden md:inline">
            — {pdfFile?.name}
          </span>
        </div>

        <div className="flex-1" />

        {/* Undo/Redo */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={undo}
                disabled={!canUndo}
                className="h-8 w-8 p-0"
              >
                <Undo2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={redo}
                disabled={!canRedo}
                className="h-8 w-8 p-0"
              >
                <Redo2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-5" />

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setZoomIndex((z) => Math.max(0, z - 1))
                }
                disabled={zoomIndex <= 0}
                className="h-8 w-8 p-0"
              >
                <ZoomOut className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom Out</TooltipContent>
          </Tooltip>
          <span className="text-xs font-medium w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setZoomIndex((z) =>
                    Math.min(ZOOM_LEVELS.length - 1, z + 1)
                  )
                }
                disabled={zoomIndex >= ZOOM_LEVELS.length - 1}
                className="h-8 w-8 p-0"
              >
                <ZoomIn className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-5" />

        {/* Annotations count */}
        {totalAnnotations > 0 && (
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {totalAnnotations} edit{totalAnnotations !== 1 ? "s" : ""}
          </span>
        )}

        {/* Apply button */}
        <Button
          size="sm"
          onClick={applyEdits}
          className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white gap-1.5"
        >
          <Download className="size-4" />
          <span className="hidden sm:inline">Apply Edits</span>
        </Button>
      </div>

      {/* ========== MAIN AREA ========== */}
      <div className="flex-1 flex overflow-hidden">
        {/* ---- LEFT TOOLS PANEL ---- */}
        <div className="hidden md:flex flex-col w-14 bg-white dark:bg-zinc-800 border-r py-2 gap-1 shrink-0">
          {TOOLS.map((tool) => (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    setActiveTool(tool.id);
                    if (tool.id !== "image") {
                      setPendingImage(null);
                    }
                  }}
                  className={`
                    flex flex-col items-center justify-center gap-0.5 py-2 px-1 mx-1 rounded-lg transition-all
                    ${
                      activeTool === tool.id
                        ? "bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300"
                        : "text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-700"
                    }
                  `}
                >
                  {tool.icon}
                  <span className="text-[9px] font-medium leading-none">
                    {tool.label}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {tool.label} ({tool.shortcut})
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Mobile tool bar (bottom, shown on small screens) */}
        <div className="md:hidden fixed bottom-14 left-0 right-0 z-30 bg-white dark:bg-zinc-800 border-t px-2 py-1.5 flex items-center gap-1 overflow-x-auto">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              onClick={() => {
                setActiveTool(tool.id);
                if (tool.id !== "image") {
                  setPendingImage(null);
                }
              }}
              className={`
                flex flex-col items-center justify-center gap-0.5 py-1.5 px-2 rounded-lg transition-all min-w-[48px]
                ${
                  activeTool === tool.id
                    ? "bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300"
                    : "text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-700"
                }
              `}
            >
              {tool.icon}
              <span className="text-[9px] font-medium">{tool.label}</span>
            </button>
          ))}
        </div>

        {/* ---- CENTER CANVAS AREA ---- */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto flex items-start justify-center p-4 md:p-6"
          onClick={() => {
            // Deselect text when clicking empty canvas area (only in select mode)
            if (activeTool === "select") {
              setSelectedTextIndex(null);
              setEditingTextIndex(null);
              setEditTextValue("");
            }
          }}
        >
          <div className="relative shadow-xl">
            {/* PDF Canvas */}
            <canvas ref={pdfCanvasRef} className="block" />

            {/* Overlay Canvas (for drawing annotations) */}
            <canvas
              ref={overlayCanvasRef}
              className="absolute top-0 left-0"
              style={{
                cursor: cursorStyle,
                pointerEvents: activeTool === "select" ? "none" : "auto",
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMoveFull}
              onPointerUp={handlePointerUp}
              onPointerLeave={() => {
                if (isDrawingRef.current) {
                  handlePointerUp();
                }
              }}
            />

            {/* Text Selection Layer (only when select tool is active) */}
            {activeTool === "select" && textItems.length > 0 && (
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ pointerEvents: "none" }}
              >
                {textItems.map((item, index) => {
                  const screenX = item.x * zoom;
                  const screenY = (item.pageHeight - item.y - item.height) * zoom;
                  const screenW = item.width * zoom;
                  const screenH = item.height * zoom;
                  const screenFontSize = item.fontSize * zoom;

                  const isSelected = selectedTextIndex === index;
                  const isEditing = editingTextIndex === index;

                  if (isEditing) {
                    return (
                      <input
                        key={`edit-${index}`}
                        ref={editInputRef}
                        value={editTextValue}
                        onChange={(e) => setEditTextValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            confirmTextEdit(index);
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelTextEdit();
                          }
                        }}
                        onBlur={() => confirmTextEdit(index)}
                        className="absolute bg-white/90 border-2 border-blue-500 outline-none px-0.5 rounded-sm"
                        style={{
                          left: screenX,
                          top: screenY,
                          width: Math.max(screenW + 60, 120),
                          height: screenH,
                          fontSize: screenFontSize,
                          fontFamily: "sans-serif",
                          lineHeight: `${screenH}px`,
                          pointerEvents: "auto",
                          zIndex: 40,
                        }}
                        autoFocus
                      />
                    );
                  }

                  return (
                    <span
                      key={`text-${index}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTextIndex(index);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        startTextEdit(index);
                      }}
                      className={`absolute cursor-text rounded-[2px] transition-all duration-100 ${
                        isSelected
                          ? "bg-blue-200/60 dark:bg-blue-400/40 ring-2 ring-blue-500 ring-inset"
                          : "hover:bg-blue-100/40 dark:hover:bg-blue-400/20"
                      }`}
                      style={{
                        left: screenX,
                        top: screenY,
                        width: screenW,
                        height: screenH,
                        fontSize: screenFontSize,
                        lineHeight: `${screenH}px`,
                        fontFamily: "sans-serif",
                        color: "transparent",
                        pointerEvents: "auto",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        willChange: "transform",
                      }}
                      title={item.str}
                    >
                      {item.str}
                    </span>
                  );
                })}

                {/* Floating toolbar for selected text */}
                {selectedTextIndex !== null &&
                  editingTextIndex === null &&
                  textItems[selectedTextIndex] && (
                    <TextEditingToolbar
                      textItem={textItems[selectedTextIndex]}
                      onEdit={() => startTextEdit(selectedTextIndex)}
                      onDelete={deleteSelectedText}
                      screenPosition={{
                        x: textItems[selectedTextIndex].x * zoom,
                        y:
                          (textItems[selectedTextIndex].pageHeight -
                            textItems[selectedTextIndex].y -
                            textItems[selectedTextIndex].height) *
                          zoom,
                        width: textItems[selectedTextIndex].width * zoom,
                      }}
                    />
                  )}
              </div>
            )}

            {/* Text input overlay */}
            <AnimatePresence>
              {textInputPos && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute"
                  style={{
                    left: textInputPos.x * zoom,
                    top: (pageDimensionsRef.current.height - textInputPos.y) * zoom,
                  }}
                >
                  <div className="flex items-center gap-1 bg-white rounded-md shadow-lg border border-gray-200 p-1">
                    <Input
                      ref={textInputRef}
                      value={textInputValue}
                      onChange={(e) => setTextInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitText();
                        if (e.key === "Escape") {
                          setTextInputPos(null);
                          setTextInputValue("");
                        }
                      }}
                      placeholder="Type text..."
                      className="h-8 text-sm w-48"
                      style={{
                        fontSize: `${textFontSize * zoom * 0.7}px`,
                        color: textColor,
                        fontWeight: textBold ? "bold" : "normal",
                      }}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={submitText}
                      className="h-8 w-8 p-0 bg-fuchsia-600 hover:bg-fuchsia-700 text-white"
                    >
                      <Check className="size-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setTextInputPos(null);
                        setTextInputValue("");
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ---- RIGHT PROPERTIES PANEL ---- */}
        <div className="hidden lg:flex flex-col w-56 bg-white dark:bg-zinc-800 border-l p-3 gap-4 overflow-y-auto shrink-0">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Properties
          </div>

          {/* Select tool properties */}
          {activeTool === "select" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs">
                <MousePointer2 className="size-4 text-fuchsia-600 dark:text-fuchsia-400" />
                <span className="font-medium">Text Selection</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Click on any text in the PDF to select it. Double-click to edit
                it inline. You can replace text or delete it entirely.
              </p>
              <div className="border rounded-md p-2 bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
                <p className="text-[10px] text-blue-700 dark:text-blue-300 font-medium mb-1">
                  How it works
                </p>
                <ul className="text-[10px] text-blue-600 dark:text-blue-400 space-y-0.5">
                  <li>&bull; Click text to select</li>
                  <li>&bull; Double-click to edit inline</li>
                  <li>&bull; Use toolbar to edit or delete</li>
                  <li>&bull; Press Enter to confirm, Esc to cancel</li>
                </ul>
              </div>
              {textItems.length > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {textItems.length} text item{textItems.length !== 1 ? "s" : ""} detected on this page
                </p>
              )}
            </div>
          )}

          {/* Text properties */}
          {activeTool === "text" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Font Size</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={[textFontSize]}
                    onValueChange={([v]) => setTextFontSize(v)}
                    min={6}
                    max={72}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-xs w-8 text-right">
                    {textFontSize}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="w-8 h-8 rounded border cursor-pointer"
                  />
                  <Input
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="h-8 text-xs font-mono"
                    maxLength={7}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={textBold ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTextBold(!textBold)}
                  className={`h-8 w-8 p-0 ${textBold ? "bg-fuchsia-600 hover:bg-fuchsia-700 text-white" : ""}`}
                >
                  <Bold className="size-4" />
                </Button>
                <span className="text-xs">Bold</span>
              </div>
            </div>
          )}

          {/* Whiteout properties */}
          {activeTool === "whiteout" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Click and drag to draw a white rectangle over content you want
                to hide.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Tip</Label>
                <p className="text-[11px] text-muted-foreground">
                  The whiteout will be opaque white, covering any content
                  underneath.
                </p>
              </div>
            </div>
          )}

          {/* Highlight properties */}
          {activeTool === "highlight" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Color</Label>
                <div className="grid grid-cols-4 gap-2">
                  {HIGHLIGHT_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setHighlightColor(c.value)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        highlightColor === c.value
                          ? "border-fuchsia-500 scale-110"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Opacity: {highlightOpacity}%</Label>
                <Slider
                  value={[highlightOpacity]}
                  onValueChange={([v]) => setHighlightOpacity(v)}
                  min={10}
                  max={80}
                  step={5}
                />
              </div>
            </div>
          )}

          {/* Draw properties */}
          {activeTool === "draw" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={drawColor}
                    onChange={(e) => setDrawColor(e.target.value)}
                    className="w-8 h-8 rounded border cursor-pointer"
                  />
                  <Input
                    value={drawColor}
                    onChange={(e) => setDrawColor(e.target.value)}
                    className="h-8 text-xs font-mono"
                    maxLength={7}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Pen Size: {drawSize}px</Label>
                <Slider
                  value={[drawSize]}
                  onValueChange={([v]) => setDrawSize(v)}
                  min={1}
                  max={8}
                  step={0.5}
                />
              </div>
            </div>
          )}

          {/* Rectangle properties */}
          {activeTool === "rectangle" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Fill Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={rectFillColor}
                    onChange={(e) => setRectFillColor(e.target.value)}
                    className="w-8 h-8 rounded border cursor-pointer"
                  />
                  <Input
                    value={rectFillColor}
                    onChange={(e) => setRectFillColor(e.target.value)}
                    className="h-8 text-xs font-mono"
                    maxLength={7}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Border Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={rectBorderColor}
                    onChange={(e) => setRectBorderColor(e.target.value)}
                    className="w-8 h-8 rounded border cursor-pointer"
                  />
                  <Input
                    value={rectBorderColor}
                    onChange={(e) => setRectBorderColor(e.target.value)}
                    className="h-8 text-xs font-mono"
                    maxLength={7}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  Border Width: {rectBorderWidth}px
                </Label>
                <Slider
                  value={[rectBorderWidth]}
                  onValueChange={([v]) => setRectBorderWidth(v)}
                  min={0}
                  max={10}
                  step={1}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Opacity: {rectOpacity}%</Label>
                <Slider
                  value={[rectOpacity]}
                  onValueChange={([v]) => setRectOpacity(v)}
                  min={0}
                  max={100}
                  step={5}
                />
              </div>
            </div>
          )}

          {/* Image properties */}
          {activeTool === "image" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {pendingImage
                  ? "Click on the PDF to place your image."
                  : "Click the Image tool to select an image file from your device."}
              </p>
              {pendingImage && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Preview</Label>
                    <div className="w-full h-20 rounded border bg-gray-50 dark:bg-zinc-700 flex items-center justify-center overflow-hidden">
                      <img
                        src={pendingImage}
                        alt="Preview"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPendingImage(null);
                      setPendingImageDims(null);
                    }}
                    className="w-full text-xs"
                  >
                    <X className="size-3 mr-1" />
                    Cancel
                  </Button>
                </>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Opacity: {imageOpacity}%</Label>
                <Slider
                  value={[imageOpacity]}
                  onValueChange={([v]) => setImageOpacity(v)}
                  min={10}
                  max={100}
                  step={5}
                />
              </div>
            </div>
          )}

          {/* Eraser info */}
          {activeTool === "eraser" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Click on any annotation to delete it.
              </p>
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                <MousePointer2 className="size-4" />
                <span>Click annotation to remove</span>
              </div>
            </div>
          )}

          {/* Current annotations */}
          {currentPageIndex !== undefined && (
            <div className="mt-auto pt-3 border-t">
              <div className="text-xs font-medium mb-2">
                Page {currentPageIndex + 1} Annotations
              </div>
              {(annotationsRef.current[currentPageIndex] || []).length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No annotations on this page yet
                </p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {annotationsRef.current[currentPageIndex]?.map((ann) => (
                    <div
                      key={ann.id}
                      className="flex items-center gap-2 text-[11px] px-2 py-1 rounded bg-gray-50 dark:bg-zinc-700"
                    >
                      <span className="capitalize font-medium">
                        {ann.type}
                      </span>
                      {ann.text && (
                        <span className="text-muted-foreground truncate">
                          &quot;{ann.text}&quot;
                        </span>
                      )}
                      {ann.newStr !== undefined && (
                        <span className="text-muted-foreground truncate">
                          &quot;{ann.originalStr}&quot; → &quot;{ann.newStr}&quot;
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========== BOTTOM PAGE NAV ========== */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-800 border-t shadow-sm z-20">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setCurrentPageIndex((p) => Math.max(0, p - 1))
              }
              disabled={currentPageIndex === 0}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Previous Page</TooltipContent>
        </Tooltip>

        <span className="text-xs font-medium whitespace-nowrap">
          Page {currentPageIndex + 1} / {totalPages}
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setCurrentPageIndex((p) =>
                  Math.min(totalPages - 1, p + 1)
                )
              }
              disabled={currentPageIndex >= totalPages - 1}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Next Page</TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        {/* Thumbnails */}
        <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto max-w-[60%]">
          {thumbnails.map((thumb, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentPageIndex(idx)}
              className={`
                relative shrink-0 rounded border-2 overflow-hidden transition-all
                ${
                  idx === currentPageIndex
                    ? "border-fuchsia-500 ring-2 ring-fuchsia-200 dark:ring-fuchsia-800"
                    : "border-gray-200 dark:border-zinc-600 hover:border-gray-300"
                }
              `}
              style={{ width: 32, height: 44 }}
            >
              <img
                src={thumb}
                alt={`Page ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-0 right-0 text-[7px] font-bold bg-black/60 text-white px-0.5 rounded-tl">
                {idx + 1}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ============================================================
  // Main Render
  // ============================================================

  return step === "upload" ? renderUpload() : renderEditor();
}
