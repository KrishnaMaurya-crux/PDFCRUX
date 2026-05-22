import { PrismaClient } from '@prisma/client'

// ─────────────────────────────────────────────────────────────────
// FIX: Supabase PgBouncer (port 6543) doesn't support prepared
// statements. Prisma sends prepared statements by default, which
// causes "prepared statement already exists" (PostgresError 42P05).
//
// Solution: If DATABASE_URL uses the pooler port, automatically
// append ?pgbouncer=true so Prisma disables prepared statements.
// ─────────────────────────────────────────────────────────────────

function getDatabaseUrl(): string {
  let url = process.env.DATABASE_URL || "";

  if (!url) return url;

  // Supabase Transaction Pooler uses port 6543
  // Session Pooler uses port 5432
  // Direct connection uses port 5432
  const isPooler = url.includes(":6543/");

  if (isPooler && !url.includes("pgbouncer")) {
    // Append pgbouncer parameter
    const separator = url.includes("?") ? "&" : "?";
    url = `${url}${separator}pgbouncer=true`;
    console.log("[DB] Detected Supabase pooler — added pgbouncer=true");
  }

  return url;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const databaseUrl = getDatabaseUrl();

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: databaseUrl ? {
      db: {
        url: databaseUrl,
      },
    } : undefined,
    // Only log queries in development — NOT in production (causes crash on Vercel)
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
