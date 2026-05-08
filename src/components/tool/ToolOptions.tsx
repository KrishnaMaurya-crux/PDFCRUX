"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Info,
  Eye,
  EyeOff,
  PenTool,
  Upload,
  CheckCircle2,
  Eraser,
  ImagePlus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { OptionDef } from "@/lib/tool-configs";

interface ToolOptionsProps {
  options: OptionDef[];
  values: Record<string, string | number | boolean>;
  onChange: (key: string, value: string | number | boolean) => void;
  toolId?: string;
}

function OptionWrapper({
  option,
  children,
}: {
  option: OptionDef;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium flex items-center gap-2">
          {option.label}
          {option.required && (
            <span className="text-destructive text-xs">*</span>
          )}
        </Label>
        {option.unit && (
          <Badge variant="secondary" className="text-[10px] px-1.5">
            {option.unit}
          </Badge>
        )}
      </div>
      {children}
      {option.hint && (
        <p className="text-xs text-muted-foreground flex items-start gap-1">
          <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
          {option.hint}
        </p>
      )}
    </div>
  );
}

// Sign PDF: which option IDs are visible per sign-type
function isSignPdfOptionVisible(optId: string, signType: string): boolean {
  switch (signType) {
    case "type":
      return [
        "sign-type", "signer-name", "sign-color", "sign-font-size", "sign-font",
        "page", "position", "reason",
      ].includes(optId);
    case "draw":
      return [
        "sign-type", "pen-color", "pen-size",
        "page", "position", "reason",
      ].includes(optId);
    case "upload":
      return [
        "sign-type", "sig-image-size",
        "page", "position", "reason",
      ].includes(optId);
    default:
      return true;
  }
}

