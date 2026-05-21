import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────
// CRITICAL: Force Node.js runtime!
// Without this, Vercel runs as Edge Function → Supabase + Prisma CRASH = 500
// ─────────────────────────────────────────────────────────────────
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// Auth: Extract user from Authorization header
// Returns { success, user } or { success: false, reason }
// ─────────────────────────────────────────────────────────────────

async function getUserFromRequest(req: Request): Promise<{
  success: true;
  user: { id: string; email: string; user_metadata?: Record<string, unknown> };
} | { success: false; reason: string }> {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    console.log("[History:Auth] ❌ No Authorization header");
    return { success: false, reason: "No Authorization header" };
  }

  if (!authHeader.startsWith("Bearer ")) {
    console.log("[History:Auth] ❌ Not Bearer format");
    return { success: false, reason: "Invalid format (expected Bearer)" };
  }

  const token = authHeader.slice(7).trim();
  if (!token || token.length < 10) {
    console.log("[History:Auth] ❌ Token too short");
    return { success: false, reason: "Empty or invalid token" };
  }

  console.log("[History:Auth] Token received (length:", token.length + ")");

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error("[History:Auth] ❌ getUser() error:", error.message);
      return { success: false, reason: `Supabase: ${error.message}` };
    }

    if (!data.user) {
      console.log("[History:Auth] ❌ No user returned");
      return { success: false, reason: "Token valid but no user" };
    }

    console.log("[History:Auth] ✅ Authenticated:", data.user.email);
    return { success: true, user: data.user };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[History:Auth] 💥 CRASH:", msg);
    return { success: false, reason: `Auth crash: ${msg}` };
  }
}

// ─────────────────────────────────────────────────────────────────
// Database: Find or create local user
// ─────────────────────────────────────────────────────────────────

async function findOrCreateUser(supabaseUser: {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
}) {
  const email = supabaseUser.email;
  if (!email) {
    throw new Error("Supabase user has no email");
  }

  console.log("[History:DB] Looking up user:", email);

  let user = await db.user.findUnique({ where: { email } });

  if (user) {
    console.log("[History:DB] ✅ Found:", user.id);
    return user;
  }

  const name =
    (supabaseUser.user_metadata?.full_name as string) ||
    (supabaseUser.user_metadata?.name as string) ||
    email.split("@")[0] ||
    "Unknown";

  console.log("[History:DB] Creating new user...");
  user = await db.user.create({ data: { email, name } });

  console.log("[History:DB] ✅ Created:", user.id);
  return user;
}

// ─────────────────────────────────────────────────────────────────
// GET /api/history
// ─────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  console.log("[History] ═══ GET /api/history ═══");

  if (!isSupabaseConfigured) {
    console.log("[History] ❌ Supabase not configured");
    return NextResponse.json({ error: "Authentication not configured" }, { status: 503 });
  }

  // ── AUTH (never touches DB) ──
  const authResult = await getUserFromRequest(req);
  if (!authResult.success) {
    console.log("[History] → 401:", authResult.reason);
    return NextResponse.json({ error: "Unauthorized", reason: authResult.reason }, { status: 401 });
  }

  // ── DATABASE (only reached after auth passes) ──
  try {
    const user = await findOrCreateUser(authResult.user);

    console.log("[History] Fetching history for:", user.id);
    const history = await db.history.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    console.log("[History] ✅ → 200 (", history.length, "entries)");
    return NextResponse.json({ history });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[History] 💥 → 500 DB crash:", msg);
    return NextResponse.json({ error: "Failed to fetch history", debug: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────
// POST /api/history
// ─────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  console.log("[History] ═══ POST /api/history ═══");

  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Authentication not configured" }, { status: 503 });
  }

  const authResult = await getUserFromRequest(req);
  if (!authResult.success) {
    return NextResponse.json({ error: "Unauthorized", reason: authResult.reason }, { status: 401 });
  }

  try {
    const user = await findOrCreateUser(authResult.user);
    const body = await req.json();
    const { toolId, toolName, fileName, fileSize, resultSummary } = body;

    if (!toolId || !toolName || !fileName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    console.log("[History] Saving:", { toolId, fileName });
    const entry = await db.history.create({
      data: {
        userId: user.id,
        toolId,
        toolName,
        fileName,
        fileSize: fileSize || 0,
        resultSummary: resultSummary || "",
      },
    });

    console.log("[History] ✅ Saved:", entry.id);
    return NextResponse.json({ entry });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[History] 💥 → 500:", msg);
    return NextResponse.json({ error: "Failed to save history", debug: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────
// DELETE /api/history?id=xxx
// ─────────────────────────────────────────────────────────────────

export async function DELETE(req: Request) {
  console.log("[History] ═══ DELETE /api/history ═══");

  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Authentication not configured" }, { status: 503 });
  }

  const authResult = await getUserFromRequest(req);
  if (!authResult.success) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await findOrCreateUser(authResult.user);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    const entry = await db.history.findFirst({ where: { id, userId: user.id } });
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    await db.history.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[History] 💥 DELETE → 500:", msg);
    return NextResponse.json({ error: "Failed to delete history", debug: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────
// PATCH /api/history
// ─────────────────────────────────────────────────────────────────

export async function PATCH(req: Request) {
  console.log("[History] ═══ PATCH /api/history ═══");

  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Authentication not configured" }, { status: 503 });
  }

  const authResult = await getUserFromRequest(req);
  if (!authResult.success) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await findOrCreateUser(authResult.user);
    const body = await req.json();
    const { id, downloaded } = body;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const entry = await db.history.findFirst({ where: { id, userId: user.id } });
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const updated = await db.history.update({
      where: { id },
      data: { ...(downloaded !== undefined ? { downloaded } : {}) },
    });

    return NextResponse.json({ entry: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[History] 💥 PATCH → 500:", msg);
    return NextResponse.json({ error: "Failed to update history", debug: msg }, { status: 500 });
  }
}
