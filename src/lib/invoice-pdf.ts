/**
 * Invoice PDF Generation Library
 * Generates professional PDF invoices using pdf-lib
 * 6 color themes with ONE premium layout: Classic, Royal Blue, Emerald, Crimson, Amber Gold, Violet
 * 40 currencies, 31 languages, QR code support, country-specific tax
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { getPdfLabels, InvoiceLabels } from "./invoice-labels";

// ========================
// Types
// ========================

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
}

export interface InvoiceData {
  yourName: string;
  yourEmail: string;
  yourPhone: string;
  yourAddress: string;
  logoDataUrl?: string;
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  items: InvoiceItem[];
  taxPercent: number;
  discountPercent: number;
  shippingCharge: number;
  amountPaid: number;
  previousDue: number;
  taxRegNumber?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankBranch?: string;
  termsAndConditions?: string;
  signatureName?: string;
  notes: string;
  template: string;
  language: string;
  // QR Code for payment (optional)
  qrCodeEnabled?: boolean;
  qrCodeUrl?: string; // UPI URL, payment link, etc.
  // Tax type override (optional, auto-detects from currency if empty)
  taxType?: string;
}

// ========================
// Currencies (40)
// ========================

export const CURRENCIES: Record<string, { symbol: string; name: string; code: string; locale: string }> = {
  USD: { symbol: "$", name: "US Dollar", code: "USD", locale: "en-US" },
  EUR: { symbol: "\u20AC", name: "Euro", code: "EUR", locale: "de-DE" },
  GBP: { symbol: "\u00A3", name: "British Pound", code: "GBP", locale: "en-GB" },
  INR: { symbol: "\u20B9", name: "Indian Rupee", code: "INR", locale: "en-IN" },
  CAD: { symbol: "C$", name: "Canadian Dollar", code: "CAD", locale: "en-CA" },
  AUD: { symbol: "A$", name: "Australian Dollar", code: "AUD", locale: "en-AU" },
  JPY: { symbol: "\u00A5", name: "Japanese Yen", code: "JPY", locale: "ja-JP" },
  CNY: { symbol: "\u00A5", name: "Chinese Yuan", code: "CNY", locale: "zh-CN" },
  KRW: { symbol: "\u20A9", name: "South Korean Won", code: "KRW", locale: "ko-KR" },
  SGD: { symbol: "S$", name: "Singapore Dollar", code: "SGD", locale: "en-SG" },
  MYR: { symbol: "RM", name: "Malaysian Ringgit", code: "MYR", locale: "ms-MY" },
  THB: { symbol: "\u0E3F", name: "Thai Baht", code: "THB", locale: "th-TH" },
  AED: { symbol: "\u062F.\u0625", name: "UAE Dirham", code: "AED", locale: "ar-AE" },
  SAR: { symbol: "\uFEEC", name: "Saudi Riyal", code: "SAR", locale: "ar-SA" },
  BRL: { symbol: "R$", name: "Brazilian Real", code: "BRL", locale: "pt-BR" },
  MXN: { symbol: "$", name: "Mexican Peso", code: "MXN", locale: "es-MX" },
  ZAR: { symbol: "R", name: "South African Rand", code: "ZAR", locale: "en-ZA" },
  NGN: { symbol: "\u20A6", name: "Nigerian Naira", code: "NGN", locale: "en-NG" },
  EGP: { symbol: "E\u00A3", name: "Egyptian Pound", code: "EGP", locale: "ar-EG" },
  CHF: { symbol: "CHF", name: "Swiss Franc", code: "CHF", locale: "de-CH" },
  SEK: { symbol: "kr", name: "Swedish Krona", code: "SEK", locale: "sv-SE" },
  NOK: { symbol: "kr", name: "Norwegian Krone", code: "NOK", locale: "nb-NO" },
  DKK: { symbol: "kr", name: "Danish Krone", code: "DKK", locale: "da-DK" },
  PLN: { symbol: "z\u0142", name: "Polish Zloty", code: "PLN", locale: "pl-PL" },
  TRY: { symbol: "\u20BA", name: "Turkish Lira", code: "TRY", locale: "tr-TR" },
  RUB: { symbol: "\u20BD", name: "Russian Ruble", code: "RUB", locale: "ru-RU" },
  HKD: { symbol: "HK$", name: "Hong Kong Dollar", code: "HKD", locale: "en-HK" },
  TWD: { symbol: "NT$", name: "Taiwan Dollar", code: "TWD", locale: "zh-TW" },
  IDR: { symbol: "Rp", name: "Indonesian Rupiah", code: "IDR", locale: "id-ID" },
  PHP: { symbol: "\u20B1", name: "Philippine Peso", code: "PHP", locale: "en-PH" },
  NZD: { symbol: "NZ$", name: "New Zealand Dollar", code: "NZD", locale: "en-NZ" },
  CZK: { symbol: "K\u010D", name: "Czech Koruna", code: "CZK", locale: "cs-CZ" },
  ILS: { symbol: "\u20AA", name: "Israeli Shekel", code: "ILS", locale: "he-IL" },
  CLP: { symbol: "CLP$", name: "Chilean Peso", code: "CLP", locale: "es-CL" },
  COP: { symbol: "COL$", name: "Colombian Peso", code: "COP", locale: "es-CO" },
  ARS: { symbol: "AR$", name: "Argentine Peso", code: "ARS", locale: "es-AR" },
  PKR: { symbol: "\u20A8", name: "Pakistani Rupee", code: "PKR", locale: "ur-PK" },
  BDT: { symbol: "\u09F3", name: "Bangladeshi Taka", code: "BDT", locale: "bn-BD" },
  VND: { symbol: "\u20AB", name: "Vietnamese Dong", code: "VND", locale: "vi-VN" },
};

// ========================
// Country-Specific Tax Configuration
// ========================

export interface TaxConfig {
  taxLabel: string;
  taxRates: number[];
  defaultTaxRate: number;
  regLabel: string;
  regPlaceholder: string;
}

export const CURRENCY_TAX_CONFIG: Record<string, TaxConfig> = {
  USD: { taxLabel: "Sales Tax", taxRates: [0], defaultTaxRate: 0, regLabel: "EIN", regPlaceholder: "XX-XXXXXXX" },
  EUR: { taxLabel: "VAT", taxRates: [19, 20, 21, 22, 23, 24, 25], defaultTaxRate: 20, regLabel: "VAT No.", regPlaceholder: "DE123456789" },
  GBP: { taxLabel: "VAT", taxRates: [5, 20], defaultTaxRate: 20, regLabel: "VAT No.", regPlaceholder: "GB123456789" },
  INR: { taxLabel: "GST", taxRates: [5, 12, 18, 28], defaultTaxRate: 18, regLabel: "GSTIN", regPlaceholder: "22AAAAA0000A1Z5" },
  CAD: { taxLabel: "GST/HST", taxRates: [5, 13, 15], defaultTaxRate: 5, regLabel: "GST/HST No.", regPlaceholder: "123456789 RT0001" },
  AUD: { taxLabel: "GST", taxRates: [10], defaultTaxRate: 10, regLabel: "ABN", regPlaceholder: "XX XXX XXX XXX" },
  JPY: { taxLabel: "Consumption Tax", taxRates: [8, 10], defaultTaxRate: 10, regLabel: "Tax No.", regPlaceholder: "T1234567890001" },
  CNY: { taxLabel: "VAT", taxRates: [6, 9, 13], defaultTaxRate: 13, regLabel: "Tax No.", regPlaceholder: "913100000000000000" },
  KRW: { taxLabel: "VAT", taxRates: [10], defaultTaxRate: 10, regLabel: "BRN", regPlaceholder: "XXX-XX-XXXXX" },
  SGD: { taxLabel: "GST", taxRates: [7, 8, 9], defaultTaxRate: 9, regLabel: "UEN", regPlaceholder: "XXXXXXXXXXX" },
  MYR: { taxLabel: "SST", taxRates: [5, 6, 8, 10], defaultTaxRate: 8, regLabel: "SST No.", regPlaceholder: "XX-XXXXXXX-XX" },
  THB: { taxLabel: "VAT", taxRates: [7], defaultTaxRate: 7, regLabel: "Tax ID", regPlaceholder: "X-XXXX-XXXX-XXX" },
  AED: { taxLabel: "VAT", taxRates: [5], defaultTaxRate: 5, regLabel: "TRN", regPlaceholder: "100000000000000" },
  SAR: { taxLabel: "VAT", taxRates: [15], defaultTaxRate: 15, regLabel: "VAT No.", regPlaceholder: "300000000000003" },
  BRL: { taxLabel: "ICMS", taxRates: [12, 17, 18], defaultTaxRate: 17, regLabel: "CNPJ", regPlaceholder: "XX.XXX.XXX/0001-XX" },
  MXN: { taxLabel: "IVA", taxRates: [16], defaultTaxRate: 16, regLabel: "RFC", regPlaceholder: "XAXX010101000" },
  ZAR: { taxLabel: "VAT", taxRates: [15], defaultTaxRate: 15, regLabel: "VAT No.", regPlaceholder: "4000000000" },
  NGN: { taxLabel: "VAT", taxRates: [5, 7.5], defaultTaxRate: 7.5, regLabel: "TIN", regPlaceholder: "00000000-0000" },
  EGP: { taxLabel: "VAT", taxRates: [14], defaultTaxRate: 14, regLabel: "Tax No.", regPlaceholder: "XXX-XXXXXX" },
  CHF: { taxLabel: "VAT", taxRates: [7.7, 8.1], defaultTaxRate: 8.1, regLabel: "UID", regPlaceholder: "CHE-XXX.XXX.XXX" },
  SEK: { taxLabel: "Moms", taxRates: [12, 25], defaultTaxRate: 25, regLabel: "VAT No.", regPlaceholder: "SEXXXXXXXXXX01" },
  NOK: { taxLabel: "Mva", taxRates: [12, 25], defaultTaxRate: 25, regLabel: "VAT No.", regPlaceholder: "NOXXXXXXXXXX" },
  DKK: { taxLabel: "Moms", taxRates: [25], defaultTaxRate: 25, regLabel: "VAT No.", regPlaceholder: "DKXXXXXXXXXX" },
  PLN: { taxLabel: "VAT", taxRates: [5, 8, 23], defaultTaxRate: 23, regLabel: "NIP", regPlaceholder: "XXX-XXX-XX-XX" },
  TRY: { taxLabel: "KDV", taxRates: [1, 10, 20], defaultTaxRate: 20, regLabel: "VKN", regPlaceholder: "XXXXXXXXXXXX" },
  RUB: { taxLabel: "NDS", taxRates: [0, 10, 20], defaultTaxRate: 20, regLabel: "INN", regPlaceholder: "XXXXXXXXXXXX" },
  HKD: { taxLabel: "Tax", taxRates: [0], defaultTaxRate: 0, regLabel: "BR No.", regPlaceholder: "XX-XXXXXX-X" },
  TWD: { taxLabel: "VAT", taxRates: [5], defaultTaxRate: 5, regLabel: "Tax No.", regPlaceholder: "XXXXXXXXXX" },
  IDR: { taxLabel: "PPN", taxRates: [11], defaultTaxRate: 11, regLabel: "NPWP", regPlaceholder: "XX.XXX.XXX.X-XXX.XXX" },
  PHP: { taxLabel: "VAT", taxRates: [12], defaultTaxRate: 12, regLabel: "TIN", regPlaceholder: "XXX-XXX-XXX-000" },
  NZD: { taxLabel: "GST", taxRates: [0, 15], defaultTaxRate: 15, regLabel: "GST No.", regPlaceholder: "XX-XXX-XXX" },
  CZK: { taxLabel: "DPH", taxRates: [12, 21], defaultTaxRate: 21, regLabel: "DIC", regPlaceholder: "XXXXXXXXXX" },
  ILS: { taxLabel: "VAT", taxRates: [17], defaultTaxRate: 17, regLabel: "Tax ID", regPlaceholder: "XXXXXXXX" },
  CLP: { taxLabel: "IVA", taxRates: [19], defaultTaxRate: 19, regLabel: "RUT", regPlaceholder: "XX.XXX.XXX-X" },
  COP: { taxLabel: "IVA", taxRates: [5, 19], defaultTaxRate: 19, regLabel: "NIT", regPlaceholder: "XXX.XXX.XXX-X" },
  ARS: { taxLabel: "IVA", taxRates: [21], defaultTaxRate: 21, regLabel: "CUIT", regPlaceholder: "XX-XXXXXXXX-X" },
  PKR: { taxLabel: "GST", taxRates: [0, 16, 17], defaultTaxRate: 0, regLabel: "NTN", regPlaceholder: "XXXXXXXX-X" },
  BDT: { taxLabel: "VAT", taxRates: [5, 15], defaultTaxRate: 15, regLabel: "BIN", regPlaceholder: "XXXXXXXXXX" },
  VND: { taxLabel: "VAT", taxRates: [5, 8, 10], defaultTaxRate: 10, regLabel: "Tax No.", regPlaceholder: "XXXXXXXXXXXX" },
};

export function getTaxConfig(currencyCode: string): TaxConfig {
  return CURRENCY_TAX_CONFIG[currencyCode] || CURRENCY_TAX_CONFIG.USD;
}

// ========================
// Tax Types (manual override)
// ========================

export const TAX_TYPES = [
  { value: "auto", label: "Auto (from currency)" },
  { value: "GST", label: "GST (Goods & Services Tax)" },
  { value: "VAT", label: "VAT (Value Added Tax)" },
  { value: "Sales Tax", label: "Sales Tax" },
  { value: "Consumption Tax", label: "Consumption Tax" },
  { value: "GST/HST", label: "GST/HST (Canada)" },
  { value: "SST", label: "SST (Sales & Service Tax)" },
  { value: "IVA", label: "IVA (Impuesto al Valor Agregado)" },
  { value: "ICMS", label: "ICMS (Brazil)" },
  { value: "KDV", label: "KDV (Turkey)" },
  { value: "NDS", label: "NDS (Russia)" },
  { value: "Moms", label: "Moms (Sweden/Denmark)" },
  { value: "Mva", label: "Mva (Norway)" },
  { value: "PPN", label: "PPN (Indonesia)" },
  { value: "DPH", label: "DPH (Czech)" },
  { value: "None", label: "No Tax" },
];

// ========================
// Helpers
// ========================

// WinAnsi (PDF standard font) safe currency symbols
// Many Unicode symbols like ₹ ฿ ₺ ₽ ₦ ₫ ₱ ₩ ৳ ﷼ are NOT in WinAnsi
// We fall back to 3-letter currency codes for those
const WINANSI_SAFE_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "\u20AC", GBP: "\u00A3", CAD: "C$", AUD: "A$",
  JPY: "\u00A5", CNY: "\u00A5", HKD: "HK$", TWD: "NT$", SGD: "S$",
  NZD: "NZ$", CHF: "CHF", SEK: "kr", NOK: "kr", DKK: "kr",
  CZK: "K\u010D", PLN: "z\u0142", BRL: "R$", MXN: "MX$",
  ARS: "AR$", CLP: "CLP$", COP: "COL$", ZAR: "R",
  // These symbols are NOT in WinAnsi — use currency code
  INR: "Rs.",   // ₹ (U+20B9)
  KRW: "KRW",   // ₩ (U+20A9)
  THB: "THB",   // ฿ (U+0E3F)
  AED: "AED",   // ﷼
  SAR: "SAR",   // ﷼
  NGN: "NGN",   // ₦ (U+20A6)
  EGP: "E\u00A3", // E£ — £ IS in WinAnsi
  TRY: "TRY",   // ₺ (U+20BA)
  RUB: "RUB",   // ₽ (U+20BD)
  MYR: "RM",    // RM is ASCII-safe
  IDR: "Rp",    // Rp is ASCII-safe
  PHP: "PHP",   // ₱ (U+20B1)
  ILS: "ILS",   // ₪ (U+20AA)
  PKR: "PKR",   // ₨
  BDT: "BDT",   // ৳ (U+09F3)
  VND: "VND",   // ₫ (U+20AB)
};

function getCurrencySymbol(code: string): string {
  return WINANSI_SAFE_SYMBOLS[code] || CURRENCIES[code]?.symbol || "$";
}

function formatCurrency(amount: number, currencyKey: string): string {
  const symbol = getCurrencySymbol(currencyKey);
  return `${symbol}${amount.toFixed(2)}`;
}

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawMultilineText(page: any, x: number, y: number, text: string, font: any, size: number, color: any, maxWidth: number): number {
  const lines = wrapText(text, font, size, maxWidth);
  for (const line of lines) {
    if (y < 50) break;
    page.drawText(line, { x, y, size, font, color });
    y -= size + 4;
  }
  return y;
}

function drawSectionLabel(page: any, x: number, y: number, label: string, fontBold: any, color: any) {
  page.drawText(label, { x, y, size: 9, font: fontBold, color });
}

// Draw text right-aligned within a region
function drawRightAligned(page: any, text: string, leftX: number, regionW: number, yPos: number, fnt: any, sz: number, clr: any) {
  const textW = fnt.widthOfTextAtSize(text, sz);
  page.drawText(text, { x: leftX + regionW - 10 - textW, y: yPos, size: sz, font: fnt, color: clr });
}

// Draw text center-aligned within a region
function drawCenterAligned(page: any, text: string, leftX: number, regionW: number, yPos: number, fnt: any, sz: number, clr: any) {
  const textW = fnt.widthOfTextAtSize(text, sz);
  page.drawText(text, { x: leftX + (regionW - textW) / 2, y: yPos, size: sz, font: fnt, color: clr });
}

// Draw text with truncation
function drawTruncated(page: any, text: string, xPos: number, yPos: number, fnt: any, sz: number, clr: any, maxW: number) {
  if (fnt.widthOfTextAtSize(text, sz) <= maxW) {
    page.drawText(text, { x: xPos, y: yPos, size: sz, font: fnt, color: clr });
  } else {
    let t = text;
    while (t.length > 1 && fnt.widthOfTextAtSize(t + "...", sz) > maxW) t = t.slice(0, -1);
    page.drawText(t + "...", { x: xPos, y: yPos, size: sz, font: fnt, color: clr });
  }
}

// Draw logo on page, returns logoW or 0
async function drawLogo(page: any, x: number, y: number, dataUrl: string, maxH: number): Promise<number> {
  try {
    const base64Data = dataUrl.split(",")[1];
    if (!base64Data) return 0;
    const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const image = dataUrl.includes("image/png") ? await page.doc.embedPng(bytes) : await page.doc.embedJpg(bytes);
    const scale = maxH / image.height;
    const logoW = image.width * scale;
    page.drawImage(image, { x, y: y - maxH, width: logoW, height: maxH });
    return logoW;
  } catch {
    return 0;
  }
}

// Draw items table (shared logic, different styling per template)
function drawItemsTable(
  page: any, y: number, items: InvoiceItem[], data: InvoiceData,
  tableX: number, tableW: number, colWidths: number[], rowH: number, headerH: number,
  font: any, fontBold: any, fontItalic: any,
  hasAccent: boolean, accentColor: any, white: any, text: any, textLight: any,
  tableBorder: any, altRow: any, labels: InvoiceLabels
): number {
  // Header bg
  if (hasAccent) {
    page.drawRectangle({ x: tableX, y: y - headerH, width: tableW, height: headerH, color: accentColor });
  }
  // Column separators in header
  let sx = tableX + colWidths[0];
  for (let i = 0; i < 3; i++) {
    page.drawLine({ start: { x: sx, y }, end: { x: sx, y: y - headerH }, thickness: 0.3, color: hasAccent ? white : tableBorder });
    sx += colWidths[i + 1];
  }
  // Header text
  const htY = y - headerH + 11;
  const hColor = hasAccent ? white : textLight;
  page.drawText(labels.description, { x: tableX + 10, y: htY, size: 9, font: fontBold, color: hColor });
  drawCenterAligned(page, labels.qty, tableX + colWidths[0], colWidths[1], htY, fontBold, 9, hColor);
  drawRightAligned(page, labels.rate, tableX + colWidths[0] + colWidths[1], colWidths[2], htY, fontBold, 9, hColor);
  drawRightAligned(page, labels.amount, tableX + colWidths[0] + colWidths[1] + colWidths[2], colWidths[3], htY, fontBold, 9, hColor);

  page.drawLine({ start: { x: tableX, y }, end: { x: tableX + tableW, y }, thickness: 1, color: tableBorder });
  y -= headerH;

  if (items.length === 0) {
    page.drawText(labels.noItems, { x: tableX + 10, y: y - 18, size: 10, font: fontItalic, color: textLight });
    y -= rowH;
  }

  items.forEach((item, idx) => {
    if (y < 120) return;
    if (hasAccent && idx % 2 === 1) {
      page.drawRectangle({ x: tableX, y: y - rowH, width: tableW, height: rowH, color: altRow });
    }
    page.drawLine({ start: { x: tableX, y: y - rowH }, end: { x: tableX + tableW, y: y - rowH }, thickness: 0.5, color: tableBorder });
    let rsx = tableX + colWidths[0];
    for (let i = 0; i < 3; i++) {
      page.drawLine({ start: { x: rsx, y }, end: { x: rsx, y: y - rowH }, thickness: 0.2, color: tableBorder });
      rsx += colWidths[i + 1];
    }
    const amount = item.quantity * item.rate;
    const cellY = y - rowH + 10;
    drawTruncated(page, item.description || "\u2014", tableX + 10, cellY, font, 10, text, colWidths[0] - 20);
    drawCenterAligned(page, String(item.quantity), tableX + colWidths[0], colWidths[1], cellY, fontBold, 10, text);
    drawRightAligned(page, formatCurrency(item.rate, data.currency), tableX + colWidths[0] + colWidths[1], colWidths[2], cellY, fontBold, 10, text);
    drawRightAligned(page, formatCurrency(amount, data.currency), tableX + colWidths[0] + colWidths[1] + colWidths[2], colWidths[3], cellY, fontBold, 10, text);
    y -= rowH;
  });

  page.drawLine({ start: { x: tableX, y }, end: { x: tableX + tableW, y }, thickness: 1, color: tableBorder });
  return y;
}

// Draw totals section
function drawTotals(
  page: any, y: number, data: InvoiceData, labels: InvoiceLabels,
  totalsX: number, w: number, margin: number,
  font: any, fontBold: any,
  accent: any, text: any, textLight: any, accentGreen: any, totalBg: any,
  hasAccent: boolean
): number {
  const subtotal = data.items.reduce((s, i) => s + i.quantity * i.rate, 0);
  const discountAmt = subtotal * (data.discountPercent / 100);
  const afterDiscount = subtotal - discountAmt;
  const taxAmt = afterDiscount * (data.taxPercent / 100);
  const shippingCharge = data.shippingCharge || 0;
  const previousDue = data.previousDue || 0;
  const amountPaid = data.amountPaid || 0;
  const total = afterDiscount + taxAmt + shippingCharge + previousDue;
  const balanceDue = total - amountPaid;
  const taxCfg = getTaxConfig(data.currency);

  if (data.discountPercent > 0) {
    page.drawText(labels.subtotal, { x: totalsX, y, size: 10, font, color: textLight });
    drawRightAligned(page, formatCurrency(subtotal, data.currency), totalsX + 110, 140, y, fontBold, 10, text);
    y -= 20;
    page.drawText(`${labels.discount} (${data.discountPercent}%)`, { x: totalsX, y, size: 10, font, color: textLight });
    drawRightAligned(page, `-${formatCurrency(discountAmt, data.currency)}`, totalsX + 110, 140, y, font, 10, accentGreen);
    y -= 20;
  }
  if (data.taxPercent > 0) {
    const taxLabel = data.taxType && data.taxType !== "None" && data.taxType !== "auto" ? data.taxType : taxCfg.taxLabel;
    page.drawText(`${taxLabel} (${data.taxPercent}%)`, { x: totalsX, y, size: 10, font, color: textLight });
    drawRightAligned(page, formatCurrency(taxAmt, data.currency), totalsX + 110, 140, y, fontBold, 10, text);
    y -= 20;
  }
  if (shippingCharge > 0) {
    page.drawText("Shipping", { x: totalsX, y, size: 10, font, color: textLight });
    drawRightAligned(page, `+${formatCurrency(shippingCharge, data.currency)}`, totalsX + 110, 140, y, fontBold, 10, text);
    y -= 20;
  }
  if (previousDue > 0) {
    page.drawText("Previous Due", { x: totalsX, y, size: 10, font, color: rgb(0.918, 0.345, 0.047) });
    drawRightAligned(page, `+${formatCurrency(previousDue, data.currency)}`, totalsX + 110, 140, y, fontBold, 10, rgb(0.918, 0.345, 0.047));
    y -= 20;
  }
  if (data.discountPercent === 0 && data.taxPercent === 0 && shippingCharge === 0 && previousDue === 0) {
    page.drawText(labels.subtotal, { x: totalsX, y, size: 10, font, color: textLight });
    drawRightAligned(page, formatCurrency(subtotal, data.currency), totalsX + 110, 140, y, fontBold, 10, text);
    y -= 20;
  }

  y -= 5;
  page.drawLine({ start: { x: totalsX - 10, y: y + 5 }, end: { x: w - margin, y: y + 5 }, thickness: 2, color: accent });
  if (hasAccent) {
    page.drawRectangle({ x: totalsX - 10, y: y - 32, width: w - margin - totalsX + 10, height: 32, color: totalBg });
  }
  page.drawText(labels.total, { x: totalsX, y: y - 22, size: 14, font: fontBold, color: accent });
  drawRightAligned(page, formatCurrency(total, data.currency), totalsX + 110, 140, y - 22, fontBold, 16, text);
  y -= 40;

  // Amount Paid
  if (amountPaid > 0) {
    page.drawText("Amount Paid", { x: totalsX, y, size: 10, font: fontBold, color: accentGreen });
    drawRightAligned(page, `-${formatCurrency(amountPaid, data.currency)}`, totalsX + 110, 140, y, fontBold, 10, accentGreen);
    y -= 22;
  }

  // Balance Due
  if (amountPaid > 0 || previousDue > 0) {
    y -= 5;
    const balColor = balanceDue > 0 ? rgb(0.863, 0.149, 0.149) : rgb(0.02, 0.588, 0.412);
    const balBg = balanceDue > 0 ? rgb(0.996, 0.949, 0.949) : rgb(0.925, 0.992, 0.969);
    page.drawLine({ start: { x: totalsX - 10, y: y + 5 }, end: { x: w - margin, y: y + 5 }, thickness: 1.5, color: balColor });
    if (hasAccent) {
      page.drawRectangle({ x: totalsX - 10, y: y - 32, width: w - margin - totalsX + 10, height: 32, color: balBg });
    }
    page.drawText("Balance Due", { x: totalsX, y: y - 22, size: 14, font: fontBold, color: balColor });
    drawRightAligned(page, formatCurrency(balanceDue, data.currency), totalsX + 110, 140, y - 22, fontBold, 16, balColor);
    y -= 40;
  }

  return y;
}

// Draw bottom sections: tax reg, bank, notes, terms, signature, QR
async function drawBottomSections(
  page: any, y: number, data: InvoiceData, labels: InvoiceLabels,
  margin: number, w: number,
  font: any, fontBold: any, fontItalic: any,
  accent: any, text: any, textLight: any, border: any,
  qrImage: any, qrSize: number
): Promise<number> {
  const contentW = w - margin * 2;
  const taxCfg = getTaxConfig(data.currency);

  // Tax registration
  if (data.taxRegNumber) {
    page.drawText(`${taxCfg.regLabel}:`, { x: margin, y, size: 9, font, color: textLight });
    page.drawText(data.taxRegNumber, { x: margin + font.widthOfTextAtSize(taxCfg.regLabel + ": ", 9) + 4, y, size: 9, font: fontBold, color: text });
    y -= 18;
  }

  // Bank details
  if (data.bankName || data.bankAccountNo) {
    drawSectionLabel(page, margin, y, "BANK DETAILS", fontBold, accent);
    y -= 15;
    if (data.bankName) {
      page.drawText("Bank:", { x: margin, y, size: 9, font, color: textLight });
      page.drawText(data.bankName, { x: margin + 80, y, size: 9, font: fontBold, color: text });
      y -= 14;
    }
    if (data.bankAccountNo) {
      page.drawText("Account:", { x: margin, y, size: 9, font, color: textLight });
      page.drawText(data.bankAccountNo, { x: margin + 80, y, size: 9, font: fontBold, color: text });
      y -= 14;
    }
    if (data.bankBranch) {
      const bl = data.currency === "INR" ? "IFSC:" : data.currency === "BRL" ? "Branch:" : "SWIFT/BIC:";
      page.drawText(bl, { x: margin, y, size: 9, font, color: textLight });
      page.drawText(data.bankBranch, { x: margin + 80, y, size: 9, font: fontBold, color: text });
      y -= 18;
    }
  }

  // QR Code (placed next to signature or in its own area)
  if (data.qrCodeEnabled && data.qrCodeUrl && qrImage) {
    drawSectionLabel(page, margin, y, "SCAN TO PAY", fontBold, accent);
    y -= 16;
    const qrX = margin;
    const qrY = y - qrSize - 5;
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    // Draw a border around QR
    page.drawRectangle({ x: qrX, y: qrY, width: qrSize, height: qrSize, borderColor: accent, borderWidth: 1 });
    // Description text next to QR
    page.drawText("Scan with phone camera or payment app", { x: qrX + qrSize + 12, y: qrY + qrSize / 2 + 5, size: 9, font, color: textLight });
    page.drawText("to pay directly via this link:", { x: qrX + qrSize + 12, y: qrY + qrSize / 2 - 8, size: 9, font, color: textLight });
    // Truncate URL if too long
    const urlText = data.qrCodeUrl.length > 60 ? data.qrCodeUrl.substring(0, 57) + "..." : data.qrCodeUrl;
    page.drawText(urlText, { x: qrX + qrSize + 12, y: qrY + qrSize / 2 - 22, size: 8, font: fontBold, color: accent });
    y = Math.min(y, qrY - 5);
  }

  // Notes
  if (data.notes.trim()) {
    drawSectionLabel(page, margin, y, labels.notes, fontBold, accent);
    y -= 16;
    y = drawMultilineText(page, margin, y, data.notes, fontItalic, 10, textLight, contentW);
    y -= 10;
  }

  // Terms & conditions
  if (data.termsAndConditions?.trim()) {
    drawSectionLabel(page, margin, y, "TERMS & CONDITIONS", fontBold, accent);
    y -= 16;
    y = drawMultilineText(page, margin, y, data.termsAndConditions, font, 8, textLight, contentW);
    y -= 10;
  }

  // Signature
  if (data.signatureName && y > 80) {
    const sigX = w - margin - 180;
    page.drawLine({ start: { x: sigX, y: y - 5 }, end: { x: w - margin, y: y - 5 }, thickness: 0.5, color: border });
    page.drawText("Authorized Signatory", { x: sigX, y: y - 15, size: 8, font, color: textLight });
    page.drawText(data.signatureName, { x: sigX, y: y - 26, size: 9, font: fontBold, color: text });
    page.drawText(`Date: ${data.invoiceDate}`, { x: sigX, y: y - 38, size: 8, font, color: textLight });
  }

  return y;
}

// Generate QR code as PNG image bytes
async function generateQRCodePng(data: string): Promise<Uint8Array | null> {
  try {
    const QRCode = (await import("qrcode")).default;
    const pngDataUrl = await QRCode.toDataURL(data, {
      width: 200,
      margin: 1,
      color: { dark: "#000000", light: "#FFFFFF" },
      errorCorrectionLevel: "M",
    });
    const base64 = pngDataUrl.split(",")[1];
    if (base64) return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return null;
  } catch {
    return null;
  }
}

// ========================
// Languages (31)
// ========================

export const LANGUAGES = [
  { code: "en", name: "English", native: "English" },
  { code: "hi", name: "Hindi", native: "\u0939\u093F\u0928\u094D\u0926\u0940" },
  { code: "es", name: "Spanish", native: "Espa\u00F1ol" },
  { code: "fr", name: "French", native: "Fran\u00E7ais" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "pt", name: "Portuguese", native: "Portugu\u00EAs" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "tr", name: "Turkish", native: "T\u00FCrk\u00E7e" },
  { code: "ar", name: "Arabic", native: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629" },
  { code: "zh", name: "Chinese (Simplified)", native: "\u7B80\u4F53\u4E2D\u6587" },
  { code: "zh-TW", name: "Chinese (Traditional)", native: "\u7E41\u9AD4\u4E2D\u6587" },
  { code: "ja", name: "Japanese", native: "\u65E5\u672C\u8A9E" },
  { code: "ko", name: "Korean", native: "\uD55C\uAD6D\uC5B4" },
  { code: "ru", name: "Russian", native: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439" },
  { code: "bn", name: "Bengali", native: "\u09AC\u09BE\u0982\u09B2\u09BE" },
  { code: "ta", name: "Tamil", native: "\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD" },
  { code: "ur", name: "Urdu", native: "\u0627\u0631\u062F\u0648" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "th", name: "Thai", native: "\u0E44\u0E17\u0E22" },
  { code: "vi", name: "Vietnamese", native: "Ti\u1EBFng Vi\u1EC7t" },
  { code: "fil", name: "Filipino", native: "Filipino" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "sv", name: "Swedish", native: "Svenska" },
  { code: "uk", name: "Ukrainian", native: "\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430" },
  { code: "ro", name: "Romanian", native: "Rom\u00E2n\u0103" },
  { code: "hu", name: "Hungarian", native: "Magyar" },
  { code: "el", name: "Greek", native: "\u0395\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC" },
  { code: "he", name: "Hebrew", native: "\u05E2\u05D1\u05E8\u05D9\u05EA" },
  { code: "fa", name: "Persian", native: "\u0641\u0627\u0631\u0633\u06CC" },
  { code: "sw", name: "Swahili", native: "Kiswahili" },
];

// ========================
// Color Definitions (6 themes, same structure)
// ========================

type ColorTheme = {
  primary: any;
  secondary: any;
  accent: any;
  accentGreen: any;
  text: any;
  textLight: any;
  border: any;
  headerBg: any;
  tableBorder: any;
  altRow: any;
  totalBg: any;
  white: any;
  darkBg: any;
};

const C: Record<string, ColorTheme> = {
  // CLASSIC - Slate/charcoal gray, professional and timeless
  classic: {
    primary: rgb(0.278, 0.333, 0.412),    // #475569
    secondary: rgb(0.392, 0.459, 0.545),   // #64748B
    accent: rgb(0.278, 0.333, 0.412),
    accentGreen: rgb(0.06, 0.55, 0.40),
    text: rgb(0.12, 0.12, 0.15),
    textLight: rgb(0.45, 0.45, 0.50),
    border: rgb(0.88, 0.87, 0.89),
    headerBg: rgb(0.96, 0.97, 0.98),
    tableBorder: rgb(0.88, 0.87, 0.89),
    altRow: rgb(0.97, 0.98, 0.98),
    totalBg: rgb(0.96, 0.97, 0.98),
    white: rgb(1, 1, 1),
    darkBg: rgb(0.20, 0.25, 0.30),
  },
  // ROYAL - Deep blue, corporate and trustworthy
  royal: {
    primary: rgb(0.118, 0.227, 0.373),    // #1E3A5F
    secondary: rgb(0.145, 0.388, 0.922),   // #2563EB
    accent: rgb(0.118, 0.227, 0.373),
    accentGreen: rgb(0.06, 0.55, 0.40),
    text: rgb(0.12, 0.12, 0.15),
    textLight: rgb(0.45, 0.45, 0.50),
    border: rgb(0.85, 0.89, 0.94),
    headerBg: rgb(0.96, 0.98, 1.00),
    tableBorder: rgb(0.85, 0.89, 0.94),
    altRow: rgb(0.97, 0.98, 0.99),
    totalBg: rgb(0.96, 0.98, 1.00),
    white: rgb(1, 1, 1),
    darkBg: rgb(0.08, 0.14, 0.24),
  },
  // EMERALD - Green, fresh and natural
  emerald: {
    primary: rgb(0.016, 0.471, 0.341),    // #047857
    secondary: rgb(0.020, 0.588, 0.412),   // #059669
    accent: rgb(0.016, 0.471, 0.341),
    accentGreen: rgb(0.06, 0.55, 0.40),
    text: rgb(0.12, 0.12, 0.15),
    textLight: rgb(0.45, 0.45, 0.50),
    border: rgb(0.85, 0.96, 0.92),
    headerBg: rgb(0.96, 0.99, 0.98),
    tableBorder: rgb(0.85, 0.96, 0.92),
    altRow: rgb(0.97, 0.99, 0.98),
    totalBg: rgb(0.96, 0.99, 0.98),
    white: rgb(1, 1, 1),
    darkBg: rgb(0.06, 0.20, 0.15),
  },
  // CRIMSON - Red, strong and impactful
  crimson: {
    primary: rgb(0.600, 0.106, 0.106),    // #991B1B
    secondary: rgb(0.863, 0.149, 0.149),   // #DC2626
    accent: rgb(0.600, 0.106, 0.106),
    accentGreen: rgb(0.06, 0.55, 0.40),
    text: rgb(0.12, 0.12, 0.15),
    textLight: rgb(0.45, 0.45, 0.50),
    border: rgb(0.96, 0.87, 0.87),
    headerBg: rgb(0.99, 0.98, 0.98),
    tableBorder: rgb(0.96, 0.87, 0.87),
    altRow: rgb(0.99, 0.98, 0.98),
    totalBg: rgb(0.99, 0.98, 0.97),
    white: rgb(1, 1, 1),
    darkBg: rgb(0.30, 0.08, 0.08),
  },
  // AMBER - Gold/amber, premium and luxurious
  amber: {
    primary: rgb(0.573, 0.251, 0.055),    // #92400E
    secondary: rgb(0.851, 0.467, 0.024),   // #D97706
    accent: rgb(0.573, 0.251, 0.055),
    accentGreen: rgb(0.06, 0.55, 0.40),
    text: rgb(0.12, 0.12, 0.15),
    textLight: rgb(0.45, 0.45, 0.50),
    border: rgb(0.96, 0.91, 0.86),
    headerBg: rgb(1.00, 0.98, 0.96),
    tableBorder: rgb(0.96, 0.91, 0.86),
    altRow: rgb(1.00, 0.99, 0.97),
    totalBg: rgb(1.00, 0.98, 0.96),
    white: rgb(1, 1, 1),
    darkBg: rgb(0.30, 0.16, 0.04),
  },
  // VIOLET - Purple, creative and modern
  violet: {
    primary: rgb(0.357, 0.129, 0.714),    // #5B21B6
    secondary: rgb(0.486, 0.227, 0.929),   // #7C3AED
    accent: rgb(0.357, 0.129, 0.714),
    accentGreen: rgb(0.06, 0.55, 0.40),
    text: rgb(0.12, 0.12, 0.15),
    textLight: rgb(0.45, 0.45, 0.50),
    border: rgb(0.90, 0.87, 0.96),
    headerBg: rgb(0.98, 0.97, 0.99),
    tableBorder: rgb(0.90, 0.87, 0.96),
    altRow: rgb(0.99, 0.98, 0.99),
    totalBg: rgb(0.98, 0.97, 0.99),
    white: rgb(1, 1, 1),
    darkBg: rgb(0.20, 0.08, 0.36),
  },
};

// ========================
// TEMPLATE: Single premium layout, 6 color themes
// Full-width gradient header banner, FROM/BILL TO boxes, items table, totals, bottom sections, footer
// ========================

async function buildTemplate(pdf: any, page: any, data: InvoiceData, labels: InvoiceLabels, qrImage: any, colorKey: string): Promise<void> {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const c = C[colorKey] || C.classic;
  const w = page.getWidth(), h = page.getHeight(), m = 50;
  const contentW = w - m * 2;
  let y = h;

  // === GRADIENT HEADER BANNER (full width, ~120px tall) ===
  const bannerH = 120;
  // Left half darker
  page.drawRectangle({ x: 0, y: h - bannerH, width: w / 2, height: bannerH, color: c.primary });
  // Right half lighter
  page.drawRectangle({ x: w / 2, y: h - bannerH, width: w / 2, height: bannerH, color: c.secondary });
  // Accent bar at bottom of banner
  page.drawRectangle({ x: 0, y: h - bannerH, width: w, height: 4, color: c.accent });

  // Logo in header
  let logoW = 0;
  if (data.logoDataUrl) {
    logoW = await drawLogo(page, m, h - 15, data.logoDataUrl, 45);
  }
  // Title in header (white text)
  const titleX = m + logoW + (logoW > 0 ? 12 : 0);
  page.drawText(labels.invoiceTitle, { x: titleX, y: h - 38, size: 26, font: fontBold, color: c.white });
  // Subtitle line
  page.drawText(labels.tagline, { x: titleX, y: h - 52, size: 8, font: font, color: rgb(0.85, 0.85, 0.85) });

  // Invoice number & date (right side in header, white)
  const rx = w - m - 150;
  page.drawText(labels.invoiceHash, { x: rx, y: h - 35, size: 8, font, color: rgb(0.85, 0.85, 0.85) });
  page.drawText(data.invoiceNumber, { x: rx, y: h - 48, size: 11, font: fontBold, color: c.white });
  page.drawText(labels.date, { x: rx, y: h - 68, size: 8, font, color: rgb(0.85, 0.85, 0.85) });
  page.drawText(data.invoiceDate, { x: rx, y: h - 81, size: 9, font: fontBold, color: c.white });
  page.drawText(labels.dueDate, { x: rx + 80, y: h - 68, size: 8, font, color: rgb(0.85, 0.85, 0.85) });
  page.drawText(data.dueDate, { x: rx + 80, y: h - 81, size: 9, font: fontBold, color: c.white });

  y = h - bannerH - 30;

  // === FROM / BILL TO (in colored boxes) ===
  const boxW = (contentW - 20) / 2;
  const boxH = 85;
  // From box
  page.drawRectangle({ x: m, y: y - boxH, width: boxW, height: boxH, color: c.headerBg, borderColor: c.border, borderWidth: 0.5 });
  drawSectionLabel(page, m + 10, y - 14, labels.from, fontBold, c.primary);
  let ty = y - 28;
  ty = drawMultilineText(page, m + 10, ty, data.yourName, fontBold, 10, c.text, boxW - 20);
  if (data.yourEmail) ty = drawMultilineText(page, m + 10, ty, data.yourEmail, font, 8, c.textLight, boxW - 20);
  if (data.yourPhone) ty = drawMultilineText(page, m + 10, ty, data.yourPhone, font, 8, c.textLight, boxW - 20);

  // Bill To box
  const btX = m + boxW + 20;
  page.drawRectangle({ x: btX, y: y - boxH, width: boxW, height: boxH, color: c.headerBg, borderColor: c.border, borderWidth: 0.5 });
  drawSectionLabel(page, btX + 10, y - 14, labels.billTo, fontBold, c.primary);
  ty = y - 28;
  ty = drawMultilineText(page, btX + 10, ty, data.clientName, fontBold, 10, c.text, boxW - 20);
  if (data.clientEmail) ty = drawMultilineText(page, btX + 10, ty, data.clientEmail, font, 8, c.textLight, boxW - 20);
  if (data.clientAddress) ty = drawMultilineText(page, btX + 10, ty, data.clientAddress, font, 8, c.textLight, boxW - 20);

  y -= boxH + 20;

  // === ITEMS TABLE ===
  const colWidths = [contentW * 0.42, contentW * 0.10, contentW * 0.22, contentW * 0.26];
  y = drawItemsTable(page, y, data.items, data, m, contentW, colWidths, 28, 32, font, fontBold, fontItalic, true, c.primary, c.white, c.text, c.textLight, c.tableBorder, c.altRow, labels);
  y -= 20;

  // === TOTALS ===
  const totalsX = w - m - 250;
  y = drawTotals(page, y, data, labels, totalsX, w, m, font, fontBold, c.primary, c.text, c.textLight, c.accentGreen, c.totalBg, true);
  y -= 5;

  // === BOTTOM SECTIONS ===
  y = await drawBottomSections(page, y, data, labels, m, w, font, fontBold, fontItalic, c.primary, c.text, c.textLight, c.border, qrImage, 80);

  // === FOOTER (gradient bar) ===
  page.drawRectangle({ x: 0, y: 0, width: w / 2, height: 30, color: c.primary });
  page.drawRectangle({ x: w / 2, y: 0, width: w / 2, height: 30, color: c.secondary });
  page.drawText(labels.footer, { x: m, y: 10, size: 8, font, color: c.white });
}

// (old templates removed - single buildTemplate used for all themes)

// ========================
// Main PDF Generation
// ========================


export async function generateInvoicePDF(data: InvoiceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4

  const labels = getPdfLabels(data.language);

  // Generate QR code if enabled
  let qrImage: any = null;
  if (data.qrCodeEnabled && data.qrCodeUrl) {
    const qrPng = await generateQRCodePng(data.qrCodeUrl);
    if (qrPng) {
      try {
        qrImage = await pdf.embedPng(qrPng);
      } catch {
        qrImage = null;
      }
    }
  }

  // All templates use the same layout, just different color themes
  const colorKey = C[data.template] ? data.template : "classic";
  await buildTemplate(pdf, page, data, labels, qrImage, colorKey);

  return pdf.save();
}

// ========================
// Invoice Number Generator
// ========================

export function generateInvoiceNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `INV-${y}${m}${d}-${rand}`;
}

// ========================
// Date Helpers
// ========================

export function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

export function getDueDateString(daysFromNow: number = 30): string {
  const due = new Date();
  due.setDate(due.getDate() + daysFromNow);
  return due.toISOString().split("T")[0];
}

export function formatDateDisplay(dateStr: string, locale?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(locale || "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ========================
// Default Invoice Data
// ========================

export function getDefaultInvoiceData(): InvoiceData {
  return {
    yourName: "",
    yourEmail: "",
    yourPhone: "",
    yourAddress: "",
    logoDataUrl: undefined,
    clientName: "",
    clientEmail: "",
    clientAddress: "",
    invoiceNumber: generateInvoiceNumber(),
    invoiceDate: getTodayDateString(),
    dueDate: getDueDateString(30),
    currency: "USD",
    items: [
      { id: crypto.randomUUID(), description: "", quantity: 1, rate: 0 },
    ],
    taxPercent: 0,
    discountPercent: 0,
    shippingCharge: 0,
    amountPaid: 0,
    previousDue: 0,
    taxRegNumber: "",
    bankName: "",
    bankAccountNo: "",
    bankBranch: "",
    termsAndConditions: "",
    signatureName: "",
    notes: "",
    template: "classic",
    language: "en",
    qrCodeEnabled: false,
    qrCodeUrl: "",
    taxType: "auto",
  };
}

// ========================
// Calculations
// ========================

export function calculateTotals(items: InvoiceItem[], taxPercent: number, discountPercent: number, shippingCharge: number = 0, amountPaid: number = 0, previousDue: number = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const discountAmt = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmt;
  const taxAmt = afterDiscount * (taxPercent / 100);
  const total = afterDiscount + taxAmt + shippingCharge + previousDue;
  const balanceDue = total - amountPaid;
  return { subtotal, discountAmt, afterDiscount, taxAmt, shippingCharge, amountPaid, previousDue, total, balanceDue };
}
