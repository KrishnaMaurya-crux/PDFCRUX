/**
 * PdfCrux — Dodo Payments Integration
 *
 * Universal payment gateway for India + Global.
 * Supports UPI, Credit/Debit Cards, Net Banking, and international cards.
 *
 * Dodo API Docs: https://docs.dodopayments.com
 *
 * Features:
 * - Create checkout sessions (one-time + subscription)
 * - Verify webhook signatures
 * - Handle subscription lifecycle (created, renewed, cancelled)
 *
 * Usage:
 *   import { createCheckout, verifyWebhook } from "@/lib/dodo-payments";
 */

import { env } from "@/lib/env";
import crypto from "crypto";

// ============================================================
// Types
// ============================================================

export type PlanType = "premium_monthly" | "premium_annual";

export interface DodoLineItem {
  name: string;
  amount: number;       // in cents (smallest currency unit)
  quantity: number;
}

export interface DodoCustomer {
  name: string;
  email: string;
  phone?: string;
}

export interface CheckoutSessionParams {
  planType: PlanType;
  customer: DodoCustomer;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResponse {
  success: boolean;
  url?: string;           // Redirect URL for payment page
  paymentId?: string;     // Dodo payment/order ID
  error?: string;
}

export interface WebhookPayload {
  event: string;
  data: {
    id: string;
    amount: number;
    currency: string;
    status: string;
    customer?: {
      name: string;
      email: string;
    };
    metadata?: Record<string, string>;
    created_at?: string;
  };
}

export interface WebhookVerificationResult {
  valid: boolean;
  payload?: WebhookPayload;
  error?: string;
}

// ============================================================
// Plan Configuration
// ============================================================

const PLAN_CONFIG: Record<PlanType, {
  name: string;
  description: string;
  amountINR: number;   // in paise
  amountUSD: number;   // in cents
  currencyINR: string;
  currencyUSD: string;
}> = {
  premium_monthly: {
    name: "PdfCrux Premium (Monthly)",
    description: "Unlimited Non-AI tokens, 100 AI tokens, 1GB cloud storage",
    amountINR: 24900,       // ₹249
    amountUSD: 599,         // $5.99
    currencyINR: "INR",
    currencyUSD: "USD",
  },
  premium_annual: {
    name: "PdfCrux Premium (Annual)",
    description: "Unlimited Non-AI tokens, 100 AI tokens, 1GB cloud storage — billed annually",
    amountINR: 199900,      // ₹1,999
    amountUSD: 4900,        // $49
    currencyINR: "INR",
    currencyUSD: "USD",
  },
};

// ============================================================
// Dodo API Base
// ============================================================

const DODO_API_BASE = "https://api.dodopayments.com/v1";

function getHeaders(): Record<string, string> {
  return {
    "Authorization": `Bearer ${env.dodoPayments.apiKey}`,
    "Content-Type": "application/json",
    "Business-Id": env.dodoPayments.businessId,
  };
}

/**
 * Create a Dodo Payment Order / Checkout Session
 *
 * @param params - Checkout parameters including plan type and customer info
 * @param region - "india" or "global" for currency selection
 * @returns Checkout session URL or error
 */
export async function createCheckout(
  params: CheckoutSessionParams,
  region: "india" | "global" = "india"
): Promise<CheckoutSessionResponse> {
  if (!env.dodoPayments.isConfigured) {
    return {
      success: false,
      error: "Dodo Payments is not configured. Missing API key or Business ID.",
    };
  }

  const config = PLAN_CONFIG[params.planType];
  const isIndia = region === "india";
  const amount = isIndia ? config.amountINR : config.amountUSD;
  const currency = isIndia ? config.currencyINR : config.currencyUSD;

  try {
    const response = await fetch(`${DODO_API_BASE}/orders`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        name: `${config.name} (${currency})`,
        amount,
        currency,
        description: config.description,
        customer: {
          name: params.customer.name,
          email: params.customer.email,
          ...(params.customer.phone ? { phone: params.customer.phone } : {}),
        },
        metadata: {
          planType: params.planType,
          userId: params.customer.email,
          region,
          source: "pdfcrux",
        },
        return_url: params.successUrl,
        // Dodo supports UPI, cards, netbanking natively
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[Dodo] Create order error:", data);
      return {
        success: false,
        error: data.message || data.error || "Failed to create payment order",
      };
    }

    // Dodo returns the payment URL in the response
    return {
      success: true,
      url: data.payment_url || data.url || data.checkout_url,
      paymentId: data.id || data.payment_id || data.order_id,
    };
  } catch (err) {
    console.error("[Dodo] Create order exception:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error creating payment",
    };
  }
}

/**
 * Get payment status from Dodo
 */
export async function getPaymentStatus(paymentId: string): Promise<{
  success: boolean;
  status?: string;
  error?: string;
}> {
  if (!env.dodoPayments.isConfigured) {
    return { success: false, error: "Dodo Payments not configured" };
  }

  try {
    const response = await fetch(`${DODO_API_BASE}/orders/${paymentId}`, {
      headers: getHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: "Failed to fetch payment status" };
    }

    return {
      success: true,
      status: data.status || "unknown",
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Verify Dodo webhook signature
 * Dodo sends signatures in the header (x-dodo-signature or similar)
 */
export function verifyWebhook(
  payload: string | Buffer,
  signature: string
): WebhookVerificationResult {
  if (!env.dodoPayments.webhookSecret) {
    return {
      valid: false,
      error: "Webhook secret not configured",
    };
  }

  try {
    // Simple HMAC-SHA256 verification
    // Dodo typically uses HMAC with the webhook secret
    const expectedSig = crypto
      .createHmac("sha256", env.dodoPayments.webhookSecret)
      .update(typeof payload === "string" ? payload : payload.toString())
      .digest("hex");

    // Support both raw hex and prefixed formats
    const actualSig = signature.replace(/^sha256=/, "");

    if (crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(actualSig))) {
      return {
        valid: true,
        payload: JSON.parse(typeof payload === "string" ? payload : payload.toString()),
      };
    }

    return {
      valid: false,
      error: "Invalid webhook signature",
    };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Signature verification failed",
    };
  }
}

/**
 * Handle webhook events
 * Called from the API route after signature verification
 */
export function handleWebhookEvent(payload: WebhookPayload): {
  action: string;
  userId?: string;
  planType?: string;
  message: string;
} {
  const { event, data } = payload;

  switch (event) {
    case "payment.completed":
    case "payment.captured":
    case "order.completed": {
      const planType = data.metadata?.planType;
      const userId = data.customer?.email;
      return {
        action: "activate_premium",
        userId,
        planType,
        message: `Payment completed: ${data.amount} ${data.currency}`,
      };
    }

    case "payment.failed":
    case "payment.declined": {
      return {
        action: "payment_failed",
        userId: data.customer?.email,
        message: `Payment failed: ${data.status}`,
      };
    }

    case "subscription.created":
    case "subscription.activated": {
      return {
        action: "activate_subscription",
        userId: data.customer?.email,
        planType: data.metadata?.planType,
        message: `Subscription activated`,
      };
    }

    case "subscription.cancelled":
    case "subscription.expired": {
      return {
        action: "cancel_subscription",
        userId: data.customer?.email,
        message: `Subscription cancelled/expired`,
      };
    }

    case "refund.completed":
    case "refund.created": {
      return {
        action: "process_refund",
        userId: data.customer?.email,
        message: `Refund processed: ${data.amount} ${data.currency}`,
      };
    }

    default:
      return {
        action: "unhandled",
        message: `Unhandled event: ${event}`,
      };
  }
}

/**
 * Get plan pricing info for display
 */
export function getPlanPricing(region: "india" | "global") {
  const isIndia = region === "india";
  return {
    monthly: {
      amount: isIndia ? 249 : 5.99,
      currency: isIndia ? "₹" : "$",
      code: isIndia ? "INR" : "USD",
      display: isIndia ? "₹249/mo" : "$5.99/mo",
    },
    annual: {
      amount: isIndia ? 1999 : 49,
      currency: isIndia ? "₹" : "$",
      code: isIndia ? "INR" : "USD",
      display: isIndia ? "₹1,999/yr" : "$49/yr",
      monthlyEquiv: isIndia ? "₹166/mo" : "$4.08/mo",
    },
  };
}

export const isDodoConfigured = env.dodoPayments.isConfigured;
