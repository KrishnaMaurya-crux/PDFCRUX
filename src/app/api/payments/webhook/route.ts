import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook, handleWebhookEvent } from "@/lib/dodo-payments";
import { dodoPayments } from "@/lib/env";

/**
 * POST /api/payments/webhook
 *
 * Handles Dodo Payments webhook events.
 * Verifies signature, processes event, updates user plan.
 *
 * Dodo sends webhooks with:
 *   - Header: x-dodo-signature (HMAC-SHA256)
 *   - Body: JSON payload with event type and data
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Read raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get("x-dodo-signature") || "";

    // 2. Verify webhook secret is configured
    if (!dodoPayments.webhookSecret) {
      console.error("[Webhook] Missing DODO_WEBHOOK_SECRET");
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 }
      );
    }

    // 3. Verify signature
    const verification = verifyWebhook(rawBody, signature);
    if (!verification.valid) {
      console.error("[Webhook] Invalid signature:", verification.error);
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    if (!verification.payload) {
      return NextResponse.json(
        { error: "Invalid payload" },
        { status: 400 }
      );
    }

    // 4. Process the event
    const event = verification.payload;
    const result = handleWebhookEvent(event);

    console.log(`[Webhook] Event: ${event.event} → Action: ${result.action}`);

    // 5. Take action based on event type
    switch (result.action) {
      case "activate_premium":
      case "activate_subscription": {
        // Update user plan in database
        if (result.userId && result.planType) {
          try {
            const { db } = await import("@/lib/db");
            await db.user.upsert({
              where: { email: result.userId },
              create: {
                email: result.userId,
                plan: "premium",
                tokensNonAI: 999999,  // Effectively unlimited
                tokensAI: 100,
                tokenResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              },
              update: {
                plan: "premium",
                tokensNonAI: 999999,
                tokensAI: 100,
                tokenResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              },
            });
            console.log(`[Webhook] Activated Premium for: ${result.userId}`);
          } catch (dbErr) {
            console.error("[Webhook] DB error during activation:", dbErr);
          }
        }
        break;
      }

      case "payment_failed": {
        console.log(`[Webhook] Payment failed for: ${result.userId}`);
        break;
      }

      case "cancel_subscription": {
        if (result.userId) {
          try {
            const { db } = await import("@/lib/db");
            await db.user.update({
              where: { email: result.userId },
              data: { plan: "free" },
            });
            console.log(`[Webhook] Downgraded to Free for: ${result.userId}`);
          } catch (dbErr) {
            console.error("[Webhook] DB error during cancellation:", dbErr);
          }
        }
        break;
      }

      case "process_refund": {
        if (result.userId) {
          try {
            const { db } = await import("@/lib/db");
            await db.user.update({
              where: { email: result.userId },
              data: { plan: "free" },
            });
            console.log(`[Webhook] Refund processed, downgraded: ${result.userId}`);
          } catch (dbErr) {
            console.error("[Webhook] DB error during refund:", dbErr);
          }
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event: ${event.event}`);
    }

    // 6. Return success acknowledgment
    return NextResponse.json({ received: true, action: result.action });
  } catch (err) {
    console.error("[Webhook] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/payments/webhook (for testing)
 * Returns webhook configuration status
 */
export async function GET() {
  return NextResponse.json({
    configured: !!dodoPayments.webhookSecret,
    endpoint: "/api/payments/webhook",
    supportedEvents: [
      "payment.completed",
      "payment.failed",
      "payment.captured",
      "payment.declined",
      "order.completed",
      "subscription.created",
      "subscription.activated",
      "subscription.cancelled",
      "subscription.expired",
      "refund.completed",
      "refund.created",
    ],
  });
}