// Render a single option control (shared by all tools)
function RenderOption({
  option,
  values,
  onChange,
}: {
  option: OptionDef;
  values: Record<string, string | number | boolean>;
  onChange: (key: string, value: string | number | boolean) => void;
}) {
  if (option.type === "select") {
    return (
      <OptionWrapper option={option}>
        <Select
          value={String(values[option.id] || option.defaultValue)}
          onValueChange={(v) => onChange(option.id, v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {option.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </OptionWrapper>
    );
  }

  if (option.type === "input") {
    return (
      <OptionWrapper option={option}>
        <Input
          placeholder={option.placeholder}
          value={String(values[option.id] || "")}
          onChange={(e) => onChange(option.id, e.target.value)}
          className="w-full"
        />
      </OptionWrapper>
    );
  }

  if (option.type === "textarea") {
    return (
      <OptionWrapper option={option}>
        <textarea
          placeholder={option.placeholder}
          value={String(values[option.id] || "")}
          onChange={(e) => onChange(option.id, e.target.value)}
          className="w-full min-h-[80px] rounded-md border bg-transparent px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </OptionWrapper>
    );
  }

  if (option.type === "toggle") {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 space-y-0.5">
          <Label className="text-sm font-medium flex items-center gap-2">
            {option.label}
          </Label>
          {option.hint && (
            <p className="text-xs text-muted-foreground">{option.hint}</p>
          )}
        </div>
        <Switch
          checked={Boolean(values[option.id] ?? option.defaultValue)}
          onCheckedChange={(checked) => onChange(option.id, checked)}
        />
      </div>
    );
  }

  if (option.type === "slider") {
    return (
      <OptionWrapper option={option}>
        <div className="space-y-3">
          <Slider
            value={[
              Number(values[option.id] ?? option.defaultValue) || 0,
            ]}
            min={option.min || 0}
            max={option.max || 100}
            step={option.step || 1}
            onValueChange={([v]) => onChange(option.id, v)}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {option.min}
              {option.unit}
            </span>
            <span className="text-sm font-semibold text-foreground">
              {values[option.id] ?? option.defaultValue}
              {option.unit}
            </span>
            <span>
              {option.max}
              {option.unit}
            </span>
          </div>
        </div>
      </OptionWrapper>
    );
  }

  if (option.type === "radio") {
    return (
      <OptionWrapper option={option}>
        <div className="space-y-2">
          {option.options?.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                (values[option.id] || option.defaultValue) === opt.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border hover:bg-accent/50"
              }`}
              onClick={() => onChange(option.id, opt.value)}
            >
              <div
                className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  (values[option.id] || option.defaultValue) ===
                  opt.value
                    ? "border-primary"
                    : "border-muted-foreground/40"
                }`}
              >
                {(values[option.id] || option.defaultValue) ===
                  opt.value && (
                  <div className="w-2 h-2 rounded-full bg-primary" />
                )}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{opt.label}</div>
                {opt.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {opt.description}
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>
      </OptionWrapper>
    );
  }

  if (option.type === "password") {
    return (
      <PasswordInput
        option={option}
        value={String(values[option.id] || "")}
        onChange={(v) => onChange(option.id, v)}
      />
    );
  }

  if (option.type === "color-picker") {
    return (
      <OptionWrapper option={option}>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={String(values[option.id] || "#000000")}
            onChange={(e) => onChange(option.id, e.target.value)}
            className="w-10 h-10 rounded-lg border cursor-pointer"
          />
          <Input
            value={String(values[option.id] || "#000000")}
            onChange={(e) => onChange(option.id, e.target.value)}
            className="flex-1"
            placeholder="#000000"
          />
        </div>
      </OptionWrapper>
    );
  }

  return null;
}

export default function ToolOptions({
  options,
  values,
  onChange,
  toolId,
}: ToolOptionsProps) {
  const signType = String(values["sign-type"] || "type");

  // Build the ordered list of option IDs to render
  const visibleOptions = useMemo(() => {
    return options;
  }, [options]);

  if (options.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 p-5 rounded-xl border bg-muted/20 space-y-5"
    >
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <svg
          className="w-4 h-4 text-primary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        Tool Settings
      </h3>

      {visibleOptions.map((option) => {
        // For sign-pdf: skip hidden options based on sign-type
        if (toolId === "sign-pdf" && !isSignPdfOptionVisible(option.id, signType)) {
          return null;
        }

        return (
          <div key={option.id}>
            <RenderOption option={option} values={values} onChange={onChange} />

            {/* Draw mode: show canvas after pen-size option */}
            {toolId === "sign-pdf" && option.id === "pen-size" && signType === "draw" && (
              <div className="mt-4">
                <SignatureCanvas
                  onChange={onChange}
                  penColor={String(values["pen-color"] || "#1a1a2e")}
                  penSize={Number(values["pen-size"] || 2.5)}
                />
              </div>
            )}

            {/* Upload mode: show upload area after sig-image-size option */}
            {toolId === "sign-pdf" && option.id === "sig-image-size" && signType === "upload" && (
              <div className="mt-4">
                <SignatureUpload onChange={onChange} />
              </div>
            )}


          </div>
        );
      })}
    </motion.div>
  );
}

// ========================
// Draw Signature Canvas
// ========================
function SignatureCanvas({
  onChange,
  penColor,
  penSize,
}: {
  onChange: (key: string, value: string | number | boolean) => void;
  penColor: string;
  penSize: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Keep refs for dynamic pen settings
  const penColorRef = useRef(penColor);
  const penSizeRef = useRef(penSize);

  useEffect(() => {
    penColorRef.current = penColor;
    penSizeRef.current = penSize;
  }, [penColor, penSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas resolution
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Draw baseline hint
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(30, rect.height * 0.65);
    ctx.lineTo(rect.width - 30, rect.height * 0.65);
    ctx.stroke();
    ctx.setLineDash([]);

    // Hint text
    ctx.fillStyle = "#d1d5db";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Sign here", rect.width / 2, rect.height * 0.45);
  }, []);

  const getPos = useCallback(
    (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();

      if ("touches" in e) {
        const touch = e.touches[0] || e.changedTouches[0];
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
      }
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    []
  );

  const startDraw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const pos = getPos(e);
      if (!pos) return;
      isDrawingRef.current = true;
      lastPosRef.current = pos;

      // Clear hint text on first stroke
      if (!hasDrawn) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, rect.width, rect.height);
        // Redraw baseline
        ctx.strokeStyle = "#e5e7eb";
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(30, rect.height * 0.65);
        ctx.lineTo(rect.width - 30, rect.height * 0.65);
        ctx.stroke();
        ctx.setLineDash([]);
        setHasDrawn(true);
      }
    },
    [getPos, hasDrawn]
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!isDrawingRef.current) return;
      const pos = getPos(e);
      if (!pos || !lastPosRef.current) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Use dynamic pen color and size from refs
      ctx.strokeStyle = penColorRef.current;
      ctx.lineWidth = penSizeRef.current;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();

      lastPosRef.current = pos;
    },
    [getPos]
  );

  const endDraw = useCallback(() => {
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      lastPosRef.current = null;
      // Save canvas as base64 to optionValues
      const canvas = canvasRef.current;
      if (canvas) {
        onChange("signature-data", canvas.toDataURL("image/png"));
      }
    }
  }, [onChange]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    // Redraw baseline
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(30, rect.height * 0.65);
    ctx.lineTo(rect.width - 30, rect.height * 0.65);
    ctx.stroke();
    ctx.setLineDash([]);
    // Redraw hint
    ctx.fillStyle = "#d1d5db";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Sign here", rect.width / 2, rect.height * 0.45);
    setHasDrawn(false);
    onChange("signature-data", "");
  }, [onChange]);

  // Compute cursor size for the custom cursor
  const cursorSize = Math.max(penSize * 2, 6);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      <Label className="text-sm font-medium flex items-center gap-2">
        <PenTool className="w-3.5 h-3.5" />
        Draw Your Signature
      </Label>
      <div className="relative rounded-lg border-2 border-dashed border-muted-foreground/30 overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          className="w-full touch-none"
          style={{
            height: "180px",
            cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${cursorSize}' height='${cursorSize}' viewBox='0 0 ${cursorSize} ${cursorSize}'%3E%3Ccircle cx='${cursorSize / 2}' cy='${cursorSize / 2}' r='${cursorSize / 2 - 1}' fill='${encodeURIComponent(penColor)}' fill-opacity='0.5' stroke='${encodeURIComponent(penColor)}' stroke-width='1'/%3E%3C/svg%3E") ${cursorSize / 2} ${cursorSize / 2}, crosshair`,
          }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Info className="w-3 h-3" />
          Draw your signature with mouse or touch
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearCanvas}
          className="text-xs gap-1.5 text-muted-foreground hover:text-destructive"
        >
          <Eraser className="w-3.5 h-3.5" />
          Clear
        </Button>
      </div>
    </motion.div>
  );
}

