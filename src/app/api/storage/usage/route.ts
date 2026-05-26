import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getPlanConfig, formatStorage, getStoragePercent, getHistoryLimit, IS_DEV_MODE } from "@/lib/plan-config";

// ─────────────────────────────────────────────────────────────────
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/storage/usage
// Returns user's storage stats + plan info
//
// FIX: Calculate storageUsed by SUMMING fileSize from history entries.
// user.storageUsed is a cached value that may be stale (e.g., upload
// route was missing). Always use the SUM as the source of truth and
// backfill user.storageUsed so the DB stays in sync.
// ─────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const token = authHeader.slice(7).trim();
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { email: data.user.email } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const plan = (user.plan as "free" | "premium" | "enterprise") || "free";
    const config = getPlanConfig(plan);

    // Count history entries
    const historyCount = await db.history.count({ where: { userId: user.id } });

    // For free plan, calculate how many entries to show
    const effectiveHistoryLimit = IS_DEV_MODE ? 0 : getHistoryLimit(plan);

    // ── FIX: Calculate storage from history entries' fileSize SUM ──
    // This is the source of truth. user.storageUsed is just a cache.
    const storageAgg = await db.history.aggregate({
      where: { userId: user.id },
      _sum: { fileSize: true },
    });
    const calculatedStorage = Math.max(0, Number(storageAgg._sum.fileSize ?? 0));

    // Backfill user.storageUsed if it's stale (keeps DB in sync)
    const cachedStorage = Math.max(0, Number(user.storageUsed ?? 0));
    if (Math.abs(calculatedStorage - cachedStorage) > 1) {
      // Difference is more than 1 KB — update the cache
      await db.user.update({
        where: { id: user.id },
        data: { storageUsed: calculatedStorage },
      }).catch(() => {
        // Don't fail the whole request if the backfill fails
      });
    }

    // Use calculated value as the source of truth
    const storageUsed = calculatedStorage;

    return NextResponse.json({
      plan,
      planLabel: config.label,
      planPrice: config.price,
      storageUsed,
      storageUsedFormatted: formatStorage(storageUsed),
      storageLimit: IS_DEV_MODE ? 0 : config.storageLimit,
      storageLimitFormatted: IS_DEV_MODE ? "Unlimited (Dev)" : formatStorage(config.storageLimit),
      storagePercent: getStoragePercent(plan, storageUsed),
      downloadCount: user.downloadCount ?? 0,
      downloadLimit: IS_DEV_MODE ? 0 : config.downloadLimit,
      historyCount,
      historyLimit: effectiveHistoryLimit,
      features: config.features,
      isDevMode: IS_DEV_MODE,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Storage:Usage] 💥", msg);
    return NextResponse.json({ error: "Failed to get usage", debug: msg }, { status: 500 });
  }
}
