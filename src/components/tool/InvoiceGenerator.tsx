"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, FileText, Upload, Download, Plus, Trash2, ChevronDown,
  CheckCircle2, Sparkles, Star, Zap, Shield, Globe, Smartphone,
  Building2, User, CreditCard, Hash, Palette, Printer, Languages,
  ArrowRight, FileUp, Receipt, Percent, Image, ChevronUp, QrCode,
  ToggleLeft, ToggleRight, Truck, History, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import {
  InvoiceData, InvoiceItem, CURRENCIES, LANGUAGES,
  calculateTotals, getDefaultInvoiceData,
  formatDateDisplay, getTaxConfig, CURRENCY_TAX_CONFIG, TAX_TYPES,
} from "@/lib/invoice-pdf";
import { getLabels, getLocale } from "@/lib/invoice-labels";

// ========================
// Templates
// ========================
const TEMPLATES = [
  { id: "classic", name: "Classic", desc: "Slate gray, professional and timeless", accent: "#475569", bg: "#F8FAFC" },
  { id: "royal", name: "Royal Blue", desc: "Deep blue, corporate and trustworthy", accent: "#1E3A5F", bg: "#EFF6FF" },
  { id: "emerald", name: "Emerald", desc: "Rich green, fresh and natural", accent: "#047857", bg: "#ECFDF5" },
  { id: "crimson", name: "Crimson", desc: "Bold red, strong and impactful", accent: "#991B1B", bg: "#FEF2F2" },
  { id: "amber", name: "Amber Gold", desc: "Warm gold, premium and luxurious", accent: "#92400E", bg: "#FFFBEB" },
  { id: "violet", name: "Violet", desc: "Deep purple, creative and modern", accent: "#5B21B6", bg: "#F5F3FF" },
];

function getTemplateAccent(template: string): string {
  return TEMPLATES.find((t) => t.id === template)?.accent || "#475569";
}

// ========================
// Animation Variants
// ========================
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" },
  }),
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

// ========================
// Helpers
// ========================
function getCurrencySymbol(code: string): string {
  return CURRENCIES[code]?.symbol || "$";
}

function formatCurrencyDisplay(amount: number, currency: string): string {
  const sym = getCurrencySymbol(currency);
  return `${sym}${amount.toFixed(2)}`;
}

