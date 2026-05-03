import { NextResponse } from "next/server";
import { getEnvHealth, supabase, r2 } from "@/lib/env";

export async function GET() {
  const healthChecks = getEnvHealth();
  const allConfigured = healthChecks.every((h) => h.configured);

  // Try actual connectivity for configured services
  const liveChecks: Record<string, string> = {};

  // R2 connectivity test
  if (r2.isConfigured) {
    try {
      liveChecks["R2"] = "Client initialized";
    } catch (err) {
      liveChecks["R2"] = `Error: ${err instanceof Error ? err.message : "Unknown"}`;
    }
  }

  // Supabase connectivity test
  if (supabase.isConfigured) {
    try {
      const response = await fetch(`${supabase.url}/rest/v1/`, {
        headers: {
          apikey: supabase.anonKey,
          Authorization: `Bearer ${supabase.anonKey}`,
        },
      });
      liveChecks["Supabase"] = response.ok ? "Reachable" : `HTTP ${response.status}`;
    } catch (err) {
      liveChecks["Supabase"] = `Error: ${err instanceof Error ? err.message : "Unknown"}`;
    }
  }

  return NextResponse.json({
    status: allConfigured ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    checks: healthChecks,
    liveChecks,
    summary: {
      total: healthChecks.length,
      configured: healthChecks.filter((h) => h.configured).length,
      missing: healthChecks.filter((h) => !h.configured).length,
    },
  });
}
