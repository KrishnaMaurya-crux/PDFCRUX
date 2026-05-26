import { PrismaClient } from '@prisma/client'

// ─────────────────────────────────────────────────────────────────
// FIX: Supabase PgBouncer (port 6543) doesn't support prepared
// statements. Prisma 6 sends prepared statements by default,
// which causes: "prepared statement already exists" (42P05).
//
// Solution: Use `datasourceUrl` (NOT `datasources`) to override
// the connection string, and append ?pgbouncer=true so Prisma
// uses simple query protocol instead of prepared statements.
//
// `datasources` is DEPRECATED in Prisma 6 and gets IGNORED —
// that's why the old fix didn't work on Vercel!
//
// This works fine even without PgBouncer (just uses simple queries).
// ─────────────────────────────────────────────────────────────────

function getDatabaseUrl(): string {
  let url = process.env.DATABASE_URL || "";

  if (!url) {
    console.warn("[DB] ⚠️ DATABASE_URL is empty!");
    return url;
  }

  // Strip existing pgbouncer param if present (avoid duplicates)
  url = url.replace(/[?&]pgbouncer=[^&]*/g, "");

  // Always append pgbouncer=true for PostgreSQL
  const separator = url.includes("?") ? "&" : "?";
  url = `${url}${separator}pgbouncer=true`;

  return url;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const databaseUrl = getDatabaseUrl();

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Prisma 6: use datasourceUrl to override connection string
    // datasources is DEPRECATED and IGNORED in Prisma 6!
    ...(databaseUrl ? { datasourceUrl: databaseUrl } : {}),
    // Only log queries in development — NOT in production (causes crash on Vercel)
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
