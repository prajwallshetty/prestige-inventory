import Redis from "ioredis";

let redisClient: Redis | null = null;
let isRedisAvailable = false;

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

if (typeof window === "undefined") {
  try {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000, // 2 seconds timeout limit
      retryStrategy(times) {
        // Slow down reconnection attempts to avoid spamming logs when Redis is offline
        return Math.min(times * 3000, 30000);
      },
    });

    redisClient.on("connect", () => {
      console.log("[REDIS] Connection established successfully.");
      isRedisAvailable = true;
    });

    redisClient.on("error", (err) => {
      console.warn("[REDIS] Warning: Connection offline. Gracefully falling back to PostgreSQL database.", err.message);
      isRedisAvailable = false;
    });
  } catch (error) {
    console.warn("[REDIS] Failed to initialize ioredis client.", error);
    isRedisAvailable = false;
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  if (!isRedisAvailable || !redisClient) return null;
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.warn(`[REDIS] Error reading key: ${key}`, err);
    return null;
  }
}

export async function setCache(key: string, value: any, ttlSeconds = 300): Promise<void> {
  if (!isRedisAvailable || !redisClient) return;
  try {
    const serialized = JSON.stringify(value);
    await redisClient.set(key, serialized, "EX", ttlSeconds);
  } catch (err) {
    console.warn(`[REDIS] Error writing key: ${key}`, err);
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  if (!isRedisAvailable || !redisClient) return;
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
      console.log(`[REDIS] Cleaned up ${keys.length} keys matching: ${pattern}`);
    }
  } catch (err) {
    console.warn(`[REDIS] Error invalidating pattern: ${pattern}`, err);
  }
}

export async function deleteCache(key: string): Promise<void> {
  if (!isRedisAvailable || !redisClient) return;
  try {
    await redisClient.del(key);
  } catch (err) {
    console.warn(`[REDIS] Error deleting key: ${key}`, err);
  }
}

export async function publishEvent(channel: string, message: any): Promise<void> {
  if (!isRedisAvailable || !redisClient) return;
  try {
    await redisClient.publish(channel, JSON.stringify(message));
  } catch (err) {
    console.warn(`[REDIS] Error publishing event to: ${channel}`, err);
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
  } catch (err) {
    console.warn(`[REDIS] Error popping from queue: ${queueName}`, err);
    return null;
  }
}

export { redisClient, isRedisAvailable };
