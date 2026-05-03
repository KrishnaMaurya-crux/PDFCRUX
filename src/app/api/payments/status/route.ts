import { NextRequest, NextResponse } from "next/server";
import { getPaymentStatus } from "@/lib/dodo-payments";

/**
 * GET /api/payments/status?paymentId=xxx
 *
 * Check the status of a Dodo payment order.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const paymentId = searchParams.get("paymentId");

  if (!paymentId) {
    return NextResponse.json(
      { success: false, error: "Missing paymentId parameter" },
      { status: 400 }
    );
  }

  const result = await getPaymentStatus(paymentId);
  return NextResponse.json(result);
}
