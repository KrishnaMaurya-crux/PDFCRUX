import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// GET /api/history — fetch user's history
export async function GET() {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Authentication not configured" }, { status: 503 });
  }
  try {
    // Authenticate via Supabase session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find or create local user
    let user = await db.user.findUnique({ where: { email: session.user.email! } });
    if (!user) {
      user = await db.user.create({
        data: {
          email: session.user.email!,
          name: session.user.user_metadata?.full_name || session.user.email?.split("@")[0],
        },
      });
    }

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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let user = await db.user.findUnique({ where: { email: session.user.email! } });
    if (!user) {
      user = await db.user.create({
        data: {
          email: session.user.email!,
          name: session.user.user_metadata?.full_name || session.user.email?.split("@")[0],
        },
      });
    }

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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    // Verify ownership
    let user = await db.user.findUnique({ where: { email: session.user.email! } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, downloaded } = body;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    let user = await db.user.findUnique({ where: { email: session.user.email! } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
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
  } catch (error) {
    console.error("[PATCH /api/history]", error);
    return NextResponse.json({ error: "Failed to update history" }, { status: 500 });
  }
}
