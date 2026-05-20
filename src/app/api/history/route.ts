import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL: Force Node.js runtime!
// Without this, Vercel runs as Edge Function → Supabase + Prisma crash = 500
// ─────────────────────────────────────────────────────────────────────────────
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────────
// Auth: Extract user from Authorization header
// ─────────────────────────────────────────────────────────────────────────────

async function getUserFromRequest(req: Request): Promise<{
  success: true;
  user: { id: string; email: string; user_metadata?: Record<string, unknown> };
} | { success: false; reason: string }> {
  // ── Guard 1: Check header exists ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    console.log("[History:Auth] ❌ AUTH FAIL — No Authorization header");
    return { success: false, reason: "No Authorization header" };
  }

  // ── Guard 2: Check Bearer prefix ──
  if (!authHeader.startsWith("Bearer ")) {
    console.log("[History:Auth] ❌ AUTH FAIL — Header not Bearer format");
    return { success: false, reason: "Invalid Authorization format (expected Bearer)" };
  }

  // ── Guard 3: Extract token ──
  const token = authHeader.slice(7).trim();
  if (!token || token.length < 10) {
    console.log("[History:Auth] ❌ AUTH FAIL — Token too short or empty");
    return { success: false, reason: "Invalid or empty token" };
  }

  console.log("[History:Auth] Step 1: Token extracted (length:", token.length + ")");

  // ── Guard 4: Verify token with Supabase ──
  try {
    console.log("[History:Auth] Step 2: Calling supabase.auth.getUser()...");
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error("[History:Auth] ❌ AUTH FAIL — supabase.getUser() error:", error.message);
      return { success: false, reason: `Supabase error: ${error.message}` };
    }

    if (!data.user) {
      console.log("[History:Auth] ❌ AUTH FAIL — No user returned from Supabase");
      return { success: false, reason: "Token valid but no user found" };
    }

    console.log("[History:Auth] ✅ AUTH SUCCESS — user:", data.user.email);
    return { success: true, user: data.user };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[History:Auth] 💥 AUTH CRASH:", msg);
    return { success: false, reason: `Auth crash: ${msg}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Database: Find or create local user
// ─────────────────────────────────────────────────────────────────────────────

async function findOrCreateUser(supabaseUser: {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
}) {
  const email = supabaseUser.email;
  if (!email) {
    throw new Error("Supabase user has no email — cannot create local user");
  }

  console.log("[History:DB] Step 3: Looking up local user:", email);

  try {
    let user = await db.user.findUnique({ where: { email } });

    if (user) {
      console.log("[History:DB] ✅ Existing user found:", user.id);
      return user;
    }

    // Create new user — handle missing metadata gracefully
    const name =
      (supabaseUser.user_metadata?.full_name as string) ||
      (supabaseUser.user_metadata?.name as string) ||
      email.split("@")[0] ||
      "Unknown";

    console.log("[History:DB] Step 4: Creating new local user...");
    user = await db.user.create({ data: { email, name } });

    console.log("[History:DB] ✅ New user created:", user.id);
    return user;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[History:DB] 💥 DATABASE CRASH in findOrCreateUser():", msg);
    throw new Error(`Database error: ${msg}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/history
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  console.log("[History] ══════ GET /api/history START ══════");

  // ── Guard: Supabase env vars ──
  if (!isSupabaseConfigured) {
    console.log("[History] ❌ Supabase not configured (env vars missing)");
    return NextResponse.json(
      { error: "Authentication not configured" },
      { status: 503 }
    );
  }

  // ── Step 1-2: Authenticate (NEVER touches DB) ──
  const authResult = await getUserFromRequest(req);
  if (!authResult.success) {
    console.log("[History] ══════ GET → 401 (Auth Fail) ══════");
    return NextResponse.json({ error: "Unauthorized", reason: authResult.reason }, { status: 401 });
  }

  // ── Step 3-4: Database operations (ONLY reached if auth passed) ──
  try {
    const user = await findOrCreateUser(authResult.user);

    console.log("[History] Step 5: Fetching history for user:", user.id);
    const history = await db.history.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    console.log("[History] ✅ GET → 200 (", history.length, "entries)");
    return NextResponse.json({ history });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[History] 💥 GET → 500 (Database Crash):", msg);

    return NextResponse.json(
      { error: "Failed to fetch history", debug: msg },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/history
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  console.log("[History] ══════ POST /api/history START ══════");

  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Authentication not configured" }, { status: 503 });
  }

  // ── Auth first ──
  const authResult = await getUserFromRequest(req);
  if (!authResult.success) {
    console.log("[History] ══════ POST → 401 (Auth Fail) ══════");
    return NextResponse.json({ error: "Unauthorized", reason: authResult.reason }, { status: 401 });
  }

  // ── Database operations ──
  try {
    const user = await findOrCreateUser(authResult.user);

    // Parse body
    console.log("[History] Step 5: Parsing request body...");
    const body = await req.json();
    const { toolId, toolName, fileName, fileSize, resultSummary } = body;

    if (!toolId || !toolName || !fileName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    console.log("[History] Step 6: Saving history entry...");
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

    console.log("[History] ✅ POST → 200 (entry:", entry.id + ")");
    return NextResponse.json({ entry });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[History] 💥 POST → 500 (Database Crash):", msg);

    return NextResponse.json(
      { error: "Failed to save history", debug: msg },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/history?id=xxx
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(req: Request) {
  console.log("[History] ══════ DELETE /api/history START ══════");

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
    console.log("[History] ✅ DELETE → 200");

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[History] 💥 DELETE → 500:", msg);

    return NextResponse.json({ error: "Failed to delete history", debug: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/history
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(req: Request) {
  console.log("[History] ══════ PATCH /api/history START ══════");

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
