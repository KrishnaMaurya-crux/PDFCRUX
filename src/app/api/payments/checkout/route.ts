import { NextRequest, NextResponse } from "next/server";
import { createCheckout, type PlanType } from "@/lib/dodo-payments";
import { dodoPayments } from "@/lib/env";

/**
 * POST /api/payments/checkout
 *
 * Creates a Dodo Payments checkout session for Premium plan.
 *
 * Body:
 *   - planType: "premium_monthly" | "premium_annual"
 *   - customerName: string
 *   - customerEmail: string
 *   - customerPhone?: string
 *   - region?: "india" | "global" (default: "india")
 */
export async function POST(request: NextRequest) {
  try {
    if (!dodoPayments.isConfigured) {
      return NextResponse.json(
        {
          success: false,
          error: "Payment system is currently being set up. Please try again later.",
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { planType, customerName, customerEmail, customerPhone, region } = body;

    // Validate required fields
    if (!planType || !customerName || !customerEmail) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: planType, customerName, customerEmail",
        },
        { status: 400 }
      );
    }

    // Validate plan type
    const validPlans: PlanType[] = ["premium_monthly", "premium_annual"];
    if (!validPlans.includes(planType)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid plan type. Must be one of: ${validPlans.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      return NextResponse.json(
        { success: false, error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Determine base URL for success/cancel redirects
    const baseUrl = request.headers.get("origin") || process.env.NEXT_PUBLIC_BASE_URL || "";

    const result = await createCheckout(
      {
        planType,
        customer: {
          name: customerName.trim(),
          email: customerEmail.trim(),
          ...(customerPhone ? { phone: customerPhone } : {}),
        },
        successUrl: `${baseUrl}/?payment=success&plan=${planType}`,
        cancelUrl: `${baseUrl}/pricing?payment=cancelled`,
      },
      region === "global" ? "global" : "india"
    );

    if (!result.success) {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[Checkout API] Error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
