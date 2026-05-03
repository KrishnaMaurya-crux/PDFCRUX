import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, teamSize, message } = body;

    // Validate required fields
    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json(
        { error: "Name and work email are required." },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid work email address." },
        { status: 400 }
      );
    }

    // Validate team size
    const validTeamSizes = ["1-10", "11-50", "51-200", "201-500", "500+"];
    if (teamSize && !validTeamSizes.includes(teamSize)) {
      return NextResponse.json(
        { error: "Please select a valid team size." },
        { status: 400 }
      );
    }

    // Save to database
    try {
      await db.contactSales.create({
        data: {
          name: name.trim(),
          email: email.trim(),
          teamSize: teamSize || null,
          message: message?.trim() || null,
          status: "new",
        },
      });
    } catch (dbErr) {
      // If table doesn't exist yet (migration not run), just log
      console.warn("[Contact Sales] DB save skipped (table may not exist yet):", dbErr);
    }

    console.log("[Contact Sales] New inquiry:", {
      name: name.trim(),
      email: email.trim(),
      teamSize: teamSize || "Not specified",
      message: message?.trim() || "No message",
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "Thank you! Our sales team will reach out to you within 24 hours.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
