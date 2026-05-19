import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

// Force Node.js runtime — required for database access
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────────
// Auth Strategy: Bearer Token via Authorization Header
//
// PROBLEM: Supabase JS client stores session in localStorage (browser).
// The server has NO access to localStorage or cookies for Supabase sessions.
// So supabase.auth.getSession() ALWAYS returns null on the server → 401.
//
// SOLUTION: Client sends access_token in Authorization: Bearer <token> header.
// Server uses supabase.auth.getUser(token) to verify the token and get user info.
// This is the official Supabase recommendation for Next.js Route Handlers.
// ─────────────────────────────────────────────────────────────────────────────

function createServerSupabase(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Helper — verify Bearer token, return Supabase user or error
// ─────────────────────────────────────────────────────────────────────────────

interface AuthResult {
  user: User | null;
  localUserId: string | null;
  error: "not_configured" | "no_token" | "invalid_token" | null;
}

async function authenticateRequest(req: Request): Promise<AuthResult> {
  if (!isSupabaseConfigured) {
    return { user: null, localUserId: null, error: "not_configured" };
  }

  // 1. Extract Bearer token from Authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { user: null, localUserId: null, error: "no_token" };
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return { user: null, localUserId: null, error: "no_token" };
  }

  // 2. Verify the token with Supabase
  const serverSupabase = createServerSupabase();
  if (!serverSupabase) {
    return { user: null, localUserId: null, error: "not_configured" };
  }

  const {
    data: { user },
    error,
  } = await serverSupabase.auth.getUser(token);

  if (error || !user) {
    console.warn("[History Auth] Token verification failed:", error?.message);
    return { user: null, localUserId: null, error: "invalid_token" };
  }

  // 3. Find or create local user in SQLite
  const email = user.email;
  if (!email) {
    return { user: null, localUserId: null, error: "invalid_token" };
  }

  let localUser = await db.user.findUnique({ where: { email } });
  if (!localUser) {
    localUser = await db.user.create({
      data: {
        email,
        name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          email.split("@")[0],
        image: user.user_metadata?.avatar_url || null,
      },
    });
  }

  return { user, localUserId: localUser.id, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/history — fetch user's history
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const { localUserId, error: authError } = await authenticateRequest(req);

    if (authError === "not_configured") {
      return NextResponse.json(
        { error: "Authentication not configured", history: [] },
        { status: 503 },
      );
    }

    if (authError) {
      return NextResponse.json(
        { error: "Unauthorized", history: [] },
        { status: 401 },
      );
    }

    const history = await db.history.findMany({
      where: { userId: localUserId! },
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
    const { localUserId, error: authError } = await authenticateRequest(req);

    if (authError === "not_configured") {
      return NextResponse.json(
        { error: "Authentication not configured" },
        { status: 503 },
      );
    }

    if (authError) {
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
        userId: localUserId!,
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
    const { localUserId, error: authError } = await authenticateRequest(req);

    if (authError === "not_configured") {
      return NextResponse.json(
        { error: "Authentication not configured" },
        { status: 503 },
      );
    }

    if (authError) {
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
      where: { id, userId: localUserId! },
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
    const { localUserId, error: authError } = await authenticateRequest(req);

    if (authError === "not_configured") {
      return NextResponse.json(
        { error: "Authentication not configured" },
        { status: 503 },
      );
    }

    if (authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, downloaded } = body;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Verify ownership
    const entry = await db.history.findFirst({
      where: { id, userId: localUserId! },
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
