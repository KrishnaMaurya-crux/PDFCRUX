import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract and verify user from Authorization header.
 * Supabase session lives in browser localStorage, so we rely on
 * the client sending `Authorization: Bearer <access_token>`.
 */
async function getUserFromRequest(req: Request) {
  try {
    console.log("[History] Step 1: Reading Authorization header...");
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      console.log("[History] ❌ No Authorization header found");
      return null;
    }

    if (!authHeader.startsWith("Bearer ")) {
      console.log("[History] ❌ Authorization header does NOT start with 'Bearer'");
      return null;
    }

    const token = authHeader.slice(7);
    console.log("[History] Step 2: Token extracted, length:", token.length);

    console.log("[History] Step 3: Calling supabase.auth.getUser()...");
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error("[History] ❌ supabase.auth.getUser() error:", error.message);
      return null;
    }

    if (!data.user) {
      console.log("[History] ❌ supabase.auth.getUser() returned no user");
      return null;
    }

    console.log("[History] ✅ User authenticated:", {
      id: data.user.id,
      email: data.user.email,
    });

    return data.user;
  } catch (err) {
    console.error("[History] 💥 getUserFromRequest() CRASHED:", err);
    return null;
  }
}

/**
 * Find or create a local User record for the Supabase user.
 */
async function findOrCreateUser(supabaseUser: { email: string; user_metadata?: Record<string, unknown> }) {
  try {
    const email = supabaseUser.email;
    console.log("[History] Step 4: Looking up local user for email:", email);

    let user = await db.user.findUnique({ where: { email } });

    if (user) {
      console.log("[History] ✅ Existing local user found:", { id: user.id, email: user.email });
      return user;
    }

    console.log("[History] Step 5: No local user found. Creating new user...");
    const name = (supabaseUser.user_metadata?.full_name as string) || email.split("@")[0];
    user = await db.user.create({
      data: { email, name },
    });

    console.log("[History] ✅ New local user created:", { id: user.id, email: user.email });
    return user;
  } catch (err) {
    console.error("[History] 💥 findOrCreateUser() CRASHED:", err);
    throw err; // Re-throw so caller's catch can handle it
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/history — fetch user's history
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  console.log("[History] ═══ GET /api/history START ═══");

  // ── Guard: Supabase not configured ──
  if (!isSupabaseConfigured) {
    console.log("[History] ❌ Supabase not configured (missing URL or ANON_KEY)");
    return NextResponse.json({ error: "Authentication not configured" }, { status: 503 });
  }

  try {
    // ── Step 1-3: Authenticate user ──
    const supabaseUser = await getUserFromRequest(req);
    if (!supabaseUser) {
      console.log("[History] ═══ GET /api/history END → 401 ═══");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Step 4-5: Find or create local user ──
    const user = await findOrCreateUser(supabaseUser);

    // ── Step 6: Fetch history ──
    console.log("[History] Step 6: Fetching history for user:", user.id);
    const history = await db.history.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    console.log("[History] ✅ Fetched", history.length, "history entries");
    console.log("[History] ═══ GET /api/history END → 200 ═══");

    return NextResponse.json({ history });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : "No stack trace";
    console.error("[History] 💥 GET /api/history CRASH:", message);
    console.error("[History] Stack:", stack);

    return NextResponse.json(
      { error: "Failed to fetch history", debug: message },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/history — save a new history entry
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  console.log("[History] ═══ POST /api/history START ═══");

  if (!isSupabaseConfigured) {
    console.log("[History] ❌ Supabase not configured");
    return NextResponse.json({ error: "Authentication not configured" }, { status: 503 });
  }

  try {
    // ── Authenticate ──
    const supabaseUser = await getUserFromRequest(req);
    if (!supabaseUser) {
      console.log("[History] ═══ POST /api/history END → 401 ═══");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Find or create user ──
    const user = await findOrCreateUser(supabaseUser);

    // ── Parse body ──
    console.log("[History] Step 6: Parsing request body...");
    const body = await req.json();
    const { toolId, toolName, fileName, fileSize, resultSummary } = body;

    if (!toolId || !toolName || !fileName) {
      console.log("[History] ❌ Missing required fields:", { toolId, toolName, fileName });
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // ── Save to database ──
    console.log("[History] Step 7: Saving history entry:", { toolId, fileName });
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

    console.log("[History] ✅ History saved:", { id: entry.id, toolId });
    console.log("[History] ═══ POST /api/history END → 200 ═══");

    return NextResponse.json({ entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : "No stack trace";
    console.error("[History] 💥 POST /api/history CRASH:", message);
    console.error("[History] Stack:", stack);

    return NextResponse.json(
      { error: "Failed to save history", debug: message },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/history?id=xxx — delete a history entry
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(req: Request) {
  console.log("[History] ═══ DELETE /api/history START ═══");

  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Authentication not configured" }, { status: 503 });
  }

  try {
    const supabaseUser = await getUserFromRequest(req);
    if (!supabaseUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    console.log("[History] Deleting entry:", id);
    const user = await findOrCreateUser(supabaseUser);
    const entry = await db.history.findFirst({ where: { id, userId: user.id } });
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    await db.history.delete({ where: { id } });
    console.log("[History] ✅ Entry deleted:", id);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[History] 💥 DELETE /api/history CRASH:", message);

    return NextResponse.json(
      { error: "Failed to delete history", debug: message },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/history — update a history entry (e.g., mark as downloaded)
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(req: Request) {
  console.log("[History] ═══ PATCH /api/history START ═══");

  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Authentication not configured" }, { status: 503 });
  }

  try {
    const supabaseUser = await getUserFromRequest(req);
    if (!supabaseUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, downloaded } = body;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    console.log("[History] Patching entry:", id);
    const user = await findOrCreateUser(supabaseUser);
    const entry = await db.history.findFirst({ where: { id, userId: user.id } });
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const updated = await db.history.update({
      where: { id },
      data: { ...(downloaded !== undefined ? { downloaded } : {}) },
    });

    return NextResponse.json({ entry: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[History] 💥 PATCH /api/history CRASH:", message);

    return NextResponse.json(
      { error: "Failed to update history", debug: message },
      { status: 500 }
    );
  }
}
