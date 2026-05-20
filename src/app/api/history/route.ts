import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Extract and verify user from Authorization header.
 * Supabase session lives in browser localStorage, so we rely on
 * the client sending `Authorization: Bearer <access_token>`.
 */
async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return null;
  }
  return user;
}

/**
 * Find or create a local User record for the Supabase user.
 */
async function findOrCreateUser(supabaseUser: { email: string; user_metadata?: Record<string, unknown> }) {
  const email = supabaseUser.email;
  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    user = await db.user.create({
      data: {
        email,
        name: (supabaseUser.user_metadata?.full_name as string) || email.split("@")[0],
      },
    });
  }
  return user;
}

// GET /api/history — fetch user's history
export async function GET(req: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Authentication not configured" }, { status: 503 });
  }
  try {
    const supabaseUser = await getUserFromRequest(req);
    if (!supabaseUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await findOrCreateUser(supabaseUser);

    const history = await db.history.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ history });
  } catch (error) {
    console.error("[GET /api/history]", error);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}

// POST /api/history — save a new history entry
export async function POST(req: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Authentication not configured" }, { status: 503 });
  }
  try {
    const supabaseUser = await getUserFromRequest(req);
    if (!supabaseUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await findOrCreateUser(supabaseUser);

    const body = await req.json();
    const { toolId, toolName, fileName, fileSize, resultSummary } = body;

    if (!toolId || !toolName || !fileName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

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

    return NextResponse.json({ entry });
  } catch (error) {
    console.error("[POST /api/history]", error);
    return NextResponse.json({ error: "Failed to save history" }, { status: 500 });
  }
}

// DELETE /api/history?id=xxx — delete a history entry
export async function DELETE(req: Request) {
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

    // Verify ownership
    const user = await findOrCreateUser(supabaseUser);
    const entry = await db.history.findFirst({ where: { id, userId: user.id } });
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    await db.history.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/history]", error);
    return NextResponse.json({ error: "Failed to delete history" }, { status: 500 });
  }
}

// PATCH /api/history — update a history entry (e.g., mark as downloaded)
export async function PATCH(req: Request) {
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
    console.error("[PATCH /api/history]", error);
    return NextResponse.json({ error: "Failed to update history" }, { status: 500 });
  }
}
