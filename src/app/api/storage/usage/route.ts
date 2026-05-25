import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getPlanConfig, formatStorage, getStoragePercent, getHistoryLimit, IS_DEV_MODE } from "@/lib/plan-config";

// ─────────────────────────────────────────────────────────────────
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/storage/usage
// Returns user's storage stats + plan info
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

    // Safely handle storageUsed — may be NULL if migration not run yet
    const rawStorage = user.storageUsed ?? 0;
    const storageUsed = Math.max(0, Number(rawStorage) || 0);

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