// ========================
// Upload Signature Image
// ========================
function SignatureUpload({
  onChange,
}: {
  onChange: (key: string, value: string | number | boolean) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        return;
      }

      setFileName(file.name);

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setPreview(dataUrl);
        onChange("signature-data", dataUrl);
        onChange("signer-name", file.name.replace(/\.[^/.]+$/, ""));
      };
      reader.readAsDataURL(file);
    },
    [onChange]
  );

  const clearUpload = useCallback(() => {
    setPreview(null);
    setFileName("");
    onChange("signature-data", "");
    if (inputRef.current) inputRef.current.value = "";
  }, [onChange]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;

      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setPreview(dataUrl);
        onChange("signature-data", dataUrl);
        onChange("signer-name", file.name.replace(/\.[^/.]+$/, ""));
      };
      reader.readAsDataURL(file);
    },
    [onChange]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      <Label className="text-sm font-medium flex items-center gap-2">
        <Upload className="w-3.5 h-3.5" />
        Upload Signature Image
      </Label>

      {preview ? (
        <div className="space-y-2">
          <div className="relative rounded-lg border bg-white p-3 flex items-center justify-center min-h-[120px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Signature preview"
              className="max-h-[100px] max-w-full object-contain"
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              {fileName}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearUpload}
              className="text-xs gap-1.5 text-muted-foreground hover:text-destructive"
            >
              <Eraser className="w-3.5 h-3.5" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <label
          className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/30 p-6 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <ImagePlus className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">Click or drag to upload</p>
            <p className="text-xs text-muted-foreground mt-1">
              PNG, JPG, or SVG — Use a pre-made signature image
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
        </label>
      )}
    </motion.div>
  );
}

// Password input with show/hide toggle
function PasswordInput({
  option,
  value,
  onChange,
}: {
  option: OptionDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);

  return (
    <OptionWrapper option={option}>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          placeholder={option.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pr-10"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </OptionWrapper>
  );
}