// ========================
// Component
// ========================
export default function InvoiceGenerator() {
  const { navigateHome } = useAppStore();
  const { toast } = useToast();
  const toolRef = useRef<HTMLDivElement>(null);
  const invoiceCaptureRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<string>("build");
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadedPdfFile, setUploadedPdfFile] = useState<File | null>(null);
  const [uploadedPdfText, setUploadedPdfText] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [qrEnabled, setQrEnabled] = useState(false);

  // Collapsible section states
  const [sectionsOpen, setSectionsOpen] = useState({
    yourDetails: true,
    clientDetails: true,
    invoiceDetails: true,
    currencyLang: true,
    items: true,
    taxDiscount: true,
    notes: true,
    bankDetails: false,
    termsAndConditions: false,
    qrCode: true,
    template: true,
  });

  // Initialize invoice data
  const [invoiceData, setInvoiceData] = useState<InvoiceData>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("pdfcrux-invoice-draft");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return { ...getDefaultInvoiceData(), ...parsed };
        } catch {
          // ignore
        }
      }
    }
    return getDefaultInvoiceData();
  });

  // Auto-save to localStorage with 500ms debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem("pdfcrux-invoice-draft", JSON.stringify(invoiceData));
    }, 500);
    return () => clearTimeout(timer);
  }, [invoiceData]);

  const scrollToTool = useCallback(() => {
    toolRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const switchToUpload = useCallback(() => {
    setActiveTab("upload");
    setTimeout(() => toolRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  const updateField = useCallback(<K extends keyof InvoiceData>(key: K, value: InvoiceData[K]) => {
    setInvoiceData((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Sync QR enabled state
  useEffect(() => {
    updateField("qrCodeEnabled", qrEnabled);
  }, [qrEnabled, updateField]);

  const updateItem = useCallback((id: string, field: keyof InvoiceItem, value: string | number) => {
    setInvoiceData((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }));
  }, []);

  const addItem = useCallback(() => {
    setInvoiceData((prev) => ({
      ...prev,
      items: [...prev.items, { id: crypto.randomUUID(), description: "", quantity: 1, rate: 0 }],
    }));
  }, []);

  const removeItem = useCallback((id: string) => {
    setInvoiceData((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((item) => item.id !== id) : prev.items,
    }));
  }, []);

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Logo must be under 2MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setLogoPreview(dataUrl);
      updateField("logoDataUrl", dataUrl);
    };
    reader.readAsDataURL(file);
  }, [toast, updateField]);

  const removeLogo = useCallback(() => {
    setLogoPreview(null);
    updateField("logoDataUrl", undefined);
  }, [updateField]);

  // Capture the hidden full-size invoice as a canvas element
  const captureInvoiceAsCanvas = useCallback(async (): Promise<HTMLCanvasElement> => {
    const el = invoiceCaptureRef.current;
    if (!el) throw new Error("Invoice capture element not found");

    // Make visible temporarily for html2canvas rendering
    const origStyle = el.style.cssText;
    el.style.position = 'fixed';
    el.style.left = '0';
    el.style.top = '0';
    el.style.zIndex = '-9999';
    el.style.opacity = '1';
    el.style.pointerEvents = 'none';
    el.style.visibility = 'visible';

    // Wait for the browser to paint
    await new Promise(r => setTimeout(r, 150));

    const html2canvas = (await import('html2canvas-pro')).default;
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    // Hide it again
    el.style.cssText = origStyle;

    return canvas;
  }, []);

  const handleDownload = useCallback(async () => {
    setIsGenerating(true);
    try {
      const canvas = await captureInvoiceAsCanvas();
      const imgData = canvas.toDataURL('image/png');

      const { jsPDF } = await import('jspdf');
      const imgWidth = 794;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [imgWidth, Math.max(imgHeight, 1123)],
      });
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(`${invoiceData.invoiceNumber}.pdf`);

      toast({ title: "Invoice downloaded!", description: `${invoiceData.invoiceNumber}.pdf` });
    } catch (err) {
      console.error("PDF generation error:", err);
      toast({ title: "Error", description: `Failed to generate PDF: ${err instanceof Error ? err.message : 'Unknown error'}`, variant: "destructive" });
    }
    setIsGenerating(false);
  }, [invoiceData, toast, captureInvoiceAsCanvas]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const [downloadFormat, setDownloadFormat] = useState<"pdf" | "jpeg" | "png">("pdf");

  const downloadAsImage = useCallback(async (format: "jpeg" | "png") => {
    setIsGenerating(true);
    try {
      const canvas = await captureInvoiceAsCanvas();
      const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
      const ext = format === "jpeg" ? "jpg" : "png";
      const dataUrl = canvas.toDataURL(mimeType, 0.95);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${invoiceData.invoiceNumber}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast({ title: `${format.toUpperCase()} downloaded!`, description: `${invoiceData.invoiceNumber}.${ext}` });
    } catch (err) {
      console.error("Image generation error:", err);
      toast({ title: "Error", description: `Failed to generate ${format.toUpperCase()}: ${err instanceof Error ? err.message : 'Unknown error'}`, variant: "destructive" });
    }
    setIsGenerating(false);
  }, [invoiceData, toast, captureInvoiceAsCanvas]);

  const handleDownloadAll = useCallback(async () => {
    if (downloadFormat === "pdf") {
      await handleDownload();
    } else {
      await downloadAsImage(downloadFormat);
    }
  }, [downloadFormat, handleDownload, downloadAsImage]);

  const handlePdfUpload = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file", description: "Please upload a PDF file", variant: "destructive" });
      return;
    }
    setUploadedPdfFile(file);
    setIsParsing(true);
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const textParts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item: any) => item.str).join(" ");
        textParts.push(pageText);
      }
      const fullText = textParts.join("\n\n--- Page Break ---\n\n");
      setUploadedPdfText(fullText);
      toast({ title: "PDF parsed!", description: `Extracted text from ${pdf.numPages} page(s)` });
    } catch {
      toast({ title: "Parse error", description: "Could not read the PDF", variant: "destructive" });
    }
    setIsParsing(false);
  }, [toast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handlePdfUpload(file);
  }, [handlePdfUpload]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handlePdfUpload(file);
  }, [handlePdfUpload]);

  const setTemplate = useCallback((template: string) => {
    updateField("template", template);
  }, [updateField]);

  const totals = calculateTotals(invoiceData.items, invoiceData.taxPercent, invoiceData.discountPercent, invoiceData.shippingCharge, invoiceData.amountPaid, invoiceData.previousDue);

  const toggleSection = useCallback((section: keyof typeof sectionsOpen) => {
    setSectionsOpen((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  // ========================
  // Live Invoice Preview
  // ========================
  const renderInvoicePreview = () => {
    const accentColor = getTemplateAccent(invoiceData.template);
    const templateInfo = TEMPLATES.find((t) => t.id === invoiceData.template);
    const bgColor = templateInfo?.bg || "#F8FAFC";
    const labels = getLabels(invoiceData.language);

    return (
      <div
        className="w-full bg-white rounded-lg overflow-hidden text-[8px] leading-tight font-sans border shadow-sm"
        style={{ fontSize: "8px", lineHeight: "1.3" }}
      >
        {/* Top accent bar */}
        <div className="h-1.5 w-full" style={{ backgroundColor: accentColor }} />

        {/* Header */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            {invoiceData.logoDataUrl && (
              <img src={invoiceData.logoDataUrl} alt="Logo" className="h-7 w-auto object-contain" />
            )}
            <div>
              <div className="text-xl font-bold" style={{ color: accentColor }}>{labels.invoiceTitle}</div>
              <div className="h-0.5 w-14 mt-0.5" style={{ backgroundColor: accentColor }} />
            </div>
          </div>
        </div>

        {/* Invoice details bar */}
        <div
          className="mx-4 px-2 py-1.5 rounded text-[7px]"
          style={{ backgroundColor: bgColor }}
        >
          <div className="flex justify-between">
            <div>
              <span className="text-gray-400">{labels.invoiceHash}:</span>{" "}
              <span className="font-semibold">{invoiceData.invoiceNumber}</span>
              <br />
              <span className="text-gray-400">{labels.date}:</span>{" "}
              <span className="font-semibold">{formatDateDisplay(invoiceData.invoiceDate, getLocale(invoiceData.language))}</span>
            </div>
            <div className="text-right">
              <span className="text-gray-400">{labels.dueDate}:</span>{" "}
              <span className="font-semibold">{formatDateDisplay(invoiceData.dueDate, getLocale(invoiceData.language))}</span>
              <br />
              <span className="text-gray-400">{labels.currency}:</span>{" "}
              <span className="font-semibold">{getCurrencySymbol(invoiceData.currency)} {invoiceData.currency}</span>
            </div>
          </div>
        </div>

        {/* From / Bill To */}
        <div className="flex gap-3 px-4 mt-2">
          <div className="flex-1">
            <div className="font-bold text-[7px] uppercase mb-0.5" style={{ color: accentColor }}>{labels.from}</div>
            <div className="font-semibold">{invoiceData.yourName || labels.yourNamePlaceholder}</div>
            <div className="text-gray-400">{invoiceData.yourEmail}</div>
            <div className="text-gray-400">{invoiceData.yourPhone}</div>
            <div className="text-gray-400 whitespace-pre-line">{invoiceData.yourAddress}</div>
          </div>
          <div className="flex-1">
            <div className="font-bold text-[7px] uppercase mb-0.5" style={{ color: accentColor }}>{labels.billTo}</div>
            <div className="font-semibold">{invoiceData.clientName || labels.clientNamePlaceholder}</div>
            <div className="text-gray-400">{invoiceData.clientEmail}</div>
            <div className="text-gray-400 whitespace-pre-line">{invoiceData.clientAddress}</div>
          </div>
        </div>

        {/* Items Table */}
        <div className="mx-4 mt-2">
          <div
            className="grid grid-cols-12 gap-1 px-2 py-1 rounded-t font-bold text-[7px] uppercase"
            style={{
              backgroundColor: accentColor,
              color: "white",
            }}
          >
            <div className="col-span-5">{labels.description}</div>
            <div className="col-span-2 text-center">{labels.qty}</div>
            <div className="col-span-2 text-right">{labels.rate}</div>
            <div className="col-span-3 text-right">{labels.amount}</div>
          </div>
          {invoiceData.items.map((item, idx) => {
            const amount = item.quantity * item.rate;
            return (
              <div
                key={item.id}
                className="grid grid-cols-12 gap-1 px-2 py-0.5 border-b text-[7px]"
                style={{
                  borderColor: "#E5E7EB",
                  backgroundColor: idx % 2 === 1 ? bgColor : "white",
                }}
              >
                <div className="col-span-5 truncate">{item.description || "—"}</div>
                <div className="col-span-2 text-center">{item.quantity}</div>
                <div className="col-span-2 text-right">{formatCurrencyDisplay(item.rate, invoiceData.currency)}</div>
                <div className="col-span-3 text-right font-semibold">{formatCurrencyDisplay(amount, invoiceData.currency)}</div>
              </div>
            );
          })}
        </div>

        {/* Totals */}
        <div className="px-4 mt-1">
          <div className="flex justify-end">
            <div className="w-2/3">
              {invoiceData.discountPercent > 0 && (
                <div className="flex justify-between text-[7px] py-0.5">
                  <span className="text-gray-400">{labels.subtotal}</span>
                  <span className="font-semibold">{formatCurrencyDisplay(totals.subtotal, invoiceData.currency)}</span>
                </div>
              )}
              {invoiceData.discountPercent > 0 && (
                <div className="flex justify-between text-[7px] py-0.5">
                  <span className="text-gray-400">{labels.discount} ({invoiceData.discountPercent}%)</span>
                  <span className="font-semibold text-gray-600">-{formatCurrencyDisplay(totals.discountAmt, invoiceData.currency)}</span>
                </div>
              )}
              {invoiceData.taxPercent > 0 && (
                <div className="flex justify-between text-[7px] py-0.5">
                  <span className="text-gray-400">{invoiceData.taxType && invoiceData.taxType !== "None" && invoiceData.taxType !== "auto" ? invoiceData.taxType : labels.tax} ({invoiceData.taxPercent}%)</span>
                  <span className="font-semibold">{formatCurrencyDisplay(totals.taxAmt, invoiceData.currency)}</span>
                </div>
              )}
              {totals.shippingCharge > 0 && (
                <div className="flex justify-between text-[7px] py-0.5">
                  <span className="text-gray-400">Shipping</span>
                  <span className="font-semibold">+{formatCurrencyDisplay(totals.shippingCharge, invoiceData.currency)}</span>
                </div>
              )}
              {totals.previousDue > 0 && (
                <div className="flex justify-between text-[7px] py-0.5">
                  <span className="text-gray-500">Previous Due</span>
                  <span className="font-semibold text-gray-700">+{formatCurrencyDisplay(totals.previousDue, invoiceData.currency)}</span>
                </div>
              )}
              {invoiceData.discountPercent === 0 && invoiceData.taxPercent === 0 && totals.shippingCharge === 0 && totals.previousDue === 0 && (
                <div className="flex justify-between text-[7px] py-0.5">
                  <span className="text-gray-400">{labels.subtotal}</span>
                  <span className="font-semibold">{formatCurrencyDisplay(totals.subtotal, invoiceData.currency)}</span>
                </div>
              )}
              <div className="h-px my-1" style={{ backgroundColor: accentColor }} />
              <div
                className="flex justify-between py-1 px-1 rounded text-[9px] font-bold"
                style={{ backgroundColor: bgColor, color: accentColor }}
              >
                <span>{labels.total}</span>
                <span className="text-gray-900">{formatCurrencyDisplay(totals.total, invoiceData.currency)}</span>
              </div>
              {totals.amountPaid > 0 && (
                <div className="flex justify-between text-[7px] py-0.5">
                  <span className="text-gray-500">Paid</span>
                  <span className="font-semibold text-gray-700">-{formatCurrencyDisplay(totals.amountPaid, invoiceData.currency)}</span>
                </div>
              )}
              {(totals.amountPaid > 0 || totals.previousDue > 0) && (
                <div
                  className="flex justify-between py-1 px-1 rounded text-[9px] font-bold"
                  style={{ backgroundColor: bgColor, color: accentColor }}
                >
                  <span>Balance Due</span>
                  <span>{formatCurrencyDisplay(totals.balanceDue, invoiceData.currency)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* QR Code */}
        {invoiceData.qrCodeEnabled && invoiceData.qrCodeUrl && (
          <div className="px-4 mt-1.5 flex items-center gap-2">
            <div className="w-10 h-10 bg-white rounded border flex items-center justify-center p-0.5">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(invoiceData.qrCodeUrl)}&format=png`}
                alt="Payment QR"
                className="w-full h-full"
                crossOrigin="anonymous"
              />
            </div>
            <div>
              <div className="font-bold text-[7px]" style={{ color: accentColor }}>SCAN TO PAY</div>
              <div className="text-gray-400 text-[6px]">Scan QR code to make payment</div>
            </div>
          </div>
        )}

        {/* Notes */}
        {invoiceData.notes.trim() && (
          <div className="px-4 mt-1.5">
            <div className="font-bold text-[7px] uppercase mb-0.5" style={{ color: accentColor }}>{labels.notes}</div>
            <div className="text-gray-400 text-[7px] italic whitespace-pre-line line-clamp-2">{invoiceData.notes}</div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto">
          <div className="h-3" style={{ backgroundColor: accentColor }}>
            <span className="text-white text-[5px] px-2 leading-3">Generated by PdfCrux.com</span>
          </div>
        </div>
      </div>
    );
  };

  // ========================
  // Full-Size Invoice (hidden, for high-quality capture)
  // ========================
  const renderFullSizeInvoice = () => {
    const accentColor = getTemplateAccent(invoiceData.template);
    const templateInfo = TEMPLATES.find((t) => t.id === invoiceData.template);
    const bgColor = templateInfo?.bg || "#F8FAFC";
    const labels = getLabels(invoiceData.language);

    return (
      <div ref={invoiceCaptureRef} style={{
        width: '794px',
        background: 'white',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        lineHeight: '1.4',
        color: '#111827',
        overflow: 'hidden',
      }}>
        {/* Top accent bar */}
        <div style={{ height: '6px', width: '100%', backgroundColor: accentColor }} />

        {/* Header */}
        <div style={{ padding: '20px 32px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {invoiceData.logoDataUrl && (
              <img src={invoiceData.logoDataUrl} alt="Logo" style={{ height: '40px', width: 'auto', objectFit: 'contain' }} />
            )}
            <div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: accentColor, letterSpacing: '-0.02em' }}>{labels.invoiceTitle}</div>
              <div style={{ height: '3px', width: '56px', marginTop: '6px', backgroundColor: accentColor, borderRadius: '2px' }} />
            </div>
          </div>
        </div>

        {/* Invoice details bar */}
        <div style={{
          margin: '0 32px',
          padding: '10px 16px',
          borderRadius: '8px',
          backgroundColor: bgColor,
          fontSize: '12px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <span style={{ color: '#9CA3AF' }}>{labels.invoiceHash}:</span>{' '}
              <span style={{ fontWeight: 600 }}>{invoiceData.invoiceNumber}</span>
              <br />
              <span style={{ color: '#9CA3AF' }}>{labels.date}:</span>{' '}
              <span style={{ fontWeight: 600 }}>{formatDateDisplay(invoiceData.invoiceDate, getLocale(invoiceData.language))}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ color: '#9CA3AF' }}>{labels.dueDate}:</span>{' '}
              <span style={{ fontWeight: 600 }}>{formatDateDisplay(invoiceData.dueDate, getLocale(invoiceData.language))}</span>
              <br />
              <span style={{ color: '#9CA3AF' }}>{labels.currency}:</span>{' '}
              <span style={{ fontWeight: 600 }}>{getCurrencySymbol(invoiceData.currency)} {invoiceData.currency}</span>
            </div>
          </div>
        </div>

        {/* From / Bill To */}
        <div style={{ display: 'flex', gap: '24px', padding: '16px 32px 0' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', color: accentColor, marginBottom: '6px', letterSpacing: '0.05em' }}>{labels.from}</div>
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '2px' }}>{invoiceData.yourName || labels.yourNamePlaceholder}</div>
            <div style={{ color: '#6B7280', fontSize: '12px' }}>{invoiceData.yourEmail}</div>
            <div style={{ color: '#6B7280', fontSize: '12px' }}>{invoiceData.yourPhone}</div>
            <div style={{ color: '#6B7280', fontSize: '12px', whiteSpace: 'pre-line' }}>{invoiceData.yourAddress}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', color: accentColor, marginBottom: '6px', letterSpacing: '0.05em' }}>{labels.billTo}</div>
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '2px' }}>{invoiceData.clientName || labels.clientNamePlaceholder}</div>
            <div style={{ color: '#6B7280', fontSize: '12px' }}>{invoiceData.clientEmail}</div>
            <div style={{ color: '#6B7280', fontSize: '12px', whiteSpace: 'pre-line' }}>{invoiceData.clientAddress}</div>
          </div>
        </div>

        {/* Items Table */}
        <div style={{ margin: '16px 32px 0' }}>
          {/* Header row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '5fr 1.5fr 2fr 2.5fr',
            gap: '4px',
            padding: '10px 14px',
            borderRadius: '8px 8px 0 0',
            backgroundColor: accentColor,
            color: 'white',
            fontWeight: 700,
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>
            <div>{labels.description}</div>
            <div style={{ textAlign: 'center' }}>{labels.qty}</div>
            <div style={{ textAlign: 'right' }}>{labels.rate}</div>
            <div style={{ textAlign: 'right' }}>{labels.amount}</div>
          </div>
          {/* Item rows */}
          {invoiceData.items.map((item, idx) => {
            const amount = item.quantity * item.rate;
            return (
              <div key={item.id} style={{
                display: 'grid',
                gridTemplateColumns: '5fr 1.5fr 2fr 2.5fr',
                gap: '4px',
                padding: '8px 14px',
                borderBottom: idx === invoiceData.items.length - 1 ? '2px solid #E5E7EB' : '1px solid #F3F4F6',
                backgroundColor: idx % 2 === 1 ? bgColor : 'white',
                fontSize: '12px',
              }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || '—'}</div>
                <div style={{ textAlign: 'center', fontWeight: 500 }}>{item.quantity}</div>
                <div style={{ textAlign: 'right' }}>{formatCurrencyDisplay(item.rate, invoiceData.currency)}</div>
                <div style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrencyDisplay(amount, invoiceData.currency)}</div>
              </div>
            );
          })}
        </div>

        {/* Totals */}
        <div style={{ padding: '16px 32px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: '340px' }}>
              {invoiceData.discountPercent > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '3px 0' }}>
                  <span style={{ color: '#9CA3AF' }}>{labels.subtotal}</span>
                  <span style={{ fontWeight: 500 }}>{formatCurrencyDisplay(totals.subtotal, invoiceData.currency)}</span>
                </div>
              )}
              {invoiceData.discountPercent > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '3px 0' }}>
                  <span style={{ color: '#9CA3AF' }}>{labels.discount} ({invoiceData.discountPercent}%)</span>
                  <span style={{ color: '#6B7280', fontWeight: 500 }}>-{formatCurrencyDisplay(totals.discountAmt, invoiceData.currency)}</span>
                </div>
              )}
              {invoiceData.taxPercent > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '3px 0' }}>
                  <span style={{ color: '#9CA3AF' }}>{invoiceData.taxType && invoiceData.taxType !== "None" && invoiceData.taxType !== "auto" ? invoiceData.taxType : labels.tax} ({invoiceData.taxPercent}%)</span>
                  <span style={{ fontWeight: 500 }}>{formatCurrencyDisplay(totals.taxAmt, invoiceData.currency)}</span>
                </div>
              )}
              {totals.shippingCharge > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '3px 0' }}>
                  <span style={{ color: '#9CA3AF' }}>Shipping</span>
                  <span style={{ fontWeight: 500 }}>+{formatCurrencyDisplay(totals.shippingCharge, invoiceData.currency)}</span>
                </div>
              )}
              {totals.previousDue > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '3px 0' }}>
                  <span style={{ color: '#6B7280', fontWeight: 500 }}>Previous Due</span>
                  <span style={{ fontWeight: 600 }}>+{formatCurrencyDisplay(totals.previousDue, invoiceData.currency)}</span>
                </div>
              )}
              {invoiceData.discountPercent === 0 && invoiceData.taxPercent === 0 && totals.shippingCharge === 0 && totals.previousDue === 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '3px 0' }}>
                  <span style={{ color: '#9CA3AF' }}>{labels.subtotal}</span>
                  <span style={{ fontWeight: 500 }}>{formatCurrencyDisplay(totals.subtotal, invoiceData.currency)}</span>
                </div>
              )}
              <div style={{ height: '2px', margin: '8px 0', backgroundColor: accentColor, borderRadius: '1px' }} />
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: bgColor,
              }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: accentColor }}>{labels.total}</span>
                <span style={{ fontSize: '18px', fontWeight: 800, color: '#111827' }}>{formatCurrencyDisplay(totals.total, invoiceData.currency)}</span>
              </div>
              {totals.amountPaid > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '3px 0', marginTop: '4px' }}>
                  <span style={{ color: '#6B7280', fontWeight: 500 }}>Amount Paid</span>
                  <span style={{ fontWeight: 600 }}>-{formatCurrencyDisplay(totals.amountPaid, invoiceData.currency)}</span>
                </div>
              )}
              {(totals.amountPaid > 0 || totals.previousDue > 0) && (
                <>
                  <div style={{ height: '2px', margin: '6px 0', backgroundColor: accentColor, opacity: 0.3, borderRadius: '1px' }} />
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: bgColor,
                  }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: accentColor }}>Balance Due</span>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: accentColor }}>{formatCurrencyDisplay(totals.balanceDue, invoiceData.currency)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Bank Details */}
        {(invoiceData.bankName || invoiceData.bankAccountNo) && (
          <div style={{ padding: '16px 32px 0' }}>
            <div style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', color: accentColor, marginBottom: '6px', letterSpacing: '0.05em' }}>BANK DETAILS</div>
            <div style={{ fontSize: '11px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
              {invoiceData.bankName && <div><span style={{ color: '#9CA3AF' }}>Bank: </span><span style={{ fontWeight: 600 }}>{invoiceData.bankName}</span></div>}
              {invoiceData.bankAccountNo && <div><span style={{ color: '#9CA3AF' }}>Account: </span><span style={{ fontWeight: 600 }}>{invoiceData.bankAccountNo}</span></div>}
              {invoiceData.bankBranch && <div><span style={{ color: '#9CA3AF' }}>IFSC/SWIFT: </span><span style={{ fontWeight: 600 }}>{invoiceData.bankBranch}</span></div>}
            </div>
          </div>
        )}

        {/* Tax Registration */}
        {invoiceData.taxRegNumber && (
          <div style={{ padding: '10px 32px 0', fontSize: '11px' }}>
            <span style={{ color: '#9CA3AF' }}>{getTaxConfig(invoiceData.currency).regLabel}: </span>
            <span style={{ fontWeight: 600 }}>{invoiceData.taxRegNumber}</span>
          </div>
        )}

        {/* Notes */}
        {invoiceData.notes.trim() && (
          <div style={{ padding: '12px 32px 0' }}>
            <div style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', color: accentColor, marginBottom: '4px', letterSpacing: '0.05em' }}>{labels.notes}</div>
            <div style={{ color: '#6B7280', fontSize: '11px', fontStyle: 'italic', whiteSpace: 'pre-line' }}>{invoiceData.notes}</div>
          </div>
        )}

        {/* Terms & Conditions */}
        {invoiceData.termsAndConditions?.trim() && (
          <div style={{ padding: '12px 32px 0' }}>
            <div style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', color: accentColor, marginBottom: '4px', letterSpacing: '0.05em' }}>TERMS & CONDITIONS</div>
            <div style={{ color: '#6B7280', fontSize: '10px', whiteSpace: 'pre-line' }}>{invoiceData.termsAndConditions}</div>
          </div>
        )}

        {/* Signature */}
        {invoiceData.signatureName && (
          <div style={{ padding: '20px 32px 0', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'center', width: '200px' }}>
              <div style={{ borderBottom: '1px solid #D1D5DB', height: '48px' }} />
              <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '4px' }}>Authorized Signatory</div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{invoiceData.signatureName}</div>
              <div style={{ fontSize: '10px', color: '#9CA3AF' }}>Date: {formatDateDisplay(invoiceData.invoiceDate, getLocale(invoiceData.language))}</div>
            </div>
          </div>
        )}

        {/* QR Code for Payment */}
        {invoiceData.qrCodeEnabled && invoiceData.qrCodeUrl && (
          <div style={{ padding: '16px 32px 0', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '8px', border: '1px solid #E5E7EB', overflow: 'hidden', flexShrink: 0, backgroundColor: '#fff' }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(invoiceData.qrCodeUrl)}&format=png`}
                alt="Payment QR Code"
                style={{ width: '100%', height: '100%' }}
                crossOrigin="anonymous"
              />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', color: accentColor, letterSpacing: '0.05em', marginBottom: '2px' }}>SCAN TO PAY</div>
              <div style={{ color: '#6B7280', fontSize: '11px', lineHeight: '1.4' }}>
                Scan this QR code with your phone camera or any payment app to pay directly.
              </div>
              <div style={{ color: '#9CA3AF', fontSize: '9px', marginTop: '4px', wordBreak: 'break-all' }}>{invoiceData.qrCodeUrl}</div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: '16px',
          height: '28px',
          backgroundColor: accentColor,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: '20px',
        }}>
          <span style={{ color: 'white', fontSize: '11px', fontWeight: 500, opacity: 0.9 }}>Generated by PdfCrux.com</span>
        </div>
      </div>
    );
  };

  // ========================
  // HERO SECTION
  // ========================
  const renderHero = () => (
    <section className="relative pt-24 pb-16 sm:pt-32 sm:pb-20 lg:pt-40 lg:pb-28 hero-gradient overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-primary/3 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/2 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Back button */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="absolute top-4 left-4 sm:top-6 sm:left-6"
        >
          <Button variant="ghost" size="sm" onClick={navigateHome} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">All Tools</span>
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Badge
              variant="secondary"
              className="mb-6 px-4 py-1.5 text-xs font-medium gap-1.5 border shadow-sm"
            >
              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
              Free Invoice Generator
            </Badge>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight leading-[1.1] max-w-4xl"
          >
            Professional Invoice
            <br />
            <span className="text-primary relative">
              Generator
              <svg
                className="absolute -bottom-2 left-0 w-full h-3 text-primary/20"
                viewBox="0 0 200 12"
                fill="none"
              >
                <path d="M1 8C50 2 150 2 199 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl leading-relaxed"
          >
            Create stunning invoices in seconds — 1 token per invoice.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="mt-10 flex flex-col sm:flex-row items-center gap-4"
          >
            <Button
              size="lg"
              onClick={scrollToTool}
              className="h-12 px-8 text-base gap-2 shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-shadow"
            >
              <FileText className="w-5 h-5" />
              Build New Invoice
            </Button>
            <Button variant="outline" size="lg" onClick={switchToUpload} className="h-12 px-8 text-base gap-2">
              <Upload className="w-5 h-5" />
              Upload & Edit PDF
            </Button>
          </motion.div>

          {/* Trust badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="mt-14 flex flex-wrap items-center justify-center gap-6 sm:gap-10"
          >
            {[
              { icon: CheckCircle2, text: "100% Free", color: "text-emerald-500" },
              { icon: Shield, text: "No Login Required", color: "text-blue-500" },
              { icon: Download, text: "Instant PDF", color: "text-violet-500" },
              { icon: Globe, text: "40+ Currencies", color: "text-amber-500" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold">{item.text}</div>
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );

  // ========================
  // MAIN TOOL SECTION
  // ========================
  const renderMainTool = () => (
    <section ref={toolRef} className="py-12 sm:py-16 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Create Your Invoice
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Fill in the details below and preview your invoice in real time.
          </p>
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mx-auto mb-8 bg-muted">
            <TabsTrigger value="build" className="px-4 sm:px-8 gap-2">
              <Receipt className="size-4" />
              Build New
            </TabsTrigger>
            <TabsTrigger value="upload" className="px-4 sm:px-8 gap-2">
              <FileUp className="size-4" />
              Upload & Edit
            </TabsTrigger>
          </TabsList>

          {/* ===== TAB: Build New ===== */}
          <TabsContent value="build">
            <div className="flex flex-col lg:flex-row gap-8">
              {/* LEFT: Form (60%) */}
              <div className="w-full lg:w-[60%] space-y-3">

                {/* Section: Your Details */}
                <Collapsible open={sectionsOpen.yourDetails} onOpenChange={() => toggleSection("yourDetails")}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-4 rounded-xl bg-card border hover:border-primary/30 transition-colors shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                          <Building2 className="size-4 text-emerald-600" />
                        </div>
                        <span className="font-semibold">Your Details</span>
                      </div>
                      <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${sectionsOpen.yourDetails ? "rotate-180" : ""}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 pt-3 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="yourName" className="text-xs font-medium text-muted-foreground">Your Name / Business</Label>
                          <Input id="yourName" value={invoiceData.yourName} onChange={(e) => updateField("yourName", e.target.value)} placeholder="John Doe / Acme Inc." className="h-9" />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="yourEmail" className="text-xs font-medium text-muted-foreground">Email</Label>
                          <Input id="yourEmail" type="email" value={invoiceData.yourEmail} onChange={(e) => updateField("yourEmail", e.target.value)} placeholder="john@example.com" className="h-9" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="yourPhone" className="text-xs font-medium text-muted-foreground">Phone</Label>
                        <Input id="yourPhone" type="tel" value={invoiceData.yourPhone} onChange={(e) => updateField("yourPhone", e.target.value)} placeholder="+1 (555) 123-4567" className="h-9" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="yourAddress" className="text-xs font-medium text-muted-foreground">Address</Label>
                        <Textarea id="yourAddress" value={invoiceData.yourAddress} onChange={(e) => updateField("yourAddress", e.target.value)} placeholder="123 Main St, City, State 12345" rows={2} className="resize-none" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Logo (optional, max 2MB)</Label>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-muted-foreground/25 hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-colors text-sm text-muted-foreground">
                            <Upload className="size-4" />
                            Upload Logo
                            <input type="file" accept="image/png,image/jpeg,image/jpg" onChange={handleLogoUpload} className="hidden" />
                          </label>
                          {logoPreview && (
                            <div className="flex items-center gap-2">
                              <img src={logoPreview} alt="Logo preview" className="h-10 w-auto rounded border object-contain" />
                              <Button variant="ghost" size="sm" onClick={removeLogo} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 w-8 p-0">
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Section: Client Details */}
                <Collapsible open={sectionsOpen.clientDetails} onOpenChange={() => toggleSection("clientDetails")}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-4 rounded-xl bg-card border hover:border-primary/30 transition-colors shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                          <User className="size-4 text-blue-600" />
                        </div>
                        <span className="font-semibold">Client Details</span>
                      </div>
                      <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${sectionsOpen.clientDetails ? "rotate-180" : ""}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 pt-3 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="clientName" className="text-xs font-medium text-muted-foreground">Client Name / Company</Label>
                          <Input id="clientName" value={invoiceData.clientName} onChange={(e) => updateField("clientName", e.target.value)} placeholder="Acme Corp" className="h-9" />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="clientEmail" className="text-xs font-medium text-muted-foreground">Client Email</Label>
                          <Input id="clientEmail" type="email" value={invoiceData.clientEmail} onChange={(e) => updateField("clientEmail", e.target.value)} placeholder="billing@acme.com" className="h-9" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="clientAddress" className="text-xs font-medium text-muted-foreground">Client Address</Label>
                        <Textarea id="clientAddress" value={invoiceData.clientAddress} onChange={(e) => updateField("clientAddress", e.target.value)} placeholder="456 Client Ave, Suite 100, City, State" rows={2} className="resize-none" />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Section: Invoice Details */}
                <Collapsible open={sectionsOpen.invoiceDetails} onOpenChange={() => toggleSection("invoiceDetails")}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-4 rounded-xl bg-card border hover:border-primary/30 transition-colors shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                          <CreditCard className="size-4 text-violet-600" />
                        </div>
                        <span className="font-semibold">Invoice Details</span>
                      </div>
                      <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${sectionsOpen.invoiceDetails ? "rotate-180" : ""}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 pt-3 space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="invoiceNumber" className="text-xs font-medium text-muted-foreground">Invoice Number</Label>
                        <Input id="invoiceNumber" value={invoiceData.invoiceNumber} onChange={(e) => updateField("invoiceNumber", e.target.value)} className="h-9" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="invoiceDate" className="text-xs font-medium text-muted-foreground">Invoice Date</Label>
                          <Input id="invoiceDate" type="date" value={invoiceData.invoiceDate} onChange={(e) => updateField("invoiceDate", e.target.value)} className="h-9" />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="dueDate" className="text-xs font-medium text-muted-foreground">Due Date</Label>
                          <Input id="dueDate" type="date" value={invoiceData.dueDate} onChange={(e) => updateField("dueDate", e.target.value)} className="h-9" />
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Section: Currency & Language */}
                <Collapsible open={sectionsOpen.currencyLang} onOpenChange={() => toggleSection("currencyLang")}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-4 rounded-xl bg-card border hover:border-primary/30 transition-colors shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                          <Globe className="size-4 text-amber-600" />
                        </div>
                        <span className="font-semibold">Currency & Language</span>
                      </div>
                      <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${sectionsOpen.currencyLang ? "rotate-180" : ""}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 pt-3 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">Currency</Label>
                          <Select value={invoiceData.currency} onValueChange={(v) => updateField("currency", v)}>
                            <SelectTrigger className="h-9 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(CURRENCIES).map(([code, info]) => (
                                <SelectItem key={code} value={code}>
                                  {info.symbol} {code} — {info.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">Invoice Language</Label>
                          <Select value={invoiceData.language} onValueChange={(v) => updateField("language", v)}>
                            <SelectTrigger className="h-9 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LANGUAGES.map((lang) => (
                                <SelectItem key={lang.code} value={lang.code}>
                                  {lang.native} ({lang.name})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Section: Items */}
                <Collapsible open={sectionsOpen.items} onOpenChange={() => toggleSection("items")}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-4 rounded-xl bg-card border hover:border-primary/30 transition-colors shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center">
                          <Hash className="size-4 text-rose-600" />
                        </div>
                        <span className="font-semibold">Items</span>
                        <Badge variant="secondary" className="text-xs">{invoiceData.items.length}</Badge>
                      </div>
                      <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${sectionsOpen.items ? "rotate-180" : ""}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 pt-3 space-y-3">
                      {/* Desktop table header */}
                      <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                        <div className="col-span-5">Description</div>
                        <div className="col-span-2 text-center">Qty</div>
                        <div className="col-span-2 text-right">Rate</div>
                        <div className="col-span-2 text-right">Amount</div>
                        <div className="col-span-1" />
                      </div>
                      {invoiceData.items.map((item) => (
                        <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-12 sm:col-span-5">
                            <Label className="sm:hidden text-xs text-muted-foreground">Description</Label>
                            <Input
                              value={item.description}
                              onChange={(e) => updateItem(item.id, "description", e.target.value)}
                              placeholder="Service description"
                              className="h-9"
                            />
                          </div>
                          <div className="col-span-4 sm:col-span-2">
                            <Label className="sm:hidden text-xs text-muted-foreground">Qty</Label>
                            <Input
                              type="number"
                              min={0}
                              value={item.quantity}
                              onChange={(e) => updateItem(item.id, "quantity", Number(e.target.value) || 0)}
                              className="h-9 text-center"
                            />
                          </div>
                          <div className="col-span-4 sm:col-span-2">
                            <Label className="sm:hidden text-xs text-muted-foreground">Rate</Label>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.rate}
                              onChange={(e) => updateItem(item.id, "rate", Number(e.target.value) || 0)}
                              className="h-9 text-right"
                            />
                          </div>
                          <div className="col-span-3 sm:col-span-2 text-right font-semibold text-sm">
                            {formatCurrencyDisplay(item.quantity * item.rate, invoiceData.currency)}
                          </div>
                          <div className="col-span-1 flex justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeItem(item.id)}
                              disabled={invoiceData.items.length <= 1}
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      <Button variant="outline" onClick={addItem} className="w-full gap-2 text-sm">
                        <Plus className="size-4" />
                        Add Item
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Section: Tax & Discount */}
                <Collapsible open={sectionsOpen.taxDiscount} onOpenChange={() => toggleSection("taxDiscount")}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-4 rounded-xl bg-card border hover:border-primary/30 transition-colors shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center">
                          <Percent className="size-4 text-cyan-600" />
                        </div>
                        <span className="font-semibold">Tax, Discount & Payments</span>
                      </div>
                      <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${sectionsOpen.taxDiscount ? "rotate-180" : ""}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 pt-3 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Tax Type selector */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Tax Type
                          </Label>
                          <Select
                            value={invoiceData.taxType || "auto"}
                            onValueChange={(v) => updateField("taxType", v)}
                          >
                            <SelectTrigger className="h-9 w-full">
                              <SelectValue placeholder="Auto (from currency)" />
                            </SelectTrigger>
                            <SelectContent>
                              {TAX_TYPES.map((tt) => (
                                <SelectItem key={tt.value} value={tt.value}>
                                  {tt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="taxPercent" className="text-xs font-medium text-muted-foreground">
                            {invoiceData.taxType && invoiceData.taxType !== "auto"
                              ? `${invoiceData.taxType} (%${invoiceData.taxType === "None" ? ")" : ""}`
                              : `${getTaxConfig(invoiceData.currency).taxLabel} (%)`}
                          </Label>
                          {invoiceData.taxType === "None" ? (
                            <div className="h-9 px-3 flex items-center text-xs text-muted-foreground bg-muted/50 rounded-md border">
                              Tax disabled (No Tax selected)
                            </div>
                          ) : (
                          <div className="flex gap-2">
                            <Select
                              value={String(invoiceData.taxPercent)}
                              onValueChange={(v) => updateField("taxPercent", Number(v))}
                            >
                              <SelectTrigger className="h-9 w-28">
                                <SelectValue placeholder="Select rate" />
                              </SelectTrigger>
                              <SelectContent>
                                {getTaxConfig(invoiceData.currency).taxRates.map((rate) => (
                                  <SelectItem key={rate} value={String(rate)}>
                                    {rate}%
                                  </SelectItem>
                                ))}
                                <SelectItem value="custom">Custom...</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              id="taxPercent"
                              type="number"
                              min={0}
                              max={100}
                              step="0.1"
                              value={invoiceData.taxPercent}
                              onChange={(e) => updateField("taxPercent", Number(e.target.value) || 0)}
                              className="h-9 flex-1"
                              placeholder="0"
                            />
                          </div>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="discountPercent" className="text-xs font-medium text-muted-foreground">Discount (%)</Label>
                          <Input
                            id="discountPercent"
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            value={invoiceData.discountPercent}
                            onChange={(e) => updateField("discountPercent", Number(e.target.value) || 0)}
                            className="h-9"
                          />
                        </div>
                      </div>

                      <Separator className="my-1" />

                      {/* Shipping & Payment fields */}
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Shipping & Payments</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="shippingCharge" className="text-xs font-medium text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Truck className="size-3" /> Shipping Charge
                            </span>
                          </Label>
                          <Input
                            id="shippingCharge"
                            type="number"
                            min={0}
                            step="0.01"
                            value={invoiceData.shippingCharge || ""}
                            onChange={(e) => updateField("shippingCharge", Number(e.target.value) || 0)}
                            className="h-9"
                            placeholder="0.00"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="previousDue" className="text-xs font-medium text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <History className="size-3" /> Previous Due
                            </span>
                          </Label>
                          <Input
                            id="previousDue"
                            type="number"
                            min={0}
                            step="0.01"
                            value={invoiceData.previousDue || ""}
                            onChange={(e) => updateField("previousDue", Number(e.target.value) || 0)}
                            className="h-9"
                            placeholder="0.00"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="amountPaid" className="text-xs font-medium text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Wallet className="size-3" /> Amount Paid
                            </span>
                          </Label>
                          <Input
                            id="amountPaid"
                            type="number"
                            min={0}
                            step="0.01"
                            value={invoiceData.amountPaid || ""}
                            onChange={(e) => updateField("amountPaid", Number(e.target.value) || 0)}
                            className="h-9"
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      {/* Tax Registration Number */}
                      <div className="space-y-1.5">
                        <Label htmlFor="taxRegNumber" className="text-xs font-medium text-muted-foreground">
                          {getTaxConfig(invoiceData.currency).regLabel}
                        </Label>
                        <Input
                          id="taxRegNumber"
                          type="text"
                          placeholder={getTaxConfig(invoiceData.currency).regPlaceholder}
                          value={invoiceData.taxRegNumber || ""}
                          onChange={(e) => updateField("taxRegNumber", e.target.value)}
                          className="h-9"
                        />
                      </div>
                      {/* Totals summary */}
                      <div className="rounded-lg border bg-muted/50 p-3 space-y-1.5 text-sm">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Subtotal</span>
                          <span className="font-medium text-foreground">{formatCurrencyDisplay(totals.subtotal, invoiceData.currency)}</span>
                        </div>
                        {totals.discountAmt > 0 && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Discount ({invoiceData.discountPercent}%)</span>
                            <span>-{formatCurrencyDisplay(totals.discountAmt, invoiceData.currency)}</span>
                          </div>
                        )}
                        {totals.taxAmt > 0 && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Tax ({invoiceData.taxPercent}%)</span>
                            <span className="font-medium text-foreground">{formatCurrencyDisplay(totals.taxAmt, invoiceData.currency)}</span>
                          </div>
                        )}
                        {totals.shippingCharge > 0 && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Shipping</span>
                            <span className="font-medium text-foreground">+{formatCurrencyDisplay(totals.shippingCharge, invoiceData.currency)}</span>
                          </div>
                        )}
                        {totals.previousDue > 0 && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Previous Due</span>
                            <span>+{formatCurrencyDisplay(totals.previousDue, invoiceData.currency)}</span>
                          </div>
                        )}
                        <Separator />
                        <div className="flex justify-between text-base font-bold">
                          <span>Total</span>
                          <span className="text-primary">{formatCurrencyDisplay(totals.total, invoiceData.currency)}</span>
                        </div>
                        {totals.amountPaid > 0 && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Amount Paid</span>
                            <span>-{formatCurrencyDisplay(totals.amountPaid, invoiceData.currency)}</span>
                          </div>
                        )}
                        {(totals.amountPaid > 0 || totals.previousDue > 0) && (
                          <>
                            <Separator />
                            <div className="flex justify-between text-base font-bold">
                              <span>Balance Due</span>
                              <span className="text-primary">{formatCurrencyDisplay(totals.balanceDue, invoiceData.currency)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Section: Notes */}
                <Collapsible open={sectionsOpen.notes} onOpenChange={() => toggleSection("notes")}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-4 rounded-xl bg-card border hover:border-primary/30 transition-colors shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                          <FileText className="size-4 text-slate-600" />
                        </div>
                        <span className="font-semibold">Notes</span>
                      </div>
                      <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${sectionsOpen.notes ? "rotate-180" : ""}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 pt-3 space-y-3">
                      <Textarea
                        value={invoiceData.notes}
                        onChange={(e) => updateField("notes", e.target.value)}
                        placeholder="Payment terms, bank details, thank you message..."
                        rows={3}
                        className="resize-none"
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Section: Bank Details */}
                <Collapsible open={sectionsOpen.bankDetails} onOpenChange={() => toggleSection("bankDetails")}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-4 rounded-xl bg-card border hover:border-primary/30 transition-colors shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                          <Building2 className="size-4 text-emerald-600" />
                        </div>
                        <span className="font-semibold">Bank Details</span>
                      </div>
                      <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${sectionsOpen.bankDetails ? "rotate-180" : ""}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 pt-3 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">Bank Name</Label>
                          <Input
                            type="text"
                            placeholder="e.g., HDFC Bank, Chase, Barclays"
                            value={invoiceData.bankName || ""}
                            onChange={(e) => updateField("bankName", e.target.value)}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">Account Number</Label>
                          <Input
                            type="text"
                            placeholder="e.g., XXXX XXXX XXXX"
                            value={invoiceData.bankAccountNo || ""}
                            onChange={(e) => updateField("bankAccountNo", e.target.value)}
                            className="h-9"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">
                          {invoiceData.currency === "INR" ? "IFSC Code" : "SWIFT / BIC Code"}
                        </Label>
                        <Input
                          type="text"
                          placeholder={invoiceData.currency === "INR" ? "e.g., HDFC0001234" : "e.g., CHASUS33XXX"}
                          value={invoiceData.bankBranch || ""}
                          onChange={(e) => updateField("bankBranch", e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Authorized Signatory</Label>
                        <Input
                          type="text"
                          placeholder="Name for signature"
                          value={invoiceData.signatureName || ""}
                          onChange={(e) => updateField("signatureName", e.target.value)}
                          className="h-9"
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Section: Terms & Conditions */}
                <Collapsible open={sectionsOpen.termsAndConditions} onOpenChange={() => toggleSection("termsAndConditions")}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-4 rounded-xl bg-card border hover:border-primary/30 transition-colors shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                          <FileText className="size-4 text-amber-600" />
                        </div>
                        <span className="font-semibold">Terms & Conditions</span>
                      </div>
                      <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${sectionsOpen.termsAndConditions ? "rotate-180" : ""}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 pt-3 space-y-3">
                      <Textarea
                        value={invoiceData.termsAndConditions || ""}
                        onChange={(e) => updateField("termsAndConditions", e.target.value)}
                        placeholder="Payment is due within 30 days. Late payments may incur interest. Goods remain property of seller until paid in full..."
                        rows={3}
                        className="resize-none text-xs"
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Section: QR Code for Payment */}
                <Collapsible open={sectionsOpen.qrCode} onOpenChange={() => toggleSection("qrCode")}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-4 rounded-xl bg-card border hover:border-primary/30 transition-colors shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                          <QrCode className="size-4 text-violet-600" />
                        </div>
                        <span className="font-semibold">QR Code for Payment</span>
                        {qrEnabled && <Badge className="text-[8px] px-1.5 bg-emerald-100 text-emerald-700 border-emerald-200">ON</Badge>}
                      </div>
                      <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${sectionsOpen.qrCode ? "rotate-180" : ""}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 pt-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-xs font-medium text-muted-foreground">Enable QR Code</Label>
                          <p className="text-[10px] text-muted-foreground">Adds a scannable QR code to your invoice PDF</p>
                        </div>
                        <button
                          onClick={() => setQrEnabled(!qrEnabled)}
                          className={`relative w-11 h-6 rounded-full transition-colors ${qrEnabled ? "bg-primary" : "bg-muted"}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${qrEnabled ? "translate-x-5" : ""}`} />
                        </button>
                      </div>
                      {qrEnabled && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Payment URL (UPI, PayPal, bank link, etc.)
                          </Label>
                          <Input
                            type="text"
                            placeholder="e.g., upi://pay?pa=name@upi&pn=Name&am=500&cu=INR"
                            value={invoiceData.qrCodeUrl || ""}
                            onChange={(e) => updateField("qrCodeUrl", e.target.value)}
                            className="h-9 text-xs"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Enter any payment URL — UPI, PayPal.me, Stripe link, or bank payment page
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            When scanned, this QR code will safely redirect the payer to your payment link.
                          </p>
                          {invoiceData.qrCodeUrl && (
                            <div className="mt-2 p-3 bg-muted/50 rounded-lg flex items-center gap-3">
                              <div className="w-20 h-20 bg-white rounded-lg border-2 border-primary/20 flex items-center justify-center overflow-hidden p-1">
                                <img
                                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(invoiceData.qrCodeUrl)}&format=png`}
                                  alt="QR Code Preview"
                                  className="w-full h-full"
                                  crossOrigin="anonymous"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium">QR Code Ready</p>
                                <p className="text-[10px] text-muted-foreground truncate">{invoiceData.qrCodeUrl}</p>
                                <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                                  <CheckCircle2 className="size-3" /> Scan redirects to payment link
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Section: Template Selection */}
                <Collapsible open={sectionsOpen.template} onOpenChange={() => toggleSection("template")}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-4 rounded-xl bg-card border hover:border-primary/30 transition-colors shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Palette className="size-4 text-primary" />
                        </div>
                        <span className="font-semibold">Template</span>
                        <Badge variant="secondary" className="text-xs">6 themes</Badge>
                      </div>
                      <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${sectionsOpen.template ? "rotate-180" : ""}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 pt-3">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {TEMPLATES.map((tmpl) => {
                          const isSelected = invoiceData.template === tmpl.id;
                          return (
                            <button
                              key={tmpl.id}
                              onClick={() => setTemplate(tmpl.id)}
                              className={`relative text-left rounded-xl border-2 overflow-hidden transition-all hover:shadow-md ${
                                isSelected ? "border-primary ring-2 ring-primary/20 shadow-md" : "border-muted hover:border-primary/30"
                              }`}
                            >
                              {/* Same mini preview for all - just colors change */}
                              <div className="h-28 relative overflow-hidden" style={{ backgroundColor: tmpl.bg }}>
                                {/* Header banner */}
                                <div className="h-7 w-full relative" style={{ background: `linear-gradient(90deg, ${tmpl.accent}cc, ${tmpl.accent}88)` }}>
                                  <div className="absolute top-1 left-2 text-white font-bold text-[6px]">INVOICE</div>
                                  <div className="absolute top-1 right-2 text-white/70 text-[4px]">#001</div>
                                  <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: `${tmpl.accent}66` }} />
                                </div>
                                {/* From / Bill To boxes */}
                                <div className="flex gap-1 p-1.5">
                                  <div className="flex-1 rounded-sm border p-0.5" style={{ borderColor: `${tmpl.accent}30`, backgroundColor: `${tmpl.accent}08` }}>
                                    <div className="text-[4px] font-bold mb-0.5" style={{ color: tmpl.accent }}>FROM</div>
                                    <div className="h-0.5 w-10 bg-muted/50 rounded" /><div className="h-0.5 w-7 bg-muted/30 rounded mt-0.5" />
                                  </div>
                                  <div className="flex-1 rounded-sm border p-0.5" style={{ borderColor: `${tmpl.accent}30`, backgroundColor: `${tmpl.accent}08` }}>
                                    <div className="text-[4px] font-bold mb-0.5" style={{ color: tmpl.accent }}>BILL TO</div>
                                    <div className="h-0.5 w-8 bg-muted/50 rounded" /><div className="h-0.5 w-6 bg-muted/30 rounded mt-0.5" />
                                  </div>
                                </div>
                                {/* Table */}
                                <div className="mx-1.5">
                                  <div className="h-1.5 w-full rounded-sm" style={{ backgroundColor: tmpl.accent, opacity: 0.8 }} />
                                  <div className="h-0.5 w-full bg-muted/30 rounded mt-0.5" />
                                  <div className="h-0.5 w-full bg-muted/20 rounded mt-0.5" />
                                </div>
                                {/* Footer bar */}
                                <div className="absolute bottom-0 left-0 right-0 h-1.5" style={{ backgroundColor: tmpl.accent }} />
                              </div>
                              {/* Template info */}
                              <div className="p-2 bg-card">
                                <span className="text-xs font-semibold">{tmpl.name}</span>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{tmpl.desc}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Download & Print Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <div className="flex flex-1 gap-2">
                    <Button onClick={handleDownloadAll} disabled={isGenerating} className="flex-1 gap-2 shadow-lg">
                      {isGenerating ? (
                        <>
                          <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          {downloadFormat === "pdf" ? <Download className="size-4" /> : <Image className="size-4" />}
                          Download {downloadFormat.toUpperCase()}
                        </>
                      )}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="h-auto px-3" title="Change format">
                          <ChevronUp className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => setDownloadFormat("pdf")} className={downloadFormat === "pdf" ? "bg-accent" : ""}>
                          <FileText className="size-4 mr-2 text-red-500" />
                          PDF Document
                          {downloadFormat === "pdf" && <CheckCircle2 className="size-3 ml-auto text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDownloadFormat("jpeg")} className={downloadFormat === "jpeg" ? "bg-accent" : ""}>
                          <Image className="size-4 mr-2 text-amber-500" />
                          JPEG Image (2x)
                          {downloadFormat === "jpeg" && <CheckCircle2 className="size-3 ml-auto text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDownloadFormat("png")} className={downloadFormat === "png" ? "bg-accent" : ""}>
                          <Image className="size-4 mr-2 text-emerald-500" />
                          PNG Image (2x)
                          {downloadFormat === "png" && <CheckCircle2 className="size-3 ml-auto text-primary" />}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Button variant="outline" onClick={handlePrint} className="flex-1 gap-2 sm:flex-initial">
                    <Printer className="size-4" />
                    Print
                  </Button>
                </div>
              </div>

              {/* RIGHT: Live Preview (40%) */}
              <div className="w-full lg:w-[40%]">
                <div className="sticky top-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-medium text-muted-foreground">Live Preview</span>
                  </div>
                  <div className="rounded-xl border bg-muted/30 p-2 shadow-inner">
                    <div className="max-h-[75vh] overflow-y-auto">
                      {renderInvoicePreview()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ===== TAB: Upload & Edit ===== */}
          <TabsContent value="upload">
            <div className="max-w-3xl mx-auto">
              {!uploadedPdfFile ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div
                    className={`relative rounded-2xl border-2 border-dashed p-12 text-center transition-colors cursor-pointer ${
                      isDragOver
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById("pdf-upload-input")?.click()}
                  >
                    <input
                      id="pdf-upload-input"
                      type="file"
                      accept="application/pdf"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <FileUp className="size-8 text-primary" />
                      </div>
                      <div>
                        <p className="text-lg font-semibold">
                          {isDragOver ? "Drop your PDF here" : "Drag & drop your invoice PDF"}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          or click to browse — max 50MB
                        </p>
                      </div>
                      <Badge variant="secondary" className="gap-1.5">
                        <Shield className="size-3 text-emerald-500" />
                        Files never leave your browser
                      </Badge>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <FileText className="size-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{uploadedPdfFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(uploadedPdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { setUploadedPdfFile(null); setUploadedPdfText(""); }}>
                      Upload New
                    </Button>
                  </div>

                  {isParsing ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <span className="size-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <p className="text-sm text-muted-foreground">Extracting text from PDF...</p>
                      </div>
                    </div>
                  ) : uploadedPdfText ? (
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium mb-2 block">Extracted Text</Label>
                        <Textarea
                          value={uploadedPdfText}
                          onChange={(e) => setUploadedPdfText(e.target.value)}
                          rows={16}
                          className="resize-y font-mono text-sm"
                        />
                      </div>
                      <div className="flex gap-3">
                        <Button
                          onClick={() => {
                            const blob = new Blob([uploadedPdfText], { type: "text/plain" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `extracted-${uploadedPdfFile.name.replace(".pdf", "")}.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                            toast({ title: "Text downloaded!" });
                          }}
                          className="gap-2"
                        >
                          <Download className="size-4" />
                          Download Text
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Shield className="size-3" />
                        All processing happens locally in your browser. Your data never leaves your device.
                      </p>
                    </div>
                  ) : null}
                </motion.div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );

  // ========================
  // FEATURES SECTION
  // ========================
  const renderFeatures = () => {
    const features = [
      { icon: Zap, title: "1 Token = 1 Invoice", description: "Simple and fair — every invoice download costs 1 Non-AI token. Premium users get unlimited.", color: "text-amber-500", bg: "bg-amber-50" },
      { icon: Shield, title: "No Account Needed", description: "Start creating invoices immediately. No signup, no email, no login.", color: "text-emerald-500", bg: "bg-emerald-50" },
      { icon: Globe, title: "40+ Currencies", description: "Support for USD, EUR, GBP, INR, and 36 more world currencies.", color: "text-blue-500", bg: "bg-blue-50" },
      { icon: Languages, title: "31 Languages", description: "Create invoices in English, Hindi, Spanish, French, and more.", color: "text-violet-500", bg: "bg-violet-50" },
      { icon: Download, title: "Instant PDF", description: "Download professional PDF invoices instantly. No watermarks.", color: "text-pink-500", bg: "bg-pink-50" },
      { icon: Smartphone, title: "Mobile Friendly", description: "Create invoices on any device. Fully responsive design.", color: "text-cyan-500", bg: "bg-cyan-50" },
    ];

    return (
      <section className="py-16 sm:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12 sm:mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Why Choose Our Invoice Generator?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Professional-grade invoicing tools built with simplicity and power.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="group p-6 rounded-xl border bg-card hover:shadow-lg hover:border-primary/10 transition-all"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${feature.bg} group-hover:scale-105 transition-transform`}>
                  <feature.icon className={`w-6 h-6 ${feature.color}`} />
                </div>
                <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    );
  };

  // ========================
  // FAQ SECTION
  // ========================
  const renderFAQ = () => {
    const faqs = [
      { q: "Is it really free?", a: "The first 12 invoices per month are free with the Free plan. Each invoice costs 1 Non-AI token. Upgrade to Premium for unlimited invoices per month along with all other PDF tools." },
      { q: "Do I need an account?", a: "No signup required. You can start creating invoices immediately without creating an account, providing an email, or logging in." },
      { q: "How many invoices can I create?", a: "Free plan: 12 invoices per month (1 token each). Premium plan: Unlimited invoices. Enterprise plan: Unlimited invoices with team features." },
      { q: "What currencies are supported?", a: "We support 40+ currencies including USD, EUR, GBP, INR, CAD, AUD, JPY, CNY, and many more. The currency formatting adapts to each currency's locale conventions." },
      { q: "Are there custom templates?", a: "Yes! We offer 6 professional color themes: Classic, Royal Blue, Emerald, Crimson, Amber Gold, and Violet. All use the same premium invoice layout with your choice of accent color." },
      { q: "Can I upload an existing PDF invoice?", a: "Yes! Use the 'Upload & Edit' tab to drag-and-drop a PDF invoice. Our system extracts the text content so you can review and edit it." },
      { q: "What languages are available?", a: "We support 31 languages for invoice creation including English, Hindi, Spanish, French, German, Chinese, Japanese, Korean, Arabic, and many more." },
      { q: "Is my data secure?", a: "Absolutely. All invoice processing happens entirely in your browser. No data is ever sent to our servers. Your invoices and personal information stay on your device." },
    ];

    return (
      <section className="py-16 sm:py-24 bg-background">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-muted-foreground">
              Everything you need to know about our invoice generator.
            </p>
          </motion.div>

          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`faq-${index}`}>
                <AccordionTrigger className="text-left text-sm sm:text-base hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    );
  };

  // ========================
  // BOTTOM CTA SECTION
  // ========================
  const renderBottomCTA = () => (
    <section className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative rounded-3xl overflow-hidden"
        >
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/90 via-primary to-primary/80" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.08),transparent_50%)]" />

          {/* Pattern overlay */}
          <div className="absolute inset-0 opacity-5">
            <div
              className="w-full h-full"
              style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
                backgroundSize: "24px 24px",
              }}
            />
          </div>

          <div className="relative px-6 py-16 sm:px-12 sm:py-20 lg:px-20 lg:py-24 text-center">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white/90 text-sm font-medium mb-6">
                <Sparkles className="w-4 h-4" />
                Start Creating — It&apos;s Free
              </div>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight"
            >
              Create Your First Invoice Today
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="text-lg text-white/80 max-w-xl mx-auto mb-8 leading-relaxed"
            >
              Join thousands of freelancers and businesses who create professional invoices with PdfCrux.
              1 token = 1 invoice.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
            >
              <Button
                size="lg"
                variant="secondary"
                className="h-12 px-8 text-base gap-2 bg-white text-primary hover:bg-white/90 shadow-xl"
                onClick={scrollToTool}
              >
                <Receipt className="w-5 h-5" />
                Build New Invoice
                <ArrowRight className="w-4 h-4" />
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );

  // ========================
  // MOBILE STICKY BAR
  // ========================
  const renderMobileSticky = () => (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-sm border-t px-4 py-3 safe-area-bottom">
      <Button
        onClick={scrollToTool}
        className="w-full h-11 gap-2 shadow-lg"
      >
        <Receipt className="size-4" />
        Create Invoice
      </Button>
    </div>
  );

  // ========================
  // MAIN RENDER
  // ========================
  return (
    <div className="min-h-screen flex flex-col">
      {/* Hidden full-size invoice for PDF/image capture (WYSIWYG) */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-9999px',
          top: '0',
          zIndex: '-9999',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {renderFullSizeInvoice()}
      </div>
      <main className="flex-1">
        {renderHero()}
        {renderMainTool()}
        {renderFeatures()}
        {renderFAQ()}
        {renderBottomCTA()}
      </main>
      {/* Spacer for mobile sticky bar */}
      <div className="h-16 md:hidden" />
      {renderMobileSticky()}
    </div>
  );
}
