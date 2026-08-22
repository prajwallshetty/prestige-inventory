import { PrismaClient } from "@prisma/client";

/**
 * Prisma client.
 *
 * The database is a pooled Neon endpoint (pgbouncer) in another region. Two
 * things follow from that and are handled here:
 *
 * 1. Pool sizing must be explicit. Prisma's default is derived from the CPU
 *    count, which on a small host is far too low for a request that opens an
 *    interactive transaction while other requests are reading — the symptom is
 *    "Timed out fetching a new connection from the connection pool" under
 *    perfectly ordinary concurrency.
 * 2. A pooled connection can be closed by the server between uses (Prisma
 *    P1017, "Server has closed the connection"), especially after the compute
 *    has been idle. That is transient: the same call succeeds immediately on a
 *    fresh connection.
 */

/** Adds pool settings to the connection string unless they are already set. */
function withPoolSettings(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const defaults: Record<string, string> = {
      connection_limit: "20",
      pool_timeout: "30",
      connect_timeout: "15",
    };
    for (const [key, value] of Object.entries(defaults)) {
      if (!parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
    }
    return parsed.toString();
  } catch {
    // A malformed URL is Prisma's problem to report, not ours to mangle.
    return url;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: { db: { url: withPoolSettings(process.env.DATABASE_URL) } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** Prisma error codes that mean the work never started and can be retried. */
const TRANSIENT_CODES = new Set([
  "P1001", // can't reach the database server
  "P1002", // database server timed out
  "P1017", // server has closed the connection
  "P2024", // timed out fetching a connection from the pool
]);

function isTransient(err: any): boolean {
  if (TRANSIENT_CODES.has(err?.code)) return true;
  const message = String(err?.message ?? "");
  return /Server has closed the connection|Connection reset|ECONNRESET|Timed out fetching a new connection/i.test(
    message
  );
}

/**
 * Retries a **read** on a transient connection failure.
 *
 * Deliberately not used for mutations: if a connection drops around commit
 * time the outcome is ambiguous, and retrying could raise a second block
 * against the same stock. Writes surface the failure instead, and the caller
 * shows "The system is busy right now. Please try that again." — an action the
 * operator can repeat safely because the state machine re-checks under lock.
 */
export async function readWithRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isTransient(err) || attempt === attempts) break;
      // Short linear backoff — the reconnect itself is what takes the time.
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }

  throw lastError;
}

export { isTransient };

/**
 * Transaction settings for every stock-touching mutation.
 *
 * Prisma's 5 second default is far too tight here: the database is in another
 * region (~1.5s per round trip from the operating location) and a stock
 * mutation legitimately needs 6-8 statements while holding a row lock. Under
 * contention the *second* caller must be able to wait for the lock, read the
 * committed state and report a real domain error ("already shipped") rather
 * than dying on an expired transaction.
 *
 * These numbers can drop sharply once the database sits closer to the app.
 */
export const STOCK_TX_OPTIONS = { timeout: 30_000, maxWait: 25_000 } as const;
