import { mkdir, readdir, rename, rm, stat } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

/**
 * A consistent copy of the SQLite database once a day, next to it in the data volume
 * (/app/data/backups/ibirifas-2026-10-01.db), keeping the last BACKUP_KEEP days (7 by default).
 *
 * Copying the live database file from outside (a volume backup) can catch it halfway through a write;
 * `VACUUM INTO` writes a complete, consistent copy from inside SQLite. So whatever backs up the volume
 * (Dokploy to R2, a manual download) always carries a good copy. BACKUP_SNAPSHOTS=off turns it off.
 */

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" });

/** The folder for the copies, beside the database file; null when the database isn't a local file. */
export function snapshotDir(databaseUrl = process.env.DATABASE_URL ?? ""): string | null {
  if (!databaseUrl.startsWith("file:")) return null;
  let file = databaseUrl.slice("file:".length).split("?")[0]!;
  // Prisma resolves relative paths against the schema folder.
  if (!path.isAbsolute(file)) file = path.resolve(process.cwd(), "prisma", file);
  return path.join(path.dirname(file), "backups");
}

function keepDays(): number {
  const n = Number.parseInt(process.env.BACKUP_KEEP ?? "7", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 90) : 7;
}

export interface SnapshotResult {
  created: string | null;
  removed: string[];
}

/** Makes today's copy if it doesn't exist yet and drops the oldest beyond the limit. Never throws. */
export async function snapshotIfDue(now: Date = new Date()): Promise<SnapshotResult> {
  const result: SnapshotResult = { created: null, removed: [] };
  if (process.env.BACKUP_SNAPSHOTS === "off") return result;
  const dir = snapshotDir();
  if (!dir) return result;
  try {
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, `ibirifas-${dayFormatter.format(now)}.db`);
    const exists = await stat(target).then(() => true, () => false);
    if (!exists) {
      // Written under a temporary name and renamed, so a half-written file never looks like a backup.
      const partial = `${target}.partial`;
      await rm(partial, { force: true });
      await prisma.$executeRawUnsafe(`VACUUM INTO '${partial.replace(/'/g, "''")}'`);
      await rename(partial, target);
      result.created = target;
      console.log(`[backup] database copy written: ${target}`);
    }
    const copies = (await readdir(dir)).filter((f) => /^ibirifas-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
    for (const old of copies.slice(0, Math.max(0, copies.length - keepDays()))) {
      await rm(path.join(dir, old), { force: true });
      result.removed.push(old);
    }
  } catch (err) {
    console.error("[backup] could not write the database copy:", err instanceof Error ? err.message : err);
  }
  return result;
}
