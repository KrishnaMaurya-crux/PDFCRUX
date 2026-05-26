import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabase";

// GET /api/storage — get storage usage stats
export async function GET() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let localUser = await db.user.findUnique({ where: { email: user.email! } });
    if (!localUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get or create profile
    let profile = await db.userProfile.findUnique({ where: { userId: localUser.id } });
    if (!profile) {
      profile = await db.userProfile.create({ data: { userId: localUser.id } });
    }

    // Calculate total storage used
    const storageAgg = await db.fileStorage.aggregate({
      where: { userId: localUser.id },
      _sum: { fileSize: true },
      _count: true,
    });

    const totalUsedBytes = storageAgg._sum.fileSize || 0;
    const fileCount = storageAgg._count || 0;
    const storageLimitBytes = profile.storageLimit || 1073741824; // default 1GB

    return NextResponse.json({
      usedBytes: totalUsedBytes,
      usedMB: parseFloat((totalUsedBytes / (1024 * 1024)).toFixed(2)),
      limitBytes: storageLimitBytes,
      limitMB: parseFloat((storageLimitBytes / (1024 * 1024)).toFixed(0)),
      limitGB: parseFloat((storageLimitBytes / (1024 * 1024 * 1024)).toFixed(2)),
      fileCount,
      plan: profile.plan,
      percentUsed: parseFloat(((totalUsedBytes / storageLimitBytes) * 100).toFixed(1)),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
