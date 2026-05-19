import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cookies } from "next/headers";

// Force Node.js runtime — required for cookie access
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────────
// Server-side Supabase Client (per-request, cookie-aware)
//
// The global `supabase` client from lib/supabase.ts is created at module load
// time and has NO access to incoming request cookies. This means
// `supabase.auth.getSession()` always returns null on the server → 401.
//
// Fix: Create a fresh Supabase client per request that reads/writes cookies
// from the incoming HTTP request via `next/headers`.
// ─────────────────────────────────────────────────────────────────────────────

async function getServerSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const cookieStore = await cookies();

  return createClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // setAll can fail in Route Handlers when trying to mutate cookies
          // after response headers have been sent. Safe to ignore.
        }
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Helper — authenticate user from cookies, return user or null
// ─────────────────────────────────────────────────────────────────────────────

async function authenticateRequest() {
  if (!isSupabaseConfigured) return { user: null, error: "auth_not_configured" };

  const serverSupabase = await getServerSupabase();
  if (!serverSupabase) return { user: null, error: "auth_not_configured" };

  const {
    data: { session },
  } = await serverSupabase.auth.getSession();

  if (!session?.user) {
    return { user: null, error: "unauthorized" };
  }

  // Find or create local user in SQLite
  let localUser = await db.user.findUnique({
    where: { email: session.user.email! },
  });
  if (!localUser) {
    localUser = await db.user.create({
      data: {
        email: session.user.email!,
        name:
          session.user.user_metadata?.full_name ||
          session.user.email?.split("@")[0],
      },
    });
  }

  return { user: localUser, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/history — fetch user's history
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const { user, error: authError } = await authenticateRequest();

    if (authError === "auth_not_configured") {
      return NextResponse.json(
        { error: "Authentication not configured", history: [] },
        { status: 503 },
      );
    }

    if (authError === "unauthorized") {
      return NextResponse.json(
        { error: "Unauthorized", history: [] },
        { status: 401 },
      );
    }

    const history = await db.history.findMany({
      where: { userId: user!.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ history });
  } catch (error) {
    console.error("[GET /api/history]", error);
    return NextResponse.json(
      { error: "Failed to fetch history", history: [] },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/history — save a new history entry
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { user, error: authError } = await authenticateRequest();

    if (authError === "auth_not_configured") {
      return NextResponse.json(
        { error: "Authentication not configured" },
        { status: 503 },
      );
    }

    if (authError === "unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { toolId, toolName, fileName, fileSize, resultSummary } = body;

    if (!toolId || !toolName || !fileName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const entry = await db.history.create({
      data: {
        userId: user!.id,
        toolId,
        toolName,
        fileName,
        fileSize: fileSize || 0,
        resultSummary: resultSummary || "",
      },
    });

    return NextResponse.json({ entry });
  } catch (error) {
    console.error("[POST /api/history]", error);
    return NextResponse.json(
      { error: "Failed to save history" },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/history?id=xxx — delete a history entry
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(req: Request) {
  try {
    const { user, error: authError } = await authenticateRequest();

    if (authError === "auth_not_configured") {
      return NextResponse.json(
        { error: "Authentication not configured" },
        { status: 503 },
      );
    }

    if (authError === "unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Missing id parameter" },
        { status: 400 },
      );
    }

    // Verify ownership
    const entry = await db.history.findFirst({
      where: { id, userId: user!.id },
    });
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    await db.history.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/history]", error);
    return NextResponse.json(
      { error: "Failed to delete history" },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/history — update a history entry (e.g., mark as downloaded)
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(req: Request) {
  try {
    const { user, error: authError } = await authenticateRequest();

    if (authError === "auth_not_configured") {
      return NextResponse.json(
        { error: "Authentication not configured" },
        { status: 503 },
      );
    }

    if (authError === "unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, downloaded } = body;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Verify ownership
    const entry = await db.history.findFirst({
      where: { id, userId: user!.id },
    });
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const updated = await db.history.update({
      where: { id },
      data: { ...(downloaded !== undefined ? { downloaded } : {}) },
    });

    return NextResponse.json({ entry: updated });
  } catch (error) {
    console.error("[PATCH /api/history]", error);
    return NextResponse.json(
      { error: "Failed to update history" },
      { status: 500 },
    );
  }
}
