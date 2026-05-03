import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/geo
 *
 * Detects user's country from their IP address.
 * Used by PricingPage to auto-select INR vs USD.
 *
 * Returns:
 *   - country: "IN" for India, else two-letter country code
 *   - isIndia: boolean
 *   - region: "india" | "global" (for pricing display)
 *
 * Fallback: "global" (USD) if IP cannot be determined.
 */
export async function GET(request: NextRequest) {
  try {
    // Try to get real IP from headers (behind proxy/CDN)
    const forwarded = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const cfIp = request.headers.get("cf-connecting-ip"); // Cloudflare

    // x-forwarded-for can contain multiple IPs; first is the real client
    const clientIp = cfIp || (forwarded ? forwarded.split(",")[0]?.trim() : null) || realIp;

    // If no IP found (localhost, etc.), default to global
    if (!clientIp || clientIp === "::1" || clientIp === "127.0.0.1") {
      return NextResponse.json({
        country: "US",
        isIndia: false,
        region: "global",
        ip: clientIp || "unknown",
      });
    }

    // Use ipapi.co free tier (30k requests/month, no API key needed)
    const geoRes = await fetch(`https://ipapi.co/${clientIp}/json/`, {
      signal: AbortSignal.timeout(3000), // 3s timeout
    });

    if (!geoRes.ok) {
      // Fallback to global
      return NextResponse.json({
        country: "US",
        isIndia: false,
        region: "global",
        ip: clientIp,
      });
    }

    const geoData = await geoRes.json();
    const country = (geoData.country_code || "US").toUpperCase();
    const isIndia = country === "IN";

    return NextResponse.json({
      country,
      isIndia,
      region: isIndia ? "india" : "global",
      ip: clientIp,
    });
  } catch {
    // Any error → default to global (USD)
    return NextResponse.json({
      country: "US",
      isIndia: false,
      region: "global",
    });
  }
}
