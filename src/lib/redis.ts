import Redis from "ioredis";

/**
 * Optional cache/pub-sub layer.
 *
 * Redis is a convenience here, never a source of truth: stock decisions are
 * always made against Postgres inside a locked transaction (spec §8). Every
 * helper degrades to a no-op when Redis is unreachable, so the application
 * runs correctly — just with more database reads — if it is not deployed.
 */

let redisClient: Redis | null = null;
let isRedisAvailable = false;
let offlineLogged = false;

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
/** Give up after this many attempts rather than reconnecting for ever. */
const MAX_RECONNECT_ATTEMPTS = Number(process.env.REDIS_MAX_RETRIES || 5);

if (typeof window === "undefined" && process.env.REDIS_DISABLED !== "1") {
  try {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      // `lazyConnect: false` is the default; the timers below are what stop a
      // missing Redis from holding a short-lived process (a script, a cron
      // invocation) open indefinitely.
      enableOfflineQueue: false,
      retryStrategy(times) {
        if (times > MAX_RECONNECT_ATTEMPTS) {
          if (!offlineLogged) {
            console.warn(
              `[REDIS] Unreachable after ${MAX_RECONNECT_ATTEMPTS} attempts — continuing without cache.`
            );
            offlineLogged = true;
          }
          return null; // stop retrying
        }
        return Math.min(times * 1000, 10_000);
      },
    });

    redisClient.on("connect", () => {
      console.log("[REDIS] Connection established.");
      isRedisAvailable = true;
      offlineLogged = false;
    });

    redisClient.on("end", () => {
      isRedisAvailable = false;
    });

    redisClient.on("error", (err) => {
      isRedisAvailable = false;
      // One line, not one per retry — a missing Redis used to fill the log.
      if (!offlineLogged) {
        console.warn(`[REDIS] Offline, falling back to PostgreSQL: ${err.message}`);
        offlineLogged = true;
      }
    });
  } catch (error) {
    console.warn("[REDIS] Failed to initialise client.", error);
    isRedisAvailable = false;
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  if (!isRedisAvailable || !redisClient) return null;
  try {
    const data = await redisClient.get(key);
    return data ? (JSON.parse(data) as T) : null;
  } catch {
    return null;
  }
}

export async function setCache(key: string, value: any, ttlSeconds = 300): Promise<void> {
  if (!isRedisAvailable || !redisClient) return;
  try {
    await redisClient.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    console.warn(`[REDIS] Error writing key: ${key}`, err);
  }
}

/**
 * Invalidates every key matching a pattern.
 *
 * `SCAN` rather than `KEYS`: KEYS blocks the Redis event loop for the whole
 * scan, and this runs after every stock mutation.
 */
export async function invalidateCache(pattern: string): Promise<void> {
  if (!isRedisAvailable || !redisClient) return;
  try {
    let cursor = "0";
    const found: string[] = [];
    do {
      const [next, keys] = await redisClient.scan(cursor, "MATCH", pattern, "COUNT", 200);
      cursor = next;
      found.push(...keys);
    } while (cursor !== "0" && found.length < 5000);

    if (found.length > 0) await redisClient.del(...found);
  } catch (err) {
    console.warn(`[REDIS] Error invalidating pattern: ${pattern}`, err);
  }
}

export async function deleteCache(key: string): Promise<void> {
  if (!isRedisAvailable || !redisClient) return;
  try {
    await redisClient.del(key);
  } catch {
    /* cache misses are harmless */
  }
}

export async function publishEvent(channel: string, message: any): Promise<void> {
  if (!isRedisAvailable || !redisClient) return;
  try {
    await redisClient.publish(channel, JSON.stringify(message));
  } catch {
    /* realtime delivery is best-effort; the feed still reads from Postgres */
  }
}

export async function pushQueue(queueName: string, data: any): Promise<void> {
  if (!isRedisAvailable || !redisClient) return;
  try {
    await redisClient.lpush(queueName, JSON.stringify(data));
  } catch (err) {
    console.warn(`[REDIS] Error pushing to queue: ${queueName}`, err);
  }
}

export async function popQueue(queueName: string): Promise<any | null> {
  if (!isRedisAvailable || !redisClient) return null;
  try {
    const data = await redisClient.rpop(queueName);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

/**
 * Closes the connection so a CLI script can exit.
 * Without this the reconnect timer keeps the Node process alive for ever.
 */
export async function closeRedis(): Promise<void> {
  if (!redisClient) return;
  try {
    redisClient.disconnect();
  } catch {
    /* already gone */
  }
  redisClient = null;
  isRedisAvailable = false;
}

export { redisClient, isRedisAvailable };
