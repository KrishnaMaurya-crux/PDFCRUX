/**
 * PdfCrux — Pricing Configuration
 *
 * Centralized pricing data for India (INR) and Global (USD).
 * Used by the pricing page, checkout flow, and payment integration.
 */

export type Region = "india" | "global";

export const PRICING: Record<
  Region,
  {
    monthly: number;
    yearly: number;
    currency: string;
    symbol: string;
    gatewayCurrency: string;
  }
> = {
  global: {
    monthly: 5.99,
    yearly: 49,
    currency: "USD",
    symbol: "$",
    gatewayCurrency: "USD",
  },
  india: {
    monthly: 249,
    yearly: 1999,
    currency: "INR",
    symbol: "₹",
    gatewayCurrency: "INR",
  },
};

export function getPremiumPlan(region: Region) {
  const p = PRICING[region];
  return {
    name: "Premium",
    monthlyPrice: p.monthly,
    yearlyPrice: p.yearly,
    monthlyDisplay: `${p.symbol}${p.monthly}`,
    yearlyDisplay: `${p.symbol}${p.yearly.toLocaleString("en-IN")}`,
    currency: p.currency,
    symbol: p.symbol,
    gatewayCurrency: p.gatewayCurrency,
    monthlyEquiv: `${p.symbol}${Math.floor(p.yearly / 12).toLocaleString("en-IN")}`,
    savings: `${p.symbol}${Math.floor(p.monthly * 12 - p.yearly).toLocaleString("en-IN")}`,
  };
}
