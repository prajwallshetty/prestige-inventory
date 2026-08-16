import { NextRequest } from "next/server";
import { getEffectiveSession } from "@/lib/auth";
import Redis from "ioredis";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getEffectiveSession();
  if (!session || !session.userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.userId;
  const channel = `user-notifications:${userId}`;

  const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  let subscriber: Redis | null = null;
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (eventData: any) => {
        if (isClosed) return;
        try {
          controller.enqueue(`data: ${JSON.stringify(eventData)}\n\n`);
        } catch (err) {
          console.warn("[SSE] Controller enqueue error:", err);
        }
      };

      // Send initial connection heartbeat
      sendEvent({ action: "CONNECTED", userId });

      try {
        subscriber = new Redis(REDIS_URL, {
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          retryStrategy: () => null, // don't loop endlessly if redis is down
        });

        subscriber.on("error", (err) => {
          console.warn("[SSE] Redis subscriber connection warning:", err.message);
        });

        await subscriber.subscribe(channel);
        subscriber.on("message", (subChannel, message) => {
          if (subChannel === channel) {
            try {
              const parsed = JSON.parse(message);
              sendEvent(parsed);
            } catch (err) {
              console.warn("[SSE] Failed parsing Redis message:", err);
            }
          }
        });
      } catch (err) {
        console.warn("[SSE] Redis unavailable for streaming, using fallback heartbeat.", err);
      }

      // Heartbeat interval to keep connection alive
      const heartbeat = setInterval(() => {
        if (isClosed) {
          clearInterval(heartbeat);
          return;
        }
        sendEvent({ action: "HEARTBEAT", timestamp: Date.now() });
      }, 15000);

      req.signal.addEventListener("abort", () => {
        isClosed = true;
        clearInterval(heartbeat);
        if (subscriber) {
          subscriber.unsubscribe(channel).catch(() => {});
          subscriber.quit().catch(() => {});
        }
      });
    },
    cancel() {
      isClosed = true;
      if (subscriber) {
        subscriber.unsubscribe(channel).catch(() => {});
        subscriber.quit().catch(() => {});
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
