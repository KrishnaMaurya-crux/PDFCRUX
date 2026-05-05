import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const forwardedIp = request.headers.get("x-forwarded-for");

    const res = await fetch("https://ipapi.co/json/", {
      signal: controller.signal,
      headers: forwardedIp
        ? { "X-Forwarded-For": forwardedIp }
        : undefined,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ country: "US", region: "global" });
    }

    const data = await res.json();
    const country = data.country || "US";
    const isIndia = country === "IN";

    return NextResponse.json({
      country,
      isIndia,
      region: isIndia ? "india" : "global",
    });
  } catch {
    return NextResponse.json({ country: "US", region: "global" });
  }
}
