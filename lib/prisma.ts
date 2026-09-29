import { PrismaClient } from "@prisma/client";

/**
 * SQLite allows one writer at a time. Prisma's default is a pool of several connections, and when a
 * crowd writes at once (200 people reserving numbers) those connections fight over the file lock and
 * time out: in a test, 25 of 30 simultaneous reservations failed with "Socket timeout" after 30 s.
 * With a single connection the requests simply queue inside the app, each write taking a few
 * milliseconds, and 200 simultaneous reservations finish in about a second with no errors.
 *
 * So the pool is pinned to one connection here (whatever DATABASE_URL says), with generous waits so a
 * long queue is waited out instead of failing. If the app ever moves to Postgres, this is the place to
 * lift the limit.
 */
function tunedDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("file:")) return url;
  const [base, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  params.set("connection_limit", "1");
  if (!params.has("socket_timeout")) params.set("socket_timeout", "60");
  if (!params.has("pool_timeout")) params.set("pool_timeout", "60");
  return `${base}?${params.toString()}`;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: tunedDatabaseUrl(),
    // The transaction waits for the single connection behind whatever is queued, so the default
    // 2 s wait would fail under a burst; the work inside a transaction itself is tiny.
    transactionOptions: { maxWait: 60_000, timeout: 30_000 },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
